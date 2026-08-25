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
Environment=WEBHOOK_CONGES=https://discord.com/api/webhooks/…
Environment=WEBHOOK_AVERTISSEMENTS=https://discord.com/api/webhooks/…
Environment=GH_TOKEN=github_pat_…
Environment=GH_OWNER=cyrillou50
Environment=GH_REPO=mecano-nord
Environment=GH_BRANCH=main
Environment=TZ=Europe/Paris

[Install]
WantedBy=multi-user.target
```

`WEBHOOK_CONGES` est facultatif : sans lui, les départs en congés sont
annoncés dans le salon des prises de service.

`WEBHOOK_AVERTISSEMENTS` est facultatif lui aussi, mais **sans repli** :
sans salon à eux, les avertissements ne partent nulle part. C'est voulu — une
sanction n'a rien à faire dans le salon où toute l'équipe lit les prises de
service. Donne-lui un salon réservé aux responsables, ou laisse vide.

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
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

> `gnupg` est indispensable et manque sur beaucoup d'images VPS minimales.
> Sans lui, la clé n'est pas enregistrée, `apt install caddy` échoue en
> silence, et toutes les commandes `systemctl … caddy` répondront ensuite
> « Unit caddy.service not found ».

Vérifie tout de suite que l'installation a réussi :

```bash
caddy version          # doit afficher v2.x
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

# CHEMIN C — tu as déjà des sites sur ce VPS

**C'est le cas le plus courant, et le plus simple.** Si nginx ou Apache sert
déjà tes autres domaines sur les ports 80 et 443, ne touche à rien : tu lui
ajoutes juste un vhost de plus. **Pas besoin de Caddy dans ce cas.**

```bash
systemctl disable --now caddy 2>/dev/null
apt purge -y caddy 2>/dev/null
ss -tulpn | grep -E ':(80|443)'      # qui sert déjà ?
```

### C1. Un sous-domaine

Chez ton fournisseur DNS, ajoute un enregistrement **A** pour
`api.tondomaine.fr` pointant vers l'IP de ton VPS. Puisque tu as déjà des
domaines, autant t'en servir.

### C2. Node en écoute locale seulement

Dans `/etc/systemd/system/mecano-nord.service`, garde `PORT=8787` et ajoute :

```ini
Environment=HOTE=127.0.0.1
```

```bash
systemctl daemon-reload && systemctl restart mecano-nord
curl localhost:8787/sante
```

Le serveur n'est ainsi joignable que par le proxy, jamais directement.

### C3-nginx. Si c'est nginx

```bash
nano /etc/nginx/sites-available/mecano-nord
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.tondomaine.fr;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/mecano-nord /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.tondomaine.fr
```

### C3-apache. Si c'est Apache

```bash
a2enmod proxy proxy_http headers
nano /etc/apache2/sites-available/mecano-nord.conf
```

```apache
<VirtualHost *:80>
    ServerName api.tondomaine.fr
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:8787/
    ProxyPassReverse / http://127.0.0.1:8787/
</VirtualHost>
```

```bash
a2ensite mecano-nord && apache2ctl configtest && systemctl reload apache2
apt install -y certbot python3-certbot-apache
certbot --apache -d api.tondomaine.fr
```

### C4. Vérifier et brancher

```
https://api.tondomaine.fr/sante
```

Doit afficher `{"ok":true,...}`. Colle ensuite `https://api.tondomaine.fr`
dans **Admin → Publier → Serveur de l'atelier**, clique **Tester**, puis
enregistre et publie.

Tes autres sites ne sont pas touchés : tu as simplement ajouté un vhost.

---

## Si Caddy refuse de démarrer

Commence toujours par lire ce qu'il dit :

```bash
systemctl status caddy --no-pager -l
journalctl -u caddy -n 40 --no-pager
```

| Message | Cause | Correction |
|---|---|---|
| `Unit caddy.service not found` | Caddy n'est pas installé | `gnupg` manquait : refais l'étape 4 en entier, puis `caddy version` |
| `Job for caddy.service failed` | erreur dans le Caddyfile | `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` t'indique la ligne |
| `address already in use` | Apache ou nginx occupe le port 80 | `systemctl disable --now apache2 nginx` |
| `reload` échoue mais `start` marche | le service n'était pas lancé | `systemctl enable --now caddy` |

`reload` ne fonctionne que si Caddy **tourne déjà**. En cas de doute :

```bash
systemctl restart caddy
```

Qui écoute sur les ports web :

```bash
ss -tulpn | grep -E ':(80|443)'
```

Enfin, vérifie que le pare-feu laisse passer :

```bash
ufw allow 80/tcp && ufw allow 443/tcp     # si ufw est actif
```

## Au quotidien

