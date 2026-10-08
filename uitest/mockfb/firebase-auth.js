// test stand-in for the Firebase auth module
// window.__fbBlockPopup = n: the next n popups fail as blocked; window.__fbNextUser: the account the next popup signs in
const auth = { currentUser: null, authStateReady: () => Promise.resolve() };
export function getAuth() { return auth; }
export class GoogleAuthProvider { setCustomParameters(p) { this.params = p; } }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(a.currentUser), 0); return () => {}; }
export async function signInWithPopup(a, provider) {
  if (window.__fbBlockPopup > 0) { window.__fbBlockPopup--; throw Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' }); }
  a.currentUser = window.__fbNextUser || { uid: 'g1', email: 'player@example.com' };
  window.__fbSignIns = (window.__fbSignIns || 0) + 1;
  window.__fbPrompt = provider && provider.params && provider.params.prompt;
  return { user: a.currentUser };
}
export async function signOut(a) { a.currentUser = null; }
