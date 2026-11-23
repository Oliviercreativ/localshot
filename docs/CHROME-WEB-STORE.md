# Publier LocalShot sur le Chrome Web Store

## Verdict : publiable

Rien dans le code ne bloque la publication :

- **Manifest V3**, aucun code chargé depuis Internet (pas de `eval`, pas de script distant), tout est dans le paquet.
- **Un seul objectif** clair : capturer l'écran et l'enregistrer en vidéo.
- **Permissions minimales** : aucune permission d'hôte obligatoire. L'accès aux pages (`http(s)://*/*`) est **facultatif** et demandé seulement pour l'effet de clic ou l'adresse de votre serveur.
- **Politique de confidentialité** prête : [PRIVACY.md](../PRIVACY.md).

Points d'attention :

1. Les permissions d'hôte facultatives larges (`http://*/*`, `https://*/*`) peuvent allonger l'examen (quelques jours de plus). Elles se justifient (voir plus bas).
2. L'envoi du son à Mistral / OpenAI / Groq doit être **déclaré** dans le formulaire « Pratiques de confidentialité » (données « contenu audio », transmises seulement à l'initiative de l'utilisateur).
3. Vérifiez qu'aucune autre extension ne porte déjà le nom « LocalShot » (sinon prévoir un nom de vitrine, par exemple « LocalShot — Private Screenshots »).

## Étapes

1. Créer un compte développeur : <https://chrome.google.com/webstore/devconsole> (frais uniques de 5 $, validation en deux étapes obligatoire).
2. Préparer le paquet : `bash scripts/pack-extension.sh` → `dist/localshot-extension-<version>.zip` (sans fichiers cachés).
3. Dans la console : « Nouvel élément » → envoyer le .zip.
4. Remplir la fiche (textes ci-dessous), ajouter les visuels, puis « Envoyer pour examen ».

## Visuels à préparer

| Élément | Taille | Statut |
|---|---|---|
| Icône | 128×128 | ✓ `extension/icons/icon-128.png` |
| Captures d'écran (1 à 5) | 1280×800 ou 640×400 | à faire : popup, éditeur (flou + flèches), lecteur vidéo, panneau latéral, page client |
| Petite vignette promo | 440×280 | à faire |

## Textes à copier-coller

**Objectif unique** :
> LocalShot takes screenshots (visible area, full page, selected area) and screen recordings, stores them locally in the browser, and lets the user annotate, trim and optionally share them on their own server.

**Justification des permissions** :

- `activeTab` : capture the tab the user clicked the LocalShot icon on or used a keyboard shortcut on.
- `scripting` : scroll the page to stitch full-page screenshots, and draw the area-selection overlay.
- `downloads` : save captures to the user's Downloads folder when they click Download.
- `unlimitedStorage` : screen recordings are large; they are stored locally in IndexedDB.
- `sidePanel` : optional side panel with capture buttons and recent captures.
- Hôtes facultatifs `http://*/*`, `https://*/*` : requested at runtime only (1) to draw click circles during a recording when the user enables "Click effect", and (2) for the single address of the user's own sharing server or transcription service, entered by the user. Never requested at install.

**Code distant** : « Non, je n'utilise pas de code distant ».

**Pratiques de confidentialité** (formulaire) :

- Données collectées par le développeur : **aucune**.
- Cocher les certifications : pas de vente de données, pas d'usage sans rapport avec l'objectif, pas d'usage pour le crédit.
- Mentionner dans la politique : contenu des captures transmis uniquement vers le serveur choisi par l'utilisateur ; audio transmis au service de transcription choisi, à sa demande.
- URL de la politique : le lien GitHub vers `PRIVACY.md` (le dépôt doit être **public** à ce moment-là).

**Description courte** (132 caractères max) :
> Private screenshots & screen recordings. Stored in your browser, blur & annotate, share on your own server. No account, no tracking.

**Catégorie** : Productivité (outils).

## Ce que l'examen regarde souvent

- Que la description corresponde exactement aux fonctions (ne pas promettre ce qui n'existe pas).
- Que chaque permission serve vraiment : c'est le cas ici.
- Que la politique de confidentialité soit accessible publiquement.
