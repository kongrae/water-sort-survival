// One-off patcher for the COPY of the prototype: adds the fever mechanic behind rules.fever.
const fs = require('fs');
const f = __dirname + '/water-sort-survival.html';
let h = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!h.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); h = h.replace(a, b); };

rep(`pourLimit: 0, autoMerge: false };`,
`pourLimit: 0, autoMerge: false,
  // Fever (off by default): clears fill a gauge; when full the player may trigger fever for feverTurns pieces.
  fever: false, feverGauge: 8, feverTurns: 3, feverMult: 2, feverCombo: false, feverAdTurns: 0 };`);

rep(`    autoMerge: !!r.autoMerge,
  };`,
`    autoMerge: !!r.autoMerge,
    fever: !!r.fever,
    feverGauge: num(r.feverGauge, 1, 30, D.feverGauge),
    feverTurns: num(r.feverTurns, 1, 9, D.feverTurns),
    feverMult: num(r.feverMult, 1, 5, D.feverMult),
    feverCombo: !!r.feverCombo,
    feverAdTurns: num(r.feverAdTurns, 0, 9, D.feverAdTurns),
  };`);

rep(`function topSeg(b) {`,
`// Fever: every piece whose index lies in [feverFrom, feverTo) takes its first layer's color for all layers.
// The transform is a pure function of pieceAt and the activation turn, so daily sequences stay identical.
function feverPiece(p) { return p.map(() => p[0]); }
function inFever(S, i) { return !!S.rules.fever && i >= S.feverFrom && i < S.feverTo; }
function pieceFor(S, i) { const p = pieceAt(S.seed, S.rules, i); return inFever(S, i) ? feverPiece(p) : p; }
function topSeg(b) {`);

rep(`    over: false, overReason: '', stuck: null,
  };
}`,
`    over: false, overReason: '', stuck: null,
    ...(rules.fever ? { fever: 0, feverFrom: -1, feverTo: -1, feverUses: [], feverExtUsed: false } : {}),
  };
}`);

rep(`function settle(S, hooks) {
  hooks = hooks || {};
  resolveBoard(S.bottles, S.rules, (i, c) => {
    if (S.turnClears === 0) S.streak++;
    S.turnClears++;
    const gain = 100 * S.streak;`,
`// fev: the clear belongs to a fever turn (score x feverMult, gauge does not charge).
function settle(S, hooks, fev) {
  hooks = hooks || {};
  resolveBoard(S.bottles, S.rules, (i, c) => {
    if (S.turnClears === 0) S.streak++;
    S.turnClears++;
    const gain = 100 * S.streak * (fev ? S.rules.feverMult : 1);
    if (S.rules.fever && !fev) S.fever = Math.min(S.rules.feverGauge, S.fever + (S.rules.feverCombo && S.streak >= 2 ? 2 : 1));`);

rep(`  if (S.turn > 0) { S.turnLog.push(S.turnClears); if (S.turnClears === 0) S.streak = 0; }
  S.turnClears = 0;
  S.pours = 0;
  for (const c of S.piece) b.push(c);
  if (hooks.move) hooks.move(t, S.piece.length);
  S.turn++;
  settle(S, hooks);
  S.piece = pieceAt(S.seed, S.rules, S.turn);`,
`  if (S.turn > 0) { S.turnLog.push(S.turnClears); if (S.turnClears === 0) S.streak = 0; }
  S.turnClears = 0;
  S.pours = 0;
  const fev = inFever(S, S.turn);
  for (const c of S.piece) b.push(c);
  if (hooks.move) hooks.move(t, S.piece.length);
  S.turn++;
  settle(S, hooks, fev);
  S.piece = pieceFor(S, S.turn);`);

rep(`  S.pours++;
  settle(S, hooks);`,
`  S.pours++;
  settle(S, hooks, inFever(S, S.turn));`);

rep(`function giveUp(S) {`,
`function canFever(S) { return !!S.rules.fever && !S.over && S.fever >= S.rules.feverGauge && !inFever(S, S.turn); }
// Manual trigger: the current piece and the next feverTurns-1 pieces become single-colored.
function applyFever(S) {
  if (!canFever(S)) return false;
  S.fever = 0; S.feverFrom = S.turn; S.feverTo = S.turn + S.rules.feverTurns; S.feverUses.push(S.turn);
  S.piece = pieceFor(S, S.turn);
  return true;
}
// Rewarded "+N fever turns", once per run, endless only, offered while the first post-fever piece is current.
function canFeverExtend(S) {
  return !!S.rules.fever && S.rules.feverAdTurns > 0 && S.mode !== 'daily' && !S.over && !S.feverExtUsed && S.feverTo > 0 && S.turn === S.feverTo;
}
function applyFeverExtend(S) {
  if (!canFeverExtend(S)) return false;
  S.feverExtUsed = true; S.feverTo += S.rules.feverAdTurns;
  S.piece = pieceFor(S, S.turn);
  return true;
}
function giveUp(S) {`);

rep(`    out.push(n >= 4 ? '🟩' : n >= 1 ? '🟨' : '⬜');`,
`    const hot = S.rules.fever && S.feverUses.some(u => u < i + 10 && u + S.rules.feverTurns > i);
    out.push(hot ? '🔥' : n >= 4 ? '🟩' : n >= 1 ? '🟨' : '⬜');`);

// UI: previews must show the transformed piece; best-score key separates fever rule sets.
rep(`paintTube(t, pieceAt(S.seed, r, S.turn + j), r.pieceMax);`, `paintTube(t, pieceFor(S, S.turn + j), r.pieceMax);`);
rep(`r.pourLimit, r.autoMerge ? 1 : 0].join('-'); }`,
`r.pourLimit, r.autoMerge ? 1 : 0].join('-') + (r.fever ? \`-F\${r.feverGauge}.\${r.feverTurns}.\${r.feverMult}.\${r.feverCombo ? 1 : 0}\` : ''); }`);
fs.writeFileSync(f, h);
console.log('patched');
