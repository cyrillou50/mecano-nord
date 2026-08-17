/* ==========================================================================
   Page de facturation : catalogue, panier, bons de travail.
   Le « coût » d'un objet, ce sont ses ressources — il n'y a pas d'argent.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc, num = MNUI.num;

  let cart = {};
  let lastResKey = "";
  let activeCat = localStorage.getItem("mn.cat") || "all";
  let activeSub = localStorage.getItem("mn.sub") || "";
  /* Catégories repliées sur cette page, gardées dans ce navigateur. */
  const plis = MNUI.folds("mn.fact.folds");
  let showCosts = localStorage.getItem("mn.showCosts") === "1";
  let canBT = false;

  MNUI.start({ page: "fact", title: "Facturation", onReady: init });

  /* ---- Démarrage --------------------------------------------------------- */

  function init() {
    canBT = MNAuth.can("bt");
    cart = MNStore.getCart();

    /* La catégorie mémorisée peut avoir été supprimée entre-temps, ou être
       devenue une sous-catégorie : dans ce cas on remonte sur son parent. */
    const memo = activeCat !== "all" && MNStore.categoryById(activeCat);
    if (activeCat !== "all" && !memo) activeCat = "all";
    else if (memo && memo.parent) { activeSub = memo.id; activeCat = memo.parent; }
    if (activeSub && activeSub !== "__direct") {
      const s = MNStore.categoryById(activeSub);
      if (!s || s.parent !== activeCat) activeSub = "";
    }

    bindCostsToggle();
    bindDock();
    bindHistory();
    renderTabs();
    renderCatalog();
    renderDock();

    new ResizeObserver(syncDockHeight).observe($("#dock"));
    syncDockHeight();
  }

  /* Écrire une variable CSS sur <html> invalide les styles de toute la page :
     on ne le fait que si la valeur a réellement changé. */
  let lastDockH = -1;
  function syncDockHeight() {
    const h = $("#dock").offsetHeight;
    if (h === lastDockH) return;
    lastDockH = h;
    document.documentElement.style.setProperty("--dock-h", h + "px");
  }

  /* ---- Affichage des coûts -------------------------------------------------- */

  function bindCostsToggle() {
    const btn = $("#btn-costs");
    const paint = () => {
      btn.classList.toggle("btn--primary", showCosts);
      btn.classList.toggle("btn--ghost", !showCosts);
      btn.innerHTML = svg(showCosts ? "check" : "layers") + "<span>Coûts</span>";
      btn.title = showCosts ? "Masquer les ressources sur les cartes" : "Afficher les ressources sur les cartes";
    };
    paint();
    btn.addEventListener("click", () => {
      showCosts = !showCosts;
      localStorage.setItem("mn.showCosts", showCosts ? "1" : "0");
      paint(); renderCatalog();
    });
  }

  /* ---- Onglets de catégories -------------------------------------------------- */

  const visibleItems = () => MNStore.catalog().items.filter(i => i.enabled);

  /** Les objets visibles d'une catégorie, sous-catégories comprises. */
  const itemsUnder = id => {
    const scope = MNStore.categoryScope(id);
    return visibleItems().filter(i => scope.indexOf(i.category) !== -1);
  };

  function renderTabs() {
    const host = $("#cattabs");
    const all = visibleItems();

    const tab = (id, name, icon, items) => {
      const picked = items.reduce((n, i) => n + (cart[i.id] || 0), 0);
      return '<button class="cattab' + (activeCat === id ? " is-active" : "") + '" data-cat="' + esc(id) + '">' +
        (icon ? mnIcon(icon) : svg("layers")) +
        "<span>" + esc(name) + "</span>" +
        '<span class="cattab__n">' + items.length + "</span>" +
        (picked ? '<span class="cattab__dot">' + picked + "</span>" : "") +
      "</button>";
    };

    host.innerHTML =
      // tab("all", "Customs", null, all) +
      MNStore.topCategories()
        /* Une catégorie compte pour ce qu'elle contient, directement ou par
           ses sous-catégories. */
        .map(c => ({ c, items: itemsUnder(c.id) }))
        .filter(x => x.items.length)
        .map(x => tab(x.c.id, x.c.name, x.c.icon, x.items))
        .join("");

    host.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
      if (activeCat === b.dataset.cat) return;
      activeCat = b.dataset.cat;
      activeSub = "";                       // on repart du contenu complet
      localStorage.setItem("mn.cat", activeCat);
      localStorage.setItem("mn.sub", "");
      host.querySelectorAll("[data-cat]").forEach(x => x.classList.toggle("is-active", x === b));
      renderSubTabs();
      renderCatalog();
    }));

    renderSubTabs();
  }

  /**
   * Deuxième rangée, affichée seulement quand la catégorie active se divise.
   * « Tout » y figure toujours : sans lui, on ne pourrait plus voir d'un coup
   * ce que contient la catégorie.
   */
  function renderSubTabs() {
    const host = $("#subtabs");
    const subs = MNStore.subCategories(activeCat)
      .map(c => ({ c, items: visibleItems().filter(i => i.category === c.id) }))
      .filter(x => x.items.length);

    if (!subs.length) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.hidden = false;

    const direct = visibleItems().filter(i => i.category === activeCat);
    const onglet = (id, name, icon, items) => {
      const picked = items.reduce((n, i) => n + (cart[i.id] || 0), 0);
      return '<button class="subtab' + (activeSub === id ? " is-active" : "") +
        '" data-sub="' + esc(id) + '">' +
        (icon ? mnIcon(icon) : "") +
        "<span>" + esc(name) + "</span>" +
        '<span class="subtab__n">' + items.length + "</span>" +
        (picked ? '<span class="subtab__dot">' + picked + "</span>" : "") +
      "</button>";
    };

    host.innerHTML =
      onglet("", "Tout", null, itemsUnder(activeCat)) +
      /* Les objets rangés dans la catégorie elle-même méritent leur onglet,
         sinon ils ne seraient joignables que par « Tout ». */
      (direct.length ? onglet("__direct", "Autres", null, direct) : "") +
      subs.map(x => onglet(x.c.id, x.c.name, x.c.icon, x.items)).join("");

    host.querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => {
      if (activeSub === b.dataset.sub) return;
      activeSub = b.dataset.sub;
      localStorage.setItem("mn.sub", activeSub);
      host.querySelectorAll("[data-sub]").forEach(x => x.classList.toggle("is-active", x === b));
      renderCatalog();
    }));
  }

  /**
   * Met à jour uniquement les pastilles de quantité des onglets.
   * Reconstruire toute la barre à chaque clic recréait les images des
   * catégories — inutile et coûteux.
   */
  function updateTabBadges() {
    const all = visibleItems();

    const poser = (btn, items, classe) => {
      const picked = items.reduce((n, i) => n + (cart[i.id] || 0), 0);
      let dot = btn.querySelector("." + classe);
      if (!picked) { if (dot) dot.remove(); return; }
      if (!dot) {
        dot = document.createElement("span");
        dot.className = classe;
        btn.appendChild(dot);
      }
      if (dot.textContent !== String(picked)) dot.textContent = picked;
    };

    $("#cattabs").querySelectorAll("[data-cat]").forEach(btn => {
      const id = btn.dataset.cat;
      poser(btn, id === "all" ? all : itemsUnder(id), "cattab__dot");
    });

    $("#subtabs").querySelectorAll("[data-sub]").forEach(btn => {
      const id = btn.dataset.sub;
      const items = id === ""
        ? itemsUnder(activeCat)
        : all.filter(i => i.category === (id === "__direct" ? activeCat : id));
      poser(btn, items, "subtab__dot");
    });
  }

  /* ---- Catalogue ----------------------------------------------------------- */

  function renderCatalog() {
    const cat = MNStore.catalog();
    const host = $("#catalog");
    const empty = $("#empty");

    if (!visibleItems().length) {
      host.innerHTML = "";
      empty.hidden = false;
      empty.innerHTML = svg("box") + "<b>Le catalogue est vide</b>" +
        "<p>Un responsable doit ajouter des objets depuis le panneau admin.</p>";
      return;
    }
    empty.hidden = true;

    /* Chaque bloc est une catégorie ou une sous-catégorie. Le titre n'apparaît
       que s'il y en a plusieurs : au-dessus d'une liste unique, il ne dirait
       rien que l'onglet actif ne dise déjà. */
    let blocs;
    if (activeCat === "all") {
      blocs = cat.categories;
    } else if (activeSub === "__direct") {
      blocs = cat.categories.filter(c => c.id === activeCat);
    } else if (activeSub) {
      blocs = cat.categories.filter(c => c.id === activeSub);
    } else {
      blocs = cat.categories.filter(c => c.id === activeCat || c.parent === activeCat);
    }

    const remplis = blocs
      .map(c => ({ c, items: visibleItems().filter(i => i.category === c.id) }))
      .filter(x => x.items.length);

    /* Les titres n'apparaissent qu'à partir de deux blocs — et avec eux la
       possibilité de replier. Sur un bloc unique il n'y aurait rien à
       refermer, l'onglet actif dit déjà de quoi il s'agit. */
    const titres = remplis.length > 1;
    host.innerHTML = remplis.map(x => {
      const plie = titres && plis.has(x.c.id);
      return '<section class="cat' + (plie ? " is-folded" : "") + '">' +
        (titres
          ? '<h2 class="section-title fold" data-fold="' + esc(x.c.id) +
            '" role="button" tabindex="0" aria-expanded="' + (plie ? "false" : "true") + '">' +
            svg("chevDown", "fold__chev") + esc(x.c.name) +
            '<span class="count">' + x.items.length + "</span></h2>"
          : "") +
        '<div class="fold__body"><div class="grid">' + x.items.map(itemCard).join("") + "</div></div>" +
      "</section>";
    }).join("");

    host.querySelectorAll("[data-fold]").forEach(h => {
      const bascule = () => {
        const plie = plis.toggle(h.dataset.fold);
        h.parentElement.classList.toggle("is-folded", plie);
        h.setAttribute("aria-expanded", plie ? "false" : "true");
      };
      h.addEventListener("click", bascule);
      h.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        bascule();
      });
    });
  }

  function costChips(it, unit) {
    return Object.keys(it.cost).map(rid => {
      const r = MNStore.resourceById(rid);
      if (!r) return "";
      return '<span style="color:' + esc(r.color) + '">' + mnIcon(r.icon) +
        '<i style="font-style:normal;color:var(--muted)">' + num(it.cost[rid] * (unit || 1)) + "</i></span>";
    }).join("");
  }

  /** Plafond de cet objet ; 0 dans les données = illimité. */
  const capOf = it => (it.max > 0 ? it.max : 999);

  /**
   * Objet déjà au panier qui rend celui-ci indisponible.
   * L'incompatibilité vaut dans les deux sens : la déclarer d'un côté suffit.
   */
  function blockerOf(it) {
    const ids = Object.keys(cart).filter(id => cart[id] > 0 && id !== it.id);
    for (let i = 0; i < ids.length; i++) {
      const other = MNStore.itemById(ids[i]);
      if (!other) continue;
      if ((it.excludes || []).indexOf(other.id) !== -1 ||
          (other.excludes || []).indexOf(it.id) !== -1) return other;
    }
    return null;
  }

  function itemCard(it) {
    const qty = cart[it.id] || 0;
    const chips = costChips(it);
    const cap = capOf(it);
    const full = qty >= cap;
    const blocker = qty ? null : blockerOf(it);

    return '<article class="item' + (qty ? " is-picked" : "") + (full ? " is-full" : "") +
      (blocker ? " is-blocked" : "") +
      '" data-id="' + esc(it.id) + '" title="' +
      (blocker ? esc("Incompatible avec « " + blocker.name + " »") : "Clic = +1 · clic droit = −1 · Maj = ±5") + '">' +
      (qty ? '<span class="item__badge">' + qty + "</span>" : "") +
      (it.max > 0 && !blocker
        ? '<span class="item__cap" title="Maximum ' + it.max + ' par bon de travail">max ' + it.max + "</span>"
        : "") +
      (blocker ? '<span class="item__lock">' + svg("lock") + "</span>" : "") +
      '<div class="item__icon">' + mnIcon(it.icon) + "</div>" +
      '<h3 class="item__name">' + esc(MNStore.itemLabel(it, qty)) + "</h3>" +
      (blocker
        ? '<p class="item__note item__note--block">Incompatible avec ' + esc(blocker.name) + "</p>"
        : it.note ? '<p class="item__note">' + esc(it.note) + "</p>" : "") +
      /* Dans le flux, sous le nom : les deux coins hauts sont déjà pris par le
         plafond et le compteur, et le bas par les ressources. */
      (it.temps > 0
        ? '<p class="item__temps" title="Temps de fabrication, cumulé sur le bon de travail">' +
          svg("history") + "<span>" + esc(MNStore.duree(it.temps)) + "</span></p>"
        : "") +
      '<div class="stepper">' +
        '<button data-act="dec" aria-label="Retirer"' + (qty ? "" : " disabled") + ">" + svg("minus") + "</button>" +
        '<input class="stepper__val" type="text" inputmode="numeric" value="' + qty + '"' +
          ' aria-label="Quantité de ' + esc(it.name) + '"' + (blocker ? " disabled" : "") + " data-qty>" +
        '<button data-act="inc" aria-label="Ajouter"' + (full || blocker ? " disabled" : "") + ">" +
          svg("plus") + "</button>" +
      "</div>" +
      (showCosts && chips ? '<div class="item__cost">' + chips + "</div>" : "") +
    "</article>";
  }

  /* Un seul écouteur pour toutes les cartes : les boutons du compteur d'abord,
     puis le reste de la carte qui vaut « +1 ». */
  document.addEventListener("click", e => {
    const card = e.target.closest(".item");
    if (!card) return;
    const id = card.dataset.id;
    const step = e.shiftKey ? 5 : 1;

    /* Le champ de saisie gère ses propres clics. */
    if (e.target.closest("[data-qty]")) return;

    const btn = e.target.closest(".stepper button[data-act]");
    if (btn) {
      if (btn.disabled) return;
      setQty(id, (cart[id] || 0) + (btn.dataset.act === "inc" ? step : -step));
      return;
    }
    setQty(id, (cart[id] || 0) + step);
  });

  /* ---- Saisie du nombre au clavier -------------------------------------------- */

  /* Sélection du contenu au clic, pour taper directement par-dessus. */
  document.addEventListener("focusin", e => {
    if (e.target.matches("[data-qty]")) e.target.select();
  });

  document.addEventListener("input", e => {
    const f = e.target;
    if (!f.matches("[data-qty]")) return;
    const clean = f.value.replace(/[^\d]/g, "").slice(0, 3);
    if (f.value !== clean) f.value = clean;
  });

  document.addEventListener("keydown", e => {
    const f = e.target;
    if (!f.matches("[data-qty]")) return;
    const card = f.closest(".item");
    const id = card.dataset.id;

    if (e.key === "Enter") { e.preventDefault(); f.blur(); return; }
    if (e.key === "Escape") { e.preventDefault(); f.value = cart[id] || 0; f.blur(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setQty(id, (cart[id] || 0) + (e.shiftKey ? 5 : 1)); }
    if (e.key === "ArrowDown") { e.preventDefault(); setQty(id, (cart[id] || 0) - (e.shiftKey ? 5 : 1)); }
  });

  document.addEventListener("focusout", e => {
    const f = e.target;
    if (!f.matches("[data-qty]")) return;
    if (patching) return;              // focus perdu à cause d'un redessin, pas d'une action
    const card = f.closest(".item");
    if (!card) return;
    const id = card.dataset.id;
    const asked = Math.round(Number(f.value) || 0);
    const it = MNStore.itemById(id);
    const cap = it ? capOf(it) : 999;

    if (it && it.max > 0 && asked > it.max) {
      MNUI.toast(it.name + " : " + it.max + " maximum par bon de travail", "err");
    }
    setQty(id, Math.min(asked, cap));
  });

  /* Clic droit sur une carte = retirer un. */
  document.addEventListener("contextmenu", e => {
    const card = e.target.closest(".item");
    if (!card) return;
    e.preventDefault();
    setQty(card.dataset.id, (cart[card.dataset.id] || 0) - 1);
  });

  function setQty(id, v) {
    const it = MNStore.itemById(id);
    const before = cart[id] || 0;

    /* On ne peut pas ajouter un objet incompatible avec le panier en cours. */
    if (it && v > before) {
      const blocker = blockerOf(it);
      if (blocker) {
        MNUI.toast(it.name + " est incompatible avec « " + blocker.name + " » déjà au panier", "err");
        return;
      }
    }

    const q = Math.max(0, Math.min(it ? capOf(it) : 999, Math.round(v)));

    /* On prévient quand la limite bloque réellement une hausse. */
    if (it && it.max > 0 && q === it.max && v > it.max && before < it.max) {
      MNUI.toast(it.name + " : limité à " + it.max + " par bon de travail", "info");
    }
    if (q) cart[id] = q; else delete cart[id];
    cart = MNStore.setCart(cart);

    /* Entrer ou sortir du panier change ce qui est bloqué ailleurs :
       dans ce cas seulement, on redessine tout le catalogue. */
    const entreOuSort = (before === 0) !== (q === 0);
    if (entreOuSort && hasExclusions(id)) renderCatalog();
    else patchCard(id);

    updateTabBadges();
    renderDock();
  }

  /** Cet objet est-il impliqué dans une incompatibilité ? */
  function hasExclusions(id) {
    const it = MNStore.itemById(id);
    if (it && (it.excludes || []).length) return true;
    return MNStore.catalog().items.some(x => (x.excludes || []).indexOf(id) !== -1);
  }

  /** Redessine une seule carte plutôt que tout le catalogue. */
  let patching = false;
  function patchCard(id) {
    if (patching) return;              // rendre le focus déclenche un focusout : pas de ré-entrance
    const card = document.querySelector('.item[data-id="' + CSS.escape(id) + '"]');
    const it = MNStore.itemById(id);
    if (!card || !it || !card.isConnected) return;

    /* Si la personne était en train de taper la quantité, on lui rend le champ. */
    const wasTyping = document.activeElement && card.contains(document.activeElement) &&
      document.activeElement.matches("[data-qty]");

    patching = true;
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = itemCard(it);
      const fresh = tmp.firstElementChild;
      card.replaceWith(fresh);
      if (wasTyping) {
        const f = fresh.querySelector("[data-qty]");
        if (f) { f.focus(); f.select(); }
      }
    } finally {
      patching = false;
    }
  }

  /* ---- Barre du bas -------------------------------------------------------- */

  function bindDock() {
    $("#dock-grab").addEventListener("click", () => {
      $("#dock").classList.toggle("is-collapsed");
      syncDockHeight();
    });
    $("#btn-save").addEventListener("click", openSaveModal);
    $("#btn-reset").addEventListener("click", resetCart);
  }

  function renderDock() {
    const t = MNStore.totals(cart);
    const res = $("#dock-res");

    $("#dock-count").textContent = t.count + (t.count > 1 ? " objets" : " objet");
    $("#dock-count").classList.toggle("pill--pink", t.count > 0);

    const kinds = $("#dock-kinds");
    kinds.hidden = !t.resources.length;
    kinds.textContent = t.resources.length + (t.resources.length > 1 ? " ressources" : " ressource");

    /* Temps de fabrication cumulé. Il ne s'affiche que si au moins un objet
       du panier en porte un : une pastille à zéro n'apprendrait rien. */
    const temps = $("#dock-temps");
    temps.hidden = !t.minutes;
    temps.textContent = MNStore.duree(t.minutes) + " de fabrication";

    $("#dock-mini-txt").textContent = t.count
      ? t.count + (t.count > 1 ? " objets" : " objet") +
        " · " + t.resources.length + " ressource" + (t.resources.length > 1 ? "s" : "") +
        (t.minutes ? " · " + MNStore.duree(t.minutes) : "")
      : "Panier vide";

    if (!t.resources.length) {
      res.innerHTML = "";
      lastResKey = "";
      $("#dock-empty").hidden = false;
    } else {
      $("#dock-empty").hidden = true;
      const key = t.resources.map(r => r.resource.id).join("|");

      /* Tant que ce sont les mêmes ressources, on ne remplace que les nombres :
         inutile de recréer les icônes à chaque clic. */
      if (key === lastResKey) {
        const vals = res.querySelectorAll(".res__txt span");
        t.resources.forEach((r, i) => {
          const txt = "×" + num(r.qty);
          if (vals[i] && vals[i].textContent !== txt) vals[i].textContent = txt;
        });
      } else {
        lastResKey = key;
        res.innerHTML = t.resources.map(r =>
          '<div class="res">' +
            '<div class="res__ico" style="color:' + esc(r.resource.color) + '">' + mnIcon(r.resource.icon) + "</div>" +
            '<div class="res__txt"><b>' + esc(r.resource.name) + "</b><span>×" + num(r.qty) + "</span></div>" +
          "</div>"
        ).join("");
      }
    }

    $("#btn-save").disabled = !t.count || !canBT;
    $("#btn-save").title = canBT ? "" : "Tu n'as pas la permission d'enregistrer des BT.";
    $("#btn-reset").disabled = !t.count;
    syncDockHeight();
  }

  async function resetCart() {
    const ok = await MNUI.confirm({
      title: "Tout réinitialiser",
      message: "Le panier en cours sera vidé. L'historique des BT déjà enregistrés n'est pas touché.",
      confirmLabel: "Vider le panier", danger: true
    });
    if (!ok) return;
    cart = MNStore.setCart({});
    renderTabs(); renderCatalog(); renderDock();
    MNUI.toast("Panier vidé", "ok");
  }

  /* ---- Enregistrement d'un BT ------------------------------------------------ */

  function newRef() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return "BT-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function openSaveModal() {
    const t = MNStore.totals(cart);
    if (!t.count) return;

    const recap =
      '<div class="recap">' +
        t.lines.map(l =>
          '<div class="recap__line">' + mnIcon(l.item.icon) +
            "<b>" + esc(MNStore.itemLabel(l.item, l.qty)) + "</b>" +
            '<span class="recap__chips">' + costChips(l.item, l.qty) + "</span>" +
            "<i>×" + l.qty + "</i>" +
          "</div>"
        ).join("") +
        '<div class="recap__total">Ressources' +
          "<span>" + t.resources.map(r => esc(r.resource.name) + " ×" + num(r.qty)).join("  ·  ") + "</span>" +
        "</div>" +
        (t.minutes
          ? '<div class="recap__total">Temps de fabrication<span>' +
            esc(MNStore.duree(t.minutes)) + "</span></div>"
          : "") +
      "</div>";

    const form =
      '<div class="field" style="margin-bottom:14px"><label class="label" for="f-client">Client</label>' +
        '<input class="input" id="f-client" placeholder="Nom du client" maxlength="60"></div>' +
      '<div class="field"><label class="label" for="f-note">Note</label>' +
        '<textarea class="textarea" id="f-note" placeholder="Remarques, pièces à commander…" maxlength="400"></textarea></div>';

    MNUI.modal({
      title: "Enregistrer le bon de travail",
      body: recap + form,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        { label: "Enregistrer", variant: "btn--solid", icon: "save", onClick: (c, b) => { save(b, false); c(); } }
      ]
    });

    function save(body, doCopy) {
      const g = sel => ((body.querySelector(sel) || {}).value || "").trim();
      const s = MNAuth.session();
      const bt = {
        ref: newRef(),
        at: Date.now(),
        by: s ? s.pseudo : "?",
        client: g("#f-client"),
        note: g("#f-note"),
        /* Le nom enregistré porte déjà le lot : le bon reste lisible même si
           l'objet est renommé ou sa taille de lot changée plus tard. */
        lines: t.lines.map(l => ({ id: l.item.id, name: MNStore.itemLabel(l.item, l.qty), qty: l.qty })),
        resources: t.resources.map(r => ({ id: r.resource.id, name: r.resource.name, qty: r.qty })),
        count: t.count,
        /* Figé au moment de l'enregistrement : si le temps d'un objet change
           plus tard, un bon déjà signé ne doit pas se réécrire tout seul. */
        minutes: t.minutes
      };
      MNStore.addBT(bt);
      cart = MNStore.setCart({});
      renderTabs(); renderCatalog(); renderDock();

      if (doCopy) MNUI.copy(btToText(bt), "Bon de travail copié — colle-le sur Discord");
      else MNUI.toast("Bon de travail " + bt.ref + " enregistré", "ok");

      /* Envoi Discord si un webhook est configuré — sans bloquer l'interface. */
      if (MNWebhook.has("bt")) {
        MNWebhook.sendBT(bt, bt.lines, bt.resources).then(r => {
          if (r.ok) MNUI.toast("BT envoyé sur Discord", "ok");
          else if (!r.skipped) MNUI.toast("Discord : " + r.error, "err");
        });
      }
    }
  }

  /* ---- Texte prêt pour Discord ------------------------------------------------ */

  function btToText(bt) {
    const b = MNStore.brand();
    const L = [];
    L.push("**" + b.name.toUpperCase() + " — BON DE TRAVAIL**");
    L.push("`" + bt.ref + "`  ·  " + new Date(bt.at).toLocaleString("fr-FR"));
    L.push("Mécano : **" + bt.by + "**");
    if (bt.client) L.push("Client : **" + bt.client + "**");
    L.push("");
    L.push("__Prestations__");
    bt.lines.forEach(l => L.push("• " + l.name + " ×" + l.qty));
    if (bt.resources.length) {
      L.push("");
      L.push("__Ressources nécessaires__");
      bt.resources.forEach(r => L.push("• " + r.name + " ×" + num(r.qty)));
    }
    if (bt.minutes) L.push("\nTemps de fabrication : **" + MNStore.duree(bt.minutes) + "**");
    if (bt.note) { L.push(""); L.push("> " + bt.note.replace(/\n/g, "\n> ")); }
    return L.join("\n");
  }

  /* ---- Historique --------------------------------------------------------------- */

  function bindHistory() {
    const b = document.getElementById("nav-history");
    if (b) b.addEventListener("click", openHistory);
  }

  function openHistory() {
    const m = MNUI.modal({ title: "Historique des bons de travail", body: "", wide: true });
    paint();

    function paint() {
      const list = MNStore.getBTs();
      if (!list.length) {
        m.body.innerHTML = '<div class="empty">' + svg("history") +
          "<b>Aucun bon de travail</b><p>Les BT que tu enregistres apparaîtront ici.</p></div>";
        return;
      }
      m.body.innerHTML =
        '<div class="row" style="margin-bottom:14px">' +
          '<span class="subtitle">' + list.length + " enregistrement" + (list.length > 1 ? "s" : "") + "</span>" +
          '<span class="spacer"></span>' +
          '<button class="btn btn--ghost btn--sm" id="h-clear">' + svg("trash") + "<span>Tout effacer</span></button>" +
        "</div>" +
        '<div class="bt-list">' + list.map(bt =>
          '<div class="bt" data-ref="' + esc(bt.ref) + '">' +
            '<div class="bt__main">' +
              "<b>" + esc(bt.client || "Client non renseigné") + "</b>" +
              "<span>" + esc(bt.ref) + " · " + new Date(bt.at).toLocaleString("fr-FR") +
                " · " + esc(bt.by) + "</span>" +
            "</div>" +
            (bt.minutes ? '<span class="bt__amount bt__amount--time">' +
              esc(MNStore.duree(bt.minutes)) + "</span>" : "") +
            '<span class="bt__amount">' + (bt.count || bt.lines.length) + " obj.</span>" +
            '<button class="btn btn--icon" data-h="view" title="Voir">' + svg("file") + "</button>" +
            '<button class="btn btn--icon" data-h="copy" title="Copier">' + svg("copy") + "</button>" +
            '<button class="btn btn--icon" data-h="del" title="Supprimer">' + svg("trash") + "</button>" +
          "</div>"
        ).join("") + "</div>";

      m.body.querySelector("#h-clear").addEventListener("click", async () => {
        const ok = await MNUI.confirm({
          title: "Effacer l'historique",
          message: "Tous les bons de travail enregistrés dans ce navigateur seront supprimés. C'est définitif.",
          confirmLabel: "Tout effacer", danger: true
        });
        if (ok) { MNStore.clearBTs(); paint(); MNUI.toast("Historique effacé", "ok"); }
      });

      m.body.querySelectorAll("[data-h]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const ref = btn.closest(".bt").dataset.ref;
          const bt = MNStore.getBTs().find(x => x.ref === ref);
          if (!bt) return;
          if (btn.dataset.h === "copy") return void MNUI.copy(btToText(bt), "BT copié");
          if (btn.dataset.h === "view") return void viewBT(bt);
          const ok = await MNUI.confirm({
            title: "Supprimer ce BT", message: bt.ref + " sera définitivement supprimé.",
            confirmLabel: "Supprimer", danger: true
          });
          if (ok) { MNStore.removeBT(ref); paint(); }
        });
      });
    }
  }

  function viewBT(bt) {
    const txt = btToText(bt);
    MNUI.modal({
      title: bt.ref,
      body: '<pre class="bt-preview">' + esc(txt) + "</pre>",
      actions: [
        { label: "Fermer", variant: "btn--ghost", onClick: c => c() },
        { label: "Copier pour Discord", variant: "btn--primary", icon: "copy", onClick: () => MNUI.copy(txt, "BT copié") }
      ]
    });
  }
})();
