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

  /* ---- Caractéristiques de véhicule ------------------------------------------
     Elles connaissent trois états, pas deux : pas encore renseignée, sans
     objet, ou chiffrée. Un bateau n'a pas de coffre et un vélo pas de
     réservoir — sans « N/A » leur fiche resterait éternellement marquée à
     compléter, et l'étoile ne voudrait plus rien dire.

     D'où du texte plutôt qu'un nombre : « » = à remplir, « N/A » = sans
     objet, sinon la valeur. On accepte les formes qu'on écrit vraiment — n/a,
     N.A., s.o., « — » — pour n'en garder qu'une. */

  const NA = "N/A";
  const SANS_OBJET = /^(n\s*[./]?\s*a\.?|s\s*[./]?\s*o\.?|néant|neant|aucun|—|-{1,2})$/i;

  const stat = (val, max) => {
    const s = String(val == null ? "" : val).trim();
    if (!s) return "";
    if (SANS_OBJET.test(s)) return NA;
    const n = Math.round(Number(s.replace(",", ".")));
    return isFinite(n) && n > 0 ? String(Math.min(max, n)) : "";
  };

  /* Le coffre reste du texte libre : certains sont notés « 1,2 t ». */
  const libre = (val, max) => {
    const s = String(val == null ? "" : val).trim().slice(0, max);
    return SANS_OBJET.test(s) ? NA : s;
  };

  /* Liste fermée : on saisit au clic, mais une valeur peut arriver d'ailleurs
     — d'un ancien enregistrement, d'un import — alors on la rapproche. Une
     seule table, d'où sortent aussi bien le menu déroulant que le filtre :
     ajouter un carburant se fait ici et nulle part ailleurs. */
  const CARBURANTS = ["Essence", "Diesel", "Kérosène"];
  const ALIAS = [
    { nom: "Diesel", re: /^(diesel|gazole|gasoil|go\b)/ },
    { nom: "Essence", re: /^(essence|sp\s?9[58]|super|petrol)/ },
    { nom: "Kérosène", re: /^(k[ée]ros|jet\s?a|avgas|aviation)/ }
  ];

  const carbu = c => {
    const s = String(c || "").trim().toLowerCase();
    if (!s) return "";
    if (SANS_OBJET.test(s)) return NA;
    const t = ALIAS.find(a => a.re.test(s));
    return t ? t.nom : "";
  };

  /** Nettoie les caractéristiques d'un véhicule, sans toucher au reste. */
  const statsVehicule = v => Object.assign({}, v, {
    carburant: carbu(v.carburant),
    places: stat(v.places, 99),
    coffre: libre(v.coffre, 40),
    litres: stat(v.litres, 9999)
  });

  let _published = null;   // version réellement en ligne
  let _catalog = null;     // version affichée (brouillon si présent)
  let _origin = "seed";    // "remote" | "seed"
  let _draft = false;

  const listeners = [];
  const onChange = fn => listeners.push(fn);
  const emit = () => {
    /* Le thème du site vit dans le catalogue : dès qu'il change, la page doit
       suivre, sans attendre un rechargement. */
    try { if (window.MNTheme) MNTheme.refresh(); } catch (e) { console.error(e); }
    listeners.forEach(fn => { try { fn(_catalog); } catch (e) { console.error(e); } });
  };

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
    const b = s.brand || {}, a = s.auth || {}, g = s.github || {}, w = s.webhook || {};
    c.settings = {
      webhook: {
        /* Adresses brouillées au repos — voir assets/js/webhook.js */
        bt: String(w.bt || ""),
        duty: String(w.duty || ""),
        /* Vide = les congés partent dans le salon des services. */
        conges: String(w.conges || ""),
        mention: String(w.mention || ""),
        /* Identité du bot Discord : vide = nom et logo de l'atelier */
        name: String(w.name || ""),
        avatar: String(w.avatar || ""),
        /* Ancien emplacement du relais, repris ci-dessous */
        proxy: ""
      },
      /* Apparence commune à toute l'équipe. Chacun peut la remplacer pour
         lui-même depuis la barre du haut ; ceci n'est que le point de départ. */
      theme: (function (t) {
        try { return window.MNTheme ? MNTheme.normalize(t || "neon") : null; }
        catch (_) { return null; }
      })(s.theme),
      /* Chacun peut-il se composer ses propres couleurs ? Vrai par défaut :
         c'est un confort personnel qui n'affecte personne d'autre. */
      themeLibre: s.themeLibre !== false,
      /* Adresse de ton serveur (VPS). Une seule à renseigner : le site en
         déduit /duty.json, /relais, /publier et /sante. Avec elle, personne
         n'a besoin de jeton — ni pour pointer, ni pour publier. */
      serveur: String(s.serveur || "").replace(/\/+$/, ""),
      /* Réglages détaillés, si tu veux viser des adresses différentes. */
      relay: String(s.relay || w.proxy || ""),
      dutyUrl: String(s.dutyUrl || ""),
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
      /* `parent` vide = catégorie principale ; sinon l'id de celle qui la
         contient. Les objets, eux, pointent indifféremment sur l'une ou
         l'autre : une sous-catégorie est une catégorie comme les autres. */
      return { id, name: String(k.name || id), icon: k.icon || "i-box", parent: String(k.parent || "") };
    });
    if (!c.categories.length) c.categories = [{ id: "divers", name: "Divers", icon: "i-box", parent: "" }];

    /* Un seul niveau d'imbrication : une sous-catégorie ne peut pas en
       contenir. Tout parent qui n'est pas lui-même principal est ignoré, ce
       qui règle du même coup les cycles et les parents disparus. */
    const principales = c.categories.filter(k => !k.parent).map(k => k.id);
    c.categories.forEach(k => {
      if (principales.indexOf(k.parent) === -1) k.parent = "";
    });

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
        /* Quantité maximale par bon de travail. 0 = illimité. */
        max: Math.max(0, Math.min(999, Math.round(Number(it.max) || 0))),
        /* Taille du lot : « Pièces détachées » avec pack = 10 s'annonce
           « 10 Pièces détachées », et « 20 » quand on en prend deux. Le coût
           en ressources, lui, reste celui d'un lot. 0 ou 1 = pas de lot. */
        pack: Math.max(0, Math.min(9999, Math.round(Number(it.pack) || 0))),
        /* Temps de fabrication, en minutes. Facultatif : 0 = non renseigné,
           et l'objet n'ajoute alors rien au total du bon de travail. */
        temps: Math.max(0, Math.min(9999, Math.round(Number(it.temps) || 0))),
        /* Objets incompatibles : en choisir un bloque les autres. */
        excludes: (Array.isArray(it.excludes) ? it.excludes : [])
          .map(String).filter(x => x && x !== id),
        cost
      };
    });

    /* On ne garde que les incompatibilités qui pointent vers un objet réel. */
    const itemIds = c.items.map(i => i.id);
    c.items.forEach(i => {
      i.excludes = i.excludes.filter((x, n) => itemIds.indexOf(x) !== -1 && i.excludes.indexOf(x) === n);
    });

    /* --- véhicules ---
       Ils ont leurs propres catégories : un « moto » ou un « 4x4 » ne se range
       pas dans les mêmes cases qu'une pièce détachée. */
    const seenVC = [];
    c.vehicleCats = (Array.isArray(c.vehicleCats) ? c.vehicleCats : []).map(k => {
      const id = uniqueId(k.id || k.name, seenVC); seenVC.push(id);
      return { id, name: String(k.name || id), icon: k.icon || "i-wheels-car" };
    });
    if (!c.vehicleCats.length) {
      c.vehicleCats = [{ id: "voitures", name: "Voitures", icon: "i-wheels-car" }];
    }

    const vcIds = c.vehicleCats.map(k => k.id);
    const seenV = [];

    c.vehicles = (Array.isArray(c.vehicles) ? c.vehicles : []).map(v => {
      const id = uniqueId(v.id || v.name, seenV); seenV.push(id);
      return {
        id,
        name: String(v.name || id),
        category: vcIds.indexOf(v.category) !== -1 ? v.category : vcIds[0],
        /* Image du véhicule : même écriture que les icônes (dépôt, serveur…). */
        image: String(v.image || ""),
        /* Une proposition n'entre dans le parc qu'une fois validée. Tout ce
           qui existait avant ce mécanisme est considéré comme validé, sans
           quoi le parc disparaîtrait d'un coup. */
        status: v.status === "attente" ? "attente" : "valide",
        proposePar: String(v.proposePar || ""),
        proposeLe: v.proposeLe || null,
        /* Liste fermée : deux carburants, saisis au clic, plus « sans objet ».
           Une valeur venue d'ailleurs est rapprochée de l'une, sinon vidée. */
        carburant: carbu(v.carburant),
        places: stat(v.places, 99),
        coffre: libre(v.coffre, 40),
        /* Contenance du réservoir. `type` était un texte libre (moto, berline) ;
           il a laissé la place à cette valeur, plus utile à l'atelier. */
        litres: stat(v.litres, 9999),
        note: String(v.note || "").slice(0, 300),
        /* Modification proposée par quelqu'un qui n'a pas le droit d'écrire
           dans le parc. Elle attend à côté du véhicule sans le changer : la
           fiche affichée reste celle qui a été validée. */
        propose: (function (p) {
          if (!p || typeof p !== "object" || !p.champs) return null;
          const ch = p.champs;
          return {
            par: String(p.par || ""),
            le: p.le || null,
            champs: {
              name: String(ch.name || ""),
              category: String(ch.category || ""),
              image: String(ch.image || ""),
              carburant: carbu(ch.carburant),
              places: stat(ch.places, 99),
              coffre: libre(ch.coffre, 40),
              litres: stat(ch.litres, 9999),
              note: String(ch.note || "").slice(0, 300)
            }
          };
        })(v.propose)
      };
    });

    /* --- rôles ---
       Les droits sont portés par le rôle, plus par l'employé. Les anciens
       comptes (texte libre + permissions individuelles) sont convertis
       automatiquement : un rôle est créé par intitulé distinct. */
    const permKeys = (window.MN_PERMS || []).map(p => p.key);
    const cleanPerms = p => (Array.isArray(p) ? p : []).filter(x => permKeys.indexOf(x) !== -1);

    const seenRo = [];
    c.roles = (Array.isArray(c.roles) ? c.roles : []).map((r, i) => {
      const id = uniqueId(r.id || r.name, seenRo); seenRo.push(id);
      return {
        id,
        name: String(r.name || id),
        color: String(r.color || (window.MN_ROLE_COLORS || ["#ff2bd1"])[i % 10]),
        icon: r.icon || "i-badge",
        perms: cleanPerms(r.perms)
      };
    });

    const rawUsers = Array.isArray(c.users) ? c.users : [];

    /* Reprise des anciens comptes : on fabrique les rôles manquants. */
    rawUsers.forEach(u => {
      if (u.roleId && c.roles.some(r => r.id === u.roleId)) return;
      const label = String(u.role || "Mécano");
      const wanted = slugify(label);
      let role = c.roles.find(r => r.id === wanted || r.name === label);
      if (!role) {
        role = {
          id: uniqueId(label, seenRo),
          name: label,
          color: (window.MN_ROLE_COLORS || ["#ff2bd1"])[c.roles.length % 10],
          icon: "i-badge",
          perms: cleanPerms(u.perms)
        };
        seenRo.push(role.id);
        c.roles.push(role);
      }
      u.roleId = role.id;
    });

    if (!c.roles.length) {
      c.roles = [{ id: "mecano", name: "Mécano", color: "#ff2bd1", perms: ["bt", "duty"] }];
    }

    /* --- employés --- */
    const roleIds = c.roles.map(r => r.id);
    const seenU = [];
    c.users = rawUsers.map(u => {
      const id = uniqueId(u.id || u.pseudo, seenU); seenU.push(id);
      const roleId = roleIds.indexOf(u.roleId) !== -1 ? u.roleId : roleIds[0];
      const createdAt = u.createdAt || new Date().toISOString();

      /* Historique des grades : on garde le nom du rôle au moment de la
         promotion, pour que la trace reste lisible même si le rôle est
         renommé ou supprimé plus tard. */
      let history = (Array.isArray(u.history) ? u.history : []).map(h => ({
        roleId: String(h.roleId || ""),
        roleName: String(h.roleName || ""),
        at: h.at || createdAt,
        by: h.by ? String(h.by) : "",
        note: h.note ? String(h.note) : ""
      })).filter(h => h.roleName || h.roleId);

      if (!history.length) {
        const r = c.roles.find(x => x.id === roleId);
        history = [{ roleId, roleName: r ? r.name : roleId, at: createdAt, by: "", note: "Entrée dans l'entreprise" }];
      }
      history.sort((a, b) => new Date(a.at) - new Date(b.at));

      return {
        id,
        pseudo: String(u.pseudo || id),
        roleId,
        pin: typeof u.pin === "string" && u.pin.length === 64 ? u.pin : null,
        active: u.active !== false,
        /* Masqué du trombinoscope Équipe, mais compte pleinement fonctionnel :
           la personne se connecte et travaille normalement. */
        hidden: u.hidden === true,
        createdAt,
        /* Date d'embauche (AAAA-MM-JJ), séparée de la création du compte. */
        hiredAt: /^\d{4}-\d{2}-\d{2}$/.test(u.hiredAt) ? u.hiredAt : createdAt.slice(0, 10),
        trainings: (Array.isArray(u.trainings) ? u.trainings : [])
          .map(t => String(t).trim()).filter(Boolean).slice(0, 30),
        note: u.note ? String(u.note).slice(0, 400) : "",
        history: history.slice(-40)
      };
    });

    return c;
  }

  /**
   * Ajoute une ligne d'historique quand quelqu'un change de grade.
   * `at` permet de dater la promotion au jour où elle a réellement eu lieu.
   */
  function recordPromotion(user, newRoleId, roles, byPseudo, note, at) {
    const r = (roles || []).find(x => x.id === newRoleId);
    user.roleId = newRoleId;
    user.history = (user.history || []).concat([{
      roleId: newRoleId,
      roleName: r ? r.name : newRoleId,
      at: at || new Date().toISOString(),
      by: byPseudo || "",
      note: note || ""
    }]);
    /* On garde l'ordre chronologique même si la date saisie est antérieure. */
    user.history.sort((a, b) => new Date(a.at) - new Date(b.at));
    user.history = user.history.slice(-40);
    return user;
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

  /** Adresse d'un service du serveur, ou "" s'il n'est pas configuré. */
  function api(quoi) {
    const s = settings();
    if (s.serveur) return s.serveur + "/" + quoi;
    if (quoi === "duty.json" && s.dutyUrl) return s.dutyUrl;
    if (quoi === "relais" && s.relay) return s.relay;
    return "";
  }

  /* ---- Images hébergées par le serveur -----------------------------------------
     Une image du dépôt s'écrit « assets/img/turbo.png », une image du serveur
     « srv:turbo.png ». Le préfixe évite toute ambiguïté : les deux peuvent
     coexister, et rien ne casse si le serveur disparaît — seules les images
     qui en dépendent manquent, visiblement. */

  const IMG_TAG = "srv:";

  /** « srv:turbo.png » → nom de fichier, sinon "". */
  const imageName = v => {
    const s = String(v || "");
    return s.indexOf(IMG_TAG) === 0 ? s.slice(IMG_TAG.length) : "";
  };

  /** Adresse à laquelle le navigateur ira chercher l'image. */
  function imageUrl(nom) {
    const base = api("images");
    return base ? base + "/" + encodeURIComponent(nom) : "";
  }

  /** Le serveur peut-il héberger les images ? */
  const imagesHebergees = () => !!api("images");

  const roleById = id => (_catalog.roles || []).find(r => r.id === id) || null;
  const roleOf = user => (user && roleById(user.roleId)) ||
    { id: "", name: "Sans rôle", color: "#6a6280", perms: [] };
  const itemById = id => (_catalog.items || []).find(i => i.id === id) || null;
  const resourceById = id => (_catalog.resources || []).find(r => r.id === id) || null;
  const categoryById = id => (_catalog.categories || []).find(c => c.id === id) || null;
  const vehicleById = id => (_catalog.vehicles || []).find(v => v.id === id) || null;
  const vehicleCatById = id => (_catalog.vehicleCats || []).find(c => c.id === id) || null;

  /** Les catégories principales, dans l'ordre d'affichage. */
  const topCategories = cat => ((cat || _catalog).categories || []).filter(c => !c.parent);

  /** Les sous-catégories d'une catégorie, dans l'ordre d'affichage. */
  const subCategories = (id, cat) =>
    ((cat || _catalog).categories || []).filter(c => c.parent === id);

  /**
   * La catégorie et ses sous-catégories : ce qu'un onglet principal recouvre.
   * @returns {string[]} identifiants
   */
  const categoryScope = (id, cat) =>
    [id].concat(subCategories(id, cat).map(c => c.id));

  /**
   * Nom d'un objet pour une quantité donnée.
   * Sans lot, c'est son nom. Avec un lot de 10 : « 10 Pièces détachées » à
   * l'unité, « 20 » pour deux. Une quantité nulle affiche le lot simple —
   * c'est ce qu'on obtiendra en en prenant un.
   */
  function itemLabel(it, qty) {
    if (!it) return "";
    if (!(it.pack > 1)) return it.name;
    return (it.pack * Math.max(1, Math.round(Number(qty) || 0))) + " " + it.name;
  }

  /** Récapitulatif d'un panier { itemId: quantité }. */
  function totals(cart, cat) {
    const c = cat || _catalog;
    const lines = [], byRes = {};
    let count = 0, minutes = 0;

    (c.items || []).forEach(it => {
      const q = Math.max(0, Math.round(Number(cart[it.id]) || 0));
      if (!q) return;
      count += q;
      /* Le temps de fabrication se cumule comme les ressources : deux
         pare-chocs, c'est deux fois la fabrication. Un objet sans temps
         renseigné n'ajoute rien. */
      minutes += (it.temps || 0) * q;
      lines.push({ item: it, qty: q, cost: it.cost });
      Object.keys(it.cost || {}).forEach(rid => { byRes[rid] = (byRes[rid] || 0) + it.cost[rid] * q; });
    });

    const resources = (c.resources || [])
      .filter(r => byRes[r.id] > 0)
      .map(r => ({ resource: r, qty: byRes[r.id] }));

    return { lines, resources, count, minutes };
  }

  /**
   * Une durée en minutes, écrite comme on la dit : « 45 min », « 1 h »,
   * « 2 h 30 ». Zéro renvoie une chaîne vide — rien à afficher.
   */
  function duree(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (!m) return "";
    const h = Math.floor(m / 60), r = m % 60;
    if (!h) return m + " min";
    return h + " h" + (r ? " " + String(r).padStart(2, "0") : "");
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
    load, normalize, slugify, uniqueId, clone, onChange, recordPromotion,
    saveDraft, discardDraft, toJSON, download,
    catalog, published, hasDraft, origin, settings, brand, api,
    roleById, roleOf, itemById, resourceById, categoryById,
    topCategories, subCategories, categoryScope, itemLabel, totals, duree,
    vehicleById, vehicleCatById,
    IMG_TAG, imageName, imageUrl, imagesHebergees,
    NA, CARBURANTS, statsVehicule,
    estNA: v => String(v || "").trim().toUpperCase() === NA,
    getCart, setCart, getBTs, addBT, removeBT, clearBTs
  };
})();
