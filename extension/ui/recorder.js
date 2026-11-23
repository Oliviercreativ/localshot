// Enregistreur vidéo façon Loom : tout se passe dans cette fenêtre de l'extension.
// getDisplayMedia (choix onglet / fenêtre / écran) + micro + bulle caméra → MediaRecorder → IndexedDB.
import { addCapture, newId } from '../db.js';
import { tr, EN } from './i18n.js';

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
  // Option décochée : on rend l'accès aux pages, pour ne garder aucune autorisation inutile.
  if (!e.target.checked) chrome.permissions.remove(PAGES).catch(() => {});
  savePrefs();
});

// clicksGen change à chaque arrêt : un démarrage encore en cours voit qu'il a été annulé et défait ce qu'il a fait.
let clicksGen = 0;
chrome.scripting.unregisterContentScripts({ ids: ['ls-clicks'] }).catch(() => {}); // reste d'une session interrompue
async function startClicks() {
  const gen = ++clicksGen;
  const cancelled = () => gen !== clicksGen;
  if (!$('clicks').checked || !(await chrome.permissions.contains(PAGES)) || cancelled()) return;
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['ls-clicks'] }).catch(() => {});
    if (cancelled()) return stopClicks();
    await chrome.scripting.registerContentScripts([{ id: 'ls-clicks', matches: ['http://*/*', 'https://*/*'], js: ['clicks.js'], runAt: 'document_start', allFrames: true, persistAcrossSessions: false }]);
  } catch (e) { console.warn('LocalShot clics :', e); }
  if (cancelled()) return stopClicks();
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => []);
  if (cancelled()) return stopClicks();
  await Promise.all(tabs.map((t) => chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['clicks.js'] }).catch(() => {})));
  if (cancelled()) return stopClicks();
}
// Retire toujours le script (sans dépendre d'un état qui pourrait être faux) et annule un démarrage en cours.
async function stopClicks() {
  clicksGen++;
  await chrome.scripting.unregisterContentScripts({ ids: ['ls-clicks'] }).catch(() => {});
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => []);
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'ls-clicks-off' }).catch(() => {});
}

// ---------- État ----------
let state = 'idle'; // idle | ready | countdown | recording | paused | saving
let display, mic, cam, audioCtx, recorder, vTrack;
let recAudio = [];
let chunks = [], startedAt = 0, pausedAt = 0, pausedTotal = 0, duration = 0, discard = false;
let thumb = null, size = { width: 0, height: 0 }, tick;

const elapsed = () => (!startedAt ? 0 : (state === 'paused' ? pausedAt : performance.now()) - startedAt - pausedTotal);
const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const badge = (text, color = '#dc2626') => {
  chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
  chrome.action.setBadgeText({ text }).catch(() => {});
};
const show = (id) => ['setup', 'live', 'saving'].forEach((s) => ($(s).hidden = s !== id));
function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }

// ---------- Barre flottante et bulle caméra (Document Picture-in-Picture : toujours au premier plan) ----------
// Une seule fenêtre flottante : la bulle caméra si elle est cochée, sinon une barre seule.
// Elle affiche le chrono et les commandes : Démarrer, Pause / Reprendre, Terminer, Annuler.
const PIP_CSS = `
  html,body{margin:0;height:100%;background:#0f172a;overflow:hidden;font:600 13px -apple-system,system-ui,sans-serif;color:#fff;user-select:none}
  video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}
  .cd{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-size:72px;font-weight:800;background:rgba(15,23,42,.55)}
  .bar{display:flex;gap:6px;align-items:center}
  body.cam .bar{position:fixed;left:6px;right:6px;bottom:6px;justify-content:center;flex-wrap:wrap;opacity:0;transition:opacity .15s}
  body.cam:hover .bar,body.cam.show .bar,body.cam .bar:focus-within{opacity:1}
  body.solo .bar{height:100%;padding:0 10px}
  .st{display:flex;align-items:center;gap:7px;background:rgba(15,23,42,.85);padding:6px 9px;border-radius:8px}
  body.solo .st{background:none;padding:0 4px 0 0;margin-right:auto}
  .dot{width:9px;height:9px;border-radius:50%;background:#94a3b8;flex:none}
  .dot.on{background:#ef4444;animation:blink 1.2s steps(2,start) infinite}
  @keyframes blink{to{opacity:.25}}
  @media (prefers-reduced-motion:reduce){.dot.on{animation:none}}
  .t{font-family:ui-monospace,Menlo,monospace;font-size:14px;min-width:40px}
  button{border:0;border-radius:8px;padding:7px 10px;font:inherit;cursor:pointer;background:rgba(255,255,255,.12);color:#fff;white-space:nowrap}
  body.cam button{background:rgba(15,23,42,.85)}
  button:hover{background:rgba(255,255,255,.22)}
  button:focus-visible{outline:2px solid #f97316;outline-offset:1px}
  button:disabled{opacity:.45;cursor:default}
  button.go{background:#f97316}
  button.go:hover{background:#ea580c}
  button.stop{background:#dc2626}
  button.stop:hover{background:#b91c1c}
  button.x.sure{background:#fff;color:#b91c1c}
  body.cam .lbl{display:none}
  [hidden]{display:none!important}`;

