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
  var V1R = { bottles: 6, cap: 4, startColors: 4, maxColors: 8, colorEvery: 20, pieceMin: 1, pieceMax: 2, preview: 2, pourLimit: 0, autoMerge: false };
  if (sc === 'existing' || sc === 'v1saves') set('wsurv.seenHelp', true);
  if (sc === 'v1saves') {
    set('wsurv.game.daily', { v: 1, mode: 'daily', seed: 'daily:' + today, rules: V1R, bottles: [[0], [], [], [], [], []], turn: 1, piece: [1], score: 0, streak: 0, maxStreak: 0, turnClears: 0, clears: 0, turnLog: [], undoLeft: 3, reviveUsed: false, pours: 0, over: false, overReason: '', stuck: null });
    set('wsurv.game.endless', { v: 1, mode: 'endless', seed: 'run:old', rules: V1R, bottles: [[0, 1], [2], [], [], [], []], turn: 2, piece: [3], score: 0, streak: 0, maxStreak: 0, turnClears: 0, clears: 0, turnLog: [0], undoLeft: 3, reviveUsed: false, pours: 0, over: false, overReason: '', stuck: null });
    set('wsurv.best.6-4-4-8-20-1-2-0-0', 777);
    set('wsurv.mode', p.get('mode') || 'endless');
  }
  if (p.get('reduce') === '1') set('wsurv.prefs', { reduceFx: true });
  if (sc === 'themes') { set('wsurv.seenHelp', true); set('wsurv.prefs', { seenV2: true }); set('wsurv.unlock', { runs: 3, sawOver: true, flip: true }); set('wsurv.stars.total', 29); }
  if (p.get('skin')) { set('wsurv.seenHelp', true); set('wsurv.prefs', { seenV2: true, skin: p.get('skin'), tryLocked: true }); set('wsurv.unlock', { runs: 3, sawOver: true, flip: true }); }
  window.claude = { hot: { snapshot: function (fn) { window.__snapFn = fn; } } };
  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
})();
</script></head><body>`;
const driver = fs.readFileSync(path.join(__dirname, 'driver.js'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'uitest.html'), head + page + '\n<script>' + driver + '</script></body></html>');
fs.writeFileSync(path.join(__dirname, 'frame-skins.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:flex;gap:12px;background:#888">' + ['lab', 'cafe', 'gem', 'deep'].map(s => '<iframe src="uitest.html?scenario=skin&shots=skin&skin=' + s + '&theme=' + (process.env.THEME || 'light') + '" style="flex:none;width:360px;height:640px;border:0"></iframe>').join('') + '<pre id="out"></pre></body></html>');
for (const sc of ['fresh', 'existing', 'v1saves', 'v1daily', 'shots', 'themes']) {
  const w = sc === 'shots' ? 0 : 360;
  const frames = sc === 'shots'
    ? ['light', 'dark'].map(t => `<iframe src="uitest.html?scenario=existing&shots=1&theme=${t}" style="width:390px;height:900px;border:0;background:#fff"></iframe>`).join('')
    : `<iframe src="uitest.html?scenario=${sc === 'v1daily' ? 'v1saves&mode=daily' : sc}" style="width:${w}px;height:900px;border:0"></iframe>`;
  fs.writeFileSync(path.join(__dirname, `frame-${sc}.html`), `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:flex;gap:20px;background:#888">${frames}<pre id="out"></pre>
<script>window.addEventListener('message', function (e) { document.getElementById('out').textContent += JSON.stringify(e.data) + '\\n'; });</script></body></html>`);
}
console.log('built');
