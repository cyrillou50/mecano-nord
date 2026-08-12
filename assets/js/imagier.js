/* ==========================================================================
   Bibliothèque d'images partagée.

   Lister ce qui existe, déposer une photo, en choisir une. Le panneau admin a
   son propre sélecteur, plus riche (il propose aussi les icônes vectorielles
   et les emojis) ; celui-ci ne s'occupe que d'images, et sert aux écrans qui
   en ont besoin sans embarquer tout l'admin.

   Le dépôt se fait sur le serveur de l'atelier quand il est configuré :
   l'image est en ligne aussitôt, sans commit ni reconstruction du site. Sinon
   il retombe sur le dépôt GitHub, ce qui demande le droit de publier.
   ========================================================================== */

window.MNImagier = (function () {
  "use strict";

  const IMG_DIR = "assets/img";
  const IMG_RE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

  let cache = null;

  const esc = s => MNUI.esc(s);
  const surServeur = () => MNStore.imagesHebergees();

  async function api(corps) {
    const base = MNStore.api("images");
    if (!base) throw new Error("Aucun serveur configuré.");

    let r;
    try {
      r = await fetch(base + (corps ? "" : "?t=" + Date.now()), corps
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
        : { cache: "no-store" });
    } catch (_) {
      /* « Failed to fetch » n'apprend rien à personne. C'est presque toujours
         l'un de ces trois cas. */
      throw new Error("le serveur n'a pas répondu — il est peut-être arrêté, " +
        "ou l'image est trop lourde pour lui");
    }

    const j = await r.json().catch(() => ({}));
    if (r.status === 413) {
      throw new Error(j.error || "image trop lourde pour le serveur");
    }
    if (!r.ok) throw new Error(j.error || "Le serveur a répondu " + r.status);
    return j;
  }

  /**
   * Toutes les images disponibles, celles du serveur d'abord.
   * Chaque entrée porte sa référence telle qu'on l'enregistre.
   */
  async function lister(force) {
    if (cache && !force) return cache;
    let serveur = [], depot = [];

    if (surServeur()) {
      try { serveur = (await api()).images || []; } catch (_) { /* on se rabat */ }
    }
    try {
      const r = await fetch(IMG_DIR + "/index.json?v=" + Date.now(), { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        depot = (Array.isArray(j) ? j : j.images || []).filter(n => IMG_RE.test(n));
      }
    } catch (_) { /* manifeste absent */ }

    const tri = (a, b) => a.localeCompare(b, "fr");
    cache = serveur.sort(tri).map(n => ({ name: n, ref: MNStore.IMG_TAG + n, serveur: true }))
      .concat(depot.sort(tri).map(n => ({ name: n, ref: IMG_DIR + "/" + n, serveur: false })));
    return cache;
  }

  const vider = () => { cache = null; };

  /** L'adresse à laquelle afficher une référence. */
  const src = ref => (String(ref).indexOf(MNStore.IMG_TAG) === 0
    ? MNStore.imageUrl(String(ref).slice(MNStore.IMG_TAG.length))
    : ref);

  /* ---- Mise au gabarit -----------------------------------------------------
     Une photo prise sur internet fait souvent plusieurs mégaoctets. On la
     réduit avant de l'envoyer : le stockage reste léger et l'affichage
     immédiat. On garde les proportions — contrairement aux icônes, une voiture
     ne se met pas dans un carré. */

  function traiter(img, max) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("dimensions inconnues");

    /* Copie de travail plafonnée, pour analyser les pixels sans manipuler une
       image de plusieurs millions de points. */
    const cap = 1400;
    const k0 = Math.min(cap / w, cap / h, 1);
    const tw = Math.max(1, Math.round(w * k0));
    const th = Math.max(1, Math.round(h * k0));
    const src = document.createElement("canvas");
    src.width = tw; src.height = th;
    const sctx = src.getContext("2d");
    sctx.drawImage(img, 0, 0, tw, th);

    /* Marges transparentes : les rendus de véhicules en ont beaucoup, et sans
       les retirer la voiture s'affiche minuscule au milieu d'un grand vide —
       `object-fit: contain` met à l'échelle le canevas, pas le motif. */
    let x0 = 0, y0 = 0, x1 = tw - 1, y1 = th - 1;
    try {
      const d = sctx.getImageData(0, 0, tw, th).data;
      let minX = tw, minY = th, maxX = -1, maxY = -1;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          if (d[(y * tw + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) { x0 = minX; y0 = minY; x1 = maxX; y1 = maxY; }
    } catch (_) {
      /* Canvas protégé : on garde l'image entière plutôt que d'échouer. */
    }

    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const k = Math.min(max / cw, max / ch, 1);

    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(cw * k));
    cv.height = Math.max(1, Math.round(ch * k));
    cv.getContext("2d").drawImage(src, x0, y0, cw, ch, 0, 0, cv.width, cv.height);
    /* « rogne » dit s'il y avait vraiment du vide à retirer : quelques pixels
       ne justifient pas de remplacer une image déjà affichée. */
    return {
      data: cv.toDataURL("image/png"),
      rogne: cw < tw * 0.96 || ch < th * 0.96
    };
  }

  /* ---- Recadrage des images déjà en place ------------------------------------
     Une photo peut arriver de trois côtés : déposée ici, collée en adresse, ou
     déjà enregistrée avant que le dépôt ne sache recadrer. Dans tous les cas
     elle doit bien s'afficher, donc on la recadre au moment de la montrer.

     Il faut pour cela lire ses pixels, ce que le navigateur interdit sur une
     image venue d'un autre domaine sans en-tête CORS. On la fait alors passer
     par le relais du serveur. Sans serveur, ou avec un serveur trop ancien,
     l'image reste affichée telle quelle : moins belle, jamais cassée. */

  const cadres = new Map();
  const CADRE_MAX = 12;             // au-delà, on oublie les plus anciennes

  /** Adresse à laquelle on peut lire les pixels, ou "" si c'est impossible. */
  function urlLisible(ref) {
    const brut = src(ref);
    if (!brut) return "";
    if (/^data:/i.test(brut)) return brut;

    let abs;
    try { abs = new URL(brut, location.href); } catch (_) { return ""; }

    const base = MNStore.api("images");
    let servi = "";
    try { servi = base ? new URL(base, location.href).origin : ""; } catch (_) { /* mal réglé */ }

    if (abs.origin === location.origin || (servi && abs.origin === servi)) return abs.href;
    return base ? base + "/distant?u=" + encodeURIComponent(abs.href) : "";
  }

  function charger(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      /* Sans ceci le canevas serait « teinté » et illisible. En contrepartie,
         une image sans en-tête CORS échoue au chargement — d'où le `catch`
         chez l'appelant, qui garde alors l'original. */
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("illisible"));
      img.src = url;
    });
  }

  /**
   * Version recadrée sur le motif visible, ou null s'il n'y a rien à gagner
   * (image déjà serrée, illisible, pas de relais disponible).
   */
  function cadrer(ref, max) {
    const cle = String(ref || "") + "@" + (max || 900);
    if (cadres.has(cle)) return cadres.get(cle);

    const p = (async () => {
      const url = urlLisible(ref);
      if (!url) return null;
      const img = await charger(url);
      const r = traiter(img, max || 900);
      return r.rogne ? r.data : null;
    })().catch(() => null);

    cadres.set(cle, p);
    /* Une image de 900 px en `data:` pèse quelques centaines de kilooctets :
       on n'en garde qu'une poignée. */
    if (cadres.size > CADRE_MAX) cadres.delete(cadres.keys().next().value);
    return p;
  }

  /** Dimensions d'une image en `data:`, pour prévenir quand elle est petite. */
  function taille(dataUri) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = dataUri;
    });
  }

  /* Le serveur refuse un envoi de plus de 512 ko et coupe la connexion, ce que
     le navigateur ne sait annoncer que par un « Failed to fetch ». Une photo
     réencodée en PNG dépasse vite ce seuil : un rendu de véhicule en 900 px
     pèse jusqu'à 680 ko. On réduit donc jusqu'à tenir dans l'enveloppe, plutôt
     que d'envoyer quelque chose qui sera rejeté. */
  const BUDGET = 460 * 1024;
  const PLANCHER = 240;             // en dessous, autant garder de la netteté

  function sousBudget(img, max) {
    let m = max;
    for (;;) {
      const data = traiter(img, m).data;
      if (data.length <= BUDGET || m <= PLANCHER) return data;
      m = Math.max(PLANCHER, Math.round(m * 0.75));
    }
  }

  /** Fichier choisi → image réduite, en `data:`. */
  function depuisFichier(file, max) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error("Ce fichier n'est pas une image."));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try { resolve(sousBudget(img, max || 640)); }
        catch (e) { reject(new Error("Image impossible à convertir.")); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
      img.src = url;
    });
  }

  /** Dépose une image et renvoie la référence à enregistrer. */
  async function deposer(dataUri, nomSuggere) {
    const nom = MNStore.slugify(String(nomSuggere || "image").replace(/\.[a-z0-9]+$/i, "")) + ".png";
    const brut = MNGitHub.imageBrute(dataUri);

    if (surServeur()) {
      await api({ name: nom, base64: brut });
      vider();
      return MNStore.IMG_TAG + nom;
    }

    /* Sans serveur : dans le dépôt, avec le manifeste dans le même commit. */
    const chemin = IMG_DIR + "/" + nom;
    const fichiers = [{ path: chemin, content: brut, base64: true }];
    try {
      const noms = (await lister(true)).filter(x => !x.serveur).map(x => x.name);
      if (noms.indexOf(nom) === -1) noms.push(nom);
      fichiers.push({ path: IMG_DIR + "/index.json", content: JSON.stringify(noms.sort(), null, 2) + "\n" });
    } catch (_) { /* manifeste : simple confort */ }

    await MNGitHub.putFiles(fichiers, "Ajout de l'image " + nom);
    vider();
    return chemin;
  }

  /* ---- Fenêtre de choix ------------------------------------------------------ */

  /**
   * Ouvre la bibliothèque.
   * @param {string} actuel   référence déjà sélectionnée
   * @param {function} cb     appelée avec la référence retenue
   * @param {{max:number}} opt taille maximale des images déposées
   */
  function choisir(actuel, cb, opt) {
    const max = (opt && opt.max) || 640;
    let sel = actuel || "";

    const body = document.createElement("div");
    body.innerHTML =
      '<div class="row" style="margin-bottom:12px">' +
        '<button class="btn btn--primary" id="g-up" type="button">' + MNUI.svg("upload") +
          "<span>Déposer une photo</span></button>" +
        '<input type="file" id="g-file" accept="image/*" hidden>' +
        '<button class="btn btn--ghost" id="g-refresh" type="button">' + MNUI.svg("refresh") +
          "<span>Actualiser</span></button>" +
        '<span class="spacer"></span>' +
        '<button class="btn btn--ghost" id="g-none" type="button">' + MNUI.svg("x") +
          "<span>Aucune</span></button>" +
      "</div>" +
      '<div id="g-grid"><p class="hint">Lecture de la bibliothèque…</p></div>' +
      '<div class="field" style="margin-top:12px">' +
        '<label class="label" for="g-url">Ou colle une adresse</label>' +
        '<input class="input mono" id="g-url" value="' + esc(actuel) +
          '" placeholder="https://… ou assets/img/bf400.png"></div>';

    const grid = body.querySelector("#g-grid");
    const champ = body.querySelector("#g-url");

    const peindre = async force => {
      grid.innerHTML = '<p class="hint">Lecture de la bibliothèque…</p>';
      let refs = [];
      try { refs = await lister(force); } catch (_) { /* rien de listable */ }

      if (!refs.length) {
        grid.innerHTML = '<p class="hint">Aucune image pour le moment. ' +
          "Clique sur <b>Déposer une photo</b> pour en ajouter une.</p>";
        return;
      }
      grid.innerHTML =
        '<div class="iconlist" style="grid-template-columns:repeat(auto-fill,minmax(78px,1fr));max-height:300px">' +
          refs.map(x =>
            '<button type="button" data-ref="' + esc(x.ref) + '" title="' + esc(x.name) +
              (x.serveur ? " — sur le serveur" : " — dans le dépôt") + '"' +
              (x.ref === sel ? ' class="is-on"' : "") +
              '><img src="' + esc(src(x.ref)) + '" alt="" loading="lazy"></button>').join("") +
        "</div>" +
        '<p class="hint" style="margin-top:8px">' + refs.length + " image" +
          (refs.length > 1 ? "s" : "") + "</p>";

      grid.querySelectorAll("[data-ref]").forEach(b => b.addEventListener("click", () => {
        sel = b.dataset.ref;
        champ.value = sel;
        grid.querySelectorAll("[data-ref]").forEach(x => x.classList.toggle("is-on", x === b));
      }));
    };
    peindre(false);

    body.querySelector("#g-refresh").addEventListener("click", () => peindre(true));
    champ.addEventListener("input", () => { sel = champ.value.trim(); });
    body.querySelector("#g-none").addEventListener("click", () => { sel = ""; champ.value = ""; });

    body.querySelector("#g-up").addEventListener("click", () => body.querySelector("#g-file").click());
    body.querySelector("#g-file").addEventListener("change", async e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;

      const bouton = body.querySelector("#g-up");
      bouton.disabled = true;
      bouton.innerHTML = MNUI.svg("refresh") + "<span>Envoi…</span>";
      try {
        const data = await depuisFichier(file, max);
        /* Sans serveur ni jeton, on garde l'image dans les données plutôt que
           d'échouer : elle marche tout de suite, au prix d'un fichier plus
           lourd. */
        if (!surServeur() && !MNGitHub.canPublish()) {
          sel = data;
          champ.value = data;
          MNUI.toast("Image intégrée aux données — aucun serveur pour l'héberger", "info");
        } else {
          sel = await deposer(data, file.name);
          champ.value = sel;
          await peindre(true);
          /* On n'invente pas de pixels à l'agrandissement : une source trop
             petite restera floue une fois affichée en grand, autant le dire
             tout de suite plutôt que de laisser chercher. */
          const t = await taille(data);
          const petit = Math.max(t.w, t.h);
          MNUI.toast(petit && petit < 360
            ? "Photo déposée — mais elle ne fait que " + t.w + "×" + t.h +
              " px : elle sera floue en grand, cherche une image plus grande"
            : "Photo déposée", petit && petit < 360 ? "info" : "ok");
        }
      } catch (err) {
        MNUI.toast("Dépôt impossible : " + err.message, "err");
      } finally {
        bouton.disabled = false;
        bouton.innerHTML = MNUI.svg("upload") + "<span>Déposer une photo</span>";
      }
    });

    MNUI.modal({
      title: "Bibliothèque d'images", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Choisir", variant: "btn--primary", icon: "check",
          onClick: c => { cb(sel); c(); }
        }
      ]
    });
  }

  return { lister, vider, src, taille, cadrer, deposer, depuisFichier, choisir };
})();
