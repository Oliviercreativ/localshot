# LocalShot — 100% local screenshots and screen recordings

A private alternative to Awesome Screenshot / Loom: a Chrome extension with **no Internet access at all**.
Captures and the gallery live **inside the extension**, on your computer. No server, no account, no upload.

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

## Privacy

- Permissions: `activeTab` (only the tab where **you** click / use the shortcut),
  `scripting` (scrolling for full page, selection frame), `downloads` (downloading),
  `unlimitedStorage` (no storage limit for captures), `sidePanel` (the side panel, which shows no warning and grants no access to your pages).
- Optional permission (only if you tick "Click effect"): access to pages, used only
  during a video recording to draw clicks, and handed back to Chrome as soon as you untick the option.
- No network access by default: the extension can only reach the transcription service you set (optional),
  approved in a Chrome prompt. Full policy: [PRIVACY.md](PRIVACY.md).
- No analytics, no account, no cloud.
- No permanent access to your sites: the extension does not read your pages in the background.

## Known limitations

- Full page: pages whose content scrolls inside a sub-container (some web apps) only capture
  the visible part; max height ≈ 32,000 px (canvas limit).
- Chrome internal pages (`chrome://`, Chrome Web Store) cannot be captured.

## Roadmap

- Video: camera bubble for tab recordings too, faster trimming (WebCodecs), annotations on videos
- Chrome Web Store publishing notes: [docs/CHROME-WEB-STORE.md](docs/CHROME-WEB-STORE.md)

## License

[AGPL-3.0-or-later](LICENSE): you may use, modify and redistribute LocalShot; if you distribute
a modified version, you must publish your changes under the same license.
