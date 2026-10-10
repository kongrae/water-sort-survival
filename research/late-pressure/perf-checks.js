const { spawnSync } = require('child_process');
const { ROOT, write, metadata } = require('./common');
const rows = [];
const configs = [['after',[]],['probe-steady-after',['--steady']],
  ['probe-late-before',['--steady','--pressure','--source=outputs/late-pressure/before-source.html']],
  ['probe-late-after',['--steady','--pressure']]];
for (const [phase,args] of configs) {
  console.log('Starting '+phase+'/perf');
  const result=spawnSync(process.execPath,['research/bottle-quality/run-check.js',phase,'perf','--task=late-pressure',...args],{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});
  console.log(result.stdout||'');if(result.stderr)console.error(result.stderr);
  rows.push({phase,exitCode:result.status});write('perf-checks.json',{...metadata(),rows});
}
if(rows.some(row=>row.exitCode!==0))process.exitCode=1;
