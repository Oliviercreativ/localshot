'use strict';
// Fichiers partagés en deux copies (extension et serveur) : elles doivent rester identiques.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
for (const f of ['player.js', 'player.css', 'linkopts.js', 'transcript.js', 'comments.js', 'e2e.js', 'i18n.js', 'icons.js']) {
  test(`${f} identique dans l'extension et le serveur`, () => {
    assert.strictEqual(
      fs.readFileSync(path.join(root, 'server/public', f), 'utf8'),
      fs.readFileSync(path.join(root, 'extension/ui', f), 'utf8'),
      `copiez extension/ui/${f} vers server/public/${f}`,
    );
  });
}
