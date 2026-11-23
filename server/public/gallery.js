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
    isVideo(c)
      ? h('div', { class: 'thumb is-video' }, thumbUrl(c) ? h('img', { src: thumbUrl(c), decoding: 'async', alt: '' }) : h('video', { src: `${fileUrl(c)}#t=0.5`, preload: 'metadata', muted: '', playsinline: '' }),
          h('span', { class: 'play' }, '▶'), h('span', { class: 'dur' }, fmtDuration(c.duration)))
      : h('div', { class: 'thumb' }, h('img', { src: fileUrl(c), decoding: 'async', alt: '' })),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title' }, c.title),
      h('div', { class: 'card-meta' }, `${fmtDate(c.createdAt)} · ${isVideo(c) ? `Vidéo ${fmtDuration(c.duration)}` : `${c.width}×${c.height}`} · ${c.views || 0} vue${c.views > 1 ? "s" : ""}${c.hasPassword ? " · 🔒" : ""}${c.expiresAt ? " · expire le " + fmtDate(c.expiresAt) : ""}`)));
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
q.addEventListener('input', render);

const [list, health] = await Promise.all([fetch('/api/captures').then((r) => r.json()), fetch('/api/health').then((r) => r.json())]);
items = list;
render();

if (health.auth) {
  const out = document.getElementById('logout');
  out.hidden = false;
  out.addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); });
}

if (health.publicUrl) {
  lan.textContent = `Serveur privé (${new URL(health.publicUrl).host}) : accessible uniquement depuis vos appareils connectés à Tailscale.`;
  lan.classList.add('subtle');
} else if (health.lan && health.addresses.length) {
  lan.textContent = `Partage réseau actif : les liens de partage s'ouvrent depuis le téléphone ou un autre Mac connecté au même Wi-Fi (http://${health.addresses[0]}:${health.port}/c/…). La galerie reste privée.`;
} else {
  lan.textContent = 'Mode privé : tout reste sur ce Mac. Pour partager sur votre Wi-Fi (téléphone, autre Mac), relancez le serveur avec « npm run start:lan ».';
  lan.classList.add('subtle');
}
lan.hidden = false;
