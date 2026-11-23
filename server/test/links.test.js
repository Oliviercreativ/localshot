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

let portSeq = 0;
function startLocalShot() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'localshot-links-'));
  const port = 6000 + (process.pid % 40) * 20 + (portSeq++ % 20);
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

test('mot de passe : blocage après 5 erreurs, minimum 6 caractères', async (t) => {
  const { ls, id, patch } = await setup(t);
  assert.strictEqual((await patch({ password: 'abc' })).status, 400);
  await patch({ password: 'bon-mot-de-passe' });
  const unlock = (password) => fetch(`${ls.base}/api/captures/${id}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  for (let i = 0; i < 6; i++) assert.strictEqual((await unlock('faux')).status, 401);
  const r = await unlock('bon-mot-de-passe');
  assert.strictEqual(r.status, 429, 'même le bon mot de passe attend après trop d\'erreurs');
  assert.ok(Number(r.headers.get('retry-after')) > 0);
});

test('commentaires : visiteurs autorisés, propriétaire peut supprimer, désactivables', async (t) => {
  const { ls, id, patch } = await setup(t);
  const post = (body, headers = {}) => fetch(`${ls.base}/api/captures/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const r = await post({ name: 'Client <b>', text: 'À revoir', t: 12 });
  assert.strictEqual(r.status, 201);
  const cm = await r.json();
  assert.strictEqual(cm.name, 'Client <b>', 'stocké tel quel, affiché en texte');
  assert.strictEqual(cm.t, undefined, 'pas d\'horodatage sur une image');
  assert.strictEqual((await post({ text: '   ' })).status, 400);
  assert.strictEqual((await fetch(`${ls.base}/api/captures/${id}/comments/${cm.id}`, { method: 'DELETE' })).status, 401);
  assert.strictEqual((await fetch(`${ls.base}/api/captures/${id}/comments/${cm.id}`, { method: 'DELETE', headers: auth })).status, 204);
  await patch({ allowComments: false });
  assert.strictEqual((await post({ text: 'encore' })).status, 403);
  assert.deepStrictEqual((await (await fetch(`${ls.base}/api/captures/${id}`)).json()).comments, []);
});

test('chiffré de bout en bout : accepté, titre jamais stocké, servi tel quel', async (t) => {
  const ls = startLocalShot();
  t.after(() => ls.stop());
  await ls.ready;
  const body = Buffer.concat([Buffer.from('LSENC1'), Buffer.alloc(12, 1), Buffer.alloc(64, 2)]);
  const r = await fetch(`${ls.base}/api/captures`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/vnd.localshot.enc', 'X-Title': 'Secret', 'X-Source-Url': 'https%3A%2F%2Fexemple.fr' }, body });
  assert.strictEqual(r.status, 201);
  const meta = await r.json();
  assert.strictEqual(meta.kind, 'enc');
  assert.strictEqual(meta.title, 'Contenu chiffré');
  assert.strictEqual(meta.sourceUrl, '');
  const file = Buffer.from(await (await fetch(`${ls.base}/i/${meta.id}.bin`)).arrayBuffer());
  assert.ok(file.equals(body));
  const bad = await fetch(`${ls.base}/api/captures`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/vnd.localshot.enc' }, body: Buffer.from('pas chiffré du tout') });
  assert.strictEqual(bad.status, 400);
});

test('adresse du visiteur : X-Forwarded-For inventé ignoré hors proxy, dernier saut seulement derrière un proxy', async (t) => {
  const { ls, id, patch } = await setup(t);
  await patch({ password: 'bon-mot-de-passe' });
  // Le test parle en local (comme tailscale serve) : seul le dernier saut compte, le visiteur ne choisit pas sa clé de blocage.
  const unlock = (xff) => fetch(`${ls.base}/api/captures/${id}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff }, body: JSON.stringify({ password: 'faux' }) });
  for (let i = 0; i < 6; i++) await unlock(`${i}.${i}.${i}.${i}, 100.64.0.7`);
  assert.strictEqual((await unlock('9.9.9.9, 100.64.0.7')).status, 429, 'changer le début de X-Forwarded-For ne contourne pas le blocage');
  assert.strictEqual((await unlock('100.64.0.8')).status, 401, 'une autre adresse réelle n\'est pas bloquée');
});
