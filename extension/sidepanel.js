// Panneau latéral : mêmes actions que le popup, plus les captures récentes, toujours visibles à droite.
import { listCaptures, CHANGES } from './db.js';
import { openRecorder, recorderStatus } from './recorder-launch.js';
import { ACTIVE, fmtTime, DRAW_TOOLS, DRAW_COLORS } from './ui/recbar.js';
import { h, fmtDate, fmtDuration, isVideo } from './ui/common.js';

const $ = (id) => document.getElementById(id);
const page = (p) => chrome.tabs.create({ url: chrome.runtime.getURL(p) });

// ---------- Captures ----------
const errorBox = $('error');
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = !msg;
}

document.querySelectorAll('[data-mode]').forEach((btn) =>
  btn.addEventListener('click', async () => {
    showError('');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Sans la permission « tabs », l'adresse n'est connue que pour un onglet déjà autorisé.
    const url = tab?.url || tab?.pendingUrl;
    if (!tab || (url && !/^(https?|file):/i.test(url))) {
      return showError('Ouvrez d\'abord une page web dans cet onglet : Chrome interdit de capturer ses propres pages.');
    }
    btn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'capture', mode: btn.dataset.mode, tabId: tab.id, reply: true });
      if (res?.error) {
        showError(/permission|activeTab|all_urls|Cannot access/i.test(res.error)
          ? 'Chrome n\'autorise la capture que sur un onglet où vous avez cliqué l\'icône LocalShot. Utilisez le raccourci (⌥⇧V, ⌥⇧F ou ⌥⇧S) ou l\'icône pour cet onglet.'
          : `Capture impossible : ${res.error}`);
      }
    } finally {
      btn.disabled = false;
    }
  })
);

// ---------- Vidéo ----------
const recBtn = $('record');
let live = false;
recBtn.addEventListener('click', async () => {
  recBtn.disabled = true;
  try {
    if (live) await chrome.runtime.sendMessage({ type: 'rec-stop' }).catch(() => {});
    else await openRecorder();
  } catch (e) {
    showError(`Vidéo : ${e.message}`);
  } finally {
    recBtn.disabled = false;
    refreshRecorder();
  }
});

// Pendant un enregistrement, les commandes s'affichent ici ; « Détacher » les met aussi dans une barre flottante.
const send = (type) => chrome.runtime.sendMessage({ type }).catch(() => {});
let rec = { state: 'idle' }, sureTimer;

async function refreshRecorder() {
  rec = (await recorderStatus()) || { state: 'idle' };
  live = ACTIVE.includes(rec.state);
  recBtn.hidden = live;
  $('recCtl').hidden = !live;
  if (!live) {
    recBtn.classList.remove('live');
    $('recLabel').textContent = rec.state === 'saving' ? 'Enregistrement de la vidéo…' : 'Enregistrer une vidéo';
    return;
  }
  const { state } = rec;
  $('rcDot').classList.toggle('on', state === 'recording');
  $('rcState').textContent = { ready: 'Prêt', countdown: 'Préparez-vous…', recording: 'Enregistrement', paused: 'En pause' }[state];
  $('rcTime').textContent = state === 'countdown' ? `${rec.count || ''}…` : fmtTime(state === 'ready' ? 0 : rec.elapsed);
  const main = $('rcMain');
  main.textContent = state === 'ready' || state === 'countdown' ? '● Démarrer' : state === 'paused' ? '▶ Reprendre' : '❚❚ Pause';
  main.classList.toggle('go', state === 'ready');
  main.disabled = state === 'countdown';
  $('rcStop').hidden = state === 'ready' || state === 'countdown';
  if (!$('rcCancel').classList.contains('sure')) $('rcCancel').textContent = '✕ Annuler';
  $('rcTools').hidden = !rec.draw || !['recording', 'paused'].includes(state);
  $('rcNote').hidden = !rec.note;
  $('rcNote').textContent = rec.note || '';
  if (rec.draw) {
    for (const b of $('rcTools').querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === rec.draw.tool));
    for (const b of $('rcTools').querySelectorAll('[data-c]')) b.setAttribute('aria-pressed', String(b.dataset.c === rec.draw.color));
  }
  $('rcDetach').textContent = rec.bar ? '↙ Fermer la barre flottante' : '↗ Détacher la barre';
}

