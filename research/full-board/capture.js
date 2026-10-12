const fs=require('fs'),path=require('path'),cp=require('child_process');
const {ROOT,OUT,EVIDENCE,sha,write,metadata}=require('./common');
if(fs.existsSync(path.join(OUT,'baseline.json')))throw Error('Baseline already exists; never replace it');
fs.mkdirSync(path.join(OUT,'baseline'),{recursive:true});fs.mkdirSync(EVIDENCE,{recursive:true});const files={};
for(const [from,to]of [['water-sort-survival.html','before-source.html'],['harness.js','before-harness.js'],['research/expansion/bots.js','before-bots.js']]){
 const bytes=fs.readFileSync(path.join(ROOT,from));fs.writeFileSync(path.join(OUT,'baseline',to),bytes);fs.writeFileSync(path.join(EVIDENCE,to),bytes);files[to]={repositoryPath:from,sha256:sha(bytes)};
}
const {E}=require('../../harness');write('baseline.json',{...metadata(),files,rules:E.ENDLESS_RULES,signature:E.rulesSig(E.ENDLESS_RULES),harnessSha256:files['before-harness.js'].sha256,
 commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),gitStatus:cp.execFileSync('git',['status','--short'],{cwd:ROOT,encoding:'utf8'})});
console.log('Captured exact dirty working tree and portable, hash-checked baseline');
