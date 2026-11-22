#!/usr/bin/env node
'use strict';
/**
 * LocalShot — serveur local (aucune dépendance, aucune connexion sortante).
 * Stocke les captures dans ./data et sert la galerie + les liens de partage.
 *
 *   npm start        → accessible uniquement depuis ce Mac (127.0.0.1)
 *   npm run start:lan → liens de partage accessibles sur le réseau local (Wi-Fi)
 *
 * Mode serveur (Raspberry Pi derrière `tailscale serve`) — variables d'environnement :
 *   LOCALSHOT_TOKEN      clé d'accès : obligatoire pour lister / envoyer / supprimer.
 *                        Quand elle est définie, être « en local » ne suffit plus
 *                        (tailscale serve relaie tout depuis 127.0.0.1).
 *   LOCALSHOT_PUBLIC_URL adresse publique, ex. https://pi.tailnet-1234.ts.net
 *                        (Host et Origin acceptés, base des liens de partage).
 */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const createStorage = require('./storage');

const PORT = Number(process.env.PORT) || 4777;
const LAN = process.argv.includes('--lan') || process.env.LAN === '1';
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const TOKEN = (process.env.LOCALSHOT_TOKEN || '').trim();
if (TOKEN && TOKEN.length < 24) { console.error('✖ LOCALSHOT_TOKEN trop courte (24 caractères minimum).'); process.exit(1); }
let PUBLIC_URL = null;
if (process.env.LOCALSHOT_PUBLIC_URL) {
  try { PUBLIC_URL = new URL(process.env.LOCALSHOT_PUBLIC_URL).origin; }
  catch { console.error('✖ LOCALSHOT_PUBLIC_URL invalide.'); process.exit(1); }
}
const PUBLIC_HOST = PUBLIC_URL ? new URL(PUBLIC_URL).hostname.toLowerCase() : null;
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.LOCALSHOT_DATA || path.join(ROOT, 'data');
const CAPS_DIR = path.join(DATA_DIR, 'captures');
const INDEX = path.join(DATA_DIR, 'index.json');
const PUBLIC = path.join(__dirname, 'public');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MB = 1024 * 1024;
// Types acceptés : on vérifie aussi les premiers octets du fichier (« magic bytes »).
const KINDS = {
  'image/png': { kind: 'image', ext: 'png', max: 80 * MB, ok: (b) => b.length >= 24 && b.subarray(0, 8).equals(PNG_SIG) && b.toString('ascii', 12, 16) === 'IHDR' },
  'video/mp4': { kind: 'video', ext: 'mp4', max: 2048 * MB, ok: (b) => b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' },
  'video/webm': { kind: 'video', ext: 'webm', max: 2048 * MB, ok: (b) => b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3 },
};
const MIME_OF = { png: 'image/png', mp4: 'video/mp4', webm: 'video/webm' };
const ID_RE = '([A-Za-z0-9_-]{6,32})';

fs.mkdirSync(CAPS_DIR, { recursive: true });
let storage;
try { storage = createStorage({ env: process.env, capsDir: CAPS_DIR }); }
catch (e) { console.error(`✖ ${e.message}`); process.exit(1); }
let captures = [];
try { captures = JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { /* première exécution */ }

let writing = Promise.resolve();
function persist() {
  const data = JSON.stringify(captures, null, 2);
  writing = writing.catch(() => {}).then(async () => {
    const tmp = INDEX + '.tmp';
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, INDEX);
  });
  return writing;
}

const find = (id) => captures.find((c) => c.id === id);

// ---------- Sécurité ----------
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
    .map((i) => i.address);
}

function hostnames() {
  const h = os.hostname().toLowerCase();
  const base = h.replace(/\.local$/, '');
  return new Set([h, base, base + '.local']);
}

// Protection contre le DNS rebinding : seul un Host connu est accepté.
function hostAllowed(req) {
  const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return true;
  if (PUBLIC_HOST && host === PUBLIC_HOST) return true;
  if (!LAN) return false;
  return lanAddresses().includes(host) || hostnames().has(host);
}

function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

// ---------- Clé d'accès ----------
const COOKIE = 'ls_session';
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();
const TOKEN_HASH = TOKEN ? digest(TOKEN) : null;
// Le cookie de la galerie web ne contient pas la clé elle-même, seulement une empreinte dérivée.
const SESSION = TOKEN ? crypto.createHmac('sha256', TOKEN).update('localshot-session').digest('base64url') : null;
const sameSecret = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Liste / envoi / suppression : avec la clé si elle est configurée, sinon uniquement depuis cette machine.
function isAdmin(req) {
  if (!TOKEN) return isLocal(req);
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (m) return sameSecret(digest(m[1].trim()), TOKEN_HASH);
  const s = cookies(req)[COOKIE];
  return !!s && sameSecret(digest(s), digest(SESSION));
}

