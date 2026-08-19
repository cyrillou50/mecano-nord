/* ==========================================================================
   L'agenda de l'atelier.

   Il vit sur le serveur, pour la même raison que le parc et les contrats :
   n'importe qui doit pouvoir poser un rendez-vous sans avoir le droit de
   publier le site, et l'équipe doit le voir aussitôt.

   Sans serveur configuré, on retombe sur le catalogue : l'agenda fonctionne
   alors, à la seule condition d'être publié.
   ========================================================================== */

window.MNAgenda = (function () {
  "use strict";

  let _ag = null;
  let _souci = "";
  let _distant = false;
  let _supporte = null;      // null = pas encore su

  const TEINTES = ["rose", "ambre", "vert", "bleu", "gris"];

  const vide = () => ({ updatedAt: new Date(0).toISOString(), events: [] });

  const url = () => {
    try { return MNStore.api("calendrier"); } catch (_) { return ""; }
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

  /** Nettoyage local, aux mêmes règles que le serveur. */
  function normEvent(e) {
    const t = e && typeof e === "object" ? e : {};
    const debut = MNStore.jour(t.jour);
    if (!debut) return null;

    let fin = MNStore.jour(t.fin);
    if (fin && fin < debut) fin = debut;

    const h = String(t.heure || "").slice(0, 5);
    return {
      id: String(t.id || ""),
      jour: debut,
      fin: fin && fin !== debut ? fin : null,
      heure: /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : "",
      titre: String(t.titre || "").slice(0, 120),
      note: String(t.note || "").slice(0, 1000),
      teinte: TEINTES.indexOf(t.teinte) !== -1 ? t.teinte : "rose",
      creePar: String(t.creePar || "").slice(0, 60),
      creeLe: t.creeLe || null,
      majPar: String(t.majPar || "").slice(0, 60),
      majLe: t.majLe || null
    };
  }

  function duCatalogue() {
    const c = MNStore.catalog();
    return {
      updatedAt: c.updatedAt,
      events: (c.events || []).map(normEvent).filter(Boolean)
    };
  }

  async function load(force) {
    if (_ag && !force) return _ag;
    _souci = "";

    if (!surServeur()) {
      _distant = false;
      _ag = duCatalogue();
      return _ag;
    }

    try {
      const r = await fetchDelai(url() + "?t=" + Date.now(), { cache: "no-store" });

      /* 404 : le serveur tourne, mais sa version ignore l'agenda. Ce n'est pas
         une panne, c'est un fichier à recopier — on le dit comme tel. */
      if (r.status === 404 || r.status === 405) {
        _supporte = false;
        _distant = false;
        _souci = "Ton serveur est trop ancien pour héberger l'agenda : recopie " +
          "serveur.js sur le VPS, puis redémarre-le.";
        _ag = duCatalogue();
        return _ag;
      }

      if (r.ok) {
        const j = await r.json();
        _supporte = true;
        _distant = true;
        _ag = (j && (j.events || []).length)
          ? { updatedAt: j.updatedAt, events: (j.events || []).map(normEvent).filter(Boolean) }
          : duCatalogue();
        return _ag;
      }
      _souci = "Le serveur a répondu " + r.status + ".";
    } catch (e) {
      _souci = e.name === "AbortError"
        ? "Le serveur ne répond pas (délai dépassé)."
        : "Serveur injoignable.";
    }

    _distant = false;
    _ag = duCatalogue();
    return _ag;
  }

  const agenda = () => _ag || vide();
  const events = () => agenda().events;
  const eventById = id => events().find(e => e.id === id) || null;

  /** Les évènements qui touchent un jour donné, périodes comprises. */
  const duJour = j => events().filter(e =>
    e.jour === j || (e.fin && e.jour <= j && j <= e.fin));

  function versCatalogue() {
    const c = MNStore.clone(MNStore.catalog());
    c.events = MNStore.clone(events());
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
      if (j.agenda) {
        _ag = { updatedAt: j.agenda.updatedAt, events: (j.agenda.events || []).map(normEvent).filter(Boolean) };
        _distant = true;
      }
      return { ok: true, deja: !!j.deja };
    } catch (e) {
      return { ok: false, error: e.name === "AbortError"
        ? "Le serveur ne répond pas." : "Serveur injoignable." };
    }
  }

  async function setEvent(e) {
    const propre = normEvent(e);
    if (!propre) return { ok: false, error: "Il manque la date." };
    const a = agenda();
    const i = a.events.findIndex(x => x.id === propre.id);
    if (i === -1) a.events.push(propre); else a.events[i] = propre;
    a.updatedAt = new Date().toISOString();
    return envoyer({ op: "set", event: propre });
  }

  async function removeEvent(id) {
    const a = agenda();
    a.events = a.events.filter(x => x.id !== id);
    a.updatedAt = new Date().toISOString();
    return envoyer({ op: "remove", id });
  }

  return {
    load, agenda, events, eventById, duJour, normEvent,
    setEvent, removeEvent, TEINTES,
    surServeur, estDistant: () => _distant,
    souci: () => _souci
  };
})();
