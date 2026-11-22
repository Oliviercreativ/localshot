import { fmtDate, fmtSize, fmtDuration, isVideo, fileUrl, toast, copyText } from '/assets/common.js';

const $ = (id) => document.getElementById(id);
const id = location.pathname.split('/').pop();

const [c, health] = await Promise.all([
  fetch(`/api/captures/${id}`).then((r) => (r.ok ? r.json() : null)),
  fetch('/api/health').then((r) => r.json()),
]);

if (!c) {
  location.replace('/c/introuvable');
} else {
  document.title = `${c.title} — LocalShot`;
  const img = $('img');
  if (isVideo(c)) {
    const v = Object.assign(document.createElement('video'), { controls: true, playsInline: true, preload: 'metadata', src: fileUrl(c) });
    v.setAttribute('playsinline', '');
    img.replaceWith(v);
  } else {
    img.src = fileUrl(c);
    img.addEventListener('click', () => $('stage').classList.toggle('zoomed'));
  }

  const title = $('title');
  title.value = c.title;
  title.readOnly = !c.canEdit;
  if (c.canEdit) {
    $('back').hidden = false;
    $('del').hidden = false;
    title.addEventListener('change', async () => {
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

  // Lien de partage : l'IP du réseau local si le mode LAN est actif
  const onThisMac = ['localhost', '127.0.0.1'].includes(location.hostname);
  let share = location.href.split('#')[0];
  if (health.publicUrl) share = `${health.publicUrl}/c/${id}`;
  else if (health.lan && health.addresses.length && onThisMac) share = `http://${health.addresses[0]}:${health.port}/c/${id}`;
  const shareInput = $('shareUrl');
  shareInput.value = share;
  $('shareHint').textContent = health.publicUrl
    ? 'Accessible depuis vos appareils connectés à Tailscale.'
    : !health.lan && onThisMac
      ? 'Ce lien ne fonctionne que sur ce Mac. Lancez « npm run start:lan » pour le partager sur votre Wi-Fi.'
      : 'Accessible depuis les appareils connectés au même réseau Wi-Fi.';

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

  $('del').addEventListener('click', async () => {
    if (!confirm(`Supprimer ${isVideo(c) ? 'cette vidéo' : 'cette capture'} ? Cette action est définitive.`)) return;
    const r = await fetch(`/api/captures/${id}`, { method: 'DELETE' });
    if (r.ok) location.href = '/';
    else toast('Suppression impossible', 'error');
  });
}