const secureCookie = () => (PUBLIC_URL || '').startsWith('https:') ? '; Secure' : '';

// Bloque les requêtes envoyées par un site web tiers ouvert dans le navigateur.
function originAllowed(req) {
  const o = req.headers.origin;
  if (!o) return true;
  if (o.startsWith('chrome-extension://')) return true;
  try {
    const u = new URL(o);
    if (PUBLIC_URL && u.origin === PUBLIC_URL) return true;
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && Number(u.port) === PORT;
  } catch { return false; }
}

// Les images et vidéos peuvent venir du stockage externe (liens signés S3 / R2…).
const MEDIA = ["'self'", ...new Set(Object.values(storage.drivers).flatMap((d) => d.origins))].join(' ');
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    `default-src 'self'; img-src ${MEDIA} data: blob:; media-src ${MEDIA} blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { ...SEC_HEADERS, 'Content-Type': type, ...extra });
  res.end(body);
}
const json = (res, status, obj) =>
  send(res, status, obj === undefined ? '' : JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });

async function file(res, name, status = 200) {
  const p = path.join(PUBLIC, path.basename(name));
  try {
    const buf = await fsp.readFile(p);
    send(res, status, buf, TYPES[path.extname(p)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  } catch {
    send(res, 404, 'Introuvable');
  }
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) { const e = new Error('Fichier trop volumineux'); e.status = 413; throw e; }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function decodeHeader(v, max) {
  let s = String(v || '');
  try { s = decodeURIComponent(s); } catch { /* garde la valeur brute */ }
  return s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

// ---------- Actions ----------
const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };

// Le fichier est écrit au fil de l'eau (les vidéos peuvent peser plusieurs centaines de Mo).
async function upload(req, res) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const k = KINDS[type];
  if (!k) return json(res, 415, { error: 'Type de fichier non accepté' });
  if (Number(req.headers['content-length']) > k.max) return json(res, 413, { error: 'Fichier trop volumineux' });

  const id = crypto.randomBytes(9).toString('base64url');
  const tmp = path.join(CAPS_DIR, `${id}.part`);
  const out = fs.createWriteStream(tmp, { flags: 'wx' });
  let size = 0;
  let head = Buffer.alloc(0);
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > k.max) { const e = new Error('Fichier trop volumineux'); e.status = 413; throw e; }
      if (head.length < 33) head = Buffer.concat([head, chunk.subarray(0, 33 - head.length)]);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (!k.ok(head)) { const e = new Error(`${k.kind === 'image' ? 'PNG' : 'Vidéo'} invalide`); e.status = 400; throw e; }
    await storage.current.put({ id, ext: k.ext, tmp, size, mime: type });
  } catch (e) {
    out.destroy();
    await fsp.rm(tmp, { force: true });
    if (e.status === 413) req.resume();
    if (!e.status) { console.error(e); e.status = 502; e.message = 'Stockage injoignable'; }
    throw e;
  }

  const src = decodeHeader(req.headers['x-source-url'], 2000);
  const meta = {
    id,
    kind: k.kind,
    ext: k.ext,
    storage: storage.current.name,
    title: decodeHeader(req.headers['x-title'], 300) || 'Capture sans titre',
    sourceUrl: /^(https?|file):\/\//i.test(src) ? src : '',
    mode: decodeHeader(req.headers['x-mode'], 20),
    width: k.kind === 'image' ? head.readUInt32BE(16) : num(req.headers['x-width'], 10000),
    height: k.kind === 'image' ? head.readUInt32BE(20) : num(req.headers['x-height'], 10000),
    duration: k.kind === 'video' ? num(req.headers['x-duration'], 86400) : undefined,
    size,
    createdAt: new Date().toISOString(),
  };
  captures.push(meta);
  await persist();
  json(res, 201, meta);
}

function serveFile(req, res, c, download) {
  const ext = c.ext || 'png';
  const driver = storage.of(c);
  if (!driver) return send(res, 503, 'Stockage de ce fichier non configuré');
  let filename = null;
  if (download) {
    const ascii = c.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'capture';
    filename = `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(c.title.slice(0, 80))}.${ext}`;
  }
  driver.serve(req, res, c, { headers: SEC_HEADERS, mime: MIME_OF[ext], filename });
}

// ---------- Routeur ----------
const server = http.createServer(async (req, res) => {
  try {
    if (!hostAllowed(req)) return send(res, 421, 'Host non autorisé');
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const local = isAdmin(req);
    const method = req.method;
    let m;

    if (!['GET', 'HEAD'].includes(method) && !originAllowed(req)) return json(res, 403, { error: 'Origine refusée' });

    if (method === 'GET' && p === '/') return local ? file(res, 'gallery.html') : file(res, 'private.html', 403);

    if (method === 'POST' && p === '/api/login') {
      if (!TOKEN) return json(res, 404, { error: 'Pas de clé configurée' });
      let body = {};
      try { body = JSON.parse((await readBody(req, 2000)).toString('utf8') || '{}'); } catch { return json(res, 400, { error: 'JSON invalide' }); }
      if (typeof body.key !== 'string' || !sameSecret(digest(body.key.trim()), TOKEN_HASH)) {
        await new Promise((r) => setTimeout(r, 800)); // ralentit les essais au hasard
        return json(res, 401, { error: 'Clé incorrecte' });
      }
      return send(res, 204, '', 'text/plain', { 'Set-Cookie': `${COOKIE}=${SESSION}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secureCookie()}` });
    }
    if (method === 'POST' && p === '/api/logout') {
      return send(res, 204, '', 'text/plain', { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie()}` });
    }
    if (method === 'GET' && (m = p.match(new RegExp(`^/c/${ID_RE}$`)))) {
      return find(m[1]) ? file(res, 'viewer.html') : file(res, 'notfound.html', 404);
    }
    if (['GET', 'HEAD'].includes(method) && (m = p.match(new RegExp(`^/i/${ID_RE}\\.(png|mp4|webm)$`)))) {
      const c = find(m[1]);
      return c && (c.ext || 'png') === m[2] ? serveFile(req, res, c, url.searchParams.has('dl')) : send(res, 404, 'Introuvable');
    }
    if (method === 'GET' && (m = p.match(/^\/assets\/([\w.-]+)$/))) return file(res, m[1]);

    if (p === '/api/health') {
      return json(res, 200, { ok: true, app: 'localshot', lan: LAN, port: PORT, addresses: LAN ? lanAddresses() : [], local, auth: !!TOKEN, publicUrl: PUBLIC_URL, storage: storage.current.name });
    }

    if (p === '/api/captures') {
      if (!local) return json(res, TOKEN ? 401 : 403, { error: TOKEN ? 'Clé d\'accès requise' : 'Réservé à cette machine' });
      if (method === 'GET') return json(res, 200, [...captures].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      if (method === 'POST') return await upload(req, res);
      return json(res, 405, { error: 'Méthode non autorisée' });
    }

    if ((m = p.match(new RegExp(`^/api/captures/${ID_RE}$`)))) {
      const c = find(m[1]);
      if (!c) return json(res, 404, { error: 'Introuvable' });
      if (method === 'GET') return json(res, 200, { ...c, canEdit: local });
      if (!local) return json(res, TOKEN ? 401 : 403, { error: TOKEN ? 'Clé d\'accès requise' : 'Réservé à cette machine' });
      if (method === 'PATCH') {
        let body = {};
        try { body = JSON.parse((await readBody(req, 10_000)).toString('utf8') || '{}'); } catch { return json(res, 400, { error: 'JSON invalide' }); }
        if (typeof body.title === 'string') c.title = body.title.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300) || 'Capture sans titre';
        await persist();
        return json(res, 200, c);
      }
      if (method === 'DELETE') {
        await storage.of(c)?.remove(c);
        captures = captures.filter((x) => x.id !== c.id);
        await persist();
        return json(res, 204);
      }
      return json(res, 405, { error: 'Méthode non autorisée' });
    }

    return file(res, 'notfound.html', 404);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Erreur interne' });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n✖ Le port ${PORT} est déjà utilisé (LocalShot tourne peut-être déjà).\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  LocalShot — serveur local démarré`);
  console.log(`  Galerie      : http://localhost:${PORT}`);
  console.log(`  Données      : ${DATA_DIR}`);
  console.log(`  Stockage     : ${storage.current.describe()}`);
  storage.current.check?.().then(
    () => console.log('  Stockage     : connexion vérifiée ✓'),
    (e) => console.error(`  ⚠ Stockage   : ${e.message}`));
  if (PUBLIC_URL) console.log(`  Adresse      : ${PUBLIC_URL}`);
  if (TOKEN) console.log('  Accès        : protégé par clé (LOCALSHOT_TOKEN)');
  if (LAN) {
    for (const ip of lanAddresses()) console.log(`  Réseau local : http://${ip}:${PORT}/c/<id>  (liens de partage uniquement)`);
    console.log('  ⚠ Mode LAN : les appareils de votre Wi-Fi qui connaissent un lien peuvent voir la capture.');
  } else {
    console.log('  Mode privé   : accessible uniquement depuis ce Mac (npm run start:lan pour partager en Wi-Fi)');
  }
  console.log('');
});
