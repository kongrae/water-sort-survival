// Isolated built-page fixtures and native CDP touch/mouse input; never player saves.
const fs=require('fs'),path=require('path'),http=require('http'),{spawn,execFileSync}=require('child_process');
const {ROOT,EVIDENCE,baselineFile,write,metadata,sha}=require('../research/late-expansion/common');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],geometry=[],fonts=[];
function ck(name,pass,detail){checks.push({name,pass:!!pass,...(!pass?{detail}:{})});if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail));}
async function main(){
  execFileSync(process.execPath,['build-pages.js'],{cwd:ROOT,stdio:'ignore'});
  const loaded={...metadata(),testSha256:sha(fs.readFileSync(__filename))},quick=process.argv.includes('--quick'),extras=process.argv.includes('--extras-only'),demo=process.argv.includes('--demo-only'),growthOnly=process.argv.includes('--growth-only');
  const init=`<script>const p=new URLSearchParams(location.search);if(p.get('reset')!=='0'){localStorage.clear();localStorage.setItem('wsurv.seenHelp','true');localStorage.setItem('wsurv.locale',JSON.stringify(p.get('lang')||'ko'));localStorage.setItem('wsurv.themes.owned','["lab","cafe","gem","deep"]');localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,staged:false,sound:true,vibrate:false,fx:p.get('fx')||'juicy',reduceFx:p.get('reduce')==='1',controls:p.get('controls')||'classic',tray:p.get('tray')||'bottom',skin:p.get('skin')||'lab',symbols:true,theme:p.get('theme')||'dark'}));}window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});}}};</script>`;
  const clean=s=>s.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/,'const FIREBASE_CONFIG = null;').replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g,(_,side)=>'var(--test-safe-'+side+',0px)')
    .replace('function endlessRules() {','window.__endlessRules=endlessRules;window.__startGame=startGame;window.__bestKey=()=>bestKey();\n  function endlessRules() {');
  const after=clean(fs.readFileSync(path.join(ROOT,'dist/index.html'),'utf8')).replace('<body>','<body>'+init);
  const before='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}</style><body>'+init+clean(baselineFile('before-source.html','water-sort-survival.html'))+'</body></html>';
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.url.startsWith('/before')?before:after);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port,profile=path.join(EVIDENCE,'profile-'+Date.now());fs.mkdirSync(profile,{recursive:true});
  const chrome=spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});let ws;
  try{
    const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await wait(100);
    const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]),tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(m.error.message)):r(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const load=async(params={},old=false)=>{await send('Page.navigate',{url:url+(old?'/before':'/')+'?'+new URLSearchParams(params)});for(let i=0;i<100;i++){await wait(30);if(await js('!!window.__snapFn?.().S'))break;}fonts.push({params,old,...await js('Promise.race([document.fonts.ready.then(()=>({loaded:true})),new Promise(r=>setTimeout(()=>r({loaded:false}),2500))])')});};
    const state=()=>js('window.__snapFn().S');
    const fixture=async(score=18000,goal=false,old=false,count=null)=>{await js(`(()=>{const s=newState('endless','late-ui',sanitizeRules(ENDLESS_RULES));s.score=${score};s.bestAtStart=1e12;s.newBestShown=true;s.cum=[];
      const k=${count===6?4:count===7?6:score>=12000&&!old?10:9},n=${count|| (score>=18000&&!old?9:8)};s.growth.activeColors=k;s.growth.pendingIntro=[];s.bottles=Array.from({length:n},(_,i)=>[i%k]);s.piece=[k-1,1];s.growth.pieceIntro=-1;s.growth.queue=[{piece:[k-1],intro:-1},{piece:[k-1,1],intro:-1}];s.hold={piece:[k-1,1],intro:-1,flipped:false};
      if(${goal}){s.bottles[0]=[k-1,k-1,k-1];s.bottles[1]=[k-1,k-1,k-1];s.piece=[k-1];s.growth.queue=[{piece:[k-1],intro:-1},{piece:[1],intro:-1}];updateColorChallenge(s,{},false);}else s.challenge.nextScore=Math.max(s.rules.challengeFrom,Math.floor(s.score/5000)*5000+5000);
      window.__boot({S:s});return true;})()`);await wait(70);};
    const geom=()=>js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};},ci=document.getElementById('colorInfo'),range=document.createRange();range.selectNodeContents(ci);
      return{bottles:[...document.querySelectorAll('#rack .tube')].map(box),glass:box(document.querySelector('#rack .glass')),info:box(document.getElementById('runInfo')),note:box(ci),text:ci.textContent,textWidth:range.getBoundingClientRect().width,
        actions:box(document.querySelector('.actions')),stage:box(document.getElementById('stage')),banner:box(document.getElementById('bannerLayer')),viewport:[innerWidth,innerHeight],scroll:[scrollX,scrollY,document.documentElement.scrollWidth,document.documentElement.scrollHeight],errors:__errors};})()`);
    const overlap=(a,b)=>Math.min(a.r,b.r)-Math.max(a.x,b.x)>.5&&Math.min(a.b,b.b)-Math.max(a.y,b.y)>.5;
    const press=async(selector,mouse=false,delay=100)=>{const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(mouse){await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});}
      else{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0,radiusX:5,radiusY:5,force:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}await wait(delay);};
    const place=async(i,control='classic',mouse=false)=>{if(control==='classic')await press('#cup',mouse);await press('#rack .tube[data-i="'+i+'"]',mouse);};
    const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(EVIDENCE,name+'.png'),Buffer.from(r.data,'base64'));};
    if(growthOnly){
      for(const [width,height,mobile]of [[360,640,true],[390,724,true],[1280,900,false]])for(const tray of ['top','bottom']){
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
        for(const count of [6,7,8,9]){
          const score=count===6?0:count===7?900:count===8?4500:18000,reference=Math.min(8,count),tag=[width,height,tray,count].join('/');
          await load({tray},true);await fixture(score,false,true,reference);const original=await geom();
          await load({tray});await fixture(score,false,false,count);const g=await geom();geometry.push({tag,before:original,after:g});
          ck('growth-stage bottle count and valid loaded score/'+tag,g.bottles.length===count&&(await state()).score===score);
          ck('growth-stage glass height unchanged/'+tag,Math.abs(g.glass.h-original.glass.h)<.2,{g,original});
          ck('growth-stage touch width unchanged/'+tag,g.bottles.every(b=>b.w>=44)&&Math.abs(g.bottles[0].w-original.bottles[0].w)<.2,{g,original});
          ck('growth-stage existing positions unchanged/'+tag,original.bottles.every((b,i)=>Math.abs(b.x-g.bottles[i].x)<.2&&Math.abs(b.y-g.bottles[i].y)<.2),{g,original});
          ck('growth-stage no scroll/clipping/overlap/'+tag,g.scroll[2]<=width&&g.scroll[3]<=height&&g.actions.b<=height+.5&&g.bottles.every((b,i)=>b.x>=0&&b.r<=width&&b.y>=0&&b.b<=height&&g.bottles.slice(i+1).every(a=>!overlap(a,b))),g);
          ck('growth-stage effects clear bottles and JS errors/'+tag,g.errors.length===0&&g.bottles.slice(6).every(b=>!overlap(b,g.stage)&&!overlap(b,g.banner)),g);
        }
      }
      console.log(checks.filter(c=>c.pass).length+'/'+checks.length+' growth geometry checks passed');return;
    }
    if(demo){
      await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));'});
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:724,deviceScaleFactor:1,mobile:true});
      for(const score of [12000,18000]){
        await send('Page.navigate',{url:'http://127.0.0.1:8160/game?score='+score});for(let i=0;i<100;i++){await wait(30);if(await js('!!window.__snapFn?.().S'))break;}
        ck('demo actual growth/'+score,(await state()).growth.activeColors===10&&(await state()).bottles.length===(score===18000?9:8));await place(0);await place(1);await wait(700);
        ck('demo native silver goal/'+score,(await state()).challenge.bonusTotal===300);
        ck('demo never persists player records/'+score,await js('Object.keys(localStorage).every(k=>!/^wsurv\\.(game|best|stars|pt|runs|rules)/.test(k))&&__errors.length===0'));
      }
      await shot('demo-mobile');return;
    }
    for(const [width,height]of (extras?[]:quick?[[390,724]]:[[360,640],[390,724]]))for(const tray of (quick?['bottom']:['top','bottom'])){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await load({tray},true);await fixture(18000,false,true);const original=await geom();
      for(const lang of (quick?['ko']:['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id'])){
        await load({tray,lang});
        for(const [score,goal]of [[10000,true],[12000,false],[18000,false],[18000,true]]){
          await fixture(score,goal);const g=await geom(),tag=[width,height,tray,lang,score,goal].join('/');geometry.push({tag,...g});
          ck('bottle height/'+tag,Math.abs(g.glass.h-original.glass.h)<.2,{g,original});
          ck('no scroll or clipping/'+tag,g.scroll[0]===0&&g.scroll[1]===0&&g.scroll[2]<=width&&g.scroll[3]<=height&&g.actions.b<=height+.5&&g.bottles.every(b=>b.x>=0&&b.r<=width&&b.y>=0&&b.b<=height),g);
          ck('bottle targets distinct/'+tag,g.bottles.every((b,i)=>b.w>=44&&g.bottles.slice(i+1).every(a=>!overlap(a,b))),g);
          ck('goal/growth line fits/'+tag,g.textWidth<=g.note.w+.5&&(!goal||g.text.includes('0/2')),g);
          ck('reserved effects avoid bottles/'+tag,g.bottles.slice(6).every(b=>!overlap(b,g.stage)&&!overlap(b,g.banner)),g);
          ck('localized silver and symbols/'+tag,await js(`(()=>{return !document.body.innerText.includes('undefined')&&${score>=12000?'getComputedStyle(document.documentElement).getPropertyValue("--liq9").trim()!==""&&document.querySelector("#cup .layer").textContent.includes("≋")':'true'}&&__errors.length===0;})()`));
        }
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:724,deviceScaleFactor:1,mobile:true});
    for(const [width,height]of [[360,640],[390,724]])for(const tray of ['top','bottom']){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});const safe=async()=>{await js('document.documentElement.style.setProperty("--test-safe-top","16px");document.documentElement.style.setProperty("--test-safe-bottom","26px");dispatchEvent(new Event("resize"));true');await wait(250);await js('dispatchEvent(new Event("resize"));true');await wait(150);};
      await load({tray},true);await fixture(18000,false,true);await safe();const original=await geom();await load({tray});await fixture(18000,true);await safe();const g=await geom();
      ck('safe-area bottle height/'+width+'/'+tray,Math.abs(g.glass.h-original.glass.h)<.2,{g,original});ck('safe-area no scrolling/clipping/'+width+'/'+tray,g.scroll[3]<=height&&g.actions.b<=height-26+.5,g);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
    for(const lang of ['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id']){
      await load({lang,reduce:'1'});await fixture(18000,true);await js('(()=>{const s=window.__snapFn().S;s.bottles[2]=[1,1,1];s.piece=[1];window.__boot({S:s});return true;})()');await place(2);
      const b=await js('(()=>{const e=document.getElementById("banner"),r=e.getBoundingClientRect();return{text:e.textContent,hidden:e.hidden,h:e.clientHeight,scroll:e.scrollHeight,w:r.width};})()');
      ck('shared goal-end banner fits/'+lang,!b.hidden&&b.scroll<=b.h+1,b);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:724,deviceScaleFactor:1,mobile:true});
    for(const skin of ['lab','cafe','gem','deep'])for(const theme of ['dark','light']){
      await load({skin,theme});await fixture(18000,true);const color=await js('getComputedStyle(document.querySelector("#cup .layer")).backgroundColor');ck('silver filled palette/'+skin+'/'+theme,!['rgba(0, 0, 0, 0)','transparent',''].includes(color),color);await shot('silver-'+skin+'-'+theme);
    }
    for(const controls of ['classic','tapPlace'])for(const mouse of [false,true]){
      await load({controls});await fixture();await js('window.__snapFn().S.piece=[9,1];window.__boot({S:window.__snapFn().S});true');await press('#btnFlip',mouse);await place(8,controls,mouse);
      ck('ninth bottle native flipped placement/'+controls+'/'+mouse,JSON.stringify((await state()).bottles[8])==='[8,1,9]');
      await load({controls});await fixture(18000,true);await place(0,controls,mouse);await place(1,controls,mouse);ck('native silver goal bonus/'+controls+'/'+mouse,(await state()).challenge.bonusTotal===300);
    }
    await load();await fixture();await js('(()=>{const s=window.__snapFn().S;s.bottles[8]=[9];s.bottles[0]=[9,9,9];s.challenge.nextScore=25000;window.__boot({S:s});return true;})()');
    await press('#rack .tube[data-i="8"]');await press('#rack .tube[data-i="0"]');await wait(750);ck('native ninth bottle pour and clear',JSON.stringify((await state()).bottles[0])==='[]'&&JSON.stringify((await state()).bottles[8])==='[]');
    await load({reduce:'1'});await fixture(11900);await js('(()=>{const s=window.__snapFn().S;s.bottles[0]=[0,0,0];s.piece=[0];s.challenge.nextScore=15000;window.__boot({S:s});return true;})()');await place(0);
    const introduced=await state(),announcement=await js('document.getElementById("banner").textContent');
    ck('native new color and correct introduction announcement',introduced.growth.activeColors===10&&announcement.includes('은색')&&!announcement.includes('undefined'),{introduced,announcement});
    await load({reduce:'1'});await fixture(17900);await js('(()=>{const s=window.__snapFn().S;s.bottles[0]=[9,9,9];s.piece=[9];s.challenge.nextScore=20000;window.__boot({S:s});return true;})()');await place(0);const expanded=await state();ck('native ninth unlock',expanded.bottles.length===9&&expanded.score===18000);
    await press('#btnUndo');ck('native undo removes earned bottle',(await state()).bottles.length===8&&(await state()).score===17900);await place(0);ck('re-crossing pays ninth bottle exactly once',(await state()).bottles.length===9&&(await state()).growth.log.filter(x=>x.kind==='bottle').length===1);
    const saved=await state();await load({reset:'0'});ck('reload preserves full growth, queue and score',JSON.stringify((await state()).growth)===JSON.stringify(saved.growth)&&(await state()).score===saved.score&&(await state()).bottles.length===9);
    await load();await fixture(10000,true);await js('(()=>{const s=window.__snapFn().S;s.rules=sanitizeRules(COLOR_ENDLESS_RULES);localStorage.setItem("wsurv.game.endless",JSON.stringify(s));localStorage.setItem("wsurv.rules",JSON.stringify(COLOR_ENDLESS_RULES));return true;})()');await load({reset:'0'});
    ck('old live color-goal policy is preserved',!(await state()).rules.lateGrowthVersion);ck('next default upgrades previous color policy',await js('window.__endlessRules().lateGrowthVersion===1'));
    const oldKey=await js('window.__bestKey()');await js(`localStorage.setItem(${JSON.stringify(oldKey)},'777');true`);
    await js('localStorage.setItem("wsurv.rules.custom","true");true');ck('explicit prior custom remains unchanged',await js('!window.__endlessRules().lateGrowthVersion'));
    await js('localStorage.removeItem("wsurv.rules.custom");window.__startGame("endless",true);true');ck('fresh run uses late expansion',(await state()).rules.lateGrowthVersion===1);
    ck('new policy retains old record under its previous signature',await js(`window.__bestKey()!==${JSON.stringify(oldKey)}&&localStorage.getItem(${JSON.stringify(oldKey)})==='777'`));
    await press('#btnSettings');await js('document.getElementById("labBox").open=true;true');ck('settings round trip keeps max colors 10',await js('document.getElementById("set-maxColors").value==="10"'));await press('#ovSettings [data-close]');
    await fixture();await js('(()=>{const s=window.__snapFn().S;s.rules.growthTable.at(-1).bottles=11;localStorage.setItem("wsurv.game.endless",JSON.stringify(s));return true;})()');await load({reset:'0'});ck('malformed new policy protected for recovery',await js('!!localStorage.getItem("wsurv.recovery.endless")&&window.__snapFn().S.score===0'));
    for(const fx of ['base','juicy'])for(const reduce of ['0','1']){
      await load({fx,reduce});await fixture(18000,true);await place(0);await place(1);await wait(900);ck('silver clear/goal FX/'+fx+'/'+reduce,(await state()).challenge.bonusTotal===300&&await js('__errors.length===0'));
      await press('#btnNew');await press('#btnNew');await wait(100);ck('new game clears growth/FX/'+fx+'/'+reduce,(await state()).bottles.length===6&&await js('document.getElementById("banner").hidden'));
    }
    await load();await fixture(18000,true);await shot('final-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await fixture();const desktop=await geom();ck('desktop ninth bottle geometry',desktop.bottles.length===9&&desktop.bottles.every((b,i)=>desktop.bottles.slice(i+1).every(a=>!overlap(a,b))));await shot('final-desktop');
  }finally{if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));write(growthOnly?'growth-browser.json':demo?'demo-browser.json':extras?'extras-browser.json':quick?'quick-browser.json':'browser.json',{...loaded,checks,geometry,fonts,physicalDevice:false,safeArea:demo||growthOnly?'not injected in this run':'16px top/26px bottom CSS fixtures, no physical device'});
    if(checks.some(c=>!c.pass))process.exitCode=1;
  }
  console.log(checks.filter(c=>c.pass).length+'/'+checks.length+' passed');if(checks.some(c=>!c.pass))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
