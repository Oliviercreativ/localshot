// Options d'un enregistrement vidéo, proposées dans le popup et le panneau latéral.
// Elles sont partagées avec la fenêtre d'enregistrement (même stockage local de l'extension).
import { svg } from './icons.js';

const KEY = 'rec-prefs';
const PAGES = { origins: ['http://*/*', 'https://*/*'] };
const OPTS = [
  ['mic', 'mic', 'Micro', 'Votre voix'],
  ['cam', 'video', 'Caméra', 'Bulle ronde, visible si vous enregistrez l\'écran entier'],
  ['sys', 'speaker', 'Son de l\'onglet', 'Le son de la page enregistrée'],
  ['clicks', 'click', 'Effet de clic', 'Un cercle orange à chaque clic'],
];

// Popup seulement : piloter l'enregistrement depuis le panneau latéral plutôt que depuis le lecteur flottant.
const PANEL = ['panel', 'dock', 'Commandes dans le panneau latéral', 'Démarrer, pause et annotations à droite de la page'];

export const readPrefs = () => ({ mic: true, sys: true, clicks: false, cam: false, panel: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') });

/** Monte les cases à cocher dans `box`. onError(message) si Chrome refuse l'accès aux pages (effet de clic). */
export function mountRecOptions(box, { onError = () => {}, panel = false } = {}) {
  const prefs = readPrefs();
  const inputs = {};
  for (const [id, icon, name, hint] of panel ? [...OPTS, PANEL] : OPTS) {
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!prefs[id] });
    inputs[id] = input;
    const label = document.createElement('label');
    label.className = 'ro-opt';
    const txt = document.createElement('span');
    txt.className = 'ro-txt';
    txt.append(Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('small'), { textContent: hint }));
    label.append(input, svg(icon), txt);
    box.append(label);
  }
  const save = () => localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.checked])) }));
  // L'effet de clic n'est coché que si Chrome a donné l'accès aux pages.
  chrome.permissions.contains(PAGES).then((ok) => { if (!ok && inputs.clicks.checked) { inputs.clicks.checked = false; save(); } }).catch(() => {});
  for (const [id, input] of Object.entries(inputs)) {
    input.addEventListener('change', async () => {
      if (id === 'clicks') {
        if (input.checked && !(await chrome.permissions.request(PAGES).catch(() => false))) {
          input.checked = false;
          onError('Sans l\'autorisation de Chrome, l\'effet de clic ne peut pas s\'afficher dans les pages.');
        }
        if (!input.checked) chrome.permissions.remove(PAGES).catch(() => {});
      }
      save();
    });
  }
  return inputs;
}
