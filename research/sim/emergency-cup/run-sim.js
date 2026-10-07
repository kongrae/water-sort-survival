// Baseline vs emergency spare cup, both bots, 30 games each, maxTurns 300, identical seeds across configs.
const { E, summarize } = require('./harness.js');
const { summarize2 } = require('./bot2.js');
const D = E.DEFAULT_RULES, N = +(process.argv[3] || 30), MAX = 300;
const which = process.argv[2] || 'main';
const sets = {
  main: [
    ['baseline (flag off)', { ...D }, {}],
    ['flag on, never use', { ...D, spare: true }, { spare: 'never' }],
    ['cap1 asap', { ...D, spare: true }, { spare: 'asap' }],
    ['cap1 late', { ...D, spare: true }, { spare: 'late' }],
    ['cap1 late sticky', { ...D, spare: true, spareSticky: true }, { spare: 'late' }],
    ['cap2 asap', { ...D, spare: true, spareCap: 2 }, { spare: 'asap' }],
  ],
  tune: [
    ['cap1 late free<=6', { ...D, spare: true, spareMaxFree: 6 }, { spare: 'late' }],
    ['cap1 late free<=7', { ...D, spare: true, spareMaxFree: 7 }, { spare: 'late' }],
    ['cap1 asap free<=3', { ...D, spare: true, spareMaxFree: 3 }, { spare: 'asap' }],
    ['cap1 asap from40', { ...D, spare: true, spareFrom: 40 }, { spare: 'asap' }],
  ],
};
console.log(`== greedy 1-ply bot (n=${N}, max ${MAX}) ==`);
for (const [label, r, o] of sets[which]) summarize(label, r, N, MAX, { ...o, seedTag: 'S' });
console.log(`== 2-pour lookahead bot (n=${N}, max ${MAX}) ==`);
for (const [label, r, o] of sets[which]) summarize2(label, r, N, MAX, { ...o, seedTag: 'S' });
