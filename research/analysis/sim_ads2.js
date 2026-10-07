const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8').replace(/module\.exports[^\n]*/, 'module.exports = { E, runBot, greedyPours, evalState, roomPath };');
const m = { exports: {} };
new Function('require', 'module', '__dirname', src)(require, m, __dirname);
const { E, greedyPours, evalState, roomPath } = m.exports;
function play(S, maxTurns, hook) {
  const rules = S.rules;
  while (!S.over && S.turn < maxTurns) {
    if (hook) hook(S);
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
    if (best == null) { const p = roomPath(S); if (!p) { E.giveUp(S); break; } for (const [s, t] of p) E.applyPour(S, s, t); continue; }
    E.applyPlace(S, best);
  }
  return S;
}
const N = 100, q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
function run(label, mk, hook) {
  const t = []; for (let i = 0; i < N; i++) { const S = play(mk('ads-' + i), 3000, hook && hook()); t.push(S.turn); }
  console.log(label.padEnd(30), q(t, .1), q(t, .5), q(t, .9));
}
const R6 = E.sanitizeRules({}), R7 = E.sanitizeRules({ bottles: 7 });
run('6 bottles', s => E.newState('endless', s, R6));
run('7 bottles from start', s => E.newState('endless', s, R7));
run('+1 bottle at turn 25', s => E.newState('endless', s, R6), () => { let d = false; return S => { if (!d && S.turn >= 25) { d = true; S.bottles.push([]); } }; });
run('colorbomb at first stuck', s => E.newState('endless', s, R6), () => { let d = false; return S => { if (!d && S.bottles.filter(b=>b.length===0).length===0 && Math.max(...S.bottles.map(b=>4-b.length))<2) { d = true; const cnt={}; S.bottles.forEach(b=>b.forEach(c=>cnt[c]=(cnt[c]||0)+1)); const c=+Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0]; S.bottles=S.bottles.map(b=>b.filter(x=>x!==c)); } }; });
run('preview 0', s => E.newState('endless', s, E.sanitizeRules({preview:0})));
