/* ==========================================================================
   MÉCANO NORD — petit serveur pour VPS
   --------------------------------------------------------------------------
   Node.js 18 ou plus. AUCUNE dépendance : pas de npm install, rien à
   télécharger. Tu copies ce fichier sur ton VPS et tu le lances.

   Ce qu'il fait :

     GET  /duty.json   → renvoie le tableau de service
     PUT  /duty.json   → le remplace (le site l'appelle quand quelqu'un pointe)
     POST /relais      → transmet un message à Discord, sans jamais exposer
                         l'adresse du webhook
     GET  /sante       → « ok », pratique pour vérifier que tout tourne

   Le guide d'installation complet est dans serveur/README.md
   ========================================================================== */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

/* ---- Réglages, tous par variables d'environnement -------------------------- */

const PORT = Number(process.env.PORT || 8787);
/* Derrière un proxy (nginx, Apache, Caddy), mets HOTE=127.0.0.1 : le serveur
   n'est alors joignable que depuis la machine, jamais directement d'internet. */
const HOTE = process.env.HOTE || "0.0.0.0";
const DOSSIER = process.env.DONNEES || path.join(__dirname, "donnees");
const FICHIER = path.join(DOSSIER, "duty.json");

/* Origines autorisées, séparées par des virgules. « * » = tout le monde. */
const ORIGINES = String(process.env.ORIGINE || "*")
  .split(",").map(s => s.trim()).filter(Boolean);

const WEBHOOKS = {
  bt: process.env.WEBHOOK_BT || "",
  duty: process.env.WEBHOOK_DUTY || ""
};

const MAX_CORPS = 512 * 1024;      // 512 ko suffisent largement
const SAUVEGARDES = 20;            // versions conservées du tableau

/* ---- Limitation de débit --------------------------------------------------- */

const compteur = new Map();
const FENETRE = 60_000;
const MAX_PAR_MINUTE = 60;

function tropDeRequetes(ip) {
  const maintenant = Date.now();
  const e = compteur.get(ip);
  if (!e || maintenant - e.debut > FENETRE) {
    compteur.set(ip, { debut: maintenant, n: 1 });
    return false;
  }
  e.n++;
  return e.n > MAX_PAR_MINUTE;
}

/* Nettoyage périodique, pour ne pas garder d'IP en mémoire indéfiniment. */
setInterval(() => {
  const maintenant = Date.now();
  for (const [ip, e] of compteur) if (maintenant - e.debut > FENETRE) compteur.delete(ip);
}, FENETRE).unref();

/* ---- Validation du tableau de service --------------------------------------- */

const texte = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const nombre = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const dateIso = v => { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

/**
 * On ne réécrit que ce qui ressemble vraiment à un tableau de service.
 * Tout champ inattendu est jeté, toute chaîne est bornée.
 */
function nettoyer(b) {
  if (!b || typeof b !== "object") return null;
  const onDuty = Array.isArray(b.onDuty) ? b.onDuty : [];
  const log = Array.isArray(b.log) ? b.log : [];
  if (onDuty.length > 60 || log.length > 300) return null;

  return {
    updatedAt: dateIso(b.updatedAt) || new Date().toISOString(),
    onDuty: onDuty.map(e => ({
      id: texte(e.id, 60),
      pseudo: texte(e.pseudo, 60) || "?",
      roleId: texte(e.roleId, 60),
      since: dateIso(e.since) || new Date().toISOString()
    })).filter(e => e.id),
    log: log.map(e => ({
      id: texte(e.id, 60),
      pseudo: texte(e.pseudo, 60) || "?",
      roleId: texte(e.roleId, 60),
      in: dateIso(e.in),
      out: dateIso(e.out),
      seconds: nombre(e.seconds, 0, 31_536_000),
      minutes: nombre(e.minutes, 0, 525_600),
      forced: e.forced === true
    })).filter(e => e.id && e.in && e.out)
  };
}

const VIDE = { updatedAt: new Date(0).toISOString(), onDuty: [], log: [] };
const MAX_LOG = 300;

/* ---- Opérations de pointage, appliquées côté serveur -------------------------
   Le site n'envoie plus tout le tableau mais seulement « ce qu'il veut faire ».
   Le serveur lit, applique, écrit — le tout sérialisé. Deux personnes qui
   pointent à la même seconde ne peuvent donc plus s'effacer mutuellement. */

const secondes = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));

