/* ==========================================================================
   Publication en ligne — écrit data/catalog.json directement dans le dépôt
   GitHub via l'API, depuis le navigateur.

   Résultat : on modifie tout depuis le panneau admin, on clique « Publier »,
   et le site public est à jour ~1 minute plus tard. Aucun fichier à toucher.

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
  const putText = (path, text, message) => putFile(path, b64(text), message);

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

  /** Renomme un fichier : copie au nouveau nom puis supprime l'ancien. */
  async function renameFile(from, to, message) {
    if (from === to) return { ok: true, unchanged: true };
    if (await currentSha(to)) throw err("exists", "Un fichier porte déjà ce nom : " + to);
    const f = await getFile(from);
    await putFile(to, f.content, message || ("Renommage : " + from + " → " + to));
    await deleteFile(from, "Renommage : ancien fichier " + from);
    return { ok: true };
  }

  /** Dépose une image (donnée `data:image/...;base64,...`) dans le dépôt. */
  function uploadImage(path, dataUri, message) {
    const i = String(dataUri).indexOf(",");
    if (i === -1) throw err("bad-data", "Image invalide.");
    return putFile(path, String(dataUri).slice(i + 1), message || ("Ajout de l'image " + path));
  }

  /**
   * Envoie le catalogue sur GitHub.
   * @param {string} json  contenu complet du fichier
   * @param {string} message  message de commit
   */
  async function publish(json, message) {
    const c = repoConfig();
    const res = await putFile(
      c.path, b64(json),
      message || "Mise à jour du catalogue depuis le panneau admin"
    );

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

  return {
    getToken, setToken, hasToken, forgetToken,
    detect, repoConfig, isConfigured,
    check, publish, lastPublish,
    putFile, putText, listDir, uploadImage, getFile, deleteFile, renameFile
  };
})();
