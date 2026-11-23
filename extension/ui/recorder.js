// Enregistreur vidéo façon Loom : tout se passe dans cette fenêtre de l'extension.
// getDisplayMedia (choix onglet / fenêtre / écran) + micro + bulle caméra → MediaRecorder → IndexedDB.
import { addCapture, newId } from '../db.js';
import { EN } from './i18n.js';
import { mountBar, ACTIVE } from './recbar.js';
import { mountDevicePicker, getDevice, emulate, DEVICES } from './device.js';

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

// ---------- Affichage : ordinateur, tablette ou mobile ----------
// Tablette / mobile : l'onglet de la page est simulé pendant tout l'enregistrement, puis rendu normal.
mountDevicePicker($('device'), {
  onError: (m) => { $('deviceErr').textContent = m; $('deviceErr').hidden = false; },
  onChange: () => { $('deviceErr').hidden = true; },
});
let deviceSession = null;
async function startDevice() {
  const device = await getDevice();
  if (device === 'desktop') return;
  const tab = await activeTab();
  if (!tab) return;
  try {
    deviceSession = await emulate(tab.id, device);
    $('liveHint').textContent = `${DEVICES[device].label} : choisissez l'onglet « ${tab.title || 'de la page'} » dans « Onglet Chrome ».`;
  } catch (e) {
    console.warn('LocalShot affichage :', e);
    $('liveHint').textContent = 'Cette page ne peut pas être affichée en tablette ou en mobile : elle est enregistrée telle quelle.';
  }
}
function stopDevice() { deviceSession?.detach(); deviceSession = null; }
// Bandeau de Chrome « Annuler » : la simulation s'arrête, l'enregistrement continue.
chrome.debugger?.onDetach.addListener(() => { deviceSession = null; });

// ---------- Effet de clic ----------
// Demande une permission facultative (accès aux pages) uniquement si l'option est cochée.
// Le script n'est injecté que pendant l'enregistrement, puis retiré.
const PAGES = { origins: ['http://*/*', 'https://*/*'] };
// Accès aux pages (facultatif) : demandé pour l'effet de clic, ou au premier outil d'annotation choisi.
let pagesOk = false;
const syncPages = () => chrome.permissions.contains(PAGES).then((ok) => (pagesOk = ok)).catch(() => {});
chrome.permissions.onAdded?.addListener(syncPages);
chrome.permissions.onRemoved?.addListener(syncPages);
chrome.permissions.contains(PAGES).then((ok) => { pagesOk = ok; $('clicks').checked = prefs.clicks && ok; });
$('clicks').addEventListener('change', async (e) => {
  if (e.target.checked && !(await chrome.permissions.request(PAGES).catch(() => false))) {
    e.target.checked = false;
    showError('Sans l\'autorisation de Chrome, l\'effet de clic ne peut pas s\'afficher dans les pages.');
  }
  // Option décochée : on rend l'accès aux pages, pour ne garder aucune autorisation inutile.
  if (!e.target.checked && !drawGranted) chrome.permissions.remove(PAGES).catch(() => {});
  savePrefs();
});

// ---------- Annotations pendant l'enregistrement ----------
// Les outils sont toujours proposés pendant l'enregistrement. draw.js n'est injecté que dans l'onglet affiché
// quand vous choisissez un outil. L'accès aux pages, demandé à ce moment-là, est rendu à la fin de l'enregistrement.
let drawing = null; // { tool, color } pendant l'enregistrement
let drawGranted = false; // accès accordé pour les annotations de cet enregistrement
let note = null, noteTimer; // message court affiché dans la barre et le panneau
const drawnTabs = new Set();
function say(text) {
  note = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note = null; renderBar(); }, 4000);
  renderBar();
}

// Fenêtre Chrome où dessiner : celle d'où l'enregistrement a été lancé, puis la dernière fenêtre normale utilisée.
let targetWin = Number(new URLSearchParams(location.search).get('win')) || null;
chrome.windows.onFocusChanged.addListener(async (wid) => {
  if (wid < 0) return;
  const w = await chrome.windows.get(wid).catch(() => null);
  // La barre flottante est vue par Chrome comme une fenêtre normale, mais toujours au premier plan : on l'ignore.
  if (w?.type === 'normal' && !w.alwaysOnTop) targetWin = wid;
});
async function activeTab() {
  let win = targetWin;
  if (!win) {
    const all = await chrome.windows.getAll({ windowTypes: ['normal'] }).catch(() => []);
    win = (all.find((w) => w.focused && !w.alwaysOnTop) || all.find((w) => !w.alwaysOnTop))?.id;
  }
  if (!win) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win }).catch(() => []);
  return tab || null;
}

