import { getCapture, updateCapture, deleteCapture } from '../db.js';
import { createPlayer } from './player.js';
import { saveConf, saveToComputer } from './savefolder.js';
import { linkOptions } from './linkopts.js';
import { openEditor } from './editor.js';
import { trimVideo, makeGif } from './videotools.js';
import { transcribe, transcribeConf, PROVIDERS, toSrt, toVtt } from './transcribe.js';
import { renderTranscript } from './transcript.js';
import { renderComments } from './comments.js';
import { encryptCapture, E2E_MIME } from './e2e.js';
import { makeThumb, fmtDate, fmtSize, fmtDuration, isVideo, toast, download, api, serverConf, revokeShare } from './common.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let c = id && (await getCapture(id));

if (!c) {
  document.querySelector('main').innerHTML = '<div class="center-msg"><h1>Capture introuvable</h1><p class="muted">Elle a peut-être été supprimée.</p><a class="btn" href="gallery.html">Retour à la galerie</a></div>';
  document.querySelector('.actions').hidden = true;
} else {
  if (isVideo(c)) {
    const player = createPlayer({ src: URL.createObjectURL(c.blob), poster: c.thumb && URL.createObjectURL(c.thumb), duration: c.duration, width: c.width, height: c.height });
    $('img').replaceWith(player);
    $('stage').classList.remove('is-loading');
    $('annotate').hidden = true;
    setupCut(player);
    setupSubs(player);
    player.focus({ preventScroll: true });
    $('copyImg').hidden = true;
  } else {
    const img = $('img');
    showImage(img, URL.createObjectURL(c.blob), c.width, c.height);
    img.addEventListener('click', () => $('stage').classList.toggle('zoomed'));

    // ---------- Annotations (flèches, texte, flou…) ----------
    async function replaceImage(blob, patch) {
      const bmp = await createImageBitmap(blob);
      c = await updateCapture(id, { blob, size: blob.size, width: bmp.width, height: bmp.height, thumb: await makeThumb(bmp), savedAt: null, ...patch });
      URL.revokeObjectURL(img.src);
      showImage(img, URL.createObjectURL(c.blob), c.width, c.height);
      $('restore').hidden = !c.original;
      if (c.sharedId) toast('Le lien partagé montre encore l\'ancienne version : arrêtez puis relancez le partage.');
      autoSave(false);
    }
    $('annotate').addEventListener('click', async () => {
      const blob = await openEditor(c.blob);
      if (!blob) return;
      await replaceImage(blob, { original: c.original || c.blob, editedAt: new Date().toISOString() });
      toast('Annotations enregistrées');
    });
    $('restore').hidden = !c.original;
    $('restore').addEventListener('click', async () => {
      if (!confirm('Revenir à la capture d\'origine ? Les annotations seront perdues.')) return;
      await replaceImage(c.original, { original: null, editedAt: null });
      toast('Capture d\'origine restaurée');
    });
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
  $('download').addEventListener('click', async () => {
    const r = await download(c).catch((e) => ({ error: e.message }));
    if (r.where) { c = await updateCapture(id, { savedAt: new Date().toISOString() }); hideSaveBanner(); toast(`Enregistré dans ${r.where}`); }
    else toast(r.needsAccess ? 'Accès au dossier refusé' : `Enregistrement impossible : ${r.error}`, 'error');
  });

  // ---------- Sauvegarde automatique sur l'ordinateur ----------
  const banner = $('saveBanner');
  const hideSaveBanner = () => (banner.hidden = true);
  async function autoSave(interactive) {
    if (!saveConf().auto || c.savedAt) return;
    const r = await saveToComputer(c, { interactive }).catch((e) => ({ error: e.message }));
    if (r.where) { c = await updateCapture(id, { savedAt: new Date().toISOString() }); hideSaveBanner(); if (interactive) toast(`Enregistré dans ${r.where}`); }
    else if (r.needsAccess) {
      $('saveBannerText').textContent = `Chrome demande de réautoriser l'accès au dossier « ${r.folderName} » pour y enregistrer cette ${isVideo(c) ? 'vidéo' : 'capture'}.`;
      banner.hidden = false;
    }
  }
  $('saveBannerBtn').addEventListener('click', () => autoSave(true));
  autoSave(false);

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
    const shared = c.sharedId && (await api(`/api/captures/${c.sharedId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    if (!shared) { $('shareBox').hidden = true; $('linkOpts').hidden = true; $('comments').hidden = true; $('share').hidden = false; return; }
    if (shared.canEdit) {
      linkOptions($('linkOpts'), shared, { request: api, notify: toast });
      renderComments($('comments'), shared, { request: api, player: document.querySelector('.lsp'), owner: true, notify: toast });
    }
    const base = hl?.publicUrl || serverConf().url;
    $('shareUrl').value = `${base}/c/${c.sharedId}${c.shareKey ? `#k=${c.shareKey}` : ''}`;
    $('shareBox').hidden = false;
    $('share').hidden = true;
    hint.textContent = /\.ts\.net$/i.test(new URL(base).hostname)
      ? 'Ouvrable seulement depuis vos appareils connectés à Tailscale. Pour un client, il faut une adresse publique (Tailscale Funnel ou serveur en ligne).'
      : 'Ouvrable par toute personne qui a le lien.';
  }

  $('share').addEventListener('click', async () => {
    const hl = await health();
    if (!serverConf().url) {
      hint.textContent = 'Pour partager, indiquez d\'abord votre serveur LocalShot (Raspberry Pi, NAS, VPS ou Docker) dans « Réglages ». Sans serveur, tout reste sur cet ordinateur.';
      return toast('Aucun serveur de partage réglé', 'error');
    }
    if (!hl) {
      hint.textContent = `Serveur ${new URL(serverConf().url).host} injoignable : est-il allumé, et Tailscale connecté sur cet ordinateur ?`;
      return toast('Serveur de partage injoignable', 'error');
    }
    // Chiffrement de bout en bout (option) : le serveur ne reçoit qu'un bloc illisible, la clé reste dans le lien.
    const e2e = $('e2e').checked;
    let payload, shareKey = null;
    if (e2e) {
      const enc = await encryptCapture(c.blob, { title: c.title, kind: c.kind || 'image', mime: isVideo(c) ? c.mime : 'image/png', width: c.width, height: c.height, duration: c.duration, captions: c.captions || undefined });
      payload = { headers: { 'Content-Type': E2E_MIME }, body: enc.blob };
      shareKey = enc.key;
    } else {
      payload = {
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
      };
    }
    const r = await api('/api/captures', { method: 'POST', ...payload });
    if (r.status === 401 || r.status === 403) {
      hint.textContent = 'Le serveur refuse l\'accès : vérifiez la clé dans les réglages (bouton « Réglages » de la galerie).';
      return toast('Clé d\'accès refusée', 'error');
    }
    if (!r.ok) return toast(r.status === 413 ? 'Fichier trop volumineux pour le partage' : 'Partage impossible', 'error');
    const sharedId = (await r.json()).id;
    // Sous-titres et vignette (aperçu du lien) : jamais en clair pour un partage chiffré.
    if (!e2e && c.captions?.length) await api(`/api/captures/${sharedId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ captions: c.captions }) }).catch(() => {});
    if (!e2e && c.thumb) await api(`/api/captures/${sharedId}/thumb`, { method: 'PUT', headers: { 'Content-Type': c.thumb.type || 'image/webp' }, body: c.thumb }).catch(() => {});
    c = await updateCapture(id, { sharedId, sharedServer: serverConf().url, shareKey });
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
    c = await updateCapture(id, { sharedId: null, sharedServer: null, shareKey: null });
    hint.textContent = 'Partage arrêté : le lien ne fonctionne plus.';
    await shownShare(null);
  });

  if (c.sharedId) shownShare(await health());
}

