// Danger-zone dynamics: entries into high fill, recoveries, and turns from first danger to game over
const { E } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const origPlace = E.applyPlace, origPour = E.applyPour;
let T;
function fill(S) { return S.bottles.reduce((a, b) => a + b.length, 0) / (S.bottles.length * S.rules.cap); }
function maxFree(S) { return Math.max(...S.bottles.map(b => S.rules.cap - b.length)); }
E.applyPlace = function (S, t, h) { const ok = origPlace(S, t, h); if (ok) T.push({ f: fill(S), mf: maxFree(S), need: S.piece.length, turn: S.turn }); return ok; };
const N = 150, res = { entries: 0, recov: 0, gap: [], mf1: 0, turns: 0, mfLow: 0 };
for (let i = 0; i < N; i++) {
  T = [];
  const S = runBot2(E.sanitizeRules(E.DEFAULT_RULES), 'fs2-' + i, 400);
  let inD = false, first = -1;
  for (const x of T) {
    res.turns++;
    if (x.mf <= 1) res.mf1++;
    if (!inD && x.f >= 0.75) { inD = true; res.entries++; if (first < 0) first = x.turn; }
    else if (inD && x.f <= 0.6) { inD = false; res.recov++; }
  }
  if (S.over && first >= 0) res.gap.push(S.turn - first);
}
res.gap.sort((a, b) => a - b);
console.log({ entriesPerRun: (res.entries / N).toFixed(2), recoveriesPerRun: (res.recov / N).toFixed(2), gapP10: res.gap[Math.floor(res.gap.length * .1)], gapP50: res.gap[Math.floor(res.gap.length / 2)], gapP90: res.gap[Math.floor(res.gap.length * .9)], maxFreeLe1Pct: (100 * res.mf1 / res.turns).toFixed(1) + '%' });
