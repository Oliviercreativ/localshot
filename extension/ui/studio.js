// Studio vidéo : montage non destructif d'une vidéo LocalShot, entièrement dans le navigateur.
// Le projet (passages, vitesses, zooms, style) est gardé avec la capture ; la vidéo d'origine n'est jamais modifiée.
// L'export rejoue la vidéo montée sur un canvas et la réenregistre (MediaRecorder), sans rien envoyer sur Internet.
import { getCapture, updateCapture } from '../db.js';
import { toast, makeThumb } from './common.js';
import { tr } from './i18n.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let c = id && (await getCapture(id));
if (!c || c.kind !== 'video') {
  document.body.innerHTML = '<p style="padding:40px">Vidéo introuvable.</p>';
  throw new Error('vidéo introuvable');
}
$('name').textContent = c.title;
$('back').href = `viewer.html?id=${encodeURIComponent(id)}`;

// ---------- Vidéo source ----------
// Le montage s'applique toujours à la même vidéo : celle d'origine, ou celle déjà découpée avec l'ancien outil.
const src = c.editSource || c.blob;
const srcUrl = URL.createObjectURL(src);

// Les vidéos de travail sont dans la page (invisibles) : Chrome ne charge et ne cadence de façon fiable
// (requestVideoFrameCallback) que les vidéos présentes dans le document.
function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.playsInline = true;
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.append(v);
    v.src = url;
    v.onloadedmetadata = () => {
      if (v.duration !== Infinity) return resolve(v);
      // WebM de MediaRecorder sans durée : on la fait calculer.
      v.ondurationchange = () => { v.ondurationchange = null; v.currentTime = 0; resolve(v); };
      v.currentTime = 1e101;
    };
    v.onerror = () => reject(new Error(tr('vidéo illisible')));
  });
}
const seek = (v, t) => new Promise((r) => {
  if (Math.abs(v.currentTime - t) < 0.001) return r();
  v.addEventListener('seeked', r, { once: true });
  v.currentTime = t;
});

const v = await loadVideo(srcUrl);
const D = v.duration;
const VW = v.videoWidth || c.width || 1280, VH = v.videoHeight || c.height || 720;

// ---------- Projet ----------
const BGS = [
  { id: 'none', label: 'Aucun' },
  { id: 'light', label: 'Clair', stops: ['#f1f5f9', '#e2e8f0'] },
  { id: 'night', label: 'Nuit', stops: ['#1e293b', '#0f172a'] },
  { id: 'sunset', label: 'Couchant', stops: ['#f97316', '#db2777'] },
  { id: 'ocean', label: 'Océan', stops: ['#0ea5e9', '#6366f1'] },
  { id: 'mint', label: 'Menthe', stops: ['#10b981', '#0ea5e9'] },
  { id: 'sand', label: 'Sable', stops: ['#fde68a', '#fca5a5'] },
  { id: 'violet', label: 'Violet', stops: ['#7c3aed', '#c026d3'] },
];
const fresh = () => ({ v: 1, segs: [{ start: 0, end: D, speed: 1, on: true }], zooms: [], style: { bg: 'none', pad: 0.06, radius: 16, shadow: true } });
let P = c.edit?.v === 1 ? structuredClone(c.edit) : fresh();
P.segs[P.segs.length - 1].end = D; // durée recalculée parfois légèrement différente

// Annuler / rétablir : instantanés du projet.
const past = [], future = [];
let saved = JSON.stringify(P);
function commit() {
  const now = JSON.stringify(P);
  if (now === saved) return;
  past.push(saved);
  if (past.length > 100) past.shift();
  future.length = 0;
  saved = now;
  refresh();
}
function travel(from, to) {
  if (!from.length) return;
  to.push(saved);
  saved = from.pop();
  P = JSON.parse(saved);
  if (sel && !(sel.kind === 'seg' ? P.segs[sel.i] : P.zooms[sel.i])) sel = null;
  refresh();
}

let sel = null; // { kind: 'seg' | 'zoom', i }

// ---------- Temps monté ----------
const kept = () => P.segs.filter((s) => s.on);
const outDuration = () => kept().reduce((a, s) => a + (s.end - s.start) / s.speed, 0);
const segIndexAt = (t) => { const i = P.segs.findIndex((s) => t >= s.start && t < s.end); return i < 0 ? P.segs.length - 1 : i; };
function srcToOut(t) {
  let out = 0;
  for (const s of P.segs) {
    if (t <= s.start) break;
    if (s.on) out += (Math.min(t, s.end) - s.start) / s.speed;
  }
  return out;
}

