import { getCapture, updateCapture, deleteCapture } from '../db.js';
import { createPlayer } from './player.js';
import { saveConf, saveToComputer, folderAccess } from './savefolder.js';
import { openEditor } from './editor.js';
import { trimVideo, makeGif } from './videotools.js';
import { transcribe, transcribeConf, PROVIDERS, toSrt, toVtt } from './transcribe.js';
import { renderTranscript } from './transcript.js';
import { makeThumb, fmtDate, fmtSize, fmtDuration, isVideo, toast, download } from './common.js';

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
    await deleteCapture(id);
    location.href = 'gallery.html';
  });
}

// ---------- Export MP4, WebM, GIF (vidéos) ----------
function setupCut(player) {
  const v = player.video;
  const $ = (x) => document.getElementById(x);
  $('cut').hidden = false;
  $('studio').hidden = false;
  $('studio').href = `studio.html?id=${encodeURIComponent(id)}`;
  $('restore').hidden = !c.original;
  $('restore').addEventListener('click', async () => {
    if (!confirm('Revenir à la vidéo d\'origine ? Le montage sera perdu.')) return;
    const o = c.original;
    c = await updateCapture(id, { blob: o, size: o.size, ...(c.originalMeta || {}), original: null, originalMeta: null, edit: null, editSource: null, editedAt: null, savedAt: null });
    location.reload();
  });
  const dur = () => (Number.isFinite(v.duration) ? v.duration : c.duration || 0);
  const btns = ['expMp4', 'expWebm', 'gifExport'];
  $('expMp4').disabled = !canRecord('video/mp4') && c.mime !== 'video/mp4';
  $('expWebm').disabled = !canRecord('video/webm') && c.mime !== 'video/webm';
  const menu = (open) => {
    if (!open && ctrl) return; // export en cours : le menu reste ouvert pour suivre la progression
    $('cutPanel').hidden = !open;
    $('cut').setAttribute('aria-expanded', String(open));
    if (open) $('expMp4').focus();
  };
  $('cut').addEventListener('click', () => menu($('cutPanel').hidden));
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) menu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('cutPanel').hidden) { menu(false); $('cut').focus(); } });

  let ctrl = null;
  async function run(job) {
    ctrl = new AbortController();
    const prog = $('cutProgress');
    prog.value = 0;
    prog.hidden = $('cutAbort').hidden = false;
    btns.forEach((b) => ($(b).disabled = true));
    v.pause();
    try { return await job((p) => (prog.value = p), ctrl.signal); }
    catch (e) { if (e.name !== 'AbortError') toast(`Échec : ${e.message}`, 'error'); return null; }
    finally {
      prog.hidden = $('cutAbort').hidden = true;
      ctrl = null;
      btns.forEach((b) => ($(b).disabled = false));
      $('expMp4').disabled = !canRecord('video/mp4') && c.mime !== 'video/mp4';
      $('expWebm').disabled = !canRecord('video/webm') && c.mime !== 'video/webm';
    }
  }
  $('cutAbort').addEventListener('click', () => ctrl?.abort());

  async function save(blob, ext) {
    const r = await saveToComputer({ title: c.title, createdAt: c.createdAt, blob, ext }, { interactive: true, fallback: true }).catch((e) => ({ error: e.message }));
    if (r.where) toast(`${ext.toUpperCase()} enregistré dans ${r.where}`);
    else toast(r.needsAccess ? 'Accès au dossier refusé' : `Enregistrement impossible : ${r.error}`, 'error');
  }
  // Même format que la vidéo : copie directe. Sinon : conversion (la vidéo est rejouée).
  // Dossier de sauvegarde : l'accès se demande pendant le clic, avant une conversion qui peut être longue.
  const askFolder = () => (saveConf().mode === 'folder' ? folderAccess(true).catch(() => null) : null);
  async function exportAs(type, ext) {
    await askFolder();
    if (c.mime === type) return save(c.blob, ext);
    const blob = await run((onProgress, signal) => trimVideo(c.blob, 0, dur(), { onProgress, signal, mime: type }));
    if (blob) save(blob, ext);
  }
  $('expMp4').addEventListener('click', () => exportAs('video/mp4', 'mp4'));
  $('expWebm').addEventListener('click', () => exportAs('video/webm', 'webm'));
  $('gifExport').addEventListener('click', async () => {
    await askFolder();
    const gif = await run((onProgress, signal) => makeGif(c.blob, 0, dur(), { onProgress, signal }));
    if (gif) save(gif, 'gif');
  });
}
function canRecord(type) { return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type); }

// ---------- Sous-titres automatiques ----------
function setupSubs(player) {
  const $ = (x) => document.getElementById(x);
  $('subs').hidden = false;
  async function store(caps) {
    c = await updateCapture(id, { captions: caps.length ? caps : null });
    player.setCaptions(caps);
    show();
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
