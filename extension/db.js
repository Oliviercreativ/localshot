// Stockage des captures dans IndexedDB, à l'intérieur de l'extension (rien ne sort du navigateur).
const DB = 'localshot';
const STORE = 'captures';
let dbp;

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

function db() {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = undefined; rej(r.error); };
  }));
}

async function store(mode) {
  return (await db()).transaction(STORE, mode).objectStore(STORE);
}

export function newId() {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
}

export const addCapture = async (rec) => req((await store('readwrite')).add(rec));
export const getCapture = async (id) => req((await store('readonly')).get(id));
export const deleteCapture = async (id) => req((await store('readwrite')).delete(id));
export async function listCaptures() {
  const all = await req((await store('readonly')).getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function updateCapture(id, patch) {
  const s = await store('readwrite');
  const rec = await req(s.get(id));
  if (!rec) throw new Error('Capture introuvable');
  Object.assign(rec, patch);
  await req(s.put(rec));
  return rec;
}
