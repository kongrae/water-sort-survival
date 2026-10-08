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
  const MODE = P.get('controls') || 'classic', TRAY = P.get('tray') || 'top';
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
  // judge = true: put the point where the game judges a piece drop (the ghost centre in the bottom tray)
  async function moveTo(p, x, y, judge) {
    const n = 6, x0 = p.x, y0 = p.y;
    for (let i = 1; i <= n; i++) { move(p, x0 + (x - x0) * i / n, y0 + (y - y0) * i / n); await sleep(16); }
    if (judge && TRAY === 'bottom') {
      const g = document.querySelector('.ghost');
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

  if (SC === 'geom') return geomTests();

  try {
    if (MODE === 'tapPlace') await tapPlaceTests(); else await classicTests();
    await commonTests();
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
    ck('[D20] classic leaves touch-action on bottles alone', getComputedStyle(tube(0)).touchAction === 'auto', getComputedStyle(tube(0)).touchAction);
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
    if (TRAY === 'bottom') {
      const inc = document.querySelector('.incoming').getBoundingClientRect(), rk = $('rack').getBoundingClientRect();
      ck('bottom tray: the piece tray sits below the bottles', inc.top > rk.bottom - 1, `${inc.top} vs ${rk.bottom}`);
      await setup(B, [2]); t = G().turn;
      const p = await press(cup()); await moveTo(p, ...center(tube(2)), true);
      const fingerBelow = p.y - center(tube(2))[1];
      await release(p);
      ck('bottom tray: the drop is judged where the ghost is, not under the finger', G().turn === t + 1 && G().bottles[2].length === 2 && fingerBelow >= 20, `finger ${Math.round(fingerBelow)}px below, ${JSON.stringify(G().bottles)}`);
    }

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
      await setup(B, [2]); t = G().turn;
      const pp = await press(cup()); await moveTo(pp, pp.x, pp.y - 20);
      ck('bottom tray: a short push on the piece shows no landing hint', !document.querySelector('#rack .tube.hover'));
      await release(pp);
      ck('bottom tray: letting go of that short push is a tap, not a drop', notPlaced(t) && (MODE === 'classic' ? isSel(cup()) : status() === '병을 누르면 바로 들어가요'), status());
      await esc();
      await setup(B, [2]);
      const top0 = $('rack').getBoundingClientRect().top;
      const s2 = G(); s2.stuck = 'room'; window.__boot({ S: s2 }); await sleep(60);
      const top1 = $('rack').getBoundingClientRect().top;
      ck('bottom tray: the bottles stay put when the give-up row appears', Math.abs(top1 - top0) < 1 && getComputedStyle($('extraRow')).visibility !== 'hidden', `${top0} -> ${top1}`);
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

  // ---------- geometry ----------
  async function geomTests() {
    const size = P.get('size'), rules = P.get('rules') || 'default';
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
    const d = {
      size, tray: TRAY, rules, vw: innerWidth, vh,
      scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
      cup: item(cup()), flip: $('btnFlip').hidden ? null : item($('btnFlip')), spare: item(spareTube()), undo: item($('btnUndo')),
      newGame: item($('btnNew')), help: item($('btnHelp')), settings: item($('btnSettings')),
      bottles, rack: { top: rk.top, bottom: rk.bottom }, incoming: box(document.querySelector('.incoming')),
      cupVh: box(cup()).cy / vh, rackInThumbFrac: rackThird, bottlesCentredInThumb: bottles.filter(b => b.cy >= third).length,
    };
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
      g('piece tray below the rack', d.incoming.y >= d.rack.bottom - 1, `${d.incoming.y} vs ${d.rack.bottom}`);
      g('8px or more between the piece tray and the buttons', d.undo.y - (d.incoming.y + d.incoming.h) >= 8, d.undo.y - (d.incoming.y + d.incoming.h));
    }
  }
};
