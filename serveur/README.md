# Installation sur ton VPS

**Ton site reste sur GitHub Pages.** Le VPS ne l'héberge pas : il lui sert de
moteur, pour que tout se fasse depuis le site.

Une fois en place :

- tes employés **pointent leur service** sans rien installer,
- les responsables **publient** depuis le panneau admin **sans jeton GitHub** :
  c'est le serveur qui détient le jeton et écrit sur le dépôt,
- les adresses de webhook Discord ne sont plus dans le dépôt public,
- les données de pointage sont chez toi, avec sauvegardes automatiques.

Côté site, tu n'auras **qu'une seule adresse à renseigner** : le reste en
découle.

Le serveur n'a **aucune dépendance** : pas de `npm install`, rien à
télécharger.

---

## Ce qu'il te faut

Un VPS sous Debian ou Ubuntu, avec un accès SSH root. Et **une décision à
prendre** avant de commencer.

### Pourquoi une IP seule ne suffit pas

Ton site est en `https://` sur GitHub Pages. Un navigateur **refuse** qu'une
page HTTPS appelle une adresse en `http://` — c'est bloqué en silence, tu ne
verrais qu'une page qui ne se met jamais à jour. Et on ne peut pas obtenir de
certificat gratuit pour une IP nue : Let's Encrypt n'en délivre que pour des
noms de domaine.

Il y a donc deux façons de s'en sortir. Choisis-en une :

| | Chemin A — tout sur le VPS | Chemin B — sous-domaine gratuit |
|---|---|---|
| Adresse | `http://TON-IP` | `https://tonnom.duckdns.org` |
| Site hébergé par | ton VPS | GitHub Pages (inchangé) |
| HTTPS | non | oui, automatique |
| Mise en place | ~15 min | ~20 min |
| Tu gardes l'IP | oui | oui (le sous-domaine pointe dessus) |

**Chemin A** si tu veux vraiment rester sur l'IP : on héberge aussi le site
sur le VPS, donc tout est en HTTP sur la même adresse et le blocage disparaît.

**Chemin B** est celui que je te conseille : 5 minutes de plus, et tu gardes
le HTTPS. Un sous-domaine DuckDNS est gratuit, sans engagement, et pointe
simplement vers ton IP.

> Sans HTTPS (chemin A), tout circule en clair sur le réseau. Pour un site
> d'atelier RP ce n'est pas dramatique, mais **ton jeton GitHub circulerait en
> clair** quand tu publies depuis l'admin. Si tu prends le chemin A, publie
> plutôt depuis ton PC en `git push`, pas depuis le panneau admin.

Les étapes 1 à 3 sont communes aux deux chemins. L'étape 4 diffère.

---

## 1. Installer Node.js

```bash
ssh root@TON-IP
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v          # doit afficher v22.x
```

## 2. Déposer le serveur

```bash
mkdir -p /opt/mecano-nord
```

Puis copie `serveur.js` dedans. Depuis **ton PC Windows**, dans le dossier du
site :

```powershell
scp "serveur\serveur.js" root@TON-IP:/opt/mecano-nord/
```

## 3. Le lancer au démarrage

```bash
nano /etc/systemd/system/mecano-nord.service
```

Colle ceci, en remplaçant les deux adresses de webhook et ton domaine de site :

```ini
[Unit]
Description=Mecano Nord - service et relais
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/mecano-nord
ExecStart=/usr/bin/node /opt/mecano-nord/serveur.js
Restart=always
RestartSec=5
User=www-data
Environment=PORT=8787
Environment=DONNEES=/opt/mecano-nord/donnees
Environment=ORIGINE=https://cyrillou50.github.io
Environment=WEBHOOK_BT=https://discord.com/api/webhooks/…
Environment=WEBHOOK_DUTY=https://discord.com/api/webhooks/…
Environment=GH_TOKEN=github_pat_…
Environment=GH_OWNER=cyrillou50
Environment=GH_REPO=mecano-nord
Environment=GH_BRANCH=main

[Install]
WantedBy=multi-user.target
```

`Ctrl+O`, `Entrée`, `Ctrl+X` pour enregistrer. Puis :

```bash
chown -R www-data:www-data /opt/mecano-nord
systemctl daemon-reload
systemctl enable --now mecano-nord
systemctl status mecano-nord      # doit afficher « active (running) »
curl localhost:8787/sante         # doit répondre {"ok":true,...}
```

## 4. Installer Caddy (les deux chemins)

Caddy sert le site et redirige les appels vers le serveur Node.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

---

# CHEMIN A — tout sur le VPS, avec l'IP

### A1. Mettre le site sur le VPS

```bash
apt install -y git
git clone https://github.com/cyrillou50/mecano-nord.git /var/www/mecano-nord
chown -R caddy:caddy /var/www/mecano-nord
```

Pour que le VPS récupère les publications faites depuis le panneau admin,
ajoute une mise à jour automatique toutes les minutes :

```bash
crontab -e
```

Ajoute cette ligne à la fin :

```
* * * * * git -C /var/www/mecano-nord pull --quiet 2>/dev/null
```

