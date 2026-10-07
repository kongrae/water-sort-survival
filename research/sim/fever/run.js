// Baseline vs fever variants, 30 games per bot, maxTurns 300. Same seed prefix per bot => paired comparison.
const { E, summarize } = require('./harness.js');
const { summarize2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, N = 30, T = 300;
const which = process.argv[2] || 'main';
const F = (extra) => ({ ...D, fever: true, ...extra });
const sets = {
  main: [
    ['base (off)', { ...D }, null],
    ['A g6 +combo 3t rollout', F({ feverGauge: 6, feverCombo: true, feverTurns: 3 }), { policy: 'rollout', margin: 3 }],
    ['B g8 3t rollout', F({ feverGauge: 8, feverTurns: 3 }), { policy: 'rollout', margin: 3 }],
    ['B g8 3t now(auto)', F({ feverGauge: 8, feverTurns: 3 }), { policy: 'now' }],
    ['C g8 2t rollout', F({ feverGauge: 8, feverTurns: 2 }), { policy: 'rollout', margin: 3 }],
    ['C g8 2t now(auto)', F({ feverGauge: 8, feverTurns: 2 }), { policy: 'now' }],
  ],
  extra: [
    ['B g8 3t rollout hold5', F({ feverGauge: 8, feverTurns: 3 }), { policy: 'rollout', margin: 3, maxHold: 5 }],
    ['B g8 3t rollout m0', F({ feverGauge: 8, feverTurns: 3 }), { policy: 'rollout', margin: 0.01 }],
    ['B g8 3t rollout +ad2', F({ feverGauge: 8, feverTurns: 3, feverAdTurns: 2 }), { policy: 'rollout', margin: 3, ad: true }],
    ['A g6 +combo 3t now', F({ feverGauge: 6, feverCombo: true, feverTurns: 3 }), { policy: 'now' }],
    ['G g4 3t rollout', F({ feverGauge: 4, feverTurns: 3 }), { policy: 'rollout', margin: 3 }],
  ],
};
for (const [label, rules, opts] of sets[which]) {
  summarize('greedy | ' + label, rules, N, T, opts);
}
for (const [label, rules, opts] of sets[which]) {
  summarize2('b2 | ' + label, rules, N, T, opts);
}
