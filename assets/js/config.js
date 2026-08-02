/* ==========================================================================
   MÉCANO NORD — DAY OF DECAY
   --------------------------------------------------------------------------
   Ce fichier ne contient QUE des valeurs de secours, utilisées avant que
   data/catalog.json soit chargé.

   Tout se règle depuis le site, dans le panneau admin :
     • le nom de l'entreprise, le slogan, la devise
     • les objets, catégories, ressources et leurs coûts
     • les employés et leurs permissions
     • la publication en ligne (bouton « Publier »)

   Tu n'as normalement jamais besoin de rouvrir ce fichier.
   ========================================================================== */

window.MN_CONFIG = {

  /* Fichier de données du site (catalogue + employés + réglages). */
  catalogUrl: "data/catalog.json",

  /* Valeurs par défaut, écrasées par les réglages enregistrés dans le
     catalogue dès qu'il est chargé. */
  defaults: {
    brand: { name: "Mécano Nord", tagline: "Day of Decay", logo: "" },
    auth: { allowGuests: false, guestPerms: ["bt"], sessionDays: 30, bootstrapFirstUser: true },
    github: { owner: "", repo: "", branch: "main", path: "data/catalog.json" }
  }
};

/* ==========================================================================
   Permissions disponibles. Les clés sont câblées dans le code, les libellés
   sont libres.
   ========================================================================== */
window.MN_PERMS = [
  { key: "bt",     name: "Faire des BT",       desc: "Utiliser la facturation et enregistrer des bons de travail." },
  { key: "items",  name: "Gérer le catalogue", desc: "Créer / modifier objets, catégories, ressources et coûts." },
  { key: "users",  name: "Gérer les employés", desc: "Ajouter des pseudos et changer leurs permissions." },
  { key: "publish",name: "Publier en ligne",   desc: "Envoyer les modifications sur le site public." },
  { key: "admin",  name: "Patron (tout)",      desc: "Accès complet : implique toutes les permissions." }
];
