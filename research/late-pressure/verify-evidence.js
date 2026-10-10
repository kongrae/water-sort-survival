const fs = require('fs'), path = require('path'), assert = require('assert');
const { E } = require('../../harness');
const { ROOT, OUT, EVIDENCE, engineCode, sha, write, metadata } = require('./common');
const read = file => JSON.parse(fs.readFileSync(path.join(OUT,file),'utf8'));
const current = metadata(), checks = [];
function check(name, fn) { fn();checks.push(name);console.log('ok '+name); }
const engineTest = read('engine-test.json'), browser = read('browser.json');
const comparison = read('comparison.json'), tuning = read('tuning.json');
const selection = read('selection.json');
check('final engine statistics and real-input browser results match current engine', () => {
  assert.equal(engineTest.engineSha256,current.engineSha256); assert.equal(browser.engineSha256,current.engineSha256);
  assert.equal(engineTest.passed,9); assert.equal(engineTest.statisticalSamples,480000);
  assert(browser.checks.length>=463 && browser.checks.every(c=>c.pass));
});
check('initial 240 plus bounded 80 tuning games use all prespecified fresh seeds', () => {
  assert.equal(comparison.results.length,6); assert.equal(tuning.results.length,2);
  for (const data of [comparison,tuning]) for (const group of data.results) {
    assert.equal(group.rows.length,40); assert.equal(group.signature,E.rulesSig(group.rules));
    assert.deepStrictEqual(group.rows.map(r=>r.seed),Array.from({length:40},(_,i)=>'late-pressure-20261010-'+i));
    for(const row of group.rows)for(const generated of Object.values(row.generatedPhases)){
      assert.equal(generated.eligible,generated.one+generated.two+generated.triple);
      assert.equal(generated.triple,generated.mono+generated.mixed);
    }
  }
  assert.equal(selection.signature,E.rulesSig(E.sanitizeRules(E.ENDLESS_RULES)));
});
check('measured explicit selected rules replay identically under final default configuration', () => {
  const oldSource=fs.readFileSync(path.join(EVIDENCE,'engine-source-before-tuning.html'),'utf8');
  assert.equal(sha(engineCode(oldSource)),tuning.engineSha256); assert.equal(comparison.engineSha256,tuning.engineSha256);
  const exports=fs.readFileSync(path.join(ROOT,'harness.js'),'utf8').match(/new Function\(code \+ `([\s\S]*?)`\)\(\)/)[1];
  const measured=new Function(engineCode(oldSource)+exports)();
  const rules=E.sanitizeRules(E.ENDLESS_RULES); assert.deepStrictEqual(measured.sanitizeRules(selection.rules),rules);
  for(const score of [4499,4500,7250,10000,12500,15000,20000,25000,50000]){
    const a=measured.newState('endless','selected-equivalence-'+score,selection.rules),b=E.newState('endless',a.seed,rules);
    for(const s of [a,b]){s.score=score;s.bottles=Array.from({length:8},()=>[]);s.growth.activeColors=9;s.growth.pendingIntro=[];}
    for(let i=0;i<12000;i++)assert.deepStrictEqual(E.generatePiece(b),measured.generatePiece(a));
    assert.deepStrictEqual(a,b);
  }
});
check('required final regressions pass; historical feel failure names/counts remain exact', () => {
  const rows=read('after-regressions.json').rows;assert.equal(rows.length,11);
  assert(rows.every(row=>row.exitCode===0 || row.name==='feel'&&row.exitCode===1));
  for(const name of ['engine','holdEngine','expansionEngine','fx','hud','hold','i18n','mobile','real','presentation']) {
    const result=read('after-'+name+'-command.json');assert.equal(result.exitCode,0);assert.equal(result.sourceSha256,current.sourceSha256);
  }
  const before=read('before-feel-command.json'),after=read('after-feel-command.json');
  const failures=result=>result.stdout.split('\n').filter(line=>/^\s+- /.test(line)).map(line=>line.split(' :: ')[0].trim());
  assert.equal(failures(before).length,12);assert.deepStrictEqual(failures(after),failures(before));
  assert(after.stdout.includes('reduce pass 230/230')&&after.stdout.includes('full   pass 300/312'));
});
check('baseline signatures and pre-existing tracked evidence were not rewritten', () => {
  const cp=require('child_process');
  const names=cp.execFileSync('git',['diff','--name-only','--','research'],{cwd:ROOT,encoding:'utf8'}).trim().split('\n');
  assert(names.every(name=>!name || !/\/out\/|baseline\.json$|REPORT\.md$/.test(name)),names.join('\n'));
});
check('paired cold/steady/late performance protocols complete all inputs without runtime errors', () => {
  for(const phase of ['before','after','probe-steady-before','probe-steady-after','probe-late-before','probe-late-after','probe-late-repeat-before','probe-late-repeat-after']){
    const command=read(phase+'-perf-command.json'),data=read(phase+'-perf-perf.json');assert.equal(command.exitCode,0);
    for(const row of Object.values(data)){assert.equal(row.made,55);assert.equal(row.all.n,55);assert(!row.errors?.length);assert.equal(row.longTasks,0);}
  }
});
write('evidence-check.json',{...current,passed:checks.length,checks,selectedCurve:selection.rules.pressureTable,
  comparisonGames:320,physicalDevice:false,humanFun:false});
