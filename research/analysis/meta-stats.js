// Measures how often album-style conditions occur per run, for meta-progression tuning.
const { E, runBot } = require('./harness.js');
const { runBot2 } = require('./bot2.js');
const origPlace = E.applyPlace, origPour = E.applyPour;
let tracked = null, rec = null;
function wrap(orig, isPour) {
  return function (S, a, b) {
    if (S !== tracked) return isPour ? orig(S, a, b) : orig(S, a);
    let lastMove = null;
    const hooks = {
      move: (t, m) => { lastMove = { t, m }; },
      clear: (i, c, gain, streak) => {
        rec.byColor[c] = (rec.byColor[c] || 0) + 1;
        if (streak >= 5) rec.streak5++;
        if (streak >= 3) rec.streak3++;
        if (S.turnClears >= 2) rec.double++;
        if (S.turn >= 100) rec.deep++;
        if (isPour && lastMove && lastMove.t === i && lastMove.m >= 3) rec.big++;
      },
    };
    return isPour ? orig(S, a, b, hooks) : orig(S, a, hooks);
  };
}
E.applyPlace = wrap(origPlace, false);
E.applyPour = wrap(origPour, true);
// re-bind newState so we can capture the tracked state object
const origNew = E.newState;
E.newState = function (...args) { const S = origNew(...args); tracked = S; return S; };

function run(label, rules, n, bot) {
  const R = E.sanitizeRules(rules);
  const turns = [], agg = { streak5: 0, streak3: 0, double: 0, deep: 0, big: 0, byColor: {} };
  let runsWith = { streak5: 0, double: 0, deep: 0, big: 0, c7: 0 };
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    rec = { streak5: 0, streak3: 0, double: 0, deep: 0, big: 0, byColor: {} };
    const S = (bot === 2 ? runBot2 : runBot)(R, `meta-${label}-${i}`, 400);
    turns.push(S.turn);
    for (const k of ['streak5', 'streak3', 'double', 'deep', 'big']) { agg[k] += rec[k]; }
    for (const k of ['streak5', 'double', 'deep', 'big']) if (rec[k]) runsWith[k]++;
    if (rec.byColor[7]) runsWith.c7++;
    for (const c in rec.byColor) agg.byColor[c] = (agg.byColor[c] || 0) + rec.byColor[c];
  }
  turns.sort((a, b) => a - b);
  const q = p => turns[Math.min(n - 1, Math.floor(p * n))];
  const per = k => (agg[k] / n).toFixed(2);
  const col = Object.keys(agg.byColor).sort().map(c => c + ':' + (agg.byColor[c] / n).toFixed(1)).join(' ');
  console.log(`${label.padEnd(18)} bot${bot} turns ${q(.1)}/${q(.5)}/${q(.9)} | per run: s3 ${per('streak3')} s5 ${per('streak5')} dbl ${per('double')} deep ${per('deep')} big ${per('big')} | runs with s5 ${runsWith.streak5}/${n} dbl ${runsWith.double}/${n} deep ${runsWith.deep}/${n} big ${runsWith.big}/${n} c8 ${runsWith.c7}/${n} | colors ${col} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const D = E.DEFAULT_RULES;
const which = process.argv[2] || '1';
const n = Number(process.argv[3] || 40);
const cfgs = [
  ['default', { ...D }],
  ['colorEvery15', { ...D, colorEvery: 15 }],
  ['colorEvery25', { ...D, colorEvery: 25 }],
  ['bottles7', { ...D, bottles: 7 }],
  ['pourLimit3', { ...D, pourLimit: 3 }],
  ['pourLimit2', { ...D, pourLimit: 2 }],
  ['startColors5', { ...D, startColors: 5 }],
];
for (const [l, r] of cfgs) run(l, r, n, Number(which));
