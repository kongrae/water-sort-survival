// Same evaluation/flip budget as harness.js and bot2.js, using real state transitions at both search depths.
const { E, flipOrients, pickWithBudget } = require('../../harness');
function clone(S) {
  const C = { ...S, bottles: S.bottles.map(b => b.slice()), turnLog: S.turnLog.slice(), zoneLog: S.zoneLog.slice(), piece: S.piece.slice(), spare: S.spare && S.spare.slice() };
  if (S.growth) C.growth = { ...S.growth, queue: S.growth.queue.map(q => ({ piece: q.piece.slice(), intro: q.intro })), pendingIntro: S.growth.pendingIntro.slice(), log: S.growth.log.slice() };
  return C;
}
function evaluate(S) {
  if (S.over) return -1e9;
  const cap = S.rules.cap, bs = S.bottles;
  let units = 0, empties = 0, maxFree = 0, breaks = 0;
  for (const b of bs) {
    units += b.length; if (!b.length) empties++;
    maxFree = Math.max(maxFree, cap - b.length);
    for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) breaks++;
  }
  return S.clears * 6 + empties * 3 + maxFree * 1.5 - units * .6 - breaks * 2.2 + (maxFree >= S.piece.length ? 4 : -8);
}
function legalPours(S) {
  const out = [], caps = E.capsOf(S), bs = E.slotsOf(S);
  if (S.over || (S.rules.pourLimit && S.pours >= S.rules.pourLimit)) return out;
  for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) if (E.canPour(bs, s, t, caps)) out.push([s, t]);
  return out;
}
function bestPour(S, depth) {
  let best = null, bestV = evaluate(S) + .01;
  for (const [s, t] of legalPours(S)) {
    const C = clone(S); E.applyPour(C, s, t);
    let v = evaluate(C);
    if (depth === 2) for (const [s2, t2] of legalPours(C)) {
      const D = clone(C); E.applyPour(D, s2, t2);
      v = Math.max(v, evaluate(D) - .05);
    }
    if (v > bestV) { bestV = v; best = [s, t]; }
  }
  return best;
}
function settle(S, depth, move) {
  for (let g = 0; g < (depth === 2 ? 40 : 60) && !S.over; g++) {
    const p = bestPour(S, depth); if (!p) break;
    if (move) move('pour', p); else E.applyPour(S, ...p);
  }
}
function roomPath(S) {
  const key = C => E.boardKey(C.bottles) + '#' + C.score + '#' + C.pours;
  let frontier = [{ S: clone(S), path: [] }]; const seen = new Set([key(S)]);
  for (let d = 0; d < 10 && frontier.length; d++) {
    const next = [];
    for (const it of frontier) for (const p of legalPours(it.S)) {
      const C = clone(it.S); E.applyPour(C, ...p); const path = it.path.concat([p]);
      if (E.roomFor(C.bottles, C.piece.length, C.rules.cap)) return path;
      const k = key(C); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > 30000) return null;
      if (!C.over) next.push({ S: C, path });
    }
    frontier = next;
  }
  return null;
}
function boardFacts(S) {
  return { free: S.bottles.reduce((n, b) => n + S.rules.cap - b.length, 0), targets: S.bottles.filter(b => S.rules.cap - b.length >= S.piece.length).length };
}
function run(rules, seed, maxTurns, depth, trace) {
  const S = E.newState('endless', seed, rules);
  const actions = [];
  const metrics = { firstClear: null, pours: 0, unlocks: [], phases: {}, stableAssigned: 0 };
  const move = (kind, args) => {
    if (trace) actions.push({ kind, args });
    const before = boardFacts(S), n = S.bottles.length;
    if (kind === 'place') E.applyPlace(S, args); else { E.applyPour(S, ...args); metrics.pours++; }
    if (S.clears && metrics.firstClear === null) metrics.firstClear = S.turn;
    if (S.bottles.length > n) metrics.unlocks.push({ turn: S.turn, score: S.score, from: n, to: S.bottles.length, before, after: boardFacts(S) });
  };
  while (S.turn < maxTurns && !S.over) {
    settle(S, depth, move); if (S.over) break;
    let best = null, bestV = -Infinity, bestNoFlip = null, bestByO = [-Infinity, -Infinity];
    for (const o of flipOrients(S)) for (let t = 0; t < S.bottles.length; t++) {
      if (rules.cap - S.bottles[t].length < S.piece.length) continue;
      const C = clone(S); if (o) E.applyFlip(C);
      E.applyPlace(C, t); settle(C, depth);
      const v = evaluate(C);
      if (v > bestByO[+o]) { bestByO[+o] = v; if (!o) bestNoFlip = [false, t]; }
      if (v > bestV) { bestV = v; best = [o, t]; }
    }
    best = pickWithBudget(rules, bestByO, best, bestNoFlip);
    if (!best) {
      const path = roomPath(S);
      if (!path) { E.giveUp(S); break; }
      for (const p of path) move('pour', p);
      continue;
    }
    if (best[0]) { E.applyFlip(S); if (trace) actions.push({ kind: 'flip' }); }
    move('place', best[1]);
    const k = `${S.bottles.length}b-${E.activeColors(S)}c`, facts = boardFacts(S);
    const ph = metrics.phases[k] || (metrics.phases[k] = { count: 0, free: 0, targets: 0 });
    ph.count++; ph.free += facts.free; ph.targets += facts.targets;
    const occupied = S.bottles.filter(b => b.length);
    if (occupied.every(E.isPure) && new Set(occupied.map(b => b[0])).size === occupied.length) metrics.stableAssigned++;
  }
  return { seed, depth, turn: S.turn, score: S.score, over: S.over, reason: S.overReason, bottles: S.bottles.length, colors: E.activeColors(S), maxStreak: S.maxStreak, metrics, state: S, ...(trace ? { actions } : {}) };
}
module.exports = { E, clone, evaluate, bestPour, run };
