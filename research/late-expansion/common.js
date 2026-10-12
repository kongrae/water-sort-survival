const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out'), EVIDENCE = path.join(ROOT, 'outputs/late-expansion');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const engineCode = source => source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
function baselineFile(copy, repositoryPath) {
  const file=path.join(EVIDENCE,copy);if(fs.existsSync(file))return fs.readFileSync(file,'utf8');
  const baseline=JSON.parse(fs.readFileSync(path.join(OUT,'baseline.json'),'utf8'));
  return require('child_process').execFileSync('git',['show',baseline.commit+':'+repositoryPath],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});
}
function baselineEngine() {
  const source = baselineFile('before-source.html','water-sort-survival.html');
  const harness = baselineFile('before-harness.js','harness.js');
  return new Function(engineCode(source) + harness.match(/new Function\(code \+ `([\s\S]*?)`\)\(\)/)[1])();
}
function write(name, data) { fs.mkdirSync(OUT, {recursive:true}); fs.writeFileSync(path.join(OUT,name), JSON.stringify(data,null,2)+'\n'); }
function metadata() {
  const source=fs.readFileSync(path.join(ROOT,'water-sort-survival.html'));
  return {checkedAt:new Date().toISOString(),sourceSha256:sha(source),engineSha256:sha(engineCode(source.toString())),
    botSha256:sha(fs.readFileSync(path.join(ROOT,'research/expansion/bots.js'))),node:process.version};
}
module.exports={ROOT,OUT,EVIDENCE,sha,engineCode,baselineFile,baselineEngine,write,metadata};