// Outils d'annotation : un clic sur l'outil actif arrête de dessiner.
{
  const box = $('rcTools');
  const mk = (cls, text, label, fn) => {
    const b = h('button', { type: 'button', class: cls, title: label, 'aria-label': label }, text);
    b.addEventListener('click', fn);
    box.append(b);
    return b;
  };
  // Accès aux pages : demandé ici, au clic, la première fois qu'un outil est choisi.
  const PAGES = { origins: ['http://*/*', 'https://*/*'] };
  let pagesOk = false;
  const sync = () => chrome.permissions.contains(PAGES).then((ok) => (pagesOk = ok)).catch(() => {});
  sync();
  chrome.permissions.onAdded?.addListener(sync);
  chrome.permissions.onRemoved?.addListener(sync);
  const sendDraw = (tool, color) => chrome.runtime.sendMessage({ type: 'rec-draw', tool, color }).catch(() => {}).then(() => setTimeout(refreshRecorder, 150));
  const draw = (tool, color) => {
    if (!tool || pagesOk) return sendDraw(tool, color);
    chrome.permissions.request(PAGES).then((ok) => {
      if (!ok) return showError('Chrome n\'a pas autorisé LocalShot à dessiner sur les pages.');
      pagesOk = true;
      chrome.runtime.sendMessage({ type: 'rec-draw-granted' }).catch(() => {});
      sendDraw(tool, color);
    }, (e) => showError(e.message));
  };
  for (const [id, icon, label] of DRAW_TOOLS) mk('tool', icon, label, () => draw(rec.draw?.tool === id ? null : id, rec.draw?.color)).dataset.tool = id;
  box.append(h('span', { class: 'sep' }));
  for (const c of DRAW_COLORS) Object.assign(mk('sw', '', 'Couleur', () => draw(rec.draw?.tool || 'pen', c)), { style: `background:${c}` }).dataset.c = c;
  mk('clear', '⌫', 'Effacer les annotations', () => send('rec-draw-clear'));
}

$('rcMain').addEventListener('click', () => send('rec-main').then(refreshRecorder));
$('rcStop').addEventListener('click', () => send('rec-stop').then(refreshRecorder));
$('rcCancel').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (rec.state === 'ready' || b.classList.contains('sure')) {
    clearTimeout(sureTimer);
    b.classList.remove('sure');
    return send('rec-cancel').then(refreshRecorder);
  }
  b.classList.add('sure');
  b.textContent = 'Supprimer la vidéo ?';
  sureTimer = setTimeout(() => { b.classList.remove('sure'); refreshRecorder(); }, 3000);
});
// Chrome n'ouvre pas de fenêtre flottante depuis le panneau latéral : c'est la fenêtre d'enregistrement qui s'en charge.
$('rcDetach').addEventListener('click', () => send(rec.bar ? 'rec-undock' : 'rec-detach').then(() => setTimeout(refreshRecorder, 300)));
// Le chrono n'est mis à jour que quand le panneau est visible.
setInterval(() => document.visibilityState === 'visible' && refreshRecorder(), 500);

// ---------- Liste des captures récentes ----------
const list = $('list');
const q = $('q');
let items = [];
let urls = [];

function row(c) {
  const src = c.thumb || (!isVideo(c) && c.blob);
  const url = src ? URL.createObjectURL(src) : null;
  if (url) urls.push(url);
  const thumb = h('div', { class: 'thumb' }, url ? h('img', { src: url, alt: '', decoding: 'async', loading: 'lazy' }) : '');
  if (isVideo(c)) thumb.append(h('span', { class: 'dur' }, `▶ ${fmtDuration(c.duration)}`));
  const meta = `${fmtDate(c.createdAt)}${c.sharedId ? ' · partagée' : ''}`;
  const btn = h('button', { class: 'item', title: c.title }, thumb,
    h('div', { class: 'info' }, h('div', { class: 'title' }, c.title), h('div', { class: 'meta' }, meta)));
  btn.addEventListener('click', () => page(`ui/viewer.html?id=${encodeURIComponent(c.id)}`));
  return btn;
}

function render() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const s = q.value.trim().toLowerCase();
  const shown = items.filter((c) => !s || c.title.toLowerCase().includes(s) || (c.sourceUrl || '').toLowerCase().includes(s)).filter(kindOk);
  list.replaceChildren(...shown.map(row));
  $('count').textContent = `${items.length} élément${items.length > 1 ? 's' : ''}`;
  $('empty').hidden = items.length > 0;
}

async function load() {
  items = await listCaptures();
  render();
}

// Filtre Tout / Photos / Vidéos (mémorisé)
let kind = localStorage.getItem('localshot-kind') || '';
const kindOk = (c) => !kind || (kind === 'video') === (c.kind === 'video');
function syncKind() { for (const b of document.querySelectorAll('#kind [data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind)); }
document.getElementById('kind').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  kind = b.dataset.kind;
  localStorage.setItem('localshot-kind', kind);
  syncKind();
  render();
});
syncKind();
q.addEventListener('input', render);
new BroadcastChannel(CHANGES).onmessage = load; // nouvelle capture, titre modifié, suppression…
$('gallery').addEventListener('click', () => page('ui/gallery.html'));
$('settings').addEventListener('click', () => page('ui/settings.html'));

load();
refreshRecorder();
