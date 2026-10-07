// Headless checks for the engine script embedded in water-sort-survival.html
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const E = new Function(code + `
return { DEFAULT_RULES, sanitizeRules, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck,
  applyPlace, applyPour, applyRevive, giveUp, turnRhythm };`)();

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
function runBot(rules, seed, maxTurns) {
  const S = E.newState('endless', seed, rules);
  while (!S.over && S.turn < maxTurns) {
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
    if (best == null) {
      const p = roomPath(S);
      if (!p) { E.giveUp(S); break; }
      for (const [s, t] of p) E.applyPour(S, s, t);
      continue;
    }
    E.applyPlace(S, best);
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

module.exports = { E, runBot, summarize };
