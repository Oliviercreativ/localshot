// Enregistreur vidéo façon Loom : tout se passe dans cette fenêtre de l'extension.
// getDisplayMedia (choix onglet / fenêtre / écran) + micro + bulle caméra → MediaRecorder → IndexedDB.
import { addCapture, newId } from '../db.js';

const $ = (id) => document.getElementById(id);
const MIME = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
].find((t) => MediaRecorder.isTypeSupported(t));

// ---------- Préférences ----------
const prefs = { mic: true, sys: true, clicks: false, ...JSON.parse(localStorage.getItem('rec-prefs') || '{}') };
$('mic').checked = prefs.mic;
$('sys').checked = prefs.sys;
const savePrefs = () => localStorage.setItem('rec-prefs', JSON.stringify({ mic: $('mic').checked, sys: $('sys').checked, clicks: $('clicks').checked }));
$('mic').addEventListener('change', savePrefs);
$('sys').addEventListener('change', savePrefs);

// ---------- Effet de clic ----------
// Demande une permission facultative (accès aux pages) uniquement si l'option est cochée.
// Le script n'est injecté que pendant l'enregistrement, puis retiré.
const PAGES = { origins: ['http://*/*', 'https://*/*'] };
chrome.permissions.contains(PAGES).then((ok) => { $('clicks').checked = prefs.clicks && ok; });
$('clicks').addEventListener('change', async (e) => {
  if (e.target.checked && !(await chrome.permissions.request(PAGES).catch(() => false))) {
    e.target.checked = false;
    showError('Sans l\'autorisation de Chrome, l\'effet de clic ne peut pas s\'afficher dans les pages.');
  }
  savePrefs();
});

let clicksOn = false;
chrome.scripting.unregisterContentScripts({ ids: ['ls-clicks'] }).catch(() => {}); // reste d'une session interrompue
async function startClicks() {
  if (!$('clicks').checked || !(await chrome.permissions.contains(PAGES))) return;
  clicksOn = true;
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['ls-clicks'] }).catch(() => {});
    await chrome.scripting.registerContentScripts([{ id: 'ls-clicks', matches: ['http://*/*', 'https://*/*'], js: ['clicks.js'], runAt: 'document_start', allFrames: true, persistAcrossSessions: false }]);
  } catch (e) { console.warn('LocalShot clics :', e); }
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => []);
  await Promise.all(tabs.map((t) => chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['clicks.js'] }).catch(() => {})));
}
async function stopClicks() {
  if (!clicksOn) return;
  clicksOn = false;
  await chrome.scripting.unregisterContentScripts({ ids: ['ls-clicks'] }).catch(() => {});
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => []);
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'ls-clicks-off' }).catch(() => {});
}

// ---------- État ----------
let state = 'idle'; // idle | countdown | recording | paused | saving
let display, mic, cam, audioCtx, recorder, vTrack;
let chunks = [], startedAt = 0, pausedAt = 0, pausedTotal = 0, duration = 0, discard = false;
let thumb = null, size = { width: 0, height: 0 }, tick;
let pip = null, bubble = null; // fenêtre flottante de la caméra

const elapsed = () => (!startedAt ? 0 : (state === 'paused' ? pausedAt : performance.now()) - startedAt - pausedTotal);
const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const badge = (text, color = '#dc2626') => {
  chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
  chrome.action.setBadgeText({ text }).catch(() => {});
};
const show = (id) => ['setup', 'live', 'saving'].forEach((s) => ($(s).hidden = s !== id));
function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }

// ---------- Bulle caméra (Document Picture-in-Picture : toujours au premier plan) ----------
const BUBBLE_CSS = `
  html,body{margin:0;height:100%;background:#0f172a;overflow:hidden;font:600 13px -apple-system,system-ui,sans-serif;color:#fff}
  video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}
  .cd{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-size:72px;font-weight:800;background:rgba(15,23,42,.55)}
  .bar{position:fixed;left:8px;right:8px;bottom:8px;display:flex;gap:6px;align-items:center;justify-content:center;opacity:0;transition:opacity .15s}
  body:hover .bar{opacity:1}
  .bar span{background:rgba(15,23,42,.8);padding:6px 8px;border-radius:8px;font-family:ui-monospace,Menlo,monospace}
  .bar button{border:0;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer;background:rgba(15,23,42,.8);color:#fff}
  .bar button.stop{background:#dc2626}
  [hidden]{display:none!important}`;

