const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {E}=require('../../harness'),{ROOT,OUT,metadata,sha,write}=require('./common');
const read=name=>JSON.parse(fs.readFileSync(path.join(OUT,name),'utf8'));
async function main(){
  const current=metadata(),checks=[];
  for(const file of ['engine-test.json','browser.json','extras-browser.json','demo-browser.json','growth-browser.json','pressure-engine-test.json','color-engine-test.json']){
    const d=read(file);assert.equal(d.sourceSha256,current.sourceSha256,file+' source drift');assert.equal(d.engineSha256,current.engineSha256,file+' engine drift');
    assert(d.checks?.length);assert(d.checks.every(c=>typeof c==='string'||c.pass),file+' failed checks');checks.push(file+' matches final source');
  }
  assert.equal(read('growth-browser.json').testSha256,sha(fs.readFileSync(path.join(ROOT,'uitest/late-expansion.js'))));
  const comparison=read('comparison.json');assert(comparison.complete&&comparison.n===40&&comparison.cap===1500&&comparison.results.length===3);
  // UI refinements happened during this long pure-engine comparison; its original full-source hash is retained.
  assert.equal(comparison.engineSha256,current.engineSha256);assert.equal(comparison.botSha256,current.botSha256);
  assert.equal(comparison.comparisonSha256,sha(fs.readFileSync(path.join(ROOT,'research/late-expansion/compare.js'))));
  const baseline=comparison.results.find(r=>r.label==='baseline'),full=comparison.results.find(r=>r.label==='full');
  assert.deepEqual(baseline.rules,E.sanitizeRules(E.COLOR_ENDLESS_RULES));assert.deepEqual(full.rules,E.sanitizeRules(E.ENDLESS_RULES));
  for(const result of comparison.results){assert.equal(result.rows.length,40);assert.equal(result.summary.unknown,0);
    for(const phase of ['below10000','10000-11999'])assert.deepEqual(result.summary.phases[phase],baseline.summary.phases[phase]);
    for(let i=0;i<40;i++)for(const score of [10000,12000])assert.deepEqual(result.rows[i].milestones[score],baseline.rows[i].milestones[score]);}
  checks.push('120 fresh comparisons use exact final engine, unchanged bot and matching early progression');
  const regressions=read('regressions.json');assert(regressions.rows.length===10&&regressions.rows.every(r=>r.exitCode===0));
  for(const row of regressions.rows){const d=read('after-'+row.name+'-command.json');assert.equal(d.exitCode,0);assert.equal(d.sourceSha256,current.sourceSha256);}
  checks.push('all required existing regression commands passed against final source');
  const failures=d=>d.stdout.split('\n').filter(line=>/^\s+- \[/.test(line)).map(line=>line.split(' :: ')[0].trim()).sort();
  const beforeFeel=read('before-feel-command.json'),afterFeel=read('after-feel-command.json');assert.equal(beforeFeel.sourceSha256,read('baseline.json').sourceSha256);assert.equal(afterFeel.sourceSha256,current.sourceSha256);
  assert.equal(failures(beforeFeel).length,12);assert.deepEqual(failures(afterFeel),failures(beforeFeel));assert(afterFeel.stdout.includes('reduce pass 230/230')&&afterFeel.stdout.includes('full   pass 300/312'));
  checks.push('12 known full-motion failures match the freshly captured baseline; reduced motion passes');
  for(const phase of ['before','after']){
    const command=read(phase+'-perf-command.json'),perf=read(phase+'-perf-perf.json');assert.equal(command.exitCode,0);
    assert.equal(command.sourceSha256,phase==='before'?read('baseline.json').sourceSha256:current.sourceSha256);
    for(const run of Object.values(perf)){assert.equal(run.made,55);assert.equal(run.all.n,55);assert.equal(run.errors.length,0);}
  }
  checks.push('paired 9-color/8-bottle and 10-color/9-bottle performance runs contain 55 valid moves each');
  const planner=read('planner-perf.json');assert.equal(planner.sourceSha256,current.sourceSha256);assert.equal(planner.engineSha256,current.engineSha256);
  assert.equal(planner.baselineSourceSha256,read('baseline.json').sourceSha256);assert.equal(planner.baselineEngineSha256,read('baseline.json').engineSha256);
  assert.equal(planner.benchmarkSha256,sha(fs.readFileSync(path.join(ROOT,'research/late-expansion/planner-perf.js'))));
  assert.equal(planner.errors.length,0);assert.equal(planner.results.length,2);
  for(const result of planner.results){assert.equal(result.n,400);assert.equal(result.samplesMs.length,400);assert.equal(result.found,result.replays);assert(result.found>0&&result.examinedMax<=768);}
  checks.push('paired 400-case bounded goal searches use exact before/after engines and replay all returned paths');
  const build=fs.readFileSync(path.join(ROOT,'dist/index.html')),response=await fetch('http://127.0.0.1:8154/');assert.equal(response.status,200);assert(Buffer.from(await response.arrayBuffer()).equals(build));
  for(const score of [12000,18000])assert.equal((await fetch('http://127.0.0.1:8160/game?score='+score)).status,200);
  checks.push('local served build matches exact bytes; isolated previews are available');
  write('verification.json',{...current,passed:checks.length,checks,buildSha256:sha(build),comparisonSourceSha256:comparison.sourceSha256,
    comparisonScope:'pure final engine hash matches; original pre-UI-refinement source hash retained',knownFailures:failures(afterFeel),localPlay:'http://127.0.0.1:8154/',demo:'http://127.0.0.1:8160/',publicDeployed:false});
  console.log(checks.length+' final evidence checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
