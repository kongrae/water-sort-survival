// One-shot patcher: adds the "emergency spare cup" rule to the engine script of the COPIED html.
const fs = require('fs');
const f = __dirname + '/water-sort-survival.html';
let h = fs.readFileSync(f, 'utf8');
let n = 0;
function rep(a, b) { if (!h.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); h = h.replace(a, b); n++; }

rep(`pourLimit: 0, autoMerge: false };`,
`pourLimit: 0, autoMerge: false,
  // Emergency spare cup (rewarded): off by default. spareCap = cup size, offered from spareFrom turn while
  // empty bottles <= spareMaxEmpty and total free cells <= spareMaxFree. spareSticky keeps the offer once armed.
  spare: false, spareCap: 1, spareFrom: 15, spareMaxEmpty: 0, spareMaxFree: 5, spareSticky: false };`);

rep(`    autoMerge: !!r.autoMerge,
  };`,
`    autoMerge: !!r.autoMerge,
    spare: !!r.spare,
    spareCap: num(r.spareCap, 1, 3, D.spareCap),
    spareFrom: num(r.spareFrom, 0, 500, D.spareFrom),
    spareMaxEmpty: num(r.spareMaxEmpty, 0, 8, D.spareMaxEmpty),
    spareMaxFree: num(r.spareMaxFree, 0, 48, D.spareMaxFree),
    spareSticky: !!r.spareSticky,
  };`);

// canPour / doPour accept either one capacity for every slot or a per-slot capacity array.
rep(`function canPour(bs, s, t, cap) {
  if (s === t) return false;
  const a = bs[s], b = bs[t];
  if (!a || !b || !a.length || b.length >= cap) return false;`,
`function capAt(cap, i) { return typeof cap === 'number' ? cap : cap[i]; }
function canPour(bs, s, t, cap) {
  if (s === t) return false;
  const a = bs[s], b = bs[t];
  if (!a || !b || !a.length || b.length >= capAt(cap, t)) return false;`);
rep(`  const m = Math.min(n, cap - b.length);
  for (let k = 0; k < m; k++) { a.pop(); b.push(c); }`,
`  const m = Math.min(n, capAt(cap, t) - b.length);
  for (let k = 0; k < m; k++) { a.pop(); b.push(c); }`);

// BFS: the spare cup (if any) is an extra pour-only slot; it never takes a piece and never clears.
rep(`function canMakeRoom(bs, need, rules, budget, limit) {
  const cap = rules.cap, max = limit || 6000;
  let frontier = [bs.map(b => b.slice())];
  const seen = new Set([boardKey(frontier[0])]);`,
`function canMakeRoom(bs, need, rules, budget, limit, spare) {
  const cap = rules.cap, max = limit || 6000, nb0 = bs.length;
  const caps = spare ? bs.map(() => cap).concat([rules.spareCap]) : cap;
  const keyOf = spare ? b => boardKey(b.slice(0, nb0)) + '#' + b[nb0].join('') : boardKey;
  let frontier = [(spare ? bs.concat([spare]) : bs).map(b => b.slice())];
  const seen = new Set([keyOf(frontier[0])]);`);
rep(`          if (!canPour(cur, s, t, cap)) continue;
          const nb = cur.map(b => b.slice());
          doPour(nb, s, t, cap);
          resolveBoard(nb, rules);
          if (roomFor(nb, need, cap)) return true;
          const k = boardKey(nb);`,
`          if (!canPour(cur, s, t, caps)) continue;
          const nb = cur.map(b => b.slice());
          doPour(nb, s, t, caps);
          const main = spare ? nb.slice(0, nb0) : nb;
          resolveBoard(main, rules);
          if (roomFor(main, need, cap)) return true;
          const k = keyOf(nb);`);

rep(`    over: false, overReason: '', stuck: null,
  };`,
`    over: false, overReason: '', stuck: null,
    spare: null, spareUsed: false, spareOffer: false, spareArmTurn: -1, spareTurn: -1, spareIn: 0,
  };`);

rep(`function checkStuck(S) {
  S.stuck = null;
  if (S.over || roomFor(S.bottles, S.piece.length, S.rules.cap)) return;
  const budget = S.rules.pourLimit ? Math.max(0, S.rules.pourLimit - S.pours) : Infinity;
  const r = canMakeRoom(S.bottles, S.piece.length, S.rules, budget);
  if (r === false) { S.over = true; S.overReason = 'noroom'; }
  else S.stuck = r === true ? 'room' : 'unknown';
}`,
`function checkStuck(S) {
  S.stuck = null;
  if (!S.over && !roomFor(S.bottles, S.piece.length, S.rules.cap)) {
    const budget = S.rules.pourLimit ? Math.max(0, S.rules.pourLimit - S.pours) : Infinity;
    const r = canMakeRoom(S.bottles, S.piece.length, S.rules, budget, undefined, S.spare);
    if (r === false) { S.over = true; S.overReason = 'noroom'; }
    else S.stuck = r === true ? 'room' : 'unknown';
  }
  if (S.rules.spare) updateSpareOffer(S);
}
// ---- Emergency spare cup ----
// Slot index rules.bottles is the cup once granted. Pours only: never takes a piece, never clears.
function slotsOf(S) { return S.spare ? S.bottles.concat([S.spare]) : S.bottles; }
function capsOf(S) { return S.spare ? S.bottles.map(() => S.rules.cap).concat([S.rules.spareCap]) : S.rules.cap; }
// Crisis uses only board + turn (no randomness), so a daily seed offers it at the same moment for the same play.
function spareCrisis(S) {
  const r = S.rules;
  let empty = 0, free = 0;
  for (const b of S.bottles) { if (!b.length) empty++; free += r.cap - b.length; }
  return S.turn >= r.spareFrom && empty <= r.spareMaxEmpty && free <= r.spareMaxFree;
}
function updateSpareOffer(S) {
  const open = !S.over && !S.spareUsed;
  const crisis = open && spareCrisis(S);
  if (crisis && S.spareArmTurn < 0) S.spareArmTurn = S.turn;
  S.spareOffer = open && (crisis || (S.rules.spareSticky && S.spareArmTurn >= 0));
}
// Called after the rewarded ad completes. Once per run.
function applySpare(S) {
  if (!S.rules.spare || S.over || S.spareUsed || !S.spareOffer) return false;
  S.spare = []; S.spareUsed = true; S.spareTurn = S.turn; S.spareOffer = false; S.spareIn = 0;
  checkStuck(S);
  return true;
}`);

rep(`  if (!canPour(S.bottles, s, t, S.rules.cap)) return false;
  const m = doPour(S.bottles, s, t, S.rules.cap);
  if (hooks.move) hooks.move(t, m);
  S.pours++;`,
`  const slots = slotsOf(S), caps = capsOf(S);
  if (!canPour(slots, s, t, caps)) return false;
  const m = doPour(slots, s, t, caps);
  if (hooks.move) hooks.move(t, m);
  if (S.spare && t === S.bottles.length) S.spareIn++;
  S.pours++;`);

fs.writeFileSync(f, h);
console.log('replacements:', n);
