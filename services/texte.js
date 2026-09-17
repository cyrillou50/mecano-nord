/* ==========================================================================
   Texte enrichi du livret.

   Le livret n'est plus du texte brut : on peut y mettre du gras, des tailles,
   des couleurs, un alignement, et des images posées où l'on veut. Il est donc
   stocké en HTML — et c'est précisément ce qui demande de la prudence.

   ⚠ CE FICHIER EST UNE BARRIÈRE DE SÉCURITÉ, pas une commodité d'affichage.

   Le livret est écrit par les responsables et relu par toute l'équipe. Poser
   le HTML de l'un dans la page des autres, c'est leur faire exécuter ce qu'il
   a écrit. Un compte de responsable qui traîne ouvert dans un salon suffirait
   alors à voler les sessions de tout l'atelier.

   D'où le principe : **liste blanche**, jamais liste noire. Tout ce qui n'est
   pas explicitement autorisé disparaît — balise, attribut, propriété de style,
   adresse. On ne cherche pas à reconnaître ce qui est dangereux, on ne garde
   que ce dont on a besoin.

   Le nettoyage passe deux fois : à l'enregistrement, pour ne pas garder de
   saleté, et à l'affichage, parce qu'un catalogue peut arriver d'ailleurs —
   d'un vieux fichier, d'un serveur remis en route à la main.
   ========================================================================== */

