// Measures the spec's adjustment candidates on the same 200 seeds (defaults are NOT changed).
const H = require('./harness.js'), B2 = require('./bot2.js'), E = H.E;
const A = require('./bench-out/A.json');
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const D = E.DEFAULT_RULES;
const V = [
  ['F (현재 v2)', { ...D }, {}],
  ['F flipLimit 2', { ...D, flipLimit: 2 }, {}],
  ['F 쌍둥이 1칸', { ...D, zoneTwinSize: 1 }, {}],
  ['F flipLimit 2 + 쌍둥이 1칸', { ...D, flipLimit: 2, zoneTwinSize: 1 }, {}],
  ['G (현재, 잔 즉시 수락)', { ...D, spare: true }, { spare: 'asap' }],
  ['G spareMaxFree 8', { ...D, spare: true, spareMaxFree: 8 }, { spare: 'asap' }],
  ['G flipLimit 2', { ...D, spare: true, flipLimit: 2 }, { spare: 'asap' }],
  ['G flipLimit 2 + spareMaxFree 8', { ...D, spare: true, flipLimit: 2, spareMaxFree: 8 }, { spare: 'asap' }],
];
const res = {};
for (const [name, rules, opts] of V) {
  const r = { greedy: [], bot2: [] };
  for (let i = 0; i < 200; i++) {
    const R = E.sanitizeRules(rules);
    r.greedy.push(H.runBot(R, 'v2b-' + i, 300, opts));
    r.bot2.push(B2.runBot2(R, 'v2b-' + i, 300, opts));
  }
  res[name] = r;
  const line = ['greedy', 'bot2'].map(b => {
    const t = r[b].map(S => S.turn), a50 = q(A[b].map(x => x.turns), .5), p50 = q(t, .5);
    const surv = r[b].filter(S => !S.over).length;
    const used = r[b].filter(S => S.spareUsed), w3 = used.filter(S => S.over && S.turn - S.spareTurn <= 3).length;
    return `${b} p50 ${p50} (×${(p50 / a50).toFixed(3)}) 생존 ${surv}/200` + (used.length ? ` 잔 3턴내 사망 ${(100 * w3 / used.length).toFixed(1)}%` : '');
  }).join(' | ');
  console.log(name.padEnd(30), line);
}
// mixed distribution for F/G pairs
function wq(s, p) { const a = s.slice().sort((x, y) => x[0] - y[0]); const tot = a.reduce((x, y) => x + y[1], 0); let acc = 0; for (const [v, w] of a) { acc += w; if (acc >= p * tot) return v; } }
for (const [f, g] of [['F (현재 v2)', 'G (현재, 잔 즉시 수락)'], ['F flipLimit 2', 'G flipLimit 2'], ['F flipLimit 2', 'G flipLimit 2 + spareMaxFree 8']]) {
  const a50 = q(A.bot2.map(x => x.turns), .5);
  const mix = res[f].bot2.map(S => [S.turn, .75]).concat(res[g].bot2.map(S => [S.turn, .25]));
  const m50 = wq(mix, .5), ms = .75 * res[f].bot2.filter(S => !S.over).length + .25 * res[g].bot2.filter(S => !S.over).length;
  console.log(`M = 0.75·[${f}] + 0.25·[${g}]: bot2 p50 ${m50} (×${(m50 / a50).toFixed(3)}), 가중 생존 ${ms.toFixed(2)}/200`);
}