// ---------- Rendu (aperçu et export) ----------
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
function zoomAt(t) {
  for (const z of P.zooms) {
    if (t < z.start || t > z.end) continue;
    const ramp = Math.min(0.45, (z.end - z.start) / 2);
    const k = ease(Math.min(1, (t - z.start) / ramp, (z.end - t) / ramp));
    return { s: 1 + (z.scale - 1) * k, x: z.x, y: z.y };
  }
  return { s: 1, x: 0.5, y: 0.5 };
}
const outSize = () => {
  const s = Math.min(1, 1920 / VW, 1080 / VH);
  return [Math.round(VW * s / 2) * 2, Math.round(VH * s / 2) * 2];
};
// Rectangle où la vidéo est dessinée dans l'image finale.
function innerRect(W, H) {
  const st = P.style;
  if (st.bg === 'none') return { x: 0, y: 0, w: W, h: H, r: 0 };
  const m = W * st.pad;
  let w = W - 2 * m, h = w * VH / VW;
  if (h > H - 2 * m) { h = H - 2 * m; w = h * VW / VH; }
  const sc = W / 1920;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, r: st.radius * Math.max(sc, 0.4) };
}
function paintBg(ctx, W, H) {
  const bg = BGS.find((b) => b.id === P.style.bg);
  if (!bg?.stops) return ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, bg.stops[0]);
  g.addColorStop(1, bg.stops[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function render(ctx, W, H, video, t) {
  paintBg(ctx, W, H);
  const r = innerRect(W, H);
  const z = zoomAt(t);
  const sw = VW / z.s, sh = VH / z.s;
  const sx = Math.min(Math.max(z.x * VW - sw / 2, 0), VW - sw);
  const sy = Math.min(Math.max(z.y * VH - sh / 2, 0), VH - sh);
  ctx.save();
  if (r.r || P.style.bg !== 'none') {
    if (P.style.shadow && P.style.bg !== 'none') {
      ctx.save();
      ctx.shadowColor = 'rgba(15,23,42,.35)';
      ctx.shadowBlur = W * 0.025;
      ctx.shadowOffsetY = W * 0.008;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, r.r);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.r);
    ctx.clip();
  }
  ctx.drawImage(video, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
  ctx.restore();
}

// ---------- Aperçu ----------
const view = $('view');
const vctx = view.getContext('2d');
[view.width, view.height] = outSize();
const draw = () => render(vctx, view.width, view.height, v, v.currentTime);
let playing = false;

function loop() {
  if (playing) {
    const t = v.currentTime, i = segIndexAt(t), s = P.segs[i];
    if (!s.on || t >= s.end - 0.02) {
      // Passage supprimé ou fini : on saute au prochain passage gardé, sinon on revient au début.
      const n = P.segs.slice(s.on ? i + 1 : i).find((x) => x.on);
      if (!n) { stopPlay(); seekTo(kept()[0]?.start ?? 0); }
      else { v.currentTime = n.start; v.playbackRate = n.speed; }
    } else if (v.playbackRate !== s.speed) v.playbackRate = s.speed;
    if (v.ended) { stopPlay(); seekTo(kept()[0]?.start ?? 0); }
  }
  draw();
  syncHead();
  requestAnimationFrame(loop);
}
function startPlay() {
  if (!kept().length) return toast(tr('Tous les passages sont supprimés.'), 'error');
  const s = P.segs[segIndexAt(v.currentTime)];
  if (!s.on || v.currentTime >= D - 0.05) { const n = P.segs.slice(segIndexAt(v.currentTime)).find((x) => x.on && x.end > v.currentTime) || kept()[0]; v.currentTime = Math.max(n.start, v.currentTime < D - 0.05 ? v.currentTime : n.start); }
  playing = true;
  v.play().catch(() => (playing = false));
  syncPlay();
}
function stopPlay() { playing = false; v.pause(); syncPlay(); }
function syncPlay() {
  $('play').textContent = playing ? '❚❚' : '▶';
  const l = tr(playing ? 'Pause (espace)' : 'Lecture (espace)');
  $('play').title = l;
  $('play').setAttribute('aria-label', l);
}
async function seekTo(t) { await seek(v, Math.min(Math.max(t, 0), D - 0.01)); draw(); syncHead(); }
$('play').addEventListener('click', () => (playing ? stopPlay() : startPlay()));

// ---------- Timeline ----------
const tracks = $('tracks');
const pct = (t) => `${(t / D) * 100}%`;
const fmt = (s) => { s = Math.max(0, s); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
function tAt(clientX) {
  const r = $('segs').getBoundingClientRect();
  return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * D;
}
function syncHead() {
  $('playhead').style.left = pct(v.currentTime);
  $('time').textContent = `${fmt(srcToOut(v.currentTime))} / ${fmt(outDuration())}`;
}

function ruler() {
  const w = tracks.clientWidth || 800;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => (s / D) * w >= 70) || 600;
  const marks = [];
  for (let t = 0; t <= D; t += step) marks.push(Object.assign(document.createElement('span'), { textContent: fmt(t), style: `left:${pct(t)}` }));
  $('ruler').replaceChildren(...marks);
}

function renderSegs() {
  const box = $('segs');
  const kids = [];
  P.segs.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `st-seg${s.on ? '' : ' off'}${sel?.kind === 'seg' && sel.i === i ? ' sel' : ''}`;
    b.style.left = pct(s.start);
    b.style.width = pct(s.end - s.start);
    b.dataset.seg = i;
    const label = `${tr(s.on ? 'Passage' : 'Passage supprimé')} ${fmt(s.start)}–${fmt(s.end)}${s.speed !== 1 ? ` ×${s.speed}` : ''}`;
    b.title = label;
    b.setAttribute('aria-label', label);
    if (s.speed !== 1 && s.on) b.append(Object.assign(document.createElement('span'), { className: 'sp', textContent: `×${String(s.speed).replace('.', ',')}` }));
    kids.push(b);
    // Poignée entre deux passages : déplace la coupe.
    if (i > 0) {
      const h = document.createElement('div');
      h.className = 'st-handle';
      h.style.left = pct(s.start);
      h.dataset.cut = i;
      h.title = tr('Déplacer la coupe');
      kids.push(h);
    }
  });
  box.replaceChildren(...kids);
}

