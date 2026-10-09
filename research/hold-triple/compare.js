// node research/hold-triple/compare.js --n=60 --cap=500 --workers=3 [--resume] [--tails]
// Fresh samples: --out=research/hud-balance/out --seed-prefix=hud-balance- --conditions=baseline,hold,both-5,both-10
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { E, run } = require('../expansion/bots');
const option = (k, fallback) => process.argv.find(s => s.startsWith('--' + k + '='))?.slice(k.length + 3) || fallback;
const opt = (k, fallback) => Number((process.argv.find(s => s.startsWith('--' + k + '=')) || '').split('=')[1]) || fallback;
const OUT = path.resolve(option('out', path.join(__dirname, 'out'))); fs.mkdirSync(OUT, { recursive: true });
const seedPrefix = option('seed-prefix', 'expansion-');
let configs = [
  ['baseline', E.sanitizeRules(E.EXPANDING_RULES)],
  ['hold', E.sanitizeRules({ ...E.ENDLESS_RULES, tripleVersion: 0 })],
  ['triple-5', E.sanitizeRules({ ...E.ENDLESS_RULES, holdVersion: 0 })],
  ['triple-10', E.sanitizeRules({ ...E.ENDLESS_RULES, holdVersion: 0, triplePct: 10 })],
  ['both-5', E.sanitizeRules(E.ENDLESS_RULES)],
  ['both-10', E.sanitizeRules({ ...E.ENDLESS_RULES, triplePct: 10 })],
];
if (option('conditions', '')) {
  const labels = option('conditions', '').split(',');
  if (labels.some(label => !configs.some(c => c[0] === label))) throw Error('Unknown comparison condition');
  configs = configs.filter(c => labels.includes(c[0]));
}
function summary(rows) {
  const q = (values, p) => { const a = values.filter(v => v !== null).sort((x,y) => x-y); return a.length ? a[Math.min(a.length-1, Math.floor(a.length*p))] : null; };
  const unlocked = n => rows.map(r => r.metrics.unlocks.find(u => u.to >= n)).filter(Boolean);
  const totals = {}, phases = {};
  for (const r of rows) {
    for (const k of ['pours','holds','holdRescues','triplePlaced','eligibleGenerated','tripleGenerated','unknown','transitions','candidates','elapsedMs']) totals[k] = (totals[k] || 0) + r.metrics[k];
    for (const [k,p] of Object.entries(r.metrics.phases)) {
      const t=phases[k]||(phases[k]={count:0,free:0,targets:0});for(const key of Object.keys(t))t[key]+=p[key];
    }
  }
  const placements=rows.reduce((n,r)=>n+r.turn,0);
  return { n:rows.length, turnP50:q(rows.map(r=>r.turn),.5), turnP90:q(rows.map(r=>r.turn),.9),
    scoreP50:q(rows.map(r=>r.score),.5), scoreP90:q(rows.map(r=>r.score),.9), capped:rows.filter(r=>!r.over).length,
    unlock7:unlocked(7).length, unlock8:unlocked(8).length,
    unlock7P50:q(unlocked(7).map(u=>u.turn),.5),unlock8P50:q(unlocked(8).map(u=>u.turn),.5),
    after8P50:q(rows.map(r=>{const u=r.metrics.unlocks.find(x=>x.to>=8);return u?r.turn-u.turn:null;}),.5),
    poursPerPlace:totals.pours/placements,holdsPerPlace:totals.holds/placements,
    longestHeldP50:q(rows.map(r=>r.metrics.longestHeldTurns),.5),
    tripleDeaths:rows.filter(r=>r.metrics.tripleAtEnd).length,
    totals, phases:Object.fromEntries(Object.entries(phases).map(([k,p])=>[k,{count:p.count,freeMean:p.free/p.count,targetsMean:p.targets/p.count}])) };
}
if (!isMainThread) {
  const {label,rules,depth,seeds,cap}=workerData,rows=[],start=Date.now();
  for(let i=0;i<seeds.length;i++){
    const r=run(rules,seeds[i],cap,depth);delete r.state;rows.push(r);
    if((i+1)%15===0)parentPort.postMessage({progress:label+'/d'+depth+': '+(i+1)+'/'+seeds.length});
  }
  parentPort.postMessage({label,rules,depth,cap,rows,elapsedMs:Date.now()-start,summary:summary(rows)});
} else {
  const tails=process.argv.includes('--tails'),n=opt('n',60),cap=tails?1500:opt('cap',500),workers=Math.max(1,Math.min(4,opt('workers',3)));
  const file=path.join(OUT,tails?'tail-check.json':'comparison-'+n+'-'+cap+'.json');
  const hash = text => crypto.createHash('sha256').update(text).digest('hex');
  const source=fs.readFileSync(path.join(__dirname,'../../water-sort-survival.html'),'utf8');
  const meta={engineSha256:hash(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]),
    botSha256:hash(fs.readFileSync(path.join(__dirname,'../expansion/bots.js'))),node:process.version};
  let jobs=configs.flatMap(([label,rules])=>[1,2].map(depth=>({label,rules,depth,cap,seeds:Array.from({length:n},(_,i)=>seedPrefix+i)})));
  if(tails){
    const old=JSON.parse(fs.readFileSync(path.join(OUT,'comparison-60-500.json'),'utf8'));
    jobs=old.results.filter(r=>r.summary.capped>=6).map(r=>({
      label:r.label,rules:r.rules,depth:r.depth,cap,
      seeds:r.rows.filter(row=>!row.over).slice(0,6).map(row=>row.seed),
    }));
  }
  let results=[];
  if(process.argv.includes('--resume')&&fs.existsSync(file)){
    const old=JSON.parse(fs.readFileSync(file,'utf8'));
    if(old.engineSha256!==meta.engineSha256||old.botSha256!==meta.botSha256||old.seedPrefix!==seedPrefix)throw Error('Cannot resume a different engine/bot/seed list');
    results=old.results;
  }
  const done=new Set(results.map(r=>r.label+'/'+r.depth));jobs=jobs.filter(j=>!done.has(j.label+'/'+j.depth));
  let next=0,pending=0,failed=false;const start=Date.now();
  const save=()=>fs.writeFileSync(file,JSON.stringify({baselineCommit:'20807de536113e3ef2f155f516f3a154df9db75e',
    ...meta,seedPrefix,n,cap,workers,elapsedMs:Date.now()-start,
    selection:tails?'first six capped seeds per condition with >=6 survivors; conditional sample, not population estimate':'full fixed seed list',
    policy:'existing 1/2-pour evaluation; held units/color breaks use the same .6/2.2 penalties; no-hold wins ties; greedy limit 60/40, room path depth 10/node limit 30000',
    results:results.slice().sort((a,b)=>a.label.localeCompare(b.label)||a.depth-b.depth)},null,2));
  function dispatch(){
    while(!failed&&pending<workers&&next<jobs.length){
      const job=jobs[next++];pending++;const worker=new Worker(__filename,{workerData:job});
      worker.on('message',r=>{if(r.progress)console.log(r.progress);else{results.push(r);save();console.log(JSON.stringify({label:r.label,depth:r.depth,turnP50:r.summary.turnP50,capped:r.summary.capped,unlock8:r.summary.unlock8,holdsPerPlace:r.summary.holdsPerPlace,tripleDeaths:r.summary.tripleDeaths}));}});
      worker.on('error',e=>{failed=true;console.error(e);process.exitCode=1;});
      worker.on('exit',code=>{pending--;if(code){failed=true;process.exitCode=1;}dispatch();if(!pending&&(failed||next===jobs.length)){save();console.log('saved '+file+', elapsed '+((Date.now()-start)/1000)+'s');}});
    }
  }
  dispatch();if(!jobs.length){save();console.log('All comparisons already saved');}
}
