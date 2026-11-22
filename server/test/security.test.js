'use strict';
// Tests de régression des failles trouvées par l'audit de sécurité (run 1).
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const createLocal = require('../storage/local');

const KEY = 'test_key_0123456789abcdefghijklmnop';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function startLocalShot(env = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'localshot-sec-'));
  const port = 5000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { PATH: process.env.PATH, PORT: String(port), LOCALSHOT_DATA: data, LOCALSHOT_TOKEN: KEY, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', () => /Stockage/.test(log) && resolve());
    child.on('exit', (c) => reject(new Error(`serveur arrêté (${c}) : ${log}`)));
  });
  return { base: `http://127.0.0.1:${port}`, ready, stop: () => { child.kill(); fs.rmSync(data, { recursive: true, force: true }); } };
}

const auth = { Authorization: `Bearer ${KEY}` };
const login = (base) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: KEY }) })
  .then((r) => /ls_session=([^;]+)/.exec(r.headers.get('set-cookie'))[1]);

test('session : identifiant unique par connexion, refusé après déconnexion', async (t) => {
  const ls = startLocalShot();
  t.after(() => ls.stop());
  await ls.ready;
  const a = await login(ls.base);
  const b = await login(ls.base);
  assert.notStrictEqual(a, b, 'deux connexions → deux sessions différentes');
  const list = (sid) => fetch(`${ls.base}/api/captures`, { headers: { Cookie: `ls_session=${sid}` } }).then((r) => r.status);
  assert.strictEqual(await list(a), 200);
  assert.strictEqual((await fetch(`${ls.base}/api/logout`, { method: 'POST', headers: { Cookie: `ls_session=${a}` } })).status, 204);
  assert.strictEqual(await list(a), 401, 'cookie refusé après déconnexion');
  assert.strictEqual(await list(b), 200, 'les autres sessions restent valides');
  assert.strictEqual(await list('inventé'), 401);
});

test('fiche publique : pas de chemin file:// ni de détails internes pour un visiteur anonyme', async (t) => {
  const ls = startLocalShot();
  t.after(() => ls.stop());
  await ls.ready;
  const src = 'file:///Users/quelquun/Clients/Secret/contrat.html';
  const meta = await (await fetch(`${ls.base}/api/captures`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png', 'X-Source-Url': encodeURIComponent(src) }, body: PNG })).json();
  const anon = await (await fetch(`${ls.base}/api/captures/${meta.id}`)).json();
  assert.strictEqual(anon.sourceUrl, '');
  assert.strictEqual(anon.canEdit, false);
  assert.ok(!('storage' in anon) && !('mode' in anon));
  const admin = await (await fetch(`${ls.base}/api/captures/${meta.id}`, { headers: auth })).json();
  assert.strictEqual(admin.sourceUrl, src, 'le propriétaire voit toujours la source');
  assert.strictEqual(admin.canEdit, true);
});

// Sert un fichier via le pilote local dans ce processus, pour pouvoir compter ses descripteurs.
async function localServer(t, file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localshot-drv-'));
  const drv = createLocal({ dir });
  const c = { id: 'AAAAAAAAAAAA', ext: 'png' };
  fs.writeFileSync(path.join(dir, 'AAAAAAAAAAAA.png'), file);
  const srv = http.createServer((req, res) => drv.serve(req, res, c, { headers: {}, mime: 'image/png' }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { port: srv.address().port, dir, c };
}
const openFds = () => fs.readdirSync('/dev/fd').length;

test('téléchargements interrompus : aucun descripteur de fichier ne reste ouvert', async (t) => {
  const { port } = await localServer(t, Buffer.alloc(4 * 1024 * 1024, 7));
  const before = openFds();
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', agent: false }, (res) => res.once('data', () => { req.destroy(); resolve(); }));
      req.on('error', resolve);
    });
  }
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(openFds() - before <= 2, `descripteurs ouverts en trop : ${openFds() - before}`);
});

test('fichier supprimé entre stat et lecture : la requête échoue, le serveur survit', async (t) => {
  const { port, dir } = await localServer(t, PNG);
  const realStat = fs.stat;
  fs.stat = (p, cb) => realStat(p, (err, st) => { fs.rmSync(path.join(dir, 'AAAAAAAAAAAA.png'), { force: true }); cb(err, st); });
  t.after(() => { fs.stat = realStat; });
  await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', agent: false }, (res) => { res.resume(); res.on('end', resolve); res.on('error', resolve); });
    req.on('error', resolve);
  });
  fs.stat = realStat;
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(true, 'le processus de test est toujours vivant');
});
