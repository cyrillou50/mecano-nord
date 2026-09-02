/* ==========================================================================
   Émotes du serveur de jeu.

   Le site ne les joue pas — il n'a aucun moyen de le faire. Il tient la
   liste, parce qu'elle vit ailleurs, qu'elle est longue, et que personne ne
   la retient. Un nom en clair, la commande à taper, et un clic pour l'avoir
   dans le presse-papier : c'est tout ce qu'on demande à un mémo.

   Ouverte à tous en lecture. La permission « emotes » ouvre l'ajout, la
   correction et la suppression. La liste vit sur le serveur (voir
   listes.js) : l'écrire ne demande pas le droit de publier le site.

   Chaque garage a la sienne. On ne voit ici que celles du garage où l'on
   travaille — le bouton Nord / Sud de la barre du haut change les deux.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;
  const L = MNListes.emotes;

  const SANS_CAT = "Sans catégorie";

  let peutGerer = false;
  let filtre = "";

  /* Un serveur de jeu en a des centaines : les catégories se replient, et
     l'état tient dans le navigateur — c'est un confort de lecture, pas une
     donnée d'atelier. */
  const plis = MNUI.folds("mn.emotes.folds");

  MNUI.start({ page: "emotes", title: "Émotes", onReady: init });

  async function init() {
    peutGerer = MNAuth.canAny("emotes", "items", "admin");
    await L.load(true).catch(e => console.error(e));
    render();
  }

  /* ---- Lecture ------------------------------------------------------------- */

  /* Tout ce que le serveur tient, les deux garages confondus. Les écritures
     partent de là : n'envoyer que ce qu'on voit effacerait l'autre côté. */
  const brut = () => L.liste();

  const ici = () => MNAuth.atelier();

  /** Celles du garage où l'on travaille. */
  const toutes = () => brut().filter(e => MNStore.estDeAtelier(e, ici()));

  function liste() {
    const q = filtre.trim().toLowerCase();
    if (!q) return toutes();
    return toutes().filter(e =>
      (e.nom + " " + e.commande + " " + e.categorie + " " + e.note)
        .toLowerCase().indexOf(q) !== -1);
  }

  /** Les émotes rangées par catégorie, dans l'ordre alphabétique des noms. */
  function groupes() {
    const l = liste();
    const noms = [];
    l.forEach(e => {
      const c = e.categorie || SANS_CAT;
      if (noms.indexOf(c) === -1) noms.push(c);
    });
    noms.sort((a, b) => {
      /* « Sans catégorie » en dernier : c'est le fourre-tout, pas une rubrique. */
      if (a === SANS_CAT) return 1;
      if (b === SANS_CAT) return -1;
      return a.localeCompare(b, "fr");
    });
    return noms.map(c => ({
      nom: c,
      emotes: l.filter(e => (e.categorie || SANS_CAT) === c)
        .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    }));
  }

  /* ---- Rendu ---------------------------------------------------------------- */

  function render() {
    const total = toutes().length;

    $("#emotes-root").innerHTML =
      '<h1 class="page-title">Émotes</h1>' +
      '<p class="page-sub">Les animations du serveur de jeu au ' +
        esc(MNStore.nomAtelier(ici())) + ". Clique sur une commande pour la copier.</p>" +

      (peutGerer || total
        ? '<div class="row row--wrap" style="margin-bottom:18px">' +
            (peutGerer
              ? '<button class="btn btn--primary" id="em-add">' + svg("plus") +
                  "<span>Ajouter</span></button>" +
                '<button class="btn btn--ghost" id="em-import">' + svg("upload") +
                  "<span>Importer une liste</span></button>" +
                '<span class="spacer"></span>'
              : "") +
            (total
              ? '<input class="input" id="em-q" style="max-width:300px" ' +
                'placeholder="Rechercher une émote…" value="' + esc(filtre) + '">'
              : "") +
          "</div>"
        : "") +

      (total ? '<div id="em-liste"></div>' : vide());

    renderDraftbar();

    const q = $("#em-q");
    if (q) q.addEventListener("input", () => {
      filtre = q.value;
      renderListe();
      /* Redessiner la liste vole le curseur : on le rend. */
      const n = $("#em-q");
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    });

    const add = $("#em-add");
    if (add) add.addEventListener("click", () => editer(null));
    const imp = $("#em-import");
    if (imp) imp.addEventListener("click", importer);

    if (total) renderListe();
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
        "<span>Les émotes affichées viennent du catalogue ; les modifier " +
        "demandera le droit de publier.</span></span>";
  }

  function vide() {
    return '<div class="empty">' + svg("star") +
      "<b>Aucune émote enregistrée</b>" +
      "<span>" + (peutGerer
        ? "Ajoute-les une à une, ou colle la liste du serveur d'un coup avec " +
          "« Importer une liste »."
        : "Un responsable les ajoutera depuis cette page.") + "</span>" +
    "</div>";
  }

  function renderListe() {
    const host = $("#em-liste");
    if (!host) return;
    const gs = groupes();

    if (!gs.length) {
      host.innerHTML = '<div class="empty">' + svg("search") +
        "<b>Rien ne correspond</b><span>Aucune émote ne contient « " +
        esc(filtre) + " ».</span></div>";
      return;
    }

    host.innerHTML = gs.map(g => {
      const ouvert = !plis.has(g.nom);
      return '<div class="panel emgroupe">' +
        '<button class="panel__head emgroupe__tete" type="button" data-pli="' + esc(g.nom) + '">' +
          svg(ouvert ? "chevDown" : "chevUp") +
          "<h2>" + esc(g.nom) + "</h2>" +
          '<span class="tab__n">' + g.emotes.length + "</span>" +
        "</button>" +
        (ouvert
          ? '<div class="panel__body emgrille">' + g.emotes.map(ligne).join("") + "</div>"
          : "") +
      "</div>";
    }).join("");

    host.querySelectorAll("[data-pli]").forEach(b =>
      b.addEventListener("click", () => { plis.toggle(b.dataset.pli); renderListe(); }));

    host.querySelectorAll("[data-cmd]").forEach(b =>
      b.addEventListener("click", () =>
        MNUI.copy(b.dataset.cmd, "« " + b.dataset.cmd + " » copiée")));

    host.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => editer(trouver(b.dataset.edit))));

    host.querySelectorAll("[data-del]").forEach(b =>
      b.addEventListener("click", () => supprimer(trouver(b.dataset.del))));
  }

  function ligne(e) {
    return '<div class="emote">' +
      '<div class="emote__txt"><b>' + esc(e.nom) + "</b>" +
        (e.note ? "<i>" + esc(e.note) + "</i>" : "") + "</div>" +
      (e.commande
        ? '<button class="emote__cmd" type="button" data-cmd="' + esc(e.commande) + '" ' +
          'title="Copier la commande">' + esc(e.commande) + svg("copy") + "</button>"
        : '<span class="emote__cmd emote__cmd--vide">commande non renseignée</span>') +
      (peutGerer
        ? '<div class="row emote__act">' +
            '<button class="btn btn--icon btn--sm" data-edit="' + esc(e.id) +
              '" aria-label="Modifier ' + esc(e.nom) + '">' + svg("edit") + "</button>" +
            '<button class="btn btn--icon btn--sm" data-del="' + esc(e.id) +
              '" aria-label="Supprimer ' + esc(e.nom) + '">' + svg("trash") + "</button>" +
          "</div>"
        : "") +
    "</div>";
  }

  const trouver = id => brut().find(e => e.id === id) || null;

  /**
   * Retire une émote d'ici. Elle vaut peut-être aussi dans l'autre garage : dans ce
   * cas on ne l'efface pas, on lui retire ce garage-ci. Supprimer pour de
   * bon ne se fait que là où elle n'existe plus qu'ici.
   * @returns {{op:object, liste:Array, partagee:boolean}}
   */
  function retirer(e) {
    const ats = MNStore.ateliersDe(e);
    const reste = ats.filter(a => a !== ici());

    if (!reste.length) {
      return { op: { op: "remove", id: e.id },
               liste: brut().filter(y => y.id !== e.id),
               partagee: false };
    }

    const entree = Object.assign({}, e, { ateliers: reste });
    const liste = MNStore.clone(brut());
    const i = liste.findIndex(y => y.id === e.id);
    if (i !== -1) liste[i] = entree;
    return { op: { op: "set", entree }, liste, partagee: true };
  }


  /* ---- Le garage où vaut une entrée ------------------------------------------
     Même contrôle que dans l'administration : des cases, une par garage. Une
     émote peut valoir des deux côtés — beaucoup le font. */

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
     qui ajoutent une émote en même temps ne s'écrasent plus. Sans serveur, on
     retombe dans le catalogue — et là il faudra publier. */

  async function ecrire(op, listeVoulue, message) {
    const r = await L.envoyer(op, listeVoulue);
    render();
    if (!r.ok) return MNUI.toast("Enregistrement impossible : " + (r.error || "échec"), "err");
    MNUI.toast(message + (r.local && !MNGitHub.autoActif() ? " — pense à publier" : ""), "ok");
  }

  /** Les catégories déjà utilisées, pour ne pas les retaper à la lettre près. */
  function catsConnues() {
    const l = [];
    toutes().forEach(e => {
      if (e.categorie && l.indexOf(e.categorie) === -1) l.push(e.categorie);
    });
    return l.sort((a, b) => a.localeCompare(b, "fr"));
  }

  function editer(e) {
    const neuf = !e;
    const cats = catsConnues();
    const body = document.createElement("div");
    body.innerHTML =
      '<div class="editor">' +
        '<div class="field"><label class="label" for="e-nom">Nom</label>' +
          '<input class="input" id="e-nom" maxlength="60" placeholder="Réparer le moteur" value="' +
            esc(e ? e.nom : "") + '"></div>' +
        '<div class="field"><label class="label" for="e-cmd">Commande</label>' +
          '<input class="input mono" id="e-cmd" maxlength="80" placeholder="/e mechanic2" value="' +
            esc(e ? e.commande : "") + '">' +
          '<p class="hint">Telle qu\'on la tape en jeu. Le « / » est ajouté s\'il manque.</p></div>' +
        '<div class="field"><label class="label" for="e-cat">Catégorie</label>' +
          '<input class="input" id="e-cat" maxlength="40" list="e-cats" placeholder="Mécanique" value="' +
            esc(e ? e.categorie : "") + '">' +
          '<datalist id="e-cats">' +
            cats.map(c => '<option value="' + esc(c) + '">').join("") +
          "</datalist>" +
          '<p class="hint">Facultatif. Vide = « ' + SANS_CAT + " ».</p></div>" +
        '<div class="field"><label class="label" for="e-note">Note</label>' +
          '<input class="input" id="e-note" maxlength="200" placeholder="Quand l\'utiliser, ce qu\'elle montre…" value="' +
            esc(e ? e.note : "") + '"></div>' +
        champAteliers("e-at", e ? MNStore.ateliersDe(e) : [ici()]) +
      "</div>";

    MNUI.modal({
      title: neuf ? "Nouvelle émote" : "Modifier l'émote",
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: neuf ? "Ajouter" : "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: fermer => {
            const nom = body.querySelector("#e-nom").value.trim();
            let cmd = body.querySelector("#e-cmd").value.trim();
            if (!nom && !cmd) return MNUI.toast("Il faut au moins un nom ou une commande", "err");
            if (cmd && cmd[0] !== "/") cmd = "/" + cmd;

            const ats = lireAteliers("e-at");
            if (!ats.length) return MNUI.toast("Choisis au moins un garage", "err");

            const entree = {
              id: e ? e.id : MNStore.uniqueId(nom || cmd, brut().map(x => x.id)),
              nom: nom || cmd,
              commande: cmd,
              categorie: body.querySelector("#e-cat").value.trim(),
              note: body.querySelector("#e-note").value.trim(),
              ateliers: ats
            };

            /* Ce que la liste doit devenir, pour le repli sans serveur. */
            const l = MNStore.clone(brut());
            const i = l.findIndex(x => x.id === entree.id);
            if (i === -1) l.push(entree); else l[i] = entree;

            fermer();
            ecrire({ op: "set", entree }, l, neuf ? "Émote ajoutée" : "Émote modifiée");
          }
        }
      ]
    });
  }

  async function supprimer(e) {
    if (!e) return;
    const r = retirer(e);
    const ok = await MNUI.confirm({
      title: "Supprimer l'émote",
      message: r.partagee
        ? "« " + e.nom + " » ne sera plus proposée au " + MNStore.nomAtelier(ici()) +
          ". Elle reste en place dans l'autre garage."
        : "« " + e.nom + " » sera retirée de la liste.",
      confirmLabel: r.partagee ? "Retirer d'ici" : "Supprimer", danger: true
    });
    if (!ok) return;
    ecrire(r.op, r.liste, r.partagee
      ? "Retirée du " + MNStore.nomAtelier(ici())
      : "Émote supprimée");
  }

  /* ---- Import en masse --------------------------------------------------------
     Un serveur de jeu en publie des centaines d'un bloc. Les saisir une à une
     serait une soirée perdue, et personne ne le ferait — la liste resterait
     vide, et la page avec.

     On accepte donc ce que les gens ont sous la main : une ligne par émote,
     les champs séparés par « | », une tabulation ou un point-virgule. Une
     ligne d'un seul champ est une commande, et sert aussi de nom. */

  function lireLignes(texte, ordreNom) {
    const out = [];
    String(texte || "").split(/\r?\n/).forEach(brut => {
      const l = brut.trim();
      if (!l || l[0] === "#") return;                 // vide ou commentée
      const ch = l.split(/\s*[|;\t]\s*/).filter(x => x !== "");
      if (!ch.length) return;

      let nom = "", cmd = "", cat = "";
      if (ch.length === 1) {
        cmd = ch[0]; nom = ch[0];
      } else if (ordreNom) {
        nom = ch[0]; cmd = ch[1]; cat = ch[2] || "";
      } else {
        cmd = ch[0]; nom = ch[1]; cat = ch[2] || "";
      }
      cmd = cmd.trim();
      if (cmd && cmd[0] !== "/") cmd = "/" + cmd;
      out.push({ nom: nom.trim(), commande: cmd, categorie: cat.trim(), note: "" });
    });
    return out;
  }

  function importer() {
    const body = document.createElement("div");
    body.innerHTML =
      '<div class="editor">' +
        '<p class="hint">Une émote par ligne. Sépare les champs par <code>|</code>, ' +
          "une tabulation ou un point-virgule. Une ligne d'un seul champ est prise " +
          "pour une commande.</p>" +
        '<div class="field"><label class="label" for="i-ordre">Ordre des colonnes</label>' +
          '<select class="select" id="i-ordre">' +
            '<option value="cmd">Commande | Nom | Catégorie</option>' +
            '<option value="nom">Nom | Commande | Catégorie</option>' +
          "</select></div>" +
        '<div class="field"><label class="label" for="i-txt">La liste</label>' +
          '<textarea class="input mono" id="i-txt" rows="10" placeholder="/e mechanic2 | Réparer le moteur | Mécanique&#10;' +
            '/e weld | Souder | Mécanique&#10;/e wave | Saluer | Accueil"></textarea></div>' +
        '<label class="switch"><input type="checkbox" id="i-vider">' +
          '<span class="switch__box"></span>' +
          "<span>Remplacer la liste actuelle</span></label>" +
        '<p class="hint">Décoché, l\'import s\'ajoute à ce qui existe. Une commande ' +
          "déjà présente est mise à jour plutôt que dupliquée.</p>" +
        '<div id="i-apercu"></div>' +
      "</div>";

    const apercu = () => {
      const l = lireLignes(body.querySelector("#i-txt").value,
                           body.querySelector("#i-ordre").value === "nom");
      body.querySelector("#i-apercu").innerHTML = l.length
        ? '<div class="alert alert--ok">' + svg("check") + "<span>" + l.length +
          " émote" + (l.length > 1 ? "s" : "") + " lue" + (l.length > 1 ? "s" : "") +
          " — la première : <b>" + esc(l[0].nom) + "</b> " +
          '<span class="mono">' + esc(l[0].commande) + "</span></span></div>"
        : "";
    };
    body.querySelector("#i-txt").addEventListener("input", apercu);
    body.querySelector("#i-ordre").addEventListener("change", apercu);

    MNUI.modal({
      title: "Importer une liste d'émotes", body, wide: true,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Importer", variant: "btn--primary", icon: "upload",
          onClick: fermer => {
            const lues = lireLignes(body.querySelector("#i-txt").value,
                                    body.querySelector("#i-ordre").value === "nom");
            if (!lues.length) return MNUI.toast("Rien à importer", "err");

            const vider = body.querySelector("#i-vider").checked;
            const ou = ici();

            /* « Remplacer » ne remplace que le garage regardé. Ce qui ne le
               concerne pas voyage avec l'envoi, sans quoi l'autre côté serait
               effacé. Et une émote partagée n'est pas « d'ailleurs » : vider
               ici lui retire ce garage, ça ne la supprime pas chez le voisin. */
            const ailleurs = [];
            brut().forEach(x => {
              const ats = MNStore.ateliersDe(x);
              if (ats.indexOf(ou) === -1) return ailleurs.push(x);
              if (!vider) return;                    // gardée dans la liste d'ici
              const reste = ats.filter(a => a !== ou);
              if (reste.length) ailleurs.push(Object.assign({}, x, { ateliers: reste }));
            });

            const l = vider ? [] : MNStore.clone(toutes());
            let ajout = 0, maj = 0;

            lues.forEach(e => {
              e.ateliers = [ou];
              /* La commande fait l'identité : c'est elle qu'on tape, et deux
                 émotes ne peuvent pas partager la même. À défaut, le nom. */
              const memeQue = x => e.commande
                ? x.commande === e.commande
                : x.nom.toLowerCase() === e.nom.toLowerCase();
              const deja = l.find(memeQue);
              if (deja) {
                /* Une émote déjà partagée le reste : l'import ne la retire pas
                   du garage d'à côté. */
                Object.assign(deja, e, { id: deja.id, ateliers: MNStore.ateliersDe(deja) });
                maj++;
              } else {
                l.push(Object.assign({
                  id: MNStore.uniqueId(e.nom || e.commande, brut().map(x => x.id))
                }, e));
                ajout++;
              }
            });

            const complet = ailleurs.concat(l);

            fermer();
            /* Un import remplace la liste d'un bloc : entrée par entrée, ce
               serait trois cents allers-retours pour un seul geste. */
            ecrire({ op: "remplacer", entrees: complet }, complet,
                   ajout + " ajoutée" + (ajout > 1 ? "s" : "") +
                   (maj ? ", " + maj + " mise" + (maj > 1 ? "s" : "") + " à jour" : "") +
                   " au " + MNStore.nomAtelier(ou));
          }
        }
      ]
    });
  }
})();
