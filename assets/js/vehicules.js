/* ==========================================================================
   Page Véhicules : le parc rangé par catégorie à gauche, la fiche à droite.

   C'est un catalogue de consultation — tout le monde y a accès — que seuls
   les titulaires de la permission « Gérer les véhicules » peuvent modifier.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;

  /* Les quatre performances affichées, dans l'ordre de la fiche. */
  const PERFS = [
    { key: "vitesse",  label: "Vitesse" },
    { key: "accel",    label: "Accél." },
    { key: "freinage", label: "Freinage" },
    { key: "traction", label: "Traction" }
  ];
  const SEGMENTS = 20;              // barre découpée : plus lisible qu'un trait plein

  let draft = null;
  let me = null;
  let sel = null;
  let filter = "";
  let canEdit = false;

  MNUI.start({ page: "vehicules", title: "Véhicules", onReady: init });

  function init(session) {
    me = session;
    canEdit = MNAuth.canAny("vehicles", "admin");
    draft = MNStore.clone(MNStore.catalog());
    const first = liste()[0];
    sel = first ? first.id : null;
    render();
  }

  /* ---- Données ---------------------------------------------------------- */

  const catOf = v => draft.vehicleCats.find(c => c.id === v.category) ||
    { id: "", name: "Sans catégorie", icon: "i-box" };

  /** Les véhicules correspondant au filtre, dans l'ordre du catalogue. */
  function liste() {
    const f = filter.toLowerCase();
    return draft.vehicles.filter(v => !f ||
      v.name.toLowerCase().indexOf(f) !== -1 ||
      catOf(v).name.toLowerCase().indexOf(f) !== -1);
  }

  function commit() {
    draft = MNStore.saveDraft(draft);
    MNAuth.refresh();
    render();
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

  function renderDraftbar() {
    const bar = $("#draftbar");
    if (!bar) return;
    const dirty = MNStore.hasDraft();
    bar.hidden = !dirty || !canEdit;
    if (bar.hidden) return;
    bar.innerHTML =
      '<span class="draftbar__dot"></span>' +
      '<span class="draftbar__txt"><b>Modifications non publiées</b> ' +
        "<span>— elles ne sont visibles que par toi tant qu'elles ne sont pas envoyées.</span></span>" +
      (MNAuth.can("publish")
        ? '<a class="btn btn--primary btn--sm" href="admin.html">' + svg("cloud") + "<span>Publier</span></a>"
        : "");
  }

  function renderList() {
    const host = $("#v-list");
    const items = liste();

    /* Regroupement par catégorie : c'est la demande principale, et ça évite
       une liste à plat qui deviendrait vite illisible. */
    const groupes = draft.vehicleCats
      .map(c => ({ c, vs: items.filter(v => v.category === c.id) }))
      .filter(g => g.vs.length);

    host.innerHTML =
      '<div class="stafflist__top">' +
        '<input class="input" id="v-search" placeholder="Filtrer les véhicules…" value="' +
          esc(filter) + '">' +
      "</div>" +
      '<div class="stafflist__body">' +
        (groupes.length
          ? groupes.map(g =>
              '<div class="vgroup"><span class="vgroup__t">' + mnIcon(g.c.icon) +
                esc(g.c.name) + '<i>' + g.vs.length + "</i></span>" +
                g.vs.map(v =>
                  '<button class="staffrow' + (v.id === sel ? " is-active" : "") +
                    '" data-v="' + esc(v.id) + '" type="button">' +
                    '<span class="vthumb">' + mnIcon(v.image || "i-wheels-car") + "</span>" +
                    '<span class="staffrow__txt"><b>' + esc(v.name) + "</b>" +
                      "<i>" + esc(v.type || g.c.name) + "</i></span>" +
                  "</button>").join("") +
              "</div>").join("")
          : '<p class="hint" style="padding:12px">' +
            (draft.vehicles.length ? "Aucun véhicule ne correspond." : "Aucun véhicule enregistré.") +
            "</p>") +
      "</div>" +
      '<div class="stafflist__foot">' +
        '<span class="hint">' + items.length + " véhicule" + (items.length > 1 ? "s" : "") + "</span>" +
        (canEdit
          ? '<span class="row" style="gap:4px">' +
            '<button class="btn btn--ghost btn--sm" id="v-cats" title="Catégories">' +
              svg("layers") + "</button>" +
            '<button class="btn btn--primary btn--sm" id="v-add">' + svg("plus") +
              "<span>Ajouter</span></button></span>"
          : "") +
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

  /** Une barre segmentée : autant de crans remplis que la note sur 100. */
  function barre(valeur) {
    const pleins = Math.round((Math.max(0, Math.min(100, valeur)) / 100) * SEGMENTS);
    let out = "";
    for (let i = 0; i < SEGMENTS; i++) {
      out += '<span class="vbar__s' + (i < pleins ? " is-on" : "") + '"></span>';
    }
    return '<span class="vbar">' + out + "</span>";
  }

  const boite = (label, valeur) =>
    '<div class="vbox"><span class="vbox__l">' + esc(label) + "</span>" +
      "<b>" + (valeur ? esc(valeur) : "—") + "</b></div>";

  function renderCard() {
    const pane = $("#v-card");
    const v = draft.vehicles.find(x => x.id === sel);

    if (!v) {
      pane.innerHTML = '<div class="empty">' + svg("car") + "<b>Aucun véhicule sélectionné</b>" +
        (canEdit ? "<p>Clique sur « Ajouter » pour en créer un.</p>" : "") + "</div>";
      return;
    }
    const c = catOf(v);

    pane.innerHTML =
      '<div class="panel vcard">' +
        '<div class="vcard__head">' +
          "<h2>" + esc(v.name) + "</h2>" +
          '<span class="permtag">' + esc(c.name) + "</span>" +
          '<span class="spacer"></span>' +
          (canEdit
            ? '<button class="btn btn--ghost btn--sm" id="v-edit">' + svg("edit") +
                "<span>Modifier</span></button>" +
              '<button class="btn btn--icon" id="v-del" title="Supprimer">' + svg("trash") + "</button>"
            : "") +
        "</div>" +

        '<div class="vcard__body">' +
          '<div class="vshot">' + mnIcon(v.image || "i-wheels-car") + "</div>" +

          (v.note ? '<p class="hint vcard__note">' + esc(v.note) + "</p>" : "") +

          '<h3 class="section-title vcard__st">Performances</h3>' +
          '<div class="vperfs">' +
            PERFS.map(p =>
              '<div class="vperf"><span class="vperf__l">' + esc(p.label) + "</span>" +
                barre(v.stats[p.key]) +
                '<b class="tnum">' + v.stats[p.key] + "</b></div>").join("") +
          "</div>" +

          '<div class="vboxes">' +
            boite("Carburant", v.carburant) +
            boite("Places", v.places || "") +
            boite("Coffre", v.coffre) +
            boite("Type", v.type) +
          "</div>" +
        "</div>" +
      "</div>";

    const e = $("#v-edit");
    if (e) e.addEventListener("click", () => editVehicle(v));
    const d = $("#v-del");
    if (d) d.addEventListener("click", () => deleteVehicle(v));
  }

  /* ---- Édition ----------------------------------------------------------- */

  function editVehicle(v) {
    const isNew = !v;
    const cur = v ? MNStore.clone(v) : {
      name: "", category: draft.vehicleCats[0].id, image: "",
      stats: { vitesse: 0, accel: 0, freinage: 0, traction: 0 },
      carburant: "", places: 0, coffre: "", type: "", note: ""
    };

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="e-vn">Nom</label>' +
          '<input class="input" id="e-vn" maxlength="40" value="' + esc(cur.name) +
            '" placeholder="Ex. BF400"></div>' +
        '<div class="field"><label class="label" for="e-vc">Catégorie</label>' +
          '<select class="select" id="e-vc">' + draft.vehicleCats.map(c =>
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

      '<div class="fieldset"><span class="label">Performances (0 à 100)</span>' +
        '<div class="editor__grid">' +
          PERFS.map(p =>
            '<div class="field"><label class="label" for="e-p-' + p.key + '">' +
              esc(p.label) + "</label>" +
              '<input class="input input--num" id="e-p-' + p.key +
                '" type="number" min="0" max="100" value="' +
                Number(cur.stats[p.key] || 0) + '"></div>'
          ).join("") +
        "</div></div>" +

      '<div class="editor__grid editor__grid--3">' +
        '<div class="field"><label class="label" for="e-vf">Carburant</label>' +
          '<input class="input" id="e-vf" maxlength="24" value="' + esc(cur.carburant) +
            '" placeholder="Essence"></div>' +
        '<div class="field"><label class="label" for="e-vp">Places</label>' +
          '<input class="input input--num" id="e-vp" type="number" min="0" max="99" value="' +
            Number(cur.places || 0) + '"></div>' +
        '<div class="field"><label class="label" for="e-vk">Coffre</label>' +
          '<input class="input" id="e-vk" maxlength="24" value="' + esc(cur.coffre) +
            '" placeholder="5 kg"></div>' +
      "</div>" +

      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="e-vt">Type</label>' +
          '<input class="input" id="e-vt" maxlength="24" value="' + esc(cur.type) +
            '" placeholder="moto"></div>' +
        '<div class="field"><label class="label" for="e-vnote">Note (facultatif)</label>' +
          '<input class="input" id="e-vnote" maxlength="120" value="' + esc(cur.note) + '"></div>' +
      "</div>";

    const prev = body.querySelector("#e-vi-prev");
    const img = body.querySelector("#e-vi");
    img.addEventListener("input", () => { prev.innerHTML = mnIcon(img.value.trim() || "i-wheels-car"); });
    body.querySelector("#e-vi-pick").addEventListener("click", () => {
      /* Le sélecteur d'images vit dans le panneau admin ; ici on saisit le
         chemin, ce qui suffit et évite d'embarquer tout ce code. */
      MNUI.toast("Colle le chemin de l'image, ou dépose-la depuis Admin → Images", "info");
      img.focus();
    });

    MNUI.modal({
      title: isNew ? "Nouveau véhicule" : "Modifier " + cur.name,
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: close => {
            const nom = body.querySelector("#e-vn").value.trim();
            if (!nom) return MNUI.toast("Le nom est obligatoire", "err");

            const g = s => body.querySelector(s).value.trim();
            const stats = {};
            PERFS.forEach(p => {
              stats[p.key] = Math.max(0, Math.min(100,
                Math.round(Number(body.querySelector("#e-p-" + p.key).value) || 0)));
            });

            const data = {
              name: nom,
              category: body.querySelector("#e-vc").value,
              image: g("#e-vi"),
              stats,
              carburant: g("#e-vf"),
              places: Math.max(0, Math.min(99, Math.round(Number(g("#e-vp")) || 0))),
              coffre: g("#e-vk"),
              type: g("#e-vt"),
              note: g("#e-vnote")
            };

            if (isNew) {
              data.id = MNStore.uniqueId(nom, draft.vehicles.map(x => x.id));
              draft.vehicles.push(data);
              sel = data.id;
            } else {
              Object.assign(draft.vehicles.find(x => x.id === v.id), data);
            }
            commit();
            close();
            MNUI.toast(isNew ? "Véhicule ajouté" : "Véhicule mis à jour", "ok");
          }
        }
      ]
    });
  }

  async function deleteVehicle(v) {
    const ok = await MNUI.confirm({
      title: "Supprimer le véhicule",
      message: "« " + v.name + " » sera retiré du parc. C'est définitif.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    draft.vehicles = draft.vehicles.filter(x => x.id !== v.id);
    if (sel === v.id) { const f = liste()[0]; sel = f ? f.id : null; }
    commit();
    MNUI.toast("Véhicule supprimé", "ok");
  }

  /** Gestion des catégories, dans une seule fenêtre. */
  function editCats() {
    const body = document.createElement("div");

    const peindre = () => {
      body.innerHTML =
        '<div class="rows" id="c-rows">' + draft.vehicleCats.map((c, i) => {
          const n = draft.vehicles.filter(v => v.category === c.id).length;
          return '<div class="trow" data-c="' + esc(c.id) + '">' +
            '<div class="ord">' +
              '<button data-a="up"' + (i === 0 ? " disabled" : "") + ">" + svg("chevUp") + "</button>" +
              '<button data-a="down"' + (i === draft.vehicleCats.length - 1 ? " disabled" : "") + ">" +
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
        draft.vehicleCats.push({
          id: MNStore.uniqueId(nom, draft.vehicleCats.map(x => x.id)),
          name: nom, icon: "i-wheels-car"
        });
        commit(); peindre();
      });

      body.querySelectorAll("[data-c]").forEach(row => {
        const c = draft.vehicleCats.find(x => x.id === row.dataset.c);
        row.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => {
          const a = b.dataset.a;
          if (a === "up" || a === "down") {
            const i = draft.vehicleCats.indexOf(c), j = i + (a === "up" ? -1 : 1);
            if (j < 0 || j >= draft.vehicleCats.length) return;
            draft.vehicleCats.splice(j, 0, draft.vehicleCats.splice(i, 1)[0]);
            commit(); peindre();
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
            c.name = n;
            c.icon = body.querySelector("#c-i").value.trim() || "i-wheels-car";
            commit(); k(); apres();
          }
        }
      ]
    });
  }

  async function supprimerCat(c, apres) {
    if (draft.vehicleCats.length <= 1) {
      return MNUI.toast("Il faut au moins une catégorie", "err");
    }
    const n = draft.vehicles.filter(v => v.category === c.id).length;
    const repli = draft.vehicleCats.find(x => x.id !== c.id);
    const ok = await MNUI.confirm({
      title: "Supprimer la catégorie",
      message: "« " + c.name + " » sera supprimée" +
        (n ? " : ses " + n + " véhicule" + (n > 1 ? "s passeront" : " passera") +
          " dans « " + repli.name + " »." : "."),
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    draft.vehicles.forEach(v => { if (v.category === c.id) v.category = repli.id; });
    draft.vehicleCats = draft.vehicleCats.filter(x => x.id !== c.id);
    commit(); apres();
  }
})();
