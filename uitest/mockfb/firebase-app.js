// test stand-in for the Firebase app module (same export names as the real SDK)
export function initializeApp(config) { window.__fbConfig = config; return { config }; }
