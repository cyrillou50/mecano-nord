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

/* ---- Lecture / écriture ------------------------------------------------------ */

async function lire() {
  try {
    return JSON.parse(await fsp.readFile(FICHIER, "utf8"));
  } catch (_) {
    return VIDE;
  }
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
      return repondre(res, 200, { ok: true, depuis: Math.round(process.uptime()) + " s" }, req);
    }

    /* --- tableau de service --- */
    if (chemin === "/duty.json" || chemin === "/duty") {
      if (req.method === "GET") return repondre(res, 200, await lire(), req);

      if (req.method === "PUT" || req.method === "POST") {
        const brut = await corpsJson(req);
        const board = nettoyer(brut.board || brut);
        if (!board) return repondre(res, 400, { error: "Tableau de service invalide" }, req);
        await ecrire(board);
        console.log(new Date().toISOString(), "service mis à jour —",
          board.onDuty.length, "en service");
        return repondre(res, 200, { ok: true }, req);
      }
      return repondre(res, 405, { error: "Méthode non autorisée" }, req);
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

serveur.listen(PORT, () => {
  console.log("Mécano Nord — serveur démarré");
  console.log("  port      : " + PORT);
  console.log("  données   : " + FICHIER);
  console.log("  origines  : " + ORIGINES.join(", "));
  console.log("  webhooks  : " +
    (WEBHOOKS.bt ? "BT ✓" : "BT ✗") + "  " + (WEBHOOKS.duty ? "service ✓" : "service ✗"));
});
