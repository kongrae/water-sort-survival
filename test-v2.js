// Engine acceptance tests for prototype v2 (spec section 5). Run: node test-v2.js
const { E } = require('./harness.js');
const D = E.DEFAULT_RULES, V1 = E.V1_RULES;
let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('FAIL:', msg); } }
const clone = o => JSON.parse(JSON.stringify(o));
const R = over => E.sanitizeRules(Object.assign({}, D, over));
// State with a hand-made board; pieces are set right before each placement.
function mk(rules, bottles) { const S = E.newState('endless', 'test', rules); S.bottles = bottles.map(b => b.slice()); return S; }
function place(S, t, piece, hooks) { S.piece = piece.slice(); S.flipped = false; return E.applyPlace(S, t, hooks); }

// ---------- sanitize / signature ----------
{
  const s = E.sanitizeRules({});
  for (const k of ['autoMerge', 'comboPlace', 'flip', 'zones', 'zoneTwin', 'spare', 'spareSticky']) ok(s[k] === D[k], 'sanitize({}).' + k + ' equals default');
  ok(E.sanitizeRules({ flip: false }).flip === false, 'sanitize keeps flip:false');
  ok(E.sanitizeRules({ comboPlace: 0 }).comboPlace === false, 'sanitize coerces falsy to false');
  ok(E.rulesSig(V1) === '6-4-4-8-20-1-2-0-0', 'rulesSig(V1) is the v1 string: ' + E.rulesSig(V1));
  ok(E.rulesSig(D) === '6-4-4-8-20-1-2-0-0-c1-f2-z20x5t1', 'rulesSig(DEFAULT) = ' + E.rulesSig(D));
  const old = { bottles: 6, cap: 4, startColors: 4, maxColors: 8, colorEvery: 20, pieceMin: 1, pieceMax: 2, preview: 2, pourLimit: 0, autoMerge: false };
  ok(E.rulesSig(old) === '6-4-4-8-20-1-2-0-0', 'missing fields read as v1');
  ok(E.rulesSig(Object.assign({}, D, { spare: true, spareMaxFree: 9 })) === E.rulesSig(D), 'spare* not in signature');
  ok(E.rulesSig(Object.assign({}, D, { flipLimit: 0 })).includes('-f0-'), 'unlimited flip is f0');
}

// ---------- F1 combo ----------
{
  // (a) place (no clear) -> pour clear -> place (no clear) -> place clear
  const a = c => {
    const S = mk(R({ comboPlace: c, flip: false, zones: false }), [[1, 1, 1], [1], [3], [], [], []]);
    const gains = []; const H = { clear: (i, col, g) => gains.push(g) };
    place(S, 3, [2], H);                 // no clear
    E.applyPour(S, 1, 0, H);             // completes bottle 0 (1,1,1,1)
    place(S, 4, [3], H);                 // no clear (segment closed with a clear)
    S.bottles[5] = [2, 2, 2];
    place(S, 5, [2], H);                 // previous segment had no clear; this placement completes
    return gains;
  };
  const g0 = a(false), g1 = a(true);
  ok(JSON.stringify(g0) === '[100,100]', '(a) v1: last completion 100 -> ' + JSON.stringify(g0));
  ok(JSON.stringify(g1) === '[100,200]', '(a) comboPlace: last completion 200 -> ' + JSON.stringify(g1));
  // (b) place (no clear) -> pour clear -> placement clear in the same segment: 100 + 200 in both
  const b = c => {
    const S = mk(R({ comboPlace: c, flip: false, zones: false }), [[1, 1, 1], [1], [2, 2, 2], [], [], []]);
    const gains = []; const H = { clear: (i, col, g) => gains.push(g) };
    place(S, 3, [3], H);
    E.applyPour(S, 1, 0, H);
    place(S, 2, [2], H);
    return gains;
  };
  ok(JSON.stringify(b(false)) === '[100,200]' && JSON.stringify(b(true)) === '[100,200]', '(b) both 100+200: ' + JSON.stringify([b(false), b(true)]));
  // (c) place clear -> next place clear (no pours): 100 -> 200 in both
  const c = cp => {
    const S = mk(R({ comboPlace: cp, flip: false, zones: false }), [[0, 0, 0], [1, 1, 1], [], [], [], []]);
    const gains = []; const H = { clear: (i, col, g) => gains.push(g) };
    place(S, 0, [0], H);
    place(S, 1, [1], H);
    return gains;
  };
  ok(JSON.stringify(c(false)) === '[100,200]' && JSON.stringify(c(true)) === '[100,200]', '(c) both 100 -> 200: ' + JSON.stringify([c(false), c(true)]));
  // comboBreak hook fires with the streak and points of the run
  const S = mk(R({ comboPlace: true, flip: false, zones: false }), [[0, 0, 0], [1, 1, 1], [], [], [], []]);
  const breaks = []; const H = { comboBreak: (s, p) => breaks.push([s, p]) };
  place(S, 0, [0], H); place(S, 1, [1], H);   // streak 2, 300 pts
  place(S, 2, [2], H);                          // closes a segment with clears -> no break
  place(S, 3, [3], H);                          // previous segment had none and this one none -> break
  ok(JSON.stringify(breaks) === '[[2,300]]', 'comboBreak(2,300): ' + JSON.stringify(breaks));
  ok(S.streak === 0 && S.comboPts === 0, 'streak and comboPts reset after break');
}

