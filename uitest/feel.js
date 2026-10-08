// Feel tests (test page only): the feel scenario of docs/PROMPT_feel.md, run through input.js's event emulation.
// Checks tagged [Pn] are the defects in that document's 2.5; they are written as the fixed behaviour, so on the
// unfixed page they fail (= reproduced). [Fn] and [Un] are its juicy effects and screen items.
// Timings: a tap (H.tap) moves at its pointerup and returns 30ms later.
window.__feelTests = async function (T, H) {
  const { check, G, $, sleep, send, SC } = T;
  const { down, up, tap, press, moveTo, release, center, setup, cup, tube, anySel, status, cloudPush, closeSheets, record, PT } = H;
  const P = T.P;
  const FX = P.get('fx') === 'juicy' ? 'juicy' : 'base', RFX = P.get('rfx') === '1', CASE = P.get('case') || '';
  const ck = (name, cond, detail) => check(`[feel ${CASE || FX}${RFX ? '+rfx' : ''}/${PT}] ${name}`, cond, detail);

  // a board where pouring bottle 3 into bottle 2 completes it, and pouring 0 into 5 is the next quick move
  const MID = [[0, 1, 1], [2, 2], [3, 3, 3], [0, 0, 3], [1, 5], []];
  // every bottle has one free cell and the piece needs two: stuck, and pouring 0 into 3 makes room
  const STUCK = [[0, 0, 1], [1, 2, 3], [2, 2, 3], [3, 0, 1], [0, 1, 2], [3, 3, 2]];
  // a tap with no pause after it: the next input follows at once
  async function qtap(el) { const p = down(...center(el)); await sleep(8); up(p); }
  const boardKey = () => JSON.stringify([G().bottles, G().turn, G().piece]);
  const q = sel => document.querySelectorAll(sel).length;
  const clearFxNodes = () => q('.burst, .fx-burst');
  const floatNodes = () => q('#rack .float, .fx-float');
  const liveFx = () => q('#fxLayer .fx');
  const waiting = () => q('#rack .layer.await');
  // the checkbox shows the setting only once the settings sheet has opened: always send the change
  const setReduce = on => { const r = $('optReduce'); r.checked = on; r.dispatchEvent(new Event('change', { bubbles: true })); };
  const reduced = () => document.documentElement.classList.contains('fx-reduce');
  // a fresh start for the effects (heat 0, nothing in the air): switch the setting away and back
  const resetFx = () => { const s = $('optFx'), v = stored().fx === 'juicy' ? 'juicy' : 'base'; s.value = v === 'juicy' ? 'base' : 'juicy'; s.dispatchEvent(new Event('change', { bubbles: true })); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); };
  const B6 = [[0, 1], [1, 1, 2], [2], [3, 3, 3], [], []];
  const animSecs = sel => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).animationDuration) || 0 : 0; };
  const fmt = n => n.toLocaleString('ko-KR');
  const scoreText = () => $('score').textContent;
  const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hit = (a, b) => !!a && !!b && a.w > 0 && b.w > 0 && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const shaking = el => el.getAnimations().some(a => { try { return a.effect.getKeyframes().some(k => k.translate); } catch (e) { return false; } });
  const stored = () => JSON.parse(localStorage.getItem('wsurv.prefs') || '{}');

  try {
    if (CASE === 'geo') { await geoTests(); return; }
    if (CASE === 'newuser') { await newUserTests(); return; }
    if (FX === 'juicy' && !RFX) await juicyTests(); else await p1Tests();
    await p2p3Tests();
    if (FX === 'base') await baseExtraTests();
    if (RFX) await rfxTests();
  } catch (e) { ck('feel test exception', false, e && e.stack || e); }

  // ---------- 5. the effect base ----------
  // [P1] a completion's effect lives on the effects layer: the next move, a cloud merge and their render keep it
  async function p1Tests() {
    await setup(MID, [2, 2], { streak: 1, turn: 10 });
    await tap(tube(3)); await tap(tube(2));
    const c0 = clearFxNodes(), f0 = floatNodes();
    await qtap(tube(0)); await qtap(tube(5));
    ck('[P1] a completion makes its burst and score text', c0 >= 1 && f0 >= 1, `${c0} ${f0}`);
    ck('[P1] a move right after a completion keeps its burst and score text', G().bottles[5].join() === '1,1' && clearFxNodes() >= 1 && floatNodes() >= 1,
      `bottles ${JSON.stringify(G().bottles)}, burst ${clearFxNodes()}, text ${floatNodes()}`);
    await sleep(1300);
    ck('[P1] the effect nodes are gone once played', liveFx() === 0 && clearFxNodes() === 0, `${liveFx()} ${clearFxNodes()}`);
    await setup(MID, [2, 2], { streak: 1, turn: 10 });
    await tap(tube(3)); await tap(tube(2));
    cloudPush('dev-feel'); await sleep(40);
    ck('[P1] a cloud merge (render) during the effect keeps it', clearFxNodes() >= 1 && floatNodes() >= 1, `${clearFxNodes()} ${floatNodes()}`);
    await sleep(1300);
    await setup(MID, [2, 2], { streak: 1, turn: 10, undoLeft: 3 });
    await tap(tube(3)); await tap(tube(2));
    $('btnUndo').click(); await sleep(30);
    ck('[P1] an undo takes the undone move\'s effects away', liveFx() === 0 && clearFxNodes() === 0 && floatNodes() === 0, `${liveFx()} ${clearFxNodes()} ${floatNodes()}`);
    ck('effects take no input', getComputedStyle($('fxLayer')).pointerEvents === 'none');
  }
  async function p2p3Tests() {
    // [P2] reduced effects stop the CSS animations too, not only the scripted ones
    const was = reduced();
    setReduce(true);
    await setup(MID, [2, 2], { streak: 1, turn: 10 });
    await tap(tube(3)); await tap(tube(2));
    const d = { burst: animSecs('.burst, .fx-burst'), text: animSecs('#rack .float, .fx-float'), flash: animSecs('.tube.flash .glass, .fx-flash') };
    ck('[P2] with reduced effects a completion does not animate', document.documentElement.classList.contains('fx-reduce') && d.burst <= 0.0001 && d.text <= 0.0001 && d.flash <= 0.0001, JSON.stringify(d));
    ck('[P2] with reduced effects nothing flies, bursts or shakes', q('#fxLayer .fx-blob, #fxLayer .fx-drop, #fxLayer .fx-ring') === 0 && !shaking($('rack')));
    await tap(cup()); await tap(tube(0));
    ck('[P2] with reduced effects a refused bottle does not shake', !!document.querySelector('#rack .tube.shake') && animSecs('#rack .tube.shake') <= 0.0001, animSecs('#rack .tube.shake'));
    setReduce(was);
    ck('[P2] the setting off again: the root drops the class', document.documentElement.classList.contains('fx-reduce') === was);
    await sleep(1200);

    // [P3] a press shows at once, before the release decides what it was
    await setup(MID, [2, 2]);
    let k0 = boardKey(), p = await press(tube(1));
    ck('[P3] pressing a bottle marks it pressed and changes nothing yet', tube(1).classList.contains('press') && boardKey() === k0 && !anySel(), tube(1).className);
    cloudPush('dev-feel-2'); await sleep(30);
    ck('[P3] a render while pressing keeps the mark', tube(1).classList.contains('press'), tube(1).className);
    await release(p);
    ck('[P3] the release takes the mark away (and the tap selects)', !document.querySelector('.tube.press') && tube(1).classList.contains('sel'));
    await setup(MID, [2, 2]);
    k0 = boardKey(); p = await press(cup());
    ck('[P3] pressing the piece marks it pressed and changes nothing yet', cup().classList.contains('press') && boardKey() === k0 && !anySel(), cup().className);
    await release(p);
    ck('[P3] the release takes the piece\'s mark away', !cup().classList.contains('press'));
    await setup(MID, [2, 2]);
    p = await press(cup()); await moveTo(p, ...center(tube(5)), true);
    ck('[P3] a drag takes the press mark away', !document.querySelector('.tube.press'), [...document.querySelectorAll('.tube.press')].map(e => e.id || e.dataset.i).join());
    await release(p);
    await sleep(300);
  }

  // ---------- 6. juicy ----------
  async function juicyTests() {
    // the stage and the status line (U1, U2, F4)
    await setup(MID, [2, 2], { streak: 2, turn: 10, turnClears: 0 });
    const st = box($('stage')), sb = box(document.querySelector('.scorebar')), info = box(document.querySelector('.info'));
    ck('[U1] the stage fills the free space under the score', getComputedStyle($('stage')).display !== 'none' && st.t >= sb.b && st.b <= info.t && st.h >= 56, JSON.stringify({ st, sb: sb.b, info: info.t }));
    ck('[F4] the stage shows the combo with its fuse', $('stCombo').textContent === '×2' && $('stCombo').classList.contains('fuse'), $('stCombo').className + ' ' + $('stCombo').textContent);
    ck('[U1] banners show in the stage', $('bannerLayer').classList.contains('staged') && Math.abs(box($('bannerLayer')).t - st.t) <= 1);
    ck('[U2] the status line leaves the combo to the stage', !status().includes('이번 턴에 병을 완성하면') && status() === '조각을 넣고, 병끼리 부어서 한 색으로 채우세요.', status());

    // [F1] a pour flies; the move is in the state at once
    await setup(MID, [2, 2]);
    await tap(tube(0)); await tap(tube(5));
    ck('[F1] a pour is in the state at once, while two blobs fly and the layers they become wait', G().bottles[5].join() === '1,1' && q('#fxLayer .fx-blob') === 2 && waiting() === 2,
      `bottles ${JSON.stringify(G().bottles)}, blobs ${q('#fxLayer .fx-blob')}, waiting ${waiting()}`);
    cloudPush('dev-feel-3'); await sleep(20);
    ck('[F1] a render during the flight keeps the landing layers hidden', waiting() === 2 && q('#fxLayer .fx-blob') === 2, `${waiting()} ${q('#fxLayer .fx-blob')}`);
    await sleep(240);
    ck('[F1] the pour has landed within 0.26s: no blob, no waiting layer', q('#fxLayer .fx-blob') === 0 && waiting() === 0, `${q('#fxLayer .fx-blob')} ${waiting()}`);
    // a move during a flight is taken at once (principle 2), and a move on the flying bottle lands it first
    await setup(MID, [2, 2], { streak: 1, turn: 10 });
    const s0 = G().score;
    await tap(tube(0)); await qtap(tube(5));
    await tap(tube(3)); await tap(tube(2));
    ck('[F1] a move during a flight is taken at once', G().bottles[2].length === 0 && G().score === s0 + 200, `${JSON.stringify(G().bottles)} ${G().score - s0}`);
    await sleep(1300);
    await setup([[1], [], [1, 1], [2], [3], []], [0]);
    await tap(tube(0)); await qtap(tube(1));
    await qtap(tube(2)); await qtap(tube(1));
    const ls1 = [...tube(1).querySelectorAll('.glass > .layer')];
    ck('[F1] a move into a bottle still waiting lands the earlier flight first', G().bottles[1].join() === '1,1,1' && ls1.length === 3 && !ls1[0].classList.contains('await') && waiting() === 2 && q('#fxLayer .fx-blob') === 2,
      `${JSON.stringify(G().bottles)} waiting ${waiting()} blobs ${q('#fxLayer .fx-blob')}`);
    await sleep(300);

    // [F2] a placement flies from the cup, the next piece slides in; a drag drops in from the finger
    await setup(MID, [2, 2]);
    await tap(cup()); await tap(tube(5));
    ck('[F2] a placement is in the state at once while the piece flies', G().bottles[5].join() === '2,2' && q('#fxLayer .fx-blob') === 2 && waiting() === 2, `${JSON.stringify(G().bottles)} ${q('#fxLayer .fx-blob')} ${waiting()}`);
    const slides = () => cup().getAnimations({ subtree: true }).filter(a => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation) && a.playState !== 'finished');
    ck('[F2] mid-slide the cup button stays in place (a quick tap still finds it)', !cup().getAnimations().some(a => !(a instanceof CSSTransition)) && cup().contains(document.elementFromPoint(...center(cup()))));
    ck('[F2] the next piece slides into the cup', slides().length >= 1);
    // pressed on the cup element itself: mid-slide it is drawn over the queue, where a finger would not press it
    const pe = type => cup().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: 1, clientY: 1, pointerId: 999, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0 }));
    pe('pointerdown');
    ck('[F2] pressing the cup finishes the slide at once', slides().length === 0);
    pe('pointerup');
    await sleep(200);
    ck('[F2] the piece has landed within 0.2s', q('#fxLayer .fx-blob') === 0 && waiting() === 0);
    await setup(MID, [2, 2]);
    let p = await press(cup()); await moveTo(p, ...center(tube(5)), true); await release(p);
    ck('[F2] a dragged piece drops in from the finger', G().bottles[5].join() === '2,2' && q('#fxLayer .fx-blob') === 2, `${JSON.stringify(G().bottles)} ${q('#fxLayer .fx-blob')}`);
    await sleep(120);
    ck('[F2] the drop lands within 0.08s', q('#fxLayer .fx-blob') === 0 && waiting() === 0);
    // a refused bottle: the shake and a red edge
    await setup(MID, [2, 2]);
    await tap(cup()); await tap(tube(0));
    ck('[F2] a refused bottle shakes and flashes a red edge', tube(0).classList.contains('shake') && q('#fxLayer .fx-edge') === 1);
    await sleep(300);

    // [F3] flash, hold (hit-stop), burst; [F4] callout; [F5] the points fly into the score
    await setup(MID, [2, 2], { streak: 3, turn: 10, turnClears: 0, lastBigTurn: -1 });
    const s1 = G().score;
    await tap(tube(3)); await tap(tube(2));
    ck('[F3] a completing pour: the state at once, the bottle shows what it held until the liquid lands', G().bottles[2].length === 0 && G().score === s1 + 400 && q('#fxLayer .fx-col i') === 3,
      `${JSON.stringify(G().bottles)} +${G().score - s1} col ${q('#fxLayer .fx-col i')}`);
    ck('[F5] the score waits for the points', scoreText() === fmt(s1), scoreText());
    await sleep(230);   // 260ms after the move: landed at 190, flash 60 + hold 70 until 320
    ck('[F3] on landing the full bottle flashes and holds; nothing has burst yet', q('#fxLayer .fx-col i') === 4 && q('#fxLayer .fx-drop') === 0, `${q('#fxLayer .fx-col i')} ${q('#fxLayer .fx-drop')}`);
    ck('[F4] the callout and the combo on the stage', $('stCall').textContent === '대단해요!' && $('stCombo').textContent === '×4', `${$('stCall').textContent} ${$('stCombo').textContent}`);
    ck('[F4] the banner keeps its text', !$('banner').hidden && $('banner').textContent === '×4!', $('banner').textContent);
    await sleep(100);   // 360ms
    ck('[F3] then it bursts: drops, a ring, the points take off', q('#fxLayer .fx-drop') >= 36 && q('#fxLayer .fx-ring') === 1 && q('#fxLayer .fx-score') === 1, `drops ${q('#fxLayer .fx-drop')} ring ${q('#fxLayer .fx-ring')} score ${q('#fxLayer .fx-score')}`);
    ck('[F3] a x4 completion shakes the rack and the stage', shaking($('rack')) && shaking($('stage')));
    const drops = [...document.querySelectorAll('#fxLayer .fx-drop')].map(e => e.getAnimations()[0]).filter(Boolean);
    ck('[F3] drops fly for 0.45-0.6s', drops.length > 0 && drops.every(a => a.effect.getTiming().duration >= 450 && a.effect.getTiming().duration <= 600));
    await sleep(940);   // 1.3s
    ck('[F5] the points have arrived: the score shows the run\'s score', scoreText() === fmt(G().score), `${scoreText()} vs ${G().score}`);
    ck('[F3] every effect node is gone once played', liveFx() === 0, liveFx());
    // an undo in the middle takes the effects away and shows the score at once
    await setup(MID, [2, 2], { streak: 3, turn: 10, turnClears: 0, undoLeft: 3 });
    await tap(tube(3)); await tap(tube(2));
    $('btnUndo').click(); await sleep(20);
    ck('[F5] an undo mid-flight: no effect left, the score at once', liveFx() === 0 && waiting() === 0 && scoreText() === fmt(G().score), `${liveFx()} ${scoreText()} ${G().score}`);
    await sleep(400);
    ck('[F5] nothing arrives after the undo', scoreText() === fmt(G().score) && liveFx() === 0);

    // [F6] heat: quick moves warm it; rest cools it; an undo takes 3
    resetFx();
    await setup([[1], [], [2], [3], [4], [5, 5]], [0], { undoLeft: 3 });
    for (let k = 0; k < 10; k++) { const a = k % 2 ? 1 : 0, b = 1 - a; await qtap(tube(a)); await qtap(tube(b)); await sleep(120); }
    const w = () => parseFloat($('stHeatFill').style.width) || 0;
    ck('[F6] ten quick moves warm the heat to 9 and the stage burns', !$('stHeat').hidden && w() === 90 && $('stage').classList.contains('hot'), `${w()} ${$('stage').className}`);
    $('btnUndo').click(); await sleep(20);
    ck('[F6] an undo takes 3 off', w() === 60 && !$('stage').classList.contains('hot'), w());
    await sleep(4300);
    ck('[F6] after a rest it cools: 1 at 2.5s, 1 more every 1.5s', w() === 40, w());

    // [F7] danger: stuck lights the edges; the pour that makes room clears them
    await setup(STUCK, [1, 2], { stuck: 'room' });
    ck('[F7] stuck lights the screen edges', $('danger').classList.contains('on'));
    await tap(tube(0)); await tap(tube(3));
    ck('[F7] the move that makes room clears them with a lift', !G().stuck && $('danger').classList.contains('relief'), $('danger').className);
    await sleep(600);
    ck('[F7] then the edges are clear', $('danger').className === 'danger', $('danger').className);
    const db = box($('danger'));
    ck('[F7] the edges stay outside the bottles (16px gutter)', db.l === 0 && db.t === 0 && box($('rack')).l >= 14);

    // [F8] a zone break: a wave over the stage, each empty bottle's share flies to the score, the twin glows
    await setup([[0], [1], [2], [3], [], []], [0], { turn: 19 });
    const s2 = G().score;
    // the twin's glow is checked as issued (an animation on the cup's glass in the new colour): under the test clock
    // a WAAPI animation can report itself finished at once
    const glows = [], oa = Element.prototype.animate;
    Element.prototype.animate = function (fr, op) { const a = oa.call(this, fr, op); if (this.parentElement === cup()) glows.push(JSON.stringify(fr)); return a; };
    await tap(cup()); await tap(tube(1));
    Element.prototype.animate = oa;
    ck('[F8] a zone break: the wave and two shares in the air', q('#fxLayer .fx-wave') === 1 && q('#fxLayer .fx-score') === 2 && G().score === s2 + 80 && scoreText() === fmt(s2),
      `wave ${q('#fxLayer .fx-wave')} shares ${q('#fxLayer .fx-score')} +${G().score - s2} shown ${scoreText()}`);
    ck('[F8] the banner keeps its text', $('banner').textContent.startsWith('2구역 · 새 색'), $('banner').textContent);
    ck('[F8] the twin piece glows in the cup in its colour', G().piece.join() === '4' && glows.some(f => f.includes('var(--liq4)')), `${JSON.stringify(G().piece)} ${glows.join(' | ')}`);
    await sleep(200);
    await sleep(1000);
    ck('[F8] the bonus has arrived', scoreText() === fmt(G().score), scoreText());

    // the effects setting: switching to base hides the stage and puts the banner back in the middle
    $('btnSettings').click();
    ck('[6.0] the settings show the effects setting picked', $('optFx').value === 'juicy');
    $('optFx').value = 'base'; $('optFx').dispatchEvent(new Event('change', { bubbles: true }));
    ck('[6.0] base: no stage, banners in the middle', document.documentElement.dataset.fx === 'base' && getComputedStyle($('stage')).display === 'none' && !$('bannerLayer').classList.contains('staged'));
    $('optFx').value = 'juicy'; $('optFx').dispatchEvent(new Event('change', { bubbles: true }));
    ck('[6.0] the pick is stored', stored().fx === 'juicy');
    closeSheets();
    await sleep(100);
  }

  // juicy with reduced effects: nothing flies or bursts, the score shows at once, the stage still shows the combo
  async function rfxTests() {
    await setup(MID, [2, 2], { streak: 3, turn: 10, turnClears: 0 });
    await tap(tube(3)); await tap(tube(2));
    ck('[5.2] juicy with reduced effects: no flight, no drops, no shake', q('#fxLayer .fx-blob, #fxLayer .fx-drop, #fxLayer .fx-ring, #fxLayer .fx-score') === 0 && !shaking($('rack')));
    ck('[5.2] the score shows at once', scoreText() === fmt(G().score), scoreText());
    ck('[5.2] the stage still shows the combo', getComputedStyle($('stage')).display !== 'none' && $('stCombo').textContent === '×4');
  }

  // ---------- base only: settings (U4), status (U2), tempo record (8), no coach for existing players ----------
  async function baseExtraTests() {
    ck('[6.0] base: no stage', getComputedStyle($('stage')).display === 'none' && document.documentElement.dataset.fx === 'base');
    ck('[U5] no coach for a player who has seen the help', q('.coach-dot') === 0);
    await setup(MID, [2, 2], { streak: 2, turn: 10, turnClears: 0 });
    ck('[U2] base: the status line still shows the combo goal', status() === '이번 턴에 병을 완성하면 콤보 ×3', status());
    $('btnSettings').click(); await sleep(20);
    const lab = $('labBox'), sh = document.querySelector('#ovSettings .sheet');
    ck('[U4] prototype settings are folded away', lab.tagName === 'DETAILS' && !lab.open && lab.contains($('ptText')) && lab.contains($('optControls')) && lab.contains($('setForm')) && !lab.contains($('optSound')) && !lab.contains($('optFx')));
    ck('[U4] the effects setting shows base', $('optFx').value === 'base' && !('fx' in stored()), JSON.stringify(stored()));
    const folded = sh.scrollHeight;
    lab.open = true; await sleep(20);
    const opened = sh.scrollHeight;
    lab.open = false;
    send({ sc: SC, data: { kind: 'settings', folded, opened, client: sh.clientHeight } });
    ck('[U4] folded, the sheet is shorter', folded < opened, `${folded} ${opened}`);

    // [8] tempo per effects setting, beside the scheme/layout record
    $('btnPtReset').click();
    closeSheets();
    await setup(B6, [2, 2]);
    await tap(cup()); await tap(tube(3));          // a refused placement ([3,3,3] has one cell)
    await H.esc();
    await setup(B6, [2], { undoLeft: 3 });
    await tap(cup()); await tap(tube(5));          // a placement
    await tap(tube(0)); await tap(tube(4));        // a pour within 1.2s: fast
    await sleep(1300);
    await tap(tube(2)); await tap(tube(5));        // a pour after a rest ([2] onto [2])
    $('btnUndo').click(); await sleep(20);
    const r = record(), fx = r && r.fx && r.fx.base;
    ck('[8] the tempo record counts each input once under the setting in use', !!fx && fx.turns === 1 && fx.moves === 3 && fx.fastMoves === 1 && fx.undos === 1 && fx.rejects === 1 && fx.turnMs > 0 && fx.runs === 0,
      JSON.stringify(r && r.fx));
    $('btnSettings').click(); await sleep(20);
    ck('[8] the settings sheet shows the tempo line', $('ptFxText').value.startsWith('연출 base · 0판 1턴 · 턴당 '), $('ptFxText').value);
    $('optFx').value = 'juicy'; $('optFx').dispatchEvent(new Event('change', { bubbles: true }));
    closeSheets();
    await setup(B6, [2]);
    await tap(cup()); await tap(tube(5));
    await sleep(300);
    const r2 = record();
    ck('[8] a setting switch: later moves count under the new key', r2.fx.juicy && r2.fx.juicy.turns === 1 && r2.fx.base.turns === 1, JSON.stringify(r2.fx));
    $('btnSettings').click(); $('optFx').value = 'base'; $('optFx').dispatchEvent(new Event('change', { bubbles: true })); closeSheets();
  }

  // ---------- U5: a first visit ----------
  async function newUserTests() {
    ck('[U5] a first visit opens the help without the new-rules list', !$('ovHelp').hidden && $('helpV2').hidden && $('helpV2Title').hidden);
    ck('[U5] no coach while the help is open', q('.coach-dot') === 0);
    G().piece = [2];   // one layer: placed on the empty board it leaves no pour, so the pour coach waits for the board below
    $('ovHelp').querySelector('[data-close]').click(); await sleep(60);
    ck('[U5] closing the help starts the coach: the piece and a finger', q('#fxLayer .coach-dot') === 1 && q('#fxLayer .coach-piece') === 1);
    ck('[U5] the coach is stored as seen', stored().seenCoach === true, JSON.stringify(stored()));
    const t0 = G().turn;
    const target = G().bottles.findIndex(b => G().rules.cap - b.length >= G().piece.length);
    const p = await press(cup());
    ck('[U5] any input ends the coach', q('.coach-dot') === 0 && q('.coach-piece') === 0);
    await moveTo(p, ...center(tube(target)), true); await release(p);
    ck('[U5] the coach takes no input: the drag places the piece', G().turn === t0 + 1, `${G().turn} ${t0}`);
    await setup([[0, 1], [], [], [], [], []], [2]);
    ck('[U5] the first time a pour can be made, the coach taps it once', q('#fxLayer .coach-dot') === 1);
    await sleep(700);
    ck('[U5] the second tap follows', q('#fxLayer .coach-dot') === 2);
    await sleep(800);
    ck('[U5] then it is gone', q('.coach-dot') === 0);
    await setup([[0, 1], [3], [], [], [], []], [2]);
    ck('[U5] it shows only once', q('.coach-dot') === 0);
    $('btnHelp').click(); await sleep(20);
    ck('[U5] the help opened later lists the new rules', !$('helpV2').hidden && !$('helpV2Title').hidden);
    $('ovHelp').querySelector('[data-close]').click(); await sleep(60);
    ck('[U5] closing it again brings no coach', q('.coach-dot') === 0);
  }

  // ---------- U1 geometry: the stage and the banner at each size ----------
  async function geoTests() {
    const size = P.get('size'), rules = P.get('rules') || 'default', TRAY = P.get('tray') === 'top' ? 'top' : 'bottom';
    try { await Promise.race([document.fonts.ready, sleep(5000)]); } catch (e) { /* no font loading API */ }
    const s = G();
    s.piece = [0, 1]; s.flipped = false; s.streak = 4; s.turnClears = 0; s.turn = Math.max(s.turn, 10);
    window.__boot({ S: s }); await sleep(120);
    const rk0 = box($('rack'));
    // show the biggest things the stage holds: a banner, the combo with a callout, the heat bar
    const bn = $('banner');
    bn.textContent = '최고 기록 경신'; bn.className = 'banner big'; bn.hidden = false;
    $('stCall').textContent = '최고예요!!';
    $('stHeat').hidden = false; $('stHeatFill').style.width = '100%';
    await sleep(30);
    const parts = { rack: box($('rack')), status: box($('status')), actions: box(document.querySelector('.actions')), extra: $('extraRow').hidden ? null : box($('extraRow')) };
    const shown = { banner: box(bn), combo: $('stCombo').offsetParent ? box($('stCombo')) : null, call: $('stCall').offsetParent ? box($('stCall')) : null, stage: box($('stage')) };
    const d = { size, tray: TRAY, rules, vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
      stage: shown.stage, banner: shown.banner, combo: shown.combo, call: shown.call, rack: parts.rack, rackShift: parts.rack.t - rk0.t };
    // stuck: the give-up row appears (tray under the bottles: in the free space); does anything overlap or move?
    const st = G(); st.stuck = 'room'; window.__boot({ S: st }); await sleep(80);
    bn.hidden = false;
    d.stuck = { stage: box($('stage')), banner: box(bn), extra: box($('extraRow')), rackShift: box($('rack')).t - rk0.t, small: $('stage').classList.contains('small'), scrollH: document.documentElement.scrollHeight };
    const st2 = G(); st2.stuck = null; window.__boot({ S: st2 }); await sleep(80);
    bn.hidden = true; $('stCall').textContent = ''; $('stHeat').hidden = true;
    send({ sc: SC, data: d });
    const tag = `[geo ${size} ${TRAY} ${rules}] `;
    const g = (name, cond, detail) => check(tag + name, cond, detail);
    g('no horizontal scroll', d.scrollW <= d.vw + 1, `${d.scrollW} > ${d.vw}`);
    if (rules === 'default') g('no vertical scroll', d.scrollH <= d.vh + 1 && d.stuck.scrollH <= d.vh + 1, `${d.scrollH} ${d.stuck.scrollH} > ${d.vh}`);
    // max settings: the give-up row already moved the bottles before (24px at 360x740, controls AUDIT 9); only the
    // stage's own effect is checked there
    g('the stage content and the banner do not move the bottles', Math.abs(d.rackShift) <= 1 && (rules !== 'default' || Math.abs(d.stuck.rackShift) <= 1), `${d.rackShift} ${d.stuck.rackShift}`);
    for (const [k, b] of Object.entries({ banner: d.banner, combo: d.combo, call: d.call })) {
      if (!b) continue;
      g(`the ${k} clears the bottles, the status line and the buttons`, !hit(b, parts.rack) && !hit(b, parts.status) && !hit(b, parts.actions), JSON.stringify({ [k]: b, rack: parts.rack.t, status: parts.status.t }));
    }
    g('stuck: the banner clears the give-up row, the bottles and the status line', !hit(d.stuck.banner, d.stuck.extra) && !hit(d.stuck.banner, parts.rack) && !hit(d.stuck.banner, parts.status), JSON.stringify(d.stuck));
    if (TRAY === 'bottom' && rules === 'default') g('the combo fits the stage', !!d.combo && d.combo.t >= d.stage.t - 1 && d.combo.b <= d.stage.b + 1, JSON.stringify({ combo: d.combo, stage: d.stage }));
  }
};
