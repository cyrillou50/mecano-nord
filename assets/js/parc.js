/* ==========================================================================
   Le parc automobile.

   Il vit sur le serveur de l'atelier, pas dans le catalogue GitHub. La raison
   est simple : n'importe qui peut proposer un véhicule, mais presque personne
   n'a le droit de publier. Une proposition écrite dans le catalogue resterait
   dans le navigateur de son auteur — invisible pour tous les autres, y compris
   ceux censés la valider.

   Sans serveur configuré, on retombe sur le catalogue : le parc fonctionne
   alors comme avant, à la seule condition d'être publié.
   ========================================================================== */

window.MNParc = (function () {
  "use strict";

  let _parc = null;
  let _souci = "";
  let _distant = false;      // les données viennent-elles du serveur ?

  const vide = () => ({ updatedAt: new Date(0).toISOString(), cats: [], vehicles: [] });

  const url = () => {
    try { return MNStore.api("vehicules"); } catch (_) { return ""; }
  };

  /** Le parc est-il partagé, ou seulement local à ce navigateur ? */
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

  /** Ce que contient le catalogue : point de départ, et repli sans serveur. */
  function duCatalogue() {
    const c = MNStore.catalog();
    return {
      updatedAt: c.updatedAt,
      cats: MNStore.clone(c.vehicleCats || []),
      vehicles: MNStore.clone(c.vehicles || [])
    };
  }

  async function load(force) {
    if (_parc && !force) return _parc;
    _souci = "";

    if (!surServeur()) {
      _distant = false;
      _parc = duCatalogue();
      return _parc;
    }

    try {
      const r = await fetchDelai(url() + "?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        _distant = true;
        /* Serveur encore vide : on affiche ce que porte le catalogue, il
           servira de point de départ au premier enregistrement. */
        _parc = (j && (j.vehicles || []).length) || (j && (j.cats || []).length)
          ? { updatedAt: j.updatedAt, cats: j.cats || [], vehicles: j.vehicles || [] }
          : duCatalogue();
        return _parc;
      }
      _souci = "Le serveur a répondu " + r.status + ".";
    } catch (e) {
      _souci = e.name === "AbortError"
        ? "Le serveur ne répond pas (délai dépassé)."
        : "Serveur injoignable.";
    }

    /* Panne : mieux vaut le parc du catalogue que rien du tout, en le disant. */
    _distant = false;
    _parc = duCatalogue();
    return _parc;
  }

  const parc = () => _parc || vide();

  /**
   * Envoie une opération au serveur.
   * Sans serveur, applique la même chose au catalogue et laisse la
   * publication faire le reste.
   */
  async function envoyer(op) {
    if (!surServeur()) {
      /* Pas de serveur : le parc retombe dans le catalogue, comme avant. Il
         faudra donc publier pour que les autres le voient — c'est justement
         ce que le serveur évite. */
      const c = MNStore.clone(MNStore.catalog());
      c.vehicleCats = MNStore.clone(parc().cats);
      c.vehicles = MNStore.clone(parc().vehicles);
      MNStore.saveDraft(c);
      return { ok: true, local: true };
    }

    try {
      /* `depart` n'est lu que si le serveur n'a encore rien : il évite de
         repartir d'un parc vide quand on bascule depuis le catalogue. */
      const corps = Object.assign({ depart: duCatalogue() }, op);
      const r = await fetchDelai(url(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j.error || "Le serveur a répondu " + r.status };
      if (j.parc) { _parc = j.parc; _distant = true; }
      return { ok: true, deja: !!j.deja };
    } catch (e) {
      return { ok: false, error: e.name === "AbortError"
        ? "Le serveur ne répond pas." : "Serveur injoignable." };
    }
  }

  /* ---- Opérations ------------------------------------------------------------
     Chacune modifie d'abord la copie locale — l'écran répond tout de suite —
     puis part au serveur. En cas d'échec, le message le dit ; on ne revient pas
     en arrière, l'opération suivante repartira du parc rechargé. */

  function poserLocal(v) {
    const p = parc();
    const i = p.vehicles.findIndex(x => x.id === v.id);
    if (i === -1) p.vehicles.push(v); else p.vehicles[i] = v;
    p.updatedAt = new Date().toISOString();
  }

  async function setVehicle(v) {
    poserLocal(MNStore.clone(v));
    return envoyer({ op: "set", vehicle: v });
  }

  async function removeVehicle(id) {
    const p = parc();
    p.vehicles = p.vehicles.filter(x => x.id !== id);
    p.updatedAt = new Date().toISOString();
    return envoyer({ op: "remove", id });
  }

  async function setStatus(id, status) {
    const v = parc().vehicles.find(x => x.id === id);
    if (v) v.status = status;
    return envoyer({ op: "status", id, status });
  }

  async function setCats(cats) {
    const p = parc();
    p.cats = MNStore.clone(cats);
    const ids = p.cats.map(c => c.id);
    p.vehicles.forEach(v => { if (ids.indexOf(v.category) === -1) v.category = ids[0]; });
    p.updatedAt = new Date().toISOString();
    return envoyer({ op: "cats", cats });
  }

  return {
    load, parc, surServeur,
    estDistant: () => _distant,
    souci: () => _souci,
    setVehicle, removeVehicle, setStatus, setCats
  };
})();
