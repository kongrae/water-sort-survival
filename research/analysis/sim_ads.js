// Measures how many extra turns each rewarded "rescue" buys, using the greedy bot.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8').replace(/module\.exports[^\n]*/, 'module.exports = { E, runBot, greedyPours, evalState, roomPath };');
const m = { exports: {} };
new Function('require', 'module', '__dirname', src)(require, m, __dirname);
const { E, greedyPours, evalState, roomPath } = m.exports;
function play(S, maxTurns) {
  const rules = S.rules;
  while (!S.over && S.turn < maxTurns) {
    greedyPours(S);
    if (S.over) break;
    let best = null, bestV = -Infinity;
    for (let t = 0; t < S.bottles.length; t++) {
      if (rules.cap - S.bottles[t].length < S.piece.length) continue;
      const C = JSON.parse(JSON.stringify(S));
      E.applyPlace(C, t); greedyPours(C);
      const v = evalState(C);
      if (v > bestV) { bestV = v; best = t; }
    }
    if (best == null) {
      const p = roomPath(S);
      if (!p) { E.giveUp(S); break; }
      for (const [s, t] of p) E.applyPour(S, s, t);
      continue;
    }
    E.applyPlace(S, best);
  }
  return S;
}
const rescues = {
  revive2: S => { S.reviveUsed = false; S.over = true; E.applyRevive(S); },
  extraBottle: S => { S.bottles.push([]); S.over = false; S.overReason=''; E.checkStuck(S); },
  colorBomb: S => { // remove every layer of the most common color
    const cnt = {}; S.bottles.forEach(b => b.forEach(c => cnt[c] = (cnt[c] || 0) + 1));
    const c = +Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    S.bottles = S.bottles.map(b => b.filter(x => x !== c)); S.over = false; S.overReason=''; E.checkStuck(S);
  },
  emptyOne: S => { const i = S.bottles.map((b, i) => [b.length, i]).sort((a, b) => b[0] - a[0])[0][1]; S.bottles[i] = []; S.over=false; S.overReason=''; E.checkStuck(S); },
  skipPiece: S => { // discard current piece (advance turn index without placing)
    S.turn++; S.piece = E.pieceAt(S.seed, S.rules, S.turn); S.over=false; S.overReason=''; E.checkStuck(S);
  },
};
const N = +process.argv[2] || 120;
const rules = E.sanitizeRules({});
const base = [];
const gains = {}; Object.keys(rescues).forEach(k => gains[k] = []);
for (let i = 0; i < N; i++) {
  const seed = 'ads-' + i;
  const S0 = play(E.newState('endless', seed, rules), 2000);
  base.push(S0.turn);
  for (const k of Object.keys(rescues)) {
    const S = JSON.parse(JSON.stringify(S0));
    rescues[k](S);
    if (S.over) { gains[k].push(0); continue; }
    play(S, 3000);
    gains[k].push(S.turn - S0.turn);
  }
}
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
console.log('base turns p10/p50/p90', q(base, .1), q(base, .5), q(base, .9));
for (const k of Object.keys(gains)) console.log(k.padEnd(12), 'extra turns p10/p50/p90', q(gains[k], .1), q(gains[k], .5), q(gains[k], .9), ' zero-gain', gains[k].filter(x => x === 0).length);
