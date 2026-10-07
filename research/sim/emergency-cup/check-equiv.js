// Flag-off equivalence: copied engine/bots vs originals on identical seeds.
const O = require('../../harness.js'), O2 = require('../../bot2.js');
const N = require('./harness.js'), N2 = require('./bot2.js');
const R = O.E.sanitizeRules(O.E.DEFAULT_RULES), RN = N.E.sanitizeRules(N.E.DEFAULT_RULES);
const RNon = N.E.sanitizeRules({ ...N.E.DEFAULT_RULES, spare: true }); // flag on, bot never takes it
let diff = 0, t0 = Date.now();
const k = S => [S.turn, S.score, S.clears, S.over, S.bottles.map(b => b.join('')).join('|')].join(';');
for (let i = 0; i < 12; i++) {
  const seed = 'eq-' + i;
  const a = k(O.runBot(R, seed, 300)), b = k(N.runBot(RN, seed, 300)), c = k(N.runBot(RNon, seed, 300, { spare: 'never' }));
  if (a !== b || a !== c) { diff++; console.log('greedy diff', seed, a, b, c); }
}
console.log('greedy done', Date.now() - t0, 'ms'); t0 = Date.now();
for (let i = 0; i < 12; i++) {
  const seed = 'eq2-' + i;
  const a = k(O2.runBot2(R, seed, 300)), b = k(N2.runBot2(RN, seed, 300)), c = k(N2.runBot2(RNon, seed, 300, { spare: 'never' }));
  if (a !== b || a !== c) { diff++; console.log('bot2 diff', seed, a, b, c); }
}
console.log('bot2 done', Date.now() - t0, 'ms');
console.log('differences:', diff);
