const assert = require('assert');
const { E } = require('../../harness');
const { clone, run } = require('../expansion/bots');
const { baselineEngine, baselineBot, write, metadata } = require('./common');
const old = baselineEngine(), oldBot = baselineBot(old), checks = [], statistics = [];
const copy = value => JSON.parse(JSON.stringify(value));
function check(name, fn) { fn(); checks.push(name); console.log('ok ' + name); }
function fixture(score = 4500, patch = {}) {
  const s = E.newState('endless', 'pressure-contract', E.sanitizeRules({ ...E.ENDLESS_RULES, ...patch }));
  s.score = score; s.bottles = Array.from({ length: 8 }, () => []); s.growth.activeColors = 9;
  s.growth.pendingIntro = []; return s;
}
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, actual + ' != ' + expected);
check('legacy signatures, sanitized rules and generated streams remain exact', () => {
  for (const rules of [old.DEFAULT_RULES, old.V1_RULES, old.EXPANDING_RULES, old.ENDLESS_RULES,
    { ...old.ENDLESS_RULES, triplePct: 10 }, { ...old.ENDLESS_RULES, preview: 0 }]) {
    assert.deepStrictEqual(E.sanitizeRules(rules), old.sanitizeRules(rules));
    assert.equal(E.rulesSig(E.sanitizeRules(rules)), old.rulesSig(old.sanitizeRules(rules)));
    const a = old.newState('endless', 'legacy-stream', old.sanitizeRules(rules));
    const b = E.newState('endless', 'legacy-stream', E.sanitizeRules(rules));
    assert.deepStrictEqual(a, b);
    if (a.growth) {
      a.score = b.score = 60000; a.bottles = copy(fixture().bottles); b.bottles = copy(a.bottles);
      a.growth.activeColors = b.growth.activeColors = 9;
      for (let i = 0; i < 12000; i++) assert.deepStrictEqual(E.generatePiece(b), old.generatePiece(a));
      assert.deepStrictEqual(a, b);
    } else for (let i = 0; i < 300; i++) assert.deepStrictEqual(E.pieceAt(a.seed, rules, i), old.pieceAt(a.seed, rules, i));
  }
});
check('old/new real-action bot replays match states and actions, not just aggregate score', () => {
  for (const rules of [old.EXPANDING_RULES, old.ENDLESS_RULES]) for (let seed = 0; seed < 4; seed++) {
    const a = oldBot.run(old.sanitizeRules(rules), 'pressure-legacy-' + seed, 180, 1, true);
    const b = run(E.sanitizeRules(rules), a.seed, 180, 1, true);
    assert.deepStrictEqual(b.state, a.state); assert.deepStrictEqual(b.actions, a.actions);
  }
});
check('linear interpolation, anchors, adjacent scores, fractional values and upper clamp', () => {
  const expected = score => {
    const table = E.PRESSURE_V1; let prev = table[0];
    for (const next of table.slice(1)) {
      if (score < next.score) {
        const t = (score - prev.score) / (next.score - prev.score);
        return [prev.triplePct * (1 - t) + next.triplePct * t, prev.tripleMonoPct * (1 - t) + next.tripleMonoPct * t];
      }
      prev = next;
    }
    return [prev.triplePct, prev.tripleMonoPct];
  };
  assert.equal(E.pressureAt(fixture(4499)), null);
  for (const score of [4500,4501,7250,9999,10000,10001,12500,14999,15000,15001,20000,24999,25000,25001,100000]) {
    const s = fixture(score), before = copy(s), result = E.pressureAt(s), ex = expected(score);
    near(result.triplePct, ex[0]); near(result.tripleMonoPct, ex[1]);
    assert.deepStrictEqual(s, before); E.nextPressure(s); assert.deepStrictEqual(s, before);
  }
  assert.equal(E.nextPressure(fixture(9999)).score, 10000);
  assert.equal(E.nextPressure(fixture(10000)).score, 15000);
  assert.equal(E.nextPressure(fixture(25000)), null);
});
check('actual bottle/color gates and priority color introductions keep old policy', () => {
  for (const damage of [s => s.bottles.pop(), s => s.growth.activeColors = 8, s => s.score = 4499]) {
    const s = fixture(60000); damage(s); assert.equal(E.pressureAt(s), null);
    const legacy = copy(s); legacy.rules = E.sanitizeRules(E.LEGACY_ENDLESS_RULES);
    for (let i = 0; i < 500; i++) assert.deepStrictEqual(E.generatePiece(s), E.generatePiece(legacy));
  }
  const s = fixture(60000), generation = s.growth.generation;
  s.growth.pendingIntro = [8]; assert.deepStrictEqual(E.generatePiece(s), { piece: [8], intro: 8 });
  assert.equal(s.growth.generation, generation + 1);
});
check('policy sanitization preserves floats, limits malformed rows, signatures include complete table', () => {
  const rules = E.sanitizeRules(E.ENDLESS_RULES); assert.deepStrictEqual(rules, E.ENDLESS_RULES);
  assert.deepStrictEqual(E.sanitizeRules(copy(rules)), rules);
  const changed = E.sanitizeRules({ ...rules, pressureTable: rules.pressureTable.map((row,i) => ({ ...row, triplePct: row.triplePct + (i ? .25 : 0) })) });
  assert.equal(changed.pressureTable[1].triplePct, 8.25); assert.notEqual(E.rulesSig(changed), E.rulesSig(rules));
  assert(!E.hasPressure(E.sanitizeRules({ ...rules, pressureVersion: 2 })));
  assert(!E.hasPressure(E.sanitizeRules({ ...rules, tripleVersion: 0 })));
  assert(!E.hasPressure(E.sanitizeRules({ ...rules, expansion: 0 })));
  const bad = [null, {}, {score:4499,triplePct:5,tripleMonoPct:50}];
  assert.deepStrictEqual(E.sanitizePressure(bad), E.PRESSURE_V1);
  const repaired = E.sanitizePressure([{score:4500,triplePct:5.25,tripleMonoPct:49.5},
    {score:4500,triplePct:8,tripleMonoPct:30}, {score:10000,triplePct:2,tripleMonoPct:30},
    {score:15000,triplePct:8,tripleMonoPct:60}, {score:25000,triplePct:999,tripleMonoPct:-99}]);
  assert.deepStrictEqual(repaired, [{score:4500,triplePct:5.25,tripleMonoPct:49.5},{score:25000,triplePct:100,tripleMonoPct:0}]);
  for (const table of [undefined, [], [{score:10000,triplePct:101,tripleMonoPct:30}], [E.PRESSURE_V1[1],E.PRESSURE_V1[0]]]) {
    const invalid = fixture(); invalid.rules.pressureTable = table; assert(!E.validFeatureState(invalid));
  }
});
check('score crossing preserves published queue/HOLD; generation uses the new actual score', () => {
  for (const threshold of [10000,15000,25000]) {
    const s = fixture(threshold - 1); s.bottles[0] = [0,0,0]; s.piece = [0]; s.growth.pieceIntro = -1;
    s.hold = { piece: [1,2,2], intro: -1, flipped: false };
    const before = copy(s); assert(E.applyPlace(s, 0)); assert.equal(s.score, threshold + 99);
    assert.deepStrictEqual(s.piece, before.growth.queue[0].piece);
    assert.deepStrictEqual(s.growth.queue[0], before.growth.queue[1]); assert.deepStrictEqual(s.hold, before.hold);
    const generator = copy(s); generator.growth.generation = before.growth.generation;
    assert.deepStrictEqual(s.growth.queue[1], E.generatePiece(generator));
    assert.equal(s.growth.generation, before.growth.generation + 1);
  }
});
check('save/reload and undo snapshots replay same hold/place generation at thresholds', () => {
  for (const score of [9999,10001,14999,15001,24999,25001]) for (const preview of [0,1,2,3]) {
    const s = fixture(score, { preview }), before = copy(s);
    const replay = target => { assert(E.applyHold(target)); assert(E.applyPlace(target, 0)); assert(E.applyHold(target)); };
    replay(s); const saved = copy(before); replay(saved); assert.deepStrictEqual(saved, s);
    const undo = copy(before); replay(undo); assert.deepStrictEqual(undo, s);
    assert(E.validFeatureState(s));
  }
});
check('query/solver clones and failed/ended input do not advance player state', () => {
  const s = fixture(18000), before = copy(s), c = clone(s);
  E.pressureAt(c); E.nextPressure(c); E.applyHold(c); E.applyPlace(c, 0);
  assert.deepStrictEqual(s, before);
  assert(!E.applyPlace(s, -1)); assert(!E.applyPour(s, 0, 0)); assert.deepStrictEqual(s, before);
  s.over = true; const ended = copy(s); assert(!E.applyHold(s)); assert(!E.applyPlace(s, 0)); assert.deepStrictEqual(s, ended);
});
check('fixed-seed eligible generation frequencies, mono/shape/color balance and ordinary tail', () => {
  const n = 80000, tolerances = {triple:.004,mono:.025,shape:.035,ordinaryTail:.008,color:.035};
  for (const score of [4500,7250,10000,15000,20000,25000]) {
    const counts = {one:0,two:0,triple:0,mono:0,AAB:0,ABA:0,BAA:0,colors:Array(9).fill(0)};
    const expected = E.pressureAt(fixture(score));
    for (let seed = 0; seed < 8; seed++) {
      const s = fixture(score); s.seed = 'pressure-stat-' + score + '-' + seed;
      for (let i = 0; i < n/8; i++) {
        const p = E.generatePiece(s).piece;
        if (p.length === 1) counts.one++; else if (p.length === 2) counts.two++; else {
          counts.triple++; assert(new Set(p).size <= 2); counts.colors[p.find(c => p.filter(x => x === c).length >= 2)]++;
          if (new Set(p).size === 1) counts.mono++;
          else counts[p[0] === p[1] ? 'AAB' : p[0] === p[2] ? 'ABA' : 'BAA']++;
        }
      }
    }
    assert(Math.abs(counts.triple/n - expected.triplePct/100) < tolerances.triple);
    assert(Math.abs(counts.mono/counts.triple - expected.tripleMonoPct/100) < tolerances.mono);
    assert(Math.abs(counts.two/(counts.one+counts.two) - .9) < tolerances.ordinaryTail);
    for (const shape of ['AAB','ABA','BAA']) assert(Math.abs(counts[shape]/(counts.triple-counts.mono)-1/3) < tolerances.shape);
    for (const count of counts.colors) assert(Math.abs(count/counts.triple-1/9) < tolerances.color);
    statistics.push({score,n,seeds:8,eligibleOnly:true,introductions:0,expected,counts,tolerances});
  }
});
write('engine-test.json', { ...metadata(), passed: checks.length, checks, statistics,
  baselineSource: 'outputs/late-pressure/before-source.html', statisticalSamples: statistics.reduce((n,s) => n+s.n,0) });
console.log(checks.length + ' groups passed; ' + statistics.reduce((n,s) => n+s.n,0) + ' eligible samples');
