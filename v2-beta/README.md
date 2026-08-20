# Mécano Nord — V2 bêta

Refonte de l'interface du site de l'atelier. **La V1 reste la version
officielle** ; celle-ci est un terrain d'essai qu'on fait évoluer sans
toucher à ce qui tourne.

---

## Où se trouve quoi

La V1 n'a **pas** été déplacée : GitHub Pages sert le site depuis la racine du
dépôt, et la mettre dans un sous-dossier aurait changé toutes ses adresses.
La V2 s'installe donc à côté :

```
mecano-nord/              ← V1, en production, intacte
├── index.html …          ← ses pages
├── assets/ data/ serveur/
│
└── v2-beta/              ← V2, servie sur /mecano-nord/v2-beta/
    ├── *.html            ← une page = un fichier HTML + un script
    ├── config/site.js    ← LE fichier de réglages
    ├── styles/
    │   ├── tokens.css        couleurs, espacements, tailles, durées
    │   ├── base.css          remise à zéro, typographie, utilitaires
    │   ├── components.css    tous les composants
    │   └── layout.css        barre latérale, barre du haut, contenu
    ├── components/ui.js  ← bibliothèque de composants (V2UI)
    ├── scripts/
    │   ├── shell.js          squelette : navigation, thème, bandeau bêta
    │   └── pages/            un script par page
    └── services/         ← couche données, copiée de la V1
```

### Lancer la V2

Aucune installation, aucune dépendance, aucune étape de compilation : ce sont
des fichiers statiques.

* **En ligne** — `https://cyrillou50.github.io/mecano-nord/v2-beta/`
* **En local** — il faut un petit serveur, car les pages lisent
  `../data/catalog.json` et `file://` l'interdit :

  ```bash
  # depuis la racine du dépôt
  python -m http.server 8080
  # puis http://localhost:8080/v2-beta/
  ```

### Mode développement

Il n'y en a pas de séparé : on modifie un fichier, on recharge. Pour ne pas
lutter contre le cache du navigateur pendant qu'on travaille, ouvrir les
outils de développement et cocher « Désactiver le cache ».

---

## Ce que la V2 partage avec la V1

| Élément | Où il vit | Conséquence |
|---|---|---|
| Catalogue (`data/catalog.json`) | V1 | Les deux versions voient les mêmes objets |
| Serveur VPS (services, contrats, véhicules, agenda) | VPS | **Ce que la V2 écrit apparaît en V1** |
| Session de connexion | navigateur | Se connecter une fois suffit pour les deux |
| Thème choisi | navigateur | Le même sur les deux versions |

> **Attention.** La V2 n'est pas un bac à sable : elle écrit dans les vraies
> données. Le bandeau orange le rappelle en permanence. Pour la transformer en
> bac à sable plus tard, il suffira de faire pointer `MN_CONFIG` et l'adresse
> du serveur ailleurs, dans `config/site.js`.

---

## Modifier le design

Presque tout se règle dans **`styles/tokens.css`**. Rien d'autre ne contient
de couleur, de taille ou de durée écrite en dur.

```css
:root {
  --c-action: var(--pink);   /* la couleur des actions          */
  --e-4: 16px;               /* l'espacement de référence       */
  --r-3: 14px;               /* l'arrondi des cartes            */
  --m-vif: .12s;             /* la durée des transitions courtes */
}
```

Les jetons sont nommés par leur **rôle** (`--c-action`, `--c-carte`,
`--c-erreur`) et non par leur couleur : repeindre le site ne demande pas de
relire chaque composant.

### Thèmes

Le moteur de thèmes est celui de la V1 (`services/theme.js`) : sept thèmes,
dont un clair, plus la personnalisation libre. Il écrit ses variables sur
`<html>`, et `tokens.css` s'appuie dessus — la V2 en hérite sans une ligne de
plus. Le bouton palette en haut à droite ouvre le choix.

Pour ajouter un thème : `services/theme.js`, table `THEMES`.

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
| État vide | `V2UI.vide({ icone, titre, texte })` |
| Message | `V2UI.alerte({ ton, titre, texte })` |
| Chargement | `V2UI.squelette(3)` |
| Icône | `V2UI.icone("vehicule")` |

