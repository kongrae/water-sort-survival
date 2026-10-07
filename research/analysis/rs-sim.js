const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const R = E.sanitizeRules(E.DEFAULT_RULES);
const rows = [];
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
let t2 = 0, t1 = 0;
for (let d = 1; d <= 30; d++) {
  const seed = 'daily:2026-11-' + String(d).padStart(2, '0');
  let a = Date.now(); const g = runBot(R, seed, 400); t1 += Date.now() - a;
  a = Date.now(); const b = runBot2(R, seed, 400); t2 += Date.now() - a;
  rows.push({ seed, gT: g.turn, gS: g.score, bT: b.turn, bS: b.score, bC: b.clears, bMax: b.maxStreak });
}
console.log('greedy turns p10/50/90', q(rows.map(r => r.gT), .1), q(rows.map(r => r.gT), .5), q(rows.map(r => r.gT), .9), 'score p50', q(rows.map(r => r.gS), .5), 'avg ms', (t1 / 30).toFixed(0));
console.log('bot2 turns p10/50/90', q(rows.map(r => r.bT), .1), q(rows.map(r => r.bT), .5), q(rows.map(r => r.bT), .9), 'score p10/50/90', q(rows.map(r => r.bS), .1), q(rows.map(r => r.bS), .5), q(rows.map(r => r.bS), .9), 'avg ms', (t2 / 30).toFixed(0));
console.log('bot2 maxStreak p50/p90', q(rows.map(r => r.bMax), .5), q(rows.map(r => r.bMax), .9), 'clears p50', q(rows.map(r => r.bC), .5));
// how many dailies where greedy dies before turn 20/40
console.log('greedy die<20', rows.filter(r => r.gT < 20).length, 'die<40', rows.filter(r => r.gT < 40).length, 'bot2 reach 80', rows.filter(r => r.bT >= 80).length, 'reach 120', rows.filter(r => r.bT >= 120).length);
// first-N-turn determinism check: does bot2 score at turn 30 vary by seed?
