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
  let canSeeNotes = false;
  let canWarn = false;
  let showHidden = false;
  let vueArchives = false;      /* la liste montre-t-elle les partis ? */
  let tranche = null;           /* tranche du répertoire, en archives */
  let reorder = false;
  let ticker = null;

  /* Les fiches changent moins vite que le tableau de service : on relit un
     peu moins souvent que la page Service. */
  const RYTHME = { vif: 20000, calme: 90000 };

  MNUI.start({ page: "equipe", title: "Équipe", onReady: init });

  /* La page est ouverte à toute l'équipe : chacun peut consulter les fiches.
     Seuls les responsables peuvent modifier quoi que ce soit. */
  async function init(session) {
    me = session;
    canEdit = MNAuth.canAny("promote", "users");
    canSeeNotes = MNAuth.canAny("staff", "promote", "users");
    canWarn = MNAuth.canAny("warn", "admin");
    draft = MNStore.clone(MNStore.catalog());
    const first = visibleUsers()[0];
    sel = first ? first.id : null;

    await MNDuty.load(false).catch(() => {});
    render();

    /* Les compteurs de service de la personne en cours avancent à la seconde. */
    clearInterval(ticker);
    ticker = setInterval(tick, 1000);

    /* Et on relit le tableau partagé en continu : les heures de service
       affichées ici en viennent. */
    MNUI.autoRefresh(async () => {
      /* Jamais en pleine réorganisation ou fenêtre ouverte : on écraserait
         un travail en cours. */
      if (reorder || document.querySelector(".modal-back")) return;
      /* Le jour compte autant que le tableau : un congé qui commence demain
         ne fait bouger aucune donnée, seulement la date. */
      const avant = MNDuty.board().updatedAt + "|" + MNDuty.jourLocal();
      await MNDuty.load(true);
      if (MNDuty.board().updatedAt + "|" + MNDuty.jourLocal() !== avant) render();
    }, RYTHME);
  }

  function tick() {
    const u = draft && draft.users.find(x => x.id === sel);
    if (!u || !MNDuty.isOn(u.id)) return;

    const w = document.querySelector('[data-live="week"]');
    const t = document.querySelector('[data-live="total"]');
    if (w) w.textContent = MNDuty.dur(MNDuty.secondsFor(u.id, MNDuty.weekStart()));
    if (t) t.textContent = MNDuty.dur(MNDuty.secondsFor(u.id));

    const live = document.querySelector("[data-since-live]");
    if (live) live.textContent = MNDuty.sinceDur(live.dataset.sinceLive);
  }

  /* ---- Enregistrement -----------------------------------------------------------
     Deux chemins, et l'appelant n'a pas à savoir lequel a servi.

     Quand le serveur tient le catalogue, l'opération part chez lui : le geste
     est visible par toute l'équipe aussitôt, sans publication, et deux
     responsables qui modifient en même temps ne s'écrasent plus.

     Sinon — pas de serveur, version trop ancienne, ou brouillon déjà en
     attente — on écrit dans le brouillon comme avant, et ça partira à la
     prochaine publication. */

  function commit() {
    draft = MNStore.saveDraft(draft);
    MNAuth.refresh();
    render();
  }

  /**
   * Applique un geste de fiche par le serveur si possible, sinon localement.
   * @param {object} op        l'opération pour le serveur
   * @param {Function} aLaMain ce qu'il faut faire au brouillon à défaut
   * @returns {Promise<{ok:boolean, parServeur:boolean, error?:string}>}
   */
  async function appliquer(op, aLaMain) {
    const r = await MNEquipe.envoyer(op);

    if (r && r.ok) {
      /* Le serveur a rendu le catalogue à jour : on repart de lui. */
      draft = MNStore.clone(MNStore.catalog());
      MNAuth.refresh();
      render();
      return { ok: true, parServeur: true };
    }
    if (r && !r.ok) return { ok: false, parServeur: true, error: r.error };

    aLaMain();
    commit();
    return { ok: true, parServeur: false };
  }

  /** « … et l'équipe le voit » ou « … pense à publier », selon le chemin. */
  const suite = r => r.parServeur ? "" : " — pense à publier";

  function renderDraftbar() {
    const bar = $("#draftbar");
    if (!MNStore.hasDraft()) { bar.hidden = true; return; }
    bar.hidden = false;

    const canPub = MNAuth.can("publish") && MNGitHub.canPublish();
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
        const info = await MNGitHub.publish(MNStore.toJSON(draft),
          "Fiches équipe mises à jour par " + me.pseudo);
        localStorage.setItem("mn.gh.stamp", draft.updatedAt);
        MNUI.toast(info && info.serveur
          ? "Publié — en ligne tout de suite"
          : "Publié — en ligne dans ~1 minute", "ok");
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
      '<div class="wrap admin admin--staff">' +
        '<nav class="stafflist" id="staff-nav"></nav>' +
        '<div class="pane" id="staff-pane"></div>' +
      "</div>";
    renderList();
    renderCard();
  }

  const roleOf = u => draft.roles.find(r => r.id === u.roleId) ||
    { id: "", name: "Sans rôle", color: "#6a6280", perms: [] };

  /* ---- Congés en cours -------------------------------------------------------
     La page ne montre que l'absence du jour : les périodes à venir se
     consultent sur la page Service. */

  /** La période qui couvre aujourd'hui, s'il y en a une. */
  function congeEnCours(uid) {
    const j = MNDuty.jourLocal();
    return MNDuty.congesOf(uid, true).find(c => c.from <= j && j <= c.to) || null;
  }

  /** « 20 août » — l'année n'apparaît que si ce n'est pas l'année en cours. */
  function jourCourt(j) {
    const d = new Date(String(j) + "T12:00:00");   // midi : pas de bascule de fuseau
    if (isNaN(d)) return String(j);
    const o = { day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    return d.toLocaleDateString("fr-FR", o);
  }

  /** Info-bulle de la pastille rouge. */
  function titreConge(uid) {
    const c = congeEnCours(uid);
    return c ? "En congés jusqu'au " + jourCourt(c.to) : "En congés";
  }

  /** Complément de la pastille de la fiche : « jusqu'au 20 août ». */
  function retourConge(uid) {
    const c = congeEnCours(uid);
    return c ? " jusqu'au " + jourCourt(c.to) : "";
  }

  /* ---- Équipe d'aujourd'hui / archives ----------------------------------------
     Deux populations qui ne se mélangent pas : ceux qui travaillent ici, et
     ceux qui sont passés. La bascule est en tête de liste, pas un filtre
     perdu au milieu — on ne consulte pas les archives par accident. */

  const actifs = () => draft.users.filter(u => !MNStore.estArchive(u));
  const archives = () => draft.users.filter(MNStore.estArchive);

  /** Les personnes masquées ne sortent que si un responsable le demande. */
  const visibleUsers = () => (vueArchives
    ? triArchives(archives())
    : actifs().filter(u => !u.hidden || (canEdit && showHidden)));

  /**
   * Le nom de famille : le dernier mot du nom complet. C'est par lui qu'on
   * classe, comme dans n'importe quel répertoire — on cherche « Martin », pas
   * « Rico ». Un nom d'un seul mot est à lui-même son nom de famille.
   */
  const nomFamille = u => {
    const mots = String(u.pseudo || "").trim().split(/\s+/).filter(Boolean);
    return mots.length ? mots[mots.length - 1] : "";
  };

  /* Les archives se lisent par ordre alphabétique de nom de famille : on y
     cherche quelqu'un, pas une date. À nom de famille égal, le prénom
     départage. La liste vivante garde l'ordre choisi par l'atelier. */
  const triArchives = l => l.slice().sort((a, b) =>
    nomFamille(a).localeCompare(nomFamille(b), "fr", { sensitivity: "base" }) ||
    a.pseudo.localeCompare(b.pseudo, "fr", { sensitivity: "base" }));

  const hiddenCount = () => actifs().filter(u => u.hidden).length;

  /* ---- Index alphabétique --------------------------------------------------
     Les archives grossissent sans jamais rétrécir. Un répertoire par tranches
     de deux lettres évite de faire défiler tout l'historique de l'atelier
     pour retrouver quelqu'un. */

  const TRANCHES = (function () {
    const t = [];
    for (let i = 0; i < 26; i += 2) {
      const a = String.fromCharCode(97 + i);
      const b = String.fromCharCode(97 + Math.min(25, i + 1));
      t.push({ id: a + "-" + b, nom: a + "-" + b, lettres: a === b ? [a] : [a, b] });
    }
    return t;
  })();

  /** La lettre de classement : l'initiale du nom de famille, sans accent. */
  const initialeDe = u => nomFamille(u)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .charAt(0).toLowerCase();

  const dansTranche = (u, t) => !t || t.lettres.indexOf(initialeDe(u)) !== -1;

  /**
   * Le répertoire, en colonne. Une tranche vide reste affichée mais éteinte :
   * la voir grisée dit qu'on a bien cherché au bon endroit, alors qu'une
   * tranche absente laisserait croire à un oubli.
   */
  function indexAlpha(liste, recherche) {
    if (recherche) return "";                 // la recherche fouille tout
    const compte = {};
    liste.forEach(u => {
      const l = initialeDe(u);
      TRANCHES.forEach(t => { if (t.lettres.indexOf(l) !== -1) compte[t.id] = (compte[t.id] || 0) + 1; });
    });

    return '<div class="alpha">' +
      '<button class="alpha__t' + (tranche ? "" : " is-on") + '" data-tr="">Tout</button>' +
      TRANCHES.map(t =>
        '<button class="alpha__t' + (tranche && tranche.id === t.id ? " is-on" : "") +
          (compte[t.id] ? "" : " is-vide") + '" data-tr="' + t.id + '"' +
          (compte[t.id] ? ' title="' + compte[t.id] + ' fiche' + (compte[t.id] > 1 ? "s" : "") + '"'
                        : " disabled") + ">" + t.nom + "</button>").join("") +
    "</div>";
  }

  function renderList() {
    const nav = $("#staff-nav");
    /* La liste défile dans son propre cadre : la reconstruire remet ce cadre
       en haut. Sans ce report, une flèche de réorganisation ou une frappe
       dans la recherche ramènerait au premier nom à chaque fois. */
    const avant = nav.querySelector(".stafflist__body");
    const defile = avant ? avant.scrollTop : 0;
    const f = filter.toLowerCase();
    const base = visibleUsers().filter(u =>
      !f || u.pseudo.toLowerCase().indexOf(f) !== -1 || roleOf(u).name.toLowerCase().indexOf(f) !== -1);
    /* La tranche s'applique aux seules archives, et cède devant une
       recherche : chercher un nom précis doit fouiller tout le répertoire. */
    const list = (vueArchives && !f) ? base.filter(u => dansTranche(u, tranche)) : base;
    const nHidden = hiddenCount();
    const nArch = archives().length;

    /* Réorganiser n'a de sens que sur la liste vivante, entière et sans filtre. */
    const canSort = canEdit && reorder && !filter && !vueArchives;

    nav.innerHTML =
      '<div class="stafflist__top">' +
        /* Toujours visible, même sans personne d'archivé : une bascule qui
           n'apparaît qu'une fois la fonctionnalité utilisée ne se découvre
           jamais. Les archives vides le disent d'elles-mêmes. */
        '<div class="segbar">' +
          '<button class="seg' + (vueArchives ? "" : " is-on") + '" data-vue="equipe">' +
            "Équipe</button>" +
          '<button class="seg' + (vueArchives ? " is-on" : "") + '" data-vue="archives">' +
            "Archives" + (nArch ? "<span>" + nArch + "</span>" : "") + "</button>" +
        "</div>" +
        '<input class="input" id="s-find" placeholder="' +
          (vueArchives ? "Chercher dans les archives…" : "Chercher…") + '" value="' +
          esc(filter) + '">' +
        (vueArchives ? indexAlpha(base, f) : "") +
        (canEdit && !vueArchives
          ? '<div class="row" style="margin-top:8px;gap:6px">' +
              '<button class="btn btn--primary btn--sm" id="s-add" style="flex:1">' +
                svg("plus") + "<span>Employé</span></button>" +
              '<button class="btn btn--sm ' + (reorder ? "btn--solid" : "btn--ghost") + '" id="s-sort"' +
                ' title="Réorganiser la liste">' + svg(reorder ? "check" : "layers") + "</button>" +
            "</div>"
          : "") +
        /* Tout le monde n'est pas parti depuis que le site existe : il faut
           pouvoir écrire une fiche d'archive directement. */
        (canEdit && vueArchives
          ? '<div class="row" style="margin-top:8px">' +
              '<button class="btn btn--primary btn--sm" id="s-arch" style="flex:1">' +
                svg("plus") + "<span>Ajouter aux archives</span></button>" +
            "</div>"
          : "") +
        (reorder && filter
          ? '<p class="hint hint--warn" style="margin-top:8px">Vide la recherche pour réorganiser.</p>'
          : "") +
      "</div>" +
      '<div class="stafflist__body' + (canSort ? " is-sorting" : "") + '">' +
        (list.length ? list.map(u => {
          const r = roleOf(u);
          const on = MNDuty.isOn(u.id);
          const i = draft.users.indexOf(u);
          return '<div class="staffrow' + (u.id === sel ? " is-active" : "") +
            (u.active ? "" : " is-off") + (u.hidden ? " is-hidden" : "") +
            '" data-u="' + esc(u.id) + '" role="button" tabindex="0">' +
            (canSort
              ? '<span class="ord">' +
                  '<button data-mv="up"' + (i === 0 ? " disabled" : "") + ' aria-label="Monter">' +
                    svg("chevUp") + "</button>" +
                  '<button data-mv="down"' + (i === draft.users.length - 1 ? " disabled" : "") +
                    ' aria-label="Descendre">' + svg("chevDown") + "</button>" +
                "</span>"
              : "") +
            '<span class="userchip__av" style="width:34px;height:34px;flex:none;background:' +
              esc(r.color) + '">' + esc(MNUI.initials(u.pseudo)) + "</span>" +
            '<span class="staffrow__txt"><b>' + esc(u.pseudo) + "</b>" +
              /* En archives, le grade importe moins que la raison du départ :
                 c'est ce qu'on vient vérifier. */
              (MNStore.estArchive(u)
                ? "<i>" + esc(MNStore.motifDepart(u.depart.motif).court) + " · " +
                  esc(jourCourt(u.depart.le)) + "</i>"
                : '<i style="color:' + esc(r.color) + '">' + esc(r.name) + "</i>") +
            "</span>" +
            (u.hidden ? '<span class="staffrow__eye" title="Masqué de l\'équipe">' + svg("lock") + "</span>" : "") +
            /* Un dossier chargé se voit depuis la liste : chercher fiche par
               fiche qui a été averti n'aurait aucun sens. */
            (function () {
              if (!voitAvert(u)) return "";
              const b = MNStore.avertBilan(u);
              if (!b.actifs) return "";
              const g = MNStore.graviteDe(b.pire);
              return '<span class="staffrow__av" style="--grav:' + esc(g.couleur) + '" title="' +
                esc(b.actifs + " avertissement" + (b.actifs > 1 ? "s" : "") + " en cours") +
                '">' + b.actifs + "</span>";
            })() +
            /* Une même pastille pour deux états qui s'excluent : vert en
               service, rouge en congés. */
            (on ? '<span class="dutydot" title="En service"></span>'
                : MNDuty.enConge(u.id)
                  ? '<span class="dutydot dutydot--conge" title="' + esc(titreConge(u.id)) + '"></span>'
                  : "") +
          "</div>";
        }).join("")
          : '<p class="hint" style="padding:12px">' +
            (vueArchives && !filter && !tranche
              ? "Personne n'a encore quitté l'atelier. Les fiches des partants arriveront " +
                "ici, avec toute leur histoire."
              : "Personne ne correspond.") + "</p>") +
      "</div>" +
      '<div class="stafflist__foot">' +
        '<span class="hint">' + list.length + " affiché" + (list.length > 1 ? "s" : "") + "</span>" +
        (canEdit && nHidden
          ? '<button class="btn btn--ghost btn--sm" id="s-hidden">' +
            svg(showHidden ? "check" : "lock") + "<span>" + nHidden + " masqué" +
            (nHidden > 1 ? "s" : "") + "</span></button>"
          : "") +
      "</div>";

    const corps = nav.querySelector(".stafflist__body");
    if (corps && defile) corps.scrollTop = defile;

    nav.querySelectorAll("[data-vue]").forEach(b => b.addEventListener("click", () => {
      const veut = b.dataset.vue === "archives";
      if (veut === vueArchives) return;
      vueArchives = veut;
      /* On repart d'une liste propre : la recherche et la tranche d'une vue
         n'ont pas de sens dans l'autre. */
      filter = ""; tranche = null; reorder = false;
      const p = visibleUsers()[0];
      sel = p ? p.id : null;
      render();
    }));

    nav.querySelectorAll("[data-tr]").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return;
      tranche = b.dataset.tr ? TRANCHES.find(t => t.id === b.dataset.tr) : null;
      const l = visibleUsers().filter(u => dansTranche(u, tranche));
      /* La fiche affichée doit rester dans ce qu'on regarde. */
      if (!l.some(u => u.id === sel)) sel = l.length ? l[0].id : null;
      render();
    }));

    const sortBtn = $("#s-sort");
    if (sortBtn) sortBtn.addEventListener("click", () => {
      reorder = !reorder;
      renderList();
      MNUI.toast(reorder ? "Réorganisation : utilise les flèches" : "Réorganisation terminée", "info");
    });

    nav.querySelectorAll("[data-mv]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      if (b.disabled) return;
      const id = b.closest("[data-u]").dataset.u;
      const i = draft.users.findIndex(x => x.id === id);
      const j = i + (b.dataset.mv === "up" ? -1 : 1);
      if (j < 0 || j >= draft.users.length) return;
      draft.users.splice(j, 0, draft.users.splice(i, 1)[0]);
      draft = MNStore.saveDraft(draft);
      renderDraftbar();
      renderList();
    }));

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

    const arch = $("#s-arch");
    if (arch) arch.addEventListener("click", ajouterAuxArchives);

    nav.querySelectorAll("[data-u]").forEach(b => {
      /* Choisir quelqu'un ne change qu'une chose dans la liste : qui est
         surligné. Tout refaire pour ça la ferait sursauter sous le doigt. */
      const pick = () => {
        if (b.dataset.u === sel) return;
        sel = b.dataset.u;
        nav.querySelectorAll(".staffrow.is-active")
          .forEach(x => x.classList.remove("is-active"));
        b.classList.add("is-active");
        renderCard();
      };
      b.addEventListener("click", pick);
      b.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
    });
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

    /* « Actuel » se pose sur la ligne du grade réellement porté, pas
       forcément la plus récente : une promotion peut être enregistrée
       après coup avec une date antérieure. */
    let nowIdx = hist.findIndex(h => h.roleId === u.roleId);
    if (nowIdx === -1) nowIdx = 0;

    pane.innerHTML =
      '<div class="panel">' +
        '<div class="staffhead" style="--role:' + esc(r.color) + '">' +
          '<div class="staffhead__av" style="background:' + esc(r.color) + '">' +
            esc(MNUI.initials(u.pseudo)) + "</div>" +
          '<div class="staffhead__id">' +
            "<h2>" + esc(u.pseudo) +
              (MNStore.estArchive(u) ? " <span class=\"pill pill--danger\">archivé</span>" : "") +
              (u.active || MNStore.estArchive(u) ? "" : " <span class=\"pill pill--dim\">désactivé</span>") +
              (u.hidden ? ' <span class="pill pill--warn">masqué</span>' : "") +
              /* Se voir sans ouvrir l'éditeur : sinon on cherche pourquoi
                 quelqu'un manque au récapitulatif du dimanche. */
              (u.horsRecap && !u.hidden
                ? ' <span class="pill pill--dim">hors comptes</span>' : "") + "</h2>" +
            '<span class="rolechip rolechip--ico" style="color:' + esc(r.color) + '">' +
              mnIcon(r.icon) + esc(r.name) + "</span>" +
            (on ? '<span class="pill pill--ok">en service</span>' : "") +
            (MNDuty.enConge(u.id)
              ? '<span class="pill pill--danger">en congés' + esc(retourConge(u.id)) + "</span>"
              : "") +
            (u.pin ? '<span class="pill pill--dim">' + svg("lock", "inline-lock") + " code</span>" : "") +
          "</div>" +
          /* Une fiche archivée ne se modifie plus : elle témoigne. La seule
             action qui reste est de faire revenir la personne. */
          (MNStore.estArchive(u)
            ? (canEdit
                ? '<div class="staffhead__acts">' +
                    '<button class="btn btn--primary" id="c-back">' + svg("refresh") +
                      "<span>Réintégrer</span></button>" +
                  "</div>"
                : "")
            : (canEdit || canWarn
              ? '<div class="staffhead__acts">' +
                  (canEdit
                    ? '<button class="btn btn--primary" id="c-promote">' + svg("tag") +
                      "<span>Changer de grade</span></button>" +
                      '<button class="btn btn--ghost" id="c-edit">' + svg("edit") +
                      "<span>Modifier la fiche</span></button>"
                    : "") +
                  (canWarn && u.id !== me.uid
                    ? '<button class="btn btn--ghost" id="c-warn">' + svg("alert") +
                      "<span>Avertir</span></button>"
                    : "") +
                  (canEdit && u.id !== me.uid
                    ? '<button class="btn btn--ghost" id="c-leave">' + svg("logout") +
                      "<span>Archiver</span></button>"
                    : "") +
                "</div>"
              : "")) +
        "</div>" +

        '<div class="panel__body">' +
          /* Le départ passe avant tout le reste : c'est la première chose à
             savoir en ouvrant la fiche de quelqu'un qui n'est plus là. */
          (MNStore.estArchive(u) ? bandeauDepart(u) : "") +
          '<div class="statgrid">' +
            (() => {
              const parti = MNStore.estArchive(u) ? u.depart.le : null;
              const a = seniority(u.hiredAt, parti);
              return stat(parti ? "Ancienneté au départ" : "Ancienneté",
                a.texte, false, null, a.sous);
            })() +
            stat("Service — semaine", MNDuty.dur(MNDuty.secondsFor(u.id, MNDuty.weekStart())), on, "week") +
            stat("Service — total", MNDuty.dur(MNDuty.secondsFor(u.id)), on, "total") +
            stat("Formations", String((u.trainings || []).length),
              false, null, (u.trainings || []).length ? u.trainings.slice(0, 2).join(", ") : "aucune") +
            statConges(u, MNStore.estArchive(u) ? u.depart.le : null) +
            (voitAvert(u) ? statAvert(u) : "") +
          "</div>" +

          '<h3 class="section-title" style="margin-top:24px">Carrière' +
            '<span class="count">' + hist.length + "</span></h3>" +
          '<ol class="timeline">' + hist.map((h, i) => {
            const hr = draft.roles.find(x => x.id === h.roleId);
            const color = hr ? hr.color : "#6a6280";
            return '<li class="tl' + (i === nowIdx ? " is-now" : "") + '" style="--role:' + esc(color) + '">' +
              '<div class="tl__dot"></div>' +
              '<div class="tl__body">' +
                "<b>" + esc(h.roleName || h.roleId) + "</b>" +
                (i === nowIdx ? ' <span class="pill pill--outline">actuel</span>' : "") +
                '<div class="tl__meta">' + fdatetime(h.at) +
                  (h.by ? " · par " + esc(h.by) : "") +
                  (h.note ? " · " + esc(h.note) : "") + "</div>" +
              "</div></li>";
          }).join("") + "</ol>" +

          '<h3 class="section-title" style="margin-top:24px">Formations' +
            '<span class="count">' + (u.trainings || []).length + "</span></h3>" +
          ((u.trainings || []).length
            ? '<div class="permtags">' + u.trainings.map(t =>
                '<span class="permtag">' + esc(t) + "</span>").join("") + "</div>"
            : '<p class="hint">Aucune formation enregistrée.</p>') +

          congesSection(u) +

          (voitAvert(u) ? sectionAvert(u) : "") +

          serviceSection(u, on) +

          (u.note && canSeeNotes
            ? '<h3 class="section-title" style="margin-top:24px">Note interne</h3>' +
              '<p class="hint" style="white-space:pre-wrap">' + esc(u.note) + "</p>"
            : "") +
        "</div>" +
      "</div>";

    const p = $("#c-promote"); if (p) p.addEventListener("click", () => promote(u));
    const e = $("#c-edit"); if (e) e.addEventListener("click", () => editCard(u));
    const dep = $("#c-leave"); if (dep) dep.addEventListener("click", () => archiver(u));
    const ret = $("#c-back"); if (ret) ret.addEventListener("click", () => reintegrer(u));
    /* Deux entrées vers la même fenêtre : le bouton de l'entête, et celui du
       bloc — on avertit rarement, mais quand on le fait on est déjà en bas de
       la fiche à relire les précédents. */
    ["#c-warn", "#c-warn2"].forEach(sel => {
      const b = $(sel);
      if (b) b.addEventListener("click", () => avertir(u));
    });

    pane.querySelectorAll("[data-av]").forEach(b => b.addEventListener("click", () => {
      const [action, id] = b.dataset.av.split("|");
      if (action === "lever") leverAvert(u, id);
      else retirerAvert(u, id);
    }));
  }

  const hhmm = d => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  /* ---- Congés -----------------------------------------------------------------
     La page Service montre les congés de tout le monde, à plat. Sur une fiche
     la question est autre : combien cette personne en a pris, et quand.

     Une période est rattachée à son année de début, une seule fois — ainsi la
     somme des années fait exactement le total. (Le filtre de la page Service
     montre, lui, une période à cheval dans les deux années : filtrer n'est pas
     compter.) */

  /** « du 10 au 20 août » — l'année est portée par le groupe, sauf à cheval. */
  function periodeCourte(c) {
    const memeAn = String(c.from).slice(0, 4) === String(c.to).slice(0, 4);
    const jour = (j, avecAn) => {
      const d = new Date(String(j) + "T12:00:00");
      if (isNaN(d)) return String(j);
      const o = { day: "numeric", month: "long" };
      if (avecAn) o.year = "numeric";
      return d.toLocaleDateString("fr-FR", o);
    };
    return "du " + jour(c.from, !memeAn) + " au " + jour(c.to, !memeAn);
  }

  const etatConge = c => {
    const j = MNDuty.jourLocal();
    return c.to < j ? "passe" : c.from <= j ? "encours" : "avenir";
  };

  /** Le total de l'année en cours — ou celui de toute la carrière, pour un parti. */
  function statConges(u, parti) {
    const tous = MNDuty.congesOf(u.id, true);
    const an = String(new Date().getFullYear());
    const l = parti ? tous : tous.filter(c => String(c.from).slice(0, 4) === an);
    const jours = l.reduce((n, c) => n + MNDuty.nbJours(c.from, c.to), 0);
    return stat(parti ? "Congés — total" : "Congés — " + an, jours + " j", false, null,
      l.length ? l.length + " période" + (l.length > 1 ? "s" : "") : "aucun");
  }

  function congesSection(u) {
    const tous = MNDuty.congesOf(u.id, true).slice()
      .sort((a, b) => b.from.localeCompare(a.from));
    const tete = '<h3 class="section-title" style="margin-top:24px">Congés' +
      '<span class="count">' + tous.length + "</span></h3>";

    if (!tous.length) return tete + '<p class="hint">Aucun congé posé.</p>';

    const annees = [];
    tous.forEach(c => {
      const an = String(c.from).slice(0, 4);
      let g = annees.find(x => x.an === an);
      if (!g) { g = { an: an, jours: 0, periodes: [] }; annees.push(g); }
      g.periodes.push(c);
      g.jours += MNDuty.nbJours(c.from, c.to);
    });

    const anCourante = String(new Date().getFullYear());
    const jours = tous.reduce((n, c) => n + MNDuty.nbJours(c.from, c.to), 0);

    /* L'année en cours est dépliée, les précédentes repliées : on ne veut pas
       dérouler cinq ans de congés pour lire la fiche de quelqu'un. */
    return tete + '<div class="svc">' + annees.map(g =>
      '<details class="svcweek"' + (g.an === anCourante ? " open" : "") + ">" +
        '<summary class="svcweek__head">' +
          '<span class="svcweek__chev">' + svg("chevDown") + "</span>" +
          '<span class="svcweek__label">' + esc(g.an) +
            (g.an === anCourante ? ' <span class="pill pill--ok">en cours</span>' : "") + "</span>" +
          '<span class="svcweek__meta">' + g.periodes.length + " période" +
            (g.periodes.length > 1 ? "s" : "") + "</span>" +
          '<b class="svcweek__tot tnum">' + g.jours + " j</b>" +
        "</summary>" +
        '<div class="svcweek__body">' +
          g.periodes.map(c => {
            const e = etatConge(c);
            return '<div class="svc__day svc__day--conge' +
              (e === "passe" ? " is-off" : "") + '">' +
              '<span class="svc__date">' + esc(periodeCourte(c)) + "</span>" +
              '<span class="svc__slots">' +
                '<span class="pill pill--' + (e === "encours" ? "ok" : "outline") + '">' +
                  (e === "encours" ? "en cours" : e === "avenir" ? "à venir" : "passés") +
                "</span>" +
                (c.note ? '<span class="svc__slot">' + esc(c.note) + "</span>" : "") +
              "</span>" +
              '<span class="svc__tot tnum">' + MNDuty.nbJours(c.from, c.to) + " j</span>" +
            "</div>";
          }).join("") +
        "</div>" +
      "</details>"
    ).join("") + "</div>" +
      '<p class="hint" style="margin-top:8px">' + tous.length + " période" +
      (tous.length > 1 ? "s" : "") + " · <b>" + jours + " jour" + (jours > 1 ? "s" : "") +
      "</b> au total.</p>";
  }

  /**
   * Historique de service, regroupé par mois puis par jour : une ligne par
   * journée avec ses créneaux et son total, plutôt qu'une longue liste plate.
   */
  function serviceSection(u, on) {
    const log = MNDuty.logOf(u.id).slice(0, 200);

    const head = '<h3 class="section-title" style="margin-top:24px">Historique de service' +
      '<span class="count">' + log.length + "</span></h3>" +
      (on
        ? '<div class="alert alert--ok" style="margin-bottom:12px">' + svg("check") +
          "<span><b>En service actuellement</b> depuis " + hhmm(MNDuty.entryOf(u.id).since) +
          ' — <b class="tnum" data-since-live="' + esc(MNDuty.entryOf(u.id).since) + '">' +
          MNDuty.sinceDur(MNDuty.entryOf(u.id).since) + "</b>.</span></div>"
        : "");

    if (!log.length) {
      return head + '<p class="hint">Aucun service terminé enregistré' +
        (MNDuty.canShare() ? "" : " (le tableau partagé n'est pas accessible depuis cet appareil)") + ".</p>";
    }

    /* Regroupement : semaine → jour → créneaux */
    const weeks = [];
    const thisWeek = MNDuty.weekStart();

    log.forEach(e => {
      const d = new Date(e.in);
      const mon = new Date(d);
      mon.setHours(0, 0, 0, 0);
      mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      const wKey = mon.getTime();
      const dKey = d.toDateString();

      let wk = weeks.find(x => x.key === wKey);
      if (!wk) {
        wk = { key: wKey, seconds: 0, sessions: 0, days: [], label: weekLabel(mon) };
        weeks.push(wk);
      }
      wk.seconds += e.seconds;
      wk.sessions++;

      let day = wk.days.find(x => x.key === dKey);
      if (!day) {
        day = {
          key: dKey, at: new Date(d).setHours(0, 0, 0, 0), seconds: 0, slots: [], forced: false,
          label: d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" })
        };
        wk.days.push(day);
      }
      day.seconds += e.seconds;
      day.slots.push({ at: d.getTime(), txt: hhmm(e.in) + "–" + hhmm(e.out) });
      if (e.forced) day.forced = true;
    });

    /* Le journal arrive du plus récent au plus ancien : c'est ce qu'il faut
       pour lister les semaines, mais à l'intérieur d'une semaine on lit une
       journée dans le sens où elle s'est déroulée. */
    weeks.forEach(wk => {
      wk.days.sort((a, b) => a.at - b.at);
      wk.days.forEach(d => d.slots.sort((a, b) => a.at - b.at));
    });

    /* La semaine en cours est dépliée, les précédentes repliées. */
    return head + '<div class="svc">' + weeks.map(wk =>
      "<details class=\"svcweek\"" + (wk.key === thisWeek ? " open" : "") + ">" +
        '<summary class="svcweek__head">' +
          '<span class="svcweek__chev">' + svg("chevDown") + "</span>" +
          '<span class="svcweek__label">' + esc(wk.label) +
            (wk.key === thisWeek ? ' <span class="pill pill--ok">en cours</span>' : "") + "</span>" +
          '<span class="svcweek__meta">' + wk.days.length + " j · " + wk.sessions + " service" +
            (wk.sessions > 1 ? "s" : "") + "</span>" +
          '<b class="svcweek__tot tnum">' + MNDuty.dur(wk.seconds, true) + "</b>" +
        "</summary>" +
        '<div class="svcweek__body">' +
          wk.days.map(d =>
            '<div class="svc__day">' +
              '<span class="svc__date">' + esc(d.label) + "</span>" +
              '<span class="svc__slots">' + d.slots.map(s =>
                '<span class="svc__slot tnum">' + esc(s.txt) + "</span>").join("") +
                (d.forced ? '<span class="permtag">clôturé par un gérant</span>' : "") +
              "</span>" +
              '<span class="svc__tot tnum">' + MNDuty.dur(d.seconds) + "</span>" +
            "</div>"
          ).join("") +
          '<div class="svcweek__recap">' +
            "<span>Moyenne par jour travaillé</span>" +
            '<b class="tnum">' + MNDuty.dur(Math.round(wk.seconds / wk.days.length)) + "</b>" +
          "</div>" +
        "</div>" +
      "</details>"
    ).join("") + "</div>";
  }

  /** « Semaine du 3 au 9 août 2026 », en évitant les répétitions inutiles. */
  function weekLabel(monday) {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const sameMonth = monday.getMonth() === sunday.getMonth();
    const sameYear = monday.getFullYear() === sunday.getFullYear();

    const a = monday.toLocaleDateString("fr-FR",
      sameMonth && sameYear ? { day: "numeric" } : { day: "numeric", month: "long" });
    const b = sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    return "Semaine du " + a + " au " + b;
  }

  const stat = (label, value, live, key, sous) =>
    '<div class="stat' + (live ? " stat--live" : "") + '">' +
      '<span class="stat__l">' + esc(label) + "</span>" +
      '<b class="stat__v tnum"' + (key ? ' data-live="' + key + '"' : "") + ">" + esc(value) + "</b>" +
      (sous ? '<span class="stat__s">' + esc(sous) + "</span>" : "") +
    "</div>";

  const fdatetime = d => {
    const x = new Date(d);
    return isNaN(x) ? "—" : x.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  /**
   * Ancienneté exacte en années / mois / jours, en tenant compte de la
   * longueur réelle de chaque mois (pas d'approximation à 30,44 jours).
   */
  function seniority(hiredAt, jusqua) {
    if (!hiredAt) return { texte: "—", sous: "" };
    const d = new Date(hiredAt + "T00:00:00");
    if (isNaN(d)) return { texte: "—", sous: "" };

    /* Pour quelqu'un qui est parti, on s'arrête à son départ : sans ça son
       ancienneté continuerait de grandir des années après. */
    const now = jusqua ? new Date(jusqua + "T00:00:00") : new Date();
    now.setHours(0, 0, 0, 0);
    if (isNaN(now)) return { texte: "—", sous: "" };
    if (d > now) return { texte: "à venir", sous: "" };

    let years = now.getFullYear() - d.getFullYear();
    let months = now.getMonth() - d.getMonth();
    let days = now.getDate() - d.getDate();

    if (days < 0) {
      months--;
      /* nombre de jours du mois précédent celui d'aujourd'hui */
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) { years--; months += 12; }

    const total = Math.round((now - d) / 86400000);
    if (total === 0) return { texte: "aujourd'hui", sous: "recruté ce jour" };

    const p = [];
    if (years) p.push(years + " an" + (years > 1 ? "s" : ""));
    if (months) p.push(months + " mois");
    if (days || !p.length) p.push(days + " j");

    /* Le total en jours va sur une seconde ligne : il lève l'ambiguïté sans
       allonger la valeur principale. */
    return { texte: p.join(" "), sous: total + " jour" + (total > 1 ? "s" : "") + " au total" };
  }

  /* ---- Départs et archives -------------------------------------------------------- */

  function bandeauDepart(u) {
    const d = u.depart;
    const m = MNStore.motifDepart(d.motif);
    return '<div class="depart">' +
      '<div class="depart__tete">' + svg("logout") +
        "<b>" + esc(m.nom) + "</b>" +
        '<span>le ' + esc(jourCourt(d.le)) + (d.par ? " · par " + esc(d.par) : "") + "</span>" +
      "</div>" +
      (d.note ? '<p class="depart__note">' + esc(d.note) + "</p>" : "") +
      '<p class="hint">Cette fiche est conservée telle quelle : ancienneté, carrière, ' +
        "formations et avertissements restent lisibles. Elle ne se modifie plus.</p>" +
    "</div>";
  }

  /** Faire partir quelqu'un : la fiche passe aux archives, rien n'est perdu. */
  function archiver(u) {
    const auj = MNDuty.jourLocal();
    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<p class="hint">' + esc(u.pseudo) + " quittera l'équipe et ne pourra plus se " +
        "connecter. <b>Rien n'est supprimé</b> : sa fiche part aux archives avec toute " +
        "son histoire, et tu pourras la rouvrir ou le réintégrer plus tard.</p>" +
      '<div class="field"><label class="label">Motif</label>' +
        '<div class="motifs" id="d-motifs">' + MNStore.MOTIFS_DEPART.map((m, i) =>
          '<button type="button" class="motif' + (i === 0 ? " is-on" : "") +
          '" data-m="' + esc(m.id) + '">' + esc(m.nom) + "</button>").join("") + "</div></div>" +
      '<div class="field" style="max-width:220px"><label class="label" for="d-date">Date du départ</label>' +
        '<input class="input" id="d-date" type="date" value="' + auj + '" max="' + auj + '"></div>' +
      '<div class="field"><label class="label" for="d-note">Précisions (facultatif)</label>' +
        '<textarea class="textarea" id="d-note" maxlength="600" ' +
          'placeholder="Ce qu\'il faut retenir de ce départ…"></textarea></div>';

    let motif = MNStore.MOTIFS_DEPART[0].id;
    body.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
      motif = b.dataset.m;
      body.querySelectorAll("[data-m]").forEach(x => x.classList.toggle("is-on", x === b));
    }));

    MNUI.modal({
      title: "Archiver " + u.pseudo, body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Archiver la fiche", variant: "btn--primary", icon: "logout",
          onClick: async close => {
            const depart = {
              le: body.querySelector("#d-date").value || auj, motif,
              note: body.querySelector("#d-note").value.trim(), par: me.pseudo
            };

            /* On bascule sur les archives : c'est là qu'il se trouve
               désormais, le laisser sur une liste où il n'est plus serait
               déroutant. */
            vueArchives = true; tranche = null; filter = "";
            sel = u.id;

            const r = await appliquer(
              { op: "depart", uid: u.id, depart },
              () => MNStore.archiverUser(u, depart, me.pseudo));
            if (!r.ok) return MNUI.toast("Archivage impossible : " + r.error, "err");

            close();
            MNUI.toast(u.pseudo + " est archivé — sa fiche reste consultable" + suite(r), "ok");
          }
        }
      ]
    });
  }

  /**
   * Écrire directement une fiche d'archive.
   *
   * L'atelier a existé avant le site : des gens sont partis sans jamais avoir
   * eu de fiche, et on veut quand même pouvoir dire qu'ils étaient là. La
   * fiche naît archivée — elle ne passe pas par l'équipe en poste.
   */
  function ajouterAuxArchives() {
    if (!draft.roles.length) return MNUI.toast("Crée d'abord un grade", "err");
    const auj = MNDuty.jourLocal();
    const plusBas = draft.roles[draft.roles.length - 1];

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<p class="hint">Pour quelqu\'un qui a quitté l\'atelier sans avoir eu de fiche ici. ' +
        "Elle sera créée <b>directement dans les archives</b> : la personne ne rejoint pas " +
        "l'équipe et ne peut pas se connecter.</p>" +
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="x-pseudo">Prénom &amp; Nom</label>' +
          '<input class="input" id="x-pseudo" maxlength="40" placeholder="Ex. Rico Martin"></div>' +
        '<div class="field"><label class="label" for="x-role">Grade qu\'il tenait</label>' +
          '<select class="select" id="x-role">' + draft.roles.map(r =>
            '<option value="' + esc(r.id) + '"' + (r.id === plusBas.id ? " selected" : "") + ">" +
            esc(r.name) + "</option>").join("") + "</select></div>" +
      "</div>" +
      '<div class="field"><label class="label">Motif du départ</label>' +
        '<div class="motifs" id="x-motifs">' + MNStore.MOTIFS_DEPART.map((m, i) =>
          '<button type="button" class="motif' + (i === 0 ? " is-on" : "") +
          '" data-m="' + esc(m.id) + '">' + esc(m.nom) + "</button>").join("") + "</div></div>" +
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="x-hired">Date d\'arrivée</label>' +
          '<input class="input" id="x-hired" type="date" max="' + auj + '">' +
          '<p class="hint">Si tu ne sais plus, laisse vide : l\'ancienneté restera ' +
            "inconnue plutôt que fausse.</p></div>" +
        '<div class="field"><label class="label" for="x-left">Date du départ</label>' +
          '<input class="input" id="x-left" type="date" value="' + auj + '" max="' + auj + '"></div>' +
      "</div>" +
      '<div class="field"><label class="label" for="x-note">Précisions (facultatif)</label>' +
        '<textarea class="textarea" id="x-note" maxlength="600" ' +
          'placeholder="Ce qu\'il faut retenir de son passage…"></textarea></div>';

    let motif = MNStore.MOTIFS_DEPART[0].id;
    body.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
      motif = b.dataset.m;
      body.querySelectorAll("[data-m]").forEach(x => x.classList.toggle("is-on", x === b));
    }));

    MNUI.modal({
      title: "Ajouter aux archives", body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Créer la fiche", variant: "btn--primary", icon: "plus",
          onClick: async close => {
            const pseudo = body.querySelector("#x-pseudo").value.trim();
            if (pseudo.length < 2) return MNUI.toast("Nom trop court", "err");
            /* Le contrôle porte sur tout le monde, archives comprises : deux
               fiches du même nom seraient impossibles à démêler. */
            if (draft.users.some(x => x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return MNUI.toast("Ce nom est déjà pris", "err");
            }

            const le = body.querySelector("#x-left").value || auj;
            const hired = body.querySelector("#x-hired").value;
            const roleId = body.querySelector("#x-role").value;
            const r = draft.roles.find(x => x.id === roleId);
            const id = MNStore.uniqueId(pseudo, draft.users.map(x => x.id));

            const fiche = {
              id, pseudo, roleId,
              active: false, hidden: false, pin: null,
              createdAt: new Date().toISOString(),
              /* Sans date d'arrivée connue, on prend celle du départ : la
                 fiche affichera une ancienneté nulle, ce qui se lit comme
                 « on ne sait pas » plutôt que comme un chiffre inventé. */
              hiredAt: hired || le,
              trainings: [], note: "",
              avertissements: [],
              depart: {
                le, motif,
                note: body.querySelector("#x-note").value.trim(),
                par: me.pseudo
              },
              history: [{
                roleId, roleName: r ? r.name : roleId,
                at: new Date((hired || le) + "T12:00:00").toISOString(),
                by: me.pseudo, note: "Entrée dans l'entreprise"
              }]
            };

            vueArchives = true; tranche = null; filter = "";
            sel = id;

            const res = await appliquer(
              { op: "recrue", user: fiche },
              () => draft.users.push(fiche));
            if (!res.ok) return MNUI.toast("Création impossible : " + res.error, "err");

            close();
            MNUI.toast(pseudo + " est ajouté aux archives" + suite(res), "ok");
          }
        }
      ]
    });
  }

  async function reintegrer(u) {
    const ok = await MNUI.confirm({
      title: "Réintégrer " + u.pseudo,
      message: "Sa fiche revient dans l'équipe avec toute son histoire, et il pourra " +
        "de nouveau se connecter. Son grade est celui qu'il avait en partant.",
      confirmLabel: "Réintégrer"
    });
    if (!ok) return;

    vueArchives = false; tranche = null; filter = "";
    sel = u.id;

    const r = await appliquer(
      { op: "retour", uid: u.id },
      () => MNStore.reintegrerUser(u));
    if (!r.ok) return MNUI.toast("Réintégration impossible : " + r.error, "err");

    MNUI.toast(u.pseudo + " a rejoint l'équipe" + suite(r), "ok");
  }

  /* ---- Avertissements ------------------------------------------------------------
     Une sanction se lit et se conteste : elle porte un motif, une date et le
     nom de qui l'a donnée. Chacun voit les siennes — un avertissement qu'on
     ignore ne sert à rien — mais seuls ceux qui gèrent l'équipe voient ceux
     des autres. */

  const voitAvert = u =>
    MNAuth.canAny("warn", "users", "admin") || (me && u.id === me.uid);

  /** La tuile de chiffre : ce qui compte, c'est ce qui compte encore. */
  function statAvert(u) {
    const b = MNStore.avertBilan(u);
    if (!b.total) return stat("Avertissements", "0", false, null, "aucun");

    const g = MNStore.graviteDe(b.pire);
    return '<div class="stat' + (b.actifs ? " stat--warn" : "") + '">' +
      '<span class="stat__l">Avertissements</span>' +
      '<b class="stat__v tnum"' + (b.actifs ? ' style="color:' + esc(g.couleur) + '"' : "") + ">" +
        b.actifs + "</b>" +
      '<span class="stat__s">' +
        (b.actifs
          ? "en cours" + (b.total > b.actifs ? " · " + (b.total - b.actifs) + " sans effet" : "")
          : b.total + " au total, aucun en cours") +
      "</span></div>";
  }

  function sectionAvert(u) {
    const l = u.avertissements || [];
    const b = MNStore.avertBilan(u);
    const sien = me && u.id === me.uid;
    const peut = canWarn && !sien;

    const tete = '<h3 class="section-title" style="margin-top:24px">Avertissements' +
      '<span class="count">' + l.length + "</span>" +
      (peut
        ? '<button class="btn btn--ghost btn--sm" id="c-warn2" style="margin-left:auto">' +
          svg("plus") + "<span>Donner un avertissement</span></button>"
        : "") +
      "</h3>";

    if (!l.length) {
      return tete + '<p class="hint">' + (sien
        ? "Aucun avertissement à ton dossier."
        : "Aucun avertissement. Rien à signaler.") + "</p>";
    }

    return tete +
      (b.actifs > 1
        ? '<div class="alert alert--warn" style="margin-bottom:12px">' + svg("alert") +
          "<span><b>" + b.actifs + " avertissements en cours.</b> " +
          "Cumul de gravité : " + b.poids + ".</span></div>"
        : "") +
      '<div class="avlist">' + l.map(a => ligneAvert(a, u, peut)).join("") + "</div>";
  }

  function ligneAvert(a, u, peut) {
    const g = MNStore.graviteDe(a.gravite);
    const actif = MNStore.avertActif(a);
    const perime = !a.leve && a.expire && a.expire < MNDuty.jourLocal();

    return '<div class="av' + (actif ? "" : " is-off") + '" style="--grav:' + esc(g.couleur) + '">' +
      '<span class="av__pastille">' + esc(g.court) + "</span>" +
      '<div class="av__corps">' +
        "<b>" + esc(a.motif) + "</b>" +
        (a.note ? '<p class="av__note">' + esc(a.note) + "</p>" : "") +
        '<div class="av__meta">' +
          fdatetime(a.at) +
          (a.by ? " · par " + esc(a.by) : "") +
          (a.expire ? " · compte jusqu'au " + esc(jourCourt(a.expire)) : "") +
          (a.leve
            ? ' · <span class="av__leve">levé' + (a.levePar ? " par " + esc(a.levePar) : "") +
              (a.leveLe ? " le " + esc(jourCourt(String(a.leveLe).slice(0, 10))) : "") + "</span>"
            : perime ? ' · <span class="av__leve">échu, ne compte plus</span>' : "") +
        "</div>" +
      "</div>" +
      (peut
        ? '<div class="av__acts">' +
            (a.leve ? "" : '<button class="btn btn--icon" data-av="lever|' + esc(a.id) +
              '" title="Lever cet avertissement">' + svg("check") + "</button>") +
            '<button class="btn btn--icon" data-av="retirer|' + esc(a.id) +
              '" title="Retirer — erreur de saisie">' + svg("trash") + "</button>" +
          "</div>"
        : "") +
    "</div>";
  }

  /** Fenêtre de saisie d'un avertissement. */
  function avertir(u) {
    const auj = MNDuty.jourLocal();
    /* Une échéance à trois mois par défaut : un avertissement sans fin
       n'existe que pour peser, et ce n'est pas le but. */
    const dans3mois = (function () {
      const d = new Date(auj + "T12:00:00");
      d.setMonth(d.getMonth() + 3);
      return MNDuty.jourLocal(d);
    })();

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<p class="hint">Il partira sur Discord si un salon lui est réservé, et ' +
        esc(u.pseudo) + " le verra sur sa propre fiche.</p>" +
      '<div class="field"><label class="label">Gravité</label>' +
        '<div class="gravites" id="a-grav">' + MNStore.GRAVITES.map((g, i) =>
          '<button type="button" class="grav' + (i === 1 ? " is-on" : "") +
          '" data-g="' + esc(g.id) + '" style="--grav:' + esc(g.couleur) + '">' +
          esc(g.nom) + "</button>").join("") + "</div></div>" +
      '<div class="field"><label class="label" for="a-motif">Motif</label>' +
        '<input class="input" id="a-motif" maxlength="120" ' +
          'placeholder="Ex. Véhicule rendu sans les freins"></div>' +
      '<div class="field"><label class="label" for="a-note">Précisions (facultatif)</label>' +
        '<textarea class="textarea" id="a-note" maxlength="600" ' +
          'placeholder="Ce qui s\'est passé, ce qui est attendu ensuite…"></textarea></div>' +
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="a-date">Date des faits</label>' +
          '<input class="input" id="a-date" type="date" value="' + auj + '" max="' + auj + '"></div>' +
        '<div class="field"><label class="label" for="a-exp">Compte jusqu\'au</label>' +
          '<input class="input" id="a-exp" type="date" value="' + dans3mois + '">' +
          '<p class="hint">Passée cette date il reste lisible, mais ne compte plus. ' +
            "Vide = sans échéance.</p></div>" +
      "</div>";

    let gravite = "simple";
    body.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => {
      gravite = b.dataset.g;
      body.querySelectorAll("[data-g]").forEach(x => x.classList.toggle("is-on", x === b));
    }));

    MNUI.modal({
      title: "Avertir " + u.pseudo, body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Donner l'avertissement", variant: "btn--primary", icon: "alert",
          onClick: async (close, b2, btn) => {
            const motif = body.querySelector("#a-motif").value.trim();
            if (motif.length < 3) return MNUI.toast("Écris un motif — c'est le cœur de l'avertissement", "err");

            /* Seul le jour est demandé : pour aujourd'hui on garde l'heure
               courante, pour une date passée midi — un horaire neutre. */
            const j = body.querySelector("#a-date").value;
            let quand = new Date();
            if (j && j !== MNDuty.jourLocal()) quand = new Date(j + "T12:00:00");
            if (isNaN(quand) || quand > new Date()) quand = new Date();

            btn.disabled = true;

            /* On construit l'avertissement ici : le serveur le range tel
               quel, et à défaut c'est lui qu'on écrit dans le brouillon. */
            const a = MNStore.normAvertissement({
              id: MNStore.uniqueId("av-" + MNDuty.jourLocal(),
                (u.avertissements || []).map(x => x.id)),
              at: quand.toISOString(), by: me.pseudo,
              gravite, motif,
              note: body.querySelector("#a-note").value.trim(),
              expire: body.querySelector("#a-exp").value || null
            });

            const r = await appliquer(
              { op: "avert-add", uid: u.id, avert: a },
              () => {
                u.avertissements = [a].concat(u.avertissements || []).slice(0, 60);
              });

            if (!r.ok) {
              btn.disabled = false;
              return MNUI.toast("Enregistrement impossible : " + r.error, "err");
            }
            close();

            const d = await MNWebhook.sendAvertissement({
              action: "pose", pseudo: u.pseudo,
              gravite: MNStore.graviteDe(a.gravite).nom,
              motif: a.motif, note: a.note, expire: a.expire, by: me.pseudo
            });
            MNUI.toast(d.ok
              ? "Avertissement donné et annoncé sur Discord" + suite(r)
              : d.skipped
                ? "Avertissement donné (aucun salon Discord dédié)" + suite(r)
                : "Avertissement donné" + suite(r) + ", mais Discord : " + d.error,
              d.ok || d.skipped ? "ok" : "info");
          }
        }
      ]
    });
  }

  async function leverAvert(u, id) {
    const a = (u.avertissements || []).find(x => x.id === id);
    if (!a) return;
    const ok = await MNUI.confirm({
      title: "Lever cet avertissement",
      message: "« " + a.motif + " » cessera de compter, mais restera sur la fiche de " +
        u.pseudo + " avec la mention « levé par " + me.pseudo + " ».",
      confirmLabel: "Lever"
    });
    if (!ok) return;

    const r = await appliquer(
      { op: "avert-lever", uid: u.id, id, par: me.pseudo },
      () => MNStore.leverAvertissement(u, id, me.pseudo));
    if (!r.ok) return MNUI.toast("Levée impossible : " + r.error, "err");

    MNWebhook.sendAvertissement({
      action: "leve", pseudo: u.pseudo,
      gravite: MNStore.graviteDe(a.gravite).nom, motif: a.motif, by: me.pseudo
    });
    MNUI.toast("Avertissement levé" + suite(r), "ok");
  }

  async function retirerAvert(u, id) {
    const a = (u.avertissements || []).find(x => x.id === id);
    if (!a) return;
    const ok = await MNUI.confirm({
      title: "Retirer cet avertissement",
      message: "« " + a.motif + " » disparaîtra de la fiche sans laisser de trace. " +
        "À réserver aux erreurs de saisie : pour annuler une sanction méritée, " +
        "mieux vaut la lever.",
      confirmLabel: "Retirer", danger: true
    });
    if (!ok) return;

    const r = await appliquer(
      { op: "avert-retirer", uid: u.id, id },
      () => MNStore.retirerAvertissement(u, id));
    if (!r.ok) return MNUI.toast("Retrait impossible : " + r.error, "err");

    MNWebhook.sendAvertissement({
      action: "retire", pseudo: u.pseudo,
      gravite: MNStore.graviteDe(a.gravite).nom, motif: a.motif, by: me.pseudo
    });
    MNUI.toast("Avertissement retiré" + suite(r), "ok");
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
      '<div class="field"><label class="label" for="p-date">Date de la montée</label>' +
        '<input class="input" id="p-date" type="date" value="' + MNDuty.jourLocal() +
          '" max="' + MNDuty.jourLocal() + '"></div>' +
      '<div class="field"><label class="label" for="p-note">Motif (facultatif)</label>' +
        '<input class="input" id="p-note" maxlength="80" placeholder="Ex. promotion après formation remorquage"></div>' +
      '<p class="hint">La date est pré-remplie à aujourd\'hui, mais tu peux la reculer si la promotion ' +
        "a eu lieu avant d'être enregistrée ici. L'ancien grade reste dans la carrière.</p>";

    MNUI.modal({
      title: "Changer le grade de " + u.pseudo, body,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Valider la montée", variant: "btn--primary", icon: "tag",
          onClick: async close => {
            const roleId = body.querySelector("#p-role").value;
            if (roleId === u.roleId) return MNUI.toast("C'est déjà son grade actuel", "info");

            /* On ne se retire pas soi-même la gestion de l'équipe. */
            if (u.id === me.uid) {
              const p = (draft.roles.find(x => x.id === roleId) || {}).perms || [];
              if (p.indexOf("admin") === -1 && p.indexOf("users") === -1 && p.indexOf("promote") === -1) {
                return MNUI.toast("Ce grade te retirerait la gestion de l'équipe", "err");
              }
            }
            /* Seul le jour est demandé. Pour aujourd'hui on garde l'heure
               courante, ce qui ordonne correctement plusieurs changements le
               même jour ; pour une date passée, midi — un horaire neutre que
               ni le fuseau ni l'heure d'été ne font basculer de journée. */
            const jour = body.querySelector("#p-date").value;
            let quand = new Date();
            if (jour && jour !== MNDuty.jourLocal()) quand = new Date(jour + "T12:00:00");
            if (isNaN(quand) || quand > new Date()) quand = new Date();

            const to = draft.roles.find(x => x.id === roleId);
            const note = body.querySelector("#p-note").value.trim();

            const r = await appliquer(
              { op: "promotion", uid: u.id, roleId, roleName: to ? to.name : roleId,
                par: me.pseudo, note, at: quand.toISOString() },
              () => MNStore.recordPromotion(u, roleId, draft.roles, me.pseudo, note,
                quand.toISOString()));
            if (!r.ok) return MNUI.toast("Promotion impossible : " + r.error, "err");

            close();
            MNUI.toast(u.pseudo + " passe " + (to ? to.name : roleId) +
              " (au " + quand.toLocaleDateString("fr-FR") + ")" + suite(r), "ok");
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
        '<div class="field"><label class="label" for="f-pseudo">Prénom &amp; Nom</label>' +
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
        "Les responsables peuvent le réafficher avec le bouton en bas de la liste.</p>" +

      '<label class="switch"><input type="checkbox" id="f-hors"' +
        (u.horsRecap ? " checked" : "") + ">" +
        '<span class="switch__box"></span><span>Sortir des comptes hebdomadaires</span></label>' +
      '<p class="hint">Ses heures ne pèsent plus sur le récapitulatif du dimanche ' +
        "ni sur le tableau des sept derniers jours, et il n'est jamais signalé pour " +
        "un minimum non atteint. Ses pointages restent au journal — c'est un relevé, " +
        "pas un classement." +
        (u.hidden
          ? " Ce compte est masqué : il en est déjà sorti de toute façon."
          : "") + "</p>";

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
          onClick: async close => {
            const pseudo = body.querySelector("#f-pseudo").value.trim();
            if (pseudo.length < 2) return MNUI.toast("Nom trop court", "err");
            if (draft.users.some(x => x.id !== u.id && x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return MNUI.toast("Ce nom est déjà pris", "err");
            }

            const champs = {
              pseudo,
              hiredAt: body.querySelector("#f-hired").value || u.hiredAt,
              trainings,
              note: body.querySelector("#f-note").value.trim(),
              active: u.id === me.uid ? true : body.querySelector("#f-active").checked,
              hidden: body.querySelector("#f-hidden").checked,
              horsRecap: body.querySelector("#f-hors").checked
            };

            /* On garde la personne à l'écran même si elle vient d'être masquée. */
            if (champs.hidden && !showHidden && canEdit) showHidden = true;

            const r = await appliquer(
              Object.assign({ op: "fiche", uid: u.id }, champs),
              () => Object.assign(u, champs));
            if (!r.ok) return MNUI.toast("Enregistrement impossible : " + r.error, "err");

            close();
            MNUI.toast("Fiche mise à jour" + suite(r), "ok");
          }
        }
      ]
    });
  }

  /* ---- Nouvel employé ------------------------------------------------------------ */

  function newUser() {
    /* Le dernier de la liste : c'est le bas de la hiérarchie, telle que
       l'atelier l'a rangée dans Admin → Rôles. Compter les permissions
       paraissait plus malin, mais donnait un choix imprévisible dès que deux
       grades en avaient autant — et pouvait proposer un administrateur. */
    const weakest = draft.roles[draft.roles.length - 1];

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="n-pseudo">Prénom &amp; Nom (sert à se connecter)</label>' +
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
          onClick: async close => {
            const pseudo = body.querySelector("#n-pseudo").value.trim();
            if (pseudo.length < 2) return MNUI.toast("Nom trop court", "err");
            if (draft.users.some(x => x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return MNUI.toast("Ce nom est déjà pris", "err");
            }
            const id = MNStore.uniqueId(pseudo, draft.users.map(x => x.id));
            const roleId = body.querySelector("#n-role").value;
            const pin = body.querySelector("#n-pin").value.trim();
            const rr = draft.roles.find(x => x.id === roleId);
            const hiredAt = body.querySelector("#n-hired").value || new Date().toISOString().slice(0, 10);

            const nouveau = {
              id, pseudo, roleId, active: true,
              pin: pin ? MNAuth.hashPin(id, pin) : null,
              createdAt: new Date().toISOString(),
              hiredAt,
              trainings: [],
              note: "",
              avertissements: [],
              depart: null,
              history: [{
                roleId, roleName: rr ? rr.name : roleId,
                at: new Date(hiredAt + "T12:00:00").toISOString(),
                by: me.pseudo, note: "Entrée dans l'entreprise"
              }]
            };
            sel = id;

            const r = await appliquer(
              { op: "recrue", user: nouveau },
              () => draft.users.push(nouveau));
            if (!r.ok) return MNUI.toast("Recrutement impossible : " + r.error, "err");

            close();
            MNUI.toast(pseudo + " a rejoint l'équipe" + suite(r), "ok");
          }
        }
      ]
    });
  }
})();