Changer l'allure d'un bouton **partout** : le bloc `.btn` de
`components.css`. Son contenu : la fonction `bouton()` de `ui.js`.

---

## Ajouter une page

Trois gestes.

**1. Déclarer l'entrée** dans `config/site.js` :

```js
{ id: "stock", nom: "Stock", href: "stock.html", icone: "boite",
  perm: ["items"] }        // `perm` absent = page ouverte à tous
```

**2. Copier une page HTML existante** (`facturation.html` fait un bon
modèle) et changer la dernière ligne de script :

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

Le squelette s'occupe du reste : barre latérale, droits, thème, bandeau bêta,
tiroir mobile, connexion.

### Boutons dans la barre du haut

```js
V2Shell.actions(V2UI.bouton("Historique", { variante: "fantome", action: "hist" }));
```

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

Les données passent par la couche **`services/`**, reprise telle quelle de la
V1 — même comportement, mêmes garde-fous :

| Module | Rôle |
|---|---|
| `MNStore` | catalogue, objets, ressources, contrats, panier, bons de travail |
| `MNAuth` | session et permissions (`MNAuth.can`, `canAny`) |
| `MNDuty` | pointage, congés, historique de service |
| `MNParc` | parc automobile |
| `MNRegistre` | contrats |
| `MNAgenda` | évènements du calendrier |
| `MNGitHub` | publication du catalogue |
| `MNWebhook` | envois Discord |
| `MNImagier` | bibliothèque d'images |
| `MNTheme` | thèmes |

Une permission nouvelle se déclare dans `services/config.js` (`MN_PERMS`) —
c'est le **même fichier que la V1**, donc à copier des deux côtés tant que les
deux versions coexistent.

---

## État de la reprise

| Page | État |
|---|---|
| Tableau de bord | ✅ fait — page nouvelle, absente de la V1 |
| Facturation | ✅ fait — catalogue, panier, bons, historique |
| Véhicules | ✅ fait — parc, fiches, propositions, validation |
| Calendrier | ✅ fait — grille, évènements, congés ; liste sur téléphone |
| Contrats | ✅ fait — registre, troc à plusieurs ressources, contrat PDF |
| Service | ✅ fait — pointage, congés, corrections d’horaires |
| Fiches équipe | ✅ fait — ancienneté, carrière, formations, historique |
| Administration | ✅ fait — les onze onglets |

**La reprise est complète.** Chaque page de la V1 a son équivalent, avec les
mêmes fonctions et les mêmes garde-fous. Il reste à l'user à l'usage : c'est
le rôle de la bêta.

La V1 demeure la version officielle jusqu'à demande explicite — voir
« Passer de bêta à production » plus bas.

---

## Construire la version finale

Il n'y a rien à construire : ce sont des fichiers statiques, servis tels
quels. Pas de `npm`, pas de compilation, pas de dépendance à mettre à jour.

---

## Passer de bêta à production

Le jour venu, dans cet ordre :

1. **Couper le bandeau** — `config/site.js`, `V2.VERSION.beta = false`.
2. **Vérifier la reprise** — toutes les pages du tableau ci-dessus en ✅.
3. **Déplacer les fichiers** de `v2-beta/` vers la racine, en écrasant la V1
   après en avoir fait une branche de secours :

   ```bash
   git switch -c v1-archive && git push -u origin v1-archive
   git switch main
   ```

4. **Corriger les chemins** de `config/site.js` — la V2 ne sera plus dans un
   sous-dossier :

   ```js
   MN_CONFIG.catalogUrl = "data/catalog.json";   // sans « ../ »
   MN_CONFIG.dutyFile   = "data/duty.json";
   MN_CONFIG.imgDir     = "assets/img";
   ```

5. **Supprimer les liens « Revenir au site officiel »** — ils n'auront plus
   de destination.

Tant que ces étapes ne sont pas demandées explicitement, la V1 reste la
version officielle et ne doit pas être touchée.
