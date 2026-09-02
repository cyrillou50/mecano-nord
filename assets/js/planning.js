/* ==========================================================================
   Planning de la semaine.

   Le pointage dit qui a travaillé et combien. Il ne dit pas *quand* — or
   c'est la question qu'on se pose en ouvrant l'atelier : à quelle heure y
   a-t-il quelqu'un, et à quelle heure il n'y a personne.

   Deux grilles répondent à ça, et elles ne disent pas la même chose :

     • la semaine, jour par jour et heure par heure, avec le nombre de
       présents — les trous s'y voient sans les chercher ;
     • une journée, personne par personne, pour savoir qui couvre quoi.

   Ce module ne fait que le calcul et le HTML des grilles. Les deux versions
   du site s'en servent : c'est du comptage, il n'y a aucune raison de
   l'écrire deux fois.
   ========================================================================== */

window.MNPlanning = (function () {
  "use strict";

  const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const HEURES = Array.from({ length: 24 }, (_, h) => h);

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Le lundi 00 h de la semaine décalée de `offset` semaines. */
  function lundi(offset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (offset || 0) * 7);
    return d;
  }

  const minuit = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const jjmm = d => String(d.getDate()).padStart(2, "0") + "/" +
    String(d.getMonth() + 1).padStart(2, "0");

  /**
   * Qui était là, case par case, sur la semaine demandée.
   *
   * Un service qui court après minuit compte dans les deux jours : c'est la
   * réalité d'un atelier ouvert la nuit, pas un cas limite à écarter.
   *
   * @param {Array} log     les périodes fermées, telles que MNDuty les tient
   * @param {Array} onDuty  ceux qui pointent encore, comptés jusqu'à présent
   * @param {number} offset 0 = semaine en cours, -1 = la précédente
   * @returns {{debut:Date, cases:Array<Array<Array<string>>>, gens:Object}}
   *          cases[jour 0-6][heure 0-23] = les identifiants présents
   */
  function semaine(log, onDuty, offset) {
    const debut = lundi(offset);
    const t0 = debut.getTime();
    const t1 = t0 + 7 * 864e5;
    const maintenant = Date.now();

    const cases = JOURS.map(() => HEURES.map(() => []));
    const gens = {};

    /** Marque une présence sur toutes les heures qu'elle traverse. */
    function poser(uid, pseudo, depart, arrivee) {
      const a = Math.max(depart, t0);
      const b = Math.min(arrivee, t1);
      if (!(b > a)) return;

      gens[uid] = pseudo;

      /* On avance d'heure locale en heure locale plutôt que d'ajouter des
         millisecondes : au changement d'heure, une journée fait 23 ou 25 h et
         un pas fixe décalerait toute la fin de la semaine. */
      const curseur = new Date(a);
      curseur.setMinutes(0, 0, 0);

      /* Une semaine fait au plus 169 heures ; la borne évite qu'une date
         aberrante fasse tourner la boucle sans fin. */
      for (let n = 0; n < 200 && curseur.getTime() < b; n++) {
        const j = Math.round((minuit(curseur).getTime() - t0) / 864e5);
        if (j >= 0 && j < 7) {
          const l = cases[j][curseur.getHours()];
          if (l.indexOf(uid) === -1) l.push(uid);
        }
        curseur.setHours(curseur.getHours() + 1);
      }
    }

    (log || []).forEach(e => {
      if (!e.in) return;
      /* Sans sortie, la période n'a pas d'étendue connue : la compter jusqu'à
         maintenant inventerait des heures que personne n'a faites. */
      if (!e.out) return;
      poser(e.id, e.pseudo, new Date(e.in).getTime(), new Date(e.out).getTime());
    });

    /* Ceux qui sont encore en service comptent jusqu'à l'instant présent. */
    (onDuty || []).forEach(e => {
      if (!e.since) return;
      poser(e.id, e.pseudo, new Date(e.since).getTime(), maintenant);
    });

    return { debut, cases, gens };
  }

  /**
   * La grille de la semaine : une ligne par jour, une colonne par heure.
   * La dernière ligne compte, pour chaque heure, sur combien de jours
   * quelqu'un était là — c'est elle qui révèle les trous qui reviennent.
   *
   * @param {object} s        ce que renvoie semaine()
   * @param {number|null} ouvert  le jour déplié, pour le marquer
   */
  function grilleSemaine(s, ouvert) {
    const jourDeSemaine = (new Date()).getDay();
    const auj = Math.round((minuit(new Date()).getTime() - s.debut.getTime()) / 864e5);

    const entete = '<div class="plan__c plan__c--tete">Jour</div>' +
      HEURES.map(h => '<div class="plan__c plan__c--tete">' + h + "h</div>").join("") +
      '<div class="plan__c plan__c--tete">Total</div>';

    const lignes = JOURS.map((nom, j) => {
      const d = new Date(s.debut);
      d.setDate(d.getDate() + j);
      const heuresTenues = s.cases[j].filter(l => l.length).length;

      return '<button class="plan__l' + (j === ouvert ? " is-ouvert" : "") +
        (j === auj ? " is-auj" : "") + '" type="button" data-jour="' + j + '">' +
        '<span class="plan__c plan__c--jour"><b>' + esc(nom) + "</b>" +
          "<i>" + jjmm(d) + "</i></span>" +
        s.cases[j].map((l, h) =>
          '<span class="plan__c ' + classeCase(l.length) + '" title="' +
            esc(nom + " " + h + "h — " + phrase(l, s.gens)) + '">' +
            (l.length || "") + "</span>").join("") +
        '<span class="plan__c plan__c--tot">' + heuresTenues + " h</span>" +
      "</button>";
    }).join("");

    /* Combien de jours, sur les sept, cette heure a-t-elle été tenue. */
    const couverture = '<div class="plan__l plan__l--pied">' +
      '<span class="plan__c plan__c--jour"><b>Jours tenus</b><i>sur 7</i></span>' +
      HEURES.map(h => {
        const n = JOURS.reduce((acc, _, j) => acc + (s.cases[j][h].length ? 1 : 0), 0);
        return '<span class="plan__c ' + (n ? "plan__c--pied" : "plan__c--trou") + '">' +
          (n || "—") + "</span>";
      }).join("") +
      '<span class="plan__c plan__c--tot"></span>' +
    "</div>";

    return '<div class="plan__cadre"><div class="plan" style="--h:' + HEURES.length + '">' +
      '<div class="plan__l plan__l--tete">' + entete + "</div>" +
      lignes + couverture +
    "</div></div>";
  }

  /**
   * La grille d'une journée : une ligne par personne, une colonne par heure.
   * C'est la vue qu'on ouvre quand la semaine a montré un trou et qu'on veut
   * savoir qui aurait pu le tenir.
   */
  function grilleJour(s, j) {
    const d = new Date(s.debut);
    d.setDate(d.getDate() + j);

    /* Ceux qui ont travaillé ce jour-là, du plus tôt arrivé au plus tard. */
    const presents = [];
    s.cases[j].forEach(l => l.forEach(uid => {
      if (presents.indexOf(uid) === -1) presents.push(uid);
    }));

    if (!presents.length) {
      return '<div class="plan__vide">Personne n\'a pointé le ' +
        esc(JOURS[j].toLowerCase()) + " " + jjmm(d) + ".</div>";
    }

    const entete = '<div class="plan__c plan__c--tete">' + esc(JOURS[j]) + "</div>" +
      HEURES.map(h => '<div class="plan__c plan__c--tete">' + h + "h</div>").join("") +
      '<div class="plan__c plan__c--tete">Total</div>';

    const lignes = presents.map(uid => {
      const n = s.cases[j].filter(l => l.indexOf(uid) !== -1).length;
      return '<div class="plan__l">' +
        '<span class="plan__c plan__c--jour"><b>' + esc(s.gens[uid] || uid) + "</b></span>" +
        s.cases[j].map((l, h) =>
          '<span class="plan__c ' + (l.indexOf(uid) !== -1 ? "plan__c--on" : "") +
            '" title="' + esc((s.gens[uid] || uid) + " — " + h + "h") + '"></span>').join("") +
        '<span class="plan__c plan__c--tot">' + n + " h</span>" +
      "</div>";
    }).join("");

    return '<div class="plan__cadre"><div class="plan" style="--h:' + HEURES.length + '">' +
      '<div class="plan__l plan__l--tete">' + entete + "</div>" + lignes +
    "</div></div>";
  }

  /** Combien de cases vides sur la semaine, et la plus longue d'affilée. */
  function trous(s) {
    let vides = 0, pire = 0, suite = 0;
    for (let j = 0; j < 7; j++) {
      for (let h = 0; h < 24; h++) {
        if (s.cases[j][h].length) { suite = 0; continue; }
        vides++; suite++;
        if (suite > pire) pire = suite;
      }
    }
    return { vides, pire, total: 7 * 24 };
  }

  /* ---- Petites aides ------------------------------------------------------- */

  function classeCase(n) {
    if (!n) return "plan__c--trou";
    if (n === 1) return "plan__c--un";
    if (n === 2) return "plan__c--deux";
    return "plan__c--plein";
  }

  const phrase = (l, gens) => l.length
    ? l.map(uid => gens[uid] || uid).join(", ")
    : "personne";

  /** Le libellé d'une semaine : « 1 – 7 sept. » ou « cette semaine ». */
  function titre(offset) {
    const a = lundi(offset);
    const b = new Date(a);
    b.setDate(b.getDate() + 6);
    const mois = d => d.toLocaleDateString("fr-FR", { month: "short" });
    const meme = a.getMonth() === b.getMonth();
    return a.getDate() + (meme ? "" : " " + mois(a)) + " – " +
      b.getDate() + " " + mois(b) +
      (offset === 0 ? " (cette semaine)" : "");
  }

  return { JOURS, HEURES, lundi, semaine, grilleSemaine, grilleJour, trous, titre };
})();
