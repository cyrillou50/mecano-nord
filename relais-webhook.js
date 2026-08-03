/* ==========================================================================
   RELAIS DE WEBHOOK — Cloudflare Worker (gratuit)
   --------------------------------------------------------------------------
   À quoi ça sert : sans relais, l'adresse de ton webhook Discord est dans
   data/catalog.json, donc lisible par n'importe qui. Avec ce relais, elle
   vit côté serveur : le site n'envoie plus qu'à « https://…workers.dev »,
   et c'est le relais qui connaît la vraie adresse Discord.

   C'est la seule façon réelle de ne pas exposer tes webhooks.

   --------------------------------------------------------------------------
   MISE EN PLACE (10 minutes, sans carte bancaire)

   1. Crée un compte sur dash.cloudflare.com
   2. Menu « Workers & Pages » → « Create » → « Start with Hello World »
      → donne-lui un nom (ex. mecano-nord-relais) → « Deploy »
   3. Clique « Edit code », efface tout, colle CE FICHIER, puis « Deploy »
   4. Onglet « Settings » → « Variables and Secrets », ajoute ces secrets
      (bouton « Add », type « Secret ») :

        WEBHOOK_BT      →  l'adresse Discord des bons de travail
        WEBHOOK_DUTY    →  l'adresse Discord des prises de service
        ORIGINE         →  https://cyrillou50.github.io

   5. Copie l'adresse du worker (https://…workers.dev) et colle-la dans
      Admin → Discord → « Relais ». Vide alors les deux champs d'adresse
      Discord du site : ils ne servent plus.

   Bonus : le relais refuse les requêtes venant d'ailleurs que de ton site et
   limite la casse en cas d'abus.
   ========================================================================== */

export default {
  async fetch(request, env) {
    const origine = env.ORIGINE || "*";

    const entetes = {
      "Access-Control-Allow-Origin": origine,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    /* Requête préalable du navigateur */
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: entetes });
    }
    if (request.method !== "POST") {
      return json({ error: "Méthode non autorisée" }, 405, entetes);
    }

    /* On n'accepte que les appels venant du site */
    if (origine !== "*") {
      const from = request.headers.get("Origin") || "";
      if (from && from !== origine) {
        return json({ error: "Origine refusée" }, 403, entetes);
      }
    }

    let corps;
    try {
      corps = await request.json();
    } catch (_) {
      return json({ error: "Corps illisible" }, 400, entetes);
    }

    /* Le site envoie { kind: "bt" | "duty", message: {…} } */
    const cibles = { bt: env.WEBHOOK_BT, duty: env.WEBHOOK_DUTY };
    const cible = cibles[corps.kind];
    if (!cible) {
      return json({ error: "Type de message inconnu : " + corps.kind }, 400, entetes);
    }

    const message = corps.message;
    if (!message || typeof message !== "object") {
      return json({ error: "Message manquant" }, 400, entetes);
    }

    /* Garde-fous : on ne relaie que ce qu'on attend, et jamais un @everyone */
    const propre = {
      username: str(message.username, 80),
      avatar_url: str(message.avatar_url, 400),
      content: str(message.content, 300),
      embeds: Array.isArray(message.embeds) ? message.embeds.slice(0, 3) : [],
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
};

function str(v, max) {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

function json(data, status, entetes) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, entetes)
  });
}
