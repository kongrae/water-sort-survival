// Novice that heeds a "bury warning": avoid placing a mismatching piece onto a top run >= 2 (or a pure bottle) if any other legal bottle avoids it.
const { makeEngine } = require('./onb-sim2.js');
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const E = makeEngine(); const D = E.DEFAULT_RULES;
function run(seed, heed, rules) {
  rules = E.sanitizeRules(rules || D); const S = E.newState('endless', seed, rules); const cap = rules.cap; let warns = 0;
  function obvious() { for (let g = 0; g < 20 && !S.over; g++) { const bs = S.bottles; let mv = null;
    for (let s = 0; s < bs.length && !mv; s++) for (let t = 0; t < bs.length && !mv; t++) { if (!E.canPour(bs, s, t, cap) || !bs[t].length) continue;
      const tp = E.isPure(bs[t]), sp = E.isPure(bs[s]); if (tp && !sp) mv = [s, t]; else if (tp && sp && bs[s].length <= bs[t].length) mv = [s, t]; }
    if (!mv) return; E.applyPour(S, mv[0], mv[1]); } }
  function shallow() { const need = S.piece.length; let fr = [{ b: S.bottles.map(x => x.slice()), p: [] }];
    for (let d = 0; d < 2; d++) { const nx = []; for (const { b, p } of fr) for (let s = 0; s < b.length; s++) for (let t = 0; t < b.length; t++) {
      if (!E.canPour(b, s, t, cap)) continue; const nb = b.map(x => x.slice()); E.doPour(nb, s, t, cap); E.resolveBoard(nb, S.rules);
      const pp = p.concat([[s, t]]); if (E.roomFor(nb, need, cap)) return pp; nx.push({ b: nb, p: pp }); } fr = nx; } return null; }
  const buries = (b, p) => b.length && b[b.length - 1] !== p[0] && (E.topSeg(b).n >= 2 || E.isPure(b));
  while (!S.over && S.turn < 400) {
    obvious(); if (S.over) break; const p = S.piece; let best = -1, bv = -1e9;
    S.bottles.forEach((b, i) => { if (cap - b.length < p.length) return; let v = 0;
      if (b.length && b[b.length - 1] === p[0]) v += 10 + (E.isPure(b) ? 5 : 0); else if (!b.length) v += 6; v += (cap - b.length) * .5;
      if (heed && buries(b, p)) v -= 20; if (v > bv) { bv = v; best = i; } });
    if (best < 0) { const pa = shallow(); if (!pa) { E.giveUp(S); break; } for (const [s, t] of pa) E.applyPour(S, s, t); continue; }
    if (buries(S.bottles[best], p)) warns++;
    E.applyPlace(S, best);
  }
  return { turn: S.turn, warns };
}
for (const heed of [false, true]) { const T = [], W = [];
  for (let i = 0; i < 300; i++) { const r = run('seed-' + i, heed); T.push(r.turn); W.push(r.warns / Math.max(1, r.turn)); }
  console.log('heed=' + heed, 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), 'die<20', (T.filter(t => t < 20).length / 3).toFixed(0) + '%', 'bury-placements per turn p50', q(W, .5).toFixed(2)); }
