const { makeEngine } = require('./onb-sim2.js');
const { twinRamp } = (() => { const m = {}; m.twinRamp = tbl => `
const __TW = ${JSON.stringify(tbl)};
function pieceAt(seed, rules, i) {
  const rnd = mulberry32(hashStr(seed + '#' + i));
  const size = rules.pieceMin + Math.floor(rnd() * (rules.pieceMax - rules.pieceMin + 1));
  const k = colorsAt(rules, i);
  let pt = -1; for (const [u, p] of __TW) if (i < u) { pt = p; break; }
  const p = [Math.floor(rnd() * k)];
  for (let j = 1; j < size; j++) { const r = rnd(); p.push(pt >= 0 && r < pt ? p[0] : Math.floor(rnd() * k)); }
  return p;
}`; return m; })();
const H = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const { novice } = require('./onb-run2.js');
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const ORIG = Object.assign({}, H.E);
function strong(label, eng, rules, n, maxT) {
  Object.assign(H.E, eng);
  const T = [], Sc = [], t0 = Date.now();
  for (let i = 0; i < n; i++) { const S = runBot2(eng.sanitizeRules(rules), 'seed-' + i, maxT); T.push(S.turn); Sc.push(S.score); }
  Object.assign(H.E, ORIG);
  console.log(('STRONG ' + label).padEnd(34), 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), '| score p50', q(Sc, .5), `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
function weak(label, eng, rules, n) {
  const T = [], Sc = [];
  for (let i = 0; i < n; i++) { const { S } = novice(eng, eng.sanitizeRules(rules), 'seed-' + i, 400); T.push(S.turn); Sc.push(S.score); }
  console.log(('NOVICE ' + label).padEnd(34), 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), '| score p50', q(Sc, .5));
}
const BASE = makeEngine(), TW = makeEngine(twinRamp([[15, .7]]));
const D = BASE.DEFAULT_RULES;
const which = process.argv[2] || 'all';
if (which === 'weak' || which === 'all') {
  for (const s of [3, 4, 5, 6]) weak('start' + s, BASE, { ...D, startColors: s }, 300);
}
if (which === 'strong' || which === 'all') {
  strong('base', BASE, D, 24, 400);
  strong('twin.7<15', TW, D, 24, 400);
  strong('start5', BASE, { ...D, startColors: 5 }, 24, 400);
  strong('start6', BASE, { ...D, startColors: 6 }, 24, 400);
}
