// Baseline vs piece-flip, both bots, paired seeds (same seed list for every config so differences are not seed noise).
// usage: node run-flip.js [n=30] [maxTurns=300] [configFilter]
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const N = +process.argv[2] || 30, MAXT = +process.argv[3] || 300, FILTER = process.argv[4] || '';
const D = E.DEFAULT_RULES;
const CFGS = [
  ['baseline (flip off)', { ...D }],
  ['flip', { ...D, flip: true }],
  ['flip + colorEvery 18', { ...D, flip: true, colorEvery: 18 }],
  ['flip + colorEvery 17', { ...D, flip: true, colorEvery: 17 }],
  ['flip + colorEvery 16', { ...D, flip: true, colorEvery: 16 }],
  ['flip + maxColors 9', { ...D, flip: true, maxColors: 9 }],
  ['baseline + colorEvery 17', { ...D, colorEvery: 17 }],
  ['flip naive-rule', { ...D, flip: true }, { flipPolicy: 'naive' }],
  ['flip limit 10/run', { ...D, flip: true, flipLimit: 10 }],
  ['flip limit 20/run', { ...D, flip: true, flipLimit: 20 }],
  ['flip limit 3/run', { ...D, flip: true, flipLimit: 3 }],
  ['flip limit 5/run', { ...D, flip: true, flipLimit: 5 }],
  ['flip limit 5 + colorEvery 18', { ...D, flip: true, flipLimit: 5, colorEvery: 18 }],
].filter(([l]) => !FILTER || FILTER.split(',').some(f => l === f));
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const results = {};
function run(botName, fn, label, rules, opts) {
  const t1 = Date.now(), turns = [], scores = [], clears = [], perSeed = [];
  let capped = 0; const st = { avail: 0, used: 0, matters: 0, naiveDet: 0, naiveAgree: 0, think: 0, gaps: [], places: 0, flipsAction: 0, late: { avail: 0, used: 0, matters: 0, places: 0 } };
  for (let i = 0; i < N; i++) {
    const S = fn(E.sanitizeRules(rules), `pf-${i}`, MAXT, opts);
    turns.push(S.turn); scores.push(S.score); clears.push(S.clears); perSeed.push(S.turn);
    if (!S.over) capped++;
    const f = S.flipStats; for (const k of ['avail', 'used', 'matters', 'naiveDet', 'naiveAgree', 'think']) st[k] += f[k];
    st.gaps.push(...f.gaps); st.places += S.turn; st.flipsAction += S.flipsPlaced || 0; for (const k in f.late) st.late[k] += f.late[k];
  }
  const ts = turns.slice().sort((a, b) => a - b), ss = scores.slice().sort((a, b) => a - b);
  results[botName + '|' + label] = perSeed;
  const fl = st.flipsAction ? `  flips/run ${(st.flipsAction / N).toFixed(1)} (${(100 * st.flipsAction / st.places).toFixed(1)}% of turns)` : '';
  console.log(`${botName} ${label.padEnd(26)} turns p10/p50/p90 = ${q(ts, .1)}/${q(ts, .5)}/${q(ts, .9)}  score p50 = ${q(ss, .5)}  mean turns ${(turns.reduce((a, b) => a + b, 0) / N).toFixed(1)}  alive@${MAXT}: ${capped}/${N}${fl}  (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  if (st.avail) {
    const g = st.gaps.sort((a, b) => a - b), pct = (a, b) => (100 * a / b).toFixed(1) + '%';
    console.log(`     flip avail ${st.avail}/${st.places} placements (${pct(st.avail, st.places)}), used ${st.used} (${pct(st.used, st.avail)} of avail), ` +
      `orientation matters ${st.matters} (${pct(st.matters, st.avail)}); of those naive rule decided ${st.naiveDet}, agreed ${st.naiveAgree} (${pct(st.naiveAgree, st.matters)} of matters = auto-pilot), ` +
      `needs thought ${st.think} (${pct(st.think, st.avail)} of avail); value gap p25/p50/p75 = ${q(g, .25).toFixed(2)}/${q(g, .5).toFixed(2)}/${q(g, .75).toFixed(2)}`);
    const L = st.late, E2 = { avail: st.avail - L.avail, used: st.used - L.used, matters: st.matters - L.matters, places: st.places - L.places };
    console.log(`     early(colors rising): flip used ${E2.used}/${E2.places} placements (${pct(E2.used, E2.places)}), matters ${pct(E2.matters, E2.avail)} of avail | late(max colors): used ${L.used}/${L.places} (${pct(L.used, Math.max(1, L.places))}), matters ${pct(L.matters, Math.max(1, L.avail))} of avail`);
  }
}
const t0 = Date.now();
for (const [label, r, o] of CFGS) run('greedy', runBot, label, r, o);
for (const [label, r, o] of CFGS) run('look2 ', runBot2, label, r, o);
// paired per-seed delta vs baseline
for (const bot of ['greedy', 'look2 ']) {
  const base = results[bot + '|baseline (flip off)']; if (!base) continue;
  for (const [label] of CFGS) {
    if (label.startsWith('baseline (')) continue;
    const v = results[bot + '|' + label]; if (!v) continue;
    const d = v.map((x, i) => x - base[i]).sort((a, b) => a - b);
    const better = d.filter(x => x > 0).length, worse = d.filter(x => x < 0).length;
    console.log(`paired ${bot} ${label.padEnd(26)} delta turns p25/p50/p75 = ${q(d, .25)}/${q(d, .5)}/${q(d, .75)}  mean ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1)}  longer ${better} / shorter ${worse} / same ${d.length - better - worse}`);
  }
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
