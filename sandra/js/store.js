// Everything lives in Sandra's own browser: progress in localStorage, files and cards in IndexedDB.
const LS_KEY = "sandra.station.v1";

const defaults = () => ({
  profile: { name: "Sandra", nclexDate: "", gradDate: "", dailyGoal: 60 },
  xp: 0,
  days: {},          // "2026-11-27": { xp, cards, q, games }
  qstats: {},        // category index: { right, total }
  best: {},          // game id: best score
  pins: {},          // pin id: ISO date earned
  sound: true,
  welcomed: false,
});

function read() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return deepMerge(defaults(), JSON.parse(raw)); } catch {}
  return defaults();
}
function deepMerge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") a[k] = deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

export const state = read();
export function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }
export function resetState(obj) { const d = obj ? deepMerge(defaults(), obj) : defaults(); for (const k of Object.keys(state)) delete state[k]; Object.assign(state, d); save(); }

export const todayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export function today() { return (state.days[todayKey()] ||= { xp: 0, cards: 0, q: 0, games: 0 }); }

export function streak() {
  let n = 0; const d = new Date();
  if (!state.days[todayKey(d)]?.xp) d.setDate(d.getDate() - 1); // today not started yet doesn't break it
  while (state.days[todayKey(d)]?.xp > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------------- IndexedDB ---------------- */
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open("sandra-station", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("files", { keyPath: "id" });
      const c = d.createObjectStore("cards", { keyPath: "id" });
      c.createIndex("deck", "deck");
      d.createObjectStore("decks", { keyPath: "id" });
      d.createObjectStore("kv");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store);
    let out; const r = fn(s); if (r) r.onsuccess = () => (out = r.result);
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
export const idb = {
  all: (store) => tx(store, "readonly", (s) => s.getAll()),
  get: (store, key) => tx(store, "readonly", (s) => s.get(key)),
  put: (store, val, key) => tx(store, "readwrite", (s) => (key === undefined ? s.put(val) : s.put(val, key))),
  del: (store, key) => tx(store, "readwrite", (s) => s.delete(key)),
  putMany: (store, vals) => tx(store, "readwrite", (s) => { vals.forEach((v) => s.put(v)); }),
  clear: (store) => tx(store, "readwrite", (s) => s.clear()),
  byDeck: (deck) => tx("cards", "readonly", (s) => s.index("deck").getAll(deck)),
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Ask the browser not to evict Sandra's data under storage pressure.
export function persist() { try { navigator.storage?.persist?.(); } catch {} }

/* ---------------- Backup ---------------- */
const blobToB64 = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
export async function exportBackup() {
  const files = await idb.all("files");
  for (const f of files) if (f.blob) { f.blob = await blobToB64(f.blob); }
  const kv = { photo: await idb.get("kv", "photo").then((p) => (p ? blobToB64(p) : null)) };
  return { app: "sandra-station", v: 1, at: new Date().toISOString(), state, decks: await idb.all("decks"), cards: await idb.all("cards"), files, kv };
}
export async function importBackup(data) {
  if (data?.app !== "sandra-station") throw new Error("That file isn't a Station backup.");
  for (const s of ["files", "cards", "decks"]) await idb.clear(s);
  for (const f of data.files || []) if (typeof f.blob === "string") f.blob = await (await fetch(f.blob)).blob();
  await idb.putMany("decks", data.decks || []);
  await idb.putMany("cards", data.cards || []);
  await idb.putMany("files", data.files || []);
  if (data.kv?.photo) await idb.put("kv", await (await fetch(data.kv.photo)).blob(), "photo");
  resetState(data.state);
}
