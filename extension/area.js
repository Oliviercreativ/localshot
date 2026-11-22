// Sélection d'une zone à la souris. Injecté uniquement à la demande.
(() => {
  if (window.__localshotArea) return;
  window.__localshotArea = true;

  const mk = (css, text = '') => { const d = document.createElement('div'); d.style.cssText = css; d.textContent = text; return d; };
  const DIM = 'rgba(15,23,42,.45)';
  const root = mk(`all:initial;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:${DIM};`);
  const box = mk(`position:fixed;display:none;box-sizing:border-box;border:2px solid #f97316;box-shadow:0 0 0 100vmax ${DIM};pointer-events:none;`);
  const size = mk('position:fixed;display:none;padding:3px 7px;border-radius:6px;background:#f97316;color:#fff;font:600 11px/1.2 ui-monospace,Menlo,monospace;pointer-events:none;');
  const hint = mk('position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:#0f172a;color:#fff;font:500 13px/1.2 -apple-system,system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.25);',
    'Glissez pour sélectionner une zone · Échap pour annuler');
  root.append(box, size, hint);
  document.documentElement.append(root);

  let sx = 0, sy = 0, rect = null, dragging = false;

  function update(e) {
    const x = Math.max(0, Math.min(sx, e.clientX)), y = Math.max(0, Math.min(sy, e.clientY));
    const w = Math.min(innerWidth, Math.max(sx, e.clientX)) - x;
    const h = Math.min(innerHeight, Math.max(sy, e.clientY)) - y;
    rect = { x, y, w, h };
    Object.assign(box.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
    Object.assign(size.style, { display: 'block', left: x + 'px', top: (y > 26 ? y - 24 : y + 6) + 'px' });
  }

  function onDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    root.style.background = 'transparent';
    hint.style.display = 'none';
    update(e);
  }
  function onMove(e) { if (dragging) { e.preventDefault(); update(e); } }
  function onUp(e) {
    if (!dragging) return;
    e.preventDefault();
    dragging = false;
    if (!rect || rect.w < 4 || rect.h < 4) { // simple clic : on recommence
      root.style.background = DIM; box.style.display = size.style.display = 'none'; hint.style.display = 'block';
      return;
    }
    const r = rect;
    cleanup();
    // Attendre que l'overlay disparaisse de l'écran avant la capture
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'area-selected', rect: r, viewportWidth: innerWidth });
    }, 40)));
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(); }
  }
  function cleanup() {
    root.remove();
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('keydown', onKey, true);
    window.__localshotArea = false;
  }

  root.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('keydown', onKey, true);
})();
