import { saveToComputer } from './savefolder.js';
// Le partage par serveur a été retiré (0.10) : on oublie l'ancienne adresse et son autorisation réseau,
// sauf si elle sert aussi aux sous-titres ou si l'effet de clic a l'accès à tous les sites.
const OLD_SERVER = 'server-conf';
if (localStorage.getItem(OLD_SERVER)) {
  let old = '';
  try { old = new URL(JSON.parse(localStorage.getItem(OLD_SERVER)).url).origin; } catch {}
  localStorage.removeItem(OLD_SERVER);
  let tr = '';
  try { tr = new URL(JSON.parse(localStorage.getItem('transcribe-conf') || '{}').url).origin; } catch {}
  if (old && old !== tr) {
    chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })
      .then((all) => all || chrome.permissions.remove({ origins: [`${old}/*`] }))
      .catch(() => {});
  }
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
