# Mécano Nord — Day of Decay

Site de facturation d'atelier : on coche les prestations, le site calcule les
ressources à sortir du stock, et on enregistre un devis prêt à coller
sur Discord.

Tout se gère depuis le site lui-même (panneau admin) : objets, catégories,
ressources, employés et permissions. Aucun fichier à rouvrir au quotidien.

---

## 1. Mettre le site en ligne (GitHub Pages)

Aucun logiciel à installer, tout se fait depuis le navigateur.

1. Crée un compte sur **github.com** si tu n'en as pas.
2. Clique sur **+** en haut à droite → **New repository**.
   - *Repository name* : `mecano-nord` (ou ce que tu veux)
   - Coche **Public**
   - **Create repository**
3. Sur la page du dépôt vide : **uploading an existing file**.
4. Glisse-dépose **tout le contenu** de ce dossier
   (`index.html`, `admin.html`, le dossier `assets`, le dossier `data`,
   le fichier `.nojekyll`) puis **Commit changes**.
5. Onglet **Settings** → **Pages** (menu de gauche) :
   - *Source* : **Deploy from a branch**
   - *Branch* : **main** + dossier **/ (root)** → **Save**
6. Attends une minute, puis ouvre :
   `https://TON-PSEUDO.github.io/mecano-nord/`

> Le fichier `.nojekyll` est important : sans lui GitHub ignore certains
> fichiers. Il est déjà présent, ne le supprime pas.

---

## 2. Première connexion

Le site demande un **pseudo** pour entrer — c'est la seule chose à retenir.

La toute première personne qui se connecte devient automatiquement **patron**
(tous les droits). Va ensuite dans **Admin → Employés** pour ajouter ton équipe.

⚠️ Cette première connexion crée un brouillon local. **Publie-le tout de suite**
(voir plus bas), sinon tes collègues ne verront pas ton compte.

---

## 3. Le panneau admin

| Onglet | À quoi ça sert |
|---|---|
| **Objets** | Prestations, coût en ressources, **quantité maximum par devis** |
| **Catégories** | Les onglets affichés sur la page de facturation |
| **Ressources** | Plastique, ferraille, charbon… avec icône et couleur |
| **Employés** | Qui peut se connecter, et avec quel rôle |
| **Rôles** | Les droits, par rôle : nom, couleur, permissions |
| **Discord** | Adresses des webhooks (devis, services) |
| **Le site** | Nom de l'entreprise, slogan, **logo**, réglages de connexion |
| **Publier** | Envoyer les modifications en ligne |

### Rôles et permissions

Les droits sont portés par le **rôle**, pas par la personne : tu crées
« Mécano », « Chef d'atelier », « Patron »… avec une couleur et des
permissions, puis tu attribues un rôle à chaque employé. Changer les droits
d'un rôle les change pour tout le monde d'un coup.

| Clé | Ce que ça autorise |
|---|---|
| `bt` | Utiliser la facturation et enregistrer des devis |
| `duty` | Prendre et quitter son service |
| `duty_view` | Voir qui est en service et l'historique de l'équipe |
| `items` | Gérer objets, catégories, ressources et leurs coûts |
| `users` | Gérer les employés et les rôles |
| `publish` | Envoyer les modifications sur le site public |
| `admin` | Patron — implique automatiquement tout le reste |

Un employé peut avoir un **code d'accès** (facultatif). Recommandé pour les
comptes qui gèrent le catalogue ou l'équipe.

Deux garde-fous : tu ne peux pas te désactiver toi-même, ni prendre (ou
modifier) un rôle qui te retirerait la gestion de l'équipe.

---

## 3 bis. Service et Discord

### Prise de service

La page **Service** permet de pointer en arrivant et en partant. Les personnes
ayant `duty_view` voient le tableau des présents, le temps cumulé sur 7 jours
et les derniers pointages, et peuvent clôturer le service de quelqu'un qui a
oublié.

Le tableau partagé vit dans `data/duty.json`. Il n'est mis à jour pour toute
l'équipe que par les personnes ayant un **jeton GitHub** sur leur appareil ;
pour les autres, le pointage part sur Discord et le site le signale.

### Webhooks Discord

Dans **Admin → Discord**, deux adresses : une pour les devis, une
pour les services. Un bouton **Envoyer un test** valide la configuration.

