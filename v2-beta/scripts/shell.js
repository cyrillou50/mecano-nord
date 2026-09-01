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
    /* Avec deux garages, l'enseigne doit dire lequel : « Mécano Nord » tout
       court laisserait deviner. */
    const ici = MNAuth.atelier() ? MNStore.nomAtelier(MNAuth.atelier()) : b.name;
    return '<a class="sidebar__marque" href="index.html">' +
      '<span class="marque__jeton">' + logo + "</span>" +
      '<span class="marque__txt tronque"><b>' + esc(ici) + "</b>" +
        "<span>" + (V2.VERSION.beta ? "V2 bêta" : esc(b.tagline)) + "</span></span>" +
    "</a>";
  }

  /* ---- Ateliers ----------------------------------------------------------------
     Un clic pour passer d'un garage à l'autre. N'apparaît que pour qui
     travaille dans les deux : les autres n'ont nulle part où aller. */

  function boutonAtelier() {
    const s = _session;
    if (!s || (s.ateliers || []).length < 2) return "";
    return '<div class="atbar" role="group" aria-label="Atelier">' +
      s.ateliers.map(id =>
        '<button class="atbar__b' + (id === s.atelier ? " is-on" : "") +
          '" data-vers="' + esc(id) + '"' +
          (id === s.atelier ? ' aria-current="true"'
            : ' title="Passer au ' + esc(MNStore.nomAtelier(id)) + '"') + ">" +
          esc(MNStore.courtAtelier(id)) + "</button>").join("") +
    "</div>";
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
        '<div id="v2-brouillon"></div>' +
        '<header class="topbar">' +
          U().bouton("", { icone: "menu", variante: "fantome", titre: "Ouvrir le menu",
                           action: "burger" }) +
          '<h1 class="topbar__titre">' + esc(titre) + "</h1>" +
          '<div class="rang pousse" id="v2-actions"></div>' +
          boutonAtelier() +
          '<div id="v2-avert"></div>' +
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

    /* Rechargement plutôt que redessin : l'atelier change l'équipe affichée,
       le tableau de service et la page ouverte. */
    app.querySelectorAll(".atbar__b").forEach(b =>
      b.addEventListener("click", () => {
        if (MNAuth.setAtelier(b.dataset.vers)) location.reload();
      }));

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

  /* ---- Avertissements reçus ------------------------------------------------------
     Une sanction ne sert à rien si l'intéressé ne la voit pas. À l'arrivée sur
     le site, ce qui est nouveau s'affiche en grand ; ensuite un jeton discret
     reste dans la barre du haut tant que quelque chose pèse au dossier.

     L'accusé de lecture vit dans le navigateur, pas dans les données : un
     employé n'a pas le droit d'écrire le catalogue, et surtout le site ne peut
     pas prouver qu'on a lu — il peut seulement éviter de répéter. */

  const clefVus = uid => "mn.av.vus." + (uid || "x");

  function avVus(uid) {
    try { return JSON.parse(localStorage.getItem(clefVus(uid))) || []; }
    catch (_) { return []; }
  }

  function avMarquerVus(uid, ids) {
    /* On plafonne : la liste ne doit pas enfler indéfiniment avec des
       identifiants d'avertissements retirés depuis. */
    try {
      localStorage.setItem(clefVus(uid), JSON.stringify(avVus(uid).concat(ids).slice(-200)));
    } catch (_) { /* quota : au pire le rappel se répète */ }
  }

  /** Les avertissements qui pèsent encore sur le compte connecté. */
  function mesAvertissements() {
    const s = _session;
    if (!s || !s.uid || !s.user) return [];
    return (s.user.avertissements || []).filter(MNStore.avertActif);
  }

  const dateLongue = d => {
    const x = new Date(d);
    return isNaN(x) ? "—" : x.toLocaleDateString("fr-FR",
      { day: "2-digit", month: "long", year: "numeric" });
  };
  const jourLong = j => {
    const d = new Date(String(j) + "T12:00:00");
    return isNaN(d) ? String(j) : d.toLocaleDateString("fr-FR",
      { day: "numeric", month: "long", year: "numeric" });
  };

  function montrerAvertissements(liste, nouveaux) {
    if (!liste.length) return;

    U().modale({
      titre: nouveaux
        ? (liste.length > 1 ? "Des avertissements ont été portés à ton dossier"
                            : "Un avertissement a été porté à ton dossier")
        : "Ton dossier",
      corps:
        '<p class="champ__aide" style="margin-bottom:var(--e-4)">' + (nouveaux
          ? "Adresse-toi à un responsable si tu contestes."
          : "Ce qui pèse aujourd'hui à ton dossier.") + "</p>" +
        '<div class="pile pile--sm">' + liste.map(a => {
          const g = MNStore.graviteDe(a.gravite);
          return '<div class="av" style="--grav:' + esc(g.couleur) + '">' +
            '<span class="av__pastille">' + esc(g.court) + "</span>" +
            '<div class="av__corps"><b>' + esc(a.motif) + "</b>" +
              (a.note ? '<p class="av__note">' + esc(a.note) + "</p>" : "") +
              '<div class="av__meta">' + esc(dateLongue(a.at)) +
                (a.by ? " · par " + esc(a.by) : "") +
                (a.expire ? " · compte jusqu'au " + esc(jourLong(a.expire)) : "") +
              "</div></div></div>";
        }).join("") + "</div>",
      actions: [{
        label: nouveaux ? "J'ai compris" : "Fermer",
        variante: "principal", icone: "check",
        onClick: f => {
          /* Marqué lu seulement par ce bouton : refermer d'un Échap laisse le
             rappel revenir, ce qui est bien le but. */
          if (nouveaux) avMarquerVus(_session.uid, liste.map(a => a.id));
          f();
          rafraichirJetonAvert();
        }
      }]
    });
  }

  /** Le jeton de la barre du haut, posé ou retiré selon l'état du dossier. */
  function rafraichirJetonAvert() {
    const z = document.getElementById("v2-avert");
    if (!z) return;
    const l = mesAvertissements();
    if (!l.length) { z.innerHTML = ""; return; }

    const pire = l.reduce((p, a) =>
      MNStore.graviteDe(a.gravite).poids > MNStore.graviteDe(p).poids ? a.gravite : p, "rappel");
    z.innerHTML = '<button class="avchip" style="--grav:' +
      esc(MNStore.graviteDe(pire).couleur) +
      '" title="Voir ce qui pèse à ton dossier">' + U().icone("alerte") +
      "<span>" + l.length + " avertissement" + (l.length > 1 ? "s" : "") + "</span></button>";

    /* Le jeton rouvre le détail : la page Équipe demande un droit qu'un
       mécano n'a pas, il n'y accéderait pas. */
    z.querySelector(".avchip").addEventListener("click", () =>
      montrerAvertissements(mesAvertissements(), false));
  }

  /** À l'arrivée : rien si tout a déjà été lu. */
  function rappelAvertissements() {
    if (!_session || !_session.uid) return;
    const vus = avVus(_session.uid);
    const neufs = mesAvertissements().filter(a => vus.indexOf(a.id) === -1);
    if (neufs.length) montrerAvertissements(neufs, true);
  }

  /** Le nom ou le logo de l'atelier a changé : on repeint la marque plutôt
      que de remonter toute la page, qui perdrait la saisie en cours. */
  function rafraichirMarque() {
    const a = document.querySelector(".sidebar__marque");
    if (a) a.outerHTML = marque();
  }

  /* ---- Modifications non publiées ------------------------------------------
     Le catalogue ne s'écrit pas en direct : on travaille sur un brouillon
     gardé dans le navigateur, qu'un responsable publie ensuite. Le bandeau
     vit dans le squelette et non dans chaque page — toutes celles qui
     touchent au catalogue en ont besoin, et il doit rester au même endroit
     quand on passe de l'une à l'autre.

     @param {Function} [apres] rappelé après une publication réussie, pour
                               que la page se redessine. */

  function brouillon(apres) {
    const z = document.getElementById("v2-brouillon");
    if (!z) return;
    if (!MNStore.hasDraft()) { z.innerHTML = ""; return; }

    const peut = MNAuth.can("publish") && MNGitHub.canPublish();
    z.innerHTML =
      '<div class="brouillon" role="status">' +
        '<span class="brouillon__point"></span>' +
        '<div class="brouillon__txt"><b>Modifications non publiées.</b> ' +
          "<span>" + (peut
            ? "Publie-les pour que l'équipe les voie."
            : "Un responsable devra les publier.") + "</span></div>" +
        (peut
          ? U().bouton("Publier", { variante: "principal", taille: "sm",
                                    icone: "nuage", action: "pub" })
          : "") +
      "</div>";

    const b = z.querySelector('[data-a="pub"]');
    if (!b) return;
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.innerHTML = U().icone("rafraichir") + "<span>Publication…</span>";
      const cat = MNStore.catalog();
      try {
        const info = await MNGitHub.publish(MNStore.toJSON(cat),
          "Catalogue mis à jour par " + _session.pseudo);
        /* Le repère sert à la V1 pour savoir que ce brouillon est parti. */
        localStorage.setItem("mn.gh.stamp", cat.updatedAt);
        U().toast(info && info.serveur
          ? "Publié — en ligne tout de suite"
          : "Publié — en ligne dans une minute environ", "ok");
      } catch (e) {
        U().toast("Publication impossible : " + (e && e.message || e), "err");
      }
      brouillon(apres);
      if (apres) apres();
    });
  }

  /* ---- Apparence -----------------------------------------------------------
     Le moteur de thèmes est celui de l'atelier : on ne fait qu'en présenter
     les choix. Le thème retenu vaut pour les deux versions — c'est un réglage
     de personne, pas de version. */

  function choisirTheme() {
    const courant = MNTheme.actuel() || MNTheme.THEMES[0];
    const perso = MNTheme.aUnChoixPerso();

    /* La vignette passe par `palette()` plutôt que par les trois couleurs
       brutes : c'est le vrai rendu, bordures et dégradés compris. */
    const carreau = t => {
      const p = MNTheme.palette(t);
      return '<button class="theme-carreau' + (t.id === courant.id ? " is-actif" : "") +
        '" data-t="' + esc(t.id) + '" type="button" title="' + esc(t.note || t.nom) + '">' +
        '<span class="theme-apercu" style="background:' + esc(p["--bg"]) + '">' +
          '<i style="background:linear-gradient(180deg,' + esc(p["--surface-2"]) + "," +
            esc(p["--surface-lo"]) + ');border:1px solid ' + esc(p["--line"]) + '"></i>' +
          '<i style="background:' + esc(p["--pink"]) + '"></i>' +
          '<i style="background:' + esc(p["--pink-soft"]) + '"></i>' +
        "</span>" + esc(t.nom) + "</button>";
    };

    const corps = document.createElement("div");
    corps.innerHTML =
      '<p class="champ__aide" style="margin-bottom:var(--e-4)">Ce réglage ne vaut que pour ' +
        "<b>toi</b>, sur cet appareil, et te suit sur les deux versions du site.</p>" +
      '<div class="theme-grille" id="th-grille">' +
        MNTheme.THEMES.map(carreau).join("") + "</div>" +

      '<div class="champ" style="margin-top:var(--e-5)">' +
        '<span class="champ__label">Couleurs libres</span>' +
        '<div class="cols-3">' +
          U().champ({ id: "th-acc", label: "Accent", type: "color", valeur: courant.accent }) +
          U().champ({ id: "th-bg", label: "Fond", type: "color", valeur: courant.fond }) +
          U().champ({ id: "th-su", label: "Encadrés", type: "color", valeur: courant.surface }) +
        "</div>" +
        '<p class="champ__aide" style="margin-top:var(--e-3)">« Encadrés » est la couleur des ' +
          "cartes, des rangées et des panneaux. Le reste — textes, bordures, contrastes — se " +
          "calcule à partir de ces trois couleurs. Un fond clair bascule l'ensemble en thème " +
          "clair.</p>" +
      "</div>" +
      '<p class="champ__aide" style="margin-top:var(--e-3)">Les changements s\'appliquent en ' +
        "direct : referme avec <b>Garder</b> pour les conserver.</p>";

    /* On mémorise l'état de départ pour tout remettre en place si la personne
       annule après avoir tâtonné. Sans choix personnel, `null` remet le thème
       de l'atelier — ce qui est bien l'état d'avant. */
    const avant = perso ? Object.assign({}, courant) : null;

    const grille = corps.querySelector("#th-grille");
    const acc = corps.querySelector("#th-acc");
    const bg = corps.querySelector("#th-bg");
    const su = corps.querySelector("#th-su");

    const marquer = id => grille.querySelectorAll("[data-t]").forEach(b =>
      b.classList.toggle("is-actif", b.dataset.t === id));

    grille.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => {
      const t = MNTheme.THEMES.find(x => x.id === b.dataset.t);
      if (!t) return;
      const n = MNTheme.choisir(t.id);
      acc.value = n.accent; bg.value = n.fond; su.value = n.surface;
      marquer(t.id);
    }));

    /* Toucher une couleur sort des thèmes proposés : plus aucune vignette
       n'est active, et l'ensemble devient « Personnalisé ». */
    const surMesure = () => {
      MNTheme.choisir({
        id: "perso", nom: "Personnalisé",
        accent: acc.value, fond: bg.value, surface: su.value
      });
      marquer("perso");
    };
    [acc, bg, su].forEach(x => x.addEventListener("input", surMesure));

    U().modale({
      titre: "Apparence", corps,
      actions: [
        { label: "Reprendre celui du site",
          onClick: f => {
            MNTheme.choisir(null);
            f();
            U().toast("Apparence du site rétablie", "ok");
          } },
        { label: "Annuler", onClick: f => { MNTheme.choisir(avant); f(); } },
        { label: "Garder", variante: "principal", icone: "check", onClick: f => f() }
      ]
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

    /* `refresh()` et non `apply()` : le premier choisit entre la préférence
       personnelle et le thème réglé dans l'administration, le second
       appliquait un thème par défaut et écrasait les deux. */
    try { MNTheme.refresh(); } catch (_) { /* thème facultatif */ }

    _session = MNAuth.session();
    if (!_session) {
      /* La connexion reste celle de la V1 : un seul endroit où l'on entre son
         mot de passe, et une seule session pour les deux versions. */
      const suite = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
      location.href = "../index.html?v2=" + suite;
      return;
    }

    /* Le pointage suit l'atelier où l'on travaille. À poser avant que la page
       ne lise quoi que ce soit. */
    MNStore.setAtelier(MNAuth.atelier());
    if (window.MNDuty) MNDuty.setAtelier(MNAuth.atelier());
    document.title = (o.titre ? o.titre + " · " : "") +
      MNStore.nomAtelier(MNAuth.atelier()) + (V2.VERSION.beta ? " (V2 bêta)" : "");

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

    /* Après la page : un avertissement doit se voir, mais pas retarder
       l'affichage de ce qu'on venait faire. */
    rafraichirJetonAvert();
    rappelAvertissements();
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
    demarrer, actions, refuser, basculerTiroir, brouillon, rafraichirMarque,
    session: () => _session,
    peut: function () { return MNAuth.canAny.apply(null, arguments); }
  };
})();
