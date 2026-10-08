// test stand-in for the Firestore module: an in-memory store keyed by path
const store = window.__fbStore = window.__fbStore || {};
const listeners = [];
export function getFirestore() { return {}; }
export function collection(db, ...segs) { return { path: segs.join('/') }; }
export function doc(col, id) { return { path: col.path + '/' + id, col }; }
const snap = col => ({ docs: Object.keys(store).filter(p => p.startsWith(col.path + '/')).map(p => ({ id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(store[p])) })) });
export async function getDocs(col) { return snap(col); }
export async function setDoc(ref, body) { store[ref.path] = JSON.parse(JSON.stringify(body)); setTimeout(() => listeners.forEach(l => l.next(snap(l.col))), 0); }
export function onSnapshot(col, next, error) { const l = { col, next }; listeners.push(l); setTimeout(() => next(snap(col)), 0); return () => { listeners.splice(listeners.indexOf(l), 1); }; }
