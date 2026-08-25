/* ==========================================================================
   RELAIS DU SITE — Cloudflare Worker (gratuit)
   --------------------------------------------------------------------------
   Il rend deux services, et dans les deux cas le secret reste ICI, jamais
   dans le dépôt public :

     1. WEBHOOKS DISCORD — le site lui envoie le message, le relais connaît
        les adresses Discord. Elles ne sont donc plus dans catalog.json.

     2. PRISE DE SERVICE — le relais écrit data/duty.json sur GitHub avec son
        propre jeton. Tes employés n'ont RIEN à installer ni à coller : ils
        cliquent « Prendre mon service » et c'est enregistré pour tout le monde.

   --------------------------------------------------------------------------
   MISE EN PLACE (une seule fois, ~10 minutes, sans carte bancaire)

   1. Crée un compte sur dash.cloudflare.com
   2. « Workers & Pages » → « Create » → « Start with Hello World »
      → nomme-le (ex. mecano-nord-relais) → « Deploy »
   3. « Edit code », efface tout, colle CE FICHIER, « Deploy »
   4. Onglet « Settings » → « Variables and Secrets ». Ajoute en type
      « Secret » :

        GH_TOKEN     →  un jeton GitHub fine-grained, dépôt du site,
                        permission « Contents : Read and write »
        WEBHOOK_BT     →  adresse Discord des bons de travail   (facultatif)
        WEBHOOK_DUTY   →  adresse Discord des prises de service (facultatif)
        WEBHOOK_CONGES →  adresse Discord des congés (facultatif ; sans elle,
                          les congés partent dans le salon des services)
        WEBHOOK_AVERTISSEMENTS → adresse Discord des avertissements
                          (facultatif ; sans elle, aucun n'est envoyé — une
                          sanction ne se replie pas sur un salon commun)

      Et en type « Text » :

        GH_OWNER     →  cyrillou50
        GH_REPO      →  mecano-nord
        GH_BRANCH    →  main
        ORIGINE      →  https://cyrillou50.github.io

   5. Copie l'adresse du worker (https://…workers.dev) et colle-la dans
      Admin → Discord → « Relais ». Vide ensuite les deux champs d'adresse
      Discord du site : ils ne servent plus.

   --------------------------------------------------------------------------
   CE QUE ÇA PROTÈGE, ET CE QUE ÇA NE PROTÈGE PAS

   Le jeton GitHub et les adresses Discord ne sont plus publics : c'est le
   gain principal, et il est réel.

   L'adresse du relais, elle, est forcément dans le code du site. Le relais
   n'accepte que les appels venant de ton site (en-tête Origin) et refuse
   tout ce qui ne ressemble pas à un tableau de service valide. Un navigateur
   ne peut donc pas contourner ça — un outil en ligne de commande peut
   falsifier l'origine, et au pire écrire n'importe quoi dans le tableau de
   pointage. Il ne peut PAS toucher au reste du dépôt ni lire le jeton.
   ========================================================================== */

export default {
  async fetch(request, env) {
    const origine = env.ORIGINE || "*";
    const entetes = {
      "Access-Control-Allow-Origin": origine,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes });
    if (request.method !== "POST") return json({ error: "Méthode non autorisée" }, 405, entetes);

    if (origine !== "*") {
      const from = request.headers.get("Origin") || "";
      if (from && from !== origine) return json({ error: "Origine refusée" }, 403, entetes);
    }

    let corps;
    try { corps = await request.json(); }
    catch (_) { return json({ error: "Corps illisible" }, 400, entetes); }

    /* Ancien format (webhook seul) toléré, pour ne rien casser. */
    const type = corps.type || (corps.kind ? "webhook" : "");

    if (type === "webhook") return relayerWebhook(corps, env, entetes);
    if (type === "duty") return ecrireService(corps, env, entetes);
    return json({ error: "Type inconnu : " + type }, 400, entetes);
  }
};

/* ---- 1. Webhooks Discord ---------------------------------------------------- */

