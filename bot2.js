// Faster bot with 2-pour lookahead on light board copies (proxy for a player who plans a couple of pours ahead)
// v2: understands the spare cup (extra slot), piece flip and revive. With every v2 flag off and opts omitted it is the v1 bot.
const { E, SPARE_FULL_PENALTY, flipOrients, pickWithBudget, newBotStats, botHooks, notePlace, onDeath } = require('./harness.js');
// n = number of real bottles; a slot beyond n (the spare cup) never counts as empty/free space for a piece.
function evalB(bs, clears, cap, need, n) {
  let units = 0, empties = 0, maxFree = 0, breaks = 0;
  for (const b of bs) {
    units += b.length; if (!b.length) empties++;
    if (cap - b.length > maxFree) maxFree = cap - b.length;
    for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) breaks++;
  }
  if (n !== undefined && bs.length > n) {
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
// opts.spare: 'none' (default) | 'asap'. opts.revive: revive once at the first death and keep playing.
function runBot2(rules, seed, maxTurns, opts) {
  opts = opts || {};
  const policy = opts.spare || 'none';
  const S = E.newState('endless', seed, rules);
  S.botStats = newBotStats();
  const H = botHooks(S);
  const budget = () => rules.pourLimit ? rules.pourLimit - S.pours : 99;
  while (S.turn < maxTurns) {
    if (S.over) { if (onDeath(S, opts)) continue; break; }
    if (policy === 'asap' && S.spareOffer) E.applySpare(S);
    let G = ctx(S);
    // pours before placing
    for (let g = 0; g < 40 && !S.over && budget() > 0; g++) {
      const p = bestPour(E.slotsOf(S), S.clears, rules, S.piece.length, G); if (!p) break;
      E.applyPour(S, p[0], p[1], H);
      if (policy === 'asap' && S.spareOffer) { E.applySpare(S); G = ctx(S); }
    }
    if (S.over) continue;
    const next = E.pieceAt(S.seed, rules, S.turn + 1).length;
    const orients = flipOrients(S);
    let best = null, bestV = -Infinity, bestO = false, bestNoFlipT = null;
    const bestByO = [-Infinity, -Infinity];
    for (const o of orients) {
      const piece = o ? S.piece.slice().reverse() : S.piece;
      for (let t = 0; t < S.bottles.length; t++) {
        if (rules.cap - S.bottles[t].length < piece.length) continue;
        let bs = E.slotsOf(S).map(b => b.slice()); bs[t].push(...piece);
        let cl = 0; E.resolveBoard(bs.length > G.n ? bs.slice(0, G.n) : bs, rules, () => cl++);
        [bs, cl] = settleLight(bs, cl, rules, next, rules.pourLimit ? rules.pourLimit : 40, G);
        const v = evalB(bs, cl, rules.cap, next, G.n);
        if (v > bestByO[+o]) { bestByO[+o] = v; if (!o) bestNoFlipT = t; }
        if (v > bestV) { bestV = v; best = t; bestO = o; }
      }
    }
    if (best != null) [bestO, best] = pickWithBudget(rules, bestByO, [bestO, best], bestNoFlipT == null ? null : [false, bestNoFlipT]);
    if (best == null) {
      if (rules.pourLimit && budget() <= 0) { E.giveUp(S); continue; }
      const p = roomPath(S);
      if (!p) { if (policy !== 'none' && E.applySpare(S)) continue; E.giveUp(S); continue; }
      for (const [s, t] of p) E.applyPour(S, s, t, H);
      continue;
    }
    if (bestO) E.applyFlip(S);
    notePlace(S, best);
    E.applyPlace(S, best, H);
  }
  if (S.over && !S.botStats.death) onDeath(S, null);
  return S;
}
function summarize2(label, rules, n, maxTurns, opts) {
  const t1 = Date.now(); const turns = [], scores = []; let capped = 0;
  for (let i = 0; i < n; i++) { const S = runBot2(E.sanitizeRules(rules), `b2-${label}-${i}`, maxTurns, opts); turns.push(S.turn); scores.push(S.score); if (!S.over) capped++; }
  turns.sort((a, b) => a - b); scores.sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  console.log(`${label.padEnd(28)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  alive@${maxTurns}: ${capped}/${n}  (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
}
module.exports = { runBot2, summarize2 };
if (require.main === module) {
  const D = E.DEFAULT_RULES;
  const cfgs = [
    ['v2 default', { ...D }],
    ['v1 rules', { ...E.V1_RULES }],
  ];
  for (const [label, r] of cfgs) summarize2(label, r, 20, 300);
}
