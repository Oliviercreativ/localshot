// Sous-titres automatiques : plusieurs fournisseurs au choix.
//  - local   : votre propre serveur Whisper compatible OpenAI (speaches, faster-whisper-server, LocalAI…) — rien ne sort de chez vous ;
//  - mistral : Voxtral (API Mistral, hébergée en Europe) ;
//  - openai  : Whisper (API OpenAI) ;
//  - groq    : Whisper large v3 turbo (API Groq, très rapide).
// Seul le son est envoyé (extrait, ramené en mono 16 kHz), jamais l'image.
const CONF_KEY = 'transcribe-conf';

export const PROVIDERS = {
  local: { label: 'Whisper sur mon serveur (100 % local)', url: 'http://localhost:8000/v1/audio/transcriptions', model: 'Systran/faster-whisper-small', key: false },
  mistral: { label: 'Mistral — Voxtral', url: 'https://api.mistral.ai/v1/audio/transcriptions', model: 'voxtral-mini-latest', key: true },
  openai: { label: 'OpenAI — Whisper', url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1', key: true },
  groq: { label: 'Groq — Whisper large v3 turbo', url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3-turbo', key: true },
};

export function transcribeConf() {
  try {
    const c = JSON.parse(localStorage.getItem(CONF_KEY) || '{}');
    const provider = PROVIDERS[c.provider] ? c.provider : '';
    const p = PROVIDERS[provider] || {};
    return { provider, url: c.url || p.url || '', model: c.model || p.model || '', key: c.key || '', language: c.language || '' };
  } catch { return { provider: '', url: '', model: '', key: '', language: '' }; }
}
export const saveTranscribeConf = (c) => localStorage.setItem(CONF_KEY, JSON.stringify(c));

// ---------- Son : extraction, mono 16 kHz, WAV ----------
async function extractAudio(blob) {
  const ac = new AudioContext();
  try {
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  } catch {
    throw new Error('cette vidéo n\'a pas de son exploitable');
  } finally {
    ac.close();
  }
}
function wav(samples, rate = 16000) {
  const b = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o, s) => [...s].forEach((ch, i) => b.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); b.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true);
  str(36, 'data'); b.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([b], { type: 'audio/wav' });
}

async function callProvider(conf, audio) {
  const fd = new FormData();
  fd.append('file', audio, 'audio.wav');
  fd.append('model', conf.model);
  const headers = {};
  if (conf.provider === 'mistral') {
    fd.append('timestamp_granularities', 'segment'); // incompatible avec « language » chez Mistral
    if (conf.key) headers['x-api-key'] = conf.key;
  } else {
    fd.append('response_format', 'verbose_json');
    fd.append('timestamp_granularities[]', 'segment');
    if (conf.language) fd.append('language', conf.language);
    if (conf.key) headers.Authorization = `Bearer ${conf.key}`;
  }
  const r = await fetch(conf.url, { method: 'POST', headers, body: fd, credentials: 'omit' });
  if (!r.ok) {
    const msg = await r.text().catch(() => '');
    throw new Error(r.status === 401 || r.status === 403 ? 'clé API refusée' : `le service a répondu ${r.status} ${msg.slice(0, 120)}`);
  }
  const j = await r.json();
  if (Array.isArray(j.segments) && j.segments.length) return j.segments.map((s) => ({ start: +s.start || 0, end: +s.end || 0, text: String(s.text || '').trim() }));
  return j.text ? [{ start: 0, end: audio.size / 32000, text: String(j.text).trim() }] : [];
}

/** Transcrit la vidéo : renvoie [{ start, end, text }] (secondes). */
export async function transcribe(blob, { onProgress = () => {} } = {}) {
  const conf = transcribeConf();
  if (!conf.provider) throw new Error('choisissez d\'abord un service dans « Réglages »');
  if (PROVIDERS[conf.provider].key && !conf.key) throw new Error('clé API manquante dans « Réglages »');
  onProgress(0.05);
  const samples = await extractAudio(blob);
  // Morceaux de 10 min (≈ 19 Mo en WAV) : sous la limite de 25 Mo des API.
  const CHUNK = 16000 * 600;
  const parts = Math.max(1, Math.ceil(samples.length / CHUNK));
  const out = [];
  for (let i = 0; i < parts; i++) {
    const offset = (i * CHUNK) / 16000;
    const segs = await callProvider(conf, wav(samples.subarray(i * CHUNK, (i + 1) * CHUNK)));
    for (const s of segs) if (s.text) out.push({ start: s.start + offset, end: Math.max(s.end, s.start) + offset, text: s.text });
    onProgress(0.1 + (0.9 * (i + 1)) / parts);
  }
  return out;
}

// ---------- Export ----------
const ts = (t, sep) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};
export const toSrt = (caps) => caps.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
export const toVtt = (caps) => `WEBVTT\n\n${caps.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n')}`;
