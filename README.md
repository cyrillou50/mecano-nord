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

Le tableau partagé vit sur le serveur de l'atelier. Sans serveur configuré, le
pointage part sur Discord et reste local — le site le signale.

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

Sans serveur, personne n'apparaît dans le tableau de service. Pour que ce soit
automatique **sans que personne n'installe quoi que ce soit**, trois options, à
régler dans **Admin → Mise en ligne → Pointage de l'équipe** :

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
le HTTPS, réglages du site). Compte 20 minutes. Ce dossier ne fait pas partie
du dépôt : le serveur tourne sur le VPS, pas sur la page, et il n'a rien à
faire dans un site statique. Demande-le à qui tient l'atelier.

**Option 3 — Relais Cloudflare**, si tu n'as ni VPS ni envie de Firebase.

⚠️ Ne distribue jamais de jeton GitHub « d'équipe » pour contourner ça : il
donne le droit d'écrire sur **tout** le dépôt. Le site ne sait d'ailleurs plus
en utiliser un — c'est voulu.

---

**Pour les webhooks, la vraie parade est le relais**, et il règle deux
problèmes d'un coup.

Le fichier `relais.js` à la racine est prêt à déployer sur Cloudflare Workers
(gratuit, ~10 minutes, sans carte bancaire) — les instructions sont en tête du
fichier. Une fois en place, tu colles son adresse dans **Admin → Discord** :

1. **Les webhooks Discord** ne sont plus dans le dépôt : c'est le relais qui
   les connaît.
2. **Le pointage devient automatique pour toute l'équipe.** Sans relais ni
   serveur, personne n'apparaît dans le tableau de service. Avec, c'est lui
   qui écrit, et **personne n'a rien à installer**.

⚠️ Ne distribue jamais de jeton GitHub « d'équipe » pour contourner ça : il
donne le droit d'écrire sur **tout** le dépôt. Le relais, lui, ne peut toucher
qu'au fichier de pointage.

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
2. **Tes images** — le sélecteur liste **automatiquement** celles du serveur,
   plus le contenu de `assets/img/` d'après `assets/img/index.json`. Un clic
   sur une vignette suffit.
3. **Ajouter une image** — le fichier est recadré (marges transparentes
   supprimées), centré dans un carré de 128 px, puis **déposé sur le serveur**
   et référencé par son nom. Sans serveur, il est intégré au fichier de
   données à la place.
4. **Un emoji** ou une **adresse externe** (`https://…`).

Toutes les images sont donc au même gabarit quelle que soit leur taille
d'origine — pas de retouche à faire avant.

Le **logo** se règle dans **Admin → Le site**. Sans logo, ce sont les initiales
du nom de l'entreprise qui s'affichent. Il apparaît dans l'entête, sur l'écran
de connexion et dans l'onglet du navigateur.

---

## 5. La mise en ligne : rien à faire

**Il n'y a pas de bouton « Publier », et personne n'a de clé à donner.**

Tu modifies quelque chose, c'est enregistré, et c'est en ligne quelques
secondes plus tard. Depuis n'importe quelle page, pour n'importe qui : si tu as
eu le droit de le changer, tu as le droit de le voir en ligne. Il n'y a pas de
permission « publier » à accorder en plus — elle ne servait qu'à décider qui
détenait la clé, et il n'y a plus de clé à détenir côté site.

### Comment ça marche

Le **serveur de l'atelier** garde les données et le jeton GitHub. Le site lui
poste les modifications ; il écrit. Le jeton vit dans son service systemd
(`GH_TOKEN`), jamais dans le navigateur de qui que ce soit et jamais dans le
dépôt — le catalogue est public, l'y mettre reviendrait à le publier.

C'est aussi ce qui évite les commits inutiles : le catalogue est **hébergé par
le serveur**, où l'écriture est immédiate. Le dépôt ne reçoit plus qu'une copie
d'amorçage, réécrite le jour où l'adresse du serveur change. Un commit ferait
reconstruire le site entier pour un numéro de téléphone corrigé.

L'installation du serveur est décrite dans **`serveur/README.md`**, gardé hors
du dépôt avec le serveur lui-même (Node, systemd, Caddy pour le HTTPS).
Compte 20 minutes, une fois pour toutes.

### Sans serveur

Rien ne part, et le site le dit clairement plutôt que de réclamer un jeton.
L'onglet **Mise en ligne** propose alors « Télécharger le fichier » : tu
remplaces `data/catalog.json` à la main sur GitHub.

### Les images aussi

Quand tu importes une image depuis le sélecteur d'icônes, elle est **déposée
sur le serveur** et référencée par son nom, pas recopiée dans les données.
Sans serveur, elle est simplement intégrée au fichier de données.

---

## 6. Utilisation au quotidien

- Onglets de catégories pour naviguer, **clic sur une carte** = +1
- **Clic droit** sur une carte = −1 · **Maj + clic** = ±5
- Bouton **Coûts** : affiche les ressources directement sur les cartes
- La barre du bas additionne les ressources de tout le panier
- **Sauvegarder le devis** → historique local + bouton « copier pour Discord »
- La poignée au-dessus de la barre du bas la replie

