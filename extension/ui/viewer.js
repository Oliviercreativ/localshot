import { getCapture, updateCapture, deleteCapture } from '../db.js';
import { fmtDate, fmtSize, fmtDuration, isVideo, toast, download, api, serverConf, revokeShare } from './common.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let c = id && (await getCapture(id));

if (!c) {
  document.querySelector('main').innerHTML = '<div class="center-msg"><h1>Capture introuvable</h1><p class="muted">Elle a peut-être été supprimée.</p><a class="btn" href="gallery.html">Retour à la galerie</a></div>';
  document.querySelector('.actions').hidden = true;
} else {
  if (isVideo(c)) {
    const v = Object.assign(document.createElement('video'), { controls: true, playsInline: true, preload: 'metadata', src: URL.createObjectURL(c.blob) });
    if (c.thumb) v.poster = URL.createObjectURL(c.thumb);
    // Les WebM de MediaRecorder n'ont pas de durée : on force le calcul pour que la barre de lecture fonctionne.
    v.addEventListener('loadedmetadata', () => {
      if (v.duration !== Infinity) return;
      v.addEventListener('durationchange', () => { v.currentTime = 0; }, { once: true });
      v.currentTime = 1e101;
    }, { once: true });
    $('img').replaceWith(v);
    $('copyImg').hidden = true;
  } else {
    const img = $('img');
    img.src = URL.createObjectURL(c.blob);
    img.addEventListener('click', () => $('stage').classList.toggle('zoomed'));
  }

  const setTitle = (t) => { $('title').value = t; document.title = `${t} — LocalShot`; };
  setTitle(c.title);
  $('title').addEventListener('change', async () => {
    const t = $('title').value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300) || 'Capture sans titre';
    c = await updateCapture(id, { title: t });
    setTitle(c.title);
    toast('Titre enregistré');
  });
  $('title').addEventListener('keydown', (e) => e.key === 'Enter' && $('title').blur());

  $('meta').textContent = isVideo(c)
    ? `${fmtDate(c.createdAt)} · Vidéo ${fmtDuration(c.duration)} · ${c.width}×${c.height} · ${c.mime === 'video/mp4' ? 'MP4' : 'WebM'} · ${fmtSize(c.size)}`
    : `${fmtDate(c.createdAt)} · ${c.width}×${c.height} px · ${fmtSize(c.size)}`;
  if (/^https?:\/\//i.test(c.sourceUrl)) Object.assign($('source'), { href: c.sourceUrl, title: c.sourceUrl, hidden: false });

  $('copyImg').addEventListener('click', async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': c.blob })]); toast('Image copiée'); }
    catch { toast('Copie impossible', 'error'); }
  });
  $('download').addEventListener('click', () => download(c).then(() => toast('Téléchargement lancé')));

  $('del').addEventListener('click', async () => {
    if (!confirm(`Supprimer ${isVideo(c) ? 'cette vidéo' : 'cette capture'} ? Cette action est définitive.`)) return;
    const why = await revokeShare(c);
    if (why && !confirm(`Le lien partagé n'a pas pu être supprimé (${why}) : il fonctionne peut-être encore.\n\nSupprimer quand même la copie locale ?`)) return;
    await deleteCapture(id);
    location.href = 'gallery.html';
  });

  // ---------- Partage Wi-Fi (optionnel, via le serveur local) ----------
  const hint = $('shareHint');
  async function health() {
    try { return await (await api('/api/health', { signal: AbortSignal.timeout(4000) })).json(); }
    catch { return null; }
  }
  async function shownShare(hl) {
    const shared = c.sharedId && (await api(`/api/captures/${c.sharedId}`).then((r) => r.ok).catch(() => false));
    if (!shared) { $('shareBox').hidden = true; $('share').hidden = false; return; }
    const base = hl?.publicUrl || (hl?.lan && hl.addresses[0] ? `http://${hl.addresses[0]}:${hl.port}` : serverConf().url);
    $('shareUrl').value = `${base}/c/${c.sharedId}`;
    $('shareBox').hidden = false;
    $('share').hidden = true;
    hint.textContent = hl?.publicUrl ? 'Ouvrable depuis vos appareils connectés à Tailscale (téléphone, autre Mac).'
      : hl?.lan ? 'Ouvrable depuis le téléphone ou un autre Mac connecté au même Wi-Fi.'
      : 'Le serveur n\'est pas en mode Wi-Fi : relancez-le avec « npm run start:lan ».';
  }

  $('share').addEventListener('click', async () => {
    const hl = await health();
    if (!hl) {
      hint.textContent = serverConf().url === 'http://localhost:4777'
        ? 'Pour partager, lancez le petit serveur local : « npm run start:lan » dans le dossier LocalShot, ou réglez votre serveur (bouton « Serveur » de la galerie).'
        : `Serveur ${new URL(serverConf().url).host} injoignable : Tailscale est-il connecté sur ce Mac ?`;
      return toast('Serveur de partage injoignable', 'error');
    }
    const r = await api('/api/captures', {
      method: 'POST',
      headers: {
        'Content-Type': isVideo(c) ? c.mime : 'image/png',
        'X-Title': encodeURIComponent(c.title),
        'X-Source-Url': encodeURIComponent(c.sourceUrl || ''),
        'X-Mode': c.mode || '',
        'X-Width': String(c.width || 0),
        'X-Height': String(c.height || 0),
        'X-Duration': String(c.duration || 0),
      },
      body: c.blob,
    });
    if (r.status === 401 || r.status === 403) {
      hint.textContent = 'Le serveur refuse l\'accès : vérifiez la clé dans les réglages (bouton « Serveur » de la galerie).';
      return toast('Clé d\'accès refusée', 'error');
    }
    if (!r.ok) return toast(r.status === 413 ? 'Fichier trop volumineux pour le partage' : 'Partage impossible', 'error');
    c = await updateCapture(id, { sharedId: (await r.json()).id, sharedServer: serverConf().url });
    await shownShare(hl);
    $('copyLink').click();
  });

  $('copyLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('shareUrl').value);
    toast('Lien copié');
  });

  $('unshare').addEventListener('click', async () => {
    const why = await revokeShare(c);
    if (why) {
      hint.textContent = `Impossible d'arrêter le partage : ${why}. Le lien fonctionne peut-être encore ; réessayez.`;
      return toast('Partage non arrêté', 'error');
    }
    c = await updateCapture(id, { sharedId: null, sharedServer: null });
    hint.textContent = 'Partage arrêté : le lien ne fonctionne plus.';
    await shownShare(null);
  });

  if (c.sharedId) shownShare(await health());
}
