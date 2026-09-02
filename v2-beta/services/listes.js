/* ==========================================================================
   Listes d'atelier : les émotes et la blacklist.

   Deux listes de la même forme — une suite d'enregistrements identifiés, sans
   hiérarchie ni relation — donc un seul module les sert.

   Elles vivent sur le serveur de l'atelier, pas dans le catalogue, et ce
   n'est pas un détail de rangement :

     • Le droit. Inscrire un client sur la blacklist, c'est le geste de celui
       qui tient le comptoir. Écrire le catalogue, c'est publier le site.
       Confondre les deux obligerait à donner « publier » à qui l'on veut
       seulement laisser inscrire — et sans ce droit, rien ne partirait de son
       navigateur.

     • La concurrence. Le catalogue s'écrit en entier : deux personnes qui
       inscrivent quelqu'un en même temps s'écrasent. Le serveur, lui, applique
       une opération sur une liste qu'il relit, et sérialise les écritures.

   Sans serveur — ou avec un serveur d'une version qui ignore ces routes — on
   retombe dans le catalogue plutôt que de perdre l'enregistrement. C'est le
   même repli que pour le parc, les contrats et l'agenda : ça marche, mais il
   faut le droit de publier, et on le dit.
   ========================================================================== */

window.MNListes = (function () {
  "use strict";

  /* Ce qui distingue les deux listes : leur route, et le champ du catalogue
     qui les porte quand il n'y a pas de serveur. */
  const SPECS = {
    emotes: { route: "emotes", champ: "emotes", nom: "les émotes" },
    blacklist: { route: "blacklist", champ: "blacklist", nom: "la blacklist" }
  };

  async function fetchDelai(u, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 7000);
    try {
      return await fetch(u, Object.assign({}, opts, { signal: ctrl.signal }));
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Fabrique le service d'une liste.
   * @param {string} quel  clé dans SPECS
   */
  function service(quel) {
    const spec = SPECS[quel];

    let _liste = null;      // { updatedAt, entrees }
    let _distant = false;   // vient-elle du serveur ?
    let _souci = "";        // ce qu'il y a à dire à l'écran, en clair
    /* On ne constate qu'une fois qu'un serveur ignore la route : après quoi
       on écrit dans le catalogue sans le harceler à chaque geste. */
    let _supporte = null;

    const url = () => {
      try { return MNStore.api(spec.route); } catch (_) { return ""; }
    };
    const surServeur = () => !!url();

    const vide = () => ({ updatedAt: new Date(0).toISOString(), entrees: [] });

    /** Ce que porte le catalogue : point de départ, et repli sans serveur. */
    const duCatalogue = () => ({
      updatedAt: MNStore.catalog().updatedAt,
      entrees: MNStore.clone(MNStore.catalog()[spec.champ] || [])
    });

    async function load(force) {
      if (_liste && !force) return _liste;
      _souci = "";

      if (!surServeur()) {
        _distant = false;
        _liste = duCatalogue();
        return _liste;
      }

      try {
        const r = await fetchDelai(url() + "?t=" + Date.now(), { cache: "no-store" });

        /* 404 : le serveur tourne, mais sa version ignore cette liste. Ce
           n'est pas une panne, c'est un fichier à recopier — on le dit. */
        if (r.status === 404 || r.status === 405) {
          _supporte = false;
          _distant = false;
          _liste = duCatalogue();
          _souci = "Ton serveur est trop ancien pour héberger " + spec.nom +
            " : recopie serveur.js sur le VPS, puis redémarre-le.";
          return _liste;
        }
        if (!r.ok) throw new Error("réponse " + r.status);

        const j = await r.json();
        _supporte = true;
        _distant = true;
        _liste = { updatedAt: j.updatedAt, entrees: Array.isArray(j.entrees) ? j.entrees : [] };

        /* Serveur vide et catalogue rempli : c'est la première visite depuis
           la bascule. On garde ce qu'on a sous la main pour l'afficher, et le
           premier envoi le poussera là-bas. */
        if (!_liste.entrees.length) {
          const c = duCatalogue();
          if (c.entrees.length) _liste = c;
        }
        return _liste;
      } catch (e) {
        _distant = false;
        _liste = duCatalogue();
        _souci = "Le serveur ne répond pas — " + spec.nom +
          " affichée vient du catalogue et peut être incomplète.";
        return _liste;
      }
    }

    const liste = () => (_liste || vide()).entrees;

    /** Écrit dans le catalogue. Il faudra le droit de publier pour partager. */
    function versCatalogue(entrees) {
      const c = MNStore.clone(MNStore.catalog());
      c[spec.champ] = entrees;
      MNStore.saveDraft(c);
      _liste = { updatedAt: new Date().toISOString(), entrees: MNStore.clone(c[spec.champ]) };
      return { ok: true, local: true };
    }

    /**
     * Envoie une opération au serveur ; à défaut, écrit dans le catalogue.
     * @param {object} op  { op: "set"|"remove"|"remplacer", … }
     * @param {Array} aDefaut  la liste complète telle qu'elle devrait être,
     *        pour le repli catalogue — le serveur, lui, applique l'opération.
     * @returns {Promise<{ok:boolean, local?:boolean, error?:string}>}
     */
    async function envoyer(op, aDefaut) {
      if (!surServeur() || _supporte === false) return versCatalogue(aDefaut);

      try {
        /* `depart` n'est lu que si le serveur n'a encore rien : il évite de
           repartir d'une liste vide en basculant depuis le catalogue. */
        const corps = Object.assign({}, op, { depart: duCatalogue().entrees });
        const r = await fetchDelai(url(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corps)
        });

        if (r.status === 404 || r.status === 405) {
          _supporte = false;
          return versCatalogue(aDefaut);
        }

        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { ok: false, error: j.error || "Le serveur a répondu " + r.status };

        _liste = j.liste;
        _distant = true;
        _souci = "";
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.name === "AbortError"
          ? "Le serveur ne répond pas."
          : "Serveur injoignable — rien n'a été enregistré." };
      }
    }

    return {
      load, liste, envoyer, surServeur,
      estDistant: () => _distant,
      souci: () => _souci
    };
  }

  return { emotes: service("emotes"), bannis: service("blacklist") };
})();
