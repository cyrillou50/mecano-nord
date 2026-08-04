/* ==========================================================================
   Page Service : pointer son service, et pour les gérants voir qui est là.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;

  const RAFRAICHIR = 5 * 60 * 1000;

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

    /* Le tableau, lui, est relu toutes les 5 minutes : c'est ce qui fait
       apparaître les pointages et les congés posés depuis un autre poste. */
    if (stopRefresh) stopRefresh();
    stopRefresh = MNUI.autoRefresh(rafraichir, RAFRAICHIR);
  }

  /**
   * Relit le tableau partagé et redessine. On s'abstient pendant une action ou
   * une fenêtre ouverte : redessiner sous les doigts de quelqu'un est pire que
   * d'attendre le cycle suivant.
   */
  async function rafraichir() {
    if (busy || document.querySelector(".modal-back")) return;
    await MNDuty.load(true);
    render();
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

      (canPoint ? myCard(mine) + myLeaveCard() : "") +
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

  /**
   * Mes périodes. Elles sont listées ici et pas seulement dans le panneau
   * d'équipe : un employé sans droit de regard sur l'équipe doit quand même
   * pouvoir gérer les siennes.
   */
  function myLeaveCard() {
    const list = MNDuty.congesOf(me.uid);
    const now = MNDuty.enConge(me.uid);

    return '<div class="panel" style="margin-bottom:18px">' +
      '<div class="panel__head"><h2>Mes congés</h2>' +
        (now ? '<span class="permtag permtag--on">en congés</span>' : "") +
        (list.length ? '<span class="pill pill--ok">' + list.length + "</span>" : "") +
        '<span class="spacer"></span>' +
        '<button class="btn btn--solid btn--sm" id="d-conge">' + svg("calendar") +
          "<span>" + (list.length ? "Ajouter une période" : "Poser des congés") + "</span></button>" +
      "</div>" +
      '<div class="panel__body">' +
        (list.length
          ? '<div class="rows">' + list.map(myLeaveRow).join("") + "</div>"
          : '<p class="hint">Aucune absence prévue. Préviens l\'équipe de tes dates, ' +
            "elles partent sur Discord.</p>") +
      "</div></div>";
  }

  function myLeaveRow(c) {
    const now = MNDuty.enConge(me.uid, MNDuty.jourLocal()) &&
      c.from <= MNDuty.jourLocal() && MNDuty.jourLocal() <= c.to;
    return '<div class="trow">' +
      '<div class="trow__main"><b>' + esc(periode(c)) + "</b>" +
        '<div class="trow__meta">' +
          (now ? '<span class="permtag permtag--on">en cours</span>' : "<em>à venir</em>") +
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
    const list = MNDuty.conges();
    return '<div class="panel" style="margin-bottom:18px">' +
      '<div class="panel__head"><h2>Congés</h2>' +
        '<span class="pill' + (list.length ? " pill--ok" : "") + '">' + list.length + "</span>" +
        '<span class="spacer"></span>' +
        (canManage
          ? '<button class="btn btn--ghost btn--sm" id="d-conge-other">' + svg("calendar") +
            "<span>Poser pour quelqu'un</span></button>"
          : "") +
      "</div>" +
      '<div class="panel__body">' +
        (list.length
          ? '<div class="rows">' + list.map(c => leaveRow(c, canManage)).join("") + "</div>"
          : '<div class="empty">' + svg("calendar") + "<b>Personne en congés</b>" +
            "<p>Aucune absence prévue pour le moment.</p></div>") +
      "</div></div>";
  }

  function leaveRow(c, canManage) {
    const role = MNStore.roleById(c.roleId);
    const now = MNDuty.enConge(c.id);
    return '<div class="trow">' +
      '<div class="userchip__av" style="width:38px;height:38px;flex:none' +
        (role ? ";background:" + esc(role.color) : "") + '">' + esc(MNUI.initials(c.pseudo)) + "</div>" +
      '<div class="trow__main"><b>' + esc(c.pseudo) + "</b>" +
        '<div class="trow__meta">' +
          (now ? '<span class="permtag permtag--on">en congés</span>' : "<em>à venir</em>") +
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
                  "</div></div>" +
                  '<span class="trow__price tnum">' + MNDuty.dur(e.seconds) + "</span>" +
                  (canManage
                    ? '<button class="btn btn--icon" data-rmlog="' + i + '" data-pseudo="' + esc(e.pseudo) +
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

  async function kick(uid, pseudo) {
    const ok = await MNUI.confirm({
      title: "Mettre fin au service",
      message: "Le service de « " + pseudo + " » sera clôturé maintenant et enregistré à son nom.",
      confirmLabel: "Clôturer", danger: true
    });
    if (!ok) return;
    const r = await MNDuty.forceOut(uid, me.pseudo);
    render();
    MNUI.toast(r.already ? "Cette personne n'était plus en service"
      : "Service de " + pseudo + " clôturé (" + MNDuty.dur(r.seconds) + ")", "ok");
  }
})();