function appliquer(board, op) {
  const maintenant = new Date().toISOString();
  const b = {
    updatedAt: maintenant,
    onDuty: board.onDuty.slice(),
    log: board.log.slice()
  };

  const id = texte(op.id, 60);
  const i = b.onDuty.findIndex(e => e.id === id);

  const cloturer = (indice, force) => {
    const e = b.onDuty.splice(indice, 1)[0];
    const sec = secondes(e.since, maintenant);
    b.log.unshift({
      id: e.id, pseudo: e.pseudo, roleId: e.roleId,
      in: e.since, out: maintenant,
      seconds: sec, minutes: Math.round(sec / 60),
      forced: !!force
    });
    b.log = b.log.slice(0, MAX_LOG);
    return sec;
  };

  switch (op.op) {
    case "in":
      if (!id) return { erreur: "identifiant manquant" };
      if (i !== -1) return { board: b, deja: true };
      b.onDuty.push({
        id,
        pseudo: texte(op.pseudo, 60) || "?",
        roleId: texte(op.roleId, 60),
        since: maintenant
      });
      return { board: b };

    case "out":
      if (i === -1) return { board: b, deja: true };
      return { board: b, seconds: cloturer(i, op.force === true) };

    case "clear-log":
      b.log = [];
      return { board: b, retires: board.log.length };

    case "remove-log": {
      const n = Math.round(Number(op.index));
      if (!(n >= 0 && n < b.log.length)) return { board: b, deja: true };
      b.log.splice(n, 1);
      return { board: b };
    }

    default:
      return { erreur: "opération inconnue : " + op.op };
  }
}

/* ---- Lecture / écriture ------------------------------------------------------ */

async function lire() {
  try {
    return JSON.parse(await fsp.readFile(FICHIER, "utf8"));
  } catch (_) {
    return VIDE;
  }
}

/* File d'attente : une seule écriture à la fois, dans l'ordre d'arrivée.
   C'est ce qui garantit que deux pointages simultanés ne s'écrasent pas. */
let queue = Promise.resolve();
function enFile(travail) {
  const suite = queue.then(travail, travail);
  queue = suite.catch(() => {});
  return suite;
}

/** Écriture atomique : on écrit à côté puis on renomme, jamais de fichier à moitié écrit. */
async function ecrire(board) {
  await fsp.mkdir(DOSSIER, { recursive: true });
  const contenu = JSON.stringify(board, null, 2) + "\n";
  const tmp = FICHIER + ".tmp";
  await fsp.writeFile(tmp, contenu, "utf8");

  /* Une copie horodatée, au cas où quelqu'un saccagerait le tableau. */
  try {
    if (fs.existsSync(FICHIER)) {
      const dir = path.join(DOSSIER, "sauvegardes");
      await fsp.mkdir(dir, { recursive: true });
      await fsp.copyFile(FICHIER, path.join(dir, Date.now() + ".json"));
      const anciens = (await fsp.readdir(dir)).sort();
      for (const f of anciens.slice(0, Math.max(0, anciens.length - SAUVEGARDES))) {
        await fsp.unlink(path.join(dir, f)).catch(() => {});
      }
    }
  } catch (_) { /* la sauvegarde est un confort, pas un bloquant */ }

  await fsp.rename(tmp, FICHIER);
}

/* ---- Écriture sur GitHub ------------------------------------------------------
   Le jeton reste ici. Le site n'en a jamais besoin : il demande au serveur,
   le serveur écrit. C'est ce qui permet à toute l'équipe de publier. */

const GH = {
  token: process.env.GH_TOKEN || "",
  owner: process.env.GH_OWNER || "",
  repo: process.env.GH_REPO || "",
  branche: process.env.GH_BRANCH || "main"
};

function b64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

