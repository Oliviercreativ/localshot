'use strict';
/**
 * Choix du stockage des fichiers partagés (STORAGE=local | s3).
 * Le disque local reste toujours lisible : les partages faits avant un changement de stockage continuent de fonctionner.
 * La liste des partages (index.json) reste sur le serveur, dans LOCALSHOT_DATA.
 */
const createLocal = require('./local');
const createS3 = require('./s3');

module.exports = function createStorage({ env, capsDir }) {
  const local = createLocal({ dir: capsDir });
  const drivers = { local };
  const kind = (env.STORAGE || 'local').toLowerCase();
  if (kind === 's3') drivers.s3 = createS3(env);
  else if (kind !== 'local') throw new Error(`STORAGE inconnu : « ${kind} » (valeurs possibles : local, s3)`);
  return { current: drivers[kind], drivers, of: (c) => drivers[c.storage || 'local'] };
};
