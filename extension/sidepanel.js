// Panneau latéral : mêmes actions que le popup, plus les captures récentes, toujours visibles à droite.
import { listCaptures, CHANGES } from './db.js';
import { openRecorder, recorderStatus } from './recorder-launch.js';
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

async function refreshRecorder() {
  const rec = await recorderStatus();
  live = !!rec && ['recording', 'paused'].includes(rec.state);
  recBtn.classList.toggle('live', live);
  if (!live) return ($('recLabel').textContent = 'Enregistrer une vidéo');
  const s = Math.floor(rec.elapsed / 1000);
  $('recLabel').textContent = `${rec.state === 'paused' ? 'En pause' : 'Terminer la vidéo'} (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
}
// Le chronomètre n'est mis à jour que quand le panneau est visible.
setInterval(() => document.visibilityState === 'visible' && refreshRecorder(), 1000);

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
