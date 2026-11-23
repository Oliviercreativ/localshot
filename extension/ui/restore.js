// Restauration : relit un dossier de l'ordinateur (le dossier de sauvegarde, par exemple après une réinstallation)
// et remet dans LocalShot les captures (PNG) et vidéos (MP4, WebM) qui n'y sont pas déjà.
import { addCapture, listCaptures, newId } from '../db.js';
import { makeThumb } from './common.js';

const TYPES = { png: 'image/png', mp4: 'video/mp4', webm: 'video/webm' };
// Nom écrit par LocalShot : « Titre — 2026-11-23-09-52-10.png » (date en UTC), éventuellement « (1) » ajouté.
const NAME_RE = /^(.*) — (\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?: \(\d+\))?\.(png|mp4|webm)$/i;

function parseName(file) {
  const m = file.name.match(NAME_RE);
  if (m) return { title: m[1].trim() || 'Capture', createdAt: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}.000Z` };
  return { title: file.name.replace(/\.[^.]+$/, ''), createdAt: new Date(file.lastModified || Date.now()).toISOString() };
}
const keyOf = (createdAt, size) => `${createdAt.slice(0, 19)}|${size}`;

// Fichiers du dossier et de ses sous-dossiers (2 niveaux), sans suivre de liens.
async function* walk(dir, depth = 0) {
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (TYPES[ext] && !entry.name.startsWith('.')) yield { handle: entry, ext };
    } else if (entry.kind === 'directory' && depth < 2 && !entry.name.startsWith('.')) {
      yield* walk(entry, depth + 1);
    }
  }
}

async function videoInfo(blob) {
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  v.src = URL.createObjectURL(blob);
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('vidéo illisible')); });
    if (v.duration === Infinity) { // WebM sans durée
      await new Promise((r) => { v.ondurationchange = r; v.currentTime = 1e101; });
    }
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    await new Promise((r) => { v.onseeked = r; v.currentTime = Math.min(0.5, duration / 2 || 0); });
    const bmp = await createImageBitmap(v);
    const thumb = await makeThumb(bmp);
    return { width: v.videoWidth, height: v.videoHeight, duration, thumb };
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

/**
 * Demande un dossier (dans un clic) puis importe ce qui manque.
 * Renvoie { added, skipped, failed, folder } ou null si l'utilisateur annule.
 */
export async function restoreFromFolder({ onProgress = () => {} } = {}) {
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'localshot-restore', mode: 'read', startIn: 'downloads' }); }
  catch { return null; }
  const known = new Set((await listCaptures()).map((c) => keyOf(c.createdAt, c.size)));
  const files = [];
  for await (const f of walk(dir)) files.push(f);
  let added = 0, skipped = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    onProgress(i, files.length);
    try {
      const raw = await files[i].handle.getFile();
      const { title, createdAt } = parseName(raw);
      if (known.has(keyOf(createdAt, raw.size))) { skipped++; continue; }
      const blob = new Blob([raw], { type: TYPES[files[i].ext] });
      const rec = { id: newId(), title, sourceUrl: '', mode: 'restore', size: blob.size, createdAt, blob, savedAt: new Date().toISOString(), restoredFrom: raw.name };
      if (files[i].ext === 'png') {
        const bmp = await createImageBitmap(blob);
        Object.assign(rec, { width: bmp.width, height: bmp.height, thumb: await makeThumb(bmp) });
      } else {
        Object.assign(rec, { kind: 'video', mime: blob.type }, await videoInfo(blob));
      }
      await addCapture(rec);
      known.add(keyOf(createdAt, raw.size));
      added++;
    } catch {
      failed++;
    }
  }
  onProgress(files.length, files.length);
  return { added, skipped, failed, folder: dir.name };
}
