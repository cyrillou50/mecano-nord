/* ==========================================================================
   MÉCANO NORD — petit serveur pour VPS
   --------------------------------------------------------------------------
   Node.js 18 ou plus. AUCUNE dépendance : pas de npm install, rien à
   télécharger. Tu copies ce fichier sur ton VPS et tu le lances.

   Ce qu'il fait :

     GET  /duty.json   → renvoie le tableau de service
     PUT  /duty.json   → le remplace (le site l'appelle quand quelqu'un pointe)
     POST /relais      → transmet un message à Discord, sans jamais exposer
                         l'adresse du webhook
     POST /publier     → écrit le catalogue sur GitHub, sans que personne
                         n'ait de jeton
     GET  /vehicules   → le parc automobile (categories + vehicules)
     GET  /contrats    → le registre des contrats
     POST /contrats    → en creer, en modifier ou en supprimer
     POST /vehicules   → y ajouter, valider ou retirer un vehicule
     GET  /images      → la liste des images hébergées ici
     GET  /images/x.png→ l'image elle-même
     POST /images      → en déposer une, la renommer ou la supprimer
     GET  /images/distant?u= → relaie une image d'un autre domaine, pour que
                         le site puisse la recadrer
     GET  /sante       → « ok », pratique pour vérifier que tout tourne

   Le guide d'installation complet est dans serveur/README.md
   ========================================================================== */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

/* ---- Réglages, tous par variables d'environnement -------------------------- */

const PORT = Number(process.env.PORT || 8787);
/* Derrière un proxy (nginx, Apache, Caddy), mets HOTE=127.0.0.1 : le serveur
   n'est alors joignable que depuis la machine, jamais directement d'internet. */
const HOTE = process.env.HOTE || "0.0.0.0";
const DOSSIER = process.env.DONNEES || path.join(__dirname, "donnees");
const FICHIER = path.join(DOSSIER, "duty.json");
/* Les images vivent ici plutôt que dans le dépôt : les y déposer coûtait un
   commit et une reconstruction complète du site pour un fichier de 30 ko. */
const DOSSIER_IMG = path.join(DOSSIER, "images");
/* Le parc automobile vit ici, pas dans le dépôt : chacun peut proposer un
   véhicule sans avoir le droit de publier, et le catalogue GitHub reste
   réservé à ce qui touche au site lui-même. */
const FICHIER_VEH = path.join(DOSSIER, "vehicules.json");
/* Les contrats aussi : les droits qui les régissent n'ont rien à voir avec le
   droit de publier le site. */
const FICHIER_CT = path.join(DOSSIER, "contrats.json");

/* Origines autorisées, séparées par des virgules. « * » = tout le monde. */
const ORIGINES = String(process.env.ORIGINE || "*")
  .split(",").map(s => s.trim()).filter(Boolean);

const WEBHOOKS = {
  bt: process.env.WEBHOOK_BT || "",
  duty: process.env.WEBHOOK_DUTY || "",
  /* Sans salon dédié, les congés rejoignent celui des prises de service. */
  conges: process.env.WEBHOOK_CONGES || process.env.WEBHOOK_DUTY || ""
};

const MAX_CORPS = 512 * 1024;      // 512 ko suffisent largement
const MAX_IMAGE = 8 * 1024 * 1024; // sauf pour une photo, forcément plus lourde
const SAUVEGARDES = 20;            // versions conservées du tableau

/* ---- Limitation de débit --------------------------------------------------- */

const compteur = new Map();
const FENETRE = 60_000;
const MAX_PAR_MINUTE = 60;

function tropDeRequetes(ip) {
  const maintenant = Date.now();
  const e = compteur.get(ip);
  if (!e || maintenant - e.debut > FENETRE) {
    compteur.set(ip, { debut: maintenant, n: 1 });
    return false;
  }
  e.n++;
  return e.n > MAX_PAR_MINUTE;
}

/* Nettoyage périodique, pour ne pas garder d'IP en mémoire indéfiniment. */
setInterval(() => {
  const maintenant = Date.now();
  for (const [ip, e] of compteur) if (maintenant - e.debut > FENETRE) compteur.delete(ip);
}, FENETRE).unref();

/* ---- Validation du tableau de service --------------------------------------- */

const texte = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const nombre = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const dateIso = v => { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

/** Les congés se comptent en jours : « AAAA-MM-JJ », ou null. */
const jour = v => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s)) ? s : null;
};

/** Clé d'une période : une personne, une date de départ. */
const cidDe = (id, from) => id + "|" + from;

function nettoyerConge(e) {
  const from = jour(e && e.from), to = jour(e && e.to);
  if (!from || !to || from > to) return null;
  const id = texte(e.id, 60);
  if (!id) return null;
  return {
    id,
    cid: texte(e.cid, 130) || cidDe(id, from),
    pseudo: texte(e.pseudo, 60) || "?",
    roleId: texte(e.roleId, 60),
    from, to,
    note: texte(e.note, 300),
    by: texte(e.by, 60),
    at: dateIso(e.at) || new Date().toISOString()
  };
}

/**
 * On ne réécrit que ce qui ressemble vraiment à un tableau de service.
 * Tout champ inattendu est jeté, toute chaîne est bornée.
 */
