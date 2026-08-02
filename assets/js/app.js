/* ==========================================================================
   Page de facturation : catalogue, panier, bons de travail.
   Le « coût » d'un objet, ce sont ses ressources — il n'y a pas d'argent.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc, num = MNUI.num;

  let cart = {};
  let activeCat = localStorage.getItem("mn.cat") || "all";
  let showCosts = localStorage.getItem("mn.showCosts") === "1";
  let canBT = false;

  MNUI.start({ page: "fact", title: "Facturation", onReady: init });

  /* ---- Démarrage --------------------------------------------------------- */

  function init() {
    canBT = MNAuth.can("bt");
    cart = MNStore.getCart();

    /* La catégorie mémorisée peut avoir été supprimée entre-temps. */
    if (activeCat !== "all" && !MNStore.categoryById(activeCat)) activeCat = "all";

    bindCostsToggle();
    bindDock();
    bindHistory();
    renderTabs();
    renderCatalog();
    renderDock();

    new ResizeObserver(syncDockHeight).observe($("#dock"));
    syncDockHeight();
  }

  const syncDockHeight = () =>
    document.documentElement.style.setProperty("--dock-h", $("#dock").offsetHeight + "px");

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

  function renderTabs() {
    const cat = MNStore.catalog();
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
      tab("all", "Tout", null, all) +
      cat.categories
        .map(c => ({ c, items: all.filter(i => i.category === c.id) }))
        .filter(x => x.items.length)
        .map(x => tab(x.c.id, x.c.name, x.c.icon, x.items))
        .join("");

    host.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
      activeCat = b.dataset.cat;
      localStorage.setItem("mn.cat", activeCat);
      renderTabs();
      renderCatalog();
      b.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }));
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

    const cats = activeCat === "all"
      ? cat.categories
      : cat.categories.filter(c => c.id === activeCat);

    host.innerHTML = cats.map(c => {
      const items = visibleItems().filter(i => i.category === c.id);
      if (!items.length) return "";
      return '<section class="cat">' +
        (activeCat === "all"
          ? '<h2 class="section-title">' + esc(c.name) + '<span class="count">' + items.length + "</span></h2>"
          : "") +
        '<div class="grid">' + items.map(itemCard).join("") + "</div>" +
      "</section>";
    }).join("");
  }

  function costChips(it, unit) {
    return Object.keys(it.cost).map(rid => {
      const r = MNStore.resourceById(rid);
      if (!r) return "";
      return '<span style="color:' + esc(r.color) + '">' + mnIcon(r.icon) +
        '<i style="font-style:normal;color:var(--muted)">' + num(it.cost[rid] * (unit || 1)) + "</i></span>";
    }).join("");
  }

  function itemCard(it) {
    const qty = cart[it.id] || 0;
    const chips = costChips(it);

    return '<article class="item' + (qty ? " is-picked" : "") + '" data-id="' + esc(it.id) + '"' +
      ' title="Clic = +1 · clic droit = −1 · Maj = ±5">' +
      (qty ? '<span class="item__badge">' + qty + "</span>" : "") +
      '<div class="item__icon">' + mnIcon(it.icon) + "</div>" +
      '<h3 class="item__name">' + esc(it.name) + "</h3>" +
      (it.note ? '<p class="item__note">' + esc(it.note) + "</p>" : "") +
      '<div class="stepper">' +
        '<button data-act="dec" aria-label="Retirer"' + (qty ? "" : " disabled") + ">" + svg("minus") + "</button>" +
        '<span class="stepper__val">' + qty + "</span>" +
        '<button data-act="inc" aria-label="Ajouter">' + svg("plus") + "</button>" +
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
    const btn = e.target.closest(".stepper button[data-act]");

    if (btn) {
      if (btn.disabled) return;
      setQty(id, (cart[id] || 0) + (btn.dataset.act === "inc" ? step : -step));
      return;
    }
    setQty(id, (cart[id] || 0) + step);
  });

  /* Clic droit sur une carte = retirer un. */
  document.addEventListener("contextmenu", e => {
    const card = e.target.closest(".item");
    if (!card) return;
    e.preventDefault();
    setQty(card.dataset.id, (cart[card.dataset.id] || 0) - 1);
  });

  function setQty(id, v) {
    const q = Math.max(0, Math.min(999, Math.round(v)));
    if (q) cart[id] = q; else delete cart[id];
    cart = MNStore.setCart(cart);
    patchCard(id);
    renderTabs();
    renderDock();
  }

  /** Redessine une seule carte plutôt que tout le catalogue. */
  function patchCard(id) {
    const card = document.querySelector('.item[data-id="' + CSS.escape(id) + '"]');
    const it = MNStore.itemById(id);
    if (!card || !it) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = itemCard(it);
    card.replaceWith(tmp.firstElementChild);
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

    $("#dock-mini-txt").textContent = t.count
      ? t.count + (t.count > 1 ? " objets" : " objet") + " · " + t.resources.length + " ressource" + (t.resources.length > 1 ? "s" : "")
      : "Panier vide";

    if (!t.resources.length) {
      res.innerHTML = "";
      $("#dock-empty").hidden = false;
    } else {
      $("#dock-empty").hidden = true;
      res.innerHTML = t.resources.map(r =>
        '<div class="res">' +
          '<div class="res__ico" style="color:' + esc(r.resource.color) + '">' + mnIcon(r.resource.icon) + "</div>" +
          '<div class="res__txt"><b>' + esc(r.resource.name) + "</b><span>×" + num(r.qty) + "</span></div>" +
        "</div>"
      ).join("");
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
            "<b>" + esc(l.item.name) + "</b>" +
            '<span class="recap__chips">' + costChips(l.item, l.qty) + "</span>" +
            "<i>×" + l.qty + "</i>" +
          "</div>"
        ).join("") +
        '<div class="recap__total">Ressources' +
          "<span>" + t.resources.map(r => esc(r.resource.name) + " ×" + num(r.qty)).join("  ·  ") + "</span>" +
        "</div>" +
      "</div>";

    const form =
      '<div class="form-grid" style="margin-bottom:14px">' +
        '<div class="field"><label class="label" for="f-client">Client</label>' +
          '<input class="input" id="f-client" placeholder="Nom du client" maxlength="60"></div>' +
        '<div class="field"><label class="label" for="f-veh">Véhicule</label>' +
          '<input class="input" id="f-veh" placeholder="Ex. Sultan RS" maxlength="60"></div>' +
        '<div class="field"><label class="label" for="f-plate">Plaque</label>' +
          '<input class="input" id="f-plate" placeholder="42ABC99" maxlength="16"></div>' +
        '<div class="field"><label class="label" for="f-state">État</label>' +
          '<select class="select" id="f-state">' +
            '<option value="fait">Terminé</option>' +
            '<option value="attente">En attente de ressources</option>' +
            '<option value="cours">En cours</option>' +
          "</select></div>" +
      "</div>" +
      '<div class="field"><label class="label" for="f-note">Note</label>' +
        '<textarea class="textarea" id="f-note" placeholder="Remarques, pièces à commander…" maxlength="400"></textarea></div>';

    MNUI.modal({
      title: "Enregistrer le bon de travail",
      body: recap + form,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        { label: "Enregistrer", variant: "btn--primary", icon: "save", onClick: (c, b) => { save(b, false); c(); } },
        { label: "Enregistrer + copier", variant: "btn--solid", icon: "copy", onClick: (c, b) => { save(b, true); c(); } }
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
        vehicle: g("#f-veh"),
        plate: g("#f-plate").toUpperCase(),
        state: g("#f-state"),
        note: g("#f-note"),
        lines: t.lines.map(l => ({ id: l.item.id, name: l.item.name, qty: l.qty })),
        resources: t.resources.map(r => ({ id: r.resource.id, name: r.resource.name, qty: r.qty })),
        count: t.count
      };
      MNStore.addBT(bt);
      cart = MNStore.setCart({});
      renderTabs(); renderCatalog(); renderDock();
      if (doCopy) MNUI.copy(btToText(bt), "Bon de travail copié — colle-le sur Discord");
      else MNUI.toast("Bon de travail " + bt.ref + " enregistré", "ok");
    }
  }

  /* ---- Texte prêt pour Discord ------------------------------------------------ */

  const STATES = { fait: "Terminé", attente: "En attente de ressources", cours: "En cours" };

  function btToText(bt) {
    const b = MNStore.brand();
    const L = [];
    L.push("**" + b.name.toUpperCase() + " — BON DE TRAVAIL**");
    L.push("`" + bt.ref + "`  ·  " + new Date(bt.at).toLocaleString("fr-FR"));
    L.push("Mécano : **" + bt.by + "**");
    if (bt.client) L.push("Client : **" + bt.client + "**");
    if (bt.vehicle || bt.plate) {
      L.push("Véhicule : " + [bt.vehicle, bt.plate ? "`" + bt.plate + "`" : ""].filter(Boolean).join(" · "));
    }
    if (bt.state && STATES[bt.state]) L.push("État : " + STATES[bt.state]);
    L.push("");
    L.push("__Prestations__");
    bt.lines.forEach(l => L.push("• " + l.name + " ×" + l.qty));
    if (bt.resources.length) {
      L.push("");
      L.push("__Ressources nécessaires__");
      bt.resources.forEach(r => L.push("• " + r.name + " ×" + num(r.qty)));
    }
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
                " · " + esc(bt.by) + (bt.plate ? " · " + esc(bt.plate) : "") + "</span>" +
            "</div>" +
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
