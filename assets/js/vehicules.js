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
  }

  /* ---- Données ---------------------------------------------------------- */

  const P = () => MNParc.parc();

  const catOf = v => P().cats.find(c => c.id === v.category) ||
    { id: "", name: "Sans catégorie", icon: "i-box" };

  const enAttente = v => v.status === "attente";

  /** Les véhicules correspondant au filtre, dans l'ordre du catalogue. */
  function liste() {
    const f = filter.toLowerCase();
    return P().vehicles.filter(v => !f ||
      v.name.toLowerCase().indexOf(f) !== -1 ||
      catOf(v).name.toLowerCase().indexOf(f) !== -1);
  }

  /**
   * Rend compte d'une écriture. Le parc distant est déjà à jour côté serveur ;
   * on ne redessine qu'ensuite pour ne pas montrer un état qui n'a pas pris.
   */
  function rendu(r, message) {
    render();
    if (!r || r.ok) {
      MNUI.toast(message + (r && r.local ? " — pense à publier" : ""), "ok");
    } else {
      MNUI.toast("Enregistrement impossible : " + (r.error || "échec"), "err");
    }
  }

  /* ---- Rendu ------------------------------------------------------------- */

  function render() {
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
    bar.innerHTML =
      '<span class="draftbar__dot"></span>' +
      '<span class="draftbar__txt"><b>Parc non publié</b> ' +
        "<span>— sans serveur configuré, il vit dans le catalogue : personne ne le verra " +
        "tant qu'il n'est pas publié.</span></span>" +
      (MNAuth.can("publish")
        ? '<a class="btn btn--primary btn--sm" href="admin.html">' + svg("cloud") + "<span>Publier</span></a>"
        : "");
  }

  function renderList() {
    const host = $("#v-list");
    const items = liste();

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

    const ligne = v =>
      '<button class="staffrow' + (v.id === sel ? " is-active" : "") +
        (enAttente(v) ? " is-attente" : "") +
        '" data-v="' + esc(v.id) + '" type="button">' +
        '<span class="vthumb">' + mnIcon(v.image || "i-wheels-car") + "</span>" +
        '<span class="staffrow__txt"><b>' + esc(v.name) + "</b>" +
          "<i>" + esc(enAttente(v)
            ? "proposé par " + (v.proposePar || "?")
            : catOf(v).name) + "</i></span>" +
      "</button>";

    host.innerHTML =
      '<div class="stafflist__top">' +
        '<input class="input" id="v-search" placeholder="Filtrer les véhicules…" value="' +
          esc(filter) + '">' +
      "</div>" +
      '<div class="stafflist__body">' +
        (attente.length
          ? '<div class="vgroup vgroup--attente"><span class="vgroup__t">' + svg("history") +
              "En attente<i>" + attente.length + "</i></span>" +
              attente.map(ligne).join("") +
            "</div>"
          : "") +
        (groupes.length
          ? groupes.map(g =>
              '<div class="vgroup"><span class="vgroup__t">' + mnIcon(g.c.icon) +
                esc(g.c.name) + '<i>' + g.vs.length + "</i></span>" +
                g.vs.map(ligne).join("") +
              "</div>").join("")
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

    const s = $("#v-search");
    s.addEventListener("input", () => {
      filter = s.value;
      const pos = s.selectionStart;
      renderList();
      const ns = $("#v-search"); ns.focus(); ns.setSelectionRange(pos, pos);
    });

    host.querySelectorAll("[data-v]").forEach(b =>
      b.addEventListener("click", () => { sel = b.dataset.v; renderList(); renderCard(); }));

    const add = $("#v-add");
    if (add) add.addEventListener("click", () => editVehicle(null));
    const cats = $("#v-cats");
    if (cats) cats.addEventListener("click", editCats);
  }

  const boite = (label, valeur) =>
    '<div class="vbox"><span class="vbox__l">' + esc(label) + "</span>" +
      "<b>" + (valeur ? esc(valeur) : "—") + "</b></div>";

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
    /* Celui qui a proposé peut corriger sa demande tant qu'elle attend. */
    const monBrouillon = attente && v.proposePar === me.pseudo;

    pane.innerHTML =
      '<div class="panel vcard">' +
        '<div class="vcard__head">' +
          "<h2>" + esc(v.name) + "</h2>" +
          '<span class="permtag' + (attente ? " permtag--none" : "") + '">' +
            esc(attente ? "proposition" : c.name) + "</span>" +
          '<span class="spacer"></span>' +
          (canEdit || monBrouillon
            ? '<button class="btn btn--ghost btn--sm" id="v-edit">' + svg("edit") +
                "<span>Modifier</span></button>"
            : "") +
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
          '<div class="vshot">' + mnIcon(v.image || "i-wheels-car") + "</div>" +

          (v.note ? '<p class="hint vcard__note">' + esc(v.note) + "</p>" : "") +

          '<div class="vboxes">' +
            boite("Carburant", v.carburant) +
            boite("Places", v.places || "") +
            boite("Coffre", v.coffre + " KG") +
            boite("Réservoir", v.litres ? v.litres + " L" : "") +
          "</div>" +
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
    const cur = v ? MNStore.clone(v) : {
      name: "", category: P().cats[0].id, image: "",
      carburant: "", places: 0, coffre: "", litres: 0, note: ""
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

      '<div class="editor__grid editor__grid--3">' +
        '<div class="field"><label class="label" for="e-vf">Carburant</label>' +
          '<select class="select" id="e-vf">' +
            ['', 'Essence', 'Diesel'].map(c =>
              '<option value="' + esc(c) + '"' + (c === cur.carburant ? " selected" : "") + ">" +
              (c || "— non précisé") + "</option>").join("") +
          "</select></div>" +
        '<div class="field"><label class="label" for="e-vp">Places</label>' +
          '<input class="input input--num" id="e-vp" type="number" min="0" max="99" value="' +
            Number(cur.places || 0) + '"></div>' +
        '<div class="field"><label class="label" for="e-vk">Coffre</label>' +
          '<input class="input" id="e-vk" maxlength="24" value="' + esc(cur.coffre) +
            '" placeholder="5 kg"></div>' +
      "</div>" +

      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="e-vt">Réservoir (litres)</label>' +
          '<input class="input input--num" id="e-vt" type="number" min="0" max="9999" value="' +
            Number(cur.litres || 0) + '"></div>' +
        '<div class="field"><label class="label" for="e-vnote">Note (facultatif)</label>' +
          '<input class="input" id="e-vnote" maxlength="120" value="' + esc(cur.note) + '"></div>' +
      "</div>";

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

            const g = s => body.querySelector(s).value.trim();
            const data = {
              name: nom,
              category: body.querySelector("#e-vc").value,
              image: g("#e-vi"),
              carburant: g("#e-vf"),
              places: Math.max(0, Math.min(99, Math.round(Number(g("#e-vp")) || 0))),
              coffre: g("#e-vk"),
              litres: Math.max(0, Math.min(9999, Math.round(Number(g("#e-vt")) || 0))),
              note: g("#e-vnote")
            };

            if (isNew) {
              data.id = MNStore.uniqueId(nom, P().vehicles.map(x => x.id));
              /* Qui peut gérer le parc y écrit directement ; les autres
                 proposent, et leur ajout attend une validation. */
              data.status = canEdit ? "valide" : "attente";
              data.proposePar = me.pseudo;
              data.proposeLe = new Date().toISOString();
              sel = data.id;
            } else {
              const cible = P().vehicles.find(x => x.id === v.id);
              /* Modifier sa propre proposition ne la fait pas passer : elle
                 reste en attente, avec son auteur. */
              Object.assign(data, {
                id: cible.id, status: cible.status,
                proposePar: cible.proposePar, proposeLe: cible.proposeLe
              });
            }
            close();
            rendu(await MNParc.setVehicle(data), isNew
              ? (canEdit ? "Véhicule ajouté" : "Proposition envoyée — elle attend une validation")
              : "Véhicule mis à jour");
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
