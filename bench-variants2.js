const H = require('./harness.js'), B2 = require('./bot2.js'), E = H.E;
const A = require('./bench-out/A.json');
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
function wq(s, p) { const a = s.slice().sort((x, y) => x[0] - y[0]); const tot = a.reduce((x, y) => x + y[1], 0); let acc = 0; for (const [v, w] of a) { acc += w; if (acc >= p * tot) return v; } }
const D = E.DEFAULT_RULES;
const run = (rules, opts) => { const r = { greedy: [], bot2: [] }; for (let i = 0; i < 200; i++) { const R = E.sanitizeRules(rules); r.greedy.push(H.runBot(R, 'v2b-' + i, 300, opts)); r.bot2.push(B2.runBot2(R, 'v2b-' + i, 300, opts)); } return r; };
const base = { ...D, flipLimit: 2, zoneTwinSize: 1 };
const F = run(base, {});
for (const smf of [7, 8]) {
  const G = run({ ...base, spare: true, spareMaxFree: smf }, { spare: 'asap' });
  for (const b of ['greedy', 'bot2']) {
    const a50 = q(A[b].map(x => x.turns), .5);
    const used = G[b].filter(S => S.spareUsed), w3 = used.filter(S => S.over && S.turn - S.spareTurn <= 3).length;
    const mix = F[b].map(S => [S.turn, .75]).concat(G[b].map(S => [S.turn, .25]));
    const m50 = wq(mix, .5), ms = .75 * F[b].filter(S => !S.over).length + .25 * G[b].filter(S => !S.over).length;
    const f50 = q(F[b].map(S => S.turn), .5);
    console.log(`flip2+twin1 spareMaxFree ${smf} ${b}: F p50 ${f50} (×${(f50 / a50).toFixed(3)}) 생존 ${F[b].filter(S => !S.over).length} | G 3턴내 사망 ${(100 * w3 / used.length).toFixed(1)}% | M p50 ${m50} (×${(m50 / a50).toFixed(3)}) 가중 생존 ${ms.toFixed(2)}`);
  }
}
const share = F.bot2.filter(S => S.score > 0).map(S => S.zoneBonusTotal / S.score), shareG = F.greedy.filter(S => S.score > 0).map(S => S.zoneBonusTotal / S.score);
console.log('flip2+twin1 보너스 비중 p50/p90 bot2', (100 * q(share, .5)).toFixed(1), (100 * q(share, .9)).toFixed(1), 'greedy', (100 * q(shareG, .5)).toFixed(1), (100 * q(shareG, .9)).toFixed(1));
