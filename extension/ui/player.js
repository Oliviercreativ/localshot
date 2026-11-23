// Lecteur vidéo LocalShot, aux couleurs de l'application. Sans dépendance.
// Ce fichier existe en deux copies identiques : extension/ui/ et server/public/ (vérifié par npm test).
const SPEEDS = [0.5, 1, 1.25, 1.5, 1.75, 2];
const SPEED_KEY = 'localshot-speed';

const ICONS = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="s" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  muted: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="s" d="M17 9.5l5 5M22 9.5l-5 5"/>',
  pip: '<rect class="s" x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/>',
  full: '<path class="s" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  exit: '<path class="s" d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  back: '<path class="s" d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
  cc: '<rect class="s" x="3" y="5" width="18" height="14" rx="2"/><path class="s" d="M10.5 10.2a2 2 0 1 0 0 3.6M16.5 10.2a2 2 0 1 0 0 3.6"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const fmt = (s) => {
  if (!Number.isFinite(s)) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function iconBtn(cls, label, icon) {
  const b = el('button', `lsp-btn ${cls}`, { type: 'button', 'aria-label': label, title: label });
  b.innerHTML = svg(icon);
  return b;
}

/**
 * Crée le lecteur. Renvoie l'élément à insérer dans la page ; la balise <video> est dans `.video`.
 * @param {{ src: string, poster?: string, duration?: number, noDownload?: boolean, captions?: {start:number,end:number,text:string}[] }} opts
 */
