// Outils vidéo dans le navigateur : découpe (réencodage en temps réel) et export GIF.
import { encodeGif } from './gif.js';

function loadVideo(blob) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.playsInline = true;
    v.src = URL.createObjectURL(blob);
    v.onloadedmetadata = () => {
      if (v.duration !== Infinity) return resolve(v);
      // WebM de MediaRecorder sans durée : on la fait calculer.
      v.ondurationchange = () => { v.ondurationchange = null; v.currentTime = 0; resolve(v); };
      v.currentTime = 1e101;
    };
    v.onerror = () => reject(new Error('vidéo illisible'));
  });
}
const seek = (v, t) => new Promise((r) => { v.onseeked = () => { v.onseeked = null; r(); }; v.currentTime = t; });
const dispose = (v) => { v.pause(); URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load(); };

function pickMime(original) {
  const prefs = [original, 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return prefs.find((m) => m && MediaRecorder.isTypeSupported(m)) || '';
}

/**
 * Garde [start, end] de la vidéo. Le segment est rejoué et réenregistré (temps réel, sans le son dans les haut-parleurs).
 * onProgress(0..1) ; signal : AbortSignal pour annuler.
 */
export async function trimVideo(blob, start, end, { onProgress = () => {}, signal } = {}) {
  const v = await loadVideo(blob);
  try {
    end = Math.min(end, v.duration);
    if (!(end - start > 0.2)) throw new Error('segment trop court');
    // Le son passe par Web Audio vers l'enregistreur uniquement : on n'entend rien pendant la découpe.
    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(v).connect(dest);
    await seek(v, start);
    const vtrack = v.captureStream().getVideoTracks()[0];
    const stream = new MediaStream([vtrack, ...dest.stream.getAudioTracks()]);
    const mime = pickMime(blob.type);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));

    await new Promise((resolve, reject) => {
      let stopped = false;
      const stop = () => { if (stopped) return; stopped = true; v.pause(); if (rec.state !== 'inactive') rec.stop(); else rec.onstop?.(); };
      signal?.addEventListener('abort', () => { stop(); reject(new DOMException('annulé', 'AbortError')); }, { once: true });
      const tick = (_, meta) => {
        // L'enregistreur ne démarre qu'à la première image réellement affichée : pas de temps mort au début.
        if (rec.state === 'inactive') rec.start(1000);
        const t = meta?.mediaTime ?? v.currentTime;
        onProgress(Math.min(1, (t - start) / (end - start)));
        if (t >= end || v.ended) { stop(); resolve(); } else v.requestVideoFrameCallback(tick);
      };
      v.onended = () => { stop(); resolve(); };
      // Filets de sécurité si l'onglet est en arrière-plan (les rappels d'image y sont suspendus).
      v.onplaying = () => { if (rec.state === 'inactive' && !stopped) rec.start(1000); };
      v.ontimeupdate = () => { if (v.currentTime >= end) { stop(); resolve(); } };
      v.requestVideoFrameCallback(tick);
      v.play().catch(reject);
    });
    await done;
    ac.close();
    return new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
  } finally {
    dispose(v);
  }
}

/** GIF du segment [start, end] : 10 images/s, 640 px de large au plus, 20 s au plus. */
export async function makeGif(blob, start, end, { fps = 10, maxWidth = 640, onProgress = () => {}, signal } = {}) {
  const v = await loadVideo(blob);
  try {
    end = Math.min(end, v.duration, start + 20);
    if (!(end - start > 0.1)) throw new Error('segment trop court');
    const w = Math.min(maxWidth, v.videoWidth) & ~1;
    const h = Math.max(2, Math.round((v.videoHeight * w) / v.videoWidth)) & ~1;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frames = [];
    const n = Math.max(1, Math.round((end - start) * fps));
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new DOMException('annulé', 'AbortError');
      await seek(v, start + i / fps);
      ctx.drawImage(v, 0, 0, w, h);
      frames.push(ctx.getImageData(0, 0, w, h));
      onProgress(((i + 1) / n) * 0.8);
    }
    await new Promise((r) => setTimeout(r, 0));
    const gif = encodeGif(frames, w, h, 1000 / fps);
    onProgress(1);
    return gif;
  } finally {
    dispose(v);
  }
}
