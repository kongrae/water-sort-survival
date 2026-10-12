const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),{ROOT,OUT,metadata,sha,write}=require('./common');
const names=process.argv.slice(2).length?process.argv.slice(2):['engine','expansionEngine','holdEngine','lateEngine','pressureEngine','goalEngine','hud','hold','fx','mobile','i18n','real','presentation','feel'];
const results=[];
for(const name of names){const start=Date.now(),args=['research/bottle-quality/run-check.js','after',name,'--task=full-board'];
 const result=spawnSync(process.execPath,args,{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});
 results.push({name,command:'node '+args.join(' '),exitCode:result.status,elapsedMs:Date.now()-start});write('regressions-'+names[0]+'.json',{...metadata(),testSha256:sha(fs.readFileSync(__filename)),results});
 console.log(name+': exit '+result.status+'; '+(result.stdout||'').trim().slice(-1500));if(result.stderr)console.log(result.stderr.slice(-1800));
}
if(results.some(r=>r.exitCode!==0))process.exitCode=1;
