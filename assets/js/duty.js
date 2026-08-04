/* ==========================================================================
   Prise de service.

   Le tableau des présents vit dans data/duty.json, à côté du catalogue.
   • Pointer envoie un message Discord (immédiat, marche pour tout le monde).
   • Si la personne a un jeton GitHub, le tableau partagé est aussi mis à jour
     pour que les gérants le voient sur le site.
   Sans jeton, le pointage reste visible sur Discord et en local seulement —
   le site le signale clairement.
   ========================================================================== */

window.MNDuty = (function () {
  "use strict";

  const FILE = "data/duty.json";
  const K_LOCAL = "mn.duty.local";
  const MAX_LOG = 120;

  let _board = null;
  let _souci = "";           // dernier problème rencontré, affiché à l'écran

  const empty = () => ({ updatedAt: new Date(0).toISOString(), onDuty: [], log: [] });

  /** Écart exact en secondes entre deux horodatages. */
  const secBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));

  /**
   * fetch avec délai maximum. Sans ça, une adresse mal saisie ou un serveur
   * injoignable laisse la page figée sur « Chargement… » indéfiniment.
   */
  async function fetchDelai(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 7000);
    try {
      return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    } finally {
      clearTimeout(t);
    }
  }

  function normalize(raw) {
    const b = (raw && typeof raw === "object") ? raw : {};
    return {
      updatedAt: b.updatedAt || new Date(0).toISOString(),
      onDuty: (Array.isArray(b.onDuty) ? b.onDuty : []).map(e => ({
        id: String(e.id || ""),
        pseudo: String(e.pseudo || "?"),
        roleId: String(e.roleId || ""),
        since: e.since || new Date().toISOString()
      })).filter(e => e.id),
      log: (Array.isArray(b.log) ? b.log : []).slice(0, MAX_LOG).map(e => {
        /* La durée exacte se recalcule depuis les horodatages ; le champ
           `minutes` des anciens enregistrements sert de repli. */
        const exact = (e.in && e.out) ? secBetween(e.in, e.out) : null;
        const sec = exact !== null ? exact
          : Math.max(0, Math.round(Number(e.seconds) || Number(e.minutes) * 60 || 0));
        return {
          id: String(e.id || ""),
          pseudo: String(e.pseudo || "?"),
          roleId: String(e.roleId || ""),
          in: e.in || null,
          out: e.out || null,
          seconds: sec,
          minutes: Math.round(sec / 60),
          /* conservé : c'est ce qui distingue un oubli clôturé par un gérant */
          forced: e.forced === true
        };
      })
    };
  }

  /* ---- Chargement ---------------------------------------------------------- */

  async function load(force) {
    if (_board && !force) return _board;

    let remote = null;
    const base = baseUrl();
    _souci = "";

    /* La base partagée fait autorité quand elle est configurée. */
    if (base) {
      try {
        const r = await fetchDelai(base + "?t=" + Date.now(), { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          remote = j ? normalize(j) : empty();   // base vide : ce n'est pas une erreur
        } else {
          _souci = "La base partagée a répondu " + r.status + ".";
        }
      } catch (e) {
        _souci = e.name === "AbortError"
          ? "La base partagée ne répond pas (délai dépassé)."
          : "Base partagée injoignable.";
      }
    }

    if (!remote) {
      try {
        const r = await fetchDelai(FILE + "?v=" + Date.now(), { cache: "no-store" });
        if (r.ok) remote = normalize(await r.json());
      } catch (_) { /* fichier absent ou file:// */ }
    }

    let local = null;
    try {
      const raw = localStorage.getItem(K_LOCAL);
      if (raw) local = normalize(JSON.parse(raw));
    } catch (_) { localStorage.removeItem(K_LOCAL); }

    /* On garde le plus récent des deux : le local n'est en avance que si la
       personne a pointé sans pouvoir synchroniser. */
    if (remote && local) {
      _board = new Date(local.updatedAt) > new Date(remote.updatedAt) ? local : remote;
    } else {
      _board = remote || local || empty();
    }
    return _board;
  }

  const board = () => _board || empty();
  const entryOf = uid => board().onDuty.find(e => e.id === uid) || null;
  const isOn = uid => !!entryOf(uid);

  const relayUrl = () => {
    try { return MNStore.api("relais"); }
    catch (_) { return ""; }
  };

  /**
   * Base partagée directe (Firebase Realtime Database).
   * On tolère l'URL avec ou sans le « .json » final attendu par son API REST.
   */
  function baseUrl() {
    let u = "";
    try { u = MNStore.api("duty.json"); } catch (_) { return ""; }
    if (!u) return "";
    u = u.replace(/\/+$/, "");
    return /\.json$/i.test(u) ? u : u + ".json";
  }

  /**
   * Le pointage peut-il rejoindre le tableau commun ?
   * Avec un relais, c'est automatique pour tout le monde : personne n'a
   * de jeton à installer. Sinon, il faut un jeton sur cet appareil.
   */
  const canShare = () => {
    if (baseUrl() || relayUrl()) return true;
    try { return MNGitHub.hasToken() && MNGitHub.isConfigured(); }
    catch (_) { return false; }
  };

  /** Le partage se fait-il sans que l'employé n'ait rien à installer ? */
  const isAuto = () => !!(baseUrl() || relayUrl());

  /* ---- Opérations côté serveur ------------------------------------------------
     Si le serveur sait appliquer les opérations lui-même, on lui envoie
     « prends mon service » plutôt que tout le tableau. Deux personnes qui
     pointent en même temps ne peuvent alors plus s'écraser. */

  let _ops = null;          // null = pas encore su, true/false ensuite

  /** Sonde une seule fois : le serveur annonce-t-il « ops » ? */
  async function supporteOps() {
    if (_ops !== null) return _ops;
    const base = baseUrl();
    if (!base) return (_ops = false);
    try {
      const sante = base.replace(/[^/]*$/, "") + "sante";
      const r = await fetchDelai(sante, { cache: "no-store" }, 4000);
      const j = r.ok ? await r.json() : null;
      _ops = !!(j && j.ops);
    } catch (_) {
      _ops = false;
    }
    return _ops;
  }

  /** Envoie une opération. Renvoie null si ce mode n'est pas disponible. */
  async function envoyerOp(op) {
    if (!(await supporteOps())) return null;
    try {
      const r = await fetchDelai(baseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op)
      });
      if (!r.ok) return { ok: false, error: "Serveur : erreur " + r.status };
      const j = await r.json();
      if (j.board) { _board = normalize(j.board); saveLocal(_board); }
      return { ok: true, deja: !!j.deja, seconds: j.seconds, retires: j.retires };
    } catch (e) {
      return { ok: false, error: e.name === "AbortError"
        ? "Le serveur ne répond pas." : "Serveur injoignable." };
    }
  }

  /* ---- Écriture ------------------------------------------------------------ */

  function saveLocal(b) {
    _board = b;
    try { localStorage.setItem(K_LOCAL, JSON.stringify(b)); } catch (_) { /* quota */ }
  }

  async function push(b, message) {
    /* Base partagée : un simple PUT, rien à installer pour personne. */
    const base = baseUrl();
    if (base) {
      try {
        const r = await fetchDelai(base, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b)
        });
        if (r.ok) return { ok: true };
        return { ok: false, error: "Base de service : erreur " + r.status };
      } catch (e) {
        return { ok: false, error: e.name === "AbortError"
          ? "La base de service ne répond pas." : "Base de service injoignable." };
      }
    }

    const relay = relayUrl();

    /* Le relais écrit à notre place : aucun jeton nécessaire côté employé. */
    if (relay) {
      try {
        const r = await fetchDelai(relay, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "duty", board: b, message })
        });
        if (r.ok) return { ok: true };
        let why = "relais : erreur " + r.status;
        try { const j = await r.json(); if (j && j.error) why = j.error; } catch (_) { /* rien */ }
        return { ok: false, error: why };
      } catch (e) {
        return { ok: false, error: e.name === "AbortError"
          ? "Le relais ne répond pas." : "Relais injoignable." };
      }
    }

    if (!canShare()) return { ok: false, skipped: true };
    try {
      await MNGitHub.putText(FILE, JSON.stringify(b, null, 2) + "\n", message);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  const minutesBetween = (a, b) => Math.round(secBetween(a, b) / 60);

  /**
   * Prise de service.
   * @returns {Promise<{already?:boolean, shared:boolean, shareError?:string, discord:object}>}
   */
  async function clockIn(session) {
    /* Chemin privilégié : le serveur applique l'opération lui-même. */
    const op = await envoyerOp({
      op: "in", id: session.uid, pseudo: session.pseudo, roleId: session.roleId || ""
    });
    if (op) {
      if (op.deja) return { already: true, shared: true, discord: { skipped: true } };
      const discord = await MNWebhook.sendDuty(session.pseudo, session.role, "in");
      return { shared: op.ok, shareError: op.error, discord };
    }

    await load(true);                       // on repart du tableau le plus frais
    const b = board();
    if (isOn(session.uid)) return { already: true, shared: false, discord: { skipped: true } };

    b.onDuty.push({
      id: session.uid,
      pseudo: session.pseudo,
      roleId: session.roleId || "",
      since: new Date().toISOString()
    });
    b.updatedAt = new Date().toISOString();
    saveLocal(b);

    const shared = await push(b, "Prise de service de " + session.pseudo);
    const discord = await MNWebhook.sendDuty(session.pseudo, session.role, "in");
    return { shared: shared.ok, shareError: shared.error, discord };
  }

  /** Fin de service. */
  async function clockOut(session) {
    const op = await envoyerOp({ op: "out", id: session.uid });
    if (op) {
      if (op.deja) return { already: true, shared: true, discord: { skipped: true } };
      const discord = await MNWebhook.sendDuty(session.pseudo, session.role, "out", op.seconds);
      return { shared: op.ok, shareError: op.error, discord, seconds: op.seconds };
    }

    await load(true);
    const b = board();
    const i = b.onDuty.findIndex(e => e.id === session.uid);
    if (i === -1) return { already: true, shared: false, discord: { skipped: true } };

    const e = b.onDuty.splice(i, 1)[0];
    const out = new Date().toISOString();
    const seconds = secBetween(e.since, out);

    b.log.unshift({
      id: e.id, pseudo: e.pseudo, roleId: e.roleId,
      in: e.since, out, seconds, minutes: Math.round(seconds / 60)
    });
    b.log = b.log.slice(0, MAX_LOG);
    b.updatedAt = out;
    saveLocal(b);

    const shared = await push(b, "Fin de service de " + session.pseudo);
    const discord = await MNWebhook.sendDuty(session.pseudo, session.role, "out", seconds);
    return { shared: shared.ok, shareError: shared.error, discord, seconds };
  }

  /** Sortir quelqu'un de force (gérant). */
  async function forceOut(uid, byPseudo) {
    const cible = entryOf(uid);
    const op = await envoyerOp({ op: "out", id: uid, force: true });
    if (op) {
      if (op.deja) return { already: true };
      const nom = cible ? cible.pseudo : uid;
      await MNWebhook.sendDuty(nom + " (sorti par " + byPseudo + ")", "", "out", op.seconds);
      return { shared: op.ok, shareError: op.error, seconds: op.seconds, pseudo: nom };
    }

    await load(true);
    const b = board();
    const i = b.onDuty.findIndex(e => e.id === uid);
    if (i === -1) return { already: true };

    const e = b.onDuty.splice(i, 1)[0];
    const out = new Date().toISOString();
    const seconds = secBetween(e.since, out);
    b.log.unshift({
      id: e.id, pseudo: e.pseudo, roleId: e.roleId,
      in: e.since, out, seconds, minutes: Math.round(seconds / 60), forced: true
    });
    b.log = b.log.slice(0, MAX_LOG);
    b.updatedAt = out;
    saveLocal(b);

    const shared = await push(b, "Fin de service de " + e.pseudo + " (par " + byPseudo + ")");
    await MNWebhook.sendDuty(e.pseudo + " (sorti par " + byPseudo + ")", "", "out", seconds);
    return { shared: shared.ok, shareError: shared.error, seconds, pseudo: e.pseudo };
  }

  /** Mettre quelqu'un en service à sa place (gérant). */
  async function forceIn(user, byPseudo) {
    const op = await envoyerOp({
      op: "in", id: user.id, pseudo: user.pseudo, roleId: user.roleId || ""
    });
    if (op) {
      if (op.deja) return { already: true };
      await MNWebhook.sendDuty(user.pseudo + " (pointé par " + byPseudo + ")", "", "in");
      return { shared: op.ok, shareError: op.error };
    }

    await load(true);
    const b = board();
    if (isOn(user.id)) return { already: true };

    b.onDuty.push({
      id: user.id,
      pseudo: user.pseudo,
      roleId: user.roleId || "",
      since: new Date().toISOString()
    });
    b.updatedAt = new Date().toISOString();
    saveLocal(b);

    const shared = await push(b, "Prise de service de " + user.pseudo + " (par " + byPseudo + ")");
    await MNWebhook.sendDuty(user.pseudo + " (pointé par " + byPseudo + ")", "", "in");
    return { shared: shared.ok, shareError: shared.error };
  }

  /** Efface l'historique des pointages terminés (les personnes en service restent). */
  async function clearLog(byPseudo) {
    const op = await envoyerOp({ op: "clear-log" });
    if (op) return { removed: op.retires || 0, shared: op.ok, shareError: op.error };

    await load(true);
    const b = board();
    const n = b.log.length;
    b.log = [];
    b.updatedAt = new Date().toISOString();
    saveLocal(b);
    const shared = await push(b, "Historique des services effacé par " + byPseudo);
    return { removed: n, shared: shared.ok, shareError: shared.error };
  }

  /** Supprime une ligne d'historique précise. */
  async function removeLog(index, byPseudo) {
    const avant = board().log[index];
    const op = await envoyerOp({ op: "remove-log", index });
    if (op) {
      if (op.deja) return { already: true };
      return { shared: op.ok, shareError: op.error, pseudo: avant ? avant.pseudo : "" };
    }

    await load(true);
    const b = board();
    if (index < 0 || index >= b.log.length) return { already: true };
    const e = b.log.splice(index, 1)[0];
    b.updatedAt = new Date().toISOString();
    saveLocal(b);
    const shared = await push(b, "Pointage de " + e.pseudo + " retiré par " + byPseudo);
    return { shared: shared.ok, shareError: shared.error, pseudo: e.pseudo };
  }

  /* ---- Statistiques --------------------------------------------------------- */

  /** Tous les services terminés d'une personne, du plus récent au plus ancien. */
  const logOf = uid => board().log
    .filter(e => e.id === uid && e.out)
    .slice()
    .sort((a, b) => new Date(b.out) - new Date(a.out));

  /** Lundi 00 h 00 de la semaine en cours. */
  function weekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // 0 = dimanche → on recale sur lundi
    return d.getTime();
  }

  /**
   * Secondes de service d'une personne depuis `sinceTs` (tout si omis).
   * Le service en cours est compté au prorata, à la seconde.
   */
  function secondsFor(uid, sinceTs) {
    const from = sinceTs || 0;
    let total = 0;

    board().log.forEach(e => {
      if (e.id !== uid || !e.out) return;
      const end = new Date(e.out).getTime();
      if (end < from) return;
      const start = new Date(e.in).getTime();
      /* Un service à cheval sur la limite n'est compté qu'à partir d'elle. */
      total += Math.max(0, Math.round((end - Math.max(start, from)) / 1000));
    });

    const cur = entryOf(uid);
    if (cur) {
      const start = new Date(cur.since).getTime();
      total += Math.max(0, Math.round((Date.now() - Math.max(start, from)) / 1000));
    }
    return total;
  }

  /** Secondes cumulées par employé sur les N derniers jours. */
  function totals(days) {
    const since = Date.now() - (days || 7) * 86400000;
    const by = {};
    board().log.forEach(e => {
      if (!e.out || new Date(e.out).getTime() < since) return;
      if (!by[e.id]) by[e.id] = { id: e.id, pseudo: e.pseudo, roleId: e.roleId, seconds: 0, sessions: 0 };
      by[e.id].seconds += e.seconds;
      by[e.id].sessions++;
    });
    return Object.keys(by).map(k => by[k]).sort((a, b2) => b2.seconds - a.seconds);
  }

  /**
   * Durée lisible à partir de secondes.
   * `dur(8130)` → « 2 h 15 min 30 s » · `dur(8130, true)` → « 2 h 15 »
   */
  function dur(sec, compact) {
    const t = Math.max(0, Math.round(sec));
    const j = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;

    if (compact) {
      if (j) return j + " j " + String(h).padStart(2, "0") + " h";
      if (h) return h + " h " + String(m).padStart(2, "0");
      return m + " min";
    }
    const p = [];
    if (j) p.push(j + " j");
    if (h || j) p.push(h + " h");
    if (m || h || j) p.push(m + " min");
    p.push(s + " s");
    return p.join(" ");
  }

  const sinceDur = (iso, compact) => dur(secBetween(iso, new Date().toISOString()), compact);

  return {
    load, board, isOn, entryOf, canShare, isAuto, relayUrl, baseUrl,
    souci: () => _souci,
    clockIn, clockOut, forceOut, forceIn, clearLog, removeLog,
    logOf, secondsFor, weekStart,
    totals, dur, sinceDur, secBetween, minutesBetween
  };
})();
