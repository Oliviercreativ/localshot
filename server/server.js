#!/usr/bin/env node
'use strict';
/**
 * LocalShot — serveur local (aucune dépendance, aucune connexion sortante).
 * Stocke les captures dans ./data et sert la galerie + les liens de partage.
 *
 *   npm start        → écoute sur 127.0.0.1 (derrière tailscale serve, un proxy HTTPS ou Docker)
 *
 * Variables d'environnement :
 *   LOCALSHOT_HOST       adresse d'écoute (127.0.0.1 par défaut ; 0.0.0.0 dans un conteneur Docker).
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
const createStorage = require('./storage');

const PORT = Number(process.env.PORT) || 4777;
const HOST = process.env.LOCALSHOT_HOST || '127.0.0.1';
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
  // Contenu chiffré de bout en bout : le serveur ne peut ni le lire ni connaître son titre.
  'application/vnd.localshot.enc': { kind: 'enc', ext: 'bin', max: 2048 * MB, ok: (b) => b.length >= 18 && b.toString('ascii', 0, 6) === 'LSENC1' },
};
const MIME_OF = { png: 'image/png', mp4: 'video/mp4', webm: 'video/webm', bin: 'application/octet-stream' };
const ID_RE = '([A-Za-z0-9_-]{6,32})';

const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
fs.mkdirSync(CAPS_DIR, { recursive: true });
fs.mkdirSync(THUMBS_DIR, { recursive: true });
// Vignettes (aperçu des liens dans Slack, WhatsApp, e-mail…) : toujours sur le disque du serveur.
const THUMB_KINDS = {
  'image/webp': { ext: 'webp', ok: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  'image/jpeg': { ext: 'jpg', ok: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', ok: (b) => b.length >= 8 && b.subarray(0, 8).equals(PNG_SIG) },
};
const THUMB_MIME = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };
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

// ---------- Contrôle des liens de partage (expiration, mot de passe, téléchargement, vues) ----------
// Secret du serveur (créé au premier lancement) : signe les cookies « lien déverrouillé ».
const SECRET_FILE = path.join(DATA_DIR, 'secret');
let SECRET;
try { SECRET = fs.readFileSync(SECRET_FILE); }
catch { SECRET = crypto.randomBytes(32); fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 }); }

const expired = (c) => !!c.expiresAt && Date.parse(c.expiresAt) <= Date.now();
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${(await scrypt(pw, salt)).toString('hex')}`;
}
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(String(pw), salt, 32, (e, k) => (e ? rej(e) : res(k))));
async function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  return sameSecret(await scrypt(pw, Buffer.from(salt, 'hex')), Buffer.from(hash, 'hex'));
}
// Essais de mot de passe : 5 erreurs par lien et par adresse, puis attente croissante (jusqu'à 1 h).
// 50 erreurs sur un même lien, toutes adresses confondues, le bloquent 1 h aussi.
const failures = new Map(); // adresse -> { n, until } (borné)
const linkFailures = new Map(); // lien -> nombre d'erreurs (jamais évincé : borné par le nombre de liens)
const linkQueues = new Map(); // lien très attaqué -> file d'attente des essais (un à la fois)
// Adresse du visiteur. X-Forwarded-For n'est lu que si la requête vient d'un proxy de confiance
// (tailscale serve / proxy local, ou LOCALSHOT_TRUST_PROXY=1 derrière un proxy Docker), et seul
// le dernier saut, ajouté par ce proxy, compte : un visiteur ne peut pas s'inventer une adresse.
const TRUST_PROXY = process.env.LOCALSHOT_TRUST_PROXY === '1';
function clientAddr(req) {
  const a = req.socket.remoteAddress || '';
  const fromProxy = TRUST_PROXY || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a);
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  return fromProxy && xff.length ? xff[xff.length - 1] : a;
}
function blockedFor(key) {
  const f = failures.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function fail(key, free, max) {
  const f = failures.get(key) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n > free) f.until = Date.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(7, f.n - free - 1));
  if (f.n >= max) f.until = Date.now() + 3600_000;
  failures.delete(key); // réinséré en fin : l'éviction retire d'abord les entrées les plus anciennes
  failures.set(key, f);
  if (failures.size > 10_000) failures.delete(failures.keys().next().value);
}
// Le jeton dépend du mot de passe : le changer ou le retirer invalide les accès déjà donnés.
const unlockToken = (c) => crypto.createHmac('sha256', SECRET).update(`${c.id}:${c.password}`).digest('base64url');
const unlockCookie = (c) => `ls_u_${c.id}`;
const unlocked = (req, c) => {
  if (!c.password) return true;
  const v = cookies(req)[unlockCookie(c)];
  return !!v && sameSecret(Buffer.from(v), Buffer.from(unlockToken(c)));
};
// Ce que voit le propriétaire : tout, sauf l'empreinte du mot de passe.
function adminView(c) {
  const { password, ...rest } = c;
  return { ...rest, hasPassword: !!password, allowDownload: c.allowDownload !== false, allowComments: c.allowComments !== false, comments: c.comments || [], views: c.views || 0, canEdit: true };
}
// Les vues sont enregistrées par paquets pour ne pas réécrire l'index à chaque visite.
let viewsTimer;
function countView(c) {
  c.views = (c.views || 0) + 1;
  clearTimeout(viewsTimer);
  viewsTimer = setTimeout(persist, 2000);
}

// ---------- Sécurité ----------
// Protection contre le DNS rebinding : seul un Host connu est accepté.
function hostAllowed(req) {
  const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return true;
  return !!PUBLIC_HOST && host === PUBLIC_HOST;
}

function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

// ---------- Clé d'accès ----------
const COOKIE = 'ls_session';
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();
const TOKEN_HASH = TOKEN ? digest(TOKEN) : null;
// Sessions de la galerie web : un identifiant aléatoire par connexion, gardé en mémoire côté serveur.
// La déconnexion le supprime ; un redémarrage du serveur les invalide toutes.
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const MAX_SESSIONS = 50;
const sessions = new Map(); // empreinte de l'identifiant -> expiration
const sessionKey = (s) => digest(s).toString('base64url');
function newSession() {
  const now = Date.now();
  for (const [k, exp] of sessions) if (exp <= now) sessions.delete(k);
  while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  const sid = crypto.randomBytes(32).toString('base64url');
  sessions.set(sessionKey(sid), now + SESSION_TTL);
  return sid;
}
function validSession(sid) {
  if (!sid) return false;
  const k = sessionKey(sid);
  const exp = sessions.get(k);
  if (!exp) return false;
  if (exp <= Date.now()) { sessions.delete(k); return false; }
  return true;
}
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
  return validSession(cookies(req)[COOKIE]);
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
    if (!k.ok(head)) { const e = new Error(`${{ image: 'PNG', video: 'Vidéo', enc: 'Contenu chiffré' }[k.kind]} invalide`); e.status = 400; throw e; }
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
    title: k.kind === 'enc' ? 'Contenu chiffré' : decodeHeader(req.headers['x-title'], 300) || 'Capture sans titre',
    sourceUrl: k.kind !== 'enc' && /^(https?|file):\/\//i.test(src) ? src : '',
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

// Sous-titres : [{ start, end, text }] en secondes ; tout le reste est ignoré.
function cleanCaptions(v) {
  if (v === null) return [];
  if (!Array.isArray(v) || v.length > 10_000) return null;
  const out = [];
  for (const x of v) {
    const start = Number(x?.start), end = Number(x?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > 86400) return null;
    const text = String(x?.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 1000);
    if (text) out.push({ start, end, text });
  }
  return out;
}

// Ce que voit un visiteur anonyme d'un lien de partage : pas de chemin local (file://) ni de détails internes.
function publicView(c) {
  const { id, kind, ext, title, width, height, duration, size, createdAt, thumb, captions } = c;
  const sourceUrl = /^https?:\/\//i.test(c.sourceUrl || '') ? c.sourceUrl : '';
  const allowComments = c.allowComments !== false;
  return { id, kind, ext, title, width, height, duration, size, createdAt, thumb, captions, sourceUrl, allowDownload: c.allowDownload !== false,
    allowComments, comments: allowComments ? c.comments || [] : [], canEdit: false };
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

// Page d'une capture, avec les balises Open Graph pour l'aperçu du lien (titre, vignette).
// Rien n'est révélé pour un lien protégé par mot de passe.
const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
async function viewerPage(res, c) {
  let html;
  try { html = await fsp.readFile(path.join(PUBLIC, 'viewer.html'), 'utf8'); } catch { return send(res, 404, 'Introuvable'); }
  if (!c.password) {
    const video = c.kind === 'video';
    const desc = c.kind === 'enc' ? 'Contenu chiffré de bout en bout' : video ? `Vidéo de ${Math.floor((c.duration || 0) / 60)} min ${String(Math.round(c.duration || 0) % 60).padStart(2, '0')} s` : 'Capture d\'écran';
    const tags = [
      `<meta property="og:title" content="${esc(c.title)}">`,
      `<meta property="og:description" content="${esc(desc)} · LocalShot">`,
      `<meta property="og:type" content="${video ? 'video.other' : 'website'}">`,
      '<meta property="og:site_name" content="LocalShot">',
    ];
    const img = c.thumb ? `/t/${c.id}.${c.thumb}` : c.kind === 'image' ? `/i/${c.id}.png` : null;
    if (img && PUBLIC_URL) {
      tags.push(`<meta property="og:image" content="${esc(PUBLIC_URL + img)}">`, '<meta name="twitter:card" content="summary_large_image">');
      tags.push(`<meta property="og:url" content="${esc(`${PUBLIC_URL}/c/${c.id}`)}">`);
    }
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(c.title)} — LocalShot</title>\n  ${tags.join('\n  ')}`);
  }
  send(res, 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
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
      return send(res, 204, '', 'text/plain', { 'Set-Cookie': `${COOKIE}=${newSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${secureCookie()}` });
    }
    if (method === 'POST' && p === '/api/logout') {
      const sid = cookies(req)[COOKIE];
      if (sid) sessions.delete(sessionKey(sid));
      return send(res, 204, '', 'text/plain', { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookie()}` });
    }
    if (method === 'GET' && (m = p.match(new RegExp(`^/c/${ID_RE}$`)))) {
      const c = find(m[1]);
      if (!c) return file(res, 'notfound.html', 404);
      if (expired(c) && !local) return file(res, 'expired.html', 410);
      return viewerPage(res, c);
    }
    if (['GET', 'HEAD'].includes(method) && (m = p.match(new RegExp(`^/i/${ID_RE}\\.(png|mp4|webm|bin)$`)))) {
      const c = find(m[1]);
      if (!c || (c.ext || 'png') !== m[2] || (!local && expired(c))) return send(res, 404, 'Introuvable');
      if (!local && !unlocked(req, c)) return send(res, 401, 'Mot de passe requis');
      const dl = url.searchParams.has('dl');
      if (dl && !local && c.allowDownload === false) return send(res, 403, 'Téléchargement désactivé');
      return serveFile(req, res, c, dl);
    }
    if (['GET', 'HEAD'].includes(method) && (m = p.match(new RegExp(`^/t/${ID_RE}\\.(webp|jpg|png)$`)))) {
      const c = find(m[1]);
      if (!c || c.thumb !== m[2] || (!local && (expired(c) || !unlocked(req, c)))) return send(res, 404, 'Introuvable');
      try {
        const buf = await fsp.readFile(path.join(THUMBS_DIR, `${c.id}.${c.thumb}`));
        return send(res, 200, method === 'HEAD' ? '' : buf, THUMB_MIME[c.thumb], { 'Cache-Control': 'private, max-age=300', 'Cross-Origin-Resource-Policy': 'cross-origin' });
      } catch { return send(res, 404, 'Introuvable'); }
    }
    if (method === 'GET' && (m = p.match(/^\/assets\/([\w.-]+)$/))) return file(res, m[1]);
    // Application installable (PWA)
    if (method === 'GET' && p === '/manifest.webmanifest') return file(res, 'manifest.webmanifest');
    if (method === 'GET' && p === '/sw.js') return file(res, 'sw.js');
    // « Partager vers LocalShot » depuis le système (application installée) : on renvoie vers la galerie.
    if (method === 'POST' && p === '/share-target') { req.resume(); return send(res, 303, '', 'text/plain', { Location: '/?partage=1' }); }

    if (p === '/api/health') {
      return json(res, 200, { ok: true, app: 'localshot', port: PORT, local, auth: !!TOKEN, publicUrl: PUBLIC_URL, storage: storage.current.name });
    }

    if (p === '/api/captures') {
      if (!local) return json(res, TOKEN ? 401 : 403, { error: TOKEN ? 'Clé d\'accès requise' : 'Réservé à cette machine' });
      if (method === 'GET') return json(res, 200, [...captures].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(adminView));
      if (method === 'POST') return await upload(req, res);
      return json(res, 405, { error: 'Méthode non autorisée' });
    }

    if (method === 'POST' && (m = p.match(new RegExp(`^/api/captures/${ID_RE}/unlock$`)))) {
      const c = find(m[1]);
      if (!c || expired(c)) return json(res, 404, { error: 'Introuvable' });
      if (!c.password) return json(res, 204);
      let body = {};
      try { body = JSON.parse((await readBody(req, 2000)).toString('utf8') || '{}'); } catch { return json(res, 400, { error: 'JSON invalide' }); }
      const ipKey = `${c.id}|${clientAddr(req)}`;
      const wait = blockedFor(ipKey);
      if (wait) return send(res, 429, JSON.stringify({ error: `Trop d'essais : réessayez dans ${Math.ceil(wait / 60)} min` }), 'application/json; charset=utf-8', { 'Retry-After': String(wait) });
      // Lien très attaqué (toutes adresses confondues) : les essais passent un par un, 3 s chacun
      // (20 par minute au plus, quel que soit le nombre d'attaquants), mais le bon mot de passe passe toujours.
      if ((linkFailures.get(c.id) || 0) >= 50) {
        const q = linkQueues.get(c.id) || { tail: Promise.resolve(), waiting: 0 };
        if (q.waiting >= 20) return send(res, 429, JSON.stringify({ error: 'Trop d\'essais en cours : réessayez dans une minute' }), 'application/json; charset=utf-8', { 'Retry-After': '60' });
        q.waiting += 1;
        linkQueues.set(c.id, q);
        const turn = q.tail.then(() => new Promise((r) => setTimeout(r, 3000)));
        q.tail = turn;
        await turn;
        q.waiting -= 1;
      }
      if (typeof body.password !== 'string' || !(await checkPassword(body.password, c.password))) {
        fail(ipKey, 5, Infinity);
        linkFailures.set(c.id, (linkFailures.get(c.id) || 0) + 1);
        await new Promise((r) => setTimeout(r, 800)); // ralentit les essais au hasard
        return json(res, 401, { error: 'Mot de passe incorrect' });
      }
      failures.delete(ipKey);
      return send(res, 204, '', 'text/plain', { 'Set-Cookie': `${unlockCookie(c)}=${unlockToken(c)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 3600}${secureCookie()}` });
    }

    // Commentaires : les visiteurs (lien valide, déverrouillé) peuvent en ajouter ; le propriétaire peut les supprimer.
    if ((m = p.match(new RegExp(`^/api/captures/${ID_RE}/comments(?:/([\\w-]{6,32}))?$`)))) {
      const c = find(m[1]);
      if (!c || (!local && (expired(c) || !unlocked(req, c)))) return json(res, 404, { error: 'Introuvable' });
      if (method === 'POST' && !m[2]) {
        if (c.allowComments === false && !local) return json(res, 403, { error: 'Commentaires désactivés' });
        const ipKey = `cm|${clientAddr(req)}`;
        if (blockedFor(ipKey)) return json(res, 429, { error: 'Trop de commentaires : patientez quelques minutes' });
        let body = {};
        try { body = JSON.parse((await readBody(req, 8000)).toString('utf8') || '{}'); } catch { return json(res, 400, { error: 'JSON invalide' }); }
        const text = String(body.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 1000);
        if (!text) return json(res, 400, { error: 'Commentaire vide' });
        if ((c.comments || []).length >= 500) return json(res, 409, { error: 'Trop de commentaires sur ce lien' });
        const t = Number(body.t);
        const cm = {
          id: crypto.randomBytes(6).toString('base64url'),
          name: String(body.name ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60) || (local ? 'Moi' : ''),
          text,
          t: (c.kind === 'video' || c.kind === 'enc') && Number.isFinite(t) && t >= 0 && t <= 86400 ? t : undefined,
          at: new Date().toISOString(),
        };
        (c.comments ||= []).push(cm);
        if (!local) fail(ipKey, 20, Infinity); // 20 commentaires, puis attente croissante
        await persist();
        return json(res, 201, cm);
      }
      if (method === 'DELETE' && m[2]) {
        if (!local) return json(res, TOKEN ? 401 : 403, { error: TOKEN ? 'Clé d\'accès requise' : 'Réservé à cette machine' });
        c.comments = (c.comments || []).filter((x) => x.id !== m[2]);
        await persist();
        return json(res, 204);
      }
      return json(res, 405, { error: 'Méthode non autorisée' });
    }

    if (method === 'PUT' && (m = p.match(new RegExp(`^/api/captures/${ID_RE}/thumb$`)))) {
      if (!local) return json(res, TOKEN ? 401 : 403, { error: TOKEN ? 'Clé d\'accès requise' : 'Réservé à cette machine' });
      const c = find(m[1]);
      if (!c) return json(res, 404, { error: 'Introuvable' });
      const k = THUMB_KINDS[String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()];
      if (!k) return json(res, 415, { error: 'Vignette : webp, jpeg ou png' });
      const buf = await readBody(req, 2 * MB);
      if (!k.ok(buf)) return json(res, 400, { error: 'Vignette invalide' });
      if (c.thumb && c.thumb !== k.ext) await fsp.rm(path.join(THUMBS_DIR, `${c.id}.${c.thumb}`), { force: true });
      await fsp.writeFile(path.join(THUMBS_DIR, `${c.id}.${k.ext}`), buf);
      c.thumb = k.ext;
      await persist();
      return json(res, 204);
    }

    if ((m = p.match(new RegExp(`^/api/captures/${ID_RE}$`)))) {
      const c = find(m[1]);
      if (!c) return json(res, 404, { error: 'Introuvable' });
      if (method === 'GET') {
        if (local) return json(res, 200, adminView(c));
        if (expired(c)) return json(res, 404, { error: 'Lien expiré' });
        if (!unlocked(req, c)) return json(res, 200, { id: c.id, kind: c.kind, locked: true });
        if (url.searchParams.has('view')) countView(c); // une vue = une ouverture de la page
        return json(res, 200, publicView(c));
      }
      if (!local) return json(res, TOKEN ? 401 : 403, { error: TOKEN ? 'Clé d\'accès requise' : 'Réservé à cette machine' });
      if (method === 'PATCH') {
        let body = {};
        try { body = JSON.parse((await readBody(req, 2 * MB)).toString('utf8') || '{}'); } catch { return json(res, 400, { error: 'JSON invalide' }); }
        if ('captions' in body) {
          const caps = cleanCaptions(body.captions);
          if (!caps) return json(res, 400, { error: 'Sous-titres invalides' });
          if (caps.length) c.captions = caps; else delete c.captions;
        }
        if (typeof body.title === 'string') c.title = body.title.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300) || 'Capture sans titre';
        if ('expiresAt' in body) {
          if (body.expiresAt === null) delete c.expiresAt;
          else if (typeof body.expiresAt === 'string' && Number.isFinite(Date.parse(body.expiresAt))) c.expiresAt = new Date(body.expiresAt).toISOString();
          else return json(res, 400, { error: 'Date d\'expiration invalide' });
        }
        if (typeof body.allowDownload === 'boolean') c.allowDownload = body.allowDownload;
        if (typeof body.allowComments === 'boolean') c.allowComments = body.allowComments;
        if ('password' in body) {
          if (body.password === null || body.password === '') delete c.password;
          else if (typeof body.password === 'string' && body.password.length >= 6 && body.password.length <= 200) c.password = await hashPassword(body.password);
          else return json(res, 400, { error: 'Mot de passe : 6 caractères minimum' });
        }
        await persist();
        return json(res, 200, adminView(c));
      }
      if (method === 'DELETE') {
        await storage.of(c)?.remove(c);
        if (c.thumb) await fsp.rm(path.join(THUMBS_DIR, `${c.id}.${c.thumb}`), { force: true });
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
  console.log(`\n  LocalShot — serveur démarré (${HOST}:${PORT})`);
  console.log(`  Galerie      : http://localhost:${PORT}`);
  console.log(`  Données      : ${DATA_DIR}`);
  console.log(`  Stockage     : ${storage.current.describe()}`);
  storage.current.check?.().then(
    () => console.log('  Stockage     : connexion vérifiée ✓'),
    (e) => console.error(`  ⚠ Stockage   : ${e.message}`));
  if (PUBLIC_URL) console.log(`  Adresse      : ${PUBLIC_URL}`);
  if (TOKEN) console.log('  Accès        : protégé par clé (LOCALSHOT_TOKEN)');
  else if (HOST !== '127.0.0.1') console.log('  ⚠ Sans LOCALSHOT_TOKEN, personne ne peut gérer les captures à distance.');
  console.log('');
});
