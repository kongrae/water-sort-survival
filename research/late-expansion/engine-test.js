const assert=require('assert/strict');
const {E:current}=require('../../harness'),{clone,run}=require('../expansion/bots');
const E={...current,ENDLESS_RULES:current.LATE_GROWTH_V1_RULES};
const {baselineEngine,write,metadata}=require('./common');
const old=baselineEngine(),checks=[],statistics=[];
const copy=o=>JSON.parse(JSON.stringify(o));
function check(name,fn){fn();checks.push(name);console.log('ok '+name);}
function fixture(score=10000,rules=E.ENDLESS_RULES){
  const s=E.newState('endless','late-growth-contract',E.sanitizeRules(rules));
  s.score=score;s.bottles=[[0,0,0],[0,0,0],[],[],[],[],[],[]];s.growth.activeColors=9;s.growth.pendingIntro=[];
  s.piece=[0];s.growth.pieceIntro=-1;s.growth.queue=[{piece:[0],intro:-1},{piece:[1],intro:-1}];return s;
}
check('old rules retain sanitized shape, signatures, streams and complete action state',()=>{
  for(const rules of [old.DEFAULT_RULES,old.V1_RULES,old.EXPANDING_RULES,old.LEGACY_ENDLESS_RULES,old.PRESSURE_ENDLESS_RULES,old.ENDLESS_RULES]){
    const r=E.sanitizeRules(rules);assert.deepEqual(r,old.sanitizeRules(rules));assert.equal(E.rulesSig(r),old.rulesSig(r));
    const a=old.newState('endless','legacy-stream',r),b=E.newState('endless','legacy-stream',r);assert.deepEqual(a,b);
    for(let i=0;i<60&&!a.over;i++){
      const t=a.bottles.findIndex(x=>r.cap-x.length>=a.piece.length);if(t<0)break;
      assert.equal(E.applyPlace(b,t),old.applyPlace(a,t));assert.deepEqual(b,a);
    }
    if(a.growth){a.growth.activeColors=b.growth.activeColors=9;for(let i=0;i<1000;i++)assert.deepEqual(E.generatePiece(b),old.generatePiece(a));}
  }
  assert.deepEqual(E.COLOR_ENDLESS_RULES,old.ENDLESS_RULES);
});
check('versioned caps, full growth signature and canonical round trip',()=>{
  const r=E.sanitizeRules(E.ENDLESS_RULES);assert.deepEqual(r,E.ENDLESS_RULES);assert.deepEqual(E.sanitizeRules(copy(r)),r);
  assert.equal(r.maxColors,10);assert.equal(E.growthBottleLimit(r),9);assert(E.rulesSig(r).endsWith('-lg1'));
  const changed=copy(r);changed.growthTable.at(-1).score++;assert.notEqual(E.rulesSig(E.sanitizeRules(changed)),E.rulesSig(r));
  for(const lateGrowthVersion of [undefined,0,999]){const v=E.sanitizeRules({...r,lateGrowthVersion});assert.equal(v.maxColors,9);assert.equal(E.growthBottleLimit(v),8);assert(!E.hasLateGrowth(v));}
  const high=E.sanitizeRules({...r,maxColors:99,bottles:99,startColors:99});assert.equal(high.maxColors,10);assert.equal(high.bottles,9);
  const legacy=E.sanitizeRules({...E.COLOR_ENDLESS_RULES,maxColors:10,bottles:9});assert.equal(legacy.maxColors,9);assert.equal(legacy.bottles,8);
});
check('12k and 18k boundaries admit only earned colors and bottles',()=>{
  for(const [score,colors,bottles]of [[11999,9,8],[12000,10,8],[12001,10,8],[17999,10,8],[18000,10,9],[18001,10,9],[1e6,10,9]]){
    const s=fixture(score);s.bottles=Array.from({length:8},()=>[]);s.piece=[1];assert(E.applyPlace(s,0));
    assert.equal(s.growth.activeColors,colors);assert.equal(s.bottles.length,bottles);assert(E.validFeatureState(s));
    assert.equal(s.growth.log.filter(x=>x.kind==='color').length,colors===10?1:0);
    assert.equal(s.growth.log.filter(x=>x.kind==='bottle').length,bottles===9?1:0);
  }
});
check('clear crossing color boundary preserves published current, previews and held material',()=>{
  const s=fixture(11900);s.hold={piece:[2,1],intro:-1,flipped:false};const queue=E.previewPieces(s),held=copy(s.hold),gen=s.growth.generation;
  assert(E.applyPlace(s,0));assert.equal(s.score,12000);assert.equal(s.growth.activeColors,10);assert.equal(s.bottles.length,8);
  assert.deepEqual(s.piece,queue[0].piece);assert.deepEqual(s.growth.queue[0],queue[1]);assert.deepEqual(s.hold,held);
  assert.deepEqual(s.growth.queue[1],{piece:[9],intro:9});assert.equal(s.growth.generation,gen+1);
  assert(E.applyPlace(s,2));assert.equal(s.growth.log.filter(x=>x.kind==='color').length,1);assert(!s.growth.pendingIntro.includes(9));
});
check('pour/bonus crossings grant the bottle now and defer color activation to placement',()=>{
  const s=fixture(17800);s.bottles[0]=[0];s.bottles[1]=[0,0,0];
  s.challenge.active={color:0,goal:1,progress:0,startTurn:0,milestone:15000};s.challenge.nextScore=20000;
  const current=copy(s.piece),queue=copy(s.growth.queue),gen=s.growth.generation;
  assert(E.applyPour(s,0,1));assert.equal(s.score,18050);assert.equal(s.bottles.length,9);assert.equal(s.growth.activeColors,9);
  assert.deepEqual(s.piece,current);assert.deepEqual(s.growth.queue,queue);assert.equal(s.growth.generation,gen);assert.equal(s.challenge.bonusTotal,150);
  assert(E.applyPlace(s,8));assert.equal(s.growth.activeColors,10);assert.equal(s.bottles.length,9);assert(E.validFeatureState(s));
});
check('multiple threshold jump adds one bottle and introduces only one color per placement',()=>{
  const s=E.newState('endless','jump',E.sanitizeRules(E.ENDLESS_RULES));s.score=50000;s.piece=[0];
  for(let color=5;color<=10;color++){assert(E.applyPlace(s,0));assert.equal(s.growth.activeColors,color);assert.equal(s.bottles.length,9);s.bottles[0]=[];s.piece=[0];}
  assert.equal(s.growth.log.filter(x=>x.kind==='bottle').length,3);assert.equal(new Set(s.growth.log.filter(x=>x.kind==='color').map(x=>x.value)).size,6);
});
check('earned ninth bottle is usable before a full-board loss and supports normal actions',()=>{
  const s=fixture(18000);s.growth.activeColors=10;s.bottles=Array.from({length:8},()=>[0,1,2,3]);s.bottles[7].pop();s.piece=[3];
  assert(E.applyPlace(s,7));assert(!s.over);assert.deepEqual(s.bottles[8],[]);
  s.piece=[9,1];assert(E.applyFlip(s));assert(E.applyPlace(s,8));assert.deepEqual(s.bottles[8],[1,9]);
  s.bottles[0]=[9,9,9];assert(E.applyPour(s,8,0));assert.equal(s.bottles[0].length,0);assert.deepEqual(s.bottles[8],[1]);assert(E.canHold(s));
});
check('pending late milestones never block 10k goals or reset goals across growth',()=>{
  const s=fixture();assert(E.nextGrowth(s));E.updateColorChallenge(s,{},false);assert.equal(s.challenge.active.goal,2);
  const pending=fixture();pending.growth.activeColors=8;assert(!E.colorChallengePlan(pending));E.updateColorChallenge(pending,{},false);assert(!pending.challenge.active);
  const cross=fixture(11999);cross.turn=19;cross.challenge.active={color:0,goal:2,progress:0,startTurn:19,milestone:10000};cross.challenge.nextScore=15000;
  cross.piece=[1];const active=copy(cross.challenge.active);assert(E.applyPlace(cross,2));assert(cross.score>=12000);assert.equal(cross.growth.activeColors,10);assert.deepEqual(cross.challenge.active,active);
});
check('silver goal witnesses use only available bottles and visible pieces',()=>{
  const s=fixture(18000);s.growth.activeColors=10;s.bottles=[[9,9,9],[9,9,9],[],[],[],[],[],[],[]];s.piece=[9];s.growth.queue=[{piece:[9],intro:-1},{piece:[1],intro:-1}];
  const before=copy(s),p=E.colorChallengePlan(s);assert.deepEqual(s,before);assert.equal(p.color,9);assert.equal(p.goal,2);assert(p.examined<=768);
  E.updateColorChallenge(s,{},false);for(const a of p.path)assert(a.kind==='place'?E.applyPlace(s,...a.args):a.kind==='pour'?E.applyPour(s,...a.args):a.kind==='hold'?E.applyHold(s):E.applyFlip(s));
  assert.equal(s.challenge.completed,1);assert.equal(s.challenge.bonusTotal,300);assert(E.validFeatureState(s));
  const unavailable=fixture(17999);unavailable.bottles=Array.from({length:8},()=>[0,1,2,3]);unavailable.piece=[0];unavailable.growth.queue=[{piece:[0],intro:-1},{piece:[0],intro:-1}];
  assert.equal(E.colorChallengePlan(unavailable),null);assert.equal(unavailable.bottles.length,8);
});
check('nine-color ordinary tail and complete stream remain exactly baseline below 12k',()=>{
  for(const score of [4500,7250,9999,10000,11999]){
    const a=fixture(score,E.COLOR_ENDLESS_RULES),b=fixture(score),counts={one:0,two:0,triple:0};
    for(let i=0;i<12000;i++){const p=E.generatePiece(b);assert.deepEqual(p,E.generatePiece(a));counts[p.piece.length===1?'one':p.piece.length===2?'two':'triple']++;}
    assert(Math.abs(counts.two/(counts.one+counts.two)-.9)<.012);statistics.push({score,n:12000,activeColors:9,counts});
  }
});
check('fresh real-action bot traces remain exact until the first late growth',()=>{
  for(let i=0;i<4;i++){
    const observe=rows=>(s,kind)=>{if(s.score<12000){const c=copy(s);delete c.rules;rows.push({kind,state:c});}};
    const baseline=[],current=[],seed='late-prefix-'+i;
    run(E.sanitizeRules(E.COLOR_ENDLESS_RULES),seed,180,2,false,observe(baseline));run(E.sanitizeRules(E.ENDLESS_RULES),seed,180,2,false,observe(current));
    assert.deepEqual(current,baseline);assert(current.length>0);
  }
});
check('newly generated material is bounded by active colors; ten-color sampling stays uniform',()=>{
  const s=fixture(25000);s.growth.activeColors=10;const counts=Array(10).fill(0);let n=0;
  for(let i=0;i<20000;i++)for(const c of E.generatePiece(s).piece){assert(c>=0&&c<10);counts[c]++;n++;}
  for(const count of counts)assert(Math.abs(count/n-.1)<.01);statistics.push({score:25000,activeColors:10,n,counts});
});
check('save/restore/undo replay is deterministic and candidate clones stay isolated',()=>{
  for(const score of [11900,17900]){const s=fixture(score),before=copy(s),restored=copy(s);assert(E.applyPlace(s,0));assert(E.applyPlace(restored,0));assert.deepEqual(restored,s);
    const c=clone(before);E.applyPlace(c,0);assert.deepEqual(before,fixture(score));assert.deepEqual(c,s);
    const undone=copy(before);E.applyPlace(undone,0);assert.deepEqual(undone,s);assert(E.validFeatureState(undone));}
});
check('malformed new rule/state is rejected; failed/ended actions consume nothing',()=>{
  const s=fixture(18000);s.growth.activeColors=10;s.bottles.push([]);assert(E.validFeatureState(s));
  for(const damage of [x=>x.rules.lateGrowthVersion=999,x=>x.rules.maxColors=11,x=>x.rules.growthTable.at(-1).bottles=10,
    x=>x.rules.growthTable[1].score=0,x=>x.rules.growthTable[2].colors=2,x=>x.bottles.push([]),x=>x.bottles[0]=[10],x=>x.growth.pendingIntro=[10]]){
    const c=copy(s);damage(c);assert(!E.validFeatureState(c));}
  s.bottles[0]=[0,1,2,3];const before=copy(s);assert(!E.applyPlace(s,0));assert(!E.applyPour(s,1,0));assert.deepEqual(s,before);
  s.over=true;const ended=copy(s);assert(!E.applyPlace(s,8));assert(!E.applyHold(s));assert.deepEqual(s,ended);
});
write('engine-test.json',{...metadata(),checks,statistics});console.log(checks.length+' groups passed');