function nettoyer(b) {
  if (!b || typeof b !== "object") return null;
  const onDuty = Array.isArray(b.onDuty) ? b.onDuty : [];
  const log = Array.isArray(b.log) ? b.log : [];
  const conges = Array.isArray(b.conges) ? b.conges : [];
  if (onDuty.length > 60 || log.length > 300 || conges.length > 60) return null;

  return {
    updatedAt: dateIso(b.updatedAt) || new Date().toISOString(),
    onDuty: onDuty.map(e => ({
      id: texte(e.id, 60),
      pseudo: texte(e.pseudo, 60) || "?",
      roleId: texte(e.roleId, 60),
      since: dateIso(e.since) || new Date().toISOString()
    })).filter(e => e.id),
    log: log.map(e => ({
      id: texte(e.id, 60),
      pseudo: texte(e.pseudo, 60) || "?",
      roleId: texte(e.roleId, 60),
      in: dateIso(e.in),
      out: dateIso(e.out),
      seconds: nombre(e.seconds, 0, 31_536_000),
      minutes: nombre(e.minutes, 0, 525_600),
      forced: e.forced === true,
      /* Une heure corrigée à la main reste signalée : sans ça, plus personne
         ne sait si un service de dix heures est réel ou rattrapé. */
      corrigePar: texte(e.corrigePar, 60),
      corrigeLe: dateIso(e.corrigeLe)
    })).filter(e => e.id && e.in && e.out),
    conges: conges.map(nettoyerConge).filter(Boolean)
  };
}

const VIDE = { updatedAt: new Date(0).toISOString(), onDuty: [], log: [], conges: [] };
const MAX_LOG = 300;

/* ---- Opérations de pointage, appliquées côté serveur -------------------------
   Le site n'envoie plus tout le tableau mais seulement « ce qu'il veut faire ».
   Le serveur lit, applique, écrit — le tout sérialisé. Deux personnes qui
   pointent à la même seconde ne peuvent donc plus s'effacer mutuellement. */

const secondes = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));

function appliquer(board, op) {
  const maintenant = new Date().toISOString();
  const b = {
    updatedAt: maintenant,
    onDuty: board.onDuty.slice(),
    log: board.log.slice(),
    conges: (board.conges || []).slice()
  };

  const id = texte(op.id, 60);
  const i = b.onDuty.findIndex(e => e.id === id);

  /**
   * Ferme un service. `fin` permet de le clore à l'heure réelle plutôt qu'à
   * l'instant du clic : quelqu'un qui a oublié de dépointer hier soir ne doit
   * pas se voir compter la nuit.
   */
  const cloturer = (indice, force, fin, par) => {
    const e = b.onDuty.splice(indice, 1)[0];
    /* Une fin ne peut ni précéder le début ni être dans le futur. */
    let out = maintenant;
    const choisie = dateIso(fin);
    if (choisie && choisie >= e.since && choisie <= maintenant) out = choisie;

    const sec = secondes(e.since, out);
    b.log.unshift({
      id: e.id, pseudo: e.pseudo, roleId: e.roleId,
      in: e.since, out,
      seconds: sec, minutes: Math.round(sec / 60),
      forced: !!force,
      corrigePar: out === maintenant ? "" : texte(par, 60),
      corrigeLe: out === maintenant ? null : maintenant
    });
    b.log = b.log.slice(0, MAX_LOG);
    return sec;
  };

  switch (op.op) {
    case "in":
      if (!id) return { erreur: "identifiant manquant" };
      if (i !== -1) return { board: b, deja: true };
      b.onDuty.push({
        id,
        pseudo: texte(op.pseudo, 60) || "?",
        roleId: texte(op.roleId, 60),
        since: maintenant
      });
      return { board: b };

    case "out":
      if (i === -1) return { board: b, deja: true };
      return { board: b, seconds: cloturer(i, op.force === true, op.at, op.par) };

    /* Corriger les heures d'un pointage déjà enregistré. On repère la ligne
       par la personne et son heure d'arrivée d'origine plutôt que par sa
       position : l'historique bouge dès que quelqu'un dépointe, et un index
       lu il y a dix secondes désignerait alors la mauvaise ligne. */
    case "log-set": {
      const cle = dateIso(op.cle);
      const j = b.log.findIndex(e => e.id === id && e.in === cle);
      if (j === -1) return { erreur: "ce pointage n'existe plus" };

      const debut = dateIso(op.in), fin = dateIso(op.out);
      if (!debut || !fin) return { erreur: "heures illisibles" };
      if (fin < debut) return { erreur: "la fin précède le début" };
      if (debut > maintenant || fin > maintenant) return { erreur: "on ne pointe pas dans le futur" };

      const sec = secondes(debut, fin);
      b.log[j] = Object.assign({}, b.log[j], {
        in: debut, out: fin,
        seconds: sec, minutes: Math.round(sec / 60),
        corrigePar: texte(op.par, 60) || "?",
        corrigeLe: maintenant
      });
      return { board: b, seconds: sec };
    }

    case "clear-log":
      b.log = [];
      return { board: b, retires: board.log.length };

    case "remove-log": {
      const n = Math.round(Number(op.index));
      if (!(n >= 0 && n < b.log.length)) return { board: b, deja: true };
      b.log.splice(n, 1);
      return { board: b };
    }

    /* Plusieurs périodes par personne, à condition qu'elles ne se recouvrent
       pas. `remplace` désigne celle qu'on modifie, sinon on en ajoute une. */
    case "leave-set": {
      const c = nettoyerConge(op);
      if (!c) return { erreur: "congés invalides" };

      const remplace = texte(op.remplace, 130);
      if (b.conges.some(e =>
        e.id === c.id && e.cid !== remplace && e.from <= c.to && c.from <= e.to)) {
        return { erreur: "chevauche une période déjà posée" };
      }

      const j = remplace ? b.conges.findIndex(e => e.cid === remplace) : -1;
      if (j === -1) b.conges.push(c); else b.conges[j] = c;
      return { board: b };
    }

    case "leave-clear": {
      const cid = texte(op.cid, 130);
      const j = b.conges.findIndex(e => e.cid === cid);
      if (j === -1) return { board: b, deja: true };
      b.conges.splice(j, 1);
      return { board: b };
    }

    default:
      return { erreur: "opération inconnue : " + op.op };
  }
}

/* ---- Lecture / écriture ------------------------------------------------------ */

async function lire() {
  try {
    return JSON.parse(await fsp.readFile(FICHIER, "utf8"));
  } catch (_) {
    return VIDE;
  }
}

/* File d'attente : une seule écriture à la fois, dans l'ordre d'arrivée.
   C'est ce qui garantit que deux pointages simultanés ne s'écrasent pas. */
