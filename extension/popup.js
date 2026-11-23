import { listCaptures } from './db.js';
import { openRecorder, recorderStatus } from './recorder-launch.js';
import { mountRecOptions } from './ui/recopts.js';

document.querySelectorAll('[data-mode]').forEach((btn) =>
  btn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try { await chrome.runtime.sendMessage({ type: 'capture', mode: btn.dataset.mode, tabId: tab.id }); } catch { /* pas de réponse attendue */ }
    window.close();
  })
);

document.getElementById('gallery').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('ui/gallery.html') });
  window.close();
});

// Panneau latéral : Chrome exige que l'ouverture suive directement le clic, d'où l'identifiant de fenêtre lu à l'avance.
let windowId;
chrome.windows.getCurrent().then((w) => (windowId = w.id));
document.getElementById('panel').addEventListener('click', () => {
  if (!chrome.sidePanel) return alert('Rechargez LocalShot dans chrome://extensions (bouton ↻) pour activer le panneau latéral.');
  chrome.sidePanel.open({ windowId }).then(() => window.close(), (e) => console.error('LocalShot panneau :', e));
});

// Vidéo : le bouton affiche les options ici même ; « Choisir quoi enregistrer » ouvre le choix de Chrome.
// Pendant un enregistrement, il le termine.
const recBtn = document.getElementById('record');
const recPanel = document.getElementById('recPanel');
let live = false;
const recErr = (m) => { const e = document.getElementById('recErr'); e.textContent = m; e.hidden = !m; };
const recInputs = mountRecOptions(document.getElementById('recOpts'), { onError: recErr, panel: true });
recBtn.addEventListener('click', async () => {
  if (!live) {
    recPanel.hidden = !recPanel.hidden;
    recBtn.setAttribute('aria-expanded', String(!recPanel.hidden));
    if (!recPanel.hidden) document.getElementById('recGo').focus();
    return;
  }
  recBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: 'rec-stop' }).catch(() => {});
  window.close();
});
document.getElementById('recGo').addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  try {
    // Chrome n'ouvre le panneau latéral que directement après le clic : avant toute attente.
    if (recInputs.panel.checked && chrome.sidePanel) await chrome.sidePanel.open({ windowId }).catch((err) => console.warn('LocalShot panneau :', err));
    await openRecorder({ auto: true });
    window.close();
  } catch (err) {
    console.error('LocalShot vidéo :', err);
    e.currentTarget.disabled = false;
    recErr(`Erreur : ${err.message}`);
  }
});
recorderStatus().then((rec) => {
  live = !!rec && ['recording', 'paused'].includes(rec.state);
  if (!live) return;
  const s = Math.floor(rec.elapsed / 1000);
  recBtn.classList.add('live');
  document.getElementById('recLabel').textContent = `Terminer la vidéo (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
});

const status = document.getElementById('status');
const n = (await listCaptures()).length;
status.className = 'status ok';
status.querySelector('span').textContent = `${n} élément${n > 1 ? 's' : ''} · stockés dans Chrome`;
