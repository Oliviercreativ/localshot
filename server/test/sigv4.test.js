'use strict';
// Vecteurs officiels de la documentation AWS (Signature Version 4, Amazon S3).
const test = require('node:test');
const assert = require('node:assert');
const { signRequest, presign, EMPTY_SHA256 } = require('../storage/sigv4');

const creds = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' };
const date = new Date('2013-05-24T00:00:00Z');

test('signature par en-tête (GET Object avec Range)', () => {
  const h = signRequest({ ...creds, method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', headers: { range: 'bytes=0-9' }, payloadHash: EMPTY_SHA256, date });
  assert.match(h.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  assert.match(h.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
});

test('URL présignée (GET Object, 24 h)', () => {
  const url = presign({ ...creds, host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', expires: 86400, date });
  assert.ok(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), url);
});
