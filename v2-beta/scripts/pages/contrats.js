/* ==========================================================================
   Contrats — le registre à gauche, le contrat ouvert à droite.

   Reprise fidèle de la V1 : trois droits distincts, troc en ressources (il
   n'y a pas d'argent), type, expiration, et la sortie papier manuscrite.

   Ce qui change : les lignes du contrat se saisissent dans un tableau qui se
   retourne en fiches sur téléphone, au lieu d'une grille à colonnes fixes qui
   devenait illisible dès trois ressources demandées.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  const ETATS = { brouillon: "Brouillon", actif: "En cours",
                  termine: "Terminé", annule: "Annulé" };
  const TON = { brouillon: "", actif: "succes", termine: "action", annule: "erreur" };

  let hote = null, moi = null, sel = null;
  let q = "", fEtat = "", fType = "", fExp = "";
  let peutEcrire = false, peutSupprimer = false;

  const R = () => MNRegistre.contrats();

  V2Shell.demarrer({
    page: "contrats",
    titre: "Contrats",
    pret: async function (session, h) {
      hote = h; moi = session;
      if (!V2Shell.peut("contracts_view", "contracts", "contracts_delete", "admin")) {
        return V2Shell.refuser(hote, "les contrats");
      }
      peutEcrire = V2Shell.peut("contracts", "admin");
      peutSupprimer = V2Shell.peut("contracts_delete", "admin");

      hote.innerHTML = U.squelette(5);
      await MNRegistre.load(true).catch(e => console.error(e));

      const premier = liste()[0];
      sel = premier ? premier.id : null;
      dessiner();
    }
  });

  /* ---- Données ------------------------------------------------------------- */

  const totaux = k => MNStore.contratTotaux(k);

  function liste() {
    const f = q.trim().toLowerCase();
    return R().filter(k => {
      if (fEtat && k.etat !== fEtat) return false;
      if (fType && k.type !== fType) return false;
      if (fExp === "oui" && !MNStore.contratExpire(k)) return false;
      if (fExp === "non" && MNStore.contratExpire(k)) return false;
      if (!f) return true;
      return (k.titre + " " + k.client + " " + k.ref).toLowerCase().indexOf(f) !== -1;
    });
  }

  const dateJour = j => {
    const d = new Date(String(j) + "T12:00:00");
    return isNaN(d) ? String(j)
      : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };
  const dateCourte = iso => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("fr-FR",
      { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /** La contrepartie d'une ligne : « Métal ×20 · Essence ×5 ». */
  function troc(l, fois) {
    const d = l.demande || [];
    if (!d.length) return "—";
    return d.map(x => {
      const r = MNStore.resourceById(x.resId);
      return (r ? r.name : x.resId) + " ×" + MNStore.nombre(x.qty * (fois || 1));
    }).join(" · ");
  }

  /* ---- Rendu ---------------------------------------------------------------- */

  function dessiner() {
    hote.innerHTML =
      '<div class="duo">' +
        '<aside class="duo__liste" id="c-liste"></aside>' +
        '<section class="duo__fiche" id="c-fiche"></section>' +
      "</div>";
    dessinerListe();
    dessinerFiche();

    const s = MNRegistre.souci();
    if (s) hote.insertAdjacentHTML("afterbegin",
      '<div style="margin-bottom:var(--e-4)">' +
        U.alerte({ ton: "alerte", titre: s,
          texte: "Les contrats affichés viennent du catalogue et peuvent être incomplets." }) +
      "</div>");
  }

  function dessinerListe() {
    const l = liste();
    $("#c-liste").innerHTML =
      '<div class="duo__filtres">' +
        '<input class="saisie" id="c-q" type="search" placeholder="Chercher…" value="' +
          U.esc(q) + '" autocomplete="off">' +
        '<div class="duo__selects">' +
          sel2("c-etat", fEtat, [{ valeur: "", nom: "Tous les états" }]
            .concat(MNStore.ETATS_CONTRAT.map(e => ({ valeur: e, nom: ETATS[e] })))) +
          sel2("c-type", fType, [{ valeur: "", nom: "Tous les types" }]
            .concat(MNStore.contractTypes().map(t => ({ valeur: t.id, nom: t.name })))) +
          sel2("c-exp", fExp, [{ valeur: "", nom: "Expirés ou non" },
            { valeur: "non", nom: "Encore valables" }, { valeur: "oui", nom: "Expirés" }]) +
        "</div>" +
      "</div>" +
      '<div class="duo__corps">' +
        (l.length ? l.map(ligne).join("")
          : '<p class="champ__aide" style="padding:var(--e-3)">Aucun contrat ne correspond.</p>') +
      "</div>" +
      '<div class="duo__pied">' +
        '<span class="muet txt-sm">' + R().length + " contrat" + (R().length > 1 ? "s" : "") + "</span>" +
        (peutEcrire ? '<span class="pousse">' + U.bouton("Nouveau",
          { variante: "principal", taille: "sm", icone: "plus", action: "add" }) + "</span>" : "") +
      "</div>";
    brancherListe();
  }

  const sel2 = (id, val, opts) =>
    '<select class="liste" id="' + id + '">' + opts.map(o =>
      '<option value="' + U.esc(o.valeur) + '"' + (o.valeur === val ? " selected" : "") + ">" +
      U.esc(o.nom) + "</option>").join("") + "</select>";

  function ligne(k) {
    const t = totaux(k);
    const type = MNStore.contractTypeById(k.type);
    const expire = MNStore.contratExpire(k);
    return '<button class="duo__item' + (k.id === sel ? " is-actif" : "") +
      '" data-c="' + U.esc(k.id) + '">' +
      '<span class="c-point c-point--' + k.etat + '" title="' + U.esc(ETATS[k.etat]) + '"></span>' +
      '<span class="duo__txt"><b class="tronque">' + U.esc(k.titre || "Sans titre") +
        (expire ? ' <span class="c-perime">expiré</span>' : "") + "</b>" +
        '<span class="tronque">' + U.esc([type ? type.name : "",
          k.client || "Client non renseigné"].filter(Boolean).join(" · ")) + "</span></span>" +
      '<span class="muet txt-xs nombre">' + t.pieces + "</span>" +
    "</button>";
  }

  function brancherListe() {
    const champ = $("#c-q");
    champ.addEventListener("input", () => {
      q = champ.value;
      const pos = champ.selectionStart;
      dessinerListe();
      const n = $("#c-q"); n.focus(); n.setSelectionRange(pos, pos);
    });
    [["#c-etat", v => { fEtat = v; }], ["#c-type", v => { fType = v; }],
     ["#c-exp", v => { fExp = v; }]].forEach(p => {
      const n = $(p[0]);
      if (n) n.addEventListener("change", e => { p[1](e.target.value); dessinerListe(); });
    });
    hote.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => {
      sel = b.dataset.c;
      hote.querySelectorAll("[data-c]").forEach(x => x.classList.toggle("is-actif", x === b));
      dessinerFiche();
    }));
    const add = hote.querySelector('[data-a="add"]');
    if (add) add.addEventListener("click", () => editer(null));
  }

  /* ---- Fiche ------------------------------------------------------------------ */

  function dessinerFiche() {
    const k = R().find(x => x.id === sel);
    const zone = $("#c-fiche");

    if (!k) {
      zone.innerHTML = U.vide({ icone: "contrat", titre: "Aucun contrat sélectionné",
        texte: peutEcrire ? "Choisis-en un, ou rédiges-en un nouveau."
                          : "Choisis un contrat dans la liste." });
      return;
    }

    const t = totaux(k);
    const type = MNStore.contractTypeById(k.type);
    const expire = MNStore.contratExpire(k);
    const reste = MNStore.joursAvant(k.expire);

    zone.innerHTML = U.carte({
      titre: k.titre || "Sans titre",
      actions:
        U.etiquette(ETATS[k.etat], TON[k.etat]) +
        (type ? U.etiquette(type.name) : "") +
        U.bouton("PDF", { variante: "fantome", taille: "sm", icone: "contrat", action: "pdf" }) +
        (peutEcrire ? U.bouton("Modifier",
          { variante: "fantome", taille: "sm", icone: "crayon", action: "mod" }) : "") +
        (peutSupprimer ? U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
          titre: "Supprimer", action: "sup" }) : ""),
      corps:
        (expire
          ? '<div style="margin-bottom:var(--e-4)">' + U.alerte({ ton: "alerte",
              titre: "Contrat expiré",
              texte: "La date du " + dateJour(k.expire) + " est passée depuis " +
                     Math.abs(reste) + " jour" + (Math.abs(reste) > 1 ? "s" : "") + "." }) + "</div>"
          : "") +

        '<div class="grille grille--sm" style="margin-bottom:var(--e-4)">' +
          boite("Client", k.client) +
          boite("Type", type ? type.name : k.type) +
          boite("Référence", k.ref) +
          boite("Établi le", dateCourte(k.creeLe)) +
          boite("Expire le", k.expire ? dateJour(k.expire) : "") +
          boite("Par", k.creePar) +
        "</div>" +

        (k.lignes.length
          ? U.tableau(
              [{ nom: "Ce que l'atelier fournit", rendu: l => U.esc(l.name || "—") +
                  (l.itemId ? "" : " " + U.etiquette("ligne libre")) },
               { nom: "Qté", num: true, rendu: l => l.qty },
               { nom: "Demandé / unité", num: true, rendu: l => U.esc(troc(l)) },
               { nom: "Total demandé", num: true, rendu: l => "<b>" + U.esc(troc(l, l.qty)) + "</b>" }],
              k.lignes)
          : '<p class="champ__aide">Aucune ligne.' +
            (peutEcrire ? " Clique sur « Modifier » pour en ajouter." : "") + "</p>") +

        '<div class="grille grille--sm" style="margin-top:var(--e-4)">' +
          U.tuile({ label: "Pièces", valeur: t.pieces, icone: "boite" }) +
          (t.secondes ? U.tuile({ label: "Fabrication", valeur: U.duree(t.secondes),
            icone: "horloge", ton: "alerte" }) : "") +
        "</div>" +

        /* Les deux versants du troc, côte à côte : c'est ce qu'on vient lire
           sur un contrat. */
        '<div class="cols-2" style="margin-top:var(--e-4)">' +
          versant("Le client apporte", t.demande, "Aucune contrepartie convenue.") +
          versant("L'atelier sort du stock", t.resources, "Rien : que des lignes libres.") +
        "</div>" +

        (k.note ? '<div style="margin-top:var(--e-4)"><span class="champ__label">Note</span>' +
          '<p class="muet" style="white-space:pre-wrap;margin-top:var(--e-2)">' +
          U.esc(k.note) + "</p></div>" : "") +

        (k.majLe ? '<p class="champ__aide" style="margin-top:var(--e-4)">Dernière modification ' +
          U.esc(dateCourte(k.majLe)) + (k.majPar ? " par " + U.esc(k.majPar) : "") + ".</p>" : "")
    });

    brancherFiche(k);
  }

  const boite = (label, valeur) =>
    '<div class="tuile"><span class="tuile__label">' + U.esc(label) + "</span>" +
      '<span class="tuile__val" style="font-size:var(--t-lg)">' +
      (valeur ? U.esc(valeur) : "—") + "</span></div>";

  const versant = (titre, l, vide) =>
    '<div class="carte carte--plate"><div class="carte__corps">' +
      '<span class="champ__label">' + U.esc(titre) + "</span>" +
      (l.length
        ? '<div class="pile pile--sm" style="margin-top:var(--e-3)">' + l.map(r =>
            '<div class="rang"><span class="panier__ico" style="color:' +
              U.esc(r.resource.color) + '">' + mnIcon(r.resource.icon) + "</span>" +
              "<span>" + U.esc(r.resource.name) + "</span>" +
              '<b class="pousse nombre">' + MNStore.nombre(r.qty) + "</b></div>").join("") + "</div>"
        : '<p class="champ__aide" style="margin-top:var(--e-2)">' + U.esc(vide) + "</p>") +
    "</div></div>";

  function brancherFiche(k) {
    const b = a => hote.querySelector('[data-a="' + a + '"]');
    b("pdf").addEventListener("click", () => imprimer(k));
    if (b("mod")) b("mod").addEventListener("click", () => editer(k));
    if (b("sup")) b("sup").addEventListener("click", () => supprimer(k));
  }

  async function supprimer(k) {
    const ok = await U.confirmer({
      titre: "Supprimer le contrat",
      message: "« " + (k.titre || "Sans titre") + " » sera définitivement supprimé. Rien ne le récupère.",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;
    const r = await MNRegistre.removeContrat(k.id);
    if (!r.ok) return U.toast(r.error || "Suppression impossible", "err");
    if (sel === k.id) { const f = liste()[0]; sel = f ? f.id : null; }
    dessiner();
    U.toast("Contrat supprimé", "ok");
  }

  /* ---- Édition -------------------------------------------------------------------- */

  function editer(k) {
    const neuf = !k;
    const cur = k ? MNStore.clone(k) : {
      id: "", ref: nouvelleRef(), titre: "", client: "", note: "",
      type: "", expire: null, etat: "brouillon", lignes: []
    };
    /* Copie profonde : la contrepartie est un tableau, un Object.assign le
       partagerait avec le contrat d'origine. */
    let lignes = MNStore.clone(cur.lignes).map(l =>
      Object.assign({ demande: [] }, l, { demande: (l.demande || []).slice() }));

    const objets = MNStore.catalog().items.filter(i => i.enabled);
    const ress = MNStore.catalog().resources;

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "k-t", label: "Objet du contrat", valeur: cur.titre, max: 120,
                  repere: "Ex. Remise en état du convoi" }) +
        U.champ({ id: "k-cl", label: "Client", valeur: cur.client, max: 80 }) +
      "</div>" +
      '<div class="cols-3">' +
        U.champ({ id: "k-ref", label: "Référence", valeur: cur.ref, max: 40 }) +
        U.champ({ id: "k-ty", label: "Type", type: "liste", valeur: cur.type,
          options: [{ valeur: "", nom: "— non précisé" }]
            .concat(MNStore.contractTypes().map(t => ({ valeur: t.id, nom: t.name }))) }) +
        U.champ({ id: "k-et", label: "État", type: "liste", valeur: cur.etat,
          options: MNStore.ETATS_CONTRAT.map(e => ({ valeur: e, nom: ETATS[e] })) }) +
      "</div>" +
      '<div class="cols-2">' +
        U.champ({ id: "k-ex", label: "Expire le (facultatif)", type: "date",
                  valeur: cur.expire || "", aide: '<span id="k-ex-aide"></span>' }) +
        '<div class="champ"><span class="champ__label">&nbsp;</span>' +
          '<p class="champ__aide">Un type peut proposer une durée : la choisir remplit ' +
          "la date, qui reste modifiable.</p></div>" +
      "</div>" +
      '<div class="carte carte--plate"><div class="carte__corps">' +
        '<span class="champ__label">Lignes du contrat</span>' +
        '<p class="champ__aide" style="margin:var(--e-2) 0 var(--e-3)">Pour chaque ligne : ' +
          "ce que l'atelier fournit, et ce que le client apporte en échange — une ou " +
          "plusieurs ressources, par unité.</p>" +
        '<div id="k-lignes"></div>' +
        '<div class="rang" style="margin-top:var(--e-3)">' +
          U.bouton("Ajouter un objet", { variante: "fantome", taille: "sm",
            icone: "plus", action: "add-obj" }) +
          U.bouton("Ligne libre", { variante: "fantome", taille: "sm",
            icone: "plus", action: "add-lib" }) +
        "</div>" +
        '<div id="k-apercu" class="k-apercu"></div>' +
      "</div></div>" +
      U.champ({ id: "k-n", label: "Note", type: "zone", valeur: cur.note, max: 2000,
                repere: "Conditions, délais, remarques…" });

    const host = corps.querySelector("#k-lignes");
    const apercu = corps.querySelector("#k-apercu");

    function peindre() {
      host.innerHTML = lignes.length
        ? lignes.map((l, i) =>
            '<div class="k-ligne" data-i="' + i + '">' +
              '<div class="k-ligne__haut">' +
                (l.itemId
                  ? '<select class="liste" data-f="obj">' + objets.map(o =>
                      '<option value="' + U.esc(o.id) + '"' + (o.id === l.itemId ? " selected" : "") +
                      ">" + U.esc(o.name) + "</option>").join("") + "</select>"
                  : '<input class="saisie" data-f="nom" maxlength="120" value="' +
                    U.esc(l.name) + '" placeholder="Intitulé libre">') +
                '<input class="saisie saisie--nombre" data-f="qty" inputmode="numeric" ' +
                  'title="Quantité fournie" value="' + l.qty + '">' +
                U.bouton("", { icone: "croix", variante: "fantome", taille: "sm",
                               titre: "Retirer la ligne", action: "rm" }) +
              "</div>" +
              '<div class="k-ligne__troc">' +
                '<span class="champ__label">En échange</span>' +
                '<div class="k-demandes">' +
                  (l.demande.length
                    ? l.demande.map((dm, j) =>
                        '<div class="k-demande" data-j="' + j + '">' +
                          '<select class="liste" data-f="res">' + ress.map(r =>
                            '<option value="' + U.esc(r.id) + '"' +
                            (r.id === dm.resId ? " selected" : "") + ">" + U.esc(r.name) +
                            "</option>").join("") + "</select>" +
                          '<input class="saisie saisie--nombre" data-f="rq" inputmode="numeric" ' +
                            'title="Par unité fournie" value="' + dm.qty + '">' +
                          U.bouton("", { icone: "croix", variante: "fantome", taille: "sm",
                                         titre: "Retirer", action: "rmres" }) +
                        "</div>").join("")
                    : '<p class="champ__aide">Rien de demandé sur cette ligne.</p>') +
                "</div>" +
                '<div class="rang" style="margin-top:var(--e-2)">' +
                  U.bouton("Ressource", { variante: "fantome", taille: "sm",
                                          icone: "plus", action: "addres" }) +
                  '<b class="pousse nombre">' + U.esc(troc(l, l.qty)) + "</b>" +
                "</div>" +
              "</div>" +
            "</div>").join("")
        : '<p class="champ__aide">Aucune ligne pour l\'instant.</p>';

      host.querySelectorAll(".k-ligne").forEach(row => {
        const i = Number(row.dataset.i);
        const maj = () => {
          row.querySelector("b.nombre").textContent = troc(lignes[i], lignes[i].qty);
          majApercu();
        };
        const qt = row.querySelector('[data-f="qty"]');
        qt.addEventListener("input", () => {
          lignes[i].qty = Math.max(1, Math.min(9999, Math.round(Number(qt.value) || 1)));
          maj();
        });
        const ob = row.querySelector('[data-f="obj"]');
        if (ob) ob.addEventListener("change", () => {
          const o = objets.find(x => x.id === ob.value);
          lignes[i].itemId = ob.value;
          lignes[i].name = o ? o.name : "";
          majApercu();
        });
        const nm = row.querySelector('[data-f="nom"]');
        if (nm) nm.addEventListener("input", () => { lignes[i].name = nm.value; });

        row.querySelector('[data-a="rm"]').addEventListener("click", () => {
          lignes.splice(i, 1); peindre();
        });
        row.querySelector('[data-a="addres"]').addEventListener("click", () => {
          if (!ress.length) return U.toast("Aucune ressource au catalogue", "err");
          /* On propose une ressource encore libre : deux fois la même sur une
             ligne se cumulerait à l'enregistrement, ce qui surprendrait. */
          const pris = lignes[i].demande.map(d => d.resId);
          const libre = ress.find(r => pris.indexOf(r.id) === -1);
          if (!libre) return U.toast("Toutes les ressources sont déjà demandées", "info");
          lignes[i].demande.push({ resId: libre.id, qty: 1 });
          peindre();
        });

        row.querySelectorAll(".k-demande").forEach(bloc => {
          const j = Number(bloc.dataset.j);
          const rs = bloc.querySelector('[data-f="res"]');
          const rq = bloc.querySelector('[data-f="rq"]');
          const m2 = () => {
            lignes[i].demande[j] = { resId: rs.value,
              qty: Math.max(0, Math.min(99999, Math.round(Number(rq.value) || 0))) };
            maj();
          };
          rs.addEventListener("change", m2);
          rq.addEventListener("input", m2);
          bloc.querySelector('[data-a="rmres"]').addEventListener("click", () => {
            lignes[i].demande.splice(j, 1); peindre();
          });
        });
      });
      majApercu();
    }

    /* Les deux versants suivent la saisie : c'est ce qu'on vient vérifier en
       montant un contrat. */
    function majApercu() {
      const t = MNStore.contratTotaux({ lignes });
      const tas = (nom, l) => l.length
        ? '<div class="k-tas"><i>' + nom + "</i>" + l.map(r =>
            "<span>" + U.esc(r.resource.name) + " ×" + MNStore.nombre(r.qty) +
            "</span>").join("") + "</div>"
        : "";
      apercu.innerHTML =
        '<div class="rang">' +
          U.etiquette(t.pieces + " pièce" + (t.pieces > 1 ? "s" : "")) +
          (t.secondes ? U.etiquette(U.duree(t.secondes) + " de fabrication", "alerte") : "") +
        "</div>" + tas("On reçoit", t.demande) + tas("On sort", t.resources);
    }

    corps.querySelector('[data-a="add-obj"]').addEventListener("click", () => {
      if (!objets.length) return U.toast("Aucun objet au catalogue", "err");
      lignes.push({ itemId: objets[0].id, name: objets[0].name, qty: 1, demande: [] });
      peindre();
    });
    corps.querySelector('[data-a="add-lib"]').addEventListener("click", () => {
      lignes.push({ itemId: "", name: "", qty: 1, demande: [] });
      peindre();
    });
    peindre();

    /* Choisir un type qui porte une durée remplit la date d'expiration, tant
       qu'on n'y a pas touché soi-même : la proposition aide, elle ne décide
       pas à la place. */
    const chExp = corps.querySelector("#k-ex");
    const aide = corps.querySelector("#k-ex-aide");
    let dateTouchee = !!cur.expire;
    const majAide = () => {
      const v = chExp.value;
      if (!v) { aide.textContent = "Sans date, le contrat ne périme jamais."; return; }
      const n = MNStore.joursAvant(v);
      aide.textContent = n < 0
        ? "Déjà passée depuis " + Math.abs(n) + " jour" + (Math.abs(n) > 1 ? "s" : "") + "."
        : n === 0 ? "Expire aujourd'hui." : "Dans " + n + " jour" + (n > 1 ? "s" : "") + ".";
    };
    chExp.addEventListener("input", () => { dateTouchee = true; majAide(); });
    corps.querySelector("#k-ty").addEventListener("change", e => {
      const t = MNStore.contractTypeById(e.target.value);
      if (!t || !t.jours || dateTouchee) return;
      const d = new Date(); d.setDate(d.getDate() + t.jours);
      chExp.value = MNStore.jourLocal(d);
      majAide();
    });
    majAide();

    U.modale({
      titre: neuf ? "Nouveau contrat" : "Modifier le contrat",
      large: true, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: async (fermer, c, btn) => {
            const g = s => c.querySelector(s).value.trim();
            const titre = g("#k-t");
            if (!titre) return U.toast("L'objet du contrat est obligatoire", "err");

            const now = new Date().toISOString();
            btn.disabled = true;
            const r = await MNRegistre.setContrat({
              id: cur.id || MNStore.uniqueId(titre, R().map(x => x.id)),
              ref: g("#k-ref") || nouvelleRef(),
              titre, client: g("#k-cl"), note: g("#k-n"),
              type: c.querySelector("#k-ty").value,
              expire: c.querySelector("#k-ex").value || null,
              etat: c.querySelector("#k-et").value,
              lignes: lignes.filter(l => l.itemId || String(l.name).trim()),
              creePar: cur.creePar || moi.pseudo,
              creeLe: cur.creeLe || now,
              majPar: moi.pseudo, majLe: now
            });
            if (!r.ok) {
              btn.disabled = false;
              return U.toast(r.error || "Enregistrement impossible", "err");
            }
            sel = cur.id || sel;
            fermer(); dessiner();
            U.toast(neuf ? "Contrat créé" : "Contrat mis à jour", "ok");
          } }
      ]
    });
  }

  const nouvelleRef = () => {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return "CT-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      "-" + p(d.getHours()) + p(d.getMinutes());
  };

  /* ---- Sortie papier -----------------------------------------------------------------
     Une fenêtre autonome plutôt qu'une feuille d'impression : rien de
     l'application ne peut déteindre dessus, et « Enregistrer au format PDF »
     de la boîte d'impression suffit. Aucune bibliothèque. */

  function imprimer(k) {
    const t = totaux(k);
    const b = MNStore.brand();
    const type = MNStore.contractTypeById(k.type);

    const tas = l => l.length
      ? l.map(r => U.esc(r.resource.name) + " ×" + MNStore.nombre(r.qty)).join(" · ")
      : "rien";

    const doc =
      '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">' +
      "<title>" + U.esc(k.ref || "Contrat") + " — " + U.esc(k.titre || "") + "</title>" +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
        'family=Caveat:wght@400;600;700&family=Special+Elite&display=swap">' +
      "<style>" + PAPIER + "</style></head><body>" +
      '<div class="feuille">' +
        '<div class="tampon">' + U.esc(ETATS[k.etat]) + "</div>" +
        '<header class="tete"><h1>' + U.esc(b.name) + "</h1>" +
          '<p class="sous">' + U.esc(b.tagline) + "</p>" +
          '<p class="ref">Contrat n° ' + U.esc(k.ref || "—") + "</p></header>" +
        '<h2 class="objet">' + U.esc(k.titre || "Sans titre") + "</h2>" +
        '<div class="parties">' +
          "<p><span>Client</span> " + U.esc(k.client || "—") + "</p>" +
          "<p><span>Établi par</span> " + U.esc(k.creePar || "—") + "</p>" +
          "<p><span>Le</span> " + U.esc(dateCourte(k.creeLe) || dateCourte(new Date().toISOString())) + "</p>" +
          (type ? "<p><span>Type</span> " + U.esc(type.name) + "</p>" : "") +
          (k.expire ? "<p><span>Expire le</span> " + U.esc(dateJour(k.expire)) +
            (MNStore.contratExpire(k) ? " (dépassée)" : "") + "</p>" : "") +
        "</div>" +
        (k.lignes.length
          ? "<table><thead><tr><th>Ce que l'atelier fournit</th><th class=\"n\">Qté</th>" +
            "<th class=\"n\">En échange de</th></tr></thead><tbody>" +
            k.lignes.map(l => "<tr><td>" + U.esc(l.name || "—") + "</td>" +
              '<td class="n">' + l.qty + "</td>" +
              '<td class="n">' + U.esc(troc(l, l.qty)) + "</td></tr>").join("") +
            "</tbody></table>"
          : '<p class="vide">Aucune prestation portée à ce contrat.</p>') +
        '<div class="troc">' +
          "<div><h3>Le client apporte</h3><p>" + tas(t.demande) + "</p></div>" +
          "<div><h3>L'atelier sort du stock</h3><p>" + tas(t.resources) + "</p></div>" +
        "</div>" +
        (t.secondes ? '<div class="bloc"><h3>Temps de fabrication</h3><p>' +
          U.esc(U.duree(t.secondes)) + "</p></div>" : "") +
        (k.note ? '<div class="bloc"><h3>Notes</h3><p>' + U.esc(k.note) + "</p></div>" : "") +
        '<div class="signatures"><div><span>Le client</span></div>' +
          "<div><span>Pour l'atelier</span><i>" + U.esc(k.creePar || "") + "</i></div></div>" +
      "</div>" +
      "<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script>" +
      "</body></html>";

    const w = window.open("", "_blank");
    if (!w) return U.toast("Ton navigateur a bloqué la fenêtre. Autorise les pop-ups.", "err");
    w.document.open(); w.document.write(doc); w.document.close();
  }

  /* Papier vieilli, encre manuscrite : tout est dessiné en CSS, aucune image
     à charger ni à héberger. */
  const PAPIER = [
    "*{box-sizing:border-box}html,body{margin:0;padding:0;background:#3a352c}",
    "body{font-family:'Caveat',cursive;color:#241d14;padding:28px}",
    ".feuille{position:relative;max-width:760px;margin:0 auto;padding:52px 56px 64px;",
    "background:#e8dcc0;background-image:",
    "radial-gradient(ellipse at 12% 8%,rgba(120,90,40,.20),transparent 42%),",
    "radial-gradient(ellipse at 88% 22%,rgba(90,70,30,.16),transparent 38%),",
    "radial-gradient(circle at 74% 82%,rgba(110,80,35,.22),transparent 26%);",
    "box-shadow:0 2px 0 rgba(0,0,0,.25),0 18px 50px rgba(0,0,0,.55)}",
    ".feuille::after{content:'';position:absolute;inset:0;pointer-events:none;",
    "box-shadow:inset 0 0 60px rgba(70,50,20,.35)}",
    ".tampon{position:absolute;top:38px;right:44px;font-family:'Special Elite',monospace;",
    "font-size:15px;letter-spacing:.22em;text-transform:uppercase;color:#8d2b2b;",
    "border:3px double #8d2b2b;padding:7px 14px;transform:rotate(-9deg);opacity:.72}",
    ".tete{text-align:center;border-bottom:2px solid #4a3c28;padding-bottom:14px;margin-bottom:22px}",
    ".tete h1{font-family:'Special Elite',monospace;font-size:27px;margin:0;",
    "letter-spacing:.12em;text-transform:uppercase}",
    ".tete .sous{margin:4px 0 0;font-size:17px;opacity:.7}",
    ".tete .ref{font-family:'Special Elite',monospace;font-size:12px;margin:10px 0 0;",
    "letter-spacing:.16em;opacity:.75}",
    ".objet{font-size:31px;margin:0 0 16px;font-weight:700;text-align:center;",
    "text-decoration:underline;text-underline-offset:5px}",
    ".parties{display:flex;flex-wrap:wrap;gap:6px 30px;font-size:20px;margin-bottom:22px}",
    ".parties p{margin:0}.parties span{font-family:'Special Elite',monospace;font-size:11px;",
    "letter-spacing:.14em;text-transform:uppercase;opacity:.65;margin-right:6px}",
    "table{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:20px}",
    "th{font-family:'Special Elite',monospace;font-size:11px;letter-spacing:.13em;",
    "text-transform:uppercase;text-align:left;border-bottom:2px solid #4a3c28;padding:6px 8px;opacity:.8}",
    "td{padding:7px 8px;border-bottom:1px dashed rgba(74,60,40,.45)}",
    ".n{text-align:right;white-space:nowrap}",
    ".troc{display:flex;gap:34px;margin:22px 0 24px;border-top:2px solid #4a3c28;",
    "border-bottom:2px solid #4a3c28;padding:14px 0}",
    ".troc>div{flex:1}.troc p{margin:0;font-size:21px}",
    ".troc h3,.bloc h3{font-family:'Special Elite',monospace;font-size:11px;letter-spacing:.14em;",
    "text-transform:uppercase;margin:0 0 5px;opacity:.7}",
    ".bloc{margin-bottom:20px}.bloc p{margin:0;font-size:19px;white-space:pre-wrap}",
    ".vide{font-size:19px;opacity:.7}",
    ".signatures{display:flex;gap:40px;margin-top:52px}",
    ".signatures div{flex:1;border-top:1px solid #4a3c28;padding-top:6px}",
    ".signatures span{font-family:'Special Elite',monospace;font-size:10px;",
    "letter-spacing:.14em;text-transform:uppercase;opacity:.65}",
    ".signatures i{display:block;font-style:normal;font-size:26px;margin-top:8px;transform:rotate(-3deg)}",
    /* À l'impression le fond doit sortir, sinon il ne reste qu'un tableau blanc. */
    "@media print{html,body{background:#fff;padding:0}.feuille{max-width:none;margin:0;box-shadow:none}",
    "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:12mm}}"
  ].join("");
})();
