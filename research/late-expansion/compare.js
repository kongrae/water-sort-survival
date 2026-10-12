// All fresh fixed seeds; identical depth-2 policy, scores, pressure and color goals.
const fs=require('fs'),{Worker,isMainThread,parentPort,workerData}=require('worker_threads');
const {E,run}=require('../expansion/bots'),{write,metadata,sha}=require('./common');
const opt=(k,d)=>Number(process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)||d);
const thresholds=[10000,12000,18000,25000],prefix='late-expansion-20261011-';
const configs=[['baseline',E.COLOR_ENDLESS_RULES],['color', {...E.ENDLESS_RULES,growthTable:E.SCORE_LATE_GROWTH_V1.slice(0,-1)}],['full',E.ENDLESS_RULES]];
const bucket=score=>score<10000?'below10000':score<12000?'10000-11999':score<18000?'12000-17999':score<25000?'18000-24999':'25000+';
function measure(rules,seed,cap){
  const milestones={},unlocks={},phases={},goals=[],started=new Set();let last=null;
  const result=run(rules,seed,cap,2,false,(s,kind)=>{
    for(const score of thresholds)if(!milestones[score]&&s.score>=score)milestones[score]={turn:s.turn,score:s.score};
    for(const [k,condition]of [['color10',s.growth.activeColors===10],['bottle9',s.bottles.length===9]])if(condition&&!unlocks[k])unlocks[k]={turn:s.turn,score:s.score};
    const p=phases[bucket(s.score)]||(phases[bucket(s.score)]={placements:0,holds:0,free:0,targets:0,completed:0,missed:0});
    if(kind==='place'){p.placements++;p.free+=s.bottles.reduce((n,b)=>n+rules.cap-b.length,0);p.targets+=s.bottles.filter(b=>rules.cap-b.length>=s.piece.length).length;}
    if(kind==='hold')p.holds++;
    const q=s.challenge;if(q.active&&!started.has(q.active.milestone)){started.add(q.active.milestone);goals.push({...q.active});}
    if(q.lastResult&&q.lastResult!==last){last=q.lastResult;const goal=goals.find(g=>g.milestone===last.milestone);if(goal)Object.assign(goal,{status:last.status,reason:last.reason,finishTurn:last.turn,reward:last.reward});p[last.status==='complete'?'completed':'missed']++;}
  });
  const q=result.state.challenge;
  delete result.state;
  return {...result,milestones,unlocks,phases,goals,bonus:q.bonusTotal,completed:q.completed,missed:q.missed,
    termination:!result.over?'placement-cap/right-censored':result.reason==='noroom'?'engine-no-legal-room':'bot-search-limited'};
}
const quantile=(a,p)=>a.length?a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]:null;
function summary(rows){
  const phases={},milestones={},unlocks={},reasons={};
  for(const row of rows){reasons[row.termination]=(reasons[row.termination]||0)+1;for(const [k,p]of Object.entries(row.phases)){const dest=phases[k]||(phases[k]={});for(const [n,v]of Object.entries(p))dest[n]=(dest[n]||0)+v;}}
  for(const p of Object.values(phases)){p.freeMean=p.placements?p.free/p.placements:null;p.targetsMean=p.placements?p.targets/p.placements:null;p.goalRate=p.completed+p.missed?p.completed/(p.completed+p.missed):null;}
  for(const threshold of thresholds){const reached=rows.filter(r=>r.milestones[threshold]);milestones[threshold]={reached:reached.length,censored:reached.filter(r=>!r.over).length,
    firstTurnP50:quantile(reached.map(r=>r.milestones[threshold].turn),.5),observedAfterP50:quantile(reached.map(r=>r.turn-r.milestones[threshold].turn),.5),observedSurvivalHasCensoring:reached.some(r=>!r.over)};}
  for(const k of ['color10','bottle9']){const reached=rows.filter(r=>r.unlocks[k]);unlocks[k]={reached:reached.length,censored:reached.filter(r=>!r.over).length,
    firstTurnP50:quantile(reached.map(r=>r.unlocks[k].turn),.5),observedAfterP50:quantile(reached.map(r=>r.turn-r.unlocks[k].turn),.5),observedSurvivalHasCensoring:reached.some(r=>!r.over)};}
  const completed=rows.reduce((n,r)=>n+r.completed,0),missed=rows.reduce((n,r)=>n+r.missed,0);
  return {n:rows.length,capped:rows.filter(r=>!r.over).length,observedTurnP50:quantile(rows.map(r=>r.turn),.5),scoreP50:quantile(rows.map(r=>r.score),.5),
    milestones,unlocks,phases,reasons,completed,missed,goalRate:completed+missed?completed/(completed+missed):null,unknown:rows.reduce((n,r)=>n+r.metrics.unknown,0)};
}
if(!isMainThread){const {label,rules,n,cap}=workerData,rows=[];for(let i=0;i<n;i++){rows.push(measure(rules,prefix+i,cap));if((i+1)%5===0)parentPort.postMessage({progress:label+' '+(i+1)+'/'+n});}
  parentPort.postMessage({label,rules,signature:E.rulesSig(rules),rows,summary:summary(rows)});
}else{
  const n=opt('n',40),cap=opt('cap',1500),meta={...metadata(),comparisonSha256:sha(fs.readFileSync(__filename))},results=[],start=Date.now();let active=3,failed=false;
  const save=()=>write('comparison.json',{...meta,n,cap,depth:2,seedPrefix:prefix,selection:'all fixed seeds, fresh start; unchanged survival policy ignores goals',
    elapsedMs:Date.now()-start,complete:!active&&!failed,results:results.slice().sort((a,b)=>a.label.localeCompare(b.label)),humanFunValidated:false});
  for(const [label,r]of configs){const w=new Worker(__filename,{workerData:{label,rules:E.sanitizeRules(r),n,cap}});
    w.on('message',m=>{if(m.progress)console.log(m.progress);else{results.push(m);save();console.log(label+': '+m.summary.capped+'/'+n+' capped');}});
    w.on('error',e=>{failed=true;console.error(e);process.exitCode=1;});w.on('exit',code=>{active--;if(code){failed=true;process.exitCode=1;}save();if(!active)console.log('Finished '+results.length+' conditions');});}
}
