// Dossier de sauvegarde sur l'ordinateur.
// Deux modes :
//  - « downloads » : un sous-dossier de Téléchargements (API chrome.downloads, aucune autorisation à donner) ;
//  - « folder »    : n'importe quel dossier choisi par l'utilisateur (File System Access API).
// Le choix du dossier est mémorisé dans IndexedDB ; Chrome peut redemander l'accès après un redémarrage.
const CONF_KEY = 'save-conf';
const DB = 'localshot-settings';
const STORE = 'kv';

export function saveConf() {
  try {
    const c = JSON.parse(localStorage.getItem(CONF_KEY) || '{}');
    return { mode: c.mode === 'folder' ? 'folder' : 'downloads', sub: cleanSub(c.sub ?? 'LocalShot'), auto: !!c.auto, folderName: c.folderName || '' };
  } catch { return { mode: 'downloads', sub: 'LocalShot', auto: false, folderName: '' }; }
}
export const setSaveConf = (patch) => localStorage.setItem(CONF_KEY, JSON.stringify({ ...saveConf(), ...patch }));

// Sous-dossier de Téléchargements : segments sûrs uniquement (pas de « .. », pas de caractères interdits).
export function cleanSub(v) {
  return String(v || '').split(/[\\/]+/).map((s) => s.replace(/[:*?"<>|\u0000-\u001f]+/g, ' ').trim())
    .filter((s) => s && s !== '.' && s !== '..').join('/').slice(0, 120);
}

function kv() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kvOp(mode, fn) {
  const db = await kv();
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const getFolderHandle = () => kvOp('readonly', (s) => s.get('folder')).catch(() => null);
const setFolderHandle = (h) => kvOp('readwrite', (s) => s.put(h, 'folder'));

export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// À appeler dans un clic. Renvoie le nom du dossier choisi, ou null si l'utilisateur annule.
export async function pickFolder() {
  let handle;
  try { handle = await window.showDirectoryPicker({ id: 'localshot', mode: 'readwrite', startIn: 'pictures' }); }
  catch { return null; }
  await setFolderHandle(handle);
  setSaveConf({ mode: 'folder', folderName: handle.name });
  return handle.name;
}

// État de l'accès au dossier choisi : 'granted', 'prompt' (à redemander par un clic) ou 'missing'.
export async function folderAccess(request = false) {
  const h = await getFolderHandle();
  if (!h) return 'missing';
  const opts = { mode: 'readwrite' };
  let st = await h.queryPermission(opts);
  if (st !== 'granted' && request) st = await h.requestPermission(opts).catch(() => 'denied');
  return st === 'granted' ? 'granted' : 'prompt';
}

const ext = (c) => (c.kind !== 'video' ? 'png' : c.mime === 'video/mp4' ? 'mp4' : 'webm');
export function baseName(c) {
  const t = c.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'capture';
  return `${t} — ${c.createdAt.slice(0, 19).replace(/[T:]/g, '-')}.${ext(c)}`;
}

async function uniqueFile(dir, name) {
  const dot = name.lastIndexOf('.');
  for (let i = 0; i < 100; i++) {
    const n = i ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : name;
    try { await dir.getFileHandle(n); } catch { return dir.getFileHandle(n, { create: true }); }
  }
  throw new Error('trop de fichiers du même nom');
}

/**
 * Enregistre une capture sur l'ordinateur selon le réglage.
 * interactive = true seulement dans un clic : Chrome peut alors redemander l'accès au dossier.
 * Renvoie { where } en cas de succès, ou { needsAccess: true } si l'accès au dossier doit être redonné par un clic.
 */
export async function saveToComputer(c, { interactive = false } = {}) {
  const conf = saveConf();
  if (conf.mode === 'folder') {
    const st = await folderAccess(interactive);
    if (st === 'missing') return downloadsSave(c, conf);
    if (st !== 'granted') return { needsAccess: true, folderName: conf.folderName };
    const dir = await getFolderHandle();
    const fh = await uniqueFile(dir, baseName(c));
    const w = await fh.createWritable();
    await w.write(c.blob);
    await w.close();
    return { where: `dossier « ${dir.name} »` };
  }
  return downloadsSave(c, conf);
}

async function downloadsSave(c, conf) {
  const url = URL.createObjectURL(c.blob);
  try {
    const sub = conf.sub ? `${conf.sub}/` : '';
    await chrome.downloads.download({ url, filename: sub + baseName(c), conflictAction: 'uniquify' });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return { where: `Téléchargements${conf.sub ? '/' + conf.sub : ''}` };
}
