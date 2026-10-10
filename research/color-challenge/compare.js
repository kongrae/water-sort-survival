// A bounded prototype comparison, with an unchanged bot policy and fresh fixed seeds.
const { E, run } = require('../expansion/bots'), { write, metadata } = require('./common');
const loaded = metadata();
const n=Number(process.argv.find(a=>a.startsWith('--n='))?.slice(4)||16);
const cap=Number(process.argv.find(a=>a.startsWith('--cap='))?.slice(6)||500);
const conditions=[['pressure',E.PRESSURE_ENDLESS_RULES],['simple',{...E.ENDLESS_RULES,challengeFirst:false}],['first',E.ENDLESS_RULES]];
const rows=[];
for(const [condition,rules]of conditions)for(let i=0;i<n;i++){
  const goals=[],started=new Set();let last=null;
  const result=run(E.sanitizeRules(rules),'color-challenge-20261010-'+i,cap,2,false,(S,kind)=>{
    const q=S.challenge;if(!q)return;
    if(q.active&&!started.has(q.active.milestone)){started.add(q.active.milestone);goals.push({milestone:q.active.milestone,color:q.active.color,goal:q.active.goal,startTurn:q.active.startTurn});}
    if(q.lastResult&&q.lastResult!==last){last=q.lastResult;const goal=goals.find(g=>g.milestone===last.milestone);if(goal)Object.assign(goal,{status:last.status,reason:last.reason,finishTurn:last.turn,placements:last.turn-last.startTurn,reward:last.reward});}
  });
  const q=result.state.challenge;rows.push({condition,seed:result.seed,turn:result.turn,score:result.score,over:result.over,reason:result.reason,
    termination:result.over?(result.reason==='noroom'?'engine-no-legal-room':'bot-search-limited'):'placement-cap/right-censored',
    goals,completed:q?.completed||0,missed:q?.missed||0,bonus:q?.bonusTotal||0,signature:E.rulesSig(E.sanitizeRules(rules))});
  console.log(condition+' '+(i+1)+'/'+n+' score '+result.score+' goals '+(q?q.completed+'/'+(q.completed+q.missed):'0'));
  write('comparison.json',{...loaded,n,cap,depth:2,policy:'unchanged survival bot; goals not in evaluation',rows,complete:false});
}
const summaries=conditions.map(([condition])=>{
  const runs=rows.filter(r=>r.condition===condition),goals=runs.flatMap(r=>r.goals),ended=goals.filter(g=>g.status),complete=ended.filter(g=>g.status==='complete');
  return {condition,runs:runs.length,reach10k:runs.filter(r=>r.score>=10000).length,capped:runs.filter(r=>!r.over).length,
    goals:goals.length,ended:ended.length,completed:complete.length,completionRate:ended.length?complete.length/ended.length:null,
    goal1:goals.filter(g=>g.goal===1).length,goal2:goals.filter(g=>g.goal===2).length,
    otherColorMisses:ended.filter(g=>g.reason==='other-color').length,placementMisses:ended.filter(g=>g.reason==='placements').length,
    meanCompletionPlacements:complete.length?complete.reduce((n,g)=>n+g.placements,0)/complete.length:null,
    bonusScoreShare:runs.reduce((n,r)=>n+r.bonus,0)/runs.reduce((n,r)=>n+r.score,0),humanFunValidated:false};
});
write('comparison.json',{...loaded,n,cap,depth:2,policy:'unchanged survival bot; goals not in evaluation',rows,summaries,complete:true});
console.log(JSON.stringify(summaries,null,2));
