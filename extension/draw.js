// Annotations à main levée pendant un enregistrement vidéo LocalShot : stylo, flèche, cadre, surligneur.
// Injecté seulement quand vous choisissez un outil pendant l'enregistrement ; ne lit rien et n'envoie rien.
(() => {
  if (window.__lsDraw) return;
  const host = document.createElement('localshot-draw');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;contain:strict;';
  const root = host.attachShadow({ mode: 'closed' });
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;touch-action:none;';
  root.append(canvas);
  const ctx = canvas.getContext('2d');

  let tool = null, color = '#f97316', shapes = [], draft = null;

  function fit() {
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }

  function arrow(s) {
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), h = 18;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2 - Math.cos(a) * h * 0.6, s.y2 - Math.sin(a) * h * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - h * Math.cos(a - 0.45), s.y2 - h * Math.sin(a - 0.45));
    ctx.lineTo(s.x2 - h * Math.cos(a + 0.45), s.y2 - h * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  function draw(s) {
    ctx.save();
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = s.color;
    ctx.shadowColor = 'rgba(15,23,42,.35)';
    ctx.shadowBlur = 3;
    if (s.type === 'pen' || s.type === 'mark') {
      if (s.type === 'mark') { ctx.globalAlpha = 0.35; ctx.lineWidth = 22; ctx.shadowBlur = 0; ctx.lineCap = 'butt'; }
      else ctx.lineWidth = 4;
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    } else if (s.type === 'rect') {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1), 6);
      ctx.stroke();
    } else if (s.type === 'arrow') {
      ctx.lineWidth = 5;
      arrow(s);
    }
    ctx.restore();
  }

  function paint() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of shapes) draw(s);
    if (draft) draw(draft);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!tool || e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = [e.clientX, e.clientY];
    draft = tool === 'pen' || tool === 'mark'
      ? { type: tool, color, pts: [p] }
      : { type: tool, color, x1: p[0], y1: p[1], x2: p[0], y2: p[1] };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!draft) return;
    if (draft.pts) draft.pts.push([e.clientX, e.clientY]);
    else { draft.x2 = e.clientX; draft.y2 = e.clientY; }
    paint();
  });
  const end = () => {
    if (!draft) return;
    const big = draft.pts ? draft.pts.length > 1 : Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 6;
    if (big) shapes.push(draft);
    draft = null;
    paint();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // Échap : on arrête de dessiner (les annotations restent) et la page redevient cliquable.
  function onKey(e) { if (e.key === 'Escape' && tool) { setTool(null); e.stopPropagation(); } }

  function setTool(t, c) {
    tool = t || null;
    if (c) color = c;
    if (!host.isConnected) (document.documentElement || document).append(host);
    host.style.pointerEvents = tool ? 'auto' : 'none';
    canvas.style.cursor = tool ? 'crosshair' : 'default';
  }

  function off() {
    removeEventListener('resize', fit);
    removeEventListener('keydown', onKey, true);
    host.remove();
    delete window.__lsDraw;
  }

  addEventListener('resize', fit);
  addEventListener('keydown', onKey, true);
  fit();
  window.__lsDraw = off;
  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg?.type === 'ls-draw') { setTool(msg.tool, msg.color); send?.({ ok: true }); }
    else if (msg?.type === 'ls-draw-clear') { shapes = []; paint(); }
    else if (msg?.type === 'ls-draw-off') off();
  });
})();
