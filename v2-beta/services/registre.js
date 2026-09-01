/* ==========================================================================
   Le registre des contrats.

   Il vit sur le serveur de l'atelier, pas dans le catalogue GitHub, et pour
   la même raison que le parc automobile : les droits sur les contrats n'ont
   rien à voir avec le droit de publier le site. Quelqu'un qui gère les
   contrats doit pouvoir en écrire un sans jeton, et l'équipe le voir aussitôt.

   Sans serveur configuré, on retombe sur le catalogue : les contrats
   fonctionnent alors, à la seule condition d'être publiés.
   ========================================================================== */

window.MNRegistre = (function () {
  "use strict";

  let _reg = null;
  let _souci = "";
  let _distant = false;      // les données viennent-elles du serveur ?
  /* Un serveur antérieur aux contrats ne connaît pas /contrats. On le
     constate une fois, puis on écrit dans le catalogue plutôt que de perdre
     chaque enregistrement — même repli que pour le parc et les images. */
  let _supporte = null;

  const vide = () => ({ updatedAt: new Date(0).toISOString(), contrats: [] });

  const url = () => {
    try { return MNStore.api("contrats"); } catch (_) { return ""; }
  };

  const surServeur = () => !!url();

  async function fetchDelai(u, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 7000);
    try {
      return await fetch(u, Object.assign({}, opts, { signal: ctrl.signal }));
    } finally {
      clearTimeout(t);
    }
  }

  /** Ce que porte le catalogue : point de départ, et repli sans serveur. */
  function duCatalogue() {
    const c = MNStore.catalog();
    return {
      updatedAt: c.updatedAt,
      contrats: MNStore.clone(c.contracts || [])
    };
  }

  async function load(force) {
    if (_reg && !force) return _reg;
    _souci = "";

    if (!surServeur()) {
      _distant = false;
      _reg = duCatalogue();
      return _reg;
    }

    try {
      const r = await fetchDelai(url() + "?t=" + Date.now(), { cache: "no-store" });

      /* 404 : le serveur tourne, mais sa version ignore les contrats. Ce n'est
         pas une panne, c'est un fichier à recopier — on le dit comme tel. */
      if (r.status === 404 || r.status === 405) {
        _supporte = false;
        _distant = false;
        _souci = "Ton serveur est trop ancien pour héberger les contrats : recopie " +
          "serveur.js sur le VPS, puis redémarre-le.";
        _reg = duCatalogue();
        return _reg;
      }

      if (r.ok) {
        const j = await r.json();
        _supporte = true;
        _distant = true;
        /* Serveur encore vide : on affiche ce que porte le catalogue, il
           servira de point de départ à la première écriture. */
        _reg = (j && (j.contrats || []).length)
          ? { updatedAt: j.updatedAt, contrats: j.contrats || [] }
          : duCatalogue();
        return _reg;
      }
      _souci = "Le serveur a répondu " + r.status + ".";
    } catch (e) {
      _souci = e.name === "AbortError"
        ? "Le serveur ne répond pas (délai dépassé)."
        : "Serveur injoignable.";
    }

    _distant = false;
    _reg = duCatalogue();
    return _reg;
  }

  const registre = () => _reg || vide();

  /* Tous les contrats des deux garages : ce qu'on écrit. */
  const tous = () => registre().contrats;

  /* Ce qu'on lit : le seul garage où l'on travaille. Le Nord n'a pas à voir
     les contrats du Sud, et inversement. */
  const contrats = () =>
    tous().filter(c => MNStore.estDeAtelier({ ateliers: [c.atelier] }, MNAuth.atelier()));

  /* Par identifiant, sans filtre : une opération porte sur le registre entier,
     et un contrat qu'on vient de déplacer doit rester retrouvable. */
  const contratById = id => tous().find(c => c.id === id) || null;

  /** Écrit le registre dans le catalogue. Il faudra publier pour le partager. */
  function versCatalogue() {
    const c = MNStore.clone(MNStore.catalog());
    c.contracts = MNStore.clone(registre().contrats);
    MNStore.saveDraft(c);
    return { ok: true, local: true };
  }

  async function envoyer(op) {
    if (!surServeur() || _supporte === false) return versCatalogue();

    try {
      const corps = Object.assign({ depart: duCatalogue() }, op);
      const r = await fetchDelai(url(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps)
      });
      if (r.status === 404 || r.status === 405) {
        _supporte = false;
        _distant = false;
        return versCatalogue();
      }

      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j.error || "Le serveur a répondu " + r.status };
      if (j.registre) { _reg = j.registre; _distant = true; }
      return { ok: true, deja: !!j.deja };
    } catch (e) {
      return { ok: false, error: e.name === "AbortError"
        ? "Le serveur ne répond pas." : "Serveur injoignable." };
    }
  }

  /* ---- Opérations ---------------------------------------------------------
     Chacune modifie d'abord la copie locale — l'écran répond tout de suite —
     puis part au serveur. En cas d'échec le message le dit ; on ne revient pas
     en arrière, l'opération suivante repartira du registre rechargé. */

  async function setContrat(k) {
    const propre = MNStore.normContrat(k);
    const r = registre();
    const i = r.contrats.findIndex(x => x.id === propre.id);
    if (i === -1) r.contrats.unshift(propre); else r.contrats[i] = propre;
    r.updatedAt = new Date().toISOString();
    return envoyer({ op: "set", contrat: propre });
  }

  async function removeContrat(id) {
    const r = registre();
    r.contrats = r.contrats.filter(x => x.id !== id);
    r.updatedAt = new Date().toISOString();
    return envoyer({ op: "remove", id });
  }

  return {
    load, registre, contrats, tous, contratById,
    setContrat, removeContrat,
    surServeur, estDistant: () => _distant,
    souci: () => _souci
  };
})();
