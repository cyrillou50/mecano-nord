# Installation sur ton VPS

Ce serveur remplace Firebase **et** le relais Cloudflare. Une fois en place :

- tes employés pointent leur service sans rien installer,
- les adresses de webhook Discord ne sont plus dans le dépôt public,
- les données de pointage sont chez toi, avec sauvegardes automatiques.

Il n'a **aucune dépendance** : pas de `npm install`, rien à télécharger.

---

## Ce qu'il te faut

- Un VPS sous Debian ou Ubuntu, avec un accès SSH root
- **Un nom de domaine pointant vers ton VPS** (ex. `api.mecano-nord.fr`)

> ⚠️ Le domaine n'est pas optionnel. Ton site est en `https://` sur GitHub
> Pages, et un navigateur refuse qu'une page HTTPS appelle une adresse en
> HTTP. Il faut donc du HTTPS sur le VPS, donc un certificat, donc un domaine.
> Un sous-domaine gratuit (DuckDNS, No-IP…) fait très bien l'affaire.

Dans tout ce qui suit, remplace `api.mecano-nord.fr` par ton domaine.

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

## 4. Mettre le HTTPS devant (Caddy)

Caddy obtient et renouvelle le certificat tout seul, sans rien configurer.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

```bash
nano /etc/caddy/Caddyfile
```

Remplace tout le contenu par :

```
api.mecano-nord.fr {
    reverse_proxy localhost:8787
}
```

```bash
systemctl reload caddy
```

Vérifie depuis n'importe où :

```
https://api.mecano-nord.fr/sante
```

Tu dois voir `{"ok":true,...}`. Si oui, c'est gagné.

## 5. Brancher le site

Dans **Admin → Publier → Pointage de l'équipe** :

| Champ | Valeur |
|---|---|
| Base partagée | `https://api.mecano-nord.fr/duty.json` |
| Relais | `https://api.mecano-nord.fr/relais` |

Clique **Tester** sur chacun, **Enregistrer**, puis **Publier**.

Ensuite, dans **Admin → Discord**, **vide les deux champs d'adresse de
webhook** : c'est le serveur qui les connaît maintenant. Publie à nouveau.

Enfin — et c'est important — **régénère tes deux webhooks côté Discord**,
puisque les anciens ont été publiés en clair.

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
