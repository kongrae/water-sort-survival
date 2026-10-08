// Headless checks for the engine script embedded in water-sort-survival.html
// v2: exports the v2 engine (flip, zones, spare cup, previews). With every v2 flag off and opts omitted,
// runBot behaves exactly like the v1 greedy bot.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const E = new Function(code + `
return { DEFAULT_RULES, V1_RULES, sanitizeRules, rulesSig, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck,
  applyPlace, applyPour, applyRevive, giveUp, turnRhythm,
  zoneAt, isZoneStart, newColorAt, zoneBonusAt, isTwinTurn, zoneBreak, zoneStars,
  canFlip, applyFlip, flipsLeft,
  capAt, slotsOf, capsOf, spareCrisis, updateSpareOffer, applySpare,
  previewPlace, previewPour, nearMiss, breakCombo,
  SCORE_GROWTH_V1, EXPANDING_RULES, isExpanding, sanitizeGrowth, activeColors, growthTarget, nextGrowth, updateGrowth, advancePiece, previewPieces };`)();

const clone = o => JSON.parse(JSON.stringify(o));
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; if (failures < 20) console.log('FAIL:', msg); } }

// An occupied spare cup loses its option value, so it costs a little (keeps the bot from parking layers for free).
const SPARE_FULL_PENALTY = 1.0;
// With a limited flip budget the bots keep the piece as dealt unless flipping beats it by at least one colour break.
const FLIP_SPEND_GAP = 2.2;

function pairs(bs) { let p = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] === b[i - 1]) p++; return p; }
function greedyPours(S) {
  // Hill-climb: take the pour that most improves the board score, until no pour helps.
  for (let g = 0; g < 60 && !S.over; g++) {
    if (S.rules.pourLimit && S.pours >= S.rules.pourLimit) return;
    const caps = E.capsOf(S), bs = E.slotsOf(S), base = evalState(S);
    let best = null, bestV = base + 0.01;
    for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) {
      if (!E.canPour(bs, s, t, caps)) continue;
      const C = clone(S);
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
  const units = bs.reduce((a, b) => a + b.length, 0) + (S.spare ? S.spare.length : 0);
  const empties = bs.filter(b => !b.length).length;
  const maxFree = Math.max(...bs.map(b => cap - b.length));
  let breaks = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) breaks++;
  const v = S.clears * 6 + empties * 3 + maxFree * 1.5 - units * 0.6 - breaks * 2.2 + (E.roomFor(bs, S.piece.length, cap) ? 4 : -8);
  return S.spare && S.spare.length ? v - SPARE_FULL_PENALTY : v;
}
function slotKey(b, n) { return b.length > n ? E.boardKey(b.slice(0, n)) + '#' + b[n].join('') : E.boardKey(b); }
function roomPath(S) {
  const cap = S.rules.cap, need = S.piece.length, n = S.bottles.length, caps = E.capsOf(S);
  const start = E.slotsOf(S).map(b => b.slice());
  const seen = new Set([slotKey(start, n)]);
  let frontier = [{ b: start, path: [] }];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next = [];
    for (const { b, path } of frontier) for (let s = 0; s < b.length; s++) for (let t = 0; t < b.length; t++) {
      if (!E.canPour(b, s, t, caps)) continue;
      const nb = b.map(x => x.slice()); E.doPour(nb, s, t, caps);
      const main = nb.length > n ? nb.slice(0, n) : nb;
      E.resolveBoard(main, S.rules);
      const p = path.concat([[s, t]]);
      if (E.roomFor(main, need, cap)) return p;
      const k = slotKey(nb, n); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > 20000) return null;
      next.push({ b: nb, path: p });
    }
    frontier = next;
  }
  return null;
}
// ---- shared bot helpers (also used by bot2.js) ----
// Orientations worth evaluating: [false] when flipping is impossible, else [false, true] (unflipped first, so ties keep the piece as dealt).
function flipOrients(S) { return E.canFlip(S) ? [false, true] : [false]; }
function pickWithBudget(rules, bestByO, best, bestNoFlip) {
  if (!rules.flipLimit || !best || !best[0] || !bestNoFlip) return best;
  return bestByO[1] - bestByO[0] >= FLIP_SPEND_GAP ? best : bestNoFlip;
}
function newBotStats() { return { twins: 0, twinIntoEmpty: 0, breaks3: 0, death: null }; }
// Hooks passed to the real (not simulated) moves: count combo breaks at x3 or more.
function botHooks(S) { return { comboBreak: s => { if (s >= 3) S.botStats.breaks3++; } }; }
function notePlace(S, t) {
  if (E.isTwinTurn(S.rules, S.turn)) { S.botStats.twins++; if (!S.bottles[t].length) S.botStats.twinIntoEmpty++; }
}
// First death: remember the facts the revive offer is based on; with opts.revive, revive once and keep playing.
function onDeath(S, opts) {
  if (S.botStats.death) return false;
  const nm = E.nearMiss(S);
  S.botStats.death = { score: S.score, turn: S.turn, reason: S.overReason, zoneLeft: nm.zoneLeft, near: nm };
  if (!(opts && opts.revive) || S.reviveUsed) return false;
  E.applyRevive(S);
  return !S.over;
}
// opts.spare: 'none' (default) | 'asap' (watch the ad as soon as the offer appears). opts.revive: revive once at the first death.
function runBot(rules, seed, maxTurns, opts) {
  opts = opts || {};
  const policy = opts.spare || 'none';
  const S = E.newState('endless', seed, rules);
  S.botStats = newBotStats();
  const H = botHooks(S);
  while (S.turn < maxTurns) {
    if (S.over) { if (onDeath(S, opts)) continue; break; }
    if (policy === 'asap' && S.spareOffer) E.applySpare(S);
    greedyPours(S);
    if (S.over) continue;
    if (policy === 'asap' && S.spareOffer) { E.applySpare(S); greedyPours(S); if (S.over) continue; }
    const orients = flipOrients(S);
    let best = null, bestV = -Infinity, bestNoFlip = null;
    const bestByO = [-Infinity, -Infinity];
    for (const o of orients) for (let t = 0; t < S.bottles.length; t++) {
      if (rules.cap - S.bottles[t].length < S.piece.length) continue;
      const C = clone(S);
      if (o) E.applyFlip(C);
      E.applyPlace(C, t); greedyPours(C);
      const v = evalState(C);
      if (v > bestByO[+o]) { bestByO[+o] = v; if (!o) bestNoFlip = [false, t]; }
      if (v > bestV) { bestV = v; best = [o, t]; }
    }
    best = pickWithBudget(rules, bestByO, best, bestNoFlip);
    if (best == null) {
      const p = roomPath(S);
      if (!p) { if (policy !== 'none' && E.applySpare(S)) continue; E.giveUp(S); continue; }
      for (const [s, t] of p) E.applyPour(S, s, t, H);
      continue;
    }
    if (best[0]) E.applyFlip(S);
    notePlace(S, best[1]);
    E.applyPlace(S, best[1], H);
  }
  if (S.over && !S.botStats.death) onDeath(S, null);
  return S;
}
function summarize(label, rules, n, maxTurns, opts) {
  const t1 = Date.now();
  const turns = [], scores = [];
  let capped = 0;
  for (let i = 0; i < n; i++) {
    const S = runBot(E.sanitizeRules(rules), `bot-${label}-${i}`, maxTurns, opts);
    turns.push(S.turn); scores.push(S.score);
    if (!S.over) capped++;
  }
  turns.sort((a, b) => a - b); scores.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  console.log(`${label.padEnd(26)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  survived ${maxTurns}+: ${capped}/${n}  (${Date.now() - t1}ms)`);
}

module.exports = { E, runBot, summarize, SPARE_FULL_PENALTY, FLIP_SPEND_GAP, flipOrients, pickWithBudget, newBotStats, botHooks, notePlace, onDeath };
