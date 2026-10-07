// Regression + unit checks for the fever copy.
const path = require('path');
const ORIG = path.join(__dirname, '..', '..');
const O = require(path.join(ORIG, 'harness.js')), O2 = require(path.join(ORIG, 'bot2.js'));
const C = require('./harness.js'), C2 = require('./bot2.js');
const { E } = C;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const D = E.DEFAULT_RULES;
// 1) flag off: copy == original, game by game
for (let i = 0; i < 30; i++) {
  const a = O.runBot(O.E.sanitizeRules({ ...O.E.DEFAULT_RULES }), 'bot-reg-' + i, 300), b = C.runBot(E.sanitizeRules({ ...D }), 'bot-reg-' + i, 300);
  ok(a.turn === b.turn && a.score === b.score, 'greedy off mismatch ' + i);
  const a2 = O2.runBot2(O.E.sanitizeRules({ ...O.E.DEFAULT_RULES }), 'b2-reg-' + i, 300), b2 = C2.runBot2(E.sanitizeRules({ ...D }), 'b2-reg-' + i, 300);
  ok(a2.turn === b2.turn && a2.score === b2.score, 'bot2 off mismatch ' + i);
  // 2) flag on, policy never: same turns and score as off
  const c = C.runBot(E.sanitizeRules({ ...D, fever: true }), 'bot-reg-' + i, 300, { policy: 'never' });
  ok(c.turn === b.turn && c.score === b.score, 'greedy never mismatch ' + i);
  const c2 = C2.runBot2(E.sanitizeRules({ ...D, fever: true }), 'b2-reg-' + i, 300, { policy: 'never' });
  ok(c2.turn === b2.turn && c2.score === b2.score, 'bot2 never mismatch ' + i);
}
// pieces unchanged when flag off
for (let i = 0; i < 200; i++) ok(JSON.stringify(O.E.pieceAt('daily:2026-10-07', O.E.DEFAULT_RULES, i)) === JSON.stringify(E.pieceAt('daily:2026-10-07', D, i)), 'pieceAt ' + i);
// 3) unit checks
const R = E.sanitizeRules({ ...D, fever: true, feverGauge: 2, feverTurns: 3, feverAdTurns: 2 });
const S = E.newState('endless', 'unit', R);
ok(!E.canFever(S), 'empty gauge cannot fire');
S.bottles = [[0, 0, 0], [1, 1, 1], [], [], [], []]; S.piece = [0]; S.fever = 1;
// clear via place: +100, gauge 2
let i0 = S.turn; S.piece = [0]; E.applyPlace(S, 0);
ok(S.score === 100 && S.fever === 2, 'normal clear charges gauge ' + S.score + ' ' + S.fever);
ok(E.canFever(S), 'full gauge can fire');
const before = [0, 1, 2].map(k => E.pieceAt(S.seed, R, S.turn + k));
E.applyFever(S);
ok(S.fever === 0 && S.feverFrom === S.turn && S.feverTo === S.turn + 3, 'window');
ok(JSON.stringify(S.piece) === JSON.stringify(E.feverPiece(before[0])), 'current piece mono');
for (let k = 0; k < 3; k++) ok(new Set(E.pieceFor(S, S.turn + k)).size === 1, 'preview mono ' + k);
ok(JSON.stringify(E.pieceFor(S, S.turn + 3)) === JSON.stringify(E.pieceAt(S.seed, R, S.turn + 3)), 'after window normal');
ok(!E.canFever(S), 'no re-fire during fever');
// fever clear: bottle 1 has 3x color1; force a pour-made clear during fever
S.bottles = [[], [1, 1, 1], [1], [], [], []];
const sc = S.score; E.applyPour(S, 2, 1);
ok(S.score - sc === 2 * 100 * S.streak && S.fever === 0, 'fever clear doubled, no charge ' + (S.score - sc));
// place fever pieces through the window; last placement still fever-scored
S.bottles = [[], [], [], [], [], []];
for (let k = 0; k < 3; k++) E.applyPlace(S, k);
ok(S.turn === S.feverTo, 'window over');
ok(!E.inFever(S, S.turn), 'not in fever after window');
ok(E.canFeverExtend(S), 'ad ext available endless');
E.applyFeverExtend(S); ok(S.feverTo === S.turn + 2 && new Set(S.piece).size === 1 && !E.canFeverExtend(S), 'ad ext once');
const Sd = E.newState('daily', 'daily:x', R); Sd.feverTo = 1; Sd.turn = 1; ok(!E.canFeverExtend(Sd), 'no ad ext in daily');
ok(E.turnRhythm(S).includes('🔥'), 'rhythm fire');
// determinism of mono transform with same activation turn
const S1 = E.newState('daily', 'daily:2026-10-07', E.sanitizeRules({ ...D, fever: true })), S2 = JSON.parse(JSON.stringify(S1));
S1.fever = S2.fever = 8; E.applyFever(S1); E.applyFever(S2); ok(JSON.stringify(S1.piece) === JSON.stringify(S2.piece), 'det');
console.log(fail ? fail + ' failures' : 'all checks passed');