function renderZooms() {
  const box = $('zooms');
  box.replaceChildren(...P.zooms.map((z, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `st-zoom${sel?.kind === 'zoom' && sel.i === i ? ' sel' : ''}`;
    b.style.left = pct(z.start);
    b.style.width = pct(z.end - z.start);
    b.dataset.zoom = i;
    b.textContent = `⊕ ×${String(z.scale).replace('.', ',')}`;
    const label = `${tr('Zoom')} ${fmt(z.start)}–${fmt(z.end)}`;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(Object.assign(document.createElement('span'), { className: 'zh l' }), Object.assign(document.createElement('span'), { className: 'zh r' }));
    return b;
  }));
}

// Miniatures de la vidéo (une deuxième vidéo, pour ne pas déranger l'aperçu).
async function renderStrip() {
  const cv = $('strip');
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  const dpr = devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  const tw = h * dpr * VW / VH, n = Math.ceil(cv.width / tw);
  const v2 = await loadVideo(srcUrl);
  for (let i = 0; i < n; i++) {
    await seek(v2, Math.min(D - 0.05, ((i + 0.5) / n) * D));
    ctx.drawImage(v2, i * tw, 0, tw, cv.height);
  }
  v2.removeAttribute('src');
  v2.load();
  v2.remove();
}
// Forme du son, calculée une fois.
let peaks = null;
async function renderWave() {
  const cv = $('wave');
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  const dpr = devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  if (!peaks) {
    try {
      const ac = new OfflineAudioContext(1, 1, 8000);
      const buf = await ac.decodeAudioData(await src.arrayBuffer());
      const d = buf.getChannelData(0), N = 2000, step = Math.max(1, Math.floor(d.length / N));
      peaks = new Float32Array(N);
      for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < d.length; j += 4) m = Math.max(m, Math.abs(d[j])); peaks[i] = m; }
      const max = Math.max(...peaks) || 1;
      for (let i = 0; i < N; i++) peaks[i] /= max;
    } catch { peaks = new Float32Array(0); } // vidéo sans son
  }
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fb923c';
  const bw = 2 * dpr;
  for (let x = 0; x < cv.width; x += bw + dpr) {
    const p = peaks[Math.floor((x / cv.width) * peaks.length)] || 0;
    const bh = Math.max(dpr, p * cv.height * 0.9);
    ctx.fillRect(x, (cv.height - bh) / 2, bw, bh);
  }
}

