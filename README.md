# LocalShot — captures d'écran et vidéos 100 % locales

Alternative privée à Awesome Screenshot / Loom : une extension Chrome **sans aucun accès Internet**.
Les captures et la galerie vivent **dans l'extension**, sur votre Mac. Aucun serveur à lancer au quotidien.

## Installer l'extension

1. Ouvrir `chrome://extensions`
2. Activer **Mode développeur** (en haut à droite)
3. **Charger l'extension non empaquetée** → choisir le dossier `extension/`
4. Épingler l'icône LocalShot dans la barre d'outils

Après une mise à jour du code : bouton ↻ sur la carte de l'extension dans `chrome://extensions`.

## Utilisation

| Mode | Raccourci |
|---|---|
| Partie visible | `⌥ ⇧ V` |
| Page entière (défilement + assemblage) | `⌥ ⇧ F` |
| Zone sélectionnée à la souris (Échap pour annuler) | `⌥ ⇧ S` |
| Vidéo : ouvrir l'enregistreur / terminer l'enregistrement | `⌥ ⇧ R` |

Après la capture, sa page s'ouvre : titre modifiable, copier l'image, télécharger, supprimer.
La galerie s'ouvre depuis le popup (« Ouvrir la galerie »). Raccourcis modifiables dans `chrome://extensions/shortcuts`.

## Vidéo (façon Loom)

Popup → **Enregistrer une vidéo** (ou `⌥ ⇧ R`). Une petite fenêtre s'ouvre :

- options **Micro**, **Caméra** (bulle flottante toujours au premier plan), **Son de l'onglet** et **Effet de clic** ;
- **Choisir quoi enregistrer** : Chrome demande un onglet, une fenêtre ou l'écran entier ;
- compte à rebours 3-2-1, puis la fenêtre se range dans le Dock ;
- pour terminer : bouton ■ de la bulle, popup LocalShot, `⌥ ⇧ R`, ou « Arrêter le partage » de Chrome.
  La pause est dans la bulle et dans la fenêtre d'enregistrement.

La vidéo s'ouvre ensuite dans sa page et apparaît dans la galerie. Format MP4 quand Chrome le permet
(lisible sur iPhone), sinon WebM.

- La bulle caméra n'apparaît dans la vidéo que si vous enregistrez **l'écran entier**.
- Le son de l'ordinateur n'est capturé que pour un **onglet Chrome** (limite de macOS).
- **Effet de clic** : un cercle orange apparaît à chaque clic dans les pages web ouvertes dans Chrome
  (pas dans les autres applications du Mac). Cette option demande une fois à Chrome l'accès aux pages :
  c'est une permission **facultative**, utilisée seulement pendant l'enregistrement (le script est retiré
  à la fin). Pour la retirer : clic droit sur l'icône LocalShot → « Gérer l'extension » → Accès aux sites.
- La vidéo est gardée en mémoire pendant l'enregistrement : environ 30 Mo par minute.

