// Builds uitest.html (the published page wrapped like the artifact skeleton + a test driver) and frame pages.
// Test-only code; never published.
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(BASE, 'water-sort-survival.html'), 'utf8');
const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
<script>
(function () {
  var p = new URLSearchParams(location.search), sc = p.get('scenario') || 'fresh';
  if (p.get('theme')) document.documentElement.setAttribute('data-theme', p.get('theme'));
  try { localStorage.clear(); } catch (e) {}
  var today = (function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  var set = function (k, v) { localStorage.setItem(k, JSON.stringify(v)); };
  set('wsurv.locale', 'ko');
  var V1R = { bottles: 6, cap: 4, startColors: 4, maxColors: 8, colorEvery: 20, pieceMin: 1, pieceMax: 2, preview: 2, pourLimit: 0, autoMerge: false };
  // Historical feature scenarios deliberately keep their v2 rules. Expansion has separate real-input coverage.
  set('wsurv.rules', Object.assign({}, V1R, { comboPlace: true, flip: true, flipLimit: 2, zones: true, zoneBonus: 20, zoneMulMax: 5, zoneTwin: true, zoneTwinSize: 1 }));
  set('wsurv.rules.custom', true);
  if (sc === 'existing' || sc === 'v1saves') set('wsurv.seenHelp', true);
  if (sc === 'v1saves') {
    set('wsurv.game.daily', { v: 1, mode: 'daily', seed: 'daily:' + today, rules: V1R, bottles: [[0], [], [], [], [], []], turn: 1, piece: [1], score: 0, streak: 0, maxStreak: 0, turnClears: 0, clears: 0, turnLog: [], undoLeft: 3, reviveUsed: false, pours: 0, over: false, overReason: '', stuck: null });
    set('wsurv.game.endless', { v: 1, mode: 'endless', seed: 'run:old', rules: V1R, bottles: [[0, 1], [2], [], [], [], []], turn: 2, piece: [3], score: 0, streak: 0, maxStreak: 0, turnClears: 0, clears: 0, turnLog: [0], undoLeft: 3, reviveUsed: false, pours: 0, over: false, overReason: '', stuck: null });
    set('wsurv.best.6-4-4-8-20-1-2-0-0', 777);
    set('wsurv.mode', p.get('mode') || 'endless');
  }
  if (p.get('reduce') === '1') set('wsurv.prefs', { reduceFx: true });
  if (sc === 'themes') { set('wsurv.seenHelp', true); set('wsurv.prefs', { seenV2: true }); set('wsurv.unlock', { runs: 3, sawOver: true, flip: true }); set('wsurv.stars.total', 29); set('wsurv.themes.owned', ['lab']); }
  if (sc === 'legacy') { set('wsurv.seenHelp', true); set('wsurv.prefs', { seenV2: true, skin: 'cafe' }); set('wsurv.unlock', { runs: 3, sawOver: true, flip: true }); set('wsurv.stars.total', 20); }
  if (p.get('skin')) { set('wsurv.seenHelp', true); set('wsurv.prefs', { seenV2: true, skin: p.get('skin'), tryLocked: true }); set('wsurv.unlock', { runs: 3, sawOver: true, flip: true }); }
  // hot.ready hands boot() to the tests (window.__boot({ S })) so a test can re-render after editing the live state
  window.claude = { hot: { snapshot: function (fn) { window.__snapFn = fn; }, ready: function (cb) { window.__boot = cb; cb({}); } } };
  if (sc === 'controls' || sc === 'geom' || sc === 'manual' || sc === 'feel') {
    var pr = { seenV2: true };
    if (p.get('controls')) pr.controls = p.get('controls');
    if (p.get('tray')) pr.tray = p.get('tray');
    // the effects setting, and reduced effects set either way (rfx=1/0) instead of following the system. Scenarios
    // written before the juicy effects became the default (controls, geom, manual: real.js) keep the base effects
    // unless they ask; feel without fx plays the default
    if (p.get('fx')) pr.fx = p.get('fx'); else if (sc !== 'feel') pr.fx = 'base';
    if (p.get('rfx')) pr.reduceFx = p.get('rfx') === '1';
    // case=newuser: a first visit (no help seen yet)
    if (p.get('case') !== 'newuser') set('wsurv.seenHelp', true);
    set('wsurv.prefs', pr); set('wsurv.unlock', { runs: 3, sawOver: true, flip: true });
    if (p.get('rules') === 'max') set('wsurv.rules', { bottles: 7, cap: 5, startColors: 4, maxColors: 8, colorEvery: 20, pieceMin: 1, pieceMax: 3, preview: 2, pourLimit: 0 });
  }
  if (sc === 'firebase') {
    set('wsurv.seenHelp', true); set('wsurv.prefs', { seenV2: true }); set('wsurv.stars.total', 10); set('wsurv.themes.owned', ['lab']);
    set('wsurv.best.6-4-4-8-20-1-2-0-0-c1-f2-z20x5t1', 300);
    // read by mockfb/firebase-firestore.js: another device's save already in the signed-in account, records stored as {k, v} maps
    window.__fbStore = { 'users/g1/devices/dev-other': { v: 1, device: 'dev-other', starsMine: 40, owned: ['lab', 'cafe'], best: [{ k: '6-4-4-8-20-1-2-0-0-c1-f2-z20x5t1', v: 900 }], daily: [], starsDaily: [], unlock: { runs: 4, sawOver: true, flip: true } } };
    window.__fbBlockPopup = 1;
  }
  if (sc === 'cloud') {
    set('wsurv.seenHelp', true); set('wsurv.prefs', { seenV2: true }); set('wsurv.unlock', { runs: 1, sawOver: false, flip: false });
    set('wsurv.stars.total', 10); set('wsurv.themes.owned', ['lab']);
  }
  if (sc === 'cloud' || sc === 'controls' || sc === 'feel') {
    // in-memory stand-in for the viewer's private db subtree, already holding another device's save
    // (controls uses it to push a merge, and so a render, in the middle of a drag)
    var store = { 'dev-other': { v: 1, device: 'dev-other', starsMine: 120, owned: ['lab', 'cafe', 'gem'], best: [['6-4-4-8-20-1-2-0-0-c1-f2-z20x5t1', 5000]], daily: [], starsDaily: [], unlock: { runs: 5, sawOver: true, flip: true } } };
    var listeners = [];
    var snap = function () { return { docs: Object.keys(store).map(function (id) { var d = store[id]; return { id: id, exists: true, data: function () { return JSON.parse(JSON.stringify(d)); } }; }) }; };
    var col = {
      get: function () { return Promise.resolve(snap()); },
      onSnapshot: function (n) { listeners.push(n); setTimeout(function () { n(snap()); }, 0); return function () {}; },
      doc: function (id) { return { set: function (b) { store[id] = JSON.parse(JSON.stringify(b)); setTimeout(function () { listeners.forEach(function (f) { f(snap()); }); }, 0); return Promise.resolve(); } }; },
    };
    window.__cloud = { store: store, push: function (id, body) { store[id] = body; listeners.forEach(function (f) { f(snap()); }); } };
    window.claude.use = function (name) {
      if (name === 'db') return Promise.resolve({ collection: function (p) { window.__colPath = p; return col; } });
      if (name === 'user') return Promise.resolve({ id: function () { return Promise.resolve('u_test'); } });
      return Promise.resolve(null);
    };
  }
  // the scenarios written before tapPlace + low became the default play with the controls of that time, so their
  // checks stay as they were (docs/PROMPT_controls2.md 8); likewise the base effects (docs/PROMPT_feel.md 10.1)
  if (sc !== 'controls' && sc !== 'geom' && sc !== 'manual' && sc !== 'feel') {
    var pv = JSON.parse(localStorage.getItem('wsurv.prefs') || '{}');
    pv.controls = 'classic'; pv.tray = 'top'; pv.fx = 'base';
    set('wsurv.prefs', pv);
  }
  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
})();
</script></head><body>`;
const driver = ['driver.js', 'input.js', 'feel.js'].map(n => fs.readFileSync(path.join(__dirname, n), 'utf8')).join('\n');
// The scenarios below run without Firebase (never the real project); the firebase scenario gets a dummy config
// with the SDK served from mockfb/ (in-memory auth and Firestore).
const CONFIG_RE = /const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/;
if (!CONFIG_RE.test(page)) throw new Error('FIREBASE_CONFIG not found');
fs.writeFileSync(path.join(__dirname, 'uitest.html'), head + page.replace(CONFIG_RE, 'const FIREBASE_CONFIG = null;') + '\n<script>' + driver + '</script></body></html>');
const fbPage = page.replace(CONFIG_RE, "const FIREBASE_CONFIG = { apiKey: 'test', projectId: 'test' };")
  .replace("'https://www.gstatic.com/firebasejs/13.0.0/'", "new URL('mockfb/', location.href).href");
if (fbPage.split('mockfb/').length !== 2 || !fbPage.includes("apiKey: 'test'")) throw new Error('firebase test build did not change');
fs.writeFileSync(path.join(__dirname, 'uitest-fb.html'), head + fbPage + '\n<script>' + driver + '</script></body></html>');
fs.writeFileSync(path.join(__dirname, 'frame-skins.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:flex;gap:12px;background:#888">' + ['lab', 'cafe', 'gem', 'deep'].map(s => '<iframe src="uitest.html?scenario=skin&shots=skin&skin=' + s + '&theme=' + (process.env.THEME || 'light') + '" style="flex:none;width:360px;height:640px;border:0"></iframe>').join('') + '<pre id="out"></pre></body></html>');
for (const sc of ['fresh', 'existing', 'v1saves', 'v1daily', 'shots', 'themes', 'legacy', 'cloud', 'firebase']) {
  const w = sc === 'shots' ? 0 : 360;
  const frames = sc === 'shots'
    ? ['light', 'dark'].map(t => `<iframe src="uitest.html?scenario=existing&shots=1&theme=${t}" style="width:390px;height:900px;border:0;background:#fff"></iframe>`).join('')
    : `<iframe src="${sc === 'firebase' ? 'uitest-fb' : 'uitest'}.html?scenario=${sc === 'v1daily' ? 'v1saves&mode=daily' : sc}" style="width:${w}px;height:900px;border:0"></iframe>`;
  fs.writeFileSync(path.join(__dirname, `frame-${sc}.html`), `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:flex;gap:20px;background:#888">${frames}<pre id="out"></pre>
<script>window.addEventListener('message', function (e) { document.getElementById('out').textContent += JSON.stringify(e.data) + '\\n'; });</script></body></html>`);
}
// One frame page per variant (frame-<sc>~<variant>.html): iframes of one page share localStorage, and the game reads
// its prefs and rules from there, so variants must not share a page. frame-<sc>~<variant>.size is the window size.
for (const f of fs.readdirSync(__dirname)) if (/^frame-(controls|geom|feel)~/.test(f)) fs.rmSync(path.join(__dirname, f));
function framePage(sc, variant, it) {
  fs.writeFileSync(path.join(__dirname, `frame-${sc}~${variant}.html`), `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#888"><iframe src="${it.src}" style="display:block;width:${it.w}px;height:${it.h}px;border:0"></iframe><pre id="out"></pre>
<script>window.addEventListener('message', function (e) { document.getElementById('out').textContent += JSON.stringify(e.data) + '\\n'; });</script></body></html>`);
  fs.writeFileSync(path.join(__dirname, `frame-${sc}~${variant}.size`), `${Math.max(600, it.w + 40)},${it.h + 60}`);
}
// the defaults: no stored scheme or layout (an existing player, and a first visit), and a stored 'low' layout from
// before it was removed
for (const k of ['defaults', 'newuser']) framePage('controls', `case-${k}`, { src: `uitest.html?scenario=controls&case=${k}&pt=touch`, w: 360, h: 900 });
framePage('controls', 'case-low', { src: 'uitest.html?scenario=controls&case=low&tray=low&pt=touch', w: 360, h: 900 });
for (const [c, t] of [['classic', 'top'], ['classic', 'bottom'], ['tapPlace', 'top'], ['tapPlace', 'bottom']]) {
  for (const pt of ['touch', 'mouse']) framePage('controls', `${c}-${t}-${pt}`, { src: `uitest.html?scenario=controls&controls=${c}&tray=${t}&pt=${pt}`, w: 360, h: 900 });
}
const sizes = [[360, 740], [390, 844], [412, 915], [768, 1024]];
for (const tray of ['top', 'bottom']) {
  for (const [w, h] of sizes) framePage('geom', `${tray}-default-${w}x${h}`, { src: `uitest.html?scenario=geom&tray=${tray}&rules=default&size=${w}x${h}`, w, h });
  for (const [w, h] of sizes.slice(0, 2)) framePage('geom', `${tray}-max-${w}x${h}`, { src: `uitest.html?scenario=geom&tray=${tray}&rules=max&size=${w}x${h}`, w, h });
}
// feel (docs/PROMPT_feel.md): both effect settings at 390x844, reduced effects, a first visit, and the juicy
// layout's geometry (the stage and the banner) at the geom sizes
for (const fx of ['base', 'juicy']) {
  for (const pt of ['touch', 'mouse']) framePage('feel', `${fx}-${pt}`, { src: `uitest.html?scenario=feel${fx === 'juicy' ? '&fx=juicy&rfx=0' : '&fx=base'}&pt=${pt}`, w: 390, h: 844 });
}
framePage('feel', 'juicy-rfx-touch', { src: 'uitest.html?scenario=feel&fx=juicy&rfx=1&pt=touch', w: 390, h: 844 });
framePage('feel', 'case-newuser', { src: 'uitest.html?scenario=feel&case=newuser&pt=touch', w: 390, h: 844 });
for (const tray of ['bottom', 'top']) {
  for (const [w, h] of sizes) framePage('feel', `geo-${tray}-default-${w}x${h}`, { src: `uitest.html?scenario=feel&case=geo&fx=juicy&rfx=0&tray=${tray}&rules=default&size=${w}x${h}`, w, h });
  for (const [w, h] of sizes.slice(0, 2)) framePage('feel', `geo-${tray}-max-${w}x${h}`, { src: `uitest.html?scenario=feel&case=geo&fx=juicy&rfx=0&tray=${tray}&rules=max&size=${w}x${h}`, w, h });
}
console.log('built');
