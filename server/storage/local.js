'use strict';
// Stockage sur le disque du serveur (Mac, Raspberry Pi, NAS, VPS…).
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream');

module.exports = function createLocal({ dir }) {
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = (c) => path.join(dir, `${c.id}.${c.ext || 'png'}`);

  return {
    name: 'local',
    origins: [],
    describe: () => `disque local (${dir})`,

    async put({ id, ext, tmp }) {
      await fsp.rename(tmp, path.join(dir, `${id}.${ext}`));
    },

    async remove(c) {
      await fsp.rm(fileOf(c), { force: true });
    },

    // Gère les requêtes « Range » : indispensable pour lire une vidéo sur iPhone / Safari.
    serve(req, res, c, { headers, mime, filename }) {
      const p = fileOf(c);
      fs.stat(p, (err, st) => {
        if (err) { res.writeHead(404, headers); return res.end('Fichier introuvable'); }
        const h = { ...headers, 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' };
        if (filename) h['Content-Disposition'] = filename;
        let start = 0, end = st.size - 1, status = 200;
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (m && (m[1] || m[2])) {
          if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), st.size - 1); }
          else start = Math.max(0, st.size - Number(m[2]));
          if (start > end || start >= st.size) {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${st.size}` });
            return res.end();
          }
          status = 206;
          h['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        }
        h['Content-Length'] = end - start + 1;
        res.writeHead(status, h);
        if (req.method === 'HEAD' || st.size === 0) return res.end();
        // pipeline() ferme le fichier si le client coupe la connexion, et une erreur de lecture
        // (fichier supprimé entre-temps) ne termine que cette réponse, pas tout le serveur.
        pipeline(fs.createReadStream(p, { start, end }), res, () => {});
      });
    },
  };
};