// Glisser : coupes, zooms, tête de lecture.
let drag = null;
tracks.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const cut = e.target.closest('[data-cut]');
  const zb = e.target.closest('[data-zoom]');
  const t = tAt(e.clientX);
  if (cut) {
    drag = { kind: 'cut', i: +cut.dataset.cut };
  } else if (zb) {
    const i = +zb.dataset.zoom, z = P.zooms[i];
    sel = { kind: 'zoom', i };
    const edge = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'm';
    drag = { kind: 'zoom', i, edge, t0: t, start: z.start, end: z.end };
    refresh();
  } else {
    if (playing) stopPlay();
    const si = e.target.closest('[data-seg]');
    sel = si ? { kind: 'seg', i: +si.dataset.seg } : null;
    drag = { kind: 'head' };
    seekTo(t);
    refresh();
  }
  tracks.setPointerCapture(e.pointerId);
  e.preventDefault();
});
tracks.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const t = tAt(e.clientX);
  if (drag.kind === 'head') seekTo(t);
  else if (drag.kind === 'cut') {
    const a = P.segs[drag.i - 1], b = P.segs[drag.i];
    const x = Math.min(Math.max(t, a.start + 0.2), b.end - 0.2);
    a.end = b.start = x;
    renderSegs();
    seekTo(x);
  } else if (drag.kind === 'zoom') {
    const z = P.zooms[drag.i], d = t - drag.t0;
    if (drag.edge === 'm') {
      const len = drag.end - drag.start;
      z.start = Math.min(Math.max(drag.start + d, 0), D - len);
      z.end = z.start + len;
    } else if (drag.edge === 'l') z.start = Math.min(Math.max(drag.start + d, 0), z.end - 0.5);
    else z.end = Math.max(Math.min(drag.end + d, D), z.start + 0.5);
    renderZooms();
    seekTo(drag.edge === 'r' ? z.end : z.start);
  }
});
const endDrag = () => { if (drag && drag.kind !== 'head') commit(); drag = null; };
tracks.addEventListener('pointerup', endDrag);
tracks.addEventListener('pointercancel', endDrag);
$('ruler').addEventListener('pointerdown', (e) => { if (playing) stopPlay(); seekTo(tAt(e.clientX)); });
// Clavier sur un passage ou un zoom (Entrée / espace : sélection).
tracks.addEventListener('click', (e) => {
  if (e.detail !== 0) return; // souris : déjà traité
  const si = e.target.closest('[data-seg]'), zb = e.target.closest('[data-zoom]');
  if (si) { sel = { kind: 'seg', i: +si.dataset.seg }; seekTo(P.segs[sel.i].start); }
  else if (zb) { sel = { kind: 'zoom', i: +zb.dataset.zoom }; seekTo(P.zooms[sel.i].start); }
  refresh();
});

// ---------- Actions ----------
function split() {
  const t = v.currentTime, i = segIndexAt(t), s = P.segs[i];
  if (t - s.start < 0.2 || s.end - t < 0.2) return toast(tr('Placez le curseur plus loin d\'une coupe existante.'));
  P.segs.splice(i, 1, { ...s, end: t }, { ...s, start: t });
  sel = { kind: 'seg', i: i + 1 };
  commit();
}
function addZoom() {
  const t = v.currentTime;
  const start = Math.min(t, Math.max(0, D - 2)), end = Math.min(D, start + 2.5);
  if (P.zooms.some((z) => start < z.end && end > z.start)) return toast(tr('Un zoom existe déjà à cet endroit.'));
  P.zooms.push({ start, end, scale: 1.8, x: 0.5, y: 0.5 });
  P.zooms.sort((a, b) => a.start - b.start);
  sel = { kind: 'zoom', i: P.zooms.findIndex((z) => z.start === start) };
  commit();
}
function removeSel() {
  if (!sel) return;
  if (sel.kind === 'zoom') { P.zooms.splice(sel.i, 1); sel = null; }
  else {
    const s = P.segs[sel.i];
    if (s.on && kept().length === 1) return toast(tr('Gardez au moins un passage.'), 'error');
    s.on = !s.on;
  }
  commit();
}
$('split').addEventListener('click', split);
$('addZoom').addEventListener('click', addZoom);
$('toggleSeg').addEventListener('click', removeSel);
$('delZoom').addEventListener('click', removeSel);
$('speed').addEventListener('change', (e) => { if (sel?.kind === 'seg') { P.segs[sel.i].speed = +e.target.value; commit(); } });
$('scale').addEventListener('input', (e) => { if (sel?.kind === 'zoom') { P.zooms[sel.i].scale = +e.target.value; renderSide(); renderZooms(); draw(); } });
$('scale').addEventListener('change', commit);
$('undo').addEventListener('click', () => travel(past, future));
$('redo').addEventListener('click', () => travel(future, past));
$('reset').addEventListener('click', () => {
  if (!confirm(tr('Effacer tout le montage (coupes, vitesses, zooms, style) ?'))) return;
  P = fresh(); sel = null; commit();
});

