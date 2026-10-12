const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{Worker,isMainThread,parentPort,workerData}=require('worker_threads');
const {E,run,clone,policySha256,adapterSha256}=require('./bot-adapter'),{OUT,write,metadata,sha}=require('./common'),{configurations,protocol}=require('./config');
const opt=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const facts=s=>({free:s.bottles.reduce((n,b)=>n+s.rules.cap-b.length,0),targets:s.bottles.filter(b=>s.rules.cap-b.length>=s.piece.length).length,
 pure:s.bottles.filter(b=>b.length&&E.isPure(b)).length,distinct:new Set(s.bottles.flat()).size,breaks:s.bottles.reduce((n,b)=>n+b.slice(1).filter((c,i)=>c!==b[i]).length,0)});
const bucket=score=>score<30000?'below30000':score<40000?'30000-39999':score<55000?'40000-54999':score<70000?'55000-69999':score<85000?'70000-84999':score<100000?'85000-99999':'100000+';
function measure(rules,seed,cap,initial){
 const thresholds=[10000,12000,18000,25000,30000,...rules.growthTable.filter(r=>r.score>30000).map(r=>r.score)],milestones={},unlocks={},stages={},phases={},goals=[];
 let prior=initial?clone(initial):E.newState('endless',seed,rules),lastResult=JSON.stringify(prior.challenge.lastResult),checkpoint=null;
 const startTurn=prior.turn,started=new Set(),initialGoals={completed:prior.challenge.completed,missed:prior.challenge.missed,bonus:prior.challenge.bonusTotal};
 const result=run(rules,seed,startTurn+cap,2,false,(s,kind)=>{
  if(!initial&&s.score<30000)checkpoint=clone(s);
  for(const threshold of thresholds)if(!milestones[threshold]&&s.score>=threshold)milestones[threshold]={turn:s.turn,score:s.score};
  const actual=[['color11',s.growth.activeColors>=11],['color12',s.growth.activeColors>=12],['color13',s.growth.activeColors>=13],['bottle10',s.bottles.length>=10],['bottle11',s.bottles.length>=11],['bottle12',s.bottles.length>=12]];
  for(const [key,condition]of actual)if(condition&&!unlocks[key])unlocks[key]={turn:s.turn,score:s.score,kind,before:facts(prior),after:facts(s),snapshots:{}};
  const f=facts(s),stage=s.growth.activeColors+'c-'+s.bottles.length+'b',phase=bucket(s.score);
  const aggregates=[stages[stage]||(stages[stage]={placements:0,holds:0,free:0,targets:0,pure:0,distinct:0,breaks:0,completed:0,missed:0}),phases[phase]||(phases[phase]={placements:0,holds:0,free:0,targets:0,pure:0,distinct:0,breaks:0,completed:0,missed:0})];
  for(const p of aggregates){if(kind==='place'){p.placements++;for(const key of Object.keys(f))p[key]+=f[key];}if(kind==='hold'){p.holds++;p.holdRescues=(p.holdRescues||0)+(prior.stuck==='hold'?1:0);}}
  for(const u of Object.values(unlocks))if(kind==='place')for(const after of [10,50,100])if(!u.snapshots[after]&&s.turn-u.turn>=after)u.snapshots[after]={turn:s.turn,...f};
  const q=s.challenge;if(q.active&&!started.has(q.active.milestone)){started.add(q.active.milestone);goals.push({...q.active});}
  if(q.lastResult&&JSON.stringify(q.lastResult)!==lastResult){lastResult=JSON.stringify(q.lastResult);const result=q.lastResult,g=goals.find(g=>g.milestone===result.milestone);if(g)Object.assign(g,{status:result.status,reason:result.reason,finishTurn:result.turn,reward:result.reward});for(const p of aggregates){p[result.status==='complete'?'completed':'missed']++;p.bonus=(p.bonus||0)+result.reward;}}
  prior=clone(s);
 },initial);
 const s=result.state;assert(E.validFeatureState(s));
 for(const u of Object.values(unlocks)){u.observedAfter=result.turn-u.turn;u.censored=!result.over||result.reason!=='noroom';u.deathWithin50=result.over&&result.reason==='noroom'&&u.observedAfter<=50;}
 delete result.state;
 return{...result,startTurn,observedPlacements:result.turn-startTurn,milestones,unlocks,stages,phases,goals,completed:s.challenge.completed-initialGoals.completed,missed:s.challenge.missed-initialGoals.missed,bonus:s.challenge.bonusTotal-initialGoals.bonus,
  termination:!result.over?'placement-cap/right-censored':result.reason==='noroom'?'engine-no-legal-room':'bot-search-limited',...(checkpoint?{checkpoint}:{} )};
}
const q=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]:null;
function summarize(rows){
 const stages={},phases={},reasons={},unlocks={},milestones={};
 for(const row of rows){reasons[row.termination]=(reasons[row.termination]||0)+1;for(const [destination,source]of [[stages,row.stages],[phases,row.phases]])for(const [key,p]of Object.entries(source)){const a=destination[key]||(destination[key]={});for(const [k,v]of Object.entries(p))a[k]=(a[k]||0)+v;}}
 for(const [aggregate,field]of [[stages,'stages'],[phases,'phases']])for(const [key,p]of Object.entries(aggregate)){
  const reached=rows.filter(r=>r[field][key]?.placements);p.runs=reached.length;for(const metric of ['free','targets','pure','distinct','breaks']){p[metric+'Mean']=p.placements?p[metric]/p.placements:null;p[metric+'RunMean']=reached.length?reached.reduce((sum,r)=>sum+r[field][key][metric]/r[field][key].placements,0)/reached.length:null;}
  p.goalRate=p.completed+p.missed?p.completed/(p.completed+p.missed):null;
 }
 for(const key of ['color11','color12','color13','bottle10','bottle11','bottle12']){
  const found=rows.filter(r=>r.unlocks[key]),censored=found.filter(r=>r.unlocks[key].censored).length;
  unlocks[key]={reached:found.length,censored,firstTurnP50:q(found.map(r=>r.unlocks[key].turn),.5),observedAfterP50:q(found.map(r=>r.unlocks[key].observedAfter),.5),deathWithin50:found.filter(r=>r.unlocks[key].deathWithin50).length};
  for(const point of ['before','after','10','50','100']){const values=found.map(r=>point==='before'||point==='after'?r.unlocks[key][point]:r.unlocks[key].snapshots[point]).filter(Boolean);
   unlocks[key][point]={n:values.length,...Object.fromEntries(['free','targets','pure','distinct','breaks'].map(k=>[k,values.length?values.reduce((s,v)=>s+v[k],0)/values.length:null]))};}
 }
 const scores=new Set(rows.flatMap(r=>Object.keys(r.milestones)));for(const score of scores){const found=rows.filter(r=>r.milestones[score]);milestones[score]={reached:found.length,censored:found.filter(r=>!r.over).length,firstTurnP50:q(found.map(r=>r.milestones[score].turn),.5),observedAfterP50:q(found.map(r=>r.turn-r.milestones[score].turn),.5)};}
 const completed=rows.reduce((n,r)=>n+r.completed,0),missed=rows.reduce((n,r)=>n+r.missed,0);
 return{n:rows.length,capped:rows.filter(r=>!r.over).length,observedTurnP50:q(rows.map(r=>r.observedPlacements),.5),scoreP50:q(rows.map(r=>r.score),.5),reasons,unlocks,milestones,stages,phases,completed,missed,goalRate:completed+missed?completed/(completed+missed):null,unknown:rows.reduce((n,r)=>n+r.metrics.unknown,0)};
}
if(!isMainThread){
 const {label,rules,n,cap,prefix,conditional,startIndex=0,count=n}=workerData,rows=[];
 for(let i=startIndex;i<startIndex+count;i++){
  let initial;if(conditional){initial=clone(conditional[i]);assert(E.validFeatureState(initial));const inventory=JSON.stringify([initial.bottles,initial.score,initial.piece,initial.growth,initial.hold]);initial.rules=rules;assert(E.validFeatureState(initial));assert.equal(JSON.stringify([initial.bottles,initial.score,initial.piece,initial.growth,initial.hold]),inventory);}
  rows.push(measure(rules,prefix+i,cap,initial));if((i+1)%5===0)parentPort.postMessage({progress:label+' completed chunk through seed '+(i+1)+'/'+n});
 }
 parentPort.postMessage({label,rules,signature:E.rulesSig(rules),rows,startIndex});
}else{
 const stage=opt('stage','tune'),labels=opt('labels',stage==='tune'?'baseline,color,A,B':'baseline,B').split(',');
 let conditional;if(stage==='conditional'){const final=JSON.parse(fs.readFileSync(path.join(OUT,'final.json')));conditional=final.results.find(r=>r.label==='baseline').rows.filter(r=>r.milestones[30000]&&r.checkpoint&&!r.checkpoint.over&&r.checkpoint.score<30000).map(r=>r.checkpoint).slice(0,40);assert(conditional.length);}
 const n=conditional?conditional.length:Number(opt('n',stage==='final'?40:20)),cap=Number(opt('cap',conditional?1000:1500)),prefix=conditional?'full-board-conditional-20261011-':protocol.prefix[stage];
 if(!prefix)throw Error('Unknown stage');if(labels.some(k=>!configurations[k]))throw Error('Unknown label');
 const target=stage+(stage==='tune'&&labels.length===1?'-'+labels[0]:'')+'.json';if(fs.existsSync(path.join(OUT,target)))throw Error('Study output exists; preserve it under a diagnostic name before rerun');
 const meta={...metadata(),comparisonSha256:sha(fs.readFileSync(__filename)),configurationSha256:sha(fs.readFileSync(path.join(__dirname,'config.js'))),policySha256,adapterSha256},results=[],start=Date.now(),queue=labels.flatMap(label=>Array.from({length:Math.ceil(n/5)},(_,i)=>({label,startIndex:i*5,count:Math.min(5,n-i*5)}))),collected={};let active=0,failed=false;
 const save=()=>write(target,{...meta,stage,n,cap,depth:2,seedPrefix:prefix,selection:conditional?'all surviving final-baseline last valid states below 30k; same inventory and original state seed, policies only replaced':'all fixed fresh seeds; unchanged survival policy ignores goals',...(conditional?{checkpoints:conditional,checkpointSourceSha256:sha(fs.readFileSync(path.join(OUT,'final.json')))}:{}),elapsedMs:Date.now()-start,complete:!queue.length&&!active&&!failed,results:results.slice().sort((a,b)=>a.label.localeCompare(b.label)),humanFunValidated:false});
 function dispatch(){while(active<4&&queue.length){const {label,startIndex,count}=queue.shift(),rules=E.sanitizeRules(configurations[label]);active++;
  const worker=new Worker(__filename,{workerData:{label,rules,n,cap,prefix,conditional,startIndex,count}});
  worker.on('message',m=>{if(m.progress)console.log(m.progress);else{
   const list=collected[label]||(collected[label]=[]);list.push(...m.rows);if(list.length===n){const rows=list.sort((a,b)=>Number(a.seed.split('-').at(-1))-Number(b.seed.split('-').at(-1))),summary=summarize(rows);results.push({label,rules,signature:E.rulesSig(rules),rows,summary});console.log(label+': '+summary.capped+'/'+n+' capped, bottle12 '+summary.unlocks.bottle12.reached);}save();}});
  worker.on('error',e=>{failed=true;console.error(e);process.exitCode=1;});worker.on('exit',code=>{active--;if(code){failed=true;process.exitCode=1;}dispatch();save();if(!active&&!queue.length)console.log('Finished '+results.length+' conditions');});
 }}dispatch();
}
