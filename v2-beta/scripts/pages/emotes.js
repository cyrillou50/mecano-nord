/* ==========================================================================
   Émotes du serveur de jeu — V2.

   Même liste et mêmes règles que la V1 : le site ne joue rien, il tient le
   mémo, et ce mémo vit sur le serveur (voir listes.js) — l'écrire ne demande
   pas le droit de publier. Chaque garage a sa liste. Ce qui change, c'est la
   mise en page.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);
  const mnIcon = window.mnIcon;
  const L = MNListes.emotes;

  const SANS_CAT = "Sans catégorie";

  let hote = null;
  let peutGerer = false;
  let filtre = "";

  /* Un serveur de jeu en a des centaines : les catégories se replient, et
     l'état tient dans le navigateur — c'est un confort de lecture. */
  const plis = {
    lire() {
      try { return JSON.parse(localStorage.getItem("mn.emotes.folds")) || []; }
      catch (_) { return []; }
    },
    a(k) { return this.lire().indexOf(k) !== -1; },
    basculer(k) {
      const l = this.lire(), i = l.indexOf(k);
      if (i === -1) l.push(k); else l.splice(i, 1);
      try { localStorage.setItem("mn.emotes.folds", JSON.stringify(l.slice(0, 400))); }
      catch (_) { /* quota : le repliage n'est pas vital */ }
    }
  };

  V2Shell.demarrer({
    page: "emotes",
    titre: "Émotes",
    pret: async function (session, h) {
      hote = h;
      peutGerer = V2Shell.peut("emotes", "items", "admin");
      await L.load(true).catch(e => console.error(e));
      dessiner();
    }
  });

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

  function dessiner() {
    const total = toutes().length;

    hote.innerHTML =
      '<div class="pile">' +
        (peutGerer
          ? '<div class="rang">' +
              U.bouton("Ajouter", { variante: "principal", icone: "plus", action: "add" }) +
              U.bouton("Importer une liste", { icone: "contrat", action: "import" }) +
            "</div>"
          : "") +

        (total
          ? U.champ({ id: "em-q", label: "", repere: "Rechercher une émote…", valeur: filtre }) +
            '<div id="em-liste"></div>'
          : U.vide({
              icone: "etoile",
              titre: "Aucune émote enregistrée",
              texte: peutGerer
                ? "Ajoute-les une à une, ou colle la liste du serveur d'un coup."
                : "Un responsable les ajoutera depuis cette page."
            })) +
      "</div>";

    const q = $("#em-q");
    if (q) q.addEventListener("input", () => {
      filtre = q.value;
      dessinerListe();
    });

    const add = hote.querySelector('[data-a="add"]');
    if (add) add.addEventListener("click", () => editer(null));
    const imp = hote.querySelector('[data-a="import"]');
    if (imp) imp.addEventListener("click", importer);

    if (total) dessinerListe();
  }

  function dessinerListe() {
    const z = $("#em-liste");
    if (!z) return;
    const gs = groupes();

    if (!gs.length) {
      z.innerHTML = U.vide({ icone: "recherche", titre: "Rien ne correspond",
                             texte: "Aucune émote ne contient « " + filtre + " »." });
      return;
    }

    z.innerHTML = '<div class="pile">' + gs.map(g => {
      const ouvert = !plis.a(g.nom);
      return U.carte({
        classe: "emgroupe",
        corps:
          '<button class="emgroupe__tete" type="button" data-pli="' + U.esc(g.nom) + '">' +
            U.icone("chevron", ouvert ? "emgroupe__chev" : "emgroupe__chev emgroupe__chev--ferme") +
            "<b>" + U.esc(g.nom) + "</b>" +
            '<span class="etiq">' + g.emotes.length + "</span>" +
          "</button>" +
          (ouvert ? '<div class="emgrille">' + g.emotes.map(ligne).join("") + "</div>" : "")
      });
    }).join("") + "</div>";

    z.querySelectorAll("[data-pli]").forEach(b =>
      b.addEventListener("click", () => { plis.basculer(b.dataset.pli); dessinerListe(); }));

    z.querySelectorAll("[data-cmd]").forEach(b =>
      b.addEventListener("click", () => copier(b.dataset.cmd)));

    z.querySelectorAll("[data-img]").forEach(b =>
      b.addEventListener("click", () => U.modale({
        titre: b.dataset.nom,
        corps: '<div class="emote__grand">' + mnIcon(b.dataset.img) + "</div>"
      })));

    z.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => editer(trouver(b.dataset.edit))));

    z.querySelectorAll("[data-del]").forEach(b =>
      b.addEventListener("click", () => supprimer(trouver(b.dataset.del))));
  }

  function ligne(e) {
    return '<div class="emote">' +
      (e.image
        ? '<button class="emote__img" type="button" data-img="' + U.esc(e.image) +
          '" data-nom="' + U.esc(e.nom) + '" title="Voir en grand">' +
          mnIcon(e.image) + "</button>"
        : "") +
      '<div class="emote__txt"><b>' + U.esc(e.nom) + "</b>" +
        (e.note ? "<i>" + U.esc(e.note) + "</i>" : "") + "</div>" +
      (e.commande
        ? '<button class="emote__cmd" type="button" data-cmd="' + U.esc(e.commande) + '" ' +
          'title="Copier la commande">' + U.esc(e.commande) + U.icone("contrat") + "</button>"
        : '<span class="emote__cmd emote__cmd--vide">commande non renseignée</span>') +
      (peutGerer
        ? '<div class="rang emote__act">' +
            '<button class="btn btn--sm btn--icone" type="button" data-edit="' + U.esc(e.id) +
              '" aria-label="Modifier ' + U.esc(e.nom) + '">' + U.icone("crayon") + "</button>" +
            '<button class="btn btn--sm btn--icone" type="button" data-del="' + U.esc(e.id) +
              '" aria-label="Supprimer ' + U.esc(e.nom) + '">' + U.icone("poubelle") + "</button>" +
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
     Des cases, une par garage. Une émote peut valoir des deux côtés. */

  function champAteliers(id, choisis) {
    return '<div class="champ"><span class="champ__label">Ateliers</span>' +
      '<div class="rang" id="' + id + '">' +
        MNStore.ATELIERS.map(a =>
          U.champ({ id: id + "-" + a.id, type: "bascule", label: a.nom,
                    valeur: choisis.indexOf(a.id) !== -1 })).join("") +
      "</div></div>";
  }

  const lireAteliers = id => MNStore.ATELIERS
    .filter(a => { const c = document.getElementById(id + "-" + a.id); return c && c.checked; })
    .map(a => a.id);

  /** Le presse-papier, avec le repli des navigateurs qui le refusent. */
  async function copier(texte) {
    try {
      await navigator.clipboard.writeText(texte);
      U.toast("« " + texte + " » copiée", "ok");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = texte;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { /* rien */ }
      ta.remove();
      U.toast(ok ? "Copiée" : "Copie impossible — sélectionne le texte", ok ? "ok" : "erreur");
    }
  }

  /* ---- Écriture -------------------------------------------------------------
     Le serveur applique l'opération sur la liste qu'il relit : deux personnes
     qui ajoutent une émote en même temps ne s'écrasent plus. Sans serveur, on
     retombe dans le catalogue — et là il faudra publier. */

  async function ecrire(op, listeVoulue, message) {
    const r = await L.envoyer(op, listeVoulue);
    dessiner();
    V2Shell.brouillon(dessiner);
    if (!r.ok) return U.toast("Enregistrement impossible : " + (r.error || "échec"), "erreur");
    U.toast(message + (r.local && !MNGitHub.autoActif() ? " — pense à publier" : ""), "ok");
  }

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

    const m = U.modale({
      titre: neuf ? "Nouvelle émote" : "Modifier l'émote",
      corps: '<div class="pile">' +
        U.champ({ id: "e-nom", label: "Nom", max: 60, repere: "Réparer le moteur",
                  valeur: e ? e.nom : "" }) +
        U.champ({ id: "e-cmd", label: "Commande", max: 80, repere: "/e mechanic2",
                  valeur: e ? e.commande : "",
                  aide: "Telle qu'on la tape en jeu. Le « / » est ajouté s'il manque." }) +
        U.champ({ id: "e-cat", label: "Catégorie", max: 40, repere: "Mécanique",
                  valeur: e ? e.categorie : "",
                  aide: "Facultatif. Vide = « " + SANS_CAT + " »." +
                    (cats.length ? " Déjà utilisées : " + U.esc(cats.join(", ")) + "." : "") }) +
        U.champ({ id: "e-note", label: "Note", max: 200,
                  repere: "Quand l'utiliser, ce qu'elle montre…",
                  valeur: e ? e.note : "" }) +
        '<div class="champ"><span class="champ__label">Image</span>' +
          '<div class="rang">' +
            '<span class="ad-ico" id="e-img-prev">' +
              mnIcon((e && e.image) || "etoile") + "</span>" +
            '<input class="saisie" id="e-img" maxlength="300" style="flex:1" value="' +
              U.esc(e ? e.image : "") + '" placeholder="../assets/img/souder.png">' +
            U.bouton("Choisir", { taille: "sm", action: "img-pick" }) +
          "</div>" +
          '<p class="champ__aide">Facultatif. Une capture du geste se reconnaît ' +
            "plus vite qu'une commande.</p></div>" +
        champAteliers("e-at", e ? MNStore.ateliersDe(e) : [ici()]) +
      "</div>",
      actions: [
        { label: "Annuler", onClick: f => f() },
        {
          label: neuf ? "Ajouter" : "Enregistrer", variante: "principal",
          onClick: (fermer, corps) => {
            const nom = corps.querySelector("#e-nom").value.trim();
            let cmd = corps.querySelector("#e-cmd").value.trim();
            if (!nom && !cmd) return U.toast("Il faut au moins un nom ou une commande", "erreur");
            if (cmd && cmd[0] !== "/") cmd = "/" + cmd;

            const ats = lireAteliers("e-at");
            if (!ats.length) return U.toast("Choisis au moins un garage", "erreur");

            const entree = {
              id: e ? e.id : MNStore.uniqueId(nom || cmd, brut().map(x => x.id)),
              nom: nom || cmd,
              commande: cmd,
              categorie: corps.querySelector("#e-cat").value.trim(),
              note: corps.querySelector("#e-note").value.trim(),
              image: corps.querySelector("#e-img").value.trim(),
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

    /* Aperçu vivant, et la bibliothèque partagée pour ne pas retaper un
       chemin. 320 px : la vignette fait 40 px de côté, le reste ne servirait
       qu'à alourdir le stockage. */
    const apercu = m.corps.querySelector("#e-img-prev");
    const champImg = m.corps.querySelector("#e-img");
    const rafraichir = () => {
      apercu.innerHTML = mnIcon(champImg.value.trim() || "etoile");
    };
    champImg.addEventListener("input", rafraichir);
    m.corps.querySelector('[data-a="img-pick"]').addEventListener("click", () => {
      MNImagier.choisir(champImg.value.trim(), ref => {
        champImg.value = ref;
        rafraichir();
      }, { max: 320 });
    });
  }

  async function supprimer(e) {
    if (!e) return;
    const r = retirer(e);
    const ok = await U.confirmer({
      titre: "Supprimer l'émote",
      message: r.partagee
        ? "« " + e.nom + " » ne sera plus proposée au " + MNStore.nomAtelier(ici()) +
          ". Elle reste en place dans l'autre garage."
        : "« " + e.nom + " » sera retirée de la liste.",
      confirmer: r.partagee ? "Retirer d'ici" : "Supprimer", danger: true
    });
    if (!ok) return;
    ecrire(r.op, r.liste, r.partagee
      ? "Retirée du " + MNStore.nomAtelier(ici())
      : "Émote supprimée");
  }

  /* ---- Import en masse --------------------------------------------------------
     Un serveur de jeu en publie des centaines d'un bloc. Les saisir une à une
     serait une soirée perdue — et la liste resterait vide.

     Une ligne par émote, les champs séparés par « | », une tabulation ou un
     point-virgule. Une ligne d'un seul champ est une commande. */

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
    const m = U.modale({
      titre: "Importer une liste d'émotes", large: true,
      corps: '<div class="pile">' +
        '<p class="champ__aide">Une émote par ligne. Sépare les champs par ' +
          "<code>|</code>, une tabulation ou un point-virgule. Une ligne d'un " +
          "seul champ est prise pour une commande.</p>" +
        U.champ({ id: "i-ordre", type: "liste", label: "Ordre des colonnes", valeur: "cmd",
                  options: [{ valeur: "cmd", nom: "Commande | Nom | Catégorie" },
                            { valeur: "nom", nom: "Nom | Commande | Catégorie" }] }) +
        U.champ({ id: "i-txt", type: "zone", label: "La liste", lignes: 10,
                  repere: "/e mechanic2 | Réparer le moteur | Mécanique" }) +
        U.champ({ id: "i-vider", type: "bascule", label: "Remplacer la liste actuelle" }) +
        '<p class="champ__aide">Décoché, l\'import s\'ajoute à ce qui existe. Une ' +
          "commande déjà présente est mise à jour plutôt que dupliquée.</p>" +
        '<div id="i-apercu"></div>' +
      "</div>",
      actions: [
        { label: "Annuler", onClick: f => f() },
        {
          label: "Importer", variante: "principal",
          onClick: (fermer, corps) => {
            const lues = lireLignes(corps.querySelector("#i-txt").value,
                                    corps.querySelector("#i-ordre").value === "nom");
            if (!lues.length) return U.toast("Rien à importer", "erreur");

            const vider = corps.querySelector("#i-vider").checked;
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

    const apercu = () => {
      const l = lireLignes(m.corps.querySelector("#i-txt").value,
                           m.corps.querySelector("#i-ordre").value === "nom");
      m.corps.querySelector("#i-apercu").innerHTML = l.length
        ? U.alerte({ ton: "ok", texte: l.length + " émote" + (l.length > 1 ? "s lues" : " lue") +
            " — la première : " + l[0].nom + " " + l[0].commande })
        : "";
    };
    m.corps.querySelector("#i-txt").addEventListener("input", apercu);
    m.corps.querySelector("#i-ordre").addEventListener("change", apercu);
  }
})();
