/* ==========================================================================
   Tableau de bord — page nouvelle, absente de la V1.

   Elle répond à une question que la V1 ne posait nulle part : « où en est
   l'atelier, là, maintenant ? ». Rien n'y est saisi ; tout y est un raccourci
   vers la page qui, elle, sait modifier.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;

  V2Shell.demarrer({
    page: "dashboard",
    titre: "Tableau de bord",
    pret: async function (session, hote) {
      /* On dessine d'abord le squelette : les quatre sources ci-dessous
         viennent de trois serveurs différents et n'arrivent pas ensemble. */
      hote.innerHTML = chargement();

      /* `allSettled` et non `all` : un service en panne ne doit pas emporter
         toute la page — les autres chiffres restent utiles. */
      const [duty, parc, reg, ag] = await Promise.allSettled([
        MNDuty.load(true), MNParc.load(true), MNRegistre.load(true), MNAgenda.load(true)
      ]);

      hote.innerHTML =
        salutation(session) +
        chiffres() +
        '<div class="cols-2" style="margin-top:var(--e-4)">' +
          enService() +
          aVenir() +
        "</div>" +
        pannes([
          ["Service", duty], ["Parc", parc], ["Contrats", reg], ["Agenda", ag]
        ]);

      brancher(hote);
    }
  });

  /* ---- Blocs ---------------------------------------------------------------- */

  function chargement() {
    return '<div class="grille grille--sm">' +
      Array(4).fill('<div class="squelette squelette--tuile"></div>').join("") + "</div>";
  }

  function salutation(s) {
    const h = new Date().getHours();
    const mot = h < 6 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
    return '<header class="entete"><div class="entete__ligne"><div>' +
      "<h1>" + mot + ", " + U.esc(s.pseudo) + "</h1>" +
      '<p class="entete__sous">' + U.esc(dateLongue()) + "</p>" +
      "</div></div></header>";
  }

  const dateLongue = () => new Date().toLocaleDateString("fr-FR",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  /** Les quatre chiffres qui disent l'état de l'atelier en un coup d'œil. */
  function chiffres() {
    const enDuty = MNDuty.board().onDuty.length;
    const sem = MNDuty.totals(7).reduce((n, u) => n + u.seconds, 0);

    const vehs = MNParc.parc().vehicles;
    const attente = vehs.filter(v => v.status === "attente" || v.propose).length;

    const cts = MNRegistre.contrats();
    const actifs = cts.filter(c => c.etat === "actif").length;
    const perimes = cts.filter(c => MNStore.contratExpire(c)).length;

    return '<div class="grille grille--sm">' +
      U.tuile({ label: "En service", valeur: enDuty, icone: "horloge",
        ton: enDuty ? "succes" : "", pied: MNDuty.dur(sem, true) + " cette semaine" }) +
      U.tuile({ label: "Contrats en cours", valeur: actifs, icone: "contrat",
        ton: "action", pied: perimes ? perimes + " expiré" + (perimes > 1 ? "s" : "") : "aucun expiré" }) +
      U.tuile({ label: "Véhicules", valeur: vehs.length, icone: "vehicule",
        pied: attente ? attente + " en attente de validation" : "parc à jour",
        ton: attente ? "alerte" : "" }) +
      U.tuile({ label: "Objets au catalogue", valeur: MNStore.catalog().items.filter(i => i.enabled).length,
        icone: "boite", pied: MNStore.catalog().resources.length + " ressources" }) +
    "</div>";
  }

  function enService() {
    const l = MNDuty.board().onDuty.slice()
      .sort((a, b) => new Date(a.since) - new Date(b.since));

    return U.carte({
      titre: "En service",
      actions: U.bouton("Voir", { href: "service.html", variante: "fantome", taille: "sm" }),
      corps: l.length
        ? '<div class="pile pile--sm">' + l.map(e =>
            '<div class="rang">' +
              '<span class="avatar avatar--sm">' + U.esc(U.initiales(e.pseudo)) + "</span>" +
              "<b>" + U.esc(e.pseudo) + "</b>" +
              '<span class="pousse nombre muet txt-sm">' + U.esc(MNDuty.sinceDur(e.since, true)) + "</span>" +
            "</div>").join("") + "</div>"
        : U.vide({ icone: "horloge", titre: "Atelier vide", texte: "Personne n'a pointé." })
    });
  }

  /** Les sept prochains jours : évènements et congés, mêlés et datés. */
  function aVenir() {
    const auj = MNStore.jourLocal();
    const dans7 = (function () {
      const d = new Date(); d.setDate(d.getDate() + 7);
      return MNStore.jourLocal(d);
    })();

    const evs = MNAgenda.events()
      .filter(e => e.jour >= auj && e.jour <= dans7)
      .map(e => ({ jour: e.jour, quoi: e.titre, ton: "action", heure: e.heure }));

    let cgs = [];
    try {
      cgs = MNDuty.conges(true)
        .filter(c => c.to >= auj && c.from <= dans7)
        .map(c => ({ jour: c.from < auj ? auj : c.from, quoi: c.pseudo + " en congés", ton: "" }));
    } catch (_) { /* service indisponible */ }

    const tout = evs.concat(cgs).sort((a, b) =>
      a.jour === b.jour ? (a.heure || "").localeCompare(b.heure || "") : a.jour.localeCompare(b.jour));

    return U.carte({
      titre: "Les sept prochains jours",
      actions: U.bouton("Calendrier", { href: "calendrier.html", variante: "fantome", taille: "sm" }),
      corps: tout.length
        ? '<div class="pile pile--sm">' + tout.slice(0, 8).map(x =>
            '<div class="rang">' +
              U.etiquette(jourCourt(x.jour), x.ton) +
              "<span>" + U.esc(x.quoi) + "</span>" +
              (x.heure ? '<span class="pousse muet txt-sm nombre">' + U.esc(x.heure) + "</span>" : "") +
            "</div>").join("") + "</div>"
        : U.vide({ icone: "calendrier", titre: "Rien de prévu",
                   texte: "Aucun évènement ni congé dans la semaine qui vient." })
    });
  }

  const jourCourt = j => {
    const d = new Date(String(j) + "T12:00:00");
    return isNaN(d) ? j : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  };

  /* Les services indisponibles se disent une fois, en bas, plutôt que de
     laisser des zéros trompeurs dans les tuiles. */
  function pannes(paires) {
    const ko = paires.filter(p => p[1].status === "rejected").map(p => p[0]);
    const soucis = [MNParc.souci(), MNRegistre.souci(), MNAgenda.souci(), MNDuty.souci()]
      .filter(Boolean);

    if (!ko.length && !soucis.length) return "";
    return '<div style="margin-top:var(--e-4)">' + U.alerte({
      ton: "alerte",
      titre: "Certaines données n'ont pas pu être lues",
      texte: (ko.length ? ko.join(", ") + ". " : "") + soucis.join(" ")
    }) + "</div>";
  }

  function brancher(hote) {
    /* Les durées de service avancent : on les rafraîchit sans redessiner. */
    setInterval(() => {
      const l = MNDuty.board().onDuty.slice()
        .sort((a, b) => new Date(a.since) - new Date(b.since));
      hote.querySelectorAll(".carte .rang .pousse.nombre").forEach((n, i) => {
        if (l[i]) n.textContent = MNDuty.sinceDur(l[i].since, true);
      });
    }, 30000);
  }
})();
