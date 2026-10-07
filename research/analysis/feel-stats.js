// Feel-moment frequency stats (danger, stuck escape, multi-clear, streak breaks, near-miss at game over)
const { E } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const origPlace = E.applyPlace, origPour = E.applyPour;
let M;
function fill(S) { return S.bottles.reduce((a, b) => a + b.length, 0) / (S.bottles.length * S.rules.cap); }
function hooksFor(S) {
  let n = 0, moves = 0;
  return { h: { clear: () => n++, move: () => moves++ }, get: () => [n, moves] };
}
E.applyPlace = function (S, t) {
  const wasStreak = S.streak, prevTurnClears = S.turnClears;
  const b = S.bottles[t];
  const buried = b && b.length > 0 && b[b.length - 1] !== S.piece[0];
  const hk = hooksFor(S);
  const ok = origPlace(S, t, hk.h);
  if (!ok) return ok;
  const [n, moves] = hk.get();
  M.turns++;
  if (buried) M.bury++;
  if (n > 0) M.placeClears++;
  if (n >= 2) M.multi++;
  if (S.turn > 1 && prevTurnClears === 0 && wasStreak >= 3) M.breaks3++;
  if (S.turn > 1 && prevTurnClears === 0 && wasStreak >= 5) M.breaks5++;
  const f = fill(S);
  if (f >= 0.7) M.f70++; if (f >= 0.85) M.f85++;
  if (S.stuck) { M.stuck++; M.inStuck = true; M.stuckFill.push(f); }
  // near-complete bottles (3 same color on top in cap 4 and no other color below, or length 3 pure)
  let near = 0; for (const x of S.bottles) if (x.length === S.rules.cap - 1 && E.isPure(x)) near++;
  if (near) M.nearTurns++;
  return ok;
};
E.applyPour = function (S, s, t) {
  const hk = hooksFor(S);
  const wasStuck = !!S.stuck, f0 = fill(S);
  const ok = origPour(S, s, t, hk.h);
  if (!ok) return ok;
  const [n] = hk.get();
  M.pours++;
  if (n > 0) M.pourClears++;
  if (n >= 2) M.multi++;
  if (wasStuck && !S.stuck && !S.over) { M.escape++; }
  if (n > 0 && f0 >= 0.85) M.clutchClear++;
  return ok;
};
function run(rules, N, label) {
  M = { turns: 0, pours: 0, bury: 0, placeClears: 0, pourClears: 0, multi: 0, breaks3: 0, breaks5: 0, f70: 0, f85: 0, stuck: 0, escape: 0, nearTurns: 0, clutchClear: 0, stuckFill: [] };
  const ends = { needMinus1: 0, total: 0, near3: 0 }; const maxS = [];
  for (let i = 0; i < N; i++) {
    const S = runBot2(E.sanitizeRules(rules), 'fs-' + label + '-' + i, 400);
    maxS.push(S.maxStreak);
    if (S.over) {
      ends.total++;
      const need = S.piece.length, cap = S.rules.cap;
      const maxFree = Math.max(...S.bottles.map(b => cap - b.length));
      if (maxFree === need - 1) ends.needMinus1++;
      if (S.bottles.some(b => b.length >= 3 && E.topSeg(b).n >= 3)) ends.near3++;
    }
  }
  maxS.sort((a, b) => a - b);
  const p = (x, d) => (100 * x / d).toFixed(1) + '%';
  console.log(label, JSON.stringify({
    turnsPerRun: (M.turns / N).toFixed(1), poursPerTurn: (M.pours / M.turns).toFixed(2),
    buryRate: p(M.bury, M.turns), placeClearRate: p(M.placeClears, M.turns), pourClearPerTurn: (M.pourClears / M.turns).toFixed(2),
    multiPerRun: (M.multi / N).toFixed(2), breaks3PerRun: (M.breaks3 / N).toFixed(2), breaks5PerRun: (M.breaks5 / N).toFixed(2),
    fill70: p(M.f70, M.turns), fill85: p(M.f85, M.turns), stuckPerRun: (M.stuck / N).toFixed(2), escapePerRun: (M.escape / N).toFixed(2),
    nearTurns: p(M.nearTurns, M.turns), clutchClearPerRun: (M.clutchClear / N).toFixed(2),
    maxStreak_p50: maxS[Math.floor(N / 2)], maxStreak_p90: maxS[Math.floor(N * 0.9)],
    endsNeedMinus1: p(ends.needMinus1, ends.total), endsWith3run: p(ends.near3, ends.total),
  }));
}
run(E.DEFAULT_RULES, 150, 'default');
run(Object.assign({}, E.DEFAULT_RULES, { autoMerge: true }), 150, 'automerge');