async function openBubble() {
  showError('');
  try {
    if ('documentPictureInPicture' in window) {
      pip = await documentPictureInPicture.requestWindow({ width: 240, height: 240 });
      const d = pip.document;
      d.title = 'LocalShot — caméra';
      d.head.append(Object.assign(d.createElement('style'), { textContent: BUBBLE_CSS }));
      d.body.innerHTML = '<video autoplay muted playsinline></video><div class="cd" hidden></div>' +
        '<div class="bar" hidden><span class="t">0:00</span><button class="pause" title="Pause">❚❚</button><button class="stop" title="Terminer">■</button></div>';
      bubble = { video: d.querySelector('video'), cd: d.querySelector('.cd'), bar: d.querySelector('.bar'), t: d.querySelector('.t'), pause: d.querySelector('.pause') };
      bubble.pause.addEventListener('click', togglePause);
      d.querySelector('.stop').addEventListener('click', stop);
      pip.addEventListener('pagehide', () => { pip = null; bubble = null; stopCam(); });
    }
    cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' }, audio: false });
    if (bubble) bubble.video.srcObject = cam;
    else Object.assign($('camPreview'), { srcObject: cam, hidden: false });
  } catch (e) {
    console.warn('LocalShot caméra :', e);
    closeBubble();
    showError('Caméra indisponible ou refusée.');
  }
}
function stopCam() {
  cam?.getTracks().forEach((t) => t.stop());
  cam = null;
  $('cam').checked = false;
  $('camPreview').hidden = true;
}
function closeBubble() { pip?.close(); pip = null; bubble = null; stopCam(); }
$('cam').addEventListener('change', (e) => (e.target.checked ? openBubble() : closeBubble()));

// ---------- Enregistrement ----------
$('start').addEventListener('click', start);
$('pause').addEventListener('click', togglePause);
$('stop').addEventListener('click', stop);
$('cancel').addEventListener('click', () => {
  if (state === 'recording' || state === 'paused') {
    if (!confirm('Abandonner cet enregistrement ? La vidéo ne sera pas gardée.')) return;
  }
  discard = true;
  stop();
});

