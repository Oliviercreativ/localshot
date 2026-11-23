import { h, fmtDate, fmtSize, fmtDuration, isVideo, fileUrl, thumbUrl, toast } from '/assets/common.js';

const grid = document.getElementById('grid');
const q = document.getElementById('q');
const count = document.getElementById('count');
const empty = document.getElementById('empty');
const lan = document.getElementById('lan');
let items = [];

function card(c) {
  const del = h('button', { class: 'card-del', title: 'Supprimer', 'aria-label': 'Supprimer' }, '✕');
  del.addEventListener('click', async () => {
    if (!confirm(`Supprimer « ${c.title} » ? Cette action est définitive.`)) return;
    const r = await fetch(`/api/captures/${c.id}`, { method: 'DELETE' });
    if (!r.ok) return toast('Suppression impossible', 'error');
    items = items.filter((x) => x.id !== c.id);
    render();
    toast('Capture supprimée');
  });
  const link = h('a', { class: 'card-link', href: `/c/${c.id}` },
    c.kind === 'enc'
      ? h('div', { class: 'thumb is-enc' }, h('span', {}, '🔒'))
      : isVideo(c)
      ? h('div', { class: 'thumb is-video' }, thumbUrl(c) ? h('img', { src: thumbUrl(c), decoding: 'async', alt: '' }) : h('video', { src: `${fileUrl(c)}#t=0.5`, preload: 'metadata', muted: '', playsinline: '' }),
          h('span', { class: 'play' }, '▶'), h('span', { class: 'dur' }, fmtDuration(c.duration)))
      : h('div', { class: 'thumb' }, h('img', { src: fileUrl(c), decoding: 'async', alt: '' })),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, c.title),
      h('div', { class: 'card-meta' }, `${fmtDate(c.createdAt)} · ${c.kind === 'enc' ? 'chiffré de bout en bout' : isVideo(c) ? `Vidéo ${fmtDuration(c.duration)}` : `${c.width}×${c.height}`} · ${c.views || 0} vue${c.views > 1 ? "s" : ""}${c.hasPassword ? " · 🔒" : ""}${c.expiresAt ? " · expire le " + fmtDate(c.expiresAt) : ""}`)));
  return h('article', { class: 'card' }, link, del);
}

function render() {
  const s = q.value.trim().toLowerCase();
  const list = items.filter((c) => !s || c.title.toLowerCase().includes(s) || (c.sourceUrl || '').toLowerCase().includes(s)).filter(kindOk);
  grid.replaceChildren(...list.map(card));
  count.textContent = `${items.length} capture${items.length > 1 ? 's' : ''}`;
  empty.hidden = items.length > 0;
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
// Ajout de fichiers depuis l'ordinateur (bouton, glisser-déposer, ou « Partager vers » LocalShot installé).
async function uploadFiles(files) {
  const ok = [...files].filter((f) => ['image/png', 'video/mp4', 'video/webm'].includes(f.type));
  if (!ok.length) return toast('Formats acceptés : PNG, MP4, WebM', 'error');
  for (const f of ok) {
    toast(`Envoi de « ${f.name} »…`);
    const meta = await fileMeta(f);
    const r = await fetch('/api/captures', { method: 'POST', body: f, headers: {
      'Content-Type': f.type, 'X-Title': encodeURIComponent(f.name.replace(/\.[^.]+$/, '')),
      'X-Width': String(meta.width || 0), 'X-Height': String(meta.height || 0), 'X-Duration': String(meta.duration || 0) } });
    if (!r.ok) { toast(`« ${f.name} » refusé : ${(await r.json().catch(() => ({}))).error || r.status}`, 'error'); continue; }
    items.unshift(await r.json());
    render();
  }
  toast('Ajouté');
}
function fileMeta(f) {
  if (!f.type.startsWith('video/')) return Promise.resolve({});
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve({ width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 }); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve({});
    v.src = URL.createObjectURL(f);
  });
}
// Fichiers reçus par « Partager vers LocalShot » (mis de côté par le service worker).
async function receiveShared() {
  if (!new URLSearchParams(location.search).has('partage') || !('caches' in window)) return;
  history.replaceState(null, '', '/');
  const box = await caches.open('localshot-share');
  const files = [];
  for (const req of await box.keys()) {
    const r = await box.match(req);
    files.push(new File([await r.blob()], decodeURIComponent(r.headers.get('X-Name') || 'capture'), { type: r.headers.get('Content-Type') || '' }));
    await box.delete(req);
  }
  if (files.length) uploadFiles(files);
}
document.getElementById('upload').addEventListener('change', (e) => { uploadFiles(e.target.files); e.target.value = ''; });
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('dropping'); uploadFiles(e.dataTransfer.files); });

q.addEventListener('input', render);

const [list, health] = await Promise.all([fetch('/api/captures').then((r) => r.json()), fetch('/api/health').then((r) => r.json())]);
items = list;
render();
receiveShared();

if (health.auth) {
  const out = document.getElementById('logout');
  out.hidden = false;
  out.addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); });
}

if (health.publicUrl) {
  lan.textContent = /\.ts\.net$/i.test(new URL(health.publicUrl).hostname)
    ? `Serveur privé (${new URL(health.publicUrl).host}) : accessible uniquement depuis vos appareils connectés à Tailscale.`
    : `Serveur ${new URL(health.publicUrl).host} : les liens de partage sont ouverts à toute personne qui les reçoit. La galerie reste protégée par la clé.`;
  lan.classList.add('subtle');
  lan.hidden = false;
}

