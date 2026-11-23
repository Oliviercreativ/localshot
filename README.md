# LocalShot — 100% local screenshots and screen recordings

A private alternative to Awesome Screenshot / Loom: a Chrome extension with **no Internet access at all**.
Captures and the gallery live **inside the extension**, on your computer. No server to run day to day.

> The extension's interface is currently in French. French button labels are quoted below with their English meaning.

## Install the extension

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → pick the `extension/` folder
4. Pin the LocalShot icon to the toolbar

After a code update: click the ↻ button on the extension's card in `chrome://extensions`.

## Usage

| Mode | Shortcut |
|---|---|
| Visible area | `⌥ ⇧ V` |
| Full page (scroll + stitch) | `⌥ ⇧ F` |
| Area selected with the mouse (Esc to cancel) | `⌥ ⇧ S` |
| Video: open the recorder / stop recording | `⌥ ⇧ R` |

After a capture, its page opens: editable title, copy image, download, delete, **annotate**.

The interface follows your browser language: **French or English**.

## Annotate and blur

« Annoter » (Annotate) opens an editor on top of the capture: **arrows, boxes, text, numbered steps, blur and redaction**,
7 colours, 3 stroke sizes, undo/redo (⌘Z / ⇧⌘Z), move and delete items. Blur is a coarse pixelation baked into the saved image
(it cannot be undone by the recipient); « Masquer » covers an area with a solid block. The original is kept: « Revenir à l'original » restores it.
The popup opens the full gallery in a tab (« Ouvrir la galerie », Open gallery) or a **side panel** on the right of the window
(« Panneau latéral »), like Claude in Chrome: capture buttons, video recording and your recent captures, updated live.
Shortcuts can be changed in `chrome://extensions/shortcuts`.

## Video (Loom-style)

Popup → **« Enregistrer une vidéo »** (Record a video), or `⌥ ⇧ R`. A small window opens:

- options for **Microphone**, **Camera** (floating bubble, always on top), **Tab audio** and **Click effect**;
- **Choose what to record**: Chrome asks for a tab, a window or the entire screen;
- 3-2-1 countdown, then the window minimizes to the Dock;
- to stop: the ■ button in the bubble, the LocalShot popup, `⌥ ⇧ R`, or Chrome's "Stop sharing".
  Pause is available in the bubble and in the recording window.

The video then opens in its own page and shows up in the gallery. MP4 when Chrome supports it
(plays on iPhone), WebM otherwise.

- The camera bubble only appears in the video when you record the **entire screen**.
- Computer audio can only be captured for a **Chrome tab** (macOS limitation).
- **Click effect**: an orange circle appears on every click in web pages open in Chrome
  (not in other apps). This option asks Chrome once for access to pages: it is an **optional**
  permission, used only while recording (the script is removed at the end) and handed back to Chrome
  as soon as you untick the option. You can also remove it manually: right-click the LocalShot icon →
  "Manage extension" → Site access.
- The video is kept in memory while recording: about 30 MB per minute.

On a video page:

- **Trim / GIF** (« Découper / GIF »): pick a start and an end, then **trim** the video (the segment is replayed and re-recorded
  in the browser, so it takes as long as the segment; the original is kept) or **export a GIF** (10 fps, 640 px, 20 s max).
