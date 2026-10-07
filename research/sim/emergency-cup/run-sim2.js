// Paired comparison (same seeds) baseline vs spare-cup variants for both bots.
// usage: node run-sim2.js <N> <set>
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, N = +(process.argv[2] || 30), MAX = 300, set = process.argv[3] || 'main';
const S = r => E.sanitizeRules(r);
const sets = {
  main: [
    ['baseline (flag off)', { ...D }, 'never'],
    ['cap1 asap', { ...D, spare: true }, 'asap'],
    ['cap1 mid', { ...D, spare: true }, 'mid'],
    ['cap1 late', { ...D, spare: true }, 'late'],
    ['cap1 late sticky', { ...D, spare: true, spareSticky: true }, 'late'],
    ['cap2 asap', { ...D, spare: true, spareCap: 2 }, 'asap'],
  ],
  tune: [
    ['baseline (flag off)', { ...D }, 'never'],
    ['cap1 asap free<=3', { ...D, spare: true, spareMaxFree: 3 }, 'asap'],
    ['cap1 asap from40', { ...D, spare: true, spareFrom: 40 }, 'asap'],
    ['cap1 asap from60', { ...D, spare: true, spareFrom: 60 }, 'asap'],
    ['cap1 late free<=6', { ...D, spare: true, spareMaxFree: 6 }, 'late'],
    ['cap1 mid free<=6', { ...D, spare: true, spareMaxFree: 6 }, 'mid'],
  ],
};
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : '-'; };
const mean = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
for (const [bname, run, tag] of [['greedy 1-ply', runBot, 'bot-S'], ['2-pour lookahead', runBot2, 'b2-S']]) {
  console.log(`== ${bname} bot (n=${N}, max ${MAX}) ==`);
  let base = null;
  for (const [label, r, pol] of sets[set]) {
    const t1 = Date.now(), R = S(r), runs = [];
    for (let i = 0; i < N; i++) runs.push(run(R, `${tag}-${i}`, MAX, { spare: pol }));
    const turns = runs.map(x => x.turn), scores = runs.map(x => x.score);
    if (!base) base = runs;
    let line = `${label.padEnd(22)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)} (mean ${mean(turns)})  score p50 = ${q(scores, .5)}  alive@${MAX}: ${runs.filter(x => !x.over).length}/${N}  ${Date.now() - t1}ms`;
    console.log(line);
    if (r.spare) {
      const dT = runs.map((x, i) => x.turn - base[i].turn), dS = runs.map((x, i) => x.score - base[i].score);
      const used = runs.filter(x => x.spareUsed), armed = runs.filter(x => x.spareArmTurn >= 0);
      const after = used.map(x => x.turn - x.spareTurn);
      const regret = used.filter(x => x.over && x.turn - x.spareTurn <= 3).length;
      const missed = runs.filter(x => x.over && !x.spareUsed).length;
      console.log(`   paired dTurns p10/p50/p90 = ${q(dT, .1)}/${q(dT, .5)}/${q(dT, .9)} mean ${mean(dT)}  improved ${dT.filter(d => d > 0).length}/${N}  worse ${dT.filter(d => d < 0).length}/${N}  dScore p50 ${q(dS, .5)}`);
      console.log(`   trigger: armed ${armed.length}/${N} first-arm p10/p50/p90 ${q(armed.map(x => x.spareArmTurn), .1)}/${q(armed.map(x => x.spareArmTurn), .5)}/${q(armed.map(x => x.spareArmTurn), .9)}  used ${used.length} at p50 turn ${q(used.map(x => x.spareTurn), .5)}  turns-after-use p10/p50/p90 ${q(after, .1)}/${q(after, .5)}/${q(after, .9)}  died<=3 turns after ad ${regret}/${used.length}  died-without-cup ${missed}  pours-into-cup p50 ${q(used.map(x => x.spareIn), .5)}`);
    }
  }
}
