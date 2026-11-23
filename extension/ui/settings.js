import { serverConf, saveServerConf, api, toast } from './common.js';
import { PROVIDERS, transcribeConf, saveTranscribeConf } from './transcribe.js';
import { saveConf, setSaveConf, cleanSub, pickFolder, canPickFolder, folderAccess } from './savefolder.js';

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

// Retire l'autorisation de l'ancien serveur.
async function dropOld(oldUrl, newUrl) {
  if (!oldUrl || oldUrl === newUrl) return;
  await chrome.permissions.remove({ origins: [`${oldUrl}/*`] }).catch(() => {});
}

async function test() {
  try {
    const h = await (await api('/api/health', { signal: AbortSignal.timeout(5000) })).json();
    if (h.app !== 'localshot') return status('Ce serveur ne semble pas être LocalShot.', false);
    const r = await api('/api/captures', { signal: AbortSignal.timeout(5000) });
    if (r.ok) return status(`Connecté ✓ ${(await r.json()).length} élément(s) partagé(s) sur ce serveur.`, true);
    if (r.status === 401) return status('Serveur joignable, mais la clé d\'accès est incorrecte.', false);
    return status('Serveur joignable, mais il refuse l\'accès (clé requise ?).', false);
  } catch {
    status('Serveur injoignable. Vérifiez l\'adresse et que Tailscale est connecté sur ce Mac.', false);
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  let origin;
  try { origin = originOf($('url').value); }
  catch (err) { return status(err.message === 'https' ? 'Utilisez une adresse en https:// (http n\'est accepté que sur le réseau local).' : 'Adresse invalide.', false); }
  // Doit être appelé directement dans le clic (geste utilisateur).
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
  if (!granted) return status('Autorisation refusée : LocalShot ne peut pas joindre ce serveur.', false);
  const old = serverConf().url;
  saveServerConf({ url: origin, key: $('key').value.trim() });
  $('url').value = origin;
  await dropOld(old, origin);
  toast('Réglages enregistrés');
  await test();
});

$('reset').addEventListener('click', async () => {
  const old = serverConf().url;
  saveServerConf({ url: '', key: '' });
  await dropOld(old, '');
  $('url').value = '';
  $('key').value = '';
  $('status').hidden = true;
  toast('Serveur oublié : plus aucun partage possible');
});

if (conf.url) test();

// ---------- Dossier de sauvegarde ----------
async function showSave() {
  const c = saveConf();
  for (const r of document.querySelectorAll('[name=saveMode]')) r.checked = r.value === c.mode;
  $('sub').value = c.sub;
  $('auto').checked = c.auto;
  $('folderName').textContent = c.folderName ? `: « ${c.folderName} »` : '';
  const where = c.mode === 'folder' && c.folderName ? `le dossier « ${c.folderName} »` : `Téléchargements${c.sub ? '/' + c.sub : ''}`;
  let msg = `Les fichiers seront enregistrés dans ${where}.`;
  if (c.mode === 'folder' && (await folderAccess()) === 'prompt') msg += ' Chrome redemandera l\'autorisation au prochain enregistrement (après un redémarrage, par exemple).';
  $('saveStatus').textContent = msg;
}
if (!canPickFolder()) { $('pick').disabled = true; $('folderName').textContent = '(non disponible dans ce navigateur)'; }
for (const r of document.querySelectorAll('[name=saveMode]')) {
  r.addEventListener('change', async () => {
    if (r.value === 'folder' && !saveConf().folderName) {
      if (!(await pickFolder())) { toast('Aucun dossier choisi'); return showSave(); }
    }
    setSaveConf({ mode: r.value });
    showSave();
  });
}
$('pick').addEventListener('click', async (e) => {
  e.preventDefault();
  const name = await pickFolder();
  if (name) toast(`Dossier « ${name} » choisi`);
  showSave();
});
$('sub').addEventListener('change', () => { setSaveConf({ sub: cleanSub($('sub').value) }); showSave(); });
$('auto').addEventListener('change', () => { setSaveConf({ auto: $('auto').checked }); showSave(); });
showSave();

// ---------- Sous-titres automatiques ----------
const trSel = $('trProvider');
for (const [k, p] of Object.entries(PROVIDERS)) trSel.append(Object.assign(document.createElement('option'), { value: k, textContent: p.label }));
function showTr(fromSelect) {
  const saved = transcribeConf();
  const k = fromSelect ? trSel.value : saved.provider;
  trSel.value = k;
  $('trFields').hidden = !k;
  if (!k) return;
  const p = PROVIDERS[k];
  const same = k === saved.provider;
  $('trUrl').value = same ? saved.url : p.url;
  $('trModel').value = same ? saved.model : p.model;
  $('trKey').value = same ? saved.key : '';
  $('trLang').value = same ? saved.language : '';
  $('trUrl').closest('#trFields').querySelector('[for=trKey]').hidden = $('trKey').hidden = !p.key;
  $('trUrl').readOnly = k !== 'local';
  $('trStatus').textContent = k === 'local'
    ? 'Exemple : « docker run -p 8000:8000 ghcr.io/speaches-ai/speaches » sur votre Mac ou votre serveur, puis http://localhost:8000/v1/audio/transcriptions.'
    : `Le son des vidéos que vous transcrivez sera envoyé à ${p.label.split(' — ')[0]}, selon ses conditions d'utilisation.`;
}
trSel.addEventListener('change', () => showTr(true));
$('trForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const k = trSel.value;
  const old = transcribeConf();
  if (!k) {
    saveTranscribeConf({});
    if (old.url) await chrome.permissions.remove({ origins: [`${new URL(old.url).origin}/*`] }).catch(() => {});
    toast('Sous-titres désactivés');
    return showTr();
  }
  let url;
  try { url = new URL($('trUrl').value.trim()); if (!['http:', 'https:'].includes(url.protocol)) throw 0; }
  catch { return toast('Adresse de l\'API invalide', 'error'); }
  if (PROVIDERS[k].key && !$('trKey').value.trim()) return toast('Clé API manquante', 'error');
  // Autorisation réseau pour cette seule adresse (demandée dans le clic).
  const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] }).catch(() => false);
  if (!granted) return toast('Autorisation refusée : LocalShot ne pourra pas joindre ce service', 'error');
  if (old.url && new URL(old.url).origin !== url.origin && new URL(old.url).origin !== new URL(serverConf().url || 'http://x').origin) {
    await chrome.permissions.remove({ origins: [`${new URL(old.url).origin}/*`] }).catch(() => {});
  }
  saveTranscribeConf({ provider: k, url: url.href, model: $('trModel').value.trim() || PROVIDERS[k].model, key: $('trKey').value.trim(), language: $('trLang').value.trim().toLowerCase() });
  toast('Service de transcription enregistré');
  showTr();
});
showTr();
