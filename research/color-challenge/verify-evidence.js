const assert=require('assert'),fs=require('fs'),path=require('path');
const {OUT,ROOT,write,metadata,sha}=require('./common');
async function main(){
  const current=metadata(),checks=[];
  const read=name=>JSON.parse(fs.readFileSync(path.join(OUT,name),'utf8'));
  for(const file of ['engine-test.json','comparison.json','browser.json','demo-browser.json','pressure-engine-test.json']){
    const data=read(file);assert.equal(data.sourceSha256,current.sourceSha256,file+' source drift');
    assert.equal(data.engineSha256,current.engineSha256,file+' engine drift');
    if(data.checks?.[0]?.pass!==undefined)assert(data.checks.every(c=>c.pass),file+' failed checks');
    checks.push(file+' bound to final source');
  }
  const comparison=read('comparison.json');assert(comparison.complete&&comparison.rows.length===48);
  for(const name of ['engine','holdEngine','expansionEngine','hud','fx','presentation']){
    const data=read('after-'+name+'-command.json');assert.equal(data.exitCode,0,name+' exit');assert.equal(data.sourceSha256,current.sourceSha256,name+' drift');
  }
  const perf=read('after-perf-perf.json');for(const run of Object.values(perf)){assert.equal(run.made,55);assert.equal(run.all.n,55);assert.equal(run.errors.length,0);assert.equal(run.longTasks,0);}
  checks.push('all required regression commands and performance sequences passed');
  const build=fs.readFileSync(path.join(ROOT,'dist/index.html')),response=await fetch('http://127.0.0.1:8154/');
  assert.equal(response.status,200);assert(Buffer.from(await response.arrayBuffer()).equals(build));
  checks.push('local served bytes match final build');
  const demo=await fetch('http://127.0.0.1:8159/game?goal=1');assert.equal(demo.status,200);
  write('verification.json',{...current,passed:checks.length,checks,buildSha256:sha(build),localPlay:'http://127.0.0.1:8154/',demo:'http://127.0.0.1:8159/',publicDeployed:false});
  console.log(checks.length+' final evidence checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
