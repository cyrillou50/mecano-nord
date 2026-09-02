/* ==========================================================================
   Véhicules — le parc à gauche, la fiche à droite.

   Reprise fidèle de la V1 : mêmes règles de complétude (l'étoile), mêmes
   propositions en attente de validation, mêmes caractéristiques avec « N/A ».
   Ce qui change : les filtres tiennent sur une ligne au lieu de quatre, et la
   fiche passe sous la liste sur téléphone au lieu de la comprimer.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  let hote = null, moi = null;
  let sel = null;
  let q = "", fCarb = "", fCat = "", fEtoile = "";
  let peutEcrire = false, peutValider = false;

  const P = () => MNParc.parc();

  V2Shell.demarrer({
    page: "vehicules",
    titre: "Véhicules",
    pret: async function (session, h) {
      hote = h; moi = session;
      peutEcrire = V2Shell.peut("vehicles", "admin");
      peutValider = V2Shell.peut("vehicles_validate", "vehicles", "admin");

      hote.innerHTML = U.squelette(5);
      await MNParc.load(true).catch(e => console.error(e));

      const premier = liste()[0];
      sel = premier ? premier.id : null;
      dessiner();
    }
  });

  /* ---- Données ---------------------------------------------------------------- */

  const catDe = v => P().cats.find(c => c.id === v.category) ||
    { id: "", name: "Sans catégorie", icon: "i-box" };

  const enAttente = v => v.status === "attente";

  /* Ce qu'on attend d'une fiche renseignée. « N/A » compte comme une réponse :
     un bateau n'a pas de coffre, et sa fiche ne doit pas porter l'étoile à
     vie. Le remorquage en est absent — une case décochée ne se distingue pas
     d'une case jamais remplie. */
  const rempli = x => !!String(x == null ? "" : x).trim();
  const CHAMPS = [
    { nom: "photo", vide: v => !v.image },
    { nom: "carburant", vide: v => !rempli(v.carburant) },
    { nom: "places", vide: v => !rempli(v.places) },
    { nom: "coffre", vide: v => !rempli(v.coffre) },
    { nom: "réservoir", vide: v => !rempli(v.litres) }
  ];
  const manques = v => CHAMPS.filter(c => c.vide(v)).map(c => c.nom);

  const enumerer = l => l.length < 2 ? (l[0] || "")
    : l.slice(0, -1).join(", ") + " et " + l[l.length - 1];

  function liste() {
    const f = q.trim().toLowerCase();
    return P().vehicles.filter(v => {
      if (fCarb && v.carburant !== fCarb) return false;
      if (fCat && v.category !== fCat) return false;
      if (fEtoile && (manques(v).length > 0) !== (fEtoile === "oui")) return false;
      if (!f) return true;
      return v.name.toLowerCase().indexOf(f) !== -1 ||
        catDe(v).name.toLowerCase().indexOf(f) !== -1;
    }).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  }

  /* ---- Rendu -------------------------------------------------------------------- */

  function dessiner() {
    hote.innerHTML =
      '<div class="duo">' +
        '<aside class="duo__liste" id="v-liste"></aside>' +
        '<section class="duo__fiche" id="v-fiche"></section>' +
      "</div>";
    dessinerListe();
    dessinerFiche();
    bandeau();
  }

  function bandeau() {
    const s = MNParc.souci();
    if (!s) return;
    hote.insertAdjacentHTML("afterbegin",
      '<div style="margin-bottom:var(--e-4)">' +
        U.alerte({ ton: "alerte", titre: s,
          texte: "Le parc affiché vient du catalogue et peut être incomplet ; " +
                 "n'enregistre rien tant que le serveur n'a pas répondu." }) + "</div>");
  }

  function dessinerListe() {
    const l = liste();
    const cats = P().cats;

    $("#v-liste").innerHTML =
      '<div class="duo__filtres">' +
        '<input class="saisie" id="v-q" type="search" placeholder="Chercher…" value="' +
          U.esc(q) + '" autocomplete="off">' +
        '<div class="duo__selects">' +
          select("v-carb", fCarb, [{ valeur: "", nom: "Tout carburant" }]
            .concat(MNStore.CARBURANTS.concat(MNStore.NA).map(c => ({ valeur: c, nom: c })))) +
          select("v-cat", fCat, [{ valeur: "", nom: "Toutes catégories" }]
            .concat(cats.map(c => ({ valeur: c.id, nom: c.name })))) +
          select("v-et", fEtoile, [{ valeur: "", nom: "Toutes fiches" },
            { valeur: "oui", nom: "À compléter" }, { valeur: "non", nom: "Complètes" }]) +
        "</div>" +
      "</div>" +

      '<div class="duo__corps">' +
        (l.length
          ? l.map(ligne).join("")
          : '<p class="champ__aide" style="padding:var(--e-3)">Aucun véhicule ne correspond.</p>') +
      "</div>" +

      '<div class="duo__pied">' +
        '<span class="muet txt-sm">' + P().vehicles.length + " véhicule" +
          (P().vehicles.length > 1 ? "s" : "") + "</span>" +
        (peutEcrire || true
          ? '<span class="pousse">' + U.bouton("Ajouter",
              { variante: "principal", taille: "sm", icone: "plus", action: "ajouter" }) + "</span>"
          : "") +
      "</div>";

    brancherListe();
  }

  const select = (id, val, opts) =>
    '<select class="liste" id="' + id + '">' + opts.map(o =>
      '<option value="' + U.esc(o.valeur) + '"' + (o.valeur === val ? " selected" : "") + ">" +
      U.esc(o.nom) + "</option>").join("") + "</select>";

  function ligne(v) {
    const m = manques(v);
    return '<button class="duo__item' + (v.id === sel ? " is-actif" : "") +
      '" data-v="' + U.esc(v.id) + '">' +
      '<span class="duo__vign">' + mnIcon(v.image || "i-wheels-car") + "</span>" +
      '<span class="duo__txt"><b class="tronque">' + U.esc(v.name) + "</b>" +
        '<span class="tronque">' + U.esc(enAttente(v)
          ? "proposé par " + (v.proposePar || "?") : catDe(v).name) + "</span></span>" +
      (v.propose ? '<span class="duo__marque" title="Correction proposée">' +
        U.icone("crayon") + "</span>" : "") +
      (m.length ? '<span class="duo__marque duo__marque--etoile" title="Fiche incomplète : ' +
        U.esc(enumerer(m)) + '">' + U.icone("etoile") + "</span>" : "") +
    "</button>";
  }

  function brancherListe() {
    const champ = $("#v-q");
    champ.addEventListener("input", () => {
      q = champ.value;
      const pos = champ.selectionStart;
      dessinerListe();
      const n = $("#v-q"); n.focus(); n.setSelectionRange(pos, pos);
    });
    [["#v-carb", v => { fCarb = v; }], ["#v-cat", v => { fCat = v; }],
     ["#v-et", v => { fEtoile = v; }]].forEach(p => {
      const n = $(p[0]);
      if (n) n.addEventListener("change", e => { p[1](e.target.value); dessinerListe(); });
    });

    hote.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => {
      sel = b.dataset.v;
      /* On ne reconstruit pas la liste : elle remonterait en haut. */
      hote.querySelectorAll("[data-v]").forEach(x => x.classList.toggle("is-actif", x === b));
      dessinerFiche();
    }));

    const add = hote.querySelector('[data-a="ajouter"]');
    if (add) add.addEventListener("click", () => editer(null));
  }

  /* ---- Fiche ---------------------------------------------------------------------- */

  function dessinerFiche() {
    const v = P().vehicles.find(x => x.id === sel);
    const zone = $("#v-fiche");

    if (!v) {
      zone.innerHTML = U.vide({ icone: "vehicule", titre: "Aucun véhicule sélectionné",
        texte: "Choisis un véhicule dans la liste, ou ajoutes-en un." });
      return;
    }

    const m = manques(v);
    const attente = enAttente(v);
    const mien = attente && v.proposePar === moi.pseudo;

    zone.innerHTML = U.carte({
      titre: v.name,
      actions:
        U.etiquette(catDe(v).name) +
        (attente ? U.etiquette("En attente de validation", "alerte") : "") +
        (peutEcrire || mien
          ? U.bouton("Modifier", { variante: "fantome", taille: "sm", icone: "crayon", action: "mod" })
          : U.bouton("Proposer une correction", { variante: "fantome", taille: "sm",
              icone: "crayon", action: "mod" })) +
        (peutEcrire
          ? U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
              titre: "Supprimer", action: "sup" })
          : ""),
      corps:
        (attente && peutValider
          ? '<div class="pile pile--sm" style="margin-bottom:var(--e-4)">' +
            U.alerte({ ton: "alerte", titre: "Proposition de " + (v.proposePar || "?"),
              texte: "Elle n'apparaîtra dans le parc qu'une fois approuvée." }) +
            '<div class="rang">' +
              U.bouton("Approuver", { variante: "principal", icone: "check", action: "ok" }) +
              U.bouton("Refuser", { variante: "danger", icone: "croix", action: "non" }) +
            "</div></div>"
          : "") +

        (v.propose ? correction(v) : "") +

        '<div class="v-photo">' + mnIcon(v.image || "i-wheels-car") + "</div>" +
        (v.note ? '<p class="muet" style="margin:var(--e-3) 0">' + U.esc(v.note) + "</p>" : "") +

        '<div class="grille grille--sm" style="margin-top:var(--e-4)">' +
          boite("Carburant", v.carburant) +
          boite("Places", v.places) +
          boite("Coffre", avecUnite(v.coffre, "KG", /kgs?\s*$/i)) +
          boite("Réservoir", avecUnite(v.litres, "L", /(l|litres?)\s*$/i)) +
          '<div class="tuile"><span class="tuile__label">Remorquable</span>' +
            '<span class="tuile__val v-rem v-rem--' + (v.remorquable ? "oui" : "non") + '">' +
              U.icone(v.remorquable ? "check" : "croix") +
              (v.remorquable ? "Oui" : "Non") + "</span></div>" +
        "</div>" +

        (m.length
          ? '<p class="v-manque">' + U.icone("etoile") + "Fiche incomplète : il manque " +
            U.esc(enumerer(m)) + ".</p>"
          : "")
    });

    brancherFiche(v);
  }

  const boite = (label, valeur) =>
    '<div class="tuile"><span class="tuile__label">' + U.esc(label) + "</span>" +
      '<span class="tuile__val">' + (valeur ? U.esc(valeur) : "—") + "</span></div>";

  /** Une valeur avec son unité. « N/A » n'en reçoit pas : ça n'aurait aucun sens. */
  function avecUnite(v, unite, dejaLa) {
    const s = String(v || "").trim();
    if (!s || MNStore.estNA(s)) return s;
    return dejaLa.test(s) ? s : s + " " + unite;
  }

  /* Ce qu'une correction changerait, champ par champ. */
  const MODIFS = [
    { k: "name", nom: "nom" },
    { k: "category", nom: "catégorie", lisible: v => (P().cats.find(c => c.id === v) || {}).name || v },
    { k: "image", nom: "photo", lisible: v => (v ? "définie" : "aucune") },
    { k: "carburant", nom: "carburant" },
    { k: "places", nom: "places" },
    { k: "coffre", nom: "coffre" },
    { k: "litres", nom: "réservoir" },
    { k: "remorquable", nom: "remorquable", lisible: v => (v === true ? "oui" : "non") },
    { k: "note", nom: "note" }
  ];

  function correction(v) {
    const ec = MODIFS
      .filter(m => String(v[m.k] || "") !== String(v.propose.champs[m.k] || ""))
      .map(m => ({ nom: m.nom,
        avant: (m.lisible ? m.lisible(v[m.k]) : v[m.k]) || "—",
        apres: (m.lisible ? m.lisible(v.propose.champs[m.k]) : v.propose.champs[m.k]) || "—" }));

    return '<div class="pile pile--sm" style="margin-bottom:var(--e-4)">' +
      U.alerte({ ton: "alerte",
        titre: "Correction proposée par " + (v.propose.par || "?"),
        texte: ec.length
          ? ec.map(x => x.nom + " : " + x.avant + " → " + x.apres).join(" · ")
          : "Aucun changement réel." }) +
      (peutValider
        ? '<div class="rang">' +
          U.bouton("Appliquer", { variante: "principal", icone: "check", action: "mok" }) +
          U.bouton("Écarter", { variante: "danger", icone: "croix", action: "mno" }) +
        "</div>"
        : "") +
    "</div>";
  }

  function brancherFiche(v) {
    const b = a => hote.querySelector('[data-a="' + a + '"]');
    if (b("mod")) b("mod").addEventListener("click", () => editer(v));
    if (b("sup")) b("sup").addEventListener("click", () => supprimer(v));
    if (b("ok")) b("ok").addEventListener("click", () => statut(v, "valide", "Véhicule approuvé"));
    if (b("non")) b("non").addEventListener("click", () => supprimer(v, true));
    if (b("mok")) b("mok").addEventListener("click", async () => {
      const maj = Object.assign({}, v, v.propose.champs, { propose: null });
      rendu(await MNParc.setVehicle(maj), "Correction appliquée");
    });
    if (b("mno")) b("mno").addEventListener("click", async () => {
      const ok = await U.confirmer({ titre: "Écarter la correction",
        message: "La correction de " + (v.propose.par || "?") + " sera supprimée.",
        confirmer: "Écarter", danger: true });
      if (!ok) return;
      rendu(await MNParc.setVehicle(Object.assign({}, v, { propose: null })), "Correction écartée");
    });
  }

  async function statut(v, s, msg) {
    rendu(await MNParc.setStatus(v.id, s), msg);
  }

  async function supprimer(v, refus) {
    const ok = await U.confirmer({
      titre: refus ? "Refuser la proposition" : "Supprimer le véhicule",
      message: "« " + v.name + " » sera définitivement retiré du parc.",
      confirmer: refus ? "Refuser" : "Supprimer", danger: true
    });
    if (!ok) return;
    const r = await MNParc.removeVehicle(v.id);
    if (sel === v.id) { const f = liste()[0]; sel = f ? f.id : null; }
    rendu(r, refus ? "Proposition refusée" : "Véhicule supprimé");
  }

  function rendu(r, msg) {
    dessiner();
    if (!r || r.ok) U.toast(msg +
      (r && r.local && !MNGitHub.autoActif() ? " — pense à publier" : ""), "ok");
    else U.toast("Enregistrement impossible : " + (r.error || "échec"), "err");
  }

  /* ---- Édition ------------------------------------------------------------------- */

  function editer(v) {
    const neuf = !v;
    const cur = v
      ? Object.assign(MNStore.clone(v), v.propose ? v.propose.champs : {})
      : { name: "", category: P().cats[0].id, image: "", carburant: "",
          places: "", coffre: "", litres: "", remorquable: false, note: "" };

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "e-nom", label: "Nom", valeur: cur.name, max: 40, repere: "Ex. BF400" }) +
        U.champ({ id: "e-cat", label: "Catégorie", type: "liste", valeur: cur.category,
          options: P().cats.map(c => ({ valeur: c.id, nom: c.name })) }) +
      "</div>" +

      '<div class="champ"><span class="champ__label">Photo</span>' +
        '<div class="rang">' +
          '<span class="v-apercu" id="e-ap">' + mnIcon(cur.image || "i-wheels-car") + "</span>" +
          '<div style="flex:1;min-width:0" class="pile pile--sm">' +
            '<input class="saisie mono" id="e-img" value="' + U.esc(cur.image) + '">' +
            U.bouton("Choisir dans la bibliothèque",
              { variante: "fantome", taille: "sm", action: "img" }) +
          "</div>" +
        "</div></div>" +

      '<div class="cols-3">' +
        U.champ({ id: "e-carb", label: "Carburant", type: "liste", valeur: cur.carburant,
          options: [{ valeur: "", nom: "— non précisé" }]
            .concat(MNStore.CARBURANTS.map(c => ({ valeur: c, nom: c })))
            .concat([{ valeur: MNStore.NA, nom: "N/A — sans objet" }]) }) +
        U.champ({ id: "e-pl", label: "Places", valeur: cur.places, clavier: "numeric",
          max: 5, repere: "4 ou N/A" }) +
        U.champ({ id: "e-co", label: "Coffre (kg)", valeur: cur.coffre, max: 24,
          repere: "100 ou N/A" }) +
      "</div>" +

      '<div class="cols-2">' +
        U.champ({ id: "e-li", label: "Réservoir (litres)", valeur: cur.litres,
          clavier: "numeric", max: 6, repere: "60 ou N/A" }) +
        U.champ({ id: "e-note", label: "Note (facultatif)", valeur: cur.note, max: 120 }) +
      "</div>" +

      U.champ({ id: "e-rem", type: "bascule", valeur: cur.remorquable,
        label: "Remorquable" }) +

      '<p class="champ__aide">Écris <b>N/A</b> dans une case qui ne s\'applique pas — ' +
        "un bateau sans coffre, un vélo sans réservoir. La fiche compte alors comme " +
        "complète et perd son étoile.</p>";

    const ap = corps.querySelector("#e-ap");
    const img = corps.querySelector("#e-img");
    img.addEventListener("input", () => { ap.innerHTML = mnIcon(img.value.trim() || "i-wheels-car"); });
    corps.querySelector('[data-a="img"]').addEventListener("click", () => {
      MNImagier.choisir(img.value.trim(), ref => {
        img.value = ref;
        ap.innerHTML = mnIcon(ref || "i-wheels-car");
      }, { max: 720 });
    });

    U.modale({
      titre: neuf ? "Nouveau véhicule" : "Modifier " + cur.name,
      large: true, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: async (fermer, c, btn) => {
            const g = s => c.querySelector(s).value.trim();
            const nom = g("#e-nom");
            if (!nom) return U.toast("Le nom est obligatoire", "err");

            /* Les caractéristiques passent par le magasin : « n/a », « N.A. »
               et « 4 » y prennent leur forme définitive. */
            const data = MNStore.statsVehicule({
              name: nom,
              category: c.querySelector("#e-cat").value,
              image: g("#e-img"),
              carburant: c.querySelector("#e-carb").value,
              places: g("#e-pl"),
              coffre: g("#e-co"),
              litres: g("#e-li"),
              remorquable: c.querySelector("#e-rem").checked,
              note: g("#e-note")
            });

            btn.disabled = true;
            let aEnvoyer, msg;

            if (neuf) {
              data.id = MNStore.uniqueId(nom, P().vehicles.map(x => x.id));
              /* Qui gère le parc y écrit directement ; les autres proposent. */
              data.status = peutEcrire ? "valide" : "attente";
              data.proposePar = moi.pseudo;
              data.proposeLe = new Date().toISOString();
              data.propose = null;
              sel = data.id;
              aEnvoyer = data;
              msg = peutEcrire ? "Véhicule ajouté"
                               : "Proposition envoyée — elle attend une validation";
            } else {
              const cible = P().vehicles.find(x => x.id === v.id);
              if (peutEcrire || (enAttente(cible) && cible.proposePar === moi.pseudo)) {
                aEnvoyer = Object.assign({}, cible, data, { propose: null });
                msg = cible.propose
                  ? "Véhicule mis à jour — la correction de " + (cible.propose.par || "?") +
                    " a été remplacée"
                  : "Véhicule mis à jour";
              } else {
                aEnvoyer = Object.assign({}, cible, {
                  propose: { par: moi.pseudo, le: new Date().toISOString(), champs: data }
                });
                msg = "Correction proposée — elle attend une validation";
              }
            }

            const r = await MNParc.setVehicle(aEnvoyer);
            fermer();
            rendu(r, msg);
          } }
      ]
    });
  }
})();
