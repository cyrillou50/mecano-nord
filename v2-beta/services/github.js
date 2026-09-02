/* ==========================================================================
   Publication en ligne — écrit data/catalog.json directement dans le dépôt
   GitHub via l'API, depuis le navigateur.

   Résultat : on modifie, et c'est en ligne. Rien à cliquer, rien à toucher —
   l'envoi se programme tout seul à chaque écriture du brouillon (voir « Envoi
   automatique » plus bas).

   Le jeton GitHub reste dans le navigateur de la personne qui publie
   (localStorage) — il n'est jamais écrit dans le dépôt.
   ========================================================================== */

window.MNGitHub = (function () {
  "use strict";

  const API = "https://api.github.com";
  const K_TOKEN = "mn.gh.token";
  const K_LAST = "mn.gh.last";

  /* ---- Jeton ------------------------------------------------------------ */

  const getToken = () => localStorage.getItem(K_TOKEN) || "";
  const hasToken = () => !!getToken();

  /* ---- Publication par le serveur ---------------------------------------------
     Quand un serveur est configuré, c'est LUI qui détient le jeton GitHub :
     n'importe quel responsable peut publier depuis le site, sans rien
     installer. Le jeton personnel devient un simple secours. */

  const serveurUrl = () => {
    try { return MNStore.api("publier"); } catch (_) { return ""; }
  };

  /** Le serveur garde-t-il le catalogue lui-même ? */
  const catalogueUrl = () => {
    try { return MNStore.api("catalogue"); } catch (_) { return ""; }
  };

  /** Peut-on publier, d'une façon ou d'une autre ? */
  const canPublish = () => !!serveurUrl() || (hasToken() && isConfigured());

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
  function setToken(t) {
    const v = String(t || "").trim();
    if (v) localStorage.setItem(K_TOKEN, v); else localStorage.removeItem(K_TOKEN);
  }
  const forgetToken = () => localStorage.removeItem(K_TOKEN);

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

  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  async function api(path, opts) {
    const token = getToken();
    if (!token) throw err("no-token", "Aucun jeton GitHub enregistré.");
    const r = await fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }, (opts && opts.headers) || {})
    }));
    let body = null;
    try { body = await r.json(); } catch (_) { /* 204 */ }
    if (!r.ok) throw httpError(r.status, body);
    return body;
  }

  function err(code, message) { const e = new Error(message); e.code = code; return e; }

  function httpError(status, body) {
    const msg = (body && body.message) || "";
    if (status === 401) return err("bad-token", "Jeton refusé par GitHub (expiré ou incorrect).");
    if (status === 403) return err("forbidden", "Accès refusé : le jeton n'a pas le droit « Contents : Read and write » sur ce dépôt.");
    if (status === 404) return err("not-found", "Dépôt, branche ou fichier introuvable — vérifie propriétaire / dépôt / branche.");
    if (status === 409) return err("conflict", "Le fichier a changé entre-temps.");
    if (status === 422) return err("unprocessable", "GitHub a refusé l'écriture : " + msg);
    return err("http-" + status, "Erreur GitHub " + status + (msg ? " — " + msg : ""));
  }

  /* ---- Vérification ------------------------------------------------------ */

  /** Teste le jeton et les droits d'écriture. */
  async function check() {
    const c = repoConfig();
    if (!c.owner || !c.repo) throw err("no-repo", "Renseigne le propriétaire et le nom du dépôt.");

    const me = await api("/user").catch(e => {
      if (e.code === "bad-token") throw e;
      return null;                       // jeton fine-grained sans scope "user"
    });

    const repo = await api(`/repos/${c.owner}/${c.repo}`);
    const canWrite = !!(repo.permissions && (repo.permissions.push || repo.permissions.admin));

    let exists = true;
    try { exists = !!(await currentSha(c.path)); }
    catch (e) { if (e.code === "not-found") exists = false; else throw e; }

    return {
      ok: true,
      login: me && me.login,
      repo: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      canWrite,
      fileExists: exists,
      pagesUrl: `https://${c.owner.toLowerCase()}.github.io/` +
        (c.repo.toLowerCase() === (c.owner + ".github.io").toLowerCase() ? "" : c.repo + "/")
    };
  }

  /* ---- Publication -------------------------------------------------------- */

  async function currentSha(path) {
    const c = repoConfig();
    try {
      const f = await api(`/repos/${c.owner}/${c.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(c.branch)}`);
      return f.sha || null;
    } catch (e) {
      if (e.code === "not-found") return null;   // premier envoi
      throw e;
    }
  }

  /** Écrit (ou remplace) un fichier du dépôt. `content` est déjà en base64. */
  async function putFile(path, content, message) {
    const c = repoConfig();
    if (!c.owner || !c.repo) throw err("no-repo", "Dépôt GitHub non configuré.");

    const body = { message: message || ("Mise à jour de " + path), content, branch: c.branch };
    let sha = await currentSha(path);
    if (sha) body.sha = sha;

    const put = () => api(`/repos/${c.owner}/${c.repo}/contents/${encodeURI(path)}`, {
      method: "PUT",
      body: JSON.stringify(body)
    });

    try {
      return await put();
    } catch (e) {
      if (e.code !== "conflict") throw e;
      sha = await currentSha(path);          // quelqu'un a écrit entre-temps
      if (sha) body.sha = sha; else delete body.sha;
      return put();
    }
  }

  /** Écrit un fichier texte du dépôt. */
  const putText = (path, text, message) =>
    serveurUrl() ? viaServeur(path, text, message, false) : putFile(path, b64(text), message);

  /* ---- Écriture groupée ---------------------------------------------------------
     L'API Contents n'écrit qu'un fichier par appel, donc un commit par
     fichier — et GitHub Pages reconstruit le site à chaque commit. Déposer une
     image en déclenchait deux (l'image, puis le manifeste), qui se mettaient
     en file d'attente et retardaient la mise en ligne.

     L'API Git, elle, permet de bâtir un commit complet : on crée les blobs,
     un arbre, un commit, puis on avance la branche. Un seul build. */

  /**
   * Écrit plusieurs fichiers en un seul commit.
   * @param {Array<{path:string, content:string, base64?:boolean}>} files
   * @returns {Promise<{ok:boolean, commit:string|null, groupe:boolean}>}
   */
  async function putFilesDirect(files, message) {
    const c = repoConfig();
    if (!c.owner || !c.repo) throw err("no-repo", "Dépôt GitHub non configuré.");
    const base = `/repos/${c.owner}/${c.repo}`;
    const br = encodeURIComponent(c.branch);

    const ref = await api(`${base}/git/ref/heads/${br}`);
    const parent = ref.object.sha;
    const commitParent = await api(`${base}/git/commits/${parent}`);

    /* Un blob par fichier : c'est le seul point qui reste proportionnel au
       nombre de fichiers, mais ça ne crée aucun commit. */
    const arbre = [];
    for (const f of files) {
      /* `sha: null` dans un arbre = le fichier disparaît du commit. C'est ce
         qui permet de supprimer et d'écrire d'un même geste. */
      if (f.remove) {
        arbre.push({ path: f.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blob = await api(`${base}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: f.base64 ? f.content : b64(f.content),
          encoding: "base64"
        })
      });
      arbre.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const tree = await api(`${base}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: commitParent.tree.sha, tree: arbre })
    });
    const commit = await api(`${base}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [parent] })
    });
    await api(`${base}/git/refs/heads/${br}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha })
    });

    return { ok: true, commit: commit.sha.slice(0, 7), groupe: true };
  }

  /**
   * Écrit plusieurs fichiers, en un commit si possible.
   *
   * Retombe sur des écritures séparées quand le groupage n'aboutit pas — un
   * serveur d'une version antérieure, par exemple. Le résultat est le même,
   * seulement en plusieurs commits.
   */
  async function putFiles(files, message) {
    const utiles = (files || []).filter(f => f && f.path);
    if (!utiles.length) return { ok: true, commit: null, groupe: false };

    try {
      if (serveurUrl()) {
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
        /* Un refus, quel qu'il soit, veut dire que ce serveur ne comprend pas
           la forme groupée — un serveur antérieur lit `path`, ne le trouve pas
           et répond 403. On ne jette donc pas ici : les écritures une à une
           qui suivent feront remonter la vraie erreur s'il y en a une. */
      } else if (hasToken()) {
        return await putFilesDirect(utiles, message);
      }
    } catch (e) {
      /* Un jeton refusé ou un dépôt absent ne se règlent pas en réessayant. */
      if (e.code === "auth" || e.code === "no-repo") throw e;
      /* Groupage impossible : on continue en séparé plutôt que d'échouer. */
    }

    for (const f of utiles) {
      if (f.remove) {
        /* Seule la forme groupée sait supprimer via le serveur. Sans elle et
           sans jeton, l'opération est impossible : autant le dire. */
        if (!hasToken() && serveurUrl()) {
          throw err("server", "Ton serveur est trop ancien pour supprimer un fichier. " +
            "Recopie serveur.js sur le VPS, puis redémarre-le.");
        }
        await deleteFile(f.path, message);
      } else if (f.base64) {
        await uploadRaw(f.path, f.content, message);
      } else {
        await putText(f.path, f.content, message);
      }
    }
    return { ok: true, commit: null, groupe: false };
  }

  /** Liste le contenu d'un dossier du dépôt. */
  async function listDir(dir) {
    const c = repoConfig();
    const path = String(dir).replace(/^\/+|\/+$/g, "");
    const r = await api(`/repos/${c.owner}/${c.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(c.branch)}`);
    return Array.isArray(r) ? r : [];
  }

  /** Lit un fichier du dépôt. Renvoie { content (base64), sha }. */
  async function getFile(path) {
    const c = repoConfig();
    const f = await api(`/repos/${c.owner}/${c.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(c.branch)}`);
    return { content: (f.content || "").replace(/\s/g, ""), sha: f.sha };
  }

  /** Supprime un fichier du dépôt. */
  async function deleteFile(path, message) {
    const c = repoConfig();
    const sha = await currentSha(path);
    if (!sha) throw err("not-found", "Fichier introuvable : " + path);
    return api(`/repos/${c.owner}/${c.repo}/contents/${encodeURI(path)}`, {
      method: "DELETE",
      body: JSON.stringify({
        message: message || ("Suppression de " + path),
        sha,
        branch: c.branch
      })
    });
  }

  /**
   * Renomme un fichier. Copie et suppression voyagent ensemble : en deux
   * commits, le site se reconstruisait une fois avec les deux copies, une
   * fois sans l'ancienne.
   * @param {Array} extra  fichiers à joindre au même commit
   */
  async function renameFile(from, to, message, extra) {
    if (from === to) return { ok: true, unchanged: true };
    if (await currentSha(to)) throw err("exists", "Un fichier porte déjà ce nom : " + to);
    const f = await getFile(from);
    return putFiles(
      [{ path: to, content: f.content, base64: true }, { path: from, remove: true }]
        .concat(extra || []),
      message || ("Renommage : " + from + " → " + to)
    );
  }

  /** Écrit un fichier binaire déjà encodé en base64. */
  const uploadRaw = (path, base64, message) =>
    serveurUrl() ? viaServeur(path, base64, message, true) : putFile(path, base64, message);

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
   * @param {{sansDepot?:boolean}} [opt]  sansDepot : ne pas se rabattre sur un
   *        commit si le serveur ne prend pas le catalogue. Écrire dans le
   *        dépôt à la place d'un serveur qui existe, c'est empiler des commits
   *        pour rien et cacher ce qu'il y a à réparer.
   */
  async function publish(json, message, opt) {
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
          await (serveurUrl()
            ? viaServeur(c.path, json, "Adresse du serveur mise à jour", false)
            : putFile(c.path, b64(json), "Adresse du serveur mise à jour"));
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

    if (opt && opt.sansDepot) {
      throw err("serveur-ancien",
        "Ton serveur ne sait pas encore garder le catalogue. Recopie " +
        "serveur/serveur.js sur le VPS et redémarre-le : tout passera par lui, " +
        "sans le moindre commit.");
    }

    /* Sinon le chemin d'avant : le serveur commite pour nous s'il sait le
       faire, sinon c'est le jeton de la personne qui publie. */
    const res = serveurUrl()
      ? await viaServeur(c.path, json, msg, false)
      : await putFile(c.path, b64(json), msg);

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
     depuis n'importe quelle page, sans rien à cliquer. Le bouton ne
     réapparaît que là où l'automatique ne peut rien : pas le droit de
     publier, ni serveur ni jeton, ou un envoi qui a échoué.

     Et surtout : l'automatique passe par le serveur. GitHub héberge les
     pages, le serveur détient les données — ce qui change tous les jours n'a
     rien à faire dans l'historique d'un dépôt. Une écriture au serveur est
     immédiate et ne coûte rien ; un commit fait reconstruire le site entier
     pour un numéro de téléphone corrigé.

     Trois cas, donc :
       • le serveur détient le catalogue — la voie normale, deux secondes de
         regroupement et aucun commit ;
       • aucun serveur configuré — le dépôt est la seule voie, on y va, mais en
         groupant largement : chaque envoi y coûte une reconstruction ;
       • un serveur configuré qui ne prend pas le catalogue (version trop
         ancienne) — on ne commite pas à sa place. Ce serait remplir le dépôt
         d'envois qui n'ont pas lieu d'être, et masquer ce qu'il suffit de
         réparer une fois. Le bandeau le dit et laisse la main. */

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

  /** Quelqu'un est là, il a le droit, et il y a une voie de sortie. */
  function autoPossible() {
    try { return !!(MNAuth.session() && MNAuth.can("publish") && canPublish()); }
    catch (_) { return false; }
  }

  /**
   * Par où l'envoi automatique doit passer.
   * @returns {"serveur"|"depot"|""}  "" = ne pas partir tout seul.
   */
  function voieAuto() {
    if (!autoPossible()) return "";
    if (!catalogueUrl()) return "depot";
    return _prendCatalogue === false ? "" : "serveur";
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
      /* Un serveur est là, il a le droit de publier, mais ce serveur ne prend
         pas encore le catalogue : le seul cas où l'on s'arrête volontairement. */
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
   * @param {boolean} [forcerDepot]  autorise le commit même si un serveur est
   *        configuré. Réservé au geste humain : c'est une chose de refuser de
   *        committer tout seul derrière un serveur en panne, c'en est une
   *        autre d'empêcher quelqu'un de mettre son site à jour.
   * @returns {Promise<object|null>} le résultat, ou null s'il n'y avait rien à
   *          envoyer ou si l'envoi a échoué — l'erreur est alors dans
   *          `etatAuto().echec`, pour que le bandeau la montre sans qu'un
   *          minuteur ait à attraper une exception que personne n'écoute.
   */
  async function partir(forcerDepot) {
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
      const info = await publish(MNStore.toJSON(cat), "Catalogue mis à jour par " + qui,
        { sansDepot: !forcerDepot && !!catalogueUrl() });
      localStorage.setItem(K_STAMP, marque);
      rattrape = false;
      return info;
    } catch (e) {
      /* Un serveur d'une version trop ancienne n'est pas une panne : c'est un
         état, que le bandeau sait déjà nommer. Le répéter en rouge et
         réessayer toutes les trente secondes n'apprendrait rien. */
      if (e && e.code === "serveur-ancien") return null;

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
                 : "Sans serveur, la mise en ligne passe par un commit : les " +
                   "modifications partent groupées, d'ici une minute.",
               bouton: "" };
    }
    if (e.serveurAncien) {
      return { ton: "warn", titre: "Ton serveur ne prend pas encore le catalogue.",
               detail: "Recopie serveur/serveur.js sur le VPS et redémarre-le : " +
                 "tout passera par lui, sans commit. En attendant, tu peux " +
                 "publier sur GitHub à la main.",
               bouton: "publier" };
    }
    return null;
  }

  /* Toute écriture du catalogue passe par là, d'où qu'elle vienne : c'est le
     seul endroit où s'abonner pour n'en manquer aucune. */
  try { MNStore.onChange(programmer); } catch (_) { /* magasin absent */ }

  return {
    getToken, setToken, hasToken, forgetToken,
    detect, repoConfig, isConfigured,
    check, publish, lastPublish,
    putFile, putText, putFiles, listDir, uploadImage, imageBrute, getFile, deleteFile, renameFile,
    serveurUrl, catalogueUrl, canPublish,
    autoActif, voieAuto, serveurPrendCatalogue, etatAuto, motAuto, onAuto,
    reveiller: programmer, publierMaintenant: () => partir(true)
  };
})();
