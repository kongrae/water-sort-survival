// Paired Node diagnostics for bounded goal searches; generated fixtures are not played games.
const assert = require('assert/strict');
const fs = require('fs');
const { E } = require('../../harness');
const { baselineEngine, baselineFile, engineCode, metadata, sha, write } = require('./common');
const before = baselineEngine(), copy = value => JSON.parse(JSON.stringify(value));
const configurations = [
  ['before', before, before.ENDLESS_RULES, 9, 8],
  ['after', E, E.ENDLESS_RULES, 10, 9],
];
function fixture(engine, rules, colors, bottles, index) {
  let random = (713 + index * 97) >>> 0;
  const rnd = n => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random % n; };
  const s = engine.newState('endless', 'late-expansion-planner-' + index, engine.sanitizeRules(rules));
  s.score = 25000; s.growth.activeColors = colors; s.growth.pendingIntro = [];
  s.bottles = Array.from({ length: bottles }, () => Array.from({ length: rnd(4) }, () => rnd(colors)));
  const current = engine.generatePiece(s); s.piece = current.piece; s.growth.pieceIntro = current.intro;
  s.growth.queue = Array.from({ length: 2 }, () => engine.generatePiece(s));
  if (index % 3 === 0) s.hold = { ...engine.generatePiece(s), flipped: false };
  s.holdUsed = index % 5 === 0 && !!s.hold;
  assert(engine.validFeatureState(s));
  return s;
}
const metrics = configurations.map(([label]) => ({ label, times: [], found: 0, replays: 0, examinedMax: 0, checks: 0 }));
for (let index = -30; index < 400; index++) {
  // Alternate order to avoid measuring every baseline before every candidate.
  for (const which of index % 2 ? [1, 0] : [0, 1]) {
    const [label, engine, rules, colors, bottles] = configurations[which], m = metrics[which];
    const s = fixture(engine, rules, colors, bottles, index + 30), original = JSON.stringify(s);
    const t = performance.now(), plan = engine.colorChallengePlan(s), elapsed = performance.now() - t;
    assert.equal(JSON.stringify(s), original, label + ' planner mutated its input');
    if (index < 0) continue;
    m.times.push(elapsed); m.checks++;
    if (!plan) continue;
    m.found++; m.examinedMax = Math.max(m.examinedMax, plan.examined); assert(plan.examined <= 768);
    const state = copy(s), sequence = [], hooks = { clear: (i, color) => sequence.push(color) };
    for (const action of plan.path) {
      const ok = action.kind === 'place' ? engine.applyPlace(state, ...action.args, hooks)
        : action.kind === 'pour' ? engine.applyPour(state, ...action.args, hooks)
        : action.kind === 'hold' ? engine.applyHold(state) : engine.applyFlip(state);
      assert(ok, label + ' planner returned an illegal action');
    }
    assert(sequence.slice(0, plan.goal).every(color => color === plan.color));
    assert(sequence.filter(color => color === plan.color).length >= plan.goal); m.replays++;
  }
}
const results = metrics.map(m => {
  const times = m.times.slice().sort((a, b) => a - b), q = p => +times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(3);
  assert(m.found > 0); const { times: ignored, ...result } = m;
  return { ...result, n: times.length, p50: q(.5), p90: q(.9), max: q(1), samplesMs: m.times };
});
const baseline = baselineFile('before-source.html', 'water-sort-survival.html');
write('planner-perf.json', { ...metadata(), baselineSourceSha256: sha(baseline), baselineEngineSha256: sha(engineCode(baseline)),
  benchmarkSha256: sha(fs.readFileSync(__filename)), protocol: {
  environment: 'Node.js synchronous goal search; forced 25k states, not mobile FPS', n: 400, warmup: 30,
  fixtures: 'fixed integer LCG boards and actual engine-generated public pieces per case; 9-color/8-bottle vs 10-color/9-bottle',
  order: 'alternating before/after per case', budget: { examined: 768, beam: 12, depth: 20 },
}, results, errors: [] });
console.log(JSON.stringify(results.map(({ samplesMs, ...result }) => result)));
