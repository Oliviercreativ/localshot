import { saveToComputer } from './savefolder.js';
// Serveur de partage : aucun par défaut. L'utilisateur indique le sien (Raspberry Pi, NAS, VPS, Docker…).
const CONF_KEY = 'server-conf';
export function serverConf() {
  try {
    const c = JSON.parse(localStorage.getItem(CONF_KEY) || '{}');
    // L'ancien serveur local par défaut n'est plus utilisé.
    const url = c.url && c.url !== 'http://localhost:4777' ? c.url : '';
    return { url, key: url ? c.key || '' : '' };
  } catch { return { url: '', key: '' }; }
}
export const saveServerConf = (c) => localStorage.setItem(CONF_KEY, JSON.stringify(c));

// Appel au serveur avec la clé d'accès si elle est configurée.
export function api(path, opts = {}) {
  const { url, key } = serverConf();
  if (!url) return Promise.reject(new Error('aucun serveur de partage réglé'));
  const headers = { ...(opts.headers || {}) };
  if (key) headers.Authorization = `Bearer ${key}`;
  return fetch(url + path, { ...opts, headers, credentials: 'omit' });
}

// Arrête un partage. Renvoie null si c'est confirmé par le serveur qui l'a émis, sinon la raison de l'échec.
export async function revokeShare(rec) {
  if (!rec.sharedId) return null;
  const { url } = serverConf();
  if (!url) return 'aucun serveur de partage réglé';
  if (rec.sharedServer && rec.sharedServer !== url) return `partagé sur un autre serveur (${new URL(rec.sharedServer).host})`;
  try {
    const r = await api(`/api/captures/${encodeURIComponent(rec.sharedId)}`, { method: 'DELETE' });
    if (r.ok || r.status === 404) return null;
    return r.status === 401 || r.status === 403 ? 'clé d\'accès refusée' : `erreur du serveur (${r.status})`;
  } catch { return 'serveur injoignable'; }
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

export const fmtDate = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.round(b / 1024) + ' Ko');

export const isVideo = (c) => c.kind === 'video';
export const extOf = (c) => (!isVideo(c) ? 'png' : c.mime === 'video/mp4' ? 'mp4' : 'webm');
export const fmtDuration = (sec) => { const s = Math.round(sec || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// Enregistre sur l'ordinateur selon le réglage « Dossier de sauvegarde » (dans un clic).
// Renvoie { where } ou { needsAccess } (accès au dossier refusé).
export const download = (c) => saveToComputer(c, { interactive: true });

let t;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + kind;
  el.hidden = false;
  clearTimeout(t);
  t = setTimeout(() => (el.hidden = true), 2400);
}

// Miniature légère pour la galerie (haut de l'image, format 16:10).
export async function makeThumb(bmp) {
  const W = 480;
  const s = W / bmp.width;
  const srcH = Math.min(bmp.height, 300 / s);
  const c = new OffscreenCanvas(W, Math.max(1, Math.round(srcH * s)));
  c.getContext('2d').drawImage(bmp, 0, 0, bmp.width, srcH, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/webp', quality: 0.8 });
}
