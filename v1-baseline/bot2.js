// Faster bot with 2-pour lookahead on light board copies (proxy for a player who plans a couple of pours ahead)
const { E } = require('./harness.js');
function evalB(bs, clears, cap, need) {
  let units = 0, empties = 0, maxFree = 0, breaks = 0;
  for (const b of bs) {
    units += b.length; if (!b.length) empties++;
    if (cap - b.length > maxFree) maxFree = cap - b.length;
    for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) breaks++;
  }
  return clears * 6 + empties * 3 + maxFree * 1.5 - units * 0.6 - breaks * 2.2 + (maxFree >= need ? 4 : -8);
}
function step(bs, s, t, rules) {
  const nb = bs.map(b => b.slice()); E.doPour(nb, s, t, rules.cap);
  let cl = 0; E.resolveBoard(nb, rules, () => cl++); return [nb, cl];
}
function pours(bs, cap) { const out = []; for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) if (E.canPour(bs, s, t, cap)) out.push([s, t]); return out; }
// best first pour by 2-ply value; returns null if nothing beats standing still
function bestPour(bs, clears, rules, need) {
  const cap = rules.cap, base = evalB(bs, clears, cap, need);
  let best = null, bestV = base + 0.01;
  for (const [s, t] of pours(bs, cap)) {
    const [b1, c1] = step(bs, s, t, rules);
    let v = evalB(b1, clears + c1, cap, need);
    for (const [s2, t2] of pours(b1, cap)) {
      const [b2, c2] = step(b1, s2, t2, rules);
      const v2 = evalB(b2, clears + c1 + c2, cap, need) - 0.05;
      if (v2 > v) v = v2;
    }
    if (v > bestV) { bestV = v; best = [s, t]; }
  }
  return best;
}
function settleLight(bs, clears, rules, need, budget) {
  for (let g = 0; g < 40 && g < budget; g++) {
    const p = bestPour(bs, clears, rules, need); if (!p) break;
    const [nb, c] = step(bs, p[0], p[1], rules); bs = nb; clears += c;
  }
  return [bs, clears];
}
function roomPath(S) {
  const cap = S.rules.cap, need = S.piece.length;
  const start = S.bottles.map(b => b.slice());
  const seen = new Set([E.boardKey(start)]);
  let frontier = [{ b: start, path: [] }];
  for (let depth = 0; depth < 10 && frontier.length; depth++) {
    const next = [];
    for (const { b, path } of frontier) for (const [s, t] of pours(b, cap)) {
      const [nb] = step(b, s, t, S.rules); const p = path.concat([[s, t]]);
      if (E.roomFor(nb, need, cap)) return p;
      const k = E.boardKey(nb); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > 30000) return null;
      next.push({ b: nb, path: p });
    }
    frontier = next;
  }
  return null;
}
function runBot2(rules, seed, maxTurns) {
  const S = E.newState('endless', seed, rules);
  const budget = () => rules.pourLimit ? rules.pourLimit - S.pours : 99;
  while (!S.over && S.turn < maxTurns) {
    // pours before placing
    for (let g = 0; g < 40 && !S.over && budget() > 0; g++) {
      const p = bestPour(S.bottles, S.clears, rules, S.piece.length); if (!p) break;
      E.applyPour(S, p[0], p[1]);
    }
    if (S.over) break;
    const next = E.pieceAt(S.seed, rules, S.turn + 1).length;
    let best = null, bestV = -Infinity;
    for (let t = 0; t < S.bottles.length; t++) {
      if (rules.cap - S.bottles[t].length < S.piece.length) continue;
      let bs = S.bottles.map(b => b.slice()); bs[t].push(...S.piece);
      let cl = 0; E.resolveBoard(bs, rules, () => cl++);
      [bs, cl] = settleLight(bs, cl, rules, next, rules.pourLimit ? rules.pourLimit : 40);
      const v = evalB(bs, cl, rules.cap, next);
      if (v > bestV) { bestV = v; best = t; }
    }
    if (best == null) {
      if (rules.pourLimit && budget() <= 0) { E.giveUp(S); break; }
      const p = roomPath(S); if (!p) { E.giveUp(S); break; }
      for (const [s, t] of p) E.applyPour(S, s, t);
      continue;
    }
    E.applyPlace(S, best);
  }
  return S;
}
function summarize2(label, rules, n, maxTurns) {
  const t1 = Date.now(); const turns = [], scores = []; let capped = 0;
  for (let i = 0; i < n; i++) { const S = runBot2(E.sanitizeRules(rules), `b2-${label}-${i}`, maxTurns); turns.push(S.turn); scores.push(S.score); if (!S.over) capped++; }
  turns.sort((a, b) => a - b); scores.sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  console.log(`${label.padEnd(28)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  alive@${maxTurns}: ${capped}/${n}  (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
}
module.exports = { runBot2, summarize2 };
if (require.main === module) {
  const D = E.DEFAULT_RULES;
  const cfgs = [
    ['cap4 b5 c5-8 p1-3 (cur)', { ...D }],
    ['cap4 b6 c4-7 p1-2', { ...D, bottles: 6, startColors: 4, maxColors: 7, pieceMax: 2 }],
    ['cap4 b6 c4-8 p1-2', { ...D, bottles: 6, startColors: 4, maxColors: 8, pieceMax: 2 }],
    ['cap4 b6 c4-7 p1-3', { ...D, bottles: 6, startColors: 4, maxColors: 7 }],
    ['cap5 b6 c4-7 p1-3', { ...D, cap: 5, bottles: 6, startColors: 4, maxColors: 7 }],
    ['cap4 b6 c4-7 p1-2 auto', { ...D, bottles: 6, startColors: 4, maxColors: 7, pieceMax: 2, autoMerge: true }],
  ];
  for (const [label, r] of cfgs) summarize2(label, r, 20, 300);
}
