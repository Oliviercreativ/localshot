// Partage chiffré de bout en bout (AES-GCM 256 bits, Web Crypto).
// La clé ne quitte jamais l'appareil : elle voyage dans le lien, après le « # », que les navigateurs n'envoient pas au serveur.
// Le serveur ne stocke qu'un bloc illisible ; même le titre est chiffré.
// Copie identique dans extension/ui/ et server/public/ (vérifié par npm test).
//
// Format : "LSENC1" (6 octets) | IV (12 octets) | AES-GCM( longueur méta (4 octets) | méta JSON | fichier )
export const E2E_MIME = 'application/vnd.localshot.enc';
const MAGIC = new TextEncoder().encode('LSENC1');

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));

/** Chiffre un fichier et ses informations. Renvoie { blob, key } (key = texte à mettre dans le lien). */
export async function encryptCapture(file, meta) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, metaBytes.length);
  const plain = await new Blob([len, metaBytes, file]).arrayBuffer();
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { blob: new Blob([MAGIC, iv, cipher], { type: E2E_MIME }), key: b64u(await crypto.subtle.exportKey('raw', key)) };
}

/** Déchiffre : renvoie { meta, blob } ou lève une erreur si la clé est fausse ou le fichier abîmé. */
export async function decryptCapture(buf, keyText) {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 34 || new TextDecoder().decode(bytes.subarray(0, 6)) !== 'LSENC1') throw new Error('format inconnu');
  const key = await crypto.subtle.importKey('raw', unb64u(keyText), 'AES-GCM', false, ['decrypt']);
  let plain;
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(6, 18) }, key, bytes.subarray(18))); }
  catch { throw new Error('clé incorrecte ou fichier modifié'); }
  const n = new DataView(plain.buffer, plain.byteOffset).getUint32(0);
  const meta = JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + n)));
  const type = ['image/png', 'video/mp4', 'video/webm'].includes(meta.mime) ? meta.mime : 'application/octet-stream';
  return { meta, blob: new Blob([plain.subarray(4 + n)], { type }) };
}

/** Clé lue dans le lien (#k=…). */
export const keyFromHash = (hash) => new URLSearchParams(String(hash).replace(/^#/, '')).get('k') || '';
