// Doubled clears produced by each individual fever activation (histogram over all activations).
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, N = Number(process.argv[2] || 200), T = 300;
for (const [bname, fn, pre] of [['greedy', runBot, 'bot-greedy'], ['b2', runBot2, 'b2-b2']]) {
  for (const [label, x] of [['B g8 3t', { feverGauge: 8, feverTurns: 3 }], ['C g8 2t', { feverGauge: 8, feverTurns: 2 }], ['A g6+combo 3t', { feverGauge: 6, feverCombo: true }]]) {
    const R = E.sanitizeRules({ ...D, fever: true, ...x });
    const out = [];
    for (const [pn, opts] of [['rollout', { policy: 'rollout', margin: 3 }], ['now', { policy: 'now' }]]) {
      const h = [0, 0, 0]; let held = 0, dec = 0, close = 0;
      for (let i = 0; i < N; i++) {
        const S = fn(R, `${pre}-${i}`, T, opts);
        for (const u of S.feverUses) h[Math.min(2, S._st.win[u] || 0)]++;
        held += S._st.held; dec += S._st.decided; close += S._st.closeCalls;
      }
      const t = h[0] + h[1] + h[2];
      out.push(`${pn}: 0clr ${(100 * h[0] / t).toFixed(0)}% 1clr ${(100 * h[1] / t).toFixed(0)}% 2+ ${(100 * h[2] / t).toFixed(0)}% (uses ${t})` + (pn === 'rollout' ? ` hold-rate ${(100 * held / dec).toFixed(0)}% close ${(100 * close / dec).toFixed(0)}%` : ''));
    }
    console.log(`${bname} ${label} | ${out.join(' | ')}`);
  }
}
