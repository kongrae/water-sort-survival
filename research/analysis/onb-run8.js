// Novice placement + "pour hint" (greedy 1-ply pour suggestions followed) vs plain novice. Also count hints shown.
const { makeEngine } = require('./onb-sim2.js');
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const E = makeEngine(); const D = E.DEFAULT_RULES; const KIND = { toEmpty: 0, toPure: 0, toMixed: 0 }; const TT = [];
function evalState(S) { if (S.over) return -1e9; const cap = S.rules.cap, bs = S.bottles;
  const units = bs.reduce((a, b) => a + b.length, 0), empties = bs.filter(b => !b.length).length, maxFree = Math.max(...bs.map(b => cap - b.length));
  let br = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) br++;
  return S.clears * 6 + empties * 3 + maxFree * 1.5 - units * .6 - br * 2.2 + (E.roomFor(bs, S.piece.length, cap) ? 4 : -8); }
function hintPour(S) { const cap = S.rules.cap, bs = S.bottles, base = evalState(S); let best = null, bv = base + 0.5;
  for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) { if (!E.canPour(bs, s, t, cap)) continue;
    const C = JSON.parse(JSON.stringify(S)); E.applyPour(C, s, t); const v = evalState(C); if (v > bv) { bv = v; best = [s, t]; } } return best; }
function run(seed, hintsPerTurn, hintBudget) {
  const rules = E.sanitizeRules(D); const S = E.newState('endless', seed, rules); const cap = rules.cap; let used = 0;
  function obvious() { for (let g = 0; g < 20 && !S.over; g++) { const bs = S.bottles; let mv = null;
    for (let s = 0; s < bs.length && !mv; s++) for (let t = 0; t < bs.length && !mv; t++) { if (!E.canPour(bs, s, t, cap) || !bs[t].length) continue;
      const tp = E.isPure(bs[t]), sp = E.isPure(bs[s]); if (tp && !sp) mv = [s, t]; else if (tp && sp && bs[s].length <= bs[t].length) mv = [s, t]; }
    if (!mv) return; E.applyPour(S, mv[0], mv[1]); } }
  function shallow() { const need = S.piece.length; let fr = [{ b: S.bottles.map(x => x.slice()), p: [] }];
    for (let d = 0; d < 2; d++) { const nx = []; for (const { b, p } of fr) for (let s = 0; s < b.length; s++) for (let t = 0; t < b.length; t++) {
      if (!E.canPour(b, s, t, cap)) continue; const nb = b.map(x => x.slice()); E.doPour(nb, s, t, cap); E.resolveBoard(nb, S.rules);
      const pp = p.concat([[s, t]]); if (E.roomFor(nb, need, cap)) return pp; nx.push({ b: nb, p: pp }); } fr = nx; } return null; }
  while (!S.over && S.turn < 400) {
    obvious();
    for (let h = 0; h < hintsPerTurn && used < hintBudget && !S.over; h++) { const mv = hintPour(S); if (!mv) break; KIND[S.bottles[mv[1]].length ? (E.isPure(S.bottles[mv[1]]) ? "toPure" : "toMixed") : "toEmpty"]++; TT.push(S.turn); E.applyPour(S, mv[0], mv[1]); used++; obvious(); }
    if (S.over) break; const p = S.piece; let best = -1, bv = -1e9;
    S.bottles.forEach((b, i) => { if (cap - b.length < p.length) return; let v = 0;
      if (b.length && b[b.length - 1] === p[0]) v += 10 + (E.isPure(b) ? 5 : 0); else if (!b.length) v += 6; v += (cap - b.length) * .5; if (v > bv) { bv = v; best = i; } });
    if (best < 0) { const pa = shallow(); if (!pa) { E.giveUp(S); break; } for (const [s, t] of pa) E.applyPour(S, s, t); continue; }
    E.applyPlace(S, best);
  }
  return { turn: S.turn, used };
}
for (const [hpt, bud, label] of [[1, 1e9, "unlimited"]]) {
  const T = [], U = [];
  for (let i = 0; i < 200; i++) { const r = run('seed-' + i, hpt, bud); T.push(r.turn); U.push(r.used); }
  console.log(label.padEnd(34), 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), 'die<20', (T.filter(t => t < 20).length / 2).toFixed(0) + '%', 'hints used p50', q(U, .5));
}
console.log(KIND, "hint turn p25/50/75", q(TT,.25), q(TT,.5), q(TT,.75));
