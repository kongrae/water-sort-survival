const fs=require('fs'),path=require('path');
const {OUT,write,metadata}=require('./common');
const read=phase=>JSON.parse(fs.readFileSync(path.join(OUT,phase+'-perf-perf.json')));
const rows=[];
for(const [protocol,before,after]of [['cold','before','after'],['steady','probe-steady-before','probe-steady-after'],
  ['late','probe-late-before','probe-late-after'],['late-repeat','probe-late-repeat-before','probe-late-repeat-after']]){
  const a=read(before),b=read(after);
  for(const setting of Object.keys(a))rows.push({protocol,setting,before:a[setting].all.p90,after:b[setting].all.p90,
    changePct:+((b[setting].all.p90/a[setting].all.p90-1)*100).toFixed(1),
    placeBefore:a[setting].place.p90,placeAfter:b[setting].place.p90,inputs:b[setting].all.n,
    longTasks:b[setting].longTasks,maxFx:b[setting].maxFx});
}
write('perf-summary.json',{...metadata(),rows,interpretation:'Input handling in synthetic Chrome fixtures; no mobile FPS or causal pure-function cost claim. Placement p90 has only ten samples.'});
for(const row of rows)console.log(JSON.stringify(row));
