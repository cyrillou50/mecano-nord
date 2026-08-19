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
  let peutEditer = false, voitNotes = false;
  let voirMasques = false, ranger = false;
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

  const visibles = () => brouillon.users.filter(u => !u.hidden || (peutEditer && voirMasques));
  const masques = () => brouillon.users.filter(u => u.hidden).length;

  function enregistrer() {
    brouillon = MNStore.saveDraft(brouillon);
    MNAuth.refresh();
    dessiner();
  }

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
    const l = visibles().filter(u =>
      !f || u.pseudo.toLowerCase().indexOf(f) !== -1 ||
      grade(u).name.toLowerCase().indexOf(f) !== -1);
    const nm = masques();

    /* Réorganiser n'a de sens que sur la liste entière : déplacer une ligne
       dans une liste filtrée donnerait un ordre imprévisible. */
    const trie = peutEditer && ranger && !filtre;

    z.innerHTML =
      '<div class="duo__filtres">' +
        '<input class="saisie" id="e-cherche" placeholder="Chercher un employé…" value="' +
          U.esc(filtre) + '">' +
        (peutEditer
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
          : '<p class="champ__aide" style="padding:var(--e-3)">Personne ne correspond.</p>') +
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
        '<span class="tronque" style="color:' + U.esc(r.color) + '">' +
          U.esc(r.name) + "</span></span>" +
      (u.hidden ? '<span class="duo__marque" title="Masqué de l\'équipe">' +
        U.icone("boite") + "</span>" : "") +
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
            (u.active ? "" : U.etiquette("désactivé")) +
            (u.hidden ? U.etiquette("masqué", "alerte") : "") +
            (u.pin ? U.etiquette("code d'accès") : "") +
          "</div>" +
        "</div>" +
        (peutEditer
          ? '<div class="rang">' +
              U.bouton("Changer de grade", { variante: "principal", icone: "etoile",
                                             action: "grade" }) +
              U.bouton("Modifier la fiche", { variante: "fantome", icone: "crayon",
                                              action: "edit" }) +
            "</div>"
          : "") +
      "</div>" +

      '<div class="eq-corps">' +
        '<div class="grille grille--sm">' +
          U.tuile({ label: "Ancienneté", valeur: anc.texte, pied: anc.sous, icone: "calendrier" }) +
          tuileVive("Service — semaine",
            MNDuty.dur(MNDuty.secondsFor(u.id, MNDuty.weekStart())), "semaine", on) +
          tuileVive("Service — total", MNDuty.dur(MNDuty.secondsFor(u.id)), "total", on) +
          U.tuile({ label: "Formations", valeur: String((u.trainings || []).length),
                    icone: "etoile",
                    pied: (u.trainings || []).length
                      ? u.trainings.slice(0, 2).join(", ") : "aucune" }) +
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
          onClick: (fermer, k) => {
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
            MNStore.recordPromotion(u, roleId, brouillon.roles, moi.pseudo,
              k.querySelector("#p-note").value.trim(), quand.toISOString());
            enregistrer(); fermer();
            U.toast(u.pseudo + " passe " + (vers ? vers.name : roleId) +
              " (au " + quand.toLocaleDateString("fr-FR") + ")", "ok");
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
        U.champ({ id: "f-pseudo", label: "Pseudo", valeur: u.pseudo, max: 40 }) +
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
          onClick: (fermer, k) => {
            const pseudo = k.querySelector("#f-pseudo").value.trim();
            if (pseudo.length < 2) return U.toast("Pseudo trop court", "err");
            if (brouillon.users.some(x => x.id !== u.id &&
                x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return U.toast("Ce pseudo est déjà pris", "err");
            }

            u.pseudo = pseudo;
            u.hiredAt = k.querySelector("#f-emb").value || u.hiredAt;
            u.trainings = formations;
            u.note = k.querySelector("#f-note").value.trim();
            u.active = u.id === moi.uid ? true : k.querySelector("#f-actif").checked;
            u.hidden = k.querySelector("#f-masq").checked;

            /* On garde la personne à l'écran même si elle vient d'être masquée. */
            if (u.hidden && !voirMasques && peutEditer) voirMasques = true;
            enregistrer(); fermer();
            U.toast("Fiche mise à jour", "ok");
          } }
      ]
    });
  }

  /* ---- Recrutement ------------------------------------------------------------------- */

  function recruter() {
    /* Le grade proposé par défaut est le moins doté : on monte quelqu'un,
       on ne le descend pas. */
    const plusBas = brouillon.roles.slice().sort((a, b) => {
      const poids = r => (r.perms.indexOf("admin") !== -1 ? 99 : r.perms.length);
      return poids(a) - poids(b);
    })[0];
    if (!plusBas) return U.toast("Crée d'abord un grade dans l'administration", "err");

    const auj = new Date().toISOString().slice(0, 10);
    const corps = document.createElement("div");
    corps.className = "pile";
    corps.innerHTML =
      '<div class="cols-2">' +
        U.champ({ id: "n-pseudo", label: "Pseudo (sert à se connecter)", max: 40,
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
          onClick: (fermer, k) => {
            const pseudo = k.querySelector("#n-pseudo").value.trim();
            if (pseudo.length < 2) return U.toast("Pseudo trop court", "err");
            if (brouillon.users.some(x => x.pseudo.toLowerCase() === pseudo.toLowerCase())) {
              return U.toast("Ce pseudo est déjà pris", "err");
            }

            const id = MNStore.uniqueId(pseudo, brouillon.users.map(x => x.id));
            const roleId = k.querySelector("#n-role").value;
            const pin = k.querySelector("#n-pin").value.trim();
            const r = brouillon.roles.find(x => x.id === roleId);
            const emb = k.querySelector("#n-emb").value || auj;

            brouillon.users.push({
              id, pseudo, roleId, active: true,
              pin: pin ? MNAuth.hashPin(id, pin) : null,
              createdAt: new Date().toISOString(),
              hiredAt: emb,
              trainings: [], note: "",
              history: [{
                roleId, roleName: r ? r.name : roleId,
                at: new Date(emb + "T12:00:00").toISOString(),
                by: moi.pseudo, note: "Entrée dans l'entreprise"
              }]
            });
            sel = id;
            enregistrer(); fermer();
            U.toast(pseudo + " a rejoint l'équipe", "ok");
          } }
      ]
    });
  }
})();
