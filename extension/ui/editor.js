// Éditeur d'annotations : flèches, cadres, texte, étapes numérotées, flou et masquage.
// Tout se passe dans la page : l'image ne quitte pas le navigateur.
// openEditor(blob) → Promise<Blob | null> (null si l'utilisateur annule).
import { svg, setIcon } from './icons.js';

const COLORS = ['#f97316', '#dc2626', '#2563eb', '#16a34a', '#facc15', '#0f172a', '#ffffff'];
const TOOLS = [
  ['select', 'Sélection (V)', '<path d="M5 3l14 8-6 1.5L10 19z"/>', 'v'],
  ['arrow', 'Flèche (A)', '<path class="s" d="M5 19L19 5M19 5h-8M19 5v8"/>', 'a'],
  ['rect', 'Cadre (R)', '<rect class="s" x="4" y="6" width="16" height="12" rx="2"/>', 'r'],
  ['text', 'Texte (T)', '<path class="s" d="M5 6V4h14v2M12 4v16M9 20h6"/>', 't'],
  ['step', 'Étape numérotée (N)', '<circle class="s" cx="12" cy="12" r="8"/><path d="M11 9h2v7h-2z"/>', 'n'],
  ['blur', 'Flouter une zone (B)', '<path d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z"/>', 'b'],
  ['redact', 'Masquer une zone (M)', '<rect x="4" y="7" width="16" height="10" rx="1"/>', 'm'],
];
const icon = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export async function openEditor(blob) {
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height;
  const unit = Math.max(2, Math.round(Math.min(W, H) / 300)); // épaisseur de base, proportionnelle à l'image

  // Copie pixellisée de toute l'image : le flou y découpe ses zones (irréversible, contrairement à un flou léger).
  const block = Math.max(10, Math.round(Math.min(W, H) / 60));
  const small = new OffscreenCanvas(Math.max(1, Math.ceil(W / block)), Math.max(1, Math.ceil(H / block)));
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(bmp, 0, 0, small.width, small.height);
  const pixel = new OffscreenCanvas(W, H);
  const pctx = pixel.getContext('2d');
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(small, 0, 0, W, H);

  // ---------- Interface ----------
  const root = el('div', 'ed', { role: 'dialog', 'aria-label': 'Annoter la capture' });
  const bar = el('div', 'ed-bar');
  const tools = el('div', 'ed-group');
  for (const [name, label, body] of TOOLS) {
    const b = el('button', 'ed-tool', { type: 'button', 'data-tool': name, title: label, 'aria-label': label });
    b.innerHTML = icon(body);
    tools.append(b);
  }
  const colors = el('div', 'ed-group');
  for (const c of COLORS) {
    const b = el('button', 'ed-color', { type: 'button', 'data-color': c, title: c, 'aria-label': `Couleur ${c}` });
    b.style.setProperty('--c', c);
    colors.append(b);
  }
  const sizes = el('div', 'ed-group');
  for (const [k, label] of [[1, 'Fin'], [2, 'Moyen'], [3.5, 'Épais']]) {
    const b = el('button', 'ed-size', { type: 'button', 'data-size': String(k), title: label, 'aria-label': `Trait ${label.toLowerCase()}` });
    b.append(el('i'));
    b.lastChild.style.setProperty('--w', `${2 + k * 2}px`);
    sizes.append(b);
  }
  const undoB = el('button', 'ed-btn', { type: 'button', title: 'Annuler (⌘Z)' });
  undoB.append(svg('undo'));
  undoB.setAttribute('aria-label', 'Annuler');
  const redoB = el('button', 'ed-btn', { type: 'button', title: 'Rétablir (⇧⌘Z)' });
  redoB.append(svg('redo'));
  redoB.setAttribute('aria-label', 'Rétablir');
  const delB = el('button', 'ed-btn', { type: 'button', title: 'Supprimer l\'élément sélectionné (⌫)' });
  setIcon(delB, 'trash', 'Supprimer');
  const cancelB = el('button', 'btn', { type: 'button' });
  cancelB.textContent = 'Annuler';
  const saveB = el('button', 'btn primary', { type: 'button' });
  saveB.textContent = 'Enregistrer';
  const hist = el('div', 'ed-group');
  hist.append(undoB, redoB, delB);
  const end = el('div', 'ed-end');
  end.append(cancelB, saveB);
  bar.append(tools, colors, sizes, hist, el('div', 'ed-spacer'), end);

  const scroller = el('div', 'ed-scroll');
  const wrap = el('div', 'ed-wrap');
  const canvas = el('canvas', 'ed-canvas');
  canvas.width = W;
  canvas.height = H;
  wrap.append(canvas);
  scroller.append(wrap);
  const hint = el('div', 'ed-hint');
  root.append(bar, scroller, hint);
  document.body.append(root);
  document.documentElement.classList.add('ed-open');
  const ctx = canvas.getContext('2d');

  // ---------- État ----------
  let shapes = [];
  const undoStack = [], redoStack = [];
  let tool = 'arrow', color = COLORS[0], size = 2;
  let draft = null, selected = null, drag = null;
  const snapshot = () => JSON.stringify(shapes);
  function commit(before) {
    undoStack.push(before);
    redoStack.length = 0;
    syncButtons();
  }
  const nextStep = () => 1 + shapes.filter((s) => s.type === 'step').length;

  const HINTS = {
    select: 'Cliquez sur un élément pour le sélectionner, glissez pour le déplacer, ⌫ pour le supprimer.',
    arrow: 'Glissez pour tracer une flèche.',
    rect: 'Glissez pour encadrer une zone.',
    text: 'Cliquez où écrire, puis Entrée pour valider.',
    step: 'Cliquez pour poser une étape numérotée (1, 2, 3…).',
    blur: 'Glissez sur une zone à flouter : e-mail, montant, nom… Le flou est définitif dans l\'image enregistrée.',
    redact: 'Glissez pour masquer une zone avec un bloc plein.',
  };
  function syncButtons() {
    for (const b of tools.children) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    for (const b of colors.children) b.setAttribute('aria-pressed', String(b.dataset.color === color));
    for (const b of sizes.children) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === size));
    undoB.disabled = !undoStack.length;
    redoB.disabled = !redoStack.length;
    delB.disabled = !selected;
    hint.textContent = HINTS[tool];
    canvas.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
  }

  // ---------- Dessin ----------
  const norm = (s) => ({ x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) });
  const fontPx = (s) => Math.round(unit * 7 * s.size);
  function stepR(s) { return Math.round(unit * 6 * Math.max(1, s.size * 0.8)); }

  function bounds(s) {
    if (s.type === 'text') {
      ctx.font = `700 ${fontPx(s)}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      const lines = s.text.split('\n');
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const pad = fontPx(s) * 0.35;
      return { x: s.x1 - pad, y: s.y1 - pad, w: w + pad * 2, h: lines.length * fontPx(s) * 1.25 + pad * 2 };
    }
    if (s.type === 'step') { const r = stepR(s); return { x: s.x1 - r, y: s.y1 - r, w: 2 * r, h: 2 * r }; }
    const b = norm(s);
    const m = s.type === 'arrow' ? unit * 4 * s.size : 0;
    return { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
  }

  function drawShape(s) {
    const lw = unit * s.size * 1.5;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (s.type === 'blur') {
      const b = norm(s);
      if (b.w && b.h) ctx.drawImage(pixel, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
    } else if (s.type === 'redact') {
      const b = norm(s);
      ctx.fillStyle = s.color === '#ffffff' ? '#ffffff' : '#0f172a';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (s.type === 'rect') {
      const b = norm(s);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = lw;
      ctx.shadowColor = 'rgba(0,0,0,.25)';
      ctx.shadowBlur = lw;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, lw);
      ctx.stroke();
    } else if (s.type === 'arrow') {
      const { x1, y1, x2, y2 } = s;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const head = Math.min(len * 0.6, lw * 4.5);
      ctx.strokeStyle = ctx.fillStyle = s.color;
      ctx.lineWidth = lw;
      ctx.shadowColor = 'rgba(0,0,0,.25)';
      ctx.shadowBlur = lw;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - Math.cos(ang) * head * 0.6, y2 - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (s.type === 'step') {
      const r = stepR(s);
      ctx.fillStyle = s.color;
      ctx.shadowColor = 'rgba(0,0,0,.3)';
      ctx.shadowBlur = r / 3;
      ctx.beginPath();
      ctx.arc(s.x1, s.y1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = ['#ffffff', '#facc15'].includes(s.color) ? '#0f172a' : '#ffffff';
      ctx.font = `800 ${Math.round(r * 1.1)}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s.n), s.x1, s.y1 + r * 0.05);
    } else if (s.type === 'text') {
      const fs = fontPx(s);
      const b = bounds(s);
      const light = ['#ffffff', '#facc15'].includes(s.color);
      ctx.fillStyle = light ? 'rgba(15,23,42,.85)' : 'rgba(255,255,255,.92)';
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, fs * 0.25);
      ctx.fill();
      ctx.fillStyle = s.color;
      ctx.font = `700 ${fs}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      s.text.split('\n').forEach((l, i) => ctx.fillText(l, s.x1, s.y1 + i * fs * 1.25 + fs * 0.1));
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bmp, 0, 0);
    // Les flous et masques passent en premier : rien ne doit réapparaître par-dessus.
    for (const s of shapes) if (s.type === 'blur' || s.type === 'redact') drawShape(s);
    for (const s of shapes) if (s.type !== 'blur' && s.type !== 'redact') drawShape(s);
    if (draft) drawShape(draft);
    if (selected) {
      const b = bounds(selected);
      ctx.save();
      ctx.setLineDash([unit * 3, unit * 2]);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = Math.max(1, unit / 1.5);
      ctx.strokeRect(b.x - unit * 2, b.y - unit * 2, b.w + unit * 4, b.h + unit * 4);
      ctx.restore();
    }
  }

  // ---------- Souris ----------
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function hit(p) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const b = bounds(shapes[i]);
      const m = unit * 4;
      if (p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m) return shapes[i];
    }
    return null;
  }

  let textBox = null;
  function finishText() {
    if (!textBox) return;
    const { input, x, y, edit } = textBox;
    textBox = null;
    input.remove();
    const text = input.value.replace(/\s+$/, '');
    const before = snapshot();
    if (edit) {
      if (text) edit.text = text;
      else shapes = shapes.filter((s) => s !== edit);
    } else if (text) shapes.push({ type: 'text', x1: x, y1: y, text, color, size });
    if (snapshot() !== before) commit(before);
    render();
  }
  function startText(p, edit) {
    finishText();
    const r = canvas.getBoundingClientRect();
    const scale = r.width / W;
    const input = el('textarea', 'ed-text', { rows: '1', 'aria-label': 'Texte de l\'annotation' });
    const s = edit || { size, color };
    input.style.left = `${p.x * scale}px`;
    input.style.top = `${p.y * scale}px`;
    input.style.fontSize = `${Math.max(12, fontPx(s) * scale)}px`;
    input.style.color = s.color;
    if (edit) { input.value = edit.text; shapes = shapes.filter((x) => x !== edit); render(); shapes.push(edit); }
    wrap.append(input);
    textBox = { input, x: p.x, y: p.y, edit };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishText(); }
      if (e.key === 'Escape') { e.preventDefault(); input.value = edit ? edit.text : ''; finishText(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) finishText(); }, 0));
    input.focus();
    setTimeout(() => input.focus(), 0);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (textBox) { finishText(); return; }
    const p = pt(e);
    if (tool === 'select') {
      selected = hit(p);
      if (selected) drag = { from: p, before: snapshot(), orig: { ...selected } };
      syncButtons();
      render();
    } else if (tool === 'text') {
      e.preventDefault(); // garde le curseur dans la zone de texte qui va s'ouvrir
      const t = hit(p);
      return startText(t?.type === 'text' ? { x: t.x1, y: t.y1 } : p, t?.type === 'text' ? t : null);
    } else if (tool === 'step') {
      const before = snapshot();
      shapes.push({ type: 'step', x1: p.x, y1: p.y, n: nextStep(), color, size });
      commit(before);
      render();
      return;
    } else {
      draft = { type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, size };
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pt(e);
    if (draft) { draft.x2 = p.x; draft.y2 = p.y; render(); }
    else if (drag && selected) {
      const dx = p.x - drag.from.x, dy = p.y - drag.from.y;
      selected.x1 = drag.orig.x1 + dx; selected.y1 = drag.orig.y1 + dy;
      if ('x2' in selected) { selected.x2 = drag.orig.x2 + dx; selected.y2 = drag.orig.y2 + dy; }
      render();
    } else if (tool === 'select') canvas.style.cursor = hit(p) ? 'move' : 'default';
  });
  const up = () => {
    if (draft) {
      const b = norm(draft);
      const tiny = draft.type === 'arrow' ? Math.hypot(b.w, b.h) < unit * 4 : b.w < unit * 3 || b.h < unit * 3;
      if (!tiny) { const before = snapshot(); shapes.push(draft); commit(before); }
      draft = null;
      render();
    }
    if (drag) {
      if (snapshot() !== drag.before) commit(drag.before);
      drag = null;
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('dblclick', (e) => {
    const t = hit(pt(e));
    if (t?.type === 'text') { tool = 'text'; syncButtons(); startText({ x: t.x1, y: t.y1 }, t); }
  });

  // ---------- Barre d'outils ----------
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    finishText();
    tool = b.dataset.tool;
    if (tool !== 'select') selected = null;
    syncButtons();
    render();
  });
  function restyle(patch) {
    if (selected) {
      const before = snapshot();
      Object.assign(selected, patch);
      if (snapshot() !== before) commit(before);
      render();
    }
  }
  colors.addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (b) { color = b.dataset.color; restyle({ color }); syncButtons(); }
  });
  sizes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (b) { size = Number(b.dataset.size); restyle({ size }); syncButtons(); }
  });
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    shapes = JSON.parse(undoStack.pop());
    selected = null;
    syncButtons();
    render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    shapes = JSON.parse(redoStack.pop());
    selected = null;
    syncButtons();
    render();
  }
  function remove() {
    if (!selected) return;
    const before = snapshot();
    shapes = shapes.filter((s) => s !== selected);
    selected = null;
    commit(before);
    render();
  }
  undoB.addEventListener('click', undo);
  redoB.addEventListener('click', redo);
  delB.addEventListener('click', remove);

  return new Promise((resolve) => {
    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', onLeave);
      root.remove();
      document.documentElement.classList.remove('ed-open');
      bmp.close();
      resolve(result);
    }
    const onLeave = (e) => { if (shapes.length) e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    function onKey(e) {
      if (textBox) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return saveB.click(); }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selected) { e.preventDefault(); return remove(); }
      if (e.key === 'Escape') { e.preventDefault(); return selected ? (selected = null, syncButtons(), render()) : cancelB.click(); }
      if (mod || e.altKey) return;
      const t = TOOLS.find((x) => x[3] === e.key.toLowerCase());
      if (t) { tool = t[0]; if (tool !== 'select') selected = null; syncButtons(); render(); }
    }
    document.addEventListener('keydown', onKey, true);
    cancelB.addEventListener('click', () => {
      if (shapes.length && !confirm('Abandonner les annotations ?')) return;
      close(null);
    });
    saveB.addEventListener('click', async () => {
      finishText();
      if (!shapes.length) return close(null);
      selected = null;
      render();
      saveB.disabled = true;
      canvas.toBlob((b) => close(b), 'image/png');
    });
    syncButtons();
    render();
  });
}
