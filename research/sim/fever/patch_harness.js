const fs = require('fs');
const f = __dirname + '/harness.js';
let h = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!h.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); h = h.replace(a, b); };
rep(`applyPlace, applyPour, applyRevive, giveUp, turnRhythm };`,
`applyPlace, applyPour, applyRevive, giveUp, turnRhythm,
  feverPiece, inFever, pieceFor, canFever, applyFever, canFeverExtend, applyFeverExtend };`);

// greedyPours: optional hooks so only real actions are logged
rep(`function greedyPours(S) {`, `function greedyPours(S, hooks) {`);
rep(`    E.applyPour(S, best[0], best[1]);
  }
}`, `    E.applyPour(S, best[0], best[1], hooks);
  }
}`);

rep(`function runBot(rules, seed, maxTurns) {
  const S = E.newState('endless', seed, rules);
  while (!S.over && S.turn < maxTurns) {
    greedyPours(S);
    if (S.over) break;
    let best = null, bestV = -Infinity;`,
`// ---- fever support (shared by both bots) ----
// Stats are logged through engine hooks: a clear whose gain != 100*streak happened during fever.
function feverStats(S) {
  const st = { uses: 0, held: 0, decided: 0, monoPieces: 0, feverClears: 0, feverBonus: 0, charge: 0, closeCalls: 0, rescues: 0, firstUse: -1, ext: 0 };
  const hooks = { clear: (i, c, gain, streak) => {
    if (S.rules.fever && gain !== 100 * streak) { st.feverClears++; st.feverBonus += gain - gain / S.rules.feverMult; }
    else st.charge += (S.rules.feverCombo && streak >= 2) ? 2 : 1;
  } };
  return { st, hooks };
}
// Visible-information rollout: play the current piece plus the previewed pieces that fever would convert,
// once with fever and once without, using the bot's own turn function, and compare end-board value.
function feverRollout(S, turnFn, valueFn) {
  const K = Math.min(S.rules.feverTurns, 1 + S.rules.preview);
  const play = withFever => {
    const C = JSON.parse(JSON.stringify(S));
    if (withFever) E.applyFever(C);
    const t0 = C.turn;
    while (!C.over && C.turn < t0 + K) if (!turnFn(C)) break;
    return C.over ? -1000 + (C.turn - t0) * 10 : valueFn(C);
  };
  return { on: play(true), off: play(false) };
}
// policy: 'never' | 'now' (fire as soon as full = auto-pilot) | 'rollout' (fire when the visible window gains >= margin)
// maxHold: fire anyway after holding a full gauge this many turns (charge is wasted while full).
function feverDecide(S, opts, turnFn, valueFn, st) {
  if (!E.canFever(S) || !opts || !opts.policy || opts.policy === 'never') return;
  st.decided++;
  const mixed = p => p.length > 1 && p.some(c => c !== p[0]);
  const window = [];
  for (let i = 0; i < S.rules.feverTurns; i++) window.push(E.pieceAt(S.seed, S.rules, S.turn + i));
  let fire = opts.policy === 'now';
  if (opts.policy === 'rollout') {
    const r = feverRollout(S, turnFn, valueFn);
    const d = r.on - r.off;
    if (Math.abs(d) < opts.margin) st.closeCalls++;
    if (r.off <= -900 && r.on > -900) st.rescues++;
    fire = d >= opts.margin || (opts.maxHold != null && st._hold >= opts.maxHold);
  }
  if (fire) {
    E.applyFever(S); st.uses++; st._hold = 0; if (st.firstUse < 0) st.firstUse = S.turn;
    st.monoPieces += window.filter(mixed).length;
  } else { st.held++; st._hold = (st._hold || 0) + 1; }
}
function botTurn(S, hooks) {
  greedyPours(S, hooks);
  if (S.over) return false;
  let best = null, bestV = -Infinity;
  for (let t = 0; t < S.bottles.length; t++) {
    if (S.rules.cap - S.bottles[t].length < S.piece.length) continue;
    const C = JSON.parse(JSON.stringify(S));
    E.applyPlace(C, t); greedyPours(C);
    const v = evalState(C);
    if (v > bestV) { bestV = v; best = t; }
  }
  if (best == null) {
    const p = roomPath(S);
    if (!p) { E.giveUp(S); return false; }
    for (const [s, t] of p) E.applyPour(S, s, t, hooks);
    return true;
  }
  E.applyPlace(S, best, hooks);
  return true;
}
// opts: { policy, margin, maxHold, ad } ; the fever logic is inert when rules.fever is off.
function runBot(rules, seed, maxTurns, opts) {
  const S = E.newState('endless', seed, rules);
  const { st, hooks } = feverStats(S);
  S._st = st;
  while (!S.over && S.turn < maxTurns) {
    if (S.rules.fever) {
      greedyPours(S, hooks);
      if (S.over) break;
      if (opts && opts.ad && E.canFeverExtend(S)) { E.applyFeverExtend(S); st.ext++; }
      feverDecide(S, opts, C => botTurn(C), evalState, st);
      if (!botTurn(S, hooks)) break;
      continue;
    }
    greedyPours(S);
    if (S.over) break;
    let best = null, bestV = -Infinity;`);

