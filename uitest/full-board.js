// Isolated built-page fixtures and native CDP touch/mouse input; never player saves.
const fs=require('fs'),path=require('path'),http=require('http'),{spawn,execFileSync}=require('child_process');
const {ROOT,EVIDENCE,baselineFile,write,metadata,sha}=require('../research/full-board/common');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],geometry=[],fonts=[],inputs=[];
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
    const load=async(params={},old=false)=>{await send('Page.navigate',{url:url+(old?'/before':'/')+'?'+new URLSearchParams(params)});for(let i=0;i<100;i++){await wait(30);if(await js('!!window.__snapFn?.().S'))break;}await js('document.documentElement.dataset.theme='+JSON.stringify(params.theme||'dark')+';dispatchEvent(new Event("resize"));true');await wait(70);fonts.push({params,old,...await js('Promise.race([document.fonts.ready.then(()=>({loaded:true})),new Promise(r=>setTimeout(()=>r({loaded:false}),2500))])')});};
    const state=()=>js('window.__snapFn().S');
    const fixture=async(score=100000,goal=false,old=false,count=null)=>{await js(`(()=>{const s=newState('endless','full-board-ui',sanitizeRules(ENDLESS_RULES));s.score=${score};s.bestAtStart=1e12;s.newBestShown=true;s.cum=[];
      const row=growthTarget(s),k=row.colors,n=${count||0}||row.bottles;s.growth.activeColors=k;s.growth.pendingIntro=[];s.bottles=Array.from({length:n},(_,i)=>[i%k]);s.piece=[k-1,1];s.growth.pieceIntro=-1;s.growth.queue=[{piece:[k-1],intro:-1},{piece:[k-1,1],intro:-1}];s.hold={piece:[k-1,1],intro:-1,flipped:false};
      if(${goal}){s.bottles[0]=[k-1,k-1,k-1];s.bottles[1]=[k-1,k-1,k-1];s.piece=[k-1];s.growth.queue=[{piece:[k-1],intro:-1},{piece:[1],intro:-1}];s.challenge.nextScore=10000;updateColorChallenge(s,{},false);}else s.challenge.nextScore=Math.max(s.rules.challengeFrom,Math.floor(s.score/5000)*5000+5000);
      if(!validFeatureState(s))throw Error('Invalid full-board UI fixture');window.__boot({S:s});return true;})()`);await wait(100);};
    const geom=()=>js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};},ci=document.getElementById('colorInfo'),range=document.createRange();range.selectNodeContents(ci);
      return{bottles:[...document.querySelectorAll('#rack .tube')].map(box),glass:box(document.querySelector('#rack .glass')),info:box(document.getElementById('runInfo')),note:box(ci),text:ci.textContent,textWidth:range.getBoundingClientRect().width,
        actions:box(document.querySelector('.actions')),stage:box(document.getElementById('stage')),banner:box(document.getElementById('bannerLayer')),viewport:[innerWidth,innerHeight],scroll:[scrollX,scrollY,document.documentElement.scrollWidth,document.documentElement.scrollHeight],errors:__errors};})()`);
    const overlap=(a,b)=>Math.min(a.r,b.r)-Math.max(a.x,b.x)>.5&&Math.min(a.b,b.b)-Math.max(a.y,b.y)>.5;
    const press=async(selector,mouse=false,delay=100)=>{const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(mouse){await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});if(delay===550)await wait(550);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});}
      else{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0,radiusX:5,radiusY:5,force:1}]});if(delay===550)await wait(550);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}await wait(delay);if(/data-i="(?:9|10|11)"|btnFlip|btnHold|btnUndo/.test(selector))inputs.push({selector,mouse,delay,point:p,state:await state()});};
    const place=async(i,control='classic',mouse=false)=>{if(control==='classic')await press('#cup',mouse);await press('#rack .tube[data-i="'+i+'"]',mouse);};
    const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(EVIDENCE,name+'.png'),Buffer.from(r.data,'base64'));};
    if(demo){
      await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));'});
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:724,deviceScaleFactor:1,mobile:true});
      for(const [score,k,n]of [[30000,11,9],[40000,11,10],[55000,12,10],[70000,12,11],[85000,13,11],[100000,13,12]]){
        await send('Page.navigate',{url:'http://127.0.0.1:8161/game?score='+score});for(let i=0;i<100;i++){await wait(30);if(await js('!!window.__snapFn?.().S'))break;}
        ck('served preview growth/'+score,(await state()).growth.activeColors===k&&(await state()).bottles.length===n);await place(0);await place(1);await wait(600);
        ck('served preview native goal/'+score,(await state()).challenge.bonusTotal===300);
        ck('preview never writes player records/'+score,await js('Object.keys(localStorage).every(k=>!/^wsurv\\.(game|best|stars|pt|runs|rules)/.test(k))&&__errors.length===0'));
      }
      await shot('served-demo-12b');return;
    }
    // Paired geometry: all earlier bottle positions and height budgets stay identical.
    const stages=[[0,6],[900,7],[4500,8],[18000,9],[40000,10],[70000,11],[100000,12]];
    for(const [width,height,mobile]of (quick?[[390,724,true]]:[[360,640,true],[390,724,true],[1280,900,false]]))for(const tray of (quick?['bottom']:['top','bottom'])){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
      for(const [score,count]of stages){const tag=[width,height,tray,count].join('/');
        await load({tray},true);await fixture(score,false,true);const original=await geom();
        await load({tray});await fixture(score);const g=await geom();geometry.push({tag,before:original,after:g});
        ck('growth count and valid state/'+tag,g.bottles.length===count&&await js('validFeatureState(window.__snapFn().S)'));
        ck('bottle height and width preserved/'+tag,Math.abs(g.glass.h-original.glass.h)<.2&&g.bottles.every(b=>b.w>=44)&&Math.abs(g.bottles[0].w-original.bottles[0].w)<.2,{g,original});
        ck('all existing bottle positions preserved/'+tag,original.bottles.every((b,i)=>Math.abs(b.x-g.bottles[i].x)<.2&&Math.abs(b.y-g.bottles[i].y)<.2),{g,original});
        ck('no scroll/clipping/overlapping bottles/'+tag,g.scroll[2]<=width&&g.scroll[3]<=height&&g.actions.b<=height+.5&&g.bottles.every((b,i)=>b.x>=0&&b.r<=width&&b.y>=0&&b.b<=height&&g.bottles.slice(i+1).every(a=>!overlap(a,b))),g);
        ck('effects clear occupied bottles/'+tag,g.bottles.every(b=>!overlap(b,g.stage)&&!overlap(b,g.banner))&&g.errors.length===0,g);
        if(count===12){await js('document.getElementById("banner").textContent="색상 도전 완료 +300";document.getElementById("banner").hidden=false;true');await shot('full-'+width+'-'+tray);}
      }
    }
    if(!quick){
      // A complete crossed matrix on the smallest display, sampled at all late color/bottle stages.
      await send('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
      for(const lang of ['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id'])for(const tray of ['top','bottom'])for(const [score,count]of [[30000,9],[40000,10],[55000,10],[70000,11],[85000,11],[100000,12]]){
        await load({lang,tray});await fixture(score,true);const g=await geom(),tag=[lang,tray,score].join('/');geometry.push({tag,...g});
        ck('localized goal and full layout/'+tag,g.text.includes('0/2')&&g.textWidth<=g.note.w+.5&&g.bottles.length===count&&g.scroll[3]<=640&&g.bottles.every(b=>!overlap(b,g.stage)&&!overlap(b,g.banner)),g);
        await js('document.documentElement.style.setProperty("--font-body","Arial,sans-serif");document.documentElement.style.setProperty("--font-display","Arial,sans-serif");window.__boot({S:window.__snapFn().S});true');
        await place(0);await place(1);await wait(70);const after=await state();
        ck('native localized goal/bonus/'+tag,after.challenge.bonusTotal===300&&after.bottles.length===count);
        const b=await js('(()=>{const e=document.getElementById("banner");return{text:e.textContent,hidden:e.hidden,h:e.clientHeight,scroll:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth};})()');
        ck('localized goal banner fits font fallback/'+tag,!b.hidden&&b.scroll<=b.h+1&&b.sw<=b.w+1,b);
        ck('localized colors symbols and JS errors/'+tag,await js('!document.body.innerText.includes("undefined")&&!document.body.innerText.includes("□")&&__errors.length===0'));
      }
      for(const skin of ['lab','cafe','gem','deep'])for(const theme of ['dark','light']){
        await load({skin,theme});await fixture();
        const palette=await js('(()=>{const s=window.__snapFn().S;s.bottles[0]=[10,11,12];window.__boot({S:s});return [10,11,12].map(c=>{const e=document.querySelector(`#rack .layer[data-color="${c}"]`);return {c,color:getComputedStyle(e).backgroundColor,symbol:e.textContent,aria:e.closest(".tube").getAttribute("aria-label")};});})()');
        ck('new palette and unique symbols/'+skin+'/'+theme,palette.every(p=>p.color!=='rgba(0, 0, 0, 0)'&&p.symbol&&p.aria)&&new Set(palette.map(p=>p.symbol)).size===3&&await js(`document.documentElement.dataset.theme===${JSON.stringify(theme)}&&document.documentElement.dataset.skin===${JSON.stringify(skin)}`),palette);await shot('palette-'+skin+'-'+theme);
      }
      for(const [width,height]of [[360,640],[390,724]])for(const tray of ['top','bottom']){
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
        const safe=async()=>{await js('document.documentElement.style.setProperty("--test-safe-top","16px");document.documentElement.style.setProperty("--test-safe-bottom","26px");dispatchEvent(new Event("resize"));true');await wait(250);await js('dispatchEvent(new Event("resize"));true');await wait(150);};
        await load({tray},true);await fixture();await safe();const original=await geom();await load({tray});await fixture(100000,true);await safe();const g=await geom();
        ck('safe area height and no clipping/'+width+'/'+tray,Math.abs(original.glass.h-g.glass.h)<.2&&g.scroll[3]<=height&&g.actions.b<=height-26+.5,g);
      }
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:724,deviceScaleFactor:1,mobile:true});
      for(const controls of ['classic','tapPlace'])for(const mouse of [false,true])for(const i of [9,10,11]){
        await load({controls});await fixture();await press('#btnFlip',mouse);await place(i,controls,mouse);ck('native last-slot flip/place/'+controls+'/'+mouse+'/'+i,JSON.stringify((await state()).bottles[i])===JSON.stringify([i,1,12]));
        await load({controls});await fixture();await js(`(()=>{const s=window.__snapFn().S;s.bottles[${i}]=[12];s.bottles[0]=[12,12,12];window.__boot({S:s});return true;})()`);await press('#rack .tube[data-i="'+i+'"]',mouse,controls==='tapPlace'?550:100);await press('#rack .tube[data-i="0"]',mouse);await wait(750);
        ck('native last-slot pour/clear/'+controls+'/'+mouse+'/'+i,(await state()).bottles[0].length===0&&(await state()).bottles[i].length===0);
      }
      for(const fx of ['base','juicy'])for(const reduce of ['0','1'])for(const tray of ['top','bottom']){
        await load({fx,reduce,tray});await fixture(100000,true);await js('(()=>{const s=window.__snapFn().S;s.streak=4;s.bottles[9]=[12];s.bottles[10]=[12,12,12];window.__boot({S:s});return true;})()');
        await press('#rack .tube[data-i="9"]');await press('#rack .tube[data-i="10"]');await wait(450);
        const live=await js('(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};};return{burst:document.querySelector("#stage .cb")?box(document.querySelector("#stage .cb")):null,banner:box(document.getElementById("banner")),info:box(document.querySelector(".info")),cup:box(document.getElementById("cup")),nodes:document.querySelectorAll("#fxLayer .fx").length};})()');
        ck('compact combo and banner clear essential information/'+fx+'/'+reduce+'/'+tray,(!live.burst||!overlap(live.burst,live.info)&&!overlap(live.burst,live.banner))&&!overlap(live.banner,live.info)&&!overlap(live.banner,live.cup),live);
        if(fx==='juicy'&&reduce==='0')ck('full-board combo number stays visible/'+tray,!!live.burst,live);
        await press('#btnUndo');await wait(900);ck('undo cleans full-board effects/'+fx+'/'+reduce+'/'+tray,await js('document.querySelectorAll("#fxLayer .fx,#stage .cb").length===0&&__errors.length===0'));
        await js('document.getElementById("optSound").checked=false;document.getElementById("optSound").dispatchEvent(new Event("change"));true');await press('#btnHold');ck('muted HOLD remains valid/'+fx+'/'+reduce+'/'+tray,await js('validFeatureState(window.__snapFn().S)&&__errors.length===0'));
      }
      for(const score of [39900,69900,99900]){
        await load({reduce:'1'});await fixture(score);await js('(()=>{const s=window.__snapFn().S;s.bottles[0]=[0,0,0];s.piece=[0];window.__boot({S:s});return true;})()');const before=await state();await place(0);const earned=await state();
        ck('native boundary earns bottle/'+score,earned.bottles.length===before.bottles.length+1);await press('#btnUndo');ck('native boundary undo/'+score,(await state()).bottles.length===before.bottles.length);await place(0);const saved=await state();await load({reset:'0'});
        ck('boundary recross/reload exact growth and queue/'+score,JSON.stringify((await state()).growth)===JSON.stringify(saved.growth)&&(await state()).bottles.length===saved.bottles.length);
      }
      for(const tray of ['top','bottom']){
        await load({tray});await fixture();await place(9);await js('(()=>{const s=window.__snapFn().S;s.streak=4;s.maxStreak=4;if(!validFeatureState(s))throw Error("Invalid combo break fixture");window.__boot({S:s});return true;})()');await place(11);await wait(30);
        const g=await geom(),fall=await js('(()=>{const e=[...document.querySelectorAll("#fxLayer .fx-score")].find(e=>e.textContent==="×4");if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};})()');
        ck('compact combo break stays clear of active info/'+tray,(await state()).streak===0&&!!fall&&!overlap(fall,g.note)&&fall.y>=g.stage.y-.5&&fall.b<=g.stage.b+.5,{fall,g});
      }
      for(const [score,color]of [[29900,11],[54900,12],[84900,13]]){
        await load({reduce:'1'});await fixture(score);await js('(()=>{const s=window.__snapFn().S;s.bottles[0]=[0,0,0];s.piece=[0];window.__boot({S:s});return true;})()');await place(0);
        ck('native new color and introduction queue/'+color,(await state()).growth.activeColors===color&&(await state()).growth.queue.some(q=>q.intro===color-1)&&await js('!document.getElementById("banner").textContent.includes("undefined")'));
      }
      for(const lang of ['ko','hi','pt-BR']){
        await load({lang,reduce:'1'});await fixture(100000,true);await js('(()=>{const s=window.__snapFn().S;s.bottles[2]=[1,1,1];s.piece=[1];window.__boot({S:s});return true;})()');await place(2);
        const g=await geom();ck('full-board failed goal keeps essential goal/info clear/'+lang,!(await state()).over&&(await state()).challenge.lastResult.status==='missed'&&g.bottles.every(b=>!overlap(b,g.banner))&&g.scroll[3]<=724,g);
      }
      await load({reduce:'1'});await fixture();await js('(()=>{const s=window.__snapFn().S;s.bottles=Array.from({length:12},()=>[0,1,2,3]);s.bottles[11].pop();s.hold=null;s.piece=[1];window.__boot({S:s});return true;})()');await place(11);await wait(1000);
      ck('native full-board no-room game ends without JS errors',(await state()).over&&(await state()).overReason==='noroom'&&await js('__errors.length===0'));await shot('full-gameover');
      await load();await fixture(18000);await js('(()=>{const s=window.__snapFn().S;s.rules=sanitizeRules(LATE_GROWTH_V1_RULES);localStorage.setItem("wsurv.game.endless",JSON.stringify(s));localStorage.setItem("wsurv.rules",JSON.stringify(LATE_GROWTH_V1_RULES));return true;})()');await load({reset:'0'});
      ck('old v1 continuing run preserves policy',(await state()).rules.lateGrowthVersion===1);ck('next standard updates to v2',await js('window.__endlessRules().lateGrowthVersion===2'));
      const key=await js('window.__bestKey()');await js(`localStorage.setItem(${JSON.stringify(key)},'777');localStorage.setItem('wsurv.rules.custom','true');true`);ck('explicit custom old v1 preserved',await js('window.__endlessRules().lateGrowthVersion===1'));
      await js('localStorage.removeItem("wsurv.rules.custom");window.__startGame("endless",true);true');ck('new standard and old record retained',(await state()).rules.lateGrowthVersion===2&&await js(`localStorage.getItem(${JSON.stringify(key)})==='777'`));
      await press('#btnSettings');await js('document.getElementById("labBox").open=true;true').catch(()=>{});ck('settings preserve max 13',await js('document.getElementById("set-maxColors").value==="13"'));await press('#ovSettings [data-close]');
      await fixture();await js('(()=>{const s=window.__snapFn().S;s.rules.lateGrowthVersion=999;localStorage.setItem("wsurv.game.endless",JSON.stringify(s));return true;})()');await load({reset:'0'});ck('unsupported policy protected for recovery',await js('!!localStorage.getItem("wsurv.recovery.endless")&&window.__snapFn().S.score===0'));
      await load();await fixture();await js('document.getElementById("score").textContent="9,999,999,999";dispatchEvent(new Event("resize"));true');await wait(250);ck('large score stays inside header',await js('(()=>{const r=document.getElementById("score").getBoundingClientRect();return r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;})()'));
      await press('#btnHelp');ck('help includes selected final milestones',await js('document.getElementById("helpGrowth").textContent.includes("13")&&document.getElementById("helpFeatures").textContent.includes("100,000")'));await press('#ovHelp [data-close]');
    }
  }finally{if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));write(demo?'demo-browser.json':quick?'quick-browser.json':'browser.json',{...loaded,checks,geometry,fonts,inputs,physicalDevice:false,safeArea:demo||growthOnly?'not injected in this run':'16px top/26px bottom CSS fixtures, no physical device'});
    if(checks.some(c=>!c.pass))process.exitCode=1;
  }
  console.log(checks.filter(c=>c.pass).length+'/'+checks.length+' passed');if(checks.some(c=>!c.pass))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
