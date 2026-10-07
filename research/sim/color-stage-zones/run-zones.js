// Balance runs for the colour-stage zones mechanic. Paired seeds: every config uses the same seed list per bot.
// usage: node run-zones.js [n=30] [maxTurns=300] [std]   ("std" also prints the stock summarize/summarize2 lines)
const { E, runBot, summarize } = require('./harness.js');
const { runBot2, summarize2 } = require('./bot2.js');
const N = +process.argv[2] || 30, MAXT = +process.argv[3] || 300, STD = process.argv.includes('std');
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const pct = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';

// "best stars" meta: stars per zone kept at their best across sequential runs; when do totals reach 6/12/18?
function unlockRuns(starRuns, goals) {
  const best = [], cum = { sum: 0 }, outBest = {}, outCum = {};
  starRuns.forEach((stars, r) => {
    stars.forEach((s, z) => { best[z] = Math.max(best[z] || 0, s); });
    cum.sum += stars.reduce((a, b) => a + b, 0);
    const tb = best.reduce((a, b) => a + (b || 0), 0);
    for (const g of goals) { if (outBest[g] == null && tb >= g) outBest[g] = r + 1; if (outCum[g] == null && cum.sum >= g) outCum[g] = r + 1; }
  });
  const f = o => goals.map(g => o[g] == null ? `>${starRuns.length}` : o[g]).join('/');
  return { best: f(outBest), cum: f(outCum), maxBest: best.reduce((a, b) => a + (b || 0), 0) };
}

function run(label, botName, rules, opts) {
  rules = E.sanitizeRules(rules);
  const bot = botName === 'greedy' ? runBot : runBot2, pre = botName === 'greedy' ? 'bot-zs-' : 'b2-zs-';
  const t1 = Date.now();
  const R = [];
  for (let i = 0; i < N; i++) R.push(bot(rules, pre + i, MAXT, opts));
  const turns = R.map(S => S.turn), scores = R.map(S => S.score), alive = R.filter(S => !S.over).length;
  let line = `${(botName + ' ' + label).padEnd(34)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  alive@${MAXT}: ${alive}/${N}  (${((Date.now() - t1) / 1000).toFixed(1)}s)`;
  console.log(line);
  {
    const ce = rules.colorEvery, dead = R.filter(S => S.over);
    const toNext = dead.map(S => ce - (S.turn % ce));
    const c = k => toNext.filter(x => x <= k).length;
    console.log(`   deaths: on a zone-start turn ${dead.filter(S => S.turn % ce === 0).length}/${dead.length}; next zone within 1/2/3/5 turns = ${c(1)}/${c(2)}/${c(3)}/${c(5)} of ${dead.length}`);
  }
  if (!rules.zones) return R;
  const bon = R.map(S => S.zoneBonusTotal || 0), base = R.map((S, i) => S.score - bon[i]);
  const breaks = R.map(S => S.zoneLog.length);
  const allBreaks = R.flatMap(S => S.zoneLog);
  const emp = allBreaks.map(e => e.empties);
  const empHist = [0, 1, 2, 3].map(k => emp.filter(x => (k < 3 ? x === k : x >= 3)).length);
  const share = R.map((S, i) => S.score ? bon[i] / S.score : 0);
  const st = R.map(S => S.botStats);
  const sum = k => st.reduce((a, s) => a + s[k], 0);
  const zr = R.map(S => E.zoneAt(rules, S.turn));
  const starsE = R.map(S => E.zoneStars(S, 'empty2')), starsC = R.map(S => E.zoneStars(S, 'clean'));
  const uE = unlockRuns(starsE, [6, 12, 18]);
  // where runs die relative to the zone start (turns into the zone): 0-2 = right after a colour step, 17-19 = just before the next
  const dieIn = R.filter(S => S.over).map(S => S.turn % rules.colorEvery);
  const nearMiss = dieIn.filter(x => x >= rules.colorEvery - 2).length;
  const early = dieIn.filter(x => x <= 2).length;
  console.log(`   zone reached p10/p50/p90 = ${q(zr, .1)}/${q(zr, .5)}/${q(zr, .9)}  breaks/run avg ${avg(breaks).toFixed(2)}  twins/run ${(sum('twins') / N).toFixed(2)}`);
  console.log(`   bonus/run p50 ${q(bon, .5)} (p90 ${q(bon, .9)})  bonus share of score: p50 ${pct(q(share, .5), 1)} p90 ${pct(q(share, .9), 1)} total ${pct(avg(bon) * N, avg(scores) * N)}  score w/o bonus p50 ${q(base, .5)}`);
  console.log(`   empties at break avg ${avg(emp).toFixed(2)}  hist 0/1/2/3+ = ${empHist.join('/')}  (n=${emp.length})`);
  console.log(`   twin into empty bottle ${sum('twinIntoEmpty')}/${sum('twins')} (empty available ${sum('twinEmptyAvail')})  pre-break placement changed by bonus ${sum('preDiverge')}/${sum('preChecks')}`);
  console.log(`   stars/run (empty2) p50 ${q(starsE.map(s => s.reduce((a, b) => a + b, 0)), .5)}  (clean) p50 ${q(starsC.map(s => s.reduce((a, b) => a + b, 0)), .5)}  runs to best-stars 6/12/18 = ${uE.best} (max ${uE.maxBest}), cumulative 6/12/18 = ${uE.cum}`);
  const byZ = {}; for (const e of allBreaks) (byZ[e.zone] = byZ[e.zone] || []).push(e.empties);
  console.log('   empties at break by zone entered: ' + Object.keys(byZ).map(z => `${z}:${avg(byZ[z]).toFixed(1)}(n${byZ[z].length})`).join(' '));
  const curve = k => { const b = []; starsE.slice(0, k).forEach(st => st.forEach((v, z) => { b[z] = Math.max(b[z] || 0, v); })); return b.reduce((a, x) => a + (x || 0), 0); };
  console.log(`   best-stars (empty2) after 1/3/10/30/${N} runs = ${[1, 3, 10, 30, N].map(curve).join('/')}`);
  console.log(`   deaths by turn-in-zone: last 2 turns before a zone start ${nearMiss}/${dieIn.length}, first 3 turns of a zone ${early}/${dieIn.length}`);
  return R;
}

