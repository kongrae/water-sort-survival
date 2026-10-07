// (1) Do bot2 'asap' runs that hit 300 eventually die? (2) Free cells / crisis flag at the moment of death (baseline, flag on, never use).
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, R1 = E.sanitizeRules({ ...D, spare: true });
const long = [];
for (let i = 0; i < 30; i++) { const S = runBot2(R1, `b2-S-${i}`, 300, { spare: 'asap' }); if (!S.over) { const L = runBot2(R1, `b2-S-${i}`, 1500, { spare: 'asap' }); long.push(L.over ? L.turn : '1500+'); } }
console.log('bot2 asap runs alive@300 -> final turn with max 1500:', long.join(', '));
for (const [name, run, tag] of [['greedy', runBot, 'bot-S'], ['bot2', runBot2, 'b2-S']]) {
  const free = {}; let crisisAtEnd = 0, n = 0;
  for (let i = 0; i < 200; i++) {
    const S = run(R1, `${tag}-${i}`, 300, { spare: 'never' }); if (!S.over) continue; n++;
    const f = S.bottles.reduce((a, b) => a + 4 - b.length, 0); free[f] = (free[f] || 0) + 1;
    // crisis as seen right before the fatal placement is not stored; use the end board (over -> offer false) via spareCrisis
    if (E.spareCrisis(S)) crisisAtEnd++;
  }
  console.log(`${name}: free cells on the final (dead) board over ${n} runs:`, JSON.stringify(free), ` crisis-condition true at death ${crisisAtEnd}/${n}`);
}
