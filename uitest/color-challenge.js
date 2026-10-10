// Built-page goal checks. Fixtures use a separate origin; gameplay uses native CDP input.
const fs=require('fs'),path=require('path'),http=require('http'),{spawn,execFileSync}=require('child_process');
const {ROOT,EVIDENCE,write,metadata}=require('../research/color-challenge/common');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],geometry=[],fontLoads=[];
function ck(name,pass,detail){checks.push({name,pass:!!pass,...(!pass?{detail}:{})});if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail));}
async function main(){
  execFileSync(process.execPath,['build-pages.js'],{cwd:ROOT,stdio:'ignore'});
  const init=`<script>
    const p=new URLSearchParams(location.search);
    if(p.get('reset')!=='0'){
      localStorage.clear();localStorage.setItem('wsurv.seenHelp','true');localStorage.setItem('wsurv.locale',JSON.stringify(p.get('lang')||'ko'));
      localStorage.setItem('wsurv.themes.owned','["lab","cafe","gem","deep"]');
      localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,staged:false,sound:false,vibrate:false,fx:p.get('fx')||'juicy',reduceFx:p.get('reduce')==='1',
        controls:p.get('controls')||'classic',tray:p.get('tray')||'bottom',skin:p.get('skin')||'lab',symbols:true,theme:'dark'}));
    }
    window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});}}};
  </script>`;
  const clean=s=>s.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/,'const FIREBASE_CONFIG = null;')
    .replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g,(_,side)=>'var(--test-safe-'+side+',0px)')
    .replace('function endlessRules() {','window.__endlessRules=endlessRules;window.__startGame=startGame;window.__bestKey=()=>bestKey();\n  function endlessRules() {');
  const after=clean(fs.readFileSync(path.join(ROOT,'dist/index.html'),'utf8')).replace('<body>','<body>'+init);
  const before='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
    '<style>:root{color-scheme:dark;box-sizing:border-box}body{margin:0}[hidden]{display:none!important}</style><body>'+init+
    clean(fs.readFileSync(path.join(EVIDENCE,'before-source.html'),'utf8'))+'</body></html>';
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.url.startsWith('/before')?before:after);});
  await new Promise(r=>server.listen(8158,'127.0.0.1',r));
  const profile=path.join(EVIDENCE,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});
  const chrome=spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let ws;
  try{
    const activePort=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(activePort);i++)await wait(100);
    const port=Number(fs.readFileSync(activePort,'utf8').split('\n')[0]);const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();ws.onmessage=event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(m.error.message)):r(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const load=async(params={},old=false)=>{
      await send('Page.navigate',{url:'http://127.0.0.1:8158/'+(old?'before':'')+'?'+new URLSearchParams(params)});
      for(let i=0;i<100;i++){await wait(30);if(await js('!!window.__snapFn?.().S'))break;}
      fontLoads.push({params,old,...await js('Promise.race([document.fonts.ready.then(()=>({loaded:true})),new Promise(r=>setTimeout(()=>r({loaded:false}),2500))])')});
    };
    const fixture=async({color=0,score=10000,kind='active',legacy=false,mode='endless'}={})=>{
      await js(`(()=>{const s=newState('${mode}','color-ui',sanitizeRules(${mode==='daily'?'DEFAULT_RULES':legacy?'PRESSURE_ENDLESS_RULES':'ENDLESS_RULES'}));
        s.score=${score};s.cum=[];s.rescueAds=0;s.bestAtStart=1e14;s.newBestShown=true;
        ${mode==='endless'?`s.bottles=[[${color},${color},${color}],[${color},${color},${color}],[],[],[],[],[],[]];s.growth.activeColors=9;s.growth.pendingIntro=[];
        s.piece=[${color}];s.growth.pieceIntro=-1;s.growth.queue=[{piece:[${color}],intro:-1},{piece:[1],intro:-1}];`:''}
        ${!legacy&&mode==='endless'&&kind==='active'?'updateColorChallenge(s,{},false);':''}
        ${!legacy&&mode==='endless'&&kind==='waiting'?`s.bottles=Array.from({length:8},()=>[]);s.piece=[0];s.growth.queue=[{piece:[1],intro:-1},{piece:[2],intro:-1}];updateColorChallenge(s,{},false);`:''}
        window.__boot({S:s});return true;})()`);await wait(30);
    };
    const state=()=>js('window.__snapFn().S');
    const geom=()=>js(`(()=>{const ci=document.getElementById('colorInfo'),box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
      const range=document.createRange();range.selectNodeContents(ci);return{glass:box(document.querySelector('#rack .glass')),runInfo:box(document.getElementById('runInfo')),
        text:ci.textContent,title:ci.title,aria:ci.getAttribute('aria-label'),note:box(ci),textWidth:range.getBoundingClientRect().width,
        actions:box(document.querySelector('.actions')),scroll:[scrollX,scrollY,document.documentElement.scrollWidth,document.documentElement.scrollHeight],
        viewport:[innerWidth,innerHeight],errors:__errors};})()`);
    const shot=async name=>{const value=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(EVIDENCE,name+'.png'),Buffer.from(value.data,'base64'));};
    const press=async(selector,mouse=false,delay=80)=>{
      const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(mouse){await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});}
      else{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0,radiusX:5,radiusY:5,force:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      if(delay)await wait(delay);
    };
    const place=async(i,controls='classic',mouse=false)=>{if(controls==='classic')await press('#cup',mouse);await press('#rack [data-i="'+i+'"]',mouse);};
    if(process.argv.includes('--demo-only')){
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      const demo=async goal=>{await send('Page.navigate',{url:'http://127.0.0.1:8159/game?goal='+goal});for(let i=0;i<100;i++){await wait(30);if(await js('!!window.__snapFn?.().S'))break;}};
      await demo(1);ck('demo offers the preparation target',(await state()).challenge.active?.color===0&&(await state()).challenge.active?.goal===1);
      await press('#rack [data-i="2"]');await press('#rack [data-i="1"]');
      ck('demo alternative clear ends only bonus',(await state()).challenge.lastResult.reason==='other-color'&&!(await state()).over);
      await demo(1);await place(0);await place(0);ck('demo target-first succeeds',(await state()).challenge.completed===1&&(await state()).challenge.bonusTotal===150);
      ck('demo never writes player records',await js('Object.keys(localStorage).filter(k=>/^wsurv\.(game|best|stars|pace|last|runs)/.test(k)).length===0'));
      await demo(2);await place(0);await place(1);ck('demo two-bottle goal succeeds',(await state()).challenge.completed===1&&(await state()).challenge.bonusTotal===300);
      ck('demo runtime errors',await js('__errors.length===0'));await shot('demo-mobile');
      console.log('Demo '+checks.filter(c=>c.pass).length+'/'+checks.length);if(checks.some(c=>!c.pass))process.exitCode=1;return;
    }
    for(const [width,height,safeTop,safeBottom]of [[360,640,0,0],[390,724,47,34]])for(const lang of ['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id'])for(const tray of ['bottom','top']){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await load({lang,tray});
      await js(`document.documentElement.style.setProperty('--test-safe-top','${safeTop}px');document.documentElement.style.setProperty('--test-safe-bottom','${safeBottom}px');dispatchEvent(new Event('resize'));true`);
      await fixture({mode:'daily',score:0});const daily=await geom();
      const cases=[...Array.from({length:9},(_,color)=>({color})),{score:4500,kind:'locked'},{kind:'waiting'}];
      for(const item of cases){await fixture(item);const g=await geom(),key=[width,height,lang,tray,item.color??item.kind].join('/');geometry.push({key,daily,game:g});
        ck('bottle height/HUD/'+key,Math.abs(g.glass.h-daily.glass.h)<.2&&g.runInfo.h<=44.2,g);
        ck('localized objective fits/'+key,g.textWidth<=g.note.w+.5&&g.text.length>0&&!/\{\d\}/.test(g.text),g);
        ck('safe area/scroll/errors/'+key,g.actions.b<=height-safeBottom+.2&&g.scroll[0]===0&&g.scroll[1]===0&&g.scroll[2]<=width&&g.errors.length===0,g);
      }
      if(lang==='ko'&&tray==='bottom')await shot('ko-'+width+'-waiting');
    }
    console.log('Localized geometry '+checks.filter(c=>c.pass).length+'/'+checks.length);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    for(const controls of ['classic','tapPlace'])for(const mouse of [false,true]){
      await load({controls});await fixture();const before=await state();const note=await geom();
      ck('accessible target/'+controls+'/'+mouse,note.aria.includes('빨강')&&note.aria.includes('300')&&note.text.includes('0/2'));
      await place(0,controls,mouse);const progressed=await state();
      ck('native partial goal/'+controls+'/'+mouse,progressed.challenge.active.progress===1&&progressed.score===10100&&progressed.turn===1,progressed.challenge);
      await press('#btnUndo',mouse);const undone=await state();ck('undo partial goal/'+controls+'/'+mouse,JSON.stringify(undone.challenge)===JSON.stringify(before.challenge)&&undone.score===10000);
      await place(0,controls,mouse);const saved=await state();await load({reset:'0'});const resumed=await state();
      ck('real reload restores goal/queue/'+controls+'/'+mouse,JSON.stringify(resumed.challenge)===JSON.stringify(saved.challenge)&&JSON.stringify(resumed.growth)===JSON.stringify(saved.growth));
      await place(1,controls,mouse);const complete=await state();
      ck('native success/reward once/'+controls+'/'+mouse,complete.score===10600&&complete.challenge.completed===1&&complete.challenge.bonusTotal===300&&!complete.challenge.active,complete.challenge);
      await press('#btnUndo',mouse);const revert=await state();ck('undo success restores reward/progress/'+controls+'/'+mouse,revert.score===10100&&revert.challenge.bonusTotal===0&&revert.challenge.active.progress===1);
      await place(1,controls,mouse);ck('replay completion is deterministic/'+controls+'/'+mouse,(await state()).score===10600&&(await state()).challenge.completed===1);
      await wait(650);const g=await geom();ck('completed HUD fits/'+controls+'/'+mouse,g.textWidth<=g.note.w+.5&&g.text.includes('✓1')&&g.errors.length===0,g);
    }
    await load();await fixture({score:9999,kind:'locked'});await place(0);const crossed=await state();
    ck('native unlock is not retroactive',crossed.challenge.active?.progress===0&&crossed.challenge.active.goal===1&&crossed.score===10099);
    await load({controls:'tapPlace'});await fixture();await press('#btnHold',false,20);await press('#btnHold',false,20);const held=await state();
    ck('rapid HOLD never spends objective allowance',held.turn===0&&held.holdUsed&&held.challenge.active.startTurn===0&&held.challenge.active.progress===0);
    await load({controls:'tapPlace'});await fixture();
    for(let i=0;i<12;i++){await js(`window.__snapFn().S.piece=[1];true`);await place(2+i%6,'tapPlace');}
    const missed=await state();ck('native expiry keeps game alive without reward',!missed.over&&missed.challenge.missed===1&&missed.challenge.completed===0&&missed.challenge.bonusTotal===0&&missed.turn===12&&missed.challenge.lastResult.reason==='placements',missed.challenge);
    await load();await fixture();await js('(()=>{const s=window.__snapFn().S;s.bottles[2]=[1,1,1];s.piece=[1];window.__boot({S:s});return true;})()');await place(2);
    const other=await state();ck('native other-color-first ends only bonus goal',!other.over&&other.score===10100&&other.challenge.lastResult.reason==='other-color'&&other.challenge.bonusTotal===0&&other.challenge.missed===1,other.challenge);
    await load();await fixture({legacy:true});const legacy=await state();
    await js('localStorage.setItem(window.__bestKey(),"777");localStorage.setItem("wsurv.rules",JSON.stringify(PRESSURE_ENDLESS_RULES));true');
    const oldKey=await js('window.__bestKey()');await load({reset:'0'});
    ck('old live run stays on its original policy',!(await state()).rules.colorChallengeVersion&&JSON.stringify((await state()).growth)===JSON.stringify(legacy.growth));
    ck('next fresh default upgrades only standard settings',await js('window.__endlessRules().colorChallengeVersion===1'));
    await js('localStorage.setItem("wsurv.rules.custom","true");true');ck('explicit custom stays unchanged',await js('!window.__endlessRules().colorChallengeVersion'));
    await js('localStorage.removeItem("wsurv.rules.custom");window.__startGame("endless",true);true');
    ck('new rules keep old records under their old key',await js(`window.__snapFn().S.rules.colorChallengeVersion===1&&JSON.parse(localStorage.getItem(${JSON.stringify(oldKey)}))===777&&window.__bestKey()!==${JSON.stringify(oldKey)}`));
    await fixture();await js('(()=>{const s=window.__snapFn().S;delete s.challenge;localStorage.setItem("wsurv.game.endless",JSON.stringify(s));return true;})()');await load({reset:'0'});
    ck('damaged objective save is protected for recovery',await js('!!JSON.parse(localStorage.getItem("wsurv.recovery.endless")).saved.rules.colorChallengeVersion&&window.__snapFn().S.score===0'));
    for(const fx of ['base','juicy'])for(const reduce of ['0','1']){
      await load({fx,reduce});await fixture();await place(0);await place(1);await wait(800);
      ck('goal FX complete/cleanup/'+fx+'/'+reduce,await js('__errors.length===0&&window.__snapFn().S.challenge.bonusTotal===300&&document.querySelectorAll(".overlay:not([hidden])").length===0'));
      await press('#btnNew');await press('#btnNew');await wait(100);
      ck('new game clears objective and FX/'+fx+'/'+reduce,await js('window.__snapFn().S.score===0&&window.__snapFn().S.challenge.active===null&&document.querySelectorAll(".challenge-target").length===0&&document.getElementById("banner").hidden'));
    }
    for(const skin of ['lab','cafe','gem','deep']){await load({skin});await fixture({color:4});const g=await geom();ck('target skin geometry/'+skin,g.glass.h>=135&&g.textWidth<=g.note.w+.5&&g.errors.length===0,g);await shot('skin-'+skin);}
    await load({reduce:'1'});await fixture();await place(0);await place(1);await js('giveUp(window.__snapFn().S);window.__boot({S:window.__snapFn().S});true');
    ck('result shows earned goal count/bonus',await js('!document.getElementById("overChallenge").hidden&&document.getElementById("overChallenge").textContent.includes("300")'));
    await load({},true);await js(`(()=>{const s=newState('endless','baseline-height',sanitizeRules(ENDLESS_RULES));s.score=10000;s.bottles=Array.from({length:8},()=>[]);s.growth.activeColors=9;window.__boot({S:s});return true;})()`);const old=await geom();
    await load();await fixture({color:1});const latest=await geom();ck('paired before/after bottle height preserved',Math.abs(old.glass.h-latest.glass.h)<.2,{old,latest});await shot('final-mobile');
    ck('no runtime errors',await js('__errors.length===0'));
  }finally{if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));write(process.argv.includes('--demo-only')?'demo-browser.json':'browser.json',{...metadata(),checks,geometry,fontLoads,physicalDevice:false,safeArea:'CSS substitution fixture'});}
  console.log(checks.filter(c=>c.pass).length+'/'+checks.length+' passed');if(checks.some(c=>!c.pass))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
