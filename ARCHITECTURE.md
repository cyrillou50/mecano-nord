# Mécano Nord — l'intérieur du site

Ce document s'adresse à qui doit **modifier le code**. Pour se servir du site
ou le mettre en ligne, voir [README.md](README.md).

Site statique, sans dépendance, sans étape de compilation : ce sont des
fichiers que le navigateur lit tels quels.

---

## Où se trouve quoi

```
mecano-nord/
├── index.html …          les pages du site (une page = un HTML + un script)
├── config/site.js        LE fichier de réglages : navigation, chemins, version
├── styles/
│   ├── tokens.css        couleurs, espacements, tailles, durées
│   ├── base.css          remise à zéro, typographie, utilitaires
│   ├── components.css    tous les composants
│   └── layout.css        barre latérale, barre du haut, contenu
├── components/ui.js      bibliothèque de composants (V2UI)
├── scripts/
│   ├── shell.js          squelette : navigation, connexion, thème, recherche
│   └── pages/            un script par page
├── services/             couche données (MNStore, MNAuth, MNDuty…)
│
├── assets/               images, et les CSS/JS de l'ancienne version
├── data/                 catalog.json, duty.json
│
└── v1/                   l'ancienne interface, gardée en état de marche
```

### L'ancienne version

`/v1/` n'est pas une archive morte : c'est la même application, sur les
**mêmes données**. Un seul `data/catalog.json`, un seul tableau de service,
les mêmes employés. Elle est là pour qu'on puisse y revenir tout de suite si
la nouvelle interface pose problème en pleine session, sans toucher à git.

Ses pages lisent `v1/chemins.js`, qui remonte les chemins d'un cran
(`../data/…`, `../assets/img`) avant que `config.js` ne complète le reste.

---

## Des fichiers partagés, à l'octet près

Plusieurs modules de `services/` sont **identiques** à leur jumeau dans
`assets/js/`, utilisé par `/v1/`. Ce n'est pas un hasard : les deux interfaces
doivent se comporter exactement pareil sur les données.

| Fichier | Jumeau |
|---|---|
| `services/store.js` | `assets/js/store.js` |
| `services/icons.js` | `assets/js/icons.js` |
| `services/webhook.js` | `assets/js/webhook.js` |
| `services/editeur.js` | `assets/js/editeur.js` |
| `services/duty.js` | `assets/js/duty.js` — à une ligne près, le chemin du fichier |

**Toucher à l'un, c'est toucher à l'autre.** Le vérifier :

```sh
diff assets/js/store.js services/store.js     # doit ne rien dire
```

---

## Modifier le design

Presque tout se règle dans **`styles/tokens.css`**. Rien d'autre ne contient
de couleur, de taille ou de durée écrite en dur.

```css
:root {
  --c-action: var(--pink);   /* la couleur des actions           */
  --e-4: 16px;               /* l'espacement de référence        */
  --r-3: 14px;               /* l'arrondi des cartes             */
  --m-vif: .12s;             /* la durée des transitions courtes */
}
```

Les jetons sont nommés par leur **rôle** (`--c-action`, `--c-carte`,
`--c-erreur`) et non par leur couleur : repeindre le site ne demande pas de
relire chaque composant.

### Une icône a toujours une taille

Un `<svg>` qui ne porte qu'un `viewBox`, sans largeur, **s'étale jusqu'à
remplir son conteneur**. Chaque endroit qui affiche une icône lui donne donc
la sienne (`.btn svg`, `.tuile__label svg`, `.onglet svg`…). En ajouter une
dans un nouveau contexte demande la même ligne, sinon elle prendra tout
l'écran.

### Thèmes

`services/theme.js` : sept thèmes dont un clair, plus la personnalisation
libre. Il écrit ses variables sur `<html>`, et `tokens.css` s'appuie dessus.
Le bouton palette en haut à droite ouvre le choix. Pour en ajouter un : table
`THEMES`.

---

## Les composants

Tout est dans **`components/ui.js`** (objet global `V2UI`) et
**`styles/components.css`**. Une page n'écrit jamais de balisage à la main.

| Composant | Appel |
|---|---|
| Bouton | `V2UI.bouton("Enregistrer", { variante: "principal", icone: "check" })` |
| Carte | `V2UI.carte({ titre, corps, pied, actions })` |
| Tuile de chiffre | `V2UI.tuile({ label, valeur, pied, ton, icone })` |
| Étiquette | `V2UI.etiquette("En cours", "succes")` |
| Champ | `V2UI.champ({ id, label, type, valeur, aide })` |
| Tableau | `V2UI.tableau(colonnes, lignes)` |
| Modale | `V2UI.modale({ titre, corps, actions })` |
| Confirmation | `await V2UI.confirmer({ titre, message, danger: true })` |
| Notification | `V2UI.toast("Enregistré", "ok")` |
| Menu | `V2UI.menu(ancre, items)` |
| État vide | `V2UI.vide({ icone, titre, texte, action })` |
| Message | `V2UI.alerte({ ton, titre, texte })` |
| Chargement | `V2UI.squelette(3)` |
| Icône | `V2UI.icone("vehicule")` |