// ---------- F2 flip ----------
{
  const S = mk(R({ flip: true, flipLimit: 3, zones: false }), [[], [], [], [], [], []]);
  S.piece = [1, 1]; ok(!E.canFlip(S), 'same-colour 2-layer piece cannot flip');
  S.piece = [2]; ok(!E.canFlip(S), '1-layer piece cannot flip');
  S.piece = [1, 2]; ok(E.canFlip(S), 'mixed piece can flip');
  E.applyFlip(S); ok(JSON.stringify(S.piece) === '[2,1]' && S.flipped, 'flip reverses');
  E.applyFlip(S); ok(JSON.stringify(S.piece) === '[1,2]' && !S.flipped && (S.flipsPlaced || 0) === 0, 'flip back is free');
  // place flipped three times -> 3 spent; then only restoring an already flipped piece is possible
  const T = E.newState('endless', 'flipseq', R({ flip: true, flipLimit: 3, zones: false }));
  let placed = 0, guard = 0;
  while (T.flipsPlaced < 3 && guard++ < 400 && !T.over) {
    if (E.canFlip(T)) E.applyFlip(T);
    const t = T.bottles.findIndex(b => T.rules.cap - b.length >= T.piece.length);
    if (t < 0) break;
    const expectedNext = E.pieceAt(T.seed, T.rules, T.turn + 1);
    E.applyPlace(T, t);
    ok(JSON.stringify(T.piece) === JSON.stringify(expectedNext), 'flip does not change the piece sequence');
    placed++;
    for (const b of T.bottles) if (b.length >= 3) b.length = 0;   // keep room
  }
  ok(T.flipsPlaced === 3, 'three flipped placements spend three charges: ' + T.flipsPlaced);
  T.piece = [3, 4]; T.flipped = false;
  ok(!E.canFlip(T), 'no charges left -> cannot flip a fresh piece');
  T.flipped = true; ok(E.canFlip(T), 'no charges left -> can restore an already flipped piece');
  const U = mk(R({ flip: true, flipLimit: 0, zones: false }), [[], [], [], [], [], []]);
  U.flipsPlaced = 50; U.piece = [1, 2]; ok(E.canFlip(U), 'flipLimit 0 = unlimited');
  const V = mk(R({ flip: false, zones: false }), [[], [], [], [], [], []]); V.piece = [1, 2];
  ok(!E.canFlip(V), 'flip off -> cannot flip');
}

