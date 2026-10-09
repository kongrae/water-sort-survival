// Real Chrome CDP inputs, built Pages document, isolated storage; never included in the product.
// node uitest/hold-triple.js
const fs=require('fs'),path=require('path'),http=require('http');
const {spawn,execFileSync}=require('child_process');
const {E,run}=require('../research/expansion/bots');
const BASE=path.resolve(__dirname,'..'),OUT=path.join(BASE,'outputs/hold-triple'),PORT=8145,CDP=9345;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  execFileSync(process.execPath,[path.join(BASE,'build-pages.js')],{stdio:'ignore'});fs.mkdirSync(OUT,{recursive:true});
  const init=`<script>
  const p=new URLSearchParams(location.search);
  if(p.get('reset')!=='0'){
    localStorage.clear();localStorage.setItem('wsurv.locale',JSON.stringify(p.get('lang')||'ko'));
    localStorage.setItem('wsurv.seenHelp','true');
    if(p.has('skin'))localStorage.setItem('wsurv.themes.owned',JSON.stringify(['lab','cafe','gem','deep']));
    localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,staged:false,sound:false,vibrate:false,symbols:true,
      controls:p.get('controls')||'classic',tray:p.get('tray')||'bottom',skin:p.get('skin')||'lab',reduceFx:p.get('reduce')==='1'}));
  }
  window.__errors=[];window.addEventListener('error',e=>window.__errors.push(e.message));
  if(p.get('quota')==='1'){
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k.startsWith('wsurv.recovery.'))throw new DOMException('quota fixture','QuotaExceededError');return set.call(this,k,v);};
  }
  window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});}}};
  </script>`;
  const clean=s=>s.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/,'const FIREBASE_CONFIG = null;')
    .replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g,(_,side)=>'var(--test-safe-area-'+side+', 0px)');
  const page=clean(fs.readFileSync(path.join(BASE,'dist/index.html'),'utf8')).replace('<body>','<body>'+init);
  const beforePath=path.join(OUT,'before-source.html'),baseline=require('../research/hold-triple/baseline.json');
  const beforeRef=fs.existsSync(beforePath)?'outputs/hold-triple/before-source.html':'git:'+baseline.head+':water-sort-survival.html';
  const beforeSource=fs.existsSync(beforePath)?fs.readFileSync(beforePath,'utf8'):
    execFileSync('git',['show',baseline.head+':water-sort-survival.html'],{cwd:BASE,encoding:'utf8'});
  const before=clean('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'+init+beforeSource+'</body></html>');
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url.startsWith('/before')?before:page);});
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const chrome=spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion',
      '--remote-debugging-port='+CDP,'--user-data-dir='+path.join(OUT,'profile-'+Date.now()),'about:blank'],{stdio:'ignore'});
  const rows=[],geometry=[],latency=[];let ws;
  const ck=(name,pass,detail)=>{rows.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail));};
  try{
    let tabs;for(let i=0;i<80&&!tabs;i++){await sleep(100);try{tabs=await(await fetch('http://127.0.0.1:'+CDP+'/json/list')).json();}catch{}}
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();
    ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(JSON.stringify(m.error))):r(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const load=async(query='',w=390,h=844,old=false,top=0,bottom=0)=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});
      await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+(old?'/before':'/')+'?'+query});
      for(let i=0;i<100;i++){await sleep(30);if(await js('!!window.__snapFn?.().S'))break;}
      await js('document.fonts.ready.then(()=>true)');
      await js(`document.documentElement.style.setProperty('--test-safe-area-top','${top}px');document.documentElement.style.setProperty('--test-safe-area-bottom','${bottom}px');window.dispatchEvent(new Event('resize'));true`);
      await sleep(100);
    };
    const state=()=>js('JSON.parse(JSON.stringify(window.__snapFn().S))');
    const setup=async({n=8,piece=[0,1],hold=null,used=false,preview=2,bottles=null,queue=null,old=false,check=false,limit=null,score=null}={})=>{
      const patch=JSON.stringify({preview});
      await js(`(()=>{const r=sanitizeRules({...${old?'EXPANDING_RULES':'ENDLESS_RULES'},...${patch}}),s=newState('endless','ui-hold-fixture',r);
      s.score=${score===null?(n===8?4500:n===7?900:0):score};updateGrowth(s,false);s.growth.activeColors=${n===8?9:n===7?6:4};
      s.piece=${JSON.stringify(piece)};s.growth.pieceIntro=-1;s.cum=[];s.rescueAds=0;
      ${old?'':`s.hold=${JSON.stringify(hold)};s.holdUsed=${used};`}
      ${bottles?`s.bottles=${JSON.stringify(bottles)};`:''}
      ${queue?`s.growth.queue=${JSON.stringify(queue)};`:''}
      ${check?`checkStuck(s,${limit||'undefined'});`:''}
      window.__boot({S:s});return true;})()`);await sleep(70);
    };
    const box=selector=>js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
    const tap=async(selector,mouse=false,wait=60)=>{
      await js('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center"});true');
      const p=await box(selector);
      if(!p.w||!p.h)throw Error('Native tap target is hidden: '+selector);
      if(mouse){await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount:1});}
      else{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:0,radiusX:5,radiusY:5,force:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      if(wait)await sleep(wait);
    };
    const key=async(k,code,vk,text)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk,...(text?{text,unmodifiedText:text}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk});await sleep(50);};
    const place=async(i,controls='classic',quick=false)=>{if(controls==='classic')await tap('#cup',false,quick?0:40);await tap('#rack [data-i="'+i+'"]',false,quick?0:70);};
    const geom=()=>js(`(()=>{const b=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
    return{w:innerWidth,h:innerHeight,tubes:[...document.querySelectorAll('#rack>.tube')].map(b),bottleGlass:[...document.querySelectorAll('#rack>.tube .glass')].map(b),cup:b(document.getElementById('cup')),
    glass:b(document.querySelector('#cup .glass')),tray:b(document.querySelector('.tray')),hold:document.getElementById('holdSlot')?b(document.getElementById('btnHold')):null,
    actions:b(document.querySelector('.actions')),scroll:[scrollX,scrollY,document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    overlaps:[...document.querySelectorAll('.tray>.current-piece,.tray>.next-pieces,.tray>#holdSlot:not([hidden])')].map(b).filter(r=>r.w>0&&r.h>0),
    bg:getComputedStyle(document.body).backgroundColor};})()`);
    const shot=async(name)=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));};
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const scenarios=[[360,640,0,0],[390,844,0,0],[412,915,0,0],[768,1024,0,0],[360,600,24,24],[390,724,47,34]];
    for(const [w,h,top,bottom]of scenarios){
      const baseline={};await load('',w,h,true,top,bottom);
      for(const n of [6,7,8]){await setup({n,old:true});baseline[n]=await geom();}
      await load('',w,h,false,top,bottom);
      await setup({n:6});const currentSix=await geom();
      for(const n of [6,7,8])for(const length of [2,3]){
        if(length===3&&n<8)continue;
        await setup({n,piece:length===3?[0,1,1]:[0,1],hold:n>=7?{piece:[2,3,3].slice(0,length),intro:-1,flipped:false}:null});
        const g=await geom(),old=baseline[n];geometry.push({w,h,top,bottom,n,length,before:old,after:g});
        ck('bottle height improves without growth or piece resizing/'+w+'x'+h+'/'+n+'/'+length,
          g.tubes.every((t,i)=>t.h>=old.tubes[i].h-.15&&Math.abs(t.h-currentSix.tubes[0].h)<.15&&Math.abs(t.x-old.tubes[i].x)<.15&&(i>=6||Math.abs(t.y-currentSix.tubes[i].y)<.15))&&
          g.bottleGlass.every((t,i)=>t.h>=old.bottleGlass[i].h-.15&&Math.abs(t.h-currentSix.bottleGlass[0].h)<.15&&Math.abs(t.x-old.bottleGlass[i].x)<.15&&(i>=6||Math.abs(t.y-currentSix.bottleGlass[i].y)<.15)),{before:old.tubes,after:g.tubes,currentSix:currentSix.tubes,beforeGlass:old.bottleGlass,afterGlass:g.bottleGlass});
        ck('preview frame does not grow/'+w+'x'+h+'/'+n+'/'+length,Math.abs(g.glass.h-old.glass.h)<.15,{before:old.glass.h,after:g.glass.h});
        ck('fixed portrait and 44px targets/'+w+'x'+h+'/'+n+'/'+length,g.actions.b<=h-bottom+.1&&g.tubes.every(t=>t.w>=44&&t.b<=g.actions.y)&&g.hold.w>=44&&g.hold.h>=44&&g.scroll[0]===0&&g.scroll[1]===0&&g.scroll[2]<=w,g);
        ck('tray groups do not overlap/'+w+'x'+h+'/'+n+'/'+length,g.overlaps.every((r,i,a)=>!i||r.x>=a[i-1].x+a[i-1].w-.1),g.overlaps);
      }
    }
    for(const controls of ['classic','tapPlace'])for(const tray of ['top','bottom'])for(const mouse of [false,true]){
      const tag=controls+'/'+tray+'/'+(mouse?'mouse':'touch');await load('controls='+controls+'&tray='+tray);
      ck('fresh default features locked at six/'+tag,(await state()).rules.holdVersion===1&&await js('document.getElementById("btnHold").disabled'));
      await setup({n:7,queue:[{piece:[2,3],intro:-1},{piece:[1],intro:-1}]});
      await tap('#btnFlip',mouse);const a=await state();await tap('#btnHold',mouse);let s=await state();
      ck('native empty hold preserves flipped piece and turn/'+tag,same(s.hold,{piece:a.piece,intro:a.growth.pieceIntro,flipped:true})&&same(s.piece,a.growth.queue[0].piece)&&s.turn===a.turn&&s.score===a.score&&s.flipsPlaced===0&&s.holdUsed);
      ck('held flip reservation shown/'+tag,await js('document.getElementById("flipN").textContent==="1"&&document.querySelector(".hold-reservation")!==null'));
      const locked=await state();await tap('#btnHold',mouse);ck('native repeat cannot bypass lock/'+tag,same(await state(),locked));
      await place(0,controls);const before=await state();ck('native placement restores hold/'+tag,before.turn===1&&!before.holdUsed);
      await tap('#btnHold',mouse);s=await state();
      ck('native swap keeps confirmed queue and generation/'+tag,same(s.piece,before.hold.piece)&&same(s.growth.queue,before.growth.queue)&&s.growth.generation===before.growth.generation&&s.flipped===true);
      await tap('#btnUndo',mouse);s=await state();
      ck('undo restores held piece and use right/'+tag,same(s.hold,before.hold)&&same(s.piece,before.piece)&&same(s.growth,before.growth)&&s.holdUsed===before.holdUsed&&s.undoLeft===before.undoLeft-1);
      await tap('#btnHold',mouse);const saved=await state();await js("history.replaceState(null,'','?reset=0');true");await send('Page.reload');await sleep(350);
      ck('reload restores active/held/queue/reservations/'+tag,same(await state(),saved));
    }
    for(const [k,code,vk,text]of [['Enter','Enter',13,'\r'],[' ','Space',32,' ']]){
      await load();await setup({n:7});await js('document.getElementById("btnHold").focus()');await key(k,code,vk,text);
      ck('native keyboard hold/'+code,(await state()).holdUsed);
    }
    for(const preview of [0,1,2,3]){
      await load();await setup({n:7,preview});const a=await state();await tap('#btnHold');const s=await state();
      ck('preview setting queue contract/'+preview,s.growth.queue.length===preview&&s.growth.generation===a.growth.generation+1&&await js('document.querySelectorAll("#queue>.slot").length')===preview);
    }
    for(const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id']){
      await load('lang='+locale,360,640);await setup({piece:[0,1,1],hold:{piece:[2,3,3],intro:-1,flipped:false},preview:3});
      const g=await geom();ck('localized triple and hold fit/'+locale,g.actions.b<=640.1&&g.scroll[2]<=360&&g.overlaps.every((r,i,a)=>!i||r.x>=a[i-1].x+a[i-1].w-.1),g);
      ck('translated hold labels/'+locale,await js('document.getElementById("holdAction").textContent===WSSLocale.t("교환")&&document.getElementById("btnHold").getAttribute("aria-label").includes(WSSLocale.t("보관 조각: 아래부터 "))'));
      await tap('#btnSettings');await js("document.getElementById('optLanguage').value='en';document.getElementById('optLanguage').dispatchEvent(new Event('change',{bubbles:true}));true");
      await tap('#ovSettings [data-close]');ck('language change preserves feature state/'+locale,(await state()).hold.piece.join()==='2,3,3'&&!(await state()).holdUsed);
    }
    for(const skin of ['lab','cafe','gem','deep'])for(const tray of ['top','bottom'])for(const preview of [0,1,2,3]){
      await load('skin='+skin+'&tray='+tray+'&lang=pt-BR',360,640);
      await setup({piece:[0,1,1],hold:{piece:[2],intro:-1,flipped:false},preview,score:1234567890,
        bottles:Array.from({length:8},(_,i)=>[8,8,i]),check:true});
      const g=await geom(),tag=skin+'/'+tray+'/'+preview;
      ck('skin/large score/warning/triple fit/'+tag,g.actions.b<=640.1&&g.scroll[2]<=360&&g.scroll[3]<=640&&
        g.overlaps.every((r,i,a)=>!i||r.x>=a[i-1].x+a[i-1].w-.1)&&g.hold.w>=44&&g.hold.h>=44,g);
      ck('skin and warning really active/'+tag,await js('document.documentElement.dataset.skin==='+JSON.stringify(skin)+'&&document.querySelectorAll("#cup .layer").length===3&&document.getElementById("status").textContent.includes(WSSLocale.t("{0}칸짜리 자리가 없어요. 홀드로 조각을 바꾸면 계속할 수 있어요.",3))'));
    }
    const outcomes=[];
    for(const reduce of [false,true]){
      await load('reduce='+(reduce?1:0)+'&controls=tapPlace');await setup({n:8,piece:[0,1,1]});
      await tap('#btnHold',false,0);await place(0,'tapPlace',true);await tap('#btnHold',false,0);await place(1,'tapPlace',true);
      const s=await state();outcomes.push(s);
      ck('fast native hold/place while effects run/'+reduce,s.turn===2&&!s.holdUsed&&await js('document.querySelectorAll(".ghost").length===0'));
      await sleep(400);await shot(reduce?'hold-reduced':'hold-full');
      ck('effect animations settle/'+reduce,await js('document.getElementById("heldPiece").getAnimations().filter(a=>!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition)).every(a=>a.playState==="finished")'));
    }
    ck('full/reduced identical feature state',same(outcomes[0],outcomes[1]));
    await load('controls=tapPlace');await setup({piece:[3,3,3],bottles:[[3],[],[],[],[],[],[],[]]});
    ck('three units and symbols rendered',await js('document.querySelectorAll("#cup .layer").length===3&&[...document.querySelectorAll("#cup .layer")].every(l=>l.textContent.length>0)'));
    await tap('#rack [data-i="0"]',false,0);
    ck('three-cell completion and three flight blobs',(await state()).clears===1&&await js('document.querySelectorAll(".fx-blob").length>=3'));
    await shot('triple-in-flight');await sleep(1600);await shot('triple-cleared');
    await setup({piece:[0,1,1]});
    const start=await box('#cup'),target=await box('#rack [data-i="6"]');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:0}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x,y:target.y,id:0}]});
    await sleep(30);
    const ghost=await box('.ghost:not(.pour)');
    ck('triple drag carries all units',await js('document.querySelectorAll(".ghost:not(.pour) .layer").length===3'));
    const drop={x:target.x+target.x-ghost.x,y:target.y+target.y-ghost.y};
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...drop,id:0}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);
    ck('native triple drag places entire piece in upper row',(await state()).turn===1&&(await state()).bottles[6].join()==='0,1,1');
    await setup({hold:{piece:[2,2,3],intro:-1,flipped:false}});await tap('#btnHold',false,0);const exchanged=await state();
    const dragStart=await box('#cup'),dragEnd=await box('#rack [data-i="7"]');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:dragStart.x,y:dragStart.y,id:0}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:dragEnd.x,y:dragEnd.y,id:0}]});
    await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await sleep(40);
    ck('native drag cancellation immediately after exchange preserves state',same(await state(),exchanged)&&await js('document.querySelectorAll(".ghost").length===0'));
    await load('reduce=1');
    const blocked=Array.from({length:8},(_,i)=>[8,8,i]);
    await setup({piece:[0,1,1],hold:{piece:[1],intro:-1,flipped:false},bottles:blocked,check:true});
    ck('UI identifies hold as a way to survive',(await state()).stuck==='hold'&&await js('document.getElementById("status").textContent.includes("홀드")&&!document.getElementById("btnHold").disabled'));
    await tap('#btnHold');ck('native swap saves blocked triple',!(await state()).over&&(await state()).piece.length===1);
    await setup({piece:[0,1,1],hold:{piece:[1],intro:-1,flipped:false},used:true,bottles:blocked,check:true});
    ck('used hold is not a phantom rescue',(await state()).over&&await js('document.getElementById("btnHold").disabled'));
    await load('reduce=1');await setup({n:7});await tap('#btnHold');const beforeSettings=await state();await tap('#btnSettings');
    await key('h','KeyH',72,'h');ck('modal keyboard does not exchange held piece',same(await state(),beforeSettings));await tap('#ovSettings [data-close]');
    const bad=await state();bad.hold.piece=[0,1,2,3];
    await js(`localStorage.setItem('wsurv.game.endless',${JSON.stringify(JSON.stringify(bad))});localStorage.setItem('wsurv.best.legacy-protected','777');history.replaceState(null,'','?reset=0');true`);
    await send('Page.reload');await sleep(350);
    ck('corrupt new save retained for recovery without deleting records',await js('JSON.parse(localStorage.getItem("wsurv.recovery.endless")).saved.hold.piece.length===4&&localStorage.getItem("wsurv.best.legacy-protected")==="777"&&document.getElementById("status").textContent.includes("복구")'));
    ck('recovered game is a valid new standard run',(await state()).bottles.length===6&&(await state()).hold===null);
    await js(`localStorage.setItem('wsurv.game.endless',${JSON.stringify(JSON.stringify(bad))});history.replaceState(null,'','?reset=0&quota=1');true`);
    await send('Page.reload');await sleep(350);
    ck('failed recovery backup protects the original save',await js('JSON.parse(localStorage.getItem("wsurv.game.endless")).hold.piece.length===4&&document.getElementById("status").textContent.includes("자동 저장하지")'));
    await place(0);
    ck('temporary play cannot overwrite a protected corrupt save',(await state()).turn===1&&await js('JSON.parse(localStorage.getItem("wsurv.game.endless")).hold.piece.length===4'));
    await load('reduce=1');await setup({n:7,old:true});
    await js("localStorage.setItem('wsurv.rules',JSON.stringify(sanitizeRules(EXPANDING_RULES)));history.replaceState(null,'','?reset=0');true");
    await send('Page.reload');await sleep(350);
    ck('ongoing old e1 game keeps its old rules',!(await state()).rules.holdVersion&&await js('document.getElementById("holdSlot").hidden'));
    await tap('#btnNew');await tap('#btnNew');ck('fresh old standard settings upgrade',(await state()).rules.holdVersion===1);
    await js("localStorage.setItem('wsurv.rules',JSON.stringify(sanitizeRules(EXPANDING_RULES)));localStorage.setItem('wsurv.rules.custom','true');true");
    await tap('#btnNew');await tap('#btnNew');ck('explicit old custom settings preserved',!(await state()).rules.holdVersion);
    await tap('#btnSettings');if(!await js('document.getElementById("labBox").open'))await tap('#labBox > summary');await tap('#btnDefaults');await tap('#btnApply');
    ck('defaults restore both features',(await state()).rules.holdVersion===1&&(await state()).rules.tripleVersion===1);
    await tap('#btnSettings');await js("document.getElementById('set-piece').value='1-3';true");await tap('#btnApply');
    ck('fixed custom form does not inherit feature flags',!(await state()).rules.expansion&&!(await state()).rules.holdVersion&&!(await state()).rules.tripleVersion);
    await load('reduce=1');await setup();
    await js("(()=>{const keys=Array.from({length:10},(_,i)=>'historical-'+i);localStorage.setItem('wsurv.pace.idx',JSON.stringify(keys));for(const k of keys){localStorage.setItem('wsurv.pace.'+k,JSON.stringify({score:777,turn:1,cum:[777]}));localStorage.setItem('wsurv.last.'+k,JSON.stringify({score:777,turn:1,cum:[777]}));localStorage.setItem('wsurv.runs.'+k,'20');}return true;})()");
    await js("(()=>{const s=window.__snapFn().S;giveUp(s);window.__boot({S:s});return true;})()");
    ck('new standard remains eligible for stars',(await state()).starsEligible===true);
    ck('new policy preserves all historical pace/last/run keys',await js("Array.from({length:10},(_,i)=>'historical-'+i).every(k=>JSON.parse(localStorage.getItem('wsurv.pace.'+k)).score===777&&JSON.parse(localStorage.getItem('wsurv.last.'+k)).score===777&&localStorage.getItem('wsurv.runs.'+k)==='20')&&JSON.parse(localStorage.getItem('wsurv.pace.idx')).length===10"));
    const stars=await js('localStorage.getItem("wsurv.stars.total")');await js('window.__boot({S:window.__snapFn().S});true');
    ck('re-render does not duplicate rewards',await js('localStorage.getItem("wsurv.stars.total")')===stars);
    // Pure engine chooses the sequence; DOM buttons replay it. No growth/hold/triple state is injected mid-run.
    const replay=run(E.sanitizeRules(E.ENDLESS_RULES),'expansion-0',120,2,true);
    await load('reduce=1');
    await js("(()=>{const s=newState('endless','expansion-0',sanitizeRules(ENDLESS_RULES));s.cum=[];s.rescueAds=0;window.__boot({S:s});return true;})()");
    for(const a of replay.actions){
      const expression=a.kind==='hold'?'document.getElementById("btnHold").click()':a.kind==='flip'?'document.getElementById("btnFlip").click()':
        a.kind==='place'?'document.getElementById("cup").click();document.querySelector(\'#rack [data-i="'+a.args+'"]\').click()':
        'document.querySelector(\'#rack [data-i="'+a.args[0]+'"]\').click();document.querySelector(\'#rack [data-i="'+a.args[1]+'"]\').click()';
      const result=await js('(()=>{const t=performance.now();'+expression+';return performance.now()-t;})()');latency.push({kind:a.kind,ms:result});
    }
    const final=await state();
    ck('seeded DOM replay matches real engine with hold/triple',same(final.bottles,replay.state.bottles)&&same(final.growth,replay.state.growth)&&same(final.hold,replay.state.hold)&&final.holdUsed===replay.state.holdUsed&&final.score===replay.score&&final.turn===replay.turn,
      {score:final.score,turn:final.turn,engine:replay.score,metrics:replay.metrics});
    ck('seeded play reaches both expansions and naturally places triples',final.bottles.length===8&&replay.metrics.holds>0&&replay.metrics.triplePlaced>0,replay.metrics);
    await shot('natural-play');
    ck('no runtime errors in final replay',await js('window.__errors.length===0'),await js('window.__errors'));
  }finally{
    if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));
    fs.writeFileSync(path.join(BASE,'research/hold-triple/out/browser.json'),JSON.stringify({rows,geometry,latency,physicalDevice:false,safeArea:'CSS env substitution fixture',beforeSource:beforeRef},null,2));
  }
  const failed=rows.filter(r=>!r.pass).length;console.log('hold/triple browser '+(rows.length-failed)+'/'+rows.length+', '+failed+' failed');process.exitCode=failed?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
