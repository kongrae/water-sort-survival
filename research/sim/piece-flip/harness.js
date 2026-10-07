// Headless checks for the engine script embedded in water-sort-survival.html
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const E = new Function(code + `
return { DEFAULT_RULES, sanitizeRules, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck,
  applyPlace, applyPour, applyRevive, giveUp, turnRhythm, canFlip, applyFlip };`)();

const clone = o => JSON.parse(JSON.stringify(o));
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; if (failures < 20) console.log('FAIL:', msg); } }


function pairs(bs) { let p = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] === b[i - 1]) p++; return p; }
function greedyPours(S) {
  // Hill-climb: take the pour that most improves the board score, until no pour helps.
  for (let g = 0; g < 60 && !S.over; g++) {
    if (S.rules.pourLimit && S.pours >= S.rules.pourLimit) return;
    const cap = S.rules.cap, bs = S.bottles, base = evalState(S);
    let best = null, bestV = base + 0.01;
    for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) {
      if (!E.canPour(bs, s, t, cap)) continue;
      const C = JSON.parse(JSON.stringify(S));
      E.applyPour(C, s, t);
      const v = evalState(C);
      if (v > bestV) { bestV = v; best = [s, t]; }
    }
    if (!best) return;
    E.applyPour(S, best[0], best[1]);
  }
}
function evalState(S) {
  if (S.over) return -1e9;
  const cap = S.rules.cap, bs = S.bottles;
  const units = bs.reduce((a, b) => a + b.length, 0);
  const empties = bs.filter(b => !b.length).length;
  const maxFree = Math.max(...bs.map(b => cap - b.length));
  let breaks = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) breaks++;
  return S.clears * 6 + empties * 3 + maxFree * 1.5 - units * 0.6 - breaks * 2.2 + (E.roomFor(bs, S.piece.length, cap) ? 4 : -8);
}
function roomPath(S) {
  const cap = S.rules.cap, need = S.piece.length;
  const start = S.bottles.map(b => b.slice());
  const seen = new Set([E.boardKey(start)]);
  let frontier = [{ b: start, path: [] }];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next = [];
    for (const { b, path } of frontier) for (let s = 0; s < b.length; s++) for (let t = 0; t < b.length; t++) {
      if (!E.canPour(b, s, t, cap)) continue;
      const nb = b.map(x => x.slice()); E.doPour(nb, s, t, cap); E.resolveBoard(nb, S.rules);
      const p = path.concat([[s, t]]);
      if (E.roomFor(nb, need, cap)) return p;
      const k = E.boardKey(nb); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > 20000) return null;
      next.push({ b: nb, path: p });
    }
    frontier = next;
  }
  return null;
}
// Flip stats shared by both bots. A flip decision "matters" when the best value with the piece flipped differs from
// the best value without flipping. "naive" = a one-line player rule: pick the orientation whose bottom color matches
// the top of some bottle that has room (only decided when exactly one orientation has such a match).
function newFlipStats() { return { avail: 0, used: 0, matters: 0, naiveDet: 0, naiveAgree: 0, think: 0, gaps: [], late: { avail: 0, used: 0, matters: 0, places: 0 } }; }
// With a limited flip budget (rules.flipLimit), the bots keep the piece as dealt unless flipping beats it by >= FLIP_SPEND_GAP.
const FLIP_SPEND_GAP = 2.2;   // = one colour break in the eval
function pickWithBudget(rules, bestByO, best, bestNoFlip) {
  if (!rules.flipLimit || !best || !best[0] || !bestNoFlip) return best;
  return bestByO[1] - bestByO[0] >= FLIP_SPEND_GAP ? best : bestNoFlip;
}
function naiveOrient(bottles, piece, cap) {
  const has = bottom => bottles.some(b => cap - b.length >= piece.length && b.length && b[b.length - 1] === bottom);
  const a = has(piece[0]), b = has(piece[piece.length - 1]);
  return a === b ? null : b;   // true = flip (reversed bottom is the old top)
}
function recordFlip(st, bottles, piece, cap, bestByO, chosenFlip, late) {
  st.avail++;
  if (chosenFlip) st.used++;
  if (late) { st.late.avail++; if (chosenFlip) st.late.used++; }
  const gap = Math.abs(bestByO[1] - bestByO[0]);
  if (!(gap > 1e-9)) return;
  st.matters++; st.gaps.push(gap);
  if (late) st.late.matters++;
  const n = naiveOrient(bottles, piece, cap);
  if (n !== null) { st.naiveDet++; if (n === chosenFlip) st.naiveAgree++; else st.think++; }
  else st.think++;
}
// opts.flipPolicy: 'full' (default, evaluate both orientations) | 'naive' (orientation from naiveOrient only, else keep).
function flipOrients(S, rules, opts) {
  if (!E.canFlip(S)) return [false];
  if (opts && opts.flipPolicy === 'naive') return [naiveOrient(S.bottles, S.piece, rules.cap) === true];
  return [false, true];
}
function runBot(rules, seed, maxTurns, opts) {
  const S = E.newState('endless', seed, rules);
  S.flipStats = newFlipStats();
  while (!S.over && S.turn < maxTurns) {
    greedyPours(S);
    if (S.over) break;
    // flip OFF: orients = [false] -> identical to the original bot. Unflipped is tried first, so ties keep the piece as dealt.
    const orients = flipOrients(S, rules, opts);
    let best = null, bestV = -Infinity, bestNoFlip = null;
    const bestByO = [-Infinity, -Infinity];
    for (const o of orients) for (let t = 0; t < S.bottles.length; t++) {
      if (rules.cap - S.bottles[t].length < S.piece.length) continue;
      const C = JSON.parse(JSON.stringify(S));
      if (o) E.applyFlip(C);
      E.applyPlace(C, t); greedyPours(C);
      const v = evalState(C);
      if (v > bestByO[+o]) { bestByO[+o] = v; if (!o) bestNoFlip = [false, t]; }
      if (v > bestV) { bestV = v; best = [o, t]; }
    }
    best = pickWithBudget(rules, bestByO, best, bestNoFlip);
    if (best == null) {
      const p = roomPath(S);
      if (!p) { E.giveUp(S); break; }
      for (const [s, t] of p) E.applyPour(S, s, t);
      continue;
    }
    const late = E.colorsAt(rules, S.turn) >= rules.maxColors;
    if (late) S.flipStats.late.places++;
    if (orients.length === 2) recordFlip(S.flipStats, S.bottles, S.piece, rules.cap, bestByO, best[0], late);
    if (best[0]) E.applyFlip(S);
    E.applyPlace(S, best[1]);
  }
  return S;
}
function summarize(label, rules, n, maxTurns) {
  const t1 = Date.now();
  const turns = [], scores = [];
  let capped = 0;
  for (let i = 0; i < n; i++) {
    const S = runBot(E.sanitizeRules(rules), `bot-${label}-${i}`, maxTurns);
    turns.push(S.turn); scores.push(S.score);
    if (!S.over) capped++;
  }
  turns.sort((a, b) => a - b); scores.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  console.log(`${label.padEnd(26)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  survived ${maxTurns}+: ${capped}/${n}  (${Date.now() - t1}ms)`);
}

module.exports = { E, runBot, summarize, newFlipStats, recordFlip, flipOrients, pickWithBudget };