let queue = Promise.resolve();
function enFile(travail) {
  const suite = queue.then(travail, travail);
  queue = suite.catch(() => {});
  return suite;
}

/** Écriture atomique : on écrit à côté puis on renomme, jamais de fichier à moitié écrit. */
async function ecrire(board) {
  await fsp.mkdir(DOSSIER, { recursive: true });
  const contenu = JSON.stringify(board, null, 2) + "\n";
  const tmp = FICHIER + ".tmp";
  await fsp.writeFile(tmp, contenu, "utf8");

  /* Une copie horodatée, au cas où quelqu'un saccagerait le tableau. */
  try {
    if (fs.existsSync(FICHIER)) {
      const dir = path.join(DOSSIER, "sauvegardes");
      await fsp.mkdir(dir, { recursive: true });
      await fsp.copyFile(FICHIER, path.join(dir, Date.now() + ".json"));
      const anciens = (await fsp.readdir(dir)).sort();
      for (const f of anciens.slice(0, Math.max(0, anciens.length - SAUVEGARDES))) {
        await fsp.unlink(path.join(dir, f)).catch(() => {});
      }
    }
  } catch (_) { /* la sauvegarde est un confort, pas un bloquant */ }

  await fsp.rename(tmp, FICHIER);
}

/* ---- Parc automobile -----------------------------------------------------------
   Même principe que le tableau de service : le site envoie une opération, le
   serveur lit, applique et écrit, le tout sérialisé. Deux propositions
   déposées à la même seconde ne peuvent donc pas s'effacer.

   Le serveur ne connaît pas les permissions — il n'a aucune notion d'identité.
   C'est le site qui décide si un ajout est « valide » ou « en attente », comme
   pour le pointage. Le serveur, lui, borne les champs et refuse tout le reste. */

const PARC_VIDE = { updatedAt: new Date(0).toISOString(), cats: [], vehicles: [] };

/* « Sans objet » : un bateau n'a pas de coffre, un vélo pas de réservoir. Il
   faut le distinguer d'une case pas encore remplie, sinon leur fiche reste
   marquée à compléter pour toujours. D'où du texte plutôt qu'un nombre :
   « » = à remplir, « N/A » = sans objet, sinon la valeur.
   Les mêmes règles que le site, pour qu'un aller-retour ne change rien. */
const NA = "N/A";
const SANS_OBJET = /^(n\s*[./]?\s*a\.?|s\s*[./]?\s*o\.?|néant|neant|aucun|—|-{1,2})$/i;

const stat = (val, max) => {
  const s = texte(val == null ? "" : String(val), 40).trim();
  if (!s) return "";
  if (SANS_OBJET.test(s)) return NA;
  const n = Math.round(Number(s.replace(",", ".")));
  return isFinite(n) && n > 0 ? String(Math.min(max, n)) : "";
};
const libre = (val, max) => {
  const s = texte(val, max).trim();
  return SANS_OBJET.test(s) ? NA : s;
};
/* Même table que le site : une valeur venue d'ailleurs est rapprochée de l'un
   des carburants connus, sinon vidée. */
const ALIAS = [
  { nom: "Diesel", re: /^(diesel|gazole|gasoil|go\b)/ },
  { nom: "Essence", re: /^(essence|sp\s?9[58]|super|petrol)/ },
  { nom: "Kérosène", re: /^(k[ée]ros|jet\s?a|avgas|aviation)/ }
];

const carbu = c => {
  const s = texte(c, 40).trim();
  if (!s) return "";
  if (SANS_OBJET.test(s)) return NA;
  const b = s.toLowerCase();
  const t = ALIAS.find(a => a.re.test(b));
  return t ? t.nom : "";
};

function nettoyerVehicule(v, catIds) {
  const id = texte(v && v.id, 60);
  if (!id) return null;
  const cat = texte(v.category, 60);
  return {
    id,
    name: texte(v.name, 60) || id,
    category: catIds.indexOf(cat) !== -1 ? cat : (catIds[0] || ""),
    image: texte(v.image, 300),
    status: v.status === "attente" ? "attente" : "valide",
    proposePar: texte(v.proposePar, 60),
    proposeLe: dateIso(v.proposeLe),
    /* Liste fermée, comme côté site : Essence, Diesel, sans objet, ou rien. */
    carburant: carbu(v.carburant),
    places: stat(v.places, 99),
    coffre: libre(v.coffre, 40),
    litres: stat(v.litres, 9999),
    note: texte(v.note, 300),
    /* Modification en attente d'approbation, rangée à côté du véhicule sans
       le changer. Même bornage que les champs qu'elle remplacera. */
    propose: (function (p) {
      if (!p || typeof p !== "object" || !p.champs) return null;
      const c = p.champs;
      return {
        par: texte(p.par, 60),
        le: dateIso(p.le),
        champs: {
          name: texte(c.name, 60),
          category: texte(c.category, 60),
          image: texte(c.image, 300),
          carburant: carbu(c.carburant),
          places: stat(c.places, 99),
          coffre: libre(c.coffre, 40),
          litres: stat(c.litres, 9999),
          note: texte(c.note, 300)
        }
      };
    })(v.propose)
  };
}

function nettoyerParc(p) {
  if (!p || typeof p !== "object") return null;
  const cats = Array.isArray(p.cats) ? p.cats : [];
  const vehicles = Array.isArray(p.vehicles) ? p.vehicles : [];
  if (cats.length > 60 || vehicles.length > 500) return null;

  const propres = cats.map(c => ({
    id: texte(c && c.id, 60),
    name: texte(c && c.name, 60) || "Sans nom",
    icon: texte(c && c.icon, 60) || "i-wheels-car"
  })).filter(c => c.id);

  const catIds = propres.map(c => c.id);
  return {
    updatedAt: dateIso(p.updatedAt) || new Date().toISOString(),
    cats: propres,
    vehicles: vehicles.map(v => nettoyerVehicule(v, catIds)).filter(Boolean)
  };
}

