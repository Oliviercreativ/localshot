'use strict';
/**
 * Stockage « compatible S3 » : AWS S3, Cloudflare R2, Backblaze B2, Scaleway, OVH, Wasabi, MinIO, Garage…
 *
 *   S3_BUCKET             nom du bucket (obligatoire)
 *   S3_ACCESS_KEY_ID      identifiant de clé (obligatoire)
 *   S3_SECRET_ACCESS_KEY  secret (obligatoire)
 *   S3_ENDPOINT           ex. https://<compte>.r2.cloudflarestorage.com (vide = AWS)
 *   S3_REGION             ex. eu-west-3 ; « auto » pour R2 (défaut : auto si R2, sinon us-east-1)
 *   S3_PATH_STYLE         1 = https://endpoint/bucket/clé (défaut si S3_ENDPOINT), 0 = https://bucket.endpoint/clé
 *   S3_PREFIX             dossier dans le bucket (ex. localshot/)
 *   S3_URL_TTL            durée de validité des liens de lecture, en secondes (défaut 21600 = 6 h)
 *
 * Le bucket reste PRIVÉ : le navigateur reçoit un lien temporaire signé (URL présignée).
 */
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { signRequest, presign, EMPTY_SHA256, encPath } = require('./sigv4');

module.exports = function createS3(env) {
  const missing = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Stockage S3 : variable(s) manquante(s) ${missing.join(', ')}`);

  const bucket = env.S3_BUCKET;
  const custom = !!env.S3_ENDPOINT;
  const isR2 = /\.r2\.cloudflarestorage\.com/i.test(env.S3_ENDPOINT || '');
  const region = env.S3_REGION || (isR2 ? 'auto' : 'us-east-1');
  const endpoint = new URL(env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`);
  const pathStyle = env.S3_PATH_STYLE ? env.S3_PATH_STYLE !== '0' : custom;
  const cleanPrefix = (env.S3_PREFIX || '').replace(/^\/+|\/+$/g, '');
  const prefix = cleanPrefix ? `${cleanPrefix}/` : '';
  const ttl = Math.min(Math.max(Number(env.S3_URL_TTL) || 21600, 60), 604800);
  const creds = { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY, region };
  if (endpoint.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(endpoint.hostname) && env.S3_ALLOW_HTTP !== '1') {
    throw new Error('Stockage S3 : S3_ENDPOINT doit être en https (S3_ALLOW_HTTP=1 pour un MinIO du réseau local).');
  }

  const host = pathStyle ? endpoint.host : `${bucket}.${endpoint.host}`;
  const keyOf = (c) => `${prefix}${c.id}.${c.ext || 'png'}`;
  const pathOf = (key) => (pathStyle ? `/${bucket}/${key}` : `/${key}`);
  const origin = `${endpoint.protocol}//${host}`;
  const client = endpoint.protocol === 'https:' ? https : http;

  function call(method, path, { headers = {}, body, payloadHash = EMPTY_SHA256 } = {}) {
    const signed = signRequest({ ...creds, method, host, path, headers, payloadHash });
    return new Promise((resolve, reject) => {
      const req = client.request({
        protocol: endpoint.protocol, hostname: endpoint.hostname, port: endpoint.port || undefined,
        method, path: encPath(path), headers: signed,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.length < 64 && chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.setTimeout(120_000, () => req.destroy(new Error('Délai dépassé avec le stockage S3')));
      if (body) body.on('error', reject).pipe(req); else req.end();
    });
  }

  const s3Error = (r) => (/<Code>([^<]+)<\/Code>/.exec(r.text) || [])[1] || `HTTP ${r.status}`;

  return {
    name: 's3',
    origins: [origin],
    describe: () => `S3 ${origin}${pathStyle ? '/' + bucket : ''}/${prefix}`,

    // Vérifie au démarrage que le bucket est joignable avec ces identifiants (ne bloque pas).
    async check() {
      const r = await call('HEAD', pathStyle ? `/${bucket}` : '/');
      if (r.status >= 300) throw new Error(`bucket inaccessible (${s3Error(r)})`);
    },

    async put({ id, ext, tmp, size, mime }) {
      const r = await call('PUT', pathOf(keyOf({ id, ext })), {
        headers: { 'content-type': mime, 'content-length': String(size) },
        body: fs.createReadStream(tmp),
        payloadHash: 'UNSIGNED-PAYLOAD',
      });
      await fs.promises.rm(tmp, { force: true });
      if (r.status >= 300) { const e = new Error(`Envoi vers le stockage refusé (${s3Error(r)})`); e.status = 502; throw e; }
    },

    async remove(c) {
      const r = await call('DELETE', pathOf(keyOf(c)));
      if (r.status >= 300 && r.status !== 404) throw new Error(`Suppression refusée par le stockage (${s3Error(r)})`);
    },

    // Redirige vers un lien temporaire signé : la vidéo est lue directement depuis le stockage (Range compris).
    serve(req, res, c, { headers, mime, filename }) {
      const query = { 'response-content-type': mime };
      if (filename) query['response-content-disposition'] = filename;
      const url = presign({ ...creds, protocol: endpoint.protocol, host, path: pathOf(keyOf(c)), query, expires: ttl });
      res.writeHead(302, { ...headers, Location: url, 'Cache-Control': 'no-store' });
      res.end();
    },
  };
};
