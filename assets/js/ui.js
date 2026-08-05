/* ==========================================================================
   Briques d'interface partagées : icônes, notifications, fenêtres modales,
   barre du haut, écran de connexion, démarrage des pages.
   ========================================================================== */

window.MNUI = (function () {
  "use strict";

  /* ---- Icônes d'interface ------------------------------------------------ */

  const UI = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 4h16"/>',
    save: '<path d="M4 6a2 2 0 0 1 2-2h9l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 4v5h7"/><rect x="8" y="14" width="8" height="6"/>',
    logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    login: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 5.6M17.5 20a6 6 0 0 0-2-4.5"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    box: '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z"/><path d="M4 7.2 12 11.5l8-4.3M12 11.5V21"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    cube: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
    cloud: '<path d="M7 19a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.6 1.6A3.9 3.9 0 0 1 17.5 19z"/><path d="M12 16v-5"/><path d="m9.5 13.5 2.5-2.5 2.5 2.5"/>',
    github: '<path d="M9 19c-4.5 1.5-4.5-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.4.4-.5.9-.5 1.6V21"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5V9h4.5"/><path d="M12 8v4.5l3 1.8"/>',
    chevUp: '<path d="m6 15 6-6 6 6"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    car: '<path d="M5 17h14"/><path d="M4 17v-4l2-5h12l2 5v4"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L3 9"/><path d="M4 13a8 8 0 0 0 14 4.5L21 15"/><path d="M3 4v5h5M21 20v-5h-5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2.5 2.5-1.7 1.7-2-2-1.6 1.6 1.9 1.9-2.3 2.3"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/><path d="M8 14h3M8 17.5h6"/>'
  };

  function svg(name, cls) {
    const body = UI[name] || UI.box;
    return '<svg' + (cls ? ' class="' + cls + '"' : "") + ' viewBox="0 0 24 24" fill="none"' +
      ' stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true">' + body + "</svg>";
  }

  /* ---- Format & échappement ---------------------------------------------- */

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const nf = new Intl.NumberFormat("fr-FR");
  const num = n => nf.format(Math.round(Number(n) || 0));

  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "à l'instant";
    if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
    if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
    return "le " + new Date(ts).toLocaleDateString("fr-FR");
  }

  const initials = s => String(s || "?").trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join("").toUpperCase() || "?";

  /** Contenu du logo : image / icône / emoji si défini, sinon les initiales. */
  function brandMark() {
    const b = MNStore.brand();
    return b.logo
      ? { html: mnIcon(b.logo), custom: true }
      : { html: esc(initials(b.name)), custom: false };
  }

  const isImg = v => /^(https?:\/\/|data:image|\.{0,2}\/)/i.test(v) || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(v);

  /**
   * Reprend le logo comme favicon, quel qu'il soit :
   * image → telle quelle · icône de la bibliothèque ou emoji → SVG généré.
   */
  function syncFavicon() {
    const b = MNStore.brand();
    let href = "";

    if (b.logo && isImg(b.logo)) {
      href = b.logo;
    } else {
      const bg = "%23ff2bd1";
      let inner;
      if (b.logo && window.MN_ICONS[b.logo]) {
        inner = '<g transform="translate(4 4) scale(1)" fill="none" stroke="%23140611" ' +
          'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          window.MN_ICONS[b.logo].replace(/"/g, "'") + "</g>";
      } else {
        const txt = b.logo ? b.logo : initials(b.name);
        inner = '<text x="16" y="22" font-family="sans-serif" font-size="' +
          (b.logo ? 19 : 14) + '" font-weight="bold" fill="%23140611" text-anchor="middle">' +
          esc(txt).replace(/#/g, "%23") + "</text>";
      }
      href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
        "%3Crect width='32' height='32' rx='8' fill='" + bg + "'/%3E" +
        inner.replace(/</g, "%3C").replace(/>/g, "%3E") + "%3C/svg%3E";
    }

    document.querySelectorAll('link[rel="icon"]').forEach(l => l.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
  }

  /* ---- Notifications ------------------------------------------------------ */

  function toast(message, type) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const el = document.createElement("div");
    el.className = "toast toast--" + (type || "info");
    el.innerHTML = svg(type === "err" ? "alert" : type === "ok" ? "check" : "info") +
      "<span>" + esc(message) + "</span>";
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 220);
    }, type === "err" ? 5200 : 3200);
  }

  /* ---- Fenêtres modales ---------------------------------------------------- */

  let openModals = 0;

  /**
   * @param {{title:string, body:string|HTMLElement, actions?:Array, wide?:boolean,
   *          onClose?:Function, onMount?:Function}} opt
   */
  function modal(opt) {
    const back = document.createElement("div");
    back.className = "modal-back";

    const box = document.createElement("div");
    box.className = "modal" + (opt.wide ? " modal--wide" : "");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const head = document.createElement("div");
    head.className = "modal__head";
    head.innerHTML = "<h3>" + esc(opt.title || "") + "</h3>";
    const xBtn = document.createElement("button");
    xBtn.className = "btn btn--icon";
    xBtn.setAttribute("aria-label", "Fermer");
    xBtn.innerHTML = svg("x");
    head.appendChild(xBtn);

    const body = document.createElement("div");
    body.className = "modal__body";
    if (typeof opt.body === "string") body.innerHTML = opt.body;
    else if (opt.body) body.appendChild(opt.body);

    box.append(head, body);

    let foot = null;
    if (opt.actions && opt.actions.length) {
      foot = document.createElement("div");
      foot.className = "modal__foot";
      opt.actions.forEach(a => {
        const b = document.createElement("button");
        b.className = "btn " + (a.variant || "btn--ghost");
        b.innerHTML = (a.icon ? svg(a.icon) : "") + "<span>" + esc(a.label) + "</span>";
        b.addEventListener("click", () => a.onClick && a.onClick(close, body, b));
        if (a.ref) a.ref(b);
        foot.appendChild(b);
      });
      box.appendChild(foot);
    }

    back.appendChild(box);
    document.body.appendChild(back);
    openModals++;
    document.body.style.overflow = "hidden";

    function close() {
      if (!back.isConnected) return;
      back.remove();
      if (--openModals <= 0) { openModals = 0; document.body.style.overflow = ""; }
      document.removeEventListener("keydown", onKey);
      if (opt.onClose) opt.onClose();
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    xBtn.addEventListener("click", close);
    back.addEventListener("mousedown", e => { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey);

    setTimeout(() => {
      const f = body.querySelector("input, select, textarea, button");
      if (f) f.focus();
    }, 40);

    if (opt.onMount) opt.onMount(body, close, foot);
    return { close, body, box };
  }

  /** Confirmation → Promise<boolean> */
  function confirm(opt) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      modal({
        title: opt.title || "Confirmer",
        body: '<p style="font-size:14px;line-height:1.6;color:var(--muted)">' + esc(opt.message || "") + "</p>",
        onClose: () => finish(false),
        actions: [
          { label: opt.cancelLabel || "Annuler", variant: "btn--ghost", onClick: c => { finish(false); c(); } },
          {
            label: opt.confirmLabel || "Confirmer",
            variant: opt.danger ? "btn--danger" : "btn--primary",
            onClick: c => { finish(true); c(); }
          }
        ]
      });
    });
  }

  const copy = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || "Copié dans le presse-papier", "ok");
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { /* rien */ }
      ta.remove();
      toast(ok ? (okMsg || "Copié") : "Copie impossible — sélectionne le texte à la main", ok ? "ok" : "err");
      return ok;
    }
  };

  /* ---- Barre du haut -------------------------------------------------------- */

  function mountTopbar(active) {
    const el = document.getElementById("topbar");
    if (!el) return;
    const b = MNStore.brand();
    const s = MNAuth.session();
    const canAdmin = MNAuth.canAny("items", "users", "publish", "admin");
    const mark = brandMark();

    el.innerHTML =
      '<a class="brand" href="index.html">' +
        '<span class="brand__mark' + (mark.custom ? " brand__mark--custom" : "") + '">' + mark.html + "</span>" +
        '<span class="brand__txt"><b>' + esc(b.name) + "</b><i>" + esc(b.tagline) + "</i></span>" +
      "</a>" +
      '<nav class="topnav">' +
        '<a class="navlink' + (active === "fact" ? " is-active" : "") + '" href="index.html">Facturation</a>' +
        (active === "fact" ? '<button class="navlink" id="nav-history">Historique</button>' : "") +
        (MNAuth.canAny("duty", "duty_view")
          ? '<a class="navlink' + (active === "service" ? " is-active" : "") + '" href="service.html">Service</a>'
          : "") +
        (MNAuth.canAny("staff", "promote", "users")
          ? '<a class="navlink' + (active === "equipe" ? " is-active" : "") + '" href="equipe.html">Équipe</a>'
          : "") +
        (canAdmin ? '<a class="navlink' + (active === "admin" ? " is-active" : "") + '" href="admin.html">Admin</a>' : "") +
      "</nav>" +
      '<div class="topbar__spacer"></div>' +
      (s
        ? '<div class="userchip">' +
            '<div class="userchip__id"><b>' + esc(s.pseudo) + "</b><span" +
              (s.roleColor ? ' style="color:' + esc(s.roleColor) + '"' : "") + ">" + esc(s.role) + "</span></div>" +
            '<div class="userchip__av"' +
              (s.roleColor ? ' style="background:' + esc(s.roleColor) + '"' : "") + ">" +
              esc(initials(s.pseudo)) + "</div>" +
            '<button class="btn btn--icon" id="btn-logout" title="Se déconnecter" aria-label="Se déconnecter">' +
              svg("logout") +
            "</button>" +
          "</div>"
        : "");

    const out = document.getElementById("btn-logout");
    if (out) out.addEventListener("click", async () => {
      const ok = await confirm({
        title: "Se déconnecter",
        message: "Tu vas revenir à l'écran de connexion. Ton panier en cours est conservé.",
        confirmLabel: "Se déconnecter"
      });
      if (ok) { MNAuth.logout(); location.href = "index.html"; }
    });
  }

  /* ---- Écran de connexion ---------------------------------------------------- */

  function showGate() {
    const gate = document.getElementById("gate");
    const app = document.getElementById("app");
    if (app) app.hidden = true;
    if (!gate) return;
    gate.hidden = false;

    const b = MNStore.brand();
    const first = MNAuth.users().length === 0;
    const guests = MNStore.settings().auth.allowGuests;
    const mark = brandMark();

    gate.innerHTML =
      '<div class="gate__card">' +
        '<div class="gate__logo' + (mark.custom ? " gate__logo--custom" : "") + '">' + mark.html + "</div>" +
        '<h1 class="gate__title">' + esc(b.name) + "</h1>" +
        '<p class="gate__tag">' + esc(b.tagline) + "</p>" +
        (first
          ? '<div class="alert alert--warn" style="margin-bottom:16px">' + svg("alert") +
            "<span><b>Première connexion.</b> Aucun employé n'est enregistré : le pseudo que tu saisis " +
            "deviendra automatiquement <b>patron</b>, avec tous les droits.</span></div>"
          : "") +
        '<form class="gate__form" id="gate-form" autocomplete="off">' +
          '<div class="field">' +
            '<label class="label" for="g-pseudo">Ton pseudo</label>' +
            '<input class="input" id="g-pseudo" name="pseudo" placeholder="Ex. Rico" maxlength="32" autocomplete="off" required>' +
          "</div>" +
          '<div class="field" id="g-pinwrap" hidden>' +
            '<label class="label" for="g-pin">Code d\'accès' + (first ? " (facultatif)" : "") + "</label>" +
            '<input class="input" id="g-pin" name="pin" type="password" inputmode="numeric" placeholder="••••" autocomplete="off">' +
          "</div>" +
          '<div id="g-err"></div>' +
          '<button class="btn btn--solid btn--block" type="submit">' + svg("login") + "<span>Entrer dans l'atelier</span></button>" +
        "</form>" +
        '<p class="gate__foot">' +
          (first ? "Choisis bien : ce pseudo sera le compte patron de l'atelier."
            : guests ? "Pseudo libre : tu peux entrer avec le nom que tu veux."
            : "Ton pseudo doit avoir été enregistré par un responsable.") +
        "</p>" +
      "</div>";

    const form = gate.querySelector("#gate-form");
    const inPseudo = gate.querySelector("#g-pseudo");
    const pinWrap = gate.querySelector("#g-pinwrap");
    const inPin = gate.querySelector("#g-pin");
    const errBox = gate.querySelector("#g-err");

    const showErr = m => {
      errBox.innerHTML = m ? '<div class="alert alert--err">' + svg("alert") + "<span>" + esc(m) + "</span></div>" : "";
    };

    /* Le champ code n'apparaît que si le pseudo saisi en réclame un. */
    inPseudo.addEventListener("input", () => {
      const need = MNAuth.needsPin(inPseudo.value);
      if (need !== !pinWrap.hidden) pinWrap.hidden = !need;
      showErr("");
    });
    if (first) pinWrap.hidden = false;

    form.addEventListener("submit", e => {
      e.preventDefault();
      const r = MNAuth.login(inPseudo.value, inPin.value);
      if (r.ok) { location.reload(); return; }
      if (r.code === "pin-requis") { pinWrap.hidden = false; inPin.focus(); }
      showErr(r.message);
      if (r.code === "pin-faux") { inPin.value = ""; inPin.focus(); }
    });

    inPseudo.focus();
  }

  /* ---- Démarrage d'une page -------------------------------------------------- */

  /**
   * Charge les données, vérifie la session, puis rend la main à la page.
   * @param {{page:string, onReady:Function}} opt
   */
  async function start(opt) {
    try {
      await MNStore.load();
    } catch (e) {
      console.error(e);
      document.body.innerHTML =
        '<div class="gate"><div class="gate__card"><div class="alert alert--err">' +
        svg("alert") + "<span>Impossible de charger les données du site.</span></div></div></div>";
      return;
    }

    document.title = MNStore.brand().name + " — " + (opt.title || "Facturation");
    syncFavicon();

    if (!MNAuth.session()) { showGate(); return; }

    const gate = document.getElementById("gate");
    const app = document.getElementById("app");
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;

    mountTopbar(opt.page);

    /* Une page dont l'initialisation échoue doit le dire, pas rester figée
       sur un écran de chargement. */
    try {
      const r = opt.onReady(MNAuth.session());
      if (r && typeof r.catch === "function") r.catch(pageCassee);
    } catch (e) {
      pageCassee(e);
    }
  }

  function pageCassee(e) {
    console.error(e);
    toast("Un problème est survenu : " + (e && e.message ? e.message : e), "err");
    document.querySelectorAll(".hint").forEach(n => {
      if (/Chargement/i.test(n.textContent)) {
        n.outerHTML = '<div class="alert alert--err" style="margin:30px auto;max-width:640px">' +
          svg("alert") + "<span><b>La page n'a pas pu se charger.</b> " +
          esc(e && e.message ? e.message : String(e)) + "</span></div>";
      }
    });
  }

  /* ---- Repliage ---------------------------------------------------------------
     Quels blocs sont fermés. C'est un confort de lecture personnel : ça vit
     dans le navigateur, jamais dans le catalogue partagé.

     @param {string} cle  emplacement de stockage, propre à chaque écran */

  function folds(cle) {
    const lire = () => {
      try {
        const v = JSON.parse(localStorage.getItem(cle));
        return Array.isArray(v) ? v.map(String) : [];
      } catch (_) { return []; }
    };
    const ecrire = l => {
      try { localStorage.setItem(cle, JSON.stringify(l.slice(0, 400))); }
      catch (_) { /* quota : le repliage n'est pas vital */ }
    };
    return {
      all: lire,
      has: k => lire().indexOf(k) !== -1,
      set: ecrire,
      /** Bascule une clé et renvoie son nouvel état (true = replié). */
      toggle: k => {
        const l = lire(), i = l.indexOf(k);
        if (i === -1) l.push(k); else l.splice(i, 1);
        ecrire(l);
        return i === -1;
      }
    };
  }

  /* ---- Rafraîchissement de fond --------------------------------------------- */

  /**
   * Rappelle `fn` régulièrement pour garder la page à jour.
   *
   * Le rythme s'adapte à ce que fait la personne : soutenu tant qu'elle se
   * sert de la page, ralenti quand elle la laisse ouverte sans y toucher,
   * suspendu quand l'onglet passe en arrière-plan. Au retour sur l'onglet, on
   * rattrape aussitôt — sinon on retrouverait un écran vieux de plusieurs
   * heures.
   *
   * Le prochain passage n'est programmé qu'une fois le précédent terminé :
   * un serveur lent ralentit le rythme au lieu de faire s'empiler les
   * requêtes.
   *
   * @param {function} fn
   * @param {{vif:number, calme:number, apres:number}} rythme  en millisecondes
   * @returns {function} à appeler pour tout arrêter
   */
  function autoRefresh(fn, rythme) {
    const r = rythme || {};
    const vif = r.vif || 10000;        // la page est utilisée
    const calme = r.calme || 60000;    // ouverte, mais délaissée
    const apres = r.apres || 120000;   // au-delà, on considère qu'elle l'est

    let timer = null, arrete = false;
    let dernier = Date.now();          // dernier passage effectif
    let actif = Date.now();            // dernier signe de vie de la personne

    const delai = () => (Date.now() - actif < apres ? vif : calme);

    function planifier() {
      clearTimeout(timer);
      if (!arrete) timer = setTimeout(tick, delai());
    }

    async function tick() {
      if (arrete) return;
      if (!document.hidden) {
        dernier = Date.now();
        /* Un échec réseau ne doit ni casser la page ni interrompre le rythme. */
        try { await fn(); } catch (e) { console.error(e); }
      }
      planifier();
    }

    function bouge() {
      const dormait = Date.now() - actif >= apres;
      actif = Date.now();
      /* On sortait de la veille : le passage lent déjà programmé ferait
         attendre une minute devant un écran périmé. On reprend la main. */
      if (!dormait) return;
      if (Date.now() - dernier >= vif) tick(); else planifier();
    }
    ["pointerdown", "keydown", "wheel"].forEach(e =>
      window.addEventListener(e, bouge, { passive: true }));

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      actif = Date.now();
      if (Date.now() - dernier >= vif) tick(); else planifier();
    });

    planifier();
    return () => { arrete = true; clearTimeout(timer); };
  }

  return {
    svg, esc, num, ago, initials, brandMark, syncFavicon,
    toast, modal, confirm, copy, mountTopbar, showGate, start, autoRefresh, folds
  };
})();
