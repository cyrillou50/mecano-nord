/* ==========================================================================
   Livret de l'atelier.

   Ce qu'un nouveau doit savoir, écrit par l'équipe dans l'administration. Il
   se lit tel quel — c'est l'essentiel, et ça marche sans rien d'autre.

   S'y ajoute un assistant, quand le serveur en a un : l'apprenti pose sa
   question en français et reçoit une réponse tirée du livret et des données du
   site. La clé Gemini vit sur le VPS, jamais ici : le catalogue est public.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;

  let me = null;
  let assistantDispo = null;   // null = pas encore su
  let occupe = false;

  /* Les échanges restent à l'écran le temps de la visite. Les garder d'une
     fois sur l'autre supposerait de les stocker : une question posée à
     l'atelier n'a pas à traîner dans le navigateur. */
  const fil = [];

  MNUI.start({ page: "livret", title: "Livret", onReady: init });

  async function init(session) {
    me = session;
    render();
    sonder();
  }

  /* ---- L'assistant est-il là ? -------------------------------------------------
     Une seule question au serveur, au chargement. Sans serveur, sans clé, ou
     avec un serveur trop ancien, le livret se lit quand même : c'est lui qui
     compte, l'assistant n'est qu'un confort. */

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
     Le livret, et de quoi répondre aux questions de tous les jours : les prix,
     les grades, les règles de service. Rien de personnel — ni codes, ni
     avertissements, ni notes internes : un apprenti n'a pas à les lire, et
     l'assistant n'a pas à les connaître. */

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

    /* Les grades tels qu'ils existent ici, avec ce qu'ils permettent. */
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

    /* Ce que coûte chaque prestation, en ressources : c'est la question la
       plus posée à l'atelier, et celle où une réponse inventée coûte cher. */
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

    const livret = MNStore.livretDe(MNAuth.atelier()).trim();
    l.push("");
    l.push("LIVRET DE L'ATELIER :");
    l.push(livret || "(aucun livret n'a encore été écrit)");

    return l.join("\n").slice(0, 24000);
  }

  /* ---- Rendu ------------------------------------------------------------------ */

  function render() {
    const livret = MNStore.livretDe(MNAuth.atelier()).trim();
    const peutEcrire = MNAuth.canAny("admin", "items");

    $("#livret-root").innerHTML =
      '<h1 class="page-title">Livret</h1>' +
      '<p class="page-sub">Ce qu\'il faut savoir en arrivant à l\'atelier</p>' +

      '<div class="panel" style="margin-bottom:18px">' +
        '<div class="panel__head"><h2>Le livret</h2>' +
          '<span class="spacer"></span>' +
          (peutEcrire
            ? '<a class="btn btn--ghost btn--sm" href="admin.html">' + svg("edit") +
              "<span>Le modifier</span></a>"
            : "") +
        "</div>" +
        '<div class="panel__body">' +
          (livret
            ? '<div class="livret">' + enParagraphes(livret) + "</div>"
            : '<p class="hint">Le livret n\'a pas encore été écrit. ' +
              (peutEcrire
                ? "Tu peux t'en charger dans l'administration, onglet « Livret »."
                : "Un responsable doit s'en charger.") + "</p>") +
        "</div></div>" +

      '<div class="panel"><div class="panel__head"><h2>Une question ?</h2>' +
        '<span class="spacer"></span><span id="a-etat"></span></div>' +
        '<div class="panel__body">' +
          '<div id="a-fil" class="fil"></div>' +
          '<div class="row" style="margin-top:12px">' +
            '<input class="input" id="a-q" maxlength="600" ' +
              'placeholder="Ex. Combien coûte une vidange ?" autocomplete="off">' +
            '<button class="btn btn--primary" id="a-go">' + svg("check") +
              "<span>Demander</span></button>" +
          "</div>" +
          '<p class="hint" id="a-aide">L\'assistant relit le livret et les données ' +
            "du site pour te répondre. Il ne connaît que ça : s'il ne sait pas, " +
            "il te dira d'aller voir un responsable.</p>" +
        "</div></div>";

    peindreFil();
    majAssistant();

    $("#a-go").addEventListener("click", demander);
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
    { nom: "Facturation", href: "index.html" },
    { nom: "Devis", href: "index.html" },
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
      "index.html": MNAuth.canAny("bt", "admin"),
      "service.html": MNAuth.canAny("duty", "duty_view", "duty_manage", "admin"),
      "equipe.html": MNAuth.canAny("staff", "promote", "users", "admin"),
      "contrats.html": MNAuth.canAny("contracts_view", "contracts", "contracts_delete", "admin"),
      "calendrier.html": true,
      "vehicules.html": true,
      "emotes.html": true,
      "blacklist.html": true,
      "livret.html": true,
      "admin.html": MNAuth.canAny("items", "users", "publish", "theme", "contracts", "admin")
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
    return esc(t).split(/\n{2,}/).map(bloc => {
      const lignes = bloc.split("\n");
      /* Une suite de lignes commençant par - ou • devient une liste. */
      if (lignes.every(x => /^\s*[-•*]\s+/.test(x))) {
        return "<ul>" + lignes.map(x =>
          "<li>" + lier(x.replace(/^\s*[-•*]\s+/, "")) + "</li>").join("") + "</ul>";
      }
      return "<p>" + lier(lignes.join("<br>")) + "</p>";
    }).join("");
  }

  function majAssistant() {
    const etat = $("#a-etat"), q = $("#a-q"), go = $("#a-go"), aide = $("#a-aide");
    if (!etat) return;

    if (assistantDispo === null) {
      etat.innerHTML = '<span class="pill pill--dim">recherche…</span>';
      q.disabled = go.disabled = true;
      return;
    }
    if (!assistantDispo) {
      etat.innerHTML = '<span class="pill pill--dim">hors service</span>';
      q.disabled = go.disabled = true;
      aide.textContent = "L'assistant n'est pas configuré sur le serveur de " +
        "l'atelier. Le livret ci-dessus reste lisible ; pour le reste, demande " +
        "à un responsable.";
      return;
    }
    etat.innerHTML = '<span class="pill pill--ok">prêt</span>';
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
      : '<p class="hint" style="margin:0">Pose ta question : les prestations, ' +
        "les grades, les règles de service, ce qui est écrit dans le livret.</p>";
    z.scrollTop = z.scrollHeight;
  }

  async function demander() {
    if (occupe || !assistantDispo) return;
    const champ = $("#a-q");
    const q = champ.value.trim();
    if (q.length < 3) return MNUI.toast("Écris ta question", "err");

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
