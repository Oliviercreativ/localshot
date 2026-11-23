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

After a capture, its page opens: editable title, copy image, download, delete.
The gallery opens from the popup (« Ouvrir la galerie », Open gallery). Shortcuts can be changed in `chrome://extensions/shortcuts`.

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

⚠️ Captures are stored in the browser (the extension's IndexedDB): **uninstalling the extension
deletes them**. The gallery's « Tout télécharger » (Download all) button copies everything to `Downloads/LocalShot/`.

## Sharing over Wi-Fi (optional)

Only if you want to send a link to your phone or another computer:

```bash
npm run start:lan
```

Then, on a capture or video page: **« Partager »** (Share) → the link is copied. Only that capture is
copied to the local server (`data/` folder); « Arrêter le partage » (Stop sharing) removes it. Node ≥ 18, no dependencies (≥ 20.6 for `npm run start:env`).
`npm start` runs the server without exposing it to the network (useful for testing).

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
3. In the extension: gallery → **« Serveur »** (Server) → address `https://<pi-name>.<tailnet>.ts.net` + the key.
   Chrome asks for access to that single address only.
4. On the iPhone, open the same address in Safari and enter the key: the gallery appears.

The server only listens on the Pi's `127.0.0.1`; only Tailscale (your devices) can reach it.
Key and settings: `/etc/localshot.env` on the Pi. Logs: `journalctl -u localshot`.

## Privacy

- Permissions: `activeTab` (only the tab where **you** click / use the shortcut),
  `scripting` (scrolling for full page, selection frame), `downloads` (downloading),
  `unlimitedStorage` (no storage limit for captures).
- Optional permission (only if you tick "Click effect"): access to pages, used only
  during a video recording to draw clicks, and handed back to Chrome as soon as you untick the option.
- Only allowed network address: `http://localhost:4777` (the sharing server, if running),
  plus your own server's address if you set one (permission requested for that single address).
  No analytics, no account, no cloud.
- No permanent access to your sites: the extension does not read your pages in the background.

Sharing server:
- `npm start` listens only on `127.0.0.1`; `npm run start:lan` makes links reachable over Wi-Fi.
- Only captures whose link is known (random `/c/<id>`) are visible from the network;
  listing, adding and deleting are only possible from this computer.
- On the Pi (`LOCALSHOT_TOKEN` set): listing, adding and deleting require the access key
  (`Authorization` header for the extension; for the web gallery, an `HttpOnly` + `SameSite=Strict` cookie
  holding a random session ID, revoked on logout).
- A share-link visitor only receives the capture's public information (never a local file path).
- `Host` check (anti DNS-rebinding) and `Origin` check, no CORS, strict CSP.

## Known limitations

- Full page: pages whose content scrolls inside a sub-container (some web apps) only capture
  the visible part; max height ≈ 32,000 px (canvas limit).
- Chrome internal pages (`chrome://`, Chrome Web Store) cannot be captured.

## Roadmap

- Video: camera bubble for tab recordings too, trimming start and end, importing videos from the computer
- Installable PWA on phone and other computers (served by the Pi)
- Automatic sync to the Pi (today: « Partager » button, one capture at a time)
- Annotations (arrows, text, blur)
- English interface

## License

[AGPL-3.0-or-later](LICENSE): you may use, modify and redistribute LocalShot; if you offer
a modified version of the server to other people (over a network), you must publish your changes.
