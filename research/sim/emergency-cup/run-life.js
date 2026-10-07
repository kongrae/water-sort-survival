// Cup lifetime vs use timing (permanent vs 10/20-turn cracked cup), both bots, paired seeds.
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, N = +(process.argv[2] || 30), MAX = 300;
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : '-'; };
const mean = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
const cfg = [];
for (const life of [0, 20, 10]) for (const pol of ['asap', 'deep', 'late']) cfg.push([`life ${life || 'inf'} ${pol}`, { ...D, spare: true, spareSticky: true, spareTurns: life }, pol]);
for (const [bname, run, tag] of [['greedy', runBot, 'bot-S'], ['bot2', runBot2, 'b2-S']]) {
  const base = []; for (let i = 0; i < N; i++) base.push(run(E.sanitizeRules(D), `${tag}-${i}`, MAX));
  console.log(`== ${bname} (n=${N}) baseline turns p50 ${q(base.map(x => x.turn), .5)} mean ${mean(base.map(x => x.turn))}`);
  for (const [label, r, pol] of cfg) {
    const R = E.sanitizeRules(r), runs = []; for (let i = 0; i < N; i++) runs.push(run(R, `${tag}-${i}`, MAX, { spare: pol }));
    const used = runs.filter(x => x.spareUsed), dT = runs.map((x, i) => x.turn - base[i].turn);
    console.log(`${label.padEnd(18)} turns p10/p50/p90 ${q(runs.map(x => x.turn), .1)}/${q(runs.map(x => x.turn), .5)}/${q(runs.map(x => x.turn), .9)}  mean dTurns ${mean(dT)}  score p50 ${q(runs.map(x => x.score), .5)}  alive@300 ${runs.filter(x => !x.over).length}  used@p50 ${q(used.map(x => x.spareTurn), .5)}  died<=3 after ad ${used.filter(x => x.over && x.turn - x.spareTurn <= 3).length}/${used.length}  cup pours p50 ${q(used.map(x => x.spareIn), .5)}`);
  }
}
