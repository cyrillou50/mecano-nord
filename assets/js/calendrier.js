/* ==========================================================================
   Page Calendrier : une grille mensuelle, un évènement par clic.

   Tout le monde consulte ; la permission « Gérer le calendrier » ouvre la
   création, la modification et la suppression.

   Les congés posés dans Service y apparaissent aussi, en lecture seule : les
   voir aide à placer un rendez-vous, mais ils se règlent là-bas et nulle part
   ailleurs — deux endroits pour les modifier, ce serait deux vérités.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;
  const S = () => MNStore;

  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

  let me = null;
  let canEdit = false;
  /* Premier jour du mois affiché. */
  let curseur = new Date();

  MNUI.start({ page: "calendrier", title: "Calendrier", onReady: init });

  async function init(session) {
    me = session;
    canEdit = MNAuth.canAny("calendar", "admin");
    curseur = new Date();
    curseur.setDate(1);

    await MNAgenda.load(true).catch(e => console.error(e));
    await MNDuty.load(false).catch(() => {});
    render();

    /* Le bandeau suit l'envoi automatique, qui part sans passer par ici. */
    MNGitHub.onAuto(renderDraftbar);


    /* Un agenda se remplit à plusieurs : on relit régulièrement. */
    MNUI.autoRefresh(async () => {
      await MNAgenda.load(true).catch(() => {});
      render();
    }, { vif: 30000, calme: 150000 });
  }

  /* ---- Dates ---------------------------------------------------------------- */

  const p2 = n => String(n).padStart(2, "0");
  const cle = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  const aujourdhui = () => S().jourLocal();

  /** Le lundi de la semaine où tombe `d`. La grille commence toujours un lundi. */
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

  /* ---- Congés, en lecture seule ------------------------------------------------ */

  function congesDuJour(j) {
    try {
      return MNDuty.conges(true).filter(c => c.from <= j && j <= c.to);
    } catch (_) {
      return [];
    }
  }

  /**
   * Les absents du jour, réduits à leurs initiales à côté du numéro.
   *
   * Écrire les pseudos en entier mangeait la case : à trois absents il ne
   * restait plus de place pour les évènements, qui sont pourtant ce qu'on
   * vient poser ici. Le nom complet revient au survol.
   */
  function initialesConges(cg) {
    const MAX = 3;
    const vus = cg.slice(0, MAX);
    const reste = cg.slice(MAX);

    /* Le grade accompagne le pseudo dans l'infobulle : la couleur seule ne
       se retient pas quand l'atelier compte cinq grades. */
    const nomEtGrade = c => {
      const r = MNStore.roleById(c.roleId);
      return c.pseudo + (r ? " (" + r.name + ")" : "");
    };

    return vus.map(c => {
      /* La pastille prend la couleur du grade : dans une grille de trente
         cases, deux lettres grises ne disent rien, alors qu'une couleur
         connue se reconnaît sans lire. */
      const r = MNStore.roleById(c.roleId);
      return '<span class="calini"' + (r ? ' style="--ini:' + esc(r.color) + '"' : "") +
        ' title="' + esc(nomEtGrade(c) + " est en congés") + '">' +
        esc(MNUI.initials(c.pseudo)) + "</span>";
    }).join("") +
      /* Au-delà de trois, un compteur : quatre pastilles ne tiendraient pas
         en face du numéro, et leur liste tient dans son infobulle. */
      (reste.length
        ? '<span class="calini calini--plus" title="' +
          esc(reste.map(nomEtGrade).join(", ") +
            (reste.length > 1 ? " sont aussi en congés" : " est aussi en congés")) +
          '">+' + reste.length + "</span>"
        : "");
  }

  /* ---- Rendu ---------------------------------------------------------------- */

  function render() {
    $("#cal-root").innerHTML =
      '<div class="wrap calpage">' +
        '<div class="calbar">' +
          '<button class="btn btn--icon" id="cal-prev" aria-label="Mois précédent">' +
            svg("chevUp") + "</button>" +
          '<h1 class="calbar__mois">' + esc(MOIS[curseur.getMonth()]) + " " +
            curseur.getFullYear() + "</h1>" +
          '<button class="btn btn--icon" id="cal-next" aria-label="Mois suivant">' +
            svg("chevDown") + "</button>" +
          '<button class="btn btn--ghost btn--sm" id="cal-today">Aujourd\'hui</button>' +
          '<span class="spacer"></span>' +
          (canEdit
            ? '<button class="btn btn--solid btn--sm" id="cal-add">' + svg("plus") +
              "<span>Nouvel évènement</span></button>"
            : "") +
        "</div>" +
        '<div class="calgrid" id="cal-grid"></div>' +
        '<p class="hint calaide">' +
          (canEdit ? "Clique un jour pour y poser un évènement. " : "") +
          "Les congés viennent de la page Service et se règlent là-bas.</p>" +
      "</div>";

    $("#cal-prev").addEventListener("click", () => { bouger(-1); });
    $("#cal-next").addEventListener("click", () => { bouger(1); });
    $("#cal-today").addEventListener("click", () => {
      curseur = new Date(); curseur.setDate(1); render();
    });
    const add = $("#cal-add");
    if (add) add.addEventListener("click", () => editer(null, aujourdhui()));

    renderGrille();
    renderDraftbar();
  }

  function bouger(n) {
    curseur = new Date(curseur.getFullYear(), curseur.getMonth() + n, 1);
    render();
  }

  function renderDraftbar() {
    const bar = $("#draftbar");
    if (!bar) return;

    const s = MNAgenda.souci();
    if (s) {
      bar.hidden = false;
      bar.innerHTML = '<span class="draftbar__dot"></span>' +
        '<span class="draftbar__txt"><b>' + esc(s) + "</b> " +
        "<span>L'agenda affiché vient du catalogue et peut être incomplet.</span></span>";
      return;
    }
    if (MNAgenda.surServeur() && MNAgenda.estDistant()) { bar.hidden = true; return; }

    bar.hidden = !MNStore.hasDraft();
    if (bar.hidden) return;

    /* Sans serveur, ces données vivent dans le catalogue, et le catalogue part
       tout seul. Reste à dire où en est ce départ. */
    const mot = MNGitHub.motAuto();
    if (mot) {
      const c = mot.ton === "err" ? "var(--danger)"
        : mot.ton === "warn" ? "var(--amber)" : "var(--toxic)";
      bar.innerHTML =
        '<span class="draftbar__dot" style="background:' + c +
          ";box-shadow:0 0 12px " + c + '"></span>' +
        '<span class="draftbar__txt"><b>' + esc(mot.titre) + "</b>" +
          (mot.detail ? " <span>" + esc(mot.detail) + "</span>" : "") + "</span>" +
        (mot.bouton
          ? '<a class="btn btn--primary btn--sm" href="admin.html">' + svg("cloud") +
            "<span>Voir</span></a>"
          : "");
      return;
    }

    bar.innerHTML =
      '<span class="draftbar__dot"></span>' +
      '<span class="draftbar__txt">' +
        "<b>L'agenda n'est enregistré que sur cet appareil.</b> " +
        "<span>Sans serveur configuré, il vit dans le catalogue, " +
        "et il faut le mettre en ligne pour que l'équipe le voie.</span></span>" +
      (MNAuth.can("publish")
        ? '<a class="btn btn--primary btn--sm" href="admin.html">' + svg("cloud") + "<span>Publier</span></a>"
        : "");
  }

  function renderGrille() {
    const host = $("#cal-grid");
    const debut = lundiDe(new Date(curseur.getFullYear(), curseur.getMonth(), 1));
    const mois = curseur.getMonth();
    const today = aujourdhui();

    /* Six semaines : c'est le maximum qu'un mois puisse occuper, et une grille
       de hauteur constante ne fait pas sauter la page d'un mois à l'autre. */
    let html = JOURS.map(j => '<div class="calhead">' + j + "</div>").join("");

    for (let i = 0; i < 42; i++) {
      const d = new Date(debut);
      d.setDate(debut.getDate() + i);
      const j = cle(d);
      const dedans = d.getMonth() === mois;

      const evs = MNAgenda.duJour(j).slice().sort((a, b) =>
        (a.heure || "99").localeCompare(b.heure || "99"));
      const cg = congesDuJour(j);

      html +=
        '<div class="calday' + (dedans ? "" : " calday--hors") +
          (j === today ? " calday--auj" : "") + '" data-jour="' + j + '"' +
          (canEdit ? ' tabindex="0" role="button" aria-label="Ajouter le ' + esc(j) + '"' : "") + ">" +
          '<div class="calday__tete">' +
            '<span class="calday__n">' + d.getDate() + "</span>" +
            (cg.length ? '<span class="calconges">' + initialesConges(cg) + "</span>" : "") +
          "</div>" +
          '<div class="calday__evs">' +
            evs.map(e => '<button class="calev calev--' + e.teinte +
              '" data-ev="' + esc(e.id) + '" type="button" title="' +
              esc(e.titre + (e.note ? " — " + e.note : "")) + '">' +
              (e.heure ? '<b>' + esc(e.heure) + "</b> " : "") +
              esc(e.titre || "Sans titre") + "</button>").join("") +
          "</div>" +
        "</div>";
    }
    host.innerHTML = html;

    host.querySelectorAll("[data-ev]").forEach(b => b.addEventListener("click", ev => {
      ev.stopPropagation();
      const e = MNAgenda.eventById(b.dataset.ev);
      if (e) ouvrir(e);
    }));

    if (!canEdit) return;
    host.querySelectorAll("[data-jour]").forEach(c => {
      c.addEventListener("click", () => editer(null, c.dataset.jour));
      c.addEventListener("keydown", ev => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); editer(null, c.dataset.jour); }
      });
    });
  }

  /* ---- Consultation ---------------------------------------------------------- */

  function ouvrir(e) {
    const body = document.createElement("div");
    body.innerHTML =
      '<p class="calvue__quand">' + esc(jourLong(e.jour)) +
        (e.fin ? " — " + esc(jourLong(e.fin)) : "") +
        (e.heure ? " · " + esc(e.heure) : "") + "</p>" +
      (e.note ? '<p class="calvue__note">' + esc(e.note) + "</p>"
              : '<p class="hint">Aucune note.</p>') +
      '<p class="hint" style="margin-top:14px">Posé par ' + esc(e.creePar || "?") +
        (e.majPar && e.majPar !== e.creePar ? ", modifié par " + esc(e.majPar) : "") + ".</p>";

    const actions = [{ label: "Fermer", variant: "btn--ghost", onClick: c => c() }];
    if (canEdit) {
      actions.push({
        label: "Supprimer", variant: "btn--danger", icon: "trash",
        onClick: async close => { close(); await supprimer(e); }
      });
      actions.push({
        label: "Modifier", variant: "btn--primary", icon: "edit",
        onClick: close => { close(); editer(e, e.jour); }
      });
    }
    MNUI.modal({ title: e.titre || "Sans titre", body, actions });
  }

  /* ---- Édition ---------------------------------------------------------------- */

  function editer(e, jourParDefaut) {
    const isNew = !e;
    const cur = e || {
      id: "", jour: jourParDefaut || aujourdhui(), fin: null, heure: "",
      titre: "", note: "", teinte: "rose"
    };

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="field"><label class="label" for="e-titre">Titre</label>' +
        '<input class="input" id="e-titre" maxlength="120" value="' + esc(cur.titre) +
          '" placeholder="Ex. Convoi vers le campement"></div>' +

      '<div class="editor__grid editor__grid--3">' +
        '<div class="field"><label class="label" for="e-jour">Date</label>' +
          '<input class="input" type="date" id="e-jour" value="' + esc(cur.jour) + '"></div>' +
        '<div class="field"><label class="label" for="e-fin">Jusqu\'au (facultatif)</label>' +
          '<input class="input" type="date" id="e-fin" value="' + esc(cur.fin || "") + '"></div>' +
        '<div class="field"><label class="label" for="e-heure">Heure (facultatif)</label>' +
          '<input class="input" type="time" id="e-heure" value="' + esc(cur.heure) + '"></div>' +
      "</div>" +

      '<div class="field"><label class="label">Couleur</label>' +
        '<div class="calteintes" id="e-teintes">' +
          MNAgenda.TEINTES.map(t =>
            '<button type="button" class="calteinte calev--' + t +
              (t === cur.teinte ? " is-on" : "") + '" data-t="' + t +
              '" aria-label="' + t + '"></button>').join("") +
        "</div></div>" +

      '<div class="field"><label class="label" for="e-note">Note</label>' +
        '<textarea class="textarea" id="e-note" maxlength="1000" ' +
          'placeholder="Détails, point de rendez-vous, matériel…">' + esc(cur.note) + "</textarea></div>";

    let teinte = cur.teinte;
    body.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => {
      teinte = b.dataset.t;
      body.querySelectorAll("[data-t]").forEach(x => x.classList.toggle("is-on", x === b));
    }));

    MNUI.modal({
      title: isNew ? "Nouvel évènement" : "Modifier l'évènement",
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: async (close, b, btn) => {
            const g = s => body.querySelector(s).value.trim();
            const titre = g("#e-titre");
            const jour = g("#e-jour");
            if (!titre) return MNUI.toast("Le titre est obligatoire", "err");
            if (!jour) return MNUI.toast("La date est obligatoire", "err");

            const fin = g("#e-fin");
            if (fin && fin < jour) return MNUI.toast("La fin précède le début", "err");

            const maintenant = new Date().toISOString();
            const data = {
              id: cur.id || S().uniqueId(titre + "-" + jour, MNAgenda.events().map(x => x.id)),
              jour, fin: fin || null, heure: g("#e-heure"),
              titre, note: g("#e-note"), teinte,
              creePar: cur.creePar || me.pseudo,
              creeLe: cur.creeLe || maintenant,
              majPar: me.pseudo, majLe: maintenant
            };

            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Un instant…</span>";
            const r = await MNAgenda.setEvent(data);
            if (!r.ok) {
              btn.disabled = false;
              btn.innerHTML = svg("save") + "<span>Enregistrer</span>";
              return MNUI.toast(r.error || "Enregistrement impossible", "err");
            }
            /* On se place sur le mois de l'évènement : l'avoir enregistré sans
               le voir apparaître donnerait l'impression d'un échec. */
            curseur = new Date(jour + "T12:00:00");
            curseur.setDate(1);
            close();
            render();
            MNUI.toast(isNew ? "Évènement ajouté" : "Évènement mis à jour", "ok");
          }
        }
      ]
    });
  }

  async function supprimer(e) {
    const ok = await MNUI.confirm({
      title: "Supprimer l'évènement",
      message: "« " + (e.titre || "Sans titre") + " » du " + jourLong(e.jour) +
        " sera retiré du calendrier.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    const r = await MNAgenda.removeEvent(e.id);
    if (!r.ok) return MNUI.toast(r.error || "Suppression impossible", "err");
    render();
    MNUI.toast("Évènement supprimé", "ok");
  }
})();