Tu peux aussi donner au bot un **logo** et un **nom** propres (section
« Apparence du bot »). Le logo doit être une image **déjà publiée en ligne** :
c'est Discord qui va la chercher.

### Confidentialité des webhooks

Les adresses sont **brouillées** dans `data/catalog.json` : on ne les trouve
plus en cherchant « discord.com » dedans.

⚠️ **Ce n'est pas une protection, juste un ralentisseur.** Le site doit
pouvoir lire l'adresse pour envoyer les messages, donc quelqu'un de motivé
peut la retrouver. Même chose pour l'inspecteur du navigateur : il est
impossible de le bloquer, et tout le code d'un site statique est public par
construction.

### Pointage automatique pour toute l'équipe

Par défaut, seuls les employés ayant un jeton GitHub apparaissent dans le
tableau de service. Pour que ce soit automatique **sans que personne
n'installe quoi que ce soit**, deux options, à régler dans
**Admin → Publier → Pointage de l'équipe** :

**Option 1 — Base partagée (le plus simple, ~5 min, aucun code à déployer)**

1. `console.firebase.google.com` → **Créer un projet** (refuse Analytics)
2. **Créer** → **Realtime Database** → région **Europe** → mode verrouillé
3. Onglet **Règles**, coller ceci puis **Publier** :
   ```json
   {
     "rules": {
       "duty": { ".read": true, ".write": true },
       "$autre": { ".read": false, ".write": false }
     }
   }
   ```
4. Copier l'adresse de la base, **ajouter `/duty` à la fin**, coller dans le
   champ prévu, **Tester**, enregistrer, publier.

Ces règles n'ouvrent que la clé `duty` : le catalogue, les employés et le
dépôt restent hors d'atteinte. Au pire, quelqu'un de motivé pourrait salir le
tableau de pointage.

**Option 2 — Ton VPS (le mieux si tu en as un)**

Un petit serveur Node sans aucune dépendance, à copier sur ton VPS. Il gère le
pointage *et* les webhooks, garde tes données chez toi avec sauvegardes
automatiques, et ne laisse plus rien de sensible dans le dépôt.

Le guide pas à pas est dans **`serveur/README.md`** (Node, systemd, Caddy pour
le HTTPS, réglages du site). Compte 20 minutes.

**Option 3 — Relais Cloudflare**, si tu n'as ni VPS ni envie de Firebase.

⚠️ Ne partage jamais un jeton GitHub « d'équipe » pour contourner ça : il
donne le droit d'écrire sur **tout** le dépôt.

---

**Pour les webhooks, la vraie parade est le relais**, et il règle deux
problèmes d'un coup.

Le fichier `relais.js` à la racine est prêt à déployer sur Cloudflare Workers
(gratuit, ~10 minutes, sans carte bancaire) — les instructions sont en tête du
fichier. Une fois en place, tu colles son adresse dans **Admin → Discord** :

1. **Les webhooks Discord** ne sont plus dans le dépôt : c'est le relais qui
   les connaît.
2. **Le pointage devient automatique pour toute l'équipe.** Sans relais, seuls
   les employés ayant un jeton GitHub apparaissent dans le tableau de service.
   Avec lui, c'est le relais qui écrit, et **personne n'a rien à installer**.

⚠️ Ne partage jamais un jeton GitHub « d'équipe » pour contourner ça : il donne
le droit d'écrire sur **tout** le dépôt. Le relais, lui, ne peut toucher qu'au
fichier de pointage.

En attendant, utilise un salon dédié sans enjeu, et régénère le webhook depuis
Discord au moindre doute.

### Limiter les quantités

Dans la fiche d'un objet, **Quantité maximum par devis** : `0` = illimité, `2`
empêche d'en mettre plus de deux sur un même devis. La carte affiche
un repère « max 2 » et le bouton **+** se désactive une fois la limite atteinte.

Sur la page de facturation, la quantité est un **champ de saisie** : clique
dessus et tape le nombre directement (les flèches ↑ ↓ marchent aussi, Maj
pour aller de 5 en 5).

---

## 4. Icônes, images et logo

