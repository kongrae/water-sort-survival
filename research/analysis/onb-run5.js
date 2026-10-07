const { makeEngine } = require('./onb-sim2.js');
const { novice } = require('./onb-run2.js');
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const BASE = makeEngine(); const D = BASE.DEFAULT_RULES;
// autoMerge effect on novice
for (const am of [false, true]) {
  const T = [];
  for (let i = 0; i < 300; i++) { const { S } = novice(BASE, BASE.sanitizeRules({ ...D, autoMerge: am }), 'seed-' + i, 400); T.push(S.turn); }
  console.log('novice autoMerge=' + am, 'turns p10/50/90', q(T, .1), q(T, .5), q(T, .9), 'die<20', (T.filter(t => t < 20).length / 3).toFixed(0) + '%');
}
// danger threshold frequency: replay novice runs with an instrumented applyPlace
for (const thr of [16, 18, 20]) {
  let dangerRuns = 0, clutch = 0, dangerTurns = 0; const n = 300;
  const E2 = Object.assign({}, BASE);
  for (let i = 0; i < n; i++) {
    let inDanger = false, cl = 0, dt = 0, saw = false;
    E2.applyPlace = (S, t, h) => {
      const fill = S.bottles.reduce((a, b) => a + b.length, 0) + S.piece.length;
      const c0 = S.clears; const r = BASE.applyPlace(S, t, h);
      if (fill >= thr) { dt++; saw = true; if (S.clears > c0) cl++; }
      return r;
    };
    novice(E2, BASE.sanitizeRules(D), 'seed-' + i, 400);
    if (saw) dangerRuns++; clutch += cl; dangerTurns += dt;
  }
  console.log(`danger fill>=${thr} after placing: runs with danger ${(dangerRuns / n * 100).toFixed(0)}%, danger turns/run ${(dangerTurns / n).toFixed(1)}, clutch clears/run ${(clutch / n).toFixed(2)}`);
}
