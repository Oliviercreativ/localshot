// Barre de contrôle d'un enregistrement vidéo : chrono, Démarrer, Pause / Reprendre, Terminer, Annuler.
// Elle se monte dans n'importe quel document : la fenêtre flottante de l'enregistreur (avec ou sans caméra)
// ou celle détachée depuis le panneau latéral.
import { tr } from './i18n.js';
import { svg } from './icons.js';

export const BAR_CSS = `
  html,body{margin:0;height:100%;background:#0f172a;overflow:hidden;font:600 13px -apple-system,system-ui,sans-serif;color:#fff;user-select:none}
  video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}
  .cd{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-size:72px;font-weight:800;background:rgba(15,23,42,.55)}
  .bar{display:flex;gap:6px;align-items:center}
  body.cam .bar{position:fixed;left:6px;right:6px;bottom:6px;justify-content:center;flex-wrap:wrap;opacity:0;transition:opacity .15s}
  body.cam:hover .bar,body.cam.show .bar,body.cam .bar:focus-within{opacity:1}
  body.solo{background:#0f172a;padding:14px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px}
  body.solo .bar{display:flex;flex-direction:column;align-items:stretch;gap:10px;height:auto;padding:0}
  body.solo .top{display:flex;align-items:center;gap:8px;font-size:14px}
  body.solo .top .t{margin-left:auto;font:700 22px/1 ui-monospace,Menlo,monospace;min-width:0}
  .btns{display:flex;gap:6px}
  body.solo .btns button{flex:1;justify-content:center;padding:9px 6px;font-size:13px}
  body.cam .top .lab{display:none}
  .st{display:flex;align-items:center;gap:7px;background:rgba(15,23,42,.85);padding:6px 9px;border-radius:8px}
  .dot{width:9px;height:9px;border-radius:50%;background:#94a3b8;flex:none}
  .dot.on{background:#ef4444;animation:blink 1.2s steps(2,start) infinite}
  @keyframes blink{to{opacity:.25}}
  @media (prefers-reduced-motion:reduce){.dot.on{animation:none}}
  .t{font-family:ui-monospace,Menlo,monospace;font-size:14px;min-width:40px}
  button{display:inline-flex;align-items:center;border:0;border-radius:8px;padding:7px 10px;font:inherit;cursor:pointer;background:rgba(255,255,255,.12);color:#fff;white-space:nowrap}
  body.cam button{background:rgba(15,23,42,.85)}
  button:hover{background:rgba(255,255,255,.22)}
  button:focus-visible{outline:2px solid #f97316;outline-offset:1px}
  button:disabled{opacity:.45;cursor:default}
  button.go{background:#f97316}
  button.go:hover{background:#ea580c}
  button.stop{background:#dc2626}
  button.stop:hover{background:#b91c1c}
  button.x.sure{background:#fff;color:#b91c1c}
  body.cam .lbl{display:none}
  body.cam .ico{margin:0}
  .tools .ico{margin:0;width:16px;height:16px}
  .tools{display:flex;gap:4px;align-items:center}
  body.solo .tools{padding-top:10px;border-top:1px solid rgba(255,255,255,.12)}
  body.solo .tools .clear{margin-left:auto}
  body.solo .note{height:auto;padding:0}
  body.cam .tools{position:fixed;left:6px;right:6px;top:6px;justify-content:center;flex-wrap:wrap;opacity:0;transition:opacity .15s}
  body.cam:hover .tools,body.cam.show .tools,body.cam .tools:focus-within{opacity:1}
  .tools button{padding:5px 7px;font-size:15px;line-height:1;min-width:30px}
  .note{font-size:12px;font-weight:500;color:#fed7aa;padding:0 12px 6px;height:40px;display:flex;align-items:center}
  body.cam .note{position:fixed;left:6px;right:6px;top:6px;height:auto;padding:6px 8px;background:rgba(15,23,42,.85);border-radius:8px}
  .tools button[aria-pressed=true]{background:#f97316}
  .tools .sw{min-width:0;width:22px;height:22px;padding:0;border-radius:50%;border:2px solid rgba(255,255,255,.35)}
  .sw[aria-pressed=true]{border-color:#fff;box-shadow:0 0 0 2px #f97316}
  .sep{width:1px;height:20px;background:rgba(255,255,255,.2);margin:0 2px}
  .ico{width:1.15em;height:1.15em;flex:none}.ico:not(:last-child){margin-inline-end:.45em}
  [hidden]{display:none!important}`;