// Appelé juste après un clic (barre flottante ou panneau) : la demande d'autorisation doit partir tout de suite.
function setDraw(tool, color) {
  if (!drawing) return;
  drawing = { tool: tool || null, color: color || drawing.color };
  renderBar();
  if (!tool) return applyDraw();
  if (pagesOk) return applyDraw();
  chrome.permissions.request(PAGES).then((ok) => {
    if (!ok) { drawing.tool = null; return say('Chrome n\'a pas autorisé LocalShot à dessiner sur les pages.'); }
    pagesOk = drawGranted = true;
    applyDraw();
  }, (e) => { console.warn('LocalShot annotations :', e); drawing.tool = null; say('Cliquez de nouveau sur l\'outil pour autoriser le dessin.'); });
}
async function applyDraw() {
  const tab = await activeTab();
  try {
    if (!tab?.url || !/^https?:/.test(tab.url)) {
      if (drawing.tool) { drawing.tool = null; say('Ouvrez une page web dans Chrome pour dessiner dessus.'); }
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['draw.js'] });
    drawnTabs.add(tab.id);
    // Les autres onglets arrêtent de capter la souris.
    for (const id of drawnTabs) if (id !== tab.id) chrome.tabs.sendMessage(id, { type: 'ls-draw', tool: null }).catch(() => {});
    await chrome.tabs.sendMessage(tab.id, { type: 'ls-draw', tool: drawing.tool, color: drawing.color });
  } catch (e) {
    console.warn('LocalShot annotations :', e);
    drawing.tool = null;
    say('Impossible de dessiner sur cette page.');
  }
}
async function clearDraw() {
  const tab = await activeTab();
  if (tab && drawnTabs.has(tab.id)) chrome.tabs.sendMessage(tab.id, { type: 'ls-draw-clear' }).catch(() => {});
}
function stopDraw() {
  for (const id of drawnTabs) chrome.tabs.sendMessage(id, { type: 'ls-draw-off' }).catch(() => {});
  drawnTabs.clear();
  drawing = null;
  // Accès accordé seulement pour dessiner : on le rend à Chrome.
  if (drawGranted && !$('clicks').checked) chrome.permissions.remove(PAGES).catch(() => {});
  drawGranted = false;
}

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
let recAudio = [], cdN = 0;
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
// Une seule fenêtre flottante : la bulle caméra si elle est cochée, sinon une barre seule (voir recbar.js).
let pip = null, bar = null, pipCam = false;
const status = () => ({ state, elapsed: elapsed(), count: cdN, bar: !!pip && !pipCam, draw: drawing, note });
const renderBar = () => bar?.render(status());

async function openPip(withCam) {
  if (pip) return true;
  if (!('documentPictureInPicture' in window)) return false;
  try {
    pip = await documentPictureInPicture.requestWindow(withCam ? { width: 240, height: 240 } : { width: 400, height: 96 });
  } catch (e) {
    console.warn('LocalShot fenêtre flottante :', e);
    pip = null;
    return false;
  }
  pipCam = withCam;
  pip.document.documentElement.lang = EN ? 'en' : 'fr';
  bar = mountBar(pip.document, { cam: withCam, onMain: mainAction, onStop: stop, onCancel: cancelRec, onDraw: setDraw, onClear: clearDraw });
  pip.addEventListener('pagehide', () => {
    pip = null; bar = null;
    if (pipCam) stopCam();
    pipCam = false;
    if (ACTIVE.includes(state)) renderLive();
    // Barre fermée pendant un enregistrement sans panneau latéral : on rouvre la fenêtre LocalShot pour garder les commandes.
    if (ACTIVE.includes(state)) sidePanelOpen().then((open) => open || focusSelf());
  });
  renderBar();
  return true;
}

