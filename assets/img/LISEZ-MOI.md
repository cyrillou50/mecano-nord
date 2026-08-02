# Images personnalisées

Dépose ici tes propres visuels (icônes d'objets, de catégories, de ressources).

**Formats acceptés :** PNG, JPG, WebP, SVG · **Taille conseillée :** 128 × 128 px,
fond transparent.

## Comment les utiliser

1. Ajoute le fichier dans ce dossier (sur GitHub : *Add file → Upload files*).
2. Dans le panneau admin, ouvre l'objet → **Icône** → **Choisir dans la bibliothèque**.
3. Dans le champ **« …ou adresse de l'image »**, écris le chemin :

```
assets/img/turbo.png
```

C'est la méthode recommandée : le fichier de données reste léger et tu peux
remplacer l'image plus tard sans repasser par l'admin.

## Les autres possibilités

- **Importer une image** depuis l'admin : elle est réduite à 128 px et stockée
  directement dans `data/catalog.json`. Pratique et immédiat, mais alourdit le
  fichier — à réserver à quelques icônes.
- **Adresse externe** : `https://exemple.com/mon-image.png` (poids nul pour le
  dépôt, mais l'icône disparaît si le site distant tombe).
- **Emoji** : tape simplement 🔧 dans le champ icône.
- **Bibliothèque intégrée** : une trentaine d'icônes vectorielles déjà prêtes,
  qui prennent automatiquement la couleur du thème.
