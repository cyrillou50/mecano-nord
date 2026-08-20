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
    minuterie = setTimeout(() => publier(true), DELAI_AUTO);
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
      objets: vueObjets, cats: vueCats, res: vueRes, ctypes: vueCtypes,
      users: vueUsers, roles: vueRoles, images: vueImages,
      theme: vueTheme, discord: vueDiscord, site: vueSite, publier: vuePublier
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

  /**
   * Une couleur hexadécimale complète, ou "" si la saisie n'en est pas
   * encore une. Le dièse est facultatif — on colle souvent sans lui — et la
   * forme courte est étendue, le sélecteur natif n'acceptant que six chiffres.
   *
   * @param {boolean} [longueSeulement] refuse la forme courte. « #ff2 » est
   *   à la fois une couleur valide et un « #ff2200 » à moitié tapé : pendant
   *   la frappe on s'en tient à la forme longue, sinon l'aperçu clignote.
   */
  function normHex(v, longueSeulement) {
    const s = String(v || "").trim().replace(/^#/, "");
    if (!longueSeulement && /^[0-9a-f]{3}$/i.test(s)) {
      return "#" + s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    }
    return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toLowerCase() : "";
  }

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

  /* ---- Employés -------------------------------------------------------------------
     Ici on règle qui entre et avec quels droits. Les fiches détaillées
     (ancienneté, formations, carrière) vivent sur la page Équipe : ce sont
     deux questions différentes, et les mélanger rendait l'onglet illisible. */

  /** Les droits d'un rôle, en étiquettes. « admin » les résume toutes. */
  function pastillesDroits(role) {
    const p = role.perms.indexOf("admin") !== -1 ? ["admin"] : role.perms;
    if (!p.length) return '<span class="etiq ad-etiq--vide">aucun droit</span>';
    if (p[0] === "admin") return U.etiquette("tous les droits", "action");
    return p.map(k => {
      const d = MN_PERMS.find(x => x.key === k);
      return U.etiquette(d ? d.name : k);
    }).join("");
  }

  function vueUsers(z) {
    z.innerHTML =
      outils("Qui peut se connecter, et avec quels droits — les flèches réordonnent la liste",
        U.bouton("Nouvel employé", { variante: "principal", icone: "plus", action: "add" })) +
      (brouillon.users.length
        ? '<div class="pile pile--sm">' + brouillon.users.map(ligneUser).join("") + "</div>"
        : U.vide({ icone: "equipe", titre: "Aucun employé",
                   texte: "Ajoute les pseudos de ton équipe pour qu'ils puissent se connecter." })) +
      '<div style="margin-top:var(--e-4)">' + U.alerte({
        ton: "info",
        texte: "Le pseudo est la seule chose à retenir. Le code d'accès est facultatif : " +
               "utile pour les comptes qui gèrent le catalogue ou l'équipe. Les fiches " +
               "détaillées se tiennent sur la page Équipe."
      }) + "</div>";

    z.querySelector('[data-a="add"]').addEventListener("click", () => editerUser(null));
    brancherLignes(z, brouillon.users, {
      edit: u => editerUser(u),
      del: u => supprimerUser(u),
      bascule: u => {
        if (moi.uid === u.id) {
          return U.toast("Tu ne peux pas désactiver ton propre compte", "err");
        }
        u.active = !u.active; valider();
      }
    });
  }

  function ligneUser(u) {
    const role = brouillon.roles.find(r => r.id === u.roleId) ||
      { name: "Sans rôle", color: "#6a6280", perms: [] };
    const i = brouillon.users.indexOf(u);

    return '<div class="ad-ligne' + (u.active ? "" : " est-eteint") +
      '" data-ligne="' + U.esc(u.id) + '">' +
      fleches(i, brouillon.users.length) +
      '<span class="avatar" style="background:' + U.esc(role.color) + '">' +
        U.esc(U.initiales(u.pseudo)) + "</span>" +
      '<div class="ad-corps">' +
        "<b>" + U.esc(u.pseudo) +
          (moi.uid === u.id ? " " + U.etiquette("toi", "action") : "") +
          (u.pin ? " " + U.etiquette("code") : "") +
          (u.active ? "" : " " + U.etiquette("désactivé")) + "</b>" +
        '<div class="ad-meta"><span style="color:' + U.esc(role.color) + '">' +
          U.esc(role.name) + "</span></div>" +
        '<div class="ad-meta">' + pastillesDroits(role) + "</div>" +
      "</div>" +
      '<div class="ad-actes">' +
        U.bouton("", { icone: u.active ? "check" : "croix", variante: "fantome", taille: "sm",
                       titre: u.active ? "Désactiver" : "Réactiver", action: "bascule" }) +
        U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                       titre: "Modifier", action: "edit" }) +
        U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                       titre: "Retirer", action: "del" }) +
      "</div>" +
    "</div>";
  }

  function editerUser(u) {
    const neuf = !u;
    const cestMoi = !neuf && moi.uid === u.id;
    if (!brouillon.roles.length) return U.toast("Crée d'abord un rôle", "err");

    /* Un nouvel employé arrive sur le rôle le MOINS doté : on ne crée jamais
       un administrateur par inadvertance. */
    const plusBas = brouillon.roles.slice().sort((a, b) => {
      const poids = r => (r.perms.indexOf("admin") !== -1 ? 99 : r.perms.length);
      return poids(a) - poids(b);
    })[0];
    const cur = u || { pseudo: "", roleId: plusBas.id, pin: null, active: true };

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "u-pseudo", label: "Pseudo (sert à se connecter)", valeur: cur.pseudo,
                  max: 32, repere: "Ex. Rico" }) +
        U.champ({ id: "u-role", label: "Rôle", type: "liste", valeur: cur.roleId,
                  options: brouillon.roles.map(r => ({ valeur: r.id, nom: r.name })),
                  aide: "Les droits viennent du rôle. Onglet « Rôles » pour les modifier." }) +
      "</div>" +

      '<div class="champ"><span class="champ__label">Droits de ce rôle</span>' +
        '<div class="ad-meta" id="u-droits"></div></div>' +

      '<div class="champ"><span class="champ__label">Code d\'accès (facultatif)</span>' +
        '<div class="cols-2">' +
          '<input class="saisie" id="u-pin" type="password" inputmode="numeric" maxlength="24" ' +
            'placeholder="' + (cur.pin ? "Laisser vide = code inchangé" : "Aucun code") + '">' +
          (cur.pin
            ? U.bouton("Retirer le code", { variante: "fantome", icone: "croix",
                                            action: "vider-pin", type: "button" })
            : '<p class="champ__aide">Sans code, il suffit de taper le pseudo pour entrer.</p>') +
        "</div></div>" +

      U.champ({ id: "u-actif", type: "bascule", label: "Compte actif", valeur: cur.active }) +
      (cestMoi
        ? '<p class="champ__aide">Tu modifies ton propre compte : tu ne peux ni le désactiver, ' +
          "ni prendre un rôle qui te retirerait la gestion de l'équipe.</p>"
        : "");

    if (cestMoi) corps.querySelector("#u-actif").disabled = true;

    let viderPin = false;
    const bVider = corps.querySelector('[data-a="vider-pin"]');
    if (bVider) bVider.addEventListener("click", () => {
      viderPin = true;
      bVider.disabled = true;
      bVider.innerHTML = U.icone("check") + "<span>Code retiré à l'enregistrement</span>";
    });

    /* Aperçu en lecture seule des droits qu'apporte le rôle choisi. */
    const zDroits = corps.querySelector("#u-droits");
    const selRole = corps.querySelector("#u-role");
    const peindreDroits = () => {
      const r = brouillon.roles.find(x => x.id === selRole.value);
      zDroits.innerHTML = r ? pastillesDroits(r) : "";
    };
    selRole.addEventListener("change", peindreDroits);
    peindreDroits();

    U.modale({
      titre: neuf ? "Nouvel employé" : "Modifier " + cur.pseudo, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: neuf ? "Ajouter" : "Enregistrer", variante: "principal", icone: "check",
          onClick: (fermer, k) => {
            const pseudo = k.querySelector("#u-pseudo").value.trim();
            if (pseudo.length < 2) return U.toast("Pseudo trop court", "err");
            if (brouillon.users.some(x =>
                x.pseudo.toLowerCase() === pseudo.toLowerCase() && (neuf || x.id !== u.id))) {
              return U.toast("Ce pseudo est déjà pris", "err");
            }

            const roleId = k.querySelector("#u-role").value;
            const pin = k.querySelector("#u-pin").value.trim();
            const actif = k.querySelector("#u-actif").checked;

            /* Sécurité anti-blocage : ne pas se priver soi-même de la gestion. */
            if (cestMoi) {
              const p = (brouillon.roles.find(x => x.id === roleId) || {}).perms || [];
              if (p.indexOf("admin") === -1 && p.indexOf("users") === -1) {
                return U.toast("Ce rôle te retirerait la gestion de l'équipe", "err");
              }
            }

            if (neuf) {
              const id = MNStore.uniqueId(pseudo, brouillon.users.map(x => x.id));
              const r = brouillon.roles.find(x => x.id === roleId);
              const maintenant = new Date().toISOString();
              brouillon.users.push({
                id, pseudo, roleId, active: actif,
                pin: pin ? MNAuth.hashPin(id, pin) : null,
                createdAt: maintenant,
                hiredAt: maintenant.slice(0, 10),
                trainings: [], note: "",
                history: [{
                  roleId, roleName: r ? r.name : roleId, at: maintenant,
                  by: moi.pseudo, note: "Entrée dans l'entreprise"
                }]
              });
            } else {
              u.pseudo = pseudo;
              /* Un changement de grade laisse une trace dans sa carrière. */
              if (roleId !== u.roleId) {
                MNStore.recordPromotion(u, roleId, brouillon.roles, moi.pseudo, "");
              }
              u.active = cestMoi ? true : actif;
              if (viderPin) u.pin = null;
              else if (pin) u.pin = MNAuth.hashPin(u.id, pin);
            }
            valider(); fermer();
            U.toast(neuf ? "Employé ajouté" : "Employé mis à jour", "ok");
          } }
      ]
    });
  }

  async function supprimerUser(u) {
    if (moi.uid === u.id) return U.toast("Tu ne peux pas te retirer toi-même", "err");
    /* Ne pas se retrouver sans personne pour gérer l'équipe. */
    const gerants = brouillon.users.filter(x =>
      x.active && MNAuth.effectivePerms(x).indexOf("users") !== -1);
    if (gerants.length <= 1 && gerants[0] && gerants[0].id === u.id) {
      return U.toast("C'est le dernier compte capable de gérer l'équipe", "err");
    }
    const ok = await U.confirmer({
      titre: "Retirer l'employé",
      message: "« " + u.pseudo + " » ne pourra plus se connecter au site.",
      confirmer: "Retirer", danger: true
    });
    if (!ok) return;
    brouillon.users = brouillon.users.filter(x => x.id !== u.id);
    valider();
    U.toast("Employé retiré", "ok");
  }

  /* ---- Rôles -------------------------------------------------------------------- */

  function vueRoles(z) {
    z.innerHTML =
      outils("Les droits sont portés par le rôle, pas par la personne",
        U.bouton("Nouveau rôle", { variante: "principal", icone: "plus", action: "add" })) +
      '<div class="pile pile--sm">' + brouillon.roles.map((r, i) => {
        const n = brouillon.users.filter(u => u.roleId === r.id).length;
        return '<div class="ad-ligne" data-ligne="' + U.esc(r.id) + '">' +
          fleches(i, brouillon.roles.length) +
          '<span class="ad-ico" style="border:1px solid ' + U.esc(r.color) +
            ';color:' + U.esc(r.color) + '">' + mnIcon(r.icon) + "</span>" +
          '<div class="ad-corps">' +
            '<b style="color:' + U.esc(r.color) + '">' + U.esc(r.name) + "</b>" +
            '<div class="ad-meta"><i>' + n + " employé" + (n > 1 ? "s" : "") + "</i></div>" +
            '<div class="ad-meta">' + pastillesDroits(r) + "</div>" +
          "</div>" +
          '<div class="ad-actes">' +
            U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                           titre: "Modifier", action: "edit" }) +
            U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                           titre: "Supprimer", action: "del" }) +
          "</div></div>";
      }).join("") + "</div>";

    z.querySelector('[data-a="add"]').addEventListener("click", () => editerRole(null));
    brancherLignes(z, brouillon.roles, { edit: r => editerRole(r), del: r => supprimerRole(r) });
  }

  function editerRole(r) {
    const neuf = !r;
    const cur = r || {
      name: "", color: MN_ROLE_COLORS[brouillon.roles.length % MN_ROLE_COLORS.length],
      icon: "i-badge", perms: ["bt", "duty"]
    };
    let droits = cur.perms.slice();
    /* Le sélecteur natif n'accepte que la forme longue : une couleur
       enregistrée en « #8cf » doit être étendue pour s'y afficher, sans quoi
       il retomberait sur du noir et effacerait le choix du grade. */
    let couleur = normHex(cur.color) || cur.color;
    let icone = cur.icon || "i-badge";

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      U.champ({ id: "r-nom", label: "Nom du rôle", valeur: cur.name, max: 28,
                repere: "Ex. Chef d'atelier" }) +

      '<div class="champ"><span class="champ__label">Écusson du grade</span>' +
        '<div class="ad-icochoix">' +
          '<div class="ad-icochoix__vue" id="r-vue" style="color:' + U.esc(couleur) + '">' +
            mnIcon(icone) + "</div>" +
          '<div class="pile pile--sm" style="flex:1;min-width:0">' +
            U.bouton("Choisir un écusson", { variante: "fantome", taille: "sm",
                                             action: "r-pick", type: "button" }) +
            '<p class="champ__aide">Icône, image ou emoji — il apparaît dans la liste des ' +
              "rôles et sur les fiches équipe.</p>" +
          "</div>" +
        "</div></div>" +

      '<div class="champ"><span class="champ__label">Couleur</span>' +
        '<div class="ad-nuancier" id="r-couleurs">' + MN_ROLE_COLORS.map(c =>
          '<button type="button" class="ad-nuance' +
          (c.toLowerCase() === couleur.toLowerCase() ? " est-choisie" : "") +
          '" data-c="' + c + '" style="background:' + c + '" aria-label="' + c +
          '"></button>').join("") + "</div>" +
        '<div class="ad-couleur">' +
          '<input class="saisie" id="r-pipette" type="color" value="' + U.esc(couleur) + '" ' +
            'aria-label="Choisir la couleur">' +
          '<input class="saisie ad-id" id="r-hex" value="' + U.esc(couleur) + '" maxlength="7" ' +
            'spellcheck="false" autocapitalize="off" placeholder="#ff2bd1" ' +
            'aria-label="Code hexadécimal">' +
        "</div>" +
        '<p class="champ__aide">Les pastilles ne sont que des raccourcis : le sélecteur et le ' +
          "code hexadécimal acceptent n'importe quelle couleur, et celle déjà posée sur le " +
          "grade est reprise telle quelle.</p>" +
      "</div>" +

      '<div class="champ"><span class="champ__label">Permissions du rôle</span>' +
        '<div class="ad-coches ad-coches--hautes" id="r-droits"></div></div>';

    const vue = corps.querySelector("#r-vue");
    corps.querySelector('[data-a="r-pick"]').addEventListener("click", () =>
      choisirIcone(icone, v => { icone = v; vue.innerHTML = mnIcon(v); }));

    const pipette = corps.querySelector("#r-pipette");
    const hex = corps.querySelector("#r-hex");

    /* Trois façons de choisir la même chose : tout repasse par ici, sinon
       les trois se désaccordent dès le second clic. `depuis` évite de
       réécrire le champ dans lequel on est en train de taper. */
    function poserCouleur(v, depuis) {
      couleur = v;
      vue.style.color = v;
      if (depuis !== "pipette") pipette.value = v;
      if (depuis !== "hex") hex.value = v;
      corps.querySelectorAll("[data-c]").forEach(x =>
        x.classList.toggle("est-choisie", x.dataset.c.toLowerCase() === v.toLowerCase()));
    }
    poserCouleur(couleur);

    corps.querySelectorAll("[data-c]").forEach(b =>
      b.addEventListener("click", () => poserCouleur(b.dataset.c, "nuance")));

    pipette.addEventListener("input", () => poserCouleur(pipette.value, "pipette"));

    /* On n'applique que la forme longue tant qu'on tape, et on ne réécrit
       jamais le champ : corriger sous les doigts déplacerait le curseur. */
    hex.addEventListener("input", () => {
      const v = normHex(hex.value, true);
      if (v) poserCouleur(v, "hex");
    });

    /* La saisie finie, la forme courte est acceptée à son tour, et ce qui
       est réellement appliqué reprend sa place : un code inachevé ne doit
       pas rester à l'écran en laissant croire qu'il compte. */
    const finirHex = () => poserCouleur(normHex(hex.value) || couleur);
    hex.addEventListener("blur", finirHex);
    hex.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finirHex(); }
    });

    const zDroits = corps.querySelector("#r-droits");
    function peindre() {
      /* « Tous les droits » avale les autres : on les montre cochés et
         verrouillés, plutôt que de laisser croire qu'on peut en retirer un. */
      const total = droits.indexOf("admin") !== -1;
      zDroits.innerHTML = MN_PERMS.map(p => {
        const on = total || droits.indexOf(p.key) !== -1;
        const bloque = total && p.key !== "admin";
        return '<button type="button" class="ad-coche' + (on ? " est-cochee" : "") +
          (bloque ? " est-bloquee" : "") + '" data-p="' + U.esc(p.key) + '">' +
          '<span class="ad-coche__case">' + U.icone("check") + "</span>" +
          "<span><b>" + U.esc(p.name) + "</b><i>" + U.esc(p.desc) + "</i></span></button>";
      }).join("");

      zDroits.querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", () => {
        if (b.classList.contains("est-bloquee")) return;
        const i = droits.indexOf(b.dataset.p);
        if (i === -1) droits.push(b.dataset.p); else droits.splice(i, 1);
        peindre();
      }));
    }
    peindre();

    U.modale({
      titre: neuf ? "Nouveau rôle" : "Modifier le rôle", corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: neuf ? "Créer" : "Enregistrer", variante: "principal", icone: "check",
          onClick: (fermer, k) => {
            const nom = k.querySelector("#r-nom").value.trim();
            if (!nom) return U.toast("Donne un nom au rôle", "err");

            /* On ne se coupe pas soi-même l'accès à la gestion de l'équipe. */
            if (!neuf && moi.roleId === r.id &&
                droits.indexOf("admin") === -1 && droits.indexOf("users") === -1) {
              return U.toast("C'est ton propre rôle : garde « Gérer l'équipe »", "err");
            }

            /* Le champ peut porter un code jamais validé : on enregistre à
               partir de ce qui est écrit, pas de la dernière frappe reconnue. */
            const teinte = normHex(k.querySelector("#r-hex").value) || couleur;

            if (neuf) {
              brouillon.roles.push({
                id: MNStore.uniqueId(nom, brouillon.roles.map(x => x.id)),
                name: nom, color: teinte, icon: icone, perms: droits
              });
            } else {
              r.name = nom; r.color = teinte; r.icon = icone; r.perms = droits;
            }
            valider(); fermer();
            U.toast(neuf ? "Rôle créé" : "Rôle mis à jour", "ok");
          } }
      ]
    });
  }

  async function supprimerRole(r) {
    if (brouillon.roles.length <= 1) return U.toast("Il faut garder au moins un rôle", "err");
    const porteurs = brouillon.users.filter(u => u.roleId === r.id);
    if (porteurs.some(u => u.id === moi.uid)) return U.toast("C'est ton propre rôle", "err");

    const repli = brouillon.roles.find(x => x.id !== r.id);
    const ok = await U.confirmer({
      titre: "Supprimer le rôle",
      message: porteurs.length
        ? "« " + r.name + " » est porté par " + porteurs.length + " employé" +
          (porteurs.length > 1 ? "s" : "") + ". Ils basculeront sur « " + repli.name + " »."
        : "« " + r.name + " » sera supprimé.",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;
    brouillon.users.forEach(u => { if (u.roleId === r.id) u.roleId = repli.id; });
    brouillon.roles = brouillon.roles.filter(x => x.id !== r.id);
    valider();
    U.toast("Rôle supprimé", "ok");
  }

  /* ---- Images ---------------------------------------------------------------------
     Le dossier d'images, vu de l'atelier : ce qui s'y trouve, ce qui s'en
     sert, et de quoi renommer ou faire le ménage. */

  /** Où une image est-elle utilisée dans le catalogue ? */
  function usagesDe(chemin) {
    const l = [];
    brouillon.items.forEach(i => { if (i.icon === chemin) l.push({ quoi: "objet", nom: i.name }); });
    brouillon.resources.forEach(r => { if (r.icon === chemin) l.push({ quoi: "ressource", nom: r.name }); });
    brouillon.categories.forEach(c => { if (c.icon === chemin) l.push({ quoi: "catégorie", nom: c.name }); });
    brouillon.roles.forEach(r => { if (r.icon === chemin) l.push({ quoi: "rôle", nom: r.name }); });
    if (brouillon.settings.brand.logo === chemin) l.push({ quoi: "logo", nom: "logo de l'atelier" });
    return l;
  }

  /** Reporte un changement de chemin partout dans le brouillon. */
  function remplacerChemin(de, vers) {
    let n = 0;
    brouillon.items.forEach(i => { if (i.icon === de) { i.icon = vers; n++; } });
    brouillon.resources.forEach(r => { if (r.icon === de) { r.icon = vers; n++; } });
    brouillon.categories.forEach(c => { if (c.icon === de) { c.icon = vers; n++; } });
    brouillon.roles.forEach(r => { if (r.icon === de) { r.icon = vers; n++; } });
    if (brouillon.settings.brand.logo === de) { brouillon.settings.brand.logo = vers; n++; }
    return n;
  }

  async function vueImages(z) {
    const peutDeposer = MNGitHub.canPublish() || surServeur();
    /* Sur le serveur, tout se fait sans jeton. Dans le dépôt, renommer et
       supprimer en exigent un. */
    const jeton = MNGitHub.hasToken() && MNGitHub.isConfigured();

    z.innerHTML =
      outils(surServeur()
          ? "Sur le serveur de l'atelier — en ligne aussitôt"
          : "Le dossier " + IMG_DIR + "/ du dépôt",
        U.bouton("Actualiser", { variante: "fantome", taille: "sm", icone: "rafraichir",
                                 action: "maj" }) +
        (surServeur()
          ? U.bouton("Transférer vers le serveur", { variante: "fantome", taille: "sm",
                                                     icone: "nuage", action: "migrer" })
          : "") +
        U.bouton("Ajouter une image", { variante: "principal", icone: "plus", action: "add" }) +
        '<input type="file" id="i-fichier" accept="image/*" hidden>') +
      (jeton || surServeur() ? "" : U.alerte({
        ton: "alerte",
        texte: "Sans jeton GitHub sur cet appareil, tu peux consulter les images mais " +
               "pas les renommer ni les supprimer. Configure-le dans l'onglet « Publier »."
      })) +
      '<div id="i-liste" style="margin-top:var(--e-3)">' +
        '<p class="champ__aide">Lecture du dossier…</p></div>';

    z.querySelector('[data-a="maj"]').addEventListener("click", () => {
      cacheImages = null; vueImages(z);
    });
    const mig = z.querySelector('[data-a="migrer"]');
    if (mig) mig.addEventListener("click", () => migrerImages(z));

    z.querySelector('[data-a="add"]').addEventListener("click", () =>
      z.querySelector("#i-fichier").click());
    z.querySelector("#i-fichier").addEventListener("change", e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      fichierVersIcone(f, async data => {
        if (!peutDeposer) {
          return U.toast("Serveur ou jeton GitHub requis pour déposer une image", "err");
        }
        try {
          const chemin = await deposer(data, f.name);
          if (!chemin) return;
          cacheImages = null;
          vueImages(z);
          U.toast("Image déposée : " + chemin, "ok");
        } catch (err) { U.toast("Dépôt impossible : " + err.message, "err"); }
      });
    });

    const liste = z.querySelector("#i-liste");
    const { refs, serveur, source } = await listerImages(false);
    /* La page a pu changer d'onglet pendant la lecture. */
    if (!liste.isConnected) return;

    if (!refs.length) {
      liste.innerHTML = U.vide({ icone: "recu", titre: "Aucune image",
                                 texte: "Clique sur « Ajouter une image » pour commencer." });
      return;
    }

    liste.innerHTML =
      '<div class="pile pile--sm">' + refs.map(x => {
        const usages = usagesDe(x.ref);
        const src = x.serveur ? MNStore.imageUrl(x.nom) : x.ref;
        /* Une image du dépôt reste intouchable sans jeton ; celles du
           serveur ne demandent rien. */
        const modifiable = x.serveur || jeton;
        return '<div class="ad-ligne" data-img="' + U.esc(x.nom) + '" data-srv="' +
          (x.serveur ? "1" : "") + '">' +
          '<span class="ad-ico"><img src="' + U.esc(src) +
            '" alt="" loading="lazy" decoding="async"></span>' +
          '<div class="ad-corps"><b>' + U.esc(x.nom) + "</b>" +
            '<div class="ad-meta">' +
              U.etiquette(x.serveur ? "serveur" : "dépôt", x.serveur ? "action" : "") +
              (usages.length
                ? usages.map(u => U.etiquette(u.quoi + " : " + u.nom)).join("")
                : '<i style="color:var(--c-alerte)">non utilisée</i>') +
            "</div></div>" +
          '<div class="ad-actes">' +
            U.bouton("", { icone: "crayon", variante: "fantome", taille: "sm",
                           titre: "Renommer", action: "ren", desactive: !modifiable }) +
            U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
                           titre: "Supprimer", action: "del", desactive: !modifiable }) +
          "</div></div>";
      }).join("") + "</div>" +
      '<p class="champ__aide" style="margin-top:var(--e-3)">' +
        (serveur.length ? serveur.length + " sur le serveur" : "") +
        (serveur.length && refs.length - serveur.length ? " · " : "") +
        (refs.length - serveur.length
          ? (refs.length - serveur.length) + " dans le dépôt" +
            (source === "github" ? " (lues directement)" : " (d'après le manifeste)")
          : "") + "</p>";

    liste.querySelectorAll("[data-img]").forEach(l => {
      const nom = l.dataset.img;
      const srv = l.dataset.srv === "1";
      l.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => {
        if (b.disabled) return;
        if (b.dataset.a === "ren") renommerImage(nom, srv, z);
        else supprimerImage(nom, srv, z);
      }));
    });
  }

  /**
   * Copie les images du dépôt vers le serveur et fait suivre les références.
   *
   * Les fichiers du dépôt ne sont pas supprimés : ils ne gênent personne, et
   * les garder laisse un filet si le serveur devait être réinstallé.
   */
  async function migrerImages(z) {
    const { refs, serveur } = await listerImages(true);
    const aFaire = refs.filter(x => !x.serveur && serveur.indexOf(x.nom) === -1);

    if (!aFaire.length) {
      return U.toast(refs.length === serveur.length
        ? "Toutes les images sont déjà sur le serveur"
        : "Rien à transférer", "info");
    }

    const ok = await U.confirmer({
      titre: "Transférer vers le serveur",
      message: aFaire.length + " image" + (aFaire.length > 1 ? "s" : "") + " du dépôt " +
        (aFaire.length > 1 ? "seront copiées" : "sera copiée") + " sur le serveur, et le " +
        "catalogue mis à jour pour les y chercher. Les fichiers restent dans le dépôt, " +
        "en réserve — tu pourras les y supprimer plus tard.",
      confirmer: "Transférer"
    });
    if (!ok) return;

    const liste = z.querySelector("#i-liste");
    let faites = 0, ratees = 0, refaites = 0;

    for (const x of aFaire) {
      if (liste) {
        liste.innerHTML = '<p class="champ__aide">Transfert… ' + (faites + ratees + 1) +
          " / " + aFaire.length + " — " + U.esc(x.nom) + "</p>";
      }
      try {
        /* L'image est déjà servie par le site : on la relit là où elle est
           plutôt que de repasser par l'API GitHub. */
        const r = await fetch(x.ref + "?v=" + Date.now(), { cache: "no-store" });
        if (!r.ok) throw new Error("lecture " + r.status);
        const base64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onerror = () => rej(new Error("lecture impossible"));
          fr.onload = () => res(String(fr.result).split(",")[1] || "");
          r.blob().then(b => fr.readAsDataURL(b), rej);
        });

        await apiImages({ name: x.nom, base64 });
        refaites += remplacerChemin(x.ref, MNStore.IMG_TAG + x.nom);
        faites++;
      } catch (e) {
        console.error(x.nom, e);
        ratees++;
      }
    }

    cacheImages = null;
    if (refaites) valider();
    vueImages(z);
    U.toast(faites + " image(s) transférée(s)" +
      (refaites ? " — " + refaites + " référence(s) mise(s) à jour" : "") +
      (ratees ? " · " + ratees + " en échec" : ""), ratees ? "info" : "ok");
  }

  function renommerImage(nom, srv, z) {
    const de = srv ? MNStore.IMG_TAG + nom : IMG_DIR + "/" + nom;
    const ext = (nom.match(/\.[a-z0-9]+$/i) || [".png"])[0];
    const usages = usagesDe(de);

    const corps = document.createElement("div");
    corps.innerHTML =
      U.champ({ id: "rn", label: "Nouveau nom", max: 48,
                valeur: nom.replace(/\.[a-z0-9]+$/i, "") }) +
      '<p class="champ__aide" style="margin-top:var(--e-3)">L\'extension <code>' +
        U.esc(ext) + "</code> est conservée. " +
        (usages.length
          ? "Les <b>" + usages.length + " référence" + (usages.length > 1 ? "s" : "") +
            "</b> dans le catalogue seront mises à jour automatiquement."
          : "Cette image n'est utilisée nulle part.") + "</p>";

    U.modale({
      titre: "Renommer l'image", corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Renommer", variante: "principal", icone: "check",
          onClick: async (fermer, k, btn) => {
            const nom2 = MNStore.slugify(k.querySelector("#rn").value) + ext;
            const vers = srv ? MNStore.IMG_TAG + nom2 : IMG_DIR + "/" + nom2;
            if (vers === de) return fermer();

            btn.disabled = true;
            btn.innerHTML = U.icone("rafraichir") + "<span>Renommage…</span>";
            try {
              if (srv) {
                await apiImages({ op: "rename", from: nom, to: nom2 });
              } else {
                /* Le manifeste voyage avec le renommage : un seul envoi. */
                let manifeste = [];
                try {
                  const noms = (await listerImages(true)).noms
                    .filter(x => x !== nom).concat(nom2).sort();
                  manifeste = [{ path: IMG_DIR + "/index.json",
                                 content: JSON.stringify(noms, null, 2) + "\n" }];
                } catch (_) { /* manifeste : simple confort */ }
                await MNGitHub.renameFile(de, vers, "Renommage de l'image " + nom, manifeste);
              }
              const n = remplacerChemin(de, vers);
              cacheImages = null;
              if (n) valider();
              fermer();
              U.toast("Renommée" + (n ? " — " + n + " référence(s) mise(s) à jour" : ""), "ok");
              if (onglet === "images") vueImages($("#a-vue"));
            } catch (e) {
              btn.disabled = false;
              btn.innerHTML = U.icone("check") + "<span>Renommer</span>";
              U.toast("Échec : " + e.message, "err");
            }
          } }
      ]
    });
  }

  async function supprimerImage(nom, srv, z) {
    const chemin = srv ? MNStore.IMG_TAG + nom : IMG_DIR + "/" + nom;
    const usages = usagesDe(chemin);

    const ok = await U.confirmer({
      titre: "Supprimer l'image",
      message: usages.length
        ? "« " + nom + " » est utilisée par " + usages.length + " élément" +
          (usages.length > 1 ? "s" : "") + " (" + usages.map(u => u.nom).join(", ") +
          "). Ils repasseront sur une icône par défaut."
        : "« " + nom + " » sera supprimée " + (srv ? "du serveur" : "du dépôt") +
          ". C'est définitif.",
      confirmer: "Supprimer", danger: true
    });
    if (!ok) return;

    try {
      if (srv) {
        await apiImages({ op: "delete", name: nom });
      } else {
        /* Suppression et manifeste dans le même envoi : une seule
           reconstruction du site au lieu de deux. */
        const fichiers = [{ path: chemin, remove: true }];
        try {
          const noms = (await listerImages(true)).noms.filter(x => x !== nom);
          fichiers.push({ path: IMG_DIR + "/index.json",
                          content: JSON.stringify(noms, null, 2) + "\n" });
        } catch (_) { /* manifeste : simple confort */ }
        await MNGitHub.putFiles(fichiers, "Suppression de l'image " + nom);
      }
      const n = remplacerChemin(chemin, "i-box");
      cacheImages = null;
      if (n) valider();
      U.toast("Image supprimée" +
        (n ? " — " + n + " élément(s) remis sur l'icône par défaut" : ""), "ok");
      if (onglet === "images") vueImages($("#a-vue"));
    } catch (e) {
      U.toast("Suppression impossible : " + e.message, "err");
    }
  }

  /* ---- Apparence ------------------------------------------------------------------
     Ce qu'on règle ici est le thème de départ de toute l'équipe. Chacun peut
     ensuite en choisir un autre pour lui depuis la palette de la barre du
     haut — ce choix personnel n'entre pas dans le catalogue. */

  function vueTheme(z) {
    const t = MNTheme.normalize(brouillon.settings.theme);
    const perso = MNTheme.aUnChoixPerso();

    const vignette = x => {
      const p = MNTheme.palette(x);
      return '<button type="button" class="ad-theme' + (x.id === t.id ? " est-choisie" : "") +
        '" data-th="' + U.esc(x.id) + '" title="' + U.esc(x.note || x.nom) + '">' +
        '<span class="ad-theme__vue" style="background:' + U.esc(p["--bg"]) + '">' +
          '<span style="background:linear-gradient(180deg,' + U.esc(p["--surface-2"]) + "," +
            U.esc(p["--surface-lo"]) + ');border:1px solid ' + U.esc(p["--line"]) + '"></span>' +
          '<span style="background:' + U.esc(p["--pink"]) + '"></span>' +
          '<span style="background:' + U.esc(p["--pink-soft"]) + '"></span>' +
        "</span><b>" + U.esc(x.nom) + "</b></button>";
    };

    z.innerHTML =
      outils("Le thème de départ de toute l'équipe", "") +

      (perso
        ? '<div style="margin-bottom:var(--e-4)">' + U.alerte({
            ton: "alerte", titre: "Tu vois ton thème personnel",
            texte: "Tu as choisi une apparence personnelle depuis la palette de la barre du " +
                   "haut : c'est elle que tu vois, pas celle réglée ici. Reprends « le thème " +
                   "de l'atelier » dans cette palette pour juger du rendu réel."
          }) + "</div>"
        : "") +

      U.carte({ titre: "Thèmes",
        corps: '<div class="ad-themes">' + MNTheme.THEMES.map(vignette).join("") + "</div>" }) +

      '<div style="margin-top:var(--e-4)">' + U.carte({
        titre: "Couleurs libres",
        actions: MNTheme.THEMES.some(x => x.id === t.id)
          ? "" : U.etiquette("personnalisé", "action"),
        corps:
          '<div class="cols-3">' +
            U.champ({ id: "t-acc", label: "Accent", type: "color", valeur: t.accent }) +
            U.champ({ id: "t-bg", label: "Fond", type: "color", valeur: t.fond }) +
            U.champ({ id: "t-su", label: "Encadrés", type: "color", valeur: t.surface }) +
          "</div>" +
          '<p class="champ__aide" style="margin-top:var(--e-3)">« Encadrés » donne leur ' +
            "couleur aux cartes, aux rangées et aux panneaux — c'est elle qui fait " +
            "l'essentiel de l'ambiance. Textes, bordures et contrastes en sont déduits. " +
            "Un fond clair fait basculer tout le site en thème clair.</p>" +
          '<div id="t-apercu"></div>'
      }) + "</div>" +

      '<div style="margin-top:var(--e-4)">' + U.carte({
        titre: "Liberté de chacun",
        corps:
          U.champ({ id: "t-libre", type: "bascule",
                    label: "Chacun peut choisir son apparence",
                    valeur: brouillon.settings.themeLibre !== false }) +
          '<p class="champ__aide" style="margin-top:var(--e-3)">La palette de la barre du ' +
            "haut n'apparaît que si c'est coché. Un choix personnel ne change rien pour les " +
            "autres — et ceux qui gèrent l'apparence gardent la main dans tous les cas, sans " +
            "quoi ils ne pourraient plus juger de leurs propres réglages.</p>"
      }) + "</div>" +

      '<div class="rang" style="justify-content:flex-end;margin-top:var(--e-4)">' +
        U.bouton("Essayer", { variante: "fantome", icone: "rafraichir", action: "essai" }) +
        U.bouton("Enregistrer", { variante: "principal", icone: "check", action: "save" }) +
      "</div>";

    const acc = z.querySelector("#t-acc"), bg = z.querySelector("#t-bg"),
          su = z.querySelector("#t-su"), apercu = z.querySelector("#t-apercu");

    /* L'aperçu montre une carte posée sur le fond : c'est le rapport entre
       les deux qui se juge, plus que chaque couleur prise isolément. */
    const peindre = () => {
      const p = MNTheme.palette({ accent: acc.value, fond: bg.value, surface: su.value });
      apercu.innerHTML =
        '<div class="ad-apercu" style="background:' + U.esc(p["--bg"]) +
          ";border-color:" + U.esc(p["--line-2"]) + '">' +
          '<div style="padding:14px;border-radius:12px;border:1px solid ' + U.esc(p["--line"]) +
            ";background:linear-gradient(180deg," + U.esc(p["--surface-2"]) + "," +
            U.esc(p["--surface-lo"]) + ')">' +
            '<div class="rang">' +
              '<span style="padding:9px 16px;border-radius:999px;font-weight:700;background:' +
                U.esc(p["--pink"]) + ";color:" + U.esc(p["--on-accent"]) + '">Bouton</span>' +
              '<span style="padding:5px 12px;border-radius:999px;background:' +
                U.esc(p["--sunk"]) + ";color:" + U.esc(p["--pink-soft"]) + ";border:1px solid " +
                U.esc(p["--line"]) + '">Champ</span>' +
              '<span style="color:' + U.esc(p["--txt"]) + '">Texte principal</span>' +
              '<span style="color:' + U.esc(p["--muted"]) + '">secondaire</span>' +
              '<span style="color:' + U.esc(p["--dim"]) + '">discret</span>' +
            "</div></div></div>" +
        avertir(p);
    };

    /**
     * Les couleurs sont libres, donc on peut en choisir de mauvaises. Plutôt
     * que de les corriger en douce, on dit ce qui cloche : certains fonds —
     * les gris moyens surtout — ne laissent aucune encre bien contraster.
     */
    function avertir(p) {
      const c = (a, b) => MNTheme.contraste(MNTheme.lire(p[a]), MNTheme.lire(p[b]));
      const soucis = [];
      if (c("--bg", "--txt") < 7) {
        soucis.push("le texte sur le fond (" + c("--bg", "--txt").toFixed(1) + ":1)");
      }
      if (c("--surface-2", "--txt") < 7) {
        soucis.push("le texte sur les encadrés (" + c("--surface-2", "--txt").toFixed(1) + ":1)");
      }
      if (c("--pink", "--on-accent") < 4.5) {
        soucis.push("le texte des boutons (" + c("--pink", "--on-accent").toFixed(1) + ":1)");
      }
      if (c("--bg", "--surface-2") < 1.04) soucis.push("les encadrés, indistincts du fond");

      if (!soucis.length) return "";
      return '<div style="margin-top:var(--e-3)">' + U.alerte({
        ton: "alerte",
        texte: "Lisibilité juste sur " + soucis.join(", ") + ". Un fond très clair ou très " +
               "sombre laisse plus de marge qu'un ton moyen."
      }) + "</div>";
    }
    peindre();

    z.querySelectorAll("[data-th]").forEach(b => b.addEventListener("click", () => {
      const x = MNTheme.THEMES.find(y => y.id === b.dataset.th);
      if (!x) return;
      const n = MNTheme.normalize(x);
      acc.value = n.accent; bg.value = n.fond; su.value = n.surface;
      brouillon.settings.theme = n;
      z.querySelectorAll("[data-th]").forEach(y => y.classList.toggle("est-choisie", y === b));
      peindre();
    }));

    [acc, bg, su].forEach(x => x.addEventListener("input", peindre));

    /* Si les trois couleurs retombent exactement sur un thème connu, on garde
       son identité plutôt que d'inventer un « personnalisé » jumeau. */
    const lu = () => {
      const connu = MNTheme.THEMES.find(x => {
        const n = MNTheme.normalize(x);
        return n.accent === acc.value && n.fond === bg.value && n.surface === su.value;
      });
      return MNTheme.normalize(connu || {
        id: "perso", nom: "Personnalisé",
        accent: acc.value, fond: bg.value, surface: su.value
      });
    };

    /* « Essayer » applique sans enregistrer : on voit le vrai site, pas un
       aperçu, et changer d'onglet suffit à revenir en arrière. */
    z.querySelector('[data-a="essai"]').addEventListener("click", () => {
      MNTheme.apply(lu());
      U.toast("Aperçu appliqué — non enregistré", "info");
    });

    z.querySelector('[data-a="save"]').addEventListener("click", () => {
      brouillon.settings.theme = lu();
      brouillon.settings.themeLibre = z.querySelector("#t-libre").checked;
      valider();
      MNTheme.refresh();
      U.toast(MNTheme.aUnChoixPerso()
        ? "Apparence du site enregistrée (ton choix personnel reste actif)"
        : "Apparence du site enregistrée", "ok");
    });
  }

  /* ---- Discord ---------------------------------------------------------------------- */

  function vueDiscord(z) {
    const w = brouillon.settings.webhook;
    const relais = brouillon.settings.relay || "";

    /* Les champs affichent l'adresse en clair ; le brouillage se fait à
       l'enregistrement, sans que personne ait à y penser. */
    const bloc = (cle, titre, desc) => U.carte({
      titre,
      actions: MNWebhook.isValid(w[cle])
        ? U.etiquette("configuré", "succes") : U.etiquette("vide"),
      corps:
        '<p class="champ__aide" style="margin-bottom:var(--e-3)">' + desc + "</p>" +
        '<div class="champ"><label class="champ__label" for="w-' + cle + '">' +
          "Adresse du webhook</label>" +
          '<input class="saisie ad-id" id="w-' + cle + '" value="' +
            U.esc(MNWebhook.unpack(w[cle])) +
            '" placeholder="https://discord.com/api/webhooks/..."></div>' +
        '<div class="rang" style="margin-top:var(--e-3)">' +
          U.bouton("Envoyer un test", { variante: "fantome", taille: "sm", icone: "nuage",
                                        action: "test-" + cle }) +
          U.bouton("Vider", { variante: "fantome", taille: "sm", icone: "croix",
                              action: "vider-" + cle }) +
        "</div>"
    });

    z.innerHTML =
      U.alerte({
        ton: "alerte", titre: "À savoir avant de configurer",
        texte: "L'adresse du webhook est enregistrée dans le fichier de données du site, qui " +
               "est public. Quelqu'un qui sait chercher peut donc écrire dans le salon. Utilise " +
               "un salon dédié, sans enjeu — et si tu vois passer n'importe quoi, régénère le " +
               "webhook depuis Discord."
      }) +

      '<div class="pile" style="margin-top:var(--e-4)">' +
        bloc("bt", "Bons de travail",
          "Chaque bon enregistré est publié dans ce salon : mécano, client, véhicule, " +
          "prestations et ressources.") +
        bloc("duty", "Prises de service",
          "Chaque arrivée et chaque départ de l'atelier y est annoncé, avec la durée du service.") +
        bloc("conges", "Congés",
          "Départs et retours de congés, avec les dates et le motif. <b>Laisse vide</b> pour " +
          "qu'ils arrivent dans le salon des prises de service.") +

        U.carte({ titre: "Apparence du bot", corps:
          '<div class="ad-icochoix">' +
            '<div class="ad-icochoix__vue" id="w-ava-vue">' +
              mnIcon(w.avatar || brouillon.settings.brand.logo || "i-wrench") + "</div>" +
            '<div class="pile pile--sm" style="flex:1;min-width:0">' +
              '<div class="rang">' +
                U.bouton("Choisir un logo", { variante: "fantome", taille: "sm",
                                              action: "ava-pick", type: "button" }) +
                U.bouton("Reprendre le logo du site", { variante: "fantome", taille: "sm",
                                                        icone: "croix", action: "ava-vider",
                                                        type: "button", desactive: !w.avatar }) +
              "</div>" +
              '<p class="champ__aide">Photo de profil du bot sur Discord. Vide = le logo de ' +
                "l'atelier. Discord doit pouvoir la télécharger : elle doit donc être déjà " +
                "<b>publiée en ligne</b>.</p>" +
            "</div></div>" +
          '<div class="cols-2" style="margin-top:var(--e-4)">' +
            U.champ({ id: "w-nom", label: "Nom affiché", valeur: w.name, max: 70,
                      repere: brouillon.settings.brand.name }) +
            U.champ({ id: "w-mention", label: "Mention (facultatif)", valeur: w.mention,
                      max: 80, repere: "<@&123456789012345678>" }) +
          "</div>" +
          '<p class="champ__aide" style="margin-top:var(--e-3)">La mention est ajoutée avant ' +
            "chaque message. Pour un rôle : clic droit sur le rôle dans Discord → Copier " +
            "l'identifiant, puis écris <code>&lt;@&amp;identifiant&gt;</code>.</p>"
        }) +

        U.carte({
          titre: "Confidentialité des adresses",
          actions: relais ? U.etiquette("relais actif", "succes") : "",
          corps: '<p class="champ__aide">' + (relais
            ? "Un relais est configuré : les adresses ci-dessus ne sont plus utilisées, c'est " +
              "lui qui connaît les vraies. Elles ne sont donc plus dans le dépôt."
            : "Sans relais, les adresses restent dans le fichier de données. Elles y sont " +
              "<b>brouillées</b> — on ne les trouve pas en cherchant « discord.com » — mais " +
              "c'est un ralentisseur, pas une protection : le site doit pouvoir les lire, donc " +
              "quelqu'un de motivé le peut aussi. Le relais se règle dans l'onglet " +
              "<b>Publier</b>.") + "</p>"
        }) +

        U.carte({ titre: "Créer un webhook", corps: etapes([
          "Sur Discord, clic droit sur le salon → <b>Modifier le salon</b> → " +
            "<b>Intégrations</b> → <b>Webhooks</b>.",
          "<b>Nouveau webhook</b>, donne-lui un nom, puis <b>Copier l'URL du webhook</b>.",
          "Colle l'adresse ci-dessus, clique sur <b>Envoyer un test</b>, et n'oublie pas de " +
            "<b>publier</b>."
        ]) }) +
      "</div>" +

      '<div class="rang" style="justify-content:flex-end;margin-top:var(--e-4)">' +
        U.bouton("Enregistrer", { variante: "principal", icone: "check", action: "save" }) +
      "</div>";

    let avatar = w.avatar;
    const zAva = z.querySelector("#w-ava-vue");
    const peindreAva = () => {
      zAva.innerHTML = mnIcon(avatar || brouillon.settings.brand.logo || "i-wrench");
      z.querySelector('[data-a="ava-vider"]').disabled = !avatar;
    };
    z.querySelector('[data-a="ava-pick"]').addEventListener("click", () =>
      choisirIcone(avatar || brouillon.settings.brand.logo || "i-wrench",
        v => { avatar = v; peindreAva(); }));
    z.querySelector('[data-a="ava-vider"]').addEventListener("click", () => {
      avatar = ""; peindreAva();
    });

    /* Ce qu'on enregistre : adresses brouillées, le reste tel quel. */
    const lire = () => ({
      bt: MNWebhook.pack(z.querySelector("#w-bt").value.trim()),
      duty: MNWebhook.pack(z.querySelector("#w-duty").value.trim()),
      conges: MNWebhook.pack(z.querySelector("#w-conges").value.trim()),
      mention: z.querySelector("#w-mention").value.trim(),
      name: z.querySelector("#w-nom").value.trim(),
      avatar,
      proxy: ""
    });

    z.querySelector('[data-a="save"]').addEventListener("click", () => {
      const v = lire();
      const noms = { bt: "bons de travail", duty: "services", conges: "congés" };
      for (const k of ["bt", "duty", "conges"]) {
        if (v[k] && !MNWebhook.isValid(v[k])) {
          return U.toast("Adresse de webhook invalide (" + noms[k] + ")", "err");
        }
      }
      brouillon.settings.webhook = v;
      valider();
      U.toast("Réglages Discord enregistrés dans le brouillon", "ok");
    });

    ["bt", "duty", "conges"].forEach(k => {
      z.querySelector('[data-a="vider-' + k + '"]').addEventListener("click", () => {
        z.querySelector("#w-" + k).value = "";
        U.toast("Champ vidé — pense à enregistrer", "info");
      });

      const t = z.querySelector('[data-a="test-' + k + '"]');
      t.addEventListener("click", async () => {
        const url = z.querySelector("#w-" + k).value.trim();
        if (!MNWebhook.isValid(url)) {
          return U.toast("Colle d'abord une adresse de webhook valide", "err");
        }
        /* Le test lit les réglages depuis le brouillon : on l'y met d'abord. */
        brouillon.settings.webhook = lire();
        MNStore.saveDraft(brouillon);

        t.disabled = true;
        const avant = t.innerHTML;
        t.innerHTML = U.icone("rafraichir") + "<span>Envoi…</span>";
        const r = await MNWebhook.sendTest(k, moi.pseudo);
        t.disabled = false;
        t.innerHTML = avant;
        U.toast(r.ok ? "Message envoyé, regarde ton salon Discord" : "Échec : " + r.error,
          r.ok ? "ok" : "err");
      });
    });
  }

  /* ---- Le site ------------------------------------------------------------------- */

  function vueSite(z) {
    const s = brouillon.settings;

    z.innerHTML =
      '<div class="pile">' +
        U.carte({ titre: "Identité de l'entreprise", corps:
          '<div class="cols-2">' +
            U.champ({ id: "s-nom", label: "Nom", valeur: s.brand.name, max: 34 }) +
            U.champ({ id: "s-slogan", label: "Slogan", valeur: s.brand.tagline, max: 34 }) +
          "</div>" +
          '<div class="champ" style="margin-top:var(--e-4)"><span class="champ__label">Logo</span>' +
            '<div class="ad-icochoix">' +
              '<div class="ad-icochoix__vue" id="s-logo-vue">' +
                (s.brand.logo ? mnIcon(s.brand.logo) : U.esc(U.initiales(s.brand.name))) + "</div>" +
              '<div class="pile pile--sm" style="flex:1;min-width:0">' +
                '<div class="rang">' +
                  U.bouton("Choisir un logo", { variante: "fantome", taille: "sm",
                                                action: "logo-pick", type: "button" }) +
                  U.bouton("Retirer", { variante: "fantome", taille: "sm", icone: "croix",
                                        action: "logo-vider", type: "button",
                                        desactive: !s.brand.logo }) +
                "</div>" +
                '<p class="champ__aide">Image, emoji ou icône. Sans logo, ce sont les initiales ' +
                  "du nom qui s'affichent. Le logo apparaît dans la barre latérale et sur " +
                  "l'écran de connexion.</p>" +
              "</div></div></div>"
        }) +

        U.carte({ titre: "Connexion", corps:
          U.champ({ id: "s-invites", type: "bascule",
                    label: "Autoriser n'importe quel pseudo à entrer",
                    valeur: s.auth.allowGuests }) +
          '<p class="champ__aide" style="margin:var(--e-3) 0">Désactivé, seuls les pseudos de ' +
            "l'onglet « Employés » peuvent se connecter. Activé, un inconnu entre avec le seul " +
            "droit de faire des bons de travail.</p>" +
          '<div style="max-width:220px">' +
            U.champ({ id: "s-jours", label: "Durée de session (jours)", type: "number",
                      min: 1, plafond: 365, valeur: Number(s.auth.sessionDays) }) +
          "</div>"
        }) +

        U.carte({ titre: "Zone sensible", corps:
          '<p class="champ__aide" style="margin-bottom:var(--e-3)">Efface le brouillon local ' +
            "et recharge la version actuellement en ligne. Tes modifications non publiées " +
            "seront perdues.</p>" +
          U.bouton("Repartir de la version en ligne",
            { variante: "danger", icone: "rafraichir", action: "reset" })
        }) +
      "</div>" +

      '<div class="rang" style="justify-content:flex-end;margin-top:var(--e-4)">' +
        U.bouton("Enregistrer les réglages", { variante: "principal", icone: "check",
                                               action: "save" }) +
      "</div>";

    /* Le logo choisi n'entre dans le brouillon qu'à l'enregistrement. */
    let logo = s.brand.logo;
    const zLogo = z.querySelector("#s-logo-vue");
    const peindreLogo = () => {
      zLogo.innerHTML = logo
        ? mnIcon(logo)
        : U.esc(U.initiales(z.querySelector("#s-nom").value || "Atelier"));
      z.querySelector('[data-a="logo-vider"]').disabled = !logo;
    };
    z.querySelector('[data-a="logo-pick"]').addEventListener("click", () =>
      choisirIcone(logo || "i-wrench", v => { logo = v; peindreLogo(); }));
    z.querySelector('[data-a="logo-vider"]').addEventListener("click", () => {
      logo = ""; peindreLogo();
    });
    z.querySelector("#s-nom").addEventListener("input", () => { if (!logo) peindreLogo(); });

    z.querySelector('[data-a="save"]').addEventListener("click", () => {
      brouillon.settings.brand.name = z.querySelector("#s-nom").value.trim() || "Atelier";
      brouillon.settings.brand.tagline = z.querySelector("#s-slogan").value.trim();
      brouillon.settings.brand.logo = logo;
      brouillon.settings.auth.allowGuests = z.querySelector("#s-invites").checked;
      brouillon.settings.auth.sessionDays =
        Math.max(1, Math.min(365, Number(z.querySelector("#s-jours").value) || 30));
      valider();
      V2Shell.rafraichirMarque();
      U.toast("Réglages enregistrés dans le brouillon", "ok");
    });

    z.querySelector('[data-a="reset"]').addEventListener("click", async () => {
      const ok = await U.confirmer({
        titre: "Repartir de la version en ligne",
        message: "Le brouillon local sera effacé et remplacé par ce qui est publié actuellement.",
        confirmer: "Effacer le brouillon", danger: true
      });
      if (!ok) return;
      MNStore.discardDraft();
      localStorage.removeItem("mn.gh.stamp");
      location.reload();
    });
  }

  /* ---- Publier ---------------------------------------------------------------------- */

  function vuePublier(z) {
    const gh = brouillon.settings.github;
    const devine = MNGitHub.detect();
    const dernier = MNGitHub.lastPublish();
    const sale = MNStore.hasDraft();
    const parti = sale && localStorage.getItem("mn.gh.stamp") === brouillon.updatedAt;
    const pret = MNGitHub.hasToken() && MNGitHub.isConfigured();

    const etat = !MNGitHub.canPublish()
      ? { ton: "attente", ico: "alerte", t: "Publication non configurée",
          s: "Renseigne l'adresse de ton serveur, ou suis les quatre étapes ci-dessous " +
             "une seule fois." }
      : parti
        ? { ton: "ok", ico: "nuage", t: "Publié — déploiement en cours",
            s: "Le site se reconstruit. Compte environ une minute." +
               (dernier ? " Dernier envoi " + U.ilYA(dernier.at) + "." : "") }
        : sale
          ? { ton: "attente", ico: "alerte", t: "Modifications non publiées",
              s: "Ce que tu as changé n'est visible que dans ton navigateur." }
          : { ton: "ok", ico: "check", t: "Tout est en ligne",
              s: dernier ? "Dernière publication " + U.ilYA(dernier.at) + "."
                         : "Aucune modification en attente." };

    z.innerHTML =
      '<div class="ad-etatpub ad-etatpub--' + etat.ton + '">' +
        '<div class="ad-etatpub__ico">' + U.icone(etat.ico) + "</div>" +
        '<div class="ad-etatpub__txt"><b>' + U.esc(etat.t) + "</b>" +
          "<span>" + U.esc(etat.s) + "</span></div>" +
        U.bouton("Publier maintenant", { variante: "principal", icone: "nuage",
                                         action: "go", desactive: !(sale && !parti) }) +
      "</div>" +

      '<div class="pile" style="margin-top:var(--e-4)">' +
        U.carte({ titre: "Publication automatique", corps:
          U.champ({ id: "p-auto", type: "bascule",
                    label: "Envoyer à chaque modification",
                    valeur: localStorage.getItem(K_AUTO) === "1" }) +
          '<p class="champ__aide" style="margin-top:var(--e-3)">Activé, tu n\'as plus rien à ' +
            "cliquer : quelques secondes après ta dernière modification, le catalogue part " +
            "tout seul. Les changements rapprochés sont regroupés en un seul envoi." +
            (MNGitHub.canPublish() ? "" :
              " <b>À configurer d'abord ci-dessous.</b>") + "</p>" +
          '<p class="champ__aide" style="margin-top:var(--e-2)">Le réglage est propre à ce ' +
            "navigateur : chacun décide pour lui. Tu peux toujours forcer un envoi avec " +
            "« Publier maintenant ».</p>"
        }) +

        blocServeur() +

        U.carte({ titre: "Dépôt GitHub", corps:
          '<div class="cols-2">' +
            U.champ({ id: "p-owner", label: "Propriétaire (ton pseudo GitHub)",
                      valeur: gh.owner || devine.owner, repere: "moncompte" }) +
            U.champ({ id: "p-repo", label: "Nom du dépôt", valeur: gh.repo || devine.repo,
                      repere: "mecano-nord" }) +
            U.champ({ id: "p-branche", label: "Branche", valeur: gh.branch, repere: "main" }) +
            U.champ({ id: "p-chemin", label: "Fichier de données", valeur: gh.path }) +
          "</div>" +
          '<div class="champ" style="margin-top:var(--e-4)">' +
            '<label class="champ__label" for="p-jeton">Jeton d\'accès GitHub</label>' +
            '<div class="ad-copie">' +
              '<input class="saisie" id="p-jeton" type="password" placeholder="' +
                (MNGitHub.hasToken() ? "•••••••••• (enregistré sur cet appareil)"
                                     : "github_pat_…") + '">' +
              U.bouton("Vérifier", { variante: "fantome", icone: "check", action: "check" }) +
            "</div>" +
            '<p class="champ__aide">Le jeton reste dans <b>ton</b> navigateur, il n\'est jamais ' +
              "écrit dans le dépôt. Chaque personne qui publie met le sien." + "</p>" +
            (MNGitHub.hasToken()
              ? '<div>' + U.bouton("Oublier le jeton de cet appareil",
                  { variante: "fantome", taille: "sm", icone: "croix", action: "oublier" }) +
                "</div>"
              : "") +
          "</div>" +
          '<div id="p-resultat" style="margin-top:var(--e-3)"></div>' +
          '<div style="margin-top:var(--e-3)">' +
            U.bouton("Enregistrer les infos du dépôt", { variante: "fantome", taille: "sm",
                                                         icone: "check", action: "save-depot" }) +
          "</div>"
        }) +

        U.carte({ titre: "Mise en route (une seule fois)", corps: etapes([
          "Va sur <b>github.com</b> → ton avatar → <b>Settings</b> → tout en bas " +
            "<b>Developer settings</b> → <b>Personal access tokens</b> → " +
            "<b>Fine-grained tokens</b> → <b>Generate new token</b>.",
          "Dans <b>Repository access</b>, choisis <b>Only select repositories</b> et " +
            "sélectionne le dépôt de ce site.",
          "Dans <b>Permissions → Repository permissions</b>, mets <code>Contents</code> sur " +
            "<b>Read and write</b>. Rien d'autre n'est nécessaire.",
          "Copie le jeton généré, colle-le dans le champ ci-dessus, clique sur " +
            "<b>Vérifier</b> puis sur <b>Publier maintenant</b>."
        ]) }) +

        U.carte({ titre: "Méthode manuelle (sans jeton)", corps:
          '<p class="champ__aide" style="margin-bottom:var(--e-3)">Si tu préfères ne pas ' +
            "utiliser de jeton : télécharge le fichier et remplace <code>" + U.esc(gh.path) +
            "</code> dans ton dépôt GitHub.</p>" +
          '<div class="rang">' +
            U.bouton("Télécharger le fichier", { variante: "fantome", action: "dl" }) +
            U.bouton("Copier le contenu", { variante: "fantome", action: "copier" }) +
            U.bouton("Importer un fichier", { variante: "fantome", action: "import" }) +
            '<input type="file" id="p-fichier" accept=".json,application/json" hidden>' +
          "</div>" +
          "<details style=\"margin-top:var(--e-3)\"><summary class=\"champ__aide\" " +
            'style="cursor:pointer">Voir le contenu du fichier</summary>' +
            '<pre class="ad-json">' + U.esc(MNStore.toJSON(brouillon)) + "</pre></details>"
        }) +
      "</div>";

    brancherServeur(z);

    z.querySelector('[data-a="go"]').addEventListener("click", () => publier(false));

    z.querySelector("#p-auto").addEventListener("change", e => {
      localStorage.setItem(K_AUTO, e.target.checked ? "1" : "0");
      if (e.target.checked) {
        U.toast("Publication automatique activée", "ok");
        if (MNStore.hasDraft()) programmerEnvoi();
      } else {
        clearTimeout(minuterie);
        U.toast("Publication automatique désactivée", "info");
      }
    });

    const lireDepot = () => ({
      owner: z.querySelector("#p-owner").value.trim(),
      repo: z.querySelector("#p-repo").value.trim(),
      branch: z.querySelector("#p-branche").value.trim() || "main",
      path: z.querySelector("#p-chemin").value.trim() || "data/catalog.json"
    });

    z.querySelector('[data-a="save-depot"]').addEventListener("click", () => {
      brouillon.settings.github = lireDepot();
      valider();
      U.toast("Infos du dépôt enregistrées", "ok");
    });

    z.querySelector('[data-a="check"]').addEventListener("click", async () => {
      const boite = z.querySelector("#p-resultat");
      const jeton = z.querySelector("#p-jeton").value.trim();
      if (jeton) MNGitHub.setToken(jeton);
      if (!MNGitHub.hasToken()) {
        boite.innerHTML = U.alerte({ ton: "erreur", texte: "Colle d'abord un jeton." });
        return;
      }
      brouillon.settings.github = lireDepot();
      MNStore.saveDraft(brouillon);

      boite.innerHTML = U.alerte({ ton: "info", texte: "Vérification…" });
      try {
        const r = await MNGitHub.check();
        boite.innerHTML = U.alerte({
          ton: r.canWrite ? "succes" : "alerte",
          titre: "Connecté à " + r.repo + (r.login ? " en tant que " + r.login : ""),
          texte: (r.canWrite
            ? "Écriture autorisée — tu peux publier."
            : "Mais le jeton n'a pas le droit d'écrire. Repasse par l'étape 3.") +
            (r.fileExists ? ""
              : " Le fichier n'existe pas encore, il sera créé à la première publication.")
        });
        z.querySelector("#p-jeton").value = "";
      } catch (e) {
        boite.innerHTML = U.alerte({ ton: "erreur", texte: e.message });
      }
    });

    const oub = z.querySelector('[data-a="oublier"]');
    if (oub) oub.addEventListener("click", () => {
      MNGitHub.forgetToken();
      U.toast("Jeton oublié sur cet appareil", "ok");
      dessiner();
    });

    z.querySelector('[data-a="dl"]').addEventListener("click", () => {
      MNStore.download(brouillon, "catalog.json");
      U.toast("Fichier téléchargé", "ok");
    });
    z.querySelector('[data-a="copier"]').addEventListener("click", () =>
      copier(MNStore.toJSON(brouillon), "Contenu copié"));
    z.querySelector('[data-a="import"]').addEventListener("click", () =>
      z.querySelector("#p-fichier").click());

    z.querySelector("#p-fichier").addEventListener("change", e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => {
        let data;
        try { data = JSON.parse(rd.result); }
        catch (_) { return U.toast("Fichier illisible — ce n'est pas un JSON valide", "err"); }
        const ok = await U.confirmer({
          titre: "Importer ce fichier",
          message: "Le brouillon actuel sera entièrement remplacé par le contenu du fichier.",
          confirmer: "Importer", danger: true
        });
        if (!ok) return;
        brouillon = MNStore.saveDraft(data);
        MNAuth.refresh();
        dessiner();
        U.toast("Fichier importé", "ok");
      };
      rd.readAsText(f);
    });
  }

  /* ---- Serveur de l'atelier ------------------------------------------------------
     Trois façons de rendre le pointage automatique pour toute l'équipe. Le
     serveur les remplace toutes ; les deux autres restent pour qui n'en a
     pas. */

  function blocServeur() {
    const serveur = brouillon.settings.serveur || "";
    const base = brouillon.settings.dutyUrl || "";
    const relais = brouillon.settings.relay || "";
    const auto = !!(serveur || base || relais);

    return U.carte({
      titre: "Serveur de l'atelier",
      actions: auto ? U.etiquette("actif", "succes") : U.etiquette("à configurer", "alerte"),
      corps:
        (serveur
          ? U.alerte({ ton: "succes", titre: "Tout passe par ton serveur",
              texte: "L'équipe pointe son service et les responsables publient depuis le " +
                     "site, sans que personne n'ait de jeton. Les adresses Discord restent " +
                     "chez toi." })
          : auto
            ? U.alerte({ ton: "succes",
                texte: "Le pointage est partagé. Renseigne l'adresse du serveur ci-dessous " +
                       "pour que la publication se passe aussi de jeton." })
            : U.alerte({ ton: "alerte", titre: "Sans serveur, il faut un jeton par personne",
                texte: "Pour publier comme pour apparaître dans le tableau de service. " +
                       "Renseigne ton serveur ci-dessous et tout devient automatique." })) +

        '<div class="champ" style="margin-top:var(--e-4)">' +
          '<label class="champ__label" for="v-serveur">Adresse de ton serveur</label>' +
          '<div class="ad-copie">' +
            '<input class="saisie ad-id" id="v-serveur" value="' + U.esc(serveur) +
              '" placeholder="https://mecano-nord.duckdns.org">' +
            U.bouton("Tester", { variante: "fantome", icone: "nuage", action: "test-srv" }) +
          "</div>" +
          '<p class="champ__aide">Une seule adresse suffit : le site en déduit tout le reste ' +
            "(pointage, relais Discord, publication, images). Guide d'installation dans " +
            "<code>serveur/README.md</code>.</p></div>" +
        '<div id="v-srv-msg" style="margin-top:var(--e-2)"></div>' +

        '<details style="margin-top:var(--e-3)"><summary class="champ__aide" ' +
          'style="cursor:pointer">Sans serveur : une base Firebase pour le seul pointage, ' +
          "ou un relais Cloudflare</summary>" +
          '<div class="champ" style="margin-top:var(--e-3)">' +
            '<label class="champ__label" for="v-duty">Base partagée</label>' +
            '<div class="ad-copie">' +
              '<input class="saisie ad-id" id="v-duty" value="' + U.esc(base) +
                '" placeholder="https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app/duty">' +
              U.bouton("Tester", { variante: "fantome", icone: "nuage", action: "test-duty" }) +
            "</div></div>" +
          '<div id="v-duty-msg" style="margin-top:var(--e-2)"></div>' +

          '<div class="champ" style="margin-top:var(--e-3)">' +
            '<label class="champ__label" for="v-relais">Relais Cloudflare</label>' +
            '<div class="ad-copie">' +
              '<input class="saisie ad-id" id="v-relais" value="' + U.esc(relais) +
                '" placeholder="https://mon-relais.workers.dev">' +
              U.bouton("Tester", { variante: "fantome", icone: "nuage", action: "test-relais" }) +
            "</div></div>" +
          '<div id="v-relais-msg" style="margin-top:var(--e-2)"></div>' +
          '<p class="champ__aide" style="margin-top:var(--e-2)">Code prêt dans ' +
            "<code>relais.js</code>. Ces deux champs ne servent que si tu n'as pas de " +
            "serveur : l'adresse ci-dessus les remplace tous les deux.</p>" +
        "</details>" +

        '<div class="rang" style="justify-content:flex-end;margin-top:var(--e-4)">' +
          U.bouton("Enregistrer", { variante: "principal", icone: "check",
                                    action: "save-srv" }) +
        "</div>"
    });
  }

  function brancherServeur(z) {
    const lire = () => ({
      serveur: z.querySelector("#v-serveur").value.trim().replace(/\/+$/, ""),
      duty: z.querySelector("#v-duty").value.trim(),
      relais: z.querySelector("#v-relais").value.trim()
    });

    z.querySelector('[data-a="save-srv"]').addEventListener("click", () => {
      const v = lire();
      for (const [champ, nom] of [[v.serveur, "le serveur"], [v.duty, "la base partagée"],
                                  [v.relais, "le relais"]]) {
        if (champ && !/^https?:\/\/.+/i.test(champ)) {
          return U.toast("L'adresse de " + nom + " doit commencer par http:// ou https://", "err");
        }
      }
      brouillon.settings.serveur = v.serveur;
      brouillon.settings.dutyUrl = v.duty;
      brouillon.settings.relay = v.relais;
      valider();

      /* Une page en HTTPS ne peut pas appeler une adresse en HTTP : le
         navigateur bloque, sans rien afficher. Mieux vaut le dire ici. */
      const mixte = location.protocol === "https:" &&
        [v.serveur, v.duty, v.relais].some(u => /^http:\/\//i.test(u));
      if (!mixte) return U.toast("Réglages du serveur enregistrés dans le brouillon", "ok");

      U.modale({
        titre: "Cette adresse ne fonctionnera pas ici",
        corps: U.alerte({ ton: "erreur",
            texte: "Tu es sur une page https:// et l'adresse saisie est en http://. Le " +
                   "navigateur bloquera l'appel sans message." }) +
          '<p class="champ__aide" style="margin-top:var(--e-3)">Deux solutions : ouvrir le ' +
            "site depuis ton serveur en <code>http://</code> lui aussi, ou mettre un " +
            "sous-domaine gratuit avec HTTPS devant ton IP. Les deux chemins sont détaillés " +
            "dans <code>serveur/README.md</code>.</p>",
        actions: [{ label: "Compris", variante: "principal", onClick: f => f() }]
      });
    });

    /* Test du serveur : /sante doit répondre, et on regarde ce qu'il sait faire. */
    z.querySelector('[data-a="test-srv"]').addEventListener("click", async () => {
      const boite = z.querySelector("#v-srv-msg");
      const url = z.querySelector("#v-serveur").value.trim().replace(/\/+$/, "");
      if (!/^https?:\/\/.+/i.test(url)) {
        boite.innerHTML = U.alerte({ ton: "erreur",
          texte: "Colle l'adresse de ton serveur (http:// ou https://)." });
        return;
      }
      boite.innerHTML = U.alerte({ ton: "info", texte: "Test en cours…" });
      try {
        const r = await fetch(url + "/sante", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error("réponse " + r.status);

        /* On regarde si la publication est configurée côté serveur, en lui
           demandant d'écrire un chemin qu'il doit refuser. */
        let pub = "";
        try {
          const t = await fetch(url + "/publier", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "interdit.txt", content: "x" })
          });
          /* 403 = la route existe et refuse ce chemin : tout va bien.
             404 = le serveur tourne, mais dans une version antérieure. */
          pub = t.status === 403 ? "ok"
            : t.status === 501 ? "absent"
            : t.status === 404 ? "vieux"
            : "inconnu:" + t.status;
        } catch (_) { pub = "inconnu"; }

        const pistes = {
          ok: "La publication passera par lui — plus besoin de jeton.",
          absent: "La publication n'est pas configurée : ajoute GH_TOKEN, GH_OWNER et " +
                  "GH_REPO dans le service, puis redémarre-le.",
          vieux: "Version trop ancienne : ce serveur ne connaît pas encore la publication. " +
                 "Recopie serveur/serveur.js sur le VPS, puis redémarre le service."
        };

        /* `images` n'apparaît que sur les versions récentes : son absence dit
           que le fichier du VPS n'a pas été recopié. */
        const grave = pub !== "ok" || !j.images || !j.catalogue;
        boite.innerHTML = U.alerte({
          ton: grave ? "alerte" : "succes",
          titre: "Serveur joignable" + (j.ops ? ", pointage sans conflit géré" : ""),
          texte: (pistes[pub] || "Publication : état indéterminé (" + pub + ").") +
            (j.images
              ? " Il héberge aussi les images — elles ne passent plus par GitHub."
              : " Il n'héberge pas encore les images : recopie serveur.js sur le VPS, " +
                "puis redémarre le service.") +
            (j.catalogue
              ? " Et le catalogue lui-même : publier devient immédiat, sans " +
                "reconstruction du site."
              : " Le catalogue reste dans le dépôt : chaque publication coûtera " +
                "encore une minute de reconstruction.")
        });
      } catch (e) {
        boite.innerHTML = U.alerte({ ton: "erreur", titre: "Serveur injoignable",
          texte: "Vérifie l'adresse, que le service tourne, et que ORIGINE autorise ce site." });
      }
    });

    /* Test de la base : on lit la clé, ce qui valide l'adresse ET les règles. */
    z.querySelector('[data-a="test-duty"]').addEventListener("click", async () => {
      const boite = z.querySelector("#v-duty-msg");
      let url = z.querySelector("#v-duty").value.trim().replace(/\/+$/, "");
      if (!/^https?:\/\/.+/i.test(url)) {
        boite.innerHTML = U.alerte({ ton: "erreur",
          texte: "Colle d'abord l'adresse de ta base (http:// ou https://)." });
        return;
      }
      if (!/\.json$/i.test(url)) url += ".json";
      boite.innerHTML = U.alerte({ ton: "info", texte: "Test en cours…" });

      try {
        const lu = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
        if (!lu.ok) {
          boite.innerHTML = U.alerte({ ton: "erreur",
            texte: "Lecture refusée (" + lu.status + "). Vérifie les règles : la clé duty " +
                   "doit avoir .read: true." });
          return;
        }
        /* Écriture d'une valeur témoin : on réécrit ce qu'il y avait déjà. */
        const avant = await lu.json();
        const ecrit = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(avant === null
            ? { updatedAt: new Date(0).toISOString(), onDuty: [], log: [] } : avant)
        });
        boite.innerHTML = ecrit.ok
          ? U.alerte({ ton: "succes", texte: "Lecture et écriture confirmées. Enregistre, " +
              "publie, et toute l'équipe pourra pointer sans rien installer." })
          : U.alerte({ ton: "erreur", texte: "Écriture refusée (" + ecrit.status +
              "). Vérifie .write: true sur la clé duty." });
      } catch (_) {
        boite.innerHTML = U.alerte({ ton: "erreur",
          texte: "Base injoignable. Vérifie l'adresse copiée depuis Firebase." });
      }
    });

    z.querySelector('[data-a="test-relais"]').addEventListener("click", async () => {
      const boite = z.querySelector("#v-relais-msg");
      const url = z.querySelector("#v-relais").value.trim();
      if (!/^https?:\/\/.+/i.test(url)) {
        boite.innerHTML = U.alerte({ ton: "erreur",
          texte: "Colle d'abord l'adresse de ton relais (http:// ou https://)." });
        return;
      }
      boite.innerHTML = U.alerte({ ton: "info", texte: "Test en cours…" });
      try {
        /* Type inconnu : le relais doit refuser proprement, sans rien écrire. */
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ping" })
        });
        const j = await r.json().catch(() => ({}));
        const vivant = r.status === 400 && /Type inconnu/i.test(j.error || "");
        boite.innerHTML = U.alerte({
          ton: vivant ? "succes" : "alerte",
          texte: vivant
            ? "Le relais répond correctement."
            : "Réponse inattendue (" + r.status + ") — vérifie que tu as bien collé le code " +
              "de relais.js et déployé le worker."
        });
      } catch (_) {
        boite.innerHTML = U.alerte({ ton: "erreur",
          texte: "Relais injoignable. Vérifie l'adresse, et que ORIGINE vaut bien " +
                 "l'adresse de ton site." });
      }
    });
  }

  /* ---- Envoi ------------------------------------------------------------------------ */

  let envoiEnCours = false;

  /**
   * @param {boolean} auto true = déclenché par la publication automatique,
   *                       donc sans fenêtre d'erreur bloquante.
   */
  async function publier(auto) {
    if (envoiEnCours) return;
    clearTimeout(minuterie);

    if (!MNAuth.can("publish")) return U.toast("Tu n'as pas la permission de publier", "err");

    if (!MNGitHub.canPublish()) {
      if (auto) return;                  // rien à signaler : l'auto est simplement inactif
      onglet = "publier"; dessiner();
      return U.toast(MNGitHub.hasToken()
        ? "Renseigne le propriétaire et le nom du dépôt"
        : "Renseigne l'adresse de ton serveur, ou un jeton GitHub", "err");
    }

    const repere = brouillon.updatedAt;
    envoiEnCours = true;

    try {
      const info = await MNGitHub.publish(MNStore.toJSON(brouillon),
        "Catalogue mis à jour par " + moi.pseudo + (auto ? " (publication automatique)" : ""));
      localStorage.setItem("mn.gh.stamp", repere);
      /* Par le serveur c'est immédiat ; par GitHub il faut attendre la
         reconstruction. Autant dire lequel des deux vient de se passer. */
      U.toast((auto ? "Envoyé automatiquement" : "Publié !") +
        (info && info.serveur
          ? " En ligne tout de suite."
          : " Le site sera à jour dans une minute environ" +
            (info && info.commit ? " (" + info.commit + ")" : "")), "ok");
    } catch (e) {
      const m = String(e && e.message || e);
      if (auto) {
        U.toast("Envoi automatique impossible : " + m, "err");
      } else {
        /* Le conseil dépend de ce qui a échoué : inutile d'envoyer quelqu'un
           vérifier son jeton quand c'est le serveur qui est en cause. */
        let piste;
        if (/Chemin inconnu/i.test(m)) {
          piste = "Ton serveur tourne avec une <b>version trop ancienne</b> : il ne connaît " +
            "pas encore la publication. Recopie <code>serveur/serveur.js</code> sur le VPS, " +
            "puis redémarre le service.";
        } else if (/non configurée|GH_TOKEN/i.test(m)) {
          piste = "Ton serveur n'a pas les accès GitHub. Ajoute <code>GH_TOKEN</code>, " +
            "<code>GH_OWNER</code> et <code>GH_REPO</code> dans son service, puis " +
            "redémarre-le.";
        } else if (/injoignable|ne répond pas/i.test(m)) {
          piste = "Ton serveur ne répond pas. Vérifie son adresse et qu'il tourne.";
        } else if (/Chemin non autorisé/i.test(m)) {
          piste = "Le serveur refuse d'écrire ce fichier. C'est volontaire : il n'autorise " +
            "que le catalogue et les images.";
        } else {
          piste = "Vérifie le jeton et les infos du dépôt ci-dessous, puis réessaie.";
        }

        U.modale({
          titre: "La publication a échoué",
          corps: U.alerte({ ton: "erreur", texte: m }) +
            '<p class="champ__aide" style="margin-top:var(--e-3)">' + piste + "</p>" +
            '<p class="champ__aide" style="margin-top:var(--e-2)">Rien n\'est perdu : tes ' +
              "modifications sont toujours dans le brouillon.</p>",
          actions: [{ label: "Compris", variante: "principal", onClick: f => f() }]
        });
      }
    } finally {
      envoiEnCours = false;
      /* Le brouillon a encore bougé pendant l'envoi ? On repart pour un tour. */
      if (brouillon.updatedAt !== localStorage.getItem("mn.gh.stamp")) programmerEnvoi();
      if (onglet === "publier") dessiner(); else V2Shell.brouillon(dessiner);
    }
  }

  /** Marche à suivre numérotée. */
  const etapes = l => '<ol class="ad-etapes">' +
    l.map(x => "<li>" + x + "</li>").join("") + "</ol>";

  /** Copie dans le presse-papier, avec repli sur les vieux navigateurs. */
  function copier(texte, message) {
    const dire = ok => U.toast(ok ? (message || "Copié") : "Copie impossible", ok ? "ok" : "err");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texte).then(() => dire(true), () => dire(false));
    }
    const n = document.createElement("textarea");
    n.value = texte;
    n.style.position = "fixed";
    n.style.opacity = "0";
    document.body.appendChild(n);
    n.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    n.remove();
    dire(ok);
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
