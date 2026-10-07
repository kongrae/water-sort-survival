const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'sim_ads2.js'), 'utf8').split('const N = 100')[0];
const m = { exports: {} };
new Function('require', 'module', '__dirname', src + 'module.exports={E,play};')(require, m, __dirname);
const { E, play } = m.exports;
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const R6 = E.sanitizeRules({});
const danger = S => S.turn >= 15 && !S.bottles.some(b => !b.length) && S.bottles.reduce((a, b) => a + 4 - b.length, 0) <= 5;
const N = 100;
const lead = [], fired = [], g1 = [], g2 = [], g3 = [];
for (let i = 0; i < N; i++) {
  const seed = 'ads-' + i;
  let first = null;
  const S0 = play(E.newState('endless', seed, R6), 3000, S => { if (first == null && danger(S)) first = S.turn; });
  if (first == null) { fired.push(0); continue; }
  fired.push(1); lead.push(S0.turn - first);
  // +1 bottle at first danger
  const mk = () => E.newState('endless', seed, R6);
  let d = false; const S1 = play(mk(), 3000, S => { if (!d && danger(S)) { d = true; S.bottles.push([]); } }); g1.push(S1.turn - S0.turn);
  // revive (empty 2 fullest) at first danger instead of at death
  d = false; const S2 = play(mk(), 3000, S => { if (!d && danger(S)) { d = true; const idx = S.bottles.map((b, i) => [b.length, i]).sort((x, y) => y[0] - x[0]).slice(0, 2).map(x => x[1]); idx.forEach(i => S.bottles[i] = []); } }); g2.push(S2.turn - S0.turn);
  // temp bottle for 15 turns: after 15 turns remove it (its contents lost) 
  d = false; let until = -1; const S3 = play(mk(), 3000, S => { if (!d && danger(S)) { d = true; S.bottles.push([]); until = S.turn + 15; } if (until > 0 && S.turn >= until && S.bottles.length === 7) { S.bottles.pop(); } }); g3.push(S3.turn - S0.turn);
}
console.log('danger fired in', fired.filter(x => x).length, '/', N, ' turns from danger to death p10/p50/p90', q(lead, .1), q(lead, .5), q(lead, .9));
console.log('+1 bottle at danger: gain p10/p50/p90', q(g1, .1), q(g1, .5), q(g1, .9));
console.log('empty 2 at danger:   gain p10/p50/p90', q(g2, .1), q(g2, .5), q(g2, .9));
console.log('temp bottle 15t:     gain p10/p50/p90', q(g3, .1), q(g3, .5), q(g3, .9));