async function githubEcrire(chemin, contenuB64, message) {
  const base = "https://api.github.com/repos/" + GH.owner + "/" + GH.repo +
    "/contents/" + encodeURI(chemin);
  const entetes = {
    Authorization: "Bearer " + GH.token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "mecano-nord",
    "Content-Type": "application/json"
  };

  try {
    let sha = null;
    const lu = await fetch(base + "?ref=" + encodeURIComponent(GH.branche), { headers: entetes });
    if (lu.ok) sha = (await lu.json()).sha || null;
    else if (lu.status !== 404) return { ok: false, error: "GitHub a répondu " + lu.status };

    const corps = { message, content: contenuB64, branch: GH.branche };
    if (sha) corps.sha = sha;

    const ecrit = await fetch(base, { method: "PUT", headers: entetes, body: JSON.stringify(corps) });
    if (!ecrit.ok) {
      const d = await ecrit.json().catch(() => ({}));
      return { ok: false, error: "Écriture refusée (" + ecrit.status + ") " + (d.message || "") };
    }
    const d = await ecrit.json();
    return { ok: true, commit: d.commit && d.commit.sha ? d.commit.sha.slice(0, 7) : null };
  } catch (_) {
    return { ok: false, error: "GitHub injoignable" };
  }
}

/* ---- Utilitaires HTTP --------------------------------------------------------- */

function entetes(req) {
  const origine = req.headers.origin || "";
  const ok = ORIGINES.includes("*") || ORIGINES.includes(origine);
  return {
    "Access-Control-Allow-Origin": ORIGINES.includes("*") ? "*" : (ok ? origine : ORIGINES[0]),
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store"
  };
}

const origineAutorisee = req => {
  if (ORIGINES.includes("*")) return true;
  const o = req.headers.origin;
  return !o || ORIGINES.includes(o);
};

function repondre(res, code, data, req) {
  const corps = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(code, Object.assign(
    { "Content-Type": typeof data === "string" ? "text/plain; charset=utf-8" : "application/json" },
    entetes(req)
  ));
  res.end(corps);
}

function corpsJson(req) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    const morceaux = [];
    req.on("data", c => {
      taille += c.length;
      if (taille > MAX_CORPS) { reject(new Error("Corps trop volumineux")); req.destroy(); return; }
      morceaux.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(morceaux).toString("utf8") || "{}")); }
      catch (_) { reject(new Error("JSON illisible")); }
    });
    req.on("error", reject);
  });
}

/* ---- Le serveur ---------------------------------------------------------------- */

