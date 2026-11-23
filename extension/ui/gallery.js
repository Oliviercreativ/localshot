import { listCaptures, deleteCapture } from '../db.js';
import { restoreFromFolder } from './restore.js';
import { h, fmtDate, fmtSize, fmtDuration, isVideo, toast, download, revokeShare } from './common.js';

const grid = document.getElementById('grid');
const q = document.getElementById('q');
let items = [];
const urls = new Map();

const thumbUrl = (c) => {
  const src = c.thumb || (!isVideo(c) && c.blob);
  if (!src) return null;
  if (!urls.has(c.id)) urls.set(c.id, URL.createObjectURL(src));
  return urls.get(c.id);
};

function thumbBox(c) {
  const url = thumbUrl(c);
  const box = h('div', { class: 'thumb' + (isVideo(c) ? ' is-video' : '') }, url ? h('img', { src: url, decoding: 'async', loading: 'lazy', alt: '' }) : '');
  if (isVideo(c)) box.append(h('span', { class: 'play' }, '▶'), h('span', { class: 'dur' }, fmtDuration(c.duration)));
  return box;
}

function card(c) {
  const del = h('button', { class: 'card-del', title: 'Supprimer', 'aria-label': 'Supprimer' }, '✕');
  del.addEventListener('click', async () => {
    if (!confirm(`Supprimer « ${c.title} » ? Cette action est définitive.`)) return;
    const why = await revokeShare(c);
    if (why && !confirm(`Le lien partagé n'a pas pu être supprimé (${why}) : il fonctionne peut-être encore.\n\nSupprimer quand même la copie locale ?`)) return;
    await deleteCapture(c.id);
    items = items.filter((x) => x.id !== c.id);
    render();
    showStorage();
    toast('Supprimé');
  });
  const kind = isVideo(c) ? `Vidéo ${fmtDuration(c.duration)}` : `${c.width}×${c.height}`;
  const meta = `${fmtDate(c.createdAt)} · ${kind} · ${fmtSize(c.size)}${c.sharedId ? ' · partagée' : ''}`;
  const link = h('a', { class: 'card-link', href: `viewer.html?id=${encodeURIComponent(c.id)}` },
    thumbBox(c),
    h('div', { class: 'card-body' }, h('div', { class: 'card-title' }, c.title), h('div', { class: 'card-meta' }, meta)));
  return h('article', { class: 'card' }, link, del);
}

function render() {
  const s = q.value.trim().toLowerCase();
  const list = items.filter((c) => !s || c.title.toLowerCase().includes(s) || (c.sourceUrl || '').toLowerCase().includes(s)).filter(kindOk);
  grid.replaceChildren(...list.map(card));
  document.getElementById('count').textContent = `${items.length} élément${items.length > 1 ? 's' : ''}`;
  document.getElementById('empty').hidden = items.length > 0;
}

async function showStorage() {
  const { usage } = (await navigator.storage?.estimate?.()) || {};
  if (usage != null) document.getElementById('storage').textContent = `${fmtSize(usage)} utilisés`;
}

document.getElementById('exportAll').addEventListener('click', async () => {
  if (!items.length) return toast('Rien à télécharger');
  if (!confirm(`Enregistrer les ${items.length} éléments sur l'ordinateur (dossier de sauvegarde choisi dans « Réglages ») ?`)) return;
  let res;
  for (const c of items) if ((res = await download(c)).needsAccess) return toast('Accès au dossier refusé', 'error');
  toast(`Enregistré dans ${res.where}`);
});

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
items = await listCaptures();
render();
showStorage();

// ---------- Restauration depuis un dossier (après une réinstallation) ----------
for (const b of document.querySelectorAll('.restore-btn')) {
  b.addEventListener('click', async () => {
    const all = document.querySelectorAll('.restore-btn');
    all.forEach((x) => (x.disabled = true));
    try {
      const r = await restoreFromFolder({ onProgress: (i, n) => n && toast(`Lecture du dossier… ${i}/${n}`) });
      if (!r) return;
      toast(r.added ? `${r.added} élément${r.added > 1 ? 's' : ''} restauré${r.added > 1 ? 's' : ''}${r.skipped ? ` (${r.skipped} déjà présent${r.skipped > 1 ? 's' : ''})` : ''}`
        : r.skipped ? 'Tout est déjà dans LocalShot' : 'Aucune capture ni vidéo LocalShot dans ce dossier', r.failed && !r.added ? 'error' : '');
      if (r.added) { items = await listCaptures(); render(); showStorage(); }
    } finally {
      all.forEach((x) => (x.disabled = false));
    }
  });
}
