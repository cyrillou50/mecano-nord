/* ==========================================================================
   Émotes du serveur de jeu.

   Le site ne les joue pas — il n'a aucun moyen de le faire. Il tient la
   liste, parce qu'elle vit ailleurs, qu'elle est longue, et que personne ne
   la retient. Un nom en clair, la commande à taper, et un clic pour l'avoir
   dans le presse-papier : c'est tout ce qu'on demande à un mémo.

   Ouverte à tous en lecture. La permission « emotes » ouvre l'ajout, la
   correction et la suppression.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;

  const SANS_CAT = "Sans catégorie";

  let peutGerer = false;
  let filtre = "";

  /* Un serveur de jeu en a des centaines : les catégories se replient, et
     l'état tient dans le navigateur — c'est un confort de lecture, pas une
     donnée d'atelier. */
  const plis = MNUI.folds("mn.emotes.folds");

  MNUI.start({ page: "emotes", title: "Émotes", onReady: init });

  function init() {
    peutGerer = MNAuth.canAny("emotes", "items", "admin");
    render();
    /* La liste vit dans le catalogue : elle change quand quelqu'un publie. */
    MNStore.onChange(() => { if ($("#emotes-root")) render(); });
  }

  /* ---- Lecture ------------------------------------------------------------- */

  const toutes = () => MNStore.emotes();

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
      '<p class="page-sub">Les animations du serveur de jeu. ' +
        "Clique sur une commande pour la copier.</p>" +

      (peutGerer
        ? '<div class="row row--wrap" style="margin-bottom:18px">' +
            '<button class="btn btn--primary" id="em-add">' + svg("plus") +
              "<span>Ajouter</span></button>" +
            '<button class="btn btn--ghost" id="em-import">' + svg("upload") +
              "<span>Importer une liste</span></button>" +
          "</div>"
        : "") +

      (total
        ? '<div class="row" style="margin-bottom:18px">' +
            '<input class="input" id="em-q" placeholder="Rechercher une émote…" value="' +
              esc(filtre) + '">' +
          "</div>" +
          '<div id="em-liste"></div>'
        : vide());

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

  function vide() {
    return '<div class="panel"><div class="panel__body" style="text-align:center;padding:40px 20px">' +
      svg("star") +
      "<h2 style=\"margin:12px 0 6px\">Aucune émote enregistrée</h2>" +
      '<p class="hint">' + (peutGerer
        ? "Ajoute-les une à une, ou colle la liste du serveur d'un coup avec " +
          "« Importer une liste »."
        : "Un responsable les ajoutera depuis cette page.") + "</p>" +
      "</div></div>";
  }

  function renderListe() {
    const host = $("#em-liste");
    if (!host) return;
    const gs = groupes();

    if (!gs.length) {
      host.innerHTML = '<p class="hint">Rien ne correspond à « ' + esc(filtre) + " ».</p>";
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

  const trouver = id => toutes().find(e => e.id === id) || null;

  /* ---- Écriture -------------------------------------------------------------
     Les émotes vivent dans le catalogue. On l'écrit, et l'envoi part tout
     seul — il n'y a plus rien à publier à la main. */

  function ecrire(emotes, message) {
    const c = MNStore.clone(MNStore.catalog());
    c.emotes = emotes;
    MNStore.saveDraft(c);
    render();
    if (message) MNUI.toast(message, "ok");
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
            const cmd = body.querySelector("#e-cmd").value.trim();
            if (!nom && !cmd) return MNUI.toast("Il faut au moins un nom ou une commande", "err");

            const l = MNStore.clone(toutes());
            const donnees = {
              nom: nom || cmd,
              commande: cmd,
              categorie: body.querySelector("#e-cat").value.trim(),
              note: body.querySelector("#e-note").value.trim()
            };

            if (neuf) {
              l.push(Object.assign({ id: MNStore.uniqueId(donnees.nom, l.map(x => x.id)) }, donnees));
            } else {
              Object.assign(l.find(x => x.id === e.id), donnees);
            }
            fermer();
            ecrire(l, neuf ? "Émote ajoutée" : "Émote modifiée");
          }
        }
      ]
    });
  }

  async function supprimer(e) {
    if (!e) return;
    const ok = await MNUI.confirm({
      title: "Supprimer l'émote",
      message: "« " + e.nom + " » sera retirée de la liste.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    ecrire(toutes().filter(x => x.id !== e.id), "Émote supprimée");
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
      if (!l || l[0] === "#") return;                 // vide ou commenté
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
      out.push({ nom: nom.trim(), commande: cmd.trim(), categorie: cat.trim(), note: "" });
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
            const l = vider ? [] : MNStore.clone(toutes());
            let ajout = 0, maj = 0;

            lues.forEach(e => {
              /* La commande fait l'identité : c'est elle qu'on tape, et deux
                 émotes ne peuvent pas partager la même. À défaut, le nom. */
              const memeQue = x => e.commande
                ? x.commande === e.commande
                : x.nom.toLowerCase() === e.nom.toLowerCase();
              const deja = l.find(memeQue);
              if (deja) { Object.assign(deja, e, { id: deja.id }); maj++; }
              else {
                l.push(Object.assign({ id: MNStore.uniqueId(e.nom || e.commande, l.map(x => x.id)) }, e));
                ajout++;
              }
            });

            fermer();
            ecrire(l, ajout + " ajoutée" + (ajout > 1 ? "s" : "") +
                      (maj ? ", " + maj + " mise" + (maj > 1 ? "s" : "") + " à jour" : ""));
          }
        }
      ]
    });
  }
})();