// ---------- F3 zones ----------
{
  // zones off -> pieceAt identical to v1 for 20 seeds x 300 turns
  let same = true, diffTurns = new Set();
  for (let s = 0; s < 20; s++) for (let i = 0; i < 300; i++) {
    const seed = 'z' + s;
    if (JSON.stringify(E.pieceAt(seed, R({ zones: false }), i)) !== JSON.stringify(E.pieceAt(seed, V1, i))) same = false;
    if (JSON.stringify(E.pieceAt(seed, R({ zones: true }), i)) !== JSON.stringify(E.pieceAt(seed, V1, i))) diffTurns.add(i);
  }
  ok(same, 'zones off: pieceAt equals v1');
  const dt = [...diffTurns].sort((a, b) => a - b).join(',');
  ok(dt === '20,40,60,80', 'zones on: only turns 20/40/60/80 differ -> ' + dt);
  ok(JSON.stringify(E.pieceAt('x', D, 20)) === '[4]', 'turn 20 deals a 1-layer purple twin');
  // breakthrough into zone 3 with 2 empty bottles = 2 x 20 x 3 = 120
  const S = mk(R({ zones: true, flip: false }), [[1], [2], [3], [0], [], []]);
  S.turn = 39;
  const before = S.score;
  place(S, 0, [1]);   // no completion; board then has 2 empty bottles; turn becomes 40
  ok(S.score - before === 120, 'zone 3 breakthrough with 2 empties = +120: ' + (S.score - before));
  const last = S.zoneLog[S.zoneLog.length - 1];
  ok(last.zone === 3 && last.empties === 2 && last.bonus === 120, 'zoneLog records the breakthrough');
  // stars: empty2 needs >= 2 empties at the exit
  const mkRun = (empties, undoDelta, undoLeftDelta) => {
    const T = mk(R({ zones: true, flip: false }), [[], [], [], [], [], []]);
    const fill = 6 - empties;
    T.turn = 19;
    for (let i = 0; i < fill; i++) T.bottles[i] = [i % 4];
    T.bottles[0] = [0];
    if (undoDelta) T.undoUsed += undoDelta;
    if (undoLeftDelta) T.undoLeft += undoLeftDelta;
    place(T, 0, [1]);   // turn 20: exit of zone 1
    return E.zoneStars(T);
  };
  const s1 = mkRun(1, 0, 0), s2 = mkRun(2, 0, 0);
  ok(!s1[0].empty2, 'exit with 1 empty bottle -> no star 2');
  ok(s2[0].empty2, 'exit with 2 empty bottles -> star 2');
  ok(s2[1].stars === 1 && !s2[1].empty2 && !s2[1].clean, 'current zone has only its reached star');
  ok(s2[0].clean, 'no undo/revive in zone 1 -> star 3');
  const su = mkRun(2, 1, 0);
  ok(!su[0].clean, 'an undo during the zone removes star 3');
  const sl = mkRun(2, 0, 3);
  ok(sl[0].clean, 'refilling undoLeft alone does not affect star 3');
  // revive inside a zone removes star 3
  const T = mk(R({ zones: true, flip: false }), [[], [], [], [], [], []]);
  T.turn = 19; T.reviveUsed = true;
  place(T, 0, [1]);
  ok(!E.zoneStars(T)[0].clean, 'a revive during the zone removes star 3');
  ok(E.zoneBonusAt(R({ zones: true }), 120, [[], [], [], [], [], []]) === 6 * 20 * 5, 'zone multiplier capped at zoneMulMax 5');
}

// ---------- F4 spare cup ----------
{
  const rules = R({ spare: true, zones: false, flip: false });
  const S = mk(rules, [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2], [3, 2, 3, 2], [0, 1, 2], [3, 0, 1]]);
  S.turn = 30; S.piece = [2, 2];
  E.checkStuck(S);
  ok(S.spareOffer, 'crisis (no empty bottle, <= 7 free cells, turn >= 15) arms the offer');
  ok(E.applySpare(S), 'applySpare grants the cup');
  ok(S.spare && S.spare.length === 0 && S.spareUsed, 'cup is an empty slot');
  ok(!E.applySpare(S), 'only once per run');
  const n = rules.bottles;
  ok(E.applyPlace(S, n) === false, 'a piece cannot be placed into the cup');
  ok(E.applyPour(S, 2, n), 'pour a layer into the cup');
  ok(S.spare.length === 1 && S.spare[0] === 2, 'cup holds the layer');
  ok(!E.applyPour(S, 0, n), 'cup (capacity 1) is full');
  ok(E.applyPour(S, n, 2) || E.applyPour(S, n, 5) || E.applyPour(S, n, 4), 'the layer can be poured back out');
  // the cup never completes: clearBoard only looks at bottles
  const C = mk(rules, [[], [], [], [], [], []]); C.spare = [1]; C.spareUsed = true; C.spareTurn = 0;
  E.settle(C, {}); ok(C.spare.length === 1, 'cup content never clears');
  // BFS counts the cup: room exists only by parking a layer in the cup
  const Bd = mk(rules, [[0, 1, 1, 1], [2, 3, 3, 3], [0, 2, 0, 2], [3, 0, 3, 0], [1, 2, 1, 2], [2, 1, 2]]);
  Bd.piece = [0, 0]; Bd.turn = 30;
  ok(E.canMakeRoom(Bd.bottles, 2, rules, Infinity) === false, 'without the cup there is no room');
  Bd.spare = []; Bd.spareUsed = true; Bd.spareTurn = 30;
  E.checkStuck(Bd);
  ok(!Bd.over, 'with the cup the BFS finds room (no game over)');
  // expiry: empty cup breaks spareTurns after it was granted; a filled cup survives until emptied
  const X = mk(rules, [[], [], [], [], [], []]); X.spare = [1]; X.spareUsed = true; X.spareTurn = 0; X.turn = 25;
  E.checkStuck(X); ok(X.spare !== null, 'filled cup survives past its life');
  X.spare = []; E.checkStuck(X); ok(X.spare === null, 'empty cup past its life breaks');
  const Y = mk(rules, [[], [], [], [], [], []]); Y.spare = []; Y.spareUsed = true; Y.spareTurn = 10; Y.turn = 25;
  E.checkStuck(Y); ok(Y.spare !== null, 'empty cup inside its life stays');
  // revive keeps the cup
  const Z = mk(rules, [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3, 2], [0, 1, 2, 3], [3, 0, 1, 2]]);
  Z.spare = [2]; Z.spareUsed = true; Z.spareTurn = 20; Z.turn = 30; Z.over = true; Z.overReason = 'noroom';
  E.applyRevive(Z); ok(Z.spare && Z.spare.length === 1, 'revive leaves the cup alone');
  // spare off (default) behaves like v1
  const W = E.newState('endless', 'w', D); ok(W.spare === null && !W.spareOffer, 'spare off by default');
}