// Point de zoom : clic sur l'aperçu quand un zoom est sélectionné.
view.addEventListener('click', (e) => {
  if (sel?.kind !== 'zoom') return;
  const b = view.getBoundingClientRect();
  const W = view.width, H = view.height, r = innerRect(W, H);
  const px = ((e.clientX - b.left) / b.width) * W, py = ((e.clientY - b.top) / b.height) * H;
  const z = P.zooms[sel.i];
  z.x = Math.min(Math.max((px - r.x) / r.w, 0), 1);
  z.y = Math.min(Math.max((py - r.y) / r.h, 0), 1);
  if (v.currentTime < z.start || v.currentTime > z.end) seekTo((z.start + z.end) / 2);
  commit();
});

// ---------- Style ----------
for (const bg of BGS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `st-bg${bg.id === 'none' ? ' none' : ''}`;
  b.setAttribute('role', 'radio');
  b.dataset.bg = bg.id;
  b.title = tr(bg.label);
  b.setAttribute('aria-label', tr(bg.label));
  if (bg.stops) b.style.background = `linear-gradient(135deg, ${bg.stops[0]}, ${bg.stops[1]})`;
  b.addEventListener('click', () => { P.style.bg = bg.id; commit(); });
  $('bgs').append(b);
}
$('pad').addEventListener('input', (e) => { P.style.pad = +e.target.value; renderSide(); draw(); });
$('rad').addEventListener('input', (e) => { P.style.radius = +e.target.value; renderSide(); draw(); });
$('pad').addEventListener('change', commit);
$('rad').addEventListener('change', commit);
$('shadow').addEventListener('change', (e) => { P.style.shadow = e.target.checked; commit(); });

function renderSide() {
  const st = P.style, framed = st.bg !== 'none';
  for (const b of $('bgs').children) b.setAttribute('aria-checked', String(b.dataset.bg === st.bg));
  $('pad').value = st.pad; $('rad').value = st.radius; $('shadow').checked = st.shadow;
  $('pad').disabled = $('rad').disabled = $('shadow').disabled = !framed;
  $('padVal').textContent = `${Math.round(st.pad * 100)} %`;
  $('radVal').textContent = `${st.radius} px`;
  $('selPanel').hidden = !sel;
  $('segTools').hidden = sel?.kind !== 'seg';
  $('zoomTools').hidden = sel?.kind !== 'zoom';
  view.classList.toggle('picking', sel?.kind === 'zoom');
  $('focusHint').hidden = sel?.kind !== 'zoom';
  if (sel?.kind === 'seg') {
    const s = P.segs[sel.i];
    $('selTitle').textContent = `${tr(s.on ? 'Passage' : 'Passage supprimé')} ${fmt(s.start)}–${fmt(s.end)}`;
    $('speed').value = String(s.speed);
    $('speed').disabled = !s.on;
    $('toggleSeg').textContent = tr(s.on ? 'Supprimer ce passage' : 'Remettre ce passage');
  } else if (sel?.kind === 'zoom') {
    const z = P.zooms[sel.i];
    $('selTitle').textContent = `${tr('Zoom')} ${fmt(z.start)}–${fmt(z.end)}`;
    $('scale').value = z.scale;
    $('scaleVal').textContent = `×${String(z.scale).replace('.', ',')}`;
  }
  $('undo').disabled = !past.length;
  $('redo').disabled = !future.length;
}

function refresh() {
  renderSegs();
  renderZooms();
  renderSide();
  draw();
  syncHead();
}

