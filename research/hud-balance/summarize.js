// Summarize the new fixed-seed sample without treating capped games as completed runs.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {execFileSync}=require('child_process');
const BASE=path.resolve(__dirname,'../..'),OUT=path.join(__dirname,'out');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=JSON.parse(fs.readFileSync(path.join(OUT,'comparison-40-1500.json'),'utf8'));
const source=fs.readFileSync(path.join(BASE,'water-sort-survival.html'),'utf8');
assert.equal(raw.engineSha256,sha(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]));
assert.equal(raw.botSha256,sha(fs.readFileSync(path.join(BASE,'research/expansion/bots.js'))));
assert.equal(raw.n,40);assert.equal(raw.cap,1500);assert.equal(raw.seedPrefix,'hud-balance-20261009-');
assert.equal(raw.results.length,8);
const labels=['baseline','hold','both-5','both-10'],summary=[];
for(const label of labels)for(const depth of [1,2]){
  const r=raw.results.find(r=>r.label===label&&r.depth===depth);assert.ok(r);
  assert.equal(r.rows.length,40);
  assert.deepEqual(r.rows.map(r=>r.seed),Array.from({length:40},(_,i)=>raw.seedPrefix+i));
  assert.ok(r.rows.every(r=>r.turn<=1500&&(r.over||r.turn===1500)));
  const placements=r.rows.reduce((n,r)=>n+r.turn,0),s=r.summary;
  const within=(n,turns)=>r.rows.filter(row=>{const u=row.metrics.unlocks.find(u=>u.to>=n);return u&&row.over&&row.turn-u.turn<=turns;}).length;
  summary.push({condition:label,depth,n:40,turnP50:s.turnP50,turnP50Censored:s.turnP50===1500,turnP90:s.turnP90,
    capped:s.capped,cappedRate:s.capped/40,scoreP50:s.scoreP50,unlock7:s.unlock7,unlock7P50:s.unlock7P50,unlock8:s.unlock8,unlock8P50:s.unlock8P50,
    deathsBefore20:r.rows.filter(r=>r.over&&r.turn<20).length,deathsWithin3Of7:within(7,3),deathsWithin3Of8:within(8,3),
    holdsPerPlacement:s.holdsPerPlace,poursPerPlacement:s.poursPerPlace,longestHeldP50:s.longestHeldP50,
    tripleGenerated:s.totals.tripleGenerated,eligibleGenerated:s.totals.eligibleGenerated,
    observedTripleRate:s.totals.eligibleGenerated?s.totals.tripleGenerated/s.totals.eligibleGenerated:null,
    tripleAtDeath:s.tripleDeaths,unknown:s.totals.unknown,placements,
    pureUniqueBoardRate:r.rows.reduce((n,r)=>n+r.metrics.stableAssigned,0)/placements,phase9:s.phases['8b-9c']||null});
}
const paired=[];
for(const depth of [1,2])for(const candidate of ['hold','both-5','both-10']){
  const baseline=raw.results.find(r=>r.label==='baseline'&&r.depth===depth).rows;
  const rows=raw.results.find(r=>r.label===candidate&&r.depth===depth).rows;
  paired.push({candidate,depth,longerOrHigherCap:rows.filter((r,i)=>r.turn>baseline[i].turn).length,
    shorter:rows.filter((r,i)=>r.turn<baseline[i].turn).length,sameObservedTurns:rows.filter((r,i)=>r.turn===baseline[i].turn).length,
    cappedOnlyCandidate:rows.filter((r,i)=>!r.over&&baseline[i].over).length,cappedOnlyBaseline:rows.filter((r,i)=>r.over&&!baseline[i].over).length});
}
const report={checkedAt:new Date().toISOString(),sourceCommitAtStart:execFileSync('git',['rev-parse','HEAD'],{cwd:BASE,encoding:'utf8'}).trim(),
  sourceSha256:sha(source),engineSha256:raw.engineSha256,botSha256:raw.botSha256,rawSha256:sha(fs.readFileSync(path.join(OUT,'comparison-40-1500.json'))),
  runs:320,cap:1500,elapsedMs:raw.elapsedMs,summary,paired,
  conclusion:'HOLD improves reaching eight bottles, but long-run pressure remains weak under the two-pour policy. Raising triples from 5% to 10% is not a proven difficulty fix.',
  limitations:['Automated policies are not novice/skilled human cohorts.','Capped medians are lower bounds, not actual game-length medians.',
    'Same seed does not imply identical deals after HOLD and differing clears/growth.','Triple-at-death is not causal attribution.','No physical-device or human fun/session-length approval.']};
fs.writeFileSync(path.join(OUT,'balance-summary.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({runs:report.runs,cap:report.cap,summary:summary.map(s=>({condition:s.condition,depth:s.depth,p50:s.turnP50,capped:s.capped,unlock8:s.unlock8,tripleRate:s.observedTripleRate}))},null,2));
