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
        annonceEnTete() +
        salutation(session) +
        moi(session) +
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

  /* ---- L'annonce épinglée ------------------------------------------------------
     Elle tient le haut de la page et n'a pas de croix : seul celui qui l'a
     posée la retire, depuis l'administration ou d'ici. Une annonce qu'on peut
     écarter d'un clic n'est lue que par ceux qui l'auraient lue de toute
     façon. */

  function annonceEnTete() {
    const a = MNStore.annonce();
    if (!a) return "";
    const peutOter = V2Shell.peut("admin", "items");
    return '<section class="annonce annonce--' + U.esc(a.ton) + '">' +
      '<span class="annonce__ico">' + U.icone(a.ton === "alerte" ? "alerte" : "info") + "</span>" +
      '<div class="annonce__corps">' +
        (a.titre ? "<b>" + U.esc(a.titre) + "</b>" : "") +
        enParagraphes(a.texte) +
        '<p class="annonce__pied">' +
          (a.par ? "Par " + U.esc(a.par) : "") +
          (a.depuis
            ? (a.par ? ", le " : "Le ") + U.esc(new Date(a.depuis).toLocaleString("fr-FR",
                { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))
            : "") +
        "</p>" +
      "</div>" +
      (peutOter
        ? U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                         titre: "Retirer l'annonce", action: "a-oter" })
        : "") +
    "</section>";
  }

  /** Les retours à la ligne de l'annonce deviennent des paragraphes. */
  function enParagraphes(t) {
    return String(t || "").split(/\n+/).map(l => l.trim()).filter(Boolean)
      .map(l => "<p>" + U.esc(l) + "</p>").join("");
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

  /* ---- Moi -----------------------------------------------------------------
     Le reste de la page dit où en est l'atelier. Celle-ci dit où j'en suis,
     moi — la question qu'on se pose vraiment en arrivant le matin.

     Le verdict sur les heures vient de MNDuty, pas d'ici : la page Service
     affiche la même jauge, et deux calculs finiraient par dire deux choses. */

  function moi(s) {
    const e = MNDuty.etatSemaine(s.uid, MNStore.minimumPour(s.uid, MNAuth.atelier()));
    const enService = !!MNDuty.entryOf(s.uid);
    const averts = ((s.user && s.user.avertissements) || []).filter(MNStore.avertActif);

    /* Une jauge sans objectif ne mesure rien : on écrit alors la raison. */
    const heures =
      '<div class="rang moi__ligne">' +
        '<span>' + U.icone("horloge") + " Cette semaine</span>" +
        '<b class="pousse nombre">' + U.esc(MNDuty.dur(e.secondes, true)) + "</b>" +
      "</div>" +
      (e.exempt
        ? '<p class="champ__aide">' + U.esc(e.raison) + "</p>"
        : '<span class="jauge' + (e.fait ? " est-fait" : "") + '">' +
            '<span class="jauge__p" style="width:' + e.part + '%"></span></span>' +
          '<p class="champ__aide">' + U.esc(e.fait
            ? "objectif de " + e.objectif + " h atteint"
            : "encore " + MNDuty.dur(e.reste, true) + " avant " + e.objectif + " h") +
          "</p>");

    const dossier = averts.length
      ? '<div class="rang moi__ligne" style="margin-top:var(--e-3)">' +
          "<span>" + U.icone("alerte") + " À mon dossier</span>" +
          '<b class="pousse nombre">' + averts.length + "</b>" +
        "</div>" +
        '<p class="champ__aide">' + U.esc(averts.length > 1
          ? "avertissements en cours"
          : "avertissement en cours") + "</p>"
      : "";

    return '<div style="margin-bottom:var(--e-4)">' + U.carte({
      titre: enService ? "Tu es en service" : "Où j'en suis",
      actions: U.bouton(enService ? "Mon service" : "Pointer",
        { href: "service.html", variante: enService ? "fantome" : "principal",
          taille: "sm", icone: "horloge" }),
      corps: heures + dossier
    }) + "</div>";
  }

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
              '<span class="avatar avatar--sm">' + vignette(e) + "</span>" +
              "<b>" + U.esc(e.pseudo) + "</b>" +
              '<span class="pousse nombre muet txt-sm" data-depuis="' +
                U.esc(e.since) + '">' + U.esc(MNDuty.sinceDur(e.since, true)) + "</span>" +
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
    /* Retirer l'annonce depuis la page où on la lit : c'est là qu'on se dit
       qu'elle n'a plus lieu d'être. */
    const oter = hote.querySelector('[data-a="a-oter"]');
    if (oter) oter.addEventListener("click", async () => {
      const ok = await U.confirmer({
        titre: "Retirer l'annonce",
        message: "Elle disparaîtra du tableau de bord de tout le monde.",
        confirmer: "Retirer", danger: true
      });
      if (!ok) return;
      const c = MNStore.clone(MNStore.catalog());
      c.settings.annonce = { texte: "", titre: "", ton: "info",
                             depuis: "", par: "", ateliers: [] };
      MNStore.saveDraft(c);
      const vue = hote.querySelector(".annonce");
      if (vue) vue.remove();
      U.toast("Annonce retirée", "ok");
    });

    /* Les durées de service avancent : on les rafraîchit sans redessiner. */
    setInterval(() => {
      hote.querySelectorAll("[data-depuis]").forEach(n => {
        n.textContent = MNDuty.sinceDur(n.dataset.depuis, true);
      });
    }, 30000);
  }

  /**
   * Le rond d'une personne : sa photo si elle en a une, ses initiales sinon.
   * Le rond ne change pas de taille — une photo ne doit pas faire enfler la
   * ligne.
   */
  function vignette(x) {
    const src = MNStore.photoDeId(x && x.id);
    if (!src) return U.esc(U.initiales(x && x.pseudo));
    /* Une photo détourée laisse voir le cadre autour du sujet : on rogne son
       vide, dès que ses pixels sont lisibles. */
    MNImagier.serrer(src);
    return '<img class="av-photo" src="' + U.esc(src) +
      '" alt="" loading="lazy" decoding="async">';
  }
})();
