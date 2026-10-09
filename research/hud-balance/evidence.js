// Verify the final candidate against captured UI, engine and balance evidence.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {execFileSync}=require('child_process');
const BASE=path.resolve(__dirname,'../..'),OUT=path.join(__dirname,'out');
const read=file=>JSON.parse(fs.readFileSync(path.join(OUT,file),'utf8'));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
async function main(){
  const source=fs.readFileSync(path.join(BASE,'water-sort-survival.html'),'utf8'),sourceSha256=sha(source);
  const engineSha256=sha(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]);
  const before=read('ui-before.json'),ui=read('ui-after.json'),counter=read('ui-counter.json'),presentation=read('presentation/after.json'),balance=read('balance-summary.json');
  assert.equal(engineSha256,before.engineSha256);assert.equal(engineSha256,balance.engineSha256);
  for(const r of [ui,counter,presentation,balance])assert.equal(r.sourceSha256,sourceSha256,'Evidence must match the final runtime');
  const files=[['compact HUD','ui-after.json','checks'],['count animation CPU x4','ui-counter.json','checks'],
    ['presentation','presentation/after.json','rows'],['HOLD/triple input','hold-triple-browser.json','rows'],
    ['UIUX','uiux-browser.json','rows'],['i18n','i18n-browser.json','rows'],['effects','fx-browser.json','checks'],['mobile','mobile-browser.json','checks']];
  const results=files.map(([name,file,key])=>{const rows=read(file)[key];assert.ok(rows.length);assert.ok(rows.every(r=>r.pass),name+' failed');return{name,file,total:rows.length,failures:0};});
  const geometry=ui.geometry.filter(g=>g.lang==='ko'&&g.tray==='bottom'&&g.n===6).map(g=>{
    const old=before.geometry.find(b=>b.key===g.key);assert.ok(old);
    return{viewport:[g.w,g.h],safeArea:[g.top,g.bottom],beforeGlass:old.game.glass[0].h,afterGlass:g.game.glass[0].h,
      beforeDailyGlass:old.daily.glass[0].h,afterDailyGlass:g.daily.glass[0].h,
      beforeHud:old.game.runInfo.b-old.game.top.y,afterHud:g.game.runInfo.b-g.game.top.y};
  });
  assert.ok(ui.geometry.every(g=>g.game.glass.every(b=>Math.abs(b.h-g.daily.glass[0].h)<.2)));
  const commands=['test-v2.js','research/hold-triple/engine-test.js','research/expansion/engine-test.js'];
  const logs=commands.map(command=>({command:'node '+command,exitCode:0,output:execFileSync(process.execPath,[path.join(BASE,command)],{cwd:BASE,encoding:'utf8',timeout:180000})}));
  fs.writeFileSync(path.join(OUT,'engine-checks.json'),JSON.stringify({engineSha256,commands:logs},null,2)+'\n');
  const distSha256=sha(fs.readFileSync(path.join(BASE,'dist/index.html')));
  const preview=await fetch('http://127.0.0.1:8151/',{signal:AbortSignal.timeout(10000)});
  assert.ok(preview.ok);const previewSha256=sha(Buffer.from(await preview.arrayBuffer()));assert.equal(previewSha256,distSha256);
  const report={checkedAt:new Date().toISOString(),baselineCommit:'0d39aeb607232b898c5e043827be8e5c99ee506e',
    baselineSourceSha256:before.sourceSha256,sourceSha256,engineSha256,engineUnchanged:true,distSha256,
    preview:{url:'http://127.0.0.1:8151/',status:preview.status,sha256:previewSha256,matchesDist:true},results,geometry,
    balance:{runs:balance.runs,cap:balance.cap,engineMatches:true,botSha256:balance.botSha256},
    sameBottleHeightAcrossModes:true,physicalDevice:false,humanBalanceApproved:false};
  fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
