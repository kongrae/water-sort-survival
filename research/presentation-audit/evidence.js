// Gather this audit's evidence without replacing the preceding feature experiment's results.
// node research/presentation-audit/evidence.js [--capture-regressions] [--restore-previous]
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const BASE=path.resolve(__dirname,'../..'),OUT=path.join(__dirname,'out');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=file=>fs.readFileSync(path.join(BASE,file),'utf8');
async function main(){
  if(process.argv.includes('--capture-regressions')){
    const files={'uiux-browser':'research/uiux/out/after.json','fx-browser':'outputs/fx-polish/after.json','performance':'research/feel/out/perf.json'};
    for(const [name,file]of Object.entries(files))fs.copyFileSync(path.join(BASE,file),path.join(OUT,name+'.json'));
  }
  if(process.argv.includes('--restore-previous')){
    for(const file of ['research/hold-triple/out/browser.json','research/hold-triple/out/distribution.json','research/expansion/out/browser.json','research/uiux/out/after.json','research/i18n/browser.json','research/feel/out/perf.json'])
      fs.copyFileSync(path.join(BASE,'outputs/presentation-audit/previous-evidence',file),path.join(BASE,file));
  }
  const source=read('water-sort-survival.html'),dist=read('dist/index.html');
  const before=require('./out/before.json'),after=require('./out/after.json'),probe=require('./out/probe.json');
  const finalRows=new Map(after.rows.map(row=>[row.name,row]));
  const paired={total:before.rows.length,passed:before.rows.filter(row=>finalRows.get(row.name)?.pass).length,
    missing:before.rows.filter(row=>!finalRows.has(row.name)).map(row=>row.name)};
  const response=await fetch('http://127.0.0.1:8151/'),served=await response.text();
  const result={checkedAt:new Date().toISOString(),sourceSha256:hash(source),engineSha256:hash(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]),
    distSha256:hash(dist),beforeSha256:before.sourceSha256,regressionCheckpointSha256:probe.sourceSha256,
    auditSourceMatches:hash(source)===after.sourceSha256,engineUnchanged:before.engineSha256===after.engineSha256,
    preview:{url:'http://127.0.0.1:8151/',status:response.status,sha256:hash(served),matchesDist:hash(served)===hash(dist)},
    before:{total:before.rows.length,failures:before.rows.filter(r=>!r.pass).length},after:{total:after.rows.length,failures:after.rows.filter(r=>!r.pass).length},paired,
    performance:require('./out/performance.json'),physicalDevice:false};
  fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(!result.auditSourceMatches||!result.engineUnchanged||!response.ok||!result.preview.matchesDist||result.after.failures||paired.passed!==paired.total||paired.missing.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
