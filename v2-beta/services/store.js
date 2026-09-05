/* ==========================================================================
   Données du site.

   data/catalog.json contient TOUT ce qui est modifiable depuis l'admin :
     settings (nom, slogan, devise, connexion, dépôt GitHub)
     resources · categories · items · users

   Le panneau admin travaille sur un brouillon local (localStorage), puis le
   catalogue part sur le serveur de l'atelier — ou, à défaut, dans
   data/catalog.json sur GitHub. Voir « Envoi automatique » dans github.js.
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

  /* ---- Contrats ----------------------------------------------------------------
     Un contrat fige ce qui a été convenu : le nom, le prix et la quantité de
     chaque ligne lui appartiennent. Le catalogue peut ensuite changer de prix
     ou renommer un objet, un contrat déjà signé ne bouge pas. Seul `itemId`
     le relie encore au catalogue, pour additionner les ressources à sortir. */

  const ETATS = ["brouillon", "actif", "termine", "annule"];

  /** Un jour, « AAAA-MM-JJ », ou null. Même règle que les congés. */
  const jour = v => {
    const s = typeof v === "string" ? v.slice(0, 10) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s)) ? s : null;
  };

  /** Aujourd'hui à l'heure locale, au même format. */
  function jourLocal(d) {
    const x = d ? new Date(d) : new Date();
    const p = n => String(n).padStart(2, "0");
    return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
  }

  const entier = (v, min, max) =>
    Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

  function normLigne(l) {
    const t = l && typeof l === "object" ? l : {};

    /* La contrepartie est une liste : un même travail peut se payer en métal
       ET en essence. Les contrats écrits avant portaient une seule ressource
       en resId/resQty — on les reprend telle quelle plutôt que de perdre ce
       qui a été convenu. */
    let demande = (Array.isArray(t.demande) ? t.demande : [])
      .map(d => ({ resId: String((d && d.resId) || ""), qty: entier(d && d.qty, 0, 99999) }))
      .filter(d => d.resId && d.qty > 0);
    if (!demande.length && t.resId && Number(t.resQty) > 0) {
      demande = [{ resId: String(t.resId), qty: entier(t.resQty, 0, 99999) }];
    }
    /* Une même ressource deux fois sur la ligne se cumule : deux entrées
       « métal » afficheraient deux totaux qu'il faudrait additionner de tête. */
    const vu = {};
    demande.forEach(d => { vu[d.resId] = (vu[d.resId] || 0) + d.qty; });
    demande = Object.keys(vu).slice(0, 8).map(k => ({ resId: k, qty: vu[k] }));

    return {
      itemId: String(t.itemId || ""),
      /* Recopié du catalogue à l'ajout, puis libre : une ligne peut aussi
         n'exister que dans le contrat (main d'œuvre, convoyage…). */
      name: String(t.name || "").slice(0, 120),
      qty: entier(t.qty, 1, 9999),
      demande
    };
  }

  function normContrat(k) {
    const t = k && typeof k === "object" ? k : {};
    return {
      id: String(t.id || ""),
      ref: String(t.ref || "").slice(0, 40),
      titre: String(t.titre || "").slice(0, 120),
      client: String(t.client || "").slice(0, 80),
      /* Le type est un identifiant de la liste réglée dans l'admin. Il peut
         désigner un type supprimé depuis : on garde la valeur telle quelle,
         l'affichage se débrouillera plutôt que de réécrire un contrat signé. */
      type: String(t.type || "").slice(0, 60),
      /* Le garage qui l'a signé. Un contrat sans mention est du Nord : c'est
         l'atelier qui existait, et rien de déjà signé ne change de camp. */
      atelier: TOUS_ATELIERS.indexOf(String(t.atelier || "")) !== -1
        ? String(t.atelier) : ATELIER_DEFAUT,
      note: String(t.note || "").slice(0, 2000),
      etat: ETATS.indexOf(t.etat) !== -1 ? t.etat : "brouillon",
      /* Date d'expiration, facultative. Passée, le contrat n'est pas modifié
         pour autant : c'est un fait à signaler, pas un état à lui imposer. */
      expire: jour(t.expire),
      lignes: (Array.isArray(t.lignes) ? t.lignes : []).slice(0, 200).map(normLigne),
      creePar: String(t.creePar || "").slice(0, 60),
      creeLe: t.creeLe || null,
      majPar: String(t.majPar || "").slice(0, 60),
      majLe: t.majLe || null
    };
  }

  /* ---- Départs ---------------------------------------------------------------------
     Quelqu'un qui s'en va n'est pas quelqu'un qu'on efface. Sa fiche quitte
     l'équipe pour les archives, et garde tout : ancienneté, carrière,
     formations, avertissements. On doit pouvoir dire, deux ans après, qui
     était là et ce qui s'est passé.

     Le pseudo reste pris, volontairement : une nouvelle recrue du même nom
     hériterait sinon d'un historique qui n'est pas le sien. */

  const MOTIFS_DEPART = [
    { id: "demission", nom: "Démission", court: "Démission" },
    { id: "renvoi", nom: "Renvoi", court: "Renvoyé" },
    { id: "fin", nom: "Fin de contrat", court: "Fin de contrat" },
    { id: "inactif", nom: "Inactivité prolongée", court: "Inactif" },
    { id: "autre", nom: "Autre", court: "Parti" }
  ];
  const motifDepart = id => MOTIFS_DEPART.find(m => m.id === id) || MOTIFS_DEPART[4];

  function normDepart(d) {
    if (!d || typeof d !== "object") return null;
    const le = jour(d.le);
    if (!le) return null;                   // sans date de départ, pas de départ
    return {
      le,
      motif: MOTIFS_DEPART.some(m => m.id === d.motif) ? d.motif : "autre",
      note: String(d.note || "").slice(0, 600),
      par: String(d.par || "").slice(0, 60)
    };
  }

  const estArchive = u => !!(u && u.depart);

  /* ---- Homonymes ----------------------------------------------------------------
     Deux personnes peuvent porter le même prénom et le même nom. Ça arrive, et
     le site ne doit ni l'interdire ni s'y perdre : c'est le code d'accès qui
     les départage à la connexion.

     La seule condition est donc qu'ils en aient un — chacun. Sans code, rien ne
     distingue deux fiches identiques, et celle qu'on croit ouvrir n'est pas
     forcément celle qui s'ouvre. */

  const memeNom = (a, b) =>
    String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

  /**
   * Ce qui empêche d'enregistrer une fiche sous ce nom, s'il y a lieu.
   * @param {Array} liste tous les employés
   * @param {string} pseudo le nom voulu
   * @param {string} monId l'identifiant de la fiche modifiée, "" si elle est neuve
   * @param {boolean} auraUnCode cette fiche aura-t-elle un code après enregistrement
   * @returns {string} "" si c'est bon, sinon le message à montrer
   */
  function soucisHomonyme(liste, pseudo, monId, auraUnCode) {
    const autres = (liste || []).filter(u => u.id !== monId && memeNom(u.pseudo, pseudo));
    if (!autres.length) return "";

    if (!auraUnCode) {
      return "Ce nom est déjà porté. Donne un code d'accès à cette fiche : " +
        "c'est lui qui distinguera les homonymes à la connexion.";
    }
    const sans = autres.filter(u => !u.pin);
    if (sans.length) {
      return "Ce nom est déjà porté par quelqu'un qui n'a pas de code d'accès. " +
        "Donne-lui-en un d'abord, sinon il ne pourrait plus se connecter.";
    }
    return "";
  }

  /** Archive quelqu'un : il quitte l'équipe sans rien perdre. */
  function archiverUser(user, info, byPseudo) {
    user.depart = normDepart(Object.assign({ le: jourLocal() }, info, { par: byPseudo || "" }));
    /* Désactivé aussi : c'est ce que lisent la connexion et la session, donc
       la personne est déconnectée au prochain chargement. */
    user.active = false;
    return user;
  }

  /** Le fait revenir dans l'équipe, son passé avec lui. */
  function reintegrerUser(user) {
    user.depart = null;
    user.active = true;
    return user;
  }

  /* Deux listes, partout : l'équipe d'aujourd'hui, et ceux qui sont passés. */
  const usersActifs = () => (_catalog.users || []).filter(u => !estArchive(u));
  const usersArchives = () => (_catalog.users || []).filter(estArchive)
    .slice().sort((a, b) => String(b.depart.le).localeCompare(String(a.depart.le)));

  /* ---- Avertissements ------------------------------------------------------------
     Une sanction posée sur la fiche de quelqu'un. Trois choses la rendent
     utilisable plutôt que blessante : elle porte un motif écrit, elle dit qui
     l'a donnée, et elle peut cesser de compter — soit d'elle-même à sa date
     d'échéance, soit parce qu'un responsable la lève.
     Rien ne s'efface : un avertissement levé garde sa trace. */

  const GRAVITES = [
    { id: "rappel", nom: "Rappel à l'ordre", court: "Rappel", poids: 1, couleur: "#7fd7e8" },
    { id: "simple", nom: "Avertissement", court: "Avertissement", poids: 2, couleur: "#ffa92e" },
    { id: "grave", nom: "Avertissement grave", court: "Grave", poids: 3, couleur: "#ff3b5c" }
  ];
  const graviteDe = id => GRAVITES.find(g => g.id === id) || GRAVITES[1];

  function normAvertissement(a) {
    const t = a && typeof a === "object" ? a : {};
    return {
      id: String(t.id || ""),
      at: t.at || new Date().toISOString(),
      by: String(t.by || "").slice(0, 60),
      gravite: GRAVITES.some(g => g.id === t.gravite) ? t.gravite : "simple",
      motif: String(t.motif || "").trim().slice(0, 120),
      note: String(t.note || "").slice(0, 600),
      /* Échéance facultative : passée, l'avertissement ne compte plus, mais
         reste lisible. Un manquement de l'an dernier ne doit pas peser
         éternellement. */
      expire: jour(t.expire),
      /* Levé à la main, avant l'échéance. */
      leve: t.leve === true,
      levePar: String(t.levePar || "").slice(0, 60),
      leveLe: t.leveLe || null
    };
  }

  /** Un avertissement pèse-t-il encore aujourd'hui ? */
  const avertActif = a =>
    !!a && !a.leve && (!a.expire || a.expire >= jourLocal());

  /**
   * Le poids cumulé des avertissements qui comptent encore.
   * Un grave vaut trois rappels : c'est ce total qu'on regarde pour savoir
   * si la situation est sérieuse, pas le simple décompte.
   */
  function avertBilan(u) {
    const l = (u && u.avertissements) || [];
    const actifs = l.filter(avertActif);
    return {
      total: l.length,
      actifs: actifs.length,
      poids: actifs.reduce((n, a) => n + graviteDe(a.gravite).poids, 0),
      pire: actifs.reduce((p, a) =>
        graviteDe(a.gravite).poids > graviteDe(p).poids ? a.gravite : p, "rappel"),
      dernier: l[0] || null
    };
  }

  /** Un contrat dont la date est dépassée. Sans date, jamais expiré. */
  const contratExpire = k => !!(k && k.expire && k.expire < jourLocal());

  /** Le nombre de jours avant expiration, négatif si c'est passé. */
  function joursAvant(expire) {
    if (!expire) return null;
    const a = new Date(jourLocal() + "T12:00:00");
    const b = new Date(expire + "T12:00:00");
    return Math.round((b - a) / 86400000);
  }

  /**
   * Les deux versants d'un contrat.
   *
   *   resources  ce que l'atelier devra sortir de son stock, et le temps qu'il
   *              y passera. Calculé depuis le catalogue du jour : c'est un
   *              fait d'atelier, pas un terme négocié.
   *   demande    ce que le client apporte en échange. Vient de la ligne, où
   *              il a été convenu, et ne bouge plus.
   */
  function contratTotaux(contrat, cat) {
    const c = cat || _catalog;
    const sort = {}, recu = {};
    let secondes = 0, pieces = 0;

    (contrat.lignes || []).forEach(l => {
      const q = Math.max(0, Math.round(Number(l.qty) || 0));
      pieces += q;

      /* La contrepartie se compte par unité, comme le faisait un prix. */
      (l.demande || []).forEach(d => {
        if (d.resId && d.qty > 0) recu[d.resId] = (recu[d.resId] || 0) + d.qty * q;
      });

      const it = (c.items || []).find(i => i.id === l.itemId);
      if (!it) return;                       // ligne libre : rien à sortir
      secondes += (it.temps || 0) * q;
      Object.keys(it.cost || {}).forEach(rid => {
        sort[rid] = (sort[rid] || 0) + it.cost[rid] * q;
      });
    });

    const lister = tas => (c.resources || [])
      .filter(r => tas[r.id] > 0)
      .map(r => ({ resource: r, qty: tas[r.id] }));

    return { resources: lister(sort), demande: lister(recu), secondes, pieces };
  }

  /**
   * « 1 250 » — le séparateur de milliers est une espace fine insécable :
   * c’est ce que prescrit la typographie française, et surtout un nombre ne
   * se coupe jamais en fin de ligne.
   */
  const nombre = v => String(Math.round(Number(v) || 0))
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  /** Nettoie les caractéristiques d'un véhicule, sans toucher au reste. */
  const statsVehicule = v => Object.assign({}, v, {
    carburant: carbu(v.carburant),
    places: stat(v.places, 99),
    coffre: libre(v.coffre, 40),
    litres: stat(v.litres, 9999)
  });

  let _published = null;   // version réellement en ligne
  let _depot = null;       // la copie du dépôt, même quand le serveur l'emporte
  let _catalog = null;     // version affichée (brouillon si présent)
  let _origin = "seed";    // "serveur" | "remote" | "seed"
  let _draft = false;

  const listeners = [];
  const onChange = fn => listeners.push(fn);
  /* Un client blacklisté a parfois payé quelque chose qu'il n'a pas eu. Trois
     états suffisent : rien à rendre, à rendre, rendu. */
  const REMBOURSEMENTS = [
    { id: "aucun", nom: "Aucun", court: "—" },
    { id: "du", nom: "Remboursement dû", court: "dû" },
    { id: "fait", nom: "Remboursé", court: "remboursé" }
  ];
  const remboursementDe = id =>
    REMBOURSEMENTS.find(r => r.id === id) || REMBOURSEMENTS[0];

  /**
   * La levée d'une inscription dans le garage demandé, ou null.
   * Tolère la forme d'avant — une levée unique, sans garage — parce que les
   * entrées venues du serveur ne repassent pas par normalize() : un serveur
   * pas encore à jour la renvoie telle quelle, et la prendre pour une table
   * par garage ferait réapparaître des inscriptions qu'on avait levées.
   */
  function leveeIci(x, ou) {
    const l = x && x.levee;
    if (!l || typeof l !== "object") return null;
    if (l.at || l.by || l.note) return l;                 // forme d'avant
    return l[TOUS_ATELIERS.indexOf(ou) !== -1 ? ou : _atelier] || null;
  }

  /**
   * Additionne des paniers de ressources.
   * @param {Array<Object>} paniers  des { idRessource: quantité }
   * @returns {Object} la somme, ressource par ressource
   */
  function sommeRessources(paniers) {
    const o = {};
    (paniers || []).forEach(p => {
      Object.keys(p || {}).forEach(k => { o[k] = (o[k] || 0) + Number(p[k] || 0); });
    });
    return o;
  }

  /**
   * Un panier de ressources en toutes lettres : « 6 Ferraille, 2 Plastique ».
   * Une ressource inconnue du catalogue garde son identifiant plutôt que de
   * disparaître : mieux vaut un nom brut qu'une dette effacée.
   */
  function ressourcesEnClair(panier) {
    return Object.keys(panier || {})
      .filter(k => panier[k] > 0)
      .map(k => {
        const r = resourceById(k);
        return panier[k] + " " + (r ? r.name : k);
      })
      .join(", ");
  }

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
  /* ---- Ateliers -----------------------------------------------------------------
     Deux garages sur le même site. Ce qui les sépare : l'équipe, les grades et
     le pointage. Le reste — articles, prix, véhicules, contrats — leur est
     commun : c'est la même enseigne et le même stock.

     Une fiche porte la liste des ateliers où elle vaut. Un employé du Nord
     seul n'apparaît pas au Sud ; celui qui est dans les deux passe de l'un à
     l'autre d'un clic, avec les droits de son grade là où il se trouve.

     Les défauts ne sont pas les mêmes des deux côtés, et c'est voulu :
     l'atelier existant est le Nord, donc un employé sans mention y reste seul,
     tandis qu'un grade sans mention vaut partout — le Sud démarre avec la même
     hiérarchie, à charge de l'adapter ensuite. */

  const ATELIERS = [
    { id: "nord", nom: "Mécano Nord", court: "Nord" },
    { id: "sud", nom: "Mécano Sud", court: "Sud" }
  ];
  const TOUS_ATELIERS = ATELIERS.map(a => a.id);
  const ATELIER_DEFAUT = "nord";

  const atelierById = id => ATELIERS.find(a => a.id === id) || null;
  const nomAtelier = id => { const a = atelierById(id); return a ? a.nom : String(id || ""); };
  const courtAtelier = id => { const a = atelierById(id); return a ? a.court : String(id || ""); };

  /** Liste propre, dans l'ordre des ateliers, sans doublon ni inconnu. */
  function normAteliers(v, defaut) {
    const l = (Array.isArray(v) ? v : []).map(String);
    const gardes = TOUS_ATELIERS.filter(id => l.indexOf(id) !== -1);
    return gardes.length ? gardes : defaut.slice();
  }

  /** Les ateliers d'une fiche, quel que soit son âge. */
  const ateliersDe = x => normAteliers(x && x.ateliers, [ATELIER_DEFAUT]);

  /** Cette fiche vaut-elle dans cet atelier ? Sans atelier donné, oui. */
  const estDeAtelier = (x, atelier) =>
    !atelier || ateliersDe(x).indexOf(atelier) !== -1;

  /** Les employés d'un atelier. */
  const usersDeAtelier = atelier =>
    (_catalog.users || []).filter(u => estDeAtelier(u, atelier));

  /** Les heures attendues sur la semaine dans un atelier. 0 = aucun minimum. */
  /** Le livret du garage demandé, ou de celui où l'on travaille. */
  const livretDe = ou => {
    const l = settings().livret;
    const id = TOUS_ATELIERS.indexOf(ou) !== -1 ? ou : _atelier;
    return (l && typeof l === "object" ? l[id] : "") || "";
  };

  const minimumDe = ou => {
    const m = (_catalog.settings && _catalog.settings.minimum) || {};
    const v = Number(m[ou || _atelier]);
    return isNaN(v) ? 0 : v;
  };

  /** Les grades proposés dans un atelier. */
  const rolesDeAtelier = ou =>
    (_catalog.roles || []).filter(r => estDeAtelier(r, ou));

  /* L'atelier où l'on travaille, posé par la page au démarrage. Le magasin en
     a besoin pour deux choses : le grade que quelqu'un porte ici, et le fait
     qu'on l'y ait masqué ou non. */
  let _atelier = ATELIER_DEFAUT;
  const setAtelier = id => {
    _atelier = TOUS_ATELIERS.indexOf(id) !== -1 ? id : ATELIER_DEFAUT;
  };
  const atelier = () => _atelier;

  /**
   * Le grade porté dans un atelier : celui qu'on y a fixé, sinon le principal.
   * Quelqu'un peut être chef au Nord et garagiste au Sud — les hiérarchies des
   * deux garages ne se commandent pas l'une l'autre.
   */
  function roleIdDe(u, ou) {
    if (!u) return "";
    const g = u.grades && u.grades[ou || _atelier];
    return g || u.roleId || "";
  }

  /** Masqué du trombinoscope de cet atelier ? Le masquage se règle garage par
      garage : un compte utile au Nord peut n'avoir rien à faire au Sud. */
  const estMasqueIci = (u, ou) =>
    normAteliers(u && u.masques, []).indexOf(ou || _atelier) !== -1;

  /** Masqué des deux côtés : c'est la marque d'un compte technique. */
  const estMasquePartout = u =>
    TOUS_ATELIERS.every(a => estMasqueIci(u, a));

  /** Les grades par atelier, débarrassés de ce qui n'existe plus. */
  function normGrades(v, roleIds) {
    const o = {};
    if (v && typeof v === "object") {
      TOUS_ATELIERS.forEach(a => {
        const id = String(v[a] || "");
        if (id && roleIds.indexOf(id) !== -1) o[a] = id;
      });
    }
    return o;
  }


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
        /* Les avertissements n'ont pas de repli : sans salon à eux, rien
           n'est envoyé. Une sanction n'a rien à faire dans le salon des
           prises de service. */
        avertissements: String(w.avertissements || ""),
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
      /* Le livret : ce qu'un nouveau doit savoir, écrit par l'équipe. Il sert
         deux fois — il se lit tel quel, et c'est lui que l'assistant relit
         pour répondre.

         Un par garage : les deux ateliers n'ont ni les mêmes horaires, ni les
         mêmes habitudes, ni les mêmes gens à qui s'adresser. Un livret écrit
         avant la séparation était unique — on le recopie des deux côtés
         plutôt que de choisir à qui l'enlever. */
      livret: (function (v) {
        const o = {};
        /* Aucune longueur maximale : un livret complet vaut mieux qu'un
           livret arrêté au milieu d'une phrase. Le catalogue passe par une
           route qui accepte plusieurs mégaoctets — la place ne manque pas. */
        const ancien = typeof v === "string" ? v : "";
        TOUS_ATELIERS.forEach(id => {
          o[id] = String((v && typeof v === "object" ? v[id] : "") || ancien);
        });
        return o;
      })(s.livret),
      /* Heures attendues sur la semaine, garage par garage : le Sud n'a pas
         forcément le même rythme que le Nord. 0 = on ne signale personne.
         Le récapitulatif du dimanche et la jauge de la page Service lisent
         tous les deux ce chiffre — un seul endroit à régler. */
      minimum: (function (m) {
        const o = {};
        TOUS_ATELIERS.forEach(id => {
          const v = m && m[id] !== undefined ? Number(m[id]) : 4;
          o[id] = Math.max(0, Math.min(168, Math.round(isNaN(v) ? 4 : v)));
        });
        return o;
      })(s.minimum),
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
        /* L'atelier où l'objet est proposé. Sans mention il l'est partout :
           un catalogue déjà rempli ne doit pas se vider d'un côté. */
        ateliers: normAteliers(it.ateliers, TOUS_ATELIERS),
        /* Quantité maximale par devis. 0 = illimité. */
        max: Math.max(0, Math.min(999, Math.round(Number(it.max) || 0))),
        /* Taille du lot : « Pièces détachées » avec pack = 10 s'annonce
           « 10 Pièces détachées », et « 20 » quand on en prend deux. Le coût
           en ressources, lui, reste celui d'un lot. 0 ou 1 = pas de lot. */
        pack: Math.max(0, Math.min(9999, Math.round(Number(it.pack) || 0))),
        /* Temps de fabrication, en secondes. Facultatif : 0 = non renseigné,
           et l'objet n'ajoute alors rien au total du devis. */
        temps: Math.max(0, Math.min(86400, Math.round(Number(it.temps) || 0))),
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
        /* Peut-il être tracté ? Une case cochée ou non, sans troisième état :
           « je ne sais pas » et « non » se ressemblent trop pour qu'on
           demande à l'atelier de trancher entre les deux. */
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

    /* --- types de contrat ---
       La liste vit dans le catalogue et non sur le serveur : c'est un réglage
       de l'atelier, au même titre que les catégories, et il se publie avec le
       reste. Les contrats, eux, restent côté serveur — seul l'identifiant du
       type les relie ici. */
    const seenT = [];
    c.contractTypes = (Array.isArray(c.contractTypes) ? c.contractTypes : []).map(t => {
      const id = uniqueId(t.id || t.name, seenT); seenT.push(id);
      return {
        id,
        name: String(t.name || id).slice(0, 60),
        icon: t.icon || "i-box",
        /* Sans mention, un type est proposé dans les deux garages. */
        ateliers: normAteliers(t.ateliers, TOUS_ATELIERS),
        /* Durée de validité proposée à la création, en jours. 0 = aucune. */
        jours: Math.max(0, Math.min(3650, Math.round(Number(t.jours) || 0)))
      };
    });
    if (!c.contractTypes.length) {
      c.contractTypes = [
        { id: "reparation", name: "Réparation", icon: "i-wrench", jours: 0 },
        { id: "convoi", name: "Convoi", icon: "i-wheels-truck", jours: 7 },
        { id: "fourniture", name: "Fourniture", icon: "i-box", jours: 30 },
        { id: "entretien", name: "Entretien", icon: "i-engine", jours: 90 }
      ];
    }

    /* --- contrats ---
       Ils vivent normalement sur le serveur ; ceci n'est que le repli quand
       il n'y en a pas. Le prix et la quantité sont propres à la ligne : un
       contrat garde ce qui a été convenu, même si le catalogue change après.
       Le nom aussi est recopié — un objet renommé ne doit pas réécrire un
       contrat déjà signé. */
    c.contracts = (Array.isArray(c.contracts) ? c.contracts : []).map(k => normContrat(k));

    /* --- agenda ---
       Comme les contrats : il vit sur le serveur, ceci n'est que le repli.
       MNAgenda le nettoie lui-même, on se contente ici de garder le tableau. */
    c.events = Array.isArray(c.events) ? c.events.slice(0, 2000) : [];

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
        perms: cleanPerms(r.perms),
        /* Sans mention, un grade vaut dans les deux ateliers. */
        ateliers: normAteliers(r.ateliers, TOUS_ATELIERS)
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

      /* Avertissements : du plus récent au plus ancien, c'est l'ordre dans
         lequel on les lit. Un avertissement levé n'est pas supprimé — il
         garde sa trace, et c'est bien l'intérêt : on doit pouvoir dire qu'il
         a existé et qui l'a levé. */
      const avertissements = (Array.isArray(u.avertissements) ? u.avertissements : [])
        .map(normAvertissement)
        .filter(a => a.motif)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, 60);

      return {
        id,
        pseudo: String(u.pseudo || id),
        roleId,
        pin: typeof u.pin === "string" && u.pin.length === 64 ? u.pin : null,
        active: u.active !== false,
        /* Masqué du trombinoscope Équipe, mais compte pleinement fonctionnel :
           la personne se connecte et travaille normalement. Le champ est
           conservé : il dit « masqué partout » pour les fiches d'avant les
           deux garages, et `masques` prend le relais garage par garage. */
        hidden: u.hidden === true,
        masques: normAteliers(u.masques, u.hidden === true ? TOUS_ATELIERS : []),
        /* Un grade par atelier, quand il diffère du principal. */
        grades: normGrades(u.grades, roleIds),
        /* Sans mention, l'employé est du Nord : l'atelier d'origine. */
        ateliers: normAteliers(u.ateliers, [ATELIER_DEFAUT]),
        /* Exempté du minimum hebdomadaire : ses heures comptent et s'affichent
           comme celles de tout le monde, mais il n'est jamais signalé pour un
           minimum non atteint. (`horsRecap` : le nom d'avant, quand le réglage
           retirait aussi les heures. Relu pour ne rien perdre.) */
        sansMinimum: u.sansMinimum === true || u.horsRecap === true,
        createdAt,
        /* Date d'embauche (AAAA-MM-JJ), séparée de la création du compte. */
        hiredAt: /^\d{4}-\d{2}-\d{2}$/.test(u.hiredAt) ? u.hiredAt : createdAt.slice(0, 10),
        trainings: (Array.isArray(u.trainings) ? u.trainings : [])
          .map(t => String(t).trim()).filter(Boolean).slice(0, 30),
        note: u.note ? String(u.note).slice(0, 400) : "",
        depart: normDepart(u.depart),
        history: history.slice(-40),
        avertissements
      };
    });

    /* --- émotes ---
       Les animations du serveur de jeu. Le site ne les joue pas : il tient la
       liste, parce qu'elle vit ailleurs et que personne ne la retient. Un nom
       en clair, la commande à taper, et de quoi ranger.

       Chaque garage a la sienne. Sans mention, une émote vaut des deux côtés :
       une liste écrite avant la séparation ne doit disparaître nulle part. */
    const seenE = [];
    c.emotes = (Array.isArray(c.emotes) ? c.emotes : []).map(e => {
      const id = uniqueId(e.id || e.nom || e.name, seenE); seenE.push(id);
      return {
        id,
        nom: String(e.nom || e.name || id).slice(0, 60),
        /* La commande telle qu'on la tape en jeu. Le slash est remis s'il
           manque : on l'oublie une fois sur deux en la recopiant. */
        commande: (function (v) {
          const t = String(v || "").trim().slice(0, 80);
          return t && t[0] !== "/" ? "/" + t : t;
        })(e.commande || e.cmd),
        /* Texte libre : « Mécanique », « Accueil »… Vide = « Sans catégorie ». */
        categorie: String(e.categorie || e.cat || "").trim().slice(0, 40),
        note: String(e.note || "").slice(0, 200),
        /* Une image vaut mieux qu'un nom : on reconnaît un geste, on ne
           retient pas « /e mechanic2 ». Vide = pas de vignette. */
        image: String(e.image || "").slice(0, 300),
        ateliers: normAteliers(e.ateliers, TOUS_ATELIERS)
      };
    }).filter(e => e.nom || e.commande);

    /* --- blacklist ---
       Les clients qu'on ne sert plus, et pourquoi. Une entrée levée n'est pas
       supprimée : elle sort de la liste active mais garde sa trace, comme un
       avertissement. On doit pouvoir dire qu'elle a existé et qui l'a levée.

       Chaque garage tient la sienne — un client peut avoir un compte à régler
       d'un côté seulement. Sans mention, l'inscription vaut des deux côtés :
       ce qui était écrit avant la séparation ne s'efface nulle part. */
    const seenB = [];
    c.blacklist = (Array.isArray(c.blacklist) ? c.blacklist : []).map(x => {
      const id = uniqueId(x.id || x.nom || String(Date.now()), seenB); seenB.push(id);
      const rb = REMBOURSEMENTS.some(r => r.id === x.remboursement) ? x.remboursement : "aucun";
      return {
        id,
        nom: String(x.nom || "").slice(0, 60),
        raison: String(x.raison || "").slice(0, 600),
        /* « aucun » quand il n'y a rien à rendre, « du » tant que ce n'est pas
           fait, « fait » une fois rendu. Les ressources restent renseignées
           même après remboursement : c'est la trace de ce qui a été rendu. */
        remboursement: rb,
        /* Ce qu'on doit rendre, ressource par ressource — l'atelier ne
           facture pas en dollars. Même forme que le coût d'un objet : un
           identifiant de ressource, une quantité. */
        ressources: (function (v) {
          const o = {};
          Object.keys(v && typeof v === "object" ? v : {}).forEach(k => {
            const q = Math.max(0, Math.min(1e6, Math.round(Number(v[k]) || 0)));
            if (q > 0) o[k] = q;
          });
          return o;
        })(x.ressources),
        ateliers: normAteliers(x.ateliers, TOUS_ATELIERS),
        at: x.at || new Date().toISOString(),
        by: String(x.by || "").slice(0, 60),
        /* Une levée par garage : le Nord peut continuer de refuser quelqu'un
           que le Sud a laissé revenir. L'ancienne forme — une seule levée
           pour toute l'entrée — vaut pour tous ses garages. */
        levee: (function (v, ats) {
          const une = l => ({
            at: l.at || new Date().toISOString(),
            by: String(l.by || "").slice(0, 60),
            note: String(l.note || "").slice(0, 300)
          });
          if (!v || typeof v !== "object") return {};
          const o = {};
          if (v.at || v.by || v.note) {
            ats.forEach(id => { o[id] = une(v); });      // forme d'avant
            return o;
          }
          TOUS_ATELIERS.forEach(id => {
            if (v[id] && typeof v[id] === "object") o[id] = une(v[id]);
          });
          return o;
        })(x.levee, normAteliers(x.ateliers, TOUS_ATELIERS))
      };
    }).filter(x => x.nom)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 500);

    return c;
  }

  /**
   * Ajoute une ligne d'historique quand quelqu'un change de grade.
   * `at` permet de dater la promotion au jour où elle a réellement eu lieu.
   */
  function recordPromotion(user, newRoleId, roles, byPseudo, note, at, ou) {
    const r = (roles || []).find(x => x.id === newRoleId);
    const garage = ou || _atelier;

    /* On promeut là où l'on est. Pour quelqu'un des deux garages, le grade se
       pose sur ce garage-là seulement : être promu chef au Nord ne fait pas de
       vous le chef du Sud. Pour les autres, c'est leur grade tout court. */
    if (ateliersDe(user).length > 1) {
      user.grades = Object.assign({}, user.grades);
      user.grades[garage] = newRoleId;
      if (!user.roleId) user.roleId = newRoleId;
    } else {
      user.roleId = newRoleId;
    }

    user.history = (user.history || []).concat([{
      roleId: newRoleId,
      roleName: r ? r.name : newRoleId,
      atelier: garage,
      at: at || new Date().toISOString(),
      by: byPseudo || "",
      note: note || ""
    }]);
    /* On garde l'ordre chronologique même si la date saisie est antérieure. */
    user.history.sort((a, b) => new Date(a.at) - new Date(b.at));
    user.history = user.history.slice(-40);
    return user;
  }

  /* ---- Écriture des avertissements ------------------------------------------- */

  /** Pose un avertissement et renvoie celui qui vient d'être écrit. */
  function addAvertissement(user, info, byPseudo) {
    const a = normAvertissement(Object.assign({}, info, {
      id: uniqueId("av-" + jourLocal(), (user.avertissements || []).map(x => x.id)),
      at: info.at || new Date().toISOString(),
      by: byPseudo || ""
    }));
    /* Le plus récent en tête : c'est dans cet ordre qu'on lit une fiche. */
    user.avertissements = [a].concat(user.avertissements || [])
      .sort((x, y) => new Date(y.at) - new Date(x.at))
      .slice(0, 60);
    return a;
  }

  /**
   * Lève un avertissement : il cesse de compter, mais reste sur la fiche.
   * Effacer serait plus simple et bien pire — on doit pouvoir dire qu'il a
   * existé, et qui a décidé de le lever.
   */
  function leverAvertissement(user, id, byPseudo) {
    const a = (user.avertissements || []).find(x => x.id === id);
    if (!a || a.leve) return null;
    a.leve = true;
    a.levePar = byPseudo || "";
    a.leveLe = new Date().toISOString();
    return a;
  }

  /** Retire un avertissement pour de bon — une erreur de saisie, rien d'autre. */
  function retirerAvertissement(user, id) {
    const a = (user.avertissements || []).find(x => x.id === id);
    if (!a) return null;
    user.avertissements = user.avertissements.filter(x => x.id !== id);
    return a;
  }

  /* ---- Chargement ------------------------------------------------------- */

  /**
   * Le catalogue tenu par le serveur de l'atelier, s'il en a un.
   *
   * On ne peut pas commencer par lui : c'est le fichier du dépôt qui porte
   * son adresse. Une fois celle-ci connue, la version la plus récente des
   * deux l'emporte — même règle que pour le brouillon. Un serveur muet ne
   * bloque rien, on garde simplement la copie du dépôt.
   */
  async function catalogueDuServeur(depart) {
    const base = String((depart.settings && depart.settings.serveur) || "").replace(/\/+$/, "");
    if (!base) return null;
    try {
      const stop = new AbortController();
      const t = setTimeout(() => stop.abort(), 6000);
      const r = await fetch(base + "/catalogue?t=" + Date.now(),
        { cache: "no-store", signal: stop.signal });
      clearTimeout(t);
      if (!r.ok) return null;          // 404 = il n'en tient pas encore
      return normalize(await r.json());
    } catch (_) {
      return null;                     // injoignable ou trop ancien : tant pis
    }
  }

  async function load() {
    let published = null;
    try {
      const url = (window.MN_CONFIG.catalogUrl || "data/catalog.json") + "?v=" + Date.now();
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) { published = normalize(await r.json()); _origin = "remote"; _depot = published; }
    } catch (_) { /* file:// ou fichier absent → on retombe sur la graine */ }

    if (!published) { published = normalize(window.MN_CATALOG_SEED || {}); _origin = "seed"; }

    /* Le serveur fait autorité quand il en tient un : c'est là que la
       publication écrit, et sans attendre une reconstruction du site. */
    const distant = await catalogueDuServeur(published);
    if (distant && new Date(distant.updatedAt) >= new Date(published.updatedAt)) {
      published = distant;
      _origin = "serveur";
    }
    _published = published;

    let local = null;
    try {
      const raw = localStorage.getItem(K_LOCAL);
      if (raw) local = normalize(JSON.parse(raw));
    } catch (_) { localStorage.removeItem(K_LOCAL); }

    /* Un brouillon plus vieux que la version en ligne = déjà publié ailleurs. */
    if (local && _origin !== "seed" && new Date(local.updatedAt) <= new Date(published.updatedAt)) {
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

  /**
   * Le serveur vient d'appliquer une opération et rend le catalogue à jour :
   * il fait autorité. Publié et affiché deviennent celui-là, et il n'y a plus
   * de brouillon — rien n'attend d'être publié.
   *
   * À n'appeler que sans brouillon en cours : sinon on effacerait des
   * modifications que le serveur ne connaît pas.
   */
  function adopter(cat) {
    const c = normalize(cat);
    _published = c;
    _catalog = clone(c);
    _draft = false;
    try { localStorage.removeItem(K_LOCAL); } catch (_) { /* rien à nettoyer */ }
    emit();
    return _catalog;
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
  /* La copie du dépôt, même quand celle du serveur l'emporte : c'est elle qui
     portera l'adresse du serveur au prochain démarrage. */
  const depot = () => _depot;
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
  const SANS_ROLE = { id: "", name: "Sans rôle", color: "#6a6280", perms: [] };

  /* Le grade d'ici d'abord, le principal ensuite : un grade supprimé au Sud ne
     doit pas priver quelqu'un de ses droits, il retombe sur le sien. */
  const roleOf = user => (user &&
    (roleById(roleIdDe(user)) || roleById(user.roleId))) || SANS_ROLE;
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
    let count = 0, secondes = 0;

    (c.items || []).forEach(it => {
      const q = Math.max(0, Math.round(Number(cart[it.id]) || 0));
      if (!q) return;
      count += q;
      /* Le temps de fabrication se cumule comme les ressources : deux
         pare-chocs, c'est deux fois la fabrication. Un objet sans temps
         renseigné n'ajoute rien. */
      secondes += (it.temps || 0) * q;
      lines.push({ item: it, qty: q, cost: it.cost });
      Object.keys(it.cost || {}).forEach(rid => { byRes[rid] = (byRes[rid] || 0) + it.cost[rid] * q; });
    });

    const resources = (c.resources || [])
      .filter(r => byRes[r.id] > 0)
      .map(r => ({ resource: r, qty: byRes[r.id] }));

    return { lines, resources, count, secondes };
  }

  /**
   * Une durée en secondes, écrite comme on la dit : « 45 s », « 1 min 30 s »,
   * « 3 min », « 2 h 05 min ». Les tranches à zéro sautent, et zéro renvoie
   * une chaîne vide — il n'y a rien à afficher.
   */
  function duree(sec) {
    const t = Math.max(0, Math.round(Number(sec) || 0));
    if (!t) return "";
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = [];
    if (h) p.push(h + " h");
    if (m) p.push((h ? String(m).padStart(2, "0") : m) + " min");
    if (s) p.push((h || m ? String(s).padStart(2, "0") : s) + " s");
    return p.join(" ");
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

  /* ---- Devis --------------------------------------------------- */

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
    saveDraft, discardDraft, adopter, toJSON, download,
    catalog, published, depot, hasDraft, origin, settings, brand, api,
    roleById, roleOf, itemById, resourceById, categoryById,
    topCategories, subCategories, categoryScope, itemLabel, totals, duree,
    ATELIERS, atelierById, nomAtelier, courtAtelier,
    ateliersDe, estDeAtelier, usersDeAtelier, rolesDeAtelier, normAteliers,
    setAtelier, atelier, roleIdDe, estMasqueIci, estMasquePartout, minimumDe, livretDe,
    memeNom, soucisHomonyme,
    MOTIFS_DEPART, motifDepart, estArchive, archiverUser, reintegrerUser,
    REMBOURSEMENTS, remboursementDe, leveeIci, sommeRessources, ressourcesEnClair,
    usersActifs, usersArchives,
    GRAVITES, graviteDe, normAvertissement, avertActif, avertBilan,
    addAvertissement, leverAvertissement, retirerAvertissement,
    normContrat, contratTotaux, nombre, ETATS_CONTRAT: ETATS,
    contratExpire, joursAvant, jour, jourLocal,
    /* Ceux proposés dans le garage où l'on travaille. `contractTypeById`, lui,
       reste sans filtre : un contrat déjà signé doit garder le nom de son type
       même si l'autre garage ne le propose pas. */
    contractTypes: () => (_catalog.contractTypes || []).filter(t => estDeAtelier(t, _atelier)),
    contractTypeById: id => (_catalog.contractTypes || []).find(t => t.id === id) || null,
    vehicleById, vehicleCatById,
    IMG_TAG, imageName, imageUrl, imagesHebergees,
    NA, CARBURANTS, statsVehicule,
    estNA: v => String(v || "").trim().toUpperCase() === NA,
    getCart, setCart, getBTs, addBT, removeBT, clearBTs
  };
})();