// ---------- F6 previews match the real move ----------
{
  let mism = 0, tried = 0;
  for (let k = 0; k < 1000; k++) {
    const rnd = (() => { let a = 7919 * (k + 1); return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
    const rules = R({ spare: k % 3 === 0, autoMerge: k % 5 === 0, zones: false, flip: false });
    const S = E.newState('endless', 'pv' + k, rules);
    S.bottles = S.bottles.map(() => { const n = Math.floor(rnd() * 5); const b = []; for (let j = 0; j < n; j++) b.push(Math.floor(rnd() * 4)); return b; });
    E.clearBoard(S.bottles, 4);
    if (rules.spare) { S.spare = rnd() < 0.5 ? [] : [Math.floor(rnd() * 4)]; S.spareUsed = true; S.spareTurn = 0; S.turn = 1; }
    S.piece = [Math.floor(rnd() * 4), Math.floor(rnd() * 4)].slice(0, 1 + Math.floor(rnd() * 2));
    const before = JSON.stringify(S);
    const slots = E.slotsOf(S).length;
    for (let t = 0; t < S.bottles.length; t++) {
      const p = E.previewPlace(S, t);
      const C = clone(S); const got = [];
      const real = E.applyPlace(C, t, { clear: i => got.push(i) });
      tried++;
      if (p.ok !== real || (real && (p.clears !== got.length || JSON.stringify(p.completes) !== JSON.stringify(got)))) mism++;
    }
    for (let s = 0; s < slots; s++) for (let t = 0; t < slots; t++) {
      const p = E.previewPour(S, s, t);
      const C = clone(S); const got = []; let moved = 0;
      const real = E.applyPour(C, s, t, { clear: i => got.push(i), move: (x, m) => { if (!moved) moved = m; } });
      tried++;
      if (p.ok !== real || (real && (p.clears !== got.length || JSON.stringify(p.completes) !== JSON.stringify(got) || p.moved !== moved))) mism++;
    }
    ok(JSON.stringify(S) === before, 'previews never modify S');
    if (failures > 30) break;
  }
  ok(mism === 0, `previews match real moves on ${tried} checks (mismatches ${mism})`);
}

// ---------- F7 near miss ----------
{
  const S = mk(R({ zones: true }), [[0, 0, 0], [1, 2, 3], [2, 2, 1, 3], [3, 1, 2, 1], [1, 1, 3, 2], [2, 3, 2, 1]]);
  S.piece = [1, 2]; S.turn = 37;
  const nm = E.nearMiss(S);
  ok(nm.need === 2 && nm.maxFree === 1 && nm.short === 1, 'short by exactly one cell');
  ok(JSON.stringify(nm.almost) === '[0]', 'red 3/4 is almost complete');
  ok(nm.zoneLeft === 3, 'three placements to the next zone: ' + nm.zoneLeft);
}

console.log(`test-v2: ${checks} checks, ${failures} failures`);
process.exitCode = failures ? 1 : 0;
