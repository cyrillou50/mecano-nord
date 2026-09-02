/* ==========================================================================
   Blacklist de l'atelier — V2.

   Mêmes règles que la V1 : lecture ouverte, écriture derrière la permission
   « blacklist », et une inscription levée garde sa trace au lieu de
   disparaître. La liste vit sur le serveur (voir listes.js) : inscrire
   quelqu'un est le geste de celui qui tient le comptoir, pas de celui qui
   publie le site. Ce qui change, c'est la mise en page.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);
  const L = MNListes.bannis;

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
        (du
          ? U.alerte({ ton: "alerte",
              texte: U.nombre(du) + " $ restent à rembourser, toutes inscriptions confondues." })
          : "") +

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
    const lev = !!x.levee;

    return U.carte({
      classe: "blentree" + (lev ? " blentree--levee" : ""),
      corps:
        '<div class="rang blentree__tete">' +
          '<span class="blpoint" aria-hidden="true"></span>' +
          "<b>" + U.esc(x.nom) + "</b>" +
          '<span class="pousse"></span>' +
          (x.remboursement !== "aucun"
            ? U.etiquette(r.nom + (x.montant ? " · " + U.nombre(x.montant) + " $" : ""),
                          x.remboursement === "du" ? "alerte" : "succes")
            : "") +
        "</div>" +
        '<p class="blraison">' + U.esc(x.raison || "Aucune raison notée.") + "</p>" +
        '<p class="champ__aide">Inscrit ' + U.ilYA(x.at) +
          (x.by ? " par " + U.esc(x.by) : "") + "." +
          (lev
            ? " Levée " + U.ilYA(x.levee.at) + (x.levee.by ? " par " + U.esc(x.levee.by) : "") +
              (x.levee.note ? " — " + U.esc(x.levee.note) : "") + "."
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

  const trouver = id => toutes().find(x => x.id === id) || null;

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
    const l = MNStore.clone(toutes());
    const i = l.findIndex(x => x.id === entree.id);
    if (i === -1) l.unshift(entree); else l[i] = entree;
    ecrire({ op: "set", entree }, l, message);
  }

  function editer(x) {
    const neuf = !x;

    const m = U.modale({
      titre: neuf ? "Inscrire quelqu'un" : "Modifier l'inscription",
      corps: '<div class="pile">' +
        U.champ({ id: "b-nom", label: "Nom du client", max: 60, repere: "Prénom Nom",
                  valeur: x ? x.nom : "" }) +
        U.champ({ id: "b-raison", type: "zone", label: "Raison", lignes: 4, max: 600,
                  valeur: x ? x.raison : "",
                  repere: "Ce qui s'est passé, en clair. C'est ce que lira celui qui le verra arriver." }) +
        '<div class="cols-2">' +
          U.champ({ id: "b-rb", type: "liste", label: "Remboursement",
                    valeur: x ? x.remboursement : "aucun",
                    options: MNStore.REMBOURSEMENTS.map(r => ({ valeur: r.id, nom: r.nom })) }) +
          U.champ({ id: "b-montant", type: "number", label: "Montant ($)", min: 0, pas: 1,
                    valeur: x && x.montant ? String(x.montant) : "", repere: "0" }) +
        "</div>" +
        '<p class="champ__aide">Le montant reste renseignable une fois remboursé : ' +
          "c'est la trace de ce qui a été rendu.</p>" +
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

            const rb = corps.querySelector("#b-rb").value;
            const entree = Object.assign({}, x || {}, {
              id: x ? x.id : MNStore.uniqueId(nom, toutes().map(y => y.id)),
              nom, raison, remboursement: rb,
              montant: rb === "aucun"
                ? 0
                : Math.max(0, Math.round(Number(corps.querySelector("#b-montant").value) || 0)),
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

    /* Choisir « Aucun » et laisser un montant n'aurait pas de sens : on grise. */
    const sync = () => {
      m.corps.querySelector("#b-montant").disabled =
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
        (x.remboursement === "du"
          ? U.alerte({ ton: "alerte",
              texte: "Il reste " + U.nombre(x.montant) + " $ à lui rembourser. " +
                     "Lever l'inscription ne solde pas la dette." })
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
    const ok = await U.confirmer({
      titre: "Réinscrire",
      message: "« " + x.nom + " » revient dans la liste active. La levée précédente est effacée.",
      confirmer: "Réinscrire"
    });
    if (!ok) return;
    poser(Object.assign({}, x, {
      levee: null, at: new Date().toISOString(), by: moi.pseudo
    }), "Réinscrit");
  }

  async function rembourse(x) {
    if (!x) return;
    const ok = await U.confirmer({
      titre: "Marquer remboursé",
      message: (x.montant ? U.nombre(x.montant) + " $ ont été rendus à " : "Le remboursement de ") +
        x.nom + (x.montant ? "." : " est fait.") +
        " L'inscription reste en place — un remboursement n'efface pas la raison.",
      confirmer: "C'est remboursé"
    });
    if (!ok) return;
    poser(Object.assign({}, x, { remboursement: "fait" }), "Marqué remboursé");
  }

  async function supprimer(x) {
    if (!x) return;
    const ok = await U.confirmer({
      titre: "Supprimer définitivement",
      message: "L'inscription de « " + x.nom + " » disparaîtra, trace comprise. " +
        "Pour la sortir de la liste en gardant l'historique, utilise plutôt « Lever ».",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;
    ecrire({ op: "remove", id: x.id }, toutes().filter(y => y.id !== x.id), "Inscription supprimée");
  }
})();
