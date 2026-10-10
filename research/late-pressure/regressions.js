// Sequential browser runs avoid shared generated page/profile/port collisions. Historical outputs are restored.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { ROOT, write, metadata } = require('./common');
const phase = process.argv.includes('--before') ? 'before' : 'after';
const names = phase === 'before' ? ['feel'] : ['engine','holdEngine','expansionEngine','fx','hud','hold','i18n','mobile','real','presentation','feel'];
const rows = [];
for (const name of names) {
  console.log('Starting ' + phase + '/' + name);
  const args = ['research/bottle-quality/run-check.js',phase,name,'--task=late-pressure'];
  if (phase === 'before') args.push('--source=outputs/late-pressure/before-source.html');
  const result = spawnSync(process.execPath,args,{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});
  rows.push({name,exitCode:result.status,error:result.error?.message});
  console.log((result.stdout || '').trim().split('\n').slice(-4).join('\n'));
  if (result.stderr) console.error(result.stderr);
  write(phase + '-regressions.json',{...metadata(),rows});
}
if (rows.some(row => row.exitCode !== 0 && row.name !== 'feel')) process.exitCode = 1;
console.log('Finished ' + phase + ': ' + JSON.stringify(rows));
