/* ==========================================================================
   Blacklist de l'atelier.

   Les clients qu'on ne sert plus, pourquoi, et ce qu'on leur doit encore.
   Elle se lit au comptoir, par celui qui reçoit : la réserver aux
   responsables reviendrait à ne pas l'avoir. Seule l'écriture demande la
   permission « blacklist ».

   Une inscription levée n'est pas supprimée — elle sort de la liste active et
   garde sa trace, comme un avertissement. On doit pouvoir dire qu'elle a
   existé, et qui l'a levée.

   La liste vit sur le serveur (voir listes.js) : inscrire quelqu'un est le
   geste de celui qui tient le comptoir, pas celui de qui publie le site.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc, num = MNUI.num;
  const L = MNListes.bannis;

  let moi = null;
  let peutGerer = false;
  let filtre = "";
  let voirLevees = false;

  MNUI.start({ page: "blacklist", title: "Blacklist", onReady: init });

  async function init(session) {
    moi = session;
    peutGerer = MNAuth.canAny("blacklist", "admin");
    await L.load(true).catch(e => console.error(e));
    render();
  }

  /* ---- Lecture ------------------------------------------------------------- */

  const toutes = () => L.liste();
  const actives = () => toutes().filter(x => !x.levee);
  const levees = () => toutes().filter(x => x.levee);

  function filtrer(l) {
    const q = filtre.trim().toLowerCase();
    if (!q) return l;
    return l.filter(x => (x.nom + " " + x.raison).toLowerCase().indexOf(q) !== -1);
  }

  /** Ce qui reste à rendre, tous clients confondus. */
  const duTotal = () => actives()
    .filter(x => x.remboursement === "du")
    .reduce((s, x) => s + x.montant, 0);

  /* ---- Rendu ---------------------------------------------------------------- */

  function render() {
    const l = filtrer(actives());
    const lev = filtrer(levees());
    const du = duTotal();
    const total = toutes().length;

    $("#blacklist-root").innerHTML =
      '<h1 class="page-title">Blacklist</h1>' +
      '<p class="page-sub">Les clients qu\'on ne sert plus, et pourquoi</p>' +

      (peutGerer || total
        ? '<div class="row row--wrap" style="margin-bottom:18px">' +
            (peutGerer
              ? '<button class="btn btn--primary" id="bl-add">' + svg("plus") +
                  "<span>Inscrire quelqu'un</span></button>" +
                '<span class="spacer"></span>'
              : "") +
            (total
              ? '<input class="input" id="bl-q" style="max-width:300px" ' +
                'placeholder="Rechercher un nom, une raison…" value="' + esc(filtre) + '">'
              : "") +
          "</div>"
        : "") +

      /* Le total dû se voit d'un coup d'œil : c'est de l'argent de l'atelier
         qui dort chez quelqu'un, pas une ligne de plus dans une fiche. */
      (du
        ? '<div class="alert alert--warn" style="margin-bottom:18px">' + svg("alert") +
          "<span><b>" + num(du) + " $</b> restent à rembourser, " +
          "toutes inscriptions confondues.</span></div>"
        : "") +

      (total ? corps(l, lev) : vide());

    renderDraftbar();

    const q = $("#bl-q");
    if (q) q.addEventListener("input", () => {
      filtre = q.value;
      render();
      const n = $("#bl-q");
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    });

    const add = $("#bl-add");
    if (add) add.addEventListener("click", () => editer(null));

    const bascule = $("#bl-voirlev");
    if (bascule) bascule.addEventListener("click", () => { voirLevees = !voirLevees; render(); });

    brancher();
  }

  /* Un serveur muet ou trop ancien change ce que vaut la page : on le dit en
     haut plutôt que de laisser croire que tout est déjà partagé. */
  function renderDraftbar() {
    const bar = $("#draftbar");
    if (!bar) return;
    const s = L.souci();
    if (!s) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML =
      '<span class="draftbar__dot" style="background:var(--amber);' +
        'box-shadow:0 0 12px var(--amber)"></span>' +
      '<span class="draftbar__txt"><b>' + esc(s) + "</b> " +
        "<span>La blacklist affichée vient du catalogue et peut être " +
        "incomplète ; l'écrire demandera le droit de publier.</span></span>";
  }

  function corps(l, lev) {
    return (l.length
      ? l.map(carte).join("")
      : '<div class="empty">' + svg(filtre ? "search" : "check") +
        "<b>" + (filtre ? "Rien ne correspond" : "Personne n'est inscrit en ce moment") + "</b>" +
        (filtre ? "<span>Aucune inscription ne contient « " + esc(filtre) + " ».</span>" : "") +
        "</div>") +

      (lev.length
        ? '<div style="margin-top:24px">' +
            '<button class="btn btn--ghost btn--sm" id="bl-voirlev">' +
              svg(voirLevees ? "chevUp" : "chevDown") +
              "<span>" + lev.length + " inscription" + (lev.length > 1 ? "s levées" : " levée") +
              "</span></button>" +
            (voirLevees ? '<div style="margin-top:14px">' + lev.map(carte).join("") + "</div>" : "") +
          "</div>"
        : "");
  }

  function vide() {
    return '<div class="empty">' + svg("check") +
      "<b>Personne sur la blacklist</b>" +
      "<span>" + (peutGerer
        ? "Tant mieux. Si ça se gâte, « Inscrire quelqu'un »."
        : "Tant mieux.") + "</span>" +
    "</div>";
  }

  function carte(x) {
    const r = MNStore.remboursementDe(x.remboursement);
    const lev = !!x.levee;

    return '<div class="panel blentree' + (lev ? " blentree--levee" : "") + '">' +
      '<div class="panel__head">' +
        '<span class="blpoint" aria-hidden="true"></span>' +
        "<h2>" + esc(x.nom) + "</h2>" +
        '<span class="spacer"></span>' +
        (x.remboursement !== "aucun"
          ? '<span class="blrb blrb--' + x.remboursement + '">' + esc(r.nom) +
            (x.montant ? " · " + num(x.montant) + " $" : "") + "</span>"
          : "") +
      "</div>" +
      '<div class="panel__body">' +
        '<p class="blraison">' + esc(x.raison || "Aucune raison notée.") + "</p>" +
        '<p class="hint">Inscrit ' + MNUI.ago(x.at) +
          (x.by ? " par " + esc(x.by) : "") + "." +
          (lev
            ? " Levée " + MNUI.ago(x.levee.at) + (x.levee.by ? " par " + esc(x.levee.by) : "") +
              (x.levee.note ? " — " + esc(x.levee.note) : "") + "."
            : "") + "</p>" +
        (peutGerer
          ? '<div class="row row--wrap" style="margin-top:12px">' +
              (lev
                ? '<button class="btn btn--ghost btn--sm" data-reprendre="' + esc(x.id) + '">' +
                  svg("refresh") + "<span>Réinscrire</span></button>"
                : '<button class="btn btn--ghost btn--sm" data-edit="' + esc(x.id) + '">' +
                  svg("edit") + "<span>Modifier</span></button>" +
                  (x.remboursement === "du"
                    ? '<button class="btn btn--ghost btn--sm" data-rembourse="' + esc(x.id) + '">' +
                      svg("check") + "<span>Marquer remboursé</span></button>"
                    : "") +
                  '<button class="btn btn--ghost btn--sm" data-lever="' + esc(x.id) + '">' +
                  svg("check") + "<span>Lever</span></button>") +
              '<span class="spacer"></span>' +
              '<button class="btn btn--icon btn--sm" data-del="' + esc(x.id) +
                '" aria-label="Supprimer définitivement">' + svg("trash") + "</button>" +
            "</div>"
          : "") +
      "</div></div>";
  }

  function brancher() {
    const par = (attr, fn) => document.querySelectorAll("[data-" + attr + "]")
      .forEach(b => b.addEventListener("click", () => fn(trouver(b.dataset[attr]))));

    par("edit", x => editer(x));
    par("lever", lever);
    par("reprendre", reprendre);
    par("rembourse", rembourse);
    par("del", supprimer);
  }

  const trouver = id => toutes().find(x => x.id === id) || null;

  /* ---- Écriture -------------------------------------------------------------
     Le serveur applique l'opération sur la liste qu'il relit : deux personnes
     qui inscrivent quelqu'un en même temps ne s'écrasent plus. Sans serveur,
     on retombe dans le catalogue — et là il faudra publier. */

  async function ecrire(op, listeVoulue, message) {
    const r = await L.envoyer(op, listeVoulue);
    render();
    if (!r.ok) return MNUI.toast("Enregistrement impossible : " + (r.error || "échec"), "err");
    MNUI.toast(message + (r.local && !MNGitHub.autoActif() ? " — pense à publier" : ""), "ok");
  }

  /** Envoie une entrée modifiée, et la liste correspondante pour le repli. */
  function poser(entree, message) {
    const l = MNStore.clone(toutes());
    const i = l.findIndex(x => x.id === entree.id);
    if (i === -1) l.unshift(entree); else l[i] = entree;
    ecrire({ op: "set", entree }, l, message);
  }

  function editer(x) {
    const neuf = !x;
    const body = document.createElement("div");
    body.innerHTML =
      '<div class="editor">' +
        '<div class="field"><label class="label" for="b-nom">Nom du client</label>' +
          '<input class="input" id="b-nom" maxlength="60" placeholder="Prénom Nom" value="' +
            esc(x ? x.nom : "") + '"></div>' +
        '<div class="field"><label class="label" for="b-raison">Raison</label>' +
          '<textarea class="input" id="b-raison" rows="4" maxlength="600" ' +
            'placeholder="Ce qui s\'est passé, en clair. C\'est ce que lira celui qui le verra arriver.">' +
            esc(x ? x.raison : "") + "</textarea></div>" +
        '<div class="editor__grid">' +
          '<div class="field"><label class="label" for="b-rb">Remboursement</label>' +
            '<select class="select" id="b-rb">' +
              MNStore.REMBOURSEMENTS.map(r =>
                '<option value="' + r.id + '"' +
                  (x && x.remboursement === r.id ? " selected" : "") + ">" +
                  esc(r.nom) + "</option>").join("") +
            "</select></div>" +
          '<div class="field"><label class="label" for="b-montant">Montant ($)</label>' +
            '<input class="input" id="b-montant" type="number" min="0" step="1" value="' +
              (x && x.montant ? x.montant : "") + '" placeholder="0"></div>' +
        "</div>" +
        '<p class="hint">Le montant reste renseignable une fois remboursé : ' +
          "c'est la trace de ce qui a été rendu.</p>" +
      "</div>";

    /* Choisir « Aucun » et laisser un montant n'aurait pas de sens : on grise. */
    const sync = () => {
      body.querySelector("#b-montant").disabled = body.querySelector("#b-rb").value === "aucun";
    };
    body.querySelector("#b-rb").addEventListener("change", sync);
    sync();

    MNUI.modal({
      title: neuf ? "Inscrire quelqu'un" : "Modifier l'inscription",
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: neuf ? "Inscrire" : "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: fermer => {
            const nom = body.querySelector("#b-nom").value.trim();
            if (!nom) return MNUI.toast("Il faut un nom", "err");
            const raison = body.querySelector("#b-raison").value.trim();
            if (!raison) return MNUI.toast("Dis pourquoi : sans raison, l'inscription ne sert à personne", "err");

            const rb = body.querySelector("#b-rb").value;
            const entree = Object.assign({}, x || {}, {
              id: x ? x.id : MNStore.uniqueId(nom, toutes().map(y => y.id)),
              nom, raison, remboursement: rb,
              montant: rb === "aucun"
                ? 0
                : Math.max(0, Math.round(Number(body.querySelector("#b-montant").value) || 0)),
              at: x ? x.at : new Date().toISOString(),
              by: x ? x.by : moi.pseudo,
              levee: x ? x.levee : null
            });

            fermer();
            poser(entree, neuf ? "Inscrit sur la blacklist" : "Inscription modifiée");
          }
        }
      ]
    });
  }

  function lever(x) {
    if (!x) return;
    const body = document.createElement("div");
    body.innerHTML =
      '<div class="editor">' +
        '<p class="hint">« ' + esc(x.nom) + " » sortira de la liste active. " +
          "L'inscription est conservée : on garde la trace de ce qui s'est passé.</p>" +
        (x.remboursement === "du"
          ? '<div class="alert alert--warn">' + svg("alert") +
            "<span>Il reste <b>" + num(x.montant) + " $</b> à lui rembourser. " +
            "Lever l'inscription ne solde pas la dette.</span></div>"
          : "") +
        '<div class="field"><label class="label" for="b-note">Pourquoi ? (facultatif)</label>' +
          '<input class="input" id="b-note" maxlength="300" placeholder="Arrangement trouvé, dette réglée…"></div>' +
      "</div>";

    MNUI.modal({
      title: "Lever l'inscription", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Lever", variant: "btn--primary", icon: "check",
          onClick: fermer => {
            const note = body.querySelector("#b-note").value.trim();
            fermer();
            poser(Object.assign({}, x, {
              levee: { at: new Date().toISOString(), by: moi.pseudo, note }
            }), "Inscription levée");
          }
        }
      ]
    });
  }

  async function reprendre(x) {
    if (!x) return;
    const ok = await MNUI.confirm({
      title: "Réinscrire",
      message: "« " + x.nom + " » revient dans la liste active. La levée précédente est effacée.",
      confirmLabel: "Réinscrire"
    });
    if (!ok) return;
    poser(Object.assign({}, x, {
      levee: null, at: new Date().toISOString(), by: moi.pseudo
    }), "Réinscrit");
  }

  async function rembourse(x) {
    if (!x) return;
    const ok = await MNUI.confirm({
      title: "Marquer remboursé",
      message: (x.montant ? num(x.montant) + " $ ont été rendus à " : "Le remboursement de ") +
        x.nom + (x.montant ? "." : " est fait.") +
        " L'inscription reste en place — un remboursement n'efface pas la raison.",
      confirmLabel: "C'est remboursé"
    });
    if (!ok) return;
    poser(Object.assign({}, x, { remboursement: "fait" }), "Marqué remboursé");
  }

  async function supprimer(x) {
    if (!x) return;
    const ok = await MNUI.confirm({
      title: "Supprimer définitivement",
      message: "L'inscription de « " + x.nom + " » disparaîtra, trace comprise. " +
        "Pour la sortir de la liste en gardant l'historique, utilise plutôt « Lever ».",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    ecrire({ op: "remove", id: x.id }, toutes().filter(y => y.id !== x.id), "Inscription supprimée");
  }
})();
