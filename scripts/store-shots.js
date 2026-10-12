// Play store phone screenshots (1080x1920, 9:16) of the Android app build (www/index.html, run `npm run build:app` first).
// Board states come from the 2-pour bot playing the real engine (bot2.js), so every screen is a reachable game.
// usage: node scripts/store-shots.js   -> store/screenshots/*.png   (Chrome headless; CHROME overrides the path)
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const { E } = require('../harness.js');
const { runBot2 } = require('../bot2.js');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'store/screenshots');
const pause = ms => new Promise(r => setTimeout(r, ms));
const W = 360, H = 640, DPR = 3;
const BEST = 18420;
// [file, bot seed, turns, skin, overlay]
const SHOTS = [
  ['1-endless', 'shot-d', 20, 'lab', null],
  ['2-combo', 'shot-b', 60, 'lab', null],
  ['3-expanded', 'shot-b', 120, 'cafe', null],
  ['4-gem', 'shot-a', 60, 'gem', null],
  ['5-themes', 'shot-d', 60, 'deep', 'themes'],
  ['6-help', 'shot-c', 20, 'lab', 'help'],
];
function state(seed, turns) {
  const S = runBot2(E.ENDLESS_RULES, seed, turns);
  delete S.botStats;
  Object.assign(S, { bestAtStart: BEST, newBestShown: true, rescueAds: 0, cum: [] });
  if (!E.validFeatureState(S)) throw Error('invalid bot state ' + seed);
  return S;
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const bestKey = 'wsurv.best.' + E.rulesSig(E.sanitizeRules(E.ENDLESS_RULES));
  const init = `<script>
    localStorage.clear();
    localStorage.setItem('wsurv.locale', JSON.stringify('ko'));
    localStorage.setItem('wsurv.seenHelp', 'true');
    localStorage.setItem('wsurv.themes.owned', '["lab","cafe","gem","deep"]');
    localStorage.setItem('wsurv.stars.total', '520');
    localStorage.setItem(${JSON.stringify(bestKey)}, '${BEST}');
    localStorage.setItem('wsurv.prefs', JSON.stringify({ seenV2: true, seenCoach: true, staged: false, sound: false, vibrate: false, skin: new URLSearchParams(location.search).get('skin') || 'lab' }));
    window.claude = { hot: { snapshot: fn => {}, ready: fn => { window.__boot = fn; } } };
  </script>`;
  const page = fs.readFileSync(path.join(BASE, 'www/index.html'), 'utf8').replace('<body>', '<body>' + init);
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const profile = path.join(require('os').tmpdir(), 'botris-shots-' + Date.now()), activePort = path.join(profile, 'DevToolsActivePort');
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--no-first-run', '--hide-scrollbars', '--force-prefers-no-reduced-motion', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    for (let i = 0; i < 100 && !fs.existsSync(activePort); i++) await pause(100);
    const port = Number(fs.readFileSync(activePort, 'utf8').split('\n')[0]);
    let tabs; for (let i = 0; i < 80 && !tabs?.some(t => t.type === 'page'); i++) { await pause(100); try { tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch {} }
    ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0; const pending = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, m => m.error ? j(Error(m.error.message)) : r(m.result)); ws.send(JSON.stringify({ id, method, params })); });
    const js = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const [name, seed, turns, skin, overlay] of SHOTS) {
      await send('Page.navigate', { url: url + '?skin=' + skin });
      for (let i = 0; i < 200 && !(await js('typeof window.__boot === "function" && document.readyState === "complete"')); i++) await pause(25);
      await js('document.fonts.ready.then(() => true)');
      await js(`window.__boot({ S: ${JSON.stringify(state(seed, turns))} }), true`);
      await pause(400);
      if (overlay === 'themes') await js(`document.getElementById('btnThemes').click(), true`);
      if (overlay === 'help') await js(`document.getElementById('btnHelp').click(), true`);
      await pause(900);
      const errors = await js(`[...document.querySelectorAll('.overlay:not([hidden])')].map(o => o.id).join(',')`);
      const s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
      console.log(name, 'overlays:', errors || '-');
    }
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill(); server.close();
    await pause(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