async function start() {
  if (state !== 'idle') return;
  showError('');
  $('liveHint').textContent = '';
  discard = false;
  if (!MIME) return showError('Ce navigateur ne sait pas enregistrer de vidéo.');
  const withSys = $('sys').checked;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
      audio: withSys,
      systemAudio: withSys ? 'include' : 'exclude',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  } catch (e) {
    console.warn('LocalShot getDisplayMedia :', e);
    if (e.name === 'NotAllowedError' && /system/i.test(e.message)) {
      showError('macOS bloque l\'enregistrement : ouvrez Réglages Système → Confidentialité et sécurité → Enregistrement de l\'écran, autorisez Google Chrome, puis relancez Chrome.');
    } else if (e.name === 'NotAllowedError') {
      showError('Enregistrement annulé. Si la fenêtre de choix (onglet / fenêtre / écran) ne s\'est pas affichée, vérifiez que Chrome a le droit d\'enregistrer l\'écran dans Réglages Système → Confidentialité et sécurité.');
    } else {
      showError(`Impossible de démarrer : ${e.message}`);
    }
    return;
  }

  if ($('mic').checked) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      $('liveHint').textContent = 'Micro refusé : la vidéo est enregistrée sans votre voix.';
    }
  }

  vTrack = display.getVideoTracks()[0];
  const st = vTrack.getSettings();
  size = { width: st.width || 0, height: st.height || 0 };
  vTrack.addEventListener('ended', stop); // bouton « Arrêter le partage » de Chrome
  if (cam && st.displaySurface && st.displaySurface !== 'monitor') {
    $('liveHint').textContent = `${$('liveHint').textContent} La bulle caméra n'apparaît dans la vidéo que si vous enregistrez l'écran entier.`.trim();
  }

  // Mixage : son de l'onglet + micro
  const tracks = [...display.getAudioTracks(), ...(mic?.getAudioTracks() || [])];
  let audio = tracks;
  if (tracks.length > 1) {
    audioCtx = new AudioContext();
    await audioCtx.resume().catch(() => {});
    const dest = audioCtx.createMediaStreamDestination();
    for (const t of tracks) audioCtx.createMediaStreamSource(new MediaStream([t])).connect(dest);
    audio = dest.stream.getAudioTracks();
  }

  show('live');
  state = 'countdown';
  for (let n = 3; n > 0; n--) {
    if (state !== 'countdown') return;
    $('count').textContent = n;
    if (bubble) { bubble.cd.textContent = n; bubble.cd.hidden = false; }
    badge(String(n), '#f97316');
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (state !== 'countdown') return;
  $('count').textContent = '';
  if (bubble) { bubble.cd.hidden = true; bubble.bar.hidden = false; }
  await startClicks();

  recorder = new MediaRecorder(new MediaStream([vTrack, ...audio]), { mimeType: MIME, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = finish;
  recorder.start(1000);
  startedAt = performance.now();
  state = 'recording';
  tick = setInterval(update, 500);
  update();
  setTimeout(grabThumb, 700);

  // On range la fenêtre pour qu'elle n'apparaisse pas dans la vidéo.
  chrome.windows.getCurrent().then((w) => w.type === 'popup' && chrome.windows.update(w.id, { state: 'minimized' })).catch(() => {});
}

function update() {
  const t = fmtTime(elapsed());
  $('timer').textContent = t;
  if (bubble) bubble.t.textContent = t;
  if (state === 'recording') badge(t.length <= 4 ? t : 'REC');
}

function togglePause() {
  if (state === 'recording') {
    recorder.pause();
    pausedAt = performance.now();
    state = 'paused';
    $('pause').textContent = '▶ Reprendre';
    $('liveState').textContent = 'En pause';
    if (bubble) bubble.pause.textContent = '▶';
    badge('II', '#64748b');
  } else if (state === 'paused') {
    pausedTotal += performance.now() - pausedAt;
    recorder.resume();
    state = 'recording';
    $('pause').textContent = '❚❚ Pause';
    $('liveState').textContent = 'Enregistrement en cours';
    if (bubble) bubble.pause.textContent = '❚❚';
    update();
  }
}

function stop() {
  if (state === 'recording' || state === 'paused') {
    duration = elapsed() / 1000;
    state = 'saving';
    clearInterval(tick);
    if (!discard) show('saving');
    recorder.stop(); // → finish()
  } else if (state === 'countdown') {
    state = 'idle';
    cleanup();
    if (discard) window.close();
    else { show('setup'); discard = false; }
  } else if (state === 'idle' && discard) {
    cleanup();
    window.close();
  }
}

function cleanup() {
  stopClicks();
  for (const s of [display, mic]) s?.getTracks().forEach((t) => t.stop());
  display = mic = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  badge('');
}

async function finish() {
  cleanup();
  closeBubble();
  if (discard) return window.close();
  const type = MIME.split(';')[0];
  const blob = new Blob(chunks, { type });
  chunks = [];
  const createdAt = new Date();
  const rec = {
    id: newId(),
    kind: 'video',
    title: `Vidéo du ${createdAt.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
    sourceUrl: '',
    mode: 'video',
    mime: type,
    width: size.width,
    height: size.height,
    duration,
    size: blob.size,
    createdAt: createdAt.toISOString(),
    blob,
    thumb,
  };
  try {
    await addCapture(rec);
    await chrome.tabs.create({ url: chrome.runtime.getURL(`ui/viewer.html?id=${rec.id}`) });
  } catch (e) {
    // Stockage impossible : on télécharge directement le fichier pour ne rien perdre.
    console.warn('LocalShot: stockage impossible, téléchargement direct.', e);
    const url = URL.createObjectURL(blob);
    const stamp = rec.createdAt.replace(/[:.]/g, '-').slice(0, 19);
    await chrome.downloads.download({ url, filename: `LocalShot/video-${stamp}.${type === 'video/mp4' ? 'mp4' : 'webm'}` });
    await new Promise((r) => setTimeout(r, 3000));
  }
  window.close();
}

// Miniature (image de la 1re seconde), 480×300, recadrée au centre
async function grabThumb() {
  try {
    if (!vTrack || vTrack.readyState !== 'live') return;
    const bmp = await new ImageCapture(vTrack).grabFrame();
    const W = 480, H = 300;
    const s = Math.max(W / bmp.width, H / bmp.height);
    const c = new OffscreenCanvas(W, H);
    c.getContext('2d').drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    thumb = await c.convertToBlob({ type: 'image/webp', quality: 0.8 });
    if (!size.width) size = { width: bmp.width, height: bmp.height };
  } catch (e) {
    console.warn('LocalShot miniature :', e);
  }
}

// ---------- Pilotage depuis le popup, le raccourci ou le service worker ----------
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type === 'rec-status') send({ state, elapsed: elapsed() });
  else if (msg?.type === 'rec-stop') stop();
  else if (msg?.type === 'rec-focus') {
    chrome.windows.getCurrent().then((w) => chrome.windows.update(w.id, { state: 'normal', focused: true })).catch(() => {});
  }
});

addEventListener('beforeunload', (e) => {
  if (state === 'recording' || state === 'paused' || state === 'countdown') e.preventDefault();
});
addEventListener('pagehide', () => { if (state !== 'saving') badge(''); stopClicks(); pip?.close(); });