---

## 7. Pointer depuis Discord

Chacun peut prendre et quitter son service depuis Discord, avec `/service`.
Il faut d'abord relier les deux comptes, **une fois pour toutes** :

1. Dans Discord, tape **`/lier`**. Le bot répond, à toi seul, avec un code de
   six lettres valable dix minutes.
2. Sur le site, clique sur ton nom en bas à gauche → **Lier mon Discord**, et
   colle le code.

C'est fait. Ensuite, `/service` suffit :

| | |
|---|---|
| `/service action:Prendre mon service` | comme le bouton *Pointer* du site |
| `/service action:Quitter mon service` | le temps est compté comme d'habitude |

Un pointage fait depuis Discord est un pointage comme un autre : il apparaît
sur la page Service, compte dans les heures de la semaine et dans le
récapitulatif du lundi.

**Le code passe par Discord, jamais par quelqu'un d'autre.** C'est ce qui
garantit que la fiche liée est bien la tienne — et ça marche même pour un
apprenti, qui n'a accès à aucune fiche.

Pour défaire le lien : même menu → **Mon compte Discord** → *Délier*. Un
responsable peut aussi le retirer depuis la fiche, si quelqu'un part.

> Le bot ne prévient pas le salon de service quand on pointe depuis Discord :
> c'est le site qui compose ces messages-là. La confirmation n'est visible que
> de toi.

---

## 8. Fermer le site pour maintenance

Pour travailler tranquille — refaire le catalogue, réorganiser les grades —
sans que l'équipe utilise le site pendant ce temps.

**Qui peut le faire :** le grade **tout en haut de la liste** des grades
(aujourd'hui *Créateur du Site*). Pas le droit « admin » : la Patronne l'a
aussi, et elle ne peut pas fermer le site.

**Fermer :** menu en bas de la barre latérale (ton nom) → **Mettre en
maintenance**. Tu peux laisser un message, par exemple « retour vers 18 h ».

**Pendant ce temps :**

- tout le monde voit un écran de maintenance, avec ton message — sur la
  nouvelle version **et** sur l'ancienne (`/v1/`) ;
- les pages déjà ouvertes sont coupées **dans la minute** ;
- toi, tu gardes le site, avec un bandeau rouge en haut pour ne pas oublier
  que la porte est fermée ;
- si ta session a expiré, le lien discret **Accès créateur** sous l'écran de
  maintenance te laisse te reconnecter.

**Rouvrir :** le bouton **Rouvrir le site** du bandeau rouge (ou le même menu).
Les écrans de maintenance restés ouverts reviennent d'eux-mêmes dans la minute.

> Ce que la maintenance ne coupe pas : le bot Discord, le récapitulatif du
> dimanche et le serveur lui-même continuent de tourner. Les gens en service au
> moment de la fermeture le restent — ils ne peuvent simplement pas se dépointer
> sur le site avant la réouverture.
>
> Comme la connexion par nom, c'est une barrière d'usage et non un coffre-fort :
> quelqu'un qui sait ouvrir la console du navigateur pourrait la contourner.

---

## Structure des fichiers

```
index.html              tableau de bord — la page d'accueil
facturation.html        les devis
admin.html              panneau administratif
  … une page = un fichier HTML + un script

config/site.js          navigation, chemins, version
styles/                 tokens · base · components · layout
components/ui.js        les briques d'interface
scripts/                shell.js (le cadre) + pages/ (une par page)
services/               données : catalogue, connexion, pointage, Discord…

data/catalog.json       ← toutes les données du site (publié via l'admin)
data/duty.json          le tableau de service
assets/img/             tes propres visuels (PNG, SVG...)

v1/                     l'ancienne interface, gardée en état de marche
.nojekyll               indispensable pour GitHub Pages
```

### L'ancienne interface

Le site a changé d'allure ; l'ancienne version n'a pas été jetée. Elle reste
joignable en ajoutant `/v1/` à l'adresse — par exemple
`…github.io/mecano-nord/v1/` — et travaille sur **les mêmes données** : mêmes
employés, mêmes devis, même pointage. Ce n'est pas une copie figée, c'est le
même atelier vu autrement.

Elle est là au cas où : si quelque chose coince en pleine session, l'équipe a
une adresse qui répond tout de suite. **Aucun bouton du site n'y mène** — c'est
une roue de secours, pas une destination : on y va en tapant l'adresse.

Pour qui veut modifier le code, l'intérieur est décrit dans
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## À savoir

Le site est **entièrement statique** : il n'y a pas de serveur ni de base de
données. La connexion par pseudo organise très bien les droits de l'équipe et
bloque les curieux, mais quelqu'un qui sait ouvrir la console du navigateur
peut la contourner. Le fichier `data/catalog.json` est public : n'y mets rien
de réellement confidentiel.

Les devis enregistrés restent dans le navigateur de chaque mécano
(ils ne sont pas partagés) — d'où le bouton « copier pour Discord ».
