/* ==========================================================================
   Blacklist de l'atelier — V2.

   Mêmes règles que la V1 : lecture ouverte, écriture derrière la permission
   « blacklist », et une inscription levée garde sa trace au lieu de
   disparaître. La liste vit sur le serveur (voir listes.js) : inscrire
   quelqu'un est le geste de celui qui tient le comptoir, pas de celui qui
   publie le site. Chaque garage tient sa liste. Ce qui change, c'est la mise
   en page.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);
  const L = MNListes.bannis;
  const mnIcon = window.mnIcon;

  let hote = null, moi = null;
  let peutGerer = false;
  let filtre = "";
  let voirLevees = false;

  V2Shell.demarrer({
    page: "blacklist",
    titre: "Blacklist",
    pret: async function (session, h) {
      hote = h; moi = session;
      peutGerer = V2Shell.peut("blacklist", "admin");
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
  const toutes = () => brut().filter(x => MNStore.estDeAtelier(x, ici()));
  /** La levée vaut par garage : le Nord peut refuser qui le Sud a repris. */
  const leveeIci = x => MNStore.leveeIci(x, ici());

  const actives = () => toutes().filter(x => !leveeIci(x));
  const levees = () => toutes().filter(x => leveeIci(x));

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
      return '<span class="respast"' + (r ? ' style="--res:' + U.esc(r.color) + '"' : "") + ">" +
        (r ? mnIcon(r.icon) : "") +
        "<b>" + panier[k] + "</b><i>" + U.esc(r ? r.name : k) + "</i></span>";
    }).join("");
  }

  /* ---- Rendu ---------------------------------------------------------------- */

  function dessiner() {
    const l = filtrer(actives());
    const lev = filtrer(levees());
    const du = duTotal();

    hote.innerHTML =
      '<div class="pile">' +
        (peutGerer
          ? '<div class="rang">' +
              U.bouton("Inscrire quelqu'un", { variante: "principal", icone: "plus", action: "add" }) +
            "</div>"
          : "") +

        /* Le total dû se voit d'un coup d'œil : c'est de l'argent de l'atelier
           qui dort chez quelqu'un, pas une ligne de plus dans une fiche. */
        (rien(du)
          ? ""
          : U.alerte({ ton: "alerte",
              texte: "Restent à rembourser, toutes inscriptions confondues : " +
                MNStore.ressourcesEnClair(du) + "." })) +

        (toutes().length
          ? U.champ({ id: "bl-q", repere: "Rechercher un nom, une raison…", valeur: filtre }) +
            corps(l, lev)
          : U.vide({
              icone: "check",
              titre: "Personne sur la blacklist",
              texte: peutGerer
                ? "Tant mieux. Si ça se gâte, « Inscrire quelqu'un »."
                : "Tant mieux."
            })) +
      "</div>";

    const q = $("#bl-q");
    if (q) q.addEventListener("input", () => {
      filtre = q.value;
      dessiner();
      const n = $("#bl-q");
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    });

    const add = hote.querySelector('[data-a="add"]');
    if (add) add.addEventListener("click", () => editer(null));

    const bascule = hote.querySelector('[data-a="voirlev"]');
    if (bascule) bascule.addEventListener("click", () => { voirLevees = !voirLevees; dessiner(); });

    brancher();
  }

  function corps(l, lev) {
    return '<div class="pile">' +
      (l.length
        ? l.map(carte).join("")
        : U.vide({ icone: "recherche",
                   titre: filtre ? "Rien ne correspond" : "Personne n'est inscrit",
                   texte: filtre ? "Aucune inscription ne contient « " + filtre + " »." : "" })) +

      (lev.length
        ? '<div class="pile pile--sm">' +
            U.bouton(lev.length + " inscription" + (lev.length > 1 ? "s levées" : " levée"),
                     { taille: "sm", icone: "chevron", action: "voirlev" }) +
            (voirLevees ? lev.map(carte).join("") : "") +
          "</div>"
        : "") +
    "</div>";
  }

  function carte(x) {
    const r = MNStore.remboursementDe(x.remboursement);
    const lev = leveeIci(x);

    return U.carte({
      classe: "blentree" + (lev ? " blentree--levee" : ""),
      corps:
        '<div class="rang blentree__tete">' +
          '<span class="blpoint" aria-hidden="true"></span>' +
          "<b>" + U.esc(x.nom) + "</b>" +
          '<span class="pousse"></span>' +
          (x.remboursement !== "aucun"
            ? U.etiquette(r.nom, x.remboursement === "du" ? "alerte" : "succes")
            : "") +
        "</div>" +
        '<p class="blraison">' + U.esc(x.raison || "Aucune raison notée.") + "</p>" +
        (x.remboursement !== "aucun" && !rien(x.ressources)
          ? '<div class="respaniers">' +
              '<span class="respaniers__quoi">' +
                (x.remboursement === "du" ? "À rendre" : "Rendu") + "</span>" +
              pastilles(x.ressources) +
            "</div>"
          : "") +
        '<p class="champ__aide">Inscrit ' + U.ilYA(x.at) +
          (x.by ? " par " + U.esc(x.by) : "") + "." +
          (lev
            ? " Levée " + U.ilYA(lev.at) + (lev.by ? " par " + U.esc(lev.by) : "") +
              (lev.note ? " — " + U.esc(lev.note) : "") + "."
            : "") + "</p>" +
        (peutGerer
          ? '<div class="rang" style="margin-top:var(--e-3)">' +
              (lev
                ? '<button class="btn btn--sm" type="button" data-reprendre="' + U.esc(x.id) + '">' +
                  U.icone("rafraichir") + "<span>Réinscrire</span></button>"
                : '<button class="btn btn--sm" type="button" data-edit="' + U.esc(x.id) + '">' +
                  U.icone("crayon") + "<span>Modifier</span></button>" +
                  (x.remboursement === "du"
                    ? '<button class="btn btn--sm" type="button" data-rembourse="' + U.esc(x.id) + '">' +
                      U.icone("check") + "<span>Marquer remboursé</span></button>"
                    : "") +
                  '<button class="btn btn--sm" type="button" data-lever="' + U.esc(x.id) + '">' +
                  U.icone("check") + "<span>Lever</span></button>") +
              '<span class="pousse"></span>' +
              '<button class="btn btn--sm btn--icone" type="button" data-del="' + U.esc(x.id) +
                '" aria-label="Supprimer définitivement">' + U.icone("poubelle") + "</button>" +
            "</div>"
          : "")
    });
  }

  function brancher() {
    const par = (attr, fn) => hote.querySelectorAll("[data-" + attr + "]")
      .forEach(b => b.addEventListener("click", () => fn(trouver(b.dataset[attr]))));

    par("edit", x => editer(x));
    par("lever", lever);
    par("reprendre", reprendre);
    par("rembourse", rembourse);
    par("del", supprimer);
  }

  const trouver = id => brut().find(x => x.id === id) || null;

  /**
   * Retire une inscription d'ici. Elle vaut peut-être aussi dans l'autre
   * garage : dans ce cas on ne l'efface pas, on lui retire ce garage-ci.
   * Supprimer pour de bon ne se fait que là où elle n'existe plus qu'ici.
   * @returns {{op:object, liste:Array, partagee:boolean}}
   */
  function retirer(x) {
    const ats = MNStore.ateliersDe(x);
    const reste = ats.filter(a => a !== ici());

    if (!reste.length) {
      return { op: { op: "remove", id: x.id },
               liste: brut().filter(y => y.id !== x.id),
               partagee: false };
    }

    /* La levée d'ici part avec le garage : la garder n'aurait plus de sens. */
    const levee = Object.assign({}, x.levee);
    delete levee[ici()];

    const entree = Object.assign({}, x, { ateliers: reste, levee });
    const liste = MNStore.clone(brut());
    const i = liste.findIndex(y => y.id === x.id);
    if (i !== -1) liste[i] = entree;
    return { op: { op: "set", entree }, liste, partagee: true };
  }

  /** Écrit la levée du garage où l'on est, sans toucher à celle de l'autre. */
  function poserLevee(x, valeur) {
    const levee = Object.assign({}, x.levee);
    if (valeur) levee[ici()] = valeur; else delete levee[ici()];
    return Object.assign({}, x, { levee });
  }


  /* ---- Le garage où vaut une inscription -------------------------------------
     Des cases, une par garage. Un client peut être refusé des deux côtés. */

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

  /* ---- Écriture -------------------------------------------------------------
     Le serveur applique l'opération sur la liste qu'il relit : deux personnes
     qui inscrivent quelqu'un en même temps ne s'écrasent plus. Sans serveur,
     on retombe dans le catalogue — et là il faudra publier. */

  async function ecrire(op, listeVoulue, message) {
    const r = await L.envoyer(op, listeVoulue);
    dessiner();
    V2Shell.brouillon(dessiner);
    if (!r.ok) return U.toast("Enregistrement impossible : " + (r.error || "échec"), "erreur");
    U.toast(message + (r.local && !MNGitHub.autoActif() ? " — pense à publier" : ""), "ok");
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
    /* Déclarées avant la modale : son bouton « Enregistrer » les lit. */
    const lignes = Object.keys((x && x.ressources) || {})
      .filter(k => x.ressources[k] > 0)
      .map(k => ({ rid: k, qte: x.ressources[k] }));

    const m = U.modale({
      titre: neuf ? "Inscrire quelqu'un" : "Modifier l'inscription",
      corps: '<div class="pile">' +
        U.champ({ id: "b-nom", label: "Nom du client", max: 60, repere: "Prénom Nom",
                  valeur: x ? x.nom : "" }) +
        U.champ({ id: "b-raison", type: "zone", label: "Raison", lignes: 4, max: 600,
                  valeur: x ? x.raison : "",
                  repere: "Ce qui s'est passé, en clair. C'est ce que lira celui qui le verra arriver." }) +
        U.champ({ id: "b-rb", type: "liste", label: "Remboursement",
                  valeur: x ? x.remboursement : "aucun",
                  options: MNStore.REMBOURSEMENTS.map(r => ({ valeur: r.id, nom: r.nom })) }) +
        champAteliers("b-at", x ? MNStore.ateliersDe(x) : [ici()]) +
        '<div class="champ" id="b-resbloc">' +
          '<span class="champ__label">Ce qu\'on doit rendre</span>' +
          '<div class="pile pile--sm" id="b-res"></div>' +
          "<div>" + U.bouton("Ajouter une ressource",
                             { taille: "sm", icone: "plus", action: "res-add" }) + "</div>" +
          '<p class="champ__aide">L\'atelier facture en ressources : on rend de la ' +
            "Ferraille, du Plastique, pas des dollars. La liste reste renseignée " +
            "une fois le remboursement fait — c'est la trace de ce qui a été rendu.</p>" +
        "</div>" +
      "</div>",
      actions: [
        { label: "Annuler", onClick: f => f() },
        {
          label: neuf ? "Inscrire" : "Enregistrer", variante: "principal",
          onClick: (fermer, corps) => {
            const nom = corps.querySelector("#b-nom").value.trim();
            if (!nom) return U.toast("Il faut un nom", "erreur");
            const raison = corps.querySelector("#b-raison").value.trim();
            if (!raison) return U.toast("Dis pourquoi : sans raison, l'inscription ne sert à personne", "erreur");

            const ats = lireAteliers("b-at");
            if (!ats.length) return U.toast("Choisis au moins un garage", "erreur");

            const rb = corps.querySelector("#b-rb").value;
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
              levee: x ? x.levee : {}
            });

            fermer();
            poser(entree, neuf ? "Inscrit sur la blacklist" : "Inscription modifiée");
          }
        }
      ]
    });

    /* ---- Les ressources dues, ligne par ligne ---- */

    const dispo = MNStore.catalog().resources || [];
    const hote = m.corps.querySelector("#b-res");

    function peindre() {
      if (!dispo.length) {
        hote.innerHTML = '<p class="champ__aide">Aucune ressource au catalogue. ' +
          "Crée-les dans l'administration, onglet « Ressources ».</p>";
        return;
      }
      if (!lignes.length) {
        hote.innerHTML = '<p class="champ__aide">Rien pour l\'instant — ' +
          "ajoute une ressource.</p>";
        return;
      }
      hote.innerHTML = lignes.map((l, i) =>
        '<div class="rang" data-i="' + i + '">' +
          '<select class="liste" data-k="rid" style="flex:1">' + dispo.map(r =>
            '<option value="' + U.esc(r.id) + '"' + (r.id === l.rid ? " selected" : "") + ">" +
            U.esc(r.name) + "</option>").join("") + "</select>" +
          '<input class="saisie saisie--nombre" type="number" min="0" max="999999" ' +
            'data-k="qte" style="max-width:110px" value="' + Number(l.qte) + '">' +
          '<button class="btn btn--icone" type="button" data-k="del" ' +
            'aria-label="Retirer">' + U.icone("croix") + "</button>" +
        "</div>").join("");

      hote.querySelectorAll("[data-i]").forEach(row => {
        const i = Number(row.dataset.i);
        row.querySelector('[data-k="rid"]').addEventListener("change", e => { lignes[i].rid = e.target.value; });
        row.querySelector('[data-k="qte"]').addEventListener("input", e => { lignes[i].qte = e.target.value; });
        row.querySelector('[data-k="del"]').addEventListener("click", () => { lignes.splice(i, 1); peindre(); });
      });
    }
    peindre();

    m.corps.querySelector('[data-a="res-add"]').addEventListener("click", () => {
      if (!dispo.length) return;
      const pris = lignes.map(l => l.rid);
      const libre = dispo.find(r => pris.indexOf(r.id) === -1) || dispo[0];
      lignes.push({ rid: libre.id, qte: 1 });
      peindre();
    });

    /* Rien à rendre : la liste n'a plus lieu d'être affichée. */
    const sync = () => {
      m.corps.querySelector("#b-resbloc").hidden =
        m.corps.querySelector("#b-rb").value === "aucun";
    };
    m.corps.querySelector("#b-rb").addEventListener("change", sync);
    sync();
  }

  function lever(x) {
    if (!x) return;
    U.modale({
      titre: "Lever l'inscription",
      corps: '<div class="pile">' +
        '<p class="champ__aide">« ' + U.esc(x.nom) + " » sortira de la liste active. " +
          "L'inscription est conservée : on garde la trace de ce qui s'est passé.</p>" +
        (x.remboursement === "du" && !rien(x.ressources)
          ? U.alerte({ ton: "alerte",
              texte: "Il reste " + MNStore.ressourcesEnClair(x.ressources) +
                     " à lui rendre. Lever l'inscription ne solde pas la dette." })
          : "") +
        U.champ({ id: "b-note", label: "Pourquoi ? (facultatif)", max: 300,
                  repere: "Arrangement trouvé, dette réglée…" }) +
      "</div>",
      actions: [
        { label: "Annuler", onClick: f => f() },
        {
          label: "Lever", variante: "principal",
          onClick: (fermer, corps) => {
            const note = corps.querySelector("#b-note").value.trim();
            fermer();
            poser(poserLevee(x, { at: new Date().toISOString(), by: moi.pseudo, note }),
                  "Levée au " + MNStore.nomAtelier(ici()));
          }
        }
      ]
    });
  }

  async function reprendre(x) {
    if (!x) return;
    const ok = await U.confirmer({
      titre: "Réinscrire",
      message: "« " + x.nom + " » revient dans la liste active. La levée précédente est effacée.",
      confirmer: "Réinscrire"
    });
    if (!ok) return;
    poser(poserLevee(x, null), "Réinscrit au " + MNStore.nomAtelier(ici()));
  }

  async function rembourse(x) {
    if (!x) return;
    const ok = await U.confirmer({
      titre: "Marquer remboursé",
      message: (rien(x.ressources)
        ? "Le remboursement de " + x.nom + " est fait."
        : MNStore.ressourcesEnClair(x.ressources) + " ont été rendus à " + x.nom + ".") +
        " L'inscription reste en place — un remboursement n'efface pas la raison.",
      confirmer: "C'est remboursé"
    });
    if (!ok) return;
    poser(Object.assign({}, x, { remboursement: "fait" }), "Marqué remboursé");
  }

  async function supprimer(x) {
    if (!x) return;
    const r = retirer(x);
    const ok = await U.confirmer({
      titre: r.partagee ? "Retirer de ce garage" : "Supprimer définitivement",
      message: r.partagee
        ? "L'inscription de « " + x.nom + " » quittera le " +
          MNStore.nomAtelier(ici()) + ". Elle reste en place dans l'autre garage."
        : "L'inscription de « " + x.nom + " » disparaîtra, trace comprise. " +
          "Pour la sortir de la liste en gardant l'historique, utilise plutôt « Lever ».",
      confirmer: r.partagee ? "Retirer d'ici" : "Supprimer", danger: true
    });
    if (!ok) return;
    ecrire(r.op, r.liste, r.partagee
      ? "Retirée du " + MNStore.nomAtelier(ici())
      : "Inscription supprimée");
  }
})();
