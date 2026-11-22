'use strict';
// Tests de bout en bout : serveur LocalShot + faux service S3 qui vérifie les signatures.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { signRequest, presign } = require('../storage/sigv4');

const KEY = 'test_key_0123456789abcdefghijklmnop';
const S3 = { id: 'TESTKEYID', secret: 'testsecret/abc', bucket: 'shots', region: 'auto' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(200, 7)]);

// ---------- Faux S3 ----------
function fakeS3() {
  const objects = new Map();
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(u.pathname);
    const date = (s) => new Date(s.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, '$1-$2-$3T$4:$5:$6Z'));
    let ok;
    if (u.searchParams.has('X-Amz-Signature')) {
      const q = Object.fromEntries([...u.searchParams].filter(([k]) => !/^X-Amz-(Algorithm|Credential|Date|Expires|SignedHeaders|Signature)$/.test(k)));
      const expect = presign({ protocol: 'http:', host: req.headers.host, path: pathname, query: q, expires: Number(u.searchParams.get('X-Amz-Expires')),
        accessKeyId: S3.id, secretAccessKey: S3.secret, region: S3.region, date: date(u.searchParams.get('X-Amz-Date')) });
      ok = expect.endsWith(`X-Amz-Signature=${u.searchParams.get('X-Amz-Signature')}`);
    } else {
      const m = /SignedHeaders=([^,]+), Signature=(\w+)/.exec(req.headers.authorization || '');
      const signed = m ? m[1].split(';').filter((h) => !['host', 'x-amz-date', 'x-amz-content-sha256'].includes(h)) : [];
      const h = signRequest({ method: req.method, host: req.headers.host, path: pathname, headers: Object.fromEntries(signed.map((k) => [k, req.headers[k]])),
        payloadHash: req.headers['x-amz-content-sha256'], accessKeyId: S3.id, secretAccessKey: S3.secret, region: S3.region, date: date(req.headers['x-amz-date'] || '') });
      ok = !!m && h.authorization.endsWith(`Signature=${m[2]}`);
    }
    if (!ok) { res.writeHead(403); return res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>'); }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (req.method === 'HEAD') { res.writeHead(200); return res.end(); }
    if (req.method === 'PUT') { objects.set(pathname, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(200); return res.end(); }
    if (req.method === 'DELETE') { objects.delete(pathname); res.writeHead(204); return res.end(); }
    const o = objects.get(pathname);
    if (!o) { res.writeHead(404); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
    res.writeHead(200, { 'Content-Type': u.searchParams.get('response-content-type') || o.type, 'Content-Disposition': u.searchParams.get('response-content-disposition') || '' });
    res.end(o.body);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, objects, port: server.address().port })));
}

function startLocalShot(env) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'localshot-test-'));
  const port = 4900 + Math.floor(Math.random() * 90);
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
  return { base: `http://127.0.0.1:${port}`, ready, log: () => log, stop: () => { child.kill(); fs.rmSync(data, { recursive: true, force: true }); }, data };
}

const auth = { Authorization: `Bearer ${KEY}` };
const upload = (base, body, type) => fetch(`${base}/api/captures`, { method: 'POST', headers: { ...auth, 'Content-Type': type, 'X-Title': 'Démo%20client' }, body });

test('stockage S3 : envoi, lecture par lien signé, suppression', async (t) => {
  const s3 = await fakeS3();
  const ls = startLocalShot({ STORAGE: 's3', S3_ENDPOINT: `http://127.0.0.1:${s3.port}`, S3_REGION: S3.region, S3_BUCKET: S3.bucket, S3_ACCESS_KEY_ID: S3.id, S3_SECRET_ACCESS_KEY: S3.secret, S3_PREFIX: 'localshot' });
  t.after(() => { ls.stop(); s3.server.close(); });
  await ls.ready;
  await new Promise((r) => setTimeout(r, 200));
  assert.match(ls.log(), /connexion vérifiée/);

  const r = await upload(ls.base, MP4, 'video/mp4');
  assert.strictEqual(r.status, 201, await r.clone().text());
  const meta = await r.json();
  assert.strictEqual(meta.storage, 's3');
  const stored = s3.objects.get(`/${S3.bucket}/localshot/${meta.id}.mp4`);
  assert.ok(stored && stored.body.equals(MP4), 'objet présent dans le bucket');
  assert.strictEqual(stored.type, 'video/mp4');
  assert.deepStrictEqual(fs.readdirSync(path.join(ls.data, 'captures')), [], 'aucun fichier temporaire laissé');

  const page = await fetch(`${ls.base}/c/${meta.id}`);
  assert.match(page.headers.get('content-security-policy'), new RegExp(`media-src 'self' http://127\\.0\\.0\\.1:${s3.port}`));

  const redirect = await fetch(`${ls.base}/i/${meta.id}.mp4?dl=1`, { redirect: 'manual' });
  assert.strictEqual(redirect.status, 302);
  const media = await fetch(redirect.headers.get('location'));
  assert.strictEqual(media.status, 200, 'signature de lien acceptée');
  assert.ok(Buffer.from(await media.arrayBuffer()).equals(MP4));
  assert.match(media.headers.get('content-disposition'), /attachment; filename="Dmo client\.mp4"/);

  const del = await fetch(`${ls.base}/api/captures/${meta.id}`, { method: 'DELETE', headers: auth });
  assert.strictEqual(del.status, 204);
  assert.strictEqual(s3.objects.size, 0, 'objet supprimé du bucket');
});

test('stockage S3 : mauvais identifiants → erreur claire, rien d\'enregistré', async (t) => {
  const s3 = await fakeS3();
  const ls = startLocalShot({ STORAGE: 's3', S3_ENDPOINT: `http://127.0.0.1:${s3.port}`, S3_REGION: S3.region, S3_BUCKET: S3.bucket, S3_ACCESS_KEY_ID: S3.id, S3_SECRET_ACCESS_KEY: 'faux' });
  t.after(() => { ls.stop(); s3.server.close(); });
  await ls.ready;
  const r = await upload(ls.base, PNG, 'image/png');
  assert.strictEqual(r.status, 502);
  assert.match((await r.json()).error, /SignatureDoesNotMatch/);
  const list = await (await fetch(`${ls.base}/api/captures`, { headers: auth })).json();
  assert.strictEqual(list.length, 0);
});

test('stockage local : envoi, lecture partielle (Range), suppression', async (t) => {
  const ls = startLocalShot({});
  t.after(() => ls.stop());
  await ls.ready;
  const meta = await (await upload(ls.base, PNG, 'image/png')).json();
  assert.strictEqual(meta.storage, 'local');
  const part = await fetch(`${ls.base}/i/${meta.id}.png`, { headers: { Range: 'bytes=0-7' } });
  assert.strictEqual(part.status, 206);
  assert.ok(Buffer.from(await part.arrayBuffer()).equals(PNG.subarray(0, 8)));
  assert.strictEqual((await fetch(`${ls.base}/api/captures/${meta.id}`, { method: 'DELETE', headers: auth })).status, 204);
  assert.strictEqual((await fetch(`${ls.base}/i/${meta.id}.png`)).status, 404);
});

test('configuration S3 incomplète → le serveur refuse de démarrer', async () => {
  const ls = startLocalShot({ STORAGE: 's3', S3_BUCKET: 'x' });
  await assert.rejects(ls.ready, /S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/);
  ls.stop();
});