export function createPlayer({ src, poster, duration: knownDuration, noDownload = false, captions = null }) {
  const root = el('div', 'lsp is-paused', { tabindex: '0' });
  const video = el('video', 'lsp-video', { playsinline: '', preload: 'metadata' });
  video.src = src;
  if (poster) video.poster = poster;
  if (noDownload) {
    // Dissuasif seulement : une vidéo affichée peut toujours être enregistrée par un visiteur déterminé.
    video.setAttribute('controlslist', 'nodownload');
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const big = iconBtn('lsp-big', 'Lire', 'play');
  const replay = iconBtn('lsp-big lsp-replay', 'Revoir', 'back');
  replay.hidden = true;

  // Barre de progression
  const bar = el('div', 'lsp-bar', { role: 'slider', 'aria-label': 'Position dans la vidéo', tabindex: '-1' });
  const track = el('div', 'lsp-track');
  const buffered = el('div', 'lsp-buffered');
  const played = el('div', 'lsp-played');
  const knob = el('div', 'lsp-knob');
  const tip = el('div', 'lsp-tip');
  track.append(buffered, played, knob);
  bar.append(track, tip);

  // Commandes
  const play = iconBtn('lsp-play', 'Lecture (espace)', 'play');
  const time = el('span', 'lsp-time');
  const mute = iconBtn('lsp-mute', 'Couper le son (M)', 'volume');
  const vol = el('input', 'lsp-vol', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'Volume' });
  const speed = el('button', 'lsp-btn lsp-speed', { type: 'button', 'aria-label': 'Vitesse de lecture', title: 'Vitesse de lecture', 'aria-haspopup': 'true' });
  const menu = el('div', 'lsp-menu', { role: 'menu' });
  menu.hidden = true;
  for (const s of SPEEDS) {
    const item = el('button', 'lsp-menu-item', { type: 'button', role: 'menuitemradio', 'data-speed': String(s) });
    item.textContent = s === 1 ? 'Normale' : `${String(s).replace('.', ',')}×`;
    menu.append(item);
  }
  const ccBtn = iconBtn('lsp-cc', 'Sous-titres (C)', 'cc');
  const capBox = el('div', 'lsp-cap');
  const pip = iconBtn('lsp-pip', 'Image dans l\'image', 'pip');
  pip.hidden = !document.pictureInPictureEnabled;
  const full = iconBtn('lsp-full', 'Plein écran (F)', 'full');

  const spacer = el('div', 'lsp-spacer');
  const volBox = el('div', 'lsp-volbox');
  volBox.append(mute, vol);
  const speedBox = el('div', 'lsp-speedbox');
  speedBox.append(speed, menu);
  const controls = el('div', 'lsp-controls');
  const row = el('div', 'lsp-row');
  row.append(play, volBox, time, spacer, ccBtn, speedBox, pip, full);
  controls.append(bar, row);

  root.append(video, capBox, big, replay, controls);

  // ---------- Durée ----------
  // Les WebM de MediaRecorder n'annoncent pas leur durée : on la fait calculer par le navigateur.
  const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : knownDuration || 0);
  video.addEventListener('loadedmetadata', () => {
    if (video.duration !== Infinity) return;
    video.addEventListener('durationchange', () => { video.currentTime = 0; }, { once: true });
    video.currentTime = 1e101;
  }, { once: true });

  // ---------- Lecture ----------
  const toggle = () => (video.paused || video.ended ? video.play().catch(() => {}) : video.pause());
  const setIcon = (b, name) => (b.innerHTML = svg(name));
  function syncPlay() {
    const paused = video.paused;
    root.classList.toggle('is-paused', paused);
    setIcon(play, paused ? 'play' : 'pause');
    play.setAttribute('aria-label', paused ? 'Lecture (espace)' : 'Pause (espace)');
    replay.hidden = !video.ended;
    big.hidden = !paused || video.ended;
  }
  video.addEventListener('play', syncPlay);
  video.addEventListener('pause', syncPlay);
  video.addEventListener('ended', syncPlay);
  video.addEventListener('click', toggle);
  video.addEventListener('dblclick', () => toggleFull());
  big.addEventListener('click', toggle);
  replay.addEventListener('click', () => { video.currentTime = 0; video.play().catch(() => {}); });
  play.addEventListener('click', toggle);

  // ---------- Temps et progression ----------
  function syncTime() {
    const d = duration();
    const p = d ? Math.min(1, video.currentTime / d) : 0;
    played.style.width = `${p * 100}%`;
    knob.style.left = `${p * 100}%`;
    time.textContent = `${fmt(video.currentTime)} / ${fmt(d)}`;
    bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }
  function syncBuffered() {
    const d = duration();
    const b = video.buffered;
    buffered.style.width = d && b.length ? `${Math.min(1, b.end(b.length - 1) / d) * 100}%` : '0';
  }
  video.addEventListener('timeupdate', syncTime);
  video.addEventListener('durationchange', syncTime);
  video.addEventListener('progress', syncBuffered);
  video.addEventListener('loadeddata', () => { syncTime(); syncBuffered(); });

  const ratioAt = (x) => {
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width));
  };
  let dragging = false, wasPlaying = false;
  bar.addEventListener('pointerdown', (e) => {
    if (!duration()) return;
    dragging = true;
    wasPlaying = !video.paused;
    video.pause();
    bar.setPointerCapture(e.pointerId);
    root.classList.add('is-seeking');
    video.currentTime = ratioAt(e.clientX) * duration();
  });
  bar.addEventListener('pointermove', (e) => {
    const r = ratioAt(e.clientX);
    tip.textContent = fmt(r * duration());
    tip.style.left = `${r * 100}%`;
    if (dragging) video.currentTime = r * duration();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-seeking');
    if (wasPlaying) video.play().catch(() => {});
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  // ---------- Son ----------
  function syncVol() {
    const silent = video.muted || video.volume === 0;
    setIcon(mute, silent ? 'muted' : 'volume');
    mute.setAttribute('aria-label', silent ? 'Remettre le son (M)' : 'Couper le son (M)');
    vol.value = String(video.muted ? 0 : video.volume);
    vol.style.setProperty('--v', `${(video.muted ? 0 : video.volume) * 100}%`);
  }
  mute.addEventListener('click', () => {
    if (video.muted || video.volume === 0) { video.muted = false; if (!video.volume) video.volume = 1; }
    else video.muted = true;
  });
  vol.addEventListener('input', () => { video.volume = Number(vol.value); video.muted = video.volume === 0; });
  video.addEventListener('volumechange', syncVol);

  // ---------- Vitesse (mémorisée) ----------
  function setSpeed(s) {
    video.playbackRate = s;
    speed.textContent = s === 1 ? '1×' : `${String(s).replace('.', ',')}×`;
    for (const it of menu.children) it.setAttribute('aria-checked', String(Number(it.dataset.speed) === s));
    try { localStorage.setItem(SPEED_KEY, String(s)); } catch { /* stockage indisponible */ }
  }
  speed.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  menu.addEventListener('click', (e) => {
    const s = Number(e.target.closest('[data-speed]')?.dataset.speed);
    if (s) setSpeed(s);
    menu.hidden = true;
  });
  document.addEventListener('click', (e) => { if (!speedBox.contains(e.target)) menu.hidden = true; });
  let saved = 1;
  try { saved = Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { /* stockage indisponible */ }
  setSpeed(SPEEDS.includes(saved) ? saved : 1);
  video.addEventListener('loadedmetadata', () => (video.playbackRate = Number(localStorage.getItem(SPEED_KEY)) || 1));

  // ---------- Image dans l'image et plein écran ----------
  pip.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { /* refusé par le navigateur */ }
  });
  function toggleFull() {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (root.requestFullscreen) return root.requestFullscreen().catch(() => {});
    video.webkitEnterFullscreen?.(); // iPhone : plein écran natif de la vidéo
  }
  full.addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === root;
    root.classList.toggle('is-full', on);
    setIcon(full, on ? 'exit' : 'full');
    full.setAttribute('aria-label', on ? 'Quitter le plein écran (F)' : 'Plein écran (F)');
  });

  // ---------- Masquage automatique des commandes ----------
  let idleTimer;
  function wake() {
    root.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!video.paused && !dragging && menu.hidden) root.classList.add('is-idle'); }, 2500);
  }
  root.addEventListener('pointermove', wake);
  root.addEventListener('pointerdown', wake);
  root.addEventListener('focusin', wake);
  root.addEventListener('pointerleave', () => { if (!video.paused) root.classList.add('is-idle'); });
  video.addEventListener('play', wake);
  video.addEventListener('pause', () => root.classList.remove('is-idle'));

  // ---------- Sous-titres ----------
  let caps = [];
  let capsOn = true;
  try { capsOn = localStorage.getItem('localshot-cc') !== '0'; } catch { /* stockage indisponible */ }
  function syncCaps() {
    const t = video.currentTime;
    const cur = capsOn ? caps.find((x) => t >= x.start && t < x.end) : null;
    capBox.textContent = cur ? cur.text : '';
    capBox.hidden = !cur;
    ccBtn.hidden = !caps.length;
    ccBtn.setAttribute('aria-pressed', String(capsOn));
  }
  ccBtn.addEventListener('click', () => {
    capsOn = !capsOn;
    try { localStorage.setItem('localshot-cc', capsOn ? '1' : '0'); } catch { /* stockage indisponible */ }
    syncCaps();
  });
  video.addEventListener('timeupdate', syncCaps);
  video.addEventListener('seeked', syncCaps);
  root.setCaptions = (list) => { caps = Array.isArray(list) ? list : []; syncCaps(); };
  // Repères (commentaires horodatés) sur la barre de progression.
  let markTimes = [];
  const marks = el('div', 'lsp-marks');
  track.append(marks);
  function paintMarks() {
    const d = duration();
    marks.replaceChildren(...(d ? markTimes : []).map((t) => {
      const m = el('i', 'lsp-mark');
      m.style.left = `${Math.min(100, (t / d) * 100)}%`;
      return m;
    }));
  }
  video.addEventListener('durationchange', paintMarks);
  root.setMarkers = (times) => { markTimes = Array.isArray(times) ? times : []; paintMarks(); };
  root.setCaptions(captions);

  // ---------- Clavier (quand le lecteur a le focus) ----------
  root.addEventListener('keydown', (e) => {
    if (e.target === vol || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const seek = (dt) => { video.currentTime = Math.min(duration(), Math.max(0, video.currentTime + dt)); };
    const actions = {
      ' ': toggle, k: toggle, f: toggleFull, m: () => mute.click(), c: () => caps.length && ccBtn.click(),
      arrowleft: () => seek(-5), arrowright: () => seek(5), j: () => seek(-10), l: () => seek(10),
      arrowup: () => { video.muted = false; video.volume = Math.min(1, video.volume + 0.1); },
      arrowdown: () => { video.volume = Math.max(0, video.volume - 0.1); },
      home: () => seek(-Infinity), end: () => seek(Infinity),
    };
    if (!actions[k]) return;
    if (e.target.closest?.('button') && (k === ' ' || k === 'enter')) return; // laisse le bouton réagir
    e.preventDefault();
    actions[k]();
    wake();
  });

  syncPlay();
  syncTime();
  syncVol();
  root.video = video;
  root.seekTo = (t) => { video.currentTime = Math.max(0, Math.min(duration() || t, t)); wake(); };
  return root;
}
