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
    { id: "users",   name: "Employés",   icon: "users",    perm: "users", n: () => draft.users.length },
    { id: "site",    name: "Le site",    icon: "settings", perm: "admin" },
    { id: "publish", name: "Publier",    icon: "cloud",    perm: "publish" }
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
      items: paneItems, cats: paneCats, res: paneRes,
      users: paneUsers, site: paneSite, publish: panePublish
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
      id: "", name: "", category: draft.categories[0].id, icon: "i-box", enabled: true, note: "", cost: {}
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

      '<div class="field"><label class="label" for="e-note">Note (facultatif)</label>' +
        '<input class="input" id="e-note" maxlength="90" value="' + esc(cur.note) + '" placeholder="Précision affichée sous le nom"></div>' +

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
              enabled: body.querySelector("#e-on").checked,
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
        '<span class="subtitle">Qui peut se connecter, et avec quels droits</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--primary" id="add">' + svg("plus") + "<span>Nouvel employé</span></button>" +
      "</div>" +
      (draft.users.length
        ? '<div class="rows">' + draft.users.map(u => userRow(u, me)).join("") + "</div>"
        : '<div class="empty">' + svg("users") + "<b>Aucun employé</b>" +
          "<p>Ajoute les pseudos de ton équipe pour qu'ils puissent se connecter.</p></div>") +
      '<div class="alert alert--info" style="margin-top:6px">' + svg("info") +
        "<span>Le pseudo est la seule chose à retenir. Le code d'accès est facultatif : " +
        "utile pour les comptes qui gèrent le catalogue ou l'équipe.</span></div>";

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
    const perms = MNAuth.effectivePerms(u);
    const tags = perms.length
      ? (u.perms.indexOf("admin") !== -1
          ? '<span class="permtag">Patron — tous les droits</span>'
          : perms.map(p => {
              const d = MN_PERMS.find(x => x.key === p);
              return '<span class="permtag">' + esc(d ? d.name : p) + "</span>";
            }).join(""))
      : '<span class="permtag permtag--none">aucun droit</span>';

    return '<div class="trow' + (u.active ? "" : " is-off") + '" data-row="' + esc(u.id) + '">' +
      '<div class="userchip__av" style="width:38px;height:38px;flex:none">' + esc(MNUI.initials(u.pseudo)) + "</div>" +
      '<div class="trow__main">' +
        "<b>" + esc(u.pseudo) +
          (me.uid === u.id ? ' <span class="pill pill--outline">toi</span>' : "") +
          (u.pin ? " " + svg("lock", "inline-lock") : "") +
          (u.active ? "" : ' <span class="pill pill--dim">désactivé</span>') +
        "</b>" +
        '<div class="trow__meta"><i>' + esc(u.role) + '</i></div>' +
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
    const cur = u || { pseudo: "", role: "Mécano", perms: ["bt"], pin: null, active: true };
    let perms = cur.perms.slice();

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="u-pseudo">Pseudo (sert à se connecter)</label>' +
          '<input class="input" id="u-pseudo" maxlength="32" value="' + esc(cur.pseudo) + '" placeholder="Ex. Rico"></div>' +
        '<div class="field"><label class="label" for="u-role">Poste</label>' +
          '<input class="input" id="u-role" maxlength="28" value="' + esc(cur.role) + '" placeholder="Ex. Chef d\'atelier"></div>' +
      "</div>" +

      '<div class="fieldset"><span class="label">Permissions</span><div class="perms" id="u-perms"></div></div>' +

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
      (isMe ? '<p class="hint hint--warn">Tu modifies ton propre compte : tu ne peux ni le désactiver, ' +
        "ni te retirer la gestion des employés (sécurité anti-blocage).</p>" : "");

    let clearPin = false;
    const clearBtn = body.querySelector("#u-pin-clear");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      clearPin = true;
      clearBtn.disabled = true;
      clearBtn.innerHTML = svg("check") + "<span>Code retiré à l'enregistrement</span>";
    });

    const permsHost = body.querySelector("#u-perms");
    function paintPerms() {
      const isAdmin = perms.indexOf("admin") !== -1;
      permsHost.innerHTML = MN_PERMS.map(p => {
        const on = isAdmin || perms.indexOf(p.key) !== -1;
        const locked = (isAdmin && p.key !== "admin") ||
          (isMe && (p.key === "users" || p.key === "admin") && perms.indexOf(p.key) !== -1);
        return '<label class="perm' + (on ? " is-on" : "") + (locked ? " is-locked" : "") + '" data-p="' + p.key + '">' +
          '<span class="perm__box">' + svg("check") + "</span>" +
          '<span class="perm__txt"><b>' + esc(p.name) + "</b><span>" + esc(p.desc) + "</span></span></label>";
      }).join("");

      permsHost.querySelectorAll("[data-p]").forEach(l => l.addEventListener("click", () => {
        if (l.classList.contains("is-locked")) return;
        const k = l.dataset.p;
        const i = perms.indexOf(k);
        if (i === -1) perms.push(k); else perms.splice(i, 1);
        paintPerms();
      }));
    }
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

            const role = body.querySelector("#u-role").value.trim() || "Mécano";
            const pin = body.querySelector("#u-pin").value.trim();
            const active = body.querySelector("#u-active").checked;

            if (isNew) {
              const id = MNStore.uniqueId(pseudo, draft.users.map(x => x.id));
              draft.users.push({
                id, pseudo, role, perms, active,
                pin: pin ? MNAuth.hashPin(id, pin) : null,
                createdAt: new Date().toISOString()
              });
            } else {
              u.pseudo = pseudo; u.role = role; u.perms = perms;
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

    $("#p-go").addEventListener("click", () => publishNow(false));

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
