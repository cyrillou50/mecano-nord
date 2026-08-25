/* ==========================================================================
   Connexion « pseudo » + permissions.

   Le site est 100 % statique (GitHub Pages) : la liste des employés vit dans
   data/catalog.json, et la session dans le navigateur. Le code PIN n'est
   JAMAIS stocké en clair — seulement son empreinte SHA-256 salée.

   À savoir, honnêtement : sur un site statique, tout se joue dans le
   navigateur. Ça bloque très bien les curieux et ça organise proprement les
   droits de l'équipe, mais quelqu'un qui sait ouvrir la console pourra
   contourner l'écran de connexion. Ne mets pas d'informations réellement
   sensibles dans ce fichier de données.
   ========================================================================== */

window.MNAuth = (function () {
  "use strict";

  const K_SESSION = "mn.session";
  const SALT = "MNDOD:v1:";

  /* ---- SHA-256 (implémentation locale, marche même en file://) ---------- */

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c < 0xdc00) {
        const c2 = str.charCodeAt(++i);
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function sha256(text) {
    const bytes = utf8Bytes(String(text));
    const bitLen = bytes.length * 8;
    const m = bytes.slice();
    m.push(0x80);
    while (m.length % 64 !== 56) m.push(0);
    m.push(0, 0, 0, 0, (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);

    for (let i = 0; i < m.length; i += 64) {
      for (let t = 0; t < 16; t++) {
        w[t] = (m[i + t * 4] << 24) | (m[i + t * 4 + 1] << 16) | (m[i + t * 4 + 2] << 8) | m[i + t * 4 + 3];
      }
      for (let t = 16; t < 64; t++) {
        const a1 = w[t - 15], b1 = w[t - 2];
        const s0 = rotr(a1, 7) ^ rotr(a1, 18) ^ (a1 >>> 3);
        const s1 = rotr(b1, 17) ^ rotr(b1, 19) ^ (b1 >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(x => x.toString(16).padStart(8, "0")).join("");
  }

  /** Empreinte d'un code PIN, liée à l'identifiant de l'employé. */
  const hashPin = (userId, pin) => sha256(SALT + userId + ":" + String(pin));

  /* ---- Accès à la liste des employés ------------------------------------ */

  /* Les réglages de connexion viennent du catalogue (donc modifiables
     depuis le panneau admin), avec repli sur les valeurs par défaut. */
  function authCfg() {
    try { return MNStore.settings().auth; }
    catch (_) { return window.MN_CONFIG.defaults.auth; }
  }
  const allPerms = () => (window.MN_PERMS || []).map(p => p.key);

  function users() {
    const c = window.MNStore && MNStore.catalog();
    return (c && Array.isArray(c.users)) ? c.users : [];
  }

  const norm = s => String(s || "").trim().toLowerCase();

  function findByPseudo(pseudo) {
    const n = norm(pseudo);
    return users().find(u => norm(u.pseudo) === n) || null;
  }

  /** Permissions réellement actives : celles du rôle, « admin » impliquant tout. */
  function effectivePerms(user) {
    if (!user) return [];
    const p = (MNStore.roleOf(user).perms || []).slice();
    return p.indexOf("admin") !== -1 ? allPerms() : p;
  }

  const roleOf = user => MNStore.roleOf(user);

  /* ---- Session ----------------------------------------------------------- */

  let _session = null;

  function readStored() {
    try {
      const s = JSON.parse(localStorage.getItem(K_SESSION) || "null");
      if (!s || !s.exp || Date.now() > s.exp) { localStorage.removeItem(K_SESSION); return null; }
      return s;
    } catch (_) { return null; }
  }

  function writeStored(s) {
    const days = Number(authCfg().sessionDays) || 30;
    s.exp = Date.now() + days * 86400000;
    localStorage.setItem(K_SESSION, JSON.stringify(s));
    return s;
  }

  /**
   * Session courante, re-vérifiée contre la liste d'employés à chaque appel :
   * si un patron te retire du site, ton accès tombe au prochain chargement.
   * @returns {null|{uid,pseudo,role,perms:string[],guest:boolean,bootstrap?:boolean}}
   */
  function session() {
    if (_session) return _session;
    const s = readStored();
    if (!s) return null;

    if (s.guest) {
      if (!authCfg().allowGuests) { localStorage.removeItem(K_SESSION); return null; }
      _session = {
        uid: null, pseudo: s.pseudo, guest: true,
        role: "Invité", roleColor: "#6a6280",
        perms: authCfg().guestPerms || []
      };
      return _session;
    }

    const u = users().find(x => x.id === s.uid);
    if (!u || u.active === false) { localStorage.removeItem(K_SESSION); return null; }
    const r = MNStore.roleOf(u);

    _session = {
      uid: u.id, pseudo: u.pseudo, guest: false,
      role: r.name, roleId: r.id, roleColor: r.color,
      perms: effectivePerms(u), user: u
    };
    return _session;
  }

  const isLogged = () => !!session();

  function can(perm) {
    const s = session();
    return !!s && s.perms.indexOf(perm) !== -1;
  }

  const canAny = (...list) => list.some(can);

  /** Est-ce que ce pseudo réclame un code PIN ? */
  function needsPin(pseudo) {
    const u = findByPseudo(pseudo);
    return !!(u && u.pin);
  }

  /**
   * Tentative de connexion.
   * @returns {{ok:true}|{ok:false, code:string, message:string}}
   */
  function login(pseudo, pin) {
    const clean = String(pseudo || "").trim();
    if (clean.length < 2) return fail("pseudo-court", "Ton nom doit faire au moins 2 caractères.");
    /* 40 comme les fiches employés : plus bas, un « Prénom Nom » un peu long
       aurait été enregistrable sans pouvoir se connecter ensuite. */
    if (clean.length > 40) return fail("pseudo-long", "40 caractères maximum.");

    const list = users();

    /* Premier démarrage : personne dans la liste → le premier arrivé est patron. */
    if (!list.length && authCfg().bootstrapFirstUser !== false) {
      const id = MNStore.slugify(clean);
      const cat = MNStore.clone(MNStore.catalog());
      cat.roles = [{ id: "patron", name: "Patron", color: "#ff2bd1", perms: ["admin"] }];
      cat.users = [{
        id,
        pseudo: clean,
        roleId: "patron",
        pin: pin ? hashPin(id, pin) : null,
        active: true,
        createdAt: new Date().toISOString()
      }];
      MNStore.saveDraft(cat);
      _session = null;
      writeStored({ uid: id, pseudo: clean });
      return { ok: true, bootstrap: true };
    }

    const u = findByPseudo(clean);

    if (!u) {
      if (authCfg().allowGuests) {
        _session = null;
        writeStored({ guest: true, pseudo: clean });
        return { ok: true, guest: true };
      }
      return fail("inconnu", "Ce nom n'est pas enregistré. Demande à un responsable de t'ajouter.");
    }
    if (u.active === false) return fail("desactive", "Ce compte a été désactivé.");
    if (u.pin) {
      if (!pin) return fail("pin-requis", "Ce compte est protégé par un code.");
      if (hashPin(u.id, pin) !== u.pin) return fail("pin-faux", "Code incorrect.");
    }

    _session = null;
    writeStored({ uid: u.id, pseudo: u.pseudo });
    return { ok: true };
  }

  const fail = (code, message) => ({ ok: false, code, message });

  function logout() {
    localStorage.removeItem(K_SESSION);
    _session = null;
  }

  /** À rappeler après une modification de la liste d'employés. */
  function refresh() { _session = null; return session(); }

  return {
    sha256, hashPin, users, findByPseudo, effectivePerms, roleOf, allPerms,
    session, isLogged, can, canAny, needsPin, login, logout, refresh
  };
})();
