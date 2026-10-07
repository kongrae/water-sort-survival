const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'sim_ads2.js'), 'utf8').split('const N = 100')[0];
const m = { exports: {} };
new Function('require', 'module', '__dirname', src + 'module.exports={E,play};')(require, m, __dirname);
const { E, play } = m.exports;
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const R6 = E.sanitizeRules({});
const ms = [], breaks4 = [], clears = [], scores = [];
for (let i = 0; i < 100; i++) {
  let b4 = 0, prev = 0;
  const S = play(E.newState('endless', 'ads-' + i, R6), 3000, S => { if (prev >= 4 && S.streak === 0) b4++; prev = S.streak; });
  ms.push(S.maxStreak); breaks4.push(b4); clears.push(S.clears); scores.push(S.score);
}
console.log('maxStreak p10/p50/p90', q(ms, .1), q(ms, .5), q(ms, .9), ' runs with streak>=4 broken at least once:', breaks4.filter(x => x > 0).length, '/100');
console.log('clears p50', q(clears, .5), 'score p50', q(scores, .5));
