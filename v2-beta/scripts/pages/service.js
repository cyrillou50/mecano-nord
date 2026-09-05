/* ==========================================================================
   Service — pointage, congés, historique.

   Reprise fidèle de la V1 : prise et fin de service, congés à plusieurs
   périodes, pointage à la place de quelqu'un, clôture d'un oubli à l'heure
   réelle, correction des horaires enregistrés.

   Ce qui change : la page était une pile de quatre panneaux qu'il fallait
   parcourir. Elle se range en onglets — on pointe cent fois par jour, on
   consulte l'historique une fois par semaine.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  let hote = null, moi = null;
  let peutPointer = false, peutVoir = false, peutGerer = false;

  /* Deux niveaux plutôt qu'une rangée unique : une rangée de six ne dit pas ce
     qui va avec quoi. La catégorie répond à « de qui parle-t-on » — l'atelier
     maintenant, moi, l'équipe — et le second niveau à « quoi ». Il ne s'affiche
     que là où il y a vraiment un choix à faire. */
  const CATEGORIES = [
    ["atelier", "L'atelier"],
    ["moi", "Moi"],
    ["equipe", "L'équipe"]
  ];

  /* Une seule table pour les deux barres et pour le contenu : impossible qu'un
     onglet apparaisse quelque part et manque ailleurs. `droit` vide = pour
     tout le monde. */
  const VUES = [
    { id: "atelier",  cat: "atelier", nom: "En service",         droit: "" },
    { id: "temps",    cat: "moi",     nom: "Mon temps",          droit: "point" },
    { id: "moi",      cat: "moi",     nom: "Mes congés",         droit: "point" },
    { id: "equipe",   cat: "equipe",  nom: "Congés",             droit: "voir" },
    { id: "eqtemps",  cat: "equipe",  nom: "Temps de service",   droit: "voir" },
    { id: "plan",     cat: "equipe",  nom: "Planning",           droit: "voir" },
    { id: "histo",    cat: "equipe",  nom: "Derniers pointages", droit: "voir" }
  ];

  const vuesDe = cat => VUES.filter(v =>
    v.cat === cat && (!v.droit || (v.droit === "point" ? peutPointer : peutVoir)));

  let onglet = "atelier";

  V2Shell.demarrer({
    page: "service",
    titre: "Service",
    pret: async function (session, h) {
      hote = h; moi = session;
      if (!V2Shell.peut("duty", "duty_view", "duty_manage", "admin")) {
        return V2Shell.refuser(hote, "le service");
      }
      peutPointer = !!moi.uid && V2Shell.peut("duty", "admin");
      peutGerer = V2Shell.peut("duty_manage", "admin");
      peutVoir = V2Shell.peut("duty_view", "admin") || peutGerer;

      hote.innerHTML = U.squelette(4);
      await MNDuty.load(true).catch(e => console.error(e));
      dessiner();

      relireSouvent();
    }
  });

  /* Le tableau est partagé : on le relit tout seul. Vite tant que la page est
     regardée, au ralenti quand l'onglet passe à l'arrière-plan — inutile de
     réveiller le VPS pour un écran que personne ne lit. Au retour on relit
     immédiatement, pour ne pas laisser un tableau périmé sous les yeux. */
  function relireSouvent() {
    let t = null;
    const relire = async () => {
      if (document.querySelector(".modale-fond")) return;   // pas au milieu d'une saisie
      await MNDuty.load(true).catch(() => {});
      dessiner();
    };
    const cadencer = () => {
      clearInterval(t);
      t = setInterval(relire, document.hidden ? 180000 : 25000);
    };
    document.addEventListener("visibilitychange", () => {
      cadencer();
      if (!document.hidden) relire();
    });
    cadencer();
  }

  /* ---- Rendu ------------------------------------------------------------------ */

  function dessiner() {
    const cats = CATEGORIES.filter(c => vuesDe(c[0]).length);

    /* Un droit retiré peut faire disparaître la vue retenue : on retombe sur
       la première plutôt que de laisser la page vide. */
    let v = VUES.find(x => x.id === onglet);
    if (!v || !vuesDe(v.cat).some(x => x.id === v.id)) {
      v = vuesDe(cats[0][0])[0];
      onglet = v.id;
    }
    const soeurs = vuesDe(v.cat);

    hote.innerHTML =
      monEtat() +
      '<div class="onglets-nav">' +
        '<div class="onglets">' + cats.map(c =>
          '<button class="onglet' + (c[0] === v.cat ? " is-actif" : "") +
            '" data-cat="' + c[0] + '">' + U.esc(c[1]) + "</button>").join("") + "</div>" +
        /* Pas de second niveau là où il n'y a rien à choisir. */
        (soeurs.length > 1
          ? '<div class="onglets onglets--sous">' + soeurs.map(s =>
              '<button class="onglet' + (s.id === onglet ? " is-actif" : "") +
                '" data-o="' + s.id + '">' + U.esc(s.nom) + "</button>").join("") + "</div>"
          : "") +
      "</div>" +
      '<div id="s-vue"></div>';

    hote.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
      const l = vuesDe(b.dataset.cat);
      if (!l.length || l.some(x => x.id === onglet)) return;
      onglet = l[0].id;
      dessiner();
    }));
    hote.querySelectorAll("[data-o]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.o === onglet) return;
      onglet = b.dataset.o; dessiner();
    }));

    vue();
    brancherEtat();

    const s = MNDuty.souci();
    if (s) hote.insertAdjacentHTML("afterbegin",
      '<div style="margin-bottom:var(--e-4)">' +
        U.alerte({ ton: "erreur", titre: s,
          texte: "Le tableau affiché peut être incomplet." }) + "</div>");
  }

  /** La carte du haut : suis-je en service, et le bouton qui va avec. */
  function monEtat() {
    if (!peutPointer) return "";
    const mien = MNDuty.entryOf(moi.uid);
    const enConge = MNDuty.enConge(moi.uid);

    return '<div class="s-etat' + (mien ? " est-actif" : "") + '">' +
      '<div class="s-etat__ico">' + U.icone(mien ? "check" : "horloge") + "</div>" +
      '<div class="s-etat__txt">' +
        "<b>" + (mien ? "Tu es en service" : "Tu n'es pas en service") + "</b>" +
        "<span>" + (mien
          ? "Depuis " + new Date(mien.since).toLocaleTimeString("fr-FR",
              { hour: "2-digit", minute: "2-digit" }) +
            ' — <b class="nombre" id="s-duree">' + MNDuty.sinceDur(mien.since, true) + "</b>"
          : "Pointe en arrivant à l'atelier, l'équipe est prévenue sur Discord.") + "</span>" +
        /* Le chiffre de la semaine se lit d'un coup d'œil ; l'onglet « Mon
           temps » est là pour le détail. */
        '<span><b class="nombre" id="s-sem">' +
          U.esc(MNDuty.dur(MNDuty.secondsFor(moi.uid, MNDuty.weekStart()), true)) +
          "</b> cette semaine</span>" +
      "</div>" +
      (enConge ? U.etiquette("En congés", "info") : "") +
      U.bouton(mien ? "Quitter le service" : "Prendre mon service",
        { variante: mien ? "danger" : "principal", icone: mien ? "sortie" : "check",
          action: "pointer" }) +
    "</div>";
  }

  function brancherEtat() {
    const b = hote.querySelector('[data-a="pointer"]');
    if (b) b.addEventListener("click", pointer);

    /* La durée avance : on la remplace sans redessiner la page. */
    clearInterval(brancherEtat._t);
    brancherEtat._t = setInterval(() => {
      const mien = MNDuty.entryOf(moi.uid);
      if (!mien) return;
      const n = document.getElementById("s-duree");
      if (n) n.textContent = MNDuty.sinceDur(mien.since, true);

      /* Mes compteurs avancent avec elle : les laisser figés donnerait
         l'impression que le service en cours ne compte pas. */
      const sem = MNDuty.secondsFor(moi.uid, MNDuty.weekStart());
      const maj = (sel, txt) => {
        const e = document.querySelector(sel);
        if (e) e.textContent = txt;
      };
      maj("#s-sem", MNDuty.dur(sem, true));
      maj('[data-mien="sem"]', MNDuty.dur(sem, true));
      maj('[data-mien="sept"]',
        MNDuty.dur(MNDuty.secondsFor(moi.uid, Date.now() - 7 * 86400000), true));
      maj('[data-mien="tot"]', MNDuty.dur(MNDuty.secondsFor(moi.uid), true));
      const g = document.querySelector('[data-mien="jauge"]');
      if (g) g.innerHTML = jauge(sem);
    }, 30000);
  }

  async function pointer(e) {
    const btn = e.currentTarget;
    const mien = MNDuty.entryOf(moi.uid);
    btn.disabled = true;

    const r = mien
      ? await MNDuty.clockOut({ uid: moi.uid, pseudo: moi.pseudo, role: moi.role })
      : await MNDuty.clockIn({ uid: moi.uid, pseudo: moi.pseudo, role: moi.role,
                               roleId: moi.roleId });
    dessiner();

    if (r.already) return U.toast(mien ? "Tu n'étais plus en service" : "Déjà en service", "info");
    if (r.shareError) return U.toast("Enregistré ici, mais pas partagé : " + r.shareError, "err");
    U.toast(mien ? "Service terminé (" + MNDuty.dur(r.seconds, true) + ")" : "Bon service", "ok");
  }

  /* ---- Onglets --------------------------------------------------------------------- */

  function vue() {
    const z = $("#s-vue");
    if (onglet === "atelier") return atelier(z);
    if (onglet === "temps") return monTemps(z);
    if (onglet === "moi") return mesConges(z);
    if (onglet === "equipe") return congesEquipe(z);
    if (onglet === "eqtemps") return tempsEquipe(z);
    if (onglet === "plan") return planning(z);
    return pointages(z);
  }

  /* ---- Planning ---------------------------------------------------------------
     Le pointage dit qui a travaillé et combien ; il ne dit pas quand. C'est
     pourtant la question qu'on se pose en ouvrant : y a-t-il quelqu'un à 14 h
     le mardi, et qui tient les nuits.

     Deux grilles, parce qu'elles répondent à deux questions. La semaine
     montre les trous ; le jour montre qui les aurait tenus. */

  let planSemaine = 0;      // 0 = semaine en cours, -1 = la précédente
  let planJour = null;      // le jour déplié, ou null

  function planning(z) {
    const b = MNDuty.board();
    const s = MNPlanning.semaine(b.log, b.onDuty, planSemaine);
    const t = MNPlanning.trous(s);
    const tenu = t.total - t.vides;

    z.innerHTML = U.carte({
      titre: "Planning",
      actions:
        U.bouton("Précédente", { taille: "sm", icone: "chevron", action: "sem-1" }) +
        '<span class="champ__aide" style="min-width:160px;text-align:center">' +
          U.esc(MNPlanning.titre(planSemaine)) + "</span>" +
        U.bouton("Suivante", { taille: "sm", icone: "chevron", action: "sem1",
                               desactive: planSemaine >= 0 }),
      corps:
        '<div class="grille grille--sm" style="margin-bottom:var(--e-4)">' +
          U.tuile({ label: "Heures tenues", valeur: tenu + " / " + t.total,
                    pied: planSemaine === 0 ? "sur les heures déjà écoulées"
                                            : "sur la semaine" }) +
          U.tuile({ label: "Heures sans personne", valeur: String(t.vides),
                    ton: t.vides ? "alerte" : "" }) +
          U.tuile({ label: "Plus long trou", valeur: t.pire + " h" }) +
        "</div>" +
        '<p class="champ__aide" style="margin-bottom:var(--e-2)">Le chiffre ' +
          "d'une case, c'est le nombre de personnes en service à cette heure-là. " +
          "Clique un jour pour voir qui.</p>" +
        MNPlanning.grilleSemaine(s, planJour) +
        (planJour === null
          ? ""
          : '<h4 style="margin:var(--e-4) 0 var(--e-2)">' +
            U.esc(MNPlanning.JOURS[planJour]) + " — qui était là</h4>" +
            MNPlanning.grilleJour(s, planJour))
    });

    z.querySelectorAll('[data-a^="sem"]').forEach(x =>
      x.addEventListener("click", () => {
        const n = planSemaine + (x.dataset.a === "sem1" ? 1 : -1);
        /* Pas de semaine à venir : personne n'y a encore pointé. */
        if (n > 0) return;
        planSemaine = n;
        planJour = null;
        planning(z);
      }));

    z.querySelectorAll("[data-jour]").forEach(x =>
      x.addEventListener("click", () => {
        planJour = planJour === Number(x.dataset.jour) ? null : Number(x.dataset.jour);
        planning(z);
      }));
  }

  function atelier(z) {
    const l = MNDuty.board().onDuty.slice()
      .sort((a, b) => new Date(a.since) - new Date(b.since));

    z.innerHTML = U.carte({
      titre: "En service",
      actions:
        U.etiquette(l.length + (l.length > 1 ? " personnes" : " personne"),
          l.length ? "succes" : "") +
        (peutGerer ? U.bouton("Pointer quelqu'un",
          { variante: "fantome", taille: "sm", icone: "equipe", action: "autre" }) : "") +
        U.bouton("", { icone: "rafraichir", variante: "fantome", taille: "sm",
                       titre: "Actualiser", action: "maj" }),
      corps: l.length
        ? '<div class="pile pile--sm">' + l.map(e => {
            const role = MNStore.roleById(e.roleId);
            return '<div class="rang s-rang">' +
              '<span class="s-point"></span>' +
              '<span class="avatar avatar--sm"' +
                (role ? ' style="background:' + U.esc(role.color) + '"' : "") + ">" +
                U.esc(U.initiales(e.pseudo)) + "</span>" +
              "<b>" + U.esc(e.pseudo) + "</b>" +
              (role ? U.etiquette(role.name) : "") +
              '<span class="pousse nombre muet" data-depuis="' + U.esc(e.since) + '">' +
                U.esc(MNDuty.sinceDur(e.since, true)) + "</span>" +
              (peutGerer ? U.bouton("", { icone: "sortie", variante: "fantome", taille: "sm",
                titre: "Mettre fin à son service", action: "out-" + e.id }) : "") +
            "</div>";
          }).join("") + "</div>"
        : U.vide({ icone: "horloge", titre: "Atelier vide",
                   texte: "Personne n'a pointé pour le moment." })
    });

    z.querySelector('[data-a="maj"]').addEventListener("click", async () => {
      await MNDuty.load(true); dessiner(); U.toast("Tableau actualisé", "ok");
    });
    const au = z.querySelector('[data-a="autre"]');
    if (au) au.addEventListener("click", pointerQuelquun);
    z.querySelectorAll("[data-a^='out-']").forEach(b =>
      b.addEventListener("click", () => cloturer(b.dataset.a.slice(4))));
  }

  /* ---- Mon temps ----------------------------------------------------------------------
     La page savait dire le temps de toute l'équipe à qui a le droit de le
     voir, et rien du sien à celui qui n'a que le pointage. « Combien j'ai fait
     cette semaine » est pourtant la première question qu'on se pose ici. */

  /* Heures attendues sur la semaine, réglées dans l'administration, garage par
     garage. Elles viennent du catalogue déjà chargé : rien à demander au
     serveur, et la jauge s'affiche du premier coup. */
  const objectifIci = () => MNStore.minimumPour(moi && moi.uid, MNAuth.atelier());

  const hhmm = d => new Date(d).toLocaleTimeString("fr-FR",
    { hour: "2-digit", minute: "2-digit" });

  /**
   * Ai-je posé des congés sur cette semaine ? On regarde la semaine entière,
   * pas seulement les jours passés : des congés prévus pour vendredi comptent
   * déjà le lundi, exactement comme dans le récapitulatif du dimanche.
   */
  function congesCetteSemaine() {
    const lundi = MNDuty.weekStart();
    const a = MNDuty.jourLocal(new Date(lundi));
    const b = MNDuty.jourLocal(new Date(lundi + 6 * 86400000));
    return MNDuty.congesOf(moi.uid, true).some(c => c.from <= b && c.to >= a);
  }

  /** Où j'en suis des heures attendues cette semaine. */
  function jauge(sec) {
    const objectif = objectifIci();
    if (!objectif) return "";
    /* Exempté : aucun minimum ne lui est demandé, il n'y a donc pas de reste
       à faire à afficher. */
    if (MNDuty.sansMinimum(moi.uid)) return U.esc("aucun minimum hebdomadaire attendu");
    /* Une première semaine n'est pas une semaine entière : on ne réclame pas
       à quelqu'un les jours d'avant son arrivée. */
    if (MNDuty.premiereSemaine(moi.uid)) {
      return U.esc("arrivé cette semaine — aucun minimum attendu");
    }
    /* Un congé posé n'est pas un manquement : on ne réclame pas des heures à
       quelqu'un qui avait prévu de ne pas être là, et le récapitulatif du
       dimanche ne le signalera pas non plus. */
    if (congesCetteSemaine()) return U.esc("congés cette semaine — aucun minimum attendu");
    const but = objectif * 3600;
    const fait = sec >= but;
    return '<span class="jauge' + (fait ? " est-fait" : "") + '">' +
        '<span class="jauge__p" style="width:' +
          Math.min(100, Math.round((sec / but) * 100)) + '%"></span></span>' +
      U.esc(fait
        ? "objectif de " + objectif + " h atteint"
        : "encore " + MNDuty.dur(but - sec, true) + " avant " + objectif + " h");
  }

  function monTemps(z) {
    const on = !!MNDuty.entryOf(moi.uid);
    const sem = MNDuty.secondsFor(moi.uid, MNDuty.weekStart());
    const sept = MNDuty.secondsFor(moi.uid, Date.now() - 7 * 86400000);
    const tot = MNDuty.secondsFor(moi.uid);
    const log = MNDuty.logOf(moi.uid);
    const moy = log.length
      ? Math.round(log.reduce((n, e) => n + e.seconds, 0) / log.length) : 0;

    /* La tuile de la semaine porte la jauge : `U.tuile` échappe son pied, or
       il y a ici du balisage. */
    const tuileSemaine =
      '<div class="tuile' + (on ? " tuile--succes" : "") + '">' +
        '<span class="tuile__label">' + U.icone("horloge") + "Cette semaine</span>" +
        '<span class="tuile__val nombre" data-mien="sem">' +
          U.esc(MNDuty.dur(sem, true)) + "</span>" +
        '<span class="tuile__pied" data-mien="jauge">' + jauge(sem) + "</span>" +
      "</div>";

    z.innerHTML =
      '<div class="grille grille--sm" style="margin-bottom:var(--e-4)">' +
        tuileSemaine +
        '<div class="tuile"><span class="tuile__label">' + U.icone("calendrier") +
          "7 derniers jours</span>" +
          '<span class="tuile__val nombre" data-mien="sept">' +
            U.esc(MNDuty.dur(sept, true)) + "</span></div>" +
        '<div class="tuile"><span class="tuile__label">' + U.icone("horloge") +
          "Total</span>" +
          '<span class="tuile__val nombre" data-mien="tot">' +
            U.esc(MNDuty.dur(tot, true)) + "</span>" +
          '<span class="tuile__pied">' +
            U.esc(log.length + " service" + (log.length > 1 ? "s" : "")) + "</span></div>" +
        U.tuile({ label: "Moyenne par service", icone: "etoile",
                  valeur: moy ? MNDuty.dur(moy, true) : "—" }) +
      "</div>" +

      /* Ses propres pointages, même pour qui n'a pas le droit de voir ceux des
         autres : vérifier une heure qu'on croit fausse est un besoin courant,
         et ça n'oblige personne à demander à un gérant. */
      U.carte({
        titre: "Mes derniers services",
        actions: log.length ? U.etiquette(log.length + " au total") : "",
        corps: log.length
          ? '<div class="pile pile--sm">' + log.slice(0, 8).map(e =>
              '<div class="rang">' +
                "<b>" + U.esc(new Date(e.in).toLocaleDateString("fr-FR",
                  { weekday: "long", day: "2-digit", month: "2-digit" })) + "</b>" +
                U.etiquette(hhmm(e.in) + " → " + hhmm(e.out)) +
                (e.forced ? U.etiquette("sorti par un gérant") : "") +
                (e.corrigePar ? U.etiquette("horaires corrigés") : "") +
                '<span class="pousse nombre">' + U.esc(MNDuty.dur(e.seconds)) + "</span>" +
              "</div>").join("") + "</div>"
          : U.vide({ icone: "horloge", titre: "Aucun service terminé",
                     texte: "Ton temps s'affichera ici dès ton premier pointage." })
      });
  }


  /* ---- Congés ------------------------------------------------------------------------ */

  const jourCourt = j => {
    const d = new Date(String(j) + "T12:00:00");
    if (isNaN(d)) return String(j);
    const o = { day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    return d.toLocaleDateString("fr-FR", o);
  };
  const periode = c => "du " + jourCourt(c.from) + " au " + jourCourt(c.to) +
    " · " + MNDuty.nbJours(c.from, c.to) + " jour" + (MNDuty.nbJours(c.from, c.to) > 1 ? "s" : "");

  /* ---- Historique -------------------------------------------------------------
     Les périodes passées n'ont jamais été effacées, seulement masquées : par
     défaut on ne montre que ce qui vient, parce que c'est ce qu'on consulte
     tous les jours. Mais « combien de jours a-t-il pris cette année » est une
     question qui se pose, et il n'y avait aucun moyen d'y répondre.

     "" = en cours et à venir, "tout" = depuis toujours, sinon une année. */

  let anneeConges = "";

  function etatConge(c) {
    const j = MNDuty.jourLocal();
    if (c.to < j) return "passe";
    if (c.from <= j) return "encours";
    return "avenir";
  }

  const PUCE = {
    encours: () => U.etiquette("en cours", "info"),
    avenir: () => U.etiquette("à venir"),
    passe: () => U.etiquette("passés")
  };

  /** Les années où des congés ont été posés, la plus récente d'abord. */
  function anneesConges(tous) {
    const vues = {};
    tous.forEach(c => { vues[String(c.from).slice(0, 4)] = true; });
    return Object.keys(vues).filter(a => /^\d{4}$/.test(a)).sort().reverse();
  }

  function filtrerConges(tous) {
    if (!anneeConges) {
      const j = MNDuty.jourLocal();
      return tous.filter(c => c.to >= j).sort((a, b) => a.from.localeCompare(b.from));
    }
    /* En historique, le plus récent d'abord : on remonte le temps. */
    const l = anneeConges === "tout"
      ? tous.slice()
      /* Une période à cheval sur deux années compte dans les deux. */
      : tous.filter(c => c.from <= anneeConges + "-12-31" && c.to >= anneeConges + "-01-01");
    return l.sort((a, b) => b.from.localeCompare(a.from));
  }

  function selecteurConges(tous) {
    const annees = anneesConges(tous);
    if (!annees.length) return "";
    const opt = (v, nom) => '<option value="' + v + '"' +
      (v === anneeConges ? " selected" : "") + ">" + nom + "</option>";
    return '<select class="liste liste--sm" data-annee>' +
      opt("", "En cours et à venir") +
      annees.map(a => opt(a, "Année " + a)).join("") +
      opt("tout", "Depuis toujours") +
    "</select>";
  }

  /** « 3 périodes · 24 jours » — ce qu'on vient chercher dans un historique. */
  function bilanConges(l) {
    if (!l.length || !anneeConges) return "";
    const jours = l.reduce((n, c) => n + MNDuty.nbJours(c.from, c.to), 0);
    return '<p class="champ__aide" style="margin-top:var(--e-3)">' + l.length + " période" +
      (l.length > 1 ? "s" : "") + " · <b>" + jours + " jour" + (jours > 1 ? "s" : "") +
      "</b> au total.</p>";
  }

  function mesConges(z) {
    const tous = MNDuty.congesOf(moi.uid, true);
    const l = filtrerConges(tous);

    z.innerHTML = U.carte({
      titre: "Mes congés",
      actions:
        (MNDuty.enConge(moi.uid) ? U.etiquette("En congés", "info") : "") +
        selecteurConges(tous) +
        U.bouton(tous.length ? "Ajouter une période" : "Poser des congés",
          { variante: "principal", taille: "sm", icone: "calendrier", action: "poser" }),
      corps: l.length
        ? '<div class="pile pile--sm">' + l.map(c =>
            '<div class="rang s-rang' + (etatConge(c) === "passe" ? " est-eteint" : "") + '">' +
              "<b>" + U.esc(periode(c)) + "</b>" +
              PUCE[etatConge(c)]() +
              (c.note ? '<span class="muet txt-sm">' + U.esc(c.note) + "</span>" : "") +
              '<span class="pousse"></span>' +
              U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                titre: "Modifier", action: "ed-" + c.cid }) +
              U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                titre: "Annuler", action: "rm-" + c.cid }) +
            "</div>").join("") + "</div>" + bilanConges(l)
        : U.vide({ icone: "calendrier",
                   titre: anneeConges ? "Aucun congé sur cette période"
                                      : "Aucune absence prévue",
                   texte: anneeConges
                     ? "Rien n'a été posé dans cet intervalle."
                     : "Préviens l'équipe de tes dates, elles partent sur Discord." })
    });
    brancherConges(z);
  }

  function congesEquipe(z) {
    const tous = MNDuty.conges(true);
    const l = filtrerConges(tous);

    z.innerHTML = U.carte({
      titre: "Congés de l'équipe",
      actions: selecteurConges(tous) +
        (peutGerer
          ? U.bouton("Poser pour quelqu'un", { variante: "fantome", taille: "sm",
              icone: "calendrier", action: "pour" })
          : ""),
      corps: l.length
        ? U.tableau(
            [{ nom: "Employé", rendu: c => '<span class="rang">' +
                '<span class="avatar avatar--sm">' + U.esc(U.initiales(c.pseudo)) + "</span>" +
                U.esc(c.pseudo) + "</span>" },
             { nom: "Période", rendu: c => U.esc(periode(c)) },
             { nom: "État", rendu: c => PUCE[etatConge(c)]() },
             { nom: "Note", rendu: c => U.esc(c.note || "—") },
             { nom: "", rendu: c => peutGerer
                 ? U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                     titre: "Modifier", action: "ed-" + c.cid }) +
                   U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                     titre: "Annuler", action: "rm-" + c.cid })
                 : "" }],
            l) + bilanConges(l)
        : U.vide({ icone: "calendrier",
                   titre: anneeConges ? "Aucun congé sur cette période"
                                      : "Personne en congés",
                   texte: anneeConges
                     ? "Personne n'a posé de congés dans cet intervalle."
                     : "Aucune absence n'est posée." })
    });
    brancherConges(z);
  }

  function brancherConges(z) {
    /* Le filtre est commun aux deux onglets : passer de « à venir » à
       « année 2025 » puis changer d'onglet doit garder la même lecture. */
    const an = z.querySelector("[data-annee]");
    if (an) an.addEventListener("change", () => { anneeConges = an.value; vue(); });

    z.querySelectorAll("[data-a^='ed-']").forEach(b => b.addEventListener("click", () => {
      const c = MNDuty.congeById(b.dataset.a.slice(3));
      if (c) poserConge(c.id, c.pseudo, c.roleId, c.cid);
    }));
    z.querySelectorAll("[data-a^='rm-']").forEach(b => b.addEventListener("click", () =>
      retirerConge(b.dataset.a.slice(3))));
    const p = z.querySelector('[data-a="poser"]');
    if (p) p.addEventListener("click", () =>
      poserConge(moi.uid, moi.pseudo, moi.roleId, ""));
    const q = z.querySelector('[data-a="pour"]');
    if (q) q.addEventListener("click", congeAutrui);
  }

  function poserConge(uid, pseudo, roleId, remplace) {
    const c = remplace ? MNDuty.congeById(remplace) : null;
    const auj = MNDuty.jourLocal();

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "g-du", label: "Du", type: "date", valeur: c ? c.from : auj }) +
        U.champ({ id: "g-au", label: "Au", type: "date", valeur: c ? c.to : auj }) +
      "</div>" +
      U.champ({ id: "g-n", label: "Note (facultatif)", valeur: c ? c.note : "", max: 300,
                repere: "Motif, précision…" }) +
      '<p class="champ__aide" id="g-aide"></p>';

    const aide = corps.querySelector("#g-aide");
    const majAide = () => {
      const du = corps.querySelector("#g-du").value, au = corps.querySelector("#g-au").value;
      if (!du || !au) { aide.textContent = "Renseigne les deux dates."; return; }
      if (au < du) { aide.textContent = "La fin précède le début."; return; }
      const n = MNDuty.nbJours(du, au);
      aide.textContent = n + " jour" + (n > 1 ? "s" : "") + " d'absence.";
    };
    corps.querySelectorAll("input[type=date]").forEach(n =>
      n.addEventListener("input", majAide));
    majAide();

    U.modale({
      titre: c ? "Modifier la période" : "Poser des congés" +
        (uid !== moi.uid ? " — " + pseudo : ""),
      corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: async (fermer, k, btn) => {
            const du = k.querySelector("#g-du").value, au = k.querySelector("#g-au").value;
            if (!du || !au) return U.toast("Renseigne les deux dates", "err");
            if (au < du) return U.toast("La fin précède le début", "err");

            btn.disabled = true;
            const r = await MNDuty.setConge(
              { id: uid, pseudo, roleId: roleId || "" },
              du, au, k.querySelector("#g-n").value.trim(), moi.pseudo, remplace);

            if (r && r.error) {
              btn.disabled = false;
              return U.toast(r.error, "err");
            }
            fermer(); dessiner();
            U.toast(c ? "Période mise à jour" : "Congés posés", "ok");
          } }
      ]
    });
  }

  function congeAutrui() {
    const gens = MNStore.catalog().users.filter(u => u.active);
    if (!gens.length) return U.toast("Aucun employé", "err");

    const corps = document.createElement("div");
    corps.innerHTML = U.champ({ id: "g-qui", label: "Employé", type: "liste",
      options: gens.map(u => ({ valeur: u.id, nom: u.pseudo + " — " + MNStore.roleOf(u).name })) });

    U.modale({
      titre: "Poser des congés pour quelqu'un", corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Continuer", variante: "principal",
          onClick: (fermer, k) => {
            const u = gens.find(x => x.id === k.querySelector("#g-qui").value);
            fermer();
            if (u) poserConge(u.id, u.pseudo, u.roleId, "");
          } }
      ]
    });
  }

  async function retirerConge(cid) {
    const c = MNDuty.congeById(cid);
    if (!c) return;
    const ok = await U.confirmer({
      titre: "Annuler ces congés",
      message: "La période " + periode(c) + " de « " + c.pseudo + " » sera supprimée.",
      confirmer: "Annuler la période", danger: true
    });
    if (!ok) return;
    const r = await MNDuty.clearConge(cid, moi.pseudo);
    dessiner();
    if (r && r.already) return U.toast("Cette période n'existait plus", "info");
    U.toast("Congés annulés", "ok");
  }

  /* ---- Gérance ------------------------------------------------------------------------ */

  function pointerQuelquun() {
    const libres = MNStore.catalog().users.filter(u => u.active && !MNDuty.isOn(u.id));
    if (!libres.length) return U.toast("Tout le monde est déjà en service", "info");

    const corps = document.createElement("div");
    corps.innerHTML =
      U.champ({ id: "p-qui", label: "Employé", type: "liste",
        options: libres.map(u => ({ valeur: u.id, nom: u.pseudo + " — " + MNStore.roleOf(u).name })) }) +
      '<p class="champ__aide" style="margin-top:var(--e-3)">Le service démarre maintenant, ' +
        "et Discord précisera que c'est toi qui l'as pointé.</p>";

    U.modale({
      titre: "Pointer quelqu'un", corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Mettre en service", variante: "principal", icone: "check",
          onClick: async (fermer, k, btn) => {
            const u = libres.find(x => x.id === k.querySelector("#p-qui").value);
            if (!u) return;
            btn.disabled = true;
            const r = await MNDuty.forceIn(u, moi.pseudo);
            fermer(); dessiner();
            U.toast(r.already ? "Déjà en service" : u.pseudo + " est en service", "ok");
          } }
      ]
    });
  }

  /** Clôturer un oubli à l'heure réelle plutôt qu'à l'instant du clic. */
  function cloturer(uid) {
    const e = MNDuty.entryOf(uid);
    if (!e) return U.toast("Cette personne n'est plus en service", "info");

    const maintenant = versChamp(new Date().toISOString());
    const corps = document.createElement("div");
    corps.innerHTML =
      '<p class="champ__aide" style="margin-bottom:var(--e-3)">Le service de <b>' +
        U.esc(e.pseudo) + "</b> a commencé le " +
        new Date(e.since).toLocaleString("fr-FR",
          { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) +
        ". S'il a oublié de dépointer, mets l'heure à laquelle il est vraiment parti.</p>" +
      U.champ({ id: "o-fin", label: "Fin du service", type: "datetime-local",
                valeur: maintenant }) +
      '<p class="champ__aide" id="o-ap" style="margin-top:var(--e-3)"></p>';

    const ap = corps.querySelector("#o-ap");
    const majAp = () => {
      const fin = depuisChamp(corps.querySelector("#o-fin").value);
      const souci = !fin ? "Heure illisible."
        : fin < e.since ? "La fin précède le début du service."
        : fin > new Date().toISOString() ? "On ne pointe pas dans le futur." : "";
      ap.innerHTML = souci ? souci
        : "Durée enregistrée : <b>" + MNDuty.dur(MNDuty.secBetween(e.since, fin), true) + "</b>";
    };
    corps.querySelector("#o-fin").addEventListener("input", majAp);
    majAp();

    U.modale({
      titre: "Mettre fin au service", corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Clôturer", variante: "danger", icone: "sortie",
          onClick: async (fermer, k, btn) => {
            const fin = depuisChamp(k.querySelector("#o-fin").value);
            if (!fin) return U.toast("Heure de fin illisible", "err");
            if (fin < e.since) return U.toast("La fin précède le début", "err");
            if (fin > new Date().toISOString()) return U.toast("On ne pointe pas dans le futur", "err");

            btn.disabled = true;
            const r = await MNDuty.forceOut(uid, moi.pseudo, fin);
            fermer(); dessiner();
            if (r.ignore) {
              return U.toast("Service clôturé, mais à l'heure actuelle : ton serveur est " +
                "trop ancien pour choisir l'heure. Corrige la ligne dans l'historique.", "err");
            }
            U.toast(r.already ? "Cette personne n'était plus en service"
              : "Service de " + e.pseudo + " clôturé (" + MNDuty.dur(r.seconds, true) + ")", "ok");
          } }
      ]
    });
  }

  /* ---- Historique ---------------------------------------------------------------------- */

  function tempsEquipe(z) {
    const t = MNDuty.totals(7);

    z.innerHTML =
      U.carte({
        titre: "Temps de service — 7 derniers jours",
        corps: t.length
          ? U.tableau(
              [{ nom: "Employé", rendu: u => '<span class="rang">' +
                  '<span class="avatar avatar--sm">' + U.esc(U.initiales(u.pseudo)) + "</span>" +
                  U.esc(u.pseudo) + "</span>" },
               { nom: "Services", num: true, cle: "sessions" },
               { nom: "Total", num: true, rendu: u => "<b>" + U.esc(MNDuty.dur(u.seconds, true)) + "</b>" }],
              t)
          : U.vide({ icone: "horloge", titre: "Aucun service terminé",
                     texte: "Rien sur les sept derniers jours." })
      });
  }

  function pointages(z) {
    const log = MNDuty.board().log.slice(0, 30);

    z.innerHTML =
      U.carte({
        titre: "Derniers pointages",
        actions: peutGerer && log.length
          ? U.bouton("Tout effacer", { variante: "fantome", taille: "sm",
              icone: "poubelle", action: "vider" })
          : "",
        corps: log.length
          ? U.tableau(
              [{ nom: "Employé", cle: "pseudo" },
               { nom: "Créneau", rendu: e =>
                   U.esc(new Date(e.in).toLocaleString("fr-FR",
                     { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) +
                   " → " + new Date(e.out).toLocaleTimeString("fr-FR",
                     { hour: "2-digit", minute: "2-digit" })) +
                   (e.forced ? " " + U.etiquette("sorti par un gérant") : "") +
                   (e.corrigePar ? " " + U.etiquette("corrigé par " + e.corrigePar, "alerte") : "") },
               { nom: "Durée", num: true, rendu: e => U.esc(MNDuty.dur(e.seconds, true)) },
               { nom: "", rendu: (e, i) => peutGerer
                   ? U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                       titre: "Corriger les heures", action: "fix-" + e.id + "|" + e.in })
                   : "" }],
              log)
          : U.vide({ icone: "horloge", titre: "Aucun pointage enregistré" })
      });

    const v = z.querySelector('[data-a="vider"]');
    if (v) v.addEventListener("click", viderHisto);
    z.querySelectorAll("[data-a^='fix-']").forEach(b => b.addEventListener("click", () => {
      const s = b.dataset.a.slice(4);
      const coupe = s.indexOf("|");
      const e = MNDuty.board().log.find(x =>
        x.id === s.slice(0, coupe) && x.in === s.slice(coupe + 1));
      if (e) corriger(e); else U.toast("Ce pointage n'existe plus", "err");
    }));
  }

  async function viderHisto() {
    const n = MNDuty.board().log.length;
    const ok = await U.confirmer({
      titre: "Effacer l'historique",
      message: "Les " + n + " pointage" + (n > 1 ? "s" : "") + " terminé" + (n > 1 ? "s" : "") +
        " seront supprimés pour toute l'équipe. Les personnes en service ne sont pas touchées.",
      confirmer: "Tout effacer", danger: true
    });
    if (!ok) return;
    const r = await MNDuty.clearLog(moi.pseudo);
    dessiner();
    U.toast(r.removed + " pointage(s) effacé(s)", "ok");
  }

  /** Corriger les heures d'un pointage déjà enregistré. */
  function corriger(e) {
    const maintenant = versChamp(new Date().toISOString());
    const corps = document.createElement("div");
    corps.innerHTML =
      '<p class="champ__aide" style="margin-bottom:var(--e-3)">Pointage de <b>' +
        U.esc(e.pseudo) + "</b>, actuellement compté <b>" +
        U.esc(MNDuty.dur(e.seconds, true)) + "</b>.</p>" +
      '<div class="cols-2">' +
        U.champ({ id: "c-deb", label: "Arrivée", type: "datetime-local",
                  valeur: versChamp(e.in) }) +
        U.champ({ id: "c-fin", label: "Départ", type: "datetime-local",
                  valeur: versChamp(e.out) }) +
      "</div>" +
      '<p class="champ__aide" id="c-ap" style="margin-top:var(--e-3)"></p>' +
      '<p class="champ__aide" style="margin-top:var(--e-2)">La correction est visible ' +
        "de tous : la ligne portera ton nom.</p>";

    const ap = corps.querySelector("#c-ap");
    const souci = () => {
      const d = depuisChamp(corps.querySelector("#c-deb").value);
      const f = depuisChamp(corps.querySelector("#c-fin").value);
      if (!d || !f) return "Renseigne les deux heures.";
      if (f < d) return "La fin précède le début.";
      if (f > new Date().toISOString()) return "On ne pointe pas dans le futur.";
      return "";
    };
    const majAp = () => {
      const s = souci();
      ap.innerHTML = s ? s : "Durée enregistrée : <b>" +
        MNDuty.dur(MNDuty.secBetween(depuisChamp(corps.querySelector("#c-deb").value),
          depuisChamp(corps.querySelector("#c-fin").value)), true) + "</b>";
    };
    corps.querySelectorAll("input").forEach(n => n.addEventListener("input", majAp));
    majAp();

    U.modale({
      titre: "Corriger les heures", corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: async (fermer, k, btn) => {
            const s = souci();
            if (s) return U.toast(s, "err");
            btn.disabled = true;
            const r = await MNDuty.editLog(e,
              depuisChamp(k.querySelector("#c-deb").value),
              depuisChamp(k.querySelector("#c-fin").value), moi.pseudo);
            if (!r.ok) {
              btn.disabled = false;
              return U.toast(r.error || "Correction impossible", "err");
            }
            fermer(); dessiner();
            U.toast("Horaires corrigés (" + MNDuty.dur(r.seconds, true) + ")", "ok");
          } }
      ]
    });
  }

  /* ---- Heures ----------------------------------------------------------------------------
     Les champs `datetime-local` parlent en heure locale, les données en ISO. */

  function versChamp(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function depuisChamp(v) {
    const d = new Date(v);
    return isNaN(d) ? "" : d.toISOString();
  }
})();
