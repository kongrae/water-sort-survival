const { E } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const D = E.DEFAULT_RULES;
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const presets = [
  ['default', { ...D }],
  ['cap5', { ...D, cap: 5 }],
  ['auto', { ...D, autoMerge: true }],
  ['pour3', { ...D, pourLimit: 3 }],
  ['prev0', { ...D, preview: 0 }],
  ['max9', { ...D, maxColors: 9 }],
  ['piece13', { ...D, pieceMax: 3 }],
  ['b7', { ...D, bottles: 7 }],
];
for (const [name, r0] of presets) {
  const r = E.sanitizeRules(r0); const T = [], Sc = [], dbl = [], sweep = [], ms = [];
  const t0 = Date.now();
  for (let i = 0; i < 16; i++) {
    const S = runBot2(r, 'week:' + name + i, 400);
    T.push(S.turn); Sc.push(S.score); ms.push(S.maxStreak);
    dbl.push(S.turnLog.filter(x => x >= 2).length);
  }
  console.log(name.padEnd(8), 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), ' score p50', q(Sc, .5), ' maxCombo p50/p90', q(ms, .5), q(ms, .9), ' doubleTurns p50', q(dbl, .5), ' ms/run', ((Date.now() - t0) / 16).toFixed(0));
}
