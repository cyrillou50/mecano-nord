/* ==========================================================================
   Page Véhicules : le parc rangé par catégorie à gauche, la fiche à droite.

   C'est un catalogue de consultation — tout le monde y a accès — que seuls
   les titulaires de la permission « Gérer les véhicules » peuvent modifier.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;

  let me = null;
  let sel = null;
  let filter = "";
  let canEdit = false;      // modifier et supprimer n'importe quel véhicule
  let canValid = false;     // approuver ou refuser une proposition

  /* Le tri est une habitude : on le retient. Les filtres carburant et
     catégorie sont une recherche du moment — les retrouver au retour ferait
     croire à un parc vide. */
  const K_TRI = "mn.veh.tri";
  const plis = MNUI.folds("mn.veh.folds");

  let tri = localStorage.getItem(K_TRI) || "az";
  let fCarb = "";           // "", "Essence" ou "Diesel"
  let fCat = "";            // "" = toutes
  let fEtoile = "";         // "" = toutes, "oui" = incomplètes, "non" = complètes

  MNUI.start({ page: "vehicules", title: "Véhicules", onReady: init });

  async function init(session) {
    me = session;
    canEdit = MNAuth.canAny("vehicles", "admin");
    canValid = MNAuth.canAny("vehicles_validate", "vehicles", "admin");

    /* Le parc vient du serveur : une proposition doit être visible par les
       autres sans passer par une publication. */
    await MNParc.load(true).catch(e => console.error(e));

    const first = liste()[0];
    sel = first ? first.id : null;
    render();

    /* Le bandeau suit l'envoi automatique, qui part sans passer par ici. */
    MNGitHub.onAuto(renderDraftbar);
  }

  /* ---- Données ---------------------------------------------------------- */

  const P = () => MNParc.parc();

  const catOf = v => P().cats.find(c => c.id === v.category) ||
    { id: "", name: "Sans catégorie", icon: "i-box" };

  const enAttente = v => v.status === "attente";

  /* Ce qu'on attend d'une fiche renseignée. La note reste facultative, elle
     est marquée comme telle dans le formulaire.

     « N/A » compte comme renseigné : c'est une réponse, pas un oubli. Un
     bateau n'a pas de coffre et un vélo pas de réservoir — sans ça leur fiche
     porterait l'étoile à vie, et l'étoile ne voudrait plus rien dire. */
  const rempli = x => !!String(x == null ? "" : x).trim();
  const CHAMPS = [
    { nom: "photo", vide: v => !v.image },
    { nom: "carburant", vide: v => !rempli(v.carburant) },
    { nom: "places", vide: v => !rempli(v.places) },
    { nom: "coffre", vide: v => !rempli(v.coffre) },
    { nom: "réservoir", vide: v => !rempli(v.litres) }
  ];

  /** La liste de ce qui manque, vide si la fiche est complète. */
  const manques = v => CHAMPS.filter(c => c.vide(v)).map(c => c.nom);

  /** « photo, carburant et réservoir » — lisible dans une phrase. */
  function enumerer(l) {
    if (l.length < 2) return l[0] || "";
    return l.slice(0, -1).join(", ") + " et " + l[l.length - 1];
  }

  /* ---- Modifications proposées ------------------------------------------------
     Tout le monde peut corriger une fiche, mais sans droit d'écriture la
     correction attend à côté du véhicule : la fiche affichée reste celle qui a
     été validée, et un valideur tranche. */

  const MODIFS = [
    { k: "name", nom: "nom" },
    { k: "category", nom: "catégorie", lisible: v => (P().cats.find(c => c.id === v) || {}).name || v },
    { k: "image", nom: "photo", lisible: v => (v ? "définie" : "aucune") },
    { k: "carburant", nom: "carburant" },
    { k: "places", nom: "places" },
    { k: "coffre", nom: "coffre" },
    { k: "litres", nom: "réservoir", lisible: v => volume(v) },
    /* `lisible` est indispensable ici : sans lui, un booléen faux s'écrirait
       « — » dans la comparaison, comme un champ vide. */
    { k: "remorquable", nom: "remorquable", lisible: v => (v === true ? "oui" : "non") },
    { k: "note", nom: "note" }
  ];

  /** Ce que la proposition changerait, champ par champ. */
  function ecarts(v) {
    if (!v.propose) return [];
    return MODIFS
      .filter(m => String(v[m.k] || "") !== String(v.propose.champs[m.k] || ""))
      .map(m => ({
        nom: m.nom,
        avant: (m.lisible ? m.lisible(v[m.k]) : v[m.k]) || "—",
        apres: (m.lisible ? m.lisible(v.propose.champs[m.k]) : v.propose.champs[m.k]) || "—"
      }));
  }

  /** Un filtre est-il en cours ? Sert à tout déplier et à proposer un retour. */
  const filtre = () => !!(filter.trim() || fCarb || fCat || fEtoile);

  /** Les véhicules retenus par la recherche et les filtres, triés. */
  function liste() {
    const f = filter.trim().toLowerCase();
    const out = P().vehicles.filter(v => {
      if (fCarb && v.carburant !== fCarb) return false;
      if (fCat && v.category !== fCat) return false;
      if (fEtoile && (manques(v).length > 0) !== (fEtoile === "oui")) return false;
      if (!f) return true;
      return v.name.toLowerCase().indexOf(f) !== -1 ||
        catOf(v).name.toLowerCase().indexOf(f) !== -1;
    });

    /* `localeCompare` avec `numeric` classe « Yosemite 3 » avant
       « Yosemite 1500 », ce qu'un tri de chaînes ferait à l'envers. */
    out.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    if (tri === "za") out.reverse();
    return out;
  }

  /**
   * Rend compte d'une écriture. Le parc distant est déjà à jour côté serveur ;
   * on ne redessine qu'ensuite pour ne pas montrer un état qui n'a pas pris.
   */
  function rendu(r, message) {
    render();
    if (!r || r.ok) {
      MNUI.toast(message +
        (r && r.local && !MNGitHub.autoActif() ? " — pense à publier" : ""), "ok");
    } else {
      MNUI.toast("Enregistrement impossible : " + (r.error || "échec"), "err");
    }
  }

  /* ---- Rendu ------------------------------------------------------------- */

  /* Position de défilement de la liste, conservée entre deux rendus. Elle est
     relevée avant chaque destruction : `render()` remplace tout le contenu, il
     est donc trop tard pour la lire depuis `renderList()`. */
  let scrollListe = 0;

  function memoriserScroll() {
    const b = document.querySelector("#v-list .stafflist__body");
    if (b) scrollListe = b.scrollTop;
  }

  function render() {
    memoriserScroll();
    $("#veh-root").innerHTML =
      '<div class="wrap admin admin--staff">' +
        '<aside class="stafflist" id="v-list"></aside>' +
        '<section id="v-card"></section>' +
      "</div>";
    renderList();
    renderCard();
    renderDraftbar();
  }

  /**
   * Avec un serveur, le parc est partagé dès l'enregistrement : rien à
   * publier. Sans serveur, il retombe dans le catalogue et il faut le dire —
   * une proposition resterait sinon invisible pour tout le monde.
   */
  function renderDraftbar() {
    const bar = $("#draftbar");
    if (!bar) return;

    /* Un souci réseau se signale en premier : c'est précisément quand le
       serveur ne répond pas que `estDistant()` est faux, donc le tester
       d'abord ferait taire l'alerte au moment où elle sert. */
    const s = MNParc.souci();
    if (s) {
      bar.hidden = false;
      bar.innerHTML = '<span class="draftbar__dot"></span>' +
        '<span class="draftbar__txt"><b>' + esc(s) + "</b> " +
        "<span>Le parc affiché vient du catalogue et peut être incomplet ; " +
        "n'enregistre rien tant que le serveur n'a pas répondu.</span></span>";
      return;
    }

    if (MNParc.surServeur() && MNParc.estDistant()) { bar.hidden = true; return; }

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
        "<b>Le parc n'est enregistré que sur cet appareil.</b> " +
        "<span>Sans serveur configuré, il vit dans le catalogue, " +
        "et il faut le mettre en ligne pour que l'équipe le voie.</span></span>" +
      (MNAuth.can("publish")
        ? '<a class="btn btn--primary btn--sm" href="admin.html">' + svg("cloud") + "<span>Publier</span></a>"
        : "");
  }

  function renderList() {
    const host = $("#v-list");
    const items = liste();
    /* Reconstruire la liste efface le défilement. On le remet où il était :
       après un enregistrement, on veut rester devant la ligne qu'on éditait. */
    memoriserScroll();

    /* Les propositions restent hors du parc jusqu'à validation, mais tout le
       monde les voit : celui qui propose doit pouvoir suivre où en est sa
       demande, et les valideurs les trouver sans les chercher. */
    const attente = items.filter(enAttente);
    const valides = items.filter(v => !enAttente(v));

    /* Regroupement par catégorie : c'est la demande principale, et ça évite
       une liste à plat qui deviendrait vite illisible. */
    const groupes = P().cats
      .map(c => ({ c, vs: valides.filter(v => v.category === c.id) }))
      .filter(g => g.vs.length);

    const ligne = v => {
      const m = manques(v);
      return '<button class="staffrow' + (v.id === sel ? " is-active" : "") +
        (enAttente(v) ? " is-attente" : "") +
        '" data-v="' + esc(v.id) + '" type="button">' +
        '<span class="vthumb">' + mnIcon(v.image || "i-wheels-car") + "</span>" +
        '<span class="staffrow__txt"><b>' + esc(v.name) + "</b>" +
          "<i>" + esc(enAttente(v)
            ? "proposé par " + (v.proposePar || "?")
            : catOf(v).name) + "</i></span>" +
        (v.propose
          ? '<span class="vstar vstar--modif" title="Correction proposée par ' +
            esc(v.propose.par || "?") + '" aria-label="Correction proposée">' +
            svg("edit") + "</span>"
          : "") +
        (m.length
          ? '<span class="vstar" title="Fiche incomplète : il manque ' + esc(enumerer(m)) +
            '" aria-label="Fiche incomplète">' + svg("star") + "</span>"
          : "") +
      "</button>";
    };

    /* Un filtre en cours déplie tout : masquer un résultat trouvé n'aurait
       aucun sens. L'état enregistré n'est pas touché pour autant. */
    const plie = id => !filtre() && plis.has(id);

    const bloc = (key, tete, contenu, classe) =>
      '<div class="vgroup' + (classe ? " " + classe : "") + (plie(key) ? " is-folded" : "") + '">' +
        '<span class="vgroup__t fold" data-fold="' + esc(key) + '" role="button" tabindex="0"' +
          ' aria-expanded="' + (plie(key) ? "false" : "true") + '">' +
          svg("chevDown", "fold__chev") + tete + "</span>" +
        '<div class="fold__body">' + contenu + "</div>" +
      "</div>";

    host.innerHTML =
      '<div class="stafflist__top">' +
        '<input class="input" id="v-search" placeholder="Rechercher un véhicule…" value="' +
          esc(filter) + '">' +
        '<div class="vfilters">' +
          '<select class="select" id="v-tri" title="Ordre">' +
            '<option value="az"' + (tri === "az" ? " selected" : "") + ">A → Z</option>" +
            '<option value="za"' + (tri === "za" ? " selected" : "") + ">Z → A</option>" +
          "</select>" +
          /* Pendant qu'on complète le parc, ne voir que les fiches à finir
             évite de faire défiler celles qui sont déjà bonnes. */
          '<select class="select" id="v-etoile" title="Fiches complètes ou non">' +
            '<option value="">Toutes fiches</option>' +
            '<option value="oui"' + (fEtoile === "oui" ? " selected" : "") + ">Avec étoile</option>" +
            '<option value="non"' + (fEtoile === "non" ? " selected" : "") + ">Sans étoile</option>" +
          "</select>" +
          '<select class="select" id="v-carb" title="Carburant">' +
            '<option value="">Tout carburant</option>' +
            MNStore.CARBURANTS.concat(MNStore.NA).map(c =>
              '<option value="' + esc(c) + '"' + (fCarb === c ? " selected" : "") + ">" +
              esc(c) + "</option>").join("") +
          "</select>" +
          '<select class="select" id="v-cat" title="Catégorie">' +
            '<option value="">Toutes catégories</option>' +
            P().cats.map(c =>
              '<option value="' + esc(c.id) + '"' + (fCat === c.id ? " selected" : "") + ">" +
              esc(c.name) + "</option>").join("") +
          "</select>" +
        "</div>" +
        (filtre()
          ? '<button class="btn btn--ghost btn--sm" id="v-clear" style="width:100%;margin-top:6px">' +
            svg("x") + "<span>Tout afficher</span></button>"
          : "") +
      "</div>" +
      '<div class="stafflist__body">' +
        (attente.length
          ? bloc("__attente", svg("history") + "En attente<i>" + attente.length + "</i>",
              attente.map(ligne).join(""), "vgroup--attente")
          : "") +
        (groupes.length
          ? groupes.map(g =>
              bloc(g.c.id, mnIcon(g.c.icon) + esc(g.c.name) + "<i>" + g.vs.length + "</i>",
                g.vs.map(ligne).join(""))).join("")
          : (attente.length ? "" : '<p class="hint" style="padding:12px">' +
            (P().vehicles.length ? "Aucun véhicule ne correspond." : "Aucun véhicule enregistré.") +
            "</p>")) +
      "</div>" +
      '<div class="stafflist__foot">' +
        '<span class="hint">' + valides.length + " véhicule" + (valides.length > 1 ? "s" : "") +
          (attente.length ? " · " + attente.length + " en attente" : "") + "</span>" +
        '<span class="row" style="gap:4px">' +
          (canEdit
            ? '<button class="btn btn--ghost btn--sm" id="v-cats" title="Catégories">' +
              svg("layers") + "</button>"
            : "") +
          /* Proposer est ouvert à tous : c'est la validation qui filtre, pas
             l'accès au formulaire. */
          '<button class="btn btn--primary btn--sm" id="v-add">' + svg("plus") +
            "<span>" + (canEdit ? "Ajouter" : "Proposer") + "</span></button>" +
        "</span>" +
      "</div>";

    const corps = host.querySelector(".stafflist__body");
    if (corps && scrollListe) corps.scrollTop = scrollListe;

    const s = $("#v-search");
    s.addEventListener("input", () => {
      filter = s.value;
      const pos = s.selectionStart;
      /* Une recherche change ce qu'on voit : là, repartir du haut est juste. */
      scrollListe = 0;
      renderList();
      const nc = $("#v-list").querySelector(".stafflist__body");
      if (nc) nc.scrollTop = 0;
      const ns = $("#v-search"); ns.focus(); ns.setSelectionRange(pos, pos);
    });

    $("#v-tri").addEventListener("change", e => {
      tri = e.target.value;
      try { localStorage.setItem(K_TRI, tri); } catch (_) { /* quota */ }
      renderList();
    });
    /* Changer de filtre change la liste : on repart du haut, comme pour une
       recherche. */
    const filtrer = fn => e => { fn(e.target.value); scrollListe = 0; renderList(); };
    $("#v-carb").addEventListener("change", filtrer(v => { fCarb = v; }));
    $("#v-etoile").addEventListener("change", filtrer(v => { fEtoile = v; }));
    $("#v-cat").addEventListener("change", filtrer(v => { fCat = v; }));

    const clear = $("#v-clear");
    if (clear) clear.addEventListener("click", () => {
      filter = ""; fCarb = ""; fCat = ""; fEtoile = "";
      scrollListe = 0;
      renderList();
    });

    /* On bascule la classe plutôt que de tout reconstruire : le champ de
       recherche garde son focus et la liste ne saute pas. */
    host.querySelectorAll("[data-fold]").forEach(h => {
      const bascule = () => {
        const ferme = plis.toggle(h.dataset.fold);
        h.parentElement.classList.toggle("is-folded", ferme);
        h.setAttribute("aria-expanded", ferme ? "false" : "true");
      };
      h.addEventListener("click", bascule);
      h.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        bascule();
      });
    });

    /* Choisir un véhicule ne change que la ligne active : on bascule la
       classe au lieu de reconstruire la liste, qui repartait sinon en haut à
       chaque clic — pénible avec quarante véhicules. */
    host.querySelectorAll("[data-v]").forEach(b =>
      b.addEventListener("click", () => {
        sel = b.dataset.v;
        host.querySelectorAll("[data-v]").forEach(x => x.classList.toggle("is-active", x === b));
        renderCard();
      }));

    const add = $("#v-add");
    if (add) add.addEventListener("click", () => editVehicle(null));
    const cats = $("#v-cats");
    if (cats) cats.addEventListener("click", editCats);
  }

  const boite = (label, valeur) =>
    '<div class="vbox' + (valeur ? "" : " vbox--vide") + '"><span class="vbox__l">' +
      esc(label) + "</span><b>" + (valeur ? esc(valeur) : "—") + "</b></div>";

  /**
   * Une valeur avec son unité.
   *
   * Rien saisi → chaîne vide, pour que la case affiche son tiret au lieu d'un
   * « KG » orphelin. « N/A » ressort tel quel : « N/A KG » n'aurait aucun
   * sens. Et une valeur qui porte déjà son unité — il en existe, saisies
   * avant que l'unité soit ajoutée à l'affichage — n'en reçoit pas une
   * seconde.
   */
  function avecUnite(v, unite, dejaLa) {
    const s = String(v || "").trim();
    if (!s || MNStore.estNA(s)) return s;
    return dejaLa.test(s) ? s : s + " " + unite;
  }

  const poids = v => avecUnite(v, "KG", /kgs?\s*$/i);
  const volume = v => avecUnite(v, "L", /(l|litres?)\s*$/i);

  function renderCard() {
    const pane = $("#v-card");
    const v = P().vehicles.find(x => x.id === sel);

    if (!v) {
      pane.innerHTML = '<div class="empty">' + svg("car") + "<b>Aucun véhicule sélectionné</b>" +
        (canEdit ? "<p>Clique sur « Ajouter » pour en créer un.</p>" : "") + "</div>";
      return;
    }
    const c = catOf(v);
    const attente = enAttente(v);
    const manque = manques(v);
    /* Celui qui a proposé peut corriger sa demande tant qu'elle attend. */
    const monBrouillon = attente && v.proposePar === me.pseudo;

    pane.innerHTML =
      '<div class="panel vcard">' +
        '<div class="vcard__head">' +
          "<h2>" + esc(v.name) + "</h2>" +
          '<span class="permtag' + (attente ? " permtag--none" : "") + '">' +
            esc(attente ? "proposition" : c.name) + "</span>" +
          (manque.length
            ? '<span class="vstar" title="Il manque ' + esc(enumerer(manque)) + '">' +
              svg("star") + "</span>"
            : "") +
          '<span class="spacer"></span>' +
          /* Corriger une fiche est ouvert à tous ; c'est la validation qui
             filtre, comme pour l'ajout. */
          '<button class="btn btn--ghost btn--sm" id="v-edit">' + svg("edit") +
            "<span>" + (canEdit || monBrouillon ? "Modifier" : "Proposer une correction") +
            "</span></button>" +
          (canEdit || monBrouillon
            ? '<button class="btn btn--icon" id="v-del" title="Supprimer">' + svg("trash") + "</button>"
            : "") +
        "</div>" +

        '<div class="vcard__body">' +
          (attente
            ? '<div class="alert alert--warn" style="margin-bottom:16px">' + svg("history") +
              "<span><b>En attente de validation.</b> Proposé par " +
              esc(v.proposePar || "?") +
              (v.proposeLe ? " " + MNUI.ago(new Date(v.proposeLe).getTime()) : "") +
              ". Ce véhicule n'apparaîtra dans le parc qu'une fois approuvé.</span></div>" +
              (canValid
                ? '<div class="row" style="margin-bottom:18px">' +
                  '<button class="btn btn--solid" id="v-ok">' + svg("check") +
                    "<span>Approuver</span></button>" +
                  '<button class="btn btn--danger" id="v-no">' + svg("x") +
                    "<span>Refuser</span></button></div>"
                : "")
            : "") +
          /* Correction en attente : on montre ce qu'elle changerait, sans
             toucher à la fiche tant qu'elle n'est pas approuvée. */
          (v.propose
            ? (function () {
                const e = ecarts(v);
                return '<div class="alert alert--warn vmodif" style="margin-bottom:16px">' +
                  svg("edit") + "<span><b>Correction proposée par " +
                  esc(v.propose.par || "?") +
                  (v.propose.le ? " " + MNUI.ago(new Date(v.propose.le).getTime()) : "") + ".</b>" +
                  (e.length
                    ? "<ul class=\"vdiff\">" + e.map(x =>
                        "<li><i>" + esc(x.nom) + "</i> " + esc(String(x.avant)) +
                        " <b>→</b> " + esc(String(x.apres)) + "</li>").join("") + "</ul>"
                    : " Aucun changement réel.") +
                  "</span></div>" +
                  (canValid
                    ? '<div class="row" style="margin-bottom:18px">' +
                      '<button class="btn btn--solid" id="v-mok">' + svg("check") +
                        "<span>Appliquer</span></button>" +
                      '<button class="btn btn--danger" id="v-mno">' + svg("x") +
                        "<span>Écarter</span></button></div>"
                    : "");
              })()
            : "") +
          '<div class="vshot">' + mnIcon(v.image || "i-wheels-car") + "</div>" +

          (v.note ? '<p class="hint vcard__note">' + esc(v.note) + "</p>" : "") +

          '<div class="vboxes">' +
            boite("Carburant", v.carburant) +
            boite("Places", v.places) +
            boite("Coffre", poids(v.coffre)) +
            boite("Réservoir", volume(v.litres)) +
            /* Toujours renseigné — une case cochée ou non — donc jamais le
               tiret des cases vides : « non » est une réponse. */
            '<div class="vbox"><span class="vbox__l">Remorquable</span>' +
              '<b class="vrem vrem--' + (v.remorquable ? "oui" : "non") + '">' +
                svg(v.remorquable ? "check" : "x") +
                "<span>" + (v.remorquable ? "Oui" : "Non") + "</span></b></div>" +
          "</div>" +

          (manque.length
            ? '<p class="hint vmanque">' + svg("star") + "<span>Fiche incomplète : il manque " +
              esc(enumerer(manque)) + ".</span></p>"
            : "") +
        "</div>" +
      "</div>";

    const e = $("#v-edit");
    if (e) e.addEventListener("click", () => editVehicle(v));
    const d = $("#v-del");
    if (d) d.addEventListener("click", () => deleteVehicle(v));
    const ok = $("#v-ok");
    if (ok) ok.addEventListener("click", () => valider(v));
    const no = $("#v-no");
    if (no) no.addEventListener("click", () => refuser(v));
    const mok = $("#v-mok");
    if (mok) mok.addEventListener("click", () => appliquerCorrection(v));
    const mno = $("#v-mno");
    if (mno) mno.addEventListener("click", () => ecarterCorrection(v));

    embellirPhoto(v);
  }

  /**
   * Les rendus de véhicules arrivent avec de larges marges transparentes : la
   * voiture n'occupe souvent qu'un tiers de l'image, et s'affiche donc perdue
   * au milieu du cadre. On la recadre après coup, sur la photo déjà visible —
   * si ça échoue, il ne se passe simplement rien.
   */
  async function embellirPhoto(v) {
    if (!v.image) return;
    const avant = $(".vshot img");
    if (!avant) return;

    const data = await MNImagier.cadrer(v.image);
    if (!data) return;

    /* Le temps de lire les pixels, l'utilisateur a pu changer de fiche. */
    if (sel !== v.id) return;
    const apres = $(".vshot img");
    if (apres) apres.src = data;
  }

  /** Approuve une correction : ses valeurs deviennent celles du véhicule. */
  async function appliquerCorrection(v) {
    const maj = Object.assign({}, v, v.propose.champs, { propose: null });
    rendu(await MNParc.setVehicle(maj), "Correction appliquée");
  }

  async function ecarterCorrection(v) {
    const ok = await MNUI.confirm({
      title: "Écarter la correction",
      message: "La correction proposée par " + (v.propose.par || "?") +
        " sera supprimée. Le véhicule reste tel qu'il est.",
      confirmLabel: "Écarter", danger: true
    });
    if (!ok) return;
    rendu(await MNParc.setVehicle(Object.assign({}, v, { propose: null })), "Correction écartée");
  }

  /* ---- Validation ---------------------------------------------------------- */

  async function valider(v) {
    rendu(await MNParc.setStatus(v.id, "valide"), v.name + " est entré dans le parc");
  }

  async function refuser(v) {
    const ok = await MNUI.confirm({
      title: "Refuser la proposition",
      message: "« " + v.name + " », proposé par " + (v.proposePar || "?") +
        ", sera supprimé. Il faudra le reproposer pour revenir dessus.",
      confirmLabel: "Refuser", danger: true
    });
    if (!ok) return;
    const r = await MNParc.removeVehicle(v.id);
    if (sel === v.id) { const f = liste()[0]; sel = f ? f.id : null; }
    rendu(r, "Proposition refusée");
  }

  /* ---- Édition ----------------------------------------------------------- */

  function editVehicle(v) {
    const isNew = !v;
    /* Une correction déjà proposée sert de point de départ : on l'affine
       plutôt que de repartir des valeurs validées. */
    const cur = v
      ? Object.assign(MNStore.clone(v), v.propose ? v.propose.champs : {})
      : {
          name: "", category: P().cats[0].id, image: "",
          carburant: "", places: 0, coffre: "", litres: 0,
          remorquable: false, note: ""
        };

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="e-vn">Nom</label>' +
          '<input class="input" id="e-vn" maxlength="40" value="' + esc(cur.name) +
            '" placeholder="Ex. BF400"></div>' +
        '<div class="field"><label class="label" for="e-vc">Catégorie</label>' +
          '<select class="select" id="e-vc">' + P().cats.map(c =>
            '<option value="' + esc(c.id) + '"' + (c.id === cur.category ? " selected" : "") + ">" +
            esc(c.name) + "</option>").join("") + "</select></div>" +
      "</div>" +

      '<div class="field"><label class="label">Image</label>' +
        '<div class="iconpick">' +
          '<div class="iconpick__preview" id="e-vi-prev">' +
            mnIcon(cur.image || "i-wheels-car") + "</div>" +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
            '<input class="input mono" id="e-vi" value="' + esc(cur.image) +
              '" placeholder="assets/img/bf400.png">' +
            '<button class="btn btn--ghost btn--sm" id="e-vi-pick" type="button">' +
              "Choisir dans la bibliothèque</button>" +
          "</div></div></div>" +

      /* Champs texte plutôt que `number` : « N/A » doit pouvoir s'y écrire,
         et un sélecteur numérique le refuserait. Le clavier reste numérique
         sur téléphone grâce à `inputmode`. */
      '<div class="editor__grid editor__grid--3">' +
        '<div class="field"><label class="label" for="e-vf">Carburant</label>' +
          '<select class="select" id="e-vf">' +
            [""].concat(MNStore.CARBURANTS, MNStore.NA).map(c =>
              '<option value="' + esc(c) + '"' + (c === cur.carburant ? " selected" : "") + ">" +
              (c === MNStore.NA ? "N/A" : c || "— non précisé") + "</option>").join("") +
          "</select></div>" +
        '<div class="field"><label class="label" for="e-vp">Places</label>' +
          '<input class="input input--num" id="e-vp" inputmode="numeric" maxlength="5" value="' +
            esc(cur.places) + '" placeholder="4 ou N/A"></div>' +
        /* L'unité est ajoutée à l'affichage : le repère ne la montre plus,
           sinon on la saisirait une deuxième fois. */
        '<div class="field"><label class="label" for="e-vk">Coffre (kg)</label>' +
          '<input class="input" id="e-vk" maxlength="24" value="' + esc(cur.coffre) +
            '" placeholder="100 ou N/A"></div>' +
      "</div>" +

      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="e-vt">Réservoir (litres)</label>' +
          '<input class="input input--num" id="e-vt" inputmode="numeric" maxlength="6" value="' +
            esc(cur.litres) + '" placeholder="60 ou N/A"></div>' +
        '<div class="field"><label class="label" for="e-vnote">Note (facultatif)</label>' +
          '<input class="input" id="e-vnote" maxlength="120" value="' + esc(cur.note) + '"></div>' +
      "</div>" +

      '<label class="switch"><input type="checkbox" id="e-vrem"' +
        (cur.remorquable ? " checked" : "") + ">" +
        '<span class="switch__box"></span><span>Remorquable</span></label>' +

      '<p class="hint" style="margin-top:12px">Écris <b>N/A</b> dans une case ' +
        "qui ne s'applique pas — un bateau sans coffre, un vélo sans réservoir. " +
        "La fiche compte alors comme complète et perd son étoile.</p>";

    const prev = body.querySelector("#e-vi-prev");
    const img = body.querySelector("#e-vi");
    const rafraichirApercu = () => {
      prev.innerHTML = mnIcon(img.value.trim() || "i-wheels-car");
    };
    img.addEventListener("input", rafraichirApercu);
    body.querySelector("#e-vi-pick").addEventListener("click", () => {
      /* 720 px : la fiche affiche la photo sur 210 px de haut, le double
         suffit pour les écrans à forte densité sans alourdir le stockage. */
      MNImagier.choisir(img.value.trim(), ref => {
        img.value = ref;
        rafraichirApercu();
      }, { max: 720 });
    });

    MNUI.modal({
      title: isNew ? "Nouveau véhicule" : "Modifier " + cur.name,
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: async close => {
            const nom = body.querySelector("#e-vn").value.trim();
            if (!nom) return MNUI.toast("Le nom est obligatoire", "err");

            /* Les caractéristiques passent par le magasin plutôt que d'être
               bornées ici : « n/a », « N.A. » et « 4 » y prennent leur forme
               définitive, et l'écran montre tout de suite ce que le serveur
               enregistrera. */
            const g = s => body.querySelector(s).value.trim();
            const data = MNStore.statsVehicule({
              name: nom,
              category: body.querySelector("#e-vc").value,
              image: g("#e-vi"),
              carburant: g("#e-vf"),
              places: g("#e-vp"),
              coffre: g("#e-vk"),
              litres: g("#e-vt"),
              remorquable: body.querySelector("#e-vrem").checked,
              note: g("#e-vnote")
            });

            let aEnvoyer, message;

            if (isNew) {
              data.id = MNStore.uniqueId(nom, P().vehicles.map(x => x.id));
              /* Qui peut gérer le parc y écrit directement ; les autres
                 proposent, et leur ajout attend une validation. */
              data.status = canEdit ? "valide" : "attente";
              data.proposePar = me.pseudo;
              data.proposeLe = new Date().toISOString();
              data.propose = null;
              sel = data.id;
              aEnvoyer = data;
              message = canEdit ? "Véhicule ajouté"
                : "Proposition envoyée — elle attend une validation";

            } else {
              const cible = P().vehicles.find(x => x.id === v.id);

              if (canEdit || (enAttente(cible) && cible.proposePar === me.pseudo)) {
                /* Écriture directe. Une correction en attente serait sans objet
                   après coup : on l'écarte, en le disant. */
                aEnvoyer = Object.assign({}, cible, data, { propose: null });
                message = cible.propose
                  ? "Véhicule mis à jour — la correction de " + (cible.propose.par || "?") +
                    " a été remplacée"
                  : "Véhicule mis à jour";
              } else {
                /* Sans droit d'écriture : la correction attend à côté du
                   véhicule, qui reste tel qu'il est affiché. */
                aEnvoyer = Object.assign({}, cible, {
                  propose: { par: me.pseudo, le: new Date().toISOString(), champs: data }
                });
                message = "Correction proposée — elle attend une validation";
              }
            }

            close();
            rendu(await MNParc.setVehicle(aEnvoyer), message);
          }
        }
      ]
    });
  }

  async function deleteVehicle(v) {
    const ok = await MNUI.confirm({
      title: enAttente(v) ? "Retirer la proposition" : "Supprimer le véhicule",
      message: "« " + v.name + " » sera " +
        (enAttente(v) ? "retiré des propositions" : "retiré du parc") + ". C'est définitif.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    const r = await MNParc.removeVehicle(v.id);
    if (sel === v.id) { const f = liste()[0]; sel = f ? f.id : null; }
    rendu(r, "Véhicule supprimé");
  }

  /** Enregistre la liste complète des catégories, puis rafraîchit la fenêtre. */
  async function enregistrerCats(cats, apres, message) {
    const r = await MNParc.setCats(cats);
    rendu(r, message);
    if (apres) apres();
  }

  /** Gestion des catégories, dans une seule fenêtre. */
  function editCats() {
    const body = document.createElement("div");

    const peindre = () => {
      body.innerHTML =
        '<div class="rows" id="c-rows">' + P().cats.map((c, i) => {
          const n = P().vehicles.filter(v => v.category === c.id).length;
          return '<div class="trow" data-c="' + esc(c.id) + '">' +
            '<div class="ord">' +
              '<button data-a="up"' + (i === 0 ? " disabled" : "") + ">" + svg("chevUp") + "</button>" +
              '<button data-a="down"' + (i === P().cats.length - 1 ? " disabled" : "") + ">" +
                svg("chevDown") + "</button>" +
            "</div>" +
            '<div class="trow__ico">' + mnIcon(c.icon) + "</div>" +
            '<div class="trow__main"><b>' + esc(c.name) + "</b>" +
              '<div class="trow__meta"><i>' + n + " véhicule" + (n > 1 ? "s" : "") + "</i></div></div>" +
            '<div class="trow__acts">' +
              '<button class="btn btn--icon" data-a="ren" title="Renommer">' + svg("edit") + "</button>" +
              '<button class="btn btn--icon" data-a="del" title="Supprimer">' + svg("trash") + "</button>" +
            "</div></div>";
        }).join("") + "</div>" +
        '<div class="row" style="margin-top:12px">' +
          '<input class="input" id="c-new" placeholder="Nouvelle catégorie… (ex. Motos)" maxlength="30">' +
          '<button class="btn btn--primary" id="c-add">' + svg("plus") + "<span>Ajouter</span></button>" +
        "</div>";

      body.querySelector("#c-add").addEventListener("click", () => {
        const nom = body.querySelector("#c-new").value.trim();
        if (!nom) return MNUI.toast("Donne un nom", "err");
        const cats = MNStore.clone(P().cats);
        cats.push({
          id: MNStore.uniqueId(nom, cats.map(x => x.id)),
          name: nom, icon: "i-wheels-car"
        });
        enregistrerCats(cats, peindre, "Catégorie ajoutée");
      });

      body.querySelectorAll("[data-c]").forEach(row => {
        const c = P().cats.find(x => x.id === row.dataset.c);
        row.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => {
          const a = b.dataset.a;
          if (a === "up" || a === "down") {
            const cats = MNStore.clone(P().cats);
            const i = cats.findIndex(x => x.id === c.id), j = i + (a === "up" ? -1 : 1);
            if (j < 0 || j >= cats.length) return;
            cats.splice(j, 0, cats.splice(i, 1)[0]);
            enregistrerCats(cats, peindre, "Ordre enregistré");
            return;
          }
          if (a === "ren") return renommer(c, peindre);
          supprimerCat(c, peindre);
        }));
      });
    };

    peindre();
    MNUI.modal({
      title: "Catégories de véhicules", body,
      actions: [{ label: "Fermer", variant: "btn--primary", onClick: c => c() }]
    });
  }

  function renommer(c, apres) {
    const body = document.createElement("div");
    body.innerHTML =
      '<div class="field"><label class="label" for="c-n">Nom</label>' +
        '<input class="input" id="c-n" maxlength="30" value="' + esc(c.name) + '"></div>' +
      '<div class="field" style="margin-top:12px"><label class="label" for="c-i">Icône</label>' +
        '<input class="input mono" id="c-i" value="' + esc(c.icon) + '"></div>';
    MNUI.modal({
      title: "Renommer la catégorie", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: k => k() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: k => {
            const n = body.querySelector("#c-n").value.trim();
            if (!n) return MNUI.toast("Le nom est obligatoire", "err");
            const cats = MNStore.clone(P().cats);
            const cible = cats.find(x => x.id === c.id);
            cible.name = n;
            cible.icon = body.querySelector("#c-i").value.trim() || "i-wheels-car";
            k();
            enregistrerCats(cats, apres, "Catégorie renommée");
          }
        }
      ]
    });
  }

  async function supprimerCat(c, apres) {
    if (P().cats.length <= 1) {
      return MNUI.toast("Il faut au moins une catégorie", "err");
    }
    const n = P().vehicles.filter(v => v.category === c.id).length;
    const repli = P().cats.find(x => x.id !== c.id);
    const ok = await MNUI.confirm({
      title: "Supprimer la catégorie",
      message: "« " + c.name + " » sera supprimée" +
        (n ? " : ses " + n + " véhicule" + (n > 1 ? "s passeront" : " passera") +
          " dans « " + repli.name + " »." : "."),
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    /* Le serveur reclasse lui-même les véhicules orphelins : on ne lui envoie
       que la nouvelle liste. */
    enregistrerCats(P().cats.filter(x => x.id !== c.id), apres, "Catégorie supprimée");
  }
})();
