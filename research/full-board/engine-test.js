const assert=require('assert/strict'),fs=require('fs');
const {E}=require('../../harness'),{baselineEngine,metadata,write,sha}=require('./common');
const {run,clone,policySha256}=require('./bot-adapter');
const old=baselineEngine(),checks=[],statistics=[];const copy=o=>JSON.parse(JSON.stringify(o));
function ck(name,fn){fn();checks.push(name);console.log('ok '+name);}
const r=E.sanitizeRules(E.ENDLESS_RULES);
function fixture(score,k=10,n=9,rules=r){const s=E.newState('endless','full-board-contract',rules);s.score=score;s.growth.activeColors=k;s.growth.pendingIntro=[];
 s.bottles=Array.from({length:n},()=>[]);s.piece=[0];s.growth.pieceIntro=-1;s.growth.queue=[{piece:[1],intro:-1},{piece:[2],intro:-1}];s.challenge.nextScore=Math.max(10000,Math.floor(score/5000)*5000+5000);return s;}
function act(s,a){return a.kind==='place'?E.applyPlace(s,...a.args):a.kind==='pour'?E.applyPour(s,...a.args):a.kind==='hold'?E.applyHold(s):E.applyFlip(s);}
ck('all historical policies keep canonical rules, signatures and actual action states',()=>{
 for(const raw of [old.DEFAULT_RULES,old.V1_RULES,old.EXPANDING_RULES,old.LEGACY_ENDLESS_RULES,old.PRESSURE_ENDLESS_RULES,old.COLOR_ENDLESS_RULES,old.ENDLESS_RULES]){
  const rules=E.sanitizeRules(raw);assert.deepEqual(rules,old.sanitizeRules(raw));assert.equal(E.rulesSig(rules),old.rulesSig(rules));
  const a=old.newState('endless','old-action-compatibility',rules),b=E.newState('endless','old-action-compatibility',rules);assert.deepEqual(a,b);
  for(let i=0;i<70&&!a.over;i++){const t=a.bottles.findIndex(x=>rules.cap-x.length>=a.piece.length);if(t<0)break;assert.equal(E.applyPlace(b,t),old.applyPlace(a,t));assert.deepEqual(b,a);}
 }
 assert.deepEqual(E.LATE_GROWTH_V1_RULES,old.ENDLESS_RULES);
});
ck('full growth is canonical v2 with finite 13-color/12-bottle caps',()=>{
 assert.deepEqual(r,E.ENDLESS_RULES);assert.deepEqual(E.sanitizeRules(copy(r)),r);assert.equal(r.maxColors,13);assert.equal(E.growthBottleLimit(r),12);assert.equal(r.growthTable.length,14);assert(E.rulesSig(r).endsWith('-lg2'));
 const v1=E.sanitizeRules({...r,lateGrowthVersion:1,maxColors:99,bottles:99});assert.equal(v1.maxColors,10);assert.equal(v1.bottles,9);
 const unknown=E.sanitizeRules({...r,lateGrowthVersion:999});assert(!E.hasLateGrowth(unknown));assert.equal(unknown.maxColors,9);
});
ck('all new boundaries minus/exact/plus: earned bottle now, one color per placement',()=>{
 for(let i=8;i<r.growthTable.length;i++){const row=r.growthTable[i],prev=r.growthTable[i-1];for(const delta of [-1,0,1]){
  const s=fixture(row.score+delta,prev.colors,prev.bottles);assert(E.validFeatureState(s));assert(E.applyPlace(s,0)); // placements without a clear award no score
  assert.equal(s.growth.activeColors,delta<0?prev.colors:row.colors);assert.equal(s.bottles.length,delta<0?prev.bottles:row.bottles);assert(E.validFeatureState(s));
  assert.equal(s.growth.log.filter(x=>x.kind==='color').length,delta<0||row.colors===prev.colors?0:1);
 }}
});
ck('bottle grants precede no-room loss; new last slots support place/flip/HOLD/pour/clear',()=>{
 for(const [score,color,n]of [[40000,11,9],[70000,12,10],[100000,13,11]]){
  const s=fixture(score,color,n);s.bottles=Array.from({length:n},()=>[0,1,2,3]);s.bottles[0].pop();s.piece=[3];assert(E.applyPlace(s,0));assert(!s.over);assert.deepEqual(s.bottles[n],[]);
  s.piece=[color-1,1];assert(E.applyFlip(s));assert(E.applyPlace(s,n));assert.deepEqual(s.bottles[n],[1,color-1]);assert(E.canHold(s));assert(E.applyHold(s));
  s.bottles[1]=[color-1,color-1,color-1];assert(E.applyPour(s,n,1));assert.deepEqual(s.bottles[1],[]);assert.equal(s.bottles[n][0],1);assert(s.clears>0);assert(E.validFeatureState(s));
 }
});
ck('pour and goal bonus pay the bottle in the same settlement, published pieces stay',()=>{
 for(const [score,k,n]of [[40000,11,9],[70000,12,10],[100000,13,11]]){
  const s=fixture(score-250,k,n);s.bottles[0]=[0];s.bottles[1]=[0,0,0];s.hold={piece:[1,2],intro:-1,flipped:false};s.challenge.active={color:0,goal:1,progress:0,startTurn:0,milestone:10000};s.challenge.nextScore=15000;
  const queue=copy(s.growth.queue),piece=copy(s.piece),hold=copy(s.hold),gen=s.growth.generation;assert(E.applyPour(s,0,1));assert.equal(s.score,score);assert.equal(s.bottles.length,n+1);assert.equal(s.challenge.bonusTotal,150);assert.deepEqual(s.piece,piece);assert.deepEqual(s.growth.queue,queue);assert.deepEqual(s.hold,hold);assert.equal(s.growth.generation,gen);
 }
});
ck('large score jump grants all earned bottles but only one introduction per placement',()=>{
 const s=E.newState('endless','full-growth-jump',r);s.score=1e6;
 for(let k=5;k<=13;k++){s.piece=[0];s.bottles[0]=[];assert(E.applyPlace(s,0));assert.equal(s.growth.activeColors,k);assert.equal(s.bottles.length,12);assert(E.validFeatureState(s));}
 assert.equal(s.growth.log.filter(x=>x.kind==='bottle').length,6);assert.equal(new Set(s.growth.log.filter(x=>x.kind==='color').map(x=>x.value)).size,9);assert.equal(E.nextGrowth(s),null);
});
ck('each new introduction preserves held/published material and consumes one generation',()=>{
 for(const [score,k,n]of [[30000,10,9],[55000,11,10],[85000,12,11]]){
  const s=fixture(score,k,n);s.hold={piece:[2,1],intro:-1,flipped:false};const queue=copy(s.growth.queue),hold=copy(s.hold),gen=s.growth.generation;
  assert(E.applyPlace(s,0));assert.deepEqual(s.piece,queue[0].piece);assert.deepEqual(s.growth.queue[0],queue[1]);assert.deepEqual(s.hold,hold);assert.deepEqual(s.growth.queue[1],{piece:[k],intro:k});assert.equal(s.growth.generation,gen+1);
  assert(E.applyPlace(s,1));assert.equal(s.growth.log.filter(x=>x.kind==='color').length,1);assert(!s.growth.pendingIntro.includes(k));
 }
});
ck('two-digit liquid keys have no single-layer/multi-layer collision, preserve old keys',()=>{
 const cases=[[[10],[]],[[1,0],[]],[[11],[]],[[1,1],[]],[[12],[]],[[1,2],[]],[[10,1],[]],[[1,0,1],[]]];
 assert.equal(new Set(cases.map(E.boardKey)).size,cases.length);for(const b of [[[1,0],[1,1]],[[9,1],[]],[[0,2,5],[]]])assert.equal(E.boardKey(b),old.boardKey(b));
});
ck('30k pressure anchor preserves ordinary and triple streams at every old segment',()=>{
 for(const score of [4500,7250,9999,10000,11999,12000,14999,15000,18000,24999,25000,27500,29999]){
  const k=score>=12000?10:9,n=score>=18000?9:8,a=fixture(score,k,n,E.sanitizeRules(old.ENDLESS_RULES)),b=fixture(score,k,n);assert.deepEqual(E.pressureAt(a),E.pressureAt(b));
  for(let i=0;i<2000;i++)assert.deepEqual(E.generatePiece(a),E.generatePiece(b));
 }
});
if(!process.argv.includes('--contracts-only'))ck('fresh preserved survival policy has identical action/state prefix before 30k',()=>{
 for(let i=0;i<3;i++){
  const rows=()=>[],a=rows(),b=rows(),observe=dest=>(s,kind)=>{if(s.score<30000){const c=copy(s);delete c.rules;dest.push({kind,state:c});}};
  const seed='full-board-prefix-'+i;run(E.sanitizeRules(old.ENDLESS_RULES),seed,260,2,false,observe(a));run(r,seed,260,2,false,observe(b));assert(a.length>0);assert.deepEqual(b,a);
 }
});
ck('9-color ordinary tail stays 10/90; active new colors are bounded and sampled',()=>{
 for(const [k,n,score]of [[9,8,10000],[11,9,30000],[12,10,55000],[13,12,100000]]){
  const s=fixture(score,k,n),counts=Array(k).fill(0),lengths=[0,0,0,0];let total=0;
  for(let i=0;i<15000;i++){const p=E.generatePiece(s).piece;assert(p.length<=3);assert(p.every(c=>c>=0&&c<k));if(p.length===3)assert(new Set(p).size<=2);lengths[p.length]++;for(const c of p){counts[c]++;total++;}}
  assert(Math.abs(lengths[2]/(lengths[1]+lengths[2])-.9)<.015);for(const c of counts)assert(Math.abs(c/total-1/k)<.013);statistics.push({k,n,score,counts,lengths,total});
 }
});
ck('all growth boundaries retain active goal and do not extend 12-placement deadline',()=>{
 for(const row of r.growthTable.filter(x=>x.score>=12000)){
  const prev=r.growthTable[r.growthTable.indexOf(row)-1],s=fixture(row.score,prev.colors,prev.bottles);s.turn=19;s.challenge.active={color:0,goal:2,progress:0,startTurn:10,milestone:10000};s.challenge.nextScore=15000;
  const a=copy(s.challenge.active);s.piece=[1];assert(E.applyPlace(s,0));assert.deepEqual(s.challenge.active,a);assert.equal(s.challenge.bonusTotal,0);
 }
 const s=fixture(10000,9,8);s.challenge.nextScore=10000;s.bottles[0]=[0,0,0];s.bottles[1]=[0,0,0];s.piece=[0];s.growth.queue=[{piece:[0],intro:-1},{piece:[1],intro:-1}];E.updateColorChallenge(s,{},false);assert.equal(s.challenge.active.goal,2);
});
ck('new color goal witnesses replay real available liquid; future bottles cannot be borrowed',()=>{
 for(const [c,n,score]of [[10,9,30000],[11,10,55000],[12,11,85000]]){
  const s=fixture(score,c+1,n);s.bottles[0]=[c,c,c];s.bottles[1]=[c,c,c];s.piece=[c];s.growth.queue=[{piece:[c],intro:-1},{piece:[1],intro:-1}];const original=copy(s),p=E.colorChallengePlan(s);assert.deepEqual(s,original);assert.equal(p.color,c);assert.equal(p.goal,2);assert(p.examined<=768);
  s.challenge.nextScore=10000;E.updateColorChallenge(s,{},false);for(const a of p.path)assert(act(s,a));assert.equal(s.challenge.bonusTotal,300);assert(E.validFeatureState(s));
 }
 const blocked=fixture(39999,11,9);blocked.bottles=Array.from({length:9},()=>[0,1,2,3]);blocked.piece=[10];assert.equal(E.colorChallengePlan(blocked),null);assert.equal(blocked.bottles.length,9);
});
ck('boundary JSON reload, undo, replay and clone isolation restore complete state',()=>{
 for(const row of r.growthTable.filter(x=>x.score>=12000)){
  const prev=r.growthTable[r.growthTable.indexOf(row)-1],s=fixture(row.score-100,prev.colors,prev.bottles);s.bottles[0]=[0,0,0];const before=copy(s),loaded=copy(s),candidate=clone(s);
  assert(E.applyPlace(s,0));assert(E.applyPlace(loaded,0));assert(E.applyPlace(candidate,0));assert.deepEqual(loaded,s);assert.deepEqual(candidate,s);assert.equal(before.score,row.score-100);assert(E.validFeatureState(s));const undone=copy(before);assert(E.applyPlace(undone,0));assert.deepEqual(undone,s);
 }
});
ck('malformed policies/state reject and illegal or finished inputs consume nothing',()=>{
 const s=fixture(100000,13,12);assert(E.validFeatureState(s));for(const damage of [x=>x.rules.lateGrowthVersion=999,x=>x.rules.maxColors=14,x=>x.rules.growthTable.at(-1).bottles=13,x=>x.rules.growthTable[9].score=x.rules.growthTable[8].score,x=>x.rules.growthTable[9].colors=8,x=>x.bottles.push([]),x=>x.piece=[13],x=>x.growth.queue[0]={piece:[10,11,12],intro:-1}]){const c=copy(s);damage(c);assert(!E.validFeatureState(c));}
 s.bottles[11]=[0,1,2,3];const before=copy(s);assert(!E.applyPlace(s,11));assert.deepEqual(s,before);s.over=true;const ended=copy(s);for(const f of [()=>E.applyPlace(s,9),()=>E.applyPour(s,11,0),()=>E.applyHold(s),()=>E.applyFlip(s)])assert(!f());assert.deepEqual(s,ended);
});
write(process.argv.includes('--contracts-only')?'probe-contracts.json':'engine-test.json',{...metadata(),testSha256:sha(fs.readFileSync(__filename)),policySha256,rules:r,signature:E.rulesSig(r),checks,statistics});console.log(checks.length+' groups passed');
