/* ==========================================================================
   Facturation — le catalogue à gauche, le panier à droite.

   Reprise fidèle de la V1 : mêmes règles de lot, de plafond et
   d'incompatibilité, mêmes bons de travail, même envoi Discord. Ce qui change
   est la mise en page — le panier était une barre au ras du bas qui masquait
   le catalogue ; il devient une colonne qui suit le défilement, et un tiroir
   sur téléphone.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  let panier = {};
  let cat = "";        // catégorie principale
  let sous = "";       // sous-catégorie, "" = tout, "__direct" = rangés ici
  let recherche = "";
  let hote = null;

  const K_CAT = "v2.fact.cat";
  const K_SOUS = "v2.fact.sous";

  V2Shell.demarrer({
    page: "facturation",
    titre: "Facturation",
    pret: function (session, h) {
      hote = h;
      if (!V2Shell.peut("bt", "admin")) return V2Shell.refuser(hote, "la facturation");

      panier = MNStore.getCart();
      cat = localStorage.getItem(K_CAT) || "";
      sous = localStorage.getItem(K_SOUS) || "";

      const tetes = MNStore.topCategories().filter(c => objetsDe(c.id).length);
      if (!tetes.length) {
        hote.innerHTML = U.vide({ icone: "boite", titre: "Catalogue vide",
          texte: "Aucun objet n'est encore publié. Ajoute-les depuis l'administration." });
        return;
      }
      if (!tetes.some(c => c.id === cat)) { cat = tetes[0].id; sous = ""; }

      dessiner();
    }
  });

  /* ---- Données -------------------------------------------------------------- */

  const visibles = () => MNStore.catalog().items.filter(i => i.enabled);

  /** Les objets d'une catégorie, sous-catégories comprises. */
  const objetsDe = id => {
    const portee = MNStore.categoryScope(id);
    return visibles().filter(i => portee.indexOf(i.category) !== -1);
  };

  /** Ce que le catalogue doit montrer, une fois catégorie et recherche appliquées. */
  function affiches() {
    let l = objetsDe(cat);
    if (sous === "__direct") l = l.filter(i => i.category === cat);
    else if (sous) l = l.filter(i => i.category === sous);

    const q = recherche.trim().toLowerCase();
    if (q) l = visibles().filter(i => i.name.toLowerCase().indexOf(q) !== -1);
    return l;
  }

  /** L'objet déjà au panier qui interdit celui-ci, s'il y en a un. */
  function bloqueur(item) {
    const ids = Object.keys(panier).filter(k => panier[k] > 0);
    const par = ids.find(id => (item.excludes || []).indexOf(id) !== -1);
    return par ? MNStore.itemById(par) : null;
  }

  /* ---- Rendu ----------------------------------------------------------------- */

  function dessiner() {
    hote.innerHTML =
      '<div class="fact">' +
        '<div class="fact__cat">' +
          barreCategories() +
          '<div id="f-catalogue"></div>' +
        "</div>" +
        '<aside class="fact__panier" id="f-panier"></aside>' +
      "</div>" +
      '<div class="fact__mobile" id="f-mobile"></div>';

    brancherBarre();
    dessinerCatalogue();
    dessinerPanier();
  }

  function barreCategories() {
    const tetes = MNStore.topCategories()
      .map(c => ({ c, items: objetsDe(c.id) }))
      .filter(x => x.items.length);

    const ss = MNStore.subCategories(cat)
      .map(c => ({ c, items: visibles().filter(i => i.category === c.id) }))
      .filter(x => x.items.length);
    const direct = visibles().filter(i => i.category === cat);

    return '<div class="pile pile--sm" style="margin-bottom:var(--e-4)">' +
      '<div class="rang">' +
        '<div class="fact__rech">' + U.icone("recherche") +
          '<input class="saisie" id="f-q" type="search" placeholder="Chercher un objet…" ' +
            'value="' + U.esc(recherche) + '" autocomplete="off">' +
        "</div>" +
      "</div>" +

      '<div class="onglets" role="tablist">' + tetes.map(x =>
        '<button class="onglet' + (x.c.id === cat && !recherche ? " is-actif" : "") +
          '" data-cat="' + U.esc(x.c.id) + '" role="tab">' + U.esc(x.c.name) +
          ' <span class="muet">' + x.items.length + "</span></button>").join("") + "</div>" +

      (ss.length && !recherche
        ? '<div class="onglets onglets--fin">' +
            onglet("", "Tout", objetsDe(cat).length) +
            (direct.length ? onglet("__direct", "Autres", direct.length) : "") +
            ss.map(x => onglet(x.c.id, x.c.name, x.items.length)).join("") +
          "</div>"
        : "") +
    "</div>";
  }

  const onglet = (id, nom, n) =>
    '<button class="onglet' + (sous === id ? " is-actif" : "") + '" data-sous="' + U.esc(id) + '">' +
      U.esc(nom) + ' <span class="muet">' + n + "</span></button>";

  function brancherBarre() {
    const q = $("#f-q");
    q.addEventListener("input", () => {
      recherche = q.value;
      dessinerCatalogue();
      /* Les onglets perdent leur sens pendant une recherche : on les grise
         plutôt que de les retirer, la barre ne saute pas. */
      hote.querySelectorAll(".onglets").forEach(o => o.classList.toggle("is-eteint", !!recherche.trim()));
    });

    hote.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
      if (cat === b.dataset.cat) return;
      cat = b.dataset.cat; sous = "";
      localStorage.setItem(K_CAT, cat);
      localStorage.setItem(K_SOUS, "");
      dessiner();
    }));
    hote.querySelectorAll("[data-sous]").forEach(b => b.addEventListener("click", () => {
      sous = b.dataset.sous;
      localStorage.setItem(K_SOUS, sous);
      dessiner();
    }));
  }

  function dessinerCatalogue() {
    const l = affiches();
    const zone = $("#f-catalogue");

    if (!l.length) {
      zone.innerHTML = U.vide({ icone: "recherche", titre: "Aucun objet",
        texte: recherche ? "Rien ne correspond à « " + recherche + " »."
                         : "Cette catégorie est vide." });
      return;
    }
    zone.innerHTML = '<div class="grille grille--sm">' + l.map(carteObjet).join("") + "</div>";
    brancherCartes(zone);
  }

  function carteObjet(it) {
    const q = panier[it.id] || 0;
    const bloc = bloqueur(it);
    const plein = it.max > 0 && q >= it.max;

    const couts = Object.keys(it.cost || {}).map(rid => {
      const r = MNStore.resourceById(rid);
      return r ? '<span class="objet__cout">' + U.esc(r.name) + " ×" +
        U.nombre(it.cost[rid] * Math.max(1, q)) + "</span>" : "";
    }).join("");

    return '<article class="objet' + (q ? " is-pris" : "") + (bloc ? " is-bloque" : "") +
      '" data-id="' + U.esc(it.id) + '"' +
      (bloc ? ' title="Incompatible avec « ' + U.esc(bloc.name) + ' »"' : "") + ">" +
      (q ? '<span class="objet__badge">' + q + "</span>" : "") +
      (it.max > 0 ? '<span class="objet__max">max ' + it.max + "</span>" : "") +
      '<div class="objet__ico">' + mnIcon(it.icon) + "</div>" +
      '<h3 class="objet__nom">' + U.esc(MNStore.itemLabel(it, q)) + "</h3>" +
      (bloc
        ? '<p class="objet__note">Incompatible avec ' + U.esc(bloc.name) + "</p>"
        : it.note ? '<p class="objet__note">' + U.esc(it.note) + "</p>" : "") +
      (it.temps ? '<p class="objet__temps">' + U.icone("horloge") +
        U.esc(U.duree(it.temps)) + "</p>" : "") +
      '<div class="compteur">' +
        '<button data-a="moins"' + (q ? "" : " disabled") + ' aria-label="Retirer">' +
          U.icone("moins") + "</button>" +
        '<input class="compteur__v" inputmode="numeric" value="' + q +
          '" aria-label="Quantité de ' + U.esc(it.name) + '"' + (bloc ? " disabled" : "") + ">" +
        '<button data-a="plus"' + (plein || bloc ? " disabled" : "") + ' aria-label="Ajouter">' +
          U.icone("plus") + "</button>" +
      "</div>" +
      (couts ? '<div class="objet__couts">' + couts + "</div>" : "") +
    "</article>";
  }

  function brancherCartes(zone) {
    zone.querySelectorAll(".objet").forEach(el => {
      const id = el.dataset.id;
      el.querySelector('[data-a="plus"]').addEventListener("click", e => {
        e.stopPropagation(); poser(id, (panier[id] || 0) + (e.shiftKey ? 5 : 1));
      });
      el.querySelector('[data-a="moins"]').addEventListener("click", e => {
        e.stopPropagation(); poser(id, (panier[id] || 0) - (e.shiftKey ? 5 : 1));
      });
      const champ = el.querySelector(".compteur__v");
      champ.addEventListener("change", () => poser(id, Number(champ.value) || 0));
      /* Cliquer la carte ajoute : c'est le geste le plus fréquent. */
      el.addEventListener("click", () => poser(id, (panier[id] || 0) + 1));
    });
  }

  /** Pose une quantité, en respectant plafond et incompatibilités. */
  function poser(id, n) {
    const it = MNStore.itemById(id);
    if (!it) return;

    if (n > 0 && bloqueur(it)) {
      return U.toast("Incompatible avec « " + bloqueur(it).name + " »", "err");
    }
    let q = Math.max(0, Math.round(n) || 0);
    if (it.max > 0 && q > it.max) {
      q = it.max;
      U.toast("Maximum " + it.max + " par bon de travail", "info");
    }

    if (q) panier[id] = q; else delete panier[id];
    panier = MNStore.setCart(panier);

    dessinerCatalogue();
    dessinerPanier();
  }

  /* ---- Panier ------------------------------------------------------------------ */

  function dessinerPanier() {
    const t = MNStore.totals(panier);
    $("#f-panier").innerHTML = corpsPanier(t, false);
    $("#f-mobile").innerHTML = barreMobile(t);
    brancherPanier();
  }

  function corpsPanier(t, dansModale) {
    const lignes = t.lines.length
      ? '<div class="pile pile--sm">' + t.lines.map(l =>
          '<div class="rang panier__ligne">' +
            '<span class="panier__ico">' + mnIcon(l.item.icon) + "</span>" +
            '<span class="tronque">' + U.esc(MNStore.itemLabel(l.item, l.qty)) + "</span>" +
            '<span class="pousse nombre muet">×' + l.qty + "</span>" +
            '<button class="btn btn--icone btn--sm" data-rm="' + U.esc(l.item.id) +
              '" title="Retirer">' + U.icone("croix") + "</button>" +
          "</div>").join("") + "</div>"
      : U.vide({ icone: "recu", titre: "Panier vide",
                 texte: "Choisis des objets : les ressources à sortir s'affichent ici." });

    const res = t.resources.length
      ? '<div class="pile pile--sm">' + t.resources.map(r =>
          '<div class="rang">' +
            '<span class="panier__ico" style="color:' + U.esc(r.resource.color) + '">' +
              mnIcon(r.resource.icon) + "</span>" +
            "<span>" + U.esc(r.resource.name) + "</span>" +
            '<b class="pousse nombre">' + U.nombre(r.qty) + "</b>" +
          "</div>").join("") + "</div>"
      : '<p class="champ__aide">Aucune ressource à sortir.</p>';

    return U.carte({
      titre: "Bon de travail",
      actions: t.count
        ? U.etiquette(t.count + (t.count > 1 ? " objets" : " objet"), "action")
        : "",
      corps:
        lignes +
        (t.secondes
          ? '<div class="panier__temps">' + U.icone("horloge") +
            "<span>Fabrication : <b>" + U.esc(U.duree(t.secondes)) + "</b></span></div>"
          : "") +
        '<h4 class="panier__sst">Ressources nécessaires</h4>' + res,
      pied:
        '<div class="pile pile--sm">' +
          U.bouton("Enregistrer le bon", { variante: "principal", icone: "check", bloc: true,
            action: "save", desactive: !t.count }) +
          U.bouton("Tout vider", { variante: "fantome", taille: "sm", bloc: true,
            action: "vider", desactive: !t.count }) +
        "</div>"
    });
  }

  /** Sur téléphone, un résumé fixe en bas qui ouvre le panier complet. */
  function barreMobile(t) {
    if (!t.count) return "";
    return '<button class="fact__resume" data-a="ouvrir">' +
      '<span class="fact__resume-n">' + t.count + "</span>" +
      "<span>" + (t.count > 1 ? "objets" : "objet") +
        (t.resources.length ? " · " + t.resources.length + " ressource" +
          (t.resources.length > 1 ? "s" : "") : "") + "</span>" +
      '<span class="pousse">' + U.icone("fleche") + "</span>" +
    "</button>";
  }

  function brancherPanier() {
    hote.querySelectorAll("[data-rm]").forEach(b =>
      b.addEventListener("click", () => poser(b.dataset.rm, 0)));

    const save = hote.querySelector('[data-a="save"]');
    if (save) save.addEventListener("click", enregistrer);

    const vider = hote.querySelector('[data-a="vider"]');
    if (vider) vider.addEventListener("click", async () => {
      const ok = await U.confirmer({
        titre: "Tout vider",
        message: "Le panier en cours sera vidé. Les bons déjà enregistrés ne bougent pas.",
        confirmer: "Vider", danger: true
      });
      if (!ok) return;
      panier = MNStore.setCart({});
      dessinerCatalogue(); dessinerPanier();
      U.toast("Panier vidé", "ok");
    });

    const ouvrir = hote.querySelector('[data-a="ouvrir"]');
    if (ouvrir) ouvrir.addEventListener("click", () => {
      const t = MNStore.totals(panier);
      const m = U.modale({ titre: "Bon de travail", corps: corpsPanier(t, true),
                           actions: [{ label: "Continuer", onClick: f => f() }] });
      /* La modale contient une copie du panier : on rebranche dedans. */
      m.corps.querySelectorAll("[data-rm]").forEach(b =>
        b.addEventListener("click", () => { poser(b.dataset.rm, 0); m.fermer(); }));
      const s = m.corps.querySelector('[data-a="save"]');
      if (s) s.addEventListener("click", () => { m.fermer(); enregistrer(); });
    });
  }

  /* ---- Enregistrement -------------------------------------------------------------- */

  const nouvelleRef = () => {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return "BT-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      "-" + p(d.getHours()) + p(d.getMinutes());
  };

  function enregistrer() {
    const t = MNStore.totals(panier);
    if (!t.count) return;

    const m = U.modale({
      titre: "Enregistrer le bon de travail",
      corps:
        '<div class="pile">' +
          U.champ({ id: "b-client", label: "Client", repere: "Nom du client", max: 60 }) +
          U.champ({ id: "b-note", label: "Note", type: "zone", max: 400,
                    repere: "Remarques, pièces à commander…" }) +
          U.alerte({ titre: t.count + (t.count > 1 ? " objets" : " objet"),
                     texte: t.resources.map(r => r.resource.name + " ×" + U.nombre(r.qty)).join(" · ") +
                            (t.secondes ? " — " + U.duree(t.secondes) + " de fabrication" : "") }) +
        "</div>",
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: async (fermer, corps, btn) => {
            btn.disabled = true;
            const s = V2Shell.session();
            const bt = {
              ref: nouvelleRef(),
              at: Date.now(),
              by: s ? s.pseudo : "?",
              client: corps.querySelector("#b-client").value.trim(),
              note: corps.querySelector("#b-note").value.trim(),
              /* Le nom est figé : un objet renommé plus tard ne doit pas
                 réécrire un bon déjà signé. */
              lines: t.lines.map(l => ({ id: l.item.id, name: MNStore.itemLabel(l.item, l.qty), qty: l.qty })),
              resources: t.resources.map(r => ({ id: r.resource.id, name: r.resource.name, qty: r.qty })),
              count: t.count,
              secondes: t.secondes
            };
            MNStore.addBT(bt);
            panier = MNStore.setCart({});

            fermer();
            dessinerCatalogue(); dessinerPanier();
            U.toast("Bon " + bt.ref + " enregistré", "ok");

            /* Discord en dernier : l'envoi peut échouer, le bon est déjà
               sauvé et l'atelier ne doit pas croire l'inverse. */
            try {
              const r = await MNWebhook.sendBT(bt, bt.lines, bt.resources);
              if (r && r.error) U.toast("Discord : " + r.error, "err");
            } catch (e) { U.toast("Discord injoignable", "err"); }
          } }
      ]
    });
  }

  /* ---- Historique ---------------------------------------------------------------------
     Accessible depuis la barre du haut : c'est une consultation, pas une étape
     du travail en cours. */

  V2Shell.actions(U.bouton("Historique", { variante: "fantome", taille: "sm",
    icone: "recu", action: "hist" }));
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest('[data-a="hist"]');
    if (b) historique();
  });

  function historique() {
    const l = MNStore.getBTs();
    const m = U.modale({
      titre: "Bons de travail enregistrés", large: true,
      corps: l.length
        ? U.tableau(
            [{ nom: "Client", rendu: b => U.esc(b.client || "—") },
             { nom: "Référence", rendu: b => '<span class="mono">' + U.esc(b.ref) + "</span>" },
             { nom: "Quand", rendu: b => U.esc(new Date(b.at).toLocaleString("fr-FR")) },
             { nom: "Par", cle: "by" },
             { nom: "Objets", num: true, rendu: b => b.count || b.lines.length },
             { nom: "", rendu: b =>
                 U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                                titre: "Supprimer", action: "rm-" + b.ref }) }],
            l)
        : U.vide({ icone: "recu", titre: "Aucun bon enregistré",
                   texte: "Les bons que tu enregistres apparaîtront ici." }),
      actions: [{ label: "Fermer", onClick: f => f() }]
    });

    m.corps.querySelectorAll("[data-a^='rm-']").forEach(b =>
      b.addEventListener("click", async () => {
        const ref = b.dataset.a.slice(3);
        const ok = await U.confirmer({ titre: "Supprimer ce bon",
          message: ref + " sera définitivement supprimé.", confirmer: "Supprimer", danger: true });
        if (!ok) return;
        MNStore.removeBT(ref);
        m.fermer();
        historique();
      }));
  }
})();
