const {spawnSync}=require('child_process'),{ROOT,write,metadata}=require('./common');
const rows=[];
for(const name of ['engine','expansionEngine','holdEngine','hud','hold','fx','mobile','i18n','real','presentation']){
  console.log('Starting '+name);const r=spawnSync(process.execPath,['research/bottle-quality/run-check.js','after',name,'--task=late-expansion'],{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});
  rows.push({name,exitCode:r.status,error:r.error?.message});console.log((r.stdout||'').trim().split('\n').slice(-3).join('\n'));if(r.status)console.error(r.stderr);
  write('regressions.json',{...metadata(),rows});
}
if(rows.some(r=>r.exitCode!==0))process.exitCode=1;
