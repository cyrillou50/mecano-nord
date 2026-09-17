/* ==========================================================================
   Mise en ligne — le serveur de l'atelier s'en charge, personne d'autre.

   On modifie, c'est en ligne. Il n'y a rien à cliquer et rien à installer :
   toute écriture du brouillon programme son propre envoi (voir « Envoi
   automatique » plus bas).

   ⚠ LE SITE NE DÉTIENT AUCUNE CLÉ, et ne doit jamais en détenir.

   Le jeton GitHub vit dans le service systemd du VPS (`GH_TOKEN`), là où
   personne ne le lit. Le site poste au serveur, le serveur écrit sur GitHub.
   C'est ce qui permet à n'importe qui de mettre le site à jour sans qu'on lui
   confie quoi que ce soit — et un jeton qu'on ne distribue pas est un jeton
   qu'on n'a pas à révoquer.

   Le site en gardait un dans le navigateur de chaque personne qui publiait.
   Il n'en garde plus : `oublierVieuxJeton()` efface ceux qui traînent.
   ========================================================================== */

window.MNGitHub = (function () {
  "use strict";

  const K_LAST = "mn.gh.last";

  /* Un jeton d'avant, laissé dans ce navigateur. Il ne sert plus à rien — on
     ne le garde pas « au cas où » : une clé oubliée quelque part est une clé
     qui fuit un jour. */
  (function oublierVieuxJeton() {
    try { localStorage.removeItem("mn.gh.token"); } catch (_) { /* rien */ }
  })();

  /* ---- Le serveur, seule voie ------------------------------------------------
     Il détient le jeton, il écrit sur GitHub. Sans lui, rien ne part — et on
     le dit franchement plutôt que de réclamer une clé à quelqu'un. */

  const serveurUrl = () => {
    try { return MNStore.api("publier"); } catch (_) { return ""; }
  };

  /** Le serveur garde-t-il le catalogue lui-même ? */
  const catalogueUrl = () => {
    try { return MNStore.api("catalogue"); } catch (_) { return ""; }
  };

  /** Y a-t-il une voie de sortie ? Il n'y en a plus qu'une. */
  const canPublish = () => !!serveurUrl();

  /** Le message qu'on donne quand il n'y a pas de serveur pour écrire. */
  const sansServeur = () => err("no-serveur",
    "Aucun serveur n'est configuré : c'est lui qui met le site en ligne. " +
    "Renseigne son adresse dans Administration → Le site.");

  /** Envoie un fichier au serveur, qui l'écrira sur GitHub. */
  async function viaServeur(chemin, contenu, message, base64) {
    const url = serveurUrl();
    const corps = { path: chemin, message };
    if (base64) corps.base64 = contenu; else corps.content = contenu;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
        signal: ctrl.signal
      });
    } catch (e) {
      throw err("serveur", e.name === "AbortError"
        ? "Le serveur ne répond pas." : "Serveur injoignable.");
    } finally {
      clearTimeout(t);
    }

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err("serveur", j.error || ("Serveur : erreur " + r.status));
    return { commit: { sha: j.commit || "" }, html_url: "" };
  }
  /* ---- Dépôt ------------------------------------------------------------ */

  /** Devine owner/repo à partir de l'URL (…github.io/mon-repo/…). */
  function detect() {
    const out = { owner: "", repo: "", branch: "main", path: "data/catalog.json" };
    const m = location.hostname.match(/^([\w.-]+?)\.github\.io$/i);
    if (!m) return out;
    out.owner = m[1];
    const seg = location.pathname.split("/").filter(Boolean);
    out.repo = (seg.length && seg[0].indexOf(".") === -1) ? seg[0] : m[1] + ".github.io";
    return out;
  }

  /** Réglages effectifs : ceux du catalogue, complétés par la détection. */
  function repoConfig() {
    let s = {};
    try { s = MNStore.settings().github || {}; } catch (_) { /* pas encore chargé */ }
    const d = detect();
    return {
      owner: s.owner || d.owner,
      repo: s.repo || d.repo,
      branch: s.branch || d.branch || "main",
      path: s.path || d.path || "data/catalog.json"
    };
  }

  const isConfigured = () => { const c = repoConfig(); return !!(c.owner && c.repo); };

  /* ---- Bas niveau -------------------------------------------------------- */

  function err(code, message) { const e = new Error(message); e.code = code; return e; }

  /* ---- Publication -------------------------------------------------------- */

  /** Écrit un fichier texte du dépôt, par le serveur. */
  const putText = (path, text, message) => {
    if (!serveurUrl()) throw sansServeur();
    return viaServeur(path, text, message, false);
  };

  /* ---- Écriture groupée ---------------------------------------------------------
     Un fichier par commit ferait reconstruire le site autant de fois. Déposer
     une image en déclenchait deux (l'image, puis le manifeste), qui se
     mettaient en file d'attente et retardaient la mise en ligne.

     Le serveur sait bâtir un commit complet à partir d'une liste de fichiers :
     un seul build. */

  /**
   * Écrit plusieurs fichiers en un seul commit, par le serveur.
   * @param {Array<{path:string, content:string, base64?:boolean, remove?:boolean}>} files
   * @returns {Promise<{ok:boolean, commit:string|null, groupe:boolean}>}
   */
  async function putFiles(files, message) {
    const utiles = (files || []).filter(f => f && f.path);
    if (!utiles.length) return { ok: true, commit: null, groupe: false };
    if (!serveurUrl()) throw sansServeur();

    const r = await fetch(serveurUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        files: utiles.map(f => (
          f.remove ? { path: f.path, remove: true }
            : f.base64 ? { path: f.path, base64: f.content }
              : { path: f.path, content: f.content }))
      })
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: true, commit: d.commit || null, groupe: true };
    }

    /* Un serveur d'avant lit `path`, ne le trouve pas, et répond 403. Il ne
       sait donc pas écrire un groupe : on écrit un par un, ce qui coûte un
       commit chacun mais aboutit. Sauf pour une suppression, que seule la
       forme groupée sait faire — là il faut vraiment mettre le serveur à jour. */
    for (const f of utiles) {
      if (f.remove) {
        throw err("serveur-ancien",
          "Ton serveur ne sait pas encore supprimer un fichier du dépôt. " +
          "Recopie serveur/serveur.js sur le VPS, puis redémarre-le.");
      }
      if (f.base64) await uploadRaw(f.path, f.content, message);
      else await putText(f.path, f.content, message);
    }
    return { ok: true, commit: null, groupe: false };
  }

  /**
   * Renomme un fichier du dépôt.
   *
   * Le site ne peut plus lire le dépôt — il n'a pas de clé, et c'est voulu.
   * Les images de l'atelier vivent de toute façon sur le serveur, qui sait
   * les renommer lui-même ; ce chemin-ci ne servait qu'aux installations sans
   * serveur, qui ne peuvent plus rien écrire non plus.
   */
  function renameFile(from, to) {
    if (from === to) return Promise.resolve({ ok: true, unchanged: true });
    return Promise.reject(err("no-serveur",
      "Renommer un fichier du dépôt demande un serveur. Les images hébergées " +
      "par le serveur, elles, se renomment normalement."));
  }

  /** Écrit un fichier binaire déjà encodé en base64. */
  const uploadRaw = (path, base64, message) => {
    if (!serveurUrl()) throw sansServeur();
    return viaServeur(path, base64, message, true);
  };

  /** `data:image/...;base64,...` → la partie utile. */
  function imageBrute(dataUri) {
    const i = String(dataUri).indexOf(",");
    if (i === -1) throw err("bad-data", "Image invalide.");
    return String(dataUri).slice(i + 1);
  }

  /** Dépose une image (donnée `data:image/...;base64,...`) dans le dépôt. */
  function uploadImage(path, dataUri, message) {
    return uploadRaw(path, imageBrute(dataUri), message || ("Ajout de l'image " + path));
  }

  /**
   * Envoie le catalogue sur GitHub.
   * @param {string} json  contenu complet du fichier
   * @param {string} message  message de commit
   */
  /**
   * Dépose le catalogue sur le serveur de l'atelier.
   * Renvoie faux si ce serveur ne connaît pas encore la route — auquel cas
   * l'appelant reprend le chemin GitHub plutôt que d'échouer.
   */
  /* null = pas encore demandé, false = ce serveur est d'une version qui ne
     connaît pas la route. Une fois la réponse connue, inutile de reposer la
     question à chaque envoi. */
  let _prendCatalogue = null;

  /* L'adresse déjà déposée dans le dépôt pendant cette session. `MNStore.depot()`
     garde la copie du dépôt telle qu'elle a été lue au démarrage, et ne bouge
     plus : sans ce repère, on réécrirait l'amorçage à chaque envoi — un commit
     à chaque fois, là où l'on cherche précisément à n'en faire aucun. */
  let _adresseDeposee = null;
  const serveurPrendCatalogue = () => _prendCatalogue;

  async function versServeurCatalogue(json) {
    const base = catalogueUrl();
    if (!base) return false;
    const r = await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: json
    });
    if (r.status === 404 || r.status === 405) {
      _prendCatalogue = false;                                // serveur trop ancien
      return false;
    }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw err("server", d.error || "Le serveur a répondu " + r.status);
    }
    _prendCatalogue = true;
    return true;
  }

  /**
   * @param {string} json     le catalogue complet
   * @param {string} [message] message de commit, si commit il y a
   */
  async function publish(json, message) {
    const c = repoConfig();
    const msg = message || "Mise à jour du catalogue depuis le panneau admin";

    /* Le serveur garde désormais le catalogue lui-même : l'écriture y est
       immédiate, sans commit ni reconstruction. La copie du dépôt reste en
       secours et sert d'amorçage — c'est elle qui donne cette adresse. */
    if (await versServeurCatalogue(json)) {
      /* Le dépôt garde une copie d'amorçage : c'est elle qui indiquera au
         prochain démarrage où joindre ce serveur. Tant que l'adresse ne
         change pas, inutile de la réécrire — mais si elle change, ne pas le
         faire couperait le site de son serveur au rechargement suivant. */
      let secours = null;
      try {
        const depot = MNStore.depot();
        const avant = depot && depot.settings && depot.settings.serveur;
        const apres = MNStore.settings().serveur;
        if (depot && avant !== apres && _adresseDeposee !== apres) {
          await viaServeur(c.path, json, "Adresse du serveur mise à jour", false);
          _adresseDeposee = apres;
          secours = "adresse";
        }
      } catch (e) {
        /* Le catalogue est en ligne : on ne fait pas échouer la publication
           pour une copie de secours, on le signale. */
        secours = "echec:" + (e && e.message || e);
      }

      const info = { at: Date.now(), commit: null, url: null, by: null,
                     serveur: true, secours };
      localStorage.setItem(K_LAST, JSON.stringify(info));
      return info;
    }

    /* Sinon le dépôt, par le serveur — le seul à détenir la clé. Sans lui il
       n'y a pas d'autre voie, et le dire vaut mieux que réclamer un jeton. */
    if (!serveurUrl()) throw sansServeur();
    const res = await viaServeur(c.path, json, msg, false);

    const info = {
      at: Date.now(),
      commit: res.commit && res.commit.sha ? res.commit.sha.slice(0, 7) : null,
      url: res.commit && res.commit.html_url,
      by: res.commit && res.commit.author && res.commit.author.name
    };
    localStorage.setItem(K_LAST, JSON.stringify(info));
    return info;
  }

  function lastPublish() {
    try { return JSON.parse(localStorage.getItem(K_LAST) || "null"); } catch (_) { return null; }
  }

  /* ---- Envoi automatique -------------------------------------------------------
     Un bouton « Publier » demande à quelqu'un de s'en souvenir. C'est la seule
     chose que le site ne fasse pas tout seul, et donc la seule qui s'oublie :
     une fiche corrigée, une voiture ajoutée, et l'équipe lit l'ancienne
     version pendant deux jours sans savoir pourquoi.

     Alors on l'enlève. Toute écriture du brouillon programme son propre envoi,
     depuis n'importe quelle page, sans rien à cliquer, et pour tout le monde :
     qui a pu changer quelque chose a le droit de le voir en ligne. Le bouton
     ne réapparaît que là où l'automatique ne peut rien — aucun serveur, ou un
     envoi qui a échoué.

     Et surtout : l'automatique passe par le serveur. GitHub héberge les
     pages, le serveur détient les données — ce qui change tous les jours n'a
     rien à faire dans l'historique d'un dépôt. Une écriture au serveur est
     immédiate et ne coûte rien ; un commit fait reconstruire le site entier
     pour un numéro de téléphone corrigé.

     Trois cas, donc :
       • le serveur détient le catalogue — la voie normale, deux secondes de
         regroupement et aucun commit ;
       • un serveur configuré qui ne prend pas le catalogue (version trop
         ancienne) — il sait encore committer, alors on passe par le dépôt en
         groupant largement, et le bandeau dit ce qu'il y a à réparer ;
       • aucun serveur — rien ne part. C'est lui qui détient la clé ; sans lui
         le site n'a aucun moyen d'écrire, et réclamer un jeton à quelqu'un
         serait revenir en arrière. Le bandeau le dit. */

  const K_STAMP = "mn.gh.stamp";
  const DELAI_SERVEUR = 2000;
  /* Une minute paraît long ; elle ne l'est pas au regard de la reconstruction
     de GitHub Pages, qui prend autant. Ce qu'on y gagne, c'est un commit au
     lieu de dix pour une séance de corrections. */
  const DELAI_DEPOT = 60000;
  /* Un réseau qui cligne ne doit pas réclamer un clic ; un dépôt mal réglé,
     si. Un seul rattrapage, puis on rend la main. */
  const RATTRAPAGE = 30000;

  let minuterie = null;
  let enCours = false;
  let echec = null;
  let rattrape = false;

  const veilleurs = [];

  /** Prévient les bandeaux : ils affichent un état, pas un instant. */
  const onAuto = fn => veilleurs.push(fn);

  function prevenir() {
    const e = etatAuto();
    veilleurs.forEach(fn => { try { fn(e); } catch (err) { console.error(err); } });
  }

  /** Le brouillon en attente est-il déjà parti ? */
  function dejaEnvoye() {
    try {
      return MNStore.hasDraft() &&
        localStorage.getItem(K_STAMP) === MNStore.catalog().updatedAt;
    } catch (_) { return false; }
  }

  /**
   * Quelqu'un est là, et il y a une voie de sortie.
   *
   * Plus de permission « publier » : elle gardait la clé, or il n'y a plus de
   * clé à garder. Ce qui protège les données, ce sont les droits d'écrire —
   * on ne modifie un objet que si l'on a « items », une fiche que si l'on a
   * « users ». Exiger en plus le droit de publier revenait à laisser des gens
   * enregistrer des modifications que personne ne mettait jamais en ligne :
   * le site montrait l'ancienne version pendant des jours, sans que quiconque
   * sache pourquoi.
   *
   * Autrement dit : si tu as pu le changer, c'est en ligne.
   */
  function autoPossible() {
    try { return !!(MNAuth.session() && canPublish()); }
    catch (_) { return false; }
  }

  /**
   * Par où l'envoi automatique doit passer.
   * @returns {"serveur"|"depot"|""}  "" = ne pas partir tout seul.
   */
  function voieAuto() {
    if (!autoPossible()) return "";
    /* Un serveur qui publie mais ne garde pas le catalogue : il commite pour
       nous, groupé. C'est le seul cas où le dépôt reste la voie. */
    if (!catalogueUrl()) return "depot";
    return _prendCatalogue === false ? "depot" : "serveur";
  }

  const autoActif = () => !!voieAuto();

  /** De quoi écrire un bandeau sans avoir à deviner. */
  function etatAuto() {
    let attente = false;
    try { attente = MNStore.hasDraft(); } catch (_) { /* magasin pas encore prêt */ }
    const voie = voieAuto();
    return {
      voie,
      actif: !!voie,
      immediat: voie === "serveur",
      /* Le serveur répond mais ne garde pas encore le catalogue : ça part
         quand même, par le dépôt, et on le signale — c'est une chose à
         réparer une fois, pas une raison de bloquer les mises en ligne. */
      serveurAncien: autoPossible() && !!catalogueUrl() && _prendCatalogue === false,
      attente,
      programme: !!minuterie,
      enCours,
      envoye: dejaEnvoye(),
      echec
    };
  }

  /** Replanifie l'envoi : chaque nouvelle modification repousse le départ. */
  function programmer() {
    clearTimeout(minuterie);
    minuterie = null;
    const voie = voieAuto();
    if (voie && !dejaEnvoye()) {
      let attente = false;
      try { attente = MNStore.hasDraft(); } catch (_) { /* rien à envoyer */ }
      if (attente) {
        minuterie = setTimeout(partir, voie === "serveur" ? DELAI_SERVEUR : DELAI_DEPOT);
      }
    }
    prevenir();
  }

  /**
   * Envoie le brouillon tout de suite.
   * @returns {Promise<object|null>} le résultat, ou null s'il n'y avait rien à
   *          envoyer ou si l'envoi a échoué — l'erreur est alors dans
   *          `etatAuto().echec`, pour que le bandeau la montre sans qu'un
   *          minuteur ait à attraper une exception que personne n'écoute.
   */
  async function partir() {
    clearTimeout(minuterie);
    minuterie = null;
    if (enCours || !autoPossible() || !MNStore.hasDraft()) { prevenir(); return null; }

    const cat = MNStore.catalog();
    const marque = cat.updatedAt;
    let qui = "le site";
    try { qui = (MNAuth.session() || {}).pseudo || qui; } catch (_) { /* invité */ }

    enCours = true;
    echec = null;
    prevenir();

    try {
      const info = await publish(MNStore.toJSON(cat), "Catalogue mis à jour par " + qui);
      localStorage.setItem(K_STAMP, marque);
      rattrape = false;
      return info;
    } catch (e) {
      echec = { message: String((e && e.message) || e), at: Date.now() };
      /* Une panne passagère se rattrape toute seule ; deux de suite veulent
         dire qu'il y a quelque chose à régler, et là il faut quelqu'un. */
      if (!rattrape) {
        rattrape = true;
        minuterie = setTimeout(partir, RATTRAPAGE);
      }
      return null;
    } finally {
      enCours = false;
      prevenir();
      /* Le brouillon a encore bougé pendant l'envoi ? On repart pour un tour. */
      if (!echec && !dejaEnvoye()) programmer();
    }
  }

  /**
   * L'état de l'envoi, dit en français, pour les bandeaux.
   * Renvoie null quand l'automatique ne peut rien faire : à la page, alors, de
   * dire ce qu'elle disait avant — elle seule sait de quoi elle parle.
   * @returns {{ton:string, titre:string, detail:string, bouton:string}|null}
   */
  function motAuto() {
    const e = etatAuto();
    if (!e.attente) return null;

    if (e.enCours) {
      return { ton: "ok", titre: "Mise en ligne…", detail: "", bouton: "" };
    }
    if (e.echec) {
      return { ton: "err", titre: "La mise en ligne a échoué.",
               detail: e.echec.message + " Rien n'est perdu : tes modifications " +
                 "sont gardées, il suffit de réessayer.",
               bouton: "reessayer" };
    }
    if (e.envoye) {
      return e.immediat
        ? { ton: "ok", titre: "En ligne.", detail: "", bouton: "" }
        : { ton: "ok", titre: "Envoyé.",
            detail: "GitHub met le site à jour, compte une minute environ.",
            bouton: "verifier" };
    }
    if (e.actif) {
      return { ton: "ok", titre: "Enregistré.",
               detail: e.immediat
                 ? "La mise en ligne part toute seule dans quelques secondes."
                 : "Ton serveur ne garde pas encore le catalogue : ça passe par " +
                   "un commit, groupé, d'ici une minute. Recopie " +
                   "serveur/serveur.js sur le VPS pour que ce soit immédiat.",
               bouton: "" };
    }
    /* Sans serveur, rien ne peut partir : c'est lui qui détient la clé. Le
       dire ici évite de chercher un bouton qui n'existe plus. */
    return { ton: "warn", titre: "Enregistré, mais pas encore en ligne.",
             detail: "Aucun serveur n'est configuré : c'est lui qui met le site " +
               "à jour. Renseigne son adresse dans Administration → Le site.",
             bouton: "" };
  }

  /* Toute écriture du catalogue passe par là, d'où qu'elle vienne : c'est le
     seul endroit où s'abonner pour n'en manquer aucune. */
  try { MNStore.onChange(programmer); } catch (_) { /* magasin absent */ }

  return {
    detect, repoConfig, isConfigured,
    publish, lastPublish,
    putText, putFiles, uploadImage, imageBrute, renameFile,
    serveurUrl, catalogueUrl, canPublish,
    autoActif, voieAuto, serveurPrendCatalogue, etatAuto, motAuto, onAuto,
    reveiller: programmer, publierMaintenant: () => partir()
  };
})();
