/* ==========================================================================
   Page Équipe : la liste du personnel à gauche, la fiche à droite.
   Ancienneté, formations, carrière — et les montées de grade en deux clics.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;

  let draft = null;
  let me = null;
  let sel = null;
  let filter = "";
  let canEdit = false;
  let showHidden = false;

  MNUI.start({ page: "equipe", title: "Équipe", onReady: init });

  async function init(session) {
    me = session;
    if (!MNAuth.canAny("staff", "promote", "users")) return denied();

    canEdit = MNAuth.canAny("promote", "users");
    draft = MNStore.clone(MNStore.catalog());
    const first = visibleUsers()[0];
    sel = first ? first.id : null;

    await MNDuty.load(false).catch(() => {});
    render();
  }

  function denied() {
    $("#staff-root").innerHTML =
      '<div class="denied"><div class="denied__in">' + svg("lock") +
        "<h2>Accès refusé</h2><p>Ton rôle (" + esc(me.role) + ") ne donne pas accès aux fiches " +
        "de l'équipe. Demande la permission « Voir les fiches » à un responsable.</p>" +
        '<a class="btn btn--primary" href="index.html">Retour à la facturation</a>' +
      "</div></div>";
  }

  /* ---- Enregistrement --------------------------------------------------------- */

  function commit() {
    draft = MNStore.saveDraft(draft);
    MNAuth.refresh();
    render();
  }

  function renderDraftbar() {
    const bar = $("#draftbar");
    if (!MNStore.hasDraft()) { bar.hidden = true; return; }
    bar.hidden = false;

    const canPub = MNAuth.can("publish") && MNGitHub.hasToken() && MNGitHub.isConfigured();
    bar.innerHTML =
      '<span class="draftbar__dot"></span>' +
      '<div class="draftbar__txt"><b>Modifications non publiées.</b> ' +
        "<span>" + (canPub
          ? "Clique sur Publier pour que l'équipe les voie."
          : "Un responsable devra les publier depuis le panneau admin.") + "</span></div>" +
      (canPub ? '<button class="btn btn--solid btn--sm" id="sb-pub">' + svg("cloud") +
        "<span>Publier</span></button>" : "");

    const b = $("#sb-pub");
    if (b) b.addEventListener("click", async () => {
      b.disabled = true;
      b.innerHTML = svg("refresh") + "<span>Publication…</span>";
      try {
        await MNGitHub.publish(MNStore.toJSON(draft), "Fiches équipe mises à jour par " + me.pseudo);
        localStorage.setItem("mn.gh.stamp", draft.updatedAt);
        MNUI.toast("Publié — en ligne dans ~1 minute", "ok");
      } catch (e) {
        MNUI.toast("Publication impossible : " + e.message, "err");
      }
      render();
    });
  }

  /* ---- Rendu ------------------------------------------------------------------ */

  function render() {
    renderDraftbar();
    $("#staff-root").innerHTML =
      '<div class="wrap admin">' +
        '<nav class="stafflist" id="staff-nav"></nav>' +
        '<div class="pane" id="staff-pane"></div>' +
      "</div>";
    renderList();
    renderCard();
  }

  const roleOf = u => draft.roles.find(r => r.id === u.roleId) ||
    { id: "", name: "Sans rôle", color: "#6a6280", perms: [] };

  /** Les personnes masquées ne sortent que si un responsable le demande. */
  const visibleUsers = () =>
    draft.users.filter(u => !u.hidden || (canEdit && showHidden));

  const hiddenCount = () => draft.users.filter(u => u.hidden).length;

  function renderList() {
    const nav = $("#staff-nav");
    const f = filter.toLowerCase();
    const list = visibleUsers().filter(u =>
      !f || u.pseudo.toLowerCase().indexOf(f) !== -1 || roleOf(u).name.toLowerCase().indexOf(f) !== -1);
    const nHidden = hiddenCount();

    nav.innerHTML =
      '<div class="stafflist__top">' +
        '<input class="input" id="s-find" placeholder="Chercher…" value="' + esc(filter) + '">' +
        (canEdit ? '<button class="btn btn--primary btn--sm btn--block" id="s-add" style="margin-top:8px">' +
          svg("plus") + "<span>Nouvel employé</span></button>" : "") +
      "</div>" +
      '<div class="stafflist__body">' +
        (list.length ? list.map(u => {
          const r = roleOf(u);
          const on = MNDuty.isOn(u.id);
          return '<button class="staffrow' + (u.id === sel ? " is-active" : "") +
            (u.active ? "" : " is-off") + (u.hidden ? " is-hidden" : "") +
            '" data-u="' + esc(u.id) + '">' +
            '<span class="userchip__av" style="width:34px;height:34px;flex:none;background:' +
              esc(r.color) + '">' + esc(MNUI.initials(u.pseudo)) + "</span>" +
            '<span class="staffrow__txt"><b>' + esc(u.pseudo) + "</b>" +
              '<i style="color:' + esc(r.color) + '">' + esc(r.name) + "</i></span>" +
            (u.hidden ? '<span class="staffrow__eye" title="Masqué de l\'équipe">' + svg("lock") + "</span>" : "") +
            (on ? '<span class="dutydot" title="En service"></span>' : "") +
          "</button>";
        }).join("") : '<p class="hint" style="padding:12px">Personne ne correspond.</p>') +
      "</div>" +
      '<div class="stafflist__foot">' +
        '<span class="hint">' + list.length + " affiché" + (list.length > 1 ? "s" : "") + "</span>" +
        (canEdit && nHidden
          ? '<button class="btn btn--ghost btn--sm" id="s-hidden">' +
            svg(showHidden ? "check" : "lock") + "<span>" + nHidden + " masqué" +
            (nHidden > 1 ? "s" : "") + "</span></button>"
          : "") +
      "</div>";

    const hb = $("#s-hidden");
    if (hb) hb.addEventListener("click", () => {
      showHidden = !showHidden;
      if (!showHidden) {
        const u = draft.users.find(x => x.id === sel);
        if (u && u.hidden) { const v = visibleUsers()[0]; sel = v ? v.id : null; }
      }
      renderList(); renderCard();
    });

    const find = $("#s-find");
    find.addEventListener("input", () => {
      filter = find.value;
      const pos = find.selectionStart;
      renderList();
      const n = $("#s-find"); n.focus(); n.setSelectionRange(pos, pos);
    });

    const add = $("#s-add");
    if (add) add.addEventListener("click", newUser);

    nav.querySelectorAll("[data-u]").forEach(b => b.addEventListener("click", () => {
      sel = b.dataset.u;
      renderList();
      renderCard();
    }));
  }

  /* ---- Fiche ------------------------------------------------------------------ */

  function renderCard() {
    const pane = $("#staff-pane");
    const u = draft.users.find(x => x.id === sel);
    if (!u) {
      pane.innerHTML = '<div class="empty">' + svg("users") + "<b>Aucun employé sélectionné</b></div>";
      return;
    }
    const r = roleOf(u);
    const on = MNDuty.isOn(u.id);
    const hist = (u.history || []).slice().reverse();

    pane.innerHTML =
      '<div class="panel">' +
        '<div class="staffhead" style="--role:' + esc(r.color) + '">' +
          '<div class="staffhead__av" style="background:' + esc(r.color) + '">' +
            esc(MNUI.initials(u.pseudo)) + "</div>" +
          '<div class="staffhead__id">' +
            "<h2>" + esc(u.pseudo) +
              (u.active ? "" : ' <span class="pill pill--dim">désactivé</span>') +
              (u.hidden ? ' <span class="pill pill--warn">masqué</span>' : "") + "</h2>" +
            '<span class="rolechip rolechip--ico" style="color:' + esc(r.color) + '">' +
              mnIcon(r.icon) + esc(r.name) + "</span>" +
            (on ? '<span class="pill pill--ok">en service</span>' : "") +
            (u.pin ? '<span class="pill pill--dim">' + svg("lock", "inline-lock") + " code</span>" : "") +
          "</div>" +
          (canEdit
            ? '<div class="staffhead__acts">' +
                '<button class="btn btn--primary" id="c-promote">' + svg("tag") + "<span>Changer de grade</span></button>" +
                '<button class="btn btn--ghost" id="c-edit">' + svg("edit") + "<span>Modifier la fiche</span></button>" +
              "</div>"
            : "") +
        "</div>" +

        '<div class="panel__body">' +
          '<div class="statgrid">' +
            stat("Ancienneté", seniority(u.hiredAt)) +
            stat("Service cette semaine", MNDuty.human(MNDuty.minutesFor(u.id, MNDuty.weekStart())), on) +
            stat("Service au total", MNDuty.human(MNDuty.minutesFor(u.id)), on) +
            stat("Formations", String((u.trainings || []).length)) +
          "</div>" +

          '<h3 class="section-title" style="margin-top:24px">Formations' +
            '<span class="count">' + (u.trainings || []).length + "</span></h3>" +
          ((u.trainings || []).length
            ? '<div class="permtags">' + u.trainings.map(t =>
                '<span class="permtag">' + esc(t) + "</span>").join("") + "</div>"
            : '<p class="hint">Aucune formation enregistrée.</p>') +

          (u.note
            ? '<h3 class="section-title" style="margin-top:24px">Note</h3>' +
              '<p class="hint" style="white-space:pre-wrap">' + esc(u.note) + "</p>"
            : "") +

          serviceSection(u, on) +

          '<h3 class="section-title" style="margin-top:24px">Carrière' +
            '<span class="count">' + hist.length + "</span></h3>" +
          '<ol class="timeline">' + hist.map((h, i) => {
            const hr = draft.roles.find(x => x.id === h.roleId);
            const color = hr ? hr.color : "#6a6280";
            return '<li class="tl' + (i === 0 ? " is-now" : "") + '" style="--role:' + esc(color) + '">' +
              '<div class="tl__dot"></div>' +
              '<div class="tl__body">' +
                "<b>" + esc(h.roleName || h.roleId) + "</b>" +
                (i === 0 ? ' <span class="pill pill--outline">actuel</span>' : "") +
                '<div class="tl__meta">' + fdatetime(h.at) +
                  (h.by ? " · par " + esc(h.by) : "") +
                  (h.note ? " · " + esc(h.note) : "") + "</div>" +
              "</div></li>";
          }).join("") + "</ol>" +
        "</div>" +
      "</div>";

    const p = $("#c-promote"); if (p) p.addEventListener("click", () => promote(u));
    const e = $("#c-edit"); if (e) e.addEventListener("click", () => editCard(u));
  }

  /** Historique complet des services de la personne. */
  function serviceSection(u, on) {
    const log = MNDuty.logOf(u.id);
    const shown = log.slice(0, 40);

    return '<h3 class="section-title" style="margin-top:24px">Historique de service' +
        '<span class="count">' + log.length + "</span></h3>" +
      (on
        ? '<div class="alert alert--ok" style="margin-bottom:10px">' + svg("check") +
          "<span><b>En service actuellement</b> depuis " +
          new Date(MNDuty.entryOf(u.id).since).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
          " — " + MNDuty.sinceHuman(MNDuty.entryOf(u.id).since) + ".</span></div>"
        : "") +
      (shown.length
        ? '<div class="rows">' + shown.map(e =>
            '<div class="trow"><div class="trow__main">' +
              "<b>" + new Date(e.in).toLocaleDateString("fr-FR",
                { weekday: "long", day: "2-digit", month: "long" }) + "</b>" +
              '<div class="trow__meta"><i>' +
                new Date(e.in).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
                " → " + new Date(e.out).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
                "</i>" + (e.forced ? '<span class="permtag">clôturé par un gérant</span>' : "") +
              "</div></div>" +
              '<span class="trow__price tnum">' + MNDuty.human(e.minutes) + "</span></div>"
          ).join("") + "</div>" +
          (log.length > shown.length
            ? '<p class="hint" style="margin-top:8px">' + (log.length - shown.length) +
              " service(s) plus ancien(s) non affiché(s).</p>"
            : "")
        : '<p class="hint">Aucun service terminé enregistré' +
          (MNDuty.canShare() ? "" : " (le tableau partagé n'est pas accessible depuis cet appareil)") + ".</p>");
  }

  const stat = (label, value, live) =>
    '<div class="stat' + (live ? " stat--live" : "") + '">' +
      '<span class="stat__l">' + esc(label) + "</span>" +
      '<b class="stat__v">' + esc(value) + "</b>" +
    "</div>";

  const fdatetime = d => {
    const x = new Date(d);
    return isNaN(x) ? "—" : x.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  function seniority(hiredAt) {
    if (!hiredAt) return "—";
    const days = Math.floor((Date.now() - new Date(hiredAt + "T12:00:00")) / 86400000);
    if (isNaN(days) || days < 0) return "—";
    if (days < 1) return "aujourd'hui";
    if (days < 31) return days + " jour" + (days > 1 ? "s" : "");
    const months = Math.floor(days / 30.44);
    if (months < 12) return months + " mois";
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return years + " an" + (years > 1 ? "s" : "") + (rest ? " " + rest + " mois" : "");
  }

  /* ---- Montée de grade --------------------------------------------------------- */

  function promote(u) {
    const cur = roleOf(u);
    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<p class="hint">Grade actuel : <span class="rolechip" style="color:' + esc(cur.color) + '">' +
        esc(cur.name) + "</span></p>" +
      '<div class="field"><label class="label" for="p-role">Nouveau grade</label>' +
        '<select class="select" id="p-role">' + draft.roles.map(r =>
          '<option value="' + esc(r.id) + '"' + (r.id === u.roleId ? " selected" : "") + ">" +
          esc(r.name) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label class="label" for="p-note">Motif (facultatif)</label>' +
        '<input class="input" id="p-note" maxlength="80" placeholder="Ex. promotion après formation remorquage"></div>' +
      '<p class="hint">La date est enregistrée automatiquement, et l\'ancien grade reste dans la carrière.</p>';

    MNUI.modal({
      title: "Changer le grade de " + u.pseudo, body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Valider la montée", variant: "btn--primary", icon: "tag",
          onClick: close => {
            const roleId = body.querySelector("#p-role").value;
            if (roleId === u.roleId) return MNUI.toast("C'est déjà son grade actuel", "info");

            /* On ne se retire pas soi-même la gestion de l'équipe. */
            if (u.id === me.uid) {
              const p = (draft.roles.find(x => x.id === roleId) || {}).perms || [];
              if (p.indexOf("admin") === -1 && p.indexOf("users") === -1 && p.indexOf("promote") === -1) {
                return MNUI.toast("Ce grade te retirerait la gestion de l'équipe", "err");
              }
            }
            const to = draft.roles.find(x => x.id === roleId);
            MNStore.recordPromotion(u, roleId, draft.roles, me.pseudo, body.querySelector("#p-note").value.trim());
            commit();
            close();
            MNUI.toast(u.pseudo + " passe " + (to ? to.name : roleId), "ok");
          }
        }
      ]
    });
  }

  /* ---- Modification de la fiche -------------------------------------------------- */

  function editCard(u) {
    let trainings = (u.trainings || []).slice();

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="f-pseudo">Pseudo</label>' +
          '<input class="input" id="f-pseudo" maxlength="40" value="' + esc(u.pseudo) + '"></div>' +
        '<div class="field"><label class="label" for="f-hired">Date de recrutement</label>' +
          '<input class="input" id="f-hired" type="date" value="' + esc(u.hiredAt || "") + '"></div>' +
      "</div>" +
      '<div class="fieldset"><span class="label">Formations</span>' +
        '<div class="permtags" id="f-tags" style="margin-bottom:10px"></div>' +
        '<div class="row">' +
          '<input class="input" id="f-new" placeholder="Ex. Remorquage" maxlength="40">' +
          '<button class="btn btn--ghost btn--sm" id="f-add" type="button">' + svg("plus") + "<span>Ajouter</span></button>" +
        "</div></div>" +
      '<div class="field"><label class="label" for="f-note">Note interne</label>' +
        '<textarea class="textarea" id="f-note" maxlength="400" placeholder="Remarques, disponibilités…">' +
          esc(u.note || "") + "</textarea></div>" +
      '<label class="switch"><input type="checkbox" id="f-active"' + (u.active ? " checked" : "") +
        (u.id === me.uid ? " disabled" : "") + '><span class="switch__box"></span><span>Compte actif</span></label>' +
      '<label class="switch"><input type="checkbox" id="f-hidden"' + (u.hidden ? " checked" : "") + ">" +
        '<span class="switch__box"></span><span>Masquer de l\'onglet Équipe</span></label>' +
      '<p class="hint">Masqué, l\'employé n\'apparaît plus dans la liste de gauche, mais son compte ' +
        "reste pleinement fonctionnel : il se connecte, fait ses BT et pointe son service normalement. " +
        "Les responsables peuvent le réafficher avec le bouton en bas de la liste.</p>";

    const tagsHost = body.querySelector("#f-tags");
    function paintTags() {
      tagsHost.innerHTML = trainings.length
        ? trainings.map((t, i) =>
            '<span class="permtag">' + esc(t) +
            ' <button type="button" data-rm="' + i + '" aria-label="Retirer">×</button></span>').join("")
        : '<span class="permtag permtag--none">aucune</span>';
      tagsHost.querySelectorAll("[data-rm]").forEach(b =>
        b.addEventListener("click", () => { trainings.splice(Number(b.dataset.rm), 1); paintTags(); }));
    }
    paintTags();

    const addTag = () => {
      const f = body.querySelector("#f-new");
      const v = f.value.trim();
      if (!v) return;
      if (trainings.some(t => t.toLowerCase() === v.toLowerCase())) return MNUI.toast("Déjà présente", "info");
      trainings.push(v); f.value = ""; paintTags(); f.focus();
    };
    body.querySelector("#f-add").addEventListener("click", addTag);
    body.querySelector("#f-new").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); addTag(); }
    });

    MNUI.modal({
      title: "Fiche de " + u.pseudo, body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: close => {
            const pseudo = body.querySelector("#f-pseudo").value.trim();
            if (pseudo.length < 2) return MNUI.toast("Pseudo trop court", "err");
            if (draft.users.some(x => x.id !== u.id && x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return MNUI.toast("Ce pseudo est déjà pris", "err");
            }
            u.pseudo = pseudo;
            u.hiredAt = body.querySelector("#f-hired").value || u.hiredAt;
            u.trainings = trainings;
            u.note = body.querySelector("#f-note").value.trim();
            u.active = u.id === me.uid ? true : body.querySelector("#f-active").checked;
            u.hidden = body.querySelector("#f-hidden").checked;

            /* On garde la personne à l'écran même si elle vient d'être masquée. */
            if (u.hidden && !showHidden && canEdit) showHidden = true;
            commit(); close();
            MNUI.toast("Fiche mise à jour", "ok");
          }
        }
      ]
    });
  }

  /* ---- Nouvel employé ------------------------------------------------------------ */

  function newUser() {
    const weakest = draft.roles.slice().sort((a, b) => {
      const w = r => (r.perms.indexOf("admin") !== -1 ? 99 : r.perms.length);
      return w(a) - w(b);
    })[0];

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="n-pseudo">Pseudo (sert à se connecter)</label>' +
          '<input class="input" id="n-pseudo" maxlength="40" placeholder="Ex. Rico Martin"></div>' +
        '<div class="field"><label class="label" for="n-role">Grade d\'entrée</label>' +
          '<select class="select" id="n-role">' + draft.roles.map(r =>
            '<option value="' + esc(r.id) + '"' + (r.id === weakest.id ? " selected" : "") + ">" +
            esc(r.name) + "</option>").join("") + "</select></div>" +
        '<div class="field"><label class="label" for="n-hired">Date de recrutement</label>' +
          '<input class="input" id="n-hired" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
        '<div class="field"><label class="label" for="n-pin">Code d\'accès (facultatif)</label>' +
          '<input class="input" id="n-pin" type="password" inputmode="numeric" maxlength="24"></div>' +
      "</div>";

    MNUI.modal({
      title: "Nouvel employé", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Recruter", variant: "btn--primary", icon: "plus",
          onClick: close => {
            const pseudo = body.querySelector("#n-pseudo").value.trim();
            if (pseudo.length < 2) return MNUI.toast("Pseudo trop court", "err");
            if (draft.users.some(x => x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return MNUI.toast("Ce pseudo est déjà pris", "err");
            }
            const id = MNStore.uniqueId(pseudo, draft.users.map(x => x.id));
            const roleId = body.querySelector("#n-role").value;
            const pin = body.querySelector("#n-pin").value.trim();
            const r = draft.roles.find(x => x.id === roleId);
            const hiredAt = body.querySelector("#n-hired").value || new Date().toISOString().slice(0, 10);

            draft.users.push({
              id, pseudo, roleId, active: true,
              pin: pin ? MNAuth.hashPin(id, pin) : null,
              createdAt: new Date().toISOString(),
              hiredAt,
              trainings: [],
              note: "",
              history: [{
                roleId, roleName: r ? r.name : roleId,
                at: new Date(hiredAt + "T12:00:00").toISOString(),
                by: me.pseudo, note: "Entrée dans l'entreprise"
              }]
            });
            sel = id;
            commit(); close();
            MNUI.toast(pseudo + " a rejoint l'équipe", "ok");
          }
        }
      ]
    });
  }
})();
