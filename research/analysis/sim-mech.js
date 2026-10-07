// Mechanic-variant simulator (does not touch the prototype). Base piece sequence = E.pieceAt; specials come from a separate seeded substream.
const { E } = require('./harness.js');
const W = 99; // wild (rainbow) layer: only ever exists in an otherwise empty-below position
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// V: variant config
// { wild:p, wildFrom, bomb:p, bombFrom, hold:bool, shot:turnUnlock|-1, pipette:clearsPerCharge, fever:bool }
function pieceFx(seed, rules, i, V) {
  const base = E.pieceAt(seed, rules, i);
  const r = mulberry32(hashStr(seed + '#fx#' + i));
  const a = r(), b = r(), f = r(), wi = r();
  if (V.bomb && i >= (V.bombFrom || 0) && a < V.bomb) return { bomb: true, layers: [] };
  const p = base.slice();
  if (V.wild && i >= (V.wildFrom || 0) && b < V.wild) p[Math.floor(wi * p.length)] = W;
  if (V.frozen && i >= (V.frozenFrom || 0) && f < V.frozen && p[0] !== W) p[0] += 200;
  return { bomb: false, layers: p };
}
const nz = c => (c >= 200 ? c - 200 : c);
const top = b => b[b.length - 1];
function seg(b) { const c = top(b); let n = 0; for (let k = b.length - 1; k >= 0 && b[k] === c; k--) n++; return n; }
function canPour(bs, caps, s, t) {
  if (s === t) return false; const a = bs[s], b = bs[t];
  if (!a.length || b.length >= caps[t] || top(a) >= 200) return false;
  if (!b.length) return true; const x = top(a), y = nz(top(b));
  return x === y || x === W || y === W;
}
function pushLayer(b, c) {
  if (c === W) { if (b.length && top(b) !== W) c = nz(top(b)); }
  else if (b.length && top(b) === W) { for (let k = 0; k < b.length; k++) if (b[k] === W) b[k] = c; }
  b.push(c);
}
function doPour(bs, caps, s, t) {
  const a = bs[s], b = bs[t]; const n = seg(a), m = Math.min(n, caps[t] - b.length);
  for (let k = 0; k < m; k++) pushLayer(b, a.pop());
  return m;
}
function clearAll(bs, caps, noClear) {
  let n = 0;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]; if (noClear[i] || b.length !== caps[i]) continue;
    if (b.every(c => nz(c) === nz(b[0]))) { b.length = 0; n++; for (const j of [i - 1, i + 1]) if (bs[j]) for (let k = 0; k < bs[j].length; k++) if (bs[j][k] >= 200 && bs[j][k] !== W) bs[j][k] -= 200; }
  }
  return n;
}
function evalB(bs, caps, place, clears, need) {
  let units = 0, empties = 0, maxFree = 0, breaks = 0;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]; units += b.length;
    if (place[i]) { if (!b.length) empties++; if (caps[i] - b.length > maxFree) maxFree = caps[i] - b.length; }
    for (let k = 1; k < b.length; k++) if (nz(b[k]) !== nz(b[k - 1]) && b[k] !== W && b[k - 1] !== W) breaks++;
  }
  return clears * 6 + empties * 3 + maxFree * 1.5 - units * 0.6 - breaks * 2.2 + (maxFree >= need ? 4 : -8);
}
function step(G, bs, s, t) { const nb = bs.map(b => b.slice()); doPour(nb, G.caps, s, t); const c = clearAll(nb, G.caps, G.noClear); return [nb, c]; }
function pours(G, bs) { const o = []; for (let s = 0; s < bs.length; s++) for (let t = 0; t < bs.length; t++) if (canPour(bs, G.caps, s, t)) o.push([s, t]); return o; }
function bestPour(G, bs, clears, need) {
  const base = evalB(bs, G.caps, G.place, clears, need); let best = null, bestV = base + 0.01;
  for (const [s, t] of pours(G, bs)) {
    const [b1, c1] = step(G, bs, s, t); let v = evalB(b1, G.caps, G.place, clears + c1, need);
    for (const [s2, t2] of pours(G, b1)) { const [b2, c2] = step(G, b1, s2, t2); const v2 = evalB(b2, G.caps, G.place, clears + c1 + c2, need) - 0.05; if (v2 > v) v = v2; }
    if (v > bestV) { bestV = v; best = [s, t]; }
  }
  return best;
}
function settleLight(G, bs, clears, need) {
  for (let g = 0; g < 40; g++) { const p = bestPour(G, bs, clears, need); if (!p) break; const [nb, c] = step(G, bs, p[0], p[1]); bs = nb; clears += c; }
  return [bs, clears];
}
const fits = (G, bs, pc) => pc.bomb || G.place.some((ok, i) => ok && G.caps[i] - bs[i].length >= pc.layers.length);
function roomPath(G, bs, pcs) {
  const seen = new Set([bs.map(b => b.join(',')).join('|')]);
  let fr = [{ b: bs, path: [] }];
  for (let d = 0; d < 10 && fr.length; d++) {
    const nx = [];
    for (const { b, path } of fr) for (const [s, t] of pours(G, b)) {
      const [nb] = step(G, b, s, t); const p = path.concat([[s, t]]);
      if (pcs.some(pc => fits(G, nb, pc))) return p;
      const k = nb.map(x => x.join(',')).join('|'); if (seen.has(k)) continue; seen.add(k);
      if (seen.size > 30000) return null; nx.push({ b: nb, path: p });
    }
    fr = nx;
  }
  return null;
}
function placeOn(G, bs, pc, t) {
  const nb = bs.map(b => b.slice());
  if (pc.bomb) { if (nb[t].length) { const n = G.bombAll ? nb[t].length : seg(nb[t]); nb[t].length -= n; } }
  else for (const c of pc.layers) pushLayer(nb[t], c);
  return nb;
}
function run(rules, seed, V, maxTurns) {
  rules = E.sanitizeRules(rules);
  const G = { bombAll: !!V.bombAll, caps: Array(rules.bottles).fill(rules.cap), place: Array(rules.bottles).fill(true), noClear: Array(rules.bottles).fill(false) };
  let bs = G.caps.map(() => []);
  let pi = 0, turn = 0, clears = 0, score = 0, streak = 0, maxStreak = 0, fever = 0, charges = 0, chargeProg = 0, rescues = 0, specials = { wild: 0, bomb: 0 }, feverCount = 0, holdUses = 0;
  let cur = pieceFx(seed, rules, pi++, V), hold = null;
  const shotOn = () => { if (V.shot != null && V.shot >= 0 && turn >= V.shot && G.caps.length === rules.bottles) { G.caps.push(V.shotCap || 2); G.place.push(false); G.noClear.push(true); bs.push([]); } };
  const fev = pc => { if (fever > 0 && !pc.bomb && pc.layers.length === 2 && pc.layers[0] !== W) pc.layers[1] = pc.layers[0]; return pc; };
  let turnClears = 0, holdReady = true, frozenSeen = 0;
  const onClears = n => { for (let k = 0; k < n; k++) { if (turnClears === 0) { streak++; const fa = V.feverAt || 5; if (V.fever && streak >= fa && fever === 0 && streak % fa === 0) { fever = 5; feverCount++; } } turnClears++; clears++; holdReady = true; score += 100 * streak * (fever > 0 ? 2 : 1); if (streak > maxStreak) maxStreak = streak; if (V.pipette) { chargeProg++; if (chargeProg >= V.pipette) { chargeProg = 0; charges = Math.min(2, charges + 1); } } } };
  let guard = 0;
  while (turn < maxTurns && guard++ < 20000) {
    shotOn();
    const nextLen = 2;
    for (let g = 0; g < 40; g++) { const p = bestPour(G, bs, clears, cur.bomb ? 0 : cur.layers.length); if (!p) break; doPour(bs, G.caps, p[0], p[1]); onClears(clearAll(bs, G.caps, G.noClear)); }
    const applyTool = (b, i) => { if (V.tool === 'flip') b[i].reverse(); else b[i].pop(); };
    if (V.pipette && V.proactive && charges > 0) {
      const need = cur.bomb ? 0 : cur.layers.length; const e0 = evalB(bs, G.caps, G.place, clears, need); let bi = -1, bv = e0 + (V.proactive);
      for (let i = 0; i < bs.length; i++) if (bs[i].length > 1 || (V.tool !== 'flip' && bs[i].length)) { let nb = bs.map(b => b.slice()); applyTool(nb, i); let c = clearAll(nb, G.caps, G.noClear); [nb, c] = settleLight(G, nb, clears + c, need); const v = evalB(nb, G.caps, G.place, c, need); if (v > bv) { bv = v; bi = i; } }
      if (bi >= 0) { applyTool(bs, bi); charges--; rescues++; onClears(clearAll(bs, G.caps, G.noClear)); continue; }
    }
    const opts = [];
    const consider = (pc, useHold) => {
      for (let t = 0; t < bs.length; t++) {
        if (!G.place[t]) continue;
        if (!pc.bomb && G.caps[t] - bs[t].length < pc.layers.length) continue;
        let nb = placeOn(G, bs, pc, t); let c = clearAll(nb, G.caps, G.noClear);
        [nb, c] = settleLight(G, nb, c, nextLen);
        opts.push({ v: evalB(nb, G.caps, G.place, c, nextLen) - (useHold ? 0.3 : 0), t, pc, useHold });
      }
    };
    consider(cur, false);
    if (V.rot && !cur.bomb && cur.layers.length === 2 && cur.layers[0] !== cur.layers[1]) consider({ bomb: false, layers: cur.layers.slice().reverse() }, false);
    const hOk = !V.holdCD || holdReady;
    if (V.hold && hold && hOk) consider(hold, true);
    if (V.hold && !hold && hOk) consider(fev(pieceFx(seed, rules, pi, V)), 'stash');
    if (!opts.length) {
      const p = roomPath(G, bs, V.hold && hold && hOk ? [cur, hold] : [cur]);
      if (p && p.length) { for (const [s, t] of p) { doPour(bs, G.caps, s, t); onClears(clearAll(bs, G.caps, G.noClear)); } continue; }
      if (V.hold && !hold) { hold = cur; cur = fev(pieceFx(seed, rules, pi++, V)); holdUses++; continue; }
      if (V.pipette && charges > 0) { // remove top layer of the bottle that best opens room
        let bi = -1, bv = -Infinity;
        for (let i = 0; i < bs.length; i++) if (bs[i].length) { const nb = bs.map(b => b.slice()); applyTool(nb, i); const v = evalB(nb, G.caps, G.place, 0, cur.layers.length); if (v > bv) { bv = v; bi = i; } }
        if (bi >= 0) { applyTool(bs, bi); charges--; rescues++; onClears(clearAll(bs, G.caps, G.noClear)); continue; }
      }
      break;
    }
    opts.sort((x, y) => y.v - x.v);
    const o = opts[0];
    if (o.useHold === 'stash') { hold = cur; pi++; holdUses++; holdReady = false; } else if (o.useHold) { hold = cur; holdUses++; holdReady = false; }
    // end previous turn bookkeeping
    if (turn > 0 && turnClears === 0) streak = 0;
    turnClears = 0;
    if (fever > 0) fever--;
    if (!o.pc.bomb && o.pc.layers.some(c => c >= 200 && c !== W)) frozenSeen++;
    if (o.pc.bomb) specials.bomb++; else if (o.pc.layers.includes(W)) specials.wild++;
    bs = placeOn(G, bs, o.pc, o.t); onClears(clearAll(bs, G.caps, G.noClear));
    turn++;
    // post-place pours with clear counting
    for (let g = 0; g < 40; g++) { const p = bestPour(G, bs, clears, 2); if (!p) break; doPour(bs, G.caps, p[0], p[1]); onClears(clearAll(bs, G.caps, G.noClear)); }
    cur = fev(pieceFx(seed, rules, pi++, V));
  }
  return { turn, score, clears, maxStreak, rescues, specials, feverCount, holdUses, frozenSeen };
}
function summarize(label, rules, V, n, maxTurns) {
  const t1 = Date.now(); const T = [], S = [], M = []; let alive = 0, resc = 0, sw = 0, sb = 0, fc = 0, hu = 0;
  for (let i = 0; i < n; i++) { const r = run(rules, `mv-${i}`, V, maxTurns); T.push(r.turn); S.push(r.score); M.push(r.maxStreak); if (r.turn >= maxTurns) alive++; resc += r.rescues; sw += r.specials.wild; sb += r.specials.bomb; fc += r.feverCount; hu += r.holdUses; }
  const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  console.log(`${label.padEnd(30)} turns p10/p50/p90 ${q(T, .1)}/${q(T, .5)}/${q(T, .9)}  score p50 ${q(S, .5)}  maxStreak p50 ${q(M, .5)}  alive@${maxTurns} ${alive}/${n}  per-run: wild ${(sw / n).toFixed(1)} bomb ${(sb / n).toFixed(1)} rescue ${(resc / n).toFixed(1)} fever ${(fc / n).toFixed(1)} hold ${(hu / n).toFixed(1)}  (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
}
module.exports = { run, summarize };
if (require.main === module) {
  const D = E.DEFAULT_RULES; const n = Number(process.argv[3] || 24), mt = Number(process.argv[4] || 300);
  const all = {
    base: {},
    hold: { hold: true },
    wild4: { wild: 0.04, wildFrom: 10 },
    wild8: { wild: 0.08, wildFrom: 10 },
    bomb3: { bomb: 0.03, bombFrom: 15 },
    bomb5: { bomb: 0.05, bombFrom: 15 },
    shot40: { shot: 40 },
    shot0: { shot: 0 },
    pip8: { pipette: 8 },
    pip5: { pipette: 5 },
    fever: { fever: true },
    bombAll2: { bomb: 0.02, bombFrom: 20, bombAll: true },
    bombAll3: { bomb: 0.03, bombFrom: 20, bombAll: true },
    wild4c7frz: { wild: 0.04, wildFrom: 10, __rules: { maxColors: 7 }, frozen: 0.06, frozenFrom: 60 },
    pipPro6: { pipette: 6, proactive: 4 },
    flipPro6: { pipette: 6, proactive: 4, tool: 'flip' },
    flipEm6: { pipette: 6, tool: 'flip' },
    rot: { rot: true },
    rotC9: { rot: true, __rules: { maxColors: 9 } },
    rotEvery16: { rot: true, __rules: { colorEvery: 16 } },
    comboA: { rot: true, hold: true, holdCD: true, __rules: { maxColors: 9 } },
    comboB: { rot: true, hold: true, holdCD: true, pipette: 6, proactive: 4, bomb: 0.02, bombFrom: 20, bombAll: true, wild: 0.04, wildFrom: 10, frozen: 0.06, frozenFrom: 60, __rules: { maxColors: 8 } },
    comboB9: { rot: true, hold: true, holdCD: true, pipette: 6, proactive: 4, bomb: 0.02, bombFrom: 20, bombAll: true, wild: 0.04, wildFrom: 10, frozen: 0.06, frozenFrom: 60, __rules: { maxColors: 9 } },
    fever3: { fever: true, feverAt: 3 },
    shot1: { shot: 40, shotCap: 1 },
    holdCD: { hold: true, holdCD: true },
    c7: { __rules: { maxColors: 7 } },
    c7frz6: { __rules: { maxColors: 7 }, frozen: 0.06, frozenFrom: 60 },
    c7frz10: { __rules: { maxColors: 7 }, frozen: 0.10, frozenFrom: 60 },
    frz6: { frozen: 0.06, frozenFrom: 30 },
    holdC9: { hold: true, __rules: { maxColors: 9 } },
    shotC9: { shot: 40, __rules: { maxColors: 9 } },
  };
  const pick = (process.argv[2] || Object.keys(all).join(',')).split(',');
  for (const k of pick) summarize(k, { ...D, ...(all[k].__rules || {}) }, all[k], n, mt);
}