// Barre flottante demandée depuis le panneau latéral. Chrome ne l'ouvre qu'après un clic dans cette fenêtre :
// sans clic récent, on montre la fenêtre avec son bouton « Barre flottante ».
async function detach() {
  if (await openPip(false)) return hideSelf();
  renderLive();
  focusSelf();
}
async function floatClick() {
  if (await openPip(false)) { renderLive(); hideSelf(); }
}

// Démarrer (état « prêt ») ou Pause / Reprendre.
function mainAction() { return state === 'ready' ? begin() : togglePause(); }

// Le panneau latéral est-il ouvert ? Il affiche alors les commandes, la barre flottante devient facultative.
async function sidePanelOpen() {
  try { return (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).length > 0; } catch { return false; }
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
    if (bar?.video) bar.video.srcObject = cam;
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
function closeBubble() { pip?.close(); pip = null; bar = null; pipCam = false; stopCam(); }
$('cam').addEventListener('change', (e) => (e.target.checked ? openBubble() : closeBubble()));

const focusSelf = () => chrome.windows.getCurrent().then((w) => chrome.windows.update(w.id, { state: 'normal', focused: true })).catch(() => {});
const hideSelf = () => chrome.windows.getCurrent().then((w) => w.type === 'popup' && chrome.windows.update(w.id, { state: 'minimized' })).catch(() => {});

// ---------- Enregistrement ----------
$('start').addEventListener('click', start);
$('pause').addEventListener('click', togglePause);
$('stop').addEventListener('click', stop);
$('go').addEventListener('click', begin);
$('float').addEventListener('click', floatClick);
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
  // Commandes : dans le panneau latéral s'il est ouvert, sinon dans une barre flottante.
  // Celle-ci s'ouvre tout de suite : Chrome ne l'autorise que juste après un clic.
  const withPanel = await sidePanelOpen();
  const hasBar = (pip && true) || (!withPanel && await openPip(false));
  await startDevice();
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      // Chrome ouvre son choix sur « Onglet Chrome » : seule la page est filmée, sans onglets ni panneau latéral.
      video: { displaySurface: 'browser', frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
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
    stopDevice();
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
  if (hasBar || withPanel) {
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
    cdN = n;
    renderBar();
    badge(String(n), '#f97316');
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (state !== 'countdown') return;
  $('count').textContent = '';
  cdN = 0;
  await startClicks();
  if (state !== 'countdown') return stopClicks(); // arrêté pendant la mise en place : cleanup() a déjà libéré l'écran

  drawing = { tool: null, color: '#f97316' };
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
  $('float').hidden = !!pip || !('documentPictureInPicture' in window);
  $('pause').hidden = ready || state === 'countdown';
  $('stop').hidden = ready || state === 'countdown';
  $('liveState').textContent = ready ? 'Prêt : cliquez sur Démarrer' : state === 'paused' ? 'En pause' : state === 'countdown' ? 'Préparez-vous…' : 'Enregistrement en cours';
  if (ready) $('timer').textContent = '0:00';
}

function update() {
  const t = fmtTime(elapsed());
  $('timer').textContent = t;
  renderBar();
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
  stopDevice();
  stopDraw();
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
  if (msg?.type === 'rec-status') send(status());
  else if (msg?.type === 'rec-main') mainAction();
  else if (msg?.type === 'rec-cancel') cancelRec();
  else if (msg?.type === 'rec-detach') detach();
  else if (msg?.type === 'rec-draw') setDraw(msg.tool, msg.color);
  else if (msg?.type === 'rec-draw-clear') clearDraw();
  else if (msg?.type === 'rec-draw-granted') { pagesOk = true; if (drawing) drawGranted = true; }
  else if (msg?.type === 'rec-undock') closeBar();
  else if (msg?.type === 'rec-stop') stop();
  else if (msg?.type === 'rec-start') begin();
  else if (msg?.type === 'rec-focus') focusSelf();
});

addEventListener('beforeunload', (e) => {
  if (['ready', 'countdown', 'recording', 'paused'].includes(state)) e.preventDefault();
});
addEventListener('pagehide', () => { if (state !== 'saving') badge(''); stopClicks(); stopDraw(); stopDevice(); pip?.close(); });
