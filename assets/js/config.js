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

/* On complète, on n'écrase pas. La V2 vit dans un sous-dossier et règle ses
   chemins avant de charger ce fichier : une affectation sèche les effaçait, et
   la V2 allait alors chercher son catalogue au mauvais endroit — sans le
   trouver, donc sans employés, donc en déconnectant tout le monde. */
window.MN_CONFIG = Object.assign({

  /* Fichier de données du site (catalogue + employés + réglages). */
  catalogUrl: "data/catalog.json",

  /* Valeurs par défaut, écrasées par les réglages enregistrés dans le
     catalogue dès qu'il est chargé. */
  defaults: {
    brand: { name: "Mécano Nord", tagline: "Day of Decay", logo: "" },
    auth: { allowGuests: false, guestPerms: ["bt"], sessionDays: 30, bootstrapFirstUser: true },
    github: { owner: "", repo: "", branch: "main", path: "data/catalog.json" }
  }
}, window.MN_CONFIG);

/* ==========================================================================
   Permissions disponibles. Les clés sont câblées dans le code, les libellés
   sont libres.
   ========================================================================== */
window.MN_PERMS = [
  { key: "bt",        name: "Faire des devis",        desc: "Utiliser la facturation et enregistrer des devis." },
  { key: "duty",      name: "Pointer son service", desc: "Prendre et quitter son service depuis le site." },
  { key: "duty_view", name: "Voir les services",   desc: "Voir qui est en service et l'historique de l'équipe." },
  { key: "duty_manage", name: "Gérer les services", desc: "Pointer à la place de quelqu'un, clôturer un service oublié, corriger l'historique." },
  { key: "staff",     name: "Voir les fiches",     desc: "Consulter les fiches employés : ancienneté, formations, carrière." },
  { key: "promote",   name: "Gérer les carrières", desc: "Promouvoir, changer les formations et compléter les fiches." },
  /* Sanctionner n'est pas gérer une carrière : on peut vouloir confier les
     promotions sans confier les avertissements, et l'inverse. */
  { key: "warn",      name: "Avertir un employé",  desc: "Poser un avertissement sur une fiche, le lever, le retirer. Chacun voit toujours les siens." },
  { key: "items",     name: "Gérer le catalogue",  desc: "Créer / modifier objets, catégories, ressources et coûts." },
  { key: "vehicles",  name: "Gérer les véhicules", desc: "Modifier et supprimer les véhicules et leurs catégories. Tout le monde peut en proposer et les consulter." },
  { key: "vehicles_validate", name: "Valider les véhicules", desc: "Approuver ou refuser les véhicules proposés par l'équipe. Sans validation, une proposition n'apparaît pas dans le parc." },
  /* Trois droits distincts sur les contrats : lire n'est pas écrire, et
     supprimer un contrat signé n'est pas le corriger. */
  { key: "contracts_view",   name: "Lire les contrats",  desc: "Consulter les contrats et les sortir en PDF. Lecture seule : aucune modification possible." },
  { key: "contracts",        name: "Gérer les contrats", desc: "Créer et modifier les contrats, leurs lignes, prix et quantités. Inclut la lecture." },
  { key: "contracts_delete", name: "Supprimer un contrat", desc: "Retirer définitivement un contrat. À réserver : rien ne le récupère." },
  /* Le calendrier se lit sans droit particulier : savoir ce qui est prévu
     n'est pas une faveur. Y écrire, si. */
  { key: "calendar",  name: "Gérer le calendrier", desc: "Poser, modifier et supprimer des évènements. Tout le monde peut les consulter." },
  { key: "users",     name: "Gérer l'équipe",      desc: "Ajouter des employés, créer des rôles et régler leurs droits." },
  { key: "publish",   name: "Publier en ligne",    desc: "Envoyer les modifications sur le site public." },
  { key: "theme",     name: "Gérer l'apparence",   desc: "Choisir le thème et les couleurs de tout le site, et décider si chacun peut se faire les siennes." },
  { key: "admin",     name: "Patron (tout)",       desc: "Accès complet : implique toutes les permissions." }
];

/* Couleurs proposées pour les rôles. */
window.MN_ROLE_COLORS = [
  "#ff2bd1", "#ff7ae0", "#c2551f", "#ffa92e", "#a8ff52",
  "#4fd8c0", "#7fd7e8", "#8b8bff", "#b8c4d4", "#ff3b5c"
];
