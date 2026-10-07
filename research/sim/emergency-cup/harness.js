// Headless checks for the engine script embedded in water-sort-survival.html
// (sim copy: adds emergency spare cup support; flag-off behaviour is identical to the original harness)
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const E = new Function(code + `
return { DEFAULT_RULES, sanitizeRules, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck,
  applyPlace, applyPour, applyRevive, giveUp, turnRhythm,
  slotsOf, capsOf, spareCrisis, updateSpareOffer, applySpare };`)();

const clone = o => JSON.parse(JSON.stringify(o));
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; if (failures < 20) console.log('FAIL:', msg); } }

// Spare cup heuristic: an occupied cup loses its option value, so it costs a little (keeps the bot from parking layers for free).
const SPARE_FULL_PENALTY = 1.0;

function pairs(bs) { let p = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] === b[i - 1]) p++; return p; }
function greedyPours(S) {
  // Hill-climb: take the pour that most improves the board score, until no pour helps.
  for (let g = 0; g < 60 && !S.over; g++) {
    if (S.rules.pourLimit && S.pours >= S.rules.pourLimit) return;
    const caps = E.capsOf(S), bs = E.slotsOf(S), base = evalState(S);
    let best = null, bestV = base + 0.01;
    for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) {
      if (!E.canPour(bs, s, t, caps)) continue;
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
// opts.spare: 'never' (default) | 'asap' (watch the ad as soon as the icon appears) | 'late' (only when every placement loses or no room path exists)
//   | 'mid' (when the current piece no longer fits without pours, plus the 'late' rescue)
//   | 'deep' (when total free cells <= 2, plus the 'late' rescue)
function runBot(rules, seed, maxTurns, opts) {
  const policy = (opts && opts.spare) || 'never';
  const S = E.newState('endless', seed, rules);
  while (!S.over && S.turn < maxTurns) {
    if (policy === 'asap' && S.spareOffer) E.applySpare(S);
    if (policy === 'mid' && S.spareOffer && !E.roomFor(S.bottles, S.piece.length, rules.cap)) E.applySpare(S);
    if (policy === 'deep' && S.spareOffer && S.bottles.reduce((x, b) => x + rules.cap - b.length, 0) <= 2) E.applySpare(S);
    greedyPours(S);
    if (S.over) break;
    if (policy === 'asap' && S.spareOffer) { E.applySpare(S); greedyPours(S); if (S.over) break; }
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
      if (!p) { if (policy !== 'never' && E.applySpare(S)) continue; E.giveUp(S); break; }
      for (const [s, t] of p) E.applyPour(S, s, t);
      continue;
    }
    // every placement ends the run -> last-moment rescue
    if ((policy === 'late' || policy === 'mid' || policy === 'deep') && bestV <= -1e9 && E.applySpare(S)) continue;
    E.applyPlace(S, best);
  }
  return S;
}
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
function spareStats(runs) {
  const armed = runs.filter(S => S.spareArmTurn >= 0), used = runs.filter(S => S.spareUsed);
  const sorted = a => a.slice().sort((x, y) => x - y);
  const armToEnd = sorted(armed.filter(S => S.over).map(S => S.turn - S.spareArmTurn));
  const after = sorted(used.map(S => S.turn - S.spareTurn));
  const useTurn = sorted(used.map(S => S.spareTurn)), armTurn = sorted(armed.map(S => S.spareArmTurn));
  const ins = sorted(used.map(S => S.spareIn));
  const missed = runs.filter(S => S.over && !S.spareUsed && S.spareArmTurn >= 0).length;
  const never = runs.filter(S => S.over && S.spareArmTurn < 0).length;
  return `armed ${armed.length}/${runs.length} (first@p50 ${armTurn.length ? q(armTurn, .5) : '-'}, arm->end p50 ${armToEnd.length ? q(armToEnd, .5) : '-'})  used ${used.length} (use@p50 ${useTurn.length ? q(useTurn, .5) : '-'}, turns after use p10/p50/p90 ${after.length ? [q(after, .1), q(after, .5), q(after, .9)].join('/') : '-'}, pours into cup p50 ${ins.length ? q(ins, .5) : '-'})  died-unused-but-armed ${missed}  died-never-armed ${never}`;
}
function summarize(label, rules, n, maxTurns, opts) {
  const t1 = Date.now();
  const turns = [], scores = [], runs = [];
  let capped = 0;
  for (let i = 0; i < n; i++) {
    const S = runBot(E.sanitizeRules(rules), `bot-${(opts && opts.seedTag) || label}-${i}`, maxTurns, opts);
    turns.push(S.turn); scores.push(S.score); runs.push(S);
    if (!S.over) capped++;
  }
  turns.sort((a, b) => a - b); scores.sort((a, b) => a - b);
  console.log(`${label.padEnd(26)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  survived ${maxTurns}+: ${capped}/${n}  (${Date.now() - t1}ms)`);
  if (rules.spare) console.log('   spare: ' + spareStats(runs));
  return { turns, scores, runs };
}

module.exports = { E, runBot, summarize, spareStats, SPARE_FULL_PENALTY };
