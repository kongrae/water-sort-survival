// Sanity checks: flag-off equivalence with the original bots, engine flip rules, determinism.
const path = require('path');
const NEW = require('./harness.js'), NEW2 = require('./bot2.js');
const ORIG = require(path.join(__dirname, '../../harness.js')), ORIG2 = require(path.join(__dirname, '../../bot2.js'));
const E = NEW.E;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const R = E.sanitizeRules({ ...E.DEFAULT_RULES });
const RF = E.sanitizeRules({ ...E.DEFAULT_RULES, flip: true });
ok(R.flip === false && RF.flip === true, 'sanitize flip');
// 1) flag off -> identical to original bots (first 6 seeds, maxTurns 150)
for (let i = 0; i < 6; i++) {
  const sd = 'eq-' + i;
  const a = ORIG.runBot(ORIG.E.sanitizeRules({ ...ORIG.E.DEFAULT_RULES }), sd, 150), b = NEW.runBot(R, sd, 150);
  ok(a.turn === b.turn && a.score === b.score && JSON.stringify(a.bottles) === JSON.stringify(b.bottles), 'greedy equiv ' + sd);
  ok(b.flipStats.avail === 0 && !b.flips, 'greedy no flips when off');
  const c = ORIG2.runBot2(ORIG.E.sanitizeRules({ ...ORIG.E.DEFAULT_RULES }), sd, 150), d = NEW2.runBot2(R, sd, 150);
  ok(c.turn === d.turn && c.score === d.score && JSON.stringify(c.bottles) === JSON.stringify(d.bottles), 'bot2 equiv ' + sd);
}
// 2) engine rules
let S = E.newState('endless', 'unit', RF);
const find = pred => { for (let i = 0; i < 400; i++) if (pred(E.pieceAt('unit', RF, i))) return i; };
S.piece = [0, 1]; ok(E.canFlip(S), 'diff 2-layer flippable');
S.piece = [2, 2]; ok(!E.canFlip(S), 'same-color 2-layer not flippable');
S.piece = [3]; ok(!E.canFlip(S), '1-layer not flippable');
S.piece = [0, 1, 0]; ok(!E.canFlip(S), 'palindrome 3-layer not flippable');
S.piece = [0, 1, 2]; ok(E.canFlip(S), 'non-palindrome 3-layer flippable (only with pieceMax 3+)');
S.piece = [0, 1]; S.over = true; ok(!E.canFlip(S) && !E.applyFlip(S), 'no flip when over'); S.over = false;
const Soff = E.newState('endless', 'unit', R); Soff.piece = [0, 1]; ok(!E.canFlip(Soff) && !E.applyFlip(Soff), 'no flip when flag off');
S.piece = [0, 1]; E.applyFlip(S); ok(S.piece.join() === '1,0' && S.flipped === true && S.flips === 1, 'flip reverses');
const snap = JSON.stringify(S); E.applyFlip(S); ok(S.piece.join() === '0,1' && S.flipped === false, 'double flip restores');
const U = JSON.parse(snap); ok(U.piece.join() === '1,0' && U.flipped, 'JSON snapshot (undo/save) keeps orientation');
E.applyFlip(S); E.applyPlace(S, 2); ok(S.bottles[2].join() === '1,0', 'place pushes flipped order (bottom first)');
ok(!S.flipped && S.piece.join() === E.pieceAt('unit', RF, 1).join(), 'next piece fresh from seed, flipped reset');
// pieces never mutated by flip (pieceAt returns a fresh array)
const p0 = E.pieceAt('unit', RF, 5).join(); const T = E.newState('endless', 'unit', RF); T.turn = 5; T.piece = E.pieceAt('unit', RF, 5); E.applyFlip(T); ok(E.pieceAt('unit', RF, 5).join() === p0, 'seed sequence untouched');
// flipLimit: a charge is spent when a flipped piece is placed; flipping back is always allowed
const RL = E.sanitizeRules({ ...E.DEFAULT_RULES, flip: true, flipLimit: 1 });
ok(RL.flipLimit === 1 && R.flipLimit === 0, 'sanitize flipLimit');
const L = E.newState('endless', 'lim', RL); L.piece = [0, 1];
ok(E.applyFlip(L) && E.applyFlip(L) && E.applyFlip(L), 'toggling before placing is free');
E.applyPlace(L, 0); ok(L.flipsPlaced === 1, 'charge spent on place');
L.piece = [2, 3]; ok(!E.canFlip(L), 'no charge left -> cannot flip');
L.flipped = true; ok(E.canFlip(L), 'can always flip back');
// 3) determinism with flip on
const x1 = NEW2.runBot2(RF, 'det', 200), x2 = NEW2.runBot2(RF, 'det', 200);
ok(x1.turn === x2.turn && x1.score === x2.score && x1.flips === x2.flips, 'bot2 deterministic with flip');
console.log(fail ? fail + ' failures' : 'all checks passed');
