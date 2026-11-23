# LocalShot — Privacy policy

*Last updated: November 2026* · [Version française plus bas](#politique-de-confidentialité)

LocalShot is a screenshot and screen-recording extension built so that **your captures stay on your computer**.

## What LocalShot stores, and where

- **Captures, videos, annotations, captions and settings** are stored **only in your browser** (the extension's IndexedDB and local storage), on your computer.
- If you choose a **save folder**, copies are written to that folder on your computer.
- The extension has **no analytics, no tracking, no account, no advertising**, and sends nothing to its authors.

## When data leaves your computer (only if you ask)

1. **Sharing** — when you click "Share", that single capture is uploaded to **the LocalShot server you configured yourself** (your Raspberry Pi, NAS, VPS or Docker container). No server is set by default. With "Encrypted", the server only receives an unreadable file; the key stays in the link.
2. **Automatic captions** — only if you enable it in Settings and then click "Captions" on a video: the **audio track** (never the picture) is sent to the service you chose: your own Whisper server, Mistral AI, OpenAI or Groq. Their own privacy policies then apply. Your API key is stored only in your browser.
3. **Click effect and annotations** (optional) — LocalShot asks Chrome for access to web pages only to draw click circles, or your drawings, on the page during a recording; nothing is read or sent. The access is returned to Chrome when you untick both options.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Capture the tab you clicked LocalShot on or used a shortcut on. |
| `scripting` | Scroll the page for full-page captures and draw the area-selection frame. |
| `downloads` | Save captures to your Downloads folder when you click Download. |
| `unlimitedStorage` | Keep large videos in the browser without a size limit. |
| `sidePanel` | Show the LocalShot side panel. |
| `storage` | Remember your display choice (desktop, tablet or mobile), on this computer only. |
| Optional `debugger` | Only if you choose Tablet or Mobile: shows the page as that device (size, pixel density, touch, mobile browser) during the capture, then returns it to normal. Removed when you go back to Desktop. Nothing is read or sent. |
| Optional host access | Only for the addresses you set (your server, your transcription service) and for the optional click effect and annotations. |

## Your control

Delete any capture from the gallery; uninstalling the extension deletes everything stored in the browser. Shared links can be stopped at any time, and the server copy is then deleted.

## Contact

Questions: open an issue on the project's GitHub repository.

---

## Politique de confidentialité

LocalShot est une extension de captures d'écran et de vidéos conçue pour que **vos captures restent sur votre ordinateur**.

- **Captures, vidéos, annotations, sous-titres et réglages** sont stockés **uniquement dans votre navigateur**, sur votre ordinateur (et dans le dossier de sauvegarde que vous choisissez, le cas échéant).
- **Aucune statistique, aucun pistage, aucun compte, aucune publicité.** Rien n'est envoyé aux auteurs.
- **Partage** : seulement quand vous cliquez sur « Partager », et uniquement vers **le serveur LocalShot que vous avez réglé vous-même**. Aucun serveur par défaut. En mode « Chiffré », le serveur ne reçoit qu'un fichier illisible.
- **Sous-titres automatiques** : seulement si vous les activez puis cliquez sur « Sous-titres » : **le son** (jamais l'image) est envoyé au service choisi (votre serveur Whisper, Mistral AI, OpenAI ou Groq), selon ses propres conditions.
- **Effet de clic et annotations** (facultatifs) : l'accès aux pages sert uniquement à dessiner les clics, ou vos annotations, sur la page pendant un enregistrement ; il est rendu à Chrome dès que vous décochez les deux options.
- **Affichage tablette ou mobile** (facultatif) : l'autorisation « débogueur » sert uniquement à afficher la page comme sur l'appareil choisi pendant la capture ; Chrome l'indique par un bandeau. Elle est rendue quand vous revenez à « Ordinateur ». Rien n'est lu ni envoyé.
- Désinstaller l'extension efface tout ce qu'elle stocke dans le navigateur.
