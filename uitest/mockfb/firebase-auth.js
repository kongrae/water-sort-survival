// test stand-in for the Firebase auth module
const auth = { currentUser: null, listeners: [] };
export function getAuth() { return auth; }
export class GoogleAuthProvider {}
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(a.currentUser), 0); return () => {}; }
export async function signInWithPopup(a) { a.currentUser = { uid: 'g1', email: 'player@example.com' }; window.__fbSignIns = (window.__fbSignIns || 0) + 1; return { user: a.currentUser }; }
export async function signInWithRedirect() { throw new Error('not expected in test'); }
export async function signOut(a) { a.currentUser = null; }
