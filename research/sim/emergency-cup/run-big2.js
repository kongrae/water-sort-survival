// Robustness: key configs with N=200 (paired seeds).
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, N = 200, MAX = 300;
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : '-'; };
const mean = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
const cfg = [
  ['life20 asap free<=7', { ...D, spare: true, spareSticky: true, spareTurns: 20, spareMaxFree: 7 }, 'asap'],
  ['life20 asap free<=4', { ...D, spare: true, spareSticky: true, spareTurns: 20, spareMaxFree: 4 }, 'asap'],
];
const _unused = [
  ['cap1 inf asap', { ...D, spare: true, spareSticky: true }, 'asap'],
  ['cap1 inf late', { ...D, spare: true, spareSticky: true }, 'late'],
  ['cap1 life20 asap', { ...D, spare: true, spareSticky: true, spareTurns: 20 }, 'asap'],
  ['cap2 inf asap', { ...D, spare: true, spareSticky: true, spareCap: 2 }, 'asap'],
];
for (const [bname, run, tag] of [['greedy', runBot, 'bot-B'], ['bot2', runBot2, 'b2-B']]) {
  const t0 = Date.now();
  const base = []; for (let i = 0; i < N; i++) base.push(run(E.sanitizeRules({ ...D, spare: true, spareSticky: true }), `${tag}-${i}`, MAX, { spare: 'never' }));
  const bt = base.map(x => x.turn), arm = base.filter(x => x.spareArmTurn >= 0);
  console.log(`== ${bname} n=${N}: baseline turns p10/p50/p90 ${q(bt, .1)}/${q(bt, .5)}/${q(bt, .9)} mean ${mean(bt)} score p50 ${q(base.map(x => x.score), .5)} | crisis armed ${arm.length}/${N}, first-arm p10/p50/p90 ${q(arm.map(x => x.spareArmTurn), .1)}/${q(arm.map(x => x.spareArmTurn), .5)}/${q(arm.map(x => x.spareArmTurn), .9)}, arm->death p10/p50/p90 ${q(arm.map(x => x.turn - x.spareArmTurn), .1)}/${q(arm.map(x => x.turn - x.spareArmTurn), .5)}/${q(arm.map(x => x.turn - x.spareArmTurn), .9)}`);
  for (const [label, r, pol] of cfg) {
    const R = E.sanitizeRules(r), runs = []; for (let i = 0; i < N; i++) runs.push(run(R, `${tag}-${i}`, MAX, { spare: pol }));
    const t = runs.map(x => x.turn), used = runs.filter(x => x.spareUsed), dT = runs.map((x, i) => x.turn - base[i].turn);
    console.log(`${label.padEnd(18)} turns p10/p50/p90 ${q(t, .1)}/${q(t, .5)}/${q(t, .9)} mean ${mean(t)} (paired d mean ${mean(dT)}, p50 ${q(dT, .5)})  score p50 ${q(runs.map(x => x.score), .5)}  alive@300 ${runs.filter(x => !x.over).length}/${N}  used ${used.length}  died<=3 after ad ${used.filter(x => x.over && x.turn - x.spareTurn <= 3).length}  cup pours p50 ${q(used.map(x => x.spareIn), .5)}`);
  }
  console.log(`   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
