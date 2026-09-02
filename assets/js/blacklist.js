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

   Chaque garage tient la sienne. On ne voit ici que les inscriptions du
   garage où l'on travaille — un client peut avoir un compte à régler d'un
   côté seulement. Le bouton Nord / Sud de la barre du haut change de liste.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;
  const mnIcon = window.mnIcon;
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

  /* Tout ce que le serveur tient, les deux garages confondus. Les écritures
     partent de là : n'envoyer que ce qu'on voit effacerait l'autre côté. */
  const brut = () => L.liste();

  const ici = () => MNAuth.atelier();

  /** Celles du garage où l'on travaille. */
  const toutes = () => brut().filter(x => MNStore.estDeAtelier(x, ici()));
  const actives = () => toutes().filter(x => !x.levee);
  const levees = () => toutes().filter(x => x.levee);

  function filtrer(l) {
    const q = filtre.trim().toLowerCase();
    if (!q) return l;
    return l.filter(x => (x.nom + " " + x.raison).toLowerCase().indexOf(q) !== -1);
  }

  /** Ce qui reste à rendre, tous clients confondus, ressource par ressource. */
  const duTotal = () => MNStore.sommeRessources(
    actives().filter(x => x.remboursement === "du").map(x => x.ressources));

  const rien = o => !Object.keys(o || {}).some(k => o[k] > 0);

  /**
   * Un panier de ressources, en pastilles colorées.
   * Une ressource que le catalogue ne connaît plus garde son identifiant :
   * mieux vaut un nom brut qu'une dette qui disparaît de l'écran.
   */
  function pastilles(panier) {
    return Object.keys(panier || {}).filter(k => panier[k] > 0).map(k => {
      const r = MNStore.resourceById(k);
      return '<span class="respast"' + (r ? ' style="--res:' + esc(r.color) + '"' : "") + ">" +
        (r ? mnIcon(r.icon) : "") +
        "<b>" + panier[k] + "</b><i>" + esc(r ? r.name : k) + "</i></span>";
    }).join("");
  }

  /* ---- Rendu ---------------------------------------------------------------- */

  function render() {
    const l = filtrer(actives());
    const lev = filtrer(levees());
    const du = duTotal();
    const total = toutes().length;

    $("#blacklist-root").innerHTML =
      '<h1 class="page-title">Blacklist</h1>' +
      '<p class="page-sub">Les clients qu\'on ne sert plus au ' +
        esc(MNStore.nomAtelier(ici())) + ", et pourquoi</p>" +

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
      (rien(du)
        ? ""
        : '<div class="alert alert--warn" style="margin-bottom:18px">' + svg("alert") +
          "<span>Restent à rembourser, toutes inscriptions confondues : " +
          "<b>" + esc(MNStore.ressourcesEnClair(du)) + "</b>.</span></div>") +

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
          ? '<span class="blrb blrb--' + x.remboursement + '">' + esc(r.nom) + "</span>"
          : "") +
      "</div>" +
      '<div class="panel__body">' +
        '<p class="blraison">' + esc(x.raison || "Aucune raison notée.") + "</p>" +
        (x.remboursement !== "aucun" && !rien(x.ressources)
          ? '<div class="respaniers">' +
              '<span class="respaniers__quoi">' +
                (x.remboursement === "du" ? "À rendre" : "Rendu") + "</span>" +
              pastilles(x.ressources) +
            "</div>"
          : "") +
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

  const trouver = id => brut().find(x => x.id === id) || null;

  /* ---- Le garage où vaut une inscription -------------------------------------
     Même contrôle que dans l'administration : des cases, une par garage. Un
     client peut être refusé des deux côtés — c'est même le cas courant. */

  function champAteliers(id, choisis) {
    return '<div class="fieldset"><span class="label">Ateliers</span>' +
      '<div class="motifs" id="' + id + '">' +
        MNStore.ATELIERS.map(a =>
          '<label class="motif"><input type="checkbox" value="' + esc(a.id) + '"' +
            (choisis.indexOf(a.id) !== -1 ? " checked" : "") + ">" +
            "<span>" + esc(a.nom) + "</span></label>").join("") +
      "</div></div>";
  }

  const lireAteliers = id => [...document.querySelectorAll("#" + id + " input:checked")]
    .map(x => x.value);

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
    const l = MNStore.clone(brut());
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
        '<div class="field"><label class="label" for="b-rb">Remboursement</label>' +
          '<select class="select" id="b-rb">' +
            MNStore.REMBOURSEMENTS.map(r =>
              '<option value="' + r.id + '"' +
                (x && x.remboursement === r.id ? " selected" : "") + ">" +
                esc(r.nom) + "</option>").join("") +
          "</select></div>" +
        champAteliers("b-at", x ? MNStore.ateliersDe(x) : [ici()]) +
        '<div class="field" id="b-resbloc">' +
          '<label class="label">Ce qu\'on doit rendre</label>' +
          '<div class="costs" id="b-res"></div>' +
          '<div><button class="btn btn--ghost btn--sm" id="b-res-add" type="button">' +
            svg("plus") + "<span>Ajouter une ressource</span></button></div>" +
          '<p class="hint">L\'atelier facture en ressources : on rend de la ' +
            "Ferraille, du Plastique, pas des dollars. La liste reste renseignée " +
            "une fois le remboursement fait — c'est la trace de ce qui a été rendu.</p>" +
        "</div>" +
      "</div>";

    /* ---- Les ressources dues, ligne par ligne ---- */

    const dispo = MNStore.catalog().resources || [];
    const lignes = Object.keys((x && x.ressources) || {})
      .filter(k => x.ressources[k] > 0)
      .map(k => ({ rid: k, qte: x.ressources[k] }));

    const hote = body.querySelector("#b-res");

    function peindre() {
      if (!dispo.length) {
        hote.innerHTML = '<p class="hint hint--warn">Aucune ressource au catalogue. ' +
          "Crée-les dans l'administration, onglet « Ressources ».</p>";
        return;
      }
      if (!lignes.length) {
        hote.innerHTML = '<p class="hint">Rien pour l\'instant — ajoute une ressource.</p>';
        return;
      }
      hote.innerHTML = lignes.map((l, i) =>
        '<div class="cost" data-i="' + i + '">' +
          '<select class="select" data-k="rid">' + dispo.map(r =>
            '<option value="' + esc(r.id) + '"' + (r.id === l.rid ? " selected" : "") + ">" +
            esc(r.name) + "</option>").join("") + "</select>" +
          '<input class="input input--num" type="number" min="0" max="999999" data-k="qte" value="' +
            Number(l.qte) + '">' +
          '<button class="btn btn--icon" data-k="del" type="button" aria-label="Retirer">' +
            svg("x") + "</button>" +
        "</div>").join("");

      hote.querySelectorAll(".cost").forEach(row => {
        const i = Number(row.dataset.i);
        row.querySelector('[data-k="rid"]').addEventListener("change", e => { lignes[i].rid = e.target.value; });
        row.querySelector('[data-k="qte"]').addEventListener("input", e => { lignes[i].qte = e.target.value; });
        row.querySelector('[data-k="del"]').addEventListener("click", () => { lignes.splice(i, 1); peindre(); });
      });
    }
    peindre();

    body.querySelector("#b-res-add").addEventListener("click", () => {
      if (!dispo.length) return;
      const pris = lignes.map(l => l.rid);
      const libre = dispo.find(r => pris.indexOf(r.id) === -1) || dispo[0];
      lignes.push({ rid: libre.id, qte: 1 });
      peindre();
    });

    /* Rien à rendre : la liste n'a plus lieu d'être affichée. */
    const sync = () => {
      body.querySelector("#b-resbloc").hidden =
        body.querySelector("#b-rb").value === "aucun";
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

            const ats = lireAteliers("b-at");
            if (!ats.length) return MNUI.toast("Choisis au moins un garage", "err");

            const rb = body.querySelector("#b-rb").value;
            const ressources = {};
            if (rb !== "aucun") {
              lignes.forEach(l => {
                const q = Math.max(0, Math.round(Number(l.qte) || 0));
                /* Deux lignes sur la même ressource s'additionnent plutôt que
                   de s'écraser : c'est ce qu'on attend en les ajoutant. */
                if (q > 0) ressources[l.rid] = (ressources[l.rid] || 0) + q;
              });
            }

            const entree = Object.assign({}, x || {}, {
              id: x ? x.id : MNStore.uniqueId(nom, brut().map(y => y.id)),
              nom, raison, remboursement: rb, ressources, ateliers: ats,
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
        (x.remboursement === "du" && !rien(x.ressources)
          ? '<div class="alert alert--warn">' + svg("alert") +
            "<span>Il reste <b>" + esc(MNStore.ressourcesEnClair(x.ressources)) +
            "</b> à lui rendre. Lever l'inscription ne solde pas la dette.</span></div>"
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
      message: (rien(x.ressources)
        ? "Le remboursement de " + x.nom + " est fait."
        : MNStore.ressourcesEnClair(x.ressources) + " ont été rendus à " + x.nom + ".") +
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
    ecrire({ op: "remove", id: x.id }, brut().filter(y => y.id !== x.id), "Inscription supprimée");
  }
})();
