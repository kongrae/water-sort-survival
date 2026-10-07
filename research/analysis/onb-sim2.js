// Variant engines (piece generator swaps) + paired-seed comparisons for novice and greedy bots.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'water-sort-survival.html'), 'utf8');
const code = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const EXPORTS = `return { DEFAULT_RULES, sanitizeRules, colorsAt, pieceAt, topSeg, isPure, canPour, doPour, isDone, clearBoard,
  findAutoMove, resolveBoard, roomFor, boardKey, canMakeRoom, newState, settle, checkStuck, applyPlace, applyPour, applyRevive, giveUp, turnRhythm };`;
function makeEngine(pieceSrc) {
  let c = code;
  if (pieceSrc) c = c.replace(/function pieceAt\(seed, rules, i\) \{[\s\S]*?\n\}\n/, pieceSrc + '\n');
  return new Function(c + EXPORTS)();
}
const BAG = `
const __bagCache = new Map();
function pieceAt(seed, rules, i) {
  const B = 10, b = Math.floor(i / B), key = seed + '|' + b;
  let blk = __bagCache.get(key);
  if (!blk) {
    const k = colorsAt(rules, b * B);
    const sizes = [];
    for (let j = 0; j < B; j++) { const r = mulberry32(hashStr(seed + '#' + (b * B + j))); sizes.push(rules.pieceMin + Math.floor(r() * (rules.pieceMax - rules.pieceMin + 1))); }
    const U = sizes.reduce((a, x) => a + x, 0);
    const bag = []; let c = 0; const start = Math.floor(mulberry32(hashStr(seed + '#off' + b))() * k);
    while (bag.length < U) { bag.push((start + c) % k); c++; }
    const rnd = mulberry32(hashStr(seed + '#bag' + b));
    for (let x = bag.length - 1; x > 0; x--) { const y = Math.floor(rnd() * (x + 1)); [bag[x], bag[y]] = [bag[y], bag[x]]; }
    blk = []; let pos = 0;
    for (const s of sizes) { blk.push(bag.slice(pos, pos + s)); pos += s; }
    if (__bagCache.size > 5000) __bagCache.clear();
    __bagCache.set(key, blk);
  }
  return blk[i % B].slice();
}`;
// Twin bias: 2-layer pieces are single-color with probability 0.5 (base is 1/k)
const TWIN = `
function pieceAt(seed, rules, i) {
  const rnd = mulberry32(hashStr(seed + '#' + i));
  const size = rules.pieceMin + Math.floor(rnd() * (rules.pieceMax - rules.pieceMin + 1));
  const k = colorsAt(rules, i);
  const p = [Math.floor(rnd() * k)];
  for (let j = 1; j < size; j++) p.push(rnd() < 0.5 ? p[0] : Math.floor(rnd() * k));
  return p;
}`;
module.exports = { makeEngine, BAG, TWIN };
