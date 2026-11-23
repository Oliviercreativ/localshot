import { listCaptures } from './db.js';
import { openRecorder, recorderStatus } from './recorder-launch.js';

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

// Vidéo : le bouton est branché tout de suite ; l'état de l'enregistreur est lu en parallèle.
const recBtn = document.getElementById('record');
let live = false;
recBtn.addEventListener('click', async () => {
  recBtn.disabled = true;
  try {
    if (live) await chrome.runtime.sendMessage({ type: 'rec-stop' }).catch(() => {});
    else await openRecorder();
    window.close();
  } catch (e) {
    console.error('LocalShot vidéo :', e);
    recBtn.disabled = false;
    document.getElementById('recLabel').textContent = `Erreur : ${e.message}`;
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

// Affichage ordinateur / tablette / mobile pour les captures
import('./ui/device.js').then(({ mountDevicePicker }) => mountDevicePicker(document.getElementById('device'), {
  onError: (m) => { const e = document.getElementById('deviceErr'); e.textContent = m; e.hidden = false; },
  onChange: () => { document.getElementById('deviceErr').hidden = true; },
}));
