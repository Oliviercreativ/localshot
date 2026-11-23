import { saveToComputer } from './savefolder.js';
// Serveur de partage : par défaut le serveur local du Mac ; réglable (ex. Raspberry Pi via Tailscale).
export const DEFAULT_SERVER = 'http://localhost:4777';
const CONF_KEY = 'server-conf';
export function serverConf() {
  try {
    const c = JSON.parse(localStorage.getItem(CONF_KEY) || '{}');
    return { url: c.url || DEFAULT_SERVER, key: c.key || '' };
  } catch { return { url: DEFAULT_SERVER, key: '' }; }
}
export const saveServerConf = (c) => localStorage.setItem(CONF_KEY, JSON.stringify(c));

// Appel au serveur avec la clé d'accès si elle est configurée.
export function api(path, opts = {}) {
  const { url, key } = serverConf();
  const headers = { ...(opts.headers || {}) };
  if (key) headers.Authorization = `Bearer ${key}`;
  return fetch(url + path, { ...opts, headers, credentials: 'omit' });
}

// Arrête un partage. Renvoie null si c'est confirmé par le serveur qui l'a émis, sinon la raison de l'échec.
export async function revokeShare(rec) {
  if (!rec.sharedId) return null;
  const { url } = serverConf();
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
