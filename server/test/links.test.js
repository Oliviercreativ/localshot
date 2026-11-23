'use strict';
// Options des liens de partage : expiration, mot de passe, téléchargement, vues.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const KEY = 'test_key_0123456789abcdefghijklmnop';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const auth = { Authorization: `Bearer ${KEY}` };

function startLocalShot() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'localshot-links-'));
  const port = 6000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { PATH: process.env.PATH, PORT: String(port), LOCALSHOT_DATA: data, LOCALSHOT_TOKEN: KEY }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { log += d; if (/Stockage/.test(log)) resolve(); });
    child.stderr.on('data', (d) => (log += d));
    child.on('exit', (c) => reject(new Error(`serveur arrêté (${c}) : ${log}`)));
  });
  return { base: `http://127.0.0.1:${port}`, data, ready, stop: () => { child.kill(); fs.rmSync(data, { recursive: true, force: true }); } };
}

async function setup(t) {
  const ls = startLocalShot();
  t.after(() => ls.stop());
  await ls.ready;
  const meta = await (await fetch(`${ls.base}/api/captures`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png' }, body: PNG })).json();
  const patch = (body) => fetch(`${ls.base}/api/captures/${meta.id}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ls, id: meta.id, patch };
}

test('mot de passe : rien sans le bon mot de passe, cookie après déverrouillage, empreinte jamais renvoyée', async (t) => {
  const { ls, id, patch } = await setup(t);
  const admin = await (await patch({ password: 'secret-client' })).json();
  assert.strictEqual(admin.hasPassword, true);
  assert.ok(!('password' in admin), 'l\'empreinte ne sort jamais');

  const anon = await (await fetch(`${ls.base}/api/captures/${id}`)).json();
  assert.deepStrictEqual(anon, { id, kind: 'image', locked: true });
  assert.strictEqual((await fetch(`${ls.base}/i/${id}.png`)).status, 401);

  const unlock = (password) => fetch(`${ls.base}/api/captures/${id}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.strictEqual((await unlock('mauvais')).status, 401);
  const ok = await unlock('secret-client');
  assert.strictEqual(ok.status, 204);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await fetch(`${ls.base}/i/${id}.png`, { headers: { Cookie: cookie } })).status, 200);
  assert.strictEqual((await (await fetch(`${ls.base}/api/captures/${id}`, { headers: { Cookie: cookie } })).json()).title, 'Capture sans titre');

  // Changer le mot de passe invalide les accès déjà donnés.
  await patch({ password: 'nouveau' });
  assert.strictEqual((await fetch(`${ls.base}/i/${id}.png`, { headers: { Cookie: cookie } })).status, 401);
  await patch({ password: null });
  assert.strictEqual((await fetch(`${ls.base}/i/${id}.png`)).status, 200);
});

test('expiration : le lien et le fichier disparaissent pour les visiteurs, pas pour le propriétaire', async (t) => {
  const { ls, id, patch } = await setup(t);
  assert.strictEqual((await patch({ expiresAt: new Date(Date.now() - 1000).toISOString() })).status, 200);
  assert.strictEqual((await fetch(`${ls.base}/c/${id}`)).status, 410);
  assert.strictEqual((await fetch(`${ls.base}/i/${id}.png`)).status, 404);
  assert.strictEqual((await fetch(`${ls.base}/api/captures/${id}`)).status, 404);
  assert.strictEqual((await fetch(`${ls.base}/api/captures/${id}`, { headers: auth })).status, 200);
  assert.strictEqual((await patch({ expiresAt: 'pas une date' })).status, 400);
  await patch({ expiresAt: null });
  assert.strictEqual((await fetch(`${ls.base}/c/${id}`)).status, 200);
});

test('téléchargement désactivé et compteur de vues', async (t) => {
  const { ls, id, patch } = await setup(t);
  await patch({ allowDownload: false });
  assert.strictEqual((await fetch(`${ls.base}/i/${id}.png?dl=1`)).status, 403);
  assert.strictEqual((await fetch(`${ls.base}/i/${id}.png`)).status, 200, 'l\'affichage reste possible');
  const pub = await (await fetch(`${ls.base}/api/captures/${id}?view=1`)).json();
  assert.strictEqual(pub.allowDownload, false);
  await fetch(`${ls.base}/api/captures/${id}?view=1`);
  await fetch(`${ls.base}/api/captures/${id}`); // sans ?view : pas compté
  await fetch(`${ls.base}/api/captures/${id}?view=1`, { headers: auth }); // le propriétaire n'est pas compté
  assert.strictEqual((await (await fetch(`${ls.base}/api/captures/${id}`, { headers: auth })).json()).views, 2);
  const mode = fs.statSync(path.join(ls.data, 'secret')).mode & 0o777;
  assert.strictEqual(mode, 0o600, 'le secret du serveur n\'est lisible que par lui');
});

test('vignette et aperçu du lien : balises Open Graph échappées, rien pour un lien protégé', async (t) => {
  const { ls, id, patch } = await setup(t);
  await patch({ title: 'Devis <client> "A&B"' });
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);
  const put = (body, type = 'image/webp', headers = auth) => fetch(`${ls.base}/api/captures/${id}/thumb`, { method: 'PUT', headers: { ...headers, 'Content-Type': type }, body });
  assert.strictEqual((await put(webp, 'image/webp', {})).status, 401, 'réservé au propriétaire');
  assert.strictEqual((await put(Buffer.from('<svg/>'), 'image/svg+xml')).status, 415);
  assert.strictEqual((await put(Buffer.from('pas du webp'))).status, 400);
  assert.strictEqual((await put(webp)).status, 204);
  assert.strictEqual((await fetch(`${ls.base}/t/${id}.webp`)).status, 200);

  const html = await (await fetch(`${ls.base}/c/${id}`)).text();
  assert.match(html, /<meta property="og:title" content="Devis &lt;client&gt; &quot;A&amp;B&quot;">/);
  assert.ok(!html.includes('<client>'), 'titre échappé');

  await patch({ password: 'motdepasse' });
  const locked = await (await fetch(`${ls.base}/c/${id}`)).text();
  assert.ok(!locked.includes('og:title') && !locked.includes('Devis'), 'aucune information sur un lien protégé');
  assert.strictEqual((await fetch(`${ls.base}/t/${id}.webp`)).status, 404);
});
