const fs=require('fs'),path=require('path'),cp=require('child_process');
const {ROOT,EVIDENCE,sha,write,metadata}=require('./common');
fs.mkdirSync(EVIDENCE,{recursive:true});
for(const [from,to] of [['water-sort-survival.html','before-source.html'],['harness.js','before-harness.js'],['research/expansion/bots.js','before-bots.js']]) {
  const dest=path.join(EVIDENCE,to); if(fs.existsSync(dest))throw Error('Baseline already exists: '+dest);
  fs.copyFileSync(path.join(ROOT,from),dest);
}
write('baseline.json',{...metadata(),commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
  harnessSha256:sha(fs.readFileSync(path.join(ROOT,'harness.js'))),gitStatus:cp.execFileSync('git',['status','--short'],{cwd:ROOT,encoding:'utf8'})});
console.log('Captured pre-change source, engine and bot');
