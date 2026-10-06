/* ==========================================================================
   Livret de l'atelier — V2.

   Même contenu et même assistant que la V1 : le livret vit dans le catalogue,
   la clé Gemini sur le VPS. Ce qui change, c'est la mise en page.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  /* Ce qu'on accepte d'envoyer d'un coup. Le livret, lui, n'a plus de longueur
     maximale : c'est un texte que l'équipe écrit, pas un champ de formulaire.
     La requête en garde une quand même — sans quoi un livret devenu énorme
     partirait en entier à chaque question posée. Le serveur applique le même
     chiffre et coupe aussi de son côté. */
  const MAX_CONTEXTE = 120000;
  const COUPE = "\n\n[Le livret est plus long que ce qui tient ici : il est " +
    "coupé à cet endroit. Si la réponse dépend de la suite, dis-le plutôt que " +
    "de l'inventer.]";

  let hote = null, moi = null;
  let assistantDispo = null;   // null = pas encore su
  let occupe = false;
  const fil = [];

  V2Shell.demarrer({
    page: "livret",
    titre: "Livret",
    pret: async function (session, h) {
      hote = h; moi = session;
      /* Les polices déposées, s'il y en a : sans elles, un livret écrit avec
         l'une d'elles s'afficherait dans celle du site sans qu'on comprenne. */
      MNPolices.charger().catch(() => { /* le livret se lit quand même */ });
      dessiner();
      sonder();
    }
  });

  /* ---- L'assistant est-il là ? ---- */

  async function sonder() {
    let u = "";
    try { u = MNStore.api("sante"); } catch (_) { u = ""; }
    if (!u) { assistantDispo = false; return majAssistant(); }
    try {
      const r = await fetch(u, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      assistantDispo = !!(j && j.assistant);
    } catch (_) {
      assistantDispo = false;
    }
    majAssistant();
  }

  /* ---- Ce que l'assistant a sous les yeux --------------------------------------
     Le livret, et de quoi répondre aux questions de tous les jours. Rien de
     personnel — ni codes, ni avertissements, ni notes internes. */

  function contexte() {
    const c = MNStore.catalog();
    const ou = MNAuth.atelier();
    const l = [];

    l.push("Garage : " + MNStore.nomAtelier(ou));
    l.push("Enseigne : " + MNStore.brand().name);

    const mini = MNStore.minimumDe(ou);
    l.push(mini
      ? "Heures de service attendues par semaine : " + mini + " h. En dessous, " +
        "la personne est signalée dans le récapitulatif du dimanche, sauf congés " +
        "posés ou exemption."
      : "Aucun minimum d'heures hebdomadaire dans ce garage.");

    const roles = MNStore.rolesDeAtelier(ou);
    if (roles.length) {
      l.push("");
      l.push("GRADES (du plus haut au plus bas dans la liste) :");
      roles.forEach(r => {
        const noms = (r.perms || []).indexOf("admin") !== -1
          ? ["tous les droits"]
          : (r.perms || []).map(k => {
              const d = (window.MN_PERMS || []).find(x => x.key === k);
              return d ? d.name : k;
            });
        l.push("- " + r.name + " : " + (noms.length ? noms.join(", ") : "aucun droit"));
      });
    }

    /* Les matières premières telles qu'elles s'appellent au stock : sans cette
       liste, l'assistant n'a que des noms croisés dans les recettes et ne sait
       pas qu'il les a toutes vues. */
    if (c.resources.length) {
      l.push("");
      l.push("RESSOURCES DE L'ATELIER : " + c.resources.map(r => r.name).join(", "));
    }

    const items = c.items.filter(i => i.enabled && MNStore.estDeAtelier(i, ou));
    if (items.length) {
      l.push("");
      l.push("PRESTATIONS ET RESSOURCES NÉCESSAIRES :");
      c.categories.filter(x => !x.parent).forEach(cat => {
        const sous = c.categories.filter(x => x.parent === cat.id).map(x => x.id);
        const dedans = items.filter(i =>
          i.category === cat.id || sous.indexOf(i.category) !== -1);
        if (!dedans.length) return;
        l.push("[" + cat.name + "]");
        dedans.forEach(i => {
          const cout = Object.keys(i.cost || {}).map(rid => {
            const r = MNStore.resourceById(rid);
            return (r ? r.name : rid) + " x" + i.cost[rid];
          });
          l.push("- " + i.name + " : " +
            (cout.length ? cout.join(", ") : "aucune ressource") +
            (i.pack > 1 ? " (un lot de " + i.pack + ", ce coût est celui du lot)" : "") +
            (i.max ? " ; maximum " + i.max + " par devis" : "") +
            /* Les secondes en plus du texte : une addition sur « 2 min 30 »
               se trompe une fois sur deux, sur 150 jamais. */
            (i.temps ? " ; fabrication " + MNStore.duree(i.temps) +
              " (" + i.temps + " s)" : " ; pas de temps renseigné"));
        });
      });
    }

    l.push("");
    l.push("COMMENT COMPTER : le coût et le temps d'une prestation se " +
      "multiplient par la quantité. Trois fois un objet qui demande 2 Ferraille " +
      "et 90 s, c'est 6 Ferraille et 270 s (4 min 30). Pour plusieurs " +
      "prestations, on additionne ressource par ressource, et les temps entre " +
      "eux.");

    const types = MNStore.contractTypes();
    if (types.length) {
      l.push("");
      l.push("TYPES DE CONTRAT : " + types.map(t => t.name).join(", "));
    }

    /* Le livret vient en dernier : c'est donc lui qu'une coupe par la fin
       atteindrait, et lui seul. On lui laisse toute la place qui reste, et
       s'il ne tient toujours pas, on le dit dans le texte — un assistant qui
       n'a lu que la moitié du livret ne doit pas répondre comme s'il l'avait
       lu en entier. */
    const tete = l.join("\n") + "\n\nLIVRET DE L'ATELIER :\n";
    /* Le livret est enrichi : on n'envoie pas les balises à l'assistant, il
       les recopierait dans ses réponses. */
    const livret = MNTexte.enTexte(MNStore.livretDe(MNAuth.atelier())).trim();
    if (!livret) return tete + "(aucun livret n'a encore été écrit)";

    const place = MAX_CONTEXTE - tete.length;
    if (livret.length <= place) return tete + livret;
    return tete + livret.slice(0, Math.max(0, place - COUPE.length)) + COUPE;
  }

  /* ---- Sommaire ----------------------------------------------------------------
     Le livret fait des milliers de caractères et une trentaine de sections
     numérotées. Les retrouver à la molette est une corvée : on relève les
     titres, on pose une ancre sur chacun, et une barre collante dit à la fois
     où l'on est et où l'on peut aller.

     Les ancres sont posées à l'AFFICHAGE, jamais dans le texte enregistré :
     le livret appartient à qui l'écrit, et on ne lui glisse pas des attributs
     dans le dos à chaque ouverture de page. */

  /** Un identifiant d'ancre tiré d'un titre. */
  function ancre(txt) {
    const s = String(txt || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // « é » devient « e »
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return "l-" + (s || "section");
  }

  /**
   * Pose une ancre sur chaque titre et relève le sommaire.
   * @param {string} html le livret, déjà nettoyé pour l'affichage
   * @returns {{html:string, entrees:Array<{id:string,texte:string,niveau:number}>}}
   */
  function avecAncres(html) {
    const doc = new DOMParser().parseFromString('<div id="r">' + html + "</div>", "text/html");
    const r = doc.getElementById("r");
    if (!r) return { html, entrees: [] };

    const pris = {};
    const entrees = [];
    r.querySelectorAll("h2, h3").forEach(h => {
      const texte = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (!texte) return;
      /* Deux sections peuvent porter le même nom : on numérote les suivantes
         plutôt que de les faire pointer toutes au même endroit. */
      let id = ancre(texte);
      pris[id] = (pris[id] || 0) + 1;
      if (pris[id] > 1) id += "-" + pris[id];
      h.setAttribute("id", id);
      entrees.push({ id, texte, niveau: h.tagName === "H3" ? 3 : 2 });
    });
    return { html: r.innerHTML, entrees };
  }

  /** Le sommaire, tel qu'il se range dans la barre de gauche. */
  function vueSommaire(entrees) {
    if (entrees.length < 4) return "";
    return '<div class="navgroupe">' +
      '<div class="navgroupe__titre">Sommaire</div>' +
      entrees.map(e =>
        '<a class="som-lien' + (e.niveau === 3 ? " som-lien--sous" : "") +
          '" href="#' + U.esc(e.id) + '" data-va="' + U.esc(e.id) + '">' +
          U.esc(e.texte) + "</a>").join("") +
    "</div>";
  }

  /* L'écoute posée sur la fenêtre : on garde de quoi la retirer, sinon un
     second rendu de la page en empile une de plus. */
  let surDefilement = null;

  function brancherSommaire(entrees) {
    if (surDefilement) { window.removeEventListener("scroll", surDefilement); surDefilement = null; }

    /* Le sommaire vit dans la barre de gauche, pas dans la page : c'est la
       coque qui tient la place, et elle la vide d'elle-même en changeant de
       page. */
    const zone = V2Shell.sousMenu(vueSommaire(entrees));
    if (!zone) return;

    const liens = [].slice.call(zone.querySelectorAll("[data-va]"));
    if (!liens.length) return;
    const titres = liens.map(a => document.getElementById(a.dataset.va)).filter(Boolean);
    const barre = document.querySelector(".sidebar__nav");

    /* Le seuil : un titre devient « celui où l'on est » dès qu'il passe sous
       la barre du haut. On le lit dans la marge que le CSS réserve déjà pour
       l'atterrissage (scroll-margin-top), sinon les deux chiffres divergent
       au premier changement de hauteur — et sauter à une section surlignerait
       la précédente. */
    const seuil = (titres.length
      ? parseFloat(getComputedStyle(titres[0]).scrollMarginTop) || 76
      : 76) + 8;

    /** Surligne la section où l'on se trouve, et la garde sous les yeux. */
    function marquer(h) {
      let vu = null;
      liens.forEach(a => {
        const on = !!h && a.dataset.va === h.id;
        a.classList.toggle("est-ici", on);
        if (on) vu = a;
      });

      /* La barre de gauche défile elle aussi, et trente sections n'y tiennent
         pas. On recentre à la main plutôt qu'avec scrollIntoView : celui-ci
         remonterait aussi la page, et on se battrait avec le lecteur. */
      if (vu && barre) {
        const r = vu.getBoundingClientRect(), rb = barre.getBoundingClientRect();
        if (r.top < rb.top + 8 || r.bottom > rb.bottom - 8) {
          barre.scrollTop += (r.top - rb.top) - (barre.clientHeight - r.height) / 2;
        }
      }
    }

    /** Le dernier titre passé sous la barre du haut. */
    function repere() {
      let actif = null;
      titres.forEach(h => { if (h.getBoundingClientRect().top <= seuil) actif = h; });
      marquer(actif);
    }

    function aller(id) {
      const h = document.getElementById(id);
      if (!h) return;
      /* Le glissement est agréable, mais pas pour tout le monde : qui a
         demandé moins d'animations saute directement, comme le reste du site
         (voir « prefers-reduced-motion » dans base.css). */
      const doux = !window.matchMedia ||
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      h.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
      /* L'adresse suit, sans déclencher un second saut. */
      try { history.replaceState(null, "", "#" + id); } catch (_) { /* rien */ }
      /* Le repère suit tout de suite : avec un défilement doux, les évènements
         n'arrivent qu'au fil de l'animation, et le surlignage resterait une
         seconde sur la section qu'on vient de quitter. */
      marquer(h);
      /* Un texte uniforme ne dit pas où l'on vient d'atterrir : on le signale
         un instant. */
      h.classList.add("est-vise");
      setTimeout(() => h.classList.remove("est-vise"), 1600);
    }

    liens.forEach(a => a.addEventListener("click", e => {
      e.preventDefault();
      /* Sur téléphone la barre est un tiroir ouvert par-dessus le texte :
         il n'a plus rien à faire là une fois la section choisie. */
      V2Shell.basculerTiroir(false);
      aller(a.dataset.va);
    }));

    /* Une fois par image, pas une fois par évènement : le défilement en émet
       des dizaines par seconde, et cinquante mesures de position à chaque
       fois finiraient par se sentir. */
    let prevu = false;
    surDefilement = () => {
      if (prevu) return;
      prevu = true;
      requestAnimationFrame(() => { prevu = false; repere(); });
    };
    window.addEventListener("scroll", surDefilement, { passive: true });

    /* Le menu principal remplit déjà la barre : sans ça, le sommaire naîtrait
       sous la ligne de flottaison et personne ne saurait qu'il est là. On
       l'amène sous les yeux en arrivant — le menu reste à un coup de molette
       au-dessus, et on est de toute façon déjà sur la page Livret. */
    if (barre) {
      const r = zone.getBoundingClientRect(), rb = barre.getBoundingClientRect();
      barre.scrollTop += r.top - rb.top;
    }

    repere();

    /* Une adresse qui désigne une section y emmène — mais seulement une fois
       la page posée. Le livret charge ses polices après coup, et elles
       changent la hauteur de chaque titre : sauter trop tôt, c'est viser une
       position qui n'existera plus une seconde après. */
    const vise = decodeURIComponent((location.hash || "").slice(1));
    if (vise && document.getElementById(vise)) {
      const sauter = () => aller(vise);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => setTimeout(sauter, 60)).catch(() => setTimeout(sauter, 200));
      } else {
        setTimeout(sauter, 200);
      }
    }
  }


  /* ---- Rendu ---- */

  function dessiner() {
    const livret = MNStore.livretDe(MNAuth.atelier()).trim();
    const peutEcrire = V2Shell.peut("admin", "items");
    /* Les ancres et le sommaire se préparent avant le rendu : la carte a
       besoin des deux d'un coup. */
    const pages = livret
      ? avecAncres(MNTexte.pourAffichage(livret))
      : { html: "", entrees: [] };

    /* La question d'abord : un apprenti arrive avec une question, pas avec
       l'envie de lire trois écrans. Le livret est juste dessous pour qui veut
       le parcourir. */
    hote.innerHTML =
      U.carte({
        titre: "Une question ?",
        actions: '<span id="a-etat"></span>',
        corps:
          '<div id="a-fil" class="fil"></div>' +
          '<div class="rang" style="margin-top:var(--e-3)">' +
            '<input class="saisie" id="a-q" maxlength="600" style="flex:1" ' +
              'placeholder="Ex. Combien coûte une vidange ?" autocomplete="off">' +
            U.bouton("Demander", { variante: "principal", icone: "check", action: "go" }) +
          "</div>" +
          '<p class="champ__aide" id="a-aide">L\'assistant relit le livret et les ' +
            "données du site pour te répondre. Il ne connaît que ça : s'il ne sait " +
            "pas, il te dira d'aller voir un responsable.</p>"
      }) +
      '<div style="margin-top:var(--e-4)">' +
      U.carte({
        titre: "Le livret",
        actions: peutEcrire
          ? '<a class="btn btn--fantome btn--sm" href="admin.html">' +
            U.icone("crayon") + "<span>Le modifier</span></a>"
          : "",
        corps: livret
          ? '<div class="livret">' + pages.html + "</div>"
          : '<p class="champ__aide">Le livret n\'a pas encore été écrit. ' +
            (peutEcrire
              ? "Tu peux t'en charger dans l'administration, onglet « Livret »."
              : "Un responsable doit s'en charger.") + "</p>"
      }) + "</div>";

    peindreFil();
    majAssistant();
    brancherSommaire(pages.entrees);

    hote.querySelector('[data-a="go"]').addEventListener("click", demander);
    $("#a-q").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); demander(); }
    });
  }


  /* ---- Les pages citées deviennent des liens --------------------------------
     « Va dans Facturation » sans lien, c'est une consigne de plus à suivre à la
     main. Le repérage se fait ici, jamais par l'assistant : un modèle qui écrit
     lui-même ses adresses en invente, et on se retrouve à cliquer vers nulle
     part. Ici la liste est courte, connue, et vérifiée.

     Seule la forme capitalisée compte — « la page Service », pas « prendre son
     service » — et seulement la première fois : un texte tout en liens ne se lit
     plus. */

  const PAGES = [
    { nom: "Facturation", href: "facturation.html" },
    { nom: "Devis", href: "facturation.html" },
    { nom: "Service", href: "service.html" },
    { nom: "Équipe", href: "equipe.html" },
    { nom: "Fiches", href: "equipe.html" },
    { nom: "Contrats", href: "contrats.html" },
    { nom: "Calendrier", href: "calendrier.html" },
    { nom: "Véhicules", href: "vehicules.html" },
    { nom: "Émotes", href: "emotes.html" },
    { nom: "Blacklist", href: "blacklist.html" },
    { nom: "Livret", href: "livret.html" },
    { nom: "Administration", href: "admin.html" },
    { nom: "Admin", href: "admin.html" }
  ];

  /** Les pages où la personne a le droit d'aller : les autres ne se lient pas. */
  function pagesOuvertes() {
    const ouvert = {
      "facturation.html": V2Shell.peut("bt", "admin"),
      "service.html": V2Shell.peut("duty", "duty_view", "duty_manage", "admin"),
      "equipe.html": V2Shell.peut("staff", "promote", "users", "admin"),
      "contrats.html": V2Shell.peut("contracts_view", "contracts", "contracts_delete", "admin"),
      "calendrier.html": true,
      "vehicules.html": true,
      "emotes.html": true,
      "blacklist.html": true,
      "livret.html": true,
      "admin.html": V2Shell.peut("items", "users", "publish", "theme", "contracts", "admin")
    };
    return PAGES.filter(p => ouvert[p.href]);
  }

  /**
   * Pose les liens dans du HTML déjà échappé. On travaille sur le texte échappé
   * exprès : le contenu ne peut plus rien injecter, et les noms de page n'ont
   * pas de caractère qui s'échappe.
   */
  function lier(html) {
    let out = html;
    pagesOuvertes().forEach(p => {
      /* Ni au milieu d'un mot, ni à l'intérieur d'une balise déjà posée. Les
         adresses sont en minuscules, les noms capitalisés : elles ne peuvent
         pas se croiser. */
      const re = new RegExp("(?<![A-Za-zÀ-ÿ<\\/])" + p.nom + "(?![A-Za-zÀ-ÿ])");
      if (!re.test(out)) return;
      out = out.replace(re, '<a class="lien-page" href="' + p.href + '">' + p.nom + "</a>");
    });
    return out;
  }

  /** Le texte libre du livret, rendu en paragraphes — sans interpréter de HTML. */
  function enParagraphes(t) {
    return U.esc(t).split(/\n{2,}/).map(bloc => {
      const lignes = bloc.split("\n");
      if (lignes.every(x => /^\s*[-•*]\s+/.test(x))) {
        return "<ul>" + lignes.map(x =>
          "<li>" + lier(x.replace(/^\s*[-•*]\s+/, "")) + "</li>").join("") + "</ul>";
      }
      return "<p>" + lier(lignes.join("<br>")) + "</p>";
    }).join("");
  }

  function majAssistant() {
    const etat = $("#a-etat"), q = $("#a-q"), aide = $("#a-aide");
    const go = hote.querySelector('[data-a="go"]');
    if (!etat) return;

    if (assistantDispo === null) {
      etat.innerHTML = U.etiquette("recherche…");
      q.disabled = go.disabled = true;
      return;
    }
    if (!assistantDispo) {
      etat.innerHTML = U.etiquette("hors service");
      q.disabled = go.disabled = true;
      aide.textContent = "L'assistant n'est pas configuré sur le serveur de " +
        "l'atelier. Le livret ci-dessus reste lisible ; pour le reste, demande " +
        "à un responsable.";
      return;
    }
    etat.innerHTML = U.etiquette("prêt", "succes");
    q.disabled = go.disabled = occupe;
  }

  function peindreFil() {
    const z = $("#a-fil");
    if (!z) return;
    z.innerHTML = fil.length
      ? fil.map(m =>
          '<div class="bulle bulle--' + (m.moi ? "moi" : "lui") +
            (m.err ? " bulle--err" : "") + '">' +
            (m.moi ? "" : '<span class="bulle__qui">Formateur</span>') +
            "<div>" + enParagraphes(m.texte) + "</div></div>").join("")
      : '<p class="champ__aide" style="margin:0">Pose ta question : les ' +
        "prestations, les grades, les règles de service, ce qui est écrit " +
        "dans le livret.</p>";
    z.scrollTop = z.scrollHeight;
  }

  async function demander() {
    if (occupe || !assistantDispo) return;
    const champ = $("#a-q");
    const q = champ.value.trim();
    if (q.length < 3) return U.toast("Écris ta question", "err");

    fil.push({ moi: true, texte: q });
    champ.value = "";
    occupe = true;
    majAssistant();
    peindreFil();

    let url = "";
    try { url = MNStore.api("assistant"); } catch (_) { url = ""; }

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, contexte: contexte() })
      });
      const j = await r.json().catch(() => ({}));
      if (j && j.ok) fil.push({ moi: false, texte: j.reponse });
      else fil.push({ moi: false, err: true, texte: j.error || "Réponse impossible." });
    } catch (_) {
      fil.push({ moi: false, err: true, texte: "Le serveur de l'atelier est injoignable." });
    }

    occupe = false;
    majAssistant();
    peindreFil();
    champ.focus();
  }
})();
