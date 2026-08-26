/* ==========================================================================
   Équipe — le personnel à gauche, la fiche à droite.

   Reprise fidèle de la V1 : ancienneté au jour près, carrière, formations,
   historique de service replié par semaine, montées de grade, recrutement,
   masquage, réorganisation de la liste.

   Ce qui change : la fiche se lit en trois blocs plutôt qu'en un long
   déroulé, et l'historique de service se replie tout seul sauf la semaine
   en cours — c'est la seule qu'on regarde vraiment.
   ========================================================================== */

(function () {
  "use strict";

  const U = V2UI;
  const $ = s => document.querySelector(s);

  let hote = null, moi = null;
  let brouillon = null;          // copie de travail du catalogue
  let sel = null;
  let filtre = "";
  let peutEditer = false, voitNotes = false, peutAvertir = false;
  let voirMasques = false, ranger = false;
  let vueArchives = false;      /* la liste montre-t-elle les partis ? */
  let tranche = null;           /* tranche du répertoire, en archives */
  let battement = null;

  V2Shell.demarrer({
    page: "equipe",
    titre: "Équipe",
    pret: async function (session, h) {
      hote = h; moi = session;

      /* La page est ouverte à tous : chacun consulte les fiches. Seuls les
         responsables modifient. */
      peutEditer = V2Shell.peut("promote", "users", "admin");
      voitNotes = V2Shell.peut("staff", "promote", "users", "admin");
      peutAvertir = V2Shell.peut("warn", "admin");

      brouillon = MNStore.clone(MNStore.catalog());
      const premier = visibles()[0];
      sel = premier ? premier.id : null;

      await MNDuty.load(false).catch(() => {});
      dessiner();

      /* Les compteurs de la personne en service avancent à la seconde. */
      clearInterval(battement);
      battement = setInterval(battre, 1000);
      relire();
    }
  });

  /* Les heures affichées viennent du tableau partagé : on le relit, mais
     jamais pendant une réorganisation ou une saisie — on écraserait un
     travail en cours. Le jour compte autant que le tableau : un congé qui
     commence demain ne fait bouger aucune donnée, seulement la date. */
  function relire() {
    setInterval(async () => {
      if (ranger || document.querySelector(".modale-fond")) return;
      const avant = MNDuty.board().updatedAt + "|" + MNDuty.jourLocal();
      await MNDuty.load(true).catch(() => {});
      if (MNDuty.board().updatedAt + "|" + MNDuty.jourLocal() !== avant) dessiner();
    }, document.hidden ? 120000 : 45000);
  }

  function battre() {
    const u = employe(sel);
    if (!u || !MNDuty.isOn(u.id)) return;
    const sem = document.querySelector('[data-vif="semaine"]');
    const tot = document.querySelector('[data-vif="total"]');
    if (sem) sem.textContent = MNDuty.dur(MNDuty.secondsFor(u.id, MNDuty.weekStart()));
    if (tot) tot.textContent = MNDuty.dur(MNDuty.secondsFor(u.id));
    const d = document.querySelector("[data-depuis]");
    if (d) d.textContent = MNDuty.sinceDur(d.dataset.depuis);
  }

  /* ---- Données ------------------------------------------------------------------- */

  const employe = id => brouillon.users.find(u => u.id === id) || null;
  const grade = u => brouillon.roles.find(r => r.id === u.roleId) ||
    { id: "", name: "Sans grade", color: "#6a6280", perms: [], icon: "" };

  /* ---- Équipe d'aujourd'hui / archives ----------------------------------------
     Deux populations qui ne se mélangent pas : ceux qui travaillent ici, et
     ceux qui sont passés. La bascule est en tête de liste, pas un filtre
     perdu au milieu — on ne consulte pas les archives par accident. */

  const actifs = () => brouillon.users.filter(u => !MNStore.estArchive(u));
  const archives = () => brouillon.users.filter(MNStore.estArchive);

  const visibles = () => (vueArchives
    ? archives().slice().sort((a, b) =>
        a.pseudo.localeCompare(b.pseudo, "fr", { sensitivity: "base" }))
    : actifs().filter(u => !u.hidden || (peutEditer && voirMasques)));

  const masques = () => actifs().filter(u => u.hidden).length;

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

  /** La lettre de classement : sans accent, minuscule. */
  const initialeDe = u => String(u.pseudo || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .charAt(0).toLowerCase();

  const dansTranche = (u, t) => !t || t.lettres.indexOf(initialeDe(u)) !== -1;

  /**
   * Le répertoire. Une tranche vide reste affichée mais éteinte : la voir
   * grisée dit qu'on a bien cherché au bon endroit, alors qu'une tranche
   * absente laisserait croire à un oubli.
   */
  function indexAlpha(liste, recherche) {
    if (recherche) return "";                 // la recherche fouille tout
    const compte = {};
    liste.forEach(u => {
      const l = initialeDe(u);
      TRANCHES.forEach(t => {
        if (t.lettres.indexOf(l) !== -1) compte[t.id] = (compte[t.id] || 0) + 1;
      });
    });

    return '<div class="alpha">' +
      '<button class="alpha__t' + (tranche ? "" : " est-choisie") + '" data-tr="">Tout</button>' +
      TRANCHES.map(t =>
        '<button class="alpha__t' + (tranche && tranche.id === t.id ? " est-choisie" : "") +
          (compte[t.id] ? "" : " est-vide") + '" data-tr="' + t.id + '"' +
          (compte[t.id]
            ? ' title="' + compte[t.id] + " fiche" + (compte[t.id] > 1 ? "s" : "") + '"'
            : " disabled") + ">" + t.nom + "</button>").join("") +
    "</div>";
  }

  /* ---- Enregistrement -----------------------------------------------------------
     Deux chemins, et l'appelant n'a pas à savoir lequel a servi.

     Quand le serveur tient le catalogue, l'opération part chez lui : le geste
     est visible par toute l'équipe aussitôt, sans publication, et deux
     responsables qui modifient en même temps ne s'écrasent plus.

     Sinon — pas de serveur, version trop ancienne, ou brouillon déjà en
     attente — on écrit dans le brouillon comme avant, et ça partira à la
     prochaine publication. */

  function enregistrer() {
    brouillon = MNStore.saveDraft(brouillon);
    MNAuth.refresh();
    dessiner();
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
      brouillon = MNStore.clone(MNStore.catalog());
      MNAuth.refresh();
      dessiner();
      return { ok: true, parServeur: true };
    }
    if (r && !r.ok) return { ok: false, parServeur: true, error: r.error };

    aLaMain();
    enregistrer();
    return { ok: true, parServeur: false };
  }

  /** Rien à ajouter si c'est déjà en ligne ; sinon on rappelle la publication. */
  const suite = r => r.parServeur ? "" : " — pense à publier";

  /* ---- Congés -----------------------------------------------------------------
     La fiche ne montre que l'absence du jour ; les périodes à venir se
     consultent sur la page Service. */

  function congeDuJour(uid) {
    const j = MNDuty.jourLocal();
    return MNDuty.congesOf(uid, true).find(c => c.from <= j && j <= c.to) || null;
  }

  function jourCourt(j) {
    const d = new Date(String(j) + "T12:00:00");   // midi : pas de bascule de fuseau
    if (isNaN(d)) return String(j);
    const o = { day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    return d.toLocaleDateString("fr-FR", o);
  }

  const retour = uid => {
    const c = congeDuJour(uid);
    return c ? " jusqu'au " + jourCourt(c.to) : "";
  };

  /* ---- Rendu --------------------------------------------------------------------- */

  function dessiner() {
    V2Shell.brouillon(dessiner);
    hote.innerHTML =
      '<div class="duo">' +
        '<aside class="duo__liste" id="e-liste"></aside>' +
        '<section class="duo__fiche" id="e-fiche"></section>' +
      "</div>";
    liste();
    fiche();
  }

  function liste() {
    const z = $("#e-liste");
    const f = filtre.toLowerCase();
    const base = visibles().filter(u =>
      !f || u.pseudo.toLowerCase().indexOf(f) !== -1 ||
      grade(u).name.toLowerCase().indexOf(f) !== -1);
    /* La tranche s'applique aux seules archives, et cède devant une
       recherche : chercher un nom précis doit fouiller tout le répertoire. */
    const l = (vueArchives && !f) ? base.filter(u => dansTranche(u, tranche)) : base;
    const nm = masques();
    const nArch = archives().length;

    /* Réorganiser n'a de sens que sur la liste vivante, entière et sans filtre. */
    const trie = peutEditer && ranger && !filtre && !vueArchives;

    z.innerHTML =
      '<div class="duo__filtres">' +
        /* Toujours visible, même sans personne d'archivé : une bascule qui
           n'apparaît qu'une fois la fonctionnalité utilisée ne se découvre
           jamais. Les archives vides le disent d'elles-mêmes. */
        '<div class="segbar">' +
          '<button class="seg' + (vueArchives ? "" : " est-choisie") +
            '" data-vue="equipe">Équipe</button>' +
          '<button class="seg' + (vueArchives ? " est-choisie" : "") +
            '" data-vue="archives">Archives' +
            (nArch ? "<span>" + nArch + "</span>" : "") + "</button>" +
        "</div>" +
        '<input class="saisie" id="e-cherche" placeholder="' +
          (vueArchives ? "Chercher dans les archives…" : "Chercher un employé…") +
          '" value="' + U.esc(filtre) + '">' +
        (vueArchives ? indexAlpha(base, f) : "") +
        (peutEditer && !vueArchives
          ? '<div class="rang" style="gap:var(--e-2)">' +
              U.bouton("Recruter", { variante: "principal", taille: "sm", icone: "plus",
                                     action: "add" }) +
              U.bouton("", { icone: ranger ? "check" : "grille",
                             variante: ranger ? "doux" : "fantome", taille: "sm",
                             titre: "Réorganiser la liste", action: "trier" }) +
            "</div>"
          : "") +
        (ranger && filtre
          ? '<p class="champ__aide">Vide la recherche pour réorganiser.</p>'
          : "") +
      "</div>" +

      '<div class="duo__corps">' +
        (l.length
          ? l.map(u => ligne(u, trie)).join("")
          : '<p class="champ__aide" style="padding:var(--e-3)">' +
            (vueArchives && !f && !tranche
              ? "Personne n'a encore quitté l'atelier. Les fiches des partants " +
                "arriveront ici, avec toute leur histoire."
              : "Personne ne correspond.") + "</p>") +
      "</div>" +

      '<div class="duo__pied">' +
        "<span style=\"flex:1\">" + l.length + " affiché" + (l.length > 1 ? "s" : "") + "</span>" +
        (peutEditer && nm
          ? U.bouton(nm + " masqué" + (nm > 1 ? "s" : ""),
              { variante: voirMasques ? "doux" : "fantome", taille: "sm",
                icone: voirMasques ? "check" : "boite", action: "masques" })
          : "") +
      "</div>";

    brancherListe(z);
  }

  function ligne(u, trie) {
    const r = grade(u);
    const on = MNDuty.isOn(u.id);
    const i = brouillon.users.indexOf(u);
    const c = congeDuJour(u.id);

    return '<div class="duo__item eq-item' + (u.id === sel ? " is-actif" : "") +
      (u.active ? "" : " est-eteint") + '" data-u="' + U.esc(u.id) +
      '" role="button" tabindex="0">' +
      (trie
        ? '<span class="eq-ordre">' +
            '<button data-mv="haut" data-u2="' + U.esc(u.id) + '"' +
              (i === 0 ? " disabled" : "") + ' aria-label="Monter">▲</button>' +
            '<button data-mv="bas" data-u2="' + U.esc(u.id) + '"' +
              (i === brouillon.users.length - 1 ? " disabled" : "") +
              ' aria-label="Descendre">▼</button>' +
          "</span>"
        : "") +
      '<span class="avatar" style="background:' + U.esc(r.color) + '">' +
        U.esc(U.initiales(u.pseudo)) + "</span>" +
      '<span class="duo__txt"><b class="tronque">' + U.esc(u.pseudo) + "</b>" +
        /* En archives, le grade importe moins que la raison du départ :
           c'est ce qu'on vient vérifier. */
        (MNStore.estArchive(u)
          ? '<span class="tronque">' +
            U.esc(MNStore.motifDepart(u.depart.motif).court + " · " + jourCourt(u.depart.le)) +
            "</span>"
          : '<span class="tronque" style="color:' + U.esc(r.color) + '">' +
            U.esc(r.name) + "</span>") +
      "</span>" +
      (u.hidden ? '<span class="duo__marque" title="Masqué de l\'équipe">' +
        U.icone("boite") + "</span>" : "") +
      /* Un dossier chargé se voit depuis la liste : chercher fiche par fiche
         qui a été averti n'aurait aucun sens. */
      (function () {
        if (!voitAvert(u)) return "";
        const b = MNStore.avertBilan(u);
        if (!b.actifs) return "";
        const g = MNStore.graviteDe(b.pire);
        return '<span class="eq-av" style="--grav:' + U.esc(g.couleur) + '" title="' +
          U.esc(b.actifs + " avertissement" + (b.actifs > 1 ? "s" : "") + " en cours") +
          '">' + b.actifs + "</span>";
      })() +
      /* Une seule pastille pour deux états qui s'excluent : vert en service,
         rouge en congés. */
      (on
        ? '<span class="eq-point" title="En service"></span>'
        : c
          ? '<span class="eq-point eq-point--conge" title="' +
            U.esc("En congés jusqu'au " + jourCourt(c.to)) + '"></span>'
          : "") +
    "</div>";
  }

  function brancherListe(z) {
    const ch = z.querySelector("#e-cherche");
    ch.addEventListener("input", () => {
      filtre = ch.value;
      const p = ch.selectionStart;
      liste();
      const n = $("#e-cherche");
      n.focus(); n.setSelectionRange(p, p);
    });

    z.querySelectorAll("[data-vue]").forEach(b => b.addEventListener("click", () => {
      const veut = b.dataset.vue === "archives";
      if (veut === vueArchives) return;
      vueArchives = veut;
      /* On repart d'une liste propre : la recherche et la tranche d'une vue
         n'ont pas de sens dans l'autre. */
      filtre = ""; tranche = null; ranger = false;
      const p = visibles()[0];
      sel = p ? p.id : null;
      dessiner();
    }));

    z.querySelectorAll("[data-tr]").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return;
      tranche = b.dataset.tr ? TRANCHES.find(x => x.id === b.dataset.tr) : null;
      const l = visibles().filter(u => dansTranche(u, tranche));
      /* La fiche affichée doit rester dans ce qu'on regarde. */
      if (!l.some(u => u.id === sel)) sel = l.length ? l[0].id : null;
      dessiner();
    }));

    const t = z.querySelector('[data-a="trier"]');
    if (t) t.addEventListener("click", () => {
      ranger = !ranger;
      liste();
      U.toast(ranger ? "Réorganisation : utilise les flèches" : "Réorganisation terminée", "info");
    });

    z.querySelectorAll("[data-mv]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      if (b.disabled) return;
      const i = brouillon.users.findIndex(x => x.id === b.dataset.u2);
      const j = i + (b.dataset.mv === "haut" ? -1 : 1);
      if (j < 0 || j >= brouillon.users.length) return;
      brouillon.users.splice(j, 0, brouillon.users.splice(i, 1)[0]);
      brouillon = MNStore.saveDraft(brouillon);
      V2Shell.brouillon(dessiner);
      liste();
    }));

    const m = z.querySelector('[data-a="masques"]');
    if (m) m.addEventListener("click", () => {
      voirMasques = !voirMasques;
      /* En les recachant, on ne laisse pas la fiche sur quelqu'un d'invisible. */
      if (!voirMasques) {
        const u = employe(sel);
        if (u && u.hidden) { const v = visibles()[0]; sel = v ? v.id : null; }
      }
      liste(); fiche();
    });

    const a = z.querySelector('[data-a="add"]');
    if (a) a.addEventListener("click", recruter);

    z.querySelectorAll("[data-u]").forEach(b => {
      const choisir = () => { sel = b.dataset.u; liste(); fiche(); };
      b.addEventListener("click", choisir);
      b.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(); }
      });
    });
  }

  /* ---- Fiche ---------------------------------------------------------------------- */

  function fiche() {
    const z = $("#e-fiche");
    const u = employe(sel);
    if (!u) {
      z.innerHTML = U.vide({ icone: "equipe", titre: "Aucun employé sélectionné",
                             texte: "Choisis quelqu'un dans la liste." });
      return;
    }

    const r = grade(u);
    const on = MNDuty.isOn(u.id);
    const carriere = (u.history || []).slice().reverse();
    const anc = anciennete(u.hiredAt);

    /* « Actuel » se pose sur la ligne du grade réellement porté, pas
       forcément la plus récente : une promotion peut être enregistrée après
       coup avec une date antérieure. */
    let iActuel = carriere.findIndex(h => h.roleId === u.roleId);
    if (iActuel === -1) iActuel = 0;

    z.innerHTML =
      '<div class="eq-tete" style="--grade:' + U.esc(r.color) + '">' +
        '<div class="eq-tete__av" style="background:' + U.esc(r.color) + '">' +
          U.esc(U.initiales(u.pseudo)) + "</div>" +
        '<div class="eq-tete__id">' +
          "<h2>" + U.esc(u.pseudo) + "</h2>" +
          '<div class="rang">' +
            '<span class="eq-grade">' + (r.icon ? mnIcon(r.icon) : "") +
              U.esc(r.name) + "</span>" +
            (on ? U.etiquette("en service", "succes") : "") +
            (MNDuty.enConge(u.id) ? U.etiquette("en congés" + retour(u.id), "erreur") : "") +
            (MNStore.estArchive(u) ? U.etiquette("archivé", "erreur") : "") +
            (u.active || MNStore.estArchive(u) ? "" : U.etiquette("désactivé")) +
            (u.hidden ? U.etiquette("masqué", "alerte") : "") +
            (u.pin ? U.etiquette("code d'accès") : "") +
          "</div>" +
        "</div>" +
        /* Une fiche archivée ne se modifie plus : elle témoigne. La seule
           action qui reste est de faire revenir la personne. */
        (MNStore.estArchive(u)
          ? (peutEditer
              ? '<div class="rang">' + U.bouton("Réintégrer",
                  { variante: "principal", icone: "rafraichir", action: "retour" }) + "</div>"
              : "")
          : (peutEditer || (peutAvertir && u.id !== moi.uid)
            ? '<div class="rang">' +
                (peutEditer
                  ? U.bouton("Changer de grade", { variante: "principal", icone: "etoile",
                                                   action: "grade" }) +
                    U.bouton("Modifier la fiche", { variante: "fantome", icone: "crayon",
                                                    action: "edit" })
                  : "") +
                (peutAvertir && u.id !== moi.uid
                  ? U.bouton("Avertir", { variante: "fantome", icone: "alerte", action: "warn" })
                  : "") +
                (peutEditer && u.id !== moi.uid
                  ? U.bouton("Archiver", { variante: "fantome", icone: "sortie",
                                           action: "partir" })
                  : "") +
              "</div>"
            : "")) +
      "</div>" +

      '<div class="eq-corps">' +
        /* Le départ passe avant tout le reste : c'est la première chose à
           savoir en ouvrant la fiche de quelqu'un qui n'est plus là. */
        (MNStore.estArchive(u) ? bandeauDepart(u) : "") +
        '<div class="grille grille--sm">' +
          U.tuile({ label: "Ancienneté", valeur: anc.texte, pied: anc.sous, icone: "calendrier" }) +
          tuileVive("Service — semaine",
            MNDuty.dur(MNDuty.secondsFor(u.id, MNDuty.weekStart())), "semaine", on) +
          tuileVive("Service — total", MNDuty.dur(MNDuty.secondsFor(u.id)), "total", on) +
          U.tuile({ label: "Formations", valeur: String((u.trainings || []).length),
                    icone: "etoile",
                    pied: (u.trainings || []).length
                      ? u.trainings.slice(0, 2).join(", ") : "aucune" }) +
          (voitAvert(u) ? tuileAvert(u) : "") +
        "</div>" +

        section("Carrière", carriere.length,
          carriere.length
            ? '<ol class="frise">' + carriere.map((h, i) => {
                const hr = brouillon.roles.find(x => x.id === h.roleId);
                return '<li class="frise__pas' + (i === iActuel ? " est-actuel" : "") +
                  '" style="--grade:' + U.esc(hr ? hr.color : "#6a6280") + '">' +
                  '<span class="frise__point"></span>' +
                  '<div><b>' + U.esc(h.roleName || h.roleId) + "</b>" +
                    (i === iActuel ? " " + U.etiquette("actuel", "action") : "") +
                    '<div class="frise__quand">' + U.esc(dateheure(h.at)) +
                      (h.by ? " · par " + U.esc(h.by) : "") +
                      (h.note ? " · " + U.esc(h.note) : "") + "</div>" +
                  "</div></li>";
              }).join("") + "</ol>"
            : '<p class="champ__aide">Aucun changement de grade enregistré.</p>') +

        section("Formations", (u.trainings || []).length,
          (u.trainings || []).length
            ? '<div class="rang">' + u.trainings.map(t =>
                U.etiquette(t)).join("") + "</div>"
            : '<p class="champ__aide">Aucune formation enregistrée.</p>') +

        (voitAvert(u) ? blocAvert(u) : "") +

        historique(u, on) +

        (u.note && voitNotes
          ? section("Note interne", 0,
              '<p class="champ__aide" style="white-space:pre-wrap">' + U.esc(u.note) + "</p>")
          : "") +
      "</div>";

    const g = z.querySelector('[data-a="grade"]');
    if (g) g.addEventListener("click", () => promouvoir(u));
    const e = z.querySelector('[data-a="edit"]');
    if (e) e.addEventListener("click", () => modifier(u));
    const dep = z.querySelector('[data-a="partir"]');
    if (dep) dep.addEventListener("click", () => archiver(u));
    const ret = z.querySelector('[data-a="retour"]');
    if (ret) ret.addEventListener("click", () => reintegrer(u));

    /* Deux entrées vers la même fenêtre : le bouton de l'entête, et celui du
       bloc — on avertit rarement, mais quand on le fait on est déjà en bas de
       la fiche à relire les précédents. */
    ["warn", "warn2"].forEach(a => {
      const b = z.querySelector('[data-a="' + a + '"]');
      if (b) b.addEventListener("click", () => avertir(u));
    });

    z.querySelectorAll('[data-a^="lever|"], [data-a^="retirer|"]').forEach(b =>
      b.addEventListener("click", () => {
        const coupe = b.dataset.a.indexOf("|");
        const action = b.dataset.a.slice(0, coupe), id = b.dataset.a.slice(coupe + 1);
        if (action === "lever") leverAvert(u, id); else retirerAvert(u, id);
      }));
  }

  const section = (titre, n, corps) =>
    '<section class="eq-bloc"><h3>' + U.esc(titre) +
      (n ? '<span class="eq-bloc__n">' + n + "</span>" : "") + "</h3>" + corps + "</section>";

  /** Une tuile dont le chiffre bouge tant que la personne est en service. */
  const tuileVive = (label, valeur, cle, vif) =>
    '<div class="tuile' + (vif ? " tuile--succes" : "") + '">' +
      '<span class="tuile__label">' + U.icone("horloge") + U.esc(label) + "</span>" +
      '<span class="tuile__val" data-vif="' + cle + '">' + U.esc(valeur) + "</span>" +
      (vif ? '<span class="tuile__pied">en cours</span>' : "") +
    "</div>";

  const hhmm = d => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateheure = d => {
    const x = new Date(d);
    return isNaN(x) ? "—" : x.toLocaleString("fr-FR",
      { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  /* ---- Historique de service --------------------------------------------------
     Regroupé par semaine puis par jour : une ligne par journée avec ses
     créneaux et son total, plutôt qu'une longue liste plate. */

  function historique(u, on) {
    const log = MNDuty.logOf(u.id).slice(0, 200);

    /* Le compteur doit rester joignable pour être rafraîchi chaque seconde :
       on écrit l'encart plutôt que de passer par `alerte()`. */
    const depuis = on ? MNDuty.entryOf(u.id).since : "";
    const enTete = on
      ? '<div class="alerte alerte--succes" style="margin-bottom:var(--e-3)">' +
          U.icone("check") +
          "<div><b>En service actuellement</b>" +
          "<p>Depuis " + U.esc(hhmm(depuis)) + " — " +
            '<b class="nombre" data-depuis="' + U.esc(depuis) + '">' +
            U.esc(MNDuty.sinceDur(depuis)) + "</b>.</p></div>" +
        "</div>"
      : "";

    if (!log.length) {
      return section("Historique de service", 0, enTete +
        '<p class="champ__aide">Aucun service terminé enregistré' +
        (MNDuty.canShare() ? "" : " (le tableau partagé n'est pas accessible depuis cet appareil)") +
        ".</p>");
    }

    const semaines = [];
    const cette = MNDuty.weekStart();

    log.forEach(e => {
      const d = new Date(e.in);
      const lundi = new Date(d);
      lundi.setHours(0, 0, 0, 0);
      lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
      const cs = lundi.getTime(), cj = d.toDateString();

      let s = semaines.find(x => x.cle === cs);
      if (!s) {
        s = { cle: cs, secondes: 0, services: 0, jours: [], nom: nomSemaine(lundi) };
        semaines.push(s);
      }
      s.secondes += e.seconds;
      s.services++;

      let j = s.jours.find(x => x.cle === cj);
      if (!j) {
        j = { cle: cj, a: new Date(d).setHours(0, 0, 0, 0), secondes: 0, creneaux: [],
              force: false,
              nom: d.toLocaleDateString("fr-FR",
                { weekday: "long", day: "2-digit", month: "2-digit" }) };
        s.jours.push(j);
      }
      j.secondes += e.seconds;
      j.creneaux.push({ a: d.getTime(), txt: hhmm(e.in) + "–" + hhmm(e.out) });
      if (e.forced) j.force = true;
    });

    /* Le journal arrive du plus récent au plus ancien : c'est ce qu'il faut
       pour lister les semaines, mais à l'intérieur d'une semaine on lit une
       journée dans le sens où elle s'est déroulée. */
    semaines.forEach(s => {
      s.jours.sort((a, b) => a.a - b.a);
      s.jours.forEach(j => j.creneaux.sort((a, b) => a.a - b.a));
    });

    return section("Historique de service", log.length, enTete +
      semaines.map(s =>
        "<details class=\"eq-sem\"" + (s.cle === cette ? " open" : "") + ">" +
          '<summary class="eq-sem__tete">' +
            '<span class="eq-sem__nom">' + U.esc(s.nom) +
              (s.cle === cette ? " " + U.etiquette("en cours", "succes") : "") + "</span>" +
            '<span class="eq-sem__meta">' + s.jours.length + " j · " + s.services +
              " service" + (s.services > 1 ? "s" : "") + "</span>" +
            '<b class="nombre">' + U.esc(MNDuty.dur(s.secondes, true)) + "</b>" +
          "</summary>" +
          '<div class="eq-sem__corps">' +
            s.jours.map(j =>
              '<div class="eq-jour">' +
                '<span class="eq-jour__date">' + U.esc(j.nom) + "</span>" +
                '<span class="eq-jour__creneaux">' + j.creneaux.map(c =>
                  '<span class="eq-creneau nombre">' + U.esc(c.txt) + "</span>").join("") +
                  (j.force ? U.etiquette("clôturé par un gérant") : "") +
                "</span>" +
                '<span class="eq-jour__tot nombre">' + U.esc(MNDuty.dur(j.secondes)) + "</span>" +
              "</div>").join("") +
            '<div class="eq-sem__moy"><span>Moyenne par jour travaillé</span>' +
              '<b class="nombre">' +
                U.esc(MNDuty.dur(Math.round(s.secondes / s.jours.length))) + "</b></div>" +
          "</div>" +
        "</details>").join(""));
  }

  /** « Semaine du 3 au 9 août 2026 », sans répéter ce qui se devine. */
  function nomSemaine(lundi) {
    const dim = new Date(lundi);
    dim.setDate(dim.getDate() + 6);
    const memeMois = lundi.getMonth() === dim.getMonth();
    const memeAn = lundi.getFullYear() === dim.getFullYear();
    const a = lundi.toLocaleDateString("fr-FR",
      memeMois && memeAn ? { day: "numeric" } : { day: "numeric", month: "long" });
    const b = dim.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    return "Semaine du " + a + " au " + b;
  }

  /**
   * Ancienneté en années / mois / jours, en tenant compte de la longueur
   * réelle de chaque mois — pas d'approximation à 30,44 jours.
   */
  function anciennete(depuis) {
    if (!depuis) return { texte: "—", sous: "" };
    const d = new Date(depuis + "T00:00:00");
    if (isNaN(d)) return { texte: "—", sous: "" };

    const auj = new Date();
    auj.setHours(0, 0, 0, 0);
    if (d > auj) return { texte: "à venir", sous: "" };

    let ans = auj.getFullYear() - d.getFullYear();
    let mois = auj.getMonth() - d.getMonth();
    let jours = auj.getDate() - d.getDate();

    if (jours < 0) {
      mois--;
      jours += new Date(auj.getFullYear(), auj.getMonth(), 0).getDate();
    }
    if (mois < 0) { ans--; mois += 12; }

    const total = Math.round((auj - d) / 86400000);
    if (total === 0) return { texte: "aujourd'hui", sous: "recruté ce jour" };

    const p = [];
    if (ans) p.push(ans + " an" + (ans > 1 ? "s" : ""));
    if (mois) p.push(mois + " mois");
    if (jours || !p.length) p.push(jours + " j");

    return { texte: p.join(" "),
             sous: total + " jour" + (total > 1 ? "s" : "") + " au total" };
  }

  /* ---- Départs et archives -------------------------------------------------------- */

  function bandeauDepart(u) {
    const d = u.depart;
    const m = MNStore.motifDepart(d.motif);
    return '<div class="depart">' +
      '<div class="depart__tete">' + U.icone("sortie") +
        "<b>" + U.esc(m.nom) + "</b>" +
        "<span>le " + U.esc(jourCourt(d.le)) +
          (d.par ? " · par " + U.esc(d.par) : "") + "</span>" +
      "</div>" +
      (d.note ? '<p class="depart__note">' + U.esc(d.note) + "</p>" : "") +
      '<p class="champ__aide">Cette fiche est conservée telle quelle : ancienneté, ' +
        "carrière, formations et avertissements restent lisibles. Elle ne se modifie plus.</p>" +
    "</div>";
  }

  /** Faire partir quelqu'un : la fiche passe aux archives, rien n'est perdu. */
  function archiver(u) {
    const auj = MNDuty.jourLocal();
    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<p class="champ__aide">' + U.esc(u.pseudo) + " quittera l'équipe et ne pourra plus " +
        "se connecter. <b>Rien n'est supprimé</b> : sa fiche part aux archives avec toute " +
        "son histoire, et tu pourras la rouvrir ou le réintégrer plus tard.</p>" +
      '<div class="champ"><span class="champ__label">Motif</span>' +
        '<div class="motifs">' + MNStore.MOTIFS_DEPART.map((m, i) =>
          '<button type="button" class="motif' + (i === 0 ? " est-choisie" : "") +
          '" data-m="' + U.esc(m.id) + '">' + U.esc(m.nom) + "</button>").join("") +
      "</div></div>" +
      '<div style="max-width:220px">' +
        U.champ({ id: "d-date", label: "Date du départ", type: "date", valeur: auj,
                  plafond: auj }) +
      "</div>" +
      U.champ({ id: "d-note", label: "Précisions (facultatif)", type: "zone", max: 600,
                repere: "Ce qu'il faut retenir de ce départ…" });

    let motif = MNStore.MOTIFS_DEPART[0].id;
    corps.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
      motif = b.dataset.m;
      corps.querySelectorAll("[data-m]").forEach(x => x.classList.toggle("est-choisie", x === b));
    }));

    U.modale({
      titre: "Archiver " + u.pseudo, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Archiver la fiche", variante: "principal", icone: "sortie",
          onClick: async (fermer, k) => {
            const depart = {
              le: k.querySelector("#d-date").value || auj, motif,
              note: k.querySelector("#d-note").value.trim(), par: moi.pseudo
            };

            /* On bascule sur les archives : c'est là qu'il se trouve
               désormais, le laisser sur une liste où il n'est plus serait
               déroutant. */
            vueArchives = true; tranche = null; filtre = "";
            sel = u.id;

            const r = await appliquer(
              { op: "depart", uid: u.id, depart },
              () => MNStore.archiverUser(u, depart, moi.pseudo));
            if (!r.ok) return U.toast("Archivage impossible : " + r.error, "err");

            fermer();
            U.toast(u.pseudo + " est archivé — sa fiche reste consultable" + suite(r), "ok");
          } }
      ]
    });
  }

  async function reintegrer(u) {
    const ok = await U.confirmer({
      titre: "Réintégrer " + u.pseudo,
      message: "Sa fiche revient dans l'équipe avec toute son histoire, et il pourra de " +
        "nouveau se connecter. Son grade est celui qu'il avait en partant.",
      confirmer: "Réintégrer"
    });
    if (!ok) return;

    vueArchives = false; tranche = null; filtre = "";
    sel = u.id;

    const r = await appliquer(
      { op: "retour", uid: u.id },
      () => MNStore.reintegrerUser(u));
    if (!r.ok) return U.toast("Réintégration impossible : " + r.error, "err");

    U.toast(u.pseudo + " a rejoint l'équipe" + suite(r), "ok");
  }

  /* ---- Avertissements ------------------------------------------------------------
     Une sanction se lit et se conteste : elle porte un motif, une date et le
     nom de qui l'a donnée. Chacun voit les siennes — un avertissement qu'on
     ignore ne sert à rien — mais seuls ceux qui gèrent l'équipe voient ceux
     des autres. */

  const voitAvert = u =>
    V2Shell.peut("warn", "users", "admin") || (moi && u.id === moi.uid);

  function tuileAvert(u) {
    const b = MNStore.avertBilan(u);
    if (!b.total) {
      return U.tuile({ label: "Avertissements", valeur: "0", icone: "alerte", pied: "aucun" });
    }
    const g = MNStore.graviteDe(b.pire);
    return '<div class="tuile' + (b.actifs ? " tuile--alerte" : "") + '">' +
      '<span class="tuile__label">' + U.icone("alerte") + "Avertissements</span>" +
      '<span class="tuile__val"' + (b.actifs ? ' style="color:' + U.esc(g.couleur) + '"' : "") +
        ">" + b.actifs + "</span>" +
      '<span class="tuile__pied">' + U.esc(b.actifs
        ? "en cours" + (b.total > b.actifs ? " · " + (b.total - b.actifs) + " sans effet" : "")
        : b.total + " au total, aucun en cours") + "</span>" +
    "</div>";
  }

  function blocAvert(u) {
    const l = u.avertissements || [];
    const b = MNStore.avertBilan(u);
    const sien = moi && u.id === moi.uid;
    const peut = peutAvertir && !sien;

    const corps = !l.length
      ? '<p class="champ__aide">' + (sien
          ? "Aucun avertissement à ton dossier."
          : "Aucun avertissement. Rien à signaler.") + "</p>"
      : (b.actifs > 1
          ? '<div style="margin-bottom:var(--e-3)">' + U.alerte({
              ton: "alerte", titre: b.actifs + " avertissements en cours",
              texte: "Cumul de gravité : " + b.poids + "."
            }) + "</div>"
          : "") +
        '<div class="pile pile--sm">' + l.map(a => ligneAvert(a, peut)).join("") + "</div>";

    return '<section class="eq-bloc"><h3>Avertissements' +
      (l.length ? '<span class="eq-bloc__n">' + l.length + "</span>" : "") +
      (peut
        ? '<span class="pousse">' + U.bouton("Donner un avertissement",
            { variante: "fantome", taille: "sm", icone: "plus", action: "warn2" }) + "</span>"
        : "") +
      "</h3>" + corps + "</section>";
  }

  function ligneAvert(a, peut) {
    const g = MNStore.graviteDe(a.gravite);
    const actif = MNStore.avertActif(a);
    const echu = !a.leve && a.expire && a.expire < MNDuty.jourLocal();

    return '<div class="av' + (actif ? "" : " est-eteint") +
      '" style="--grav:' + U.esc(g.couleur) + '">' +
      '<span class="av__pastille">' + U.esc(g.court) + "</span>" +
      '<div class="av__corps">' +
        "<b>" + U.esc(a.motif) + "</b>" +
        (a.note ? '<p class="av__note">' + U.esc(a.note) + "</p>" : "") +
        '<div class="av__meta">' + U.esc(dateheure(a.at)) +
          (a.by ? " · par " + U.esc(a.by) : "") +
          (a.expire ? " · compte jusqu'au " + U.esc(jourCourt(a.expire)) : "") +
          (a.leve
            ? ' · <i class="av__leve">levé' + (a.levePar ? " par " + U.esc(a.levePar) : "") +
              (a.leveLe ? " le " + U.esc(jourCourt(String(a.leveLe).slice(0, 10))) : "") + "</i>"
            : echu ? ' · <i class="av__leve">échu, ne compte plus</i>' : "") +
        "</div>" +
      "</div>" +
      (peut
        ? '<div class="av__acts">' +
            (a.leve ? "" : U.bouton("", { icone: "check", variante: "fantome", taille: "sm",
              titre: "Lever cet avertissement", action: "lever|" + a.id })) +
            U.bouton("", { icone: "poubelle", variante: "fantome", taille: "sm",
              titre: "Retirer — erreur de saisie", action: "retirer|" + a.id }) +
          "</div>"
        : "") +
    "</div>";
  }

  function avertir(u) {
    const auj = MNDuty.jourLocal();
    /* Une échéance à trois mois par défaut : un avertissement sans fin
       n'existe que pour peser, et ce n'est pas le but. */
    const dans3mois = (function () {
      const d = new Date(auj + "T12:00:00");
      d.setMonth(d.getMonth() + 3);
      return MNDuty.jourLocal(d);
    })();

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<p class="champ__aide">Il partira sur Discord si un salon lui est réservé, et ' +
        U.esc(u.pseudo) + " le verra sur sa propre fiche.</p>" +
      '<div class="champ"><span class="champ__label">Gravité</span>' +
        '<div class="gravites">' + MNStore.GRAVITES.map((g, i) =>
          '<button type="button" class="grav' + (i === 1 ? " est-choisie" : "") +
          '" data-g="' + U.esc(g.id) + '" style="--grav:' + U.esc(g.couleur) + '">' +
          U.esc(g.nom) + "</button>").join("") + "</div></div>" +
      U.champ({ id: "a-motif", label: "Motif", max: 120,
                repere: "Ex. Véhicule rendu sans les freins" }) +
      U.champ({ id: "a-note", label: "Précisions (facultatif)", type: "zone", max: 600,
                repere: "Ce qui s'est passé, ce qui est attendu ensuite…" }) +
      '<div class="cols-2">' +
        U.champ({ id: "a-date", label: "Date des faits", type: "date", valeur: auj,
                  plafond: auj }) +
        U.champ({ id: "a-exp", label: "Compte jusqu'au", type: "date", valeur: dans3mois,
                  aide: "Passée cette date il reste lisible, mais ne compte plus. " +
                        "Vide = sans échéance." }) +
      "</div>";

    let gravite = "simple";
    corps.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => {
      gravite = b.dataset.g;
      corps.querySelectorAll("[data-g]").forEach(x => x.classList.toggle("est-choisie", x === b));
    }));

    U.modale({
      titre: "Avertir " + u.pseudo, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Donner l'avertissement", variante: "principal", icone: "alerte",
          onClick: async (fermer, k, btn) => {
            const motif = k.querySelector("#a-motif").value.trim();
            if (motif.length < 3) {
              return U.toast("Écris un motif — c'est le cœur de l'avertissement", "err");
            }

            /* Seul le jour est demandé : pour aujourd'hui on garde l'heure
               courante, pour une date passée midi — un horaire neutre. */
            const j = k.querySelector("#a-date").value;
            let quand = new Date();
            if (j && j !== MNDuty.jourLocal()) quand = new Date(j + "T12:00:00");
            if (isNaN(quand) || quand > new Date()) quand = new Date();

            btn.disabled = true;

            /* On construit l'avertissement ici : le serveur le range tel
               quel, et à défaut c'est lui qu'on écrit dans le brouillon. */
            const a = MNStore.normAvertissement({
              id: MNStore.uniqueId("av-" + MNDuty.jourLocal(),
                (u.avertissements || []).map(x => x.id)),
              at: quand.toISOString(), by: moi.pseudo,
              gravite, motif,
              note: k.querySelector("#a-note").value.trim(),
              expire: k.querySelector("#a-exp").value || null
            });

            const r = await appliquer(
              { op: "avert-add", uid: u.id, avert: a },
              () => {
                u.avertissements = [a].concat(u.avertissements || []).slice(0, 60);
              });

            if (!r.ok) {
              btn.disabled = false;
              return U.toast("Enregistrement impossible : " + r.error, "err");
            }
            fermer();

            const d = await MNWebhook.sendAvertissement({
              action: "pose", pseudo: u.pseudo,
              gravite: MNStore.graviteDe(a.gravite).nom,
              motif: a.motif, note: a.note, expire: a.expire, by: moi.pseudo
            });
            U.toast(d.ok
              ? "Avertissement donné et annoncé sur Discord" + suite(r)
              : d.skipped
                ? "Avertissement donné (aucun salon Discord dédié)" + suite(r)
                : "Avertissement donné" + suite(r) + ", mais Discord : " + d.error,
              d.ok || d.skipped ? "ok" : "info");
          } }
      ]
    });
  }

  async function leverAvert(u, id) {
    const a = (u.avertissements || []).find(x => x.id === id);
    if (!a) return;
    const ok = await U.confirmer({
      titre: "Lever cet avertissement",
      message: "« " + a.motif + " » cessera de compter, mais restera sur la fiche de " +
        u.pseudo + " avec la mention « levé par " + moi.pseudo + " ».",
      confirmer: "Lever"
    });
    if (!ok) return;

    const r = await appliquer(
      { op: "avert-lever", uid: u.id, id, par: moi.pseudo },
      () => MNStore.leverAvertissement(u, id, moi.pseudo));
    if (!r.ok) return U.toast("Levée impossible : " + r.error, "err");

    MNWebhook.sendAvertissement({
      action: "leve", pseudo: u.pseudo,
      gravite: MNStore.graviteDe(a.gravite).nom, motif: a.motif, by: moi.pseudo
    });
    U.toast("Avertissement levé" + suite(r), "ok");
  }

  async function retirerAvert(u, id) {
    const a = (u.avertissements || []).find(x => x.id === id);
    if (!a) return;
    const ok = await U.confirmer({
      titre: "Retirer cet avertissement",
      message: "« " + a.motif + " » disparaîtra de la fiche sans laisser de trace. " +
        "À réserver aux erreurs de saisie : pour annuler une sanction méritée, " +
        "mieux vaut la lever.",
      confirmer: "Retirer", danger: true
    });
    if (!ok) return;

    const r = await appliquer(
      { op: "avert-retirer", uid: u.id, id },
      () => MNStore.retirerAvertissement(u, id));
    if (!r.ok) return U.toast("Retrait impossible : " + r.error, "err");

    MNWebhook.sendAvertissement({
      action: "retire", pseudo: u.pseudo,
      gravite: MNStore.graviteDe(a.gravite).nom, motif: a.motif, by: moi.pseudo
    });
    U.toast("Avertissement retiré" + suite(r), "ok");
  }

  /* ---- Montée de grade -------------------------------------------------------------- */

  function promouvoir(u) {
    const actuel = grade(u);
    const auj = MNDuty.jourLocal();

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<p class="champ__aide">Grade actuel : <b style="color:' + U.esc(actuel.color) + '">' +
        U.esc(actuel.name) + "</b></p>" +
      U.champ({ id: "p-role", label: "Nouveau grade", type: "liste", valeur: u.roleId,
                options: brouillon.roles.map(r => ({ valeur: r.id, nom: r.name })) }) +
      U.champ({ id: "p-date", label: "Date de la montée", type: "date", valeur: auj,
                plafond: auj }) +
      U.champ({ id: "p-note", label: "Motif (facultatif)", max: 80,
                repere: "Ex. promotion après formation remorquage" }) +
      '<p class="champ__aide">La date est celle du jour, mais tu peux la reculer si la ' +
        "promotion a eu lieu avant d'être notée ici. L'ancien grade reste dans la carrière.</p>";

    U.modale({
      titre: "Changer le grade de " + u.pseudo, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Valider la montée", variante: "principal", icone: "etoile",
          onClick: async (fermer, k) => {
            const roleId = k.querySelector("#p-role").value;
            if (roleId === u.roleId) return U.toast("C'est déjà son grade actuel", "info");

            /* On ne se retire pas soi-même la gestion de l'équipe. */
            if (u.id === moi.uid) {
              const p = (brouillon.roles.find(x => x.id === roleId) || {}).perms || [];
              if (["admin", "users", "promote"].every(x => p.indexOf(x) === -1)) {
                return U.toast("Ce grade te retirerait la gestion de l'équipe", "err");
              }
            }

            /* Seul le jour est demandé. Pour aujourd'hui on garde l'heure
               courante, ce qui ordonne correctement plusieurs changements le
               même jour ; pour une date passée, midi — un horaire neutre que
               ni le fuseau ni l'heure d'été ne font changer de journée. */
            const jour = k.querySelector("#p-date").value;
            let quand = new Date();
            if (jour && jour !== MNDuty.jourLocal()) quand = new Date(jour + "T12:00:00");
            if (isNaN(quand) || quand > new Date()) quand = new Date();

            const vers = brouillon.roles.find(x => x.id === roleId);
            const note = k.querySelector("#p-note").value.trim();

            const r = await appliquer(
              { op: "promotion", uid: u.id, roleId, roleName: vers ? vers.name : roleId,
                par: moi.pseudo, note, at: quand.toISOString() },
              () => MNStore.recordPromotion(u, roleId, brouillon.roles, moi.pseudo, note,
                quand.toISOString()));
            if (!r.ok) return U.toast("Promotion impossible : " + r.error, "err");

            fermer();
            U.toast(u.pseudo + " passe " + (vers ? vers.name : roleId) +
              " (au " + quand.toLocaleDateString("fr-FR") + ")" + suite(r), "ok");
          } }
      ]
    });
  }

  /* ---- Modification de la fiche ----------------------------------------------------- */

  function modifier(u) {
    let formations = (u.trainings || []).slice();

    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "f-pseudo", label: "Prénom & Nom", valeur: u.pseudo, max: 40 }) +
        U.champ({ id: "f-emb", label: "Date de recrutement", type: "date",
                  valeur: u.hiredAt || "" }) +
      "</div>" +
      '<div class="champ"><span class="champ__label">Formations</span>' +
        '<div class="rang" id="f-tags"></div>' +
        '<div class="rang" style="margin-top:var(--e-2)">' +
          '<input class="saisie" id="f-new" placeholder="Ex. Remorquage" maxlength="40" ' +
            'style="flex:1">' +
          U.bouton("Ajouter", { variante: "fantome", taille: "sm", icone: "plus",
                                action: "addtag", type: "button" }) +
        "</div></div>" +
      U.champ({ id: "f-note", label: "Note interne", type: "zone", valeur: u.note || "",
                max: 400, repere: "Remarques, disponibilités…" }) +
      U.champ({ id: "f-actif", type: "bascule", label: "Compte actif", valeur: u.active }) +
      U.champ({ id: "f-masq", type: "bascule", label: "Masquer de l'onglet Équipe",
                valeur: u.hidden }) +
      '<p class="champ__aide">Masqué, l\'employé n\'apparaît plus dans la liste de gauche, ' +
        "mais son compte reste entier : il se connecte, fait ses bons et pointe son service " +
        "normalement. Le bouton en bas de la liste le réaffiche.</p>";

    /* On ne se désactive pas soi-même : la case reste bloquée sur « actif ». */
    if (u.id === moi.uid) corps.querySelector("#f-actif").disabled = true;

    const tags = corps.querySelector("#f-tags");
    function peindre() {
      tags.innerHTML = formations.length
        ? formations.map((t, i) =>
            '<span class="etiq">' + U.esc(t) +
            ' <button type="button" data-rm="' + i + '" aria-label="Retirer" ' +
            'style="background:none;border:0;color:inherit;cursor:pointer">×</button></span>').join("")
        : '<span class="champ__aide">aucune</span>';
      tags.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => {
        formations.splice(Number(b.dataset.rm), 1); peindre();
      }));
    }
    peindre();

    const ajouter = () => {
      const n = corps.querySelector("#f-new");
      const v = n.value.trim();
      if (!v) return;
      if (formations.some(t => t.toLowerCase() === v.toLowerCase())) {
        return U.toast("Déjà présente", "info");
      }
      formations.push(v); n.value = ""; peindre(); n.focus();
    };
    corps.querySelector('[data-a="addtag"]').addEventListener("click", ajouter);
    corps.querySelector("#f-new").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); ajouter(); }
    });

    U.modale({
      titre: "Fiche de " + u.pseudo, corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Enregistrer", variante: "principal", icone: "check",
          onClick: async (fermer, k) => {
            const pseudo = k.querySelector("#f-pseudo").value.trim();
            if (pseudo.length < 2) return U.toast("Nom trop court", "err");
            if (brouillon.users.some(x => x.id !== u.id &&
                x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return U.toast("Ce nom est déjà pris", "err");
            }

            const champs = {
              pseudo,
              hiredAt: k.querySelector("#f-emb").value || u.hiredAt,
              trainings: formations,
              note: k.querySelector("#f-note").value.trim(),
              active: u.id === moi.uid ? true : k.querySelector("#f-actif").checked,
              hidden: k.querySelector("#f-masq").checked
            };

            /* On garde la personne à l'écran même si elle vient d'être masquée. */
            if (champs.hidden && !voirMasques && peutEditer) voirMasques = true;

            const r = await appliquer(
              Object.assign({ op: "fiche", uid: u.id }, champs),
              () => Object.assign(u, champs));
            if (!r.ok) return U.toast("Enregistrement impossible : " + r.error, "err");

            fermer();
            U.toast("Fiche mise à jour" + suite(r), "ok");
          } }
      ]
    });
  }

  /* ---- Recrutement ------------------------------------------------------------------- */

  function recruter() {
    /* Le dernier de la liste : c'est le bas de la hiérarchie, telle que
       l'atelier l'a rangée dans Administration → Rôles. Compter les
       permissions paraissait plus malin, mais donnait un choix imprévisible
       dès que deux grades en avaient autant — et pouvait proposer un
       administrateur. */
    const plusBas = brouillon.roles[brouillon.roles.length - 1];
    if (!plusBas) return U.toast("Crée d'abord un grade dans l'administration", "err");

    const auj = new Date().toISOString().slice(0, 10);
    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "n-pseudo", label: "Prénom & Nom (sert à se connecter)", max: 40,
                  repere: "Ex. Rico Martin" }) +
        U.champ({ id: "n-role", label: "Grade d'entrée", type: "liste", valeur: plusBas.id,
                  options: brouillon.roles.map(r => ({ valeur: r.id, nom: r.name })) }) +
        U.champ({ id: "n-emb", label: "Date de recrutement", type: "date", valeur: auj }) +
        U.champ({ id: "n-pin", label: "Code d'accès (facultatif)", type: "password",
                  max: 24, clavier: "numeric" }) +
      "</div>";

    U.modale({
      titre: "Nouvel employé", corps,
      actions: [
        { label: "Annuler", onClick: f => f() },
        { label: "Recruter", variante: "principal", icone: "plus",
          onClick: async (fermer, k) => {
            const pseudo = k.querySelector("#n-pseudo").value.trim();
            if (pseudo.length < 2) return U.toast("Nom trop court", "err");
            if (brouillon.users.some(x => x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return U.toast("Ce nom est déjà pris", "err");
            }

            const id = MNStore.uniqueId(pseudo, brouillon.users.map(x => x.id));
            const roleId = k.querySelector("#n-role").value;
            const pin = k.querySelector("#n-pin").value.trim();
            const rr = brouillon.roles.find(x => x.id === roleId);
            const emb = k.querySelector("#n-emb").value || auj;

            const nouveau = {
              id, pseudo, roleId, active: true,
              pin: pin ? MNAuth.hashPin(id, pin) : null,
              createdAt: new Date().toISOString(),
              hiredAt: emb,
              trainings: [], note: "",
              avertissements: [], depart: null,
              history: [{
                roleId, roleName: rr ? rr.name : roleId,
                at: new Date(emb + "T12:00:00").toISOString(),
                by: moi.pseudo, note: "Entrée dans l'entreprise"
              }]
            };
            sel = id;

            const r = await appliquer(
              { op: "recrue", user: nouveau },
              () => brouillon.users.push(nouveau));
            if (!r.ok) return U.toast("Recrutement impossible : " + r.error, "err");

            fermer();
            U.toast(pseudo + " a rejoint l'équipe" + suite(r), "ok");
          } }
      ]
    });
  }
})();
