// Regression: with zones off, the copied engine + bots must reproduce the original scratchpad engine + bots exactly.
const path = require('path');
const ORIG = path.join(__dirname, '..', '..');
const orig = { h: require(path.join(ORIG, 'harness.js')), b2: require(path.join(ORIG, 'bot2.js')) };
const copy = { h: require('./harness.js'), b2: require('./bot2.js') };
const R0 = orig.h.E.sanitizeRules({}), R1 = copy.h.E.sanitizeRules({});
let diff = 0;
for (let s = 0; s < 20; s++) for (let i = 0; i < 300; i++) {
  if (orig.h.E.pieceAt('chk' + s, R0, i).join() !== copy.h.E.pieceAt('chk' + s, R1, i).join()) diff++;
}
console.log('pieceAt mismatches (zones off):', diff);
let botDiff = 0;
for (let i = 0; i < 30; i++) {
  const a = orig.h.runBot(R0, 'reg-' + i, 300), b = copy.h.runBot(R1, 'reg-' + i, 300);
  if (a.turn !== b.turn || a.score !== b.score || JSON.stringify(a.bottles) !== JSON.stringify(b.bottles)) botDiff++;
  const c = orig.b2.runBot2(R0, 'reg-' + i, 300), d = copy.b2.runBot2(R1, 'reg-' + i, 300);
  if (c.turn !== d.turn || c.score !== d.score || JSON.stringify(c.bottles) !== JSON.stringify(d.bottles)) botDiff++;
}
console.log('bot run mismatches (zones off, 30 seeds x 2 bots):', botDiff);
// zones on: piece sequence differs only on new-colour turns, and is identical across runs (daily determinism)
const RZ = copy.h.E.sanitizeRules({ zones: true });
const changed = [];
for (let i = 0; i < 300; i++) if (copy.h.E.pieceAt('daily:2026-10-07', R1, i).join() !== copy.h.E.pieceAt('daily:2026-10-07', RZ, i).join()) changed.push(i);
console.log('zones on: turns whose piece changed =', changed.join(','), ' twins =', [20, 40, 60, 80].map(i => copy.h.E.pieceAt('x', RZ, i).join('')).join(' '));
const RZ1 = copy.h.E.sanitizeRules({ zones: true, pieceMax: 1 });
console.log('pieceMax=1 twin size:', copy.h.E.pieceAt('x', RZ1, 20).length, ' colorEvery=0 twins:', [0, 20, 40].map(i => copy.h.E.pieceAt('x', copy.h.E.sanitizeRules({ zones: true, colorEvery: 0 }), i).join('')).join(' '));
