/* ==========================================================================
   Calendrier — grille mensuelle, évènements, congés en lecture seule.

   Reprise fidèle de la V1. Ce qui change : sur téléphone la grille mensuelle
   devient une liste des jours qui portent quelque chose — sept colonnes sur
   390 px donnaient des cases de 50 px où rien ne tenait.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
    "août", "septembre", "octobre", "novembre", "décembre"];
  const JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

  let hote = null, moi = null, peutEcrire = false;
  let curseur = new Date();

  V2Shell.demarrer({
    page: "calendrier",
    titre: "Calendrier",
    pret: async function (session, h) {
      hote = h; moi = session;
      peutEcrire = V2Shell.peut("calendar", "admin");
      curseur = new Date(); curseur.setDate(1);

      hote.innerHTML = U.squelette(4);
      await MNAgenda.load(true).catch(e => console.error(e));
      await MNDuty.load(false).catch(() => {});
      dessiner();
    }
  });

  /* ---- Dates ------------------------------------------------------------------ */

  const p2 = n => String(n).padStart(2, "0");
  const cle = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  const auj = () => MNStore.jourLocal();

  /** Le lundi de la semaine où tombe `d` : la grille commence toujours un lundi. */
  function lundiDe(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  const jourLong = j => {
    const d = new Date(String(j) + "T12:00:00");
    return isNaN(d) ? String(j)
      : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  };

  function congesDu(j) {
    try { return MNDuty.conges(true).filter(c => c.from <= j && j <= c.to); }
    catch (_) { return []; }
  }

  const evsDu = j => MNAgenda.duJour(j).slice()
    .sort((a, b) => (a.heure || "99").localeCompare(b.heure || "99"));

  /* ---- Rendu ------------------------------------------------------------------- */

  function dessiner() {
    V2Shell.actions(peutEcrire
      ? U.bouton("Nouvel évènement", { variante: "principal", taille: "sm",
          icone: "plus", action: "add" })
      : "");

    hote.innerHTML =
      '<div class="cal">' +
        '<div class="cal__barre">' +
          U.bouton("", { icone: "chevron", variante: "fantome", titre: "Mois précédent", action: "prec" }) +
          '<h2 class="cal__mois">' + U.esc(MOIS[curseur.getMonth()]) + " " + curseur.getFullYear() + "</h2>" +
          U.bouton("", { icone: "chevron", variante: "fantome", titre: "Mois suivant", action: "suiv" }) +
          U.bouton("Aujourd'hui", { variante: "fantome", taille: "sm", action: "auj" }) +
        "</div>" +
        grille() +
        agenda() +
        '<p class="champ__aide" style="margin-top:var(--e-4)">' +
          (peutEcrire ? "Clique un jour pour y poser un évènement. " : "") +
          "Les congés viennent de la page Service et se règlent là-bas.</p>" +
      "</div>";

    brancher();
  }

  /** Grille mensuelle, visible à partir de la tablette. */
  function grille() {
    const debut = lundiDe(new Date(curseur.getFullYear(), curseur.getMonth(), 1));
    const mois = curseur.getMonth();
    const today = auj();

    /* Six semaines toujours : sans ça la page sauterait d'un mois à l'autre
       selon qu'il en occupe cinq ou six. */
    let html = '<div class="cal__grille">' +
      JOURS.map(j => '<div class="cal__tete">' + j + "</div>").join("");

    for (let i = 0; i < 42; i++) {
      const d = new Date(debut);
      d.setDate(debut.getDate() + i);
      const j = cle(d);

      html +=
        '<div class="cal__jour' + (d.getMonth() === mois ? "" : " est-hors") +
          (j === today ? " est-auj" : "") + '" data-jour="' + j + '"' +
          (peutEcrire ? ' tabindex="0" role="button"' : "") + ">" +
          '<div class="cal__num">' +
            "<span>" + d.getDate() + "</span>" +
            pastilles(congesDu(j)) +
          "</div>" +
          '<div class="cal__evs">' + evsDu(j).map(pillule).join("") + "</div>" +
        "</div>";
    }
    return html + "</div>";
  }

  /**
   * Les absents en initiales, à droite du numéro. Écrits en entier ils
   * mangeaient la case ; le nom complet revient au survol.
   */
  function pastilles(cg) {
    if (!cg.length) return "";
    const vus = cg.slice(0, 3), reste = cg.slice(3);
    return '<span class="cal__conges">' +
      vus.map(c => '<span class="cal__ini" title="' + U.esc(c.pseudo + " est en congés") + '">' +
        U.esc(U.initiales(c.pseudo)) + "</span>").join("") +
      (reste.length
        ? '<span class="cal__ini cal__ini--plus" title="' +
          U.esc(reste.map(c => c.pseudo).join(", ") +
            (reste.length > 1 ? " sont aussi en congés" : " est aussi en congés")) +
          '">+' + reste.length + "</span>"
        : "") +
    "</span>";
  }

  const pillule = e =>
    '<button class="cal__ev cal__ev--' + e.teinte + '" data-ev="' + U.esc(e.id) + '" title="' +
      U.esc(e.titre + (e.note ? " — " + e.note : "")) + '">' +
      (e.heure ? "<b>" + U.esc(e.heure) + "</b> " : "") +
      U.esc(e.titre || "Sans titre") + "</button>";

  /**
   * Sur téléphone, la grille laisse place à la liste des jours qui portent
   * quelque chose : sept colonnes sur 390 px ne montrent plus rien.
   */
  function agenda() {
    const debut = new Date(curseur.getFullYear(), curseur.getMonth(), 1);
    const fin = new Date(curseur.getFullYear(), curseur.getMonth() + 1, 0);
    const lignes = [];

    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      const j = cle(d);
      const evs = evsDu(j), cg = congesDu(j);
      if (!evs.length && !cg.length) continue;
      lignes.push(
        '<div class="cal__ligne' + (j === auj() ? " est-auj" : "") + '" data-jour="' + j + '">' +
          '<div class="cal__ligne-j">' + U.esc(jourLong(j)) + pastilles(cg) + "</div>" +
          (evs.length ? '<div class="cal__evs">' + evs.map(pillule).join("") + "</div>" : "") +
        "</div>");
    }

    return '<div class="cal__agenda">' +
      (lignes.length ? lignes.join("")
        : U.vide({ icone: "calendrier", titre: "Rien ce mois-ci",
                   texte: "Aucun évènement ni congé sur " + MOIS[curseur.getMonth()] + "." })) +
    "</div>";
  }

  function brancher() {
    const b = a => hote.querySelector('[data-a="' + a + '"]') ||
      document.querySelector('[data-a="' + a + '"]');

    b("prec").addEventListener("click", () => bouger(-1));
    b("suiv").addEventListener("click", () => bouger(1));
    b("auj").addEventListener("click", () => {
      curseur = new Date(); curseur.setDate(1); dessiner();
    });
    const add = b("add");
    if (add) add.addEventListener("click", () => editer(null, auj()));

    hote.querySelectorAll("[data-ev]").forEach(x => x.addEventListener("click", ev => {
      ev.stopPropagation();
      const e = MNAgenda.eventById(x.dataset.ev);
      if (e) ouvrir(e);
    }));

    if (!peutEcrire) return;
    hote.querySelectorAll("[data-jour]").forEach(c => {
      c.addEventListener("click", () => editer(null, c.dataset.jour));
      c.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editer(null, c.dataset.jour); }
      });
    });
  }

  function bouger(n) {
    curseur = new Date(curseur.getFullYear(), curseur.getMonth() + n, 1);
    dessiner();
  }

  /* ---- Consultation --------------------------------------------------------------- */

  function ouvrir(e) {
    const actions = [{ label: "Fermer", onClick: f => f() }];
    if (peutEcrire) {
      actions.push({ label: "Supprimer", variante: "danger", icone: "poubelle",
        onClick: async f => { f(); await supprimer(e); } });
      actions.push({ label: "Modifier", variante: "principal", icone: "crayon",
        onClick: f => { f(); editer(e, e.jour); } });
    }
    U.modale({
      titre: e.titre || "Sans titre",
      corps:
        '<p class="cal__quand">' + U.esc(jourLong(e.jour)) +
          (e.fin ? " — " + U.esc(jourLong(e.fin)) : "") +
          (e.heure ? " · " + U.esc(e.heure) : "") + "</p>" +
        (e.note ? '<p style="white-space:pre-wrap">' + U.esc(e.note) + "</p>"
                : '<p class="champ__aide">Aucune note.</p>') +
        '<p class="champ__aide" style="margin-top:var(--e-4)">Posé par ' +
          U.esc(e.creePar || "?") +
          (e.majPar && e.majPar !== e.creePar ? ", modifié par " + U.esc(e.majPar) : "") + ".</p>",
      actions
    });
  }

  /* ---- Édition ----------------------------------------------------------------------- */

  function editer(e, jourDefaut) {
    const neuf = !e;
    const cur = e || { id: "", jour: jourDefaut || auj(), fin: null, heure: "",
                       titre: "", note: "", teinte: "rose" };
    let teinte = cur.teinte;

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      U.champ({ id: "e-t", label: "Titre", valeur: cur.titre, max: 120,
                repere: "Ex. Convoi vers le campement" }) +
      '<div class="cols-3">' +
        U.champ({ id: "e-j", label: "Date", type: "date", valeur: cur.jour }) +
        U.champ({ id: "e-f", label: "Jusqu'au (facultatif)", type: "date", valeur: cur.fin || "" }) +
        U.champ({ id: "e-h", label: "Heure (facultatif)", type: "time", valeur: cur.heure }) +
      "</div>" +
      '<div class="champ"><span class="champ__label">Couleur</span>' +
        '<div class="cal__teintes">' + MNAgenda.TEINTES.map(t =>
          '<button type="button" class="cal__teinte cal__ev--' + t +
            (t === cur.teinte ? " est-choisi" : "") + '" data-t="' + t +
            '" aria-label="' + t + '"></button>').join("") + "</div></div>" +
      U.champ({ id: "e-n", label: "Note", type: "zone", valeur: cur.note, max: 1000,
                repere: "Détails, point de rendez-vous, matériel…" });

    corps.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => {
      teinte = b.dataset.t;
      corps.querySelectorAll("[data-t]").forEach(x => x.classList.toggle("est-choisi", x === b));
    }));

    U.modale({
      titre: neuf ? "Nouvel évènement" : "Modifier l'évènement",
      corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: async (fermer, c, btn) => {
            const g = s => c.querySelector(s).value.trim();
            const titre = g("#e-t"), jour = g("#e-j"), fin = g("#e-f");
            if (!titre) return U.toast("Le titre est obligatoire", "err");
            if (!jour) return U.toast("La date est obligatoire", "err");
            if (fin && fin < jour) return U.toast("La fin précède le début", "err");

            const now = new Date().toISOString();
            btn.disabled = true;
            const r = await MNAgenda.setEvent({
              id: cur.id || MNStore.uniqueId(titre + "-" + jour, MNAgenda.events().map(x => x.id)),
              jour, fin: fin || null, heure: g("#e-h"), titre, note: g("#e-n"), teinte,
              creePar: cur.creePar || moi.pseudo, creeLe: cur.creeLe || now,
              majPar: moi.pseudo, majLe: now
            });
            if (!r.ok) {
              btn.disabled = false;
              return U.toast(r.error || "Enregistrement impossible", "err");
            }
            /* On se place sur le mois de l'évènement : l'enregistrer sans le
               voir apparaître donnerait l'impression d'un échec. */
            curseur = new Date(jour + "T12:00:00"); curseur.setDate(1);
            fermer(); dessiner();
            U.toast(neuf ? "Évènement ajouté" : "Évènement mis à jour", "ok");
          } }
      ]
    });
  }

  async function supprimer(e) {
    const ok = await U.confirmer({
      titre: "Supprimer l'évènement",
      message: "« " + (e.titre || "Sans titre") + " » du " + jourLong(e.jour) +
        " sera retiré du calendrier.",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;
    const r = await MNAgenda.removeEvent(e.id);
    if (!r.ok) return U.toast(r.error || "Suppression impossible", "err");
    dessiner();
    U.toast("Évènement supprimé", "ok");
  }
})();
