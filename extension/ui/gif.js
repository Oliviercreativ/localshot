// Encodeur GIF minimal (GIF89a animé, palette globale 256 couleurs, LZW). Sans dépendance.

// Palette fixe 6×7×6 (252 couleurs) : rapide et stable d'une image à l'autre (pas de scintillement).
const R = 6, G = 7, B = 6;
const PALETTE = new Uint8Array(256 * 3);
for (let r = 0, i = 0; r < R; r++) for (let g = 0; g < G; g++) for (let b = 0; b < B; b++, i++) {
  PALETTE[i * 3] = Math.round((r * 255) / (R - 1));
  PALETTE[i * 3 + 1] = Math.round((g * 255) / (G - 1));
  PALETTE[i * 3 + 2] = Math.round((b * 255) / (B - 1));
}

// RGBA → indices de palette, avec un tramage ordonné léger (évite les aplats en escalier).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5));
function quantize(rgba, w, h) {
  const out = new Uint8Array(w * h);
  const sr = 255 / (R - 1), sg = 255 / (G - 1), sb = 255 / (B - 1);
  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p++) {
      const d = BAYER[(y & 3) * 4 + (x & 3)];
      const q = p * 4;
      const r = Math.min(R - 1, Math.max(0, Math.round(rgba[q] / sr + d)));
      const g = Math.min(G - 1, Math.max(0, Math.round(rgba[q + 1] / sg + d)));
      const b = Math.min(B - 1, Math.max(0, Math.round(rgba[q + 2] / sb + d)));
      out[p] = (r * G + g) * B + b;
    }
  }
  return out;
}

class Bytes {
  constructor() { this.buf = new Uint8Array(1 << 20); this.n = 0; }
  grow(k) { if (this.n + k > this.buf.length) { const b = new Uint8Array(Math.max(this.buf.length * 2, this.n + k)); b.set(this.buf); this.buf = b; } }
  byte(v) { this.grow(1); this.buf[this.n++] = v; }
  word(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
  str(s) { for (const ch of s) this.byte(ch.charCodeAt(0)); }
  bytes(a) { this.grow(a.length); this.buf.set(a, this.n); this.n += a.length; }
}

function lzw(indices, out) {
  const minCode = 8;
  out.byte(minCode);
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map();
  let cur = 0, bits = 0;
  const block = [];
  const flush = () => { out.byte(block.length); out.bytes(block); block.length = 0; };
  const emit = (code) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) { block.push(cur & 255); cur >>>= 8; bits -= 8; if (block.length === 255) flush(); }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      size = minCode + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) block.push(cur & 255);
  if (block.length) flush();
  out.byte(0);
}

/** frames : tableau de { data: Uint8ClampedArray RGBA }, toutes de taille w×h. delayMs par image. */
export function encodeGif(frames, w, h, delayMs) {
  const out = new Bytes();
  out.str('GIF89a');
  out.word(w); out.word(h);
  out.byte(0xf7); // palette globale de 256 couleurs
  out.byte(0); out.byte(0);
  out.bytes(PALETTE);
  out.str('!\xff\x0bNETSCAPE2.0'); out.byte(3); out.byte(1); out.word(0); out.byte(0); // boucle infinie
  const delay = Math.max(2, Math.round(delayMs / 10));
  for (const f of frames) {
    out.str('!\xf9'); out.byte(4); out.byte(0); out.word(delay); out.byte(0); out.byte(0);
    out.byte(0x2c); out.word(0); out.word(0); out.word(w); out.word(h); out.byte(0);
    lzw(quantize(f.data, w, h), out);
  }
  out.byte(0x3b);
  return new Blob([out.buf.subarray(0, out.n)], { type: 'image/gif' });
}
