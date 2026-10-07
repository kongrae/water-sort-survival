// Extra probe: gauge 8, 4 fever turns (4th piece not visible in a 2-piece preview), rollout policy.
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, N = 200, T = 300;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const se = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length); };
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const [bname, fn, pre] of [['greedy', runBot, 'bot-greedy'], ['b2', runBot2, 'b2-b2']]) {
  const base = []; for (let i = 0; i < N; i++) base.push(fn(E.sanitizeRules({ ...D }), `${pre}-${i}`, T));
  const R = E.sanitizeRules({ ...D, fever: true, feverGauge: 8, feverTurns: 4 });
  const runs = []; const h = [0, 0, 0];
  for (let i = 0; i < N; i++) { const S = fn(R, `${pre}-${i}`, T, { policy: 'rollout', margin: 3 }); runs.push(S); for (const u of S.feverUses) h[Math.min(2, S._st.win[u] || 0)]++; }
  const dt = runs.map((s, i) => s.turn - base[i].turn), t = h[0] + h[1] + h[2];
  const bs = mean(base.map(s => s.score)), vs = mean(runs.map(s => s.score));
  console.log(`${bname} g8 4t rollout: turns p50 ${med(runs.map(s => s.turn))} (base ${med(base.map(s => s.turn))}) dTurn ${mean(dt).toFixed(1)}+-${se(dt).toFixed(1)} score p50 ${med(runs.map(s => s.score))} (base ${med(base.map(s => s.score))}) dScore ${(100 * (vs - bs) / bs).toFixed(1)}% uses ${(t / N).toFixed(2)} 0clr ${(100 * h[0] / t).toFixed(0)}% 1clr ${(100 * h[1] / t).toFixed(0)}% 2+ ${(100 * h[2] / t).toFixed(0)}%`);
}
