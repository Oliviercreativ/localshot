// Génère les icônes PNG (sans dépendance) : extension/icons + favicon du serveur.
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function sample(u, v) {
  const m = 0.04, r = 0.24, half = 0.5 - m;
  const qx = Math.abs(u - 0.5) - (half - r), qy = Math.abs(v - 0.5) - (half - r);
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  if (sd > 0) return null;
  const d = Math.hypot(u - 0.5, v - 0.5);
  if ((d >= 0.19 && d <= 0.28) || d <= 0.09) return [255, 255, 255];
  // coins de viseur
  const cu = Math.abs(u - 0.5), cv = Math.abs(v - 0.5);
  if (cu > 0.3 && cu < 0.36 && cv > 0.22 && cv < 0.36) return [255, 255, 255];
  if (cv > 0.3 && cv < 0.36 && cu > 0.22 && cu < 0.36) return [255, 255, 255];
  const t = (u + v) / 2;
  return [251 + (194 - 251) * t, 146 + (65 - 146) * t, 60 + (12 - 60) * t];
}
function draw(size) {
  const S = 4, out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const c = sample((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const o = (y * size + x) * 4;
    if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = (a / (S * S)) * 255; }
  }
  return png(size, out);
}
const root = path.resolve(__dirname, '..');
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(root, 'extension/icons', `icon-${s}.png`), draw(s));
fs.writeFileSync(path.join(root, 'server/public/icon.png'), draw(128));
console.log('Icônes générées.');
