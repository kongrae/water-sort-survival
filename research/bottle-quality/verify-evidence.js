// Verify that the final evidence belongs to the current source, without rerunning browsers.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const BASE=path.resolve(__dirname,'../..'),DATA=path.join(__dirname,'out');
const read=p=>JSON.parse(fs.readFileSync(path.join(DATA,p),'utf8'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const source=fs.readFileSync(path.join(BASE,'water-sort-survival.html'),'utf8'),sourceSha256=sha(source);
const engineSha256=sha(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]);
const baseline=read('baseline.json'),quality=read('after.json');
assert.equal(engineSha256,baseline.engineSha256,'engine changed');
assert.equal(quality.sourceSha256,sourceSha256,'quality evidence is stale');
assert(quality.checks.every(c=>c.pass),'quality check failed');
const commands={};
for(const name of ['engine','holdEngine','expansionEngine','fx','hud','hold','i18n','mobile','real','perf','presentation']){
  const r=read('after-'+name+'-command.json');
  assert.equal(r.sourceSha256,sourceSha256,name+' evidence is stale');
  assert.equal(r.exitCode,0,name+' failed');
  commands[name]={command:r.command,checkedAt:r.checkedAt,exitCode:r.exitCode};
}
const presentation=read('presentation/after.json');
assert.equal(presentation.sourceSha256,sourceSha256);
assert(presentation.rows.every(c=>c.pass));
const feel=read('after-feel-command.json'),oldFeel=read('before-feel-command.json');
assert.equal(feel.sourceSha256,sourceSha256);
assert.equal(oldFeel.sourceSha256,baseline.sourceSha256);
const failures=r=>r.stdout.split('\n').filter(l=>l.startsWith('       - '));
const geometry=r=>failures(r).filter(l=>l.startsWith('       - [geo ')).map(l=>l.split(' :: ')[0].trim());
assert.equal(failures(feel).length,12,'unexpected feel failures');
assert.deepEqual(geometry(feel),geometry(oldFeel),'new feel geometry regression');
const before=read('before.json');
assert.equal(before.sourceSha256,baseline.sourceSha256,'baseline visual evidence changed source');
assert(before.checks.every(c=>c.pass),'baseline visual check failed');
assert.deepEqual(quality.geometry.map(g=>[g.glass,g.tubes,g.cup]),before.geometry.map(g=>[g.glass,g.tubes,g.cup]),'geometry changed');
const performance=read('after-perf-perf.json');
for(const r of Object.values(performance))assert(r.made===55&&r.errors.length===0&&r.longTasks===0);
const steadyBefore=read('probe-steady-before-perf-perf.json'),steadyAfter=read('probe-steady-repeat-perf-perf.json'),steadyComparison={};
for(const phase of ['probe-steady-before','probe-steady-after','probe-steady-repeat']){
  const log=read(phase+'-perf-command.json'),data=read(phase+'-perf-perf.json');
  assert.equal(log.exitCode,0);assert.equal(log.sourceSha256,phase.endsWith('before')?baseline.sourceSha256:sourceSha256);
  for(const r of Object.values(data))assert(r.made===55&&r.errors.length===0&&r.longTasks===0&&r.protocol.warmupMoves===20&&r.protocol.seed==='bottle-quality-perf-fixed');
}
for(const key of Object.keys(steadyBefore))steadyComparison[key]={before:steadyBefore[key].all,after:steadyAfter[key].all,p90ChangePercent:+((steadyAfter[key].all.p90/steadyBefore[key].all.p90-1)*100).toFixed(1)};
const build=fs.readFileSync(path.join(BASE,'dist/index.html'),'utf8');
const embedded=source.replace(/<title>[^<]*<\/title>/,'').replace(/<meta name="description"[^>]*>/,'');
assert(build.includes(embedded),'build is stale');
const result={checkedAt:new Date().toISOString(),sourceSha256,engineSha256,buildSha256:sha(build),
  qualityChecks:quality.checks.length,identicalGeometryConditions:quality.geometry.length,presentationChecks:presentation.rows.length,
  commands,knownBaselineFailures:geometry(feel),performance,steadyComparison,physicalDevice:false,deployed:false};
fs.writeFileSync(path.join(DATA,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log('Final evidence verified; '+result.qualityChecks+' quality checks, '+result.presentationChecks+' presentation checks; '+result.knownBaselineFailures.length+' explicitly retained baseline feel failures.');
