/* ==========================================================================
   Facturation — le catalogue à gauche, le panier à droite.

   Reprise fidèle de la V1 : mêmes règles de lot, de plafond et
   d'incompatibilité, mêmes devis, même envoi Discord. Ce qui change
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
  let recherche = "";
  let hote = null;

  let sous = "";       // sous-catégorie affichée, "" = toutes
  const K_CAT = "v2.fact.cat";
  const K_SOUS = "v2.fact.sous";
  const K_PLIS = "v2.fact.plis";

  /* Les sections fermées, retenues d'une visite à l'autre : replier trois
     sections chaque matin n'est pas un réglage, c'est une corvée. */
  const plisLire = () => {
    try { return JSON.parse(localStorage.getItem(K_PLIS)) || []; }
    catch (_) { return []; }
  };
  const plisEcrire = l => {
    try { localStorage.setItem(K_PLIS, JSON.stringify(l)); } catch (_) { /* rien */ }
  };
  const plie = cle => plisLire().indexOf(cle) !== -1;
  const basculer = cle => {
    const l = plisLire(), i = l.indexOf(cle);
    if (i === -1) l.push(cle); else l.splice(i, 1);
    plisEcrire(l);
  };

  V2Shell.demarrer({
    page: "facturation",
    titre: "Facturation",
    pret: function (session, h) {
      hote = h;
      if (!V2Shell.peut("bt", "admin")) return V2Shell.refuser(hote, "la facturation");

      panier = MNStore.getCart();
      cat = localStorage.getItem(K_CAT) || "";
      sous = localStorage.getItem(K_SOUS) || "";

      /* Le bouton de la barre du haut : ici et pas au chargement du fichier,
         où la barre n'existe pas encore. */
      V2Shell.actions(U.bouton("Historique", { variante: "fantome", taille: "sm",
        icone: "recu", action: "hist" }));

      const tetes = MNStore.topCategories().filter(c => objetsDe(c.id).length);
      if (!tetes.length) {
        hote.innerHTML = U.vide({ icone: "boite", titre: "Catalogue vide",
          texte: "Aucun objet n'est encore publié. Ajoute-les depuis l'administration." });
      } else {
        if (!tetes.some(c => c.id === cat)) cat = tetes[0].id;
        dessiner();
      }

      /* Arrivé depuis le menu d'une autre page. La fenêtre s'ouvre une fois la
         page en place — avant, elle s'ouvrait sur un écran qui n'existait pas
         encore et sur un catalogue pas encore lu.

         On efface l'ancre aussitôt : sinon un rafraîchissement rouvrirait la
         fenêtre sans qu'on l'ait demandé, et le bouton « précédent »
         deviendrait imprévisible. */
      if (location.hash === "#historique") {
        history.replaceState(null, "", location.pathname + location.search);
        V2Shell.historique();
      }
    }
  });

  /* ---- Données -------------------------------------------------------------- */

  /* Le catalogue suit l'atelier où l'on travaille : un objet réservé au Sud
     n'a rien à faire sur le devis du Nord. Sans mention, il est proposé
     partout — un catalogue déjà rempli ne se vide d'aucun côté. */
  const visibles = () => MNStore.catalog().items.filter(i =>
    i.enabled && MNStore.estDeAtelier(i, MNAuth.atelier()));

  /** Les objets d'une catégorie, sous-catégories comprises. */
  const objetsDe = id => {
    const portee = MNStore.categoryScope(id);
    return visibles().filter(i => portee.indexOf(i.category) !== -1);
  };

  /** Ce que le catalogue doit montrer, une fois catégorie et recherche appliquées. */
  /** Les résultats d'une recherche, à travers tout le catalogue. */
  function affiches() {
    const q = recherche.trim().toLowerCase();
    if (!q) return objetsDe(cat);
    return visibles().filter(i => i.name.toLowerCase().indexOf(q) !== -1);
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

    /* Tout replier n'a de sens que s'il y a des sections à replier, et pas
       pendant une recherche, qui les fait disparaître. */
    const cles = sections().map(s => s.cle);
    const toutPlie = cles.length > 0 && cles.every(plie);

    return '<div class="pile pile--sm" style="margin-bottom:var(--e-4)">' +
      '<div class="rang">' +
        '<div class="fact__rech">' + U.icone("recherche") +
          '<input class="saisie" id="f-q" type="search" placeholder="Chercher un objet…" ' +
            'value="' + U.esc(recherche) + '" autocomplete="off">' +
        "</div>" +
        (cles.length > 1 && !recherche
          ? U.bouton(toutPlie ? "Tout déplier" : "Tout replier",
              { variante: "fantome", taille: "sm", icone: "chevron", action: "plier-tout" })
          : "") +
      "</div>" +

      '<div class="onglets" role="tablist">' + tetes.map(x =>
        '<button class="onglet' + (x.c.id === cat && !recherche ? " is-actif" : "") +
          '" data-cat="' + U.esc(x.c.id) + '" role="tab">' + U.esc(x.c.name) +
          ' <span class="muet">' + x.items.length + "</span></button>").join("") + "</div>" +

      /* Les sous-catégories ne filtrent plus, elles mènent : un clic descend
         à la section. Inutile d'en proposer une seule — on serait déjà
         dessus. */
      (toutesSections().length > 1 && !recherche
        ? '<div class="onglets onglets--sous">' +
            '<button class="onglet' + (sous ? "" : " is-actif") + '" data-vers="">' +
              "Tout" + ' <span class="muet">' + objetsDe(cat).length + "</span></button>" +
            toutesSections().map(s =>
              '<button class="onglet' + (sous === s.cle ? " is-actif" : "") +
                '" data-vers="' + U.esc(s.cle) + '">' +
                U.esc(s.nom || "Autres") +
                ' <span class="muet">' + s.items.length + "</span></button>").join("") +
          "</div>"
        : "") +
    "</div>";
  }

  /**
   * Les sections de la catégorie ouverte : une par sous-catégorie qui a des
   * objets, plus « Autres » pour ceux rangés directement dessous.
   *
   * Une sous-catégorie vide ne fait pas de section : un titre suivi de rien
   * n'apprend rien et prend une ligne.
   */
  /** Les sections montrées : toutes, ou la seule choisie. */
  function sections() {
    return sous ? toutesSections().filter(s => s.cle === sous) : toutesSections();
  }

  function toutesSections() {
    const out = MNStore.subCategories(cat)
      .map(c => ({ cle: c.id, nom: c.name, items: visibles().filter(i => i.category === c.id) }))
      .filter(s => s.items.length);

    const direct = visibles().filter(i => i.category === cat);
    /* Les objets rangés dans la catégorie elle-même passent en tête : ce sont
       les plus courants, et les reléguer sous les sous-catégories les
       cacherait. Ils ne prennent un titre que s'il y a autre chose à côté. */
    if (direct.length) {
      out.unshift({ cle: cat + "|direct", nom: out.length ? "Autres" : "", items: direct });
    }
    return out;
  }

  /* La porte de sortie d'un écran vide. Le champ de recherche vit dans la
     barre du haut, pas dans la zone qu'on vient de redessiner : on le vide
     lui, puis on repeint. */
  function brancherSortie(zone) {
    const b = zone.querySelector('[data-a="vider-q"]');
    if (!b) return;
    b.addEventListener("click", () => {
      recherche = "";
      const q = $("#f-q");
      if (q) q.value = "";
      hote.querySelectorAll(".onglets").forEach(o => o.classList.remove("is-eteint"));
      dessinerCatalogue();
    });
  }

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
    hote.querySelectorAll("[data-vers]").forEach(b => b.addEventListener("click", () => {
      sous = b.dataset.vers;
      localStorage.setItem(K_SOUS, sous);
      /* Une section qu'on vient de choisir s'ouvre : la montrer repliée
         reviendrait à n'avoir rien montré. */
      if (sous && plie(sous)) basculer(sous);
      dessiner();
    }));

    const bt = hote.querySelector('[data-a="plier-tout"]');
    if (bt) {
      bt.addEventListener("click", () => {
        const cles = sections().map(s => s.cle);
        /* Tout ou rien : à moitié replié, le bouton replie le reste. */
        plisEcrire(cles.every(plie) ? [] : cles);
        dessiner();
      });
    }
  }

  function dessinerCatalogue() {
    const zone = $("#f-catalogue");
    const grille = l => '<div class="grille grille--fact">' + l.map(carteObjet).join("") + "</div>";

    /* La recherche coupe à travers les catégories : on la montre à plat,
       ranger ses résultats par section n'aurait pas de sens. */
    if (recherche.trim()) {
      const l = affiches();
      zone.innerHTML = l.length
        ? grille(l)
        : U.vide({ icone: "recherche", titre: "Aucun objet",
                   texte: "Rien ne correspond à « " + recherche + " ».",
                   action: U.bouton("Effacer la recherche",
                     { variante: "doux", taille: "sm", action: "vider-q" }) });
      brancherCartes(zone);
      return brancherSortie(zone);
    }

    const secs = sections();
    if (!secs.length) {
      zone.innerHTML = U.vide({ icone: "recherche", titre: "Aucun objet",
        texte: "Cette catégorie est vide." });
      return;
    }

    /* Une seule section sans nom : c'est une catégorie sans sous-catégorie,
       un titre unique au-dessus de tout n'apprendrait rien. */
    if (secs.length === 1 && !secs[0].nom) {
      zone.innerHTML = grille(secs[0].items);
      return brancherCartes(zone);
    }

    zone.innerHTML = secs.map(s =>
      '<div class="ad-bloc' + (plie(s.cle) ? " est-plie" : "") + '">' +
        '<div class="ad-tete ad-tete--sous" data-plier="' + U.esc(s.cle) + '" ' +
          'role="button" tabindex="0" aria-expanded="' + (plie(s.cle) ? "false" : "true") + '">' +
          U.icone("chevron", "ad-tete__chev") + U.esc(s.nom || "Autres") +
          '<span class="ad-tete__n">' + s.items.length + "</span>" +
        "</div>" +
        '<div class="ad-plie">' + grille(s.items) + "</div>" +
      "</div>").join("");

    zone.querySelectorAll("[data-plier]").forEach(t => {
      const ouvrir = () => { basculer(t.dataset.plier); dessiner(); };
      t.addEventListener("click", ouvrir);
      /* C'est un bouton : il doit répondre au clavier comme tel. */
      t.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); }
      });
    });
    brancherCartes(zone);
  }

  function carteObjet(it) {
    const q = panier[it.id] || 0;
    const bloc = bloqueur(it);
    const plein = it.max > 0 && q >= it.max;

    const couts = Object.keys(it.cost || {}).map(rid => {
      const r = MNStore.resourceById(rid);
      /* L'image de la ressource plutôt que son nom, comme en V1 : on
         reconnaît un bidon d'huile d'un coup d'œil, on lit « Huile
         moteur » ligne par ligne. Le nom reste au survol, pour qui doute. */
      return r ? '<span class="objet__cout" style="color:' + U.esc(r.color) +
        '" title="' + U.esc(r.name) + '">' + mnIcon(r.icon) +
        "<i>" + U.nombre(it.cost[rid] * Math.max(1, q)) + "</i></span>" : "";
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
      /* Et le clic droit retire, comme en V1 : on se trompe d'un objet bien
         plus souvent qu'on ne veut le menu du navigateur sur une vignette. */
      el.addEventListener("contextmenu", e => {
        e.preventDefault();
        poser(id, (panier[id] || 0) - 1);
      });
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
      U.toast("Maximum " + it.max + " par devis", "info");
    }

    if (q) panier[id] = q; else delete panier[id];
    panier = MNStore.setCart(panier);
    crierPanier();

    dessinerCatalogue();
    dessinerPanier();
  }

  /* La pastille du menu et les autres onglets suivent le panier : encore
     faut-il le leur dire. Le squelette écoute, on annonce. */
  const crierPanier = () =>
    document.dispatchEvent(new CustomEvent("v2:panier"));

  /* Un devis repris depuis l'historique arrive par là : le panier a déjà été
     remplacé, il ne reste qu'à se remettre à jour sans recharger la page. */
  document.addEventListener("v2:panier", e => {
    if (!e.detail || !e.detail.repris || !hote) return;
    panier = MNStore.getCart();
    dessinerCatalogue();
    dessinerPanier();
  });

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
      titre: "Devis",
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
      crierPanier();
      dessinerCatalogue(); dessinerPanier();
      U.toast("Panier vidé", "ok");
    });

    const ouvrir = hote.querySelector('[data-a="ouvrir"]');
    if (ouvrir) ouvrir.addEventListener("click", () => {
      const t = MNStore.totals(panier);
      const m = U.modale({ titre: "Devis", corps: corpsPanier(t, true),
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
    return "DEVIS-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      "-" + p(d.getHours()) + p(d.getMinutes());
  };

  function enregistrer() {
    const t = MNStore.totals(panier);
    if (!t.count) return;

    const m = U.modale({
      titre: "Enregistrer le devis",
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
            crierPanier();

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
})();
