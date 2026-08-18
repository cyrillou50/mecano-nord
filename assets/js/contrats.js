/* ==========================================================================
   Page Contrats : la liste à gauche, le contrat ouvert à droite.

   Trois droits distincts s'y appliquent :
     contracts_view    lire, et sortir un PDF
     contracts         créer et modifier
     contracts_delete  supprimer

   Il n'y a pas d'argent ici : on troque. Chaque ligne dit ce que l'atelier
   fournit et ce que le client apporte en échange, et le contrat additionne
   les deux versants. Ce qui a été convenu est figé dans la ligne ; ce que
   l'atelier sortira du stock, lui, est recalculé depuis le catalogue du
   jour — c'est un fait d'atelier, pas un terme négocié.
   ========================================================================== */

(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const svg = MNUI.svg, esc = MNUI.esc;
  const S = () => MNStore;

  let me = null;
  let sel = null;
  let filter = "";
  let fEtat = "";
  let fType = "";
  let fExpire = "";
  let canEdit = false;
  let canDel = false;

  const R = () => MNRegistre.contrats();

  const ETIQUETTES = {
    brouillon: "Brouillon",
    actif: "En cours",
    termine: "Terminé",
    annule: "Annulé"
  };

  MNUI.start({ page: "contrats", title: "Contrats", onReady: init });

  async function init(session) {
    me = session;
    if (!MNAuth.canAny("contracts_view", "contracts", "contracts_delete", "admin")) return denied();

    canEdit = MNAuth.canAny("contracts", "admin");
    canDel = MNAuth.canAny("contracts_delete", "admin");

    await MNRegistre.load(true).catch(e => console.error(e));

    const first = liste()[0];
    sel = first ? first.id : null;
    render();

    /* Un contrat se modifie à plusieurs : on relit régulièrement, plus vite
       tant que la page est regardée. */
    MNUI.autoRefresh(async () => {
      await MNRegistre.load(true).catch(() => {});
      render();
    }, { vif: 20000, calme: 120000 });
  }

  function denied() {
    $("#ct-root").innerHTML =
      '<div class="denied"><div class="denied__in">' + svg("lock") +
        "<h2>Accès refusé</h2><p>Ton rôle (" + esc(me.role) + ") ne peut pas consulter " +
        "les contrats. Demande la permission « Lire les contrats » à un responsable.</p>" +
        '<a class="btn btn--primary" href="index.html">Retour à la facturation</a>' +
      "</div></div>";
  }

  /* ---- Données ------------------------------------------------------------- */

  const totaux = k => S().contratTotaux(k);

  /* Un filtre par type s'ajoute à celui d'état : deux listes courtes valent
     mieux qu'une seule qui mélangerait deux notions. */
  function liste() {
    const f = filter.trim().toLowerCase();
    return R().filter(k => {
      if (fEtat && k.etat !== fEtat) return false;
      if (fType && k.type !== fType) return false;
      if (fExpire === "oui" && !S().contratExpire(k)) return false;
      if (fExpire === "non" && S().contratExpire(k)) return false;
      if (!f) return true;
      return (k.titre + " " + k.client + " " + k.ref).toLowerCase().indexOf(f) !== -1;
    });
  }
  /* « 23 août 2026 » — un jour seul, sans heure : une expiration se lit en
     jours pleins. */
  const dateJour = j => {
    const d = new Date(String(j) + "T12:00:00");
    return isNaN(d) ? String(j) : d.toLocaleDateString("fr-FR",
      { day: "numeric", month: "long", year: "numeric" });
  };

  const dateCourte = iso => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /* ---- Rendu ---------------------------------------------------------------- */

  function render() {
    $("#ct-root").innerHTML =
      '<div class="wrap admin admin--staff">' +
        '<aside class="stafflist" id="c-list"></aside>' +
        '<section id="c-card"></section>' +
      "</div>";
    renderList();
    renderCard();
    renderDraftbar();
  }

  function renderDraftbar() {
    const bar = $("#draftbar");
    if (!bar) return;

    const s = MNRegistre.souci();
    if (s) {
      bar.hidden = false;
      bar.innerHTML = '<span class="draftbar__dot"></span>' +
        '<span class="draftbar__txt"><b>' + esc(s) + "</b> " +
        "<span>Les contrats affichés viennent du catalogue et peuvent être incomplets.</span></span>";
      return;
    }
    if (MNRegistre.surServeur() && MNRegistre.estDistant()) { bar.hidden = true; return; }

    bar.hidden = !MNStore.hasDraft();
    if (bar.hidden) return;
    bar.innerHTML =
      '<span class="draftbar__dot"></span>' +
      '<span class="draftbar__txt"><b>Contrats non publiés</b> ' +
        "<span>— sans serveur configuré, ils vivent dans le catalogue : personne ne les verra " +
        "tant qu'ils ne sont pas publiés.</span></span>" +
      (MNAuth.can("publish")
        ? '<a class="btn btn--primary btn--sm" href="admin.html">' + svg("cloud") + "<span>Publier</span></a>"
        : "");
  }

  function renderList() {
    const host = $("#c-list");
    const items = liste();

    host.innerHTML =
      '<div class="stafflist__top">' +
        '<input class="input" id="c-q" placeholder="Rechercher un contrat…" value="' + esc(filter) + '">' +
        '<div class="vfilters">' +
          '<select class="select" id="c-etat" title="État">' +
            '<option value="">Tous les états</option>' +
            S().ETATS_CONTRAT.map(e =>
              '<option value="' + e + '"' + (fEtat === e ? " selected" : "") + ">" +
              esc(ETIQUETTES[e]) + "</option>").join("") +
          "</select>" +
          '<select class="select" id="c-type" title="Type de contrat">' +
            '<option value="">Tous les types</option>' +
            S().contractTypes().map(t =>
              '<option value="' + esc(t.id) + '"' + (fType === t.id ? " selected" : "") + ">" +
              esc(t.name) + "</option>").join("") +
          "</select>" +
          '<select class="select" id="c-exp" title="Expiration" style="grid-column:1/-1">' +
            '<option value="">Expirés ou non</option>' +
            '<option value="non"' + (fExpire === "non" ? " selected" : "") + ">Encore valables</option>" +
            '<option value="oui"' + (fExpire === "oui" ? " selected" : "") + ">Expirés</option>" +
          "</select>" +
        "</div>" +
      "</div>" +

      '<div class="stafflist__body">' +
        (items.length
          ? items.map(ligne).join("")
          : '<p class="hint" style="padding:14px">Aucun contrat' +
            (filter || fEtat ? " ne correspond." : " pour le moment.") + "</p>") +
      "</div>" +

      '<div class="stafflist__foot">' +
        "<span>" + R().length + " contrat" + (R().length > 1 ? "s" : "") + "</span>" +
        '<span class="spacer"></span>' +
        (canEdit
          ? '<button class="btn btn--solid btn--sm" id="c-add">' + svg("plus") + "<span>Nouveau</span></button>"
          : "") +
      "</div>";

    const q = host.querySelector("#c-q");
    q.addEventListener("input", () => {
      filter = q.value;
      const pos = q.selectionStart;
      renderList();
      const n = $("#c-q");
      n.focus();
      n.setSelectionRange(pos, pos);
    });
    /* Les trois filtres se comportent pareil : on les branche d'un coup. */
    [["#c-etat", v => { fEtat = v; }], ["#c-type", v => { fType = v; }],
     ["#c-exp", v => { fExpire = v; }]].forEach(function (p) {
      const n = host.querySelector(p[0]);
      if (n) n.addEventListener("change", e => { p[1](e.target.value); renderList(); });
    });

    host.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => {
      sel = b.dataset.c;
      /* On ne reconstruit pas la liste : elle remonterait en haut. */
      host.querySelectorAll("[data-c]").forEach(x => x.classList.toggle("is-active", x === b));
      renderCard();
    }));

    const add = host.querySelector("#c-add");
    if (add) add.addEventListener("click", () => editContrat(null));
  }

  function ligne(k) {
    const t = totaux(k);
    const type = S().contractTypeById(k.type);
    const expire = S().contratExpire(k);
    return '<button class="staffrow' + (k.id === sel ? " is-active" : "") +
      '" data-c="' + esc(k.id) + '" type="button">' +
      '<span class="ctdot ctdot--' + k.etat + '" title="' + esc(ETIQUETTES[k.etat]) + '"></span>' +
      '<span class="staffrow__txt"><b>' + esc(k.titre || "Sans titre") +
        (expire ? ' <span class="ctperime">expiré</span>' : "") + "</b>" +
        "<i>" + esc([type ? type.name : "", k.client || "Client non renseigné"]
          .filter(Boolean).join(" · ")) + "</i></span>" +
      '<span class="ctsum">' + t.pieces + (t.pieces > 1 ? " pièces" : " pièce") + "</span>" +
    "</button>";
  }

  function renderCard() {
    const pane = $("#c-card");
    const k = R().find(x => x.id === sel);

    if (!k) {
      pane.innerHTML = '<div class="empty">' + svg("file") + "<b>Aucun contrat sélectionné</b>" +
        (canEdit ? "<p>Clique sur « Nouveau » pour en rédiger un.</p>" : "") + "</div>";
      return;
    }

    const t = totaux(k);
    const type = S().contractTypeById(k.type);
    const expire = S().contratExpire(k);
    const reste = S().joursAvant(k.expire);

    pane.innerHTML =
      '<div class="panel vcard">' +
        '<div class="panel__head">' +
          "<h2>" + esc(k.titre || "Sans titre") + "</h2>" +
          '<span class="permtag ct-' + k.etat + '">' + esc(ETIQUETTES[k.etat]) + "</span>" +
          (type ? '<span class="permtag">' + esc(type.name) + "</span>" : "") +
          '<span class="spacer"></span>' +
          '<button class="btn btn--ghost btn--sm" id="c-pdf">' + svg("file") + "<span>PDF</span></button>" +
          (canEdit
            ? '<button class="btn btn--ghost btn--sm" id="c-edit">' + svg("edit") + "<span>Modifier</span></button>"
            : "") +
          (canDel
            ? '<button class="btn btn--icon" id="c-del" title="Supprimer">' + svg("trash") + "</button>"
            : "") +
        "</div>" +

        '<div class="panel__body">' +
          /* Une expiration passée se dit en clair, en haut : c'est ce qui
             change la conduite a tenir sur le contrat. */
          (expire
            ? '<div class="alert alert--warn" style="margin-bottom:16px">' + svg("alert") +
              "<span><b>Contrat expiré</b> — la date du " + esc(dateJour(k.expire)) +
              " est passée depuis " + Math.abs(reste) + " jour" +
              (Math.abs(reste) > 1 ? "s" : "") + ".</span></div>"
            : "") +

          '<div class="ctmeta">' +
            boite("Client", k.client) +
            boite("Type", type ? type.name : (k.type || "")) +
            boite("Référence", k.ref) +
            boite("Établi le", dateCourte(k.creeLe)) +
            boite("Expire le", k.expire ? dateJour(k.expire) : "") +
            boite("Par", k.creePar) +
          "</div>" +

          (k.lignes.length
            ? '<table class="cttable"><thead><tr>' +
                "<th>Prestation</th><th class=\"num\">Qté</th>" +
                "<th class=\"num\">Demandé / unité</th><th class=\"num\">Total demandé</th>" +
              "</tr></thead><tbody>" +
              k.lignes.map(l =>
                "<tr><td>" + esc(l.name || "—") +
                  (l.itemId ? "" : ' <span class="permtag">ligne libre</span>') + "</td>" +
                  '<td class="num">' + l.qty + "</td>" +
                  '<td class="num">' + esc(troc(l)) + "</td>" +
                  '<td class="num"><b>' + esc(troc(l, l.qty)) + "</b></td></tr>").join("") +
              "</tbody></table>"
            : '<p class="hint">Aucune ligne. ' +
              (canEdit ? "Clique sur « Modifier » pour en ajouter." : "") + "</p>") +

          '<div class="cttotaux">' +
            '<div class="cttotal"><span>Pièces</span><b>' + t.pieces + "</b></div>" +
            (t.secondes
              ? '<div class="cttotal"><span>Fabrication</span><b>' +
                esc(S().duree(t.secondes)) + "</b></div>"
              : "") +
          "</div>" +

          /* Les deux versants du troc, côte à côte : c'est ce qu'on vient
             lire sur un contrat. */
          '<div class="ctpaires">' +
            versant("Le client apporte", t.demande,
              "Aucune contrepartie n'a été convenue sur ce contrat.") +
            versant("L'atelier sort du stock", t.resources,
              "Rien : ce contrat ne porte que des lignes libres.") +
          "</div>" +

          (k.note
            ? '<div class="fieldset" style="margin-top:16px"><span class="label">Note</span>' +
              '<p class="hint" style="margin-top:8px;white-space:pre-wrap">' + esc(k.note) + "</p></div>"
            : "") +

          (k.majLe
            ? '<p class="hint" style="margin-top:16px">Dernière modification ' +
              esc(dateCourte(k.majLe)) + (k.majPar ? " par " + esc(k.majPar) : "") + ".</p>"
            : "") +
        "</div>" +
      "</div>";

    $("#c-pdf").addEventListener("click", () => imprimer(k));
    const e = $("#c-edit");
    if (e) e.addEventListener("click", () => editContrat(k));
    const d = $("#c-del");
    if (d) d.addEventListener("click", () => supprimer(k));
  }

  const boite = (label, valeur) =>
    '<div class="vbox' + (valeur ? "" : " vbox--vide") + '"><span class="vbox__l">' +
      esc(label) + "</span><b>" + (valeur ? esc(valeur) : "—") + "</b></div>";

  /**
   * La contrepartie d'une ligne, « Métal ×20 · Essence ×5 ».
   * `fois` multiplie par la quantité fournie : la demande est convenue à
   * l'unité, comme l'était un prix unitaire.
   */
  function troc(l, fois) {
    const d = l.demande || [];
    if (!d.length) return "—";
    return d.map(x => {
      const r = S().resourceById(x.resId);
      return (r ? r.name : x.resId) + " ×" + S().nombre(x.qty * (fois || 1));
    }).join(" · ");

  }
  /** Un versant du troc : son intitulé et la liste des ressources. */
  const versant = (titre, liste, vide) =>
    '<div class="ctversant"><span class="label">' + esc(titre) + "</span>" +
      (liste.length
        ? '<div class="reslist">' + liste.map(r =>
            '<div class="res">' +
              '<div class="res__ico" style="color:' + esc(r.resource.color) + '">' +
                mnIcon(r.resource.icon) + "</div>" +
              '<div class="res__txt"><b>' + esc(r.resource.name) + "</b><span>×" +
                S().nombre(r.qty) + "</span></div>" +
            "</div>").join("") + "</div>"
        : '<p class="hint">' + esc(vide) + "</p>") +
    "</div>";

  /* ---- Édition -------------------------------------------------------------- */

  function nouvelleRef() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return "CT-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function editContrat(k) {
    const isNew = !k;
    const cur = k ? S().clone(k) : {
      id: "", ref: nouvelleRef(), titre: "", client: "", note: "",
      type: "", expire: null, etat: "brouillon", lignes: []
    };
    /* Copie de travail : on ne touche au contrat qu'à l'enregistrement. */
    /* Copie profonde : la liste des ressources demandées est un tableau, un
       Object.assign le partagerait avec le contrat d'origine. */
    let lignes = S().clone(cur.lignes).map(l =>
      Object.assign({ demande: [] }, l, { demande: (l.demande || []).slice() }));

    const items = S().catalog().items.filter(i => i.enabled);
    const ressources = S().catalog().resources;

    const body = document.createElement("div");
    body.className = "editor";
    body.innerHTML =
      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="k-titre">Objet du contrat</label>' +
          '<input class="input" id="k-titre" maxlength="120" value="' + esc(cur.titre) +
            '" placeholder="Ex. Remise en état du convoi"></div>' +
        '<div class="field"><label class="label" for="k-client">Client</label>' +
          '<input class="input" id="k-client" maxlength="80" value="' + esc(cur.client) + '"></div>' +
      "</div>" +

      '<div class="editor__grid editor__grid--3">' +
        '<div class="field"><label class="label" for="k-ref">Référence</label>' +
          '<input class="input mono" id="k-ref" maxlength="40" value="' + esc(cur.ref) + '"></div>' +
        '<div class="field"><label class="label" for="k-type">Type</label>' +
          '<select class="select" id="k-type">' +
            '<option value="">— non précisé</option>' +
            S().contractTypes().map(t =>
              '<option value="' + esc(t.id) + '"' + (t.id === cur.type ? " selected" : "") +
              ' data-jours="' + t.jours + '">' + esc(t.name) + "</option>").join("") +
          "</select></div>" +
        '<div class="field"><label class="label" for="k-etat">État</label>' +
          '<select class="select" id="k-etat">' + S().ETATS_CONTRAT.map(e =>
            '<option value="' + e + '"' + (e === cur.etat ? " selected" : "") + ">" +
            esc(ETIQUETTES[e]) + "</option>").join("") + "</select></div>" +
      "</div>" +

      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="k-expire">Expire le (facultatif)</label>' +
          '<input class="input" type="date" id="k-expire" value="' + esc(cur.expire || "") + '">' +
          '<p class="hint" id="k-expire-aide"></p></div>' +
        '<div class="field"><label class="label" for="k-client2">&nbsp;</label>' +
          '<p class="hint">Un type peut proposer une durée : la choisir remplit la date, ' +
            "qui reste modifiable.</p></div>" +
      "</div>" +

      '<div class="fieldset"><span class="label">Lignes du contrat</span>' +
        '<p class="hint" style="margin-bottom:10px">Pour chaque ligne : ce que l\'atelier ' +
          "fournit, et ce que le client apporte en échange — une ressource, par unité. " +
          "Ce troc appartient au contrat : changer le catalogue plus tard ne réécrira pas " +
          "ce qui a été convenu.</p>" +
        '<div id="k-lignes"></div>' +
        '<div class="row" style="margin-top:10px">' +
          '<button class="btn btn--ghost btn--sm" id="k-add" type="button">' + svg("plus") +
            "<span>Ajouter un objet</span></button>" +
          '<button class="btn btn--ghost btn--sm" id="k-add-libre" type="button">' + svg("plus") +
            "<span>Ligne libre</span></button>" +
        "</div>" +
        '<div class="ctapercu" id="k-apercu"></div>' +
      "</div>" +

      '<div class="field"><label class="label" for="k-note">Note</label>' +
        '<textarea class="textarea" id="k-note" maxlength="2000" ' +
          'placeholder="Conditions, délais, remarques…">' + esc(cur.note) + "</textarea></div>";

    const host = body.querySelector("#k-lignes");
    const apercu = body.querySelector("#k-apercu");

    /* Une ligne tient sur deux étages : la prestation en haut, la contrepartie
       en dessous. Tout mettre sur une rangée marchait tant qu'on ne demandait
       qu'une ressource ; à trois, les colonnes devenaient illisibles. */
    function peindre() {
      host.innerHTML = lignes.length
        ? lignes.map((l, i) =>
            '<div class="ctligne" data-i="' + i + '">' +
              '<div class="ctligne__haut">' +
                (l.itemId
                  ? '<select class="select" data-f="item">' + items.map(it =>
                      '<option value="' + esc(it.id) + '"' + (it.id === l.itemId ? " selected" : "") +
                      ">" + esc(it.name) + "</option>").join("") + "</select>"
                  : '<input class="input" data-f="name" maxlength="120" value="' + esc(l.name) +
                    '" placeholder="Intitulé libre">') +
                '<input class="input input--num" data-f="qty" inputmode="numeric" ' +
                  'title="Quantité fournie" value="' + l.qty + '">' +
                '<button class="btn btn--icon" data-f="rm" type="button" title="Retirer la ligne">' +
                  svg("x") + "</button>" +
              "</div>" +

              '<div class="ctligne__troc">' +
                '<span class="ctligne__lbl">En échange</span>' +
                '<div class="ctdemandes">' +
                  (l.demande.length
                    ? l.demande.map((d, j) =>
                        '<div class="ctdemande" data-j="' + j + '">' +
                          '<select class="select" data-f="res">' +
                            ressources.map(r => '<option value="' + esc(r.id) + '"' +
                              (r.id === d.resId ? " selected" : "") + ">" + esc(r.name) +
                              "</option>").join("") +
                          "</select>" +
                          '<input class="input input--num" data-f="resqty" inputmode="numeric" ' +
                            'title="Par unité fournie" value="' + d.qty + '">' +
                          '<button class="btn btn--icon" data-f="rmres" type="button" ' +
                            'title="Retirer cette ressource">' + svg("x") + "</button>" +
                        "</div>").join("")
                    : '<p class="hint">Rien de demandé sur cette ligne.</p>') +
                "</div>" +
                '<div class="ctligne__pied">' +
                  '<button class="btn btn--ghost btn--sm" data-f="addres" type="button">' +
                    svg("plus") + "<span>Ressource</span></button>" +
                  '<span class="ctrow__tot">' + esc(troc(l, l.qty)) + "</span>" +
                "</div>" +
              "</div>" +
            "</div>").join("")
        : '<p class="hint">Aucune ligne pour l\'instant.</p>';

      host.querySelectorAll(".ctligne").forEach(row => {
        const i = Number(row.dataset.i);

        const majTotal = () => {
          row.querySelector(".ctrow__tot").textContent = troc(lignes[i], lignes[i].qty);
          majApercu();
        };

        const q = row.querySelector('[data-f="qty"]');
        q.addEventListener("input", () => {
          lignes[i].qty = Math.max(1, Math.min(9999, Math.round(Number(q.value) || 1)));
          majTotal();
        });

        const it = row.querySelector('[data-f="item"]');
        if (it) it.addEventListener("change", () => {
          const choisi = items.find(x => x.id === it.value);
          lignes[i].itemId = it.value;
          lignes[i].name = choisi ? choisi.name : "";
          majApercu();
        });
        const nm = row.querySelector('[data-f="name"]');
        if (nm) nm.addEventListener("input", () => { lignes[i].name = nm.value; });

        row.querySelector('[data-f="rm"]').addEventListener("click", () => {
          lignes.splice(i, 1);
          peindre();
        });

        row.querySelector('[data-f="addres"]').addEventListener("click", () => {
          if (!ressources.length) return MNUI.toast("Aucune ressource au catalogue", "err");
          /* On propose une ressource encore libre : deux fois la même sur une
             ligne se cumulerait à l'enregistrement, ce qui surprendrait. */
          const pris = lignes[i].demande.map(d => d.resId);
          const libre = ressources.find(r => pris.indexOf(r.id) === -1);
          if (!libre) return MNUI.toast("Toutes les ressources sont déjà demandées", "info");
          lignes[i].demande.push({ resId: libre.id, qty: 1 });
          peindre();
        });

        row.querySelectorAll(".ctdemande").forEach(bloc => {
          const j = Number(bloc.dataset.j);
          const res = bloc.querySelector('[data-f="res"]');
          const rq = bloc.querySelector('[data-f="resqty"]');
          const maj = () => {
            lignes[i].demande[j] = {
              resId: res.value,
              qty: Math.max(0, Math.min(99999, Math.round(Number(rq.value) || 0)))
            };
            majTotal();
          };
          res.addEventListener("change", maj);
          rq.addEventListener("input", maj);
          bloc.querySelector('[data-f="rmres"]').addEventListener("click", () => {
            lignes[i].demande.splice(j, 1);
            peindre();
          });
        });
      });
      majApercu();
    }

    /* Les deux versants suivent la saisie : c'est ce qu'on vient vérifier en
       montant un contrat — ce qu'on reçoit contre ce qu'on sort. */
    function majApercu() {
      const t = S().contratTotaux({ lignes });
      const tas = (titre, liste) => liste.length
        ? '<div class="ctres"><i>' + titre + "</i>" + liste.map(r =>
            "<span>" + esc(r.resource.name) + " ×" + S().nombre(r.qty) + "</span>").join("") + "</div>"
        : "";
      apercu.innerHTML =
        '<div class="cttotal"><span>Pièces</span><b>' + t.pieces + "</b></div>" +
        (t.secondes ? '<div class="cttotal"><span>Fabrication</span><b>' +
          esc(S().duree(t.secondes)) + "</b></div>" : "") +
        tas("On reçoit", t.demande) +
        tas("On sort", t.resources);
    }

    body.querySelector("#k-add").addEventListener("click", () => {
      if (!items.length) return MNUI.toast("Aucun objet dans le catalogue", "err");
      const it = items[0];
      lignes.push({ itemId: it.id, name: it.name, qty: 1, demande: [] });
      peindre();
    });
    body.querySelector("#k-add-libre").addEventListener("click", () => {
      lignes.push({ itemId: "", name: "", qty: 1, demande: [] });
      peindre();
    });
    peindre();

    /* Choisir un type qui porte une durée remplit la date d'expiration, tant
       qu'on n'y a pas touché soi-même : la proposition aide, elle ne décide
       pas à la place. */
    const champExpire = body.querySelector("#k-expire");
    const aide = body.querySelector("#k-expire-aide");
    let dateTouchee = !!cur.expire;

    function majAide() {
      const v = champExpire.value;
      if (!v) { aide.textContent = "Sans date, le contrat ne périme jamais."; return; }
      const n = S().joursAvant(v);
      aide.textContent = n < 0
        ? "Déjà passée depuis " + Math.abs(n) + " jour" + (Math.abs(n) > 1 ? "s" : "") + "."
        : n === 0 ? "Expire aujourd'hui."
        : "Dans " + n + " jour" + (n > 1 ? "s" : "") + ".";
    }
    champExpire.addEventListener("input", () => { dateTouchee = true; majAide(); });

    body.querySelector("#k-type").addEventListener("change", e => {
      const opt = e.target.selectedOptions[0];
      const jours = Number(opt && opt.dataset.jours) || 0;
      if (!jours || dateTouchee) return;
      const d = new Date();
      d.setDate(d.getDate() + jours);
      champExpire.value = S().jourLocal(d);
      majAide();
    });
    majAide();

    MNUI.modal({
      title: isNew ? "Nouveau contrat" : "Modifier le contrat",
      body, wide: true,
      actions: [
        { label: "Annuler", variant: "btn--ghost", onClick: c => c() },
        {
          label: "Enregistrer", variant: "btn--primary", icon: "save",
          onClick: async (close, b, btn) => {
            const g = s => body.querySelector(s).value.trim();
            const titre = g("#k-titre");
            if (!titre) return MNUI.toast("L'objet du contrat est obligatoire", "err");

            const propres = lignes.filter(l => l.itemId || String(l.name).trim());
            const maintenant = new Date().toISOString();

            const data = {
              id: cur.id || S().uniqueId(titre, R().map(x => x.id)),
              ref: g("#k-ref") || nouvelleRef(),
              titre,
              client: g("#k-client"),
              note: g("#k-note"),
              type: body.querySelector("#k-type").value,
              expire: body.querySelector("#k-expire").value || null,
              etat: body.querySelector("#k-etat").value,
              lignes: propres,
              creePar: cur.creePar || me.pseudo,
              creeLe: cur.creeLe || maintenant,
              majPar: me.pseudo,
              majLe: maintenant
            };

            btn.disabled = true;
            btn.innerHTML = svg("refresh") + "<span>Un instant…</span>";
            const r = await MNRegistre.setContrat(data);
            if (!r.ok) {
              btn.disabled = false;
              btn.innerHTML = svg("save") + "<span>Enregistrer</span>";
              return MNUI.toast(r.error || "Enregistrement impossible", "err");
            }
            sel = data.id;
            close();
            render();
            MNUI.toast(isNew ? "Contrat créé" : "Contrat mis à jour", "ok");
          }
        }
      ]
    });
  }

  async function supprimer(k) {
    const ok = await MNUI.confirm({
      title: "Supprimer le contrat",
      message: "« " + (k.titre || "Sans titre") + " » sera définitivement supprimé. " +
        "Rien ne le récupère.",
      confirmLabel: "Supprimer", danger: true
    });
    if (!ok) return;
    const r = await MNRegistre.removeContrat(k.id);
    if (!r.ok) return MNUI.toast(r.error || "Suppression impossible", "err");
    if (sel === k.id) { const f = liste()[0]; sel = f ? f.id : null; }
    render();
    MNUI.toast("Contrat supprimé", "ok");
  }

  /* ---- Sortie papier ----------------------------------------------------------
     Une fenêtre à part plutôt qu'une feuille de style d'impression : le
     document est autonome, rien de l'application ne peut déteindre dessus, et
     « Enregistrer au format PDF » de la boîte d'impression suffit à en faire
     un fichier. Aucune bibliothèque à embarquer. */

  function imprimer(k) {
    const t = totaux(k);
    const b = S().brand();
    const type = S().contractTypeById(k.type);

    const lignes = k.lignes.map(l =>
      "<tr><td>" + esc(l.name || "—") + "</td>" +
        '<td class="n">' + l.qty + "</td>" +
        '<td class="n">' + esc(troc(l, l.qty)) + "</td></tr>").join("");

    const tas = liste => liste.length
      ? liste.map(r => esc(r.resource.name) + " ×" + S().nombre(r.qty)).join(" · ")
      : "rien";

    const doc =
      "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\">" +
      "<title>" + esc(k.ref || "Contrat") + " — " + esc(k.titre || "") + "</title>" +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
        "family=Caveat:wght@400;600;700&family=Special+Elite&display=swap\">" +
      "<style>" + STYLE_PAPIER + "</style></head><body>" +

      '<div class="feuille">' +
        '<div class="tampon">' + esc(ETIQUETTES[k.etat]) + "</div>" +

        '<header class="tete">' +
          "<h1>" + esc(b.name) + "</h1>" +
          '<p class="sous">' + esc(b.tagline) + "</p>" +
          '<p class="ref">Contrat n° ' + esc(k.ref || "—") + "</p>" +
        "</header>" +

        '<h2 class="objet">' + esc(k.titre || "Sans titre") + "</h2>" +

        '<div class="parties">' +
          "<p><span>Client</span> " + esc(k.client || "—") + "</p>" +
          "<p><span>Établi par</span> " + esc(k.creePar || "—") + "</p>" +
          "<p><span>Le</span> " + esc(dateCourte(k.creeLe) || dateCourte(new Date().toISOString())) + "</p>" +
          (type ? "<p><span>Type</span> " + esc(type.name) + "</p>" : "") +
          (k.expire ? "<p><span>Expire le</span> " + esc(dateJour(k.expire)) +
            (S().contratExpire(k) ? " (dépassée)" : "") + "</p>" : "") +
        "</div>" +

        (k.lignes.length
          ? "<table><thead><tr><th>Ce que l'atelier fournit</th><th class=\"n\">Qté</th>" +
            "<th class=\"n\">En échange de</th></tr></thead>" +
            "<tbody>" + lignes + "</tbody></table>"
          : "<p class=\"vide\">Aucune prestation portée à ce contrat.</p>") +

        '<div class="troc">' +
          '<div><h3>Le client apporte</h3><p>' + tas(t.demande) + "</p></div>" +
          '<div><h3>L\'atelier sort du stock</h3><p>' + tas(t.resources) + "</p></div>" +
        "</div>" +

        (t.secondes
          ? '<div class="bloc"><h3>Temps de fabrication</h3><p>' +
            esc(S().duree(t.secondes)) + "</p></div>"
          : "") +

        (k.note ? '<div class="bloc"><h3>Notes</h3><p>' + esc(k.note) + "</p></div>" : "") +

        '<div class="signatures">' +
          "<div><span>Le client</span></div>" +
          "<div><span>Pour l'atelier</span><i>" + esc(k.creePar || "") + "</i></div>" +
        "</div>" +
      "</div>" +

      "<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script>" +
      "</body></html>";

    const w = window.open("", "_blank");
    if (!w) {
      return MNUI.toast("Ton navigateur a bloqué la fenêtre. Autorise les pop-ups pour ce site.", "err");
    }
    w.document.open();
    w.document.write(doc);
    w.document.close();
  }

  /* Papier vieilli, encre manuscrite. Tout est dessiné en CSS : aucune image à
     charger, donc rien à héberger ni à attendre à l'impression. */
  const STYLE_PAPIER = [
    "*{box-sizing:border-box}",
    "html,body{margin:0;padding:0;background:#3a352c}",
    "body{font-family:'Caveat',cursive;color:#241d14;padding:28px}",

    ".feuille{position:relative;max-width:760px;margin:0 auto;padding:52px 56px 64px;",
    "background:#e8dcc0;",
    /* Taches et usure : des dégradés radiaux, pas des images. */
    "background-image:",
    "radial-gradient(ellipse at 12% 8%,rgba(120,90,40,.20),transparent 42%),",
    "radial-gradient(ellipse at 88% 22%,rgba(90,70,30,.16),transparent 38%),",
    "radial-gradient(circle at 74% 82%,rgba(110,80,35,.22),transparent 26%),",
    "radial-gradient(ellipse at 30% 96%,rgba(80,60,25,.18),transparent 34%);",
    "box-shadow:0 2px 0 rgba(0,0,0,.25),0 18px 50px rgba(0,0,0,.55);}",
    /* Bord déchiré, obtenu par un tracé irrégulier. */
    ".feuille::after{content:'';position:absolute;inset:0;pointer-events:none;",
    "box-shadow:inset 0 0 60px rgba(70,50,20,.35),inset 0 0 12px rgba(60,42,16,.3);}",

    ".tampon{position:absolute;top:38px;right:44px;",
    "font-family:'Special Elite',monospace;font-size:15px;letter-spacing:.22em;",
    "text-transform:uppercase;color:#8d2b2b;border:3px double #8d2b2b;",
    "padding:7px 14px;transform:rotate(-9deg);opacity:.72;}",

    ".tete{text-align:center;border-bottom:2px solid #4a3c28;padding-bottom:14px;margin-bottom:22px}",
    ".tete h1{font-family:'Special Elite',monospace;font-size:27px;margin:0;",
    "letter-spacing:.12em;text-transform:uppercase}",
    ".tete .sous{margin:4px 0 0;font-size:17px;opacity:.7}",
    ".tete .ref{font-family:'Special Elite',monospace;font-size:12px;margin:10px 0 0;",
    "letter-spacing:.16em;opacity:.75}",

    ".objet{font-size:31px;margin:0 0 16px;font-weight:700;text-align:center;",
    "text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px}",

    ".parties{display:flex;flex-wrap:wrap;gap:6px 30px;font-size:20px;margin-bottom:22px}",
    ".parties p{margin:0}",
    ".parties span{font-family:'Special Elite',monospace;font-size:11px;",
    "letter-spacing:.14em;text-transform:uppercase;opacity:.65;margin-right:6px}",

    "table{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:20px}",
    "th{font-family:'Special Elite',monospace;font-size:11px;letter-spacing:.13em;",
    "text-transform:uppercase;text-align:left;border-bottom:2px solid #4a3c28;",
    "padding:6px 8px;opacity:.8}",
    "td{padding:7px 8px;border-bottom:1px dashed rgba(74,60,40,.45)}",
    ".n{text-align:right;white-space:nowrap}",

    /* Les deux versants du troc, cote a cote : c est le coeur du contrat. */
    ".troc{display:flex;gap:34px;margin:22px 0 24px;",
    "border-top:2px solid #4a3c28;border-bottom:2px solid #4a3c28;padding:14px 0}",
    ".troc>div{flex:1}",
    ".troc p{margin:0;font-size:21px}",
    ".troc h3{font-family:'Special Elite',monospace;font-size:11px;letter-spacing:.14em;",
    "text-transform:uppercase;margin:0 0 5px;opacity:.7}",

    ".bloc{margin-bottom:20px}",
    ".bloc h3{font-family:'Special Elite',monospace;font-size:11px;letter-spacing:.14em;",
    "text-transform:uppercase;margin:0 0 5px;opacity:.7}",
    ".bloc p{margin:0;font-size:19px;white-space:pre-wrap}",
    ".vide{font-size:19px;opacity:.7}",

    ".signatures{display:flex;gap:40px;margin-top:52px}",
    ".signatures div{flex:1;border-top:1px solid #4a3c28;padding-top:6px}",
    ".signatures span{font-family:'Special Elite',monospace;font-size:10px;",
    "letter-spacing:.14em;text-transform:uppercase;opacity:.65}",
    ".signatures i{display:block;font-style:normal;font-size:26px;margin-top:8px;",
    "transform:rotate(-3deg)}",

    /* À l'impression : le fond doit sortir, sinon le papier vieilli disparaît
       et il ne reste qu'un tableau blanc. */
    "@media print{",
    "html,body{background:#fff;padding:0}",
    ".feuille{max-width:none;margin:0;box-shadow:none}",
    "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    "@page{margin:12mm}",
    "}"
  ].join("");
})();