rep(`function summarize(label, rules, n, maxTurns) {
  const t1 = Date.now();
  const turns = [], scores = [];
  let capped = 0;
  for (let i = 0; i < n; i++) {
    const S = runBot(E.sanitizeRules(rules), \`bot-\${label}-\${i}\`, maxTurns);
    turns.push(S.turn); scores.push(S.score);
    if (!S.over) capped++;
  }`,
`function feverLine(sts, n) {
  if (!sts.length) return '';
  const sum = k => sts.reduce((a, s) => a + s[k], 0);
  const used = sts.filter(s => s.uses > 0).length;
  const fu = sts.map(s => s.firstUse).filter(x => x >= 0).sort((a, b) => a - b);
  return \`\n    fever: uses/game \${(sum('uses') / n).toFixed(2)}  games>=1 use \${used}/\${n}  firstUse p50 \${fu.length ? fu[Math.floor(fu.length / 2)] : '-'}\` +
    \`  monoPieces/use \${(sum('monoPieces') / Math.max(1, sum('uses'))).toFixed(2)}  feverClears/game \${(sum('feverClears') / n).toFixed(2)}\` +
    \`  bonus/game \${Math.round(sum('feverBonus') / n)}  heldTurns/game \${(sum('held') / n).toFixed(1)}\` +
    \`  closeCalls \${sum('closeCalls')}/\${sum('decided')}  rescues \${sum('rescues')}  adExt \${sum('ext')}\` +
    \`  wastedCharge/game \${(sts.reduce((a, s) => a + s.wasted, 0) / n).toFixed(1)}\`;
}
function summarize(label, rules, n, maxTurns, opts) {
  const t1 = Date.now();
  const turns = [], scores = [], sts = [];
  let capped = 0;
  const R = E.sanitizeRules(rules);
  for (let i = 0; i < n; i++) {
    const S = runBot(R, \`bot-\${label.split('|')[0].trim()}-\${i}\`, maxTurns, opts);
    turns.push(S.turn); scores.push(S.score);
    if (R.fever) { S._st.wasted = S._st.charge - (S._st.uses * R.feverGauge + S.fever); sts.push(S._st); }
    if (!S.over) capped++;
  }`);
rep(`(\${Date.now() - t1}ms)\`);
}`, `(\${Date.now() - t1}ms)\` + feverLine(sts, n));
  return { turns, scores, sts };
}`);
rep(`module.exports = { E, runBot, summarize };`, `module.exports = { E, runBot, summarize, feverStats, feverDecide, feverLine };`);
fs.writeFileSync(f, h);
console.log('patched harness');