Partout où il y a une icône (objet, catégorie, ressource, logo de l'atelier),
le bouton **Choisir une icône** propose quatre possibilités :

1. **Bibliothèque intégrée** — une trentaine d'icônes vectorielles qui prennent
   la couleur du thème.
2. **Tes images** — le sélecteur liste **automatiquement** le contenu de
   `assets/img/` (lu dans le dépôt si ton jeton GitHub est configuré, sinon
   d'après `assets/img/index.json`). Un clic sur une vignette suffit.
3. **Ajouter une image** — le fichier est recadré (marges transparentes
   supprimées), centré dans un carré de 128 px, puis **déposé dans
   `assets/img/` du dépôt** et référencé par son chemin. Sans jeton, il est
   intégré au fichier de données à la place.
4. **Un emoji** ou une **adresse externe** (`https://…`).

Toutes les images sont donc au même gabarit quelle que soit leur taille
d'origine — pas de retouche à faire avant.

Le **logo** se règle dans **Admin → Le site**. Sans logo, ce sont les initiales
du nom de l'entreprise qui s'affichent. Il apparaît dans l'entête, sur l'écran
de connexion et dans l'onglet du navigateur.

---

## 5. Publier les modifications en un clic

Par défaut tes modifications restent dans **ton** navigateur. Pour que toute
l'équipe les voie, il faut les publier. Configuration à faire **une seule fois** :

1. Sur github.com : ton avatar → **Settings** → tout en bas
   **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**
2. *Repository access* : **Only select repositories** → choisis le dépôt du site
3. *Permissions → Repository permissions* : **Contents** = **Read and write**
   (rien d'autre)
4. Copie le jeton, colle-le dans **Admin → Publier**, clique **Vérifier**

Ensuite, un clic sur **Publier** suffit : le site public est à jour environ
une minute plus tard.

### Publication automatique

Dans **Admin → Publier**, active **« Envoyer sur GitHub à chaque modification »** :
tu n'as plus rien à cliquer. Quelques secondes après ta dernière modification,
le catalogue part tout seul. Les changements rapprochés sont regroupés en un
seul envoi pour ne pas créer un commit par clic.

Le réglage est propre à chaque navigateur, et **Publier maintenant** force
toujours un envoi immédiat.

### Les images aussi

Quand tu importes une image depuis le sélecteur d'icônes, elle est **déposée
directement dans `assets/img/` du dépôt** (et référencée par son chemin, pas
recopiée dans les données). Sans jeton configuré, elle est simplement intégrée
au fichier de données.

Le jeton reste **dans ton navigateur uniquement**, il n'est jamais écrit dans
le dépôt. Chaque personne qui publie met le sien.

> Tu ne veux pas de jeton ? L'onglet **Publier** propose aussi
> « Télécharger le fichier » : tu remplaces `data/catalog.json` à la main
> sur GitHub.

---

## 6. Utilisation au quotidien

- Onglets de catégories pour naviguer, **clic sur une carte** = +1
- **Clic droit** sur une carte = −1 · **Maj + clic** = ±5
- Bouton **Coûts** : affiche les ressources directement sur les cartes
- La barre du bas additionne les ressources de tout le panier
- **Sauvegarder le devis** → historique local + bouton « copier pour Discord »
- La poignée au-dessus de la barre du bas la replie

---

## Structure des fichiers

```
index.html              page de facturation
admin.html              panneau administratif
data/catalog.json       ← toutes les données du site (publié via l'admin)
assets/img/             tes propres visuels (PNG, SVG...)
assets/css/             base.css · app.css · admin.css
assets/js/
  config.js             réglages de secours (rarement à toucher)
  icons.js              bibliothèque d'icônes vectorielles
  catalog.seed.js       copie de secours du catalogue (mode hors-ligne)
  store.js              chargement / brouillon / calculs
  auth.js               connexion pseudo + permissions
  github.js             publication automatique
  ui.js                 briques d'interface communes
  app.js                page de facturation
  admin.js              panneau admin
.nojekyll               indispensable pour GitHub Pages
```

---

## À savoir

Le site est **entièrement statique** : il n'y a pas de serveur ni de base de
données. La connexion par pseudo organise très bien les droits de l'équipe et
bloque les curieux, mais quelqu'un qui sait ouvrir la console du navigateur
peut la contourner. Le fichier `data/catalog.json` est public : n'y mets rien
de réellement confidentiel.

Les devis enregistrés restent dans le navigateur de chaque mécano
(ils ne sont pas partagés) — d'où le bouton « copier pour Discord ».