```bash
systemctl status mecano-nord     # état
journalctl -u mecano-nord -f     # journal en direct
systemctl restart mecano-nord    # redémarrer
```

Les données sont dans `/opt/mecano-nord/donnees/` :

| Fichier | Ce qu'il contient | Versions gardées |
|---|---|---|
| `duty.json` | pointage, congés, historique | `sauvegardes/` |
| `catalogue.json` | objets, grades, employés, réglages | `sauvegardes-catalogue/` |
| `vehicules.json` | parc automobile | — |
| `contrats.json` | registre des contrats | — |
| `agenda.json` | évènements du calendrier | — |
| `images/` | images déposées depuis l'admin | — |

**Pense à sauvegarder ce dossier** : les images et le catalogue ne sont plus
dans le dépôt GitHub. Pour revenir en arrière :

```bash
cd /opt/mecano-nord/donnees
cp sauvegardes/LE-FICHIER.json duty.json
cp sauvegardes-catalogue/LE-FICHIER.json catalogue.json
systemctl restart mecano-nord
```

Supprimer `catalogue.json` ne casse rien : le site repart de la copie du dépôt,
`data/catalog.json`.

## Mettre à jour le serveur

Depuis ton PC, dans le dossier du site :

```powershell
scp "serveur\serveur.js" root@TON-IP:/opt/mecano-nord/
```

Puis sur le VPS :

```bash
systemctl restart mecano-nord
```

Fais-le à chaque fois que `serveur.js` change ici — sinon le VPS continue de
tourner avec l'ancienne version, et les nouveautés ne répondent pas.

**Symptôme typique :** en publiant depuis l'admin, tu obtiens
`Chemin inconnu : /publier`. Ça veut dire que le serveur est bien joignable,
mais qu'il est trop vieux pour connaître la publication. La mise à jour
ci-dessus le corrige.

Pour savoir où tu en es, va dans **Admin → Publier → Serveur de l'atelier**
et clique **Tester** : il te dit s'il est à jour, si les accès GitHub manquent,
ou s'il ne répond pas.

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
dans les données que le serveur détient — d'où les sauvegardes. Il ne peut ni
lire tes webhooks, ni toucher au dépôt GitHub.

> **Depuis que le catalogue est hébergé ici, il fait partie de ces données.**
> Le catalogue contient les employés et leurs droits : quelqu'un de motivé
> pourrait donc les réécrire. C'est un cran au-dessus du tableau de pointage,
> et il faut le savoir avant de basculer.
>
> Ce qui limite les dégâts : chaque écriture garde une version dans
> `donnees/sauvegardes-catalogue/` (les vingt dernières), et le serveur refuse
> tout ce qui ne ressemble pas à un catalogue. Revenir en arrière, c'est
> recopier un fichier et redémarrer.
>
> Pour fermer vraiment la porte, il faut exiger la connexion côté serveur
> (jetons de session) — dis-le-moi, ça se rajoute. Tant que ce n'est pas fait,
> tu peux aussi laisser le catalogue dans le dépôt : il suffit de ne pas
> déployer cette version du serveur, le site retombe alors tout seul sur
> `data/catalog.json`.

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

---

## Récapitulatif hebdomadaire des services

Chaque dimanche soir, le serveur poste dans le salon des services le temps
passé par chacun pendant la semaine. C'est lui qui s'en charge et pas le
site : personne ne garantit qu'un navigateur sera ouvert au bon moment.

Il n'y a rien à installer — pas de `cron`, pas de dépendance. Il suffit que
`WEBHOOK_DUTY` soit renseigné.

| Variable | Défaut | Rôle |
|---|---|---|
| `RECAP` | `on` | `off` pour ne rien envoyer |
| `RECAP_JOUR` | `0` | jour de l'envoi — 0 = dimanche, 6 = samedi |
| `RECAP_HEURE` | `20` | heure locale de l'envoi |
| `TZ` | heure système | fuseau, par exemple `Europe/Paris` |

**Mets `TZ`** dans le service : sans lui, beaucoup de VPS sont en UTC et le
message partirait deux heures trop tôt l'été.

La semaine déjà envoyée est retenue dans `donnees/recap.json`. Sans ce
repère, un serveur redémarré trois fois dans la soirée enverrait trois fois
le même message.

### Le tester sans attendre dimanche

```bash
# Ce que le message dira, sans rien envoyer
curl -s https://ton-serveur/recap | jq

# L'envoyer tout de suite — un essai, la semaine reste due
curl -s -X POST https://ton-serveur/recap

# L'envoyer et considérer la semaine comme faite
curl -s -X POST https://ton-serveur/recap \
  -H 'Content-Type: application/json' -d '{"marquer":true}'
```
