// Faster bot with 2-pour lookahead on light board copies (proxy for a player who plans a couple of pours ahead)
// (sim copy: adds emergency spare cup support; flag-off behaviour is identical to the original bot2)
const { E, spareStats, SPARE_FULL_PENALTY } = require('./harness.js');
// n = number of real bottles; slots beyond n (the spare cup) never count as empty/free space for a piece.
function evalB(bs, clears, cap, need, n) {
  let units = 0, empties = 0, maxFree = 0, breaks = 0;
  for (const b of bs) {
    units += b.length; if (!b.length) empties++;
    if (cap - b.length > maxFree) maxFree = cap - b.length;
    for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) breaks++;
  }
  if (n !== undefined && bs.length > n) {
    // undo the cup's contribution to empties/maxFree (recompute over real bottles only)
    empties = 0; maxFree = 0;
    for (let i = 0; i < n; i++) { const b = bs[i]; if (!b.length) empties++; if (cap - b.length > maxFree) maxFree = cap - b.length; }
    const v = clears * 6 + empties * 3 + maxFree * 1.5 - units * 0.6 - breaks * 2.2 + (maxFree >= need ? 4 : -8);
    return bs[n].length ? v - SPARE_FULL_PENALTY : v;
  }
  return clears * 6 + empties * 3 + maxFree * 1.5 - units * 0.6 - breaks * 2.2 + (maxFree >= need ? 4 : -8);
}
// G = { caps, n }: caps is rules.cap (no cup) or a per-slot array (with cup)
function ctx(S) { return { caps: E.capsOf(S), n: S.bottles.length }; }
function step(bs, s, t, rules, G) {
  const nb = bs.map(b => b.slice()); E.doPour(nb, s, t, G ? G.caps : rules.cap);
  let cl = 0; E.resolveBoard(G && nb.length > G.n ? nb.slice(0, G.n) : nb, rules, () => cl++); return [nb, cl];
}
function pours(bs, cap) { const out = []; for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) if (E.canPour(bs, s, t, cap)) out.push([s, t]); return out; }
// best first pour by 2-ply value; returns null if nothing beats standing still
function bestPour(bs, clears, rules, need, G) {
  const cap = rules.cap, caps = G ? G.caps : cap, n = G ? G.n : undefined, base = evalB(bs, clears, cap, need, n);
  let best = null, bestV = base + 0.01;
  for (const [s, t] of pours(bs, caps)) {
    const [b1, c1] = step(bs, s, t, rules, G);
    let v = evalB(b1, clears + c1, cap, need, n);
    for (const [s2, t2] of pours(b1, caps)) {
      const [b2, c2] = step(b1, s2, t2, rules, G);
      const v2 = evalB(b2, clears + c1 + c2, cap, need, n) - 0.05;
      if (v2 > v) v = v2;
    }
    if (v > bestV) { bestV = v; best = [s, t]; }
  }
  return best;
}
function settleLight(bs, clears, rules, need, budget, G) {
  for (let g = 0; g < 40 && g < budget; g++) {
    const p = bestPour(bs, clears, rules, need, G); if (!p) break;
    const [nb, c] = step(bs, p[0], p[1], rules, G); bs = nb; clears += c;
  }
  return [bs, clears];
}
function slotKey(b, n) { return b.length > n ? E.boardKey(b.slice(0, n)) + '#' + b[n].join('') : E.boardKey(b); }
function roomPath(S) {
  const cap = S.rules.cap, need = S.piece.length, G = ctx(S), n = G.n;
  const start = E.slotsOf(S).map(b => b.slice());
  const seen = new Set([slotKey(start, n)]);
  let frontier = [{ b: start, path: [] }];
  for (let depth = 0; depth < 10 && frontier.length; depth++) {
    const next = [];
    for (const { b, path } of frontier) for (const [s, t] of pours(b, G.caps)) {
      const [nb] = step(b, s, t, S.rules, G); const p = path.concat([[s, t]]);
      if (E.roomFor(nb.length > n ? nb.slice(0, n) : nb, need, cap)) return p;
      const k = slotKey(nb, n); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > 30000) return null;
      next.push({ b: nb, path: p });
    }
    frontier = next;
  }
  return null;
}
// opts.spare: 'never' (default) | 'asap' | 'late' (only when the chosen placement would end the run, or no room path exists)
//   | 'mid' (when the current piece no longer fits without pours, plus the 'late' rescue)
//   | 'deep' (when total free cells <= 2, plus the 'late' rescue)
function runBot2(rules, seed, maxTurns, opts) {
  const policy = (opts && opts.spare) || 'never';
  const S = E.newState('endless', seed, rules);
  const budget = () => rules.pourLimit ? rules.pourLimit - S.pours : 99;
  while (!S.over && S.turn < maxTurns) {
    if (policy === 'asap' && S.spareOffer) E.applySpare(S);
    if (policy === 'mid' && S.spareOffer && !E.roomFor(S.bottles, S.piece.length, rules.cap)) E.applySpare(S);
    if (policy === 'deep' && S.spareOffer && S.bottles.reduce((x, b) => x + rules.cap - b.length, 0) <= 2) E.applySpare(S);
    let G = ctx(S);
    // pours before placing
    for (let g = 0; g < 40 && !S.over && budget() > 0; g++) {
      const p = bestPour(E.slotsOf(S), S.clears, rules, S.piece.length, G); if (!p) break;
      E.applyPour(S, p[0], p[1]);
      if (policy === 'asap' && S.spareOffer) { E.applySpare(S); G = ctx(S); }
    }
    if (S.over) break;
    const next = E.pieceAt(S.seed, rules, S.turn + 1).length;
    let best = null, bestV = -Infinity;
    for (let t = 0; t < S.bottles.length; t++) {
      if (rules.cap - S.bottles[t].length < S.piece.length) continue;
      let bs = E.slotsOf(S).map(b => b.slice()); bs[t].push(...S.piece);
      let cl = 0; E.resolveBoard(bs.length > G.n ? bs.slice(0, G.n) : bs, rules, () => cl++);
      [bs, cl] = settleLight(bs, cl, rules, next, rules.pourLimit ? rules.pourLimit : 40, G);
      const v = evalB(bs, cl, rules.cap, next, G.n);
      if (v > bestV) { bestV = v; best = t; }
    }
    if (best == null) {
      if (rules.pourLimit && budget() <= 0) { E.giveUp(S); break; }
      const p = roomPath(S);
      if (!p) { if (policy !== 'never' && E.applySpare(S)) continue; E.giveUp(S); break; }
      for (const [s, t] of p) E.applyPour(S, s, t);
      continue;
    }
    if ((policy === 'late' || policy === 'mid' || policy === 'deep') && S.spareOffer) {
      // would this placement end the run (engine BFS)? then take the cup first and re-plan
      const C = JSON.parse(JSON.stringify(S)); E.applyPlace(C, best);
      if (C.over && E.applySpare(S)) continue;
    }
    E.applyPlace(S, best);
  }
  return S;
}
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
function summarize2(label, rules, n, maxTurns, opts) {
  const t1 = Date.now(); const turns = [], scores = [], runs = []; let capped = 0;
  for (let i = 0; i < n; i++) { const S = runBot2(E.sanitizeRules(rules), `b2-${(opts && opts.seedTag) || label}-${i}`, maxTurns, opts); turns.push(S.turn); scores.push(S.score); runs.push(S); if (!S.over) capped++; }
  turns.sort((a, b) => a - b); scores.sort((a, b) => a - b);
  console.log(`${label.padEnd(28)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  alive@${maxTurns}: ${capped}/${n}  (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  if (rules.spare) console.log('   spare: ' + spareStats(runs));
  return { turns, scores, runs };
}
module.exports = { runBot2, summarize2 };