let pip = null, ui = null, pipCam = false;

async function openPip(withCam) {
  if (pip) return true;
  if (!('documentPictureInPicture' in window)) return false;
  try {
    pip = await documentPictureInPicture.requestWindow(withCam ? { width: 240, height: 240 } : { width: 380, height: 52 });
  } catch (e) {
    console.warn('LocalShot fenêtre flottante :', e);
    pip = null;
    return false;
  }
  pipCam = withCam;
  const d = pip.document;
  d.title = 'LocalShot';
  d.documentElement.lang = EN ? 'en' : 'fr';
  d.head.append(Object.assign(d.createElement('style'), { textContent: PIP_CSS }));
  d.body.className = withCam ? 'cam' : 'solo';
  d.body.innerHTML = (withCam ? '<video autoplay muted playsinline></video><div class="cd" hidden></div>' : '') +
    '<div class="bar" hidden><span class="st" role="timer"><span class="dot"></span><span class="t">0:00</span></span>' +
    '<button class="main"></button><button class="stop"></button><button class="x"></button></div>';
  const q = (sel) => d.querySelector(sel);
  ui = { video: q('video'), cd: q('.cd'), bar: q('.bar'), dot: q('.dot'), t: q('.t'), main: q('.main'), stop: q('.stop'), x: q('.x') };
  ui.main.addEventListener('click', () => (state === 'ready' ? begin() : togglePause()));
  ui.stop.addEventListener('click', stop);
  // Annuler en deux clics (les boîtes de dialogue ne s'affichent pas dans la fenêtre flottante).
  let sureTimer;
  ui.x.addEventListener('click', () => {
    if (state === 'ready' || ui.x.classList.contains('sure')) { clearTimeout(sureTimer); return cancelRec(); }
    ui.x.classList.add('sure');
    setLabel(ui.x, '✕', tr('Supprimer la vidéo ?'));
    sureTimer = setTimeout(() => { ui?.x.classList.remove('sure'); renderBar(); }, 3000);
  });
  pip.addEventListener('pagehide', () => {
    pip = null; ui = null;
    if (pipCam) stopCam();
    pipCam = false;
    // Barre fermée pendant un enregistrement : on rouvre la fenêtre LocalShot pour garder les commandes.
    if (['ready', 'countdown', 'recording', 'paused'].includes(state)) focusSelf();
  });
  renderBar();
  return true;
}

// Bouton : icône toujours visible, texte masqué dans la bulle caméra (trop étroite), info-bulle et nom accessible.
function setLabel(btn, icon, text) {
  btn.innerHTML = `${icon}<span class="lbl"> ${text}</span>`;
  btn.title = text;
  btn.setAttribute('aria-label', text);
}

function renderBar() {
  if (!ui) return;
  const active = ['ready', 'countdown', 'recording', 'paused'].includes(state);
  ui.bar.hidden = !active;
  if (!active) return;
  ui.dot.classList.toggle('on', state === 'recording');
  // Bulle caméra : pendant l'enregistrement, la barre n'apparaît qu'au survol, pour ne pas cacher le visage dans la vidéo.
  ui.bar.ownerDocument.body.classList.toggle('show', state !== 'recording');
  ui.main.className = state === 'ready' ? 'main go' : 'main';
  ui.main.disabled = state === 'countdown';
  if (state === 'ready' || state === 'countdown') setLabel(ui.main, '●', tr('Démarrer'));
  else if (state === 'paused') setLabel(ui.main, '▶', tr('Reprendre'));
  else setLabel(ui.main, '❚❚', tr('Pause'));
  ui.stop.className = 'stop';
  ui.stop.hidden = state === 'ready' || state === 'countdown';
  setLabel(ui.stop, '■', tr('Terminer'));
  if (!ui.x.classList.contains('sure')) setLabel(ui.x, '✕', tr('Annuler'));
  ui.t.textContent = state === 'ready' ? '0:00' : ui.t.textContent;
}

// Ferme la barre seule ; la bulle caméra, elle, reste ouverte avec sa barre masquée.
function closeBar() {
  if (pip && !pipCam) pip.close();
  else renderBar();
}