⚠️ Les captures sont stockées dans le navigateur (IndexedDB de l'extension) : **désinstaller l'extension
les efface**. Le bouton « Tout télécharger » de la galerie copie tout dans `Téléchargements/LocalShot/`.

## Partager en Wi-Fi (optionnel)

Seulement si vous voulez envoyer un lien au téléphone ou à l'autre Mac :

```bash
npm run start:lan
```

Puis, sur la page d'une capture ou d'une vidéo : **Partager** → le lien est copié. Seule cette capture est
copiée vers le serveur local (dossier `data/`) ; « Arrêter le partage » la retire. Node ≥ 18, aucune dépendance (≥ 20.6 pour `npm run start:env`).
`npm start` lance le serveur sans l'exposer au réseau (utile pour tester).

## Où sont rangés les fichiers partagés

Le serveur LocalShot range les fichiers partagés là où vous le décidez (`STORAGE` dans `.env`, voir [.env.example](.env.example)) :

| `STORAGE` | Où | Pour qui |
|---|---|---|
| `local` (défaut) | le disque du serveur (Mac, Raspberry Pi, NAS, VPS) | tout garder chez soi |
| `s3` | tout service compatible S3 : **Cloudflare R2**, AWS S3, Backblaze B2, Scaleway, OVH, Wasabi, MinIO, Garage | liens fiables pour des clients, sans machine allumée chez soi |

- L'extension ne parle **qu'à votre serveur** : aucune clé cloud n'est jamais stockée dans Chrome.
- Le bucket reste **privé** ; les vidéos sont lues via des liens temporaires signés (lecture fluide, saut dans la vidéo).
- Signature S3 écrite sans dépendance (`server/storage/sigv4.js`), vérifiée avec les vecteurs officiels d'AWS (`npm test`).
- Changer de stockage ne casse pas les anciens liens : les fichiers déjà partagés restent lus depuis leur stockage d'origine.

Exemple Cloudflare R2 : créez un bucket et un jeton API « Object Read & Write » limité à ce bucket, puis

```bash
STORAGE=s3
S3_ENDPOINT=https://<id-du-compte>.r2.cloudflarestorage.com
S3_BUCKET=localshot
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

## Serveur sur un Raspberry Pi (Tailscale)

Pour retrouver vos partages depuis l'iPhone ou l'autre Mac, même hors de chez vous, sans rien ouvrir sur Internet.

1. Installez **Tailscale** sur le Mac, l'iPhone et le Pi (même compte). Sur le Pi :
   `curl -fsSL https://tailscale.com/install.sh | sh` puis `sudo tailscale up --ssh`.
   Dans la console Tailscale, activez **MagicDNS** et **HTTPS Certificates**.
2. Depuis ce dossier, sur le Mac : `bash deploy/pi/push.sh <nom-du-pi>`
   (ajoutez un 2ᵉ argument pour ranger les données ailleurs, par ex. `/mnt/ssd/localshot`).
   Le script installe le service `localshot` (systemd, durci), active `tailscale serve` (HTTPS privé),
   les mises à jour de sécurité automatiques, et affiche une **clé d'accès**.
3. Dans l'extension : galerie → **Serveur** → adresse `https://<nom-du-pi>.<tailnet>.ts.net` + la clé.
   Chrome demande l'accès à cette seule adresse.
4. Sur l'iPhone, ouvrez la même adresse dans Safari, entrez la clé : la galerie s'affiche.

Le serveur n'écoute que sur `127.0.0.1` du Pi ; seul Tailscale (vos appareils) peut l'atteindre.
Clé et réglages : `/etc/localshot.env` sur le Pi. Journal : `journalctl -u localshot`.

## Confidentialité

- Permissions : `activeTab` (uniquement l'onglet sur lequel **vous** cliquez / utilisez le raccourci),
  `scripting` (défilement pour la page entière, cadre de sélection), `downloads` (téléchargement),
  `unlimitedStorage` (pas de limite de place pour les captures).
- Permission facultative (seulement si vous cochez « Effet de clic ») : accès aux pages, utilisé uniquement
  pendant un enregistrement vidéo pour dessiner les clics.
- Seule adresse réseau autorisée : `http://localhost:4777` (le serveur de partage, s'il est lancé),
  plus l'adresse de votre propre serveur si vous en réglez un (autorisation demandée pour cette seule adresse).
  Pas d'analytics, pas de compte, pas de cloud.
- Aucun accès permanent à vos sites : l'extension ne lit pas vos pages en arrière-plan.

Serveur de partage :
- `npm start` écoute seulement sur `127.0.0.1` ; `npm run start:lan` ouvre les liens au Wi-Fi.
- Seules les captures dont on connaît le lien (`/c/<id>` aléatoire) sont visibles depuis le réseau ;
  la liste, l'ajout et la suppression ne sont possibles que depuis ce Mac.
- Sur le Pi (`LOCALSHOT_TOKEN` défini) : liste, ajout et suppression exigent la clé d'accès
  (en-tête `Authorization` pour l'extension, cookie `HttpOnly` + `SameSite=Strict` pour la galerie web).
- Vérification du `Host` (anti DNS-rebinding) et de l'`Origin`, pas de CORS, CSP stricte.

## Limites connues

- Page entière : les pages dont le contenu défile dans un sous-bloc (certaines web-apps) ne capturent
  que la partie visible ; hauteur max ≈ 32 000 px (limite des canvas).
- Les pages internes de Chrome (`chrome://`, Chrome Web Store) ne peuvent pas être capturées.

## Prochaines étapes

- Vidéo : bulle caméra aussi pour un onglet, découpe du début et de la fin, import de vidéos du Mac
- PWA installable sur le téléphone et l'autre Mac (servie par le Pi)
- Synchronisation automatique vers le Pi (aujourd'hui : bouton « Partager », capture par capture)
- Annotations (flèches, texte, flou)

## Licence

[AGPL-3.0-or-later](LICENSE) : vous pouvez utiliser, modifier et redistribuer LocalShot ; si vous proposez
une version modifiée du serveur à d'autres personnes (par le réseau), vous devez publier vos modifications.
