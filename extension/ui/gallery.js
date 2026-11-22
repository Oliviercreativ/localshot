import { listCaptures, deleteCapture } from '../db.js';
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
  const box = h('div', { class: 'thumb' + (isVideo(c) ? ' is-video' : '') }, url ? h('img', { src: url, decoding: 'async', alt: '' }) : '');
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
  const list = items.filter((c) => !s || c.title.toLowerCase().includes(s) || (c.sourceUrl || '').toLowerCase().includes(s));
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
  if (!confirm(`Télécharger les ${items.length} éléments dans Téléchargements/LocalShot ?`)) return;
  for (const c of items) await download(c);
  toast('Téléchargement lancé');
});

q.addEventListener('input', render);
items = await listCaptures();
render();
showStorage();
