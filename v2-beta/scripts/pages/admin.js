/* ==========================================================================
   Administration.

   Tout se modifie dans un brouillon gardé par le navigateur, puis part en
   ligne d'un clic. Le bandeau du squelette dit en permanence s'il reste
   quelque chose à publier.

   Le panneau est vaste : il se reprend onglet par onglet. Ceux qui ne sont
   pas encore repris renvoient vers la V1, qui reste complète.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  const K_AUTO = "mn.gh.auto";
  /* Chaque envoi déclenche une reconstruction du site, et elles se font à la
     queue leu leu : quinze secondes d'attente en regroupent beaucoup, et ne
     coûtent rien puisque la mise en ligne prend de toute façon plus. */
  const DELAI_AUTO = 15000;

  let hote = null, moi = null;
  let brouillon = null;
  let onglet = "";
  let filtre = "";
  let minuterie = null;

  const ONGLETS = [
    { id: "objets",  nom: "Objets",           icone: "boite",      perm: "items",
      n: () => brouillon.items.length },
    { id: "cats",    nom: "Catégories",       icone: "grille",     perm: "items",
      n: () => brouillon.categories.length },
    { id: "res",     nom: "Ressources",       icone: "ressource",  perm: "items",
      n: () => brouillon.resources.length },
    { id: "ctypes",  nom: "Types de contrat", icone: "contrat",    perm: "contracts",
      n: () => (brouillon.contractTypes || []).length },
    { id: "images",  nom: "Images",           icone: "recu",       perm: "items" },
    { id: "users",   nom: "Employés",         icone: "equipe",     perm: "users",
      n: () => brouillon.users.length },
    { id: "roles",   nom: "Rôles",            icone: "etoile",     perm: "users",
      n: () => brouillon.roles.length },
    { id: "theme",   nom: "Apparence",        icone: "palette",    perm: "theme" },
    { id: "discord", nom: "Discord",          icone: "nuage",      perm: "admin" },
    { id: "site",    nom: "Le site",          icone: "reglages",   perm: "admin" },
    { id: "publier", nom: "Publier",          icone: "nuage",      perm: "publish" }
  ];

  const permis = () => ONGLETS.filter(o => MNAuth.can(o.perm));

  V2Shell.demarrer({
    page: "admin",
    titre: "Administration",
    pret: function (session, h) {
      hote = h; moi = session;
      if (!V2Shell.peut("items", "users", "publish", "theme", "contracts", "admin")) {
        return V2Shell.refuser(hote, "l'administration");
      }
      brouillon = MNStore.clone(MNStore.catalog());
      onglet = (permis()[0] || { id: "objets" }).id;
      dessiner();
    }
  });

  /* ---- Enregistrement --------------------------------------------------------- */

  function valider() {
    brouillon = MNStore.saveDraft(brouillon);
    MNAuth.refresh();
    programmerEnvoi();
    dessiner();
  }

  const autoPret = () =>
    localStorage.getItem(K_AUTO) === "1" && MNAuth.can("publish") && MNGitHub.canPublish();

  /** Replanifie un envoi : chaque nouvelle modification repousse le départ. */
  function programmerEnvoi() {
    clearTimeout(minuterie);
    if (!autoPret()) return;
    minuterie = setTimeout(envoyer, DELAI_AUTO);
  }

  async function envoyer() {
    if (!MNStore.hasDraft()) return;
    const cat = MNStore.catalog();
    try {
      await MNGitHub.publish(MNStore.toJSON(cat), "Catalogue mis à jour par " + moi.pseudo);
      localStorage.setItem("mn.gh.stamp", cat.updatedAt);
      U.toast("Publié automatiquement", "ok");
    } catch (e) {
      U.toast("Publication automatique impossible : " + (e && e.message || e), "err");
    }
    V2Shell.brouillon(dessiner);
  }

  /* ---- Replis mémorisés ----------------------------------------------------
     Un atelier qui a quinze catégories ne veut pas les replier à chaque
     visite : l'état tient dans le navigateur, pas dans les données. */

  function plis(cle) {
    const lire = () => {
      try { return JSON.parse(localStorage.getItem(cle)) || []; }
      catch (_) { return []; }
    };
    const ecrire = l => { try { localStorage.setItem(cle, JSON.stringify(l)); } catch (_) {} };
    return {
      tous: lire,
      a: k => lire().indexOf(k) !== -1,
      poser: l => ecrire(l),
      basculer: k => {
        const l = lire(), i = l.indexOf(k);
        if (i === -1) l.push(k); else l.splice(i, 1);
        ecrire(l);
      }
    };
  }
  const plisObjets = plis("mn.admin.folds");
  const plisCats = plis("mn.admin.catfolds");

  /* ---- Rendu ------------------------------------------------------------------- */

  function dessiner() {
    V2Shell.brouillon(dessiner);

    hote.innerHTML =
      '<div class="onglets onglets--fin" id="a-onglets">' + permis().map(o =>
        '<button class="onglet' + (o.id === onglet ? " is-actif" : "") +
          '" data-o="' + o.id + '">' + U.icone(o.icone) + "<span>" + U.esc(o.nom) + "</span>" +
          (o.n ? '<span class="onglet__n">' + o.n() + "</span>" : "") +
        "</button>").join("") + "</div>" +
      '<div id="a-vue" style="margin-top:var(--e-4)"></div>';

    hote.querySelectorAll("[data-o]").forEach(b => b.addEventListener("click", () => {
      onglet = b.dataset.o; filtre = ""; dessiner();
    }));

    ({
      objets: vueObjets, cats: vueCats, res: vueRes, ctypes: vueCtypes
    }[onglet] || aVenir)($("#a-vue"));
  }

  /** Onglet pas encore repris : on le dit, et on renvoie là où il marche. */
  function aVenir(z) {
    const o = ONGLETS.find(x => x.id === onglet) || {};
    z.innerHTML = U.vide({
      icone: o.icone || "reglages",
      titre: "« " + (o.nom || "Cet onglet") + " » n'est pas encore repris",
      texte: "La V2 se construit onglet par onglet. Celui-ci fonctionne " +
             "normalement sur le site officiel.",
      action: U.bouton("Ouvrir dans la V1", { href: "../admin.html", variante: "doux",
                                              icone: "fleche" })
    });
  }

  /* ---- Briques communes ---------------------------------------------------------- */

  /** Barre d'outils d'un onglet : une phrase à gauche, des boutons à droite. */
  const outils = (texte, boutons) =>
    '<div class="ad-outils">' +
      '<span class="ad-outils__txt">' + texte + "</span>" +
      '<div class="rang">' + (boutons || "") + "</div>" +
    "</div>";

  /** Flèches monter / descendre d'une ligne. */
  const fleches = (i, n) =>
    '<span class="ad-ordre">' +
      '<button data-a="up"' + (i === 0 ? " disabled" : "") + ' aria-label="Monter">▲</button>' +
      '<button data-a="down"' + (i === n - 1 ? " disabled" : "") + ' aria-label="Descendre">▼</button>' +
    "</span>";

  /** Écouteurs communs des lignes. Un gestionnaire explicite prime. */
  function brancherLignes(z, tableau, gestes) {
    z.querySelectorAll("[data-ligne]").forEach(ligne => {
      const id = ligne.dataset.ligne;
      ligne.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", e => {
        e.stopPropagation();
        const obj = tableau.find(x => x.id === id);
        if (!obj) return;
        const a = b.dataset.a;
        if (gestes[a]) return gestes[a](obj);
        if (a === "up" || a === "down") return deplacer(tableau, id, a === "up" ? -1 : 1);
      }));
    });
  }

  function deplacer(tableau, id, sens) {
    const i = tableau.findIndex(x => x.id === id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= tableau.length) return;
    tableau.splice(j, 0, tableau.splice(i, 1)[0]);
    valider();
  }

  /** Champ de recherche qui ne perd pas le curseur au redessin. */
  function brancherRecherche(z, id, redessiner) {
    const n = z.querySelector(id);
    if (!n) return;
    n.addEventListener("input", () => {
      filtre = n.value;
      const p = n.selectionStart;
      redessiner();
      const m = document.querySelector(id);
      if (m) { m.focus(); m.setSelectionRange(p, p); }
    });
  }

  /* ---- Objets ---------------------------------------------------------------------- */

  function vueObjets(z) {
    const cats = brouillon.categories;
    const f = filtre.toLowerCase();
    const l = brouillon.items.filter(i => !f || i.name.toLowerCase().indexOf(f) !== -1);

    /* Pendant une recherche, tout est déplié : masquer un résultat trouvé
       serait absurde. L'état enregistré n'est pas touché pour autant. */
    const plies = f ? [] : plisObjets.tous();
    const plie = k => plies.indexOf(k) !== -1;

    const cles = [];
    cats.filter(c => !c.parent).forEach(p => {
      cles.push("cat:" + p.id);
      cats.filter(c => c.parent === p.id).forEach(s => cles.push("sub:" + s.id));
    });
    const toutPlie = cles.length > 0 && cles.every(plie);

    const bloc = (classe, niveau, cle, nom, n, corps) =>
      '<div class="' + classe + (plie(cle) ? " est-plie" : "") + '">' +
        '<div class="ad-tete ad-tete--' + niveau + '" data-plier="' + U.esc(cle) +
          '" role="button" tabindex="0" aria-expanded="' + (plie(cle) ? "false" : "true") + '">' +
          U.icone("chevron", "ad-tete__chev") + U.esc(nom) +
          '<span class="ad-tete__n">' + n + "</span>" +
        "</div>" +
        '<div class="ad-plie">' + corps + "</div>" +
      "</div>";

    z.innerHTML =
      outils('<input class="saisie" id="a-cherche" placeholder="Filtrer les objets…" value="' +
          U.esc(filtre) + '">',
        (cles.length && !f
          ? U.bouton(toutPlie ? "Tout déplier" : "Tout replier",
              { variante: "fantome", taille: "sm", icone: "chevron", action: "plier-tout" })
          : "") +
        U.bouton("Nouvel objet", { variante: "principal", icone: "plus", action: "add" })) +

      (l.length
        /* Les objets sont rangés sous leur catégorie, les sous-catégories
           formant des sous-blocs : c'est l'arborescence de la facturation. */
        ? cats.filter(c => !c.parent).map(p => {
            const directs = l.filter(i => i.category === p.id);
            const sous = cats.filter(c => c.parent === p.id)
              .map(s => ({ s, items: l.filter(i => i.category === s.id) }))
              .filter(x => x.items.length);
            const total = directs.length + sous.reduce((n, x) => n + x.items.length, 0);
            if (!total) return "";

            return bloc("ad-bloc", "cat", "cat:" + p.id, p.name, total,
              (directs.length ? directs.map(it => ligneObjet(it, p)).join("") : "") +
              sous.map(x => bloc("ad-bloc ad-bloc--sous", "sous", "sub:" + x.s.id,
                x.s.name, x.items.length,
                x.items.map(it => ligneObjet(it, x.s)).join(""))).join(""));
          }).join("")
        : U.vide({ icone: "boite", titre: "Aucun objet",
                   texte: "Clique sur « Nouvel objet » pour commencer." }));

    brancherRecherche(z, "#a-cherche", () => vueObjets(z));
    z.querySelector('[data-a="add"]').addEventListener("click", () => editerObjet(null));

    const tp = z.querySelector('[data-a="plier-tout"]');
    if (tp) tp.addEventListener("click", () => {
      plisObjets.poser(toutPlie ? [] : cles);
      vueObjets(z);
    });

    /* On bascule la classe plutôt que de tout reconstruire : le champ de
       recherche garde son focus et la liste ne saute pas. */
    z.querySelectorAll("[data-plier]").forEach(t => {
      const bascule = () => {
        plisObjets.basculer(t.dataset.plier);
        const p = t.parentElement.classList.toggle("est-plie");
        t.setAttribute("aria-expanded", p ? "false" : "true");
      };
      t.addEventListener("click", bascule);
      t.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); bascule();
      });
    });

    brancherLignes(z, brouillon.items, {
      edit: it => editerObjet(it),
      dup: it => dupliquerObjet(it),
      del: it => supprimerObjet(it),
      bascule: it => { it.enabled = !it.enabled; valider(); }
    });
  }

  function ligneObjet(it, cat) {
    const i = brouillon.items.indexOf(it);
    const couts = Object.keys(it.cost).map(rid => {
      const r = brouillon.resources.find(x => x.id === rid);
      return r ? '<span class="ad-cout">' + U.esc(r.name) + " ×" + U.nombre(it.cost[rid]) +
        "</span>" : "";
    }).join("");

    return '<div class="ad-ligne' + (it.enabled ? "" : " est-eteint") +
      '" data-ligne="' + U.esc(it.id) + '">' +
      fleches(i, brouillon.items.length) +
      '<span class="ad-ico">' + mnIcon(it.icon) + "</span>" +
      '<div class="ad-corps">' +
        "<b>" + U.esc(it.name) + (it.enabled ? "" : " " + U.etiquette("masqué")) + "</b>" +
        '<div class="ad-meta">' +
          "<i>" + U.esc(cat ? cat.name : "?") + "</i>" +
          (it.max > 0 ? U.etiquette("max " + it.max + " / BT") : "") +
          (it.pack > 1 ? U.etiquette("lot de " + it.pack) : "") +
          (it.temps > 0 ? U.etiquette(MNStore.duree(it.temps)) : "") +
          (it.excludes.length
            ? U.etiquette("✕ " + it.excludes.length + " incompatibilité" +
                (it.excludes.length > 1 ? "s" : ""))
            : "") +
          (couts || '<i style="color:var(--c-alerte)">aucune ressource définie</i>') +
        "</div>" +
      "</div>" +
      '<div class="ad-actes">' +
        U.bouton("", { icone: it.enabled ? "check" : "croix", variante: "fantome", taille: "sm",
                       titre: it.enabled ? "Masquer" : "Afficher", action: "bascule" }) +
        U.bouton("", { icone: "recu", variante: "fantome", taille: "sm",
                       titre: "Dupliquer", action: "dup" }) +
        U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                       titre: "Modifier", action: "edit" }) +
        U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                       titre: "Supprimer", action: "del" }) +
      "</div>" +
    "</div>";
  }

  function dupliquerObjet(it) {
    const copie = MNStore.clone(it);
    copie.id = MNStore.uniqueId(it.id, brouillon.items.map(x => x.id));
    copie.name = it.name + " (copie)";
    brouillon.items.splice(brouillon.items.indexOf(it) + 1, 0, copie);
    valider();
    U.toast("Objet dupliqué", "ok");
  }

  async function supprimerObjet(it) {
    const ok = await U.confirmer({
      titre: "Supprimer l'objet",
      message: "« " + it.name + " » sera retiré du catalogue.",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;
    brouillon.items = brouillon.items.filter(x => x.id !== it.id);
    valider();
    U.toast("Objet supprimé", "ok");
  }

  function editerObjet(it) {
    const neuf = !it;
    if (neuf && !brouillon.categories.length) {
      return U.toast("Crée d'abord une catégorie", "err");
    }
    const cur = it ? MNStore.clone(it) : {
      id: "", name: "", category: brouillon.categories[0].id, icon: "i-box",
      enabled: true, note: "", max: 0, pack: 0, temps: 0, excludes: [], cost: {}
    };

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "o-nom", label: "Nom de l'objet", valeur: cur.name, max: 60,
                  repere: "Ex. Kit Phares Xénon" }) +
        '<div class="champ"><label class="champ__label" for="o-cat">Catégorie</label>' +
          '<select class="liste" id="o-cat">' + optionsCategories(cur.category) + "</select></div>" +
      "</div>" +

      champIcone("o-ico", cur.icon) +

      '<div class="champ"><span class="champ__label">Ressources nécessaires (pour 1 unité)</span>' +
        '<div class="pile pile--sm" id="o-couts"></div>' +
        U.bouton("Ajouter une ressource", { variante: "fantome", taille: "sm", icone: "plus",
                                            action: "add-cout", type: "button" }) +
      "</div>" +

      '<div class="cols-2">' +
        U.champ({ id: "o-note", label: "Note (facultatif)", valeur: cur.note, max: 90,
                  repere: "Précision affichée sous le nom" }) +
        U.champ({ id: "o-max", label: "Quantité maximum par bon", type: "number", min: 0,
                  plafond: 999, valeur: Number(cur.max || 0),
                  aide: "<b>0 = illimité.</b> Mettre 2 empêche d'en prendre plus de deux " +
                        "sur un même bon de travail." }) +
      "</div>" +

      '<div class="cols-2">' +
        U.champ({ id: "o-pack", label: "Quantité par lot", type: "number", min: 0,
                  plafond: 9999, valeur: Number(cur.pack || 0),
                  aide: "<b>0 = pas de lot</b>, l'objet s'affiche sous son nom. Mettre 10 sur " +
                        "<i>Pièces détachées</i> l'affiche « 10 Pièces détachées », puis « 20 » " +
                        "pour deux. Le nom ne doit alors <b>pas</b> contenir le nombre, et le " +
                        "coût reste celui d'un lot." }) +
        U.champ({ id: "o-temps", label: "Temps de fabrication (secondes)", type: "number",
                  min: 0, plafond: 86400, valeur: Number(cur.temps || 0),
                  aide: "<b>Facultatif — 0 = non renseigné.</b> Le temps se cumule sur le bon : " +
                        "deux fois l'objet, deux fois le temps." }) +
      "</div>" +

      '<div class="champ"><span class="champ__label">Objets incompatibles</span>' +
        '<p class="champ__aide">Coche les objets qui ne peuvent pas figurer sur le même bon ' +
          "que celui-ci. Le blocage vaut dans les deux sens.</p>" +
        '<div class="ad-coches" id="o-excl"></div>' +
      "</div>" +

      U.champ({ id: "o-on", type: "bascule", label: "Visible sur la page de facturation",
                valeur: cur.enabled });

    /* --- coûts en ressources --- */
    const zCouts = corps.querySelector("#o-couts");
    const lignes = Object.keys(cur.cost).map(rid => ({ rid, qty: cur.cost[rid] }));
    if (!lignes.length) {
      lignes.push({ rid: brouillon.resources.length ? brouillon.resources[0].id : "", qty: 0 });
    }

    function peindreCouts() {
      if (!brouillon.resources.length) {
        zCouts.innerHTML = '<p class="champ__aide">Aucune ressource n\'existe encore. ' +
          "Crée-les dans l'onglet « Ressources ».</p>";
        return;
      }
      zCouts.innerHTML = lignes.map((r, i) =>
        '<div class="ad-cout-ligne" data-i="' + i + '">' +
          '<select class="liste" data-k="rid">' + brouillon.resources.map(x =>
            '<option value="' + U.esc(x.id) + '"' + (x.id === r.rid ? " selected" : "") + ">" +
            U.esc(x.name) + "</option>").join("") + "</select>" +
          '<input class="saisie saisie--nombre" type="number" min="0" max="99999" ' +
            'data-k="qty" value="' + Number(r.qty) + '">' +
          U.bouton("", { icone: "croix", variante: "fantome", taille: "sm",
                         titre: "Retirer", action: "rm-cout", type: "button" }) +
        "</div>").join("");

      zCouts.querySelectorAll(".ad-cout-ligne").forEach(n => {
        const i = Number(n.dataset.i);
        n.querySelector('[data-k="rid"]').addEventListener("change", e => {
          lignes[i].rid = e.target.value;
        });
        n.querySelector('[data-k="qty"]').addEventListener("input", e => {
          lignes[i].qty = e.target.value;
        });
        n.querySelector('[data-a="rm-cout"]').addEventListener("click", () => {
          lignes.splice(i, 1); peindreCouts();
        });
      });
    }
    peindreCouts();

    corps.querySelector('[data-a="add-cout"]').addEventListener("click", () => {
      if (!brouillon.resources.length) return;
      const pris = lignes.map(r => r.rid);
      const libre = brouillon.resources.find(r => pris.indexOf(r.id) === -1) ||
        brouillon.resources[0];
      lignes.push({ rid: libre.id, qty: 0 });
      peindreCouts();
    });

    /* --- incompatibilités --- */
    let excl = (cur.excludes || []).slice();
    const zExcl = corps.querySelector("#o-excl");
    function peindreExcl() {
      const autres = brouillon.items.filter(x => x.id !== cur.id);
      if (!autres.length) {
        zExcl.innerHTML = '<p class="champ__aide">Aucun autre objet au catalogue.</p>';
        return;
      }
      zExcl.innerHTML = autres.map(x => {
        const on = excl.indexOf(x.id) !== -1;
        /* Incompatibilité déclarée depuis l'autre objet : on l'indique plutôt
           que de laisser croire à une case décochable. */
        const inverse = (x.excludes || []).indexOf(cur.id) !== -1;
        return '<button type="button" class="ad-coche' + (on || inverse ? " est-cochee" : "") +
          (inverse ? " est-bloquee" : "") + '" data-x="' + U.esc(x.id) + '">' +
          '<span class="ad-coche__case">' + U.icone("check") + "</span>" +
          "<span><b>" + U.esc(x.name) + "</b>" +
            (inverse ? "<i>déclaré depuis « " + U.esc(x.name) + " »</i>" : "") + "</span>" +
        "</button>";
      }).join("");

      zExcl.querySelectorAll("[data-x]").forEach(b => b.addEventListener("click", () => {
        if (b.classList.contains("est-bloquee")) {
          return U.toast("À décocher depuis la fiche de l'autre objet", "info");
        }
        const i = excl.indexOf(b.dataset.x);
        if (i === -1) excl.push(b.dataset.x); else excl.splice(i, 1);
        peindreExcl();
      }));
    }
    peindreExcl();

    brancherIcone(corps, "o-ico");

    U.modale({
      titre: neuf ? "Nouvel objet" : "Modifier l'objet", corps, large: true,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: neuf ? "Créer" : "Enregistrer", variante: "principal", icone: "check",
          onClick: (fermer, k) => {
            const nom = k.querySelector("#o-nom").value.trim();
            if (!nom) return U.toast("Donne un nom à l'objet", "err");

            const cost = {};
            lignes.forEach(r => {
              const q = Math.max(0, Math.round(Number(r.qty) || 0));
              if (r.rid && q > 0) cost[r.rid] = (cost[r.rid] || 0) + q;
            });

            const data = {
              name: nom,
              category: k.querySelector("#o-cat").value,
              icon: k.querySelector("#o-ico").value.trim() || "i-box",
              note: k.querySelector("#o-note").value.trim(),
              max: borne(k.querySelector("#o-max").value, 999),
              pack: borne(k.querySelector("#o-pack").value, 9999),
              temps: borne(k.querySelector("#o-temps").value, 86400),
              enabled: k.querySelector("#o-on").checked,
              excludes: excl,
              cost
            };

            if (neuf) {
              data.id = MNStore.uniqueId(nom, brouillon.items.map(x => x.id));
              brouillon.items.push(data);
            } else {
              Object.assign(brouillon.items.find(x => x.id === it.id), data);
            }
            valider(); fermer();
            U.toast(neuf ? "Objet créé" : "Objet mis à jour", "ok");
          } }
      ]
    });
  }

  const borne = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

  /* ---- Catégories -------------------------------------------------------------------- */

  function vueCats(z) {
    /* La liste reste un tableau à plat — c'est lui qui porte l'ordre — mais
       on l'affiche en arbre : chaque principale suivie des siennes. */
    const rangees = [];
    brouillon.categories.filter(c => !c.parent).forEach(p => {
      rangees.push(p);
      brouillon.categories.filter(c => c.parent === p.id).forEach(s => rangees.push(s));
    });
    const freres = c => brouillon.categories.filter(x => x.parent === c.parent);

    z.innerHTML =
      outils("Ordre d'affichage sur la page de facturation",
        U.bouton("Nouvelle catégorie", { variante: "principal", icone: "plus", action: "add" })) +
      '<div class="pile pile--sm">' + rangees.map(c => {
        const n = brouillon.items.filter(x => x.category === c.id).length;
        const f = freres(c);
        const rang = f.indexOf(c);
        const sous = brouillon.categories.filter(x => x.parent === c.id).length;
        /* Une sous-catégorie disparaît quand sa parente est repliée : on la
           masque plutôt que de l'envelopper, la liste garde son espacement. */
        const cachee = !!c.parent && plisCats.a(c.parent);

        return '<div class="ad-ligne' + (c.parent ? " ad-ligne--sous" : "") +
          (cachee ? " est-repliee" : "") + '" data-ligne="' + U.esc(c.id) + '">' +
          (sous
            ? U.bouton("", { icone: "chevron", variante: "fantome", taille: "sm",
                             titre: plisCats.a(c.id) ? "Déplier" : "Replier", action: "plier" })
            : '<span class="ad-vide-chev"></span>') +
          '<span class="ad-ordre">' +
            '<button data-a="up"' + (rang === 0 ? " disabled" : "") + ' aria-label="Monter">▲</button>' +
            '<button data-a="down"' + (rang === f.length - 1 ? " disabled" : "") +
              ' aria-label="Descendre">▼</button>' +
          "</span>" +
          '<span class="ad-ico">' + mnIcon(c.icon) + "</span>" +
          '<div class="ad-corps"><b>' + U.esc(c.name) + "</b>" +
            '<div class="ad-meta"><i>' + n + " objet" + (n > 1 ? "s" : "") + "</i>" +
              (sous
                ? U.etiquette(sous + " sous-catégorie" + (sous > 1 ? "s" : "") +
                    (plisCats.a(c.id) ? " (repliées)" : ""))
                : "") +
            "</div></div>" +
          '<div class="ad-actes">' +
            (c.parent ? ""
              : U.bouton("", { icone: "plus", variante: "fantome", taille: "sm",
                               titre: "Ajouter une sous-catégorie", action: "sub" })) +
            U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                           titre: "Modifier", action: "edit" }) +
            U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                           titre: "Supprimer", action: "del" }) +
          "</div></div>";
      }).join("") + "</div>";

    z.querySelector('[data-a="add"]').addEventListener("click", () => editerCat(null, ""));
    brancherLignes(z, brouillon.categories, {
      edit: c => editerCat(c, ""),
      sub: c => editerCat(null, c.id),
      del: c => supprimerCat(c),
      plier: c => { plisCats.basculer(c.id); vueCats(z); },
      /* Le déplacement se fait entre voisins de même niveau : une
         sous-catégorie ne saute pas par-dessus sa parente. */
      up: c => bougerCat(c, -1),
      down: c => bougerCat(c, 1)
    });
  }

  /** Échange une catégorie avec sa voisine de même parent. */
  function bougerCat(c, sens) {
    const f = brouillon.categories.filter(x => x.parent === c.parent);
    const cible = f[f.indexOf(c) + sens];
    if (!cible) return;
    const a = brouillon.categories.indexOf(c), b = brouillon.categories.indexOf(cible);
    brouillon.categories[a] = cible;
    brouillon.categories[b] = c;
    valider();
  }

  /**
   * Liste déroulante des catégories, les sous-catégories groupées sous la
   * leur. Un objet se range indifféremment dans une principale ou une sous.
   */
  function optionsCategories(choisie) {
    const opt = c => '<option value="' + U.esc(c.id) + '"' +
      (c.id === choisie ? " selected" : "") + ">" + U.esc(c.name) + "</option>";

    return brouillon.categories.filter(c => !c.parent).map(p => {
      const enfants = brouillon.categories.filter(c => c.parent === p.id);
      if (!enfants.length) return opt(p);
      return opt(p) + '<optgroup label="' + U.esc(p.name) + ' ›">' +
        enfants.map(opt).join("") + "</optgroup>";
    }).join("");
  }

  function editerCat(c, parentId) {
    const neuf = !c;
    const cur = c || { name: "", icon: "i-box", parent: parentId || "" };

    /* On ne propose comme parents que les principales — le modèle n'accepte
       qu'un niveau — et jamais la catégorie elle-même. */
    const parentables = brouillon.categories.filter(x => !x.parent && (!c || x.id !== c.id));
    /* Une catégorie qui a déjà des sous-catégories ne peut pas en devenir une. */
    const aDesEnfants = !!c && brouillon.categories.some(x => x.parent === c.id);

    const extra = aDesEnfants
      ? '<p class="champ__aide">Cette catégorie contient des sous-catégories : ' +
        "elle reste au premier niveau.</p>"
      : U.champ({ id: "s-parent", label: "Rattachée à", type: "liste", valeur: cur.parent,
          options: [{ valeur: "", nom: "Aucune — catégorie principale" }]
            .concat(parentables.map(x => ({ valeur: x.id, nom: x.name }))),
          aide: "Une sous-catégorie apparaît sous sa catégorie, dans une seconde rangée " +
                "d'onglets sur la page de facturation." });

    petitEditeur({
      titre: neuf
        ? (parentId ? "Nouvelle sous-catégorie" : "Nouvelle catégorie")
        : "Modifier la catégorie",
      nom: cur.name, icone: cur.icon,
      repere: parentId ? "Ex. Jantes 19 pouces" : "Ex. Pneumatique",
      extra,
      surEnregistrement: (nom, icone, fermer, couleur, k) => {
        const s = k.querySelector("#s-parent");
        const parent = aDesEnfants ? "" : (s ? s.value : cur.parent);
        if (neuf) {
          brouillon.categories.push({
            id: MNStore.uniqueId(nom, brouillon.categories.map(x => x.id)),
            name: nom, icon: icone, parent
          });
        } else {
          c.name = nom; c.icon = icone; c.parent = parent;
        }
        valider(); fermer();
        U.toast(neuf ? "Catégorie créée" : "Catégorie mise à jour", "ok");
      }
    });
  }

  async function supprimerCat(c) {
    if (brouillon.categories.filter(x => !x.parent).length <= 1 && !c.parent) {
      return U.toast("Il faut au moins une catégorie principale", "err");
    }
    const enfants = brouillon.categories.filter(x => x.parent === c.id);
    const n = brouillon.items.filter(x => x.category === c.id).length;
    const repli = brouillon.categories.find(x => x.id !== c.id && x.parent !== c.id);
    if (!repli) return U.toast("Il faut au moins une autre catégorie", "err");

    const dit = [];
    if (n) dit.push(n + " objet" + (n > 1 ? "s" : "") + " ser" + (n > 1 ? "ont" : "a") +
      " déplacé" + (n > 1 ? "s" : "") + " dans « " + repli.name + " »");
    if (enfants.length) dit.push("ses " + enfants.length + " sous-catégorie" +
      (enfants.length > 1 ? "s remonteront" : " remontera") + " au premier niveau");

    const ok = await U.confirmer({
      titre: "Supprimer la catégorie",
      message: "« " + c.name + " » sera supprimée" + (dit.length ? " : " + dit.join(", ") : "") + ".",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;

    /* Les sous-catégories survivent à leur parente : les supprimer avec elle
       ferait disparaître des objets sans prévenir. */
    enfants.forEach(x => { x.parent = ""; });
    brouillon.items.forEach(i => { if (i.category === c.id) i.category = repli.id; });
    brouillon.categories = brouillon.categories.filter(x => x.id !== c.id);
    valider();
    U.toast("Catégorie supprimée", "ok");
  }

  /* ---- Ressources ---------------------------------------------------------------------- */

  function vueRes(z) {
    z.innerHTML =
      outils("Matières premières utilisées par les objets",
        U.bouton("Nouvelle ressource", { variante: "principal", icone: "plus", action: "add" })) +
      (brouillon.resources.length
        ? '<div class="pile pile--sm">' + brouillon.resources.map((r, i) => {
            const pris = brouillon.items.filter(x => x.cost[r.id]).length;
            return '<div class="ad-ligne" data-ligne="' + U.esc(r.id) + '">' +
              fleches(i, brouillon.resources.length) +
              '<span class="ad-ico" style="color:' + U.esc(r.color) + '">' +
                mnIcon(r.icon) + "</span>" +
              '<div class="ad-corps"><b>' + U.esc(r.name) + "</b>" +
                '<div class="ad-meta"><i class="ad-id">' + U.esc(r.id) + "</i>" +
                  U.etiquette(pris + " objet" + (pris > 1 ? "s" : "")) + "</div></div>" +
              '<div class="ad-actes">' +
                U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                               titre: "Modifier", action: "edit" }) +
                U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                               titre: "Supprimer", action: "del" }) +
              "</div></div>";
          }).join("") + "</div>"
        : U.vide({ icone: "ressource", titre: "Aucune ressource",
                   texte: "Crée d'abord tes matières premières (plastique, métal…), " +
                          "tu pourras ensuite les affecter aux objets." }));

    z.querySelector('[data-a="add"]').addEventListener("click", () => editerRes(null));
    brancherLignes(z, brouillon.resources, {
      edit: r => editerRes(r), del: r => supprimerRes(r)
    });
  }

  function editerRes(r) {
    const neuf = !r;
    const cur = r || { name: "", icon: "r-metal", color: "#9fb0c4" };
    petitEditeur({
      titre: neuf ? "Nouvelle ressource" : "Modifier la ressource",
      nom: cur.name, icone: cur.icon, couleur: cur.color,
      repere: "Ex. Plastiques",
      surEnregistrement: (nom, icone, fermer, couleur) => {
        if (neuf) {
          brouillon.resources.push({
            id: MNStore.uniqueId(nom, brouillon.resources.map(x => x.id)),
            name: nom, icon: icone, color: couleur
          });
        } else { r.name = nom; r.icon = icone; r.color = couleur; }
        valider(); fermer();
        U.toast(neuf ? "Ressource créée" : "Ressource mise à jour", "ok");
      }
    });
  }

  async function supprimerRes(r) {
    const pris = brouillon.items.filter(x => x.cost[r.id]);
    const ok = await U.confirmer({
      titre: "Supprimer la ressource",
      message: pris.length
        ? "« " + r.name + " » est utilisée par " + pris.length + " objet" +
          (pris.length > 1 ? "s" : "") + ". Elle sera retirée de leur coût."
        : "« " + r.name + " » sera supprimée.",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;
    brouillon.items.forEach(i => { delete i.cost[r.id]; });
    brouillon.resources = brouillon.resources.filter(x => x.id !== r.id);
    valider();
    U.toast("Ressource supprimée", "ok");
  }

  /* ---- Types de contrat ---------------------------------------------------------
     La liste vit dans le catalogue et se publie avec le reste : c'est un
     réglage d'atelier. Les contrats, eux, restent sur le serveur — seul
     l'identifiant du type les relie ici. */

  function vueCtypes(z) {
    const types = brouillon.contractTypes || [];
    z.innerHTML =
      outils("Les natures de contrat proposées à la rédaction",
        U.bouton("Nouveau type", { variante: "principal", icone: "plus", action: "add" })) +
      (types.length
        ? '<div class="pile pile--sm">' + types.map((t, i) =>
            '<div class="ad-ligne" data-ligne="' + U.esc(t.id) + '">' +
              fleches(i, types.length) +
              '<span class="ad-ico">' + mnIcon(t.icon) + "</span>" +
              '<div class="ad-corps"><b>' + U.esc(t.name) + "</b>" +
                '<div class="ad-meta"><i class="ad-id">' + U.esc(t.id) + "</i>" +
                  (t.jours
                    ? U.etiquette("valable " + t.jours + " jour" + (t.jours > 1 ? "s" : ""))
                    : "<i>sans durée proposée</i>") +
                "</div></div>" +
              '<div class="ad-actes">' +
                U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                               titre: "Modifier", action: "edit" }) +
                U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                               titre: "Supprimer", action: "del" }) +
              "</div></div>").join("") + "</div>"
        : U.vide({ icone: "contrat", titre: "Aucun type",
                   texte: "Réparation, Convoi, Fourniture… Ils servent à ranger " +
                          "et à filtrer les contrats." })) +
      '<p class="champ__aide" style="margin-top:var(--e-4)">La durée proposée remplit la ' +
        "date d'expiration à la création d'un contrat de ce type. Elle reste modifiable, " +
        "et <b>0</b> ne propose rien.</p>";

    z.querySelector('[data-a="add"]').addEventListener("click", () => editerCtype(null));
    brancherLignes(z, brouillon.contractTypes || [], {
      edit: t => editerCtype(t), del: t => supprimerCtype(t)
    });
  }

  function editerCtype(t) {
    const neuf = !t;
    const cur = t || { name: "", icon: "i-box", jours: 0 };

    petitEditeur({
      titre: neuf ? "Nouveau type de contrat" : "Modifier le type",
      nom: cur.name, icone: cur.icon, repere: "Ex. Convoi",
      extra: U.champ({ id: "t-jours", label: "Durée de validité proposée (jours)",
        type: "number", min: 0, plafond: 3650, valeur: Number(cur.jours || 0),
        aide: "<b>0 = aucune.</b> Sinon, choisir ce type à la création remplit la " +
              "date d'expiration du contrat." }),
      surEnregistrement: (nom, icone, fermer, couleur, k) => {
        const jours = borne(k.querySelector("#t-jours").value, 3650);
        if (!brouillon.contractTypes) brouillon.contractTypes = [];
        if (neuf) {
          brouillon.contractTypes.push({
            id: MNStore.uniqueId(nom, brouillon.contractTypes.map(x => x.id)),
            name: nom, icon: icone, jours
          });
        } else { t.name = nom; t.icon = icone; t.jours = jours; }
        valider(); fermer();
        U.toast(neuf ? "Type créé" : "Type mis à jour", "ok");
      }
    });
  }

  async function supprimerCtype(t) {
    /* Les contrats vivent sur le serveur : on ne peut pas savoir d'ici combien
       portent ce type. On le dit plutôt que d'annoncer un décompte inventé. */
    const ok = await U.confirmer({
      titre: "Supprimer le type",
      message: "« " + t.name + " » disparaîtra de la liste. Les contrats déjà rédigés " +
        "gardent la trace de leur type, mais il s'affichera sans son nom.",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;
    brouillon.contractTypes = (brouillon.contractTypes || []).filter(x => x.id !== t.id);
    valider();
    U.toast("Type supprimé", "ok");
  }

  /* ---- Petit éditeur : nom + icône (+ couleur) ---------------------------------- */

  function petitEditeur(o) {
    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      U.champ({ id: "s-nom", label: "Nom", valeur: o.nom, max: 40, repere: o.repere || "" }) +
      champIcone("s-ico", o.icone, o.couleur) +
      (o.couleur !== undefined
        ? U.champ({ id: "s-couleur", label: "Couleur", type: "color", valeur: o.couleur })
        : "") +
      /* Champs propres à l'appelant ; il les relit lui-même depuis `corps`. */
      (o.extra || "");

    brancherIcone(corps, "s-ico");
    const col = corps.querySelector("#s-couleur");
    if (col) col.addEventListener("input", () => {
      corps.querySelector("#s-ico-vue").style.color = col.value;
    });

    U.modale({
      titre: o.titre, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: (fermer, k) => {
            const nom = k.querySelector("#s-nom").value.trim();
            if (!nom) return U.toast("Le nom est obligatoire", "err");
            o.surEnregistrement(nom, k.querySelector("#s-ico").value.trim() || "i-box",
              fermer, col ? col.value : undefined, k);
          } }
      ]
    });
  }

  /* ---- Choix d'icône ------------------------------------------------------------- */

  const champIcone = (id, valeur, couleur) =>
    '<div class="champ"><span class="champ__label">Icône</span>' +
      '<div class="ad-icochoix">' +
        '<div class="ad-icochoix__vue" id="' + id + '-vue"' +
          (couleur ? ' style="color:' + U.esc(couleur) + '"' : "") + ">" +
          mnIcon(valeur) + "</div>" +
        '<div class="pile pile--sm" style="flex:1;min-width:0">' +
          '<input class="saisie" id="' + id + '" value="' + U.esc(valeur) +
            '" placeholder="Identifiant d\'icône, emoji ou adresse d\'image">' +
          U.bouton("Choisir dans la bibliothèque", { variante: "fantome", taille: "sm",
                                                     action: id + "-pick", type: "button" }) +
        "</div>" +
      "</div>" +
    "</div>";

  function brancherIcone(corps, id) {
    const n = corps.querySelector("#" + id);
    const vue = corps.querySelector("#" + id + "-vue");
    n.addEventListener("input", () => { vue.innerHTML = mnIcon(n.value.trim()); });
    corps.querySelector('[data-a="' + id + '-pick"]').addEventListener("click", () =>
      choisirIcone(n.value, v => { n.value = v; vue.innerHTML = mnIcon(v); }));
  }

  const IMG_DIR = (window.MN_CONFIG && MN_CONFIG.imgDir) || "assets/img";
  const IMG_RE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
  const ICON_PX = 128;                 // gabarit unique de toutes les icônes
  let cacheImages = null;

  const estData = v => /^data:image/i.test(v);
  const poids = v => Math.round(v.length * 0.75 / 1024);
  const surServeur = () => MNStore.imagesHebergees();

  async function apiImages(corps) {
    const base = MNStore.api("images");
    if (!base) throw new Error("Aucun serveur configuré.");
    const r = await fetch(base + (corps ? "" : "?t=" + Date.now()), corps
      ? { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corps) }
      : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Le serveur a répondu " + r.status);
    return j;
  }

  /**
   * Met une image au gabarit : on retire les marges transparentes, puis on
   * centre le motif dans un carré. Résultat : toutes les icônes pèsent
   * visuellement pareil, quelle que soit l'image de départ.
   */
  function normaliser(img, taille) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("dimensions inconnues");

    /* 1. copie de travail plafonnée, pour analyser les pixels */
    const cap = 512;
    const k = Math.min(cap / w, cap / h, 1);
    const sw = Math.max(1, Math.round(w * k));
    const sh = Math.max(1, Math.round(h * k));
    const src = document.createElement("canvas");
    src.width = sw; src.height = sh;
    const sctx = src.getContext("2d");
    sctx.drawImage(img, 0, 0, sw, sh);

    /* 2. boîte englobante des pixels réellement visibles */
    let x0 = 0, y0 = 0, x1 = sw - 1, y1 = sh - 1;
    try {
      const d = sctx.getImageData(0, 0, sw, sh).data;
      let minX = sw, minY = sh, maxX = -1, maxY = -1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (d[(y * sw + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) { x0 = minX; y0 = minY; x1 = maxX; y1 = maxY; }
    } catch (_) { /* canvas protégé : on garde l'image entière */ }

    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

    /* 3. mise à l'échelle dans le carré, avec une marge de respiration */
    const marge = Math.round(taille * 0.05);
    const boite = taille - marge * 2;
    const s = Math.min(boite / cw, boite / ch);
    const dw = Math.max(1, Math.round(cw * s));
    const dh = Math.max(1, Math.round(ch * s));

    const out = document.createElement("canvas");
    out.width = taille; out.height = taille;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, x0, y0, cw, ch,
      Math.round((taille - dw) / 2), Math.round((taille - dh) / 2), dw, dh);
    return out.toDataURL("image/png");
  }

  function fichierVersIcone(f, fait) {
    if (!/^image\//.test(f.type)) return U.toast("Ce fichier n'est pas une image", "err");
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try { fait(normaliser(img, ICON_PX)); }
      catch (_) { U.toast("Image impossible à convertir", "err"); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); U.toast("Image illisible", "err"); };
    img.src = url;
  }

  /**
   * Toutes les images disponibles, celles du serveur d'abord.
   * Avec un jeton GitHub on lit le dépôt (toujours exact) ; sinon on retombe
   * sur le manifeste, tenu à jour à chaque dépôt.
   */
  async function listerImages(force) {
    if (cacheImages && !force) return cacheImages;
    let noms = [], source = "none", serveur = [];

    if (surServeur()) {
      try { serveur = (await apiImages()).images || []; }
      catch (_) { /* serveur muet : on se rabat sur le dépôt */ }
    }

    if (MNGitHub.hasToken() && MNGitHub.isConfigured()) {
      try {
        const fichiers = await MNGitHub.listDir(IMG_DIR);
        noms = fichiers.filter(f => f.type === "file" && IMG_RE.test(f.name)).map(f => f.name);
        source = "github";
      } catch (_) { /* on tentera le manifeste */ }
    }
    if (source !== "github") {
      try {
        const r = await fetch(IMG_DIR + "/index.json?v=" + Date.now(), { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          noms = (Array.isArray(j) ? j : j.images || []).filter(n => IMG_RE.test(n));
          source = "manifeste";
        }
      } catch (_) { /* rien de listable */ }
    }
    noms.sort((a, b) => a.localeCompare(b, "fr"));
    serveur.sort((a, b) => a.localeCompare(b, "fr"));

    const refs = serveur.map(n => ({ nom: n, ref: MNStore.IMG_TAG + n, serveur: true }))
      .concat(noms.map(n => ({ nom: n, ref: IMG_DIR + "/" + n, serveur: false })));

    cacheImages = { noms, serveur, refs, source };
    return cacheImages;
  }

  /** Demande un nom de fichier avant dépôt. Résout à null si on renonce. */
  function demanderNom(propose) {
    return new Promise(resolve => {
      let fini = false;
      const finir = v => { if (!fini) { fini = true; resolve(v); } };

      const corps = document.createElement("div");
      corps.innerHTML =
        U.champ({ id: "fn", label: "Nom du fichier", valeur: propose, max: 48 }) +
        '<p class="champ__aide" style="margin-top:var(--e-3)">' + (surServeur()
          ? "L'image part sur <b>le serveur de l'atelier</b> : elle est en ligne " +
            "immédiatement, sans reconstruction du site."
          : "L'image sera déposée dans <code>" + IMG_DIR + "/</code> puis référencée par " +
            "son chemin : le fichier de données reste léger et l'image apparaît dans la " +
            "liste pour toute l'équipe.") + "</p>";

      const m = U.modale({
        titre: "Déposer l'image", corps,
        actions: [
          { label: "Annuler", onClick: f => { finir(null); f(); } },
          { label: "Déposer", variante: "principal", icone: "nuage",
            onClick: (f, k) => {
              const brut = k.querySelector("#fn").value.replace(/\.[a-z0-9]+$/i, "");
              finir(MNStore.slugify(brut) + ".png");
              f();
            } }
        ]
      });
      /* Fermeture par la croix, le voile ou Échap : la promesse doit se
         résoudre quand même, sinon l'appelant attendrait indéfiniment. */
      const obs = new MutationObserver(() => {
        if (!document.body.contains(m.element)) { obs.disconnect(); finir(null); }
      });
      obs.observe(document.body, { childList: true });
    });
  }

  /**
   * Dépose une image et renvoie la référence à enregistrer. Sur le serveur
   * quand il est configuré — instantané ; sinon dans le dépôt, image et
   * manifeste dans le même envoi.
   */
  async function deposer(data, propose) {
    const nom = await demanderNom(propose);
    if (!nom) return null;

    if (surServeur()) {
      await apiImages({ name: nom, base64: MNGitHub.imageBrute(data) });
      cacheImages = null;
      return MNStore.IMG_TAG + nom;
    }

    const chemin = IMG_DIR + "/" + nom;
    const fichiers = [{ path: chemin, content: MNGitHub.imageBrute(data), base64: true }];
    try {
      const noms = (await listerImages(true)).noms.slice();
      if (noms.indexOf(nom) === -1) noms.push(nom);
      noms.sort();
      fichiers.push({ path: IMG_DIR + "/index.json",
                      content: JSON.stringify(noms, null, 2) + "\n" });
    } catch (_) { /* le manifeste n'est qu'un confort, pas un bloquant */ }

    await MNGitHub.putFiles(fichiers, "Ajout de l'image " + nom + " depuis l'administration");
    cacheImages = null;
    return chemin;
  }

  function choisirIcone(actuelle, rendre) {
    let sel = actuelle || "i-box";

    const corps = document.createElement("div");
    corps.innerHTML =
      '<div class="ad-icochoix" style="margin-bottom:var(--e-5)">' +
        '<div class="ad-icochoix__vue" id="k-vue">' + mnIcon(sel) + "</div>" +
        '<div style="flex:1;min-width:0">' +
          '<span class="champ__label">Sélection</span>' +
          '<p class="champ__aide ad-id" id="k-val"></p>' +
        "</div>" +
      "</div>" +

      '<div class="champ" style="margin-bottom:var(--e-4)">' +
        '<div class="rang">' +
          '<span class="champ__label" style="flex:1">Tes images</span>' +
          U.bouton("Actualiser", { variante: "fantome", taille: "sm", icone: "rafraichir",
                                   action: "maj", type: "button" }) +
          U.bouton("Ajouter une image", { variante: "principal", taille: "sm", icone: "plus",
                                          action: "up", type: "button" }) +
          '<input type="file" id="k-fichier" accept="image/*" hidden>' +
        "</div>" +
        '<div id="k-imgs"><p class="champ__aide">Lecture du dossier…</p></div>' +
      "</div>" +

      Object.keys(MN_ICON_GROUPS).map(g =>
        '<div style="margin-bottom:var(--e-4)">' +
          '<span class="champ__label">' + U.esc(g) + "</span>" +
          '<div class="ad-icones">' + MN_ICON_GROUPS[g].map(id =>
            '<button type="button" data-ico="' + id + '" title="' + id + '">' +
            mnIcon(id) + "</button>").join("") + "</div>" +
        "</div>").join("") +

      U.champ({ id: "k-url", label: "Autre : adresse d'image ou emoji",
                repere: "https://exemple.com/turbo.png  ·  🔧",
                valeur: (estData(sel) || /^[ir]-/.test(sel)) ? "" : sel });

    const vue = corps.querySelector("#k-vue");
    const val = corps.querySelector("#k-val");
    const url = corps.querySelector("#k-url");
    const zImgs = corps.querySelector("#k-imgs");

    function poser(v, muet) {
      sel = v || "i-box";
      vue.innerHTML = mnIcon(sel);
      val.textContent = estData(sel) ? "Image intégrée (" + poids(sel) + " ko)" : sel;
      corps.querySelectorAll("[data-ico]").forEach(b =>
        b.classList.toggle("est-choisie", b.dataset.ico === sel));
      corps.querySelectorAll("[data-img]").forEach(b =>
        b.classList.toggle("est-choisie", b.dataset.img === sel));
      if (!muet) {
        url.value = (estData(sel) || /^[ir]-/.test(sel) || sel.indexOf(IMG_DIR) === 0) ? "" : sel;
      }
    }
    poser(sel, true);

    async function peindreImages(force) {
      zImgs.innerHTML = '<p class="champ__aide">Lecture du dossier…</p>';
      const { refs, serveur, source } = await listerImages(force);

      if (!refs.length) {
        zImgs.innerHTML = '<p class="champ__aide">Aucune image trouvée. Clique sur ' +
          "<b>Ajouter une image</b>" +
          (surServeur() ? "." : ", ou dépose tes fichiers dans <code>" + IMG_DIR +
            "/</code> sur GitHub.") + "</p>";
        return;
      }

      const nDepot = refs.length - serveur.length;
      zImgs.innerHTML =
        '<div class="ad-icones ad-icones--img">' + refs.map(x => {
          const src = x.serveur ? MNStore.imageUrl(x.nom) : x.ref;
          return '<button type="button" data-img="' + U.esc(x.ref) + '" title="' + U.esc(x.nom) +
            (x.serveur ? " — sur le serveur" : " — dans le dépôt") + '"' +
            (x.ref === sel ? ' class="est-choisie"' : "") +
            '><img src="' + U.esc(src) + '" alt="" loading="lazy"></button>';
        }).join("") + "</div>" +
        '<p class="champ__aide" style="margin-top:var(--e-2)">' +
          (serveur.length ? serveur.length + " sur le serveur" : "") +
          (serveur.length && nDepot ? " · " : "") +
          (nDepot ? nDepot + " dans le dépôt" +
            (source === "github" ? " (lues directement)" : " (d'après le manifeste)") : "") +
        "</p>";

      zImgs.querySelectorAll("[data-img]").forEach(b =>
        b.addEventListener("click", () => poser(b.dataset.img)));
    }
    peindreImages(false);

    corps.querySelector('[data-a="maj"]').addEventListener("click", () => peindreImages(true));
    corps.querySelectorAll("[data-ico]").forEach(b =>
      b.addEventListener("click", () => poser(b.dataset.ico)));
    url.addEventListener("input", () => poser(url.value.trim() || "i-box", true));

    corps.querySelector('[data-a="up"]').addEventListener("click", () =>
      corps.querySelector("#k-fichier").click());
    corps.querySelector("#k-fichier").addEventListener("change", e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;

      fichierVersIcone(f, async data => {
        /* Sans droit de publication, l'image ne peut aller nulle part : on
           l'intègre aux données plutôt que d'échouer. */
        if (!(MNGitHub.canPublish() && MNAuth.can("publish"))) {
          poser(data, true);
          return U.toast("Image mise au gabarit et intégrée aux données (" +
            poids(data) + " ko)", "ok");
        }
        try {
          const chemin = await deposer(data, f.name);
          if (!chemin) { poser(data, true); return; }   // dépôt annulé → on intègre
          cacheImages = null;
          await peindreImages(true);
          poser(chemin, true);
          U.toast("Image déposée dans " + chemin, "ok");
        } catch (err) {
          poser(data, true);
          U.toast("Dépôt impossible (" + err.message + ") — image intégrée aux données", "err");
        }
      });
    });

    U.modale({
      titre: "Choisir une icône", corps, large: true,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Utiliser cette icône", variante: "principal", icone: "check",
          onClick: f => { rendre(sel); f(); } }
      ]
    });
  }
})();
