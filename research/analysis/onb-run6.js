const H = require('./harness.js'); const { runBot2 } = require('./bot2.js');
const orig = H.E.applyPour; let pours = 0, turns = 0;
H.E.applyPour = (...a) => { const r = orig(...a); if (r) pours++; return r; };
const T = [];
for (let i = 0; i < 30; i++) { const S = runBot2(H.E.sanitizeRules(H.E.DEFAULT_RULES), 'seed-' + i, 400); turns += S.turn; T.push(S.turn); }
console.log('strong pours/turn', (pours / turns).toFixed(2), 'avg turns', (turns / 30).toFixed(0));