function appliquerParc(parc, op) {
  const p = {
    updatedAt: new Date().toISOString(),
    cats: parc.cats.slice(),
    vehicles: parc.vehicles.slice()
  };
  const catIds = p.cats.map(c => c.id);

  switch (op.op) {
    /* Ajoute ou remplace un véhicule. Le site envoie l'objet complet : c'est
       plus simple qu'un champ à la fois, et le volume reste minuscule. */
    case "set": {
      const v = nettoyerVehicule(op.vehicle, catIds);
      if (!v) return { erreur: "véhicule invalide" };
      const i = p.vehicles.findIndex(x => x.id === v.id);
      if (i === -1) p.vehicles.push(v); else p.vehicles[i] = v;
      return { parc: p };
    }

    case "remove": {
      const id = texte(op.id, 60);
      const i = p.vehicles.findIndex(x => x.id === id);
      if (i === -1) return { parc: p, deja: true };
      p.vehicles.splice(i, 1);
      return { parc: p };
    }

    case "status": {
      const id = texte(op.id, 60);
      const v = p.vehicles.find(x => x.id === id);
      if (!v) return { parc: p, deja: true };
      p.vehicles = p.vehicles.map(x => x.id === id
        ? Object.assign({}, x, { status: op.status === "attente" ? "attente" : "valide" })
        : x);
      return { parc: p };
    }

    /* Les catégories sont peu nombreuses et se réordonnent : on remplace la
       liste entière plutôt que d'inventer une opération par mouvement. */
    case "cats": {
      const propre = nettoyerParc({ cats: op.cats, vehicles: [] });
      if (!propre || !propre.cats.length) return { erreur: "catégories invalides" };
      p.cats = propre.cats;
      const ids = p.cats.map(c => c.id);
      /* Un véhicule dont la catégorie disparaît rejoint la première. */
      p.vehicles = p.vehicles.map(v => ids.indexOf(v.category) !== -1
        ? v : Object.assign({}, v, { category: ids[0] }));
      return { parc: p };
    }

    default:
      return { erreur: "opération inconnue : " + op.op };
  }
}

async function lireParc() {
  try {
    return nettoyerParc(JSON.parse(await fsp.readFile(FICHIER_VEH, "utf8"))) || PARC_VIDE;
  } catch (_) {
    return PARC_VIDE;
  }
}

async function ecrireParc(parc) {
  await fsp.mkdir(DOSSIER, { recursive: true });
  const tmp = FICHIER_VEH + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(parc, null, 2) + "\n", "utf8");
  await fsp.rename(tmp, FICHIER_VEH);
}

/* ---- Contrats -----------------------------------------------------------------
   Même raison d'être ici que le parc : les droits sur les contrats n'ont rien
   à voir avec le droit de publier le site. Quelqu'un qui gère les contrats
   doit pouvoir en écrire un sans jeton GitHub, et toute l'équipe doit le voir
   aussitôt.

   Le serveur ne juge pas des permissions — c'est le site qui les applique. Il
   borne les données et sérialise les écritures, rien de plus. */

const REGISTRE_VIDE = { updatedAt: new Date(0).toISOString(), contrats: [] };
const ETATS = ["brouillon", "actif", "termine", "annule"];

function nettoyerLigne(l) {
  if (!l || typeof l !== "object") return null;
  const nom = texte(l.name, 120).trim();
  const itemId = texte(l.itemId, 60);
  if (!nom && !itemId) return null;
  return {
    itemId,
    name: nom,
    qty: nombre(l.qty, 1, 9999),
    /* La contrepartie : on troque, il n'y a pas d'argent. Une ressource
       demandée au client, et combien par unité de prestation. */
    resId: texte(l.resId, 60),
    resQty: nombre(l.resQty, 0, 99999)
  };
}

function nettoyerContrat(k) {
  const id = texte(k && k.id, 60);
  if (!id) return null;
  const lignes = (Array.isArray(k.lignes) ? k.lignes : []).slice(0, 200)
    .map(nettoyerLigne).filter(Boolean);
  return {
    id,
    ref: texte(k.ref, 40),
    titre: texte(k.titre, 120),
    client: texte(k.client, 80),
    note: texte(k.note, 2000),
    etat: ETATS.indexOf(k.etat) !== -1 ? k.etat : "brouillon",
    lignes,
    creePar: texte(k.creePar, 60),
    creeLe: dateIso(k.creeLe),
    majPar: texte(k.majPar, 60),
    majLe: dateIso(k.majLe)
  };
}

function nettoyerRegistre(r) {
  if (!r || typeof r !== "object") return null;
  const contrats = Array.isArray(r.contrats) ? r.contrats : [];
  if (contrats.length > 500) return null;
  return {
    updatedAt: dateIso(r.updatedAt) || new Date().toISOString(),
    contrats: contrats.map(nettoyerContrat).filter(Boolean)
  };
}

function appliquerRegistre(reg, op) {
  const r = { updatedAt: new Date().toISOString(), contrats: reg.contrats.slice() };

  switch (op.op) {
    /* Le site envoie le contrat entier : le volume reste minuscule et il n'y
       a pas de fusion à arbitrer champ par champ. */
    case "set": {
      const k = nettoyerContrat(op.contrat);
      if (!k) return { erreur: "contrat invalide" };
      const i = r.contrats.findIndex(x => x.id === k.id);
      if (i === -1) r.contrats.unshift(k); else r.contrats[i] = k;
      return { registre: r };
    }

    case "remove": {
      const id = texte(op.id, 60);
      const i = r.contrats.findIndex(x => x.id === id);
      if (i === -1) return { registre: r, deja: true };
      r.contrats.splice(i, 1);
      return { registre: r };
    }

    default:
      return { erreur: "opération inconnue : " + op.op };
  }
}

async function lireRegistre() {
  try {
    return nettoyerRegistre(JSON.parse(await fsp.readFile(FICHIER_CT, "utf8"))) || REGISTRE_VIDE;
  } catch (_) {
    return REGISTRE_VIDE;
  }
}

