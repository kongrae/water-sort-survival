
// Engine: pure game rules. No DOM access, so it can run headless for balance tests.
// DEFAULT_RULES are the v2 rules. V1_RULES switches every v2 rule off and reproduces the v1 prototype exactly.
// New rule flags are only ever tested for truthiness, so a saved v1 game (fields missing) keeps playing as v1.
const DEFAULT_RULES = {
  bottles: 6, cap: 4, startColors: 4, maxColors: 8, colorEvery: 20, pieceMin: 1, pieceMax: 2, preview: 2, pourLimit: 0, autoMerge: false,
  // A placement that completes a bottle keeps the combo alive even if the turn before it had no completion.
  comboPlace: true,
  // The current 2-layer piece may be reversed; a charge is spent only when a reversed piece is placed (0 = unlimited).
  flip: true, flipLimit: 2,
  // Every colorEvery turns is a zone: bonus = empty bottles x zoneBonus x min(zone, zoneMulMax); the turn that adds a colour deals a twin of it.
  zones: true, zoneBonus: 20, zoneMulMax: 5, zoneTwin: true, zoneTwinSize: 1,
  // Rewarded spare cup (endless only, off in the rules): capacity spareCap, pours only, breaks when empty spareTurns after it was granted.
  spare: false, spareCap: 1, spareTurns: 20, spareFrom: 15, spareMaxEmpty: 0, spareMaxFree: 7, spareSticky: true,
};
const V1_RULES = Object.assign({}, DEFAULT_RULES, { comboPlace: false, flip: false, zones: false, spare: false });
// Versioned endless progression. Legacy/daily rules keep their original turn-indexed stream.
const SCORE_GROWTH_V1 = [
  { score: 0, colors: 4, bottles: 6 },
  { score: 300, colors: 5, bottles: 6 },
  { score: 900, colors: 6, bottles: 7 },
  { score: 1700, colors: 7, bottles: 7 },
  { score: 2800, colors: 8, bottles: 8 },
  { score: 4500, colors: 9, bottles: 8 },
];
const EXPANDING_RULES = Object.assign({}, DEFAULT_RULES, { expansion: 1, maxColors: 9, growthTable: SCORE_GROWTH_V1, tailDoublePct: 90 });
// Fresh standard endless games use these features. Saved e1/daily/custom rules remain unchanged.
const LEGACY_ENDLESS_RULES = Object.assign({}, EXPANDING_RULES, {
  holdVersion: 1, holdBottles: 7,
  tripleVersion: 1, tripleBottles: 8, triplePct: 5, tripleMonoPct: 50,
});
const PRESSURE_V1 = [
  { score: 4500, triplePct: 5, tripleMonoPct: 50 },
  { score: 10000, triplePct: 8, tripleMonoPct: 30 },
  { score: 15000, triplePct: 10, tripleMonoPct: 20 },
  { score: 25000, triplePct: 12, tripleMonoPct: 10 },
];
const PRESSURE_ENDLESS_RULES = Object.assign({}, LEGACY_ENDLESS_RULES, { pressureVersion: 1, pressureTable: PRESSURE_V1 });
const COLOR_ENDLESS_RULES = Object.assign({}, PRESSURE_ENDLESS_RULES, {
  colorChallengeVersion: 1, challengeFrom: 10000, challengeEvery: 5000,
  challengeTurns: 12, challengeBonus: 150, challengeMaxGoal: 2, challengeFirst: true,
});
const SCORE_LATE_GROWTH_V1 = SCORE_GROWTH_V1.concat([
  { score: 12000, colors: 10, bottles: 8 },
  { score: 18000, colors: 10, bottles: 9 },
]);
const LATE_GROWTH_V1_RULES = Object.assign({}, COLOR_ENDLESS_RULES, {
  lateGrowthVersion: 1, maxColors: 10, growthTable: SCORE_LATE_GROWTH_V1,
});
const SCORE_FULL_GROWTH_V2 = SCORE_LATE_GROWTH_V1.concat([
  { score: 30000, colors: 11, bottles: 9 },
  { score: 40000, colors: 11, bottles: 10 },
  { score: 55000, colors: 12, bottles: 10 },
  { score: 70000, colors: 12, bottles: 11 },
  { score: 85000, colors: 13, bottles: 11 },
  { score: 100000, colors: 13, bottles: 12 },
]);
const FULL_PRESSURE_V2_B = PRESSURE_V1.concat([
  { score: 30000, triplePct: 12, tripleMonoPct: 10 },
  { score: 40000, triplePct: 14, tripleMonoPct: 10 },
  { score: 70000, triplePct: 17, tripleMonoPct: 10 },
  { score: 100000, triplePct: 20, tripleMonoPct: 10 },
]);
const ENDLESS_RULES = Object.assign({}, LATE_GROWTH_V1_RULES, {
  lateGrowthVersion: 2, maxColors: 13, growthTable: SCORE_FULL_GROWTH_V2, pressureTable: FULL_PRESSURE_V2_B,
});
function isExpanding(rules) { return rules.expansion === 1; }
function hasLateGrowth(rules) { return isExpanding(rules) && (rules.lateGrowthVersion === 1 || rules.lateGrowthVersion === 2); }
function hasFullGrowth(rules) { return isExpanding(rules) && rules.lateGrowthVersion === 2; }
function growthBottleLimit(rules) { return hasFullGrowth(rules) ? 12 : hasLateGrowth(rules) ? 9 : 8; }
function growthColorLimit(rules) { return hasFullGrowth(rules) ? 13 : hasLateGrowth(rules) ? 10 : 9; }
function challengeGrowthReady(S) {
  return hasLateGrowth(S.rules) ? S.bottles.length >= 8 && S.growth.activeColors >= 9 : !nextGrowth(S);
}
function hasHold(rules) { return isExpanding(rules) && rules.holdVersion === 1; }
function hasTriple(rules) { return isExpanding(rules) && rules.tripleVersion === 1; }
function hasPressure(rules) { return hasTriple(rules) && rules.pressureVersion === 1; }
function hasColorChallenge(rules) { return isExpanding(rules) && rules.colorChallengeVersion === 1; }
function maxPieceSize(rules) { return Math.max(rules.pieceMax, hasTriple(rules) ? 3 : 0); }
function sanitizePressure(table) {
  const out = [];
  for (const row of (Array.isArray(table) ? table : PRESSURE_V1).slice(0, 16)) {
    if (!row) continue;
    const score = Math.round(Number(row.score));
    const pct = Number(row.triplePct), mono = Number(row.tripleMonoPct);
    if (![score, pct, mono].every(Number.isFinite) || score < 4500) continue;
    const next = { score, triplePct: Math.max(0, Math.min(100, pct)), tripleMonoPct: Math.max(0, Math.min(100, mono)) };
    const prev = out[out.length - 1];
    if (prev && (score <= prev.score || next.triplePct < prev.triplePct || next.tripleMonoPct > prev.tripleMonoPct)) continue;
    out.push(next);
  }
  // As with growth rules, malformed data falls back to the canonical table; absent flags stay off.
  return out.length ? out : PRESSURE_V1.map(row => ({ ...row }));
}
// These queries never consume generation/RNG or change the published queue.
function pressureAt(S) {
  const r = S.rules;
  if (!hasPressure(r) || S.bottles.length < 8 || S.growth.activeColors < 9 || S.score < r.pressureTable[0].score) return null;
  const table = r.pressureTable;
  let prev = table[0];
  for (let i = 1; i < table.length; i++) {
    const next = table[i];
    if (S.score < next.score) {
      const t = (S.score - prev.score) / (next.score - prev.score);
      return { triplePct: prev.triplePct + (next.triplePct - prev.triplePct) * t,
        tripleMonoPct: prev.tripleMonoPct + (next.tripleMonoPct - prev.tripleMonoPct) * t };
    }
    prev = next;
  }
  return { triplePct: prev.triplePct, tripleMonoPct: prev.tripleMonoPct };
}
function nextPressure(S) { return pressureAt(S) ? S.rules.pressureTable.find(row => row.score > S.score) || null : null; }
function sanitizeGrowth(table, rules) {
  const out = [{ score: 0, colors: rules.startColors, bottles: rules.bottles }];
  for (const row of (Array.isArray(table) ? table : hasFullGrowth(rules) ? SCORE_FULL_GROWTH_V2 : hasLateGrowth(rules) ? SCORE_LATE_GROWTH_V1 : SCORE_GROWTH_V1).slice(1, 16)) {
    const prev = out[out.length - 1], score = Math.round(Number(row && row.score));
    const colors = Math.max(prev.colors, Math.min(rules.maxColors, Math.round(Number(row && row.colors))));
    const bottles = Math.max(prev.bottles, Math.min(growthBottleLimit(rules), Math.round(Number(row && row.bottles))));
    if (!Number.isFinite(score) || !Number.isFinite(colors) || !Number.isFinite(bottles) || score <= prev.score) continue;
    if (colors !== prev.colors || bottles !== prev.bottles) out.push({ score, colors, bottles });
  }
  return out;
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sanitizeRules(r) {
  r = r || {};
  const num = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const D = DEFAULT_RULES;
  const bool = k => r[k] === undefined ? D[k] : !!r[k];
  const late = hasLateGrowth(r);
  const o = {
    bottles: num(r.bottles, 3, growthBottleLimit(r), D.bottles),
    cap: num(r.cap, 3, 6, D.cap),
    startColors: num(r.startColors, 2, growthColorLimit(r), D.startColors),
    maxColors: num(r.maxColors, 2, growthColorLimit(r), D.maxColors),
    colorEvery: num(r.colorEvery, 0, 500, D.colorEvery),
    pieceMin: num(r.pieceMin, 1, 6, D.pieceMin),
    pieceMax: num(r.pieceMax, 1, 6, D.pieceMax),
    preview: num(r.preview, 0, 3, D.preview),
    pourLimit: num(r.pourLimit, 0, 9, D.pourLimit),
    autoMerge: bool('autoMerge'),
    comboPlace: bool('comboPlace'),
    flip: bool('flip'),
    flipLimit: num(r.flipLimit, 0, 99, D.flipLimit),
    zones: bool('zones'),
    zoneBonus: num(r.zoneBonus, 0, 5000, D.zoneBonus),
    zoneMulMax: num(r.zoneMulMax, 0, 99, D.zoneMulMax),
    zoneTwin: bool('zoneTwin'),
    zoneTwinSize: num(r.zoneTwinSize, 1, 6, D.zoneTwinSize),
    spare: bool('spare'),
    spareCap: num(r.spareCap, 1, 3, D.spareCap),
    spareTurns: num(r.spareTurns, 0, 500, D.spareTurns),
    spareFrom: num(r.spareFrom, 0, 500, D.spareFrom),
    spareMaxEmpty: num(r.spareMaxEmpty, 0, 8, D.spareMaxEmpty),
    spareMaxFree: num(r.spareMaxFree, 0, 48, D.spareMaxFree),
    spareSticky: bool('spareSticky'),
  };
  if (o.maxColors < o.startColors) o.maxColors = o.startColors;
  if (o.pieceMax > o.cap) o.pieceMax = o.cap;
  if (o.pieceMin > o.pieceMax) o.pieceMin = o.pieceMax;
  if (isExpanding(r)) {
    o.expansion = 1;
    if (late) o.lateGrowthVersion = r.lateGrowthVersion;
    o.growthTable = sanitizeGrowth(r.growthTable, o);
    o.tailDoublePct = num(r.tailDoublePct, 0, 100, EXPANDING_RULES.tailDoublePct);
    o.spare = false;
    if (r.colorChallengeVersion === 1) {
      o.colorChallengeVersion = 1;
      o.challengeFrom = num(r.challengeFrom, 10000, 1000000, ENDLESS_RULES.challengeFrom);
      o.challengeEvery = num(r.challengeEvery, 5000, 1000000, ENDLESS_RULES.challengeEvery);
      o.challengeTurns = num(r.challengeTurns, 4, 30, ENDLESS_RULES.challengeTurns);
      o.challengeBonus = num(r.challengeBonus, 0, 150, ENDLESS_RULES.challengeBonus);
      o.challengeMaxGoal = num(r.challengeMaxGoal, 1, 2, ENDLESS_RULES.challengeMaxGoal);
      o.challengeFirst = r.challengeFirst !== false;
    }
    if (r.holdVersion === 1) {
      o.holdVersion = 1; o.holdBottles = num(r.holdBottles, 6, 8, ENDLESS_RULES.holdBottles);
    }
    if (r.tripleVersion === 1 && o.cap >= 3 && o.pieceMin === 1 && o.pieceMax === 2) {
      o.tripleVersion = 1; o.tripleBottles = num(r.tripleBottles, 6, 8, ENDLESS_RULES.tripleBottles);
      o.triplePct = num(r.triplePct, 0, 100, ENDLESS_RULES.triplePct);
      o.tripleMonoPct = num(r.tripleMonoPct, 0, 100, ENDLESS_RULES.tripleMonoPct);
      if (r.pressureVersion === 1) { o.pressureVersion = 1; o.pressureTable = sanitizePressure(r.pressureTable); }
    }
  }
  return o;
}
// Records are only compared between runs with the same signature. v1 rules keep their original signature.
// spare* is a rescue (like revive), so it is not part of the signature.
function rulesSig(r) {
  if (isExpanding(r)) {
    const legacy = Object.assign({}, r); delete legacy.expansion;
    let sig = rulesSig(legacy) + '-e1q1p' + r.preview + 'd' + (r.tailDoublePct === undefined ? 50 : r.tailDoublePct) + '-' + r.growthTable.map(x => [x.score, x.colors, x.bottles].join('_')).join('.');
    if (hasHold(r)) sig += '-h1b' + r.holdBottles;
    if (hasTriple(r)) sig += '-t1b' + r.tripleBottles + 'p' + r.triplePct + 'm' + r.tripleMonoPct;
    if (hasPressure(r)) sig += '-p1-' + r.pressureTable.map(x => [x.score, x.triplePct, x.tripleMonoPct].join('_')).join('.');
    if (hasColorChallenge(r)) sig += '-cc1-' + [r.challengeFrom, r.challengeEvery, r.challengeTurns, r.challengeBonus, r.challengeMaxGoal, r.challengeFirst ? 1 : 0].join('_');
    if (hasLateGrowth(r)) sig += '-lg' + r.lateGrowthVersion;
    return sig;
  }
  const base = [r.bottles, r.cap, r.startColors, r.maxColors, r.colorEvery, r.pieceMin, r.pieceMax, r.pourLimit, r.autoMerge ? 1 : 0].join('-');
  if (!r.comboPlace && !r.flip && !r.zones) return base;
  return base + '-c' + (r.comboPlace ? 1 : 0) +
    '-f' + (r.flip ? (r.flipLimit || 0) : 'x') +
    '-z' + (r.zones ? r.zoneBonus + 'x' + r.zoneMulMax + 't' + (r.zoneTwin ? r.zoneTwinSize : 0) : 'x');
}
function colorsAt(rules, i) {
  if (!rules.colorEvery) return rules.startColors;
  return Math.min(rules.maxColors, rules.startColors + Math.floor(i / rules.colorEvery));
}
// Zone z covers turns (z-1)*colorEvery .. z*colorEvery-1; zones past maxColors keep counting ("deep" zones).
function zoneAt(rules, i) { return rules.colorEvery ? Math.floor(i / rules.colorEvery) + 1 : 1; }
function isZoneStart(rules, i) { return !!rules.zones && rules.colorEvery > 0 && i > 0 && i % rules.colorEvery === 0; }
// Index of the colour introduced at turn i, or -1 if turn i adds no colour.
function newColorAt(rules, i) { return i > 0 && colorsAt(rules, i) > colorsAt(rules, i - 1) ? colorsAt(rules, i) - 1 : -1; }
function zoneBonusAt(rules, i, bs) {
  if (!isZoneStart(rules, i)) return 0;
  const z = zoneAt(rules, i), mul = rules.zoneMulMax ? Math.min(z, rules.zoneMulMax) : z;
  let empties = 0; for (const b of bs) if (!b.length) empties++;
  return empties * rules.zoneBonus * mul;
}
function isTwinTurn(rules, i) { return !isExpanding(rules) && !!(rules.zones && rules.zoneTwin) && newColorAt(rules, i) >= 0; }
// Piece i depends only on the seed and its index, so every player of a daily seed sees the same sequence.
// A twin overwrites the piece of a colour-adding turn without drawing from the generator.
function pieceAt(seed, rules, i) {
  if (isTwinTurn(rules, i)) return Array(Math.max(rules.pieceMin, Math.min(rules.zoneTwinSize, rules.pieceMax))).fill(newColorAt(rules, i));
  const rnd = mulberry32(hashStr(seed + '#' + i));
  const size = rules.pieceMin + Math.floor(rnd() * (rules.pieceMax - rules.pieceMin + 1));
  const k = colorsAt(rules, i);
  const p = [];
  for (let j = 0; j < size; j++) p.push(Math.floor(rnd() * k));
  return p;
}
function topSeg(b) {
  const c = b[b.length - 1];
  let n = 0;
  for (let k = b.length - 1; k >= 0 && b[k] === c; k--) n++;
  return { c, n };
}
function isPure(b) { return b.length > 0 && b.every(c => c === b[0]); }
// cap is a number (all bottles) or a per-slot array (bottles plus the spare cup).
function capAt(cap, i) { return typeof cap === 'number' ? cap : cap[i]; }
function canPour(bs, s, t, cap) {
  if (s === t) return false;
  const a = bs[s], b = bs[t];
  if (!a || !b || !a.length || b.length >= capAt(cap, t)) return false;
  return !b.length || b[b.length - 1] === a[a.length - 1];
}
function doPour(bs, s, t, cap) {
  const a = bs[s], b = bs[t];
  const { c, n } = topSeg(a);
  const m = Math.min(n, capAt(cap, t) - b.length);
  for (let k = 0; k < m; k++) { a.pop(); b.push(c); }
  return m;
}
function isDone(b, cap) { return b.length === cap && isPure(b); }
function clearBoard(bs, cap, onClear) {
  for (let i = 0; i < bs.length; i++) {
    if (!isDone(bs[i], cap)) continue;
    const c = bs[i][0];
    bs[i].length = 0;
    if (onClear) onClear(i, c);
  }
}
// Auto-merge picks one pour at a time: mixed run onto a pure bottle first, then shorter run onto longer run.
// Pure liquid never moves onto a mixed bottle.
function findAutoMove(bs, cap) {
  let best = null, bestKey = -1;
  for (let s = 0; s < bs.length; s++) {
    const a = bs[s];
    if (!a.length) continue;
    const sa = topSeg(a), sPure = isPure(a);
    for (let t = 0; t < bs.length; t++) {
      const b = bs[t];
      if (t === s || !b.length || b.length >= cap || b[b.length - 1] !== sa.c) continue;
      const sb = topSeg(b), tPure = isPure(b);
      let key;
      if (tPure && !sPure) key = 2000 + sb.n;
      else if (sPure && !tPure) continue;
      else if (sa.n < sb.n || (sa.n === sb.n && s > t)) key = (tPure ? 1000 : 0) + sb.n * 16 + (16 - sa.n);
      else continue;
      if (key > bestKey) { bestKey = key; best = [s, t]; }
    }
  }
  return best;
}
function resolveBoard(bs, rules, onClear, onMove) {
  clearBoard(bs, rules.cap, onClear);
  if (!rules.autoMerge) return;
  for (let g = 0; g < 200; g++) {
    const mv = findAutoMove(bs, rules.cap);
    if (!mv) break;
    const m = doPour(bs, mv[0], mv[1], rules.cap);
    if (onMove) onMove(mv[1], m);
    clearBoard(bs, rules.cap, onClear);
  }
}
function roomFor(bs, need, cap) { return bs.some(b => cap - b.length >= need); }
// Preserve legacy keys while distinguishing a two-digit color from two one-digit layers.
function liquidKey(b) { return b.some(c => c >= 10) ? 'c' + b.join(',') : b.join(''); }
function boardKey(bs) { return bs.map(liquidKey).sort().join('|'); }
// Can some sequence of pours (within the budget) open a slot big enough for the piece?
// Returns true, false, or 'unknown' when the search hits its node limit. A granted spare cup takes part in the search.
function canMakeRoom(bs, need, rules, budget, limit, spare) {
  const cap = rules.cap, max = limit || 6000, nb0 = bs.length;
  const caps = spare ? bs.map(() => cap).concat([rules.spareCap]) : cap;
  const keyOf = spare ? b => boardKey(b.slice(0, nb0)) + '#' + liquidKey(b[nb0]) : boardKey;
  let frontier = [(spare ? bs.concat([spare]) : bs).map(b => b.slice())];
  const seen = new Set([keyOf(frontier[0])]);
  let depth = 0, nodes = 0;
  while (frontier.length) {
    if (depth >= budget) return false;
    const next = [];
    for (const cur of frontier) {
      for (let s = 0; s < cur.length; s++) {
        for (let t = 0; t < cur.length; t++) {
          if (!canPour(cur, s, t, caps)) continue;
          const nb = cur.map(b => b.slice());
          doPour(nb, s, t, caps);
          const main = spare ? nb.slice(0, nb0) : nb;
          resolveBoard(main, rules);
          if (roomFor(main, need, cap)) return true;
          const k = keyOf(nb);
          if (seen.has(k)) continue;
          seen.add(k);
          if (++nodes > max) return 'unknown';
          next.push(nb);
        }
      }
    }
    frontier = next;
    depth++;
  }
  return false;
}
function newState(mode, seed, rules) {
  const S = {
    v: 1, mode, seed, rules,
    bottles: Array.from({ length: rules.bottles }, () => []),
    turn: 0, piece: pieceAt(seed, rules, 0),
    score: 0, streak: 0, maxStreak: 0, turnClears: 0, clears: 0,
    turnLog: [], undoLeft: 3, reviveUsed: false, pours: 0,
    over: false, overReason: '', stuck: null,
    comboPts: 0, undoUsed: 0, flipsPlaced: 0, flipped: false,
    zoneBonusTotal: 0, zoneLog: [],
    spare: null, spareUsed: false, spareOffer: false, spareArmTurn: -1, spareTurn: -1, spareIn: 0,
  };
  if (isExpanding(rules)) {
    S.growth = { activeColors: rules.startColors, generation: 0, queue: [], pendingIntro: [], log: [], pieceIntro: -1 };
    advancePiece(S);
  }
  if (hasHold(rules)) { S.hold = null; S.holdUsed = false; }
  if (hasColorChallenge(rules)) S.challenge = { nextScore: rules.challengeFrom, active: null,
    completed: 0, missed: 0, bonusTotal: 0, lastColor: -1, lastResult: null, checkedTurn: -1 };
  return S;
}
function activeColors(S) { return isExpanding(S.rules) ? S.growth.activeColors : colorsAt(S.rules, S.turn); }
function growthTarget(S) {
  const table = S.rules.growthTable;
  let target = table[0];
  for (const row of table) { if (S.score < row.score) break; target = row; }
  return target;
}
function nextGrowth(S) {
  if (!isExpanding(S.rules)) return null;
  return S.rules.growthTable.find(row => row.colors > S.growth.activeColors || row.bottles > S.bottles.length) || null;
}
function updateGrowth(S, placed, hooks) {
  if (!isExpanding(S.rules) || S.over) return;
  const target = growthTarget(S), g = S.growth;
  while (S.bottles.length < target.bottles) {
    S.bottles.push([]);
    g.log.push({ kind: 'bottle', value: S.bottles.length, score: S.score, turn: S.turn });
    if (hooks && hooks.growth) hooks.growth('bottle', S.bottles.length);
  }
  if (placed && g.activeColors < target.colors) {
    const color = g.activeColors++;
    if (S.rules.zoneTwin) g.pendingIntro.push(color);
    g.log.push({ kind: 'color', value: g.activeColors, score: S.score, turn: S.turn });
    if (hooks && hooks.growth) hooks.growth('color', color);
  }
}
function generatePiece(S) {
  const g = S.growth, r = S.rules, i = g.generation++;
  const intro = g.pendingIntro.length ? g.pendingIntro.shift() : -1;
  if (intro >= 0) return { piece: Array(Math.max(r.pieceMin, Math.min(r.zoneTwinSize, r.pieceMax))).fill(intro), intro };
  if (hasTriple(r) && S.bottles.length >= r.tripleBottles) {
    // A separate stream leaves the ordinary exp1 piece at this generation exactly as before.
    const triple = mulberry32(hashStr(S.seed + '#triple1#' + i));
    const pressure = pressureAt(S), pct = pressure ? pressure.triplePct : r.triplePct;
    if (triple() < pct / 100) {
      const mono = triple() < (pressure ? pressure.tripleMonoPct : r.tripleMonoPct) / 100, a = Math.floor(triple() * g.activeColors);
      if (mono) return { piece: [a, a, a], intro: -1 };
      const other = Math.floor(triple() * (g.activeColors - 1)), b = other >= a ? other + 1 : other;
      const piece = [a, a, a]; piece[Math.floor(triple() * 3)] = b;
      return { piece, intro: -1 };
    }
  }
  const rnd = mulberry32(hashStr(S.seed + '#exp1#' + i));
  const roll = rnd(), tail = g.activeColors >= (hasLateGrowth(r) ? Math.min(9, r.maxColors) : r.maxColors) && r.pieceMin === 1 && r.pieceMax === 2;
  const size = tail ? (roll < 1 - r.tailDoublePct / 100 ? 1 : 2) : r.pieceMin + Math.floor(roll * (r.pieceMax - r.pieceMin + 1)), piece = [];
  for (let j = 0; j < size; j++) piece.push(Math.floor(rnd() * g.activeColors));
  return { piece, intro: -1 };
}
function advancePiece(S) {
  if (!isExpanding(S.rules)) { S.piece = pieceAt(S.seed, S.rules, S.turn); return; }
  const g = S.growth, next = g.queue.length ? g.queue.shift() : generatePiece(S);
  S.piece = next.piece; g.pieceIntro = next.intro;
  while (g.queue.length < S.rules.preview) g.queue.push(generatePiece(S));
}
function previewPieces(S) {
  if (isExpanding(S.rules)) return S.growth.queue.map(q => ({ piece: q.piece.slice(), intro: q.intro }));
  return Array.from({ length: S.rules.preview }, (_, j) => ({ piece: pieceAt(S.seed, S.rules, S.turn + j + 1), intro: isTwinTurn(S.rules, S.turn + j + 1) ? newColorAt(S.rules, S.turn + j + 1) : -1 }));
}
// Streak counts consecutive turns with at least one completed bottle; each completion scores 100 x streak.
function settle(S, hooks) {
  hooks = hooks || {};
  resolveBoard(S.bottles, S.rules, (i, c) => {
    if (S.turnClears === 0) S.streak++;
    S.turnClears++;
    const gain = 100 * S.streak;
    S.score += gain;
    S.clears++;
    S.comboPts = (S.comboPts || 0) + gain;
    if (S.streak > S.maxStreak) S.maxStreak = S.streak;
    if (hooks.clear) hooks.clear(i, c, gain, S.streak);
    colorChallengeClear(S, c, hooks);
  }, (t, m) => { if (hooks.move) hooks.move(t, m); });
}
function breakCombo(S, hooks) {
  if (S.streak >= 1 && hooks && hooks.comboBreak) hooks.comboBreak(S.streak, S.comboPts || 0);
  S.comboPts = 0;
  S.streak = 0;
}
function checkStuck(S, limit) {
  S.stuck = null;
  if (S.spare && S.rules.spareTurns && !S.spare.length && S.turn - S.spareTurn >= S.rules.spareTurns) S.spare = null;
  if (!S.over && !roomFor(S.bottles, S.piece.length, S.rules.cap)) {
    const budget = S.rules.pourLimit ? Math.max(0, S.rules.pourLimit - S.pours) : Infinity;
    const r = canMakeRoom(S.bottles, S.piece.length, S.rules, budget, limit, S.spare);
    const alternate = holdCandidate(S);
    const h = !alternate ? false : alternate.piece.length === S.piece.length ? r :
      roomFor(S.bottles, alternate.piece.length, S.rules.cap) ? true :
      canMakeRoom(S.bottles, alternate.piece.length, S.rules, budget, limit, S.spare);
    if (r === false && h === false) { S.over = true; S.overReason = 'noroom'; }
    else S.stuck = r === true ? 'room' : h === true ? 'hold' : alternate ? 'unknown-hold' : 'unknown';
  }
  if (S.rules.spare) updateSpareOffer(S);
}
// Called after the placement that makes S.turn a zone start: scores the board as it stands.
function zoneBreak(S, hooks) {
  const bonus = zoneBonusAt(S.rules, S.turn, S.bottles);
  let empties = 0; for (const b of S.bottles) if (!b.length) empties++;
  const z = zoneAt(S.rules, S.turn);
  S.score += bonus;
  S.zoneBonusTotal = (S.zoneBonusTotal || 0) + bonus;
  (S.zoneLog || (S.zoneLog = [])).push({ zone: z, turn: S.turn, empties, bonus, undoUsed: S.undoUsed || 0, revive: !!S.reviveUsed });
  if (hooks && hooks.zone) hooks.zone(z, empties, bonus, isExpanding(S.rules) ? -1 : newColorAt(S.rules, S.turn));
}
// Per zone reached: reached (always), empty2 = left it with >= 2 empty bottles, clean = no undo or revive used while in it.
// The zone the run is in (or ended in) has only its "reached" star.
function zoneStars(S) {
  const log = S.zoneLog || [], out = [];
  const last = zoneAt(S.rules, S.turn);
  for (let z = 1; z <= last; z++) {
    const exit = log.find(e => e.zone === z + 1);
    const entry = z === 1 ? { undoUsed: 0, revive: false } : log.find(e => e.zone === z);
    const empty2 = !!exit && exit.empties >= 2;
    const clean = !!exit && !!entry && exit.undoUsed === entry.undoUsed && exit.revive === entry.revive;
    out.push({ zone: z, empty2, clean, stars: 1 + (empty2 ? 1 : 0) + (clean ? 1 : 0) });
  }
  return out;
}
function applyPlace(S, t, hooks) {
  hooks = hooks || {};
  const b = S.bottles[t];
  if (S.over || !b || S.rules.cap - b.length < S.piece.length) return false;
  const prev = S.turnClears, closing = S.turn > 0;
  if (closing) S.turnLog.push(prev);
  if (!S.rules.comboPlace && closing && prev === 0) breakCombo(S, hooks);
  S.turnClears = 0;
  S.pours = 0;
  if (hasHold(S.rules)) S.holdUsed = false;
  if (S.flipped) { S.flipped = false; S.flipsPlaced = (S.flipsPlaced || 0) + 1; }
  for (const c of S.piece) b.push(c);
  if (hooks.move) hooks.move(t, S.piece.length);
  S.turn++;
  settle(S, hooks);
  if (S.rules.comboPlace && closing && prev === 0 && S.turnClears === 0) breakCombo(S, hooks);
  if (isZoneStart(S.rules, S.turn)) zoneBreak(S, hooks);
  updateGrowth(S, true, hooks);
  advancePiece(S);
  checkStuck(S);
  updateColorChallenge(S, hooks, true);
  return true;
}
function applyPour(S, s, t, hooks) {
  hooks = hooks || {};
  if (S.over) return false;
  if (S.rules.pourLimit && S.pours >= S.rules.pourLimit) return false;
  const slots = slotsOf(S), caps = capsOf(S);
  if (!canPour(slots, s, t, caps)) return false;
  const m = doPour(slots, s, t, caps);
  if (hooks.move) hooks.move(t, m);
  if (S.spare && t === S.bottles.length) S.spareIn = (S.spareIn || 0) + 1;
  S.pours++;
  settle(S, hooks);
  updateGrowth(S, false, hooks);
  checkStuck(S);
  updateColorChallenge(S, hooks, false);
  return true;
}
// ---- Score milestones: optional color goals, proved using visible material only ----
// A bounded search may decline a feasible goal, but never promises one using hidden future pieces.
// The witness uses the real pour/resolve/flip/hold contracts; it does not draw RNG or alter the run.
function colorChallengePlan(S) {
  if (!hasColorChallenge(S.rules) || S.over || !challengeGrowthReady(S)) return null;
  const r = S.rules, counts = Array(activeColors(S)).fill(0);
  const published = [S.piece, ...previewPieces(S).map(q => q.piece), ...(S.hold ? [S.hold.piece] : [])];
  for (const b of S.bottles.concat(published)) for (const c of b) counts[c]++;
  const eligible = counts.map((n, c) => n >= r.cap ? c : -1).filter(c => c >= 0);
  if (!eligible.length) return null;
  const wanted = Math.min(r.challengeMaxGoal, Math.max(...eligible.map(c => Math.floor(counts[c] / r.cap))));
  const last = S.challenge.lastColor, alternative = eligible.some(c => c !== last);
  const initial = { bs: S.bottles.map(b => b.slice()), piece: S.piece.slice(),
    pending: previewPieces(S).map(q => q.piece), hold: S.hold && { ...S.hold, piece: S.hold.piece.slice() },
    holdUsed: !!S.holdUsed, flipped: !!S.flipped, flipsPlaced: S.flipsPlaced || 0, pours: S.pours,
    placed: 0, cleared: counts.map(() => 0), firstColor: -1, firstCount: 0, firstClosed: false, path: [] };
  let frontier = [initial], examined = 0, best = null, bestRank = -1;
  const seen = new Set(), proofs = new Set();
  const key = n => [boardKey(n.bs), n.piece, n.pending.map(liquidKey).join('/'),
    n.hold && liquidKey(n.hold.piece), n.hold && n.hold.flipped, n.holdUsed, n.flipped,
    n.flipsPlaced, r.pourLimit ? n.pours : 0, n.placed, n.cleared, n.firstColor, n.firstCount, n.firstClosed].join('#');
  const rank = n => Math.max(...eligible.map(c => {
    let exposed = 0, pure = 0;
    for (const b of n.bs) if (b.length && b[b.length - 1] === c) {
      exposed += topSeg(b).n; if (isPure(b)) pure = Math.max(pure, b.length);
    }
    return n.cleared[c] * 100 + pure * 4 + exposed;
  }));
  for (let depth = 0; depth < 20 && frontier.length && examined < 768; depth++) {
    const next = [];
    for (const n of frontier) {
      const actions = [];
      if (!r.pourLimit || n.pours < r.pourLimit) for (let s = 0; s < n.bs.length; s++) for (let t = 0; t < n.bs.length; t++) {
        if (canPour(n.bs, s, t, r.cap)) actions.push({ kind: 'pour', args: [s, t] });
      }
      if (n.piece && n.placed < r.challengeTurns) for (let t = 0; t < n.bs.length; t++) {
        if (r.cap - n.bs[t].length >= n.piece.length) actions.push({ kind: 'place', args: [t] });
      }
      const state = { rules: r, bottles: n.bs, piece: n.piece || [], hold: n.hold,
        holdUsed: n.holdUsed, flipped: n.flipped, flipsPlaced: n.flipsPlaced, over: false };
      if (n.piece && canFlip(state)) actions.push({ kind: 'flip', args: [] });
      if (n.piece && canHold(state) && (n.hold || n.pending.length)) actions.push({ kind: 'hold', args: [] });
      for (const action of actions) {
        if (++examined > 768) break;
        const c = { ...n, bs: n.bs.map(b => b.slice()), pending: n.pending.slice(),
          cleared: n.cleared.slice(), path: n.path.concat(action) };
        if (action.kind === 'pour') { doPour(c.bs, ...action.args, r.cap); c.pours++; }
        else if (action.kind === 'place') {
          c.bs[action.args[0]].push(...c.piece); c.piece = c.pending.shift() || null;
          c.placed++; c.pours = 0; c.holdUsed = false;
          if (c.flipped) c.flipsPlaced++; c.flipped = false;
        } else if (action.kind === 'flip') { c.piece = c.piece.slice().reverse(); c.flipped = !c.flipped; }
        else {
          const stored = { piece: c.piece, flipped: c.flipped };
          if (c.hold) { c.piece = c.hold.piece; c.flipped = c.hold.flipped; }
          else { c.piece = c.pending.shift(); c.flipped = false; }
          c.hold = stored; c.holdUsed = true;
        }
        if (action.kind === 'pour' || action.kind === 'place') resolveBoard(c.bs, r, (i, color) => {
          c.cleared[color]++;
          if (c.firstColor < 0) { c.firstColor = color; c.firstCount = 1; }
          else if (c.firstColor !== color) c.firstClosed = true;
          else if (!c.firstClosed) c.firstCount++;
        });
        for (const color of eligible) if (r.challengeFirst ? c.firstColor === color : c.cleared[color]) {
          const goal = Math.min(r.challengeMaxGoal, r.challengeFirst ? c.firstCount : c.cleared[color]);
          // Keep the first discovered witness for each goal, so pointless detours cannot increase its appeal.
          const proofKey = color + '/' + goal;
          if (!proofs.has(proofKey)) {
            proofs.add(proofKey);
            const value = goal * 100 + (r.challengeFirst ? Math.min(c.placed, 3) * 10 + Math.min(c.path.length, 6) : 0) + (color !== last ? 1 : 0);
            if (value > bestRank) { bestRank = value; best = { color, goal, path: c.path }; }
          }
          if (!r.challengeFirst && goal === wanted && (!alternative || color !== last)) return { ...best, examined };
        }
        if (r.challengeFirst && c.firstColor >= 0 && (c.firstClosed || c.firstCount >= wanted || counts[c.firstColor] < 2 * r.cap)) continue;
        if (c.placed >= r.challengeTurns) continue;
        // With no published current piece left, only pours remain; never generate an unseen piece.
        const k = key(c); if (seen.has(k)) continue; seen.add(k); next.push(c);
      }
    }
    next.sort((a, b) => rank(b) - rank(a)); frontier = next.slice(0, 12);
  }
  return best && { ...best, examined: Math.min(examined, 768) };
}
function nextChallengeScore(S) {
  const r = S.rules;
  return r.challengeFrom + Math.max(1, Math.floor((S.score - r.challengeFrom) / r.challengeEvery) + 1) * r.challengeEvery;
}
function finishColorChallenge(S, status, hooks, reason = '') {
  const q = S.challenge, a = q.active, reward = status === 'complete' ? a.goal * S.rules.challengeBonus : 0;
  q.lastResult = { ...a, status, reward, turn: S.turn, reason };
  q.active = null; q.lastColor = a.color; q.checkedTurn = S.turn;
  if (status === 'complete') { q.completed++; q.bonusTotal += reward; S.score += reward; }
  else q.missed++;
  q.nextScore = Math.max(q.nextScore, nextChallengeScore(S));
  if (hooks && hooks.challenge) hooks.challenge(status, q.lastResult);
}
function colorChallengeClear(S, color, hooks) {
  if (!hasColorChallenge(S.rules) || !S.challenge.active) return;
  if (S.challenge.active.color !== color) {
    if (S.rules.challengeFirst) finishColorChallenge(S, 'missed', hooks, 'other-color');
    return;
  }
  const a = S.challenge.active; a.progress++;
  if (a.progress >= a.goal) finishColorChallenge(S, 'complete', hooks);
}
function updateColorChallenge(S, hooks, placed) {
  if (!hasColorChallenge(S.rules)) return;
  const q = S.challenge, r = S.rules;
  if (q.active) {
    // The final placement's completions count; pour/hold/flip never consume the placement allowance.
    if (placed && S.turn - q.active.startTurn >= r.challengeTurns) finishColorChallenge(S, 'missed', hooks, 'placements');
    return;
  }
  if (S.over || S.score < q.nextScore || q.checkedTurn === S.turn || !challengeGrowthReady(S)) return;
  q.checkedTurn = S.turn;
  const plan = colorChallengePlan(S); if (!plan) return;
  q.active = { color: plan.color, goal: plan.goal, progress: 0, startTurn: S.turn, milestone: q.nextScore };
  q.nextScore = nextChallengeScore(S);
  if (hooks && hooks.challenge) hooks.challenge('start', q.active);
}
// ---- Piece flip ----
function canFlip(S) {
  if (!S || !S.rules.flip || S.over) return false;
  const p = S.piece, n = p.length;
  if (n < 2) return false;
  let differs = false;
  for (let i = 0; i < n; i++) if (p[i] !== p[n - 1 - i]) { differs = true; break; }
  if (!differs) return false;
  return !S.rules.flipLimit || flipsLeft(S) > 0 || !!S.flipped;
}
function flipsLeft(S) {
  const reserved = hasHold(S.rules) && S.hold && S.hold.flipped ? 1 : 0;
  return S.rules.flipLimit ? Math.max(0, S.rules.flipLimit - (S.flipsPlaced || 0) - reserved) : Infinity;
}
function applyFlip(S) {
  if (!canFlip(S)) return false;
  S.piece = S.piece.slice().reverse();
  S.flipped = !S.flipped;
  return true;
}
// ---- Whole-piece hold (never a pour slot) ----
function canHold(S) {
  return !!S && hasHold(S.rules) && !S.over && !S.holdUsed && S.bottles.length >= S.rules.holdBottles;
}
function holdCandidate(S) {
  if (!canHold(S)) return null;
  if (S.hold) return { piece: S.hold.piece.slice(), intro: S.hold.intro, flipped: S.hold.flipped };
  const g = S.growth;
  const next = g.queue[0] || generatePiece({ ...S, growth: { ...g, pendingIntro: g.pendingIntro.slice() } });
  return { piece: next.piece.slice(), intro: next.intro, flipped: false };
}
function applyHold(S) {
  if (!canHold(S)) return false;
  const stored = { piece: S.piece.slice(), intro: S.growth.pieceIntro, flipped: !!S.flipped };
  if (S.hold) {
    S.piece = S.hold.piece.slice(); S.growth.pieceIntro = S.hold.intro; S.flipped = S.hold.flipped;
  } else {
    advancePiece(S); S.flipped = false;
  }
  S.hold = stored; S.holdUsed = true;
  checkStuck(S);
  return true;
}
// Validate only the new feature contract; old save formats keep their existing restoration path.
function validFeatureState(S) {
  if (!S || !S.rules) return false;
  const r = S.rules;
  if (r.lateGrowthVersion !== undefined) {
    if (!hasLateGrowth(r) || !Number.isSafeInteger(r.maxColors) || r.maxColors < r.startColors || r.maxColors > growthColorLimit(r) ||
        !Number.isSafeInteger(r.startColors) || r.startColors < 2 || !Number.isSafeInteger(r.bottles) || r.bottles < 3 || r.bottles > growthBottleLimit(r) ||
        !Array.isArray(r.growthTable) || !r.growthTable.length || r.growthTable.length > 16) return false;
    for (let i = 0; i < r.growthTable.length; i++) {
      const row = r.growthTable[i], prev = r.growthTable[i - 1];
      if (!row || ![row.score, row.colors, row.bottles].every(Number.isSafeInteger) || row.score < 0 ||
          row.colors < r.startColors || row.colors > r.maxColors || row.bottles < r.bottles || row.bottles > growthBottleLimit(r) ||
          (!i && (row.score !== 0 || row.colors !== r.startColors || row.bottles !== r.bottles)) ||
          (prev && (row.score <= prev.score || row.colors < prev.colors || row.bottles < prev.bottles))) return false;
    }
  }
  if (!hasHold(r) && !hasTriple(r) && !hasColorChallenge(r) && !hasLateGrowth(r)) return true;
  const g = S.growth, integer = v => Number.isSafeInteger(v) && v >= 0;
  if (hasColorChallenge(r) && !validColorChallengeState(S)) return false;
  if (hasPressure(r)) {
    if (!Array.isArray(r.pressureTable) || !r.pressureTable.length || r.pressureTable.length > 16) return false;
    for (let i = 0; i < r.pressureTable.length; i++) {
      const row = r.pressureTable[i], prev = r.pressureTable[i - 1];
      if (!row || !integer(row.score) || row.score < 4500 ||
          !Number.isFinite(row.triplePct) || row.triplePct < 0 || row.triplePct > 100 ||
          !Number.isFinite(row.tripleMonoPct) || row.tripleMonoPct < 0 || row.tripleMonoPct > 100 ||
          (prev && (row.score <= prev.score || row.triplePct < prev.triplePct || row.tripleMonoPct > prev.tripleMonoPct))) return false;
    }
  }
  if (S.mode !== 'endless' || !g || !integer(S.turn) || !integer(S.pours) ||
      !Number.isFinite(S.score) || S.score < 0 || typeof S.over !== 'boolean' ||
      !Array.isArray(S.bottles) || S.bottles.length < r.bottles || S.bottles.length > growthBottleLimit(r) ||
      !Array.isArray(S.turnLog) || !Array.isArray(S.zoneLog) || !Array.isArray(g.log) ||
      !integer(g.generation) || g.generation < r.preview + 1 || !integer(g.activeColors) ||
      g.activeColors < r.startColors || g.activeColors > r.maxColors || !Array.isArray(g.queue) ||
      g.queue.length !== r.preview || !Array.isArray(g.pendingIntro)) return false;
  const color = c => integer(c) && c < g.activeColors;
  const piece = p => Array.isArray(p) && p.length >= r.pieceMin && p.length <= maxPieceSize(r) &&
    p.every(color) && (p.length !== 3 || !hasTriple(r) || new Set(p).size <= 2);
  const intro = i => i === -1 || color(i);
  const entry = q => !!q && piece(q.piece) && intro(q.intro) && (q.intro < 0 || q.piece.every(c => c === q.intro));
  if (!entry({ piece: S.piece, intro: g.pieceIntro }) ||
      !S.bottles.every(b => Array.isArray(b) && b.length <= r.cap && b.every(color)) ||
      !g.queue.every(entry) || !g.pendingIntro.every(color) ||
      typeof S.flipped !== 'boolean' || !integer(S.flipsPlaced)) return false;
  if (hasHold(r) && (typeof S.holdUsed !== 'boolean' || (S.holdUsed && S.hold === null) ||
      (S.hold !== null && (!entry(S.hold) || typeof S.hold.flipped !== 'boolean')))) return false;
  const reserved = (S.flipped ? 1 : 0) + (hasHold(r) && S.hold && S.hold.flipped ? 1 : 0);
  return (r.flip || reserved === 0) && (!r.flipLimit || S.flipsPlaced + reserved <= r.flipLimit);
}
function validColorChallengeState(S) {
  const r = S.rules, q = S.challenge, integer = v => Number.isSafeInteger(v) && v >= 0;
  if (![r.challengeFrom, r.challengeEvery, r.challengeTurns, r.challengeBonus, r.challengeMaxGoal].every(integer) ||
      r.challengeFrom < 10000 || r.challengeFrom > 1000000 || r.challengeEvery < 5000 || r.challengeEvery > 1000000 ||
      r.challengeTurns < 4 || r.challengeTurns > 30 || r.challengeBonus > 150 || r.challengeMaxGoal < 1 || r.challengeMaxGoal > 2 || typeof r.challengeFirst !== 'boolean' ||
      !q || !integer(q.completed) || !integer(q.missed) || !integer(q.bonusTotal) ||
      q.bonusTotal < q.completed * r.challengeBonus || q.bonusTotal > q.completed * r.challengeBonus * r.challengeMaxGoal ||
      !Number.isSafeInteger(q.checkedTurn) || q.checkedTurn < -1 || q.checkedTurn > S.turn ||
      !Number.isSafeInteger(q.lastColor) || q.lastColor < -1 || !S.growth || q.lastColor >= S.growth.activeColors) return false;
  const milestone = n => integer(n) && n >= r.challengeFrom && (n - r.challengeFrom) % r.challengeEvery === 0;
  const goal = a => a && integer(a.color) && a.color < S.growth.activeColors && integer(a.goal) &&
    a.goal >= 1 && a.goal <= r.challengeMaxGoal && integer(a.progress) && a.progress <= a.goal &&
    integer(a.startTurn) && a.startTurn <= S.turn && milestone(a.milestone);
  if (!milestone(q.nextScore) || (q.active !== null && (!goal(q.active) || q.active.progress >= q.active.goal ||
      S.turn - q.active.startTurn >= r.challengeTurns || q.active.milestone >= q.nextScore))) return false;
  if (q.lastResult !== null && (!goal(q.lastResult) || !integer(q.lastResult.turn) || q.lastResult.turn > S.turn ||
      q.lastResult.turn < q.lastResult.startTurn || q.lastResult.color !== q.lastColor ||
      !['complete', 'missed'].includes(q.lastResult.status) ||
      !['', 'other-color', 'placements'].includes(q.lastResult.reason) ||
      q.lastResult.reward !== (q.lastResult.status === 'complete' ? q.lastResult.goal * r.challengeBonus : 0) ||
      (q.lastResult.status === 'complete' ? q.lastResult.progress !== q.lastResult.goal : q.lastResult.progress >= q.lastResult.goal))) return false;
  return (q.completed + q.missed === 0) === (q.lastResult === null) && (q.lastResult !== null || q.lastColor === -1);
}
// ---- Spare cup ----
// Slot index rules.bottles is the cup once granted. Pours only: never takes a piece, never clears, ignored by auto-merge.
function slotsOf(S) { return S.spare ? S.bottles.concat([S.spare]) : S.bottles; }
function capsOf(S) { return S.spare ? S.bottles.map(() => S.rules.cap).concat([S.rules.spareCap]) : S.rules.cap; }
// The offer depends only on board and turn (no randomness).
function spareCrisis(S) {
  const r = S.rules;
  let empty = 0, free = 0;
  for (const b of S.bottles) { if (!b.length) empty++; free += r.cap - b.length; }
  return S.turn >= r.spareFrom && empty <= r.spareMaxEmpty && free <= r.spareMaxFree;
}
function updateSpareOffer(S) {
  const open = !S.over && !S.spareUsed;
  const crisis = open && spareCrisis(S);
  if (crisis && !(S.spareArmTurn >= 0)) S.spareArmTurn = S.turn;
  S.spareOffer = open && (crisis || (!!S.rules.spareSticky && S.spareArmTurn >= 0));
}
// Called after the rewarded ad completes. Once per run.
function applySpare(S) {
  if (!S.rules.spare || S.over || S.spareUsed || !S.spareOffer) return false;
  S.spare = []; S.spareUsed = true; S.spareTurn = S.turn; S.spareOffer = false; S.spareIn = 0;
  checkStuck(S);
  return true;
}
function applyRevive(S) {
  if (!S.over || S.reviveUsed) return [];
  const idx = S.bottles.map((b, i) => [b.length, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]).slice(0, 2).map(x => x[1]);
  for (const i of idx) S.bottles[i].length = 0;
  S.reviveUsed = true; S.over = false; S.overReason = '';
  checkStuck(S);
  return idx;
}
function giveUp(S) { if (!S.over) { S.over = true; S.overReason = 'gaveup'; S.stuck = null; } }
// ---- Read-only previews and analysis (never modify S) ----
function previewPlace(S, t) {
  const b = S.bottles[t];
  if (S.over || !b || S.rules.cap - b.length < S.piece.length) return { ok: false, add: 0, clears: 0, completes: [] };
  const bs = S.bottles.map(x => x.slice());
  for (const c of S.piece) bs[t].push(c);
  const completes = [];
  resolveBoard(bs, S.rules, i => completes.push(i));
  return { ok: true, add: S.piece.length, clears: completes.length, completes };
}
function previewPour(S, s, t) {
  const slots = slotsOf(S), caps = capsOf(S);
  if (S.over || (S.rules.pourLimit && S.pours >= S.rules.pourLimit) || !canPour(slots, s, t, caps)) return { ok: false, moved: 0, color: -1, clears: 0, completes: [] };
  const copy = slots.map(x => x.slice());
  const color = copy[s][copy[s].length - 1];
  const moved = doPour(copy, s, t, caps);
  const completes = [];
  resolveBoard(copy.slice(0, S.bottles.length), S.rules, i => completes.push(i));
  return { ok: true, moved, color, clears: completes.length, completes };
}
// Facts for the game-over sheet.
function nearMiss(S) {
  const cap = S.rules.cap, need = S.piece.length;
  let maxFree = 0;
  const almost = [], tops = {};
  for (const b of S.bottles) {
    if (cap - b.length > maxFree) maxFree = cap - b.length;
    if (b.length === cap - 1 && isPure(b)) almost.push(b[0]);
    if (b.length) { const { c, n } = topSeg(b); tops[c] = (tops[c] || 0) + n; }
  }
  const scattered = Object.keys(tops).filter(c => tops[c] >= cap).map(Number);
  const ce = S.rules.colorEvery;
  return { need, maxFree, short: need - maxFree, almost, scattered, zoneLeft: ce ? ce - (S.turn % ce) : null };
}
// One square per 10 turns: green for 4+ completions, yellow for 1-3, white for none.
function turnRhythm(S) {
  const log = S.turnLog.concat(S.turn > 0 ? [S.turnClears] : []);
  const out = [];
  for (let i = 0; i < log.length; i += 10) {
    const n = log.slice(i, i + 10).reduce((a, b) => a + b, 0);
    out.push(n >= 4 ? '🟩' : n >= 1 ? '🟨' : '⬜');
  }
  return out.join('');
}
