/* ==========================================================================
   Page Contrats : la liste à gauche, le contrat ouvert à droite.

   Trois droits distincts s'y appliquent :
     contracts_view    lire, et sortir un PDF
     contracts         créer et modifier
     contracts_delete  supprimer

   Chaque ligne porte son propre prix et sa propre quantité : un contrat fige
   ce qui a été convenu. Les ressources à sortir, elles, sont recalculées
   depuis le catalogue du jour — c'est un fait d'atelier, pas un terme négocié.
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

  function liste() {
    const f = filter.trim().toLowerCase();
    return R().filter(k => {
      if (fEtat && k.etat !== fEtat) return false;
      if (!f) return true;
      return (k.titre + " " + k.client + " " + k.ref).toLowerCase().indexOf(f) !== -1;
    });
  }

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
        '<select class="select" id="c-etat" title="État" style="margin-top:6px">' +
          '<option value="">Tous les états</option>' +
          S().ETATS_CONTRAT.map(e =>
            '<option value="' + e + '"' + (fEtat === e ? " selected" : "") + ">" +
            esc(ETIQUETTES[e]) + "</option>").join("") +
        "</select>" +
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
    host.querySelector("#c-etat").addEventListener("change", e => {
      fEtat = e.target.value;
      renderList();
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
    return '<button class="staffrow' + (k.id === sel ? " is-active" : "") +
      '" data-c="' + esc(k.id) + '" type="button">' +
      '<span class="ctdot ctdot--' + k.etat + '" title="' + esc(ETIQUETTES[k.etat]) + '"></span>' +
      '<span class="staffrow__txt"><b>' + esc(k.titre || "Sans titre") + "</b>" +
        "<i>" + esc(k.client || "Client non renseigné") + "</i></span>" +
      '<span class="ctsum">' + esc(S().argent(t.argent)) + "</span>" +
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

    pane.innerHTML =
      '<div class="panel vcard">' +
        '<div class="panel__head">' +
          "<h2>" + esc(k.titre || "Sans titre") + "</h2>" +
          '<span class="permtag ct-' + k.etat + '">' + esc(ETIQUETTES[k.etat]) + "</span>" +
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
          '<div class="ctmeta">' +
            boite("Client", k.client) +
            boite("Référence", k.ref) +
            boite("Établi le", dateCourte(k.creeLe)) +
            boite("Par", k.creePar) +
          "</div>" +

          (k.lignes.length
            ? '<table class="cttable"><thead><tr>' +
                "<th>Prestation</th><th class=\"num\">Qté</th>" +
                "<th class=\"num\">Prix unitaire</th><th class=\"num\">Total</th>" +
              "</tr></thead><tbody>" +
              k.lignes.map(l =>
                "<tr><td>" + esc(l.name || "—") +
                  (l.itemId ? "" : ' <span class="permtag">ligne libre</span>') + "</td>" +
                  '<td class="num">' + l.qty + "</td>" +
                  '<td class="num">' + esc(S().argent(l.prix)) + "</td>" +
                  '<td class="num"><b>' + esc(S().argent(l.prix * l.qty)) + "</b></td></tr>").join("") +
              "</tbody></table>"
            : '<p class="hint">Aucune ligne. ' +
              (canEdit ? "Clique sur « Modifier » pour en ajouter." : "") + "</p>") +

          '<div class="cttotaux">' +
            '<div class="cttotal"><span>Total</span><b>' + esc(S().argent(t.argent)) + "</b></div>" +
            (t.secondes
              ? '<div class="cttotal"><span>Fabrication</span><b>' +
                esc(S().duree(t.secondes)) + "</b></div>"
              : "") +
            '<div class="cttotal"><span>Pièces</span><b>' + t.pieces + "</b></div>" +
          "</div>" +

          /* Le vrai intérêt du contrat : ce qu'il faudra sortir du stock. */
          '<div class="fieldset" style="margin-top:18px">' +
            '<span class="label">Ressources nécessaires en tout</span>' +
            (t.resources.length
              ? '<div class="reslist" style="margin-top:10px">' + t.resources.map(r =>
                  '<div class="res">' +
                    '<div class="res__ico" style="color:' + esc(r.resource.color) + '">' +
                      mnIcon(r.resource.icon) + "</div>" +
                    '<div class="res__txt"><b>' + esc(r.resource.name) + "</b><span>×" +
                      r.qty + "</span></div>" +
                  "</div>").join("") + "</div>"
              : '<p class="hint" style="margin-top:8px">Aucune : ce contrat ne contient que ' +
                "des lignes libres, sans objet du catalogue.</p>") +
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
      etat: "brouillon", lignes: []
    };
    /* Copie de travail : on ne touche au contrat qu'à l'enregistrement. */
    let lignes = cur.lignes.map(l => Object.assign({}, l));

    const items = S().catalog().items.filter(i => i.enabled);

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

      '<div class="editor__grid">' +
        '<div class="field"><label class="label" for="k-ref">Référence</label>' +
          '<input class="input mono" id="k-ref" maxlength="40" value="' + esc(cur.ref) + '"></div>' +
        '<div class="field"><label class="label" for="k-etat">État</label>' +
          '<select class="select" id="k-etat">' + S().ETATS_CONTRAT.map(e =>
            '<option value="' + e + '"' + (e === cur.etat ? " selected" : "") + ">" +
            esc(ETIQUETTES[e]) + "</option>").join("") + "</select></div>" +
      "</div>" +

      '<div class="fieldset"><span class="label">Lignes du contrat</span>' +
        '<p class="hint" style="margin-bottom:10px">Le prix et la quantité appartiennent au ' +
          "contrat : changer le catalogue plus tard ne réécrira pas ce qui a été convenu.</p>" +
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

    function peindre() {
      host.innerHTML = lignes.length
        ? lignes.map((l, i) =>
            '<div class="ctrow" data-i="' + i + '">' +
              (l.itemId
                ? '<select class="select" data-f="item">' + items.map(it =>
                    '<option value="' + esc(it.id) + '"' + (it.id === l.itemId ? " selected" : "") +
                    ">" + esc(it.name) + "</option>").join("") + "</select>"
                : '<input class="input" data-f="name" maxlength="120" value="' + esc(l.name) +
                  '" placeholder="Intitulé libre">') +
              '<input class="input input--num" data-f="qty" inputmode="numeric" ' +
                'title="Quantité" value="' + l.qty + '">' +
              '<input class="input input--num" data-f="prix" inputmode="decimal" ' +
                'title="Prix unitaire" value="' + l.prix + '">' +
              '<span class="ctrow__tot">' + esc(S().argent(l.prix * l.qty)) + "</span>" +
              '<button class="btn btn--icon" data-f="rm" type="button" title="Retirer">' +
                svg("x") + "</button>" +
            "</div>").join("")
        : '<p class="hint">Aucune ligne pour l\'instant.</p>';

      host.querySelectorAll(".ctrow").forEach(row => {
        const i = Number(row.dataset.i);
        const maj = () => {
          const q = row.querySelector('[data-f="qty"]');
          const p = row.querySelector('[data-f="prix"]');
          lignes[i].qty = Math.max(1, Math.min(9999, Math.round(Number(q.value) || 1)));
          lignes[i].prix = Math.max(0, Math.round((Number(String(p.value).replace(",", ".")) || 0) * 100) / 100);
          row.querySelector(".ctrow__tot").textContent = S().argent(lignes[i].prix * lignes[i].qty);
          majApercu();
        };
        row.querySelectorAll('[data-f="qty"],[data-f="prix"]').forEach(n =>
          n.addEventListener("input", maj));

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
      });
      majApercu();
    }

    /* Le total et les ressources suivent la saisie : c'est ce qu'on vient
       vérifier en montant un contrat. */
    function majApercu() {
      const t = S().contratTotaux({ lignes });
      apercu.innerHTML =
        '<div class="cttotal"><span>Total</span><b>' + esc(S().argent(t.argent)) + "</b></div>" +
        (t.secondes ? '<div class="cttotal"><span>Fabrication</span><b>' +
          esc(S().duree(t.secondes)) + "</b></div>" : "") +
        (t.resources.length
          ? '<div class="ctres">' + t.resources.map(r =>
              "<span>" + esc(r.resource.name) + " ×" + r.qty + "</span>").join("") + "</div>"
          : "");
    }

    body.querySelector("#k-add").addEventListener("click", () => {
      if (!items.length) return MNUI.toast("Aucun objet dans le catalogue", "err");
      const it = items[0];
      lignes.push({ itemId: it.id, name: it.name, qty: 1, prix: 0 });
      peindre();
    });
    body.querySelector("#k-add-libre").addEventListener("click", () => {
      lignes.push({ itemId: "", name: "", qty: 1, prix: 0 });
      peindre();
    });
    peindre();

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

    const lignes = k.lignes.map(l =>
      "<tr><td>" + esc(l.name || "—") + "</td>" +
        '<td class="n">' + l.qty + "</td>" +
        '<td class="n">' + esc(S().argent(l.prix)) + "</td>" +
        '<td class="n">' + esc(S().argent(l.prix * l.qty)) + "</td></tr>").join("");

    const res = t.resources.length
      ? t.resources.map(r => esc(r.resource.name) + " ×" + r.qty).join(" · ")
      : "aucune";

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
        "</div>" +

        (k.lignes.length
          ? "<table><thead><tr><th>Prestation</th><th class=\"n\">Qté</th>" +
            "<th class=\"n\">P.U.</th><th class=\"n\">Total</th></tr></thead>" +
            "<tbody>" + lignes + "</tbody></table>"
          : "<p class=\"vide\">Aucune prestation portée à ce contrat.</p>") +

        '<p class="somme">Total convenu <b>' + esc(S().argent(t.argent)) + "</b></p>" +

        '<div class="bloc">' +
          "<h3>Ce qu'il faudra sortir du stock</h3>" +
          "<p>" + res + "</p>" +
          (t.secondes ? "<p>Temps de fabrication cumulé : " + esc(S().duree(t.secondes)) + "</p>" : "") +
        "</div>" +

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

    ".somme{text-align:right;font-size:24px;margin:0 0 26px}",
    ".somme b{font-size:29px;border-bottom:3px double #4a3c28;padding-bottom:2px;margin-left:10px}",

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
