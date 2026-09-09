/* ==========================================================================
   Éditeur de texte enrichi — celui du livret.

   Une barre d'outils et une zone où l'on écrit. Gras, italique, souligné,
   barré, surligné, taille, police, couleur, alignement, listes, images.

   Deux partis pris expliquent presque tout le fichier :

   1. **On écrit du HTML, pas une syntaxe.** Personne dans un atelier n'a
      envie d'apprendre des étoiles et des dièses pour mettre un mot en gras.
      Le prix à payer, c'est que le contenu doit être passé au tamis avant
      d'être stocké et avant d'être affiché — voir `texte.js`, qui s'en charge.

   2. **Une image se pose où l'on veut sans pousser le texte.** Elle est donc
      positionnée en absolu dans la zone, et le texte coule dessous sans rien
      savoir d'elle. On peut la prendre à la souris et la redimensionner par
      son coin. Celles qui doivent rester dans le fil du texte le peuvent
      aussi : c'est un bouton de la petite barre qui apparaît quand on la
      sélectionne.

   `document.execCommand` est officiellement déprécié et remplacé par rien du
   tout : aucun navigateur ne l'a retiré, et l'alternative serait de réécrire
   la sélection et l'annulation à la main. On l'utilise donc, en le sachant.
   ========================================================================== */

