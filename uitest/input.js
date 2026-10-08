// Input tests (test page only): the controls and geom scenarios.
// Synthetic PointerEvents cannot hold pointer capture and never produce clicks, context menus or scroll takeovers,
// so this file emulates what a browser does around them:
// - pointer capture: setPointerCapture is recorded and honoured; touch is implicitly captured by the pressed element
// - click: touch makes one only when it moved <= SLOP and was not a long press; mouse always makes one, on the
//   nearest common ancestor of the press and release targets (detail 1)
// - touch scroll: a touch that moves past SLOP is cancelled (pointercancel) unless touch-action is none on the
//   pressed element or an ancestor
// - long press (touch): after LONG ms a contextmenu event; if the page does not prevent it the menu "opens" and the
//   touch is cancelled
// - keys: Enter clicks a button on keydown, Space on keyup (detail 0), unless prevented
// Checks tagged [Dn] are the defects listed in docs/PROMPT_controls.md; they are written as the fixed behaviour,
// so on the unfixed page they fail (= reproduced).
window.__inputTests = async function (T) {
  const { check, G, $, sleep, send, SC, P } = T;
  const PT = P.get('pt') || 'touch';
  // the defaults are classic and the tray under the bottles; a stored 'low' layout (removed) reads as bottom
  const MODE = P.get('controls') === 'tapPlace' ? 'tapPlace' : 'classic', TRAY = P.get('tray') === 'top' ? 'top' : 'bottom';
  const CASE = P.get('case') || '';
  const SLOP = 10, LONG = 500;
  const ck = (name, cond, detail) => check(`[${MODE}/${TRAY}/${PT}] ${name}`, cond, detail);

  // ---------- event emulation ----------
  const caps = new Map();
  Element.prototype.setPointerCapture = function (id) { caps.set(id, this); };
  Element.prototype.releasePointerCapture = function (id) { if (caps.get(id) === this) caps.delete(id); };
  Element.prototype.hasPointerCapture = function (id) { return caps.get(id) === this; };
  const live = new Map();
  let nextId = 1;
  const hit = (x, y) => document.elementFromPoint(x, y) || document.documentElement;
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function fire(type, target, p, x, y) {
    const ev = new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: p.id, pointerType: PT, isPrimary: p.primary,
      button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
      width: PT === 'touch' ? 20 : 1, height: PT === 'touch' ? 20 : 1, pressure: type === 'pointerup' || type === 'pointercancel' ? 0 : 0.5,
    });
    target.dispatchEvent(ev);
    return ev;
  }
  function route(p, x, y) {
    const c = caps.get(p.id);
    if (c) { if (c.isConnected) return c; caps.delete(p.id); }
    if (PT === 'touch' && p.down.isConnected) return p.down;
    return hit(x, y);
  }
  function touchPans(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (getComputedStyle(e).touchAction === 'none') return false;
    return true;
  }
  function common(a, b) {
    if (!a || !b || !a.isConnected) return null;
    for (let e = a; e; e = e.parentElement) if (e.contains(b)) return e;
    return null;
  }
  function down(x, y) {
    const p = { id: nextId++, x, y, x0: x, y0: y, maxD: 0, t0: performance.now(), done: false, primary: live.size === 0 };
    p.down = hit(x, y);
    p.pans = touchPans(p.down);   // browsers fix touch-action when the touch starts
    live.set(p.id, p);
    fire('pointerdown', p.down, p, x, y);
    return p;
  }
  function move(p, x, y) {
    if (p.done) return;
    p.x = x; p.y = y; p.maxD = Math.max(p.maxD, Math.hypot(x - p.x0, y - p.y0));
    if (PT === 'touch' && p.maxD > SLOP && !p.panChecked) { p.panChecked = true; if (p.pans) { p.scrolled = true; cancel(p); return; } }
    fire('pointermove', route(p, x, y), p, x, y);
  }
  function end(p) { p.done = true; caps.delete(p.id); live.delete(p.id); }
  function cancel(p) { if (p.done) return; fire('pointercancel', route(p, p.x, p.y), p, p.x, p.y); end(p); p.cancelled = true; }
  function up(p) {
    if (p.done) return;
    const t = route(p, p.x, p.y);
    fire('pointerup', t, p, p.x, p.y);
    end(p);
    let target = null;
    if (PT === 'touch') { if (p.maxD <= SLOP && !p.longPress) target = hit(p.x, p.y); } else target = common(p.down, t);
    if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, detail: 1, button: 0 }));
  }
  async function hold(p, ms) {
    for (let t = 0; t < ms; t += 25) {
      await sleep(25);
      if (PT === 'touch' && !p.done && !p.longPress && p.maxD <= SLOP && performance.now() - p.t0 >= LONG) {
        p.longPress = true;
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y });
        hit(p.x, p.y).dispatchEvent(ev);   // the menu goes to the element under the finger, not the capture target
        if (!ev.defaultPrevented) { p.menu = true; cancel(p); }
      }
    }
  }
  async function tapAt(x, y, ms) { const p = down(x, y); await hold(p, ms || 40); up(p); await sleep(30); return p; }
  const tap = (el, ms) => tapAt(...center(el), ms);
  async function press(el) { const [x, y] = center(el); const p = down(x, y); await sleep(20); return p; }
  // judge = true: put the point where the game judges a piece drop (the ghost centre with the tray under the bottles)
  async function moveTo(p, x, y, judge) {
    const n = 6, x0 = p.x, y0 = p.y;
    for (let i = 1; i <= n; i++) { move(p, x0 + (x - x0) * i / n, y0 + (y - y0) * i / n); await sleep(16); }
    if (judge && TRAY === 'bottom') {
      const g = document.querySelector('.ghost:not(.pour)');
      if (g) { const r = g.getBoundingClientRect(); move(p, x - (r.left + r.width / 2 - p.x), y - (r.top + r.height / 2 - p.y)); await sleep(16); }
    }
  }
  async function release(p) { up(p); await sleep(40); }
  async function jitterTap(el, px) { const [x, y] = center(el); const p = down(x, y); await sleep(20); move(p, x + px, y); await sleep(20); up(p); await sleep(30); }
  async function key(el, k, shift) {
    el.focus();
    const o = { key: k, code: k === ' ' ? 'Space' : k, shiftKey: !!shift, bubbles: true, cancelable: true, composed: true };
    const d = new KeyboardEvent('keydown', o); el.dispatchEvent(d);
    const btn = el.tagName === 'BUTTON' && !el.disabled;
    if (k === 'Enter' && btn && !d.defaultPrevented) el.click();
    const u = new KeyboardEvent('keyup', o); el.dispatchEvent(u);
    if (k === ' ' && btn && !d.defaultPrevented && !u.defaultPrevented) el.click();
    await sleep(30);
  }
  async function esc() {
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, composed: true }));
    await sleep(30);
  }

  // ---------- game helpers ----------
  const cup = () => $('cup');
  const tube = i => document.querySelectorAll('#rack .tube')[i];
  const spareTube = () => $('spareSlot').querySelector('.tube');
  const isSel = el => !!el && el.classList.contains('sel');
  const status = () => $('status').textContent;
  const anySel = () => !!document.querySelector('#rack .tube.sel, #spareSlot .tube.sel') || isSel(cup());
  const vib = [];
  try { Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pat => { vib.push(JSON.stringify(pat)); return true; } }); } catch (e) { /* keep the real one */ }
  async function setup(bottles, piece, extra) {
    const s = G();
    Object.assign(s, {
      bottles: bottles.map(b => b.slice()), piece: piece.slice(), over: false, overReason: '', stuck: null, spare: null, spareOffer: false,
      flipped: false, pours: 0, turnClears: 0, streak: 0,
    }, extra || {});
    window.__boot({ S: s });
    await sleep(80);
    vib.length = 0;
  }
  const B = [[0, 1], [1, 1, 2], [2], [3, 3, 3], [0, 0, 1, 2], []];   // free: 2 1 3 1 0 4
  function gapPoint(a, b) { const ra = tube(a).getBoundingClientRect(), rb = tube(b).getBoundingClientRect(); return [(ra.right + rb.left) / 2, (ra.top + ra.bottom) / 2]; }
  const rackTop = () => $('rack').getBoundingClientRect().top;
  const notPlaced = (t0) => G().turn === t0;

  // ---------- helpers for docs/PROMPT_controls2.md (6.2-6.5, 5) ----------
  const cloudPush = id => window.__cloud.push(id, { v: 1, device: id, starsMine: 1, owned: ['lab'], best: [], daily: [], starsDaily: [], unlock: { runs: 3, sawOver: true, flip: true } });
  const closeSheets = () => document.querySelectorAll('.overlay').forEach(o => { o.hidden = true; });
  // a new run through the new-game button (a run in progress asks for a second press)
  async function newRun() {
    const seed = G().seed;
    if (G().turn >= 1 && !G().over) $('btnNew').click();
    $('btnNew').click();
    await sleep(40);
    return G().seed !== seed;
  }
  // the selects show the stored setting only once the sheet has opened, so always send the change
  async function setScheme(c, t) {
    const sc = $('optControls'), tr = $('optTray');
    if (c) { sc.value = c; sc.dispatchEvent(new Event('change', { bubbles: true })); }
    if (t) { tr.value = t; tr.dispatchEvent(new Event('change', { bubbles: true })); }
    await sleep(30);
    closeSheets();
  }
  const record = () => JSON.parse(localStorage.getItem('wsurv.playtest') || 'null');
  const row = k => { const r = record(); return (r && r.by[k]) || null; };
  const KEY = `${MODE}/${TRAY}`;

  // the feel scenario (docs/PROMPT_feel.md) lives in feel.js and drives the page with these helpers
  if (SC === 'feel') return window.__feelTests(T, { down, move, up, hold, tap, tapAt, press, moveTo, release, key, esc, center, setup, cup, tube, isSel, anySel, status, vib, cloudPush, closeSheets, newRun, record, B, PT, MODE, TRAY });
  if (SC === 'geom') return geomTests();
  if (CASE) {
    try { await caseTests(); } catch (e) { ck('input test exception', false, e && e.stack || e); }
    return;
  }

  try {
    await hintTests();   // first: the first pour made in tapPlace ends the pour hints on the device
    if (MODE === 'tapPlace') await tapPlaceTests(); else await classicTests();
    await commonTests();
    await dragPourTests();
    await nudgeTests();
    await newGameTests();
    await giveUpTests();
    await textTests();
    await playtestTests();
  } catch (e) { ck('input test exception', false, e && e.stack || e); }

  // ---------- classic: cup tap / drag places, bottle taps pour ----------
  async function classicTests() {
    await setup(B, [2]);
    await tap(cup());
    ck('cup tap selects the piece', isSel(cup()) && status() === '조각을 넣을 병을 고르세요.', status());
    ck('fitting bottles are marked', document.querySelectorAll('#rack .tube.can').length === 5);
    ck('[D13] cup aria-pressed is true while selected', cup().getAttribute('aria-pressed') === 'true', cup().getAttribute('aria-pressed'));
    await tap(cup());
    ck('second cup tap deselects', !isSel(cup()));
    ck('[D13] cup aria-pressed is false when not selected', cup().getAttribute('aria-pressed') === 'false', cup().getAttribute('aria-pressed'));
    let t = G().turn;
    await tap(cup()); await tap(tube(2));
    ck('cup tap then bottle tap places', G().turn === t + 1 && G().bottles[2].length === 2, JSON.stringify(G().bottles));
    ck('[7.4] a placement vibrates briefly', vib.includes('10'), vib.join(' '));

    await setup(B, [2, 3]);
    await tap(cup()); await tap(tube(4));
    ck('failed tap-place shakes the bottle and says why', tube(4).classList.contains('shake') && status().includes('2칸이 필요한데'), status());
    ck('[7.4] a rejected move vibrates the reject pattern', vib.includes('[20,40,20]'), vib.join(' '));
    ck('[D2] the piece stays selected after a failed tap-place', isSel(cup()));
    t = G().turn; await tap(tube(5));
    ck('[D2] one more bottle tap places after a failed try', G().turn === t + 1, G().turn - t);
    await setup(B, [2, 3]);
    await tap(cup());
    const sp = G(); sp.spare = []; sp.rules.spare = true; sp.spareTurn = sp.turn; window.__boot({ S: sp }); await sleep(60);
    await tap(cup()); await tap(spareTube());
    ck('spare cup refuses the piece and releases it', status().includes('임시 잔에는') && !isSel(cup()), status());

    const BS = [[0, 0, 1], [2, 2, 1], [3, 3, 0], [1, 2, 3], [0, 1, 2], [3, 2, 0]];
    await setup(BS, [1, 2], { stuck: 'room' });
    await tap(cup()); await tap(tube(0));
    ck('[D2] when nothing fits, a failed tap-place releases the piece', !isSel(cup()));
    await tap(tube(0));
    ck('when nothing fits, the next bottle tap picks a pour source', isSel(tube(0)));

    await setup(B, [2]);
    await tap(tube(0));
    ck('bottle tap selects a pour source', isSel(tube(0)) && status() === '부을 병을 고르세요.', status());
    ck('[D13] the source bottle has aria-pressed true', tube(0).getAttribute('aria-pressed') === 'true', tube(0).getAttribute('aria-pressed'));
    ck('[D13] other bottles have aria-pressed false', tube(1).getAttribute('aria-pressed') === 'false', tube(1).getAttribute('aria-pressed'));
    await tap(tube(5));
    ck('second bottle tap pours', G().bottles[5].join() === '1' && G().bottles[0].join() === '0', JSON.stringify(G().bottles));
    await setup(B, [2]); t = G().turn;
    await tap(tube(5));
    ck('empty bottle tap only explains (D17 kept in classic)', status().startsWith('빈 병이에요') && notPlaced(t), status());

    await setup(B, [2]); t = G().turn;
    let p = await press(cup()); await moveTo(p, ...center(tube(2)), true);
    ck('dragging shows a ghost', !!document.querySelector('.ghost'));
    ck('a fitting bottle under the drag shows the landing ghost', tube(2).classList.contains('hover') && !!tube(2).querySelector('.ghostL'));
    await release(p);
    ck('drag onto a bottle places', G().turn === t + 1 && G().bottles[2].length === 2, JSON.stringify(G().bottles));
    ck('no ghost left after the drop', !document.querySelector('.ghost'));

    await setup(B, [2, 3]); t = G().turn;
    p = await press(cup()); await moveTo(p, ...center(tube(4)), true);
    ck('[D7] dragging over a full bottle shows a reject', tube(4).classList.contains('reject') && !tube(4).classList.contains('hover'), tube(4).className);
    await moveTo(p, ...center(tube(1)), true);
    ck('[D7] dragging a 2-layer piece over 1 free cell rejects with the reason', tube(1).classList.contains('reject') && !tube(1).querySelector('.ghostL') && status().includes('2칸이 필요한데'), tube(1).className + ' / ' + status());
    await moveTo(p, ...center(tube(5)), true);
    ck('moving on to a fitting bottle shows the landing ghost again', tube(5).classList.contains('hover') && !!tube(5).querySelector('.ghostL') && !tube(1).classList.contains('reject'));
    await release(p);
    ck('the drop lands in the last bottle hovered', G().turn === t + 1 && G().bottles[5].length === 2);

    await setup(B, [2]); t = G().turn;
    p = await press(cup()); await moveTo(p, ...gapPoint(1, 2), true); await release(p);
    ck('[D6] a drop in the gap between bottles lands in a neighbour', G().turn === t + 1 && (G().bottles[1].length === 4 || G().bottles[2].length === 2), JSON.stringify(G().bottles));
    await setup(B, [2]); t = G().turn;
    p = await press(cup()); await moveTo(p, center(tube(2))[0], rackTop() + 9, true); await release(p);
    ck('[D6] a drop just above a bottle lands in it', G().turn === t + 1 && G().bottles[2].length === 2, JSON.stringify(G().bottles));
    await setup(B, [2]); t = G().turn;
    p = await press(cup()); await moveTo(p, ...center($('status')), true); await release(p);
    ck('[D6] a drop outside the rack does not place and says so', notPlaced(t) && status().includes('병 위에 놓아야'), status());
    ck('a drop outside the rack leaves nothing selected', !anySel());
    await setup(B, [2]); await tap(cup()); t = G().turn;
    await tapAt(...gapPoint(2, 3));
    ck('[D6] tapping the gap between bottles picks a neighbour', G().turn === t + 1, G().turn - t);

    await setup(B, [2]);
    const r0 = tube(0).getBoundingClientRect();
    await tap(tube(0)); await sleep(250);
    await tapAt(r0.left + r0.width / 2, r0.bottom - 4);
    ck('[D9] the lower edge a lifted bottle left behind still hits it', !isSel(tube(0)));
    const rc = cup().getBoundingClientRect();
    await tap(cup()); await sleep(250);
    await tapAt(rc.left + rc.width / 2, rc.bottom - 4);
    ck('[D9] the lower edge the lifted piece left behind still hits it', !isSel(cup()));

    await setup(B, [2]);
    await jitterTap(cup(), 9);
    ck('[D10] a tap that wobbles 9px still selects the piece', isSel(cup()));
    await jitterTap(cup(), 12);
    ck('[D10] a 12px wobbly tap on the selected piece deselects it', !isSel(cup()));
    t = G().turn;
    p = await press(cup()); const [cx0, cy0] = [p.x, p.y];
    await moveTo(p, cx0 - 40, cy0); await moveTo(p, cx0, cy0); await release(p);
    ck('[D10] dragging off the piece and back neither places nor selects', notPlaced(t) && !isSel(cup()));
    await setup(B, [2]);
    await jitterTap(tube(0), PT === 'mouse' ? 12 : 9);
    ck('a wobbly click or tap on a bottle still selects it', isSel(tube(0)));
    await esc();
    await sleep(500);
    cup().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    ck('a click with no pointer events behind it (screen reader in Firefox) selects the piece', isSel(cup()));
    await esc();

    await setup(B, [2]); t = G().turn;
    await key(cup(), 'Enter'); await key(tube(2), 'Enter');
    ck('keyboard: Enter on the piece then on a bottle places', G().turn === t + 1);
    ck('[D5] focus stays on the bottle that was used', document.activeElement === tube(2), document.activeElement && (document.activeElement.id || document.activeElement.className));
    await key(tube(0), ' '); await key(tube(5), ' ');
    ck('keyboard: Space on two bottles pours', G().bottles[5].length === 1, JSON.stringify(G().bottles));
    ck('[D20] classic bottles take the touch themselves too (drags between them pour)', getComputedStyle(tube(0)).touchAction === 'none', getComputedStyle(tube(0)).touchAction);
  }

  // ---------- tapPlace: bottle tap places, bottle drag pours, long press picks a source ----------
  async function tapPlaceTests() {
    await setup(B, [2]);
    ck('fitting bottles are marked without selecting the piece', document.querySelectorAll('#rack .tube.can').length === 5 && !isSel(cup()));
    let t = G().turn;
    await tap(tube(2));
    ck('one bottle tap places', G().turn === t + 1 && G().bottles[2].length === 2, JSON.stringify(G().bottles));
    ck('[7.4] a placement vibrates briefly', vib.includes('10'), vib.join(' '));
    await setup(B, [2, 3]); t = G().turn;
    await tap(tube(4));
    ck('a bottle without room shakes and explains', tube(4).classList.contains('shake') && status().includes('2칸이 필요한데') && notPlaced(t), status());
    ck('[7.4] a rejected tap vibrates the reject pattern', vib.includes('[20,40,20]'), vib.join(' '));
    ck('nothing selected after a failed tap', !anySel());
    await setup(B, [2]); t = G().turn;
    await tap(tube(5));
    ck('an empty bottle tap places', G().turn === t + 1 && G().bottles[5].join() === '2', JSON.stringify(G().bottles));
    await setup(B, [2]); t = G().turn;
    await tapAt(...gapPoint(2, 3));
    ck('[D6] a tap in the gap places in a neighbour', G().turn === t + 1, G().turn - t);

    await setup(B, [2]); t = G().turn;
    let p = await press(tube(0)); await moveTo(p, ...center(tube(5)));
    ck('a drag from a bottle marks it as the source', isSel(tube(0)));
    ck('the pour target under the drag shows the pour ghost', !!tube(5).querySelector('.ghostL'));
    ck('[D20] the drag was not taken over by page scrolling', !p.scrolled);
    await release(p);
    ck('a drag from bottle to bottle pours', G().bottles[5].join() === '1' && G().bottles[0].join() === '0' && notPlaced(t), JSON.stringify(G().bottles));
    ck('nothing selected after a drag pour', !anySel());
    ck('a drag pour can be undone', !$('btnUndo').disabled);
    await setup(B, [2]); t = G().turn;
    p = await press(tube(0)); await moveTo(p, ...center(tube(1)));
    ck('a bottle the source cannot pour into shows a reject', tube(1).classList.contains('reject'), tube(1).className);
    await release(p);
    ck('dropping a pour on the wrong bottle shakes, pours nothing, selects nothing', tube(1).classList.contains('shake') && G().bottles[1].join() === '1,1,2' && !anySel() && notPlaced(t));
    await setup(B, [2]); t = G().turn;
    p = await press(tube(0)); await moveTo(p, ...center($('status'))); await release(p);
    ck('a pour drag dropped outside the rack cancels', G().bottles[0].join() === '0,1' && !anySel() && notPlaced(t));
    await setup(B, [2]); t = G().turn;
    p = await press(tube(0)); await moveTo(p, center(tube(0))[0] + 30, center(tube(0))[1]); await moveTo(p, ...center(tube(0))); await release(p);
    ck('a pour drag dropped back on its source cancels', G().bottles[0].join() === '0,1' && !anySel() && notPlaced(t));
    await setup(B, [2]); t = G().turn;
    p = await press(tube(5)); await moveTo(p, ...center(tube(2))); await release(p);
    ck('a drag from an empty bottle does nothing', !anySel() && notPlaced(t) && G().bottles[2].length === 1);

    await setup(B, [2]); t = G().turn;
    p = down(...center(tube(0))); await hold(p, 650);
    ck('a long press selects a pour source', isSel(tube(0)) && status() === '부을 병을 고르세요.', status());
    ck('a long press does not open the browser menu', !p.menu);
    await release(p);
    ck('releasing a long press keeps the source and places nothing', isSel(tube(0)) && notPlaced(t));
    await tap(tube(5));
    ck('a tap after a long press pours', G().bottles[5].join() === '1' && notPlaced(t) && !anySel(), JSON.stringify(G().bottles));
    await setup(B, [2]);
    p = down(...center(tube(0))); await hold(p, 650); await release(p);
    await tap(tube(0));
    ck('tapping the source again deselects', !anySel());
    p = down(...center(tube(0))); await hold(p, 650); await release(p);
    await esc();
    ck('Escape deselects the source', !anySel());
    p = down(...center(tube(0))); await hold(p, 650); await release(p);
    await tap($('status'));
    ck('a tap on empty space outside the rack deselects the source', !anySel());
    p = down(...center(tube(0))); await hold(p, 650); await release(p);
    if (!$('btnFlip').hidden && !$('btnFlip').disabled) { await tap($('btnFlip')); ck('the flip button keeps the source', isSel(tube(0))); }
    await esc();
    await setup(B, [2]); t = G().turn;
    p = down(...center(tube(5))); await hold(p, 650); await release(p);
    ck('a slow press on an empty bottle is still a tap and places', G().turn === t + 1 && G().bottles[5].join() === '2' && !anySel(), JSON.stringify(G().bottles));
    await setup(B, [2]); t = G().turn;
    await jitterTap(tube(5), 9);
    ck('a 9px wobbly tap on an empty bottle places', G().turn === t + 1 && G().bottles[5].join() === '2', JSON.stringify(G().bottles));
    ck('the gaps and the space above the bottles take the touch too (touch-action none on #rack)', getComputedStyle($('rack')).touchAction === 'none', getComputedStyle($('rack')).touchAction);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await setup(B, [2]);
      p = down(...center(tube(0))); await hold(p, 100);
      const gl = tube(0).querySelector('.glass');
      ck('with reduced motion the long-press ring still takes 0.45s', tube(0).classList.contains('charging') && getComputedStyle(gl).animationDuration === '0.45s', getComputedStyle(gl).animationDuration);
      await release(p); await esc();
    }
    await setup(B, [2]); t = G().turn;
    p = down(...center(tube(0))); await hold(p, 650); await moveTo(p, ...center(tube(5))); await release(p);
    ck('a long press that then moves becomes a pour drag', G().bottles[5].join() === '1' && notPlaced(t), JSON.stringify(G().bottles));
    await setup(B, [2]); t = G().turn;
    p = down(...center(tube(0))); await hold(p, 300);
    window.__cloud.push('dev-lp', { v: 1, device: 'dev-lp', starsMine: 1, owned: ['lab'], best: [], daily: [], starsDaily: [], unlock: { runs: 3, sawOver: true, flip: true } });
    await hold(p, 350);
    ck('[D11] a render during a long press does not stop it', isSel(tube(0)));
    await release(p); await esc();

    await setup(B, [2]); t = G().turn;
    await tap(cup());
    ck('tapping the piece explains instead of selecting', !isSel(cup()) && status() === '병을 누르면 바로 들어가요', status());
    p = await press(cup()); await moveTo(p, ...center(tube(2)), true); await release(p);
    ck('dragging the piece still places', G().turn === t + 1 && G().bottles[2].length === 2);

    await setup(B, [2]);
    const sp = G(); sp.spare = [1]; sp.rules.spare = true; sp.spareTurn = sp.turn; window.__boot({ S: sp }); await sleep(60);
    t = G().turn;
    await tap(spareTube());
    ck('tapping the spare cup selects it as a source (it takes no piece)', isSel(spareTube()) && notPlaced(t));
    await tap(tube(5));
    ck('then a bottle tap pours from the spare cup', G().bottles[5].join() === '1' && G().spare.length === 0 && notPlaced(t), JSON.stringify(G().bottles));

    await setup(B, [2]); t = G().turn;
    await key(tube(2), 'Enter');
    ck('keyboard: Enter on a bottle places', G().turn === t + 1);
    ck('[D5] focus stays on that bottle', document.activeElement === tube(2));
    t = G().turn;
    await key(tube(0), 'Enter', true);
    ck('keyboard: Shift+Enter picks a pour source and places nothing', isSel(tube(0)) && notPlaced(t));
    await key(tube(5), 'Enter');
    ck('keyboard: Enter on another bottle pours', G().bottles[5].length >= 1 && notPlaced(t) && !anySel(), JSON.stringify(G().bottles));
    await key(tube(0), 'Enter', true); await esc();
    ck('keyboard: Escape clears the source', !anySel());
    ck('[D20] bottles take the touch themselves (touch-action none)', getComputedStyle(tube(0)).touchAction === 'none', getComputedStyle(tube(0)).touchAction);

    // switching the control setting mid-game clears the selection
    p = down(...center(tube(0))); await hold(p, 650); await release(p);
    $('btnSettings').click();
    const sc = $('optControls');
    ck('settings offer the control scheme', !!sc);
    if (sc) {
      sc.value = 'classic'; sc.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
      ck('switching the scheme clears the selection', !anySel());
      sc.value = 'tapPlace'; sc.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
    }
    $('ovSettings').hidden = true;
    document.querySelectorAll('.overlay').forEach(o => { o.hidden = true; });
  }

  // ---------- both schemes ----------
  async function commonTests() {
    if (MODE === 'classic') {
      // first switch to tapPlace shows the three-line hint once
      $('btnSettings').click();
      const sc = $('optControls');
      if (sc) {
        sc.value = 'tapPlace'; sc.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
        ck('first switch to tapPlace shows the hint once', !!$('ovCtl') && !$('ovCtl').hidden && $('ovCtl').textContent.includes('길게 누르면'));
        document.querySelectorAll('.overlay').forEach(o => { o.hidden = true; });
        sc.value = 'classic'; sc.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30);
      } else ck('settings offer the control scheme', false);
      document.querySelectorAll('.overlay').forEach(o => { o.hidden = true; });
    }

    let t;
    if (PT === 'touch') {
      await setup(B, [2]); t = G().turn;
      const [x, y] = center(cup());
      const p1 = down(x, y); await sleep(20);
      await moveTo(p1, ...center(tube(2)), true);
      const p2 = down(x, y); await sleep(30); up(p2); await sleep(30);
      await release(p1); await sleep(40);
      ck('[D3] a second finger on the piece leaves no ghost behind', !document.querySelector('.ghost'), document.querySelectorAll('.ghost').length);
      ck('[D3] a second finger on the piece does not change the drop', G().turn === t + 1 && G().bottles[2].length === 2, JSON.stringify(G().bottles));
      await setup(B, [2]); t = G().turn;
      const q1 = down(x, y); await sleep(20);
      await moveTo(q1, ...center(tube(2)), true);
      await tap(tube(5));
      await release(q1); await sleep(40);
      ck('[D4] a tap with another finger during a drag does not place twice', G().turn - t <= 1, G().turn - t);
    }

    await setup(B, [2]); t = G().turn;
    let p = await press(cup()); await moveTo(p, ...center(tube(2)), true);
    window.__cloud.push('dev-x', { v: 1, device: 'dev-x', starsMine: 1, owned: ['lab'], best: [], daily: [], starsDaily: [], unlock: { runs: 3, sawOver: true, flip: true } });
    await sleep(30);
    ck('[D11] a cloud merge during a drag keeps the hover and landing ghost', tube(2).classList.contains('hover') && !!tube(2).querySelector('.ghostL'), tube(2).className);
    await release(p);
    ck('[D11] the drop after a cloud merge still places', G().turn === t + 1);

    await setup(B, [2]); t = G().turn;
    p = await press(cup()); await moveTo(p, ...center(tube(2)), true);
    await esc();
    ck('[D12] Escape during a drag removes the ghost and the selection', !document.querySelector('.ghost') && !anySel());
    await release(p);
    ck('[D12] the release after Escape does nothing', notPlaced(t) && !anySel());
    if (MODE === 'classic') { await tap(cup()); await esc(); ck('[D12] Escape clears a selected piece', !isSel(cup())); }
    await tap(tube(0));
    if (MODE === 'tapPlace') { await esc(); p = down(...center(tube(0))); await hold(p, 650); await release(p); }
    $('btnHelp').click(); await esc();
    ck('[D12] with a sheet open, Escape closes only the sheet', $('ovHelp').hidden && isSel(tube(0)));
    await esc();
    await setup(B, [2]);
    if (MODE === 'classic') await tap(cup()); else { p = down(...center(tube(0))); await hold(p, 650); await release(p); }
    $('ovAd').hidden = false; await esc();
    ck('[D12] Escape with an ad on screen leaves the selection alone', MODE === 'classic' ? isSel(cup()) : isSel(tube(0)));
    $('ovAd').hidden = true; await esc();

    // a tap that began on a sheet which closes before the finger lifts (an ad countdown ending)
    await setup(B, [2]); t = G().turn;
    $('ovAd').hidden = false;
    const q = down(...center(tube(2)));
    $('ovAd').hidden = true;
    await sleep(30); up(q); await sleep(40);
    ck('a tap that began on a sheet does not reach the bottles under it', notPlaced(t) && !anySel(), JSON.stringify(G().bottles));

    if (PT === 'touch') {
      // reduced effects open the result sheet inside the placing tap; the tap's own click must not land on it
      const red = $('optReduce'), was = red.checked;
      if (!was) { red.checked = true; red.dispatchEvent(new Event('change', { bubbles: true })); }
      await setup([[1, 2, 3], [2, 3, 1, 0], [3, 1, 2, 0], [1, 3, 2, 1], [2, 1, 3, 2], [3, 2, 1, 3]], [0]);
      let ovClicks = 0; const count = () => { ovClicks++; };
      $('ovOver').addEventListener('click', count);
      if (MODE === 'classic') await tap(cup());
      await tap(tube(0));
      $('ovOver').removeEventListener('click', count);
      ck('the placement that ends the run opens the result sheet', !$('ovOver').hidden && G().over);
      ck('the tap that ended the run does not click the result sheet', ovClicks === 0 && $('ovAd').hidden && $('ovThemes').hidden, `${ovClicks} clicks, ad ${!$('ovAd').hidden}, themes ${!$('ovThemes').hidden}`);
      document.querySelectorAll('.overlay').forEach(o => { o.hidden = true; });
      if (!was) { red.checked = false; red.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    if (TRAY === 'bottom') {
      await setup(B, [2]);
      const inc = document.querySelector('.incoming').getBoundingClientRect(), rk = $('rack').getBoundingClientRect();
      const inf = document.querySelector('.info').getBoundingClientRect(), stb = $('status').getBoundingClientRect();
      ck('[bottom] the piece tray sits right under the bottles', inc.top >= rk.bottom - 1 && inc.top - rk.bottom <= 24, `${inc.top} vs ${rk.bottom}`);
      ck('[bottom] zone info and the status line sit above the bottles', inf.bottom <= rk.top && stb.bottom <= rk.top, `info ${inf.bottom}, status ${stb.bottom}, rack ${rk.top}`);
      ck('[bottom] the prototype note is hidden', getComputedStyle(document.querySelector('.foot')).display === 'none');
      t = G().turn;
      let p = await press(cup()); await moveTo(p, ...center(tube(2)), true);
      const fingerBelow = p.y - center(tube(2))[1];
      await release(p);
      ck('[bottom] the drop is judged where the ghost is, drawn above the finger', G().turn === t + 1 && G().bottles[2].length === 2 && fingerBelow >= 20, `finger ${Math.round(fingerBelow)}px below, ${JSON.stringify(G().bottles)}`);
      await setup(B, [2]); t = G().turn;
      p = await press(cup()); await moveTo(p, p.x, p.y - 20);
      ck('[bottom] a short push on the piece shows no landing hint', !document.querySelector('#rack .tube.hover'));
      await release(p);
      ck('[bottom] letting go of that short push is a tap, not a drop', notPlaced(t) && (MODE === 'classic' ? isSel(cup()) : status() === '병을 누르면 바로 들어가요'), status());
      await esc();
      await setup(B, [2]);
      const rk0 = $('rack').getBoundingClientRect();
      const s2 = G(); s2.stuck = 'room'; window.__boot({ S: s2 }); await sleep(60);
      const rk1 = $('rack').getBoundingClientRect(), row = $('extraRow').getBoundingClientRect();
      ck('[bottom] the bottles stay put when the give-up row appears', Math.abs(rk1.top - rk0.top) <= 1 && !$('extraRow').hidden && row.height > 0, `${rk0.top} -> ${rk1.top}`);
      ck('[bottom] the give-up row sits up under the score, away from the thumb', row.bottom <= rk1.top && row.top >= document.querySelector('.scorebar').getBoundingClientRect().bottom, `row ${row.top}-${row.bottom}, rack ${rk1.top}`);
      t = G().turn;
      if (MODE === 'classic') await tap(cup());
      await tap(tube(2));
      ck('[bottom] a bottle tap still places while the give-up row shows', G().turn === t + 1, status());
    }

    // keyboard only, ten turns, with one pour on the way
    const s = G();
    s.rules = Object.assign({}, s.rules, { bottles: 8 });
    await setup(Array.from({ length: 8 }, () => []), [0]);
    t = G().turn;
    let pourDone = false;
    for (let k = 0; k < 10; k++) {
      const st = G();
      if (!pourDone && st.bottles[0].length) {
        if (MODE === 'tapPlace') { await key(tube(0), 'Enter', true); await key(tube(7), 'Enter'); } else { await key(tube(0), 'Enter'); await key(tube(7), 'Enter'); }
        pourDone = G().bottles[7].length > 0;
      }
      const cur = G();
      let best = -1; cur.bottles.forEach((b, i) => { if (cur.rules.cap - b.length >= cur.piece.length && (best < 0 || b.length < cur.bottles[best].length)) best = i; });
      if (best < 0) break;
      if (MODE === 'tapPlace') await key(tube(best), 'Enter'); else { await key(cup(), 'Enter'); await key(tube(best), 'Enter'); }
    }
    ck('keyboard only: ten turns with a pour', G().turn === t + 10 && pourDone, `turns ${G().turn - t}, pour ${pourDone}`);
    ck('[D8] the page does not scroll vertically', document.documentElement.scrollHeight <= innerHeight + 1, `${document.documentElement.scrollHeight} > ${innerHeight}`);
    ck('no ghost element left over', !document.querySelector('.ghost'));
  }

  // ---------- 6.3 pour hint ----------
  async function hintTests() {
    const arc = () => document.querySelector('#fxLayer .pour-hint .arc');
    const ends = () => { const a = arc(), L = a.getTotalLength(); return [a.getPointAtLength(0), a.getPointAtLength(L)]; };
    const inBox = (p, el) => { const r = el.getBoundingClientRect(); return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom; };
    // after [0] goes into the empty bottle 3, pouring 0 -> 1 or 1 -> 0 completes a bottle: the hint takes 0 -> 1
    const DONE = [[1, 1, 1], [1], [0], [], [2], [3]];
    const done = async () => { await setup(DONE, [0]); if (MODE === 'classic') await tap(cup()); await tap(tube(3)); };
    if (MODE === 'classic') {
      let t = G().turn;
      await done();
      ck('[6.3] classic: no pour hint', G().turn === t + 1 && !arc(), JSON.stringify({before:t,after:G().turn,arc:!!arc(),selected:anySel(),status:status(),inert:document.querySelector('.app').inert}));
      return;
    }
    // the only completing pour goes out of the spare cup: no hint
    const sp = G(); sp.rules.spare = true;
    await setup([[1, 1, 1], [0], [2], [], [3], [0, 2]], [0], { spare: [1], spareTurn: sp.turn });
    let t = G().turn;
    await tap(tube(3));
    ck('[6.3] no hint when only a pour from the spare cup would complete a bottle', G().turn === t + 1 && !arc());
    G().rules.spare = false;
    t = G().turn;
    await done();
    ck('[6.3] a placement that leaves a completing pour draws the hint', G().turn === t + 1 && !!arc());
    if (!arc()) return;
    const [p0, p1] = ends();
    ck('[6.3] the arrow starts in the source bottle and ends in the target (completing, lowest source first)', inBox(p0, tube(0)) && inBox(p1, tube(1)), `${Math.round(p0.x)},${Math.round(p0.y)} -> ${Math.round(p1.x)},${Math.round(p1.y)}`);
    ck('[6.3] the arrow is labelled', (document.querySelector('#fxLayer .pour-hint-label') || {}).textContent === '끌어서 부어요');
    ck('[6.3] the hint takes no input and leaves the status line alone', getComputedStyle($('fxLayer')).pointerEvents === 'none' && !status().includes('끌어서'), status());
    // prefs.reduceFx is still its default here: on when the system asks for reduced motion
    ck('[6.3] the arrow moves only without reduced effects', document.querySelector('.pour-hint').classList.contains('moving') === !matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (PT === 'touch') {
      t = G().turn;
      await tapAt(p1.x, p1.y);   // bottle 1 has room for any piece
      ck('[6.3] a tap on the bottle under the arrow places as usual and the arrow goes', G().turn === t + 1 && !arc(), G().turn - t);
      ck('[6.3] once per run', (await done(), !arc()));
      await newRun(); await done();
      ck('[6.3] the next run shows it again', !!arc());
      await tapAt(...center($('status')));
      ck('[6.3] any input clears it', !arc());
      await newRun();
      await stuckCase();
      await newRun(); await done();
      ck('[6.3] after three hints on this device the fourth run shows none', !arc() && JSON.parse(localStorage.getItem('wsurv.prefs')).pourHints === 3, localStorage.getItem('wsurv.prefs'));
    } else {
      await esc();
      await newRun();
      await stuckCase();
      await setup(B, [2]);
      const p = await press(tube(0)); await moveTo(p, ...center(tube(5))); await release(p);
      ck('[6.3] a pour in tapPlace uses up the hints, stored on the device (a reload keeps it)', G().bottles[5].length === 1 && JSON.parse(localStorage.getItem('wsurv.prefs')).pourHints === 3, localStorage.getItem('wsurv.prefs'));
      await newRun(); await done();
      ck('[6.3] after that pour no run shows the hint', !arc());
    }
    await esc();

    // no room for the 2-cell piece after the placement; one pour (0 -> 5, or 5 -> 0) makes room
    async function stuckCase() {
      const s0 = G();
      let turn = -1;
      for (let k = 1; k < 18 && turn < 0; k++) if (pieceAt(s0.seed, s0.rules, k + 1).length === 2 && !isTwinTurn(s0.rules, k + 1)) turn = k;
      if (turn < 0) { ck('[6.3] stuck case: a 2-cell piece within the first zone', false); return; }
      await setup([[0, 1, 2], [1, 2, 3], [2, 3, 0], [3, 0, 1], [0, 1, 2, 3], [2, 3]], [2], { turn, cum: Array(turn).fill(0) });
      await tap(tube(5));
      const s = G();
      const ok = !!arc() && inBox(ends()[0], tube(0)) && inBox(ends()[1], tube(5));
      ck('[6.3] no room for the piece: the hint shows the one pour that makes room, lowest source first', s.stuck === 'room' && ok, `stuck ${s.stuck}, piece ${s.piece.length}, arc ${!!arc()}`);
    }
  }

  // ---------- drag pour between bottles (both schemes, after checkpoint C) ----------
  async function dragPourTests() {
    const ghost = () => document.querySelector('.ghost.pour');
    // B = [[0,1],[1,1,2],[2],[3,3,3],[0,0,1,2],[]]: bottle 1 carries one layer of colour 2
    await setup(B, [2]); let t = G().turn;
    let p = await press(tube(1));
    await moveTo(p, center(tube(1))[0] + 12, center(tube(1))[1]);
    ck('[drag] a small move inside the bottle is not a drag yet', !ghost() && !isSel(tube(1)));
    await moveTo(p, ...center(tube(5)), true);
    let gh = ghost(), gr = gh && gh.getBoundingClientRect();
    ck('[drag] out of its bottle, the liquid it carries follows the finger', !!gh && gh.querySelectorAll('.layer').length === 1
      && gh.querySelector('.layer').style.getPropertyValue('--lc') === 'var(--liq2)' && Math.abs(gr.left + gr.width / 2 - p.x) < 12 && gr.top < p.y,
      gh ? `${Math.round(gr.left + gr.width / 2)} vs ${Math.round(p.x)}, top ${Math.round(gr.top)} vs ${Math.round(p.y)}` : 'no ghost');
    ck('[drag] the source is marked and the bottle under the finger shows the landing', isSel(tube(1)) && tube(5).classList.contains('hover'));
    cloudPush('dev-drag'); await sleep(30);
    ck('[drag] a cloud merge keeps the carried liquid and the landing mark', !!ghost() && tube(5).classList.contains('hover'));
    await release(p);
    ck('[drag] letting go over a bottle pours, and the carried liquid goes with it', G().bottles[5].join() === '2' && G().bottles[1].join() === '1,1' && notPlaced(t) && !ghost() && !anySel(), JSON.stringify(G().bottles));
    await setup(B, [2]);
    p = await press(tube(1)); await moveTo(p, ...center(tube(3)));
    ck('[drag] a bottle that cannot take it shows a reject', tube(3).classList.contains('reject'));
    await release(p);
    ck('[drag] dropping there pours nothing and shakes it', G().bottles[1].join() === '1,1,2' && tube(3).classList.contains('shake') && !anySel());
    await sleep(260);
    ck('[drag] the refused liquid glides back and is gone', !ghost());
    await setup(B, [2]);
    p = await press(tube(1)); await moveTo(p, ...center($('status'))); await release(p);
    await sleep(260);
    ck('[drag] a drop outside the bottles pours nothing and leaves no ghost', G().bottles[1].join() === '1,1,2' && !ghost() && !anySel());
    await setup(B, [2]);
    p = await press(tube(1)); await moveTo(p, ...center(tube(5))); await esc();
    ck('[drag] Escape drops the pour drag and the liquid it carries', !ghost() && !anySel());
    await release(p);
    ck('[drag] the release after Escape pours nothing', G().bottles[5].length === 0);
    await setup(B, [2]); t = G().turn;
    await jitterTap(tube(1), 14);
    ck('[drag] a tap that wobbles 14px inside a bottle with liquid is still a tap', MODE === 'classic' ? isSel(tube(1)) : G().turn === t + 1 && G().bottles[1].length === 4, JSON.stringify(G().bottles));
    await esc();
    if (MODE === 'classic') {
      await setup(B, [2]); await tap(cup());
      p = await press(tube(1)); await moveTo(p, ...center(tube(5))); await release(p);
      ck('[drag] classic: with the piece picked up, a drag between bottles still pours', G().bottles[5].join() === '2' && !anySel(), JSON.stringify(G().bottles));
    }
  }

  // ---------- give up asks for a second press (checkpoint C, decision 6) ----------
  async function giveUpTests() {
    const ex = $('btnExtra'), nb = $('btnNew');
    await setup(B, [2], { stuck: 'room', turn: 5 });
    ck('[C6] stuck: the give-up button shows', !$('extraRow').hidden && ex.textContent === '포기하고 결과 보기');
    const w0 = ex.getBoundingClientRect().width;
    await tap(ex);
    ck('[C6] one press keeps the run and asks for another', !G().over && ex.textContent === '한 번 더 누르면 포기' && status() === '3초 안에 한 번 더 누르면 이 판을 끝내요', `${ex.textContent} / ${status()}`);
    ck('[C6] the asking label keeps the button about as wide', Math.abs(ex.getBoundingClientRect().width - w0) <= 16, `${w0} -> ${ex.getBoundingClientRect().width}`);
    await tap(ex);
    ck('[C6] a second press within 3 seconds gives up', G().over && G().overReason === 'gaveup' && !$('ovOver').hidden);
    closeSheets();
    await setup(B, [2], { stuck: 'room', turn: 5 });
    await tap(ex); await sleep(3100);
    ck('[C6] after 3 seconds the question lapses', !G().over && ex.textContent === '포기하고 결과 보기');
    await tap(ex);
    if (MODE === 'classic') await tap(cup());
    await tap(tube(5));
    ck('[C6] a placement calls the question off', !G().over && ex.textContent !== '한 번 더 누르면 포기' && !status().startsWith('3초 안에'), status());
    await setup(B, [2], { stuck: 'room', turn: 5 });
    await tap(nb); await tap(ex);
    ck('[C6] new game and give up do not wait at the same time', nb.textContent === '새 게임' && ex.textContent === '한 번 더 누르면 포기' && !G().over);
    await sleep(3100);
    await setup(B, [2], { turn: 5, over: true, overReason: 'gaveup' });
    $('btnPeek').click(); await sleep(30);
    ex.click(); await sleep(30);
    ck('[C6] after the run is over the button opens the results at once', !$('ovOver').hidden && ex.textContent === '결과 보기');
    closeSheets();
  }

  // ---------- the defaults: classic, piece tray under the bottles ----------
  async function caseTests() {
    const stored = () => JSON.parse(localStorage.getItem('wsurv.prefs') || '{}');
    const app = document.querySelector('.app');
    if (CASE === 'defaults') {
      ck('[default] nothing picked: the scheme is classic', document.documentElement.dataset.controls === 'classic');
      ck('[default] nothing picked: the piece tray is under the bottles', app.classList.contains('tray-bottom')
        && document.querySelector('.incoming').getBoundingClientRect().top >= $('rack').getBoundingClientRect().bottom - 1);
      ck('[default] no notice pops up for a player who never picked', $('ovCtl').hidden && document.querySelectorAll('.overlay:not([hidden])').length === 0);
      ck('[default] the defaults are not written into the stored settings', !('controls' in stored()) && !('tray' in stored()), JSON.stringify(stored()));
      $('btnSettings').click();
      ck('[default] the settings show the defaults, and two layouts', $('optControls').value === 'classic' && $('optTray').value === 'bottom' && [...$('optTray').options].map(o => o.value).join() === 'top,bottom');
      closeSheets();
      await setup(B, [2]); const t = G().turn;
      const p = await press(cup()); await moveTo(p, ...center(tube(5)), true); await release(p);
      ck('[default] dragging the piece up onto a bottle places it', G().turn === t + 1 && G().bottles[5].join() === '2', JSON.stringify(G().bottles));
      await tap(tube(2)); await tap(tube(5));
      ck('[default] tapping two bottles pours', G().bottles[5].join() === '2,2' && G().bottles[2].length === 0, JSON.stringify(G().bottles));
    }
    if (CASE === 'newuser') {
      ck('[default] a first visit opens the help, for dragging the piece up', !$('ovHelp').hidden && $('helpPlace').textContent === '아래에 나온 조각을 병으로 끌어 올리거나, 조각을 누른 뒤 병을 누르세요.', $('helpPlace').textContent);
      ck('[default] a first visit plays the tray-under-the-bottles layout', app.classList.contains('tray-bottom'));
      closeSheets();
      ck('[default] the first turn says to drag the piece in', status() === '조각을 병으로 끌어다 놓으며 시작하세요.', status());
    }
    if (CASE === 'low') {
      ck('[default] a stored low layout (removed) reads as the tray under the bottles', app.classList.contains('tray-bottom') && !app.classList.contains('tray-low'));
      $('btnSettings').click();
      ck('[default] the settings show it as the tray under the bottles', $('optTray').value === 'bottom');
      closeSheets();
    }
  }

  // ---------- 6.2 undo nudge ----------
  async function nudgeTests() {
    const lit = () => $('btnUndo').classList.contains('nudge');
    const fresh = { undoLeft: 3, undoUsed: 0 };
    if (MODE === 'classic') {
      await setup(B, [2], fresh); await tap(cup()); await tap(tube(5));
      ck('[6.2] classic: a placement does not outline undo', G().bottles[5].length === 1 && !lit());
      return;
    }
    await setup(B, [2], fresh);
    const before = JSON.stringify(G().bottles), quick0 = (row(KEY) || {}).quickUndos || 0;
    await tap(tube(5));
    const ub = $('btnUndo').getBoundingClientRect();
    ck('[6.2] a placement by bottle tap outlines the undo button, label and size unchanged', lit() && $('btnUndo').textContent === '되돌리기 3' && Math.round(ub.height) === 44, `${$('btnUndo').className} ${$('btnUndo').textContent} ${ub.height}`);
    cloudPush('dev-nudge'); await sleep(30);
    ck('[6.2] the outline stays through a render from a cloud merge', lit());
    await tap(tube(4));
    ck('[6.2] a refused tap leaves it on', lit() && tube(4).classList.contains('shake'));
    await tap($('btnUndo'));
    const s = G();
    ck('[6.2] pressing it goes back to before the placement', JSON.stringify(s.bottles) === before && s.undoLeft === 2 && s.undoUsed === 1 && !lit(), `${JSON.stringify(s.bottles)} left ${s.undoLeft} used ${s.undoUsed}`);
    ck('[6.2] and counts as a quick undo', (row(KEY) || {}).quickUndos === quick0 + 1, JSON.stringify(row(KEY)));
    await setup(B, [2], fresh); await tap(tube(5));
    await sleep(5100);
    ck('[6.2] the outline goes after 5 seconds', !lit());
    // C decision 4: every placement by bottle tap lights it again for 5 seconds
    await setup(B, [2], fresh); await tap(tube(5)); let t = G().turn;
    await sleep(3000);
    await tap(tube(2));
    await sleep(3000);
    ck('[6.2] another placement by bottle tap lights it again for 5 seconds', G().turn === t + 1 && lit());
    await sleep(2300);
    ck('[6.2] and it goes 5 seconds after that placement', !lit());
    await setup(B, [2], fresh); await tap(tube(5));
    let p = await press(tube(1)); await moveTo(p, ...center(tube(5))); await release(p);
    ck('[6.2] a pour turns it off', G().bottles[5].join() === '2,2' && !lit(), JSON.stringify(G().bottles));
    await setup(B, [2], fresh); await tap(tube(5));
    p = down(...center(tube(0))); await hold(p, 650); await release(p);
    ck('[6.2] a long press that picks a source turns it off', isSel(tube(0)) && !lit());
    await esc();
    await setup(B, [2], fresh); t = G().turn;
    p = await press(cup()); await moveTo(p, ...center(tube(5)), true); await release(p);
    ck('[6.2] a placement by dragging the piece gives no outline', G().turn === t + 1 && !lit());
    await setup(B, [2], fresh); await tap(tube(5));
    $('btnSettings').click(); await sleep(20);
    ck('[6.2] opening a sheet turns it off', !lit());
    closeSheets();
    const red = $('optReduce'), was = red.checked;
    if (!was) { red.checked = true; red.dispatchEvent(new Event('change', { bubbles: true })); }
    await setup(B, [2], fresh); await tap(tube(5));
    ck('[6.2] with reduced effects the outline does not blink', lit() && $('btnUndo').classList.contains('still') && getComputedStyle($('btnUndo')).animationName === 'none', getComputedStyle($('btnUndo')).animationName);
    if (!was) { red.checked = false; red.dispatchEvent(new Event('change', { bubbles: true })); }
    await setup(B, [2], { undoLeft: 0 }); await tap(tube(5));
    ck('[6.2] no outline when no undo is left', !lit());
  }

  // ---------- 6.4 new game confirmation ----------
  async function newGameTests() {
    const nb = $('btnNew');
    await setup(B, [2], { turn: 5 });
    let seed = G().seed;
    await tap(nb);
    ck('[6.4] one press on a run in progress keeps the run', G().seed === seed && G().turn === 5);
    ck('[6.4] the button asks for one more press, the status line says why', nb.textContent === '한 번 더' && status() === '3초 안에 한 번 더 누르면 새 판을 시작해요' && Math.round(nb.getBoundingClientRect().height) === 44, `${nb.textContent} / ${status()} / ${nb.getBoundingClientRect().height}`);
    cloudPush('dev-ng'); await sleep(30);
    ck('[6.4] a render from a cloud merge keeps the question', nb.textContent === '한 번 더');
    await tap(nb);
    ck('[6.4] a second press within 3 seconds starts a new run', G().seed !== seed && G().turn === 0 && nb.textContent === '새 게임', nb.textContent);
    await setup(B, [2], { turn: 5 }); seed = G().seed;
    await tap(nb); await sleep(3100);
    ck('[6.4] after 3 seconds the question lapses', nb.textContent === '새 게임' && G().seed === seed);
    await tap(nb);
    ck('[6.4] a press after the lapse asks again instead of starting', G().seed === seed && nb.textContent === '한 번 더');
    if (MODE === 'classic') await tap(cup());
    await tap(tube(5));
    ck('[6.4] a placement calls the question off', nb.textContent === '새 게임' && G().turn === 6);
    await tap(nb);
    ck('[6.4] so the next press within 3 seconds asks again', G().seed === seed && nb.textContent === '한 번 더');
    await sleep(3100);
    await setup(B, [2], { turn: 5 }); seed = G().seed;
    await key(nb, 'Enter');
    for (let k = 0; k < 3; k++) {
      const d = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', repeat: true, bubbles: true, cancelable: true, composed: true });
      nb.dispatchEvent(d);
      if (!d.defaultPrevented) nb.click();
      await sleep(20);
    }
    ck('[6.4] a held Enter (repeated keydown) does not start a new run', G().seed === seed && nb.textContent === '한 번 더');
    await sleep(3100);
    await setup(B, [2], { turn: 0 }); seed = G().seed;
    await tap(nb);
    ck('[6.4] at turn 0 one press starts a new run', G().seed !== seed);
    await setup(B, [2], { turn: 5, over: true, overReason: 'gaveup' }); seed = G().seed;
    nb.click(); await sleep(30);
    ck('[6.4] after game over one press starts a new run', G().seed !== seed && !G().over);
    closeSheets();
  }

  // ---------- 6.5 texts ----------
  async function textTests() {
    const help = () => { $('btnHelp').click(); const r = [$('helpPlace').textContent, $('helpPour').textContent]; closeSheets(); return r; };
    const TAP = ['조각이 들어갈 병을 누르세요. 조각을 병으로 끌어도 돼요.', '병에서 병으로 끌거나, 병을 길게 누른 뒤 다른 병을 누르면 맨 위 색이 옮겨가요.'];
    const CLASSIC = [TRAY === 'bottom' ? '아래에 나온 조각을 병으로 끌어 올리거나, 조각을 누른 뒤 병을 누르세요.' : '위에 나온 조각을 병으로 끌어다 놓거나, 조각을 누른 뒤 병을 누르세요.',
      '병을 누르고 다른 병을 누르면 맨 위 색이 옮겨가요. 병에서 병으로 끌어도 돼요.'];
    const mine = MODE === 'tapPlace' ? TAP : CLASSIC, other = MODE === 'tapPlace' ? CLASSIC : TAP;
    let h = help();
    ck('[6.5] help lines for placing and pouring follow the scheme', h[0] === mine[0] && h[1] === mine[1], h.join(' / '));
    await setScheme(MODE === 'tapPlace' ? 'classic' : 'tapPlace');
    h = help();
    ck('[6.5] the help picks its lines again when opened after a scheme switch', h[0] === other[0] && h[1] === other[1], h.join(' / '));
    await setScheme(MODE);
    await setup(B, [2], { turn: 3 });
    ck('[6.5] the everyday status line follows the scheme', status() === (MODE === 'tapPlace' ? '병을 눌러 조각을 넣고, 병끼리 끌어 부어서 한 색으로 채우세요.' : '조각을 넣고, 병끼리 부어서 한 색으로 채우세요.'), status());
  }

  // ---------- 5 play-test record ----------
  async function playtestTests() {
    $('btnSettings').click();
    const since0 = (record() || {}).since;
    await sleep(15);
    $('btnPtReset').click();
    let r = record();
    ck('[5] reset empties the record and restarts its clock', !!r && r.v === 1 && Object.keys(r.by).length === 0 && r.since !== since0 && $('ptText').value.includes('아직 기록이 없어요'), JSON.stringify(r));
    closeSheets();
    const fresh = { undoLeft: 3, undoUsed: 0 };
    // 3 placements by tap
    for (let k = 0; k < 3; k++) { await setup(B, [2]); if (MODE === 'classic') await tap(cup()); await tap(tube(5)); }
    let p;
    if (MODE === 'tapPlace') {
      for (let k = 0; k < 2; k++) { await setup(B, [2]); p = await press(tube(0)); await moveTo(p, ...center(tube(5))); await release(p); }
      await setup(B, [2]); p = down(...center(tube(0))); await hold(p, 650); await release(p); await tap(tube(5));
      await setup(B, [2]); await key(tube(0), 'Enter', true); await key(tube(5), 'Enter');
    } else {
      for (let k = 0; k < 2; k++) { await setup(B, [2]); await tap(tube(0)); await tap(tube(5)); }
      await setup(B, [2]); await key(tube(0), ' '); await key(tube(5), ' ');
    }
    // 2 refusals
    await setup(B, [2, 3]);
    if (MODE === 'classic') { await tap(cup()); await tap(tube(4)); await tap(tube(3)); await tap(cup()); } else { await tap(tube(4)); await tap(tube(3)); }
    // drops outside the rack, then Escape on a selection and on a drag
    await setup(B, [2]); p = await press(cup()); await moveTo(p, ...center($('status')), true); await release(p);
    if (MODE === 'tapPlace') { await setup(B, [2]); p = await press(tube(0)); await moveTo(p, ...center($('status'))); await release(p); }
    await setup(B, [2]);
    if (MODE === 'classic') await tap(cup()); else { p = down(...center(tube(0))); await hold(p, 650); await release(p); }
    await esc();
    await setup(B, [2]); p = await press(cup()); await moveTo(p, ...center(tube(2)), true); await esc(); await release(p);
    // 2 undos: one right after a placement by tap (quick), one after a pour
    await setup(B, [2], fresh); if (MODE === 'classic') await tap(cup()); await tap(tube(5)); await tap($('btnUndo'));
    await setup(B, [2], fresh);
    if (MODE === 'tapPlace') { p = await press(tube(0)); await moveTo(p, ...center(tube(5))); await release(p); } else { await tap(tube(0)); await tap(tube(5)); }
    await tap($('btnUndo'));
    // a new-game question left to lapse
    await setup(B, [2], { turn: 5 }); await tap($('btnNew')); await sleep(3100);
    r = row(KEY);
    const want = MODE === 'tapPlace'
      ? { runs: 0, turns: 4, pours: { tap: 0, drag: 3, hold: 1, key: 1 }, pourLikeTaps: 0, quickUndos: 1, undos: 2, rejects: 2, cancels: 4, newGameAborts: 1 }
      : { runs: 0, turns: 4, pours: { tap: 3, drag: 0, hold: 0, key: 1 }, pourLikeTaps: 0, quickUndos: 1, undos: 2, rejects: 2, cancels: 3, newGameAborts: 1 };
    ck('[5] every counted input lands exactly once under its scheme/layout key', JSON.stringify(r) === JSON.stringify(want), `got ${JSON.stringify(r)}`);
    ck('[5] nothing is counted under any other key', Object.keys(record().by).join() === KEY, Object.keys(record().by).join());

    // pour-like taps: tapPlace only, a bottle that could have taken the pour, within 1s, nothing in between
    const plt = () => (row(KEY) || {}).pourLikeTaps || 0;
    let n0 = plt();
    if (MODE === 'tapPlace') {
      await setup(B, [2]); await tap(tube(2)); await tap(tube(5));
      ck('[5] a quick tap on a bottle the placed-into one could pour into counts once', plt() === n0 + 1, plt() - n0);
      n0 = plt();
      await setup(B, [2]); await tap(tube(2)); await tap(tube(3));
      ck('[5] a quick tap on a bottle it could not pour into does not count', plt() === n0);
      await setup(B, [2]); await tap(tube(2)); await sleep(1100); await tap(tube(5));
      ck('[5] a tap after more than a second does not count', plt() === n0);
      await setup(B, [2]); await tap(tube(2)); await tapAt(...center($('status'))); await tap(tube(5));
      ck('[5] an input in between breaks the pair', plt() === n0);
    } else {
      await setup(B, [2]); await tap(cup()); await tap(tube(2)); await tap(tube(1));
      ck('[5] classic counts no pour-like taps', plt() === n0);
      await esc();
    }

    // runs: counted when a run starts, under the key of that moment; a scheme switch mid-run moves later counts
    $('btnSettings').click(); $('btnPtReset').click(); closeSheets();
    await newRun();
    const other = MODE === 'classic' ? 'tapPlace' : 'classic';
    await setScheme(other);
    await setup(B, [2]); if (other === 'classic') await tap(cup()); await tap(tube(5));
    const a = row(KEY), b = row(`${other}/${TRAY}`);
    ck('[5] a scheme switch mid-run: later moves count under the new key, the run only under the first', !!a && a.runs === 1 && a.turns === 0 && !!b && b.runs === 0 && b.turns === 1, JSON.stringify(record().by));
    await setScheme(MODE);
    $('btnSettings').click();
    ck('[5] the settings sheet shows one line per key', $('ptText').value.split('\n').length === 3 && $('ptText').value.includes(`${KEY} · 1판 0턴`), $('ptText').value);
    closeSheets();

    // the record stays on the device: the cloud document holds only what it held before
    await setup([[1, 2, 3], [2, 3, 1, 0], [3, 1, 2, 0], [1, 3, 2, 1], [2, 1, 3, 2], [3, 2, 1, 3]], [0]);
    if (MODE === 'classic') await tap(cup());
    await tap(tube(0));
    await sleep(2600);
    const doc = window.__cloud.store[JSON.parse(localStorage.getItem('wsurv.device'))] || {};
    const keys = Object.keys(doc).sort().join();
    ck('[5] the cloud save (made after the run ended) carries no play-test record', G().over && doc.savedAt >= record().since && keys === 'best,daily,device,owned,savedAt,starsDaily,starsMine,unlock,v', `${keys} saved ${doc.savedAt} since ${record().since}`);
    closeSheets();
  }

  // ---------- geometry ----------
  async function geomTests() {
    const size = P.get('size'), rules = P.get('rules') || 'default';
    // measure the settled page: while the web fonts load, a fallback font can wrap the header for a moment (+25px)
    try { await Promise.race([document.fonts.ready, sleep(5000)]); } catch (e) { /* no font loading API */ }
    const s = G();
    s.piece = [0, 1]; s.flipped = false;
    s.spare = []; s.rules.spare = true; s.spareTurn = s.turn;
    window.__boot({ S: s }); await sleep(120);
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
    // The hit area along the horizontal and vertical lines through the element's centre: the run of 1px steps where
    // elementFromPoint lands on el (or a child). Corners such as the flip button's badge do not inflate it.
    function hitBox(el) {
      if (!el) return null;
      const [cx, cy] = center(el);
      const on = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
      if (!on(cx, cy)) return { w: 0, h: 0 };
      const span = (dx, dy) => { let n = 0; while (n < 300 && on(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
      return { w: span(-1, 0) + span(1, 0) + 1, h: span(0, -1) + span(0, 1) + 1 };
    }
    const item = el => { const b = box(el); if (!b) return null; const h = hitBox(el); return Object.assign(b, { hitW: h.w, hitH: h.h }); };
    const vh = innerHeight, third = vh * 2 / 3;
    const bottles = [...document.querySelectorAll('#rack .tube')].map(item);
    const rk = $('rack').getBoundingClientRect();
    const rackThird = Math.max(0, rk.bottom - Math.max(rk.top, third)) / rk.height;
    // from the lower end of the bottles' hit area (5.2 lines through each centre) to the nearest control below it
    function gapBelowBottles() {
      const tubes = [...document.querySelectorAll('#rack .tube')];
      let hitBottom = 0;
      for (const el of tubes) {
        const [cx, cy] = center(el);
        let n = 0;
        while (n < 600) { const h = document.elementFromPoint(cx, cy + n + 1); if (!h || !(h === el || el.contains(h))) break; n++; }
        hitBottom = Math.max(hitBottom, cy + n);
      }
      const below = [...document.querySelectorAll('button, select, input, a[href]')]
        .filter(el => !el.closest('#rack, #spareSlot')).map(el => el.getBoundingClientRect())
        .filter(r => r.width > 0 && r.height > 0 && r.top >= hitBottom);
      return below.length ? Math.min(...below.map(r => r.top)) - hitBottom : null;
    }
    const d = {
      size, tray: TRAY, rules, vw: innerWidth, vh,
      scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
      cup: item(cup()), flip: $('btnFlip').hidden ? null : item($('btnFlip')), spare: item(spareTube()), undo: item($('btnUndo')),
      newGame: item($('btnNew')), help: item($('btnHelp')), settings: item($('btnSettings')),
      bottles, rack: { top: rk.top, bottom: rk.bottom }, incoming: box(document.querySelector('.incoming')),
      cupVh: box(cup()).cy / vh, rackInThumbFrac: rackThird, bottlesCentredInThumb: bottles.filter(b => b.cy >= third).length,
      bottleCentreVh: bottles.map(b => +(b.cy / vh).toFixed(3)), gapBelowBottles: gapBelowBottles(),
    };
    // stuck: the give-up row appears; does the rack move?
    const st = G(); st.stuck = 'room'; window.__boot({ S: st }); await sleep(80);
    const ex = $('extraRow');
    d.stuckRowShown = !ex.hidden && getComputedStyle(ex).visibility !== 'hidden';
    d.stuckRackShift = $('rack').getBoundingClientRect().top - rk.top;
    d.stuckScrollH = document.documentElement.scrollHeight;
    d.stuckGapBelowBottles = gapBelowBottles();
    const st2 = G(); st2.stuck = null; window.__boot({ S: st2 }); await sleep(80);
    // the same page in the top layout (same size, rules and motion mode), for the bottom layout's overflow check
    if (TRAY === 'bottom') {
      const sel = $('optTray');
      sel.value = 'top'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
      d.topScrollH = document.documentElement.scrollHeight;
      sel.value = 'bottom'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
    }
    send({ sc: SC, data: d });
    const tag = `[geom ${size} ${TRAY} ${rules}] `;
    const g = (name, cond, detail) => check(tag + name, cond, detail);
    g('no horizontal scroll', d.scrollW <= d.vw + 1, `${d.scrollW} > ${d.vw}`);
    if (rules === 'default') {
      g('[D8] no vertical scroll', d.scrollH <= d.vh + 1, `${d.scrollH} > ${d.vh}`);
      const min44 = (name, it) => g(`${name} hit area at least 44x44`, it && it.hitW >= 44 && it.hitH >= 44, it ? `${it.hitW}x${it.hitH}` : 'missing');
      if (size.startsWith('360')) {
        min44('piece', d.cup);
        min44('undo', d.undo);
        g('every bottle hit area at least 44x44', bottles.every(b => b.hitW >= 44 && b.hitH >= 44), bottles.map(b => `${b.hitW}x${b.hitH}`).join(' '));
        min44('[7.4] flip', d.flip);
        min44('[7.4] spare cup', d.spare);
        g('header buttons at least 24 high', d.help.hitH >= 24 && d.settings.hitH >= 24, `${d.help.hitH}, ${d.settings.hitH}`);
      }
    }
    if (TRAY === 'bottom') {
      g('[bottom] piece tray right under the rack', d.incoming.y >= d.rack.bottom - 1 && d.incoming.y - d.rack.bottom <= 24, `${d.incoming.y} vs ${d.rack.bottom}`);
      g('[bottom] 8px or more between the piece tray and the buttons', d.undo.y - (d.incoming.y + d.incoming.h) >= 8, d.undo.y - (d.incoming.y + d.incoming.h));
      if (rules === 'default') {
        g('[bottom] the bottles stay put when the give-up row appears', d.stuckRowShown && Math.abs(d.stuckRackShift) <= 1, `shown ${d.stuckRowShown}, moved ${d.stuckRackShift}`);
      } else {
        g('[bottom] max settings: no taller than the top layout', d.scrollH <= d.topScrollH, `${d.scrollH} > ${d.topScrollH}`);
      }
    }
  }
};