// ---------- Découpe et GIF (vidéos) ----------
function parseTime(v) {
  const parts = String(v).trim().replace(',', '.').split(':').map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  return parts.reduce((a, n) => a * 60 + n, 0);
}
const showTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0').replace('.', ',')}`;

function setupCut(player) {
  const v = player.video;
  const $ = (x) => document.getElementById(x);
  $('cut').hidden = false;
  $('studio').hidden = false;
  $('studio').href = `studio.html?id=${encodeURIComponent(id)}`;
  $('restore').hidden = !c.original;
  $('restore').addEventListener('click', async () => {
    if (!confirm('Revenir à la vidéo d\'origine ? La découpe sera perdue.')) return;
    const o = c.original;
    c = await updateCapture(id, { blob: o, size: o.size, ...(c.originalMeta || {}), original: null, originalMeta: null, edit: null, editSource: null, editedAt: null, savedAt: null });
    location.reload();
  });
  let tIn = 0, tOut = 0;
  const dur = () => (Number.isFinite(v.duration) ? v.duration : c.duration || 0);
  function sync() {
    $('cutIn').value = showTime(tIn);
    $('cutOut').value = showTime(tOut);
    $('cutLen').textContent = `Segment : ${showTime(Math.max(0, tOut - tIn))}`;
    $('cutApply').disabled = $('gifExport').disabled = !(tOut - tIn > 0.2);
  }
  $('cut').addEventListener('click', () => {
    $('cutPanel').hidden = !$('cutPanel').hidden;
    if (!tOut) tOut = dur();
    sync();
  });
  $('cutClose').addEventListener('click', () => ($('cutPanel').hidden = true));
  $('cutSetIn').addEventListener('click', () => { tIn = Math.min(v.currentTime, tOut); sync(); });
  $('cutSetOut').addEventListener('click', () => { tOut = Math.max(v.currentTime, tIn); sync(); });
  for (const [inp, set] of [['cutIn', (t) => (tIn = t)], ['cutOut', (t) => (tOut = t)]]) {
    $(inp).addEventListener('change', () => {
      const t = parseTime($(inp).value);
      if (Number.isFinite(t)) { set(Math.min(t, dur())); v.currentTime = Math.min(t, dur()); }
      sync();
    });
  }

  let ctrl = null;
  async function run(job) {
    ctrl = new AbortController();
    const prog = $('cutProgress');
    prog.value = 0;
    prog.hidden = $('cutAbort').hidden = false;
    $('cutApply').disabled = $('gifExport').disabled = true;
    v.pause();
    try { return await job((p) => (prog.value = p), ctrl.signal); }
    catch (e) { if (e.name !== 'AbortError') toast(`Échec : ${e.message}`, 'error'); return null; }
    finally { prog.hidden = $('cutAbort').hidden = true; ctrl = null; sync(); }
  }
  $('cutAbort').addEventListener('click', () => ctrl?.abort());

  $('cutApply').addEventListener('click', async () => {
    const blob = await run((onProgress, signal) => trimVideo(c.blob, tIn, tOut, { onProgress, signal }));
    if (!blob) return;
    c = await updateCapture(id, { blob, size: blob.size, mime: blob.type, duration: tOut - tIn, original: c.original || c.blob, edit: null, editSource: null,
      originalMeta: c.originalMeta || { duration: c.duration, mime: c.mime }, editedAt: new Date().toISOString(), savedAt: null });
    toast('Vidéo découpée');
    location.reload();
  });
  $('gifExport').addEventListener('click', async () => {
    const gif = await run((onProgress, signal) => makeGif(c.blob, tIn, tOut, { onProgress, signal }));
    if (!gif) return;
    const r = await saveToComputer({ title: c.title, createdAt: new Date().toISOString(), blob: gif, ext: 'gif' }, { interactive: true }).catch((e) => ({ error: e.message }));
    if (r.where) toast(`GIF enregistré dans ${r.where}`);
    else toast(r.needsAccess ? 'Accès au dossier refusé' : `Enregistrement impossible : ${r.error}`, 'error');
  });
}