### A2. Configurer Caddy

```bash
nano /etc/caddy/Caddyfile
```

Remplace **tout** le contenu par ceci — pas de nom de domaine, juste le port,
donc pas de certificat et pas de HTTPS :

```
:80 {
    root * /var/www/mecano-nord
    file_server

    handle /api/* {
        uri strip_prefix /api
        reverse_proxy localhost:8787
    }
}
```

```bash
systemctl reload caddy
```

### A3. Vérifier

Depuis ton navigateur :

- `http://TON-IP` → le site doit s'afficher
- `http://TON-IP/api/sante` → doit afficher `{"ok":true,...}`

### A4. Brancher le site

Va sur `http://TON-IP/admin.html` → **Publier → Serveur de l'atelier** :

| Champ | Valeur |
|---|---|
| Adresse de ton serveur | `http://TON-IP/api` |

**Tester**, **Enregistrer**, **Publier**. Puis dans **Admin → Discord**, vide
les deux champs d'adresse de webhook et publie à nouveau.

> Désormais l'adresse du site pour ton équipe est `http://TON-IP`, plus
> l'adresse GitHub Pages. Pense à la leur donner.

---

# CHEMIN B — sous-domaine gratuit, avec HTTPS

### B1. Créer le sous-domaine (2 minutes)

Va sur **duckdns.org**, connecte-toi avec Google ou Discord, choisis un nom
(ex. `mecano-nord`) et mets **ton IP** dans le champ prévu. Tu obtiens
`mecano-nord.duckdns.org`.

### B2. Configurer Caddy

```bash
nano /etc/caddy/Caddyfile
```

```
mecano-nord.duckdns.org {
    reverse_proxy localhost:8787
}
```

```bash
systemctl reload caddy
```

Caddy obtient le certificat tout seul, en quelques secondes.

### B3. Vérifier

`https://mecano-nord.duckdns.org/sante` → `{"ok":true,...}`

### B4. Brancher le site

Ton site reste sur GitHub Pages. Dans **Admin → Publier → Serveur de
l'atelier**, un seul champ à remplir :

| Champ | Valeur |
|---|---|
| Adresse de ton serveur | `https://mecano-nord.duckdns.org` |

Clique **Tester** : le site vérifie que le serveur répond *et* que la
publication y est configurée. Puis **Enregistrer** et **Publier**.

Ensuite, dans **Admin → Discord**, vide les deux champs d'adresse de webhook —
c'est le serveur qui les connaît — et publie à nouveau.

À partir de là, **plus personne n'a besoin de jeton** : les responsables
publient depuis le site, l'équipe pointe, tout passe par ton serveur.

---

## Dans les deux cas, pour finir

**Régénère tes deux webhooks côté Discord.** Les anciens ont été publiés en
clair dans le dépôt et y restent pour toujours dans l'historique.

---

## Au quotidien

```bash
systemctl status mecano-nord     # état
journalctl -u mecano-nord -f     # journal en direct
systemctl restart mecano-nord    # redémarrer
```

Les données sont dans `/opt/mecano-nord/donnees/duty.json`, avec les
20 dernières versions dans `donnees/sauvegardes/`. Pour revenir en arrière :

```bash
cd /opt/mecano-nord/donnees
cp sauvegardes/LE-FICHIER.json duty.json
systemctl restart mecano-nord
```

Pour mettre à jour le serveur, recopie `serveur.js` puis
`systemctl restart mecano-nord`.

---

## Ce qui est protégé, et ce qui ne l'est pas

Le serveur n'accepte que les requêtes venant de ton site (en-tête `Origin`),
limite à 60 requêtes par minute et par adresse IP, refuse tout ce qui ne
ressemble pas à un tableau de service valide, et écrit de façon atomique avec
sauvegardes.

Les adresses de webhook Discord et l'accès à ton dépôt GitHub ne sont **plus
jamais exposés** : c'est le gain principal, et il est total.

En revanche, l'adresse `https://api.mecano-nord.fr` est forcément dans le code
du site. Un navigateur ne peut pas l'appeler depuis ailleurs, mais un outil en
ligne de commande peut falsifier l'origine et, au pire, écrire n'importe quoi
dans le tableau de pointage — d'où les sauvegardes. Il ne peut ni lire tes
webhooks, ni toucher au dépôt, ni au catalogue.

Si un jour ça te gêne, la parade est d'exiger la connexion côté serveur
(jetons de session) — dis-le-moi, ça se rajoute.

---

## Option : héberger tout le site sur le VPS

Tu peux aussi servir le site depuis le VPS plutôt que GitHub Pages. Copie le
dossier du site dans `/var/www/mecano-nord`, puis dans le `Caddyfile` :

```
mecano-nord.fr {
    root * /var/www/mecano-nord
    file_server
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy localhost:8787
    }
}
```

Les adresses deviennent alors `https://mecano-nord.fr/api/duty.json` et
`https://mecano-nord.fr/api/relais`. Tout est sur le même domaine : plus aucun
souci d'origine.
