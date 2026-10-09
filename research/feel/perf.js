// Effect cost (docs/PROMPT_feel.md 3 principle 12, 9): drives headless Chrome through the DevTools protocol at
// 390x844 with motion on, for both effect settings at 1x and 4x CPU throttling, and measures per move the JS time
// from the input to the end of its handling (state, render, effect start), long tasks (over 50ms), and the most
// effect nodes alive at once. Headless frame times are not used: requestAnimationFrame runs at a fixed ~31ms here.
// Each move's select press comes a frame and 40ms before the timed press, as real taps do (pressed back to back,
// the second press would also pay the layout of the first press's render).
// usage: node research/feel/perf.js   (builds the test pages; writes research/feel/out/perf.json)
// Optional --source=<saved source> compares a baseline without replacing the working source.
// --steady fixes the seed and uses 20 warm-up moves; keep its results separate from the default protocol.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const BASE = path.join(__dirname, '..', '..');
const UIT = path.join(BASE, 'uitest');
const OUT = path.join(__dirname, 'out');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Optional paired steady-state diagnostic; retain the original six-warm-up protocol by default.
const steady = process.argv.includes('--steady');

// runs in the page: 40 quick pours, 10 placements, 5 completions at combo x4 or more
const SEQUENCE = `(async () => {
  const G = () => window.__snapFn().S, $ = id => document.getElementById(id);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tubes = () => document.querySelectorAll('#rack .tube');
  const key = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  const boot = o => { const s = G(); Object.assign(s, { over: false, stuck: null, spare: null, spareOffer: false, flipped: false, pours: 0, turnClears: 0, streak: 0 }, o); window.__boot({ S: s }); };
  ${steady ? "window.__boot({S:newState('endless','bottle-quality-perf-fixed',G().rules)});" : ''}
  const ms = [], kinds = { pour: [], place: [], clear: [] };
  let longTasks = 0, longest = 0, maxFx = 0;
  const po = new PerformanceObserver(l => { for (const e of l.getEntries()) { longTasks++; longest = Math.max(longest, e.duration); } });
  po.observe({ type: 'longtask' });
  const fxNodes = () => $('fxLayer').getElementsByTagName('*').length;
  const sample = setInterval(() => { maxFx = Math.max(maxFx, fxNodes()); }, 20);
  // A move is two presses, the select and the move, with frames between them as with real taps; only the second
  // press (the move: state, render, effect start) is timed. Elements are looked up when pressed: a render rebuilds
  // the bottles.
  const state = () => JSON.stringify([G().bottles, G().turn]);
  const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  let made = 0;
  const move = async (kind, a, b) => {
    key(a()); await frame(); await wait(40);
    const k0 = state(), t0 = performance.now();
    key(b());
    const d = performance.now() - t0;
    if (!kind) return;   // a warm-up move: the page's first moves also compile the code they run
    ms.push(d); kinds[kind].push(d); maxFx = Math.max(maxFx, fxNodes());
    if (state() !== k0) made++;
  };
  boot({ bottles: [[0], [], [1, 1], [2], [3, 3], [2, 1]], piece: [1] }); await wait(300);
  for (let k = 0; k < ${steady ? 20 : 6}; k++) { const a = k % 2 ? 1 : 0; await move(null, () => tubes()[a], () => tubes()[1 - a]); await wait(50); }
  await wait(400);
  for (let k = 0; k < 40; k++) { const a = k % 2 ? 1 : 0; await move('pour', () => tubes()[a], () => tubes()[1 - a]); await wait(50); }
  await wait(600);
  boot({ bottles: [[], [], [], [], [], []], piece: [0, 1], turn: 3 }); await wait(300);
  for (let k = 0; k < 10; k++) {
    const S = G(), i = S.bottles.findIndex(b => S.rules.cap - b.length >= S.piece.length);
    if (i < 0) break;
    await move('place', () => $('cup'), () => tubes()[i]); await wait(120);
  }
  await wait(600);
  for (let k = 0; k < 5; k++) {
    boot({ bottles: [[0, 1, 1], [2, 2], [3, 3, 3], [0, 0, 3], [1, 5], []], piece: [2, 2], streak: 3 + k, turn: 10 + k }); await wait(120);
    await move('clear', () => tubes()[3], () => tubes()[2]); await wait(700);
  }
  await wait(800);
  clearInterval(sample); po.disconnect();
  const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2) : null; };
  const sum = a => ({ n: a.length, p50: q(a, .5), p90: q(a, .9), max: a.length ? +Math.max(...a).toFixed(2) : null });
  return { all: sum(ms), pour: sum(kinds.pour), place: sum(kinds.place), clear: sum(kinds.clear), samples: kinds, protocol: {warmupMoves:${steady ? 20 : 6},seed:${steady ? "'bottle-quality-perf-fixed'" : 'null'}}, made, longTasks, longest: +longest.toFixed(1), maxFx, errors: window.__errors };
})()`;

async function main() {
  execFileSync(process.execPath, [path.join(UIT, 'make.js'), ...process.argv.slice(2).filter(a => a.startsWith('--source='))], { stdio: 'ignore' });
  fs.mkdirSync(OUT, { recursive: true });
  const prof = path.join(UIT, 'prof-perf');
  fs.rmSync(prof, { recursive: true, force: true });
  const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--allow-file-access-from-files', '--hide-scrollbars', '--force-prefers-no-reduced-motion',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=600,900', 'about:blank'], { stdio: 'ignore' });
  const res = {};
  try {
    let list = null;
    for (let i = 0; i < 50 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (e) { /* not up yet */ } }
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0;
    const pending = new Map(), waiters = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      else if (m.method) for (const w of waiters.splice(0)) if (w.method === m.method) w.res(m.params); else waiters.push(w);
    };
    const send = (method, params) => new Promise((r, j) => { const id = ++seq; pending.set(id, m => m.error ? j(new Error(method + ': ' + m.error.message)) : r(m.result)); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const once = method => new Promise(r => waiters.push({ method, res: r }));
    const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text); return r.result.value; };
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    for (const fx of ['base', 'juicy']) {
      for (const rate of [1, 4]) {
        const loaded = once('Page.loadEventFired');
        await send('Page.navigate', { url: 'file:///' + path.join(UIT, 'uitest.html').replace(/\\/g, '/') + `?scenario=manual&fx=${fx}&rfx=0&theme=light` });
        await loaded; await sleep(700);
        await send('Emulation.setCPUThrottlingRate', { rate });
        res[`${fx}_x${rate}`] = await js(SEQUENCE);
        await send('Emulation.setCPUThrottlingRate', { rate: 1 });
      }
    }
    ws.close();
  } finally { chrome.kill(); }
  fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(res, null, 1));
  console.log('| setting | CPU | moves made | move p50 / p90 / max (ms) | pour p90 | place p90 | x4+ completion p90 | long tasks (longest) | effect nodes max |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [k, r] of Object.entries(res)) {
    const [fx, x] = k.split('_');
    console.log(`| ${fx} | ${x} | ${r.made}/${r.all.n} | ${r.all.p50} / ${r.all.p90} / ${r.all.max} | ${r.pour.p90} | ${r.place.p90} | ${r.clear.p90} | ${r.longTasks} (${r.longest}) | ${r.maxFx} |`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