- **Captions** (« Sous-titres »): automatic transcription, clickable transcript, corrections, export to `.srt` / `.vtt`.
  Choose the service in Settings: **your own Whisper server** (any OpenAI-compatible API such as
  [speaches](https://github.com/speaches-ai/speaches): nothing leaves your machines), **Mistral (Voxtral)**, **OpenAI (Whisper)** or **Groq**.
  Only the audio track is sent, and only when you click.

⚠️ Captures are stored in the browser (the extension's IndexedDB): **uninstalling the extension
deletes them**. Keep a copy on disk:

- **Save folder** (« Réglages », Settings): a subfolder of Downloads, or **any folder you pick** on your computer.
  « Télécharger » and « Tout télécharger » (Download all) save there.
- **Auto-save** (optional): every new capture and video is also written to that folder as soon as it is taken.
  With a custom folder, Chrome may ask you to allow access again after a restart (one click on the capture page).
- **Restore** (« Restaurer », gallery or Settings): after reinstalling the extension, pick your save folder: LocalShot reads it
  and brings back the missing captures and videos (title and date are recovered from the file names, no duplicates).

The gallery and the side panel can be filtered by **All / Photos / Videos**.

## Sharing (optional, your own server)

Without a server, **nothing leaves your computer**. To send links, run the LocalShot server on a machine you control
(Raspberry Pi, NAS, VPS or Docker, see below), then in the extension: « Réglages » (Settings) → server address + access key.
On a capture page, **« Partager »** (Share) uploads only that capture and copies the link; « Arrêter le partage » (Stop sharing) deletes it from the server.

- **Encrypted** (tick « Chiffré » before sharing): the capture, its title and captions are encrypted in the browser (AES-256-GCM).
  The server stores an unreadable file; the key travels in the link after `#`, which browsers never send to the server.
  No preview or thumbnail for these links.
- **Comments**: viewers can leave comments, pinned to a moment of the video (markers on the progress bar).
  You see them on the capture page and can delete them; they can be turned off per link.

### Link options

Once a capture is shared, its page (in the extension or in the server's web gallery) shows **link options**:

- **Views**: how many times the link was opened (counted on your server, no third-party analytics; your own visits are not counted).
- **Expiry**: never, 24 hours, 7 days or 30 days. Expired links show "This link has expired".
- **Password**: visitors must enter it before seeing anything (title included). Changing or removing it revokes access already given.
  Send the password separately from the link.
- **Allow download**: untick to hide the download button for visitors. This only discourages: anything shown on screen can still be recorded.
- **Link preview**: when the server has a public address (`LOCALSHOT_PUBLIC_URL`), links pasted in Slack, WhatsApp or an email
  show the title and a thumbnail. Nothing is revealed for password-protected links.

### Web app (PWA) and upload

The server's web gallery can be **installed as an app** on Mac or PC (Chrome/Edge: « Installer l'application » button, Safari: File → Add to Dock).
From there you can also **add PNG, MP4 or WebM files** (button or drag and drop), and use the system « Share to LocalShot » menu.

### Docker

```bash
cp .env.example .env   # set LOCALSHOT_TOKEN and LOCALSHOT_PUBLIC_URL
docker compose up -d
```

The container is read-only, runs as a non-root user and only listens on `127.0.0.1:4777`: put an HTTPS proxy in front
(Caddy, Traefik, `tailscale serve`, Cloudflare Tunnel…). Data lives in the `localshot-data` volume.

## Where shared files are stored

The LocalShot server stores shared files wherever you choose (`STORAGE` in `.env`, see [.env.example](.env.example)):

| `STORAGE` | Where | For whom |
|---|---|---|
| `local` (default) | the server's disk (Mac, Raspberry Pi, NAS, VPS) | keep everything at home |
| `s3` | any S3-compatible service: **Cloudflare R2**, AWS S3, Backblaze B2, Scaleway, OVH, Wasabi, MinIO, Garage | reliable links for clients, without a machine running at home |

- The extension **only talks to your server**: no cloud key is ever stored in Chrome.
- The bucket stays **private**; videos are played through short-lived signed URLs (smooth playback, seeking).
- S3 signing written without dependencies (`server/storage/sigv4.js`), checked against AWS's official test vectors (`npm test`).
- Switching storage does not break old links: already-shared files keep being read from their original storage.

Cloudflare R2 example: create a bucket and an "Object Read & Write" API token limited to that bucket, then

```bash
STORAGE=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=localshot
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

## Server on a Raspberry Pi (Tailscale)

To reach your shares from your iPhone or another computer, even away from home, without opening anything to the Internet.

1. Install **Tailscale** on the Mac, the iPhone and the Pi (same account). On the Pi:
   `curl -fsSL https://tailscale.com/install.sh | sh` then `sudo tailscale up --ssh`.
   In the Tailscale admin console, enable **MagicDNS** and **HTTPS Certificates**.
2. From this folder, on the Mac: `bash deploy/pi/push.sh <pi-name>`
   (add a 2nd argument to store data elsewhere, e.g. `/mnt/ssd/localshot`).
   The script installs the `localshot` service (systemd, hardened), enables `tailscale serve` (private HTTPS)
   and automatic security updates, and prints an **access key**.
3. In the extension: gallery → **« Réglages »** (Settings) → address `https://<pi-name>.<tailnet>.ts.net` + the key.
   Chrome asks for access to that single address only.
4. On the iPhone, open the same address in Safari and enter the key: the gallery appears.

The server only listens on the Pi's `127.0.0.1`; only Tailscale (your devices) can reach it.
Key and settings: `/etc/localshot.env` on the Pi. Logs: `journalctl -u localshot`.

## Privacy

- Permissions: `activeTab` (only the tab where **you** click / use the shortcut),
  `scripting` (scrolling for full page, selection frame), `downloads` (downloading),
  `unlimitedStorage` (no storage limit for captures), `sidePanel` (the side panel, which shows no warning and grants no access to your pages).
- Optional permission (only if you tick "Click effect"): access to pages, used only
  during a video recording to draw clicks, and handed back to Chrome as soon as you untick the option.
- No network access by default: the extension can only reach the addresses you set (your server, your transcription service),
  each one approved in a Chrome prompt. Full policy: [PRIVACY.md](PRIVACY.md).
- No analytics, no account, no cloud.
- No permanent access to your sites: the extension does not read your pages in the background.

Sharing server:
- `npm start` listens only on `127.0.0.1` (`LOCALSHOT_HOST=0.0.0.0` in Docker); put `tailscale serve` or an HTTPS proxy in front.
- Only captures whose link is known (random `/c/<id>`) are visible; with `LOCALSHOT_TOKEN` set,
  listing, adding, editing and deleting require the access key
  (`Authorization` header for the extension; for the web gallery, an `HttpOnly` + `SameSite=Strict` cookie
  holding a random session ID, revoked on logout).
- A share-link visitor only receives the capture's public information (never a local file path).
- Link passwords are hashed with scrypt; wrong attempts are throttled per link and per address.
- `Host` check (anti DNS-rebinding) and `Origin` check, no CORS, strict CSP.

## Known limitations

- Full page: pages whose content scrolls inside a sub-container (some web apps) only capture
  the visible part; max height ≈ 32,000 px (canvas limit).
- Chrome internal pages (`chrome://`, Chrome Web Store) cannot be captured.

## Roadmap

- Video: camera bubble for tab recordings too, faster trimming (WebCodecs), annotations on videos
- Automatic sync to your server (today: « Partager » button, one capture at a time)
- Chrome Web Store release (see [docs/CHROME-WEB-STORE.md](docs/CHROME-WEB-STORE.md))

## License

[AGPL-3.0-or-later](LICENSE): you may use, modify and redistribute LocalShot; if you offer
a modified version of the server to other people (over a network), you must publish your changes.
