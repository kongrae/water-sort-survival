const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(__dirname,'out'),EVIDENCE=path.join(ROOT,'outputs/full-board');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const engineCode=source=>source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
function write(name,data){const file=path.join(OUT,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
function metadata(){const source=fs.readFileSync(path.join(ROOT,'water-sort-survival.html'));return {checkedAt:new Date().toISOString(),sourceSha256:sha(source),engineSha256:sha(engineCode(source.toString())),botSha256:sha(fs.readFileSync(path.join(ROOT,'research/expansion/bots.js'))),node:process.version};}
function baselineFile(copy){const manifest=JSON.parse(fs.readFileSync(path.join(OUT,'baseline.json'),'utf8')),entry=manifest.files[copy];if(!entry)throw Error('Unknown baseline file '+copy);
 const bytes=fs.readFileSync(path.join(OUT,'baseline',copy));if(sha(bytes)!==entry.sha256)throw Error('Baseline snapshot mismatch '+copy);return bytes.toString();}
function baselineEngine(){return new Function(engineCode(baselineFile('before-source.html'))+baselineFile('before-harness.js').match(/new Function\(code \+ `([\s\S]*?)`\)\(\)/)[1])();}
module.exports={ROOT,OUT,EVIDENCE,sha,engineCode,write,metadata,baselineFile,baselineEngine};
