// Headless checks for the engine script embedded in water-sort-survival.html
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const E = new Function(code + `
return { DEFAULT_RULES, sanitizeRules, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck,
  applyPlace, applyPour, applyRevive, giveUp, turnRhythm,
  zoneAt, isZoneStart, newColorAt, zoneBonusAt, zoneBreak, zoneStars };`)();

const clone = o => JSON.parse(JSON.stringify(o));
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; if (failures < 20) console.log('FAIL:', msg); } }


function pairs(bs) { let p = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] === b[i - 1]) p++; return p; }
// Zone heuristic: weight (eval units per empty bottle) for the decision made while piece `turn` is current.
// d = placements left before the zone-start snapshot (0 = this placement triggers it); only the last 3 count, decaying 1, 1/2, 1/3.
// 1 eval unit ~ 100 bonus points x zw (a streak-1 clear is worth 6 units, so zw=1 values the bonus well above plain score).
function zonePrepW(rules, turn, zw) {
  if (!rules.zones || !zw || !(rules.colorEvery > 0)) return 0;
  const B = (Math.floor(turn / rules.colorEvery) + 1) * rules.colorEvery, d = B - 1 - turn;
  if (d > 2) return 0;
  const z = E.zoneAt(rules, B), mul = rules.zoneMulMax ? Math.min(z, rules.zoneMulMax) : z;
  return zw * rules.zoneBonus * mul / 100 / (1 + d);
}
function isTwinTurn(rules, turn) { return !!(rules.zones && rules.zoneTwin && E.newColorAt(rules, turn) >= 0); }
function newZoneStats() { return { twins: 0, twinEmptyAvail: 0, twinIntoEmpty: 0, preChecks: 0, preDiverge: 0 }; }
function greedyPours(S, zw) {
  // Hill-climb: take the pour that most improves the board score, until no pour helps.
  for (let g = 0; g < 60 && !S.over; g++) {
    if (S.rules.pourLimit && S.pours >= S.rules.pourLimit) return;
    const cap = S.rules.cap, bs = S.bottles, base = evalState(S, zw);
    let best = null, bestV = base + 0.01;
    for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) {
      if (!E.canPour(bs, s, t, cap)) continue;
      const C = JSON.parse(JSON.stringify(S));
      E.applyPour(C, s, t);
      const v = evalState(C, zw);
      if (v > bestV) { bestV = v; best = [s, t]; }
    }
    if (!best) return;
    E.applyPour(S, best[0], best[1]);
  }
}
function evalState(S, zw) {
  if (S.over) return -1e9;
  const cap = S.rules.cap, bs = S.bottles;
  const units = bs.reduce((a, b) => a + b.length, 0);
  const empties = bs.filter(b => !b.length).length;
  const maxFree = Math.max(...bs.map(b => cap - b.length));
  let breaks = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) breaks++;
  return S.clears * 6 + empties * (3 + zonePrepW(S.rules, S.turn, zw)) + maxFree * 1.5 - units * 0.6 - breaks * 2.2 + (E.roomFor(bs, S.piece.length, cap) ? 4 : -8);
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
// opts.zoneW: how much the bot values the zone breakthrough bonus (0 = ignores it; default 1 when rules.zones).
function runBot(rules, seed, maxTurns, opts) {
  const zw = opts && opts.zoneW != null ? opts.zoneW : (rules.zones ? 1 : 0);
  const S = E.newState('endless', seed, rules), st = newZoneStats();
  while (!S.over && S.turn < maxTurns) {
    greedyPours(S, zw);
    if (S.over) break;
    let best = null, bestV = -Infinity, best0 = null, bestV0 = -Infinity;
    for (let t = 0; t < S.bottles.length; t++) {
      if (rules.cap - S.bottles[t].length < S.piece.length) continue;
      const C = JSON.parse(JSON.stringify(S));
      E.applyPlace(C, t); greedyPours(C, zw);
      const v0 = evalState(C, zw);
      const v = v0 + zw * ((C.zoneBonusTotal || 0) - (S.zoneBonusTotal || 0)) / 100;
      if (v > bestV) { bestV = v; best = t; }
      if (v0 > bestV0) { bestV0 = v0; best0 = t; }
    }
    if (best != null && rules.zones && E.isZoneStart(rules, S.turn + 1)) { st.preChecks++; if (best !== best0) st.preDiverge++; }
    if (best != null && isTwinTurn(rules, S.turn)) {
      st.twins++;
      if (S.bottles.some(b => !b.length)) st.twinEmptyAvail++;
      if (!S.bottles[best].length) st.twinIntoEmpty++;
    }
    if (best == null) {
      const p = roomPath(S);
      if (!p) { E.giveUp(S); break; }
      for (const [s, t] of p) E.applyPour(S, s, t);
      continue;
    }
    E.applyPlace(S, best);
  }
  S.botStats = st;
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

module.exports = { E, runBot, summarize, zonePrepW, isTwinTurn, newZoneStats };