const serveur = http.createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress || "?";
  const url = new URL(req.url, "http://x");
  const chemin = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, entetes(req));
    return res.end();
  }
  if (!origineAutorisee(req)) return repondre(res, 403, { error: "Origine refusée" }, req);
  if (tropDeRequetes(ip)) return repondre(res, 429, { error: "Trop de requêtes" }, req);

  try {
    /* --- santé --- */
    if (chemin === "/sante" && req.method === "GET") {
      /* « ops: true » indique au site qu'il peut envoyer des opérations
         plutôt que tout le tableau : c'est ce qui évite les écrasements. */
      return repondre(res, 200, {
        ok: true, ops: true, depuis: Math.round(process.uptime()) + " s"
      }, req);
    }

    /* --- tableau de service --- */
    if (chemin === "/duty.json" || chemin === "/duty") {
      if (req.method === "GET") return repondre(res, 200, await lire(), req);

      if (req.method === "PUT" || req.method === "POST") {
        const brut = await corpsJson(req);

        /* Opération : le serveur lit, applique et écrit, sans concurrence. */
        if (brut && brut.op) {
          const r = await enFile(async () => {
            const actuel = nettoyer(await lire()) || VIDE;
            const res2 = appliquer(actuel, brut);
            if (res2.erreur) return res2;
            await ecrire(res2.board);
            return res2;
          });
          if (r.erreur) return repondre(res, 400, { error: r.erreur }, req);
          console.log(new Date().toISOString(), brut.op, "—",
            r.board.onDuty.length, "en service");
          return repondre(res, 200, {
            ok: true, board: r.board, deja: !!r.deja,
            seconds: r.seconds, retires: r.retires
          }, req);
        }

        /* Sinon : remplacement complet (compatibilité). */
        const board = nettoyer(brut.board || brut);
        if (!board) return repondre(res, 400, { error: "Tableau de service invalide" }, req);
        await enFile(() => ecrire(board));
        console.log(new Date().toISOString(), "service remplacé —",
          board.onDuty.length, "en service");
        return repondre(res, 200, { ok: true, board }, req);
      }
      return repondre(res, 405, { error: "Méthode non autorisée" }, req);
    }

    /* --- publication vers GitHub --- */
    if (chemin === "/publier" && req.method === "POST") {
      if (!GH.token || !GH.owner || !GH.repo) {
        return repondre(res, 501, {
          error: "Publication non configurée : renseigne GH_TOKEN, GH_OWNER et GH_REPO"
        }, req);
      }
      const c = await corpsJson(req);
      const cible = texte(c.path, 200);

      /* On n'autorise QUE les fichiers de données et les images : personne
         ne peut réécrire le code du site par cette porte. */
      const permis = cible === "data/catalog.json" ||
        cible === "assets/img/index.json" ||
        /^assets\/img\/[\w.-]+\.(png|jpe?g|webp|gif|svg|avif)$/i.test(cible);
      if (!permis) return repondre(res, 403, { error: "Chemin non autorisé : " + cible }, req);

      /* `content` est du texte, `base64` une image déjà encodée. */
      const contenu = typeof c.base64 === "string"
        ? c.base64.replace(/^data:[^,]*,/, "")
        : b64(String(c.content || ""));
      if (!contenu) return repondre(res, 400, { error: "Contenu vide" }, req);

      const r = await githubEcrire(cible, contenu, texte(c.message, 150) ||
        ("Mise à jour de " + cible));
      if (!r.ok) return repondre(res, 502, { error: r.error }, req);
      console.log(new Date().toISOString(), "publié :", cible, r.commit || "");
      return repondre(res, 200, { ok: true, commit: r.commit }, req);
    }

    /* --- relais Discord --- */
    if (chemin === "/relais" && req.method === "POST") {
      const corps = await corpsJson(req);
      const type = corps.type || (corps.kind ? "webhook" : "");

      if (type === "duty") {
        const board = nettoyer(corps.board);
        if (!board) return repondre(res, 400, { error: "Tableau de service invalide" }, req);
        await ecrire(board);
        return repondre(res, 200, { ok: true }, req);
      }
      if (type !== "webhook") return repondre(res, 400, { error: "Type inconnu : " + type }, req);

      const cible = WEBHOOKS[corps.kind];
      if (!cible) return repondre(res, 400, { error: "Webhook non configuré : " + corps.kind }, req);

      const m = corps.message || {};
      const propre = {
        username: texte(m.username, 80) || undefined,
        avatar_url: texte(m.avatar_url, 400) || undefined,
        content: texte(m.content, 300) || undefined,
        embeds: Array.isArray(m.embeds) ? m.embeds.slice(0, 3) : [],
        allowed_mentions: { parse: ["roles", "users"] }
      };

      const r = await fetch(cible, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(propre)
      });
      if (r.ok || r.status === 204) return repondre(res, 200, { ok: true }, req);
      return repondre(res, 502, { error: "Discord a répondu " + r.status }, req);
    }

    return repondre(res, 404, { error: "Chemin inconnu : " + chemin }, req);
  } catch (e) {
    console.error(new Date().toISOString(), "erreur :", e.message);
    return repondre(res, 500, { error: e.message }, req);
  }
});

serveur.listen(PORT, HOTE, () => {
  console.log("Mécano Nord — serveur démarré");
  console.log("  écoute    : " + HOTE + ":" + PORT);
  console.log("  données   : " + FICHIER);
  console.log("  origines  : " + ORIGINES.join(", "));
  console.log("  webhooks  : " +
    (WEBHOOKS.bt ? "BT ✓" : "BT ✗") + "  " + (WEBHOOKS.duty ? "service ✓" : "service ✗"));
});