async function ecrireRegistre(reg) {
  await fsp.mkdir(DOSSIER, { recursive: true });
  const tmp = FICHIER_CT + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(reg, null, 2) + "\n", "utf8");
  await fsp.rename(tmp, FICHIER_CT);
}

/* ---- Images -------------------------------------------------------------------
   Hébergées ici, elles s'affichent dès le dépôt : ni commit, ni attente d'une
   reconstruction GitHub Pages. Le site les référence par « srv:nom.png ». */

const IMG_TYPES = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".avif": "image/avif"
};

/**
 * Nom de fichier sûr, ou null.
 * Ni dossier, ni « .. », ni extension inattendue : on ne sort pas du dossier
 * d'images et on n'y dépose pas n'importe quoi.
 */
function nomImage(v) {
  const s = texte(v, 120).trim();
  if (!/^[\w.-]+$/.test(s) || s.indexOf("..") !== -1) return null;
  return IMG_TYPES[path.extname(s).toLowerCase()] ? s : null;
}

async function listerImages() {
  try {
    const noms = await fsp.readdir(DOSSIER_IMG);
    return noms.filter(n => nomImage(n)).sort((a, b) => a.localeCompare(b, "fr"));
  } catch (_) {
    return [];                    // dossier pas encore créé : simplement vide
  }
}

/* ---- Relais d'images distantes ------------------------------------------------
   Le site recadre les photos de véhicules sur la voiture, sinon elle s'affiche
   minuscule au milieu d'un grand vide transparent. Pour mesurer ces marges il
   faut lire les pixels, et un navigateur le refuse sur une image venue d'un
   autre domaine sans en-tête CORS — ce qui est le cas des rendus du serveur de
   jeu. On les fait donc transiter par ici, ce qui leur donne nos en-têtes.

   C'est un relais, donc une porte : on la tient étroite. HTTPS uniquement, pas
   d'adresse interne (sinon on servirait de sonde vers le réseau du VPS), rien
   qui ne soit une image, et un plafond de taille. */

const RELAIS_MAX = 8 * 1024 * 1024;
const RELAIS_PRIVE = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.)/i;

async function relayerImage(res, brut, req) {
  let u;
  try { u = new URL(String(brut || "")); } catch (_) { u = null; }
  if (!u || u.protocol !== "https:") {
    return repondre(res, 400, { error: "Adresse d'image invalide (https attendu)" }, req);
  }
  if (RELAIS_PRIVE.test(u.hostname)) {
    return repondre(res, 403, { error: "Adresse interne refusée" }, req);
  }

  const stop = AbortSignal.timeout(12000);
  let amont;
  try {
    amont = await fetch(u.href, { signal: stop, redirect: "follow" });
  } catch (_) {
    return repondre(res, 502, { error: "Image distante injoignable" }, req);
  }
  if (!amont.ok) {
    return repondre(res, 502, { error: "L'hôte a répondu " + amont.status }, req);
  }

  const type = String(amont.headers.get("content-type") || "").split(";")[0].trim();
  if (!/^image\//.test(type)) {
    return repondre(res, 415, { error: "Ce n'est pas une image : " + (type || "type inconnu") }, req);
  }
  const annonce = Number(amont.headers.get("content-length") || 0);
  if (annonce > RELAIS_MAX) {
    return repondre(res, 413, { error: "Image trop lourde" }, req);
  }

  let octets;
  try { octets = Buffer.from(await amont.arrayBuffer()); }
  catch (_) { return repondre(res, 502, { error: "Lecture de l'image interrompue" }, req); }
  if (octets.length > RELAIS_MAX) {
    return repondre(res, 413, { error: "Image trop lourde" }, req);
  }

  /* Une heure de cache : ces rendus ne bougent jamais, et le site les
     redemande à chaque fiche ouverte. */
  res.writeHead(200, Object.assign(entetes(req), {
    "Content-Type": type,
    "Content-Length": octets.length,
    "Cache-Control": "public, max-age=3600"
  }));
  res.end(octets);
}

/** Envoie le fichier au navigateur. Renvoie false s'il n'existe pas. */
async function servirImage(res, nom, req) {
  const f = path.join(DOSSIER_IMG, nom);
  let st;
  try { st = await fsp.stat(f); } catch (_) { return false; }
  if (!st.isFile()) return false;

  /* Une image ne change pas sous le même nom en pratique ; une minute de
     cache suffit à éviter de la retélécharger à chaque page. */
  const etag = '"' + st.size.toString(36) + "-" + st.mtimeMs.toString(36) + '"';
  const entetesImg = Object.assign(entetes(req), {
    "Content-Type": IMG_TYPES[path.extname(nom).toLowerCase()],
    "Cache-Control": "public, max-age=60",
    ETag: etag
  });

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, entetesImg);
    res.end();
    return true;
  }

  entetesImg["Content-Length"] = st.size;
  res.writeHead(200, entetesImg);
  fs.createReadStream(f).pipe(res);
  return true;
}

/** Écrit une image, de façon atomique comme le tableau de service. */
async function ecrireImage(nom, base64) {
  await fsp.mkdir(DOSSIER_IMG, { recursive: true });
  const tmp = path.join(DOSSIER_IMG, "." + nom + ".tmp");
  await fsp.writeFile(tmp, Buffer.from(base64, "base64"));
  await fsp.rename(tmp, path.join(DOSSIER_IMG, nom));
}

/* ---- Écriture sur GitHub ------------------------------------------------------
   Le jeton reste ici. Le site n'en a jamais besoin : il demande au serveur,
   le serveur écrit. C'est ce qui permet à toute l'équipe de publier. */

const GH = {
  token: process.env.GH_TOKEN || "",
  owner: process.env.GH_OWNER || "",
  repo: process.env.GH_REPO || "",
  branche: process.env.GH_BRANCH || "main"
};

function b64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

