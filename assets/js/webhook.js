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
    try { return MNStore.api("relais"); }
    catch (_) { return ""; }
  }

  /* Un message sans salon à lui part dans celui de son voisin le plus proche.
     Les congés arrivent donc dans le salon des services tant qu'on ne leur en
     donne pas un. */
  const REPLI = { conges: "duty" };

  /** Le salon réellement visé, une fois le repli appliqué. */
  function salon(kind) {
    const c = conf();
    if (!String(c[kind] || "").trim() && REPLI[kind]) return REPLI[kind];
    return kind;
  }

  /**
   * Un envoi est-il possible pour ce type de message ?
   * Avec un relais, il connaît les adresses : rien à configurer côté site.
   */
  const has = kind => !!relayUrl() || isValid(conf()[salon(kind)]);

  /** Chemin relatif → adresse absolue, indispensable pour l'avatar Discord. */
  function absUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    return location.origin + location.pathname.replace(/[^/]*$/, "") + s.replace(/^\.?\//, "");
  }

  const COLORS = {
    bt: 0xff2bd1,        // rose : devis
    dutyIn: 0xa8ff52,    // vert : prise de service
    dutyOut: 0xffa92e,   // ambre : fin de service
    leaveOn: 0x7fd7e8,   // bleu : congés posés
    leaveOff: 0x8b8397,  // gris : congés annulés
    warn: 0xff3b5c,      // rouge : avertissement pose
    warnOff: 0x8b8397    // gris : avertissement leve ou retire
  };

  /**
   * Envoie un message.
   * @param {"bt"|"duty"} kind  quel webhook utiliser
   * @param {object} embed      contenu Discord (titre, description, champs…)
   * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
   */
  async function send(kind, embed) {
    const c = conf();
    kind = salon(kind);
    const stored = String(c[kind] || "").trim();
    if (!relayUrl()) {
      if (!stored) return { ok: false, skipped: true };
      if (!isValid(stored)) return { ok: false, error: "Adresse de webhook invalide." };
    }

    const brand = MNStore.brand();
    const avatar = absUrl(c.avatar || brand.logo);

    /* Les deux garages partagent le salon : sans leur nom sur le message, on
       ne sait pas lequel parle. Il tient dans l'expéditeur et dans le pied —
       l'un se lit en survolant la liste, l'autre en lisant le message. */
    const ou = MNStore.atelier();
    const garage = MNStore.nomAtelier(ou);
    /* Un nom d'expéditeur réglé à la main reste : on lui accole le garage
       plutôt que de l'écraser, sinon le réglage n'aurait plus d'effet. */
    const expediteur = c.name
      ? String(c.name) + " · " + MNStore.courtAtelier(ou)
      : garage;

    const body = {
      username: expediteur.slice(0, 80),
      embeds: [Object.assign({
        color: COLORS.bt,
        timestamp: new Date().toISOString(),
        footer: Object.assign(
          { text: garage + " · " + brand.tagline },
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

      /* Le relais renvoie la raison en clair : plus utile qu'un code seul. */
      let raison = "";
      if (relay) {
        const d = await r.json().catch(() => ({}));
        raison = String(d.error || "");
      }

      if (relay && r.status === 400 && /webhook non configuré/i.test(raison)) {
        /* Un relais plus ancien ne connaît pas les types récents : plutôt que
           d'échouer, on réessaie dans le salon de repli. */
        if (REPLI[kind]) return send(REPLI[kind], embed);
        /* Plus de repli : c'est que le relais n'a pas l'adresse. On le dit
           franchement, avec le nom exact de la variable à renseigner. */
        return { ok: false, error: "Ton relais n'a pas d'adresse pour « " + kind +
          " ». Ajoute WEBHOOK_" + kind.toUpperCase() + " dans son service, puis redémarre-le." };
      }

      if (r.status === 401 || r.status === 404) {
        return { ok: false, error: "Webhook introuvable — l'adresse a peut-être été révoquée." };
      }
      if (r.status === 429) return { ok: false, error: "Discord limite les envois, réessaie dans un instant." };
      return { ok: false, error: raison || (relay ? "Le relais a répondu " : "Discord a répondu ") + r.status + "." };
    } catch (_) {
      return { ok: false, error: "Envoi impossible (réseau ou webhook bloqué)." };
    }
  }

  /* ---- Messages prêts à l'emploi -------------------------------------------- */

  /** Devis terminé. */
  function sendBT(bt, lines, resources) {
    const fields = [];
    if (bt.client) fields.push({ name: "Client", value: bt.client, inline: true });
    if (bt.secondes) {
      fields.push({ name: "Temps de fabrication", value: MNStore.duree(bt.secondes), inline: true });
    }

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
      title: "Devis " + bt.ref,
      description: "Mécano : **" + bt.by + "**",
      color: COLORS.bt,
      fields
    });
  }

  /**
   * Durée lisible, à la seconde. Même découpage que MNDuty.dur, mais recopié
   * ici : webhook.js sert aussi sur admin.html, où le pointage n'est pas chargé.
   */
  function duree(sec) {
    const t = Math.max(0, Math.round(sec));
    const j = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const p = [];
    if (j) p.push(j + " j");
    if (h || j) p.push(h + " h");
    if (m || h || j) p.push(m + " min");
    p.push(s + " s");
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

  /** Jour lisible : « lundi 10 août 2026 ». */
  function jourFr(j) {
    /* Midi plutôt que minuit : aucun décalage de fuseau ne peut faire
       basculer la date sur la veille. */
    const d = new Date(String(j) + "T12:00:00");
    if (isNaN(d)) return String(j);
    return d.toLocaleDateString("fr-FR",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  const TITRES = {
    pose: "🏖️ Congés posés",
    modifie: "✏️ Congés modifiés",
    annule: "↩️ Congés annulés"
  };

  /**
   * Congés posés, modifiés ou annulés.
   * @param {object} i  action ("pose"|"modifie"|"annule"), pseudo, role, from,
   *                    to, days, note, by (qui a agi, si ce n'est pas la personne)
   */
  function sendConge(i) {
    const pose = i.action !== "annule";
    const f = [];

    if (i.role) f.push({ name: "Poste", value: i.role, inline: true });
    f.push({ name: "Départ", value: jourFr(i.from), inline: true });
    f.push({ name: "Retour", value: jourFr(i.to), inline: true });
    f.push({
      name: "Durée",
      value: "**" + i.days + " jour" + (i.days > 1 ? "s" : "") + "**",
      inline: true
    });
    if (i.by) {
      f.push({
        name: i.action === "annule" ? "Annulés par" : i.action === "modifie" ? "Modifiés par" : "Posés par",
        value: i.by, inline: true
      });
    }
    if (i.note) f.push({ name: "Motif", value: String(i.note).slice(0, 1024) });

    return send("conges", {
      title: (TITRES[i.action] || TITRES.pose) + " — " + i.pseudo,
      color: pose ? COLORS.leaveOn : COLORS.leaveOff,
      fields: f
    });
  }

  /**
   * Avertissement posé, levé ou retiré.
   *
   * Pas de repli sur un autre salon : une sanction ne doit pas atterrir par
   * défaut là où tout le monde lit les prises de service. Sans salon dédié,
   * `send` s'arrête de lui-même sur `skipped`.
   *
   * @param {object} i  action ("pose"|"leve"|"retire"), pseudo, role, gravite
   *                    (nom lisible), motif, note, expire, by
   */
  function sendAvertissement(i) {
    const f = [];
    /* Qui la prend, puis qui la met. Les deux côte à côte et nommés : un seul
       nom dans le message laissait deviner lequel des deux c'était. */
    f.push({
      name: i.action === "pose" ? "Sanctionné" : "Employé",
      value: "**" + i.pseudo + "**", inline: true
    });
    if (i.by) {
      f.push({
        name: i.action === "leve" ? "Levée par" : i.action === "retire" ? "Retirée par"
                                                                       : "Mise par",
        value: i.by, inline: true
      });
    }
    f.push({ name: "Gravité", value: "**" + i.gravite + "**", inline: true });
    if (i.expire) f.push({ name: "Compte jusqu'au", value: jourFr(i.expire), inline: true });
    if (i.motif) f.push({ name: "Motif", value: String(i.motif).slice(0, 1024) });
    if (i.note && i.action === "pose") {
      f.push({ name: "Précisions", value: String(i.note).slice(0, 1024) });
    }

    const titres = {
      pose: "Avertissement",
      leve: "Avertissement levé",
      retire: "Avertissement retiré"
    };
    return send("avertissements", {
      title: (titres[i.action] || titres.pose) + " — " + i.pseudo,
      color: i.action === "pose" ? COLORS.warn : COLORS.warnOff,
      fields: f
    });
  }

  const NOMS = {
    bt: "devis", duty: "services", conges: "congés",
    avertissements: "avertissements"
  };

  /** Message de test depuis le panneau admin. */
  function sendTest(kind, by) {
    return send(kind, {
      title: "Test de configuration",
      description: "Si tu lis ceci, le webhook « " + (NOMS[kind] || kind) +
        " » fonctionne.\nEnvoyé par **" + by + "**.",
      color: 0x7fd7e8
    });
  }

  return { isValid, has, send, sendBT, sendDuty, sendConge, sendAvertissement,
           sendTest, pack, unpack, absUrl, relayUrl };
})();
