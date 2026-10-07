// Headless checks for the engine script embedded in water-sort-survival.html
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const E = new Function(code + `
return { DEFAULT_RULES: V1_RULES, sanitizeRules, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck,
  applyPlace, applyPour, applyRevive, giveUp, turnRhythm };`)();

const clone = o => JSON.parse(JSON.stringify(o));
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; if (failures < 20) console.log('FAIL:', msg); } }

// ---------- 1. unit checks ----------
{
  const cap = 4;
  const bs = [[0, 1, 1], [1], []];
  assert(E.canPour(bs, 0, 1, cap), 'pour onto matching top');
  assert(E.canPour(bs, 0, 2, cap), 'pour into empty');
  assert(!E.canPour(bs, 2, 0, cap), 'cannot pour from empty');
  const m = E.doPour(bs, 0, 1, cap);
  assert(m === 2 && bs[1].length === 3 && bs[0].length === 1, 'moves whole top run when room: ' + JSON.stringify(bs));
  const bs2 = [[2, 2, 2], [2, 2, 2]];
  const m2 = E.doPour(bs2, 0, 1, cap);
  assert(m2 === 1 && bs2[0].length === 2 && bs2[1].length === 4, 'partial pour when target nearly full');
  let cleared = 0; E.clearBoard(bs2, cap, () => cleared++);
  assert(cleared === 1 && bs2[1].length === 0, 'full single-color bottle clears');
  // daily determinism
  const r = E.DEFAULT_RULES;
  assert(JSON.stringify(E.pieceAt('daily:2026-10-07', r, 37)) === JSON.stringify(E.pieceAt('daily:2026-10-07', r, 37)), 'piece deterministic');
  // stuck detection: full board with no moves => false
  const full = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3, 2], [4, 0, 4, 0]];
  assert(E.canMakeRoom(full, 1, r, Infinity) === false, 'full board has no room');
  // room reachable by one pour
  const near = [[0, 1, 2, 2], [3, 0, 1, 2], [4, 3, 1, 0], [1, 4, 0, 3], [2, 4, 3]];
  // bottle 4 has 1 free; piece needs 2: pour top 2 of bottle 0 (2,2)? target top must be 2 -> bottle 1 top is 2 but full. so no.
  const res = E.canMakeRoom(near, 2, r, Infinity);
  assert(res === false || res === true, 'returns boolean on small board');
  // scoring streak
  const S = E.newState('endless', 'unit', { ...r, startColors: 1, maxColors: 1, pieceMin: 2, pieceMax: 2 });
  E.applyPlace(S, 0); E.applyPlace(S, 0); // 4 of color 0 -> clear on turn 2
  assert(S.clears === 1 && S.score === 100 && S.streak === 1, 'first clear scores 100: ' + JSON.stringify([S.clears, S.score, S.streak]));
  E.applyPlace(S, 0); E.applyPlace(S, 0);
  assert(S.clears === 2, 'second clear');
  // turn 3 had no clear -> streak reset at placement 4, then clear on turn 4 => streak 1
  assert(S.score === 200, 'streak reset after a turn without clear: score ' + S.score);
}

// ---------- 2. random-play fuzz for invariants ----------
function fuzz(rules, seed, steps) {
  const S = E.newState('endless', seed, rules);
  let placedUnits = 0, removedByRevive = 0;
  const rnd = (() => { let a = 12345 + seed.length; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  for (let k = 0; k < steps; k++) {
    if (S.over) {
      if (!S.reviveUsed) { const before = S.bottles.reduce((a, b) => a + b.length, 0); E.applyRevive(S); removedByRevive += before - S.bottles.reduce((a, b) => a + b.length, 0); continue; }
      break;
    }
    const n = S.bottles.length;
    if (rnd() < 0.55) {
      const s = Math.floor(rnd() * n), t = Math.floor(rnd() * n);
      E.applyPour(S, s, t);
    } else {
      const opts = S.bottles.map((b, i) => [b, i]).filter(([b]) => rules.cap - b.length >= S.piece.length).map(x => x[1]);
      if (opts.length) { const len = S.piece.length; if (E.applyPlace(S, opts[Math.floor(rnd() * opts.length)])) placedUnits += len; }
      else if (S.stuck) { // try any pour
        let moved = false;
        for (let s = 0; s < n && !moved; s++) for (let t = 0; t < n && !moved; t++) moved = E.applyPour(S, s, t);
        if (!moved) E.giveUp(S);
      }
    }
    for (const b of S.bottles) {
      assert(b.length <= rules.cap, 'overflow');
      assert(!E.isDone(b, rules.cap), 'done bottle left on board');
    }
    const units = S.bottles.reduce((a, b) => a + b.length, 0);
    assert(units === placedUnits - S.clears * rules.cap - removedByRevive, `unit conservation ${units} vs ${placedUnits - S.clears * rules.cap - removedByRevive}`);
    if (S.over && S.overReason === 'noroom') assert(!E.roomFor(S.bottles, S.piece.length, rules.cap), 'game over while room exists');
  }
  return S;
}
const configs = [
  E.DEFAULT_RULES,
  { ...E.DEFAULT_RULES, autoMerge: true },
  { ...E.DEFAULT_RULES, pourLimit: 2 },
  { ...E.DEFAULT_RULES, bottles: 7, cap: 5, startColors: 6, maxColors: 9, pieceMin: 2, pieceMax: 3 },
  { ...E.DEFAULT_RULES, bottles: 4, startColors: 3, maxColors: 5, colorEvery: 10, autoMerge: true, pourLimit: 1 },
];
let t0 = Date.now();
for (const [ci, cfg] of configs.entries()) {
  const rules = E.sanitizeRules(cfg);
  for (let g = 0; g < 60; g++) fuzz(rules, `fuzz-${ci}-${g}`, 1500);
}
console.log(`fuzz done in ${Date.now() - t0}ms, failures so far: ${failures}`);

// ---------- 3. greedy bot for rough difficulty ----------
function pairs(bs) { let p = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] === b[i - 1]) p++; return p; }
function greedyPours(S) {
  for (let g = 0; g < 80 && !S.over; g++) {
    if (S.rules.pourLimit && S.pours >= S.rules.pourLimit) return;
    const cap = S.rules.cap, bs = S.bottles, base = pairs(bs);
    let best = null, bestD = 0;
    for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) {
      if (!E.canPour(bs, s, t, cap)) continue;
      const nb = bs.map(b => b.slice());
      E.doPour(nb, s, t, cap);
      let cl = 0; E.resolveBoard(nb, S.rules, () => cl++);
      const d = pairs(nb) + cl * (cap - 1) - base + cl * 10 + (nb[s].length === 0 ? 0.5 : 0);
      if (d > bestD + 1e-9) { bestD = d; best = [s, t]; }
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
const D = E.DEFAULT_RULES;
summarize('default', D, 40, 400);
summarize('default+autoMerge', { ...D, autoMerge: true }, 40, 400);
summarize('default+pourLimit2', { ...D, pourLimit: 2 }, 40, 400);
summarize('6 bottles', { ...D, bottles: 6 }, 40, 400);
summarize('start4 max7', { ...D, startColors: 4, maxColors: 7 }, 40, 400);
summarize('piece 2-3', { ...D, pieceMin: 2, pieceMax: 3 }, 40, 400);
console.log('total failures:', failures);