// ---------- Sous-titres automatiques ----------
function setupSubs(player) {
  const $ = (x) => document.getElementById(x);
  $('subs').hidden = false;
  async function store(caps) {
    c = await updateCapture(id, { captions: caps.length ? caps : null });
    player.setCaptions(caps);
    show();
    // Le lien partagé reçoit aussi les sous-titres corrigés.
    if (c.sharedId && !c.shareKey) api(`/api/captures/${c.sharedId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ captions: caps }) }).catch(() => {});
  }
  function show() {
    const caps = c.captions || [];
    $('trBar').hidden = !caps.length;
    $('subs').hidden = !!caps.length;
    renderTranscript($('transcript'), caps.map((x) => ({ ...x })), player, { onEdit: store });
  }
  async function run() {
    const conf = transcribeConf();
    if (!conf.provider) {
      if (confirm('Choisissez d\'abord le service de transcription (Whisper sur votre serveur, Mistral, OpenAI ou Groq). Ouvrir les réglages ?')) location.href = 'settings.html#transcription';
      return;
    }
    const where = conf.provider === 'local' ? `votre serveur (${new URL(conf.url).host})` : PROVIDERS[conf.provider].label;
    if (!confirm(`Le son de cette vidéo (pas l'image) va être envoyé à ${where} pour être transcrit. Continuer ?`)) return;
    const prog = $('trProgress');
    $('trBar').hidden = false;
    prog.hidden = false;
    $('subs').disabled = true;
    try {
      const caps = await transcribe(c.blob, { onProgress: (p) => (prog.value = p) });
      if (!caps.length) return toast('Aucune parole détectée');
      await store(caps);
      toast('Sous-titres prêts');
    } catch (e) {
      toast(`Transcription impossible : ${e.message}`, 'error');
      show();
    } finally {
      prog.hidden = true;
      $('subs').disabled = false;
    }
  }
  const save = (text, ext, type) => saveToComputer({ title: c.title, createdAt: c.createdAt, blob: new Blob([text], { type }), ext }, { interactive: true })
    .then((r) => toast(r.where ? `Enregistré dans ${r.where}` : 'Accès au dossier refusé', r.where ? '' : 'error'));
  $('subs').addEventListener('click', run);
  $('trRedo').addEventListener('click', run);
  $('trSrt').addEventListener('click', () => save(toSrt(c.captions || []), 'srt', 'application/x-subrip'));
  $('trVtt').addEventListener('click', () => save(toVtt(c.captions || []), 'vtt', 'text/vtt'));
  $('trDel').addEventListener('click', async () => { if (confirm('Supprimer les sous-titres ?')) await store([]); });
  player.setCaptions(c.captions || []);
  show();
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