const SETS = {};
SETS.main = [
  ['baseline (zones off)', {}, {}],
  ['zones b200 bot-chases', { zones: true, zoneBonus: 200 }, { zoneW: 1 }],
  ['zones b200 bot-ignores', { zones: true, zoneBonus: 200 }, { zoneW: 0 }],
  ['zones b200 no-twin chases', { zones: true, zoneBonus: 200, zoneTwin: false }, { zoneW: 1 }],
  ['zones b50 chases', { zones: true, zoneBonus: 50 }, { zoneW: 1 }],
  ['zones b100 cap5 chases', { zones: true, zoneBonus: 100, zoneMulMax: 5 }, { zoneW: 1 }],
];
SETS.tune = [
  ['flat80 (mulMax1) chases', { zones: true, zoneBonus: 80, zoneMulMax: 1 }, { zoneW: 1 }],
  ['b20 xzone cap5 chases', { zones: true, zoneBonus: 20, zoneMulMax: 5 }, { zoneW: 1 }],
  ['twin size1 ignores', { zones: true, zoneBonus: 200, zoneTwinSize: 1 }, { zoneW: 0 }],
];
SETS.big = [
  ['baseline (zones off)', {}, {}],
  ['b200 ignores (twin only)', { zones: true, zoneBonus: 200 }, { zoneW: 0 }],
  ['b200 chases', { zones: true, zoneBonus: 200 }, { zoneW: 1 }],
  ['b200 no-twin chases', { zones: true, zoneBonus: 200, zoneTwin: false }, { zoneW: 1 }],
  ['flat100 (mulMax1) chases', { zones: true, zoneBonus: 100, zoneMulMax: 1 }, { zoneW: 1 }],
  ['b25 xzone chases', { zones: true, zoneBonus: 25 }, { zoneW: 1 }],
];
const cfgs = SETS[process.env.SET || 'main'];
const only = process.env.CFG ? process.env.CFG.split(',').map(Number) : null;
const T0 = Date.now();
for (const bot of ['greedy', 'look2']) {
  cfgs.forEach(([label, r, o], k) => { if (!only || only.includes(k)) run(label, bot, r, o); });
  console.log('');
}
if (STD) {
  console.log('--- stock summarize / summarize2 output (label-based seeds) ---');
  summarize('base', {}, N, MAXT); summarize('zones-b200', { zones: true }, N, MAXT);
  summarize2('base', {}, N, MAXT); summarize2('zones-b200', { zones: true }, N, MAXT);
}
console.log(`total ${((Date.now() - T0) / 1000).toFixed(1)}s`);