export const ACTIVE = ['ready', 'countdown', 'recording', 'paused'];
// Outils d'annotation pendant l'enregistrement (dessinés sur la page par draw.js).
export const DRAW_TOOLS = [['laser', 'laser', 'Pointeur'], ['pen', 'pen', 'Stylo'], ['arrow', 'arrow', 'Flèche'], ['rect', 'rect', 'Cadre'], ['step', 'step', 'Numéro'], ['mark', 'mark', 'Surligneur']];
export const DRAW_COLORS = ['#f97316', '#dc2626', '#2563eb', '#facc15'];
export const fmtTime = (ms) => { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// Bouton : icône toujours visible, texte masqué dans la bulle caméra (trop étroite), info-bulle et nom accessible.
// `icon` : nom d'une icône de icons.js.
export function setLabel(btn, icon, text) {
  const lbl = btn.ownerDocument.createElement('span');
  lbl.className = 'lbl';
  lbl.textContent = text;
  btn.replaceChildren(svg(icon, btn.ownerDocument), lbl);
  btn.title = text;
  btn.setAttribute('aria-label', text);
}

/**
 * Monte la barre dans `doc`. Renvoie { render(st), video, cd }.
 * st = { state, elapsed (ms), count (compte à rebours) }.
 * onMain : Démarrer (état « prêt ») ou Pause / Reprendre ; onStop : Terminer ; onCancel : Annuler (confirmé en deux clics).
 */
export function mountBar(doc, { cam = false, onMain, onStop, onCancel, onDraw, onClear }) {
  doc.title = 'LocalShot';
  doc.head.append(Object.assign(doc.createElement('style'), { textContent: BAR_CSS }));
  doc.body.className = cam ? 'cam' : 'solo';
  doc.body.innerHTML = (cam ? '<video autoplay muted playsinline></video><div class="cd" hidden></div>' : '') +
    (cam
      ? '<div class="bar" hidden><span class="st top" role="timer"><span class="dot"></span><span class="t">0:00</span></span>' +
        '<button class="main"></button><button class="stop"></button><button class="x"></button></div>'
      : '<div class="bar" hidden><div class="top"><span class="dot"></span><span class="lab"></span><span class="t" role="timer">0:00</span></div>' +
        '<div class="btns"><button class="main"></button><button class="stop"></button><button class="x"></button></div></div>') +
    '<div class="tools" hidden></div><div class="note" role="status" hidden></div>';
  const q = (sel) => doc.querySelector(sel);
  const ui = { lab: q('.lab'), video: q('video'), cd: q('.cd'), bar: q('.bar'), dot: q('.dot'), t: q('.t'), main: q('.main'), stop: q('.stop'), x: q('.x'), tools: q('.tools'), note: q('.note') };
  // Outils : un clic sur l'outil actif arrête de dessiner (la page redevient cliquable).
  const mk = (cls, text, label, fn) => {
    const b = doc.createElement('button');
    b.className = cls;
    if (text) b.append(svg(text, doc));
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    ui.tools.append(b);
    return b;
  };
  const toolBtns = DRAW_TOOLS.map(([id, icon, label]) => {
    const b = mk('tool', icon, tr(label), () => onDraw?.(last.draw?.tool === id ? null : id, last.draw?.color));
    b.dataset.id = id;
    return b;
  });
  ui.tools.append(Object.assign(doc.createElement('span'), { className: 'sep' }));
  const swBtns = DRAW_COLORS.map((c) => {
    const b = mk('sw', '', tr('Couleur'), () => onDraw?.(last.draw?.tool || 'pen', c));
    b.style.background = c;
    b.dataset.c = c;
    return b;
  });
  ui.tools.append(Object.assign(doc.createElement('span'), { className: 'sep' }));
  mk('clear', 'eraser', tr('Effacer les annotations'), () => onClear?.());
  let last = { state: 'idle' };
  let sureTimer;

  ui.main.addEventListener('click', () => onMain(last.state));
  ui.stop.addEventListener('click', () => onStop());
  // Annuler en deux clics : les boîtes de dialogue ne s'affichent pas dans une fenêtre flottante.
  ui.x.addEventListener('click', () => {
    if (last.state === 'ready' || ui.x.classList.contains('sure')) {
      clearTimeout(sureTimer);
      ui.x.classList.remove('sure');
      return onCancel();
    }
    ui.x.classList.add('sure');
    setLabel(ui.x, 'trash', tr('Supprimer la vidéo ?'));
    sureTimer = setTimeout(() => { ui.x.classList.remove('sure'); render(last); }, 3000);
  });

  function render(st) {
    last = st;
    const { state } = st;
    const active = ACTIVE.includes(state);
    ui.bar.hidden = !active;
    if (ui.cd) {
      ui.cd.hidden = state !== 'countdown';
      ui.cd.textContent = st.count || '';
    }
    ui.note.hidden = !st.note;
    ui.note.textContent = st.note ? tr(st.note) : '';
    ui.tools.hidden = !!st.note || !active || !st.draw || !['recording', 'paused'].includes(state);
    if (st.draw) {
      for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.id === st.draw.tool));
      for (const b of swBtns) b.setAttribute('aria-pressed', String(b.dataset.c === st.draw.color));
    }
    if (!active) return;
    // Bulle caméra : pendant l'enregistrement, la barre n'apparaît qu'au survol, pour ne pas cacher le visage dans la vidéo.
    doc.body.classList.toggle('show', state !== 'recording');
    ui.dot.classList.toggle('on', state === 'recording');
    if (ui.lab) ui.lab.textContent = tr({ ready: 'Prêt', countdown: 'Préparez-vous…', recording: 'Enregistrement', paused: 'En pause' }[state]);
    ui.t.textContent = state === 'countdown' && !ui.cd ? `${st.count || ''}…` : fmtTime(state === 'ready' ? 0 : st.elapsed);
    ui.main.className = state === 'ready' ? 'main go' : 'main';
    ui.main.disabled = state === 'countdown';
    if (state === 'ready' || state === 'countdown') setLabel(ui.main, 'record', tr('Démarrer'));
    else if (state === 'paused') setLabel(ui.main, 'play', tr('Reprendre'));
    else setLabel(ui.main, 'pause', tr('Pause'));
    ui.stop.className = 'stop';
    ui.stop.hidden = state === 'ready' || state === 'countdown';
    setLabel(ui.stop, 'stop', tr('Terminer'));
    if (!ui.x.classList.contains('sure')) setLabel(ui.x, 'x', tr('Annuler'));
  }

  return { render, video: ui.video };
}