window.MNEditeur = (function () {
  "use strict";

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  /* ---- Ce que la barre propose ------------------------------------------------
     Les tailles sont nommées plutôt que chiffrées : « Grand » se choisit sans
     réfléchir, « 24 px » demande d'essayer. */

  const TAILLES = [
    { id: "13px", nom: "Petit" },
    { id: "16px", nom: "Normal" },
    { id: "20px", nom: "Grand" },
    { id: "26px", nom: "Très grand" },
    { id: "34px", nom: "Titre" }
  ];

  /* Les polices du site, toujours là. Celles qu'on téléverse s'ajoutent. */
  const POLICES = [
    { id: "", nom: "Police du site" },
    { id: "var(--font-display)", nom: "Titres du site" },
    { id: "Georgia, serif", nom: "Georgia" },
    { id: "'Times New Roman', serif", nom: "Times" },
    { id: "'Courier New', monospace", nom: "Machine à écrire" },
    { id: "Arial, Helvetica, sans-serif", nom: "Arial" },
    { id: "'Comic Sans MS', cursive", nom: "Comic Sans" }
  ];

  const COULEURS = ["#e9e4f0", "#ff2bd1", "#a8ff52", "#ffa92e", "#ff3b5c",
                    "#7fd7e8", "#ffffff", "#8b8397"];
  const SURLIGNES = ["#ffe066", "#a8ff52", "#7fd7e8", "#ff8095", "#ffa92e"];

  const svg = n => { try { return MNUI.svg(n); } catch (_) { return ""; } };

  /* Les pages du site : on les propose, personne n'a à retenir des noms de
     fichiers. Une adresse extérieure reste possible, c'est le même champ. */
  const PAGES = [
    { nom: "Facturation", href: "index.html" },
    { nom: "Contrats", href: "contrats.html" },
    { nom: "Blacklist", href: "blacklist.html" },
    { nom: "Livret", href: "livret.html" },
    { nom: "Équipe", href: "equipe.html" },
    { nom: "Service", href: "service.html" },
    { nom: "Calendrier", href: "calendrier.html" },
    { nom: "Véhicules", href: "vehicules.html" },
    { nom: "Émotes", href: "emotes.html" }
  ];

  /* ---- Montage ------------------------------------------------------------------ */

  /**
   * Pose un éditeur dans un élément.
   *
   * @param {HTMLElement} hote        où le poser
   * @param {object} o
   * @param {string} o.valeur         le HTML de départ (ou du texte d'avant)
   * @param {function} [o.onChange]   appelé à chaque frappe
   * @param {Array} [o.polices]       polices téléversées : { id, nom }
   * @param {function} [o.choisirImage] rend une référence « srv:nom », ou rien
   * @returns {{html:function, focus:function, detruire:function}}
   */
  function monter(hote, o) {
    o = o || {};
    const polices = POLICES.concat(o.polices || []);
    const depart = MNTexte.estRiche(o.valeur)
      ? MNTexte.nettoyer(o.valeur)
      : MNTexte.depuisTexte(o.valeur);

    hote.innerHTML =
      '<div class="edi">' +
        '<div class="edi__barre" role="toolbar" aria-label="Mise en forme">' +

          '<div class="edi__grp">' +
            bouton("gras", "B", "Gras", "edi__b--gras") +
            bouton("italique", "I", "Italique", "edi__b--ital") +
            bouton("souligne", "U", "Souligné", "edi__b--soul") +
            bouton("barre", "S", "Barré", "edi__b--barre") +
          "</div>" +

          '<div class="edi__grp">' +
            liste("taille", "Taille du texte",
              [{ id: "", nom: "Taille" }].concat(TAILLES)) +
            liste("police", "Police", polices) +
          "</div>" +

          /* Les couleurs derrière un bouton : treize pastilles à plat
             mangeaient toute la barre et se tassaient dès qu'elle rétrécit. */
          '<div class="edi__grp">' +
            panneau("couleur", "A", "Couleur du texte", COULEURS) +
            panneau("surligne", "▮", "Surligner", SURLIGNES) +
          "</div>" +

          '<div class="edi__grp">' +
            bouton("gauche", "≡", "Aligner à gauche", "edi__b--g") +
            bouton("centre", "≡", "Centrer", "edi__b--c") +
            bouton("droite", "≡", "Aligner à droite", "edi__b--d") +
          "</div>" +

          '<div class="edi__grp">' +
            bouton("puces", "•", "Liste à puces") +
            bouton("nombres", "1.", "Liste numérotée") +
            bouton("titre", "T", "Titre") +
          "</div>" +

          '<div class="edi__grp edi__grp--lien">' +
            bouton("lien", "Lien", "Mettre un lien sur du texte", "edi__b--large") +
            (o.choisirImage
              ? bouton("image", "Image", "Insérer une image", "edi__b--large")
              : "") +
            bouton("propre", "Effacer", "Enlever la mise en forme", "edi__b--large") +

            /* Le panneau du lien : deux champs et un bouton, posés sous la
               barre plutôt que dans une fenêtre — l'éditeur ne connaît pas la
               boîte de dialogue de la version qui l'accueille. */
            '<div class="edi__lien" hidden>' +
              '<label>Nom affiché' +
                '<input type="text" data-lien="nom" maxlength="120" placeholder="Ex. Service">' +
              "</label>" +
              "<label>Adresse" +
                '<input type="text" data-lien="url" maxlength="500" list="edi-pages" ' +
                  'placeholder="service.html ou https://…">' +
              "</label>" +
              '<datalist id="edi-pages">' +
                PAGES.map(p => '<option value="' + esc(p.href) + '">' +
                  esc(p.nom) + "</option>").join("") +
              "</datalist>" +
              '<div class="edi__lien__b">' +
                '<button type="button" data-lien="ok">Poser le lien</button>' +
                '<button type="button" data-lien="non">Annuler</button>' +
              "</div>" +
              '<p>Une page du site, ou une adresse en <b>https://</b>. ' +
                "C'est le nom qui s'affiche, pas l'adresse.</p>" +
            "</div>" +
          "</div>" +
        "</div>" +

        /* La zone est le repère des images posées librement : c'est par
           rapport à elle qu'on retient leur position. */
        '<div class="edi__zone livret" contenteditable="true" spellcheck="true" ' +
          'role="textbox" aria-multiline="true">' + depart + "</div>" +

        /* La petite barre d'une image sélectionnée. Elle vit hors de la zone
           éditable : dedans, elle ferait partie du livret. */
        '<div class="edi__img" hidden>' +
          '<button type="button" data-img="libre" title="Poser où je veux">Libre</button>' +
          '<button type="button" data-img="fil" title="Remettre dans le texte">Dans le texte</button>' +
          '<button type="button" data-img="moins" title="Réduire">−</button>' +
          '<button type="button" data-img="plus" title="Agrandir">+</button>' +
          '<button type="button" data-img="suppr" title="Retirer l\'image">✕</button>' +
        "</div>" +
      "</div>";

    const zone = hote.querySelector(".edi__zone");
    const barreImg = hote.querySelector(".edi__img");
    let choisie = null;                 // l'image sélectionnée, s'il y en a une

    /* Les images arrivent sans adresse : le tamis ne garde que la référence,
       et c'est elle qui décide où aller chercher le fichier. On la résout ici
       comme la page de lecture le fait de son côté. */
    zone.querySelectorAll("img[data-ref]").forEach(preparerImage);

    function preparerImage(img) {
      const ref = img.getAttribute("data-ref");
      let src = ref;
      try {
        const nom = MNStore.imageName(ref);
        if (nom) src = MNStore.imageUrl(nom);
      } catch (_) { /* magasin absent : on garde la référence */ }
      img.setAttribute("src", src);
      /* Le curseur n'a rien à faire dans une image, et le glisser natif du
         navigateur se battrait avec le nôtre. */
      img.setAttribute("contenteditable", "false");
      img.setAttribute("draggable", "false");
      if (!img.classList.contains("liv-img")) img.classList.add("liv-img");
    }

    /* ---- Les commandes ---- */

    /* `styleWithCSS` fait produire du style plutôt que des <font> : c'est ce
       que le tamis accepte, et ça se relit. */
    try { document.execCommand("styleWithCSS", false, true); } catch (_) { /* rien */ }

    const cmd = (nom, val) => {
      zone.focus();
      try { document.execCommand(nom, false, val === undefined ? null : val); }
      catch (_) { /* commande inconnue du navigateur : on n'insiste pas */ }
      changed();
    };

    const ACTIONS = {
      gras: () => cmd("bold"),
      italique: () => cmd("italic"),
      souligne: () => cmd("underline"),
      barre: () => cmd("strikeThrough"),
      gauche: () => cmd("justifyLeft"),
      centre: () => cmd("justifyCenter"),
      droite: () => cmd("justifyRight"),
      puces: () => cmd("insertUnorderedList"),
      nombres: () => cmd("insertOrderedList"),
      titre: () => cmd("formatBlock", "H2"),
      propre: () => { cmd("removeFormat"); cmd("formatBlock", "P"); },
      image: () => insererImage(),
      lien: () => ouvrirLien()
    };

    function surBarre(e) {
      /* Le clic sur la barre va faire perdre le focus de la zone : on note ce
         qui était sélectionné avant, c'est là-dessus qu'on posera le lien. */
      retenirSelection();

      const b = e.target.closest("[data-cmd]");
      if (b) { e.preventDefault(); const f = ACTIONS[b.dataset.cmd]; if (f) f(); return; }

      const p = e.target.closest("[data-pan]");
      if (p) {
        e.preventDefault();
        ouvrirPanneau(p.dataset.pan);
        return;
      }

      const c = e.target.closest("[data-couleur]");
      if (c) {
        e.preventDefault();
        const quoi = c.dataset.pour === "surligne" ? "hiliteColor" : "foreColor";
        cmd(quoi, c.dataset.couleur);
        /* La couleur choisie reste sous le bouton : on voit ce qu'on a pris
           sans rouvrir le panneau. */
        const j = hote.querySelector('[data-jauge="' + c.dataset.pour + '"]');
        if (j) j.style.background = c.dataset.couleur;
        fermerPanneaux();
      }
    }

    /** Ouvre un panneau de couleurs, ferme l'autre. */
    function ouvrirPanneau(quel) {
      let ouvert = false;
      hote.querySelectorAll("[data-panneau]").forEach(p => {
        const moi = p.dataset.panneau === quel;
        const montrer = moi && p.hidden;
        p.hidden = !montrer;
        if (montrer) ouvert = true;
      });
      hote.querySelectorAll("[data-pan]").forEach(b =>
        b.setAttribute("aria-expanded",
          b.dataset.pan === quel && ouvert ? "true" : "false"));
    }

    function fermerPanneaux() {
      if (panLien) panLien.hidden = true;
      hote.querySelectorAll("[data-panneau]").forEach(p => { p.hidden = true; });
      hote.querySelectorAll("[data-pan]").forEach(b =>
        b.setAttribute("aria-expanded", "false"));
    }
    hote.querySelector(".edi__barre").addEventListener("mousedown", surBarre);

    hote.querySelectorAll("[data-sel]").forEach(s =>
      s.addEventListener("change", e => {
        const v = e.target.value;
        e.target.selectedIndex = 0;
        if (!v) return;
        cmd(e.target.dataset.sel === "taille" ? "fontSize" : "fontName", "x");
        /* execCommand ne sait poser ni une taille en pixels ni une police
           quelconque : il pose un repère qu'on remplace ensuite. C'est laid,
           mais c'est le seul chemin qui marche partout. */
        remplacerRepere(e.target.dataset.sel === "taille" ? "font-size" : "font-family", v);
        changed();
      }));

    /**
     * `fontSize`/`fontName` produisent `<font size=…>` ou une taille arbitraire
     * selon le navigateur. On retrouve ce qui vient d'être posé et on y met la
     * vraie valeur.
     */
    function remplacerRepere(prop, valeur) {
      zone.querySelectorAll('font, [style*="font-size"], [style*="font-family"]')
        .forEach(e => {
          if (e.tagName === "FONT" || e.getAttribute("face") === "x" ||
              /(^|;)\s*font-family:\s*x(;|$)/.test(e.getAttribute("style") || "") ||
              /x/.test(e.getAttribute("face") || "")) {
            const span = document.createElement("span");
            span.style[prop === "font-size" ? "fontSize" : "fontFamily"] = valeur;
            while (e.firstChild) span.appendChild(e.firstChild);
            e.parentNode.replaceChild(span, e);
          }
        });
      /* Le navigateur a pu poser directement un span : on corrige la valeur. */
      zone.querySelectorAll('span[style*="font-family: x"], span[style*="font-family:x"]')
        .forEach(e => { e.style.fontFamily = valeur; });
    }

    /* ---- Liens ----------------------------------------------------------
       Un nom et une adresse, plutôt qu'une adresse collée en clair : « Voir
       la page Service » se lit, « https://…/service.html » non. */

    const panLien = hote.querySelector(".edi__lien");

    /* Ce qui est sélectionné au moment du clic. Le champ du panneau prend le
       focus, et avec lui la sélection disparaît : on la garde de côté. */
    let selection = null;

    function retenirSelection() {
      try {
        const s = window.getSelection();
        if (s && s.rangeCount && zone.contains(s.anchorNode)) {
          selection = s.getRangeAt(0).cloneRange();
          return;
        }
      } catch (_) { /* pas de sélection utilisable */ }
      selection = null;
    }

    function ouvrirLien() {
      const nom = panLien.querySelector('[data-lien="nom"]');
      const url = panLien.querySelector('[data-lien="url"]');
      /* Le texte sélectionné devient le nom proposé : c'est presque toujours
         celui qu'on veut, et on remplacera ce texte-là. */
      nom.value = selection ? String(selection).trim().slice(0, 120) : "";
      url.value = "";
      panLien.hidden = false;
      (nom.value ? url : nom).focus();
    }

    const fermerLien = () => { panLien.hidden = true; };

    /* Taper un nom de page remplit l'adresse : « Service » suffit. */
    panLien.querySelector('[data-lien="nom"]').addEventListener("input", e => {
      const url = panLien.querySelector('[data-lien="url"]');
      const p = PAGES.find(x => x.nom.toLowerCase() === e.target.value.trim().toLowerCase());
      if (p && !url.value) url.value = p.href;
    });

    panLien.addEventListener("click", e => {
      const b = e.target.closest("[data-lien]");
      if (!b || b.tagName !== "BUTTON") return;
      if (b.dataset.lien === "non") return fermerLien();
      if (b.dataset.lien === "ok") poserLien();
    });
    panLien.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); poserLien(); }
      if (e.key === "Escape") { e.preventDefault(); fermerLien(); }
    });

    function poserLien() {
      const nom = panLien.querySelector('[data-lien="nom"]').value.trim();
      const url = panLien.querySelector('[data-lien="url"]').value.trim();
      const dire = m => {
        try { MNUI.toast(m, "err"); } catch (_) { /* pas de MNUI ici */ }
        try { V2UI.toast(m, "err"); } catch (_) { /* ni de V2UI */ }
      };
      if (!nom) return dire("Donne un nom : c'est lui qu'on lira");
      if (!url) return dire("Donne une adresse");

      /* Le tamis dira le dernier mot ; autant le dire tout de suite plutôt
         que de laisser poser un lien qui disparaîtra à l'enregistrement. */
      const essai = MNTexte.nettoyer(
        '<a href="' + url.replace(/"/g, "&quot;") + '">x</a>');
      if (essai.indexOf("<a ") === -1) {
        return dire("Adresse refusée — une page du site, ou une adresse en https://");
      }

      fermerLien();
      zone.focus();

      const a = document.createElement("a");
      a.setAttribute("href", url);
      a.textContent = nom;
      try {
        const s = window.getSelection();
        if (selection) { s.removeAllRanges(); s.addRange(selection); }
        if (s && s.rangeCount) {
          const r = s.getRangeAt(0);
          r.deleteContents();
          r.insertNode(a);
          /* Le curseur se remet après le lien : sans ça, ce qu'on tape
             ensuite continuerait à l'intérieur. */
          r.setStartAfter(a);
          r.collapse(true);
          s.removeAllRanges();
          s.addRange(r);
        } else {
          zone.appendChild(a);
        }
      } catch (_) {
        zone.appendChild(a);
      }
      selection = null;
      changed();
    }

    /* ---- Images ---- */

    async function insererImage() {
      if (!o.choisirImage) return;
      const ref = await o.choisirImage();
      if (!ref) return;
      const img = document.createElement("img");
      img.setAttribute("data-ref", ref);
      img.className = "liv-img liv-img--libre";
      img.alt = "";
      preparerImage(img);
      /* Posée en haut à gauche de ce qu'on voit : on la déplace ensuite, et
         la chercher au bas d'un long livret serait pénible. */
      img.style.cssText = "position:absolute;left:3%;top:" +
        Math.max(8, zone.scrollTop + 16) + "px;width:180px";
      zone.appendChild(img);
      selectionner(img);
      changed();
    }

    function selectionner(img) {
      if (choisie) choisie.classList.remove("is-choisie");
      choisie = img || null;
      if (!choisie) { barreImg.hidden = true; return; }
      choisie.classList.add("is-choisie");
      barreImg.hidden = false;
      placerBarreImage();
    }

    function placerBarreImage() {
      if (!choisie) return;
      const z = zone.getBoundingClientRect();
      const r = choisie.getBoundingClientRect();
      barreImg.style.left = Math.max(0, r.left - z.left) + "px";
      barreImg.style.top = Math.max(0, r.top - z.top - 34) + "px";
    }

    barreImg.addEventListener("mousedown", e => {
      const b = e.target.closest("[data-img]");
      if (!b || !choisie) return;
      e.preventDefault();
      const quoi = b.dataset.img;

      if (quoi === "suppr") { choisie.remove(); selectionner(null); return changed(); }
      if (quoi === "libre") {
        choisie.className = "liv-img liv-img--libre";
        const l = parseFloat(choisie.style.width) || choisie.offsetWidth;
        choisie.style.cssText = "position:absolute;left:3%;top:" +
          Math.max(8, zone.scrollTop + 16) + "px;width:" + l + "px";
      }
      if (quoi === "fil") {
        const l = parseFloat(choisie.style.width) || choisie.offsetWidth;
        choisie.className = "liv-img";
        choisie.style.cssText = "width:" + l + "px";
      }
      if (quoi === "plus" || quoi === "moins") {
        const l = parseFloat(choisie.style.width) || choisie.offsetWidth || 180;
        const n = Math.max(40, Math.min(1200, Math.round(l * (quoi === "plus" ? 1.2 : 0.8))));
        choisie.style.width = n + "px";
        choisie.style.height = "";
      }
      placerBarreImage();
      changed();
    });

    /* ---- Prendre une image à la souris ---- */

    let glisse = null;

    /**
     * Une position horizontale, retenue en part de la largeur.
     * Les deux zones — écriture et lecture — n'ont pas la même largeur ; un
     * pourcentage veut dire la même chose dans les deux, un pixel non.
     */
    function enPourcent(px) {
      const l = zone.clientWidth || 1;
      return Math.round(Math.max(0, Math.min(100, (px / l) * 100)) * 10) / 10 + "%";
    }

    zone.addEventListener("mousedown", e => {
      const img = e.target.closest("img.liv-img");
      if (!img) { selectionner(null); return; }
      selectionner(img);

      const r = img.getBoundingClientRect();
      /* Le coin bas-droit redimensionne, le reste déplace : c'est le geste
         qu'on attend d'une image, sans avoir à viser une poignée de 6 px. */
      const coin = (e.clientX > r.right - 22) && (e.clientY > r.bottom - 22);
      const libre = img.classList.contains("liv-img--libre");
      if (!coin && !libre) return;              // dans le fil : on ne déplace pas

      e.preventDefault();
      glisse = {
        img, coin,
        x: e.clientX, y: e.clientY,
        /* `offsetLeft` donne des pixels quelle que soit l'unité écrite. */
        l: img.offsetLeft,
        t: img.offsetTop,
        w: parseFloat(img.style.width) || img.offsetWidth
      };
    });

    function bouger(e) {
      if (!glisse) return;
      const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
      if (glisse.coin) {
        glisse.img.style.width = Math.max(40, Math.min(1200, glisse.w + dx)) + "px";
        glisse.img.style.height = "";
      } else {
        glisse.img.style.left = enPourcent(Math.max(0, glisse.l + dx));
        glisse.img.style.top = Math.max(0, glisse.t + dy) + "px";
      }
      placerBarreImage();
    }
    function lacher() {
      if (!glisse) return;
      glisse = null;
      changed();
    }
    document.addEventListener("mousemove", bouger);
    document.addEventListener("mouseup", lacher);

    /* Un panneau de couleurs oublié ouvert couvre le texte qu'on écrit. */
    function ailleurs(e) {
      if (!hote.contains(e.target)) fermerPanneaux();
      else if (!e.target.closest(".edi__coul, .edi__lien, [data-cmd=\"lien\"]")) {
        fermerPanneaux();
      }
    }
    document.addEventListener("mousedown", ailleurs);

    /* ---- Changements ---- */

    let minuterie = null;
    function changed() {
      majBarre();
      if (!o.onChange) return;
      /* On ne prévient pas à chaque touche : l'appelant redessine parfois, et
         redessiner sous les doigts de quelqu'un qui écrit est insupportable. */
      clearTimeout(minuterie);
      minuterie = setTimeout(() => o.onChange(html()), 250);
    }

    zone.addEventListener("input", changed);
    zone.addEventListener("keyup", majBarre);
    zone.addEventListener("mouseup", majBarre);

    /** Les boutons s'allument selon ce qui est sous le curseur. */
    function majBarre() {
      const paires = [["gras", "bold"], ["italique", "italic"],
                      ["souligne", "underline"], ["barre", "strikeThrough"],
                      ["gauche", "justifyLeft"], ["centre", "justifyCenter"],
                      ["droite", "justifyRight"]];
      paires.forEach(([id, c]) => {
        const b = hote.querySelector('[data-cmd="' + id + '"]');
        if (!b) return;
        let on = false;
        try { on = document.queryCommandState(c); } catch (_) { /* rien */ }
        b.classList.toggle("is-on", !!on);
      });
    }

    /** Le livret prêt à enregistrer : nettoyé, sans les marques de l'éditeur. */
    function html() {
      const copie = zone.cloneNode(true);
      copie.querySelectorAll("img").forEach(img => {
        img.classList.remove("is-choisie");
        img.removeAttribute("src");
        img.removeAttribute("contenteditable");
        img.removeAttribute("draggable");
      });
      return MNTexte.nettoyer(copie.innerHTML);
    }

    function detruire() {
      clearTimeout(minuterie);
      document.removeEventListener("mousemove", bouger);
      document.removeEventListener("mouseup", lacher);
      document.removeEventListener("mousedown", ailleurs);
    }

    majBarre();
    return { html, focus: () => zone.focus(), detruire, zone };
  }

  /* ---- Petits morceaux de barre ---- */

  function bouton(cmd, texte, titre, classe) {
    return '<button type="button" class="edi__b ' + (classe || "") +
      '" data-cmd="' + cmd + '" title="' + esc(titre) + '">' + esc(texte) + "</button>";
  }

  function liste(nom, titre, options) {
    return '<select class="edi__sel" data-sel="' + nom + '" title="' + esc(titre) + '">' +
      options.map((x, i) =>
        '<option value="' + esc(x.id) + '"' + (i === 0 ? " selected" : "") + ">" +
        esc(x.nom) + "</option>").join("") + "</select>";
  }

  /**
   * Un bouton de couleur et son panneau.
   *
   * Les pastilles étaient posées à plat dans la barre : treize éléments qui
   * se tassaient dès que la colonne rétrécissait, jusqu'à ne plus faire qu'un
   * trait. Elles vivent maintenant derrière un bouton, et la barre garde sa
   * forme quelle que soit la largeur.
   */
  function panneau(pour, marque, titre, couleurs) {
    return '<span class="edi__coul">' +
      '<button type="button" class="edi__b edi__b--coul" data-pan="' + pour +
        '" title="' + esc(titre) + '" aria-haspopup="true" aria-expanded="false">' +
        esc(marque) + '<i class="edi__jauge" data-jauge="' + pour + '"></i></button>' +
      '<div class="edi__pan" data-panneau="' + pour + '" hidden>' +
        couleurs.map(c =>
          '<button type="button" class="edi__pastille" data-pour="' + pour +
            '" data-couleur="' + esc(c) + '" style="background:' + esc(c) +
            '" title="' + esc(c) + '"></button>').join("") +
      "</div>" +
    "</span>";
  }

  return { monter, TAILLES, POLICES };
})();
