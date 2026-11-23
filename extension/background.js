// LocalShot — service worker. Les captures sont stockées dans l'extension (IndexedDB).
import { addCapture, newId } from './db.js';
import { openRecorder, toggleRecorder } from './recorder-launch.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'capture') {
    const p = startCapture(msg.mode, msg.tabId);
    if (msg.reply) { p.then((error) => reply({ error })); return true; } // le panneau latéral attend le résultat
  }
  if (msg?.type === 'area-selected' && sender.tab) finishArea(sender.tab, msg.rect, msg.viewportWidth);
  if (msg?.type === 'open-recorder') openRecorder().catch((e) => console.error('LocalShot vidéo :', e));
});

chrome.commands.onCommand.addListener((command, tab) => {
  const mode = { 'capture-visible': 'visible', 'capture-full': 'full', 'capture-area': 'area' }[command];
  if (mode && tab) startCapture(mode, tab.id);
  if (command === 'record-video') toggleRecorder().catch((e) => console.error('LocalShot vidéo :', e));
});


async function startCapture(mode, tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (mode === 'visible') await save(await captureBlob(tab.windowId), tab, mode);
    else if (mode === 'full') await save(await captureFullPage(tab), tab, mode);
    else if (mode === 'area') await chrome.scripting.executeScript({ target: { tabId }, files: ['area.js'] });
  } catch (e) {
    console.error('LocalShot:', e);
    flash('!', '#dc2626', tabId);
    return e.message || String(e);
  }
}

// Chrome limite captureVisibleTab à ~2 appels / seconde.
let lastCapture = 0;
async function captureBlob(windowId) {
  const wait = lastCapture + 600 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCapture = Date.now();
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  return (await fetch(dataUrl)).blob();
}

const exec = (tabId, func, args = []) => chrome.scripting.executeScript({ target: { tabId }, func, args });

async function captureFullPage(tab) {
  const [{ result: m }] = await exec(tab.id, prepareFullPage);
  const total = Math.min(m.height, Math.floor(32000 / m.dpr)); // limite de taille d'un canvas
  const shots = [];
  try {
    for (let y = 0, i = 0; y < total; y += m.vh, i++) {
      const [{ result: actualY }] = await exec(tab.id, scrollForCapture, [y, i > 0]);
      shots.push({ y: actualY, bmp: await createImageBitmap(await captureBlob(tab.windowId)) });
      if (actualY + m.vh >= total) break;
    }
  } finally {
    await exec(tab.id, restorePage).catch(() => {});
  }
  const scale = shots[0].bmp.height / m.vh;
  const canvas = new OffscreenCanvas(shots[0].bmp.width, Math.max(1, Math.round(total * scale)));
  const ctx = canvas.getContext('2d');
  for (const s of shots) ctx.drawImage(s.bmp, 0, Math.round(s.y * scale));
  return canvas.convertToBlob({ type: 'image/png' });
}

async function finishArea(tab, rect, viewportWidth) {
  try {
    const bmp = await createImageBitmap(await captureBlob(tab.windowId));
    const s = bmp.width / viewportWidth;
    const w = Math.max(1, Math.round(rect.w * s));
    const h = Math.max(1, Math.round(rect.h * s));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bmp, Math.round(rect.x * s), Math.round(rect.y * s), w, h, 0, 0, w, h);
    await save(await canvas.convertToBlob({ type: 'image/png' }), tab, 'area');
  } catch (e) {
    console.error('LocalShot:', e);
    flash('!', '#dc2626', tab.id);
  }
}

async function save(blob, tab, mode) {
  try {
    const bmp = await createImageBitmap(blob);
    const rec = {
      id: newId(),
      title: (tab.title || '').trim().slice(0, 300) || 'Capture sans titre',
      sourceUrl: /^(https?|file):\/\//i.test(tab.url || '') ? tab.url : '',
      mode,
      width: bmp.width,
      height: bmp.height,
      size: blob.size,
      createdAt: new Date().toISOString(),
      blob,
      thumb: await makeThumb(bmp),
    };
    await addCapture(rec);
    await chrome.tabs.create({ url: chrome.runtime.getURL(`ui/viewer.html?id=${rec.id}`), index: tab.index + 1, openerTabId: tab.id });
  } catch (e) {
    // Problème de stockage : on enregistre directement dans Téléchargements/LocalShot
    console.warn('LocalShot: stockage impossible, téléchargement direct.', e);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await chrome.downloads.download({ url: await blobToDataUrl(blob), filename: `LocalShot/capture-${stamp}.png` });
    flash('↓', '#2563eb', tab.id);
  }
}

// Miniature légère pour la galerie (haut de l'image, format 16:10)
async function makeThumb(bmp) {
  const W = 480;
  const s = W / bmp.width;
  const srcH = Math.min(bmp.height, 300 / s);
  const c = new OffscreenCanvas(W, Math.max(1, Math.round(srcH * s)));
  c.getContext('2d').drawImage(bmp, 0, 0, bmp.width, srcH, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/webp', quality: 0.8 });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/png'};base64,${btoa(bin)}`;
}

function flash(text, color, tabId) {
  chrome.action.setBadgeBackgroundColor({ color, tabId }).catch(() => {});
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }).catch(() => {}), 3000);
}

// ---------- Fonctions injectées dans la page (doivent être autonomes) ----------
function prepareFullPage() {
  const de = document.documentElement;
  const st = { x: scrollX, y: scrollY, behavior: de.style.scrollBehavior, changed: [], fixedHidden: false };
  de.style.scrollBehavior = 'auto';
  // Les éléments "sticky" se répéteraient sur chaque bande : on les remet dans le flux.
  for (const el of document.querySelectorAll('body *')) {
    if (getComputedStyle(el).position === 'sticky') {
      st.changed.push([el, 'position', el.style.getPropertyValue('position'), el.style.getPropertyPriority('position')]);
      el.style.setProperty('position', 'relative', 'important');
    }
  }
  window.__localshot = st;
  return { height: Math.max(de.scrollHeight, document.body?.scrollHeight || 0), vh: innerHeight, dpr: devicePixelRatio };
}

async function scrollForCapture(y, hideFixed) {
  const st = window.__localshot;
  // Après la 1re bande, on masque les éléments fixes (header, bannière cookies…) pour éviter les doublons.
  if (hideFixed && st && !st.fixedHidden) {
    st.fixedHidden = true;
    for (const el of document.querySelectorAll('body *')) {
      if (getComputedStyle(el).position === 'fixed') {
        st.changed.push([el, 'visibility', el.style.getPropertyValue('visibility'), el.style.getPropertyPriority('visibility')]);
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  }
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 150));
  return scrollY;
}

function restorePage() {
  const st = window.__localshot;
  if (!st) return;
  for (const [el, prop, val, prio] of st.changed.reverse()) {
    if (val) el.style.setProperty(prop, val, prio);
    else el.style.removeProperty(prop);
  }
  document.documentElement.style.scrollBehavior = st.behavior;
  window.scrollTo({ top: st.y, left: st.x, behavior: 'instant' });
  delete window.__localshot;
}
