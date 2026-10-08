// Real-input checks (test-only): drives headless Chrome through the DevTools protocol with trusted touch and mouse
// input (Input.dispatchTouchEvent / Input.dispatchMouseEvent). Chrome itself then makes the clicks, applies
// touch-action and pointer capture and recognises long presses, which the synthetic events in input.js only imitate.
// usage: node uitest/real.js      (builds the pages, prints one line per check)
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const DIR = __dirname;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  execFileSync(process.execPath, [path.join(DIR, 'make.js')], { stdio: 'ignore' });
  const prof = path.join(DIR, 'prof-real');
  fs.rmSync(prof, { recursive: true, force: true });
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=600,900', 'about:blank'], { stdio: 'ignore' });
  let fails = 0, total = 0;
  try {
    let list = null;
    for (let i = 0; i < 50 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (e) { /* not up yet */ } }
    const target = list.find(t => t.type === 'page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let seq = 0;
    const pending = new Map(), waiters = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      else if (m.method) for (const w of waiters.splice(0)) if (w.method === m.method) w.res(m.params); else waiters.push(w);
    };
    const send = (method, params) => new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
    const once = method => new Promise(res => waiters.push({ method, res }));
    const js = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable');

    for (const v of [
      { controls: 'classic', tray: 'top', input: 'touch' }, { controls: 'classic', tray: 'top', input: 'mouse' },
      { controls: 'tapPlace', tray: 'top', input: 'touch' }, { controls: 'tapPlace', tray: 'top', input: 'mouse' },
      { controls: 'classic', tray: 'bottom', input: 'touch' }, { controls: 'classic', tray: 'bottom', input: 'mouse' },
      { controls: 'tapPlace', tray: 'bottom', input: 'touch' },
      // docs/PROMPT_feel.md: the juicy effects (reduced effects off) with real input
      { controls: 'classic', tray: 'bottom', input: 'touch', fx: 'juicy' }, { controls: 'classic', tray: 'bottom', input: 'mouse', fx: 'juicy' },
    ]) {
      const touchIn = v.input === 'touch';
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: touchIn });
      await send('Emulation.setTouchEmulationEnabled', { enabled: touchIn, maxTouchPoints: 5 });
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url: 'file:///' + path.join(DIR, 'uitest.html').replace(/\\/g, '/') + `?scenario=manual&controls=${v.controls}&tray=${v.tray}${v.fx ? `&fx=${v.fx}&rfx=0` : ''}` });
      await loaded; await sleep(600);
      await js(`window.addEventListener('contextmenu', e => { window.__cm = (window.__cm || 0) + 1; window.__cmPrevented = e.defaultPrevented; }); true`);
      const tag = `[${v.controls}/${v.tray}/${v.input}${v.fx ? '/' + v.fx : ''}]`;
      const ck = (name, cond, detail) => { total++; if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${tag} ${name}${!cond && detail !== undefined ? ' :: ' + detail : ''}`); };
      const B = '[[0,1],[1,1,2],[2],[3,3,3],[0,0,1,2],[]]';
      const setup = async (bottles, piece) => {
        await js(`(async () => { const s = window.__snapFn().S; Object.assign(s, { bottles: ${bottles || B}, piece: ${piece || '[2]'}, over: false, stuck: null, spare: null, spareOffer: false, flipped: false, pours: 0, turnClears: 0, streak: 0 }); window.__boot({ S: s }); await new Promise(r => setTimeout(r, 150)); return true; })()`);
        await sleep(200);
      };
      const state = () => js(`(() => { const s = window.__snapFn().S; return { turn: s.turn, bottles: JSON.stringify(s.bottles), cupSel: document.getElementById('cup').classList.contains('sel'), sel: [...document.querySelectorAll('#rack .tube')].findIndex(t => t.classList.contains('sel')), status: document.getElementById('status').textContent, ghosts: document.querySelectorAll('.ghost').length }; })()`);
      const pos = () => js(`(() => { const c = e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }; const t = [...document.querySelectorAll('#rack .tube')]; const g = (a, b) => { const ra = t[a].getBoundingClientRect(), rb = t[b].getBoundingClientRect(); return [(ra.right + rb.left) / 2, (ra.top + ra.bottom) / 2]; }; return { cup: c(document.getElementById('cup')), tubes: t.map(c), gap23: g(2, 3), status: c(document.getElementById('status')) }; })()`);
      // input primitives
      const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id || 0, radiusX: 8, radiusY: 8, force: 1 })) });
      const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons: buttons || 0, clickCount: 1 });
      const down = async (x, y) => touchIn ? touch('touchStart', [[x, y]]) : mouse('mousePressed', x, y, 1);
      const moveTo = async (x0, y0, x1, y1) => { for (let i = 1; i <= 10; i++) { const x = x0 + (x1 - x0) * i / 10, y = y0 + (y1 - y0) * i / 10; if (touchIn) await touch('touchMove', [[x, y]]); else await mouse('mouseMoved', x, y, 1); await sleep(16); } };
      const up = async (x, y) => { if (touchIn) await touch('touchEnd', []); else await mouse('mouseReleased', x, y, 0); await sleep(450); };
      const tap = async ([x, y], hold) => { await down(x, y); await sleep(hold || 60); await up(x, y); };
      const drag = async ([x0, y0], [x1, y1]) => { await down(x0, y0); await sleep(40); await moveTo(x0, y0, x1, y1); await up(x1, y1); };

      let p, s0, s;
      if (v.controls === 'classic') {
        await setup(); p = await pos(); s0 = await state();
        await tap(p.cup); s = await state();
        ck('cup tap selects the piece', s.cupSel, JSON.stringify(s));
        await tap(p.tubes[2]); s = await state();
        ck('then a bottle tap places once', s.turn === s0.turn + 1 && s.bottles === '[[0,1],[1,1,2],[2,2],[3,3,3],[0,0,1,2],[]]', JSON.stringify(s));
        await setup(); p = await pos(); s0 = await state();
        if (v.tray === 'bottom') {
          // dragged up from the tray under the bottles: the drop is judged at the ghost drawn above the finger
          await down(...p.cup); await sleep(40); await moveTo(...p.cup, ...p.tubes[2]);
          const gr = await js(`(() => { const r = document.querySelector('.ghost').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
          const fx = p.tubes[2][0] - (gr[0] - p.tubes[2][0]), fy = p.tubes[2][1] - (gr[1] - p.tubes[2][1]);
          await moveTo(...p.tubes[2], fx, fy); await up(fx, fy);
        } else await drag(p.cup, p.tubes[2]);
        s = await state();
        ck('dragging the piece onto a bottle places once', s.turn === s0.turn + 1 && s.bottles.startsWith('[[0,1],[1,1,2],[2,2]'), JSON.stringify(s));
        ck('no ghost left after the drop', s.ghosts === 0, s.ghosts);
        await setup(); p = await pos(); s0 = await state();
        await tap(p.cup); await tap(p.gap23); s = await state();
        ck('a tap in the gap between bottles places in a neighbour', s.turn === s0.turn + 1, JSON.stringify(s));
        await setup(); p = await pos();
        await tap(p.tubes[0]); s = await state();
        ck('bottle tap selects a pour source', s.sel === 0, JSON.stringify(s));
        await tap(p.tubes[5]); s = await state();
        ck('second bottle tap pours', s.bottles === '[[0],[1,1,2],[2],[3,3,3],[0,0,1,2],[1]]', JSON.stringify(s));
        await setup(); p = await pos(); s0 = await state();
        await drag(p.tubes[0], p.tubes[5]); s = await state();
        ck('a drag from bottle to bottle pours (classic too) and places nothing', s.turn === s0.turn && s.bottles === '[[0],[1,1,2],[2],[3,3,3],[0,0,1,2],[1]]' && s.ghosts === 0, JSON.stringify(s));
      } else {
        await setup(); p = await pos(); s0 = await state();
        await tap(p.tubes[2]); s = await state();
        ck('one bottle tap places once', s.turn === s0.turn + 1 && s.bottles === '[[0,1],[1,1,2],[2,2],[3,3,3],[0,0,1,2],[]]', JSON.stringify(s));
        await setup(); p = await pos(); s0 = await state();
        await drag(p.tubes[0], p.tubes[5]); s = await state();
        ck('a drag from bottle to bottle pours and places nothing', s.turn === s0.turn && s.bottles === '[[0],[1,1,2],[2],[3,3,3],[0,0,1,2],[1]]', JSON.stringify(s));
        await setup(); p = await pos(); s0 = await state();
        await down(...p.tubes[0]); await sleep(900); s = await state();
        ck('a long press selects the pour source while still held', s.sel === 0, JSON.stringify(s));
        await up(...p.tubes[0]); s = await state();
        ck('releasing the long press places nothing and keeps the source', s.turn === s0.turn && s.sel === 0, JSON.stringify(s));
        if (touchIn) { const cm = await js('[window.__cm || 0, !!window.__cmPrevented]'); ck('the long press menu is suppressed', cm[0] === 0 || cm[1], JSON.stringify(cm)); }
        await tap(p.tubes[5]); s = await state();
        ck('a tap after the long press pours', s.turn === s0.turn && s.bottles === '[[0],[1,1,2],[2],[3,3,3],[0,0,1,2],[1]]', JSON.stringify(s));
        await setup(); p = await pos(); s0 = await state();
        await tap(p.cup); s = await state();
        ck('tapping the piece only explains', !s.cupSel && s.turn === s0.turn && s.status === '병을 누르면 바로 들어가요', JSON.stringify(s));
        await setup(); p = await pos(); s0 = await state();
        await tap(p.gap23); s = await state();
        ck('a tap in the gap places in a neighbour', s.turn === s0.turn + 1, JSON.stringify(s));
      }
      // both schemes: out of its bottle, the liquid a pour drag carries follows the finger
      await setup(); p = await pos();
      await down(...p.tubes[1]); await sleep(40); await moveTo(...p.tubes[1], ...p.tubes[5]);
      const gh = await js(`(() => { const g = document.querySelector('.ghost.pour'); if (!g) return null; const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top, g.querySelectorAll('.layer').length]; })()`);
      await up(...p.tubes[5]); s = await state();
      ck('the liquid a pour drag carries follows the finger, then pours', !!gh && Math.abs(gh[0] - p.tubes[5][0]) < 12 && gh[1] < p.tubes[5][1] && gh[2] === 1
        && s.bottles === '[[0,1],[1,1],[2],[3,3,3],[0,0,1,2],[2]]' && s.ghosts === 0, JSON.stringify({ gh, s }));
      if (touchIn) {
        // a second finger lands on another bottle in the middle of a piece drag
        await setup(); p = await pos(); s0 = await state();
        await touch('touchStart', [[...p.cup, 0]]); await sleep(40);
        for (let i = 1; i <= 10; i++) { await touch('touchMove', [[p.cup[0] + (p.tubes[2][0] - p.cup[0]) * i / 10, p.cup[1] + (p.tubes[2][1] - p.cup[1]) * i / 10, 0]]); await sleep(16); }
        await touch('touchStart', [[...p.tubes[2], 0], [...p.tubes[5], 1]]); await sleep(60);
        await touch('touchEnd', [[...p.tubes[2], 0]]); await sleep(60);
        await touch('touchEnd', []); await sleep(450);
        s = await state();
        ck('a second finger during a drag does not place twice or leave a ghost', s.turn - s0.turn <= 1 && s.ghosts === 0, JSON.stringify(s));
        const sc = await js('[document.scrollingElement.scrollTop, document.documentElement.scrollHeight, innerHeight]');
        ck('the page did not scroll', sc[0] === 0, JSON.stringify(sc));
        // a run in progress: the new-game button asks for a second tap
        await setup(); await js(`(() => { const s = window.__snapFn().S; s.turn = 5; window.__boot({ S: s }); return true; })()`); await sleep(200);
        const nb = await js(`(() => { const r = document.getElementById('btnNew').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
        const game = () => js(`({ seed: window.__snapFn().S.seed, turn: window.__snapFn().S.turn, text: document.getElementById('btnNew').textContent })`);
        const g0 = await game();
        await tap(nb); const g1 = await game();
        ck('one tap on new game keeps the run and asks for another', g1.seed === g0.seed && g1.turn === 5 && g1.text === '한 번 더', JSON.stringify(g1));
        await tap(nb); const g2 = await game();
        ck('a second tap starts a new run', g2.seed !== g0.seed && g2.turn === 0 && g2.text === '새 게임', JSON.stringify(g2));
        // the tap that ends the run opens the result sheet at once (reduced effects); Chrome then sends that tap's
        // click to whatever is under the finger, so it must not press a sheet button
        await js(`(() => { const r = document.getElementById('optReduce'); if (!r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
        for (const yf of [0.5, 0.8]) {
          await setup('[[1,2,3],[2,3,1,0],[3,1,2,0],[1,3,2,1],[2,1,3,2],[3,2,1,3]]', '[0]'); p = await pos();
          await js(`window.__ovClicks = 0; document.getElementById('ovOver').addEventListener('click', () => window.__ovClicks++); true`);
          const r0 = await js(`(() => { const r = document.querySelectorAll('#rack .tube')[0].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * ${yf}]; })()`);
          if (v.controls === 'classic') await tap(p.cup);
          await tap(r0);
          const o = await js(`({ over: !document.getElementById('ovOver').hidden, ad: !document.getElementById('ovAd').hidden, themes: !document.getElementById('ovThemes').hidden, clicks: window.__ovClicks })`);
          ck(`the tap that ends the run (at ${yf * 100}% of the bottle) does not press the result sheet`, o.over && !o.ad && !o.themes && o.clicks === 0, JSON.stringify(o));
          await js(`document.querySelectorAll('.overlay').forEach(x => { x.hidden = true; }); true`);
        }
      }
      if (v.fx === 'juicy') {
        // the touch checks above turn reduced effects on (the run-ending tap); the juicy effects need them off
        await js(`(() => { const r = document.getElementById('optReduce'); r.checked = false; r.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
        const fxn = () => js(`({ fx: document.querySelectorAll('#fxLayer .fx').length, blobs: document.querySelectorAll('#fxLayer .fx-blob').length, drops: document.querySelectorAll('#fxLayer .fx-drop').length, press: [...document.querySelectorAll('.tube.press')].length })`);
        // a press shows at once
        await setup(); p = await pos();
        await down(...p.tubes[1]); await sleep(30);
        let f = await fxn(); s = await state();
        ck('[feel] a press marks the bottle at once and changes nothing', f.press === 1 && s.sel === -1, JSON.stringify({ f, s }));
        await up(...p.tubes[1]);
        // a completion, then a quick next move (taps without the usual pause after them): the burst still goes off
        const qtap = async ([x, y]) => { await down(x, y); await sleep(40); if (touchIn) await touch('touchEnd', []); else await mouse('mouseReleased', x, y, 0); await sleep(30); };
        await setup('[[0,1,1],[2,2],[3,3,3],[0,0,3],[1,5],[]]', '[2,2]');
        await js(`(() => { const s = window.__snapFn().S; s.streak = 3; window.__boot({ S: s }); return true; })()`); await sleep(150); p = await pos();
        await qtap(p.tubes[3]); await qtap(p.tubes[2]);
        await qtap(p.tubes[0]); await qtap(p.tubes[5]);
        f = await fxn(); s = await state();
        ck('[feel] a quick move right after a completion is taken at once, with both effects alive', s.bottles === '[[0],[2,2],[],[0,0],[1,5],[1,1]]' && f.fx > 0, JSON.stringify({ f, s }));
        // the burst itself (its timing against the next move depends on how fast this protocol delivers the taps;
        // the feel scenario checks it on the page's own clock)
        let seen = 0;
        for (let k = 0; k < 20 && !seen; k++) { f = await fxn(); seen = f.drops; if (!seen) await sleep(40); }
        ck('[feel] the completion bursts', seen > 0, JSON.stringify(f));
        await sleep(1200);
        f = await fxn();
        ck('[feel] then every effect node is gone', f.fx === 0, JSON.stringify(f));
        // the next piece is still sliding in when the finger takes it: it goes where it is dragged
        await setup(); p = await pos(); s0 = await state();
        await tap(p.cup);
        await down(...p.tubes[5]); await sleep(40);
        if (touchIn) await touch('touchEnd', []); else await mouse('mouseReleased', ...p.tubes[5], 0);
        await sleep(20);   // the next piece is still sliding into the cup (0.12s); the thumb goes to the cup's place
        await down(...p.cup); await sleep(30); await moveTo(...p.cup, ...p.tubes[2]);
        const gr = await js(`(() => { const g = document.querySelector('.ghost'); if (!g) return null; const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
        if (gr) { const fx2 = p.tubes[2][0] - (gr[0] - p.tubes[2][0]), fy2 = p.tubes[2][1] - (gr[1] - p.tubes[2][1]); await moveTo(...p.tubes[2], fx2, fy2); await up(fx2, fy2); } else await up(...p.tubes[2]);
        s = await state();
        ck('[feel] a piece taken mid-slide is placed where it is dragged', s.turn === s0.turn + 2 && s.ghosts === 0, JSON.stringify(s));
      }
      const errs = await js('window.__errors');
      ck('no script errors', !errs.length, errs.join(' | '));
    }
    ws.close();
  } finally {
    chrome.kill();
  }
  console.log(`${total - fails}/${total} passed`);
  process.exitCode = fails ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
