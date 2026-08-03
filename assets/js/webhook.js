/* ==========================================================================
   Envoi de messages sur Discord via webhook.

   ⚠ À LIRE, c'est important.
   L'adresse du webhook est enregistrée dans data/catalog.json, qui est
   public : le site doit pouvoir l'utiliser, donc il doit pouvoir la lire, et
   ce qu'un navigateur peut lire, une personne le peut aussi.

   Elle est brouillée (voir `pack`/`unpack` plus bas) pour qu'on ne la trouve
   pas en cherchant simplement « discord.com/api/webhooks » dans le fichier.
   C'est un ralentisseur, PAS une protection : quelqu'un de motivé la
   retrouvera. Utilise un salon dédié sans enjeu, et régénère l'adresse depuis
   Discord au moindre doute.

   La seule vraie parade est de passer par un relais qui garde l'adresse
   côté serveur — voir le champ « proxy » et le README.
   ========================================================================== */

window.MNWebhook = (function () {
  "use strict";

  const RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/i;
  const TAG = "enc:";
  const KEY = "MecanoNord/DayOfDecay";

  const conf = () => {
    try { return MNStore.settings().webhook || {}; } catch (_) { return {}; }
  };

  /* ---- Brouillage de l'adresse ---------------------------------------------
     XOR + base64. Réversible par construction : le but est seulement d'éviter
     qu'une adresse de webhook traîne en clair et se retrouve indexée ou
     copiée d'un coup d'œil. Ce n'est pas du chiffrement. */

  function xor(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      out += String.fromCharCode(s.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
    }
    return out;
  }

  const b64 = s => btoa(String.fromCharCode.apply(null, new TextEncoder().encode(s)));
  const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));

  /** Adresse en clair → forme brouillée stockée dans le catalogue. */
  function pack(url) {
    const u = String(url || "").trim();
    if (!u || u.indexOf(TAG) === 0) return u;
    try { return TAG + b64(xor(u)); } catch (_) { return u; }
  }

  /** Forme stockée → adresse utilisable. */
  function unpack(v) {
    const s = String(v || "").trim();
    if (s.indexOf(TAG) !== 0) return s;
    try { return xor(unb64(s.slice(TAG.length))); } catch (_) { return ""; }
  }

  /** L'adresse ressemble-t-elle à un webhook Discord ? (brouillée ou non) */
  const isValid = url => RE.test(unpack(url));

  /** Adresse du relais, s'il y en a un. */
  function relayUrl() {
    try { return String(MNStore.settings().relay || "").trim(); }
    catch (_) { return ""; }
  }

  /**
   * Un envoi est-il possible pour ce type de message ?
   * Avec un relais, il connaît les adresses : rien à configurer côté site.
   */
  const has = kind => !!relayUrl() || isValid(conf()[kind]);

  /** Chemin relatif → adresse absolue, indispensable pour l'avatar Discord. */
  function absUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    return location.origin + location.pathname.replace(/[^/]*$/, "") + s.replace(/^\.?\//, "");
  }

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
    const c = conf();
    const stored = String(c[kind] || "").trim();
    if (!relayUrl()) {
      if (!stored) return { ok: false, skipped: true };
      if (!isValid(stored)) return { ok: false, error: "Adresse de webhook invalide." };
    }

    const brand = MNStore.brand();
    const avatar = absUrl(c.avatar || brand.logo);

    const body = {
      username: String(c.name || brand.name).slice(0, 80),
      embeds: [Object.assign({
        color: COLORS.bt,
        timestamp: new Date().toISOString(),
        footer: Object.assign(
          { text: brand.name + " · " + brand.tagline },
          avatar ? { icon_url: avatar } : {}
        )
      }, embed)]
    };
    if (avatar) body.avatar_url = avatar;

    const mention = String(c.mention || "").trim();
    if (mention) {
      body.content = mention;
      body.allowed_mentions = { parse: ["roles", "users"] };
    }

    /* Un relais garde l'adresse du webhook côté serveur : c'est la seule
       façon qu'elle ne soit pas dans le dépôt. Sans relais, envoi direct. */
    const relay = relayUrl();
    const target = relay || unpack(stored);
    const payload = relay ? { type: "webhook", kind, message: body } : body;

    try {
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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

  /** Durée lisible, sans dépendre du module de pointage. */
  function duree(sec) {
    const t = Math.max(0, Math.round(sec));
    const j = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const p = [];
    if (j) p.push(j + " j");
    if (h || j) p.push(h + " h");
    p.push(m + " min");
    return p.join(" ");
  }

  /** Prise ou fin de service. `seconds` = durée exacte du service terminé. */
  function sendDuty(pseudo, role, action, seconds) {
    const inService = action === "in";
    const f = [];
    if (role) f.push({ name: "Poste", value: role, inline: true });
    if (!inService && seconds != null) {
      f.push({ name: "Durée", value: duree(seconds), inline: true });
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

  return { isValid, has, send, sendBT, sendDuty, sendTest, pack, unpack, absUrl, relayUrl };
})();