const ENTETES_GH = () => ({
  Authorization: "Bearer " + GH.token,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "mecano-nord",
  "Content-Type": "application/json"
});

/* ---- Écriture groupée ----------------------------------------------------------
   L'API Contents n'écrit qu'un fichier par appel, donc un commit par fichier —
   et GitHub Pages reconstruit le site à chaque commit. Déposer une image en
   déclenchait deux, qui se mettaient en file d'attente.

   L'API Git permet de bâtir un commit complet : blobs, arbre, commit, puis on
   avance la branche. Un seul build, quel que soit le nombre de fichiers. */

async function githubEcrireLot(fichiers, message) {
  const racine = "https://api.github.com/repos/" + GH.owner + "/" + GH.repo;
  const h = ENTETES_GH();
  const br = encodeURIComponent(GH.branche);

  const lire = async (url, opts) => {
    const r = await fetch(url, Object.assign({ headers: h }, opts));
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error("GitHub " + r.status + " " + (d.message || ""));
    }
    return r.json();
  };

  try {
    const ref = await lire(racine + "/git/ref/heads/" + br);
    const parent = ref.object.sha;
    const commitParent = await lire(racine + "/git/commits/" + parent);

    const arbre = [];
    for (const f of fichiers) {
      /* `sha: null` retire le fichier du commit : supprimer et écrire d'un
         même geste. */
      if (f.remove) {
        arbre.push({ path: f.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blob = await lire(racine + "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: f.contenu, encoding: "base64" })
      });
      arbre.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const tree = await lire(racine + "/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: commitParent.tree.sha, tree: arbre })
    });
    const commit = await lire(racine + "/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [parent] })
    });
    await lire(racine + "/git/refs/heads/" + br, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha })
    });

    return { ok: true, commit: commit.sha.slice(0, 7) };
  } catch (e) {
    return { ok: false, error: e.message || "GitHub injoignable" };
  }
}

async function githubEcrire(chemin, contenuB64, message) {
  const base = "https://api.github.com/repos/" + GH.owner + "/" + GH.repo +
    "/contents/" + encodeURI(chemin);
  const entetes = ENTETES_GH();

  try {
    let sha = null;
    const lu = await fetch(base + "?ref=" + encodeURIComponent(GH.branche), { headers: entetes });
    if (lu.ok) sha = (await lu.json()).sha || null;
    else if (lu.status !== 404) return { ok: false, error: "GitHub a répondu " + lu.status };

    const corps = { message, content: contenuB64, branch: GH.branche };
    if (sha) corps.sha = sha;

    const ecrit = await fetch(base, { method: "PUT", headers: entetes, body: JSON.stringify(corps) });
    if (!ecrit.ok) {
      const d = await ecrit.json().catch(() => ({}));
      return { ok: false, error: "Écriture refusée (" + ecrit.status + ") " + (d.message || "") };
    }
    const d = await ecrit.json();
    return { ok: true, commit: d.commit && d.commit.sha ? d.commit.sha.slice(0, 7) : null };
  } catch (_) {
    return { ok: false, error: "GitHub injoignable" };
  }
}

/* ---- Utilitaires HTTP --------------------------------------------------------- */

function entetes(req) {
  const origine = req.headers.origin || "";
  const ok = ORIGINES.includes("*") || ORIGINES.includes(origine);
  return {
    "Access-Control-Allow-Origin": ORIGINES.includes("*") ? "*" : (ok ? origine : ORIGINES[0]),
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store"
  };
}

const origineAutorisee = req => {
  if (ORIGINES.includes("*")) return true;
  const o = req.headers.origin;
  return !o || ORIGINES.includes(o);
};

function repondre(res, code, data, req) {
  const corps = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(code, Object.assign(
    { "Content-Type": typeof data === "string" ? "text/plain; charset=utf-8" : "application/json" },
    entetes(req)
  ));
  res.end(corps);
}

/**
 * Lit un corps JSON, borné.
 *
 * Le dépassement se répond, il ne se coupe pas : fermer la connexion en plein
 * envoi laissait le navigateur sur un « Failed to fetch » qui n'explique rien.
 * On cesse d'accumuler, on laisse le client finir, puis on renvoie un 413
 * lisible. Au-delà de quatre fois la limite on coupe quand même — inutile de
 * lire un flux qui n'en finit pas.
 */
function corpsJson(req, max) {
  const plafond = max || MAX_CORPS;
  return new Promise((resolve, reject) => {
    let taille = 0, trop = false;
    const morceaux = [];
    const refus = () => {
      const e = new Error("Corps trop volumineux : " + Math.round(plafond / 1024) + " ko au maximum");
      e.tropGros = true;
      return e;
    };
    req.on("data", c => {
      taille += c.length;
      if (taille > plafond) {
        trop = true;
        morceaux.length = 0;                 // rien à garder, autant libérer
        if (taille > plafond * 4) { reject(refus()); req.destroy(); }
        return;
      }
      morceaux.push(c);
    });
    req.on("end", () => {
      if (trop) return reject(refus());
      try { resolve(JSON.parse(Buffer.concat(morceaux).toString("utf8") || "{}")); }
      catch (_) { reject(new Error("JSON illisible")); }
    });
    req.on("error", reject);
  });
}

/* ---- Le serveur ---------------------------------------------------------------- */

