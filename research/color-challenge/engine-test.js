const assert = require('assert');
const { E } = require('../../harness'), { clone, run } = require('../expansion/bots');
const { baselineEngine, write, metadata } = require('./common');
const old = baselineEngine(), checks = [], timings = [], proofs = [];
const copy = value => JSON.parse(JSON.stringify(value));
function check(name, fn) { fn(); checks.push(name); console.log('ok ' + name); }
function fixture(score = 10000, patch = {}) {
  const s = E.newState('endless', 'color-contract', E.sanitizeRules({ ...E.ENDLESS_RULES, ...patch }));
  s.score = score; s.bottles = [[0,0,0],[0,0,0],[],[],[],[],[],[]]; s.growth.activeColors = 9;
  s.piece = [0]; s.growth.pieceIntro = -1; s.growth.pendingIntro = [];
  s.growth.queue = Array.from({length:s.rules.preview}, (_,i) => ({piece:[i ? 1 : 0],intro:-1}));
  return s;
}
function start(s) { E.updateColorChallenge(s, {}, false); assert(s.challenge.active); return s; }
function replay(s, plan) {
  let clears = 0; const sequence = [];
  const h = {clear:(i,c) => { sequence.push(c); if(c === plan.color) clears++; }};
  for(const action of plan.path) {
    const ok = action.kind === 'place' ? E.applyPlace(s, ...action.args, h) : action.kind === 'pour' ? E.applyPour(s, ...action.args, h) : action.kind === 'hold' ? E.applyHold(s) : E.applyFlip(s);
    assert(ok, 'illegal witness action ' + JSON.stringify(action));
  }
  assert(clears >= plan.goal, 'witness did not complete target');
  if(s.rules.challengeFirst)assert(sequence.slice(0,plan.goal).every(c=>c===plan.color),'witness cleared another color first');
  return clears;
}
check('all existing rule contracts, signatures and streams retain their exact semantics', () => {
  for(const rules of [old.DEFAULT_RULES,old.V1_RULES,old.EXPANDING_RULES,old.LEGACY_ENDLESS_RULES,old.ENDLESS_RULES]) {
    const r = E.sanitizeRules(rules); assert.deepStrictEqual(r, old.sanitizeRules(rules));
    assert.equal(E.rulesSig(r), old.rulesSig(r)); assert(!E.hasColorChallenge(r));
    const a = old.newState('endless','legacy-color',r), b = E.newState('endless','legacy-color',r);
    assert.deepStrictEqual(a,b);
    if(a.growth) for(let i=0;i<1000;i++) assert.deepStrictEqual(E.generatePiece(b),old.generatePiece(a));
  }
  assert.deepStrictEqual(E.PRESSURE_ENDLESS_RULES, old.ENDLESS_RULES);
});
check('versioned defaults, sanitization and every scoring field separate records', () => {
  const r = E.sanitizeRules(E.ENDLESS_RULES); assert.deepStrictEqual(r,E.ENDLESS_RULES);
  for(const key of ['challengeFrom','challengeEvery','challengeTurns','challengeBonus','challengeMaxGoal']) {
    const value = key === 'challengeBonus' ? 100 : key === 'challengeMaxGoal' ? 1 : r[key]+1;
    assert.notEqual(E.rulesSig(E.sanitizeRules({...r,[key]:value})),E.rulesSig(r));
  }
  assert(!E.hasColorChallenge(E.sanitizeRules({...r,colorChallengeVersion:2})));
  assert(!E.hasColorChallenge(E.sanitizeRules({...r,expansion:0})));
  assert.equal(E.sanitizeRules({...r,challengeBonus:999}).challengeBonus,150);
  assert.notEqual(E.rulesSig(E.sanitizeRules({...r,challengeFirst:false})),E.rulesSig(r));
  assert(E.validFeatureState(E.newState('endless','fresh',r)));
});
check('10k, actual growth and terminal gates; first threshold-crossing clear is not retroactive', () => {
  const s = fixture(9999); E.updateColorChallenge(s,{},false); assert(!s.challenge.active);
  assert(E.applyPlace(s,0)); assert.equal(s.score,10099); assert.equal(s.challenge.active.progress,0);
  assert.equal(s.challenge.active.goal,1); assert.equal(s.challenge.active.startTurn,1);
  const pending = fixture(); pending.growth.activeColors = 8; E.updateColorChallenge(pending,{},false); assert(!pending.challenge.active);
  const over = fixture(); over.over = true; E.updateColorChallenge(over,{},false); assert(!over.challenge.active);
});
check('visible-only witness is deterministic, non-mutating and replayable for 1/2 bottles', () => {
  const s = fixture(), before = copy(s), p = E.colorChallengePlan(s);
  assert.equal(p.goal,2); assert.deepStrictEqual(s,before); assert.deepStrictEqual(p,E.colorChallengePlan(s));
  for(let i=0;i<10;i++) { const c = copy(s); c.seed = 'unseen-'+i; c.growth.generation += i*91; replay(c,p); }
  const one = fixture(); one.bottles[1] = []; const q = E.colorChallengePlan(one); assert.equal(q.goal,1); replay(one,q);
  const none = fixture(); none.bottles = Array.from({length:8},()=>[]); none.piece = [0]; none.growth.queue = [{piece:[1],intro:-1},{piece:[2],intro:-1}];
  assert.equal(E.colorChallengePlan(none),null); E.updateColorChallenge(none,{},true); assert(!none.challenge.active);
});
check('no-material pending goal retries on the next turn without rerolling each pour', () => {
  const s = fixture(); s.bottles = Array.from({length:8},()=>[]); s.piece=[2];s.growth.queue=[{piece:[3],intro:-1},{piece:[4],intro:-1}];
  E.updateColorChallenge(s,{},false); assert(!s.challenge.active);
  s.bottles[0]=[0,0,0];s.bottles[1]=[0];E.updateColorChallenge(s,{},false);assert(!s.challenge.active);
  assert(E.applyPlace(s,2));assert(s.challenge.active);
});
check('progress counts only target clears, reward is paid once and skipped milestones do not pile up', () => {
  const s = start(fixture()); assert.equal(s.challenge.active.goal,2);
  const p = E.colorChallengePlan(s); const before = copy(s), events=[];
  const h={challenge:(status,a)=>events.push({status,...a})};
  for(const action of p.path) assert(E.applyPlace(s,...action.args,h));
  assert.equal(s.challenge.completed,1);assert.equal(s.challenge.bonusTotal,300);assert.equal(s.score,10600);
  assert.equal(events.filter(e=>e.status==='complete').length,1);assert(!s.challenge.active);
  assert.equal(s.challenge.nextScore,15000); assert(E.validFeatureState(s));
  const restored=copy(before);replay(restored,p);assert.deepStrictEqual(s,restored);
  const leap=fixture(80000);E.updateColorChallenge(leap,{},false);assert.equal(leap.challenge.nextScore,85000);
  replay(leap,E.colorChallengePlan(leap));assert.equal(leap.challenge.completed,1);assert(!leap.challenge.active);
});
check('pour/HOLD/flip do not spend placements, and failed input is completely inert', () => {
  const s=start(fixture());s.piece=[0,1];s.growth.queue[0].piece=[1,0];const turn=s.turn;
  assert(E.applyHold(s));assert(E.applyFlip(s));assert.equal(s.turn,turn);assert.equal(s.challenge.active.progress,0);
  s.bottles[2]=[2]; assert(E.applyPour(s,2,3));assert.equal(s.turn,turn);
  const before=copy(s);assert(!E.applyPlace(s,-1));assert(!E.applyPour(s,0,0));assert(!E.applyHold(s));assert.deepStrictEqual(s,before);
});
check('twelfth placement can complete the goal; missed goals award no penalty or rescue', () => {
  for(const success of [false,true]) {
    const s=start(fixture());s.challenge.active.goal=1;
    for(let i=0;i<12;i++) {s.piece=[success&&i===11?0:1];s.growth.pieceIntro=-1;assert(E.applyPlace(s,success&&i===11?0:2+i%6));}
    assert.equal(s.turn,12);assert(!s.over);assert(!s.challenge.active);
    assert.equal(s.challenge.completed,+success);assert.equal(s.challenge.missed,+!success);
    assert.equal(s.challenge.bonusTotal,success?150:0);assert.equal(s.challenge.lastResult.status,success?'complete':'missed');
    assert(E.validFeatureState(s));
  }
});
check('other-color-first ends only the goal; normal clear/combo/board semantics are preserved', () => {
  const s=start(fixture());s.bottles[2]=[1,1,1];s.piece=[1];const before=copy(s);
  const baseline=copy(before);baseline.rules=E.sanitizeRules(E.PRESSURE_ENDLESS_RULES);delete baseline.challenge;
  assert(E.applyPlace(s,2));assert(E.applyPlace(baseline,2));
  assert.equal(s.challenge.lastResult.reason,'other-color');assert.equal(s.challenge.missed,1);assert.equal(s.challenge.bonusTotal,0);
  const projected=copy(s);delete projected.challenge;projected.rules=baseline.rules;assert.deepStrictEqual(projected,baseline);
  assert(!s.over);assert(E.validFeatureState(s));
});
check('active/progress/completed save snapshots and bot candidate clones never share goal state', () => {
  const s=start(fixture());assert(E.applyPlace(s,0));assert.equal(s.challenge.active.progress,1);assert(E.validFeatureState(copy(s)));
  const before=copy(s), candidate=clone(s);assert(E.applyPlace(candidate,1));assert.deepStrictEqual(s,before);
  const saved=copy(s);assert(E.applyPlace(s,1));assert(E.applyPlace(saved,1));assert.deepStrictEqual(s,saved);
  const undo=copy(before);assert(E.applyPlace(undo,1));assert.deepStrictEqual(undo,s);
});
check('malformed feature saves are rejected, preserving the existing recovery path', () => {
  const damages=[s=>delete s.challenge,s=>s.challenge=null,s=>s.challenge.active.color=99,
    s=>s.challenge.active.goal=0,s=>s.challenge.active.progress=2,s=>s.challenge.active.startTurn=99,
    s=>s.challenge.nextScore=10001,s=>s.challenge.checkedTurn=99,s=>s.challenge.completed=1,
    s=>s.challenge.bonusTotal=999,s=>s.rules.challengeBonus=999,s=>s.rules.challengeTurns=1];
  for(const damage of damages){const s=start(fixture());damage(s);assert(!E.validFeatureState(s));}
  const s=start(fixture());replay(s,E.colorChallengePlan(s));s.challenge.lastResult.reward=999;assert(!E.validFeatureState(s));
});
check('400 bounded board searches replay their witnesses with different unseen streams', () => {
  let random=713;const rnd=n=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random%n;};
  for(let i=0;i<400;i++) {
    const s=fixture(10000+i*3);s.seed='color-proof-'+i;
    s.bottles=Array.from({length:8},()=>Array.from({length:rnd(4)},()=>rnd(9)));
    s.piece=Array.from({length:1+rnd(2)},()=>rnd(9));
    s.growth.queue=Array.from({length:2},()=>({piece:Array.from({length:1+rnd(2)},()=>rnd(9)),intro:-1}));
    if(i%3===0)s.hold={piece:[rnd(9),rnd(9)],intro:-1,flipped:false};
    s.holdUsed=i%5===0&&!!s.hold;
    const before=JSON.stringify(s),t=performance.now(),p=E.colorChallengePlan(s);timings.push(performance.now()-t);
    assert.equal(JSON.stringify(s),before);
    if(!p)continue;assert(p.examined<=768);proofs.push({seed:s.seed,color:p.color,goal:p.goal,actions:p.path.length,examined:p.examined});
    for(let hidden=0;hidden<3;hidden++){const c=copy(s);c.seed+='-hidden-'+hidden;c.growth.generation+=hidden*31;replay(c,p);}
  }
  assert(proofs.length>40);assert(proofs.some(p=>p.actions>1));
});
check('zero-reward observer keeps the baseline bot action sequence/stream/score exact', () => {
  for(let i=0;i<4;i++) {
    const seed='color-observer-'+i,baseline=run(E.sanitizeRules(E.PRESSURE_ENDLESS_RULES),seed,220,2,true);
    const current=run(E.sanitizeRules({...E.ENDLESS_RULES,challengeBonus:0}),seed,220,2,true);
    assert.deepStrictEqual(current.actions,baseline.actions);const state=copy(current.state);delete state.challenge;state.rules=baseline.state.rules;
    assert.deepStrictEqual(state,baseline.state);
  }
});
check('witnesses respect custom placement windows, pour budgets, auto-merge, previews and held flip charges', () => {
  for(const preview of [0,1,2,3])for(const pourLimit of [0,1,2])for(const autoMerge of [false,true]) {
    const s=fixture(10000,{preview,pourLimit,autoMerge,challengeTurns:4});
    s.bottles=[[0,0,1],[0,0,1],[0,0],[1],[],[],[],[]];s.piece=[0,0];
    s.hold={piece:[1,0],intro:-1,flipped:true};s.flipsPlaced=0;
    const p=E.colorChallengePlan(s);if(!p)continue;
    s.challenge.active={color:p.color,goal:p.goal,progress:0,startTurn:s.turn,milestone:10000};s.challenge.nextScore=15000;s.challenge.checkedTurn=s.turn;
    replay(s,p);assert.equal(s.challenge.completed,1);assert.equal(s.challenge.missed,0);assert(s.turn<=4);assert(E.validFeatureState(s));
  }
});
timings.sort((a,b)=>a-b);const q=p=>timings[Math.min(timings.length-1,Math.floor(p*timings.length))];
write('engine-test.json',{...metadata(),passed:checks.length,checks,proofs,randomCases:400,witnessReplays:proofs.length*3,
  plannerMs:{p50:q(.5),p90:q(.9),p99:q(.99),max:timings.at(-1)},humanFunValidated:false});
console.log(checks.length+' groups passed; '+proofs.length+' witnesses / '+proofs.length*3+' replays; planner p90 '+q(.9).toFixed(2)+'ms');
