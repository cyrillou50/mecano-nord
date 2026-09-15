/* ==========================================================================
   Qui est sur le site en ce moment.

   « En ligne » n'est pas « en service » : l'un dit qui a la page ouverte,
   l'autre qui a badgé. Les deux se confondent vite — on garde donc deux mots
   différents, ici comme à l'écran.

   Le site est statique : la seule mémoire partagée est le serveur de
   l'atelier. Chacun s'y signale toutes les quarante-cinq secondes et reçoit
   la liste en retour — une requête pour les deux. Sans serveur, il ne se
   passe rien : la liste reste vide et le bouton ne s'affiche pas.
   ========================================================================== */

window.MNPresence = (function () {
  "use strict";

  /* ---- Qui a le droit de voir la liste -----------------------------------
     Savoir qui est devant son écran n'est pas une information anodine : on
     voit qui travaille, qui ne travaille pas, et à quelle heure. L'atelier
     n'a pas encore décidé de la partager, donc pour l'instant le grade le
     plus haut du garage, et lui seul.

     Le jour où il le décide, il n'y a que cette ligne à passer à `true`. */
  const PUBLIC = false;

  const BATTEMENT = 45000;    // on se signale toutes les 45 s

  let gens = [];
  let abonnes = [];
  let minuterie = null;
  let enCours = false;
  let attente = null;      // le battement en vol, pour ne pas en lancer deux

  const adresse = () => {
    try { return MNStore.api("presence"); } catch (_) { return ""; }
  };

  /**
   * Le grade le plus haut d'un garage, c'est le premier de sa liste : le
   * catalogue les range du plus haut au plus bas, et c'est cet ordre-là qui
   * fait foi partout ailleurs sur le site.
   */
  function peutVoir() {
    if (PUBLIC) return true;
    let s = null;
    try { s = MNAuth.session(); } catch (_) { return false; }
    if (!s || s.guest || !s.roleId) return false;
    let grades = [];
    try { grades = MNStore.rolesDeAtelier(s.atelier) || []; } catch (_) { return false; }
    return !!grades.length && grades[0].id === s.roleId;
  }

  /* ---- Le battement ------------------------------------------------------ */

  async function battre(parti) {
    const u = adresse();
    /* Deja en vol : on attend celui-la plutot que d'en lancer un second. */
    if (enCours) return attente;
    if (!u) return;

    let s = null;
    try { s = MNAuth.session(); } catch (_) { s = null; }
    if (!s || !s.uid) return;

    enCours = true;
    let fini;
    attente = new Promise(r => { fini = r; });
    try {
      const r = await fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* Le pseudo et le grade suivent pour le cas où quelqu'un ne serait
           pas — ou plus — dans le catalogue de celui qui regarde. L'affichage
           préfère quand même ce que le catalogue dit de l'identifiant. */
        body: JSON.stringify({
          id: s.uid, pseudo: s.pseudo, roleId: s.roleId, atelier: s.atelier,
          parti: !!parti
        })
      });
      const j = r.ok ? await r.json() : null;
      if (j && Array.isArray(j.gens)) poser(j.gens);
    } catch (_) {
      /* Serveur injoignable : on garde la dernière liste connue plutôt que de
         faire disparaître tout le monde d'un coup pour un réseau qui tousse. */
    } finally {
      enCours = false;
      fini();
      attente = null;
    }
  }

  function poser(liste) {
    gens = liste;
    abonnes.forEach(f => { try { f(gens); } catch (_) { /* un abonné fautif */ } });
  }

  /** Démarre le battement. Appelé une fois, au montage de la page. */
  function demarrer() {
    if (minuterie || !adresse()) return;
    battre(false);
    minuterie = setInterval(() => battre(false), BATTEMENT);

    /* Revenir sur l'onglet doit rafraîchir tout de suite : sinon on regarde
       une liste vieille de trois quarts de minute. */
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) battre(false);
    });

    /* Fermer la page se dit : sans ça, on resterait « en ligne » une minute
       et demie après être parti. `sendBeacon` part même quand la page s'en
       va, ce que `fetch` ne garantit pas. */
    window.addEventListener("pagehide", () => {
      let s = null;
      try { s = MNAuth.session(); } catch (_) { return; }
      if (!s || !s.uid) return;
      try {
        navigator.sendBeacon(adresse(), new Blob(
          [JSON.stringify({ id: s.uid, parti: true })],
          { type: "application/json" }));
      } catch (_) { /* tant pis : l'oubli du serveur s'en chargera */ }
    });
  }

  /** La dernière liste connue, du plus ancien arrivé au plus récent. */
  const liste = () => gens.slice();

  /** Prévenu à chaque changement, et tout de suite avec ce qu'on sait déjà. */
  function onChange(f) {
    abonnes.push(f);
    try { f(gens); } catch (_) { /* rien */ }
  }

  return { demarrer, liste, onChange, peutVoir, battre, PUBLIC };
})();
