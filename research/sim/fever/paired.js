// Paired comparison (same seeds) of variants vs baseline: mean/median turns & score, mean per-seed delta +- SE.
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES;
const N = Number(process.argv[2] || 30), T = 300;
const F = x => E.sanitizeRules({ ...D, fever: true, ...x });
const cfgs = [
  ['A g6+combo 3t rollout', F({ feverGauge: 6, feverCombo: true }), { policy: 'rollout', margin: 3 }],
  ['A g6+combo 3t now', F({ feverGauge: 6, feverCombo: true }), { policy: 'now' }],
  ['B g8 3t rollout', F({ feverGauge: 8 }), { policy: 'rollout', margin: 3 }],
  ['B g8 3t now', F({ feverGauge: 8 }), { policy: 'now' }],
  ['B g8 3t rollout+ad2', F({ feverGauge: 8, feverAdTurns: 2 }), { policy: 'rollout', margin: 3, ad: true }],
  ['C g8 2t rollout', F({ feverGauge: 8, feverTurns: 2 }), { policy: 'rollout', margin: 3 }],
  ['C g8 2t now', F({ feverGauge: 8, feverTurns: 2 }), { policy: 'now' }],
  ['G g4 3t rollout', F({ feverGauge: 4 }), { policy: 'rollout', margin: 3 }],
];
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const se = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length); };
for (const [bname, fn, pre] of [['greedy', runBot, 'bot-greedy'], ['b2', runBot2, 'b2-b2']]) {
  const t0 = Date.now();
  const base = []; for (let i = 0; i < N; i++) base.push(fn(E.sanitizeRules({ ...D }), `${pre}-${i}`, T));
  const bt = base.map(s => s.turn), bs = base.map(s => s.score);
  console.log(`[${bname}] N=${N} base: turns mean ${mean(bt).toFixed(1)} p50 ${med(bt)} | score mean ${Math.round(mean(bs))} p50 ${med(bs)}`);
  for (const [label, R, opts] of cfgs) {
    const runs = []; for (let i = 0; i < N; i++) runs.push(fn(R, `${pre}-${i}`, T, opts));
    const vt = runs.map(s => s.turn), vs = runs.map(s => s.score);
    const dt = vt.map((v, i) => v - bt[i]), ds = vs.map((v, i) => v - bs[i]);
    const better = dt.filter(x => x > 0).length, worse = dt.filter(x => x < 0).length;
    const uses = mean(runs.map(s => s._st.uses)), fc = mean(runs.map(s => s._st.feverClears)), bonus = mean(runs.map(s => s._st.feverBonus));
    console.log(`  ${label.padEnd(24)} turns mean ${mean(vt).toFixed(1)} p50 ${med(vt)} dTurn ${mean(dt).toFixed(1)}+-${se(dt).toFixed(1)} (W${better}/L${worse}) | score mean ${Math.round(mean(vs))} p50 ${med(vs)} dScore ${(100 * mean(ds) / mean(bs)).toFixed(1)}% | uses ${uses.toFixed(2)} fClr/use ${(fc / Math.max(uses, 1e-9)).toFixed(2)} bonus%score ${(100 * bonus / mean(vs)).toFixed(1)}%`);
  }
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
