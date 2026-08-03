/* ==========================================================================
   Envoi de messages sur Discord via webhook.

   ⚠ À savoir : l'adresse du webhook est enregistrée dans data/catalog.json,
   qui est public. N'importe qui sachant regarder peut donc écrire dans le
   salon concerné. Utilise un salon dédié, sans enjeu, et régénère l'adresse
   depuis Discord si tu vois passer n'importe quoi.
   ========================================================================== */

window.MNWebhook = (function () {
  "use strict";

  const RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i;

  const conf = () => {
    try { return MNStore.settings().webhook || {}; } catch (_) { return {}; }
  };

  /** L'adresse ressemble-t-elle à un webhook Discord ? */
  const isValid = url => RE.test(String(url || "").trim());

  /** Un webhook est-il configuré pour ce type de message ? */
  const has = kind => isValid(conf()[kind]);

  const COLORS = {
    bt: 0xff2bd1,        // rose : bon de travail
    dutyIn: 0xa8ff52,    // vert : prise de service
    dutyOut: 0xffa92e    // ambre : fin de service
  };

  /**
   * Envoie un message.
   * @param {"bt"|"duty"} kind  quel webhook utiliser
   * @param {object} embed      contenu Discord (titre, description, champs…)
   * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
   */
  async function send(kind, embed) {
    const url = String(conf()[kind] || "").trim();
    if (!url) return { ok: false, skipped: true };
    if (!isValid(url)) return { ok: false, error: "Adresse de webhook invalide." };

    const brand = MNStore.brand();
    const body = {
      username: brand.name,
      embeds: [Object.assign({
        color: COLORS.bt,
        timestamp: new Date().toISOString(),
        footer: { text: brand.name + " · " + brand.tagline }
      }, embed)]
    };
    const mention = String(conf().mention || "").trim();
    if (mention) {
      body.content = mention;
      body.allowed_mentions = { parse: ["roles", "users"] };
    }

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (r.ok || r.status === 204) return { ok: true };
      if (r.status === 401 || r.status === 404) {
        return { ok: false, error: "Webhook introuvable — l'adresse a peut-être été révoquée." };
      }
      if (r.status === 429) return { ok: false, error: "Discord limite les envois, réessaie dans un instant." };
      return { ok: false, error: "Discord a répondu " + r.status + "." };
    } catch (_) {
      return { ok: false, error: "Envoi impossible (réseau ou webhook bloqué)." };
    }
  }

  /* ---- Messages prêts à l'emploi -------------------------------------------- */

  /** Bon de travail terminé. */
  function sendBT(bt, lines, resources) {
    const fields = [];
    if (bt.client) fields.push({ name: "Client", value: bt.client, inline: true });

    if (lines.length) {
      fields.push({
        name: "Prestations",
        value: lines.map(l => "• " + l.name + " ×" + l.qty).join("\n").slice(0, 1024)
      });
    }
    if (resources.length) {
      fields.push({
        name: "Ressources nécessaires",
        value: resources.map(r => "• " + r.name + " ×" + r.qty).join("\n").slice(0, 1024)
      });
    }
    if (bt.note) fields.push({ name: "Note", value: bt.note.slice(0, 1024) });

    return send("bt", {
      title: "Bon de travail " + bt.ref,
      description: "Mécano : **" + bt.by + "**",
      color: COLORS.bt,
      fields
    });
  }

  /** Prise ou fin de service. */
  function sendDuty(pseudo, role, action, minutes) {
    const inService = action === "in";
    const f = [];
    if (role) f.push({ name: "Poste", value: role, inline: true });
    if (!inService && minutes != null) {
      const h = Math.floor(minutes / 60), m = minutes % 60;
      f.push({ name: "Durée", value: (h ? h + " h " : "") + m + " min", inline: true });
    }
    return send("duty", {
      title: (inService ? "🟢 Prise de service" : "🔴 Fin de service") + " — " + pseudo,
      color: inService ? COLORS.dutyIn : COLORS.dutyOut,
      fields: f
    });
  }

  /** Message de test depuis le panneau admin. */
  function sendTest(kind, by) {
    return send(kind, {
      title: "Test de configuration",
      description: "Si tu lis ceci, le webhook « " +
        (kind === "bt" ? "bons de travail" : "services") + " » fonctionne.\nEnvoyé par **" + by + "**.",
      color: 0x7fd7e8
    });
  }

  return { isValid, has, send, sendBT, sendDuty, sendTest };
})();
