const { makeEngine } = require('./onb-sim2.js');
const { rep } = require('./onb-run2.js');
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
// twin probability as a function of turn index: table of [untilTurn, p]; after table -> base (independent)
const twinRamp = tbl => `
const __TW = ${JSON.stringify(tbl)};
function pieceAt(seed, rules, i) {
  const rnd = mulberry32(hashStr(seed + '#' + i));
  const size = rules.pieceMin + Math.floor(rnd() * (rules.pieceMax - rules.pieceMin + 1));
  const k = colorsAt(rules, i);
  let pt = -1; for (const [u, p] of __TW) if (i < u) { pt = p; break; }
  const p = [Math.floor(rnd() * k)];
  for (let j = 1; j < size; j++) { const r = rnd(); p.push(pt >= 0 && r < pt ? p[0] : Math.floor(rnd() * k)); }
  return p;
}`;
const BASE = makeEngine();
const D = BASE.DEFAULT_RULES, N = 300;
const variants = [
  ['twin .6 <20,.45<40,.3<60', twinRamp([[20, .6], [40, .45], [60, .3]])],
  ['twin .5 <30 only', twinRamp([[30, .5]])],
  ['twin .7 <15 only', twinRamp([[15, .7]])],
  ['twin .35 always', twinRamp([[1e9, .35]])],
  ['twin .5 always', twinRamp([[1e9, .5]])],
];
for (const [l, src] of variants) rep(l, makeEngine(src), D, N);
module.exports = { twinRamp };
