// Onboarding/difficulty experiments: novice bot, first-clear timing, pours per turn, variants.
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES;
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

// Novice: place on matching top, else emptiest; only "obvious" pours (onto pure same-color bottle, or that clear). If stuck, shallow search depth<=2.
function roomPathShallow(S, depthMax) {
  const cap = S.rules.cap, need = S.piece.length;
  let frontier = [{ b: S.bottles.map(x => x.slice()), path: [] }];
  for (let d = 0; d < depthMax; d++) {
    const next = [];
    for (const { b, path } of frontier) for (let s = 0; s < b.length; s++) for (let t = 0; t < b.length; t++) {
      if (!E.canPour(b, s, t, cap)) continue;
      const nb = b.map(x => x.slice()); E.doPour(nb, s, t, cap); E.resolveBoard(nb, S.rules);
      const p = path.concat([[s, t]]);
      if (E.roomFor(nb, need, cap)) return p;
      next.push({ b: nb, path: p });
    }
    frontier = next;
  }
  return null;
}
function obviousPours(S, stats) {
  const cap = S.rules.cap;
  for (let g = 0; g < 20 && !S.over; g++) {
    const bs = S.bottles; let mv = null;
    for (let s = 0; s < bs.length && !mv; s++) for (let t = 0; t < bs.length && !mv; t++) {
      if (!E.canPour(bs, s, t, cap) || !bs[t].length) continue;
      const tp = E.isPure(bs[t]), sp = E.isPure(bs[s]);
      if (tp && !sp) mv = [s, t];
      else if (tp && sp && bs[s].length <= bs[t].length && s !== t) mv = [s, t];
    }
    if (!mv) return;
    E.applyPour(S, mv[0], mv[1]); if (stats) stats.pours++;
  }
}
function runNovice(rules, seed, maxTurns, opt) {
  opt = opt || {};
  const S = E.newState('endless', seed, rules);
  const stats = { pours: 0, firstClear: -1, hints: 0 };
  while (!S.over && S.turn < maxTurns) {
    obviousPours(S, stats);
    if (S.over) break;
    const cap = rules.cap, p = S.piece; let best = -1, bv = -1e9;
    S.bottles.forEach((b, i) => {
      if (cap - b.length < p.length) return;
      let v = 0;
      if (b.length && b[b.length - 1] === p[0]) v += 10 + (E.isPure(b) ? 5 : 0);
      else if (!b.length) v += 6;
      v += (cap - b.length) * 0.5;
      if (v > bv) { bv = v; best = i; }
    });
    if (best < 0) {
      const path = roomPathShallow(S, opt.hint ? 6 : 2);
      if (!path) { E.giveUp(S); break; }
      if (opt.hint && path.length > 2) stats.hints++;
      for (const [s, t] of path) { E.applyPour(S, s, t); stats.pours++; }
      continue;
    }
    const before = S.clears;
    E.applyPlace(S, best);
    if (opt.mercy) opt.mercy(S);
    if (stats.firstClear < 0 && S.clears > 0) stats.firstClear = S.turn;
  }
  return { S, stats };
}
module.exports = { runNovice };
if (require.main === module) {
  const N = 200;
  function rep(label, rules, n, fn) {
    const T = [], FC = [], P = [];
    for (let i = 0; i < n; i++) { const r = fn(E.sanitizeRules(rules), 'nv-' + label + '-' + i); T.push(r.S.turn); FC.push(r.stats.firstClear < 0 ? 999 : r.stats.firstClear); P.push(r.stats.pours / Math.max(1, r.S.turn)); }
    console.log(label.padEnd(30), 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), '| firstClear p50/p90', q(FC, .5), q(FC, .9), '| pours/turn p50', q(P, .5).toFixed(2));
  }
  rep('novice default', D, N, (r, s) => runNovice(r, s, 400));
  rep('novice start3', { ...D, startColors: 3 }, N, (r, s) => runNovice(r, s, 400));
  rep('novice colorEvery30', { ...D, colorEvery: 30 }, N, (r, s) => runNovice(r, s, 400));
  rep('novice bottles7', { ...D, bottles: 7 }, N, (r, s) => runNovice(r, s, 400));
  rep('novice +hint(depth6)', D, N, (r, s) => runNovice(r, s, 400, { hint: true }));
  rep('novice start5', { ...D, startColors: 5 }, N, (r, s) => runNovice(r, s, 400));
  rep('novice start6', { ...D, startColors: 6 }, N, (r, s) => runNovice(r, s, 400));
}
