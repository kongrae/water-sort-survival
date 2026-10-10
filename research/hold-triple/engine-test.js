// node research/hold-triple/engine-test.js
const assert = require('assert');
const fs = require('fs');
const cp = require('child_process');
const { E } = require('../../harness');
const clone = s => JSON.parse(JSON.stringify(s));
let groups = 0;
function check(name, fn) { fn(); groups++; console.log('ok ' + name); }
// These contracts exercise the fixed 5/10% policy; the versioned pressure curve has its own suite.
const rules = patch => E.sanitizeRules({ ...E.LEGACY_ENDLESS_RULES, ...patch });
function fixture(patch, n = 7) {
  const s = E.newState('endless', 'hold-contract', rules(patch));
  s.score = n === 8 ? 4500 : 900; E.updateGrowth(s, false);
  s.growth.activeColors = n === 8 ? 9 : 6;
  return s;
}
check('old flags stay absent, new defaults sanitize, fixed custom rules drop features', () => {
  const old = E.sanitizeRules(E.EXPANDING_RULES);
  assert(!E.hasHold(old) && !E.hasTriple(old));
  assert.deepStrictEqual(rules(), E.LEGACY_ENDLESS_RULES);
  assert.deepStrictEqual(E.sanitizeRules(E.ENDLESS_RULES), E.ENDLESS_RULES);
  assert(!E.hasHold(E.sanitizeRules({ ...E.ENDLESS_RULES, expansion: 0 })));
  assert(!E.hasTriple(rules({ pieceMax: 4 })));
  const s = E.newState('endless', 'six', rules()), before = clone(s);
  assert(!E.canHold(s) && !E.applyHold(s)); assert.deepStrictEqual(s, before);
  assert(E.canHold(fixture()));
});
check('empty hold consumes exactly one queue entry; swaps never generate; previews 0..3', () => {
  for (let preview = 0; preview <= 3; preview++) {
    const s = fixture({ preview }), before = clone(s), candidate = E.holdCandidate(s);
    assert.deepStrictEqual(s, before);
    assert(E.applyHold(s)); assert.deepStrictEqual(s.piece, candidate.piece);
    assert.deepStrictEqual(s.hold, { piece: before.piece, intro: before.growth.pieceIntro, flipped: false });
    assert.equal(s.growth.generation, before.growth.generation + 1);
    assert.equal(s.growth.queue.length, preview);
    if (preview > 1) assert.deepStrictEqual(s.growth.queue.slice(0, preview - 1), before.growth.queue.slice(1));
    const held = clone(s); assert(!E.applyHold(s)); assert.deepStrictEqual(s, held);
    assert(E.applyPlace(s, 0)); assert(!s.holdUsed);
    const swapped = clone(s); assert(E.applyHold(s));
    assert.deepStrictEqual(s.piece, swapped.hold.piece);
    assert.deepStrictEqual(s.growth.queue, swapped.growth.queue);
    assert.equal(s.growth.generation, swapped.growth.generation);
    assert.notStrictEqual(s.piece, swapped.hold.piece);
  }
});
check('hold does not change score, turn, pours, combo, growth or logs; failures are atomic', () => {
  const s = fixture({ pourLimit: 2 }); s.pours = 1; s.streak = 3; s.turnClears = 1;
  const fields = ['score','turn','pours','streak','turnClears','clears','comboPts','turnLog','zoneLog','flipsPlaced','undoLeft','undoUsed'];
  const before = clone(s); assert(E.applyHold(s));
  for (const k of fields) assert.deepStrictEqual(s[k], before[k], k);
  for (const k of ['activeColors','log']) assert.deepStrictEqual(s.growth[k], before.growth[k]);
  s.bottles[0] = [0]; s.bottles[1] = [];
  assert(E.applyPour(s, 0, 1)); assert(s.holdUsed);
  const failed = clone(s); assert(!E.applyPlace(s, -1)); assert.deepStrictEqual(s, failed);
  E.applyFlip(s); assert(s.holdUsed);
  s.over = true; const ended = clone(s); assert(!E.applyHold(s)); assert.deepStrictEqual(s, ended);
});
check('introduction metadata and visible orientation travel with the held piece', () => {
  const s = fixture(); s.piece = [5]; s.growth.pieceIntro = 5;
  E.applyHold(s); assert.equal(s.hold.intro, 5);
  E.applyPlace(s, 0); const pending = s.growth.pendingIntro.slice();
  E.applyHold(s); assert.deepStrictEqual(s.piece, [5]); assert.equal(s.growth.pieceIntro, 5);
  assert.deepStrictEqual(s.growth.pendingIntro, pending);
  const candidates = E.previewPieces(s); if (candidates.length) candidates[0].piece[0] = 100;
  assert(!s.growth.queue.some(q => q.piece.includes(100)));
});
check('flip reservations cannot exceed the placement-charged budget', () => {
  const s = fixture(); s.piece = [0,1]; s.growth.pieceIntro = -1;
  s.growth.queue[0] = { piece: [2,3], intro: -1 };
  assert(E.applyFlip(s)); assert(E.applyHold(s)); assert.deepStrictEqual(s.hold.piece, [1,0]);
  assert(s.hold.flipped); assert.equal(E.flipsLeft(s), 1);
  assert(E.applyFlip(s)); assert(E.validFeatureState(s)); assert(E.applyPlace(s, 0));
  assert.equal(s.flipsPlaced, 1); assert.equal(E.flipsLeft(s), 0);
  s.piece = [0,2]; s.growth.pieceIntro = -1; assert(!E.applyFlip(s));
  assert(E.applyHold(s)); assert(s.flipped); assert.equal(s.flipsPlaced, 1);
  assert(E.applyPlace(s, 1)); assert.equal(s.flipsPlaced, 2); assert(E.validFeatureState(s));
  s.piece = [0,2]; assert(!E.applyFlip(s));
  const unflip = fixture(); unflip.piece = [0,1]; E.applyFlip(unflip); E.applyHold(unflip);
  E.applyPlace(unflip, 0); E.applyHold(unflip); assert(E.applyFlip(unflip)); assert(!unflip.flipped);
  const unlimited = fixture({ flipLimit: 0 }); unlimited.piece=[0,1]; E.applyFlip(unlimited);
  E.applyHold(unlimited); unlimited.piece=[2,3]; assert(E.applyFlip(unlimited)); assert.equal(E.flipsLeft(unlimited), Infinity);
});
check('only a successful placement restores hold before the next stuck check; revive does not', () => {
  const s = fixture(); E.applyHold(s); s.piece = [1]; s.bottles[0] = [];
  assert(E.applyPlace(s, 0)); assert(!s.holdUsed);
  s.holdUsed = true; s.over = true; E.applyRevive(s); assert(s.holdUsed);
  assert(E.canHold(fixture()) && !E.canHold(E.newState('daily','daily:2026-10-09', E.DEFAULT_RULES)));
});
check('hold-only survival, unavailable hold and empty next-preview survival are distinguished', () => {
  for (const preview of [0,2]) {
    const s = fixture({ preview }, 8);
    s.bottles = Array.from({length:8}, (_,i) => [8,8,i]); s.piece=[0,1,1];
    s.hold={piece:[1],intro:-1,flipped:false}; E.checkStuck(s);
    assert(!s.over); assert.equal(s.stuck,'hold');
    const locked=clone(s); locked.holdUsed=true; E.checkStuck(locked); assert(locked.over);
    assert(E.applyHold(s)); assert(!s.over); assert(E.applyPlace(s,1));
    const empty=fixture({preview},8); empty.bottles=Array.from({length:8},(_,i)=>[8,8,i]);
    empty.piece=[0,1,1]; empty.hold=null;
    if(preview) empty.growth.queue[0]={piece:[1],intro:-1};
    else {
      for(let i=0;i<1000;i++){empty.growth.generation=i;if(E.holdCandidate(empty).piece.length===1)break;}
    }
    const before=clone(empty); E.checkStuck(empty);
    assert(!empty.over && empty.stuck==='hold'); assert.equal(empty.growth.generation,before.growth.generation);
  }
});
check('bounded room searches stay unknown, and a held alternative can require pouring', () => {
  const s=fixture({},8);
  s.bottles=[[0,1,2],[1,2,3],[2,3,0],[3,0,1],[0,2,1],[1,3,2],[2,0,3],[3,1,0]];
  s.piece=[0,1,1];s.hold={piece:[1,2,2],intro:-1,flipped:false};
  const before=clone(s);E.checkStuck(s,1);
  assert(!s.over);assert.equal(s.stuck,'unknown-hold');
  assert.deepStrictEqual(s.growth,before.growth);
  const pour=fixture({},8); pour.bottles=[[0,1,2],[1,1,2],...Array.from({length:6},(_,i)=>[8,8,i+3])];
  pour.piece=[0,1,1];pour.hold={piece:[1,1],intro:-1,flipped:false};
  assert(E.canMakeRoom(pour.bottles,2,pour.rules,Infinity));
  E.checkStuck(pour);assert(!pour.over);assert(E.applyHold(pour));assert(E.applyPour(pour,0,1));
  assert(E.applyPlace(pour,0));
});
check('triple gate, intro exceptions and committed queue do not rewrite revealed pieces', () => {
  const s=fixture({triplePct:100},7);
  for(let i=0;i<1000;i++)assert(E.generatePiece(s).piece.length<=2);
  const revealed=clone(s.growth.queue), current=s.piece.slice();s.score=2800;E.updateGrowth(s,false);
  assert.equal(s.bottles.length,8);assert.deepStrictEqual(s.growth.queue,revealed);assert.deepStrictEqual(s.piece,current);
  s.growth.pendingIntro.push(5);assert.deepStrictEqual(E.generatePiece(s),{piece:[5],intro:5});
  for(let i=0;i<1000;i++){const p=E.generatePiece(s).piece;assert.equal(p.length,3);assert(new Set(p).size<=2);assert(p.every(c=>c<s.growth.activeColors));}
  assert(!E.canFlip({...s,piece:[1,1,1]}));assert(!E.canFlip({...s,piece:[1,2,1]}));
});
check('triple statistics and remaining tail distribution match the fixed-seed hypothesis', () => {
  const distributions=[];
  for(const pct of [5,10]){
    const s=fixture({triplePct:pct},8), counts={one:0,two:0,triple:0,mono:0,AAB:0,ABA:0,BAA:0}, n=50000;
    for(let i=0;i<n;i++){
      const p=E.generatePiece(s).piece;
      if(p.length===1)counts.one++;else if(p.length===2)counts.two++;else{
        counts.triple++;if(new Set(p).size===1)counts.mono++;
        else counts[p[0]===p[1]?'AAB':p[0]===p[2]?'ABA':'BAA']++;
      }
    }
    assert(Math.abs(counts.triple/n-pct/100)<.006);
    assert(Math.abs(counts.mono/counts.triple-.5)<.04);
    assert(Math.abs(counts.two/(counts.one+counts.two)-.9)<.015);
    for(const shape of ['AAB','ABA','BAA'])assert(Math.abs(counts[shape]/(counts.triple-counts.mono)-1/3)<.05);
    distributions.push({pct,n,counts});
  }
  fs.writeFileSync(__dirname+'/out/distribution.json',JSON.stringify(distributions,null,2));
});
check('no triple branch leaves every ordinary generated piece unchanged', () => {
  const s=fixture({triplePct:0},8), old=E.newState('endless',s.seed,E.sanitizeRules(E.EXPANDING_RULES));
  old.bottles=clone(s.bottles);old.growth=clone(s.growth);
  for(let i=0;i<1000;i++)assert.deepStrictEqual(E.generatePiece(s),E.generatePiece(old));
});
check('three scattered free cells cannot accept a triple, while a contiguous slot can clear', () => {
  const s=fixture({},8);s.piece=[1,1,1];s.growth.pieceIntro=-1;
  s.bottles=Array.from({length:8},(_,i)=>[8,8,i]);s.holdUsed=true;
  const before=clone(s);assert(!E.applyPlace(s,0));assert.deepStrictEqual(s,before);
  s.bottles[0]=[1];assert(E.applyPlace(s,0));assert.equal(s.clears,1);assert.deepStrictEqual(s.bottles[0],[]);
});
check('feature state restoration is strict; corrupt holds/queues/budgets are rejected', () => {
  const s=fixture();assert(E.validFeatureState(s));E.applyHold(s);assert(E.validFeatureState(clone(s)));
  for(const damage of [
    c=>{c.hold.piece=[1,2,3];},c=>{c.hold.intro=99;},c=>{c.hold.flipped='true';},
    c=>{delete c.holdUsed;},c=>{c.growth.queue=[];},c=>{c.growth.generation=-1;},
    c=>{delete c.bottles;},c=>{c.bottles[0]=[99];},c=>{c.growth.pieceIntro=5;},
    c=>{c.growth.log=null;},c=>{c.score=Infinity;},c=>{c.hold=null;},
    c=>{c.flipsPlaced=2;c.hold.flipped=true;},
  ]){const c=clone(s);damage(c);assert(!E.validFeatureState(c));}
  const legacy=E.newState('endless','old',E.EXPANDING_RULES);assert(E.validFeatureState(legacy));
});
check('save and undo snapshots replay hold/flip/place/pour exactly without duplicate growth', () => {
  const s=fixture({},8), before=clone(s);s.piece=[0,1];s.growth.pieceIntro=-1;
  const restored=clone(s);
  function actions(c){E.applyFlip(c);E.applyHold(c);E.applyPlace(c,0);E.applyHold(c);E.applyPlace(c,1);E.applyPour(c,0,2);}
  actions(s);actions(restored);assert.deepStrictEqual(s,restored);
  const undo=clone(before), repeat=clone(before);E.applyHold(undo);E.applyHold(repeat);
  assert.deepStrictEqual(undo,repeat);assert.equal(undo.growth.log.length,before.growth.log.length);
});
check('policy signatures isolate candidates and do not change during play', () => {
  const variants=[E.EXPANDING_RULES,rules({tripleVersion:0}),rules({holdVersion:0}),rules(),rules({triplePct:10})];
  assert.equal(new Set(variants.map(E.rulesSig)).size,variants.length);
  const s=fixture(), sig=E.rulesSig(s.rules);E.applyHold(s);E.applyPlace(s,0);assert.equal(E.rulesSig(s.rules),sig);
});
check('all historical rules and expanding transitions/signatures match the captured HEAD', () => {
  const meta=JSON.parse(fs.readFileSync(__dirname+'/baseline.json','utf8'));
  const source=cp.execFileSync('git',['show',meta.head+':water-sort-survival.html'],{encoding:'utf8',maxBuffer:2e6});
  const code=source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
  const old=new Function(code+';return {DEFAULT_RULES,V1_RULES,EXPANDING_RULES,sanitizeRules,rulesSig,newState,applyPlace,applyPour,applyFlip,canFlip,canPour,capsOf,slotsOf};')();
  for(const r0 of [old.V1_RULES,old.DEFAULT_RULES,old.EXPANDING_RULES]){
    const r=old.sanitizeRules(r0);assert.deepStrictEqual(E.sanitizeRules(r0),r);assert.equal(E.rulesSig(r),old.rulesSig(r));
    for(const mode of ['endless','daily']){
      const a=old.newState(mode,'legacy-equivalence',r),b=E.newState(mode,'legacy-equivalence',r);
      for(let turn=0;turn<150&&!a.over;turn++){
        if(old.canFlip(a)){assert.equal(E.applyFlip(b),old.applyFlip(a));}
        for(let i=0;i<a.bottles.length;i++)for(let j=0;j<a.bottles.length;j++)
          if(old.canPour(old.slotsOf(a),i,j,old.capsOf(a)))assert.equal(E.applyPour(b,i,j),old.applyPour(a,i,j));
        const target=a.bottles.findIndex(x=>r.cap-x.length>=a.piece.length);
        if(target<0)break;assert.equal(E.applyPlace(b,target),old.applyPlace(a,target));assert.deepStrictEqual(b,a);
      }
      assert.deepStrictEqual(b,a);
    }
  }
});
console.log('hold/triple engine: '+groups+' groups passed');
