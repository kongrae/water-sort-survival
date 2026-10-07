// Bonus share for b25 x zone (cap 5) and cumulative-star unlock pacing (stars mode 'empty2' and 'clean').
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const N = 300;
for (const [bn, bot, pre] of [['greedy', runBot, 'bot-zs-'], ['look2', runBot2, 'b2-zs-']]) {
  const rules = E.sanitizeRules({ zones: true, zoneBonus: 25, zoneMulMax: 5 });
  const R = []; for (let i = 0; i < N; i++) R.push(bot(rules, pre + i, 300, { zoneW: 1 }));
  const share = R.map(S => S.score ? S.zoneBonusTotal / S.score : 0).sort((a, b) => a - b);
  const st = R.map(S => E.zoneStars(S, 'empty2').reduce((a, b) => a + b, 0));
  const mean = st.reduce((a, b) => a + b, 0) / N;
  const runsTo = g => { let c = 0; for (let i = 0; i < N; i++) { c += st[i]; if (c >= g) return i + 1; } return '>' + N; };
  console.log(`${bn} b25 cap5: share p50 ${(100 * share[N >> 1]).toFixed(0)}% p90 ${(100 * share[Math.floor(.9 * N)]).toFixed(0)}%  stars/run mean ${mean.toFixed(1)}  cumulative runs to 6/12/18 = ${[6, 12, 18].map(runsTo).join('/')}  to 15/45/90 = ${[15, 45, 90].map(runsTo).join('/')}`);
}
