const { makeEngine, BAG, TWIN } = require('./onb-sim2.js');
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
function novice(E, rules, seed, maxTurns, opt) {
  opt = opt || {};
  const S = E.newState('endless', seed, rules);
  const st = { firstClear: -1, pours: 0, danger: 0, clutch: 0, mercy: 0, lastClearTurn: 0, lastMercy: -99 };
  const cap = rules.cap;
  function obvious() {
    for (let g = 0; g < 20 && !S.over; g++) {
      const bs = S.bottles; let mv = null;
      for (let s = 0; s < bs.length && !mv; s++) for (let t = 0; t < bs.length && !mv; t++) {
        if (!E.canPour(bs, s, t, cap) || !bs[t].length) continue;
        const tp = E.isPure(bs[t]), sp = E.isPure(bs[s]);
        if (tp && !sp) mv = [s, t]; else if (tp && sp && bs[s].length <= bs[t].length) mv = [s, t];
      }
      if (!mv) return; E.applyPour(S, mv[0], mv[1]); st.pours++;
    }
  }
  function shallow(depthMax) {
    const need = S.piece.length; let fr = [{ b: S.bottles.map(x => x.slice()), p: [] }];
    for (let d = 0; d < depthMax; d++) { const nx = [];
      for (const { b, p } of fr) for (let s = 0; s < b.length; s++) for (let t = 0; t < b.length; t++) {
        if (!E.canPour(b, s, t, cap)) continue; const nb = b.map(x => x.slice()); E.doPour(nb, s, t, cap); E.resolveBoard(nb, S.rules);
        const pp = p.concat([[s, t]]); if (E.roomFor(nb, need, cap)) return pp; nx.push({ b: nb, p: pp }); }
      fr = nx; }
    return null;
  }
  while (!S.over && S.turn < maxTurns) {
    obvious(); if (S.over) break;
    const fill = S.bottles.reduce((a, b) => a + b.length, 0);
    const p = S.piece; let best = -1, bv = -1e9;
    S.bottles.forEach((b, i) => { if (cap - b.length < p.length) return; let v = 0;
      if (b.length && b[b.length - 1] === p[0]) v += 10 + (E.isPure(b) ? 5 : 0); else if (!b.length) v += 6; v += (cap - b.length) * .5; if (v > bv) { bv = v; best = i; } });
    if (best < 0) { const pa = shallow(opt.deep ? 6 : 2); if (!pa) { E.giveUp(S); break; } for (const [s, t] of pa) { E.applyPour(S, s, t); st.pours++; } continue; }
    const c0 = S.clears;
    const danger = fill >= S.rules.bottles * cap - 4;
    E.applyPlace(S, best);
    obvious();
    if (S.clears > c0) { if (st.firstClear < 0) st.firstClear = S.turn; st.lastClearTurn = S.turn; if (danger) st.clutch++; }
    if (danger) st.danger++;
    if (opt.mercy && !S.over && S.turn - st.lastClearTurn >= opt.mercy.dry && S.turn - st.lastMercy >= opt.mercy.cool) {
      const f2 = S.bottles.reduce((a, b) => a + b.length, 0);
      if (f2 >= opt.mercy.fill) {
        // find pure bottle closest to complete
        let bi = -1, bn = 0; S.bottles.forEach((b, i) => { if (b.length && E.isPure(b) && b.length > bn) { bn = b.length; bi = i; } });
        if (bi >= 0) { const need = Math.min(S.rules.pieceMax, cap - bn); S.piece = Array(need).fill(S.bottles[bi][0]); st.mercy++; st.lastMercy = S.turn; E.checkStuck(S); }
      }
    }
  }
  return { S, st };
}
function rep(label, E, rules, n, opt, maxT) {
  const T = [], FC = [], CL = [], DG = [], M = [];
  for (let i = 0; i < n; i++) { const { S, st } = novice(E, E.sanitizeRules(rules), 'seed-' + i, maxT || 400, opt);
    T.push(S.turn); FC.push(st.firstClear < 0 ? 999 : st.firstClear); CL.push(st.clutch); DG.push(st.danger); M.push(st.mercy); }
  const mean = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  const early = T.filter(t => t < 20).length;
  console.log(label.padEnd(30), 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), '| die<20:', (early / n * 100).toFixed(0) + '%', '| 1stClear p50/p90', q(FC, .5), q(FC, .9), '| danger turns', mean(DG), 'clutch', mean(CL), 'mercy', mean(M));
}
module.exports = { novice, rep };
if (require.main === module) {
  const BASE = makeEngine(), EB = makeEngine(BAG), ET = makeEngine(TWIN);
  const D = BASE.DEFAULT_RULES, N = 300;
  rep('base', BASE, D, N);
  rep('bag10', EB, D, N);
  rep('twin50', ET, D, N);
  rep('base start3', BASE, { ...D, startColors: 3 }, N);
  rep('base cE30', BASE, { ...D, colorEvery: 30 }, N);
  rep('base deep-hint', BASE, D, N, { deep: true });
  rep('base mercy dry6 fill16 cd15', BASE, D, N, { mercy: { dry: 6, fill: 16, cool: 15 } });
  rep('base mercy dry5 fill14 cd10', BASE, D, N, { mercy: { dry: 5, fill: 14, cool: 10 } });
  rep('bag10 + mercy6/16/15', EB, D, N, { mercy: { dry: 6, fill: 16, cool: 15 } });
}
