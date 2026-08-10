/* ==========================================================================
   Thèmes et couleurs.

   Une poignée de couleurs choisies à la main suffit : tout le reste est
   calculé. Demander vingt teintes à quelqu'un donnerait des palettes
   incohérentes ; en dériver les nuances garantit que les contrastes tiennent
   quelle que soit la couleur choisie.

   Ce fichier se charge AVANT le reste et applique le thème tout de suite,
   sinon la page s'afficherait une fraction de seconde en rose.
   ========================================================================== */

window.MNTheme = (function () {
  "use strict";

  const K_PERSO = "mn.theme";        // choix personnel, propre au navigateur

  /* ---- Couleurs : conversions et mélanges ---------------------------------- */

  /** "#ff2bd1" ou "255 43 209" → [r, g, b]. Null si illisible. */
  function lire(v) {
    const s = String(v || "").trim();
    let m = s.match(/^#?([0-9a-f]{6})$/i);
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = s.match(/^#?([0-9a-f]{3})$/i);
    if (m) {
      return m[1].split("").map(c => parseInt(c + c, 16));
    }
    m = s.match(/^(\d+)[ ,]+(\d+)[ ,]+(\d+)$/);
    if (m) return [+m[1], +m[2], +m[3]].map(n => Math.min(255, Math.max(0, n)));
    return null;
  }

  const hex = c => "#" + c.map(n => Math.round(Math.min(255, Math.max(0, n)))
    .toString(16).padStart(2, "0")).join("");

  /** Mélange deux couleurs. `t` = 0 → a, 1 → b. */
  const melange = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);

  const NOIR = [0, 0, 0], BLANC = [255, 255, 255];
  const eclaircir = (c, t) => melange(c, BLANC, t);
  const assombrir = (c, t) => melange(c, NOIR, t);

  /**
   * Luminance perçue, 0 (noir) à 1 (blanc).
   * Pondérée selon la sensibilité de l'œil : un vert pur paraît bien plus
   * clair qu'un bleu pur de même intensité.
   */
  const clarte = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

  /** Luminance relative au sens WCAG, qui corrige la courbe de l'écran. */
  function lumWcag(c) {
    const f = n => {
      n /= 255;
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }

  /** Rapport de contraste entre deux couleurs, de 1 (identiques) à 21. */
  function contraste(a, b) {
    const x = lumWcag(a), y = lumWcag(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /**
   * Le texte à poser sur ce fond.
   *
   * On essaie plusieurs encres et on garde la première réellement lisible, au
   * lieu de trancher sur un seuil de luminance. Deux raisons :
   *
   * — sur les teintes moyennes, un seuil se trompe de sens (il impose du blanc
   *   là où du texte sombre contraste mieux) ;
   * — sur une rouille ou un bleu franc, aucune encre *teintée* n'atteint 4.5 :
   *   il faut du noir ou du blanc net. On les garde en dernier recours, car ils
   *   sont moins jolis que les versions teintées.
   *
   * Les couleurs étant libres, ces deux cas se produisent pour de vrai.
   */
  const SEUIL = 4.5;                 // minimum WCAG AA pour du texte normal

  function dessus(c) {
    const encres = [assombrir(c, 0.86), eclaircir(c, 0.94), NOIR, BLANC];
    let meilleure = encres[0], score = 0;
    for (const e of encres) {
      const r = contraste(c, e);
      if (r >= SEUIL) return e;
      if (r > score) { score = r; meilleure = e; }
    }
    return meilleure;                // couleur ingrate : on prend le moins pire
  }

  /* ---- Thèmes prêts à l'emploi ---------------------------------------------
     Chacun ne définit que l'essentiel. Le reste est calculé plus bas, ce qui
     évite qu'un thème oublie une nuance et casse un écran. */

  const THEMES = [
    { id: "neon",     nom: "Néon",          accent: "#ff2bd1", fond: "#06050a",
      note: "Le thème d'origine : magenta d'enseigne sur noir." },
    { id: "atelier",  nom: "Atelier",       accent: "#ffa92e", fond: "#0b0805",
      note: "Ambiance chaude, lampe de garage." },
    { id: "toxique",  nom: "Toxique",       accent: "#a8ff52", fond: "#050a05",
      note: "Vert radioactif, très lisible." },
    { id: "glacier",  nom: "Glacier",       accent: "#4dd4ff", fond: "#04080d",
      note: "Bleu froid, reposant pour de longues sessions." },
    { id: "sang",     nom: "Sang",          accent: "#ff3b5c", fond: "#0a0405",
      note: "Rouge sourd, urgence permanente." },
    { id: "cendre",   nom: "Cendre",        accent: "#b9a9d6", fond: "#0a0a0d",
      note: "Presque sans couleur, pour se concentrer." },
    { id: "papier",   nom: "Papier",        accent: "#c2551f", fond: "#f4f1ea",
      note: "Thème clair, pour les écrans très lumineux." }
  ];

  const parId = id => THEMES.find(t => t.id === id) || null;

  /* ---- Calcul de la palette ------------------------------------------------- */

  /**
   * Déduit toutes les variables CSS de deux couleurs.
   * @param {{accent:string, fond:string}} t
   * @returns {object} nom de variable → valeur
   */
  function palette(t) {
    const acc = lire(t.accent) || lire("#ff2bd1");
    const fond = lire(t.fond) || lire("#06050a");
    const clair = clarte(fond) > 0.5;              // thème clair ou sombre ?

    /* Sur fond clair, les surfaces s'assombrissent ; sur fond sombre, elles
       s'éclaircissent. Sans ça, un thème clair aurait des cartes invisibles. */
    const vers = clair ? assombrir : eclaircir;
    const txt = dessus(fond);

    const out = {
      "--accent-rgb": acc.map(Math.round).join(" "),
      "--pink": hex(acc),
      "--pink-soft": hex(clair ? assombrir(acc, 0.15) : eclaircir(acc, 0.42)),
      "--accent-deep": hex(assombrir(acc, 0.38)),
      "--accent-pale": hex(eclaircir(acc, 0.72)),
      "--on-accent": hex(dessus(acc)),
      "--on-accent-rgb": dessus(acc).map(Math.round).join(" "),

      "--bg": hex(fond),
      "--surface": hex(vers(fond, 0.045)),
      "--surface-2": hex(vers(fond, 0.075)),
      "--surface-3": hex(vers(fond, 0.12)),

      /* Trois nuances de plus, sans lesquelles un thème clair garderait des
         champs de saisie noirs :
         `sunk`  ce qui est en creux — champs, fonds de listes, bas de dégradé
         `raise` ce qui ressort au survol
         `edge`  les traits marqués : ascenseurs, séparateurs */
      "--sunk": hex(clair ? assombrir(fond, 0.05) : assombrir(fond, 0.45)),
      "--raise": hex(clair ? assombrir(fond, 0.09) : eclaircir(fond, 0.11)),
      "--edge": hex(clair ? assombrir(fond, 0.24) : eclaircir(fond, 0.18)),

      "--txt": hex(txt),
      "--muted": hex(melange(txt, fond, 0.35)),
      "--dim": hex(melange(txt, fond, 0.58)),
      "--placeholder": hex(melange(txt, fond, 0.5)),

      "--line": clair ? "rgba(0, 0, 0, .10)" : "rgba(255, 255, 255, .075)",
      "--line-2": clair ? "rgba(0, 0, 0, .18)" : "rgba(255, 255, 255, .14)",

      /* Halos et vignette : ils creusent un fond sombre, ils saliraient un
         fond clair. On les efface presque complètement dans ce cas. */
      "--halo": clair ? ".07" : ".20",
      "--vign": clair ? ".06" : ".65"
    };

    /* Les couleurs d'état gardent leur sens — vert = bien, rouge = danger —
       mais on les rapproche du fond pour qu'elles n'écrasent pas la palette. */
    const etat = { "--amber": "#ffa92e", "--toxic": "#a8ff52", "--danger": "#ff3b5c" };
    Object.keys(etat).forEach(k => {
      const c = lire(t[k.slice(2)] || etat[k]) || lire(etat[k]);
      out[k] = hex(clair ? assombrir(c, 0.25) : c);
    });

    return out;
  }

  /* ---- Application ---------------------------------------------------------- */

  let _actuel = null;

  /** Écrit la palette sur <html>. Tout le CSS en découle. */
  function apply(t) {
    const theme = normalize(t);
    const vars = palette(theme);
    const root = document.documentElement;
    Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
    root.dataset.theme = theme.id;
    /* Prévient le navigateur : formulaires natifs et barres de défilement
       suivent la teinte du fond. */
    root.style.colorScheme = clarte(lire(theme.fond) || [0, 0, 0]) > 0.5 ? "light" : "dark";
    _actuel = theme;
    return theme;
  }

  /** Complète un thème partiel avec les valeurs du thème d'origine. */
  function normalize(t) {
    const base = THEMES[0];
    const o = (t && typeof t === "object") ? t : (parId(t) || base);
    return {
      id: String(o.id || "perso"),
      nom: String(o.nom || "Personnalisé"),
      accent: lire(o.accent) ? String(o.accent) : base.accent,
      fond: lire(o.fond) ? String(o.fond) : base.fond,
      amber: o.amber || "", toxic: o.toxic || "", danger: o.danger || ""
    };
  }

  /* ---- Choix et mémoire ------------------------------------------------------
     Deux niveaux : le thème du site, choisi par un responsable et enregistré
     dans le catalogue, et le choix personnel, qui ne quitte pas le navigateur.
     Le second l'emporte quand il existe. */

  function duSite() {
    try {
      const s = window.MNStore && MNStore.settings();
      return s && s.theme ? s.theme : null;
    } catch (_) { return null; }
  }

  /**
   * A-t-on le droit de se choisir une apparence ?
   * Ouvert par défaut. Un responsable peut le fermer, mais celui qui gère
   * l'apparence garde évidemment la main — sinon il ne pourrait plus juger de
   * ses propres réglages.
   */
  function libre() {
    try {
      if (window.MNAuth && MNAuth.can("theme")) return true;
      const s = window.MNStore && MNStore.settings();
      return !s || s.themeLibre !== false;
    } catch (_) { return true; }
  }

  function perso() {
    try {
      const v = localStorage.getItem(K_PERSO);
      if (!v) return null;
      return v.indexOf("{") === 0 ? JSON.parse(v) : parId(v);
    } catch (_) { return null; }
  }

  /**
   * Applique le bon thème : préférence personnelle, sinon celui du site.
   * Un choix personnel enregistré avant que le droit soit retiré est ignoré,
   * pas effacé — il revient si le droit est rendu.
   */
  function refresh() {
    return apply((libre() && perso()) || duSite() || THEMES[0]);
  }

  /** Choisit un thème pour soi. `null` = revenir à celui du site. */
  function choisir(t) {
    try {
      if (!t) localStorage.removeItem(K_PERSO);
      else if (typeof t === "string") localStorage.setItem(K_PERSO, t);
      else localStorage.setItem(K_PERSO, JSON.stringify(normalize(t)));
    } catch (_) { /* quota : le thème n'est pas vital */ }
    return refresh();
  }

  /* Application immédiate. Le catalogue n'est pas encore chargé à ce stade :
     on pose au moins le choix personnel, et store.js rappellera refresh(). */
  apply(perso() || THEMES[0]);

  return {
    THEMES, palette, apply, refresh, choisir, normalize, libre,
    actuel: () => _actuel,
    aUnChoixPerso: () => !!perso(),
    lire, hex, clarte, dessus, contraste
  };
})();
