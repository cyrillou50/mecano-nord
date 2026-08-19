/* ==========================================================================
   Squelette de l'application.

   Monte une fois pour toutes ce qui entoure une page : la barre latérale, la
   barre du haut, le bandeau bêta, le tiroir mobile. Une page n'a plus qu'à
   déclarer son identifiant et remplir sa zone de contenu.

       V2Shell.demarrer({ page: "facturation", titre: "Facturation",
                          pret: session => { … } });
   ========================================================================== */

window.V2Shell = (function () {
  "use strict";

  const U = () => window.V2UI;
  const esc = s => U().esc(s);

  let _session = null;
  let _page = "";

  /* ---- Droits -------------------------------------------------------------
     Une entrée sans `perm` est ouverte à tous ; sinon il suffit d'en avoir
     une seule des permissions listées. */

  const visible = e => !e.perm || !e.perm.length || MNAuth.canAny.apply(null, e.perm);

  /** Les groupes de navigation débarrassés de ce que la session ne voit pas. */
  function navVisible() {
    return V2.NAV
      .map(g => ({ groupe: g.groupe, entrees: g.entrees.filter(visible) }))
      .filter(g => g.entrees.length);
  }

  /** L'entrée correspondant à la page courante, pour le titre et le menu. */
  function entreeCourante() {
    let out = null;
    V2.NAV.forEach(g => g.entrees.forEach(e => { if (e.id === _page) out = e; }));
    return out;
  }

  /* ---- Rendu ---------------------------------------------------------------- */

  function marque() {
    const b = MNStore.brand();
    const logo = b.logo ? mnIcon(b.logo) : esc(U().initiales(b.name));
    return '<a class="sidebar__marque" href="index.html">' +
      '<span class="marque__jeton">' + logo + "</span>" +
      '<span class="marque__txt tronque"><b>' + esc(b.name) + "</b>" +
        "<span>" + (V2.VERSION.beta ? "V2 bêta" : esc(b.tagline)) + "</span></span>" +
    "</a>";
  }

  function nav() {
    return navVisible().map(g =>
      '<div class="navgroupe">' +
        '<div class="navgroupe__titre">' + esc(g.groupe) + "</div>" +
        g.entrees.map(e =>
          '<a class="navlien' + (e.id === _page ? " is-actif" : "") + '" href="' + esc(e.href) +
            '" data-nom="' + esc(e.nom) + '"' + (e.id === _page ? ' aria-current="page"' : "") + ">" +
            U().icone(e.icone) + "<span>" + esc(e.nom) + "</span>" +
          "</a>").join("") +
      "</div>").join("");
  }

  function jetonEmploye() {
    const s = _session;
    if (!s) return "";
    return '<button class="employe" id="v2-moi" aria-haspopup="true" aria-expanded="false">' +
      '<span class="avatar">' + esc(U().initiales(s.pseudo)) + "</span>" +
      '<span class="employe__txt tronque"><b class="tronque">' + esc(s.pseudo) + "</b>" +
        '<span class="tronque">' + esc(s.role) + "</span></span>" +
    "</button>";
  }

  function bandeauBeta() {
    if (!V2.VERSION.beta) return "";
    return '<div class="betabar" role="status">' +
      '<span class="betapuce">V2 bêta</span>' +
      (V2.VERSION.donneesPartagees
        ? "<b>Attention</b><span>cette version écrit dans les <b>vraies données</b> de " +
          "l'atelier : ce que tu crées ici apparaît aussi sur le site officiel.</span>"
        : "<span>Version d'essai.</span>") +
      '<a class="pousse" href="../index.html">Revenir au site officiel</a>' +
    "</div>";
  }

  /* ---- Montage ----------------------------------------------------------------- */

  function monter(titre) {
    const app = document.getElementById("app");
    app.innerHTML =
      '<aside class="sidebar" id="v2-sidebar">' +
        marque() +
        '<nav class="sidebar__nav" aria-label="Navigation principale">' + nav() + "</nav>" +
        '<div class="sidebar__pied">' + jetonEmploye() + "</div>" +
      "</aside>" +

      "<div>" +
        bandeauBeta() +
        '<header class="topbar">' +
          U().bouton("", { icone: "menu", variante: "fantome", titre: "Ouvrir le menu",
                           action: "burger" }) +
          '<h1 class="topbar__titre">' + esc(titre) + "</h1>" +
          '<div class="rang pousse" id="v2-actions"></div>' +
          (MNTheme.libre()
            ? U().bouton("", { icone: "palette", variante: "fantome", titre: "Apparence",
                               action: "theme" })
            : "") +
        "</header>" +
        '<main class="contenu" id="v2-contenu"></main>' +
      "</div>";

    /* Le hamburger n'existe qu'en dessous du seuil ; la classe le cache en
       CSS, on le marque quand même pour la lisibilité du balisage. */
    const burger = app.querySelector('[data-a="burger"]');
    burger.classList.add("burger");
    burger.addEventListener("click", e => { e.stopPropagation(); basculerTiroir(); });

    const th = app.querySelector('[data-a="theme"]');
    if (th) th.addEventListener("click", choisirTheme);

    const moi = document.getElementById("v2-moi");
    if (moi) moi.addEventListener("click", e => {
      e.stopPropagation();
      U().menu(moi, [
        { nom: "Site officiel (V1)", icone: "fleche", onClick: () => { location.href = "../index.html"; } },
        { separateur: true },
        { nom: "Se déconnecter", icone: "sortie", onClick: deconnexion }
      ]);
    });
  }

  /* ---- Apparence -----------------------------------------------------------
     Le moteur de thèmes est celui de l'atelier : on ne fait qu'en présenter
     les choix. Le thème retenu vaut pour les deux versions — c'est un réglage
     de personne, pas de version. */

  function choisirTheme() {
    const actuel = MNTheme.actuel() || {};
    const perso = MNTheme.aUnChoixPerso();

    const carreau = t =>
      '<button class="theme-carreau' + (t.id === actuel.id ? " is-actif" : "") +
        '" data-t="' + esc(t.id) + '" type="button">' +
        '<span class="theme-apercu" style="background:' + esc(t.fond) + '">' +
          '<i style="background:' + esc(t.accent) + '"></i>' +
          '<i style="background:' + esc(t.surface || t.fond) + '"></i>' +
        "</span>" + esc(t.nom) + "</button>";

    const m = U().modale({
      titre: "Apparence",
      corps:
        '<p class="champ__aide" style="margin-bottom:var(--e-4)">Ce choix te suit sur ' +
          "les deux versions du site, et n'affecte personne d'autre.</p>" +
        '<div class="theme-grille">' + MNTheme.THEMES.map(carreau).join("") + "</div>" +
        (perso
          ? '<div style="margin-top:var(--e-4)">' +
            U().bouton("Revenir au thème de l'atelier",
              { variante: "fantome", taille: "sm", action: "reset" }) + "</div>"
          : ""),
      actions: [{ label: "Fermer", onClick: f => f() }]
    });

    m.corps.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => {
      MNTheme.choisir(b.dataset.t);
      m.fermer();
      choisirTheme();
    }));
    const reset = m.corps.querySelector('[data-a="reset"]');
    if (reset) reset.addEventListener("click", () => {
      MNTheme.choisir(null);
      m.fermer();
      U().toast("Thème de l'atelier rétabli", "ok");
    });
  }

  async function deconnexion() {
    const ok = await U().confirmer({
      titre: "Se déconnecter",
      message: "Tu reviendras à l'écran de connexion du site officiel.",
      confirmer: "Se déconnecter"
    });
    if (ok) { MNAuth.logout(); location.href = "../index.html"; }
  }

  /* ---- Tiroir mobile -------------------------------------------------------------- */

  let voile = null;

  function basculerTiroir(forcer) {
    const sb = document.getElementById("v2-sidebar");
    /* La page peut être en train d'être remplacée, ou n'avoir jamais été
       montée (redirection vers la connexion) : les écouteurs de fenêtre, eux,
       vivent encore. Sans cette garde, un simple redimensionnement plantait. */
    if (!sb) return;

    const ouvrir = forcer === undefined ? !sb.classList.contains("is-ouvert") : forcer;
    sb.classList.toggle("is-ouvert", ouvrir);

    if (ouvrir && !voile) {
      const v = document.createElement("div");
      voile = v;
      v.className = "voile";
      document.body.appendChild(v);
      /* Un cadre d'animation avant d'allumer l'opacité : sans lui, l'élément
         naît déjà opaque et la transition ne se voit pas.

         On garde l'élément dans `v` plutôt que de relire `voile` : entre
         maintenant et le prochain cadre, le tiroir peut déjà avoir été
         refermé et la variable remise à zéro. */
      requestAnimationFrame(() => v.classList.add("is-ouvert"));
      v.addEventListener("click", () => basculerTiroir(false));
    } else if (!ouvrir && voile) {
      voile.classList.remove("is-ouvert");
      const v = voile;
      voile = null;
      setTimeout(() => v.remove(), 220);
    }
    /* Le fond ne doit pas défiler sous le tiroir. */
    document.body.style.overflow = ouvrir ? "hidden" : "";
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && voile) basculerTiroir(false);
  });
  /* En repassant sur grand écran, le tiroir n'a plus lieu d'être ouvert : la
     barre latérale redevient fixe, et le voile masquerait la page pour rien.

     On se fie à l'état réel de la barre plutôt qu'à la variable `voile` : sur
     un écran redimensionné vite, les deux peuvent se désaccorder. */
  window.addEventListener("resize", () => {
    if (window.innerWidth <= V2.UI.seuilSidebar) return;
    const sb = document.getElementById("v2-sidebar");
    if ((sb && sb.classList.contains("is-ouvert")) || voile) basculerTiroir(false);
  });

  /* ---- Démarrage -------------------------------------------------------------------
     La séquence est celle de la V1 : catalogue, thème, session. On la reprend
     telle quelle pour que les deux versions se comportent pareil. */

  async function demarrer(o) {
    _page = o.page || "";
    document.title = (o.titre ? o.titre + " · " : "") +
      "Mécano Nord" + (V2.VERSION.beta ? " (V2 bêta)" : "");

    try {
      await MNStore.load();
    } catch (e) {
      document.getElementById("app").innerHTML =
        '<div class="contenu">' + U().alerte({
          ton: "erreur", titre: "Données introuvables",
          texte: "Le catalogue n'a pas pu être chargé. Vérifie que la V1 est bien " +
                 "en place un dossier au-dessus."
        }) + "</div>";
      return;
    }

    try { MNTheme.apply(); } catch (_) { /* thème facultatif */ }

    _session = MNAuth.session();
    if (!_session) {
      /* La connexion reste celle de la V1 : un seul endroit où l'on entre son
         mot de passe, et une seule session pour les deux versions. */
      const suite = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
      location.href = "../index.html?v2=" + suite;
      return;
    }

    monter(o.titre || "");

    const hote = document.getElementById("v2-contenu");
    try {
      await o.pret(_session, hote);
    } catch (e) {
      console.error(e);
      hote.innerHTML = U().alerte({
        ton: "erreur", titre: "Cette page n'a pas pu s'afficher",
        texte: String(e && e.message || e)
      });
    }
  }

  /** Boutons propres à la page, posés dans la barre du haut. */
  function actions(html) {
    const z = document.getElementById("v2-actions");
    if (z) z.innerHTML = html || "";
    return z;
  }

  /** Refus lisible quand la page demande un droit que la session n'a pas. */
  function refuser(hote, quoi) {
    hote.innerHTML = U().vide({
      icone: "alerte",
      titre: "Accès refusé",
      texte: "Ton rôle (" + _session.role + ") n'a pas accès à " + quoi + ". " +
             "Demande la permission à un responsable.",
      action: U().bouton("Retour au tableau de bord", { href: "index.html", variante: "doux" })
    });
  }

  return {
    demarrer, actions, refuser, basculerTiroir,
    session: () => _session,
    peut: function () { return MNAuth.canAny.apply(null, arguments); }
  };
})();
