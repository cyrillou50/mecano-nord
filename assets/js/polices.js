/* ==========================================================================
   Les polices du livret.

   Le site en propose sept, celles qu'un navigateur a toujours. On peut en
   déposer d'autres : elles vivent sur le serveur de l'atelier, à côté des
   images, et jamais dans le dépôt public — un fichier de police pèse lourd et
   n'a rien à faire dans l'historique du site.

   Une police déposée devient utilisable partout où le livret s'affiche : la
   règle `@font-face` est posée dans la page dès qu'on connaît la liste.
   ========================================================================== */

window.MNPolices = (function () {
  "use strict";

  let _liste = null;        // null = pas encore demandé
  let _souci = "";

  const url = () => {
    try { return MNStore.api("polices"); } catch (_) { return ""; }
  };

  /** Le serveur peut-il en héberger ? Sans lui, on garde les sept du site. */
  const surServeur = () => !!url();

  /** Le nom qu'on montre et qu'on écrit dans le style : « Ma Police ». */
  function nomLisible(fichier) {
    return String(fichier || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * La famille telle qu'elle est écrite dans le style du livret.
   * Guillemets simples : le tamis de `texte.js` les accepte, et un nom avec
   * un espace en a besoin.
   */
  const famille = fichier => "'" + nomLisible(fichier).replace(/'/g, "") + "'";

  /* ---- Chargement ------------------------------------------------------------ */

  /**
   * Va chercher la liste, une fois.
   * Un serveur muet ou d'une version antérieure ne bloque rien : on garde les
   * polices du site, et le livret s'affiche exactement pareil.
   */
  async function charger(force) {
    if (_liste && !force) return _liste;
    _souci = "";
    const base = url();
    if (!base) { _liste = []; return _liste; }

    try {
      const r = await fetch(base + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) {
        /* 404 : ce serveur ne connaît pas encore les polices. Ce n'est pas une
           panne, c'est une version à recopier — inutile d'alarmer. */
        _souci = r.status === 404 ? "" : "Le serveur a répondu " + r.status;
        _liste = [];
        return _liste;
      }
      const j = await r.json();
      _liste = Array.isArray(j.polices) ? j.polices : [];
    } catch (_) {
      _souci = "Serveur injoignable.";
      _liste = [];
    }
    poser();
    return _liste;
  }

  /** Les règles `@font-face`, posées une fois pour toutes dans la page. */
  function poser() {
    const base = url();
    if (!base || !_liste || !_liste.length) return;

    let bloc = document.getElementById("mn-polices");
    if (!bloc) {
      bloc = document.createElement("style");
      bloc.id = "mn-polices";
      document.head.appendChild(bloc);
    }
    bloc.textContent = _liste.map(f =>
      "@font-face{font-family:" + famille(f) +
      ";src:url('" + base + "/" + encodeURIComponent(f) + "');" +
      /* `swap` : le texte s'affiche tout de suite dans la police de secours,
         puis bascule. Sans ça, un livret reste blanc le temps du chargement. */
      "font-display:swap}").join("\n");
  }

  /* ---- Pour l'éditeur --------------------------------------------------------- */

  /** Ce que la barre d'outils propose en plus des polices du site. */
  function pourEditeur() {
    return (_liste || []).map(f => ({ id: famille(f), nom: nomLisible(f) }));
  }

  /* ---- Dépôt et retrait -------------------------------------------------------- */

  async function envoyer(corps) {
    const base = url();
    if (!base) throw new Error("Aucun serveur configuré : c'est lui qui héberge les polices.");
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Le serveur a répondu " + r.status);
    if (Array.isArray(j.polices)) { _liste = j.polices; poser(); }
    return j;
  }

  /**
   * Dépose un fichier de police.
   * @param {File} fichier
   */
  async function deposer(fichier) {
    const nom = String(fichier.name || "").trim();
    if (!/\.(woff2|woff|ttf|otf)$/i.test(nom)) {
      throw new Error("Format inconnu — il faut un .woff2, .woff, .ttf ou .otf.");
    }
    const base64 = await new Promise((res, rej) => {
      const l = new FileReader();
      l.onerror = () => rej(new Error("Lecture impossible."));
      l.onload = () => {
        const s = String(l.result || "");
        const i = s.indexOf(",");
        res(i === -1 ? "" : s.slice(i + 1));
      };
      l.readAsDataURL(fichier);
    });
    /* Le nom du fichier devient le nom de la police : on le nettoie pour
       qu'il tienne dans une adresse et dans un style. */
    const propre = nom.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
    await envoyer({ name: propre, base64 });
    await charger(true);
    return propre;
  }

  const retirer = nom => envoyer({ op: "delete", name: nom }).then(() => charger(true));

  return {
    charger, poser, pourEditeur, deposer, retirer,
    liste: () => _liste || [],
    surServeur, souci: () => _souci,
    nomLisible, famille
  };
})();
