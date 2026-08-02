/* ==========================================================================
   Données du site.

   data/catalog.json contient TOUT ce qui est modifiable depuis l'admin :
     settings (nom, slogan, devise, connexion, dépôt GitHub)
     resources · categories · items · users

   Le panneau admin travaille sur un brouillon local (localStorage), puis le
   bouton « Publier » réécrit data/catalog.json directement sur GitHub.
   ========================================================================== */

window.MNStore = (function () {
  "use strict";

  const K_LOCAL = "mn.catalog.draft";
  const K_CART = "mn.cart";
  const K_BTS = "mn.bts";

  let _published = null;   // version réellement en ligne
  let _catalog = null;     // version affichée (brouillon si présent)
  let _origin = "seed";    // "remote" | "seed"
  let _draft = false;

  const listeners = [];
  const onChange = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => { try { fn(_catalog); } catch (e) { console.error(e); } });

  /* ---- Utilitaires ------------------------------------------------------ */

  const clone = o => JSON.parse(JSON.stringify(o));

  function slugify(s) {
    return String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").slice(0, 48) || "x";
  }

  function uniqueId(base, taken) {
    let id = slugify(base), n = 2;
    while (taken.indexOf(id) !== -1) id = slugify(base) + "-" + n++;
    return id;
  }

  const D = () => window.MN_CONFIG.defaults;

  /** Remet un catalogue d'aplomb : champs manquants, doublons, types. */
  function normalize(raw) {
    const c = (raw && typeof raw === "object") ? clone(raw) : {};
    c.version = Number(c.version) || 1;
    c.updatedAt = c.updatedAt || new Date().toISOString();

    /* --- réglages --- */
    const s = c.settings && typeof c.settings === "object" ? c.settings : {};
    const b = s.brand || {}, a = s.auth || {}, g = s.github || {};
    c.settings = {
      brand: {
        name: String(b.name || D().brand.name),
        tagline: String(b.tagline || D().brand.tagline),
        /* Vide = initiales du nom. Sinon : icône, emoji, chemin ou image importée. */
        logo: String(b.logo || "")
      },
      auth: {
        allowGuests: a.allowGuests === true,
        guestPerms: Array.isArray(a.guestPerms) ? a.guestPerms : D().auth.guestPerms.slice(),
        sessionDays: Math.max(1, Number(a.sessionDays) || D().auth.sessionDays),
        bootstrapFirstUser: a.bootstrapFirstUser !== false
      },
      github: {
        owner: String(g.owner || ""),
        repo: String(g.repo || ""),
        branch: String(g.branch || "main"),
        path: String(g.path || "data/catalog.json")
      }
    };

    /* --- ressources --- */
    const seenR = [];
    c.resources = (Array.isArray(c.resources) ? c.resources : []).map(r => {
      const id = uniqueId(r.id || r.name, seenR); seenR.push(id);
      return { id, name: String(r.name || id), icon: r.icon || "r-metal", color: r.color || "#9fb0c4" };
    });

    /* --- catégories --- */
    const seenC = [];
    c.categories = (Array.isArray(c.categories) ? c.categories : []).map(k => {
      const id = uniqueId(k.id || k.name, seenC); seenC.push(id);
      return { id, name: String(k.name || id), icon: k.icon || "i-box" };
    });
    if (!c.categories.length) c.categories = [{ id: "divers", name: "Divers", icon: "i-box" }];

    /* --- objets --- */
    const resIds = c.resources.map(r => r.id);
    const catIds = c.categories.map(k => k.id);
    const seenI = [];
    c.items = (Array.isArray(c.items) ? c.items : []).map(it => {
      const id = uniqueId(it.id || it.name, seenI); seenI.push(id);
      const cost = {};
      Object.keys(it.cost || {}).forEach(k => {
        const q = Math.max(0, Math.round(Number(it.cost[k]) || 0));
        if (q > 0 && resIds.indexOf(k) !== -1) cost[k] = q;
      });
      return {
        id,
        name: String(it.name || id),
        category: catIds.indexOf(it.category) !== -1 ? it.category : catIds[0],
        icon: it.icon || "i-box",
        enabled: it.enabled !== false,
        note: it.note ? String(it.note) : "",
        cost
      };
    });

    /* --- employés --- */
    const permKeys = (window.MN_PERMS || []).map(p => p.key);
    const seenU = [];
    c.users = (Array.isArray(c.users) ? c.users : []).map(u => {
      const id = uniqueId(u.id || u.pseudo, seenU); seenU.push(id);
      return {
        id,
        pseudo: String(u.pseudo || id),
        role: String(u.role || "Mécano"),
        perms: (Array.isArray(u.perms) ? u.perms : []).filter(p => permKeys.indexOf(p) !== -1),
        pin: typeof u.pin === "string" && u.pin.length === 64 ? u.pin : null,
        active: u.active !== false,
        createdAt: u.createdAt || new Date().toISOString()
      };
    });

    return c;
  }

  /* ---- Chargement ------------------------------------------------------- */

  async function load() {
    let published = null;
    try {
      const url = (window.MN_CONFIG.catalogUrl || "data/catalog.json") + "?v=" + Date.now();
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) { published = normalize(await r.json()); _origin = "remote"; }
    } catch (_) { /* file:// ou fichier absent → on retombe sur la graine */ }

    if (!published) { published = normalize(window.MN_CATALOG_SEED || {}); _origin = "seed"; }
    _published = published;

    let local = null;
    try {
      const raw = localStorage.getItem(K_LOCAL);
      if (raw) local = normalize(JSON.parse(raw));
    } catch (_) { localStorage.removeItem(K_LOCAL); }

    /* Un brouillon plus vieux que la version en ligne = déjà publié ailleurs. */
    if (local && _origin === "remote" && new Date(local.updatedAt) <= new Date(published.updatedAt)) {
      localStorage.removeItem(K_LOCAL);
      local = null;
    }

    _draft = !!local;
    _catalog = local || clone(published);
    emit();
    return _catalog;
  }

  /* ---- Brouillon -------------------------------------------------------- */

  function saveDraft(cat) {
    const c = normalize(cat);
    c.updatedAt = new Date().toISOString();
    localStorage.setItem(K_LOCAL, JSON.stringify(c));
    _catalog = c; _draft = true;
    emit();
    return c;
  }

  function discardDraft() {
    localStorage.removeItem(K_LOCAL);
    _catalog = clone(_published); _draft = false;
    emit();
    return _catalog;
  }

  const toJSON = cat => JSON.stringify(normalize(cat || _catalog), null, 2) + "\n";

  function download(cat, filename) {
    const blob = new Blob([toJSON(cat)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "catalog.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---- Lecture ---------------------------------------------------------- */

  const catalog = () => _catalog;
  const published = () => _published;
  const hasDraft = () => _draft;
  const origin = () => _origin;
  const settings = () => (_catalog ? _catalog.settings : normalize({}).settings);
  const brand = () => settings().brand;

  const itemById = id => (_catalog.items || []).find(i => i.id === id) || null;
  const resourceById = id => (_catalog.resources || []).find(r => r.id === id) || null;
  const categoryById = id => (_catalog.categories || []).find(c => c.id === id) || null;

  /** Récapitulatif d'un panier { itemId: quantité }. */
  function totals(cart, cat) {
    const c = cat || _catalog;
    const lines = [], byRes = {};
    let count = 0;

    (c.items || []).forEach(it => {
      const q = Math.max(0, Math.round(Number(cart[it.id]) || 0));
      if (!q) return;
      count += q;
      lines.push({ item: it, qty: q, cost: it.cost });
      Object.keys(it.cost || {}).forEach(rid => { byRes[rid] = (byRes[rid] || 0) + it.cost[rid] * q; });
    });

    const resources = (c.resources || [])
      .filter(r => byRes[r.id] > 0)
      .map(r => ({ resource: r, qty: byRes[r.id] }));

    return { lines, resources, count };
  }

  /* ---- Panier ----------------------------------------------------------- */

  function getCart() {
    try { return JSON.parse(localStorage.getItem(K_CART) || "{}") || {}; } catch (_) { return {}; }
  }
  function setCart(cart) {
    const clean = {};
    Object.keys(cart).forEach(k => { if (cart[k] > 0) clean[k] = cart[k]; });
    localStorage.setItem(K_CART, JSON.stringify(clean));
    return clean;
  }

  /* ---- Bons de travail --------------------------------------------------- */

  function getBTs() {
    try { return JSON.parse(localStorage.getItem(K_BTS) || "[]") || []; } catch (_) { return []; }
  }
  function addBT(bt) {
    const all = getBTs(); all.unshift(bt);
    localStorage.setItem(K_BTS, JSON.stringify(all.slice(0, 200)));
    return bt;
  }
  function removeBT(ref) {
    localStorage.setItem(K_BTS, JSON.stringify(getBTs().filter(b => b.ref !== ref)));
  }
  const clearBTs = () => localStorage.removeItem(K_BTS);

  return {
    load, normalize, slugify, uniqueId, clone, onChange,
    saveDraft, discardDraft, toJSON, download,
    catalog, published, hasDraft, origin, settings, brand,
    itemById, resourceById, categoryById, totals,
    getCart, setCart, getBTs, addBT, removeBT, clearBTs
  };
})();
