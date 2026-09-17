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
      '<span class="marque__jeton' + (b.logo ? " marque__jeton--perso" : "") + '">' +
        logo + "</span>" +
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
          /* Une entrée qui n'ouvre qu'une fenêtre devient un bouton quand on
             est déjà sur sa page : recharger pour afficher une fenêtre serait
             absurde. La page écoute `data-a` et s'en charge. */
          (e.fenetre
            ? '<button type="button" class="navlien" data-a="hist" ' +
              'data-nom="' + esc(e.nom) + '">'
            : '<a class="navlien' + (e.id === _page ? " is-actif" : "") + '" href="' + esc(e.href) +
              '" data-id="' + esc(e.id) + '" data-nom="' + esc(e.nom) + '"' +
              (e.id === _page ? ' aria-current="page"' : "") + ">") +
            U().icone(e.icone) + "<span>" + esc(e.nom) + "</span>" +
          (e.fenetre ? "</button>" : "</a>")).join("") +
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
          U().bouton("", { icone: "recherche", variante: "fantome",
                           titre: "Rechercher (Ctrl+K)", action: "chercher" }) +
          (_page === "livret" ? ""
            : U().bouton("", { icone: "info", variante: "fantome",
                               titre: "Le livret", action: "aide" })) +
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

    const ch = app.querySelector('[data-a="chercher"]');
    if (ch) ch.addEventListener("click", palette);

    const ai = app.querySelector('[data-a="aide"]');
    if (ai) ai.addEventListener("click", aide);

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

  /* ---- Ce qui attend au panier ------------------------------------------------
     Le panier survit au changement de page, et c'est voulu : on commence un
     devis, on va vérifier une fiche véhicule, on revient. Seulement rien ne le
     rappelait depuis les autres pages, et un devis commencé s'oubliait.

     Une pastille sur l'entrée « Facturation » suffit. Elle ne demande pas
     d'aller voir : elle dit qu'il y a quelque chose en cours. */

  function nbPanier() {
    try {
      const c = MNStore.getCart();
      return Object.keys(c).reduce((n, k) => n + (c[k] > 0 ? c[k] : 0), 0);
    } catch (_) { return 0; }
  }

  function majPastillePanier() {
    const n = nbPanier();
    document.querySelectorAll('.navlien[data-id="facturation"]').forEach(a => {
      const p = a.querySelector(".navlien__n");
      if (!n) { if (p) p.remove(); return; }
      const txt = n + " objet" + (n > 1 ? "s" : "") + " au panier";
      if (p) { p.textContent = n; p.title = txt; return; }
      a.insertAdjacentHTML("beforeend",
        '<span class="navlien__n navlien__n--vif" title="' + esc(txt) + '">' + n + "</span>");
    });
  }

  /* Qui touche au panier le dit, ici ou dans un autre onglet. */
  document.addEventListener("v2:panier", majPastillePanier);
  window.addEventListener("storage", e => {
    if (!e.key || e.key.indexOf("cart") !== -1) majPastillePanier();
  });

  /** Le nom ou le logo de l'atelier a changé : on repeint la marque plutôt
      que de remonter toute la page, qui perdrait la saisie en cours. */
  function rafraichirMarque() {
    const a = document.querySelector(".sidebar__marque");
    if (a) a.outerHTML = marque();
  }

  /* ---- Ce qui n'est pas encore en ligne -------------------------------------
     Le catalogue ne s'écrit pas en direct : on travaille sur un brouillon
     gardé dans le navigateur. Il ne reste plus à personne de penser à le
     publier — MNGitHub l'envoie tout seul, sur le serveur quand celui-ci
     détient le catalogue. Le bandeau n'est donc plus un rappel, c'est un
     compte rendu.

     Il vit dans le squelette et non dans chaque page : toutes celles qui
     touchent au catalogue en ont besoin, et il doit rester au même endroit
     quand on passe de l'une à l'autre.

     @param {Function} [apres] rappelé après un envoi manuel réussi, pour que
                               la page se redessine. */

  const TONS_ENVOI = { ok: "var(--toxic)", warn: "var(--amber)", err: "var(--danger)" };

  function brouillon(apres) {
    const z = document.getElementById("v2-brouillon");
    if (!z) return;
    if (!MNStore.hasDraft()) { z.innerHTML = ""; return; }

    const mot = MNGitHub.motAuto();

    /* Pas de mot : l'envoi automatique ne peut rien faire — il n'y a pas de
       serveur pour écrire. La permission « publier » n'entre plus en jeu :
       la mise en ligne suit l'écriture, pour tout le monde. */
    if (!mot) {
      z.innerHTML =
        '<div class="brouillon" role="status">' +
          '<span class="brouillon__point"></span>' +
          '<div class="brouillon__txt"><b>Modifications enregistrées ici seulement.</b> ' +
            "<span>Aucun serveur n'est configuré : c'est lui qui met le site " +
            "à jour.</span></div>" +
        "</div>";
    } else {
      const c = TONS_ENVOI[mot.ton] || TONS_ENVOI.ok;
      z.innerHTML =
        '<div class="brouillon" role="status">' +
          '<span class="brouillon__point" style="background:' + c +
            ";box-shadow:0 0 12px " + c + '"></span>' +
          '<div class="brouillon__txt"><b>' + U().esc(mot.titre) + "</b>" +
            (mot.detail ? " <span>" + U().esc(mot.detail) + "</span>" : "") + "</div>" +
          (mot.bouton && peut
            ? U().bouton(mot.bouton === "reessayer" ? "Réessayer" : "Publier sur GitHub",
                { variante: "principal", taille: "sm", icone: "nuage", action: "pub" })
            : "") +
        "</div>";
    }

    const b = z.querySelector('[data-a="pub"]');
    if (!b) return;
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.innerHTML = U().icone("rafraichir") + "<span>Mise en ligne…</span>";
      const info = await MNGitHub.publierMaintenant();
      if (info) {
        U().toast(info.serveur
          ? "En ligne tout de suite"
          : "Envoyé — en ligne dans une minute environ", "ok");
      } else {
        const echec = MNGitHub.etatAuto().echec;
        if (echec) U().toast("Mise en ligne impossible : " + echec.message, "err");
      }
      brouillon(apres);
      if (apres) apres();
    });
  }

  /* Le bandeau suit l'envoi, qui part sans passer par les pages. */
  try { MNGitHub.onAuto(() => brouillon()); } catch (_) { /* module absent */ }

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

    /* Un brouillon peut attendre depuis la visite d'hier — un onglet fermé
       trop tôt, une connexion coupée. On ne sait qu'ici qui est là et ce
       qu'il a le droit de faire : c'est le moment de le faire partir. */
    if (window.MNGitHub) MNGitHub.reveiller();

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
    majPastillePanier();
    rafraichirJetonAvert();
    rappelAvertissements();
  }

  /* ---- L'historique des devis ------------------------------------------------
     Une fenêtre et non une page : on y jette un œil, on la referme, et on
     reprend ce qu'on faisait. Elle vit ici plutôt que dans la facturation
     parce qu'on la demande depuis n'importe où — l'avoir laissée là-bas
     obligeait à changer de page pour l'ouvrir. */

  /**
   * Remet au panier les lignes d'un devis déjà enregistré.
   *
   * Le même client revient, ou une ligne était fausse : sans ça, tout se
   * ressaisissait à la main. On ne recopie que ce qui existe encore au
   * catalogue, et on le dit AVANT d'agir — après, on aura changé de page et
   * plus personne ne lira le message.
   */
  async function reprendre(bon) {
    const U2 = U();

    const gardees = [], perdues = [];
    (bon.lines || []).forEach(l => {
      (MNStore.itemById(l.id) ? gardees : perdues).push(l);
    });

    if (!gardees.length) {
      U2.toast("Aucun objet de ce devis n'existe encore au catalogue", "err");
      return;
    }

    const encours = nbPanier();
    const soucis = [];
    if (perdues.length) {
      soucis.push(perdues.length > 1
        ? perdues.length + " objets ne sont plus au catalogue : ils seront laissés de côté."
        : "Un objet n'est plus au catalogue : il sera laissé de côté.");
    }
    if (encours) {
      soucis.push("Le devis en cours (" + encours + " objet" +
        (encours > 1 ? "s" : "") + ") sera remplacé.");
    }

    if (soucis.length) {
      const ok = await U2.confirmer({
        titre: "Reprendre " + bon.ref,
        message: soucis.join(" "),
        confirmer: "Reprendre"
      });
      if (!ok) return;
    }

    const panier = {};
    gardees.forEach(l => { panier[l.id] = (panier[l.id] || 0) + l.qty; });
    MNStore.setCart(panier);
    document.dispatchEvent(new CustomEvent("v2:panier", { detail: { repris: true } }));

    /* Déjà sur place : la page se remet d'elle-même en écoutant l'événement,
       et on ne recharge pas pour rien. Ailleurs : on y va. */
    if (_page === "facturation") U2.toast("Devis " + bon.ref + " repris", "ok");
    else location.href = "facturation.html";
  }

  function historique() {
    const U2 = U();
    const l = MNStore.getBTs();
    const m = U2.modale({
      titre: "Devis enregistrés", large: true,
      corps: l.length
        ? U2.tableau(
            [{ nom: "Client", rendu: b => U2.esc(b.client || "—") },
             { nom: "Référence", rendu: b => '<span class="mono">' + U2.esc(b.ref) + "</span>" },
             { nom: "Quand", rendu: b => U2.esc(new Date(b.at).toLocaleString("fr-FR")) },
             { nom: "Par", cle: "by" },
             { nom: "Objets", num: true, rendu: b => b.count || b.lines.length },
             { nom: "", rendu: b =>
                 U2.bouton("", { icone: "rafraichir", variante: "fantome", taille: "sm",
                                 titre: "Reprendre ce devis", action: "re-" + b.ref }) +
                 U2.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                                 titre: "Supprimer", action: "rm-" + b.ref }) }],
            l)
        : U2.vide({ icone: "recu", titre: "Aucun bon enregistré",
                    texte: "Les bons que tu enregistres apparaîtront ici.",
                    action: _page === "facturation" ? "" :
                      U2.bouton("Aller à la facturation",
                        { href: "facturation.html", variante: "doux", taille: "sm" }) }),
      actions: [{ label: "Fermer", onClick: f => f() }]
    });

    m.corps.querySelectorAll("[data-a^='re-']").forEach(b =>
      b.addEventListener("click", () => {
        const bon = l.find(x => x.ref === b.dataset.a.slice(3));
        if (!bon) return;
        m.fermer();
        reprendre(bon);
      }));

    m.corps.querySelectorAll("[data-a^='rm-']").forEach(b =>
      b.addEventListener("click", async () => {
        const ref = b.dataset.a.slice(3);
        const ok = await U2.confirmer({ titre: "Supprimer ce bon",
          message: ref + " sera définitivement supprimé.", confirmer: "Supprimer",
          danger: true });
        if (!ok) return;
        MNStore.removeBT(ref);
        m.fermer();
        historique();
      }));
  }

  /* Les deux barres se redessinent : on écoute le document, une fois. */
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest('[data-a="hist"]');
    if (b) { e.preventDefault(); historique(); }
  });

  /* ---- Le livret, sans quitter sa page ---------------------------------------
     Deux services ne servent qu'à l'afficher : la mise en forme du texte riche
     et les polices déposées. Les charger sur chaque page ferait payer à toutes
     ce dont une seule se sert — on ne va les chercher qu'au premier clic.

     Les chemins sont relatifs à la page, et toutes les pages de la V2 vivent
     dans le même dossier : ils valent donc partout. */

  const SERVICES_LIVRET = ["services/polices.js", "services/texte.js"];
  let _livretEnRoute = null;

  function chargerServicesLivret() {
    if (window.MNTexte && window.MNPolices) return Promise.resolve();
    if (_livretEnRoute) return _livretEnRoute;
    _livretEnRoute = Promise.all(SERVICES_LIVRET.map(src => new Promise((ok, non) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => non(new Error("« " + src + " » n'a pas pu être chargé."));
      document.head.appendChild(s);
    })));
    /* Un échec ne doit pas condamner les clics suivants : le réseau peut
       revenir. */
    _livretEnRoute.catch(() => { _livretEnRoute = null; });
    return _livretEnRoute;
  }

  async function aide() {
    const U2 = U();
    const peutEcrire = MNAuth.canAny("admin", "items");

    const m = U2.modale({
      titre: "Le livret", large: true,
      corps: '<p class="champ__aide">Un instant…</p>',
      actions: [
        { label: "Ouvrir la page", onClick: f => { f(); location.href = "livret.html"; } },
        { label: "Fermer", variante: "principal", icone: "check", onClick: f => f() }
      ]
    });

    try {
      await chargerServicesLivret();
    } catch (e) {
      /* La fenêtre a pu être refermée pendant le chargement. */
      if (!m.corps.isConnected) return;
      m.corps.innerHTML = U2.alerte({
        ton: "erreur", titre: "Le livret n'a pas pu s'ouvrir",
        texte: String((e && e.message) || e)
      });
      return;
    }
    if (!m.corps.isConnected) return;

    /* Les polices déposées : sans elles, un livret écrit avec l'une d'elles
       s'afficherait dans celle du site, sans qu'on comprenne pourquoi. */
    try { MNPolices.charger().catch(() => { /* le livret se lit quand même */ }); }
    catch (_) { /* idem */ }

    const texte = MNStore.livretDe(MNAuth.atelier()).trim();
    m.corps.innerHTML = texte
      ? '<div class="livret">' + MNTexte.pourAffichage(texte) + "</div>"
      : U2.vide({
          icone: "contrat",
          titre: "Le livret n'a pas encore été écrit",
          texte: peutEcrire
            ? "C'est là qu'on note les tarifs et les marches à suivre."
            : "Un responsable doit s'en charger.",
          action: peutEcrire
            ? U2.bouton("L'écrire", { href: "admin.html", variante: "doux", taille: "sm" })
            : ""
        });
  }

  /* ---- Aller droit au but ------------------------------------------------------
     La recherche globale mène à une page ET lui passe ce qu'on cherchait : sans
     quoi elle ouvrirait « Véhicules » et laisserait chercher à la main, ce qui
     ne fait gagner qu'un clic.

     Le terme voyage dans l'adresse, et la page l'efface en le lisant : un
     rafraîchissement ne doit pas refiltrer ce qu'on avait fini par élargir. */

  function motCherche() {
    let mot = "";
    try {
      mot = new URLSearchParams(location.search).get("q") || "";
    } catch (_) { return ""; }
    if (!mot) return "";
    try {
      history.replaceState(null, "", location.pathname + location.hash);
    } catch (_) { /* sans historique, tant pis : le terme restera dans l'adresse */ }
    return mot;
  }

  /* ---- La recherche qui traverse tout ------------------------------------------ */

  const sansAccent = s => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  /** Tout ce qu'on sait chercher, sans charger quoi que ce soit de plus. */
  function gisements() {
    const g = [];

    navVisible().forEach(grp => grp.entrees.forEach(e => {
      if (e.fenetre) return;   /* une fenêtre n'est pas un endroit où aller */
      g.push({ genre: "Page", nom: e.nom, icone: e.icone, href: e.href });
    }));

    try {
      MNStore.catalog().items
        .filter(i => i.enabled && MNStore.estDeAtelier(i, MNAuth.atelier()))
        .forEach(i => g.push({
          genre: "Objet", nom: i.name, icone: "boite",
          href: "facturation.html?q=" + encodeURIComponent(i.name)
        }));
    } catch (_) { /* catalogue illisible : on cherchera ailleurs */ }

    if (MNAuth.canAny("equipe", "admin")) {
      try {
        MNStore.usersDeAtelier(MNAuth.atelier()).forEach(u => g.push({
          genre: "Employé", nom: u.pseudo, icone: "equipe",
          href: "equipe.html?q=" + encodeURIComponent(u.pseudo)
        }));
      } catch (_) { /* équipe illisible */ }
    }

    try {
      (MNParc.parc().vehicles || []).forEach(v => g.push({
        genre: "Véhicule", nom: v.name, icone: "vehicule",
        href: "vehicules.html?q=" + encodeURIComponent(v.name)
      }));
    } catch (_) { /* parc pas encore chargé */ }

    return g;
  }

  /**
   * Les meilleures réponses à ce qu'on tape.
   *
   * Ce qui commence par le terme passe devant ce qui le contient : taper
   * « pei » doit proposer « Peinture » avant « Kit de peinture ». À rang égal,
   * les pages d'abord — on tape rarement trois lettres pour tomber sur un objet
   * quand une page porte le même nom.
   */
  function trouver(mot, tout) {
    const q = sansAccent(mot).trim();
    if (!q) return tout.filter(x => x.genre === "Page").slice(0, 8);

    const RANG = { Page: 0, Objet: 1, "Employé": 2, "Véhicule": 3 };
    return tout
      .map(x => {
        const n = sansAccent(x.nom);
        const p = n.indexOf(q);
        if (p === -1) return null;
        return { x, score: (p === 0 ? 0 : 1000) + p * 10 + (RANG[x.genre] || 9) };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.x.nom.localeCompare(b.x.nom))
      .slice(0, 12)
      .map(r => r.x);
  }

  let _paletteOuverte = false;

  function palette() {
    if (_paletteOuverte) return;
    _paletteOuverte = true;

    const U2 = U();
    let tout = gisements();
    let choix = 0, liste = trouver("", tout);

    const corps = document.createElement("div");
    corps.innerHTML =
      '<input class="saisie" id="pal-q" autocomplete="off" ' +
        'placeholder="Une page, un objet, quelqu\'un, un véhicule…">' +
      '<div class="pal" id="pal-l"></div>' +
      '<p class="champ__aide" style="margin-top:var(--e-3)">' +
        "↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer.</p>";

    const m = U2.modale({
      titre: "Rechercher", corps,
      actions: [{ label: "Fermer", onClick: f => f() }]
    });

    /* La modale se referme par la croix, le voile ou Échap : sans ça, la
       palette se croirait ouverte pour toujours et le raccourci ne
       répondrait plus. */
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.element)) { obs.disconnect(); _paletteOuverte = false; }
    });
    obs.observe(document.body, { childList: true });

    const zone = corps.querySelector("#pal-l");
    const champ = corps.querySelector("#pal-q");

    function peindre() {
      zone.innerHTML = liste.length
        ? liste.map((x, i) =>
            '<button type="button" class="pal__r' + (i === choix ? " is-actif" : "") +
              '" data-i="' + i + '">' +
              U2.icone(x.icone) +
              '<span class="pal__nom tronque">' + esc(x.nom) + "</span>" +
              '<span class="pal__genre">' + esc(x.genre) + "</span>" +
            "</button>").join("")
        : '<p class="champ__aide" style="padding:var(--e-3)">Rien ne correspond.</p>';

      zone.querySelectorAll("[data-i]").forEach(b =>
        b.addEventListener("click", () => ouvrir(Number(b.dataset.i))));

      const actif = zone.querySelector(".is-actif");
      if (actif && actif.scrollIntoView) actif.scrollIntoView({ block: "nearest" });
    }

    function ouvrir(i) {
      const x = liste[i];
      if (!x) return;
      m.fermer();
      location.href = x.href;
    }

    champ.addEventListener("input", () => {
      liste = trouver(champ.value, tout);
      choix = 0;
      peindre();
    });

    champ.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); choix = Math.min(choix + 1, liste.length - 1); peindre(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); choix = Math.max(choix - 1, 0); peindre(); }
      else if (e.key === "Enter") { e.preventDefault(); ouvrir(choix); }
    });

    peindre();
    champ.focus();

    /* Le parc arrive du serveur : sans lui, aucun véhicule ne sortirait depuis
       une page qui ne s'en sert pas. On le demande maintenant, et on repeint
       quand il est là — si la fenêtre est encore ouverte. */
    if (!(MNParc.parc().vehicles || []).length) {
      MNParc.load().then(() => {
        if (!corps.isConnected) return;
        tout = gisements();
        liste = trouver(champ.value, tout);
        choix = 0;
        peindre();
      }).catch(() => { /* pas de parc : on cherche sans lui */ });
    }
  }

  /* ---- Les raccourcis -----------------------------------------------------------
     Deux, pas douze : on ne retient que ce qu'on utilise tous les jours.

     « / » est le réflexe de tout le monde pour chercher, mais il faut se garder
     d'attraper la barre obliques quand quelqu'un est en train d'écrire — dans
     un champ, dans une zone de texte, ou dans le livret qui s'édite au clavier. */

  const enTrainDEcrire = () => {
    const a = document.activeElement;
    if (!a) return false;
    const t = (a.tagName || "").toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || a.isContentEditable;
  };

  document.addEventListener("keydown", e => {
    const k = (e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K");
    if (k) { e.preventDefault(); palette(); return; }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !enTrainDEcrire()) {
      e.preventDefault();
      palette();
    }
  });

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
    /* Le terme venu de la recherche globale, que la page doit reprendre. */
    motCherche,
    /* La facturation l'ouvre aussi, en arrivant sur l'ancre. */
    historique,
    session: () => _session,
    peut: function () { return MNAuth.canAny.apply(null, arguments); }
  };
})();