window.MNTexte = (function () {
  "use strict";

  /* ---- Ce qu'on garde ---------------------------------------------------------
     Les balises, et pour chacune les attributs tolérés. Le style est traité à
     part : c'est lui qui porte l'essentiel de la mise en forme. */

  const BALISES = {
    P: ["style"], DIV: ["style"], BR: [], HR: [],
    H2: ["style"], H3: ["style"],
    UL: ["style"], OL: ["style"], LI: ["style"],
    BLOCKQUOTE: ["style"],
    SPAN: ["style"], FONT: [],
    B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [], MARK: ["style"],
    SUB: [], SUP: [],
    A: ["href", "title"],
    /* L'image ne garde pas son `src` : il est refabriqué depuis `data-ref`.
       Une adresse écrite à la main dans le HTML ne peut donc pas passer. */
    IMG: ["data-ref", "alt", "style", "class"]
  };

  /* Les balises qu'on remplace plutôt que de jeter : leur contenu est bon,
     c'est leur nom qui ne l'est pas. */
  const RENOMMER = { FONT: "SPAN", STRIKE: "S", DIV: "P" };

  /* ---- Les styles autorisés ---------------------------------------------------
     Chaque propriété a son gabarit. Une valeur qui n'y répond pas est retirée :
     `background: url(...)` ou `expression(...)` ne franchissent pas la porte,
     non parce qu'on les reconnaît, mais parce qu'ils ne ressemblent à rien
     d'attendu. */

  const COULEUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|transparent|inherit|currentcolor)$/i;
  const LONGUEUR = /^-?\d+(\.\d+)?(px|%|em|rem)$/;

  const STYLES = {
    "color": COULEUR,
    "background-color": COULEUR,
    "font-family": /^[\w\s,'"()-]{1,120}$/,
    /* Plafonné plus bas : une taille démesurée casserait la page. */
    "font-size": LONGUEUR,
    "font-weight": /^(normal|bold|bolder|lighter|[1-9]00)$/i,
    "font-style": /^(normal|italic|oblique)$/i,
    "text-decoration": /^(none|underline|line-through|overline)( (underline|line-through|overline))*$/i,
    "text-decoration-line": /^(none|underline|line-through|overline)( (underline|line-through|overline))*$/i,
    "text-align": /^(left|center|right|justify)$/i,
    "text-transform": /^(none|uppercase|lowercase|capitalize)$/i,
    "letter-spacing": LONGUEUR,
    "line-height": /^(normal|\d+(\.\d+)?(px|em|rem|%)?)$/,
    /* Poser une image où l'on veut sans pousser le texte : c'est tout
       l'intérêt du positionnement absolu, et la seule raison de l'autoriser. */
    "position": /^(static|relative|absolute)$/i,
    "left": LONGUEUR, "top": LONGUEUR, "right": LONGUEUR, "bottom": LONGUEUR,
    "width": LONGUEUR, "height": LONGUEUR,
    "max-width": LONGUEUR, "min-height": LONGUEUR,
    "margin": /^-?\d+(\.\d+)?(px|em|rem|%)( -?\d+(\.\d+)?(px|em|rem|%)){0,3}$/,
    "padding": /^\d+(\.\d+)?(px|em|rem|%)( \d+(\.\d+)?(px|em|rem|%)){0,3}$/,
    "border-radius": /^\d+(\.\d+)?(px|%)$/,
    "opacity": /^(0|1|0?\.\d+)$/,
    "z-index": /^\d{1,3}$/,
    "float": /^(none|left|right)$/i,
    "transform": /^rotate\(-?\d+(\.\d+)?deg\)$/i,
    "border": /^\d+px (solid|dashed|dotted) (#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i,
    "box-shadow": /^none$/i
  };

  /* Une taille de police au-delà de ça ne met plus en valeur, elle casse la
     page — et personne ne s'en aperçoit avant de l'avoir publiée. */
  const TAILLE_MAX_PX = 120;

  /* Les classes qu'une image peut porter : ni plus, ni moins. */
  const CLASSES = ["liv-img", "liv-img--libre", "liv-img--gauche", "liv-img--droite"];

  /* ---- Nettoyage --------------------------------------------------------------- */

  /** Une adresse de lien acceptable : rien qui puisse exécuter du code. */
  function lienSur(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    /* `javascript:`, `data:`, `vbscript:` — et tout ce qu'on n'a pas prévu. */
    if (!/^(https?:\/\/|mailto:|#|\/|\.\/|[\w-]+\.html)/i.test(s)) return "";
    /* Un espace ou un caractere de controle au milieu, c est une adresse
       bricolee pour glisser a travers la verification d en-tete. */
    if (/[\s\u0000-\u001f]/.test(s)) return "";
    return s.slice(0, 500);
  }

  /** Une référence d'image du site : « srv:nom » ou un chemin de son dossier. */
  function refSure(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    if (/^srv:[\w.-]{1,120}$/.test(s)) return s;
    if (/^(\.\.\/)?assets\/img\/[\w.-]{1,120}$/.test(s)) return s;
    return "";
  }

  /** Le style d'un élément, réduit à ce qui est autorisé. */
  function styleSur(brut) {
    const out = [];
    String(brut || "").split(";").forEach(regle => {
      const i = regle.indexOf(":");
      if (i === -1) return;
      const prop = regle.slice(0, i).trim().toLowerCase();
      let val = regle.slice(i + 1).trim();
      /* `!important` n'apporte rien ici et complique la lecture. */
      val = val.replace(/\s*!important\s*$/i, "");
      const gabarit = STYLES[prop];
      if (!gabarit || !gabarit.test(val)) return;

      if (prop === "font-size") {
        const n = parseFloat(val);
        if (/px$/.test(val) && n > TAILLE_MAX_PX) val = TAILLE_MAX_PX + "px";
      }
      out.push(prop + ":" + val);
    });
    return out.join(";");
  }

  /**
   * Passe un arbre au tamis, en place.
   * On descend d'abord dans les enfants : un élément retiré remonte son
   * contenu, et ce contenu doit avoir été nettoyé lui aussi.
   */
  function tamiser(noeud) {
    [...noeud.childNodes].forEach(n => {
      if (n.nodeType === 3) return;                       // du texte : rien à faire
      if (n.nodeType !== 1) return n.remove();            // commentaire, CDATA…

      tamiser(n);

      const nom = n.tagName;
      if (!BALISES[nom]) {
        /* Balise inconnue : on garde le texte, on jette l'enveloppe. Un
           <script> n'a pas d'enfants utiles, il disparaît donc entièrement. */
        if (nom === "SCRIPT" || nom === "STYLE" || nom === "IFRAME" ||
            nom === "OBJECT" || nom === "EMBED" || nom === "LINK") {
          return n.remove();
        }
        while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
        return n.remove();
      }

      /* Les attributs : on part de zéro et on remet ce qui est permis. */
      const garder = {};
      BALISES[nom].forEach(a => {
        const v = n.getAttribute(a);
        if (v === null) return;
        if (a === "style") { const s = styleSur(v); if (s) garder.style = s; }
        else if (a === "href") { const h = lienSur(v); if (h) garder.href = h; }
        else if (a === "data-ref") { const r = refSure(v); if (r) garder["data-ref"] = r; }
        else if (a === "class") {
          const c = String(v).split(/\s+/).filter(x => CLASSES.indexOf(x) !== -1);
          if (c.length) garder.class = c.join(" ");
        } else garder[a] = String(v).slice(0, 300);
      });

      [...n.attributes].forEach(a => n.removeAttribute(a.name));
      Object.keys(garder).forEach(k => n.setAttribute(k, garder[k]));

      /* Une image sans référence utilisable ne montrera rien : autant la
         retirer que laisser un carré cassé au milieu du livret. */
      if (nom === "IMG" && !n.getAttribute("data-ref")) return n.remove();

      /* Un lien s'ouvre ailleurs, sans donner la main à la page ouverte. */
      if (nom === "A") {
        if (!n.getAttribute("href")) {
          while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
          return n.remove();
        }
        n.setAttribute("target", "_blank");
        n.setAttribute("rel", "noopener noreferrer");
      }

      const neuf = RENOMMER[nom];
      if (neuf) {
        const e = noeud.ownerDocument.createElement(neuf);
        [...n.attributes].forEach(a => e.setAttribute(a.name, a.value));
        while (n.firstChild) e.appendChild(n.firstChild);
        n.parentNode.replaceChild(e, n);
      }
    });
  }

  /**
   * Le HTML du livret, réduit à ce qu'on accepte d'afficher.
   * @param {string} html
   * @returns {string}
   */
  function nettoyer(html) {
    const s = String(html == null ? "" : html);
    if (!s.trim()) return "";
    /* DOMParser n'exécute rien : les scripts du document analysé ne tournent
       pas, les images ne sont pas chargées. C'est le bon outil pour regarder
       du HTML avant de décider si on le garde. */
    const doc = new DOMParser().parseFromString("<div id=r>" + s + "</div>", "text/html");
    const racine = doc.getElementById("r");
    if (!racine) return "";
    tamiser(racine);
    return racine.innerHTML;
  }

  /* ---- Lecture ------------------------------------------------------------------ */

  /**
   * Le livret en texte seul — pour l'assistant, qui n'a que faire des balises
   * et à qui il ne faut surtout pas envoyer de HTML à recopier.
   */
  function enTexte(html) {
    const s = String(html == null ? "" : html);
    if (!s.trim()) return "";
    if (!estRiche(s)) return s;
    const doc = new DOMParser().parseFromString(s, "text/html");
    /* Les blocs deviennent des sauts de ligne : sans ça, deux paragraphes se
       colleraient en une phrase et l'assistant lirait de travers. */
    doc.body.querySelectorAll("p,div,li,h2,h3,br,blockquote").forEach(e => {
      e.appendChild(doc.createTextNode("\n"));
    });
    doc.body.querySelectorAll("li").forEach(e => {
      e.insertBefore(doc.createTextNode("- "), e.firstChild);
    });
    return (doc.body.textContent || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Ce livret est-il déjà du texte enrichi ?
   *
   * Les livrets d'avant sont du texte brut et doivent continuer de s'afficher
   * comme avant. On ne devine pas : on regarde s'il porte une des balises que
   * l'éditeur produit. Un tiret ou un chevron isolé dans une phrase ne suffit
   * donc pas à faire basculer un vieux livret.
   */
  function estRiche(s) {
    return /<(p|div|span|b|strong|i|em|u|s|mark|ul|ol|li|h2|h3|img|br|a)\b[^>]*>/i
      .test(String(s || ""));
  }

  /**
   * Du texte brut vers le HTML de l'éditeur : une ligne vide sépare deux
   * paragraphes, une ligne qui commence par un tiret fait une puce. C'est la
   * règle que le livret suivait avant, on la garde pour ne rien perdre en
   * chemin le jour où quelqu'un ouvre l'éditeur sur un ancien texte.
   */
  function depuisTexte(t) {
    const esc = x => String(x)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return String(t || "").split(/\n{2,}/).map(bloc => {
      const lignes = bloc.split("\n").filter(x => x !== "");
      if (!lignes.length) return "";
      if (lignes.every(x => /^\s*[-•*]\s+/.test(x))) {
        return "<ul>" + lignes.map(x =>
          "<li>" + esc(x.replace(/^\s*[-•*]\s+/, "")) + "</li>").join("") + "</ul>";
      }
      return "<p>" + lignes.map(esc).join("<br>") + "</p>";
    }).filter(Boolean).join("");
  }

  /**
   * Le HTML prêt à poser dans la page : nettoyé, et les images pointées vers
   * l'endroit où elles vivent vraiment.
   *
   * L'adresse n'est jamais stockée, seulement la référence : le jour où le
   * serveur change d'adresse, tout le livret suit sans qu'on y touche.
   */
  function pourAffichage(livret) {
    const brut = estRiche(livret) ? livret : depuisTexte(livret);
    const propre = nettoyer(brut);
    if (!propre) return "";

    const doc = new DOMParser().parseFromString("<div id=r>" + propre + "</div>", "text/html");
    doc.getElementById("r").querySelectorAll("img[data-ref]").forEach(img => {
      const ref = img.getAttribute("data-ref");
      let src = ref;
      try {
        const nom = MNStore.imageName(ref);
        if (nom) src = MNStore.imageUrl(nom);
      } catch (_) { /* magasin absent : on garde la référence telle quelle */ }
      img.setAttribute("src", src);
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
    });
    return doc.getElementById("r").innerHTML;
  }

  return {
    nettoyer, enTexte, estRiche, depuisTexte, pourAffichage,
    TAILLE_MAX_PX, CLASSES
  };
})();
