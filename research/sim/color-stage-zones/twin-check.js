// Replication of the twin-piece difficulty effect on a fresh seed set (bot ignores the bonus, so only the piece sequence differs).
// usage: node twin-check.js [n=600]
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const N = +process.argv[2] || 600;
const cfgs = [['baseline', {}], ['twin2', { zones: true, zoneTwinSize: 2 }], ['twin1', { zones: true, zoneTwinSize: 1 }]];
for (const [bn, bot] of [['greedy', runBot], ['look2', runBot2]]) {
  for (const [label, r] of cfgs) {
    const rules = E.sanitizeRules(r), t = [];
    let atStart = 0;
    for (let i = 0; i < N; i++) { const S = bot(rules, 'rep-' + i, 300, { zoneW: 0 }); t.push(S.turn); if (S.over && S.turn % 20 === 0 && S.turn <= 80 && S.turn > 0) atStart++; }
    const m = t.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(t.reduce((a, b) => a + (b - m) ** 2, 0) / (N - 1));
    const s = t.slice().sort((a, b) => a - b), q = p => s[Math.floor(p * N)];
    console.log(`${bn.padEnd(7)} ${label.padEnd(9)} mean ${m.toFixed(1)} +- ${(sd / Math.sqrt(N)).toFixed(1)} (SE)  p10/p50/p90 ${q(.1)}/${q(.5)}/${q(.9)}  died on new-colour turn ${atStart}/${N}`);
  }
}