async function openBubble() {
  showError('');
  await openPip(true);
  try {
    cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' }, audio: false });
    if (ui?.video) ui.video.srcObject = cam;
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
function closeBubble() { pip?.close(); pip = null; ui = null; pipCam = false; stopCam(); }
$('cam').addEventListener('change', (e) => (e.target.checked ? openBubble() : closeBubble()));

const focusSelf = () => chrome.windows.getCurrent().then((w) => chrome.windows.update(w.id, { state: 'normal', focused: true })).catch(() => {});
const hideSelf = () => chrome.windows.getCurrent().then((w) => w.type === 'popup' && chrome.windows.update(w.id, { state: 'minimized' })).catch(() => {});

// ---------- Enregistrement ----------
$('start').addEventListener('click', start);
$('pause').addEventListener('click', togglePause);
$('stop').addEventListener('click', stop);
$('go').addEventListener('click', begin);
$('cancel').addEventListener('click', () => {
  if (state === 'recording' || state === 'paused') {
    if (!confirm('Abandonner cet enregistrement ? La vidéo ne sera pas gardée.')) return;
  }
  cancelRec();
});
function cancelRec() { discard = true; stop(); }

async function start() {
  if (state !== 'idle') return;
  showError('');
  $('liveHint').textContent = '';
  discard = false;
  if (!MIME) return showError('Ce navigateur ne sait pas enregistrer de vidéo.');
  const withSys = $('sys').checked;
  // La barre flottante s'ouvre tout de suite : Chrome ne l'autorise que juste après un clic.
  const hasBar = await openPip(false);
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
    closeBar();
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

  recAudio = audio;
  show('live');
  // Avec la barre flottante : on attend « Démarrer », le temps de préparer son écran.
  // Sans elle (navigateur trop ancien) : on démarre directement, comme avant.
  if (hasBar && pip) {
    state = 'ready';
    renderLive();
    renderBar();
    hideSelf();
  } else {
    begin();
  }
}

async function begin() {
  if (state !== 'ready' && state !== 'idle') return;
  if (!display) return;
  state = 'countdown';
  renderLive();
  renderBar();
  for (let n = 3; n > 0; n--) {
    if (state !== 'countdown') return;
    $('count').textContent = n;
    if (ui?.cd) { ui.cd.textContent = n; ui.cd.hidden = false; }
    else if (ui) ui.t.textContent = `${n}…`;
    badge(String(n), '#f97316');
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (state !== 'countdown') return;
  $('count').textContent = '';
  if (ui?.cd) ui.cd.hidden = true;
  await startClicks();
  if (state !== 'countdown') return stopClicks(); // arrêté pendant la mise en place : cleanup() a déjà libéré l'écran

  recorder = new MediaRecorder(new MediaStream([vTrack, ...recAudio]), { mimeType: MIME, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = finish;
  recorder.start(1000);
  startedAt = performance.now();
  pausedTotal = 0;
  state = 'recording';
  renderLive();
  renderBar();
  tick = setInterval(update, 500);
  update();
  setTimeout(grabThumb, 700);

  // On range la fenêtre pour qu'elle n'apparaisse pas dans la vidéo.
  hideSelf();
}

// Fenêtre LocalShot : quels boutons montrer selon l'état.
function renderLive() {
  const ready = state === 'ready';
  $('go').hidden = !ready;
  $('pause').hidden = ready || state === 'countdown';
  $('stop').hidden = ready || state === 'countdown';
  $('liveState').textContent = ready ? 'Prêt : cliquez sur Démarrer' : state === 'paused' ? 'En pause' : state === 'countdown' ? 'Préparez-vous…' : 'Enregistrement en cours';
  if (ready) $('timer').textContent = '0:00';
}

function update() {
  const t = fmtTime(elapsed());
  $('timer').textContent = t;
  if (ui) ui.t.textContent = t;
  if (state === 'recording') badge(t.length <= 4 ? t : 'REC');
}

function togglePause() {
  if (state === 'recording') {
    recorder.pause();
    pausedAt = performance.now();
    state = 'paused';
    $('pause').textContent = '▶ Reprendre';
    renderLive();
    renderBar();
    badge('II', '#64748b');
  } else if (state === 'paused') {
    pausedTotal += performance.now() - pausedAt;
    recorder.resume();
    state = 'recording';
    $('pause').textContent = '❚❚ Pause';
    renderLive();
    renderBar();
    update();
  }
}

function stop() {
  if (state === 'recording' || state === 'paused') {
    duration = elapsed() / 1000;
    state = 'saving';
    clearInterval(tick);
    if (!discard) show('saving');
    renderBar();
    recorder.stop(); // → finish()
  } else if (state === 'countdown' || state === 'ready') {
    state = 'idle';
    cleanup();
    closeBar();
    if (discard) window.close();
    else { show('setup'); discard = false; focusSelf(); }
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
  else if (msg?.type === 'rec-start') begin();
  else if (msg?.type === 'rec-focus') focusSelf();
});

addEventListener('beforeunload', (e) => {
  if (['ready', 'countdown', 'recording', 'paused'].includes(state)) e.preventDefault();
});
addEventListener('pagehide', () => { if (state !== 'saving') badge(''); stopClicks(); pip?.close(); });
