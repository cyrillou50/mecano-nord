/* ==========================================================================
   Panneau administratif : objets, catégories, ressources, employés,
   réglages du site et publication en ligne.

   Tout est modifié dans un brouillon local, puis envoyé sur GitHub d'un clic.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc, num = MNUI.num;
  const K_STAMP = "mn.gh.stamp";

  const K_AUTO = "mn.gh.auto";
  const AUTO_DELAY = 4000;      // on regroupe les modifs pour éviter 1 commit par clic

  let draft = null;
  let tab = "items";
  let filter = "";
  let publishing = false;
  let autoTimer = null;

  MNUI.start({ page: "admin", title: "Panneau admin", onReady: init });

  /* ---- Démarrage ---------------------------------------------------------- */

  function init() {
    if (!MNAuth.canAny("items", "users", "publish", "admin")) return denied();
    draft = MNStore.clone(MNStore.catalog());
    tab = firstAllowedTab();
    render();
  }

  function denied() {
    const s = MNAuth.session();
    $("#admin-root").innerHTML =
      '<div class="denied"><div class="denied__in">' +
        svg("lock") +
        "<h2>Accès refusé</h2>" +
        "<p>Salut <b>" + esc(s.pseudo) + "</b> — ton compte (" + esc(s.role) + ") n'a pas les droits " +
        "pour ouvrir le panneau administratif. Demande à un responsable de te les donner.</p>" +
        '<a class="btn btn--primary" href="index.html">Retour à la facturation</a>' +
      "</div></div>";
  }

  const TABS = [
    { id: "items",   name: "Objets",     icon: "box",      perm: "items", n: () => draft.items.length },
    { id: "cats",    name: "Catégories", icon: "layers",   perm: "items", n: () => draft.categories.length },
    { id: "res",     name: "Ressources", icon: "cube",     perm: "items", n: () => draft.resources.length },
    { id: "images",  name: "Images",     icon: "file",     perm: "items" },
    { id: "users",   name: "Employés",   icon: "users",    perm: "users", n: () => draft.users.length },
    { id: "roles",   name: "Rôles",      icon: "tag",      perm: "users", n: () => draft.roles.length },
    { id: "discord", name: "Discord",    icon: "cloud",    perm: "admin" },
    { id: "site",    name: "Le site",    icon: "settings", perm: "admin" },
    { id: "publish", name: "Publier",    icon: "github",   perm: "publish" }
  ];

  const allowed = () => TABS.filter(t => MNAuth.can(t.perm));
  const firstAllowedTab = () => (allowed()[0] || { id: "items" }).id;

  /* ---- Enregistrement du brouillon ----------------------------------------- */

  function commit() {
    draft = MNStore.saveDraft(draft);
    MNAuth.refresh();
    queueAutoPublish();
    render();
  }

  /* ---- Publication automatique ---------------------------------------------- */

  const autoReady = () =>
    localStorage.getItem(K_AUTO) === "1" && MNAuth.can("publish") &&
    MNGitHub.hasToken() && MNGitHub.isConfigured();

  /** Replanifie un envoi : chaque nouvelle modif repousse le départ. */
  function queueAutoPublish() {
    clearTimeout(autoTimer);
    if (!autoReady()) return;
    autoTimer = setTimeout(() => publishNow(true), AUTO_DELAY);
  }

  /* ---- Rendu général -------------------------------------------------------- */

  function render() {
    renderDraftbar();
    $("#admin-root").innerHTML =
      '<div class="wrap admin">' +
        '<nav class="tabs" id="tabs"></nav>' +
        '<div class="pane" id="pane"></div>' +
      "</div>";

    const nav = $("#tabs");
    nav.innerHTML = allowed().map(t =>
      '<button class="tab' + (t.id === tab ? " is-active" : "") + '" data-tab="' + t.id + '">' +
        svg(t.icon) + "<span>" + t.name + "</span>" +
        (t.n ? '<span class="tab__n">' + t.n() + "</span>" : "") +
      "</button>"
    ).join("");
    nav.querySelectorAll("[data-tab]").forEach(b =>
      b.addEventListener("click", () => { tab = b.dataset.tab; filter = ""; render(); }));

    ({
      items: paneItems, cats: paneCats, res: paneRes, images: paneImages,
      users: paneUsers, roles: paneRoles, discord: paneDiscord,
      site: paneSite, publish: panePublish
    }[tab] || paneItems)($("#pane"));
  }

  function renderDraftbar() {
    const bar = $("#draftbar");
    const stamp = localStorage.getItem(K_STAMP);
    const dirty = MNStore.hasDraft();
    const sent = dirty && stamp && stamp === draft.updatedAt;

    if (!dirty) { bar.hidden = true; return; }
    bar.hidden = false;

    if (publishing) {
      bar.innerHTML =
        '<span class="draftbar__dot" style="background:var(--pink);box-shadow:0 0 12px var(--pink)"></span>' +
        '<div class="draftbar__txt"><b>Envoi vers GitHub…</b></div>';
      return;
    }

    if (sent) {
      const last = MNGitHub.lastPublish();
      bar.innerHTML =
        '<span class="draftbar__dot" style="background:var(--toxic);box-shadow:0 0 12px var(--toxic)"></span>' +
        '<div class="draftbar__txt"><b>Publié' + (last && last.commit ? " (" + esc(last.commit) + ")" : "") + ".</b> " +
        "<span>GitHub met le site en ligne, compte ~1 minute. Cette bannière disparaîtra toute seule.</span></div>" +
        '<button class="btn btn--ghost btn--sm" id="db-reload">' + svg("refresh") + "<span>Vérifier</span></button>";
      const r = $("#db-reload");
      if (r) r.addEventListener("click", () => location.reload());
      return;
    }

    const auto = autoReady();
    bar.innerHTML =
      '<span class="draftbar__dot"></span>' +
      '<div class="draftbar__txt"><b>Modifications non publiées.</b> ' +
        "<span>" + (auto
          ? "Envoi automatique dans quelques secondes."
          : "Elles ne sont visibles que par toi tant que tu n'as pas publié.") + "</span></div>" +
      '<button class="btn btn--ghost btn--sm" id="db-discard">' + svg("trash") + "<span>Annuler</span></button>" +
      (MNAuth.can("publish")
        ? '<button class="btn btn--solid btn--sm" id="db-publish">' + svg("cloud") +
          "<span>" + (auto ? "Publier maintenant" : "Publier") + "</span></button>"
        : "");

    $("#db-discard").addEventListener("click", async () => {
      const ok = await MNUI.confirm({
        title: "Annuler les modifications",
        message: "Tout ce que tu as changé depuis la dernière publication sera perdu.",
        confirmLabel: "Tout annuler", danger: true
      });
      if (!ok) return;
      MNStore.discardDraft();
      localStorage.removeItem(K_STAMP);
      draft = MNStore.clone(MNStore.catalog());
      MNAuth.refresh();
      render();
      MNUI.toast("Modifications annulées", "ok");
    });

    const pb = $("#db-publish");
    if (pb) pb.addEventListener("click", () => publishNow(false));
  }

  /* =========================================================================
     OBJETS
     ========================================================================= */

  function paneItems(host) {
    const cats = draft.categories;
    const f = filter.toLowerCase();
    const list = draft.items.filter(i => !f || i.name.toLowerCase().indexOf(f) !== -1);

    host.innerHTML =
      '<div class="toolbar">' +
        '<input class="input" id="f-search" placeholder="Filtrer les objets…" value="' + esc(filter) + '">' +
        '<button class="btn btn--primary" id="add">' + svg("plus") + "<span>Nouvel objet</span></button>" +
      "</div>" +
      (list.length
        ? cats.map(c => {
            const items = list.filter(i => i.category === c.id);
            if (!items.length) return "";
            return '<div><h3 class="section-title">' + esc(c.name) +
              '<span class="count">' + items.length + "</span></h3>" +
              '<div class="rows">' + items.map(it => itemRow(it, c)).join("") + "</div></div>";
          }).join("")
        : '<div class="empty">' + svg("box") + "<b>Aucun objet</b><p>Clique sur « Nouvel objet » pour commencer.</p></div>");

    const s = $("#f-search");
    s.addEventListener("input", () => {
      filter = s.value;
      const pos = s.selectionStart;
      paneItems(host);
      const ns = $("#f-search"); ns.focus(); ns.setSelectionRange(pos, pos);
    });
    $("#add").addEventListener("click", () => editItem(null));

    host.querySelectorAll("[data-row]").forEach(row => {
      const id = row.dataset.row;
      row.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => {
        const it = draft.items.find(x => x.id === id);
        if (!it) return;
        const a = b.dataset.a;
        if (a === "edit") return editItem(it);
        if (a === "dup") return duplicateItem(it);
        if (a === "del") return deleteItem(it);
        if (a === "up" || a === "down") return moveInArray(draft.items, id, a === "up" ? -1 : 1);
        if (a === "toggle") { it.enabled = !it.enabled; commit(); }
      }));
    });
  }

  function itemRow(it, cat) {
    const idx = draft.items.indexOf(it);
    const chips = Object.keys(it.cost).map(rid => {
      const r = MNStore.resourceById(rid) || draft.resources.find(x => x.id === rid);
      return r ? "<em>" + esc(r.name) + " ×" + num(it.cost[rid]) + "</em>" : "";
    }).join("");

    return '<div class="trow' + (it.enabled ? "" : " is-off") + '" data-row="' + esc(it.id) + '">' +
      '<div class="ord">' +
        '<button data-a="up"' + (idx === 0 ? " disabled" : "") + ' aria-label="Monter">' + svg("chevUp") + "</button>" +
        '<button data-a="down"' + (idx === draft.items.length - 1 ? " disabled" : "") + ' aria-label="Descendre">' + svg("chevDown") + "</button>" +
      "</div>" +
      '<div class="trow__ico">' + mnIcon(it.icon) + "</div>" +
      '<div class="trow__main">' +
        "<b>" + esc(it.name) + (it.enabled ? "" : " <span class=\"pill pill--dim\">masqué</span>") + "</b>" +
        '<div class="trow__meta"><i>' + esc(cat ? cat.name : "?") + "</i>" +
          (it.max > 0 ? '<span class="permtag">max ' + it.max + " / BT</span>" : "") +
          (it.excludes.length
            ? '<span class="permtag">✕ ' + it.excludes.length + " incompatibilité" +
              (it.excludes.length > 1 ? "s" : "") + "</span>"
            : "") +
          (chips || '<i style="color:var(--amber)">aucune ressource définie</i>') + "</div>" +
      "</div>" +
      '<div class="trow__acts">' +
        '<button class="btn btn--icon" data-a="toggle" title="' + (it.enabled ? "Masquer" : "Afficher") + '">' +
          svg(it.enabled ? "check" : "x") + "</button>" +
        '<button class="btn btn--icon" data-a="dup" title="Dupliquer">' + svg("copy") + "</button>" +
        '<button class="btn btn--icon" data-a="edit" title="Modifier">' + svg("edit") + "</button>" +
        '<button class="btn btn--icon" data-a="del" title="Supprimer">' + svg("trash") + "</button>" +
      "</div>" +
    "</div>";
  }

  function moveInArray(arr, id, dir) {
    const i = arr.findIndex(x => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    arr.splice(j, 0, arr.splice(i, 1)[0]);
    commit();
  }

  function duplicateItem(it) {
    const copy = MNStore.clone(it);
    copy.id = MNStore.uniqueId(it.id, draft.items.map(x => x.id));
    copy.name = it.name + " (copie)";
    draft.items.splice(draft.items.indexOf(it) + 1, 0, copy);
    commit();
    MNUI.toast("Objet dupliqué", "ok");
  }

  async function deleteItem(it) {
    const ok = await MNUI.confirm({
      title: "Supprimer l'objet",
      message: "« " + it.name + " » sera retiré du catalogue.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    draft.items = draft.items.filter(x => x.id !== it.id);
    commit();
    MNUI.toast("Objet supprimé", "ok");
  }

  /** Fenêtre de création / modification d'un objet. */
  function editItem(it) {
    const isNew = !it;
    const cur = it ? MNStore.clone(it) : {
      id: "", name: "", category: draft.categories[0].id, icon: "i-box",
      enabled: true, note: "", max: 0, excludes: [], cost: {}
    };

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="e-name">Nom de l\'objet</label>' +
          '<input class="input" id="e-name" maxlength="60" value="' + esc(cur.name) + '" placeholder="Ex. Kit Phares Xénon"></div>' +
        '<div class="field"><label class="label" for="e-cat">Catégorie</label>' +
          '<select class="select" id="e-cat">' + draft.categories.map(c =>
            '<option value="' + esc(c.id) + '"' + (c.id === cur.category ? " selected" : "") + ">" + esc(c.name) + "</option>"
          ).join("") + "</select></div>" +
      "</div>" +

      '<div class="field"><label class="label">Icône</label>' +
        '<div class="iconpick">' +
          '<div class="iconpick__preview" id="e-ico-prev">' + mnIcon(cur.icon) + "</div>" +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
            '<input class="input" id="e-ico" value="' + esc(cur.icon) + '" placeholder="Identifiant d\'icône, emoji ou URL d\'image">' +
            '<button class="btn btn--ghost btn--sm" id="e-ico-pick" type="button">Choisir dans la bibliothèque</button>' +
          "</div>" +
        "</div>" +
      "</div>" +

      '<div class="fieldset"><span class="label">Ressources nécessaires (pour 1 unité)</span>' +
        '<div class="costs" id="e-costs"></div>' +
        '<button class="btn btn--ghost btn--sm" id="e-cost-add" type="button" style="margin-top:10px">' +
          svg("plus") + "<span>Ajouter une ressource</span></button>" +
      "</div>" +

      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="e-note">Note (facultatif)</label>' +
          '<input class="input" id="e-note" maxlength="90" value="' + esc(cur.note) + '" placeholder="Précision affichée sous le nom"></div>' +
        '<div class="field"><label class="label" for="e-max">Quantité maximum par BT</label>' +
          '<input class="input input--num" id="e-max" type="number" min="0" max="999" value="' + Number(cur.max || 0) + '">' +
          '<p class="hint"><b>0 = illimité.</b> Mettre 2 empêche d\'en prendre plus de 2 sur un même bon de travail.</p></div>' +
      "</div>" +

      '<div class="fieldset"><span class="label">Objets incompatibles</span>' +
        '<p class="hint" style="margin-bottom:10px">Coche les objets qui ne peuvent pas figurer sur le ' +
          "même bon de travail que celui-ci. En choisir un bloquera automatiquement les autres, " +
          "dans les deux sens.</p>" +
        '<div class="iconlist" id="e-excl" style="grid-template-columns:1fr;max-height:190px;gap:2px"></div>' +
      "</div>" +

      '<label class="switch"><input type="checkbox" id="e-on"' + (cur.enabled ? " checked" : "") + ">" +
        '<span class="switch__box"></span><span>Visible sur la page de facturation</span></label>';

    const costsHost = body.querySelector("#e-costs");
    const rows = Object.keys(cur.cost).map(rid => ({ rid, qty: cur.cost[rid] }));
    if (!rows.length) rows.push({ rid: draft.resources.length ? draft.resources[0].id : "", qty: 0 });

    function paintCosts() {
      if (!draft.resources.length) {
        costsHost.innerHTML = '<p class="hint hint--warn">Aucune ressource n\'existe encore. ' +
          "Crée-les dans l'onglet « Ressources ».</p>";
        return;
      }
      costsHost.innerHTML = rows.map((r, i) =>
        '<div class="cost" data-i="' + i + '">' +
          '<select class="select" data-k="rid">' + draft.resources.map(x =>
            '<option value="' + esc(x.id) + '"' + (x.id === r.rid ? " selected" : "") + ">" + esc(x.name) + "</option>"
          ).join("") + "</select>" +
          '<input class="input input--num" type="number" min="0" max="99999" data-k="qty" value="' + Number(r.qty) + '">' +
          '<button class="btn btn--icon" data-k="del" type="button" aria-label="Retirer">' + svg("x") + "</button>" +
        "</div>"
      ).join("");

      costsHost.querySelectorAll(".cost").forEach(row => {
        const i = Number(row.dataset.i);
        row.querySelector('[data-k="rid"]').addEventListener("change", e => { rows[i].rid = e.target.value; });
        row.querySelector('[data-k="qty"]').addEventListener("input", e => { rows[i].qty = e.target.value; });
        row.querySelector('[data-k="del"]').addEventListener("click", () => { rows.splice(i, 1); paintCosts(); });
      });
    }
    paintCosts();

    body.querySelector("#e-cost-add").addEventListener("click", () => {
      if (!draft.resources.length) return;
      const used = rows.map(r => r.rid);
      const free = draft.resources.find(r => used.indexOf(r.id) === -1) || draft.resources[0];
      rows.push({ rid: free.id, qty: 0 });
      paintCosts();
    });

    /* Incompatibilités : liste des autres objets, cochables. */
    let excl = (cur.excludes || []).slice();
    const exclHost = body.querySelector("#e-excl");
    function paintExcl() {
      const autres = draft.items.filter(x => x.id !== cur.id);
      if (!autres.length) {
        exclHost.innerHTML = '<p class="hint" style="padding:8px">Aucun autre objet au catalogue.</p>';
        return;
      }
      exclHost.innerHTML = autres.map(x => {
        const on = excl.indexOf(x.id) !== -1;
        /* Incompatibilité déclarée depuis l'autre objet : on l'indique. */
        const inverse = (x.excludes || []).indexOf(cur.id) !== -1;
        return '<label class="perm' + (on || inverse ? " is-on" : "") + (inverse ? " is-locked" : "") +
          '" data-x="' + esc(x.id) + '" style="padding:7px 10px">' +
          '<span class="perm__box">' + svg("check") + "</span>" +
          '<span class="perm__txt"><b>' + esc(x.name) + "</b>" +
            (inverse ? "<span>déclaré depuis « " + esc(x.name) + " »</span>" : "") + "</span></label>";
      }).join("");

      exclHost.querySelectorAll("[data-x]").forEach(l => l.addEventListener("click", () => {
        if (l.classList.contains("is-locked")) {
          return MNUI.toast("À décocher depuis la fiche de l'autre objet", "info");
        }
        const id = l.dataset.x;
        const i = excl.indexOf(id);
        if (i === -1) excl.push(id); else excl.splice(i, 1);
        paintExcl();
      }));
    }
    paintExcl();

    const icoInput = body.querySelector("#e-ico");
    const icoPrev = body.querySelector("#e-ico-prev");
    icoInput.addEventListener("input", () => { icoPrev.innerHTML = mnIcon(icoInput.value.trim()); });
    body.querySelector("#e-ico-pick").addEventListener("click", () =>
      pickIcon(icoInput.value, v => { icoInput.value = v; icoPrev.innerHTML = mnIcon(v); }));

    MNUI.modal({
      title: isNew ? "Nouvel objet" : "Modifier l'objet",
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: isNew ? "Créer" : "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: close => {
            const name = body.querySelector("#e-name").value.trim();
            if (!name) return MNUI.toast("Donne un nom à l'objet", "err");

            const cost = {};
            rows.forEach(r => {
              const q = Math.max(0, Math.round(Number(r.qty) || 0));
              if (r.rid && q > 0) cost[r.rid] = (cost[r.rid] || 0) + q;
            });

            const data = {
              name,
              category: body.querySelector("#e-cat").value,
              icon: body.querySelector("#e-ico").value.trim() || "i-box",
              note: body.querySelector("#e-note").value.trim(),
              max: Math.max(0, Math.min(999, Math.round(Number(body.querySelector("#e-max").value) || 0))),
              enabled: body.querySelector("#e-on").checked,
              excludes: excl,
              cost
            };

            if (isNew) {
              data.id = MNStore.uniqueId(name, draft.items.map(x => x.id));
              draft.items.push(data);
            } else {
              Object.assign(draft.items.find(x => x.id === it.id), data);
            }
            commit();
            close();
            MNUI.toast(isNew ? "Objet créé" : "Objet mis à jour", "ok");
          }
        }
      ]
    });
  }

  /* =========================================================================
     ICÔNES : bibliothèque intégrée, dossier assets/img/, import
     ========================================================================= */

  const IMG_DIR = "assets/img";
  const IMG_RE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
  const ICON_PX = 128;                 // gabarit unique de toutes les images
  let imgCache = null;

  const isData = v => /^data:image/i.test(v);
  const weight = v => Math.round(v.length * 0.75 / 1024);

  /**
   * Met une image au gabarit : on retire les marges transparentes, puis on
   * centre le motif dans un carré de ICON_PX. Résultat : toutes les icônes
   * pèsent visuellement pareil, quelle que soit l'image de départ.
   */
  function normalizeImage(img, size) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("dimensions inconnues");

    /* 1. copie de travail (plafonnée) pour analyser les pixels */
    const cap = 512;
    const k = Math.min(cap / w, cap / h, 1);
    const sw = Math.max(1, Math.round(w * k));
    const sh = Math.max(1, Math.round(h * k));
    const src = document.createElement("canvas");
    src.width = sw; src.height = sh;
    const sctx = src.getContext("2d");
    sctx.drawImage(img, 0, 0, sw, sh);

    /* 2. boîte englobante des pixels réellement visibles */
    let x0 = 0, y0 = 0, x1 = sw - 1, y1 = sh - 1;
    try {
      const d = sctx.getImageData(0, 0, sw, sh).data;
      let minX = sw, minY = sh, maxX = -1, maxY = -1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (d[(y * sw + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) { x0 = minX; y0 = minY; x1 = maxX; y1 = maxY; }
    } catch (_) { /* canvas protégé : on garde l'image entière */ }

    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

    /* 3. mise à l'échelle dans le carré, avec une marge de respiration */
    const pad = Math.round(size * 0.05);
    const box = size - pad * 2;
    const s = Math.min(box / cw, box / ch);
    const dw = Math.max(1, Math.round(cw * s));
    const dh = Math.max(1, Math.round(ch * s));

    const out = document.createElement("canvas");
    out.width = size; out.height = size;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, x0, y0, cw, ch, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);
    return out.toDataURL("image/png");
  }

  function fileToIcon(file, done) {
    if (!/^image\//.test(file.type)) return MNUI.toast("Ce fichier n'est pas une image", "err");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try { done(normalizeImage(img, ICON_PX)); }
      catch (_) { MNUI.toast("Image impossible à convertir", "err"); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); MNUI.toast("Image illisible", "err"); };
    img.src = url;
  }

  /**
   * Liste les images de assets/img/.
   * Avec un jeton GitHub on lit le dépôt (toujours exact) ; sinon on retombe
   * sur le manifeste assets/img/index.json, tenu à jour à chaque dépôt.
   */
  async function listRepoImages(force) {
    if (imgCache && !force) return imgCache;
    let names = [], source = "none";

    if (MNGitHub.hasToken() && MNGitHub.isConfigured()) {
      try {
        const files = await MNGitHub.listDir(IMG_DIR);
        names = files.filter(f => f.type === "file" && IMG_RE.test(f.name)).map(f => f.name);
        source = "github";
      } catch (_) { /* on tentera le manifeste */ }
    }
    if (source !== "github") {
      try {
        const r = await fetch(IMG_DIR + "/index.json?v=" + Date.now(), { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          names = (Array.isArray(j) ? j : j.images || []).filter(n => IMG_RE.test(n));
          source = "manifest";
        }
      } catch (_) { /* rien de listable */ }
    }
    names.sort((a, b) => a.localeCompare(b, "fr"));
    imgCache = { names, source };
    return imgCache;
  }

  /** Demande un nom de fichier avant dépôt dans le dépôt GitHub. */
  function askFileName(suggested) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const body = document.createElement("div");
      body.innerHTML =
        '<div class="field"><label class="label" for="fn">Nom du fichier</label>' +
          '<input class="input" id="fn" value="' + esc(suggested) + '" maxlength="48"></div>' +
        '<p class="hint" style="margin-top:10px">L\'image sera déposée dans <code>' + IMG_DIR +
          "/</code> puis référencée par son chemin : le fichier de données reste léger " +
          "et l'image apparaît dans la liste pour toute l'équipe.</p>";
      MNUI.modal({
        title: "Déposer l'image dans le dépôt", body,
        onClose: () => finish(null),
        actions: [
          { label: "Annuler", variant: "btn--ghost", onClick: c => { finish(null); c(); } },
          {
            label: "Déposer", variant: "btn--primary", icon: "upload",
            onClick: c => {
              const raw = body.querySelector("#fn").value.replace(/\.[a-z0-9]+$/i, "");
              finish(MNStore.slugify(raw) + ".png");
              c();
            }
          }
        ]
      });
    });
  }

  /** Dépose l'image dans le dépôt et met à jour le manifeste. */
  async function uploadToRepo(dataUri, suggested) {
    const name = await askFileName(suggested);
    if (!name) return null;
    const path = IMG_DIR + "/" + name;
    await MNGitHub.uploadImage(path, dataUri, "Ajout de l'image " + name + " depuis le panneau admin");
    try {
      const fresh = await listRepoImages(true);
      await MNGitHub.putText(IMG_DIR + "/index.json",
        JSON.stringify(fresh.names, null, 2) + "\n",
        "Mise à jour de la liste des images");
    } catch (_) { /* le manifeste n'est qu'un confort, pas bloquant */ }
    return path;
  }

  function pickIcon(current, cb) {
    let sel = current || "i-box";

    const body = document.createElement("div");
    body.innerHTML =
      '<div class="iconpick" style="margin-bottom:20px">' +
        '<div class="iconpick__preview" id="k-prev">' + mnIcon(sel) + "</div>" +
        '<div style="flex:1;min-width:0">' +
          '<span class="label" style="display:block;margin-bottom:5px">Sélection</span>' +
          '<p class="hint mono" id="k-val"></p>' +
        "</div>" +
      "</div>" +

      '<div class="fieldset" style="margin-bottom:16px">' +
        '<div class="row row--wrap" style="margin-bottom:12px">' +
          '<span class="label" style="flex:1">Tes images — dossier ' + IMG_DIR + "/</span>" +
          '<button class="btn btn--ghost btn--sm" type="button" id="k-refresh">' + svg("refresh") +
            "<span>Actualiser</span></button>" +
          '<button class="btn btn--primary btn--sm" type="button" id="k-up">' + svg("upload") +
            "<span>Ajouter une image</span></button>" +
          '<input type="file" id="k-file" accept="image/*" hidden>' +
        "</div>" +
        '<div id="k-imgs"><p class="hint">Lecture du dossier…</p></div>' +
      "</div>" +

      Object.keys(MN_ICON_GROUPS).map(g =>
        '<div style="margin-bottom:16px"><span class="label" style="display:block;margin-bottom:8px">' +
        esc(g) + "</span>" +
        '<div class="iconlist">' + MN_ICON_GROUPS[g].map(id =>
          '<button type="button" data-ico="' + id + '" title="' + id + '">' + mnIcon(id) + "</button>"
        ).join("") + "</div></div>"
      ).join("") +

      '<div class="field"><label class="label" for="k-url">Autre : adresse d\'image ou emoji</label>' +
        '<input class="input" id="k-url" placeholder="https://exemple.com/turbo.png  ·  🔧"' +
          (isData(sel) || /^[ir]-/.test(sel) ? "" : ' value="' + esc(sel) + '"') + "></div>";

    const prev = body.querySelector("#k-prev");
    const val = body.querySelector("#k-val");
    const url = body.querySelector("#k-url");
    const imgs = body.querySelector("#k-imgs");

    function setSel(v, silent) {
      sel = v || "i-box";
      prev.innerHTML = mnIcon(sel);
      val.textContent = isData(sel) ? "Image intégrée (" + weight(sel) + " ko)" : sel;
      val.classList.toggle("hint--warn", isData(sel) && weight(sel) > 60);
      body.querySelectorAll("[data-ico]").forEach(b => b.classList.toggle("is-on", b.dataset.ico === sel));
      body.querySelectorAll("[data-img]").forEach(b => b.classList.toggle("is-on", b.dataset.img === sel));
      if (!silent) url.value = (isData(sel) || /^[ir]-/.test(sel) || sel.indexOf(IMG_DIR) === 0) ? "" : sel;
    }
    setSel(sel, true);

    /* --- grille des images du dossier --- */
    async function paintImages(force) {
      imgs.innerHTML = '<p class="hint">Lecture du dossier…</p>';
      const { names, source } = await listRepoImages(force);

      if (!names.length) {
        imgs.innerHTML = '<p class="hint">Aucune image trouvée. Clique sur <b>Ajouter une image</b>, ' +
          "ou dépose tes fichiers dans <code>" + IMG_DIR + "/</code> sur GitHub." +
          (MNGitHub.hasToken() ? "" : " (Configure le jeton GitHub dans l'onglet « Publier » " +
            "pour que la liste se mette à jour toute seule.)") + "</p>";
        return;
      }

      imgs.innerHTML =
        '<div class="iconlist" style="grid-template-columns:repeat(auto-fill,minmax(62px,1fr));max-height:240px">' +
          names.map(n => {
            const p = IMG_DIR + "/" + n;
            return '<button type="button" data-img="' + esc(p) + '" title="' + esc(n) + '"' +
              (p === sel ? ' class="is-on"' : "") + '><img src="' + esc(p) + '" alt="" loading="lazy"></button>';
          }).join("") +
        "</div>" +
        '<p class="hint" style="margin-top:9px">' + names.length + " image" + (names.length > 1 ? "s" : "") +
          (source === "github" ? " — lues directement dans le dépôt." : " — d'après le manifeste du dossier.") +
        "</p>";

      imgs.querySelectorAll("[data-img]").forEach(b =>
        b.addEventListener("click", () => setSel(b.dataset.img)));
    }
    paintImages(false);

    body.querySelector("#k-refresh").addEventListener("click", () => paintImages(true));

    body.querySelectorAll("[data-ico]").forEach(b =>
      b.addEventListener("click", () => setSel(b.dataset.ico)));

    url.addEventListener("input", () => setSel(url.value.trim() || "i-box", true));

    /* --- ajout d'une image --- */
    body.querySelector("#k-up").addEventListener("click", () => body.querySelector("#k-file").click());
    body.querySelector("#k-file").addEventListener("change", e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;

      fileToIcon(f, async data => {
        const canUpload = MNGitHub.hasToken() && MNGitHub.isConfigured() && MNAuth.can("publish");
        if (!canUpload) {
          setSel(data, true);
          MNUI.toast("Image mise au gabarit et intégrée aux données (" + weight(data) + " ko)", "ok");
          return;
        }
        try {
          const path = await uploadToRepo(data, f.name);
          if (!path) { setSel(data, true); return; }   // dépôt annulé → on intègre
          imgCache = null;
          await paintImages(true);
          setSel(path, true);
          MNUI.toast("Image déposée dans " + path, "ok");
        } catch (err2) {
          setSel(data, true);
          MNUI.toast("Dépôt impossible (" + err2.message + ") — image intégrée aux données", "err");
        }
      });
    });

    MNUI.modal({
      title: "Choisir une icône", body, wide: true,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Utiliser cette icône", variant: "btn--primary", icon: "check",
          onClick: c => { cb(sel); c(); }
        }
      ]
    });
  }

  /* =========================================================================
     CATÉGORIES
     ========================================================================= */

  function paneCats(host) {
    host.innerHTML =
      '<div class="toolbar">' +
        '<span class="subtitle">Ordre d\'affichage sur la page de facturation</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--primary" id="add">' + svg("plus") + "<span>Nouvelle catégorie</span></button>" +
      "</div>" +
      '<div class="rows">' + draft.categories.map((c, i) => {
        const n = draft.items.filter(x => x.category === c.id).length;
        return '<div class="trow" data-row="' + esc(c.id) + '">' +
          '<div class="ord">' +
            '<button data-a="up"' + (i === 0 ? " disabled" : "") + ">" + svg("chevUp") + "</button>" +
            '<button data-a="down"' + (i === draft.categories.length - 1 ? " disabled" : "") + ">" + svg("chevDown") + "</button>" +
          "</div>" +
          '<div class="trow__ico">' + mnIcon(c.icon) + "</div>" +
          '<div class="trow__main"><b>' + esc(c.name) + "</b>" +
            '<div class="trow__meta"><i>' + n + " objet" + (n > 1 ? "s" : "") + "</i></div></div>" +
          '<div class="trow__acts">' +
            '<button class="btn btn--icon" data-a="edit" title="Modifier">' + svg("edit") + "</button>" +
            '<button class="btn btn--icon" data-a="del" title="Supprimer">' + svg("trash") + "</button>" +
          "</div></div>";
      }).join("") + "</div>";

    $("#add").addEventListener("click", () => editCat(null));
    bindRows(host, draft.categories, {
      edit: c => editCat(c),
      del: c => deleteCat(c)
    });
  }

  function editCat(c) {
    const isNew = !c;
    const cur = c || { name: "", icon: "i-box" };
    simpleEditor({
      title: isNew ? "Nouvelle catégorie" : "Modifier la catégorie",
      name: cur.name, icon: cur.icon,
      placeholder: "Ex. Pneumatique",
      onSave: (name, icon, close) => {
        if (isNew) draft.categories.push({ id: MNStore.uniqueId(name, draft.categories.map(x => x.id)), name, icon });
        else { c.name = name; c.icon = icon; }
        commit(); close();
        MNUI.toast(isNew ? "Catégorie créée" : "Catégorie mise à jour", "ok");
      }
    });
  }

  async function deleteCat(c) {
    if (draft.categories.length <= 1) return MNUI.toast("Il faut au moins une catégorie", "err");
    const n = draft.items.filter(x => x.category === c.id).length;
    const ok = await MNUI.confirm({
      title: "Supprimer la catégorie",
      message: n
        ? "« " + c.name + " » contient " + n + " objet" + (n > 1 ? "s" : "") +
          ". Ils seront déplacés dans « " + draft.categories.find(x => x.id !== c.id).name + " »."
        : "« " + c.name + " » sera supprimée.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    const fallback = draft.categories.find(x => x.id !== c.id).id;
    draft.items.forEach(i => { if (i.category === c.id) i.category = fallback; });
    draft.categories = draft.categories.filter(x => x.id !== c.id);
    commit();
    MNUI.toast("Catégorie supprimée", "ok");
  }

  /* =========================================================================
     RESSOURCES
     ========================================================================= */

  function paneRes(host) {
    host.innerHTML =
      '<div class="toolbar">' +
        '<span class="subtitle">Matières premières utilisées par les objets</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--primary" id="add">' + svg("plus") + "<span>Nouvelle ressource</span></button>" +
      "</div>" +
      (draft.resources.length
        ? '<div class="rows">' + draft.resources.map((r, i) => {
            const used = draft.items.filter(x => x.cost[r.id]).length;
            return '<div class="trow" data-row="' + esc(r.id) + '">' +
              '<div class="ord">' +
                '<button data-a="up"' + (i === 0 ? " disabled" : "") + ">" + svg("chevUp") + "</button>" +
                '<button data-a="down"' + (i === draft.resources.length - 1 ? " disabled" : "") + ">" + svg("chevDown") + "</button>" +
              "</div>" +
              '<div class="trow__ico" style="color:' + esc(r.color) + '">' + mnIcon(r.icon) + "</div>" +
              '<div class="trow__main"><b>' + esc(r.name) + "</b>" +
                '<div class="trow__meta"><i class="mono">' + esc(r.id) + "</i>" +
                "<em>" + used + " objet" + (used > 1 ? "s" : "") + "</em></div></div>" +
              '<div class="trow__acts">' +
                '<button class="btn btn--icon" data-a="edit" title="Modifier">' + svg("edit") + "</button>" +
                '<button class="btn btn--icon" data-a="del" title="Supprimer">' + svg("trash") + "</button>" +
              "</div></div>";
          }).join("") + "</div>"
        : '<div class="empty">' + svg("cube") + "<b>Aucune ressource</b>" +
          "<p>Crée d'abord tes matières premières (plastique, métal…), tu pourras ensuite les affecter aux objets.</p></div>");

    $("#add").addEventListener("click", () => editRes(null));
    bindRows(host, draft.resources, { edit: r => editRes(r), del: r => deleteRes(r) });
  }

  function editRes(r) {
    const isNew = !r;
    const cur = r || { name: "", icon: "r-metal", color: "#9fb0c4" };
    simpleEditor({
      title: isNew ? "Nouvelle ressource" : "Modifier la ressource",
      name: cur.name, icon: cur.icon, color: cur.color,
      placeholder: "Ex. Plastiques",
      onSave: (name, icon, close, color) => {
        if (isNew) draft.resources.push({ id: MNStore.uniqueId(name, draft.resources.map(x => x.id)), name, icon, color });
        else { r.name = name; r.icon = icon; r.color = color; }
        commit(); close();
        MNUI.toast(isNew ? "Ressource créée" : "Ressource mise à jour", "ok");
      }
    });
  }

  async function deleteRes(r) {
    const used = draft.items.filter(x => x.cost[r.id]);
    const ok = await MNUI.confirm({
      title: "Supprimer la ressource",
      message: used.length
        ? "« " + r.name + " » est utilisée par " + used.length + " objet" + (used.length > 1 ? "s" : "") +
          ". Elle sera retirée de leur coût."
        : "« " + r.name + " » sera supprimée.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    draft.items.forEach(i => { delete i.cost[r.id]; });
    draft.resources = draft.resources.filter(x => x.id !== r.id);
    commit();
    MNUI.toast("Ressource supprimée", "ok");
  }

  /* ---- Petit éditeur nom + icône (+ couleur) --------------------------------- */

  function simpleEditor(opt) {
    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="field"><label class="label" for="s-name">Nom</label>' +
        '<input class="input" id="s-name" maxlength="40" value="' + esc(opt.name) + '" placeholder="' + esc(opt.placeholder || "") + '"></div>' +
      '<div class="field"><label class="label">Icône</label>' +
        '<div class="iconpick">' +
          '<div class="iconpick__preview" id="s-prev"' +
            (opt.color ? ' style="color:' + esc(opt.color) + '"' : "") + ">" + mnIcon(opt.icon) + "</div>" +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
            '<input class="input" id="s-ico" value="' + esc(opt.icon) + '">' +
            '<button class="btn btn--ghost btn--sm" id="s-pick" type="button">Choisir dans la bibliothèque</button>' +
          "</div>" +
        "</div></div>" +
      (opt.color !== undefined
        ? '<div class="field"><label class="label" for="s-color">Couleur</label>' +
          '<input class="input" id="s-color" type="color" value="' + esc(opt.color) + '" style="height:44px;padding:5px"></div>'
        : "");

    const prev = body.querySelector("#s-prev");
    const ico = body.querySelector("#s-ico");
    const col = body.querySelector("#s-color");
    ico.addEventListener("input", () => { prev.innerHTML = mnIcon(ico.value.trim()); });
    if (col) col.addEventListener("input", () => { prev.style.color = col.value; });
    body.querySelector("#s-pick").addEventListener("click", () =>
      pickIcon(ico.value, v => { ico.value = v; prev.innerHTML = mnIcon(v); }));

    MNUI.modal({
      title: opt.title, body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: close => {
            const name = body.querySelector("#s-name").value.trim();
            if (!name) return MNUI.toast("Le nom est obligatoire", "err");
            opt.onSave(name, ico.value.trim() || "i-box", close, col ? col.value : undefined);
          }
        }
      ]
    });
  }

  /** Écouteurs communs des lignes (monter / descendre / modifier / supprimer). */
  function bindRows(host, arr, handlers) {
    host.querySelectorAll("[data-row]").forEach(row => {
      const id = row.dataset.row;
      row.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => {
        const obj = arr.find(x => x.id === id);
        if (!obj) return;
        const a = b.dataset.a;
        if (a === "up" || a === "down") return moveInArray(arr, id, a === "up" ? -1 : 1);
        if (handlers[a]) handlers[a](obj);
      }));
    });
  }

  /* =========================================================================
     EMPLOYÉS
     ========================================================================= */

  function paneUsers(host) {
    const me = MNAuth.session();

    host.innerHTML =
      '<div class="toolbar">' +
        '<span class="subtitle">Qui peut se connecter, et avec quels droits — les flèches réordonnent la liste</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--primary" id="add">' + svg("plus") + "<span>Nouvel employé</span></button>" +
      "</div>" +
      (draft.users.length
        ? '<div class="rows">' + draft.users.map(u => userRow(u, me)).join("") + "</div>"
        : '<div class="empty">' + svg("users") + "<b>Aucun employé</b>" +
          "<p>Ajoute les pseudos de ton équipe pour qu'ils puissent se connecter.</p></div>") +
      '<div class="alert alert--info" style="margin-top:6px">' + svg("info") +
        "<span>Le pseudo est la seule chose à retenir. Le code d'accès est facultatif : " +
        "utile pour les comptes qui gèrent le catalogue ou l'équipe. " +
        'Pour les fiches détaillées (ancienneté, formations, carrière), va sur la page ' +
        '<a href="equipe.html">Équipe</a>.</span></div>';

    $("#add").addEventListener("click", () => editUser(null));
    bindRows(host, draft.users, {
      edit: u => editUser(u),
      del: u => deleteUser(u, me),
      toggle: u => {
        if (me.uid === u.id) return MNUI.toast("Tu ne peux pas désactiver ton propre compte", "err");
        u.active = !u.active; commit();
      }
    });
  }

  function userRow(u, me) {
    const role = draft.roles.find(r => r.id === u.roleId) ||
      { name: "Sans rôle", color: "#6a6280", perms: [] };
    const perms = role.perms.indexOf("admin") !== -1 ? ["admin"] : role.perms;
    const tags = perms.length
      ? (perms[0] === "admin"
          ? '<span class="permtag">tous les droits</span>'
          : perms.map(p => {
              const d = MN_PERMS.find(x => x.key === p);
              return '<span class="permtag">' + esc(d ? d.name : p) + "</span>";
            }).join(""))
      : '<span class="permtag permtag--none">aucun droit</span>';

    const idx = draft.users.indexOf(u);

    return '<div class="trow' + (u.active ? "" : " is-off") + '" data-row="' + esc(u.id) + '">' +
      '<div class="ord">' +
        '<button data-a="up"' + (idx === 0 ? " disabled" : "") + ' aria-label="Monter">' + svg("chevUp") + "</button>" +
        '<button data-a="down"' + (idx === draft.users.length - 1 ? " disabled" : "") +
          ' aria-label="Descendre">' + svg("chevDown") + "</button>" +
      "</div>" +
      '<div class="userchip__av" style="width:38px;height:38px;flex:none;background:' +
        esc(role.color) + '">' + esc(MNUI.initials(u.pseudo)) + "</div>" +
      '<div class="trow__main">' +
        "<b>" + esc(u.pseudo) +
          (me.uid === u.id ? ' <span class="pill pill--outline">toi</span>' : "") +
          (u.pin ? " " + svg("lock", "inline-lock") : "") +
          (u.active ? "" : ' <span class="pill pill--dim">désactivé</span>') +
        "</b>" +
        '<div class="trow__meta"><span class="rolechip" style="color:' + esc(role.color) + '">' +
          esc(role.name) + "</span></div>" +
        '<div class="permtags" style="margin-top:6px">' + tags + "</div>" +
      "</div>" +
      '<div class="trow__acts">' +
        '<button class="btn btn--icon" data-a="toggle" title="' + (u.active ? "Désactiver" : "Réactiver") + '">' +
          svg(u.active ? "check" : "x") + "</button>" +
        '<button class="btn btn--icon" data-a="edit" title="Modifier">' + svg("edit") + "</button>" +
        '<button class="btn btn--icon" data-a="del" title="Retirer">' + svg("trash") + "</button>" +
      "</div></div>";
  }

  function editUser(u) {
    const isNew = !u;
    const me = MNAuth.session();
    const isMe = !isNew && me.uid === u.id;
    /* Un nouvel employé arrive sur le rôle le MOINS doté : on ne crée jamais
       un admin par inadvertance. */
    const weakest = draft.roles.slice().sort((a, b) => {
      const w = r => (r.perms.indexOf("admin") !== -1 ? 99 : r.perms.length);
      return w(a) - w(b);
    })[0];
    const cur = u || { pseudo: "", roleId: weakest.id, pin: null, active: true };

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="u-pseudo">Pseudo (sert à se connecter)</label>' +
          '<input class="input" id="u-pseudo" maxlength="32" value="' + esc(cur.pseudo) + '" placeholder="Ex. Rico"></div>' +
        '<div class="field"><label class="label" for="u-role">Rôle</label>' +
          '<select class="select" id="u-role">' + draft.roles.map(r =>
            '<option value="' + esc(r.id) + '"' + (r.id === cur.roleId ? " selected" : "") + ">" +
            esc(r.name) + "</option>").join("") + "</select>" +
          '<p class="hint">Les droits viennent du rôle. Onglet « Rôles » pour les modifier.</p></div>' +
      "</div>" +

      '<div class="fieldset"><span class="label">Droits de ce rôle</span>' +
        '<div class="permtags" id="u-perms"></div></div>' +

      '<div class="fieldset"><span class="label">Code d\'accès (facultatif)</span>' +
        '<div class="editor__grid">' +
          '<div class="field"><input class="input" id="u-pin" type="password" inputmode="numeric" ' +
            'placeholder="' + (cur.pin ? "Laisser vide = code inchangé" : "Aucun code — laisser vide") + '" maxlength="24"></div>' +
          '<div class="field">' + (cur.pin
            ? '<button class="btn btn--ghost" id="u-pin-clear" type="button">' + svg("x") + "<span>Retirer le code</span></button>"
            : '<p class="hint">Sans code, il suffit de taper le pseudo pour entrer.</p>') + "</div>" +
        "</div></div>" +

      '<label class="switch"><input type="checkbox" id="u-active"' + (cur.active ? " checked" : "") +
        (isMe ? " disabled" : "") + '><span class="switch__box"></span><span>Compte actif</span></label>' +
      (isMe ? '<p class="hint hint--warn">Tu modifies ton propre compte : tu ne peux pas le désactiver, ' +
        "ni prendre un rôle qui te retirerait la gestion de l'équipe (sécurité anti-blocage).</p>" : "");

    let clearPin = false;
    const clearBtn = body.querySelector("#u-pin-clear");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      clearPin = true;
      clearBtn.disabled = true;
      clearBtn.innerHTML = svg("check") + "<span>Code retiré à l'enregistrement</span>";
    });

    /* Aperçu en lecture seule des droits apportés par le rôle choisi. */
    const permsHost = body.querySelector("#u-perms");
    const roleSel = body.querySelector("#u-role");
    function paintPerms() {
      const r = draft.roles.find(x => x.id === roleSel.value);
      const p = r ? (r.perms.indexOf("admin") !== -1 ? MN_PERMS.map(x => x.key) : r.perms) : [];
      permsHost.innerHTML = p.length
        ? p.map(k => {
            const d = MN_PERMS.find(x => x.key === k);
            return '<span class="permtag">' + esc(d ? d.name : k) + "</span>";
          }).join("")
        : '<span class="permtag permtag--none">aucun droit</span>';
    }
    roleSel.addEventListener("change", paintPerms);
    paintPerms();

    MNUI.modal({
      title: isNew ? "Nouvel employé" : "Modifier " + cur.pseudo,
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: isNew ? "Ajouter" : "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: close => {
            const pseudo = body.querySelector("#u-pseudo").value.trim();
            if (pseudo.length < 2) return MNUI.toast("Pseudo trop court", "err");

            const clash = draft.users.find(x =>
              x.pseudo.toLowerCase() === pseudo.toLowerCase() && (isNew || x.id !== u.id));
            if (clash) return MNUI.toast("Ce pseudo est déjà pris", "err");

            const roleId = body.querySelector("#u-role").value;
            const pin = body.querySelector("#u-pin").value.trim();
            const active = body.querySelector("#u-active").checked;

            /* Sécurité anti-blocage : ne pas se priver soi-même de la gestion. */
            if (isMe) {
              const r = draft.roles.find(x => x.id === roleId);
              const p = r ? r.perms : [];
              if (p.indexOf("admin") === -1 && p.indexOf("users") === -1) {
                return MNUI.toast("Ce rôle te retirerait la gestion de l'équipe", "err");
              }
            }

            if (isNew) {
              const id = MNStore.uniqueId(pseudo, draft.users.map(x => x.id));
              const r = draft.roles.find(x => x.id === roleId);
              const now = new Date().toISOString();
              draft.users.push({
                id, pseudo, roleId, active,
                pin: pin ? MNAuth.hashPin(id, pin) : null,
                createdAt: now,
                hiredAt: now.slice(0, 10),
                trainings: [], note: "",
                history: [{
                  roleId, roleName: r ? r.name : roleId, at: now,
                  by: me.pseudo, note: "Entrée dans l'entreprise"
                }]
              });
            } else {
              u.pseudo = pseudo;
              /* Un changement de grade laisse une trace dans sa carrière. */
              if (roleId !== u.roleId) MNStore.recordPromotion(u, roleId, draft.roles, me.pseudo, "");
              u.active = isMe ? true : active;
              if (clearPin) u.pin = null;
              else if (pin) u.pin = MNAuth.hashPin(u.id, pin);
            }
            commit(); close();
            MNUI.toast(isNew ? "Employé ajouté" : "Employé mis à jour", "ok");
          }
        }
      ]
    });
  }

  async function deleteUser(u, me) {
    if (me.uid === u.id) return MNUI.toast("Tu ne peux pas te retirer toi-même", "err");
    const admins = draft.users.filter(x => x.active && MNAuth.effectivePerms(x).indexOf("users") !== -1);
    if (admins.length <= 1 && admins[0] && admins[0].id === u.id) {
      return MNUI.toast("C'est le dernier compte capable de gérer l'équipe", "err");
    }
    const ok = await MNUI.confirm({
      title: "Retirer l'employé",
      message: "« " + u.pseudo + " » ne pourra plus se connecter au site.",
      confirmLabel: "Retirer", danger: true
    });
    if (!ok) return;
    draft.users = draft.users.filter(x => x.id !== u.id);
    commit();
    MNUI.toast("Employé retiré", "ok");
  }

  /* =========================================================================
     IMAGES
     ========================================================================= */

  /** Où une image est-elle utilisée dans le catalogue ? */
  function usesOf(path) {
    const out = [];
    draft.items.forEach(i => { if (i.icon === path) out.push({ kind: "objet", name: i.name }); });
    draft.resources.forEach(r => { if (r.icon === path) out.push({ kind: "ressource", name: r.name }); });
    draft.categories.forEach(c => { if (c.icon === path) out.push({ kind: "catégorie", name: c.name }); });
    if (draft.settings.brand.logo === path) out.push({ kind: "logo", name: "logo de l'atelier" });
    return out;
  }

  /** Reporte un changement de chemin partout dans le brouillon. */
  function replacePath(from, to) {
    let n = 0;
    draft.items.forEach(i => { if (i.icon === from) { i.icon = to; n++; } });
    draft.resources.forEach(r => { if (r.icon === from) { r.icon = to; n++; } });
    draft.categories.forEach(c => { if (c.icon === from) { c.icon = to; n++; } });
    if (draft.settings.brand.logo === from) { draft.settings.brand.logo = to; n++; }
    return n;
  }

  async function paneImages(host) {
    const ready = MNGitHub.hasToken() && MNGitHub.isConfigured();

    host.innerHTML =
      '<div class="toolbar">' +
        '<span class="subtitle">Le dossier ' + IMG_DIR + "/ du dépôt</span>" +
        '<span class="spacer"></span>' +
        '<button class="btn btn--ghost" id="i-refresh">' + svg("refresh") + "<span>Actualiser</span></button>" +
        '<button class="btn btn--primary" id="i-add">' + svg("upload") + "<span>Ajouter une image</span></button>" +
        '<input type="file" id="i-file" accept="image/*" hidden>' +
      "</div>" +
      (ready ? "" :
        '<div class="alert alert--warn">' + svg("alert") +
        "<span>Sans jeton GitHub sur cet appareil, tu peux consulter les images mais pas les " +
        "renommer ni les supprimer. Configure-le dans l'onglet « Publier ».</span></div>") +
      '<div id="i-list"><p class="hint">Lecture du dossier…</p></div>';

    $("#i-refresh").addEventListener("click", () => { imgCache = null; paneImages(host); });
    $("#i-add").addEventListener("click", () => $("#i-file").click());
    $("#i-file").addEventListener("change", e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      fileToIcon(f, async data => {
        if (!ready) return MNUI.toast("Jeton GitHub requis pour déposer une image", "err");
        try {
          const path = await uploadToRepo(data, f.name);
          if (!path) return;
          imgCache = null;
          paneImages(host);
          MNUI.toast("Image déposée : " + path, "ok");
        } catch (err2) { MNUI.toast("Dépôt impossible : " + err2.message, "err"); }
      });
    });

    const list = $("#i-list");
    const { names, source } = await listRepoImages(false);

    if (!names.length) {
      list.innerHTML = '<div class="empty">' + svg("file") + "<b>Aucune image</b>" +
        "<p>Clique sur « Ajouter une image » pour commencer.</p></div>";
      return;
    }

    list.innerHTML =
      '<div class="rows">' + names.map(n => {
        const path = IMG_DIR + "/" + n;
        const uses = usesOf(path);
        return '<div class="trow" data-img="' + esc(n) + '">' +
          '<div class="trow__ico"><img src="' + esc(path) + '" alt="" loading="lazy" decoding="async"></div>' +
          '<div class="trow__main"><b>' + esc(n) + "</b>" +
            '<div class="trow__meta">' +
              (uses.length
                ? uses.map(u => '<span class="permtag">' + esc(u.kind) + " : " + esc(u.name) + "</span>").join("")
                : '<i style="color:var(--amber)">non utilisée</i>') +
            "</div></div>" +
          '<div class="trow__acts">' +
            '<button class="btn btn--icon" data-a="ren" title="Renommer"' + (ready ? "" : " disabled") + ">" +
              svg("edit") + "</button>" +
            '<button class="btn btn--icon" data-a="del" title="Supprimer"' + (ready ? "" : " disabled") + ">" +
              svg("trash") + "</button>" +
          "</div></div>";
      }).join("") + "</div>" +
      '<p class="hint" style="margin-top:10px">' + names.length + " image" + (names.length > 1 ? "s" : "") +
        (source === "github" ? " — lues dans le dépôt." : " — d'après le manifeste du dossier.") + "</p>";

    list.querySelectorAll("[data-img]").forEach(row => {
      const name = row.dataset.img;
      row.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => {
        if (b.disabled) return;
        if (b.dataset.a === "ren") renameImage(name, host);
        else deleteImage(name, host);
      }));
    });
  }

  function renameImage(name, host) {
    const from = IMG_DIR + "/" + name;
    const ext = (name.match(/\.[a-z0-9]+$/i) || [".png"])[0];
    const uses = usesOf(from);

    const body = document.createElement("div");
    body.innerHTML =
      '<div class="field"><label class="label" for="rn">Nouveau nom</label>' +
        '<input class="input" id="rn" value="' + esc(name.replace(/\.[a-z0-9]+$/i, "")) + '" maxlength="48"></div>' +
      '<p class="hint" style="margin-top:10px">L\'extension <code>' + esc(ext) + "</code> est conservée. " +
        (uses.length
          ? "Les <b>" + uses.length + " référence" + (uses.length > 1 ? "s" : "") +
            "</b> dans le catalogue seront mises à jour automatiquement."
          : "Cette image n'est utilisée nulle part.") + "</p>";

    MNUI.modal({
      title: "Renommer l'image", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Renommer", variant: "btn--primary", icon: "save",
          onClick: async (close, b, btn) => {
            const to = IMG_DIR + "/" + MNStore.slugify(body.querySelector("#rn").value) + ext;
            if (to === from) return close();
            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Renommage…</span>";
            try {
              await MNGitHub.renameFile(from, to, "Renommage de l'image " + name);
              const n = replacePath(from, to);
              if (n) commit(); else render();
              imgCache = null;
              close();
              MNUI.toast("Renommée" + (n ? " — " + n + " référence(s) mise(s) à jour" : ""), "ok");
              if (tab === "images") paneImages($("#pane"));
            } catch (e) {
              btn.disabled = false;
              btn.innerHTML = svg("save") + "<span>Renommer</span>";
              MNUI.toast("Échec : " + e.message, "err");
            }
          }
        }
      ]
    });
  }

  async function deleteImage(name, host) {
    const path = IMG_DIR + "/" + name;
    const uses = usesOf(path);

    const ok = await MNUI.confirm({
      title: "Supprimer l'image",
      message: uses.length
        ? "« " + name + " » est utilisée par " + uses.length + " élément" + (uses.length > 1 ? "s" : "") +
          " (" + uses.map(u => u.name).join(", ") + "). Ils repasseront sur une icône par défaut."
        : "« " + name + " » sera supprimée du dépôt. C'est définitif.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;

    try {
      await MNGitHub.deleteFile(path, "Suppression de l'image " + name);
      const n = replacePath(path, "i-box");
      imgCache = null;
      try {
        const fresh = await listRepoImages(true);
        await MNGitHub.putText(IMG_DIR + "/index.json",
          JSON.stringify(fresh.names, null, 2) + "\n", "Mise à jour de la liste des images");
      } catch (_) { /* manifeste : simple confort */ }
      if (n) commit();
      MNUI.toast("Image supprimée" + (n ? " — " + n + " élément(s) remis sur l'icône par défaut" : ""), "ok");
      if (tab === "images") paneImages($("#pane"));
    } catch (e) {
      MNUI.toast("Suppression impossible : " + e.message, "err");
    }
  }

  /* =========================================================================
     RÔLES
     ========================================================================= */

  function paneRoles(host) {
    host.innerHTML =
      '<div class="toolbar">' +
        '<span class="subtitle">Les droits sont portés par le rôle, pas par la personne</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--primary" id="add">' + svg("plus") + "<span>Nouveau rôle</span></button>" +
      "</div>" +
      '<div class="rows">' + draft.roles.map((r, i) => {
        const n = draft.users.filter(u => u.roleId === r.id).length;
        const perms = r.perms.indexOf("admin") !== -1 ? ["admin"] : r.perms;
        const tags = perms.length
          ? (perms[0] === "admin"
              ? '<span class="permtag">tous les droits</span>'
              : perms.map(p => {
                  const d = MN_PERMS.find(x => x.key === p);
                  return '<span class="permtag">' + esc(d ? d.name : p) + "</span>";
                }).join(""))
          : '<span class="permtag permtag--none">aucun droit</span>';

        return '<div class="trow" data-row="' + esc(r.id) + '">' +
          '<div class="ord">' +
            '<button data-a="up"' + (i === 0 ? " disabled" : "") + ">" + svg("chevUp") + "</button>" +
            '<button data-a="down"' + (i === draft.roles.length - 1 ? " disabled" : "") + ">" + svg("chevDown") + "</button>" +
          "</div>" +
          '<div class="trow__ico" style="background:' + esc(r.color) + '1f;border-color:' + esc(r.color) +
            ';color:' + esc(r.color) + '">' + mnIcon(r.icon) + "</div>" +
          '<div class="trow__main">' +
            '<b><span class="rolechip" style="color:' + esc(r.color) + '">' + esc(r.name) + "</span></b>" +
            '<div class="trow__meta"><i>' + n + " employé" + (n > 1 ? "s" : "") + "</i></div>" +
            '<div class="permtags" style="margin-top:6px">' + tags + "</div>" +
          "</div>" +
          '<div class="trow__acts">' +
            '<button class="btn btn--icon" data-a="edit" title="Modifier">' + svg("edit") + "</button>" +
            '<button class="btn btn--icon" data-a="del" title="Supprimer">' + svg("trash") + "</button>" +
          "</div></div>";
      }).join("") + "</div>";

    $("#add").addEventListener("click", () => editRole(null));
    bindRows(host, draft.roles, { edit: r => editRole(r), del: r => deleteRole(r) });
  }

  function editRole(r) {
    const isNew = !r;
    const cur = r || {
      name: "", color: MN_ROLE_COLORS[draft.roles.length % 10],
      icon: "i-badge", perms: ["bt", "duty"]
    };
    let perms = cur.perms.slice();
    let color = cur.color;
    let icon = cur.icon || "i-badge";

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="field"><label class="label" for="r-name">Nom du rôle</label>' +
        '<input class="input" id="r-name" maxlength="28" value="' + esc(cur.name) + '" placeholder="Ex. Chef d\'atelier"></div>' +
      '<div class="field"><label class="label">Écusson du grade</label>' +
        '<div class="iconpick">' +
          '<div class="iconpick__preview" id="r-prev" style="color:' + esc(color) + '">' + mnIcon(icon) + "</div>" +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
            '<button class="btn btn--ghost btn--sm" id="r-pick" type="button">' + svg("upload") +
              "<span>Choisir un écusson</span></button>" +
            '<p class="hint">Icône, image ou emoji — il apparaît dans la liste des rôles et sur les fiches.</p>' +
          "</div>" +
        "</div></div>" +
      '<div class="field"><label class="label">Couleur</label>' +
        '<div class="swatches" id="r-colors">' + MN_ROLE_COLORS.map(c =>
          '<button type="button" class="swatch' + (c === color ? " is-on" : "") +
          '" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join("") +
        "</div></div>" +
      '<div class="fieldset"><span class="label">Permissions du rôle</span>' +
        '<div class="perms" id="r-perms"></div></div>';

    const prev = body.querySelector("#r-prev");
    body.querySelector("#r-pick").addEventListener("click", () =>
      pickIcon(icon, v => { icon = v; prev.innerHTML = mnIcon(v); }));

    body.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => {
      color = b.dataset.c;
      prev.style.color = color;
      body.querySelectorAll("[data-c]").forEach(x => x.classList.toggle("is-on", x === b));
    }));

    const permsHost = body.querySelector("#r-perms");
    function paintPerms() {
      const isAdmin = perms.indexOf("admin") !== -1;
      permsHost.innerHTML = MN_PERMS.map(p => {
        const on = isAdmin || perms.indexOf(p.key) !== -1;
        const locked = isAdmin && p.key !== "admin";
        return '<label class="perm' + (on ? " is-on" : "") + (locked ? " is-locked" : "") +
          '" data-p="' + p.key + '">' +
          '<span class="perm__box">' + svg("check") + "</span>" +
          '<span class="perm__txt"><b>' + esc(p.name) + "</b><span>" + esc(p.desc) + "</span></span></label>";
      }).join("");
      permsHost.querySelectorAll("[data-p]").forEach(l => l.addEventListener("click", () => {
        if (l.classList.contains("is-locked")) return;
        const k = l.dataset.p, i = perms.indexOf(k);
        if (i === -1) perms.push(k); else perms.splice(i, 1);
        paintPerms();
      }));
    }
    paintPerms();

    MNUI.modal({
      title: isNew ? "Nouveau rôle" : "Modifier le rôle",
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: isNew ? "Créer" : "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: close => {
            const name = body.querySelector("#r-name").value.trim();
            if (!name) return MNUI.toast("Donne un nom au rôle", "err");

            /* On ne se coupe pas soi-même l'accès à la gestion de l'équipe. */
            const me = MNAuth.session();
            if (!isNew && me.roleId === r.id &&
                perms.indexOf("admin") === -1 && perms.indexOf("users") === -1) {
              return MNUI.toast("C'est ton propre rôle : garde « Gérer l'équipe »", "err");
            }

            if (isNew) {
              draft.roles.push({
                id: MNStore.uniqueId(name, draft.roles.map(x => x.id)), name, color, icon, perms
              });
            } else {
              r.name = name; r.color = color; r.icon = icon; r.perms = perms;
            }
            commit(); close();
            MNUI.toast(isNew ? "Rôle créé" : "Rôle mis à jour", "ok");
          }
        }
      ]
    });
  }

  async function deleteRole(r) {
    if (draft.roles.length <= 1) return MNUI.toast("Il faut garder au moins un rôle", "err");
    const holders = draft.users.filter(u => u.roleId === r.id);
    const me = MNAuth.session();
    if (holders.some(u => u.id === me.uid)) return MNUI.toast("C'est ton propre rôle", "err");

    const fallback = draft.roles.find(x => x.id !== r.id);
    const ok = await MNUI.confirm({
      title: "Supprimer le rôle",
      message: holders.length
        ? "« " + r.name + " » est porté par " + holders.length + " employé" + (holders.length > 1 ? "s" : "") +
          ". Ils basculeront sur « " + fallback.name + " »."
        : "« " + r.name + " » sera supprimé.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    draft.users.forEach(u => { if (u.roleId === r.id) u.roleId = fallback.id; });
    draft.roles = draft.roles.filter(x => x.id !== r.id);
    commit();
    MNUI.toast("Rôle supprimé", "ok");
  }

  /* =========================================================================
     DISCORD
     ========================================================================= */

  function paneDiscord(host) {
    const w = draft.settings.webhook;
    const relay = draft.settings.relay || "";
    const relayOn = !!relay;
    const me = MNAuth.session();

    /* Les champs affichent l'adresse en clair ; le brouillage se fait à
       l'enregistrement, de façon transparente. */
    const block = (key, title, desc) =>
      '<div class="panel"><div class="panel__head"><h2>' + title + "</h2>" +
        (MNWebhook.isValid(w[key]) ? '<span class="pill pill--ok">configuré</span>' : '<span class="pill pill--dim">vide</span>') +
      "</div>" +
      '<div class="panel__body editor">' +
        '<p class="hint">' + desc + "</p>" +
        '<div class="field"><label class="label" for="w-' + key + '">Adresse du webhook</label>' +
          '<input class="input mono" id="w-' + key + '" value="' + esc(MNWebhook.unpack(w[key])) +
            '" placeholder="https://discord.com/api/webhooks/..."></div>' +
        '<div class="row row--wrap">' +
          '<button class="btn btn--ghost btn--sm" data-test="' + key + '">' + svg("cloud") +
            "<span>Envoyer un test</span></button>" +
          '<button class="btn btn--ghost btn--sm" data-clear="' + key + '">' + svg("x") +
            "<span>Vider</span></button>" +
        "</div>" +
      "</div></div>";

    host.innerHTML =
      '<div class="alert alert--warn">' + svg("alert") +
        "<span><b>À savoir avant de configurer.</b> L'adresse du webhook est enregistrée dans le fichier " +
        "de données du site, qui est public. Quelqu'un qui sait chercher peut donc écrire dans le salon. " +
        "Utilise un salon dédié, sans enjeu — et si tu vois passer n'importe quoi, régénère le webhook " +
        "depuis Discord.</span></div>" +

      block("bt", "Bons de travail",
        "Chaque BT enregistré est publié dans ce salon : mécano, client, véhicule, prestations et ressources.") +

      block("duty", "Prises de service",
        "Chaque arrivée et chaque départ de l'atelier y est annoncé, avec la durée du service.") +

      '<div class="panel"><div class="panel__head"><h2>Apparence du bot</h2></div>' +
        '<div class="panel__body editor">' +
          '<div class="iconpick">' +
            '<div class="iconpick__preview" id="w-ava-prev">' +
              mnIcon(w.avatar || draft.settings.brand.logo || "i-wrench") + "</div>" +
            '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
              '<div class="row row--wrap">' +
                '<button class="btn btn--ghost btn--sm" id="w-ava-pick" type="button">' + svg("upload") +
                  "<span>Choisir un logo</span></button>" +
                '<button class="btn btn--ghost btn--sm" id="w-ava-clear" type="button"' +
                  (w.avatar ? "" : " disabled") + ">" + svg("x") + "<span>Reprendre le logo du site</span></button>" +
              "</div>" +
              '<p class="hint">Photo de profil du bot sur Discord. Vide = le logo de l\'atelier. ' +
                "Discord doit pouvoir la télécharger : elle doit donc être déjà <b>publiée en ligne</b>.</p>" +
            "</div>" +
          "</div>" +
          '<div class="editor__grid">' +
            '<div class="field"><label class="label" for="w-name">Nom affiché</label>' +
              '<input class="input" id="w-name" value="' + esc(w.name) + '" maxlength="70" placeholder="' +
                esc(draft.settings.brand.name) + '"></div>' +
            '<div class="field"><label class="label" for="w-mention">Mention (facultatif)</label>' +
              '<input class="input mono" id="w-mention" value="' + esc(w.mention) +
                '" placeholder="&lt;@&amp;123456789012345678&gt;" maxlength="80"></div>' +
          "</div>" +
          '<p class="hint">La mention est ajoutée avant chaque message. Pour un rôle : clic droit sur le rôle ' +
            "dans Discord → Copier l'identifiant, puis écris <code>&lt;@&amp;identifiant&gt;</code>.</p>" +
        "</div></div>" +

      '<div class="panel"><div class="panel__head"><h2>Confidentialité des adresses</h2>' +
        (relayOn ? '<span class="pill pill--ok">relais actif</span>' : "") +
      "</div>" +
        '<div class="panel__body editor">' +
          (relayOn
            ? '<p class="hint">Un relais est configuré : les adresses ci-dessus ne sont plus utilisées, ' +
              "c'est lui qui connaît les vraies. Elles ne sont donc plus dans le dépôt.</p>"
            : '<p class="hint">Sans relais, les adresses restent dans le fichier de données. Elles y sont ' +
              "<b>brouillées</b> — on ne les trouve pas en cherchant « discord.com » — mais c'est un " +
              "ralentisseur, pas une protection : le site doit pouvoir les lire, donc quelqu'un de " +
              "motivé le peut aussi. Le relais se règle dans l'onglet <b>Publier</b>.</p>") +
        "</div></div>" +

      '<div class="panel"><div class="panel__head"><h2>Créer un webhook</h2></div>' +
        '<div class="panel__body"><div class="steps">' +
          '<div class="step"><p class="step__txt">Sur Discord, clic droit sur le salon → ' +
            "<b>Modifier le salon</b> → <b>Intégrations</b> → <b>Webhooks</b>.</p></div>" +
          '<div class="step"><p class="step__txt"><b>Nouveau webhook</b>, donne-lui un nom, ' +
            "puis <b>Copier l'URL du webhook</b>.</p></div>" +
          '<div class="step"><p class="step__txt">Colle l\'adresse ci-dessus, clique sur ' +
            "<b>Envoyer un test</b>, et n'oublie pas de <b>publier</b>.</p></div>" +
        "</div></div></div>" +

      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn btn--primary" id="w-save">' + svg("save") + "<span>Enregistrer</span></button></div>";

    let avatar = w.avatar;
    const avaPrev = $("#w-ava-prev");
    const paintAva = () => {
      avaPrev.innerHTML = mnIcon(avatar || draft.settings.brand.logo || "i-wrench");
      $("#w-ava-clear").disabled = !avatar;
    };
    $("#w-ava-pick").addEventListener("click", () =>
      pickIcon(avatar || draft.settings.brand.logo || "i-wrench", v => { avatar = v; paintAva(); }));
    $("#w-ava-clear").addEventListener("click", () => { avatar = ""; paintAva(); });

    /* Ce qu'on enregistre : adresses brouillées, le reste tel quel. */
    const read = () => ({
      bt: MNWebhook.pack($("#w-bt").value.trim()),
      duty: MNWebhook.pack($("#w-duty").value.trim()),
      mention: $("#w-mention").value.trim(),
      name: $("#w-name").value.trim(),
      avatar,
      proxy: ""
    });

    $("#w-save").addEventListener("click", () => {
      const v = read();
      for (const k of ["bt", "duty"]) {
        if (v[k] && !MNWebhook.isValid(v[k])) {
          return MNUI.toast("Adresse de webhook invalide (" + (k === "bt" ? "BT" : "services") + ")", "err");
        }
      }
      draft.settings.webhook = v;
      commit();
      MNUI.toast("Réglages Discord enregistrés dans le brouillon", "ok");
    });

    host.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => {
      $("#w-" + b.dataset.clear).value = "";
      MNUI.toast("Champ vidé — pense à enregistrer", "info");
    }));

    host.querySelectorAll("[data-test]").forEach(b => b.addEventListener("click", async () => {
      const kind = b.dataset.test;
      const url = $("#w-" + kind).value.trim();
      if (!MNWebhook.isValid(url)) return MNUI.toast("Colle d'abord une adresse de webhook valide", "err");

      draft.settings.webhook = read();
      MNStore.saveDraft(draft);

      b.disabled = true;
      const old = b.innerHTML;
      b.innerHTML = svg("refresh") + "<span>Envoi…</span>";
      const r = await MNWebhook.sendTest(kind, me.pseudo);
      b.disabled = false;
      b.innerHTML = old;
      MNUI.toast(r.ok ? "Message envoyé, regarde ton salon Discord" : "Échec : " + r.error, r.ok ? "ok" : "err");
    }));
  }

  /* =========================================================================
     RÉGLAGES DU SITE
     ========================================================================= */

  function paneSite(host) {
    const s = draft.settings;
    host.innerHTML =
      '<div class="panel"><div class="panel__head"><h2>Identité de l\'entreprise</h2></div>' +
        '<div class="panel__body editor">' +
          '<div class="editor__grid">' +
            '<div class="field"><label class="label" for="s-brand">Nom</label>' +
              '<input class="input" id="s-brand" maxlength="34" value="' + esc(s.brand.name) + '"></div>' +
            '<div class="field"><label class="label" for="s-tag">Slogan</label>' +
              '<input class="input" id="s-tag" maxlength="34" value="' + esc(s.brand.tagline) + '"></div>' +
          "</div>" +
          '<div class="field"><label class="label">Logo</label>' +
            '<div class="iconpick">' +
              '<div class="iconpick__preview' + (s.brand.logo ? "" : " iconpick__preview--txt") + '" id="s-logo-prev">' +
                (s.brand.logo ? mnIcon(s.brand.logo) : esc(MNUI.initials(s.brand.name))) + "</div>" +
              '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
                '<div class="row row--wrap">' +
                  '<button class="btn btn--ghost btn--sm" type="button" id="s-logo-pick">' + svg("upload") +
                    "<span>Choisir un logo</span></button>" +
                  '<button class="btn btn--ghost btn--sm" type="button" id="s-logo-clear"' +
                    (s.brand.logo ? "" : " disabled") + ">" + svg("x") + "<span>Retirer</span></button>" +
                "</div>" +
                '<p class="hint">Image, emoji ou icône. Sans logo, ce sont les initiales du nom qui s\'affichent. ' +
                  "Le logo apparaît dans l'entête, sur l'écran de connexion et dans l'onglet du navigateur.</p>" +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div></div>" +

      '<div class="panel"><div class="panel__head"><h2>Connexion</h2></div>' +
        '<div class="panel__body editor">' +
          '<label class="switch"><input type="checkbox" id="s-guest"' + (s.auth.allowGuests ? " checked" : "") + ">" +
            '<span class="switch__box"></span><span>Autoriser n\'importe quel pseudo à entrer</span></label>' +
          '<p class="hint">Désactivé, seuls les pseudos de l\'onglet « Employés » peuvent se connecter. ' +
            "Activé, un inconnu entre avec les droits « Faire des BT » uniquement.</p>" +
          '<div class="field" style="max-width:220px"><label class="label" for="s-days">Durée de session (jours)</label>' +
            '<input class="input input--num" id="s-days" type="number" min="1" max="365" value="' + Number(s.auth.sessionDays) + '"></div>' +
        "</div></div>" +

      '<div class="panel"><div class="panel__head"><h2>Zone sensible</h2></div>' +
        '<div class="panel__body editor">' +
          '<p class="hint">Efface le brouillon local et recharge la version actuellement en ligne. ' +
            "Tes modifications non publiées seront perdues.</p>" +
          '<div><button class="btn btn--danger" id="s-reset">' + svg("refresh") + "<span>Repartir de la version en ligne</span></button></div>" +
        "</div></div>" +

      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn btn--primary" id="s-save">' + svg("save") + "<span>Enregistrer les réglages</span></button></div>";

    /* Le logo est appliqué au brouillon dès qu'il est choisi. */
    let logo = s.brand.logo;
    const logoPrev = $("#s-logo-prev");
    const paintLogo = () => {
      logoPrev.classList.toggle("iconpick__preview--txt", !logo);
      logoPrev.innerHTML = logo ? mnIcon(logo) : esc(MNUI.initials($("#s-brand").value || "Atelier"));
      $("#s-logo-clear").disabled = !logo;
    };
    $("#s-logo-pick").addEventListener("click", () =>
      pickIcon(logo || "i-wrench", v => { logo = v; paintLogo(); }));
    $("#s-logo-clear").addEventListener("click", () => { logo = ""; paintLogo(); });
    $("#s-brand").addEventListener("input", () => { if (!logo) paintLogo(); });

    $("#s-save").addEventListener("click", () => {
      draft.settings.brand.name = $("#s-brand").value.trim() || "Atelier";
      draft.settings.brand.tagline = $("#s-tag").value.trim();
      draft.settings.brand.logo = logo;
      draft.settings.auth.allowGuests = $("#s-guest").checked;
      draft.settings.auth.sessionDays = Math.max(1, Math.min(365, Number($("#s-days").value) || 30));
      commit();
      MNUI.mountTopbar("admin");
      MNUI.syncFavicon();
      MNUI.toast("Réglages enregistrés dans le brouillon", "ok");
    });

    $("#s-reset").addEventListener("click", async () => {
      const ok = await MNUI.confirm({
        title: "Repartir de la version en ligne",
        message: "Le brouillon local sera effacé et remplacé par ce qui est publié actuellement.",
        confirmLabel: "Effacer le brouillon", danger: true
      });
      if (!ok) return;
      MNStore.discardDraft();
      localStorage.removeItem(K_STAMP);
      location.reload();
    });
  }

  /* =========================================================================
     PUBLICATION
     ========================================================================= */

  function panePublish(host) {
    const gh = draft.settings.github;
    const det = MNGitHub.detect();
    const last = MNGitHub.lastPublish();
    const dirty = MNStore.hasDraft();
    const stamp = localStorage.getItem(K_STAMP);
    const sent = dirty && stamp === draft.updatedAt;
    const ready = MNGitHub.hasToken() && MNGitHub.isConfigured();

    const state = !MNGitHub.hasToken()
      ? { cls: "off", ico: "lock", t: "Publication automatique non configurée",
          s: "Suis les 4 étapes ci-dessous une seule fois, puis tu publieras d'un clic." }
      : sent
        ? { cls: "ok", ico: "cloud", t: "Publié — déploiement en cours",
            s: "GitHub reconstruit le site. Compte environ une minute." +
               (last ? " Dernier envoi " + MNUI.ago(last.at) + "." : "") }
        : dirty
          ? { cls: "warn", ico: "alert", t: "Modifications non publiées",
              s: "Ce que tu as changé n'est visible que dans ton navigateur." }
          : { cls: "ok", ico: "check", t: "Tout est en ligne",
              s: last ? "Dernière publication " + MNUI.ago(last.at) + "." : "Aucune modification en attente." };

    host.innerHTML =
      '<div class="pubstate pubstate--' + state.cls + '">' +
        '<div class="pubstate__ico">' + svg(state.ico) + "</div>" +
        '<div class="pubstate__txt"><b>' + esc(state.t) + "</b><span>" + esc(state.s) + "</span></div>" +
        '<button class="btn btn--solid" id="p-go"' + (dirty && !sent ? "" : " disabled") + ">" +
          svg("cloud") + "<span>Publier maintenant</span></button>" +
      "</div>" +

      '<div class="panel"><div class="panel__head">' + svg("refresh") + "<h2>Publication automatique</h2></div>" +
        '<div class="panel__body editor">' +
          '<label class="switch"><input type="checkbox" id="p-auto"' +
            (localStorage.getItem(K_AUTO) === "1" ? " checked" : "") +
            (ready ? "" : " disabled") + ">" +
            '<span class="switch__box"></span>' +
            "<span>Envoyer sur GitHub à chaque modification</span></label>" +
          '<p class="hint">Activé, tu n\'as plus rien à cliquer : quelques secondes après ta dernière ' +
            "modification, le catalogue part tout seul sur GitHub. Les changements rapprochés sont " +
            "regroupés en un seul envoi, pour ne pas créer un commit par clic." +
            (ready ? "" : " <b>À configurer d'abord " +
              (!MNGitHub.hasToken() ? "ton jeton" : "le propriétaire et le nom du dépôt") +
              " ci-dessous.</b>") + "</p>" +
          '<p class="hint">Le réglage est propre à ce navigateur : chaque personne décide pour elle. ' +
            "Tu peux toujours forcer un envoi avec « Publier maintenant ».</p>" +
        "</div></div>" +

      '<div class="panel"><div class="panel__head">' + svg("github") + "<h2>Dépôt GitHub</h2></div>" +
        '<div class="panel__body editor">' +
          '<div class="editor__grid">' +
            '<div class="field"><label class="label" for="p-owner">Propriétaire (ton pseudo GitHub)</label>' +
              '<input class="input" id="p-owner" value="' + esc(gh.owner || det.owner) + '" placeholder="moncompte"></div>' +
            '<div class="field"><label class="label" for="p-repo">Nom du dépôt</label>' +
              '<input class="input" id="p-repo" value="' + esc(gh.repo || det.repo) + '" placeholder="mecano-nord"></div>' +
            '<div class="field"><label class="label" for="p-branch">Branche</label>' +
              '<input class="input" id="p-branch" value="' + esc(gh.branch) + '" placeholder="main"></div>' +
            '<div class="field"><label class="label" for="p-path">Fichier de données</label>' +
              '<input class="input" id="p-path" value="' + esc(gh.path) + '"></div>' +
          "</div>" +
          '<div class="field"><label class="label" for="p-token">Jeton d\'accès GitHub</label>' +
            '<div class="copyfield">' +
              '<input class="input" id="p-token" type="password" placeholder="' +
                (MNGitHub.hasToken() ? "•••••••••• (enregistré sur cet appareil)" : "github_pat_…") + '">' +
              '<button class="btn btn--ghost" id="p-check">' + svg("check") + "<span>Vérifier</span></button>" +
            "</div>" +
            '<p class="hint">Le jeton reste dans TON navigateur, il n\'est jamais écrit dans le dépôt. ' +
              "Chaque personne qui publie met le sien." +
              (MNGitHub.hasToken() ? ' <a href="#" id="p-forget">Oublier le jeton de cet appareil</a>' : "") + "</p>" +
          "</div>" +
          '<div id="p-result"></div>' +
          '<div><button class="btn btn--ghost btn--sm" id="p-save-repo">' + svg("save") +
            "<span>Enregistrer les infos du dépôt</span></button></div>" +
        "</div></div>" +

      pointagePanel() +

      '<div class="panel"><div class="panel__head"><h2>Mise en route (une seule fois)</h2></div>' +
        '<div class="panel__body"><div class="steps">' +
          '<div class="step"><p class="step__txt">Va sur <b>github.com</b> → ton avatar → <b>Settings</b> → tout en bas ' +
            "<b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → " +
            "<b>Generate new token</b>.</p></div>" +
          '<div class="step"><p class="step__txt">Dans <b>Repository access</b>, choisis <b>Only select repositories</b> ' +
            "et sélectionne le dépôt de ce site.</p></div>" +
          '<div class="step"><p class="step__txt">Dans <b>Permissions → Repository permissions</b>, mets ' +
            "<code>Contents</code> sur <b>Read and write</b>. Rien d'autre n'est nécessaire.</p></div>" +
          '<div class="step"><p class="step__txt">Copie le jeton généré, colle-le dans le champ ci-dessus, ' +
            "clique sur <b>Vérifier</b> puis sur <b>Publier maintenant</b>.</p></div>" +
        "</div></div></div>" +

      '<div class="panel"><div class="panel__head"><h2>Méthode manuelle (sans jeton)</h2></div>' +
        '<div class="panel__body editor">' +
          '<p class="hint">Si tu préfères ne pas utiliser de jeton : télécharge le fichier et remplace ' +
            "<code>" + esc(gh.path) + "</code> dans ton dépôt GitHub.</p>" +
          '<div class="row row--wrap">' +
            '<button class="btn btn--ghost" id="p-dl">' + svg("download") + "<span>Télécharger le fichier</span></button>" +
            '<button class="btn btn--ghost" id="p-copy">' + svg("copy") + "<span>Copier le contenu</span></button>" +
            '<button class="btn btn--ghost" id="p-import">' + svg("upload") + "<span>Importer un fichier</span></button>" +
            '<input type="file" id="p-file" accept=".json,application/json" hidden>' +
          "</div>" +
          '<details><summary class="subtitle" style="cursor:pointer;padding:6px 0">Voir le contenu du fichier</summary>' +
            '<pre class="jsonbox" style="margin-top:10px">' + esc(MNStore.toJSON(draft)) + "</pre></details>" +
        "</div></div>";

    /* --- actions --- */

    bindPointage();

    $("#p-go").addEventListener("click", () => publishNow(false));

    const share = $("#p-share");
    if (share) share.addEventListener("click", () => {
      const url = "https://" + (draft.settings.github.owner || "").toLowerCase() + ".github.io/" +
        (draft.settings.github.repo || "") + "/service.html";
      MNUI.copy(
        "**Pointage du service — à faire une seule fois**\n" +
        "1. Ouvre " + url + " et connecte-toi\n" +
        "2. Clique sur « Saisir le jeton »\n" +
        "3. Colle ceci :\n```\n" + MNGitHub.getToken() + "\n```\n" +
        "Garde-le pour toi, ne le partage avec personne.",
        "Message copié — envoie-le en privé, jamais dans un salon public"
      );
    });

    $("#p-auto").addEventListener("change", e => {
      localStorage.setItem(K_AUTO, e.target.checked ? "1" : "0");
      if (e.target.checked) {
        MNUI.toast("Publication automatique activée", "ok");
        if (MNStore.hasDraft()) queueAutoPublish();
      } else {
        clearTimeout(autoTimer);
        MNUI.toast("Publication automatique désactivée", "info");
      }
      renderDraftbar();
    });

    $("#p-save-repo").addEventListener("click", () => {
      draft.settings.github = {
        owner: $("#p-owner").value.trim(),
        repo: $("#p-repo").value.trim(),
        branch: $("#p-branch").value.trim() || "main",
        path: $("#p-path").value.trim() || "data/catalog.json"
      };
      commit();
      MNUI.toast("Infos du dépôt enregistrées", "ok");
    });

    $("#p-check").addEventListener("click", async () => {
      const box = $("#p-result");
      const tok = $("#p-token").value.trim();
      if (tok) MNGitHub.setToken(tok);
      if (!MNGitHub.hasToken()) {
        box.innerHTML = '<div class="alert alert--err">' + svg("alert") + "<span>Colle d'abord un jeton.</span></div>";
        return;
      }
      draft.settings.github = {
        owner: $("#p-owner").value.trim(),
        repo: $("#p-repo").value.trim(),
        branch: $("#p-branch").value.trim() || "main",
        path: $("#p-path").value.trim() || "data/catalog.json"
      };
      MNStore.saveDraft(draft);

      box.innerHTML = '<div class="alert alert--info">' + svg("refresh") + "<span>Vérification…</span></div>";
      try {
        const r = await MNGitHub.check();
        box.innerHTML = '<div class="alert alert--' + (r.canWrite ? "ok" : "warn") + '">' +
          svg(r.canWrite ? "check" : "alert") +
          "<span>Connecté à <b>" + esc(r.repo) + "</b>" + (r.login ? " en tant que <b>" + esc(r.login) + "</b>" : "") + ". " +
          (r.canWrite ? "Écriture autorisée — tu peux publier." :
            "Mais le jeton n'a pas le droit d'écrire. Repasse par l'étape 3.") +
          (r.fileExists ? "" : " Le fichier n'existe pas encore, il sera créé à la première publication.") +
          "</span></div>";
        $("#p-token").value = "";
      } catch (e) {
        box.innerHTML = '<div class="alert alert--err">' + svg("alert") + "<span>" + esc(e.message) + "</span></div>";
      }
    });

    const forget = $("#p-forget");
    if (forget) forget.addEventListener("click", e => {
      e.preventDefault();
      MNGitHub.forgetToken();
      MNUI.toast("Jeton oublié sur cet appareil", "ok");
      render();
    });

    $("#p-dl").addEventListener("click", () => {
      MNStore.download(draft, "catalog.json");
      MNUI.toast("Fichier téléchargé", "ok");
    });
    $("#p-copy").addEventListener("click", () => MNUI.copy(MNStore.toJSON(draft), "Contenu copié"));
    $("#p-import").addEventListener("click", () => $("#p-file").click());
    $("#p-file").addEventListener("change", e => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => {
        try {
          const data = JSON.parse(rd.result);
          const ok = await MNUI.confirm({
            title: "Importer ce fichier",
            message: "Le brouillon actuel sera entièrement remplacé par le contenu du fichier.",
            confirmLabel: "Importer", danger: true
          });
          if (!ok) return;
          draft = MNStore.saveDraft(data);
          MNAuth.refresh();
          render();
          MNUI.toast("Fichier importé", "ok");
        } catch (_) {
          MNUI.toast("Fichier illisible — ce n'est pas un JSON valide", "err");
        }
      };
      rd.readAsText(f);
    });
  }

  /* ---- Pointage partagé -------------------------------------------------------- */

  /**
   * Deux façons de rendre le pointage automatique pour toute l'équipe.
   * La base Firebase est la plus simple : aucun code à déployer.
   */
  function pointagePanel() {
    const base = draft.settings.dutyUrl || "";
    const relay = draft.settings.relay || "";
    const auto = !!(base || relay);

    return '<div class="panel"><div class="panel__head">' + svg("users") + "<h2>Pointage de l'équipe</h2>" +
        (auto ? '<span class="pill pill--ok">automatique</span>'
              : '<span class="pill pill--warn">à configurer</span>') +
      "</div>" +
      '<div class="panel__body editor">' +
        (auto
          ? '<div class="alert alert--ok">' + svg("check") +
            "<span><b>Tout est en place.</b> Les prises de service s'enregistrent pour toute l'équipe, " +
            "et <b>personne n'a rien à installer</b> — ni jeton, ni réglage." +
            (base ? " (base partagée)" : " (relais)") + "</span></div>"
          : '<div class="alert alert--warn">' + svg("alert") +
            "<span><b>Seuls les détenteurs d'un jeton apparaissent dans le tableau de service.</b> " +
            "Choisis une des deux options ci-dessous : après ça, tout est automatique.</span></div>") +

        '<div class="field"><label class="label" for="w-duty">Base partagée — <b>le plus simple</b></label>' +
          '<div class="copyfield">' +
            '<input class="input mono" id="w-duty" value="' + esc(base) +
              '" placeholder="https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app/duty">' +
            '<button class="btn btn--ghost" id="w-duty-test">' + svg("cloud") + "<span>Tester</span></button>" +
          "</div></div>" +
        '<div id="w-duty-msg"></div>' +

        '<details><summary class="subtitle" style="cursor:pointer;padding:8px 0">' +
          "Comment créer cette base (5 minutes, gratuit)</summary>" +
          '<div class="steps" style="margin-top:12px">' +
            '<div class="step"><p class="step__txt">Va sur <b>console.firebase.google.com</b> → ' +
              "<b>Créer un projet</b>. Donne-lui un nom, refuse Google Analytics.</p></div>" +
            '<div class="step"><p class="step__txt">Menu <b>Créer</b> → <b>Realtime Database</b> → ' +
              "<b>Créer une base de données</b>. Choisis la région <b>Europe</b>, puis " +
              "<b>Démarrer en mode verrouillé</b>.</p></div>" +
            '<div class="step"><p class="step__txt">Onglet <b>Règles</b>, remplace tout par ceci, ' +
              "puis <b>Publier</b> :</p>" +
              '<pre class="jsonbox" style="margin-top:8px">{\n  "rules": {\n    "duty": { ".read": true, ".write": true },\n    "$autre": { ".read": false, ".write": false }\n  }\n}</pre></div>' +
            '<div class="step"><p class="step__txt">Copie l\'adresse affichée en haut de la base ' +
              "(<code>https://…firebasedatabase.app</code>), <b>ajoute <code>/duty</code> à la fin</b>, " +
              "et colle le tout dans le champ ci-dessus. Teste, enregistre, publie.</p></div>" +
          "</div>" +
          '<p class="hint" style="margin-top:10px">Cette adresse est publique, comme tout le reste du ' +
            "site. Les règles ci-dessus font que seule la partie <code>duty</code> est accessible : " +
            "personne ne peut toucher au catalogue, aux employés ni au dépôt. Au pire, quelqu'un de " +
            "motivé pourrait salir le tableau de pointage.</p>" +
        "</details>" +

        '<div class="field" style="margin-top:6px">' +
          '<label class="label" for="w-relay">Relais — si tu veux aussi masquer les webhooks</label>' +
          '<div class="copyfield">' +
            '<input class="input mono" id="w-relay" value="' + esc(relay) +
              '" placeholder="https://mon-relais.workers.dev">' +
            '<button class="btn btn--ghost" id="w-relay-test">' + svg("cloud") + "<span>Tester</span></button>" +
          "</div></div>" +
        '<div id="w-relay-msg"></div>' +
        '<p class="hint">Un petit service à déployer (code prêt dans <code>relais.js</code>, ' +
          "~10 min). Il fait la même chose pour le pointage, <b>et en plus</b> il sort les adresses " +
          "Discord du dépôt. Si les deux champs sont remplis, la base partagée est utilisée pour le " +
          "pointage et le relais pour Discord.</p>" +

        '<details style="margin-top:6px"><summary class="subtitle" style="cursor:pointer;padding:6px 0">' +
          "Dépannage : partager mon jeton en attendant</summary>" +
          '<p class="hint" style="margin:10px 0">À éviter si possible : ce jeton donne le droit ' +
            "d'écrire sur <b>tout</b> le dépôt. Envoie-le en message privé, jamais dans un salon, et " +
            "régénère-le dès que l'une des deux options ci-dessus fonctionne.</p>" +
          '<button class="btn btn--ghost btn--sm" id="p-share"' + (MNGitHub.hasToken() ? "" : " disabled") + ">" +
            svg("copy") + "<span>Copier le message</span></button>" +
        "</details>" +

        '<div class="row" style="justify-content:flex-end;margin-top:4px">' +
          '<button class="btn btn--primary" id="w-pointage-save">' + svg("save") +
            "<span>Enregistrer</span></button></div>" +
      "</div></div>";
  }

  /** Écouteurs du bloc « Pointage de l'équipe ». */
  function bindPointage() {
    const lire = () => ({
      duty: $("#w-duty").value.trim(),
      relay: $("#w-relay").value.trim()
    });

    $("#w-pointage-save").addEventListener("click", () => {
      const v = lire();
      for (const [champ, nom] of [[v.duty, "la base partagée"], [v.relay, "le relais"]]) {
        if (champ && !/^https:\/\/.+/i.test(champ)) {
          return MNUI.toast("L'adresse de " + nom + " doit commencer par https://", "err");
        }
      }
      draft.settings.dutyUrl = v.duty;
      draft.settings.relay = v.relay;
      commit();
      MNUI.toast("Réglages du pointage enregistrés dans le brouillon", "ok");
    });

    /* Test de la base : on lit la clé, ce qui valide adresse ET règles. */
    $("#w-duty-test").addEventListener("click", async () => {
      const box = $("#w-duty-msg");
      let url = $("#w-duty").value.trim().replace(/\/+$/, "");
      if (!/^https:\/\/.+/i.test(url)) {
        box.innerHTML = '<div class="alert alert--err">' + svg("alert") +
          "<span>Colle d'abord l'adresse de ta base (https://…).</span></div>";
        return;
      }
      if (!/\.json$/i.test(url)) url += ".json";
      box.innerHTML = '<div class="alert alert--info">' + svg("refresh") + "<span>Test en cours…</span></div>";

      try {
        const lu = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
        if (!lu.ok) {
          box.innerHTML = '<div class="alert alert--err">' + svg("alert") +
            "<span>Lecture refusée (" + lu.status + "). Vérifie les règles : la clé " +
            "<code>duty</code> doit avoir <code>.read: true</code>.</span></div>";
          return;
        }
        /* Écriture d'une valeur témoin, puis on remet ce qu'il y avait. */
        const avant = await lu.json();
        const ecrit = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(avant === null ? { updatedAt: new Date(0).toISOString(), onDuty: [], log: [] } : avant)
        });
        box.innerHTML = ecrit.ok
          ? '<div class="alert alert--ok">' + svg("check") +
            "<span>Lecture et écriture confirmées. Enregistre, publie, et toute l'équipe pourra " +
            "pointer sans rien installer.</span></div>"
          : '<div class="alert alert--err">' + svg("alert") +
            "<span>Écriture refusée (" + ecrit.status + "). Vérifie <code>.write: true</code> " +
            "sur la clé <code>duty</code>.</span></div>";
      } catch (_) {
        box.innerHTML = '<div class="alert alert--err">' + svg("alert") +
          "<span>Base injoignable. Vérifie l'adresse copiée depuis Firebase.</span></div>";
      }
    });

    $("#w-relay-test").addEventListener("click", async () => {
      const url = $("#w-relay").value.trim();
      const box = $("#w-relay-msg");
      if (!/^https:\/\/.+/i.test(url)) {
        box.innerHTML = '<div class="alert alert--err">' + svg("alert") +
          "<span>Colle d'abord l'adresse de ton relais (https://…).</span></div>";
        return;
      }
      box.innerHTML = '<div class="alert alert--info">' + svg("refresh") + "<span>Test en cours…</span></div>";
      try {
        /* Type inconnu : le relais doit répondre proprement, sans rien écrire. */
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ping" })
        });
        const j = await r.json().catch(() => ({}));
        const vivant = r.status === 400 && /Type inconnu/i.test(j.error || "");
        box.innerHTML = '<div class="alert alert--' + (vivant ? "ok" : "warn") + '">' +
          svg(vivant ? "check" : "alert") +
          "<span>" + (vivant
            ? "Le relais répond correctement."
            : "Réponse inattendue (" + r.status + ") — vérifie que tu as bien collé le code de " +
              "<code>relais.js</code> et déployé le worker.") + "</span></div>";
      } catch (_) {
        box.innerHTML = '<div class="alert alert--err">' + svg("alert") +
          "<span>Relais injoignable. Vérifie l'adresse, et que <code>ORIGINE</code> vaut bien " +
          "l'adresse de ton site.</span></div>";
      }
    });
  }

  /* ---- Envoi vers GitHub ------------------------------------------------------ */

  /**
   * @param {boolean} auto  true = déclenché par la publication automatique
   *                        (pas de fenêtre d'erreur bloquante).
   */
  async function publishNow(auto) {
    if (publishing) return;
    clearTimeout(autoTimer);

    if (!MNAuth.can("publish")) return MNUI.toast("Tu n'as pas la permission de publier", "err");

    if (!MNGitHub.hasToken() || !MNGitHub.isConfigured()) {
      if (auto) return;                       // rien à signaler, l'auto est simplement inactif
      tab = "publish"; render();
      MNUI.toast(MNGitHub.hasToken()
        ? "Renseigne le propriétaire et le nom du dépôt"
        : "Configure d'abord le jeton GitHub (4 étapes ci-dessous)", "err");
      return;
    }

    const stamp = draft.updatedAt;
    publishing = true;
    renderDraftbar();

    try {
      const me = MNAuth.session();
      const info = await MNGitHub.publish(
        MNStore.toJSON(draft),
        "Catalogue mis à jour par " + me.pseudo + (auto ? " (publication automatique)" : "")
      );
      localStorage.setItem(K_STAMP, stamp);
      MNUI.toast((auto ? "Envoyé automatiquement" : "Publié !") +
        " Le site sera à jour dans ~1 minute" + (info.commit ? " (" + info.commit + ")" : ""), "ok");
    } catch (e) {
      if (auto) {
        MNUI.toast("Envoi automatique impossible : " + e.message, "err");
      } else {
        MNUI.modal({
          title: "La publication a échoué",
          body: '<div class="alert alert--err">' + svg("alert") + "<span>" + esc(e.message) + "</span></div>" +
            '<p class="hint" style="margin-top:12px">Vérifie le jeton et les infos du dépôt dans l\'onglet ' +
            "« Publier », puis réessaie. Rien n'est perdu : tes modifications sont toujours dans le brouillon.</p>",
          actions: [{ label: "Compris", variant: "btn--primary", onClick: c => c() }]
        });
      }
    } finally {
      publishing = false;
      /* Le brouillon a encore bougé pendant l'envoi ? On repart pour un tour. */
      if (draft.updatedAt !== localStorage.getItem(K_STAMP)) queueAutoPublish();
      if (tab === "publish") render(); else renderDraftbar();
    }
  }
})();
