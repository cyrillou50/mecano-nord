/* ==========================================================================
   Page non encore refondue.

   Le squelette, la navigation et les droits sont déjà ceux de la V2 ; seul le
   contenu attend sa reprise. Plutôt qu'un lien mort dans le menu, la page
   existe, annonce son état et renvoie vers la V1 qui, elle, sait tout faire.

   Chaque page reprise remplace ce script par le sien dans son fichier HTML :
   rien d'autre à toucher.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;

  /* Ce que chaque page attend, décrit ici pour que la feuille de route soit
     lisible depuis l'écran et pas seulement depuis le README. */
  const PAGES = {
    contrats: {
      titre: "Contrats",
      perm: ["contracts_view", "contracts", "contracts_delete"],
      v1: "../contrats.html",
      quoi: "Le registre des contrats : lignes, troc en ressources, type, " +
            "expiration et sortie PDF."
    },
    calendrier: {
      titre: "Calendrier",
      v1: "../calendrier.html",
      quoi: "La grille mensuelle, les évènements et les congés de l'équipe."
    },
    service: {
      titre: "Service",
      perm: ["duty", "duty_view", "duty_manage"],
      v1: "../service.html",
      quoi: "Le pointage, les congés, l'historique et la correction des heures."
    },
    equipe: {
      titre: "Fiches",
      perm: ["staff", "promote", "users"],
      v1: "../equipe.html",
      quoi: "Les fiches employés : ancienneté, formations, carrière."
    },
    vehicules: {
      titre: "Véhicules",
      v1: "../vehicules.html",
      quoi: "Le parc, ses fiches, les propositions et leur validation."
    },
    admin: {
      titre: "Administration",
      perm: ["items", "users", "publish", "theme", "contracts", "admin"],
      v1: "../admin.html",
      quoi: "Le catalogue, les employés, les rôles, l'apparence et la publication. " +
            "C'est la plus grande des pages : elle sera reprise en dernier, " +
            "onglet par onglet."
    }
  };

  /* L'identifiant vient du nom du fichier : une page de plus ne demande donc
     aucune ligne de JavaScript. */
  const id = (location.pathname.split("/").pop() || "").replace(".html", "");
  const p = PAGES[id] || { titre: "Page", v1: "../index.html", quoi: "" };

  V2Shell.demarrer({
    page: id,
    titre: p.titre,
    pret: function (session, hote) {
      if (p.perm && !V2Shell.peut.apply(null, p.perm.concat("admin"))) {
        return V2Shell.refuser(hote, "cette page");
      }

      hote.innerHTML =
        '<div style="max-width:var(--l-lecture)">' +
          U.carte({
            titre: p.titre + " — reprise en cours",
            corps:
              '<div class="pile">' +
                U.alerte({
                  ton: "alerte",
                  titre: "Cette page n'est pas encore refondue",
                  texte: "Le cadre de la V2 est en place, son contenu arrive. " +
                         "En attendant, la version officielle reste complète et " +
                         "fonctionne normalement."
                }) +
                (p.quoi ? '<p class="muet">' + U.esc(p.quoi) + "</p>" : "") +
              "</div>",
            pied:
              '<div class="rang">' +
                U.bouton("Ouvrir dans la version officielle",
                  { href: p.v1, variante: "principal", icone: "fleche" }) +
                U.bouton("Tableau de bord", { href: "index.html", variante: "fantome" }) +
              "</div>"
          }) +
        "</div>";
    }
  });
})();
