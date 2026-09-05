/* ==========================================================================
   Configuration de la V2 — le seul fichier à ouvrir pour régler le cadre.

   Tout ce qui se décide une fois et se lit partout vit ici : le bandeau bêta,
   l'adresse du catalogue, l'arborescence du menu. Ajouter une page se fait en
   ajoutant une ligne à NAV, et nulle part ailleurs.
   ========================================================================== */

window.V2 = window.V2 || {};

/* ---- Identité de la version --------------------------------------------- */

V2.VERSION = {
  numero: "2.0.0-beta.1",
  /* Tant que ceci est vrai, le bandeau et la pastille « BÊTA » s'affichent.
     Le jour du passage en production, une seule ligne à changer. */
  beta: true,
  /* La V2 écrit dans les mêmes données que la V1 : ce n'est pas un bac à
     sable. On le dit à l'écran plutôt que de le laisser découvrir. */
  donneesPartagees: true
};

/* ---- Données --------------------------------------------------------------
   La V2 vit dans un sous-dossier : le catalogue et les images restent ceux de
   la V1, un cran au-dessus. C'est voulu — les deux versions parlent du même
   atelier. */

window.MN_CONFIG = window.MN_CONFIG || {};
MN_CONFIG.catalogUrl = "../data/catalog.json";
MN_CONFIG.dutyFile = "../data/duty.json";
MN_CONFIG.imgDir = "../assets/img";

/* ---- Navigation -----------------------------------------------------------
   Une seule source pour la barre latérale, le menu mobile et le fil d'Ariane.

   `perm` : une des permissions listées, ou rien du tout pour une page
   ouverte. `groupe` range les entrées sous un intitulé ; un groupe dont
   aucune entrée n'est visible disparaît entièrement. */

V2.NAV = [
  {
    groupe: "Atelier",
    entrees: [
      /* La page d'accueil de la V2. Elle n'existe pas en V1, où le logo mène
         directement à la facturation. */
      { id: "dashboard", nom: "Tableau de bord", href: "index.html", icone: "grille" },
      { id: "facturation", nom: "Facturation", href: "facturation.html", icone: "recu",
        perm: ["bt"] },
      /* L'historique n'est pas une page : c'est une fenêtre sur la
         facturation. Depuis ailleurs on y va par l'ancre, et la page
         l'ouvre en arrivant. */
      { id: "historique", nom: "Historique", href: "facturation.html#historique",
        icone: "horloge", perm: ["bt"] }
    ]
  },
  {
    groupe: "Dossiers",
    entrees: [
      { id: "contrats", nom: "Contrats", href: "contrats.html", icone: "contrat",
        perm: ["contracts_view", "contracts", "contracts_delete"] },
      /* La blacklist se lit par celui qui reçoit le client. La réserver aux
         responsables reviendrait à ne pas l'avoir. */
      { id: "blacklist", nom: "Blacklist", href: "blacklist.html", icone: "alerte" },
      /* Le livret s'adresse d'abord à ceux qui arrivent : ouvert à tous,
         sans permission à demander. */
      { id: "livret", nom: "Livret", href: "livret.html", icone: "contrat" }
    ]
  },
  {
    groupe: "Employés",
    entrees: [
      { id: "equipe", nom: "Équipe", href: "equipe.html", icone: "equipe",
        perm: ["staff", "promote", "users"] },
      { id: "service", nom: "Service", href: "service.html", icone: "horloge",
        perm: ["duty", "duty_view", "duty_manage"] },
      { id: "calendrier", nom: "Calendrier", href: "calendrier.html", icone: "calendrier" }
    ]
  },
  {
    groupe: "Outils",
    entrees: [
      { id: "vehicules", nom: "Véhicules", href: "vehicules.html", icone: "vehicule" },
      /* Les émotes du serveur de jeu : un mémo, ouvert à tous. */
      { id: "emotes", nom: "Émotes", href: "emotes.html", icone: "etoile" }
    ]
  },
  {
    groupe: "Admin",
    entrees: [
      { id: "admin", nom: "Administration", href: "admin.html", icone: "reglages",
        perm: ["items", "users", "publish", "theme", "contracts", "admin"] }
    ]
  }
];

/* ---- Réglages d'affichage ------------------------------------------------ */

V2.UI = {
  /* Au-delà, la barre latérale est visible en permanence ; en dessous elle
     devient un tiroir. Doit rester en accord avec `--bp-sidebar` des styles. */
  seuilSidebar: 1024,
  /* Clés de rangement dans le navigateur, préfixées pour ne jamais écraser
     celles de la V1. */
  cles: {
    sidebar: "v2.sidebar",
    theme: "v2.theme"
  }
};
