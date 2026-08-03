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

  const empty = () => ({ updatedAt: new Date(0).toISOString(), onDuty: [], log: [] });

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
      log: (Array.isArray(b.log) ? b.log : []).slice(0, MAX_LOG).map(e => ({
        id: String(e.id || ""),
        pseudo: String(e.pseudo || "?"),
        roleId: String(e.roleId || ""),
        in: e.in || null,
        out: e.out || null,
        minutes: Math.max(0, Math.round(Number(e.minutes) || 0))
      }))
    };
  }

  /* ---- Chargement ---------------------------------------------------------- */

  async function load(force) {
    if (_board && !force) return _board;

    let remote = null;
    try {
      const r = await fetch(FILE + "?v=" + Date.now(), { cache: "no-store" });
      if (r.ok) remote = normalize(await r.json());
    } catch (_) { /* fichier absent ou file:// */ }

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

  /** Peut-on écrire le tableau partagé depuis cet appareil ? */
  const canShare = () => {
    try { return MNGitHub.hasToken() && MNGitHub.isConfigured(); }
    catch (_) { return false; }
  };

  /* ---- Écriture ------------------------------------------------------------ */

  function saveLocal(b) {
    _board = b;
    try { localStorage.setItem(K_LOCAL, JSON.stringify(b)); } catch (_) { /* quota */ }
  }

  async function push(b, message) {
    if (!canShare()) return { ok: false, skipped: true };
    try {
      await MNGitHub.putText(FILE, JSON.stringify(b, null, 2) + "\n", message);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));

  /**
   * Prise de service.
   * @returns {Promise<{already?:boolean, shared:boolean, shareError?:string, discord:object}>}
   */
  async function clockIn(session) {
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
    await load(true);
    const b = board();
    const i = b.onDuty.findIndex(e => e.id === session.uid);
    if (i === -1) return { already: true, shared: false, discord: { skipped: true } };

    const e = b.onDuty.splice(i, 1)[0];
    const out = new Date().toISOString();
    const minutes = minutesBetween(e.since, out);

    b.log.unshift({ id: e.id, pseudo: e.pseudo, roleId: e.roleId, in: e.since, out, minutes });
    b.log = b.log.slice(0, MAX_LOG);
    b.updatedAt = out;
    saveLocal(b);

    const shared = await push(b, "Fin de service de " + session.pseudo);
    const discord = await MNWebhook.sendDuty(session.pseudo, session.role, "out", minutes);
    return { shared: shared.ok, shareError: shared.error, discord, minutes };
  }

  /** Sortir quelqu'un de force (gérant). */
  async function forceOut(uid, byPseudo) {
    await load(true);
    const b = board();
    const i = b.onDuty.findIndex(e => e.id === uid);
    if (i === -1) return { already: true };

    const e = b.onDuty.splice(i, 1)[0];
    const out = new Date().toISOString();
    const minutes = minutesBetween(e.since, out);
    b.log.unshift({ id: e.id, pseudo: e.pseudo, roleId: e.roleId, in: e.since, out, minutes, forced: true });
    b.log = b.log.slice(0, MAX_LOG);
    b.updatedAt = out;
    saveLocal(b);

    const shared = await push(b, "Fin de service de " + e.pseudo + " (par " + byPseudo + ")");
    await MNWebhook.sendDuty(e.pseudo + " (sorti par " + byPseudo + ")", "", "out", minutes);
    return { shared: shared.ok, shareError: shared.error, minutes, pseudo: e.pseudo };
  }

  /** Mettre quelqu'un en service à sa place (gérant). */
  async function forceIn(user, byPseudo) {
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
   * Minutes de service d'une personne depuis `sinceTs` (tout si omis).
   * Le service en cours est compté au prorata.
   */
  function minutesFor(uid, sinceTs) {
    const from = sinceTs || 0;
    let total = 0;

    board().log.forEach(e => {
      if (e.id !== uid || !e.out) return;
      const end = new Date(e.out).getTime();
      if (end < from) return;
      const start = new Date(e.in).getTime();
      /* Un service à cheval sur la limite n'est compté qu'à partir d'elle. */
      total += Math.max(0, Math.round((end - Math.max(start, from)) / 60000));
    });

    const cur = entryOf(uid);
    if (cur) {
      const start = new Date(cur.since).getTime();
      total += Math.max(0, Math.round((Date.now() - Math.max(start, from)) / 60000));
    }
    return total;
  }

  /** Minutes cumulées par employé sur les N derniers jours. */
  function totals(days) {
    const since = Date.now() - (days || 7) * 86400000;
    const by = {};
    board().log.forEach(e => {
      if (!e.out || new Date(e.out).getTime() < since) return;
      if (!by[e.id]) by[e.id] = { id: e.id, pseudo: e.pseudo, roleId: e.roleId, minutes: 0, sessions: 0 };
      by[e.id].minutes += e.minutes;
      by[e.id].sessions++;
    });
    return Object.keys(by).map(k => by[k]).sort((a, b2) => b2.minutes - a.minutes);
  }

  /** « 2 h 15 » à partir d'un nombre de minutes. */
  function human(min) {
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60);
    return h ? h + " h " + String(m % 60).padStart(2, "0") : m + " min";
  }

  const sinceHuman = iso => human(minutesBetween(iso, new Date().toISOString()));

  return {
    load, board, isOn, entryOf, canShare,
    clockIn, clockOut, forceOut, forceIn, clearLog, removeLog,
    logOf, minutesFor, weekStart,
    totals, human, sinceHuman, minutesBetween
  };
})();