const serveur = http.createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress || "?";
  const url = new URL(req.url, "http://x");
  const chemin = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, entetes(req));
    return res.end();
  }
  if (!origineAutorisee(req)) return repondre(res, 403, { error: "Origine refusée" }, req);

  /* Une page affiche des dizaines d'images : les compter épuiserait le quota
     en un chargement. Ce sont des lectures de fichiers, sans effet de bord. */
  const lectureImage = req.method === "GET" && /^\/images\/./.test(chemin);
  if (!lectureImage && tropDeRequetes(ip)) {
    return repondre(res, 429, { error: "Trop de requêtes" }, req);
  }

  try {
    /* --- santé --- */
    if (chemin === "/sante" && req.method === "GET") {
      /* « ops: true » indique au site qu'il peut envoyer des opérations
         plutôt que tout le tableau : c'est ce qui évite les écrasements.
         « images: true » qu'il peut héberger les images ici, « relais »
         qu'il sait aller chercher une image sur un autre domaine. */
      return repondre(res, 200, {
        ok: true, ops: true, images: true, vehicules: true, relais: true, contrats: true,
        depuis: Math.round(process.uptime()) + " s"
      }, req);
    }

    /* --- parc automobile --- */
    /* --- contrats --- */
    if (chemin === "/contrats") {
      if (req.method === "GET") return repondre(res, 200, await lireRegistre(), req);

      if (req.method === "POST") {
        const op = await corpsJson(req);
        if (!op || !op.op) return repondre(res, 400, { error: "Opération manquante" }, req);

        const r = await enFile(async () => {
          const actuel = await lireRegistre();
          /* Première écriture : le site peut joindre ce qu'il avait déjà dans
             le catalogue, pour ne pas repartir d'un registre vide. */
          if (!actuel.contrats.length && op.depart) {
            const d = nettoyerRegistre(op.depart);
            if (d) actuel.contrats = d.contrats;
          }
          const res2 = appliquerRegistre(actuel, op);
          if (res2.erreur) return res2;
          await ecrireRegistre(res2.registre);
          return res2;
        });

        if (r.erreur) return repondre(res, 400, { error: r.erreur }, req);
        console.log(new Date().toISOString(), "contrats :", op.op, "—",
          r.registre.contrats.length, "contrats");
        return repondre(res, 200, { ok: true, registre: r.registre, deja: !!r.deja }, req);
      }
      return repondre(res, 405, { error: "Méthode non autorisée" }, req);
    }

    if (chemin === "/vehicules") {
      if (req.method === "GET") return repondre(res, 200, await lireParc(), req);

      if (req.method === "POST") {
        const op = await corpsJson(req);
        if (!op || !op.op) return repondre(res, 400, { error: "Opération manquante" }, req);

        const r = await enFile(async () => {
          const actuel = await lireParc();
          /* Premier écrit : le site peut joindre ce qu'il a déjà, pour ne pas
             repartir d'un parc vide. */
          if (!actuel.vehicles.length && !actuel.cats.length && op.depart) {
            const d = nettoyerParc(op.depart);
            if (d) { actuel.cats = d.cats; actuel.vehicles = d.vehicles; }
          }
          const res2 = appliquerParc(actuel, op);
          if (res2.erreur) return res2;
          await ecrireParc(res2.parc);
          return res2;
        });

        if (r.erreur) return repondre(res, 400, { error: r.erreur }, req);
        console.log(new Date().toISOString(), "parc :", op.op, "—",
          r.parc.vehicles.length, "véhicules");
        return repondre(res, 200, { ok: true, parc: r.parc, deja: !!r.deja }, req);
      }
      return repondre(res, 405, { error: "Méthode non autorisée" }, req);
    }

    /* --- images --- */
    if (chemin === "/images" && req.method === "GET") {
      return repondre(res, 200, { ok: true, images: await listerImages() }, req);
    }

    if (chemin === "/images/distant" && req.method === "GET") {
      return relayerImage(res, url.searchParams.get("u"), req);
    }

    if (lectureImage) {
      const nom = nomImage(decodeURIComponent(chemin.slice("/images/".length)));
      if (!nom) return repondre(res, 400, { error: "Nom d'image invalide" }, req);
      if (await servirImage(res, nom, req)) return;
      return repondre(res, 404, { error: "Image introuvable : " + nom }, req);
    }

    if (chemin === "/images" && req.method === "POST") {
      /* Une photo est cent fois plus grosse qu'un pointage : 512 ko suffisent
         pour tout le reste, pas pour une image. Le site la réduit déjà avant
         l'envoi, ceci n'est que le garde-fou.
         Si un 413 persiste, c'est nginx qu'il faut regarder :
         « client_max_body_size 8m; » dans le bloc du site. */
      const c = await corpsJson(req, MAX_IMAGE);

      if (c.op === "delete") {
        const nom = nomImage(c.name);
        if (!nom) return repondre(res, 400, { error: "Nom d'image invalide" }, req);
        try { await fsp.unlink(path.join(DOSSIER_IMG, nom)); }
        catch (_) { return repondre(res, 200, { ok: true, deja: true }, req); }
        console.log(new Date().toISOString(), "image supprimée :", nom);
        return repondre(res, 200, { ok: true }, req);
      }

      if (c.op === "rename") {
        const de = nomImage(c.from), vers = nomImage(c.to);
        if (!de || !vers) return repondre(res, 400, { error: "Nom d'image invalide" }, req);
        if (fs.existsSync(path.join(DOSSIER_IMG, vers))) {
          return repondre(res, 409, { error: "Une image porte déjà ce nom : " + vers }, req);
        }
        try { await fsp.rename(path.join(DOSSIER_IMG, de), path.join(DOSSIER_IMG, vers)); }
        catch (_) { return repondre(res, 404, { error: "Image introuvable : " + de }, req); }
        console.log(new Date().toISOString(), "image renommée :", de, "→", vers);
        return repondre(res, 200, { ok: true }, req);
      }

      const nom = nomImage(c.name);
      if (!nom) return repondre(res, 400, { error: "Nom d'image invalide" }, req);
      const brut = String(c.base64 || "").replace(/^data:[^,]*,/, "");
      if (!brut) return repondre(res, 400, { error: "Image vide" }, req);
      await ecrireImage(nom, brut);
      console.log(new Date().toISOString(), "image déposée :", nom);
      return repondre(res, 200, { ok: true, name: nom }, req);
    }

    /* --- tableau de service --- */
    if (chemin === "/duty.json" || chemin === "/duty") {
      if (req.method === "GET") return repondre(res, 200, await lire(), req);

      if (req.method === "PUT" || req.method === "POST") {
        const brut = await corpsJson(req);

        /* Opération : le serveur lit, applique et écrit, sans concurrence. */
        if (brut && brut.op) {
          const r = await enFile(async () => {
            const actuel = nettoyer(await lire()) || VIDE;
            const res2 = appliquer(actuel, brut);
            if (res2.erreur) return res2;
            await ecrire(res2.board);
            return res2;
          });
          if (r.erreur) return repondre(res, 400, { error: r.erreur }, req);
          console.log(new Date().toISOString(), brut.op, "—",
            r.board.onDuty.length, "en service");
          return repondre(res, 200, {
            ok: true, board: r.board, deja: !!r.deja,
            seconds: r.seconds, retires: r.retires
          }, req);
        }

        /* Sinon : remplacement complet (compatibilité). */
        const board = nettoyer(brut.board || brut);
        if (!board) return repondre(res, 400, { error: "Tableau de service invalide" }, req);
        await enFile(() => ecrire(board));
        console.log(new Date().toISOString(), "service remplacé —",
          board.onDuty.length, "en service");
        return repondre(res, 200, { ok: true, board }, req);
      }
      return repondre(res, 405, { error: "Méthode non autorisée" }, req);
    }

    /* --- publication vers GitHub --- */
    if (chemin === "/publier" && req.method === "POST") {
      if (!GH.token || !GH.owner || !GH.repo) {
        return repondre(res, 501, {
          error: "Publication non configurée : renseigne GH_TOKEN, GH_OWNER et GH_REPO"
        }, req);
      }
      const c = await corpsJson(req);

      /* On n'autorise QUE les fichiers de données et les images : personne
         ne peut réécrire le code du site par cette porte. */
      const permis = p => p === "data/catalog.json" || p === "assets/img/index.json" ||
        /^assets\/img\/[\w.-]+\.(png|jpe?g|webp|gif|svg|avif)$/i.test(p);

      /* Forme groupée : plusieurs fichiers, un seul commit, un seul build. */
      if (Array.isArray(c.files)) {
        if (!c.files.length) return repondre(res, 400, { error: "Aucun fichier" }, req);
        if (c.files.length > 30) return repondre(res, 400, { error: "Trop de fichiers" }, req);

        const lot = [];
        for (const f of c.files) {
          const p = texte(f && f.path, 200);
          if (!permis(p)) return repondre(res, 403, { error: "Chemin non autorisé : " + p }, req);
          if (f.remove === true) { lot.push({ path: p, remove: true }); continue; }
          const contenu = typeof f.base64 === "string"
            ? f.base64.replace(/^data:[^,]*,/, "")
            : b64(String(f.content || ""));
          if (!contenu) return repondre(res, 400, { error: "Contenu vide : " + p }, req);
          lot.push({ path: p, contenu });
        }

        const r = await githubEcrireLot(lot, texte(c.message, 150) || "Mise à jour depuis le site");
        if (!r.ok) return repondre(res, 502, { error: r.error }, req);
        console.log(new Date().toISOString(), "publié :", lot.length, "fichiers", r.commit || "");
        return repondre(res, 200, { ok: true, commit: r.commit }, req);
      }

      const cible = texte(c.path, 200);
      if (!permis(cible)) return repondre(res, 403, { error: "Chemin non autorisé : " + cible }, req);

      /* `content` est du texte, `base64` une image déjà encodée. */
      const contenu = typeof c.base64 === "string"
        ? c.base64.replace(/^data:[^,]*,/, "")
        : b64(String(c.content || ""));
      if (!contenu) return repondre(res, 400, { error: "Contenu vide" }, req);

      const r = await githubEcrire(cible, contenu, texte(c.message, 150) ||
        ("Mise à jour de " + cible));
      if (!r.ok) return repondre(res, 502, { error: r.error }, req);
      console.log(new Date().toISOString(), "publié :", cible, r.commit || "");
      return repondre(res, 200, { ok: true, commit: r.commit }, req);
    }

    /* --- relais Discord --- */
    if (chemin === "/relais" && req.method === "POST") {
      const corps = await corpsJson(req);
      const type = corps.type || (corps.kind ? "webhook" : "");

      if (type === "duty") {
        const board = nettoyer(corps.board);
        if (!board) return repondre(res, 400, { error: "Tableau de service invalide" }, req);
        await ecrire(board);
        return repondre(res, 200, { ok: true }, req);
      }
      if (type !== "webhook") return repondre(res, 400, { error: "Type inconnu : " + type }, req);

      const cible = WEBHOOKS[corps.kind];
      if (!cible) return repondre(res, 400, { error: "Webhook non configuré : " + corps.kind }, req);

      const m = corps.message || {};
      const propre = {
        username: texte(m.username, 80) || undefined,
        avatar_url: texte(m.avatar_url, 400) || undefined,
        content: texte(m.content, 300) || undefined,
        embeds: Array.isArray(m.embeds) ? m.embeds.slice(0, 3) : [],
        allowed_mentions: { parse: ["roles", "users"] }
      };

      const r = await fetch(cible, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(propre)
      });
      if (r.ok || r.status === 204) return repondre(res, 200, { ok: true }, req);
      return repondre(res, 502, { error: "Discord a répondu " + r.status }, req);
    }

    return repondre(res, 404, { error: "Chemin inconnu : " + chemin }, req);
  } catch (e) {
    if (e.tropGros) return repondre(res, 413, { error: e.message }, req);
    console.error(new Date().toISOString(), "erreur :", e.message);
    return repondre(res, 500, { error: e.message }, req);
  }
});

serveur.listen(PORT, HOTE, () => {
  console.log("Mécano Nord — serveur démarré");
  console.log("  écoute    : " + HOTE + ":" + PORT);
  console.log("  données   : " + FICHIER);
  console.log("  origines  : " + ORIGINES.join(", "));
  console.log("  webhooks  : " +
    (WEBHOOKS.bt ? "BT ✓" : "BT ✗") + "  " + (WEBHOOKS.duty ? "service ✓" : "service ✗"));
});