Changer l'allure d'un bouton **partout** : le bloc `.btn` de
`components.css`. Son contenu : la fonction `bouton()` de `ui.js`.

> Un écran vide porte sa porte de sortie. `vide()` accepte un `action` : une
> recherche qui ne donne rien propose de l'effacer, une liste vide propose de
> la remplir. Sans ça, on laisse les gens dans un cul-de-sac.

---

## Ajouter une page

Trois gestes.

**1. Déclarer l'entrée** dans `config/site.js` :

```js
{ id: "stock", nom: "Stock", href: "stock.html", icone: "boite",
  perm: ["items"] }        // `perm` absent = page ouverte à tous
```

**2. Copier une page HTML existante** (`facturation.html` fait un bon modèle)
et changer la dernière ligne de script :

```html
<script src="scripts/pages/stock.js"></script>
```

**3. Écrire le script** :

```js
V2Shell.demarrer({
  page: "stock",              // le même `id` que dans la navigation
  titre: "Stock",
  pret: function (session, hote) {
    if (!V2Shell.peut("items", "admin")) return V2Shell.refuser(hote, "le stock");
    hote.innerHTML = V2UI.carte({ titre: "Stock", corps: "…" });
  }
});
```

Le squelette s'occupe du reste : connexion, barre latérale, droits, thème,
recherche, tiroir mobile.

### Boutons dans la barre du haut

```js
V2Shell.actions(V2UI.bouton("Historique", { variante: "fantome", action: "hist" }));
```

Elle est déjà chargée : hamburger, titre, boutons de la page, sélecteur de
garage, avertissements, recherche, livret, apparence. Sur téléphone elle passe
à la ligne — y ajouter un bouton demande de vérifier qu'aucune page ne déborde
en 390 px.

### Reprendre le terme de la recherche globale

Une page qui sait filtrer doit accepter le terme que la recherche lui passe :

```js
filtre = V2Shell.motCherche() || filtre;
```

`motCherche()` lit `?q=` **et l'efface de l'adresse** : un rafraîchissement ne
doit pas refiltrer ce qu'on avait fini par élargir.

### Pages qui modifient le catalogue

Le catalogue ne s'écrit pas en direct : on modifie une copie
(`MNStore.clone`), on l'enregistre (`MNStore.saveDraft`), et un responsable
publie. La page appelle simplement :

```js
V2Shell.brouillon(dessiner);   // dessiner() sera rappelé après publication
```

Le bandeau « modifications non publiées » apparaît alors sous la barre du
haut, avec le bouton *Publier* si la personne en a le droit. À rappeler après
chaque enregistrement, pour qu'il s'allume et s'éteigne au bon moment.

---

## Ajouter une fonctionnalité

Les données passent par la couche **`services/`** :

| Module | Rôle |
|---|---|
| `MNStore` | catalogue, objets, ressources, contrats, avertissements, panier, bons |
| `MNAuth` | session et permissions (`MNAuth.can`, `canAny`) |
| `MNDuty` | pointage, congés, historique de service, heures de la semaine |
| `MNParc` | parc automobile |
| `MNRegistre` | contrats |
| `MNAgenda` | évènements du calendrier |
| `MNGitHub` | publication du catalogue |
| `MNWebhook` | envois Discord |
| `MNImagier` | bibliothèque d'images |
| `MNTheme` | thèmes |

Une permission nouvelle se déclare dans `services/config.js` (`MN_PERMS`) —
fichier jumeau de `assets/js/config.js`, à tenir en phase.

### Une règle vit à un seul endroit

Quand deux écrans répondent à la même question, la réponse se calcule **une
fois**, dans le service, pas deux fois dans les pages. Exemple :
`MNDuty.etatSemaine(uid, objectif)` dit où quelqu'un en est de ses heures, avec
ses exemptions (congés posés, arrivée en cours de semaine, employé dispensé).
La page Service et le tableau de bord la lisent tous les deux. Recopier ce
raisonnement, c'est se garantir deux verdicts pour une seule question.

De même, le texte du récapitulatif hebdomadaire est fabriqué **par le
serveur** : le message du dimanche et la commande Discord `/recap` ne peuvent
pas diverger.

---

## Version et bandeau d'essai

`config/site.js` :

```js
V2.VERSION = { numero: "2.0.0", beta: false, donneesPartagees: false };
```

Passer `beta` à `true` rallume le bandeau et la pastille « Version d'essai ».
C'est le mécanisme qui a servi pendant la refonte ; il reste en place pour la
prochaine.

---

## Vérifier son travail

Il n'y a pas de suite de tests dans le dépôt : les vérifications se font au
navigateur, en chargeant les pages et en regardant la console. Ce qui mérite
un coup d'œil après une modification de fond :

* les 11 pages s'ouvrent, sans erreur en console ;
* aucune image cassée (les icônes du catalogue passent par le serveur) ;
* aucun débordement horizontal en 390 px de large ;
* les fichiers jumeaux sont restés identiques (voir plus haut) ;
* `/v1/` répond toujours.