// ---------- Clavier ----------
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || !$('exporting').hidden) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? travel(future, past) : travel(past, future); }
  if (mod) return;
  if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); playing ? stopPlay() : startPlay(); }
  else if (e.key === 's' || e.key === 'S') split();
  else if (e.key === 'z' || e.key === 'Z') addZoom();
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); }
  else if (e.key === 'ArrowLeft') seekTo(v.currentTime - 1);
  else if (e.key === 'ArrowRight') seekTo(v.currentTime + 1);
  else if (e.key === 'Escape') { sel = null; refresh(); }
});
addEventListener('beforeunload', (e) => { if (!$('exporting').hidden) e.preventDefault(); });

// ---------- Export ----------
function pickMime() {
  return ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m)) || '';
}
let abortExport = null;
$('expAbort').addEventListener('click', () => abortExport?.());

$('export').addEventListener('click', async () => {
  const parts = kept();
  if (!parts.length) return toast(tr('Tous les passages sont supprimés.'), 'error');
  stopPlay();
  $('exporting').hidden = false;
  $('expProgress').value = 0;
  const total = outDuration();
  const ve = await loadVideo(srcUrl);
  const cv = document.createElement('canvas');
  [cv.width, cv.height] = outSize();
  const ctx = cv.getContext('2d');
  // Le son passe seulement vers l'enregistreur : on n'entend rien pendant l'export.
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  ac.createMediaElementSource(ve).connect(dest);
  await ac.resume().catch(() => {});
  const stream = new MediaStream([cv.captureStream(30).getVideoTracks()[0], ...dest.stream.getAudioTracks()]);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  let cancelled = false, thumb = null, done = 0;

  try {
    for (const s of parts) {
      if (cancelled) break;
      await seek(ve, s.start);
      ve.playbackRate = s.speed;
      render(ctx, cv.width, cv.height, ve, s.start);
      if (!thumb) thumb = await makeThumb(cv).catch(() => null);
      if (rec.state === 'inactive') rec.start(1000); else rec.resume();
      await new Promise((resolve, reject) => {
        abortExport = () => { cancelled = true; ve.pause(); resolve(); };
        const tick = (_, meta) => {
          if (cancelled) return;
          const t = meta?.mediaTime ?? ve.currentTime;
          render(ctx, cv.width, cv.height, ve, t);
          $('expProgress').value = Math.min(1, (done + (t - s.start) / s.speed) / total);
          if (t >= s.end - 0.01 || ve.ended) { ve.pause(); resolve(); } else ve.requestVideoFrameCallback(tick);
        };
        ve.addEventListener('ended', () => resolve(), { once: true });
        ve.requestVideoFrameCallback(tick);
        ve.play().catch(reject);
      });
      if (rec.state === 'recording') rec.pause();
      done += (s.end - s.start) / s.speed;
    }
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    if (cancelled) return toast(tr('Export annulé'));
    const type = mime.split(';')[0] || 'video/webm';
    const blob = new Blob(chunks, { type });
    // Sous-titres : recalés sur la vidéo montée, ceux des passages supprimés disparaissent.
    const captions = c.captions?.length
      ? c.captions.map((q) => {
        const i = segIndexAt(q.start);
        return P.segs[i]?.on ? { ...q, start: srcToOut(q.start), end: srcToOut(Math.min(q.end, P.segs[i].end)) } : null;
      }).filter((q) => q && q.end > q.start)
      : c.captions;
    c = await updateCapture(id, {
      blob, size: blob.size, mime: type, duration: total, width: cv.width, height: cv.height, thumb: thumb || c.thumb,
      original: c.original || c.blob, editSource: src,
      originalMeta: c.originalMeta || { duration: c.duration, mime: c.mime, width: c.width, height: c.height, thumb: c.thumb, captions: c.captions },
      edit: P, captions, editedAt: new Date().toISOString(), savedAt: null,
    });
    location.href = `viewer.html?id=${encodeURIComponent(id)}`;
  } catch (e) {
    console.warn('LocalShot export :', e);
    toast(`${tr('Échec de l\'export')} : ${e.message}`, 'error');
  } finally {
    abortExport = null;
    ac.close().catch(() => {});
    ve.removeAttribute('src');
    ve.load();
    ve.remove();
    $('exporting').hidden = true;
  }
});

// ---------- Démarrage ----------
v.muted = false;
await seekTo(0);
refresh();
ruler();
requestAnimationFrame(loop);
renderStrip();
renderWave();
let rz;
new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { ruler(); renderStrip(); renderWave(); }, 200); }).observe(tracks);
