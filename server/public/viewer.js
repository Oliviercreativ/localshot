import { createPlayer } from '/assets/player.js';
import { h, fmtDate, fmtSize, fmtDuration, isVideo, fileUrl, thumbUrl, toast, copyText } from '/assets/common.js';
import { linkOptions } from '/assets/linkopts.js';
import { renderTranscript } from '/assets/transcript.js';
import { renderComments } from '/assets/comments.js';
import { decryptCapture, keyFromHash } from '/assets/e2e.js';

const $ = (id) => document.getElementById(id);
const id = location.pathname.split('/').pop();

const [c, health] = await Promise.all([
  fetch(`/api/captures/${id}?view=1`).then((r) => (r.ok ? r.json() : null)),
  fetch('/api/health').then((r) => r.json()),
]);

if (!c) {
  location.replace('/c/introuvable');
} else if (c.locked) {
  // Lien protégé : on demande le mot de passe avant d'afficher quoi que ce soit.
  document.title = 'Lien protégé — LocalShot';
  document.querySelector('.actions').hidden = true;
  const form = h('form', {}, h('input', { type: 'password', id: 'pw', placeholder: 'Mot de passe', autocomplete: 'current-password', required: '', 'aria-label': 'Mot de passe' }),
    h('button', { class: 'btn primary', type: 'submit' }, 'Ouvrir'));
  const msg = h('p', { class: 'muted' }, `Cette ${c.kind === 'video' ? 'vidéo' : 'capture'} est protégée par un mot de passe.`);
  document.querySelector('main').replaceChildren(h('div', { class: 'unlock' }, h('img', { src: '/assets/icon.png', alt: '', width: '56', height: '56' }),
    h('h1', {}, 'Lien protégé'), msg, form));
  $('pw').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    const r = await fetch(`/api/captures/${id}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('pw').value }) });
    btn.disabled = false;
    if (r.ok) return location.reload();
    msg.textContent = 'Mot de passe incorrect.';
    msg.className = 'notice bad';
    $('pw').select();
  });
} else {
  // Contenu chiffré de bout en bout : déchiffré ici avec la clé du lien (#k=…), jamais vue par le serveur.
  if (c.kind === 'enc') {
    const key = keyFromHash(location.hash);
    const fail = (title, msg) => {
      document.querySelector('.stage').classList.remove('is-loading');
      document.querySelector('.stage').replaceChildren(h('div', { class: 'center-msg dark' }, h('h1', {}, title), h('p', {}, msg)));
    };
    if (!key) fail('Lien incomplet', 'La clé de déchiffrement manque à la fin du lien (#k=…). Demandez le lien complet.');
    else {
      try {
        const buf = await (await fetch(fileUrl(c))).arrayBuffer();
        const { meta, blob } = await decryptCapture(buf, key);
        Object.assign(c, { title: meta.title || 'Capture', kind: meta.kind, mime: meta.mime, width: meta.width, height: meta.height, duration: meta.duration, size: blob.size, decrypted: URL.createObjectURL(blob), e2e: true });
        c.captions = Array.isArray(meta.captions) ? meta.captions : undefined;
      } catch (e) {
        fail('Impossible de déchiffrer', `${e.message}. Vérifiez que le lien est complet.`);
      }
    }
  }
  document.title = `${c.title} — LocalShot`;
  const img = $('img');
  if (isVideo(c)) {
    const player = createPlayer({ src: c.decrypted || fileUrl(c), poster: thumbUrl(c) || undefined, duration: c.duration, width: c.width, height: c.height, captions: c.captions, noDownload: !c.canEdit && c.allowDownload === false });
    img.replaceWith(player);
    $('stage').classList.remove('is-loading');
    if (c.captions?.length) renderTranscript($('transcript'), c.captions, player);
    player.focus({ preventScroll: true });
  } else if (img && c.kind !== 'enc') {
    showImage(img, c.decrypted || fileUrl(c), c.width, c.height);
    img.addEventListener('click', () => $('stage').classList.toggle('zoomed'));
  }

  const title = $('title');
  title.value = c.title;
  title.readOnly = !c.canEdit || c.e2e || c.kind === 'enc'; // un titre chiffré ne doit pas être renvoyé en clair
  if (c.canEdit) {
    $('back').hidden = false;
    $('del').hidden = false;
    if (!title.readOnly) title.addEventListener('change', async () => {
      const r = await fetch(`/api/captures/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.value }) });
      if (r.ok) { const u = await r.json(); title.value = u.title; document.title = `${u.title} — LocalShot`; toast('Titre enregistré'); }
    });
    title.addEventListener('keydown', (e) => e.key === 'Enter' && title.blur());
  }

  $('meta').textContent = isVideo(c)
    ? `${fmtDate(c.createdAt)} · Vidéo ${fmtDuration(c.duration)} · ${fmtSize(c.size)}`
    : `${fmtDate(c.createdAt)} · ${c.width}×${c.height} px · ${fmtSize(c.size)}`;
  if (/^https?:\/\//i.test(c.sourceUrl)) {
    const s = $('source');
    s.href = c.sourceUrl;
    s.title = c.sourceUrl;
    s.hidden = false;
  }

  // Lien de partage : l'adresse publique du serveur si elle est réglée
  let share = location.href.split('#')[0];
  if (health.publicUrl) share = `${health.publicUrl}/c/${id}${c.e2e ? location.hash : ''}`;
  const shareInput = $('shareUrl');
  shareInput.value = share;
  $('shareHint').textContent = /\.ts\.net$/i.test(new URL(share).hostname)
    ? 'Accessible uniquement depuis vos appareils connectés à Tailscale.'
    : 'Accessible par toute personne qui a le lien.';

  $('copyLink').addEventListener('click', async () => {
    try { await copyText(share, shareInput); toast('Lien copié'); } catch { toast('Copie impossible', 'error'); }
  });

  const copyImg = $('copyImg');
  if (!isVideo(c) && navigator.clipboard?.write && window.ClipboardItem && window.isSecureContext) {
    copyImg.addEventListener('click', async () => {
      try {
        const blob = await (await fetch(img.src)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Image copiée');
      } catch { toast('Copie impossible', 'error'); }
    });
  } else copyImg.hidden = true;

  $('download').href = `${fileUrl(c)}?dl=1`;
  if (c.e2e) Object.assign($('download'), { href: c.decrypted, download: `${c.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)}.${c.mime === 'video/webm' ? 'webm' : c.kind === 'video' ? 'mp4' : 'png'}` });
  if (c.kind === 'enc') $('download').hidden = $('copyImg').hidden = true;
  if (!c.canEdit && c.allowDownload === false) { $('download').hidden = true; copyImg.hidden = true; }
  if (!c.canEdit) document.querySelector('.share').hidden = true; // le visiteur a déjà le lien : « Copier le lien » suffit
  if (c.canEdit) linkOptions($('linkOpts'), c, { request: (u, o) => fetch(u, o), notify: toast });
  if (c.canEdit || c.allowComments) {
    renderComments($('comments'), c, { request: (u, o) => fetch(u, o), player: document.querySelector('.lsp'), owner: !!c.canEdit, notify: toast });
  }

  $('del').addEventListener('click', async () => {
    if (!confirm(`Supprimer ${isVideo(c) ? 'cette vidéo' : 'cette capture'} ? Cette action est définitive.`)) return;
    const r = await fetch(`/api/captures/${id}`, { method: 'DELETE' });
    if (r.ok) location.href = '/';
    else toast('Suppression impossible', 'error');
  });
}

// Affiche une image une fois prête (décodée), avec la place réservée d'avance : pas d'icône cassée ni de saut.
function showImage(img, src, w, h) {
  const stage = document.getElementById('stage');
  stage.classList.add('is-loading');
  if (w && h) { img.width = w; img.height = h; }
  img.decoding = 'async';
  img.fetchPriority = 'high';
  img.hidden = false;
  img.src = src;
  const done = () => stage.classList.remove('is-loading');
  img.decode().then(done, () => {
    done();
    if (!img.complete || !img.naturalWidth) img.replaceWith(Object.assign(document.createElement('p'), { className: 'center-msg dark', textContent: 'Image indisponible.' }));
  });
}
