// Extend the first six censored seeds of the selected 90% double-piece candidate, preserving the same policy.
const fs = require('fs');
const path = require('path');
const { E, run } = require('./bots');
const previous = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'tail-comparison-60-500.json'), 'utf8'));
const source = previous.results.find(r => r.label === 'steady-tail-90' && r.depth === 2);
const seeds = source.rows.filter(r => !r.over).slice(0, 6).map(r => r.seed), rows = [];
for (const seed of seeds) {
  const r = run(E.sanitizeRules(E.EXPANDING_RULES), seed, 1500, 2); delete r.state; rows.push(r);
  console.log(JSON.stringify({ seed, turn: r.turn, score: r.score, over: r.over, colors: r.colors, stableAssigned: r.metrics.stableAssigned }));
}
fs.writeFileSync(path.join(__dirname, 'out', 'tail-check.json'), JSON.stringify({ selection: 'first six seeds surviving 500 in steady-tail-90/d2; conditional sample, not population estimate', cap: 1500, rules: E.sanitizeRules(E.EXPANDING_RULES), rows }, null, 2));
