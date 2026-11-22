import { serverConf, saveServerConf, DEFAULT_SERVER, api, toast } from './common.js';

const $ = (id) => document.getElementById(id);
const conf = serverConf();
$('url').value = conf.url;
$('key').value = conf.key;

function status(msg, ok) {
  $('status').textContent = msg;
  $('status').className = 'notice ' + (ok ? 'ok' : 'bad');
  $('status').hidden = false;
}

function originOf(v) {
  const u = new URL(v.trim());
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocole');
  // http n'est accepté que pour ce Mac ou le réseau local ; ailleurs on exige https.
  const local = ['localhost', '127.0.0.1'].includes(u.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(u.hostname) || u.hostname.endsWith('.local');
  if (u.protocol === 'http:' && !local) throw new Error('https');
  return u.origin;
}

// Retire l'autorisation de l'ancien serveur (sauf celui de ce Mac, inclus dans l'extension).
async function dropOld(oldUrl, newUrl) {
  if (oldUrl === newUrl || oldUrl === DEFAULT_SERVER) return;
  await chrome.permissions.remove({ origins: [`${oldUrl}/*`] }).catch(() => {});
}

async function test() {
  try {
    const h = await (await api('/api/health', { signal: AbortSignal.timeout(5000) })).json();
    if (h.app !== 'localshot') return status('Ce serveur ne semble pas être LocalShot.', false);
    const r = await api('/api/captures', { signal: AbortSignal.timeout(5000) });
    if (r.ok) return status(`Connecté ✓ ${(await r.json()).length} élément(s) partagé(s) sur ce serveur.`, true);
    if (r.status === 401) return status('Serveur joignable, mais la clé d\'accès est incorrecte.', false);
    return status('Serveur joignable, mais il refuse l\'accès depuis ce Mac (clé requise ?).', false);
  } catch {
    status('Serveur injoignable. Vérifiez l\'adresse et que Tailscale est connecté sur ce Mac.', false);
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  let origin;
  try { origin = originOf($('url').value); }
  catch (err) { return status(err.message === 'https' ? 'Utilisez une adresse en https:// (http n\'est accepté que sur le réseau local).' : 'Adresse invalide.', false); }
  if (origin !== DEFAULT_SERVER) {
    // Doit être appelé directement dans le clic (geste utilisateur).
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
    if (!granted) return status('Autorisation refusée : LocalShot ne peut pas joindre ce serveur.', false);
  }
  const old = serverConf().url;
  saveServerConf({ url: origin, key: $('key').value.trim() });
  $('url').value = origin;
  await dropOld(old, origin);
  toast('Réglages enregistrés');
  await test();
});

$('reset').addEventListener('click', async () => {
  const old = serverConf().url;
  saveServerConf({ url: DEFAULT_SERVER, key: '' });
  await dropOld(old, DEFAULT_SERVER);
  $('url').value = DEFAULT_SERVER;
  $('key').value = '';
  toast('Serveur de ce Mac');
  await test();
});

if (conf.url !== DEFAULT_SERVER || conf.key) test();