async function relayerWebhook(corps, env, entetes) {
  const cibles = {
    bt: env.WEBHOOK_BT,
    duty: env.WEBHOOK_DUTY,
    /* Sans salon dédié, les congés rejoignent celui des prises de service. */
    conges: env.WEBHOOK_CONGES || env.WEBHOOK_DUTY,
    /* Pas de repli pour les avertissements : sans salon à eux, rien ne part. */
    avertissements: env.WEBHOOK_AVERTISSEMENTS
  };
  const cible = cibles[corps.kind];
  if (!cible) return json({ error: "Webhook non configuré : " + corps.kind }, 400, entetes);

  const m = corps.message;
  if (!m || typeof m !== "object") return json({ error: "Message manquant" }, 400, entetes);

  const propre = {
    username: str(m.username, 80),
    avatar_url: str(m.avatar_url, 400),
    content: str(m.content, 300),
    embeds: Array.isArray(m.embeds) ? m.embeds.slice(0, 3) : [],
    allowed_mentions: { parse: ["roles", "users"] }
  };

  try {
    const r = await fetch(cible, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(propre)
    });
    if (r.ok || r.status === 204) return json({ ok: true }, 200, entetes);
    return json({ error: "Discord a répondu " + r.status }, 502, entetes);
  } catch (_) {
    return json({ error: "Discord injoignable" }, 502, entetes);
  }
}

/* ---- 2. Tableau de service --------------------------------------------------- */

async function ecrireService(corps, env, entetes) {
  if (!env.GH_TOKEN || !env.GH_OWNER || !env.GH_REPO) {
    return json({ error: "Relais incomplet : GH_TOKEN, GH_OWNER ou GH_REPO manquant" }, 500, entetes);
  }

  const board = nettoyerService(corps.board);
  if (!board) return json({ error: "Tableau de service invalide" }, 400, entetes);

  const branche = env.GH_BRANCH || "main";
  const chemin = env.DUTY_PATH || "data/duty.json";
  const base = "https://api.github.com/repos/" + env.GH_OWNER + "/" + env.GH_REPO +
    "/contents/" + chemin;
  const gh = {
    Authorization: "Bearer " + env.GH_TOKEN,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "mecano-nord-relais",
    "Content-Type": "application/json"
  };

  try {
    /* sha courant, nécessaire pour remplacer le fichier */
    let sha = null;
    const lu = await fetch(base + "?ref=" + encodeURIComponent(branche), { headers: gh });
    if (lu.ok) sha = (await lu.json()).sha || null;
    else if (lu.status !== 404) return json({ error: "GitHub a répondu " + lu.status }, 502, entetes);

    const contenu = b64(JSON.stringify(board, null, 2) + "\n");
    const message = "Service : " + str(corps.message, 100) || "Mise à jour du tableau de service";

    const ecrit = await fetch(base, {
      method: "PUT",
      headers: gh,
      body: JSON.stringify(sha ? { message, content: contenu, branch: branche, sha }
                               : { message, content: contenu, branch: branche })
    });
    if (!ecrit.ok) return json({ error: "Écriture refusée (" + ecrit.status + ")" }, 502, entetes);
    return json({ ok: true }, 200, entetes);
  } catch (_) {
    return json({ error: "GitHub injoignable" }, 502, entetes);
  }
}

/**
 * On ne réécrit dans le dépôt que ce qui ressemble vraiment à un tableau de
 * service : tout champ inattendu est jeté, toute chaîne est bornée.
 */
function nettoyerService(b) {
  if (!b || typeof b !== "object") return null;
  const onDuty = Array.isArray(b.onDuty) ? b.onDuty : [];
  const log = Array.isArray(b.log) ? b.log : [];
  if (onDuty.length > 60 || log.length > 300) return null;

  return {
    updatedAt: iso(b.updatedAt) || new Date().toISOString(),
    onDuty: onDuty.map(e => ({
      id: str(e.id, 60) || "",
      pseudo: str(e.pseudo, 60) || "?",
      roleId: str(e.roleId, 60) || "",
      since: iso(e.since) || new Date().toISOString()
    })).filter(e => e.id),
    log: log.map(e => ({
      id: str(e.id, 60) || "",
      pseudo: str(e.pseudo, 60) || "?",
      roleId: str(e.roleId, 60) || "",
      in: iso(e.in),
      out: iso(e.out),
      seconds: num(e.seconds, 0, 31536000),
      minutes: num(e.minutes, 0, 525600),
      forced: e.forced === true
    })).filter(e => e.id && e.in && e.out)
  };
}

/* ---- Outils ------------------------------------------------------------------ */

function str(v, max) { return typeof v === "string" ? v.slice(0, max) : undefined; }
function num(v, min, max) { const n = Math.round(Number(v) || 0); return Math.min(max, Math.max(min, n)); }
function iso(v) { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); }

function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function json(data, status, entetes) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, entetes)
  });
}
