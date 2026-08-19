/* ==========================================================================
   Bibliothèque de composants.

   Chaque fonction rend une chaîne HTML ou monte un élément. Les pages ne
   contiennent plus de balisage à la main : elles assemblent des composants.
   Modifier l'allure d'un bouton se fait dans components.css, son contenu
   ici, et jamais dans une page.
   ========================================================================== */

window.V2UI = (function () {
  "use strict";

  /* ---- Outils ----------------------------------------------------------- */

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Attributs facultatifs : `attrs({title: "x", hidden: false})`. */
  function attrs(o) {
    return Object.keys(o || {})
      .filter(k => o[k] !== false && o[k] != null && o[k] !== "")
      .map(k => " " + k + '="' + esc(o[k] === true ? k : o[k]) + '"')
      .join("");
  }

  const nf = new Intl.NumberFormat("fr-FR");
  const nombre = n => nf.format(Math.round(Number(n) || 0));

  /* ---- Icônes -------------------------------------------------------------
     Un jeu restreint et cohérent : même grille, même épaisseur de trait. Les
     icônes du catalogue (objets, ressources) restent gérées par la couche
     services, qui sait aussi rendre une image ou un emoji. */

  const ICONES = {
    grille: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    recu: '<path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    contrat: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    equipe: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 5.6M17.5 20a6 6 0 0 0-2-4.5"/>',
    vehicule: '<path d="M5 17h14"/><path d="M4 17v-4l2-5h12l2 5v4"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
    reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    croix: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    moins: '<path d="M5 12h14"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    alerte: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    poubelle: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4h6v3"/>',
    crayon: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    recherche: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sortie: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.5-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6z"/><circle cx="7.5" cy="12" r="1.1"/><circle cx="10" cy="7.8" r="1.1"/><circle cx="15" cy="8.4" r="1.1"/>',
    boite: '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z"/><path d="M4 7.2 12 11.5l8-4.3M12 11.5V21"/>',
    ressource: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    etoile: '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
    rafraichir: '<path d="M20 11a8 8 0 0 0-14-4.5L3 9"/><path d="M4 13a8 8 0 0 0 14 4.5L21 15"/><path d="M3 4v5h5M21 20v-5h-5"/>',
    nuage: '<path d="M7 19a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.6 1.6A3.9 3.9 0 0 1 17.5 19z"/>'
  };

  function icone(nom, cls) {
    const d = ICONES[nom] || ICONES.boite;
    return '<svg' + (cls ? ' class="' + cls + '"' : "") + ' viewBox="0 0 24 24" fill="none"' +
      ' stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true">' + d + "</svg>";
  }

  /* ---- Bouton -------------------------------------------------------------
     @param {{variante,taille,icone,href,id,titre,desactive,bloc,type}} o */

  function bouton(texte, o) {
    o = o || {};
    const cls = ["btn"]
      .concat(o.variante ? "btn--" + o.variante : [])
      .concat(o.taille ? "btn--" + o.taille : [])
      .concat(o.bloc ? "btn--bloc" : [])
      .concat(texte ? [] : "btn--icone")
      .join(" ");

    const dedans = (o.icone ? icone(o.icone) : "") + (texte ? "<span>" + esc(texte) + "</span>" : "");
    const a = attrs({ id: o.id, title: o.titre, "aria-label": texte ? null : o.titre, "data-a": o.action });

    return o.href
      ? '<a class="' + cls + '" href="' + esc(o.href) + '"' + a + ">" + dedans + "</a>"
      : '<button class="' + cls + '" type="' + (o.type || "button") + '"' + a +
        (o.desactive ? " disabled" : "") + ">" + dedans + "</button>";
  }

  /* ---- Carte --------------------------------------------------------------- */

  function carte(o) {
    o = o || {};
    return '<section class="carte' + (o.plate ? " carte--plate" : "") +
      (o.classe ? " " + o.classe : "") + '"' + attrs({ id: o.id }) + ">" +
      (o.titre
        ? '<header class="carte__tete"><h3>' + esc(o.titre) + "</h3>" +
          (o.actions ? '<div class="rang pousse">' + o.actions + "</div>" : "") + "</header>"
        : "") +
      '<div class="carte__corps">' + (o.corps || "") + "</div>" +
      (o.pied ? '<footer class="carte__pied">' + o.pied + "</footer>" : "") +
    "</section>";
  }

  /** Chiffre mis en avant : un intitulé, une valeur, une précision. */
  function tuile(o) {
    return '<div class="tuile' + (o.ton ? " tuile--" + o.ton : "") + '">' +
      '<span class="tuile__label">' + (o.icone ? icone(o.icone) : "") +
        esc(o.label) + "</span>" +
      '<span class="tuile__val">' + esc(o.valeur) + "</span>" +
      (o.pied ? '<span class="tuile__pied">' + esc(o.pied) + "</span>" : "") +
    "</div>";
  }

  const etiquette = (texte, ton) =>
    '<span class="etiq' + (ton ? " etiq--" + ton : "") + '">' + esc(texte) + "</span>";

  /* ---- Champs ---------------------------------------------------------------- */

  function champ(o) {
    const id = o.id;
    let saisie;

    if (o.type === "liste") {
      saisie = '<select class="liste" id="' + esc(id) + '"' + attrs({ name: o.nom }) + ">" +
        (o.options || []).map(x =>
          '<option value="' + esc(x.valeur) + '"' + (x.valeur === o.valeur ? " selected" : "") + ">" +
          esc(x.nom) + "</option>").join("") + "</select>";
    } else if (o.type === "zone") {
      saisie = '<textarea class="zone" id="' + esc(id) + '"' +
        attrs({ placeholder: o.repere, maxlength: o.max, rows: o.lignes }) + ">" +
        esc(o.valeur || "") + "</textarea>";
    } else if (o.type === "bascule") {
      return '<label class="bascule"><input type="checkbox" id="' + esc(id) + '"' +
        (o.valeur ? " checked" : "") + '><span class="bascule__piste"></span>' +
        "<span>" + esc(o.label) + "</span></label>";
    } else {
      saisie = '<input class="saisie' + (o.type === "number" ? " saisie--nombre" : "") +
        '" id="' + esc(id) + '" type="' + esc(o.type || "text") + '"' +
        attrs({ value: o.valeur, placeholder: o.repere, maxlength: o.max,
                min: o.min, max: o.plafond, inputmode: o.clavier, step: o.pas }) + ">";
    }

    return '<div class="champ">' +
      (o.label ? '<label class="champ__label" for="' + esc(id) + '">' + esc(o.label) + "</label>" : "") +
      saisie +
      (o.aide ? '<p class="champ__aide">' + o.aide + "</p>" : "") +
    "</div>";
  }

  /* ---- Tableau ----------------------------------------------------------------
     `data-col` sur chaque cellule : c'est lui qui permet au tableau de se
     retourner en fiches sur téléphone, sans JavaScript. */

  function tableau(colonnes, lignes, o) {
    o = o || {};
    if (!lignes.length) return vide(o.vide || { titre: "Rien à afficher" });

    return '<div class="tableau-cadre"><table class="tableau">' +
      "<thead><tr>" + colonnes.map(c =>
        '<th' + (c.num ? ' class="num"' : "") + ">" + esc(c.nom) + "</th>").join("") +
      "</tr></thead><tbody>" +
      lignes.map(l =>
        "<tr" + attrs({ "data-id": l.id }) + ">" + colonnes.map(c =>
          '<td data-col="' + esc(c.nom) + '"' + (c.num ? ' class="num"' : "") + ">" +
          (c.rendu ? c.rendu(l) : esc(l[c.cle])) + "</td>").join("") + "</tr>").join("") +
      "</tbody></table></div>";
  }

  /* ---- États ------------------------------------------------------------------- */

  function vide(o) {
    return '<div class="vide">' + icone(o.icone || "boite") +
      "<b>" + esc(o.titre) + "</b>" +
      (o.texte ? "<p>" + esc(o.texte) + "</p>" : "") +
      (o.action || "") + "</div>";
  }

  const alerte = (o) =>
    '<div class="alerte' + (o.ton ? " alerte--" + o.ton : "") + '">' +
      icone(o.ton === "erreur" || o.ton === "alerte" ? "alerte" : "info") +
      "<div>" + (o.titre ? "<b>" + esc(o.titre) + "</b>" : "") +
        (o.texte ? "<p>" + esc(o.texte) + "</p>" : "") + "</div>" +
    "</div>";

  /** Blocs gris à la forme du contenu attendu, le temps qu'il arrive. */
  const squelette = (n, classe) =>
    '<div class="pile pile--sm">' +
      Array(n || 3).fill('<div class="squelette ' + (classe || "squelette--ligne") + '"></div>').join("") +
    "</div>";

  /* ---- Notifications -------------------------------------------------------------- */

  function toast(message, ton) {
    let hote = document.querySelector(".toasts");
    if (!hote) {
      hote = document.createElement("div");
      hote.className = "toasts";
      hote.setAttribute("aria-live", "polite");
      document.body.appendChild(hote);
    }
    const el = document.createElement("div");
    el.className = "toast" + (ton ? " toast--" + ton : "");
    el.innerHTML = icone(ton === "err" ? "alerte" : ton === "ok" ? "check" : "info") +
      "<span>" + esc(message) + "</span>";
    hote.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity var(--m-doux)";
      setTimeout(() => el.remove(), 220);
    }, ton === "err" ? 5200 : 3200);
  }

  /* ---- Modale ----------------------------------------------------------------------
     Retourne `{ fermer, corps }`. Les actions reçoivent la fonction de
     fermeture : c'est l'appelant qui décide s'il ferme, pas la modale. */

  function modale(o) {
    const fond = document.createElement("div");
    fond.className = "modale-fond";
    fond.setAttribute("role", "dialog");
    fond.setAttribute("aria-modal", "true");

    fond.innerHTML =
      '<div class="modale' + (o.large ? " modale--large" : "") + '">' +
        '<header class="modale__tete"><h3>' + esc(o.titre) + "</h3>" +
          bouton("", { icone: "croix", variante: "fantome", taille: "sm", titre: "Fermer", action: "fermer" }) +
        "</header>" +
        '<div class="modale__corps"></div>' +
        (o.actions && o.actions.length ? '<footer class="modale__pied"></footer>' : "") +
      "</div>";

    const corps = fond.querySelector(".modale__corps");
    if (typeof o.corps === "string") corps.innerHTML = o.corps;
    else if (o.corps) corps.appendChild(o.corps);

    let ferme = false;
    const fermer = () => {
      if (ferme) return;
      ferme = true;
      document.removeEventListener("keydown", surTouche);
      fond.remove();
      if (avant && avant.focus) avant.focus();
    };
    const avant = document.activeElement;

    const pied = fond.querySelector(".modale__pied");
    (o.actions || []).forEach((a, i) => {
      pied.insertAdjacentHTML("beforeend",
        bouton(a.label, { variante: a.variante || "fantome", icone: a.icone, action: "act" + i }));
      pied.querySelector('[data-a="act' + i + '"]')
        .addEventListener("click", e => a.onClick(fermer, corps, e.currentTarget));
    });

    fond.querySelector('[data-a="fermer"]').addEventListener("click", fermer);
    /* Un clic sur le voile ferme ; un clic dans la boîte, non. */
    fond.addEventListener("mousedown", e => { if (e.target === fond) fermer(); });

    function surTouche(e) { if (e.key === "Escape") fermer(); }
    document.addEventListener("keydown", surTouche);

    document.body.appendChild(fond);
    const premier = corps.querySelector("input, select, textarea, button");
    if (premier) premier.focus();

    return { fermer, corps, element: fond };
  }

  /** Demande une confirmation. Résout à vrai ou faux, jamais ne jette. */
  function confirmer(o) {
    return new Promise(resolve => {
      let repondu = false;
      const finir = v => { if (!repondu) { repondu = true; resolve(v); } };
      const m = modale({
        titre: o.titre,
        corps: "<p>" + esc(o.message) + "</p>",
        actions: [
          { label: o.annuler || "Annuler", onClick: f => { finir(false); f(); } },
          { label: o.confirmer || "Confirmer",
            variante: o.danger ? "danger" : "principal",
            onClick: f => { finir(true); f(); } }
        ]
      });
      /* Fermeture par la croix, le voile ou Échap : la promesse doit se
         résoudre quand même, sinon l'appelant attendrait indéfiniment. */
      const obs = new MutationObserver(() => {
        if (!document.body.contains(m.element)) { obs.disconnect(); finir(false); }
      });
      obs.observe(document.body, { childList: true });
    });
  }

  /* ---- Menu déroulant ------------------------------------------------------------- */

  let menuOuvert = null;

  function fermerMenu() {
    if (!menuOuvert) return;
    menuOuvert.el.remove();
    if (menuOuvert.ancre) menuOuvert.ancre.setAttribute("aria-expanded", "false");
    menuOuvert = null;
  }

  function menu(ancre, items) {
    /* On referme d'abord : le clic sur l'ancre arrête sa propagation, donc le
       gestionnaire global ne fera pas le ménage à notre place. */
    const memeAncre = menuOuvert && menuOuvert.ancre === ancre;
    fermerMenu();
    if (memeAncre) return;

    const el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "menu");
    el.innerHTML = items.map((x, i) => x.separateur
      ? '<div class="menu__sep"></div>'
      : '<button class="menu__item" role="menuitem" data-i="' + i + '">' +
        (x.icone ? icone(x.icone) : "") + "<span>" + esc(x.nom) + "</span></button>").join("");

    document.body.appendChild(el);

    const r = ancre.getBoundingClientRect();
    el.style.top = (r.bottom + 6) + "px";
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + "px";

    el.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => {
      const item = items[Number(b.dataset.i)];
      fermerMenu();
      if (item.onClick) item.onClick();
    }));

    ancre.setAttribute("aria-expanded", "true");
    menuOuvert = { el, ancre };
    const premier = el.querySelector(".menu__item");
    if (premier) premier.focus();
  }

  document.addEventListener("click", fermerMenu);
  document.addEventListener("keydown", e => { if (e.key === "Escape") fermerMenu(); });

  /* ---- Divers ------------------------------------------------------------------------ */

  const initiales = s => String(s || "?").trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join("").toUpperCase() || "?";

  function ilYA(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "à l'instant";
    if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
    if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
    return "le " + new Date(ts).toLocaleDateString("fr-FR");
  }

  /** « 2 h 05 min 30 s » — les tranches à zéro sautent. */
  function duree(sec) {
    const t = Math.max(0, Math.round(Number(sec) || 0));
    if (!t) return "";
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = [];
    if (h) p.push(h + " h");
    if (m) p.push((h ? String(m).padStart(2, "0") : m) + " min");
    if (s) p.push((h || m ? String(s).padStart(2, "0") : s) + " s");
    return p.join(" ");
  }

  return {
    esc, attrs, nombre, icone, ICONES,
    bouton, carte, tuile, etiquette, champ, tableau,
    vide, alerte, squelette,
    toast, modale, confirmer, menu, fermerMenu,
    initiales, ilYA, duree
  };
})();
