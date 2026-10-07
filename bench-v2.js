// Paired bot benchmark for prototype v2.
// usage: node bench-v2.js <engineDir> <config...>   e.g. node bench-v2.js v1-baseline A ; node bench-v2.js . B C D E F G R
// Writes bench-out/<config>.json with per-seed results for both bots, so configs can be compared seed by seed.
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, process.argv[2] || '.');
const H = require(path.join(dir, 'harness.js'));
const B2 = require(path.join(dir, 'bot2.js'));
const E = H.E;
const N = Number(process.env.BENCH_N || 200), MAXT = 300;
const OUT = path.join(__dirname, 'bench-out');
fs.mkdirSync(OUT, { recursive: true });

const V1 = E.V1_RULES || E.DEFAULT_RULES;
const CONFIGS = {
  A: { rules: E.DEFAULT_RULES, opts: {} },                       // run with engineDir = v1-baseline
  B: { rules: V1, opts: { spare: 'none' } },
  C: { rules: Object.assign({}, V1, { comboPlace: true }), opts: {} },
  D: { rules: Object.assign({}, V1, { flip: true, flipLimit: 3 }), opts: {} },
  E: { rules: Object.assign({}, V1, { zones: true }), opts: {} },
  F: { rules: E.DEFAULT_RULES, opts: {} },
  G: { rules: Object.assign({}, E.DEFAULT_RULES, { spare: true }), opts: { spare: 'asap' } },
  R: { rules: E.DEFAULT_RULES, opts: { revive: true } },
};

function record(S) {
  const bs = S.botStats || {};
  const stars = E.zoneStars ? E.zoneStars(S) : [];
  return {
    turns: S.turn, score: S.score, clears: S.clears, over: S.over, reason: S.overReason,
    board: S.bottles.map(b => b.join('')).join('|'),
    maxStreak: S.maxStreak, turnLog: S.turnLog.concat([S.turnClears]),
    flipsPlaced: S.flipsPlaced || 0,
    zoneBonusTotal: S.zoneBonusTotal || 0, zoneLog: S.zoneLog || [], stars,
    twins: bs.twins || 0, twinIntoEmpty: bs.twinIntoEmpty || 0, breaks3: bs.breaks3 || 0,
    spareArmTurn: S.spareArmTurn == null ? -1 : S.spareArmTurn, spareUsed: !!S.spareUsed, spareTurn: S.spareTurn == null ? -1 : S.spareTurn,
    death: bs.death || null, reviveUsed: !!S.reviveUsed,
  };
}
for (const id of process.argv.slice(3)) {
  const cfg = CONFIGS[id];
  if (!cfg) { console.log('unknown config ' + id); continue; }
  const out = { id, engine: path.basename(dir), n: N, greedy: [], bot2: [] };
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const seed = 'v2b-' + i;
    const rules = E.sanitizeRules(cfg.rules);
    out.greedy.push(record(H.runBot(rules, seed, MAXT, cfg.opts)));
    out.bot2.push(record(B2.runBot2(rules, seed, MAXT, cfg.opts)));
  }
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(out));
  console.log(`${id}: ${N} seeds x 2 bots in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
