'use strict';
/**
 * Signature AWS Signature Version 4, sans dépendance (module crypto de Node).
 * Compatible avec tous les services « S3 » : AWS S3, Cloudflare R2, Backblaze B2,
 * Scaleway, OVH, Wasabi, MinIO, Garage…
 * Référence : https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
 */
const crypto = require('node:crypto');

const hmac = (key, s) => crypto.createHmac('sha256', key).update(s, 'utf8').digest();
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const EMPTY_SHA256 = sha256('');
const UNSIGNED = 'UNSIGNED-PAYLOAD';

// Encodage URI exigé par AWS (RFC 3986 : seuls A-Z a-z 0-9 - _ . ~ restent tels quels).
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (p) => p.split('/').map(enc).join('/');
const amzDate = (d) => d.toISOString().replace(/[:-]|\.\d{3}/g, '');

function canonicalQuery(query) {
  return Object.keys(query).sort().map((k) => `${enc(k)}=${enc(String(query[k]))}`).join('&');
}

function signingKey(secret, day, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, day), region), service), 'aws4_request');
}

function signature({ method, path, query, headers, payloadHash, secretAccessKey, region, service, date }) {
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const canonicalHeaders = names.map((h) => `${h}:${lower[h]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [method, encPath(path), canonicalQuery(query), canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stamp = amzDate(date);
  const scope = `${stamp.slice(0, 8)}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonical)].join('\n');
  const sig = hmac(signingKey(secretAccessKey, stamp.slice(0, 8), region, service), toSign).toString('hex');
  return { sig, scope, signedHeaders, stamp };
}

/** Signe une requête via l'en-tête Authorization. Renvoie les en-têtes à envoyer. */
function signRequest({ method, host, path, query = {}, headers = {}, payloadHash = UNSIGNED, accessKeyId, secretAccessKey, region, service = 's3', date = new Date() }) {
  const all = { ...headers, host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate(date) };
  const { sig, scope, signedHeaders } = signature({ method, path, query, headers: all, payloadHash, secretAccessKey, region, service, date });
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}` };
}

/** URL présignée (lien temporaire) : le navigateur lit l'objet directement, sans la clé. */
function presign({ method = 'GET', protocol = 'https:', host, path, query = {}, expires = 3600, accessKeyId, secretAccessKey, region, service = 's3', date = new Date() }) {
  const stamp = amzDate(date);
  const q = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${stamp.slice(0, 8)}/${region}/${service}/aws4_request`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const { sig } = signature({ method, path, query: q, headers: { host }, payloadHash: UNSIGNED, secretAccessKey, region, service, date });
  return `${protocol}//${host}${encPath(path)}?${canonicalQuery(q)}&X-Amz-Signature=${sig}`;
}

module.exports = { signRequest, presign, sha256, EMPTY_SHA256, UNSIGNED, enc, encPath };
