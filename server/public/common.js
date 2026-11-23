export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtSize(b) {
  return b > 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.round(b / 1024) + ' Ko';
}

let t;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + kind;
  el.hidden = false;
  clearTimeout(t);
  t = setTimeout(() => (el.hidden = true), 2200);
}

export async function copyText(text, input) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    // Contexte non sécurisé (accès via IP du réseau local) : copie à l'ancienne
    input.select();
    document.execCommand('copy');
  }
}

export const isVideo = (c) => c.kind === 'video';
export const fileUrl = (c) => `/i/${c.id}.${c.ext || 'png'}`;
export const fmtDuration = (sec) => { const s = Math.round(sec || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const thumbUrl = (c) => (c.thumb ? `/t/${c.id}.${c.thumb}` : null);
