const fs = require('fs');
const f = __dirname + '/bot2.js';
let h = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!h.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); h = h.replace(a, b); };
rep(`const { E } = require('./harness.js');`, `const { E, feverStats, feverDecide, feverLine } = require('./harness.js');`);
rep(`function runBot2(rules, seed, maxTurns) {
  const S = E.newState('endless', seed, rules);`,
`// One bot turn (pours, then place or dig for room). Returns false when the bot gives up.
function botTurn2(S, hooks) {
  const rules = S.rules;
  const budget = () => rules.pourLimit ? rules.pourLimit - S.pours : 99;
  for (let g = 0; g < 40 && !S.over && budget() > 0; g++) {
    const p = bestPour(S.bottles, S.clears, rules, S.piece.length); if (!p) break;
    E.applyPour(S, p[0], p[1], hooks);
  }
  if (S.over) return false;
  const next = E.pieceFor(S, S.turn + 1).length;
  let best = null, bestV = -Infinity;
  for (let t = 0; t < S.bottles.length; t++) {
    if (rules.cap - S.bottles[t].length < S.piece.length) continue;
    let bs = S.bottles.map(b => b.slice()); bs[t].push(...S.piece);
    let cl = 0; E.resolveBoard(bs, rules, () => cl++);
    [bs, cl] = settleLight(bs, cl, rules, next, rules.pourLimit ? rules.pourLimit : 40);
    const v = evalB(bs, cl, rules.cap, next);
    if (v > bestV) { bestV = v; best = t; }
  }
  if (best == null) {
    if (rules.pourLimit && budget() <= 0) { E.giveUp(S); return false; }
    const p = roomPath(S); if (!p) { E.giveUp(S); return false; }
    for (const [s, t] of p) E.applyPour(S, s, t, hooks);
    return true;
  }
  E.applyPlace(S, best, hooks);
  return true;
}
const value2 = C => evalB(C.bottles, C.clears, C.rules.cap, C.piece.length);
function runBot2(rules, seed, maxTurns, opts) {
  const S = E.newState('endless', seed, rules);
  if (rules.fever) {
    const { st, hooks } = feverStats(S);
    while (!S.over && S.turn < maxTurns) {
      // same pre-placement pours as botTurn2, then the fever decision, then the turn proper
      for (let g = 0; g < 40 && !S.over; g++) {
        const p = bestPour(S.bottles, S.clears, rules, S.piece.length); if (!p) break;
        E.applyPour(S, p[0], p[1], hooks);
      }
      if (S.over) break;
      if (opts && opts.ad && E.canFeverExtend(S)) { E.applyFeverExtend(S); st.ext++; }
      feverDecide(S, opts, C => botTurn2(C), value2, st);
      if (!botTurn2(S, hooks)) break;
    }
    Object.defineProperty(S, '_st', { value: st, enumerable: false });
    return S;
  }`);
rep(`function summarize2(label, rules, n, maxTurns) {
  const t1 = Date.now(); const turns = [], scores = []; let capped = 0;
  for (let i = 0; i < n; i++) { const S = runBot2(E.sanitizeRules(rules), \`b2-\${label}-\${i}\`, maxTurns); turns.push(S.turn); scores.push(S.score); if (!S.over) capped++; }`,
`function summarize2(label, rules, n, maxTurns, opts) {
  const t1 = Date.now(); const turns = [], scores = [], sts = []; let capped = 0;
  const R = E.sanitizeRules(rules);
  for (let i = 0; i < n; i++) {
    const S = runBot2(R, \`b2-\${label.split('|')[0].trim()}-\${i}\`, maxTurns, opts); turns.push(S.turn); scores.push(S.score); if (!S.over) capped++;
    if (R.fever) { S._st.wasted = S._st.charge - (S._st.uses * R.feverGauge + S.fever); sts.push(S._st); }
  }`);
rep(`(\${((Date.now() - t1) / 1000).toFixed(1)}s)\`);
}`, `(\${((Date.now() - t1) / 1000).toFixed(1)}s)\` + feverLine(sts, n));
  return { turns, scores, sts };
}`);
rep(`module.exports = { runBot2, summarize2 };`, `module.exports = { runBot2, summarize2, botTurn2 };`);
fs.writeFileSync(f, h);
console.log('patched bot2');
