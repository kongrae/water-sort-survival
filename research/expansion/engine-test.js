const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { E, clone, run } = require('./bots');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('ok ' + name); }
const R = table => E.sanitizeRules({ ...E.EXPANDING_RULES, growthTable: table || E.SCORE_GROWTH_V1 });
const small = R([{ score: 0, colors: 4, bottles: 6 }, { score: 100, colors: 5, bottles: 7 }, { score: 200, colors: 8, bottles: 8 }]);
const fresh = (rules = small) => E.newState('endless', 'exp-test', rules);
check('fresh standard starts at 6 bottles / 4 colors and keeps a confirmed queue', () => {
  const S = fresh(R()); assert.equal(S.bottles.length, 6); assert.equal(E.activeColors(S), 4);
  assert.equal(E.previewPieces(S).length, 2); assert.equal(S.growth.generation, 3); assert.equal(S.rules.spare, false);
});
check('below / exactly / beyond threshold: successful action earns only due bottles', () => {
  for (const [score, bottles] of [[99, 6], [100, 7], [200, 8], [100000, 8]]) {
    const S = fresh(); S.score = score; S.piece = [0]; assert(E.applyPlace(S, 0)); assert.equal(S.bottles.length, bottles);
    assert.equal(E.activeColors(S), score < 100 ? 4 : 5); assert.equal(S.score, score);
  }
});
check('clear by placement earns a full normal bottle before stuck checking', () => {
  const S = fresh(); const previews = E.previewPieces(S);
  S.bottles[0] = [0, 0, 0]; S.piece = [0]; assert(E.applyPlace(S, 0));
  assert.equal(S.score, 100); assert.equal(S.bottles.length, 7); assert.equal(E.activeColors(S), 5); assert(!S.over);
  assert.deepEqual(S.piece, previews[0].piece); assert.deepEqual(E.previewPieces(S)[0], previews[1]);
  assert.equal(E.previewPieces(S)[1].intro, 4); assert.deepEqual(E.previewPieces(S)[1].piece, [4]);
});
check('clear by pouring unlocks immediately, but color activation waits for placement', () => {
  const S = fresh(), current = S.piece.slice(), queue = E.previewPieces(S), gen = S.growth.generation;
  S.bottles[0] = [0]; S.bottles[1] = [0, 0, 0]; assert(E.applyPour(S, 0, 1));
  assert.equal(S.score, 100); assert.equal(S.bottles.length, 7); assert.equal(E.activeColors(S), 4);
  assert.deepEqual(S.piece, current); assert.deepEqual(E.previewPieces(S), queue); assert.equal(S.growth.generation, gen);
  assert(E.applyPlace(S, 6)); assert.equal(E.activeColors(S), 5);
});
check('crossing several thresholds pays all bottles and admits only one color per placement', () => {
  const S = fresh(); S.streak = 4; S.turnClears = 1; S.bottles[0] = [0]; S.bottles[1] = [0, 0, 0];
  assert(E.applyPour(S, 0, 1)); assert.equal(S.score, 400); assert.equal(S.bottles.length, 8);
  assert.equal(E.activeColors(S), 4); assert.equal(S.growth.log.filter(x => x.kind === 'bottle').length, 2);
  for (let i = 5; i <= 8; i++) { S.piece = [0]; assert(E.applyPlace(S, 2)); assert.equal(E.activeColors(S), i); }
  assert.equal(S.bottles.length, 8);
});
check('earned bottle prevents a full-board loss in the same placement', () => {
  const S = fresh(); S.score = 100; S.bottles = [[0,1,0,1], [1,0,1,0], [2,3,2,3], [3,2,3,2], [0,2,1,3], [1,3,2]]; S.piece = [0];
  assert(E.applyPlace(S, 5)); assert.equal(S.bottles.length, 7); assert(!S.over); assert.deepEqual(S.bottles[6], []);
});
check('failed and ended actions never consume generation or pay progression', () => {
  const S = fresh(); S.score = 200; S.bottles[0] = [0,1,0,1];
  const before = JSON.stringify(S); assert.equal(E.applyPlace(S, 0), false); assert.equal(E.applyPour(S, 2, 3), false); assert.equal(JSON.stringify(S), before);
  S.over = true; const ended = JSON.stringify(S); assert.equal(E.applyPlace(S, 1), false); assert.equal(E.applyPour(S, 0, 1), false); assert.equal(JSON.stringify(S), ended);
});
check('new bottles accept pours, reversed pieces and normal completion scoring', () => {
  const S = fresh(); S.score = 200; S.piece = [0]; E.applyPlace(S, 0);
  S.piece = [1,2]; assert(E.applyFlip(S)); assert(E.applyPlace(S, 7)); assert.deepEqual(S.bottles[7], [2,1]);
  S.bottles[6] = [1,1,1]; assert(E.applyPour(S, 7, 6)); assert.deepEqual(S.bottles[6], []); assert.deepEqual(S.bottles[7], [2]); assert(S.clears > 0);
});
check('zone settlement uses pre-unlock empties and cannot create a recursive unlock bonus', () => {
  const S = fresh(); S.turn = 19; S.score = 0; S.piece = [0];
  E.applyPlace(S, 0); assert.equal(S.zoneLog[0].empties, 5); assert.equal(S.zoneLog[0].bonus, 200); assert.equal(S.score, 200); assert.equal(S.bottles.length, 8);
  assert.equal(S.zoneBonusTotal, 200); assert.equal(S.zoneLog.length, 1);
});
check('preview and cloned search actions do not mutate the live state', () => {
  const S = fresh(); S.bottles[0] = [0]; const before = JSON.stringify(S);
  E.previewPlace(S, 0); E.previewPour(S, 0, 1); const previews = E.previewPieces(S); previews[0].piece.push(8);
  const C = clone(S); C.score = 200; E.applyPlace(C, 0); assert.equal(JSON.stringify(S), before);
});
check('save / restoration replays identical state and undoes expansion without duplicate history', () => {
  const S = fresh(); S.bottles[0] = [0,0,0]; S.piece = [0]; const before = JSON.stringify(S);
  E.applyPlace(S, 0); const once = JSON.stringify(S); const restored = JSON.parse(once); const live = clone(S);
  E.applyPlace(restored, 6); E.applyPlace(live, 6); assert.deepEqual(restored, live);
  const undone = JSON.parse(before); E.applyPlace(undone, 0); assert.equal(JSON.stringify(undone), once);
});
check('growth profile and queue policy signatures stay fixed through unlocks and isolate records', () => {
  const S = fresh(), sig = E.rulesSig(S.rules); S.score = 200; E.applyPlace(S, 0); assert.equal(E.rulesSig(S.rules), sig);
  assert.notEqual(sig, E.rulesSig(E.DEFAULT_RULES)); assert.notEqual(sig, E.rulesSig(R()));
  assert.notEqual(sig, E.rulesSig({ ...small, preview: 0 }));
});
check('preview counts 0..3 restore and remain consistent across color admissions', () => {
  for (let count = 0; count <= 3; count++) {
    const S = fresh(E.sanitizeRules({ ...small, preview: count })); S.score = 200;
    for (let i = 0; i < 4; i++) { S.piece = [0]; assert(E.applyPlace(S, i)); assert.equal(E.previewPieces(S).length, count); }
    const C = JSON.parse(JSON.stringify(S)); E.applyPlace(S, 7); E.applyPlace(C, 7); assert.deepEqual(S, C);
  }
});
check('table sanitization clamps colors/bottles and discards invalid or decreasing thresholds', () => {
  const r = R([{ score: 0, colors: 4, bottles: 6 }, { score: 100, colors: 100, bottles: 100 }, { score: -1, colors: 4, bottles: 6 }, { score: 'oops', colors: 7, bottles: 7 }]);
  assert.deepEqual(r.growthTable, [{ score: 0, colors: 4, bottles: 6 }, { score: 100, colors: 9, bottles: 8 }]);
});
check('tail weighting starts at the color cap and participates in the record signature', () => {
  const signatures = [];
  for (const pct of [0, 100]) {
    const rules = E.sanitizeRules({ ...R(), zoneTwin: false, tailDoublePct: pct }), S = fresh(rules);
    signatures.push(E.rulesSig(rules)); S.score = 100000;
    for (let i = 0; i < 12; i++) { S.piece = [0]; assert(E.applyPlace(S, i % 8)); }
    assert.equal(E.activeColors(S), 9);
    assert(E.previewPieces(S).every(q => q.piece.length === (pct === 0 ? 1 : 2)));
  }
  assert.notEqual(signatures[0], signatures[1]);
});
check('v1, v2 and daily transitions/signatures match the source at the baseline commit', () => {
  const html = execFileSync('git', ['show', '5d7afe2:water-sort-survival.html'], { encoding: 'utf8' });
  const old = new Function(html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1] + ';return {DEFAULT_RULES,V1_RULES,newState,applyPlace,applyPour,rulesSig,pieceAt};')();
  for (const rules of [E.DEFAULT_RULES, E.V1_RULES]) for (let i = 0; i < 20; i++) {
    const seed = 'legacy-equivalence-' + i, A = old.newState('daily', seed, rules), B = E.newState('daily', seed, rules);
    assert.equal(E.rulesSig(rules), old.rulesSig(rules));
    for (let t = 0; t < 40 && !A.over; t++) {
      for (let s = 0; s < A.bottles.length; s++) for (let d = 0; d < A.bottles.length; d++) { old.applyPour(A, s, d); E.applyPour(B, s, d); }
      const target = A.bottles.findIndex(b => rules.cap - b.length >= A.piece.length);
      if (target < 0) break; old.applyPlace(A, target); E.applyPlace(B, target); assert.deepEqual(B, A);
    }
  }
});
check('same seed and policy reproduces expansion state, with colors capped after large scores', () => {
  const rules = R(); const A = run(rules, 'replay', 80, 1), B = run(rules, 'replay', 80, 1);
  // Wall-clock instrumentation varies between runs; all state and deterministic metrics must match.
  for (const result of [A, B]) {
    assert.ok(Number.isFinite(result.metrics.elapsedMs) && result.metrics.elapsedMs >= 0);
    delete result.metrics.elapsedMs;
  }
  assert.deepEqual(A, B);
  const S = fresh(); S.score = 100000;
  for (let i = 0; i < 12; i++) { S.piece = [0]; E.applyPlace(S, i % 8); }
  assert.equal(E.activeColors(S), 8); assert.equal(S.bottles.length, 8);
});
console.log(`expansion engine: ${checks} groups passed`);
