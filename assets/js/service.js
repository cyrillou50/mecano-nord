/* ==========================================================================
   Page Service : pointer son service, et pour les gérants voir qui est là.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;

  /* Le tableau bouge quand quelqu'un pointe : 10 s donne l'impression du
     direct sans matraquer le serveur. Une page laissée ouverte retombe à la
     minute. */
  const RYTHME = { vif: 10000, calme: 60000 };

  let me = null;
  let busy = false;
  let ticker = null;
  let stopRefresh = null;

  MNUI.start({ page: "service", title: "Service", onReady: init });

  async function init(session) {
    me = session;
    if (!MNAuth.canAny("duty", "duty_view", "duty_manage")) return denied();

    $("#service-root").innerHTML =
      '<p class="hint" style="padding:40px 0;text-align:center">Chargement du tableau…</p>';

    /* Quoi qu'il arrive, on affiche la page : un tableau distant en panne ne
       doit jamais empêcher quelqu'un de pointer. */
    try {
      await MNDuty.load(true);
    } catch (e) {
      console.error(e);
    }

    try {
      render();
    } catch (e) {
      console.error(e);
      $("#service-root").innerHTML =
        '<div class="alert alert--err" style="margin:30px 0">' + svg("alert") +
        "<span><b>Impossible d'afficher le tableau.</b> " + esc(e.message) + "</span></div>" +
        '<div class="row"><a class="btn btn--primary" href="index.html">Retour à la facturation</a></div>';
      return;
    }

    /* Les compteurs avancent à la seconde. */
    clearInterval(ticker);
    ticker = setInterval(refreshDurations, 1000);

    /* Le tableau est relu en continu : c'est ce qui fait apparaître les
       pointages et les congés posés depuis un autre poste. */
    if (stopRefresh) stopRefresh();
    stopRefresh = MNUI.autoRefresh(rafraichir, RYTHME);

    /* En fond : la page est déjà utilisable sans, l'objectif s'ajoute s'il
       existe. */
    lireObjectif();
  }

  /**
   * Relit le tableau partagé et redessine s'il a changé.
   *
   * On s'abstient pendant une action ou une fenêtre ouverte : redessiner sous
   * les doigts de quelqu'un est pire que d'attendre le passage suivant. Et on
   * ne reconstruit la page que si quelque chose a bougé — à ce rythme, la
   * refaire à vide ferait clignoter et perdrait le survol.
   */
  async function rafraichir() {
    if (busy || document.querySelector(".modal-back")) return;
    /* Le jour fait partie de l'état affiché : un congé qui commence demain ne
       change aucune donnée, seulement la date. */
    const etat = () => MNDuty.board().updatedAt + "|" + MNDuty.jourLocal() + "|" + MNDuty.souci();
    const avant = etat();
    await MNDuty.load(true);
    /* Le message d'erreur compte aussi : sans ça, une panne qui s'installe
       resterait invisible, et sa disparition tout autant. */
    if (etat() !== avant) render();
  }

  function denied() {
    $("#service-root").innerHTML =
      '<div class="denied"><div class="denied__in">' + svg("lock") +
        "<h2>Accès refusé</h2><p>Ton rôle (" + esc(me.role) + ") n'a pas accès au service. " +
        "Demande la permission « Pointer son service » à un responsable.</p>" +
        '<a class="btn btn--primary" href="index.html">Retour à la facturation</a>' +
      "</div></div>";
  }

  /* ---- Rendu ---------------------------------------------------------------- */

  function render() {
    const onDuty = MNDuty.board().onDuty;
    const mine = MNDuty.entryOf(me.uid);
    const canPoint = MNAuth.can("duty");
    const canManage = MNAuth.can("duty_manage");
    const canView = MNAuth.can("duty_view") || canManage;

    $("#service-root").innerHTML =
      '<h1 class="page-title">Service</h1>' +
      '<p class="page-sub">Pointage de l\'atelier</p>' +

      (canPoint ? myCard(mine) + myTimeCard() + myLeaveCard() : "") +
      (MNDuty.souci()
        ? '<div class="alert alert--err" style="margin-bottom:18px">' + svg("alert") +
          "<span><b>" + esc(MNDuty.souci()) + "</b> Le tableau affiché peut être incomplet. " +
          "Vérifie l'adresse dans le panneau admin (Publier → Pointage de l'équipe).</span></div>"
        : "") +
      (MNDuty.canShare() ? "" : shareWarning()) +
      (canView ? boardPanel(onDuty, canManage) + leavePanel(canManage) + statsPanel(canManage)
               : teamCount(onDuty));

    if (canPoint) $("#d-toggle").addEventListener("click", toggle);

    const cg = $("#d-conge");
    if (cg) cg.addEventListener("click", () => askLeave(me.uid, me.pseudo, me.roleId, ""));
    const cgp = $("#d-conge-other");
    if (cgp) cgp.addEventListener("click", leaveForSomeone);

    /* Les deux panneaux partagent le même filtre : voir « à venir » d'un côté
       et « année 2025 » de l'autre n'aurait aucun sens sur la même page. */
    document.querySelectorAll("[data-anneeconges]").forEach(s =>
      s.addEventListener("change", () => { anneeConges = s.value; render(); }));

    document.querySelectorAll("[data-editconge]").forEach(b =>
      b.addEventListener("click", () => {
        const c = MNDuty.congeById(b.dataset.editconge);
        if (c) askLeave(c.id, c.pseudo, c.roleId, c.cid);
      }));
    document.querySelectorAll("[data-rmconge]").forEach(b =>
      b.addEventListener("click", () => dropLeave(b.dataset.rmconge, b.dataset.pseudo)));
    $("#d-reload").addEventListener("click", async () => {
      await MNDuty.load(true); render(); MNUI.toast("Tableau actualisé", "ok");
    });

    document.querySelectorAll("[data-out]").forEach(b =>
      b.addEventListener("click", () => kick(b.dataset.out, b.dataset.pseudo)));

    const tk = $("#d-token");
    if (tk) tk.addEventListener("click", askToken);

    const pin = $("#d-punch");
    if (pin) pin.addEventListener("click", punchSomeone);

    const clr = $("#d-clearlog");
    if (clr) clr.addEventListener("click", clearLog);

    document.querySelectorAll("[data-rmlog]").forEach(b =>
      b.addEventListener("click", () => removeLog(Number(b.dataset.rmlog), b.dataset.pseudo)));

    document.querySelectorAll("[data-editlog]").forEach(b =>
      b.addEventListener("click", () => {
        const coupe = b.dataset.editlog.indexOf("|");
        const id = b.dataset.editlog.slice(0, coupe), debut = b.dataset.editlog.slice(coupe + 1);
        const e = MNDuty.board().log.find(x => x.id === id && x.in === debut);
        if (e) editLog(e); else MNUI.toast("Ce pointage n'existe plus", "err");
      }));
  }

  function myCard(mine) {
    const on = !!mine;
    return '<div class="pubstate pubstate--' + (on ? "ok" : "off") + '" style="margin-bottom:18px">' +
      '<div class="pubstate__ico">' + svg(on ? "check" : "history") + "</div>" +
      '<div class="pubstate__txt">' +
        "<b>" + (on ? "Tu es en service" : "Tu n'es pas en service") + "</b>" +
        "<span>" + (on
          ? "Depuis " + new Date(mine.since).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
            ' — <b class="tnum" id="d-elapsed">' + MNDuty.sinceDur(mine.since) + "</b>"
          : "Pointe en arrivant à l'atelier, l'équipe est prévenue sur Discord.") + "</span>" +
      "</div>" +
      '<button class="btn ' + (on ? "btn--danger" : "btn--solid") + '" id="d-toggle">' +
        svg(on ? "logout" : "login") + "<span>" + (on ? "Quitter le service" : "Prendre mon service") + "</span></button>" +
    "</div>";
  }

  /* ---- Mon temps ---------------------------------------------------------------
     La page savait dire le temps de toute l'équipe à qui a le droit de le
     voir, et rien du sien à celui qui n'a que le pointage. « Combien j'ai fait
     cette semaine » est pourtant la première question qu'on se pose ici. */

  /* Heures attendues sur la semaine, telles que le serveur les signalera dans
     le récapitulatif du dimanche. null = pas encore su, 0 = rien à afficher. */
  let objectif = null;

  const hhmm = d => new Date(d).toLocaleTimeString("fr-FR",
    { hour: "2-digit", minute: "2-digit" });

  /** `sous` passe en HTML : la jauge en a besoin, les autres appels échappent. */
  const stat = (label, valeur, vif, cle, sous) =>
    '<div class="stat' + (vif ? " stat--live" : "") + '">' +
      '<span class="stat__l">' + esc(label) + "</span>" +
      '<b class="stat__v tnum"' + (cle ? ' data-mien="' + cle + '"' : "") + ">" +
        esc(valeur) + "</b>" +
      (sous ? '<span class="stat__s">' + sous + "</span>" : "") +
    "</div>";

  /** Où j'en suis des heures attendues cette semaine. */
  function jauge(sec) {
    if (!objectif) return "";
    const but = objectif * 3600;
    const fait = sec >= but;
    return '<span class="jauge' + (fait ? " est-fait" : "") + '">' +
        '<span class="jauge__p" style="width:' +
          Math.min(100, Math.round((sec / but) * 100)) + '%"></span></span>' +
      esc(fait
        ? "objectif de " + objectif + " h atteint"
        : "encore " + MNDuty.dur(but - sec, true) + " avant " + objectif + " h");
  }

  function myTimeCard() {
    const on = !!MNDuty.entryOf(me.uid);
    const sem = MNDuty.secondsFor(me.uid, MNDuty.weekStart());
    const sept = MNDuty.secondsFor(me.uid, Date.now() - 7 * 86400000);
    const tot = MNDuty.secondsFor(me.uid);
    const log = MNDuty.logOf(me.uid);
    const moy = log.length
      ? Math.round(log.reduce((n, e) => n + e.seconds, 0) / log.length) : 0;

    return '<div class="panel" style="margin-bottom:18px">' +
      '<div class="panel__head"><h2>Mon temps de service</h2></div>' +
      '<div class="panel__body">' +
        '<div class="statgrid">' +
          stat("Cette semaine", MNDuty.dur(sem, true), on, "sem",
            '<span data-mien="jauge">' + jauge(sem) + "</span>") +
          stat("7 derniers jours", MNDuty.dur(sept, true), on, "sept") +
          stat("Total", MNDuty.dur(tot, true), on, "tot",
            esc(log.length + " service" + (log.length > 1 ? "s" : ""))) +
          stat("Moyenne par service", moy ? MNDuty.dur(moy, true) : "—") +
        "</div>" +

        /* Ses propres pointages, même pour qui n'a pas le droit de voir ceux
           des autres : vérifier une heure qu'on croit fausse est un besoin
           courant, et ça n'oblige personne à demander à un gérant. */
        (log.length
          ? '<div class="rows" style="margin-top:12px">' + log.slice(0, 8).map(e =>
              '<div class="trow"><div class="trow__main"><b>' +
                esc(new Date(e.in).toLocaleDateString("fr-FR",
                  { weekday: "long", day: "2-digit", month: "2-digit" })) + "</b>" +
                '<div class="trow__meta"><i>' + esc(hhmm(e.in) + " → " + hhmm(e.out)) + "</i>" +
                  (e.forced ? '<span class="permtag">sorti par un gérant</span>' : "") +
                  (e.corrigePar
                    ? '<span class="permtag">horaires corrigés par ' + esc(e.corrigePar) + "</span>"
                    : "") +
                "</div></div>" +
                '<span class="trow__price tnum">' + MNDuty.dur(e.seconds) + "</span>" +
              "</div>").join("") + "</div>"
          : '<p class="hint" style="margin-top:12px">Aucun service terminé pour l\'instant.</p>') +
      "</div></div>";
  }

  /**
   * Le seuil du récapitulatif hebdomadaire, demandé au serveur. Sans serveur,
   * serveur trop ancien ou seuil désactivé, aucun objectif ne s'affiche :
   * mieux vaut rien qu'un chiffre inventé ici, qui ne vaudrait rien dimanche.
   */
  async function lireObjectif() {
    let u = "";
    try { u = MNStore.api("sante"); } catch (_) { return; }
    if (!u) return;
    try {
      const r = await fetch(u, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      const h = j && Number(j.recapMini);
      if (h > 0) { objectif = h; render(); }
    } catch (_) { /* pas de serveur : pas d'objectif, et rien de cassé */ }
  }

  /* ---- Congés ---------------------------------------------------------------- */

  /** « 10 août » — l'année n'apparaît que si ce n'est pas l'année en cours. */
  function jourCourt(j) {
    const d = new Date(String(j) + "T12:00:00");     // midi : jamais de bascule de fuseau
    if (isNaN(d)) return String(j);
    const opts = { day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("fr-FR", opts);
  }

  /** « du 10 au 20 août · 11 jours » */
  function periode(c) {
    return "du " + jourCourt(c.from) + " au " + jourCourt(c.to) +
      " · " + MNDuty.nbJours(c.from, c.to) + " jour" + (MNDuty.nbJours(c.from, c.to) > 1 ? "s" : "");
  }

  /* ---- Historique -------------------------------------------------------------
     Les périodes passées n'ont jamais été effacées, seulement masquées : par
     défaut on ne montre que ce qui vient, parce que c'est ce qu'on consulte
     tous les jours. Mais « combien de jours a-t-il pris cette année » est une
     question qui se pose, et il n'y avait aucun moyen d'y répondre.

     `anneeConges` : "" = en cours et à venir, "tout" = depuis toujours,
     sinon une année. */

  let anneeConges = "";

  /** L'état d'une période vis-à-vis d'aujourd'hui. */
  function etatConge(c) {
    const j = MNDuty.jourLocal();
    if (c.to < j) return "passe";
    if (c.from <= j) return "encours";
    return "avenir";
  }

  /** Les années où des congés ont été posés, la plus récente d'abord. */
  function anneesConges(liste) {
    const vues = {};
    liste.forEach(c => { vues[String(c.from).slice(0, 4)] = true; });
    return Object.keys(vues).filter(a => /^\d{4}$/.test(a)).sort().reverse();
  }

  /**
   * Applique le filtre choisi.
   * @param {Array} tous toutes les périodes connues, passées comprises
   */
  function filtrerConges(tous) {
    if (!anneeConges) {
      const j = MNDuty.jourLocal();
      return tous.filter(c => c.to >= j).sort((a, b) => a.from.localeCompare(b.from));
    }
    /* En historique, le plus récent d'abord : on remonte le temps. */
    const l = anneeConges === "tout"
      ? tous.slice()
      /* Une période à cheval sur deux années compte dans les deux. */
      : tous.filter(c => c.from <= anneeConges + "-12-31" && c.to >= anneeConges + "-01-01");
    return l.sort((a, b) => b.from.localeCompare(a.from));
  }

  /** Le sélecteur de période, posé dans l'entête d'un panneau. */
  function selecteurConges(tous) {
    const annees = anneesConges(tous);
    if (!annees.length) return "";
    const opt = (v, nom) => '<option value="' + v + '"' +
      (v === anneeConges ? " selected" : "") + ">" + nom + "</option>";
    return '<select class="select select--sm" data-anneeconges>' +
      opt("", "En cours et à venir") +
      annees.map(a => opt(a, "Année " + a)).join("") +
      opt("tout", "Depuis toujours") +
    "</select>";
  }

  /** « 3 périodes · 24 jours » — ce qu'on vient chercher dans un historique. */
  function bilanConges(liste) {
    if (!liste.length || !anneeConges) return "";
    const jours = liste.reduce((n, c) => n + MNDuty.nbJours(c.from, c.to), 0);
    return '<p class="hint" style="margin-top:10px">' + liste.length + " période" +
      (liste.length > 1 ? "s" : "") + " · <b>" + jours + " jour" +
      (jours > 1 ? "s" : "") + "</b> au total.</p>";
  }

  /** Étiquette d'état, commune aux deux panneaux. */
  const puceEtat = c => ({
    encours: '<span class="permtag permtag--on">en cours</span>',
    avenir: "<em>à venir</em>",
    passe: '<span class="permtag">passés</span>'
  })[etatConge(c)];

  /**
   * Mes périodes. Elles sont listées ici et pas seulement dans le panneau
   * d'équipe : un employé sans droit de regard sur l'équipe doit quand même
   * pouvoir gérer les siennes.
   */
  function myLeaveCard() {
    const tous = MNDuty.congesOf(me.uid, true);
    const list = filtrerConges(tous);
    const now = MNDuty.enConge(me.uid);

    return '<div class="panel" style="margin-bottom:18px">' +
      '<div class="panel__head"><h2>Mes congés</h2>' +
        (now ? '<span class="permtag permtag--on">en congés</span>' : "") +
        (list.length ? '<span class="pill pill--ok">' + list.length + "</span>" : "") +
        '<span class="spacer"></span>' +
        selecteurConges(tous) +
        '<button class="btn btn--solid btn--sm" id="d-conge">' + svg("calendar") +
          "<span>" + (tous.length ? "Ajouter une période" : "Poser des congés") + "</span></button>" +
      "</div>" +
      '<div class="panel__body">' +
        (list.length
          ? '<div class="rows">' + list.map(myLeaveRow).join("") + "</div>" + bilanConges(list)
          : '<p class="hint">' + (anneeConges
              ? "Aucun congé sur cette période."
              : "Aucune absence prévue. Préviens l'équipe de tes dates, elles partent " +
                "sur Discord.") + "</p>") +
      "</div></div>";
  }

  function myLeaveRow(c) {
    return '<div class="trow' + (etatConge(c) === "passe" ? " is-off" : "") + '">' +
      '<div class="trow__main"><b>' + esc(periode(c)) + "</b>" +
        '<div class="trow__meta">' +
          puceEtat(c) +
          (c.note ? "<i>" + esc(c.note) + "</i>" : "") +
          (c.by ? "<i>posés par " + esc(c.by) + "</i>" : "") +
        "</div></div>" +
      '<button class="btn btn--icon" data-editconge="' + esc(c.cid) + '" title="Modifier ces dates">' +
        svg("edit") + "</button>" +
      '<button class="btn btn--icon" data-rmconge="' + esc(c.cid) + '" data-pseudo="' + esc(c.pseudo) +
        '" title="Annuler cette période">' + svg("x") + "</button>" +
    "</div>";
  }

  function leavePanel(canManage) {
    const tous = MNDuty.conges(true);
    const list = filtrerConges(tous);
    return '<div class="panel" style="margin-bottom:18px">' +
      '<div class="panel__head"><h2>Congés</h2>' +
        '<span class="pill' + (list.length ? " pill--ok" : "") + '">' + list.length + "</span>" +
        '<span class="spacer"></span>' +
        selecteurConges(tous) +
        (canManage
          ? '<button class="btn btn--ghost btn--sm" id="d-conge-other">' + svg("calendar") +
            "<span>Poser pour quelqu'un</span></button>"
          : "") +
      "</div>" +
      '<div class="panel__body">' +
        (list.length
          ? '<div class="rows">' + list.map(c => leaveRow(c, canManage)).join("") + "</div>" +
            bilanConges(list)
          : '<div class="empty">' + svg("calendar") +
            "<b>" + (anneeConges ? "Aucun congé sur cette période" : "Personne en congés") + "</b>" +
            "<p>" + (anneeConges
              ? "Personne n'a posé de congés dans cet intervalle."
              : "Aucune absence prévue pour le moment.") + "</p></div>") +
      "</div></div>";
  }

  function leaveRow(c, canManage) {
    const role = MNStore.roleById(c.roleId);
    return '<div class="trow' + (etatConge(c) === "passe" ? " is-off" : "") + '">' +
      '<div class="userchip__av" style="width:38px;height:38px;flex:none' +
        (role ? ";background:" + esc(role.color) : "") + '">' + esc(MNUI.initials(c.pseudo)) + "</div>" +
      '<div class="trow__main"><b>' + esc(c.pseudo) + "</b>" +
        '<div class="trow__meta">' +
          puceEtat(c) +
          (role ? '<span class="permtag" style="border-color:' + esc(role.color) +
                  ';color:' + esc(role.color) + '">' + esc(role.name) + "</span>" : "") +
          (c.note ? "<i>" + esc(c.note) + "</i>" : "") +
          (c.by ? "<i>posés par " + esc(c.by) + "</i>" : "") +
        "</div></div>" +
      '<span class="trow__price">' + esc(periode(c)) + "</span>" +
      (canManage || c.id === me.uid
        ? '<button class="btn btn--icon" data-editconge="' + esc(c.cid) + '" title="Modifier ces dates">' +
            svg("edit") + "</button>" +
          '<button class="btn btn--icon" data-rmconge="' + esc(c.cid) + '" data-pseudo="' + esc(c.pseudo) +
            '" title="Annuler cette période">' + svg("x") + "</button>"
        : "") +
    "</div>";
  }

  /**
   * Affiché seulement quand rien n'est en place. Le message vise le
   * responsable : un employé n'a jamais à installer quoi que ce soit.
   */
  function shareWarning() {
    const chef = MNAuth.canAny("admin", "publish");
    return '<div class="alert alert--warn" style="margin-bottom:18px;align-items:center">' + svg("alert") +
      "<span><b>Les pointages ne sont pas encore partagés.</b> Ils partent sur Discord, mais " +
      "n'apparaissent pas dans le tableau commun. " +
      (chef
        ? "Mets en place le <b>relais</b> (panneau admin → Discord) : une fois fait, tout le monde " +
          "pointe sans rien avoir à installer."
        : "Préviens un responsable : il doit mettre en place le relais du site.") + "</span>" +
      (chef
        ? '<button class="btn btn--ghost btn--sm" id="d-token" style="flex:none" ' +
          'title="Solution de dépannage : utiliser un jeton sur cet appareil">' + svg("key") +
          "<span>Jeton</span></button>"
        : "");
  }

  /** Enregistre le jeton d'équipe sur cet appareil. */
  function askToken() {
    const body = document.createElement("div");
    body.innerHTML =
      '<div class="field"><label class="label" for="tk">Jeton d\'équipe</label>' +
        '<input class="input mono" id="tk" type="password" placeholder="github_pat_…" autocomplete="off"></div>' +
      '<div id="tk-msg" style="margin-top:12px"></div>' +
      '<p class="hint" style="margin-top:12px">Colle ici le jeton que ton responsable t\'a envoyé. ' +
        "Il reste sur <b>cet appareil</b> et sert uniquement à inscrire tes prises de service dans le " +
        "tableau commun. Tu n'auras plus à le refaire.</p>";

    MNUI.modal({
      title: "Jeton d'équipe", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: async (close, b, btn) => {
            const v = body.querySelector("#tk").value.trim();
            const msg = body.querySelector("#tk-msg");
            if (!v) return MNUI.toast("Colle d'abord le jeton", "err");

            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Vérification…</span>";
            const avant = MNGitHub.getToken();
            MNGitHub.setToken(v);
            try {
              const r = await MNGitHub.check();
              if (!r.canWrite) throw new Error("Ce jeton n'a pas le droit d'écrire sur le dépôt.");
              close();
              MNUI.toast("Jeton enregistré — tes pointages sont maintenant partagés", "ok");
              await MNDuty.load(true);
              render();
            } catch (e) {
              if (avant) MNGitHub.setToken(avant); else MNGitHub.forgetToken();
              btn.disabled = false;
              btn.innerHTML = svg("save") + "<span>Enregistrer</span>";
              msg.innerHTML = '<div class="alert alert--err">' + svg("alert") +
                "<span>" + esc(e.message) + "</span></div>";
            }
          }
        }
      ]
    });
  }

  function teamCount(onDuty) {
    return '<div class="panel"><div class="panel__body" style="text-align:center">' +
      '<p class="hint">' + (onDuty.length
        ? "<b>" + onDuty.length + "</b> personne" + (onDuty.length > 1 ? "s" : "") + " en service actuellement."
        : "Personne n'est en service pour le moment.") + "</p>" +
      '<button class="btn btn--ghost btn--sm" id="d-reload" style="margin-top:10px">' +
        svg("refresh") + "<span>Actualiser</span></button>" +
    "</div></div>";
  }

  function boardPanel(onDuty, canManage) {
    return '<div class="panel" style="margin-bottom:18px">' +
      '<div class="panel__head"><h2>En service</h2>' +
        '<span class="pill' + (onDuty.length ? " pill--ok" : "") + '">' + onDuty.length + "</span>" +
        '<span class="spacer"></span>' +
        (canManage
          ? '<button class="btn btn--ghost btn--sm" id="d-punch">' + svg("user") +
            "<span>Pointer quelqu'un</span></button>"
          : "") +
        '<button class="btn btn--ghost btn--sm" id="d-reload">' + svg("refresh") + "<span>Actualiser</span></button>" +
      "</div>" +
      '<div class="panel__body">' +
        (onDuty.length
          ? '<div class="rows">' + onDuty
              .slice()
              .sort((a, b) => new Date(a.since) - new Date(b.since))
              .map(e => dutyRow(e, canManage)).join("") + "</div>"
          : '<div class="empty">' + svg("users") + "<b>Atelier vide</b>" +
            "<p>Personne n'a pointé pour le moment.</p></div>") +
      "</div></div>";
  }

  function dutyRow(e, canManage) {
    const role = MNStore.roleById(e.roleId);
    return '<div class="trow">' +
      '<span class="dutydot"></span>' +
      '<div class="userchip__av" style="width:38px;height:38px;flex:none' +
        (role ? ";background:" + esc(role.color) : "") + '">' + esc(MNUI.initials(e.pseudo)) + "</div>" +
      '<div class="trow__main"><b>' + esc(e.pseudo) + "</b>" +
        '<div class="trow__meta">' +
          (role ? '<span class="permtag" style="border-color:' + esc(role.color) +
                  ';color:' + esc(role.color) + '">' + esc(role.name) + "</span>" : "") +
          "<i>depuis " + new Date(e.since).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + "</i>" +
        "</div></div>" +
      '<span class="trow__price tnum" data-since="' + esc(e.since) + '">' + MNDuty.sinceDur(e.since) + "</span>" +
      (canManage
        ? '<button class="btn btn--icon" data-out="' + esc(e.id) + '" data-pseudo="' + esc(e.pseudo) +
          '" title="Mettre fin à son service">' + svg("logout") + "</button>"
        : "") +
    "</div>";
  }

  function statsPanel(canManage) {
    const t = MNDuty.totals(7);
    const log = MNDuty.board().log.slice(0, 12);
    return '<div class="panel" style="margin-bottom:18px">' +
      '<div class="panel__head"><h2>Temps de service — 7 derniers jours</h2></div>' +
      '<div class="panel__body">' +
        (t.length
          ? '<div class="rows">' + t.map(u => {
              const role = MNStore.roleById(u.roleId);
              return '<div class="trow">' +
                '<div class="userchip__av" style="width:34px;height:34px;flex:none">' +
                  esc(MNUI.initials(u.pseudo)) + "</div>" +
                '<div class="trow__main"><b>' + esc(u.pseudo) + "</b>" +
                  '<div class="trow__meta">' +
                    (role ? "<i>" + esc(role.name) + "</i>" : "") +
                    "<em>" + u.sessions + " service" + (u.sessions > 1 ? "s" : "") + "</em></div></div>" +
                '<span class="trow__price tnum">' + MNDuty.dur(u.seconds) + "</span></div>";
            }).join("") + "</div>"
          : '<p class="hint">Aucun service terminé sur la période.</p>') +
      "</div></div>" +

      '<div class="panel"><div class="panel__head"><h2>Derniers pointages</h2>' +
        '<span class="spacer"></span>' +
        (canManage && log.length
          ? '<button class="btn btn--ghost btn--sm" id="d-clearlog">' + svg("trash") +
            "<span>Effacer l'historique</span></button>"
          : "") +
      "</div>" +
        '<div class="panel__body">' +
          (log.length
            ? '<div class="rows">' + log.map((e, i) =>
                '<div class="trow"><div class="trow__main"><b>' + esc(e.pseudo) + "</b>" +
                  '<div class="trow__meta"><i>' +
                    new Date(e.in).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) +
                    " → " + new Date(e.out).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
                    "</i>" + (e.forced ? '<span class="permtag">sorti par un gérant</span>' : "") +
                    (e.corrigePar
                      ? '<span class="permtag" title="Heures rattrapées à la main">horaires corrigés par ' +
                        esc(e.corrigePar) + "</span>"
                      : "") +
                  "</div></div>" +
                  '<span class="trow__price tnum">' + MNDuty.dur(e.seconds) + "</span>" +
                  (canManage
                    ? '<button class="btn btn--icon" data-editlog="' + esc(e.id + "|" + e.in) +
                      '" title="Corriger les heures">' + svg("edit") + "</button>" +
                      '<button class="btn btn--icon" data-rmlog="' + i + '" data-pseudo="' + esc(e.pseudo) +
                      '" title="Retirer cette ligne">' + svg("trash") + "</button>"
                    : "") +
                "</div>"
              ).join("") + "</div>"
            : '<p class="hint">Aucun pointage enregistré.</p>') +
        "</div></div>";
  }

  /** Fait avancer les durées sans tout reconstruire. */
  function refreshDurations() {
    const mine = MNDuty.entryOf(me.uid);
    const el = $("#d-elapsed");
    if (el && mine) el.textContent = MNDuty.sinceDur(mine.since);
    document.querySelectorAll("[data-since]").forEach(n => {
      n.textContent = MNDuty.sinceDur(n.dataset.since);
    });

    /* Mes compteurs avancent aussi tant que je suis en service : les laisser
       figés donnerait l'impression que le service en cours ne compte pas. */
    if (!mine) return;
    const sem = MNDuty.secondsFor(me.uid, MNDuty.weekStart());
    const maj = (cle, txt) => {
      const n = document.querySelector('[data-mien="' + cle + '"]');
      if (n) n.textContent = txt;
    };
    maj("sem", MNDuty.dur(sem, true));
    maj("sept", MNDuty.dur(MNDuty.secondsFor(me.uid, Date.now() - 7 * 86400000), true));
    maj("tot", MNDuty.dur(MNDuty.secondsFor(me.uid), true));
    const g = document.querySelector('[data-mien="jauge"]');
    if (g) g.innerHTML = jauge(sem);
  }

  /* ---- Actions -------------------------------------------------------------- */

  async function toggle() {
    if (busy) return;
    const btn = $("#d-toggle");
    const on = MNDuty.isOn(me.uid);

    if (on) {
      const ok = await MNUI.confirm({
        title: "Quitter le service",
        message: "Ton temps de service sera enregistré et l'équipe prévenue sur Discord.",
        confirmLabel: "Quitter le service"
      });
      if (!ok) return;
    }

    busy = true;
    btn.disabled = true;
    btn.innerHTML = svg("refresh") + "<span>Un instant…</span>";

    try {
      const r = on ? await MNDuty.clockOut(me) : await MNDuty.clockIn(me);
      render();

      if (r.already) { MNUI.toast("C'était déjà le cas", "info"); return; }

      const bits = [];
      bits.push(on ? "Service terminé — " + MNDuty.dur(r.seconds) : "Bon service !");
      if (r.discord && r.discord.skipped) bits.push("webhook Discord non configuré");
      else if (r.discord && !r.discord.ok) bits.push("Discord : " + r.discord.error);
      if (!r.shared && MNDuty.canShare()) bits.push("partage : " + (r.shareError || "échec"));
      MNUI.toast(bits.join(" · "), r.discord && r.discord.ok !== false ? "ok" : "info");
    } catch (e) {
      MNUI.toast("Impossible de pointer : " + e.message, "err");
      render();
    } finally {
      busy = false;
    }
  }

  /* ---- Actions congés --------------------------------------------------------- */

  /**
   * Saisie des dates. `uid` peut être quelqu'un d'autre : dans ce cas Discord
   * précise qui les a posés. `cid` vide = nouvelle période.
   */
  function askLeave(uid, pseudo, roleId, cid) {
    const dejaLa = cid ? MNDuty.congeById(cid) : null;
    const pourMoi = uid === me.uid;
    /* Une nouvelle période démarre au lendemain de la dernière posée : c'est
       presque toujours ce qu'on veut quand on en enchaîne plusieurs. */
    const derniere = MNDuty.congesOf(uid).slice(-1)[0];
    const depart = (!dejaLa && derniere)
      ? new Date(new Date(derniere.to + "T12:00:00").getTime() + 86400000)
      : new Date(Date.now() + 86400000);
    const demain = depart;

    const body = document.createElement("div");
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="cg-from">Premier jour d\'absence</label>' +
          '<input class="input" id="cg-from" type="date" value="' +
            esc(dejaLa ? dejaLa.from : MNDuty.jourLocal(demain)) + '"></div>' +
        '<div class="field"><label class="label" for="cg-to">Dernier jour d\'absence</label>' +
          '<input class="input" id="cg-to" type="date" value="' +
            esc(dejaLa ? dejaLa.to : MNDuty.jourLocal(demain)) + '"></div>' +
      "</div>" +
      '<div class="field"><label class="label" for="cg-note">Motif (facultatif)</label>' +
        '<input class="input" id="cg-note" maxlength="300" placeholder="Vacances, examens, indisponible…" value="' +
          esc(dejaLa ? dejaLa.note : "") + '"></div>' +
      '<p class="hint" id="cg-sum" style="margin-top:10px"></p>';

    const from = body.querySelector("#cg-from");
    const to = body.querySelector("#cg-to");
    const sum = body.querySelector("#cg-sum");

    /* Le récapitulatif sert aussi de garde-fou : on y lit tout de suite qu'une
       date de retour antérieure au départ ne passera pas. */
    const paint = () => {
      if (!from.value || !to.value) { sum.textContent = "Choisis les deux dates."; return; }
      if (from.value > to.value) {
        sum.innerHTML = '<b style="color:var(--rose)">Le retour est avant le départ.</b>';
        return;
      }
      const n = MNDuty.nbJours(from.value, to.value);
      sum.innerHTML = "Absence du <b>" + esc(jourCourt(from.value)) + "</b> au <b>" +
        esc(jourCourt(to.value)) + "</b> — <b>" + n + " jour" + (n > 1 ? "s" : "") + "</b>." +
        (pourMoi ? "" : " Discord précisera que c'est toi qui les as posés.");
    };
    /* Le retour suit le départ quand il devient incohérent. */
    from.addEventListener("change", () => { if (to.value < from.value) to.value = from.value; paint(); });
    to.addEventListener("change", paint);
    paint();

    MNUI.modal({
      title: pourMoi ? (dejaLa ? "Modifier une période" : "Poser des congés")
                     : (dejaLa ? "Modifier les congés de " : "Congés de ") + pseudo,
      body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: async (close, b, btn) => {
            if (!from.value || !to.value) return MNUI.toast("Choisis les deux dates", "err");
            if (from.value > to.value) return MNUI.toast("Le retour est avant le départ", "err");

            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Un instant…</span>";
            const r = await MNDuty.setConge(
              { id: uid, pseudo, roleId: roleId || "" },
              from.value, to.value, body.querySelector("#cg-note").value.trim(),
              pourMoi ? "" : me.pseudo, cid || ""
            );
            if (r.error) {
              btn.disabled = false;
              btn.innerHTML = svg("save") + "<span>Enregistrer</span>";
              return MNUI.toast(r.error, "err");
            }
            close(); render();
            MNUI.toast(leaveToast(dejaLa ? "Congés modifiés" : "Congés enregistrés", r),
              r.discord && r.discord.ok !== false ? "ok" : "info");
          }
        }
      ]
    });
  }

  /** Assemble le retour d'une action de congés en une seule ligne. */
  function leaveToast(tete, r) {
    const bits = [tete];
    if (r.discord && r.discord.skipped) bits.push("webhook Discord non configuré");
    else if (r.discord && !r.discord.ok) bits.push("Discord : " + r.discord.error);
    if (!r.shared && MNDuty.canShare()) bits.push("partage : " + (r.shareError || "échec"));
    return bits.join(" · ");
  }

  async function dropLeave(cid, pseudo) {
    const c = MNDuty.congeById(cid);
    if (!c) return MNUI.toast("Cette période n'existe plus", "info");
    const pourMoi = c.id === me.uid;

    const ok = await MNUI.confirm({
      title: "Annuler cette période",
      message: (pourMoi ? "Tes congés " : "Les congés de « " + pseudo + " » ") +
        esc(periode(c)) + " seront retirés du tableau et l'équipe prévenue sur Discord.",
      confirmLabel: "Annuler la période", danger: true
    });
    if (!ok) return;

    const r = await MNDuty.clearConge(cid, pourMoi ? "" : me.pseudo);
    render();
    MNUI.toast(r.already ? "Cette période n'existait plus" : leaveToast("Congés annulés", r),
      r.already ? "info" : "ok");
  }

  /** Poser des congés pour un employé (gérant). */
  function leaveForSomeone() {
    const gens = MNStore.catalog().users.filter(u => u.active);
    if (!gens.length) return MNUI.toast("Aucun employé actif", "info");

    const body = document.createElement("div");
    body.innerHTML =
      '<div class="field"><label class="label" for="cgk">Employé</label>' +
        '<select class="select" id="cgk">' + gens.map(u => {
          const n = MNDuty.congesOf(u.id).length;
          return '<option value="' + esc(u.id) + '">' + esc(u.pseudo) + " — " +
            esc(MNStore.roleOf(u).name) +
            (n ? " (" + n + " période" + (n > 1 ? "s" : "") + " déjà posée" + (n > 1 ? "s" : "") + ")" : "") +
            "</option>";
        }).join("") + "</select></div>";

    MNUI.modal({
      title: "Poser des congés", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Continuer", variant: "btn--primary",
          onClick: (close) => {
            const u = gens.find(x => x.id === body.querySelector("#cgk").value);
            close();
            if (u) askLeave(u.id, u.pseudo, u.roleId, "");
          }
        }
      ]
    });
  }

  /** Mettre quelqu'un en service à sa place. */
  function punchSomeone() {
    const dispo = MNStore.catalog().users
      .filter(u => u.active && !MNDuty.isOn(u.id));

    if (!dispo.length) return MNUI.toast("Tout le monde est déjà en service", "info");

    const body = document.createElement("div");
    body.innerHTML =
      '<div class="field"><label class="label" for="pk">Employé</label>' +
        '<select class="select" id="pk">' + dispo.map(u =>
          '<option value="' + esc(u.id) + '">' + esc(u.pseudo) + " — " +
          esc(MNStore.roleOf(u).name) + "</option>").join("") + "</select></div>" +
      '<p class="hint" style="margin-top:10px">Le service démarre maintenant, et Discord précisera ' +
        "que c'est toi qui l'as pointé.</p>";

    MNUI.modal({
      title: "Pointer quelqu'un", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Mettre en service", variant: "btn--primary", icon: "login",
          onClick: async (close, b, btn) => {
            const u = dispo.find(x => x.id === body.querySelector("#pk").value);
            if (!u) return;
            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Un instant…</span>";
            const r = await MNDuty.forceIn(u, me.pseudo);
            close(); render();
            MNUI.toast(r.already ? "Déjà en service" : u.pseudo + " est en service", "ok");
          }
        }
      ]
    });
  }

  async function clearLog() {
    const n = MNDuty.board().log.length;
    const ok = await MNUI.confirm({
      title: "Effacer l'historique",
      message: "Les " + n + " pointage" + (n > 1 ? "s" : "") + " terminé" + (n > 1 ? "s" : "") +
        " seront supprimés pour toute l'équipe. Les personnes actuellement en service ne sont pas touchées.",
      confirmLabel: "Tout effacer", danger: true
    });
    if (!ok) return;
    const r = await MNDuty.clearLog(me.pseudo);
    render();
    MNUI.toast(r.removed + " pointage(s) effacé(s)", "ok");
  }

  async function removeLog(index, pseudo) {
    const ok = await MNUI.confirm({
      title: "Retirer ce pointage",
      message: "La ligne de « " + pseudo + " » sera supprimée de l'historique.",
      confirmLabel: "Retirer", danger: true
    });
    if (!ok) return;
    await MNDuty.removeLog(index, me.pseudo);
    render();
    MNUI.toast("Pointage retiré", "ok");
  }

  /* ---- Correction des horaires -----------------------------------------------
     Le cas courant : quelqu'un est parti sans dépointer. Clôturer « maintenant »
     lui compterait la nuit entière, alors on laisse choisir l'heure réelle. */

  /** ISO → valeur d'un champ `datetime-local`, en heure locale. */
  function versChamp(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /** Valeur d'un champ `datetime-local` → ISO, ou "" si elle ne veut rien dire. */
  function depuisChamp(v) {
    const d = new Date(v);
    return isNaN(d) ? "" : d.toISOString();
  }

  const champHeure = (id, label, valeur, max) =>
    '<div class="field"><label class="label" for="' + id + '">' + label + "</label>" +
      '<input class="input" type="datetime-local" id="' + id + '" value="' + esc(valeur) +
      '" max="' + esc(max) + '"></div>';

  /**
   * Affiche la durée qui résultera des heures saisies, et signale ce qui ne
   * tient pas debout avant l'envoi plutôt qu'après.
   * @returns {string} l'erreur, ou "" si tout va bien
   */
  function apercuDuree(body, debutId, finId) {
    const d = depuisChamp(body.querySelector("#" + debutId).value);
    const f = depuisChamp(body.querySelector("#" + finId).value);
    const zone = body.querySelector("#dd-apercu");
    let souci = "";

    if (!d || !f) souci = "Renseigne les deux heures.";
    else if (f < d) souci = "La fin précède le début.";
    else if (f > new Date().toISOString()) souci = "On ne pointe pas dans le futur.";

    zone.className = souci ? "alert alert--warn" : "hint";
    zone.innerHTML = souci
      ? svg("alert") + "<span>" + esc(souci) + "</span>"
      : "Durée enregistrée : <b>" + MNDuty.dur(MNDuty.secBetween(d, f)) + "</b>";
    return souci;
  }

  function brancherApercu(body, debutId, finId) {
    const maj = () => apercuDuree(body, debutId, finId);
    [debutId, finId].forEach(x => {
      const n = body.querySelector("#" + x);
      if (n) n.addEventListener("input", maj);
    });
    maj();
  }

  /** Clôturer le service de quelqu'un, à l'heure qu'il a réellement quittée. */
  function kick(uid, pseudo) {
    const e = MNDuty.entryOf(uid);
    if (!e) return MNUI.toast("Cette personne n'est plus en service", "info");

    const maintenant = versChamp(new Date().toISOString());
    const body = document.createElement("div");
    body.innerHTML =
      '<p class="hint" style="margin-bottom:14px">Le service de <b>' + esc(pseudo) +
        "</b> a commencé le " +
        new Date(e.since).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) +
        ". S'il a oublié de dépointer, mets l'heure à laquelle il est vraiment parti.</p>" +
      champHeure("dd-fin", "Fin du service", maintenant, maintenant) +
      '<p class="hint" id="dd-apercu" style="margin-top:12px"></p>';

    MNUI.modal({
      title: "Mettre fin au service", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Clôturer", variant: "btn--danger", icon: "logout",
          onClick: async (close, b, btn) => {
            const fin = depuisChamp(body.querySelector("#dd-fin").value);
            if (!fin) return MNUI.toast("Heure de fin illisible", "err");
            if (fin < e.since) return MNUI.toast("La fin précède le début du service", "err");
            if (fin > new Date().toISOString()) return MNUI.toast("On ne pointe pas dans le futur", "err");

            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Un instant…</span>";
            const r = await MNDuty.forceOut(uid, me.pseudo, fin);
            close(); render();
            if (r.ignore) {
              return MNUI.toast("Service clôturé, mais à l'heure actuelle : ton serveur est trop " +
                "ancien pour choisir l'heure. Corrige la ligne dans l'historique.", "err");
            }
            MNUI.toast(r.already ? "Cette personne n'était plus en service"
              : "Service de " + pseudo + " clôturé (" + MNDuty.dur(r.seconds) + ")", "ok");
          }
        }
      ]
    });

    /* Une seule heure à saisir : le début est déjà connu, l'aperçu s'appuie
       dessus pour montrer la durée qui sera comptée. */
    const zone = body.querySelector("#dd-apercu");
    const apercu = () => {
      const fin = depuisChamp(body.querySelector("#dd-fin").value);
      const souci = !fin ? "Heure illisible."
        : fin < e.since ? "La fin précède le début du service."
        : fin > new Date().toISOString() ? "On ne pointe pas dans le futur." : "";
      zone.className = souci ? "alert alert--warn" : "hint";
      zone.innerHTML = souci
        ? svg("alert") + "<span>" + esc(souci) + "</span>"
        : "Durée enregistrée : <b>" + MNDuty.dur(MNDuty.secBetween(e.since, fin)) + "</b>";
    };
    body.querySelector("#dd-fin").addEventListener("input", apercu);
    apercu();
  }

  /** Corriger les heures d'un pointage déjà dans l'historique. */
  function editLog(e) {
    const maintenant = versChamp(new Date().toISOString());
    const body = document.createElement("div");
    body.innerHTML =
      '<p class="hint" style="margin-bottom:14px">Pointage de <b>' + esc(e.pseudo) +
        "</b>, actuellement compté <b>" + MNDuty.dur(e.seconds) + "</b>.</p>" +
      champHeure("dd-deb", "Arrivée", versChamp(e.in), maintenant) +
      champHeure("dd-fin", "Départ", versChamp(e.out), maintenant) +
      '<p class="hint" id="dd-apercu" style="margin-top:12px"></p>' +
      '<p class="hint" style="margin-top:10px">La correction est visible de tous : ' +
        "la ligne portera ton nom.</p>";

    MNUI.modal({
      title: "Corriger les heures", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: async (close, b, btn) => {
            const souci = apercuDuree(body, "dd-deb", "dd-fin");
            if (souci) return MNUI.toast(souci, "err");

            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Un instant…</span>";
            const r = await MNDuty.editLog(e,
              depuisChamp(body.querySelector("#dd-deb").value),
              depuisChamp(body.querySelector("#dd-fin").value),
              me.pseudo);

            if (!r.ok) {
              btn.disabled = false;
              btn.innerHTML = svg("save") + "<span>Enregistrer</span>";
              return MNUI.toast(r.error || "Correction impossible", "err");
            }
            close(); render();
            MNUI.toast("Horaires corrigés (" + MNDuty.dur(r.seconds) + ")", "ok");
          }
        }
      ]
    });

    brancherApercu(body, "dd-deb", "dd-fin");
  }
})();
