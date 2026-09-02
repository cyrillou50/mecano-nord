/* ==========================================================================
   Blacklist de l'atelier.

   Les clients qu'on ne sert plus, pourquoi, et ce qu'on leur doit encore.
   Elle se lit au comptoir, par celui qui reçoit : la réserver aux
   responsables reviendrait à ne pas l'avoir. Seule l'écriture demande la
   permission « blacklist ».

   Une inscription levée n'est pas supprimée — elle sort de la liste active et
   garde sa trace, comme un avertissement. On doit pouvoir dire qu'elle a
   existé, et qui l'a levée.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc, num = MNUI.num;

  let moi = null;
  let peutGerer = false;
  let filtre = "";
  let voirLevees = false;

  MNUI.start({ page: "blacklist", title: "Blacklist", onReady: init });

  function init(session) {
    moi = session;
    peutGerer = MNAuth.canAny("blacklist", "admin");
    render();
    /* La liste vit dans le catalogue : elle change quand quelqu'un publie. */
    MNStore.onChange(() => { if ($("#blacklist-root")) render(); });
  }

  /* ---- Lecture ------------------------------------------------------------- */

  const actives = () => MNStore.blacklist();
  const levees = () => MNStore.blacklistLevee();
  const toutes = () => MNStore.catalog().blacklist || [];

  function filtrer(l) {
    const q = filtre.trim().toLowerCase();
    if (!q) return l;
    return l.filter(x =>
      (x.nom + " " + x.raison).toLowerCase().indexOf(q) !== -1);
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

    $("#blacklist-root").innerHTML =
      '<h1 class="page-title">Blacklist</h1>' +
      '<p class="page-sub">Les clients qu\'on ne sert plus, et pourquoi</p>' +

      (peutGerer
        ? '<div class="row row--wrap" style="margin-bottom:18px">' +
            '<button class="btn btn--primary" id="bl-add">' + svg("plus") +
              "<span>Inscrire quelqu'un</span></button>" +
          "</div>"
        : "") +

      /* Le total dû se voit d'un coup d'œil : c'est de l'argent de l'atelier
         qui dort chez quelqu'un, pas une ligne de plus dans une fiche. */
      (du
        ? '<div class="alert alert--warn" style="margin-bottom:18px">' + svg("alert") +
          "<span><b>" + num(du) + " $</b> restent à rembourser, " +
          "toutes inscriptions confondues.</span></div>"
        : "") +

      (toutes().length
        ? '<div class="row" style="margin-bottom:18px">' +
            '<input class="input" id="bl-q" placeholder="Rechercher un nom, une raison…" value="' +
              esc(filtre) + '">' +
          "</div>"
        : "") +

      (toutes().length ? corps(l, lev) : vide());

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

  function corps(l, lev) {
    return (l.length
      ? l.map(carte).join("")
      : '<p class="hint">' + (filtre
          ? "Rien ne correspond à « " + esc(filtre) + " »."
          : "Personne n'est inscrit en ce moment.") + "</p>") +

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
    return '<div class="panel"><div class="panel__body" style="text-align:center;padding:40px 20px">' +
      svg("check") +
      '<h2 style="margin:12px 0 6px">Personne sur la blacklist</h2>' +
      '<p class="hint">' + (peutGerer
        ? "Tant mieux. Si ça se gâte, « Inscrire quelqu'un »."
        : "Tant mieux.") + "</p>" +
      "</div></div>";
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
     La blacklist vit dans le catalogue. On l'écrit, et l'envoi part tout seul.

     Une réserve honnête : deux personnes qui inscrivent quelqu'un à la même
     seconde, chacune de son côté, s'écrasent — c'est tout le catalogue qui
     part, pas la ligne. Sur une liste où l'on ajoute une entrée par semaine,
     le risque est théorique ; s'il devient réel, il faudra une route dédiée
     sur le serveur, comme pour les contrats. */

  function ecrire(l, message) {
    const c = MNStore.clone(MNStore.catalog());
    c.blacklist = l;
    MNStore.saveDraft(c);
    render();
    if (message) MNUI.toast(message, "ok");
  }

  /** Remplace une entrée par la même, modifiée. */
  function majUne(id, changements, message) {
    const l = MNStore.clone(toutes());
    const e = l.find(x => x.id === id);
    if (!e) return;
    Object.assign(e, changements);
    ecrire(l, message);
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
      const rb = body.querySelector("#b-rb").value;
      body.querySelector("#b-montant").disabled = rb === "aucun";
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
            const donnees = {
              nom,
              raison,
              remboursement: rb,
              montant: rb === "aucun" ? 0 : Math.max(0, Math.round(Number(body.querySelector("#b-montant").value) || 0))
            };

            const l = MNStore.clone(toutes());
            if (neuf) {
              l.unshift(Object.assign({
                id: MNStore.uniqueId(nom, l.map(y => y.id)),
                at: new Date().toISOString(),
                by: moi.pseudo,
                levee: null
              }, donnees));
            } else {
              Object.assign(l.find(y => y.id === x.id), donnees);
            }
            fermer();
            ecrire(l, neuf ? "Inscrit sur la blacklist" : "Inscription modifiée");
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
            fermer();
            majUne(x.id, {
              levee: {
                at: new Date().toISOString(),
                by: moi.pseudo,
                note: body.querySelector("#b-note").value.trim()
              }
            }, "Inscription levée");
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
    majUne(x.id, { levee: null, at: new Date().toISOString(), by: moi.pseudo }, "Réinscrit");
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
    majUne(x.id, { remboursement: "fait" }, "Marqué remboursé");
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
    ecrire(toutes().filter(y => y.id !== x.id), "Inscription supprimée");
  }
})();
