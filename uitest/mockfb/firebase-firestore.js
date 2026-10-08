// test stand-in for the Firestore module: an in-memory store keyed by path
const store = window.__fbStore = window.__fbStore || {};
const listeners = [];
export function getFirestore() { return {}; }
export function collection(db, ...segs) { return { path: segs.join('/') }; }
export function doc(col, id) { return { path: col.path + '/' + id, col }; }
const snap = (col, fromCache) => ({ metadata: { fromCache: !!fromCache }, docs: fromCache ? [] : Object.keys(store).filter(p => p.startsWith(col.path + '/')).map(p => ({ id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(store[p])) })) });
export async function getDocs(col) { return snap(col); }
export const getDocsFromServer = getDocs;
// like Firestore: an array directly inside an array is rejected
const nested = v => Array.isArray(v) ? v.some(x => Array.isArray(x) || nested(x)) : !!v && typeof v === 'object' && Object.values(v).some(nested);
export async function setDoc(ref, body) {
  if (nested(body)) throw Object.assign(new Error('Nested arrays are not supported'), { code: 'invalid-argument' });
  store[ref.path] = JSON.parse(JSON.stringify(body));
  setTimeout(() => listeners.forEach(l => l.next(snap(l.col))), 0);
}
// onSnapshot(col, next, error) or onSnapshot(col, { includeMetadataChanges }, next, error); with metadata changes the
// empty local cache arrives first, like a fresh page
export function onSnapshot(col, ...args) {
  const opts = typeof args[0] === 'object' ? args.shift() : {}, next = args[0];
  const l = { col, next }; listeners.push(l);
  if (opts.includeMetadataChanges) setTimeout(() => next(snap(col, true)), 0);
  setTimeout(() => next(snap(col)), 5);
  return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
}
