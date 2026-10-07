// Headless checks for the engine script embedded in water-sort-survival.html
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const E = new Function(code + `
return { DEFAULT_RULES, sanitizeRules, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck,
  applyPlace, applyPour, applyRevive, giveUp, turnRhythm,
  feverPiece, inFever, pieceFor, canFever, applyFever, canFeverExtend, applyFeverExtend };`)();

const clone = o => JSON.parse(JSON.stringify(o));
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; if (failures < 20) console.log('FAIL:', msg); } }


function pairs(bs) { let p = 0; for (const b of bs) for (let i = 1; i < b.length; i++) if (b[i] === b[i - 1]) p++; return p; }
function greedyPours(S, hooks) {
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
    E.applyPour(S, best[0], best[1], hooks);
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
// ---- fever support (shared by both bots) ----
// Stats are logged through engine hooks: a clear whose gain != 100*streak happened during fever.
function feverStats(S) {
  const st = { uses: 0, held: 0, decided: 0, monoPieces: 0, feverClears: 0, feverBonus: 0, charge: 0, closeCalls: 0, rescues: 0, firstUse: -1, ext: 0, win: {} };
  const hooks = { clear: (i, c, gain, streak) => {
    if (S.rules.fever && gain !== 100 * streak) { st.feverClears++; st.feverBonus += gain - gain / S.rules.feverMult; st.win[S.feverFrom] = (st.win[S.feverFrom] || 0) + 1; }
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
  if (st._lastTurn === S.turn) return; // decide once per turn (roomPath pours may loop back here)
  st._lastTurn = S.turn;
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
  Object.defineProperty(S, '_st', { value: st, enumerable: false });
  return S;
}
function feverLine(sts, n) {
  if (!sts.length) return '';
  const sum = k => sts.reduce((a, s) => a + s[k], 0);
  const used = sts.filter(s => s.uses > 0).length;
  const fu = sts.map(s => s.firstUse).filter(x => x >= 0).sort((a, b) => a - b);
  return `
    fever: uses/game ${(sum('uses') / n).toFixed(2)}  games>=1 use ${used}/${n}  firstUse p50 ${fu.length ? fu[Math.floor(fu.length / 2)] : '-'}` +
    `  monoPieces/use ${(sum('monoPieces') / Math.max(1, sum('uses'))).toFixed(2)}  feverClears/game ${(sum('feverClears') / n).toFixed(2)}` +
    `  bonus/game ${Math.round(sum('feverBonus') / n)}  heldTurns/game ${(sum('held') / n).toFixed(1)}` +
    `  closeCalls ${sum('closeCalls')}/${sum('decided')}  rescues ${sum('rescues')}  adExt ${sum('ext')}` +
    `  wastedCharge/game ${(sts.reduce((a, s) => a + s.wasted, 0) / n).toFixed(1)}`;
}
function summarize(label, rules, n, maxTurns, opts) {
  const t1 = Date.now();
  const turns = [], scores = [], sts = [];
  let capped = 0;
  const R = E.sanitizeRules(rules);
  for (let i = 0; i < n; i++) {
    const S = runBot(R, `bot-${label.split('|')[0].trim()}-${i}`, maxTurns, opts);
    turns.push(S.turn); scores.push(S.score);
    if (R.fever) { S._st.wasted = S._st.charge - (S._st.uses * R.feverGauge + S.fever); sts.push(S._st); }
    if (!S.over) capped++;
  }
  turns.sort((a, b) => a - b); scores.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  console.log(`${label.padEnd(26)} turns p10/p50/p90 = ${q(turns, .1)}/${q(turns, .5)}/${q(turns, .9)}  score p50 = ${q(scores, .5)}  survived ${maxTurns}+: ${capped}/${n}  (${Date.now() - t1}ms)` + feverLine(sts, n));
  return { turns, scores, sts };
}

module.exports = { E, runBot, summarize, feverStats, feverDecide, feverLine };
