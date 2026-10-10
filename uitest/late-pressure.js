// Built-page pressure/migration/undo checks with real CDP mouse/touch input. Hooks are test-only.
const fs = require('fs'), path = require('path'), http = require('http'), { spawn,execFileSync } = require('child_process');
const { E } = require('../harness');
const { ROOT, EVIDENCE, write, metadata } = require('../research/late-pressure/common');
const wait = ms => new Promise(r => setTimeout(r,ms)), checks = [], geometry = [], fontLoads = [];
function ck(name, pass, detail) { checks.push({name,pass:!!pass,...(!pass?{detail}:{})}); if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail)); }
async function main() {
  execFileSync(process.execPath,['build-pages.js'],{cwd:ROOT,stdio:'ignore'});
  const init = `<script>
    const params=new URLSearchParams(location.search);
    if(params.get('reset')!=='0'){
      localStorage.clear();localStorage.setItem('wsurv.seenHelp','true');localStorage.setItem('wsurv.locale',JSON.stringify(params.get('lang')||'ko'));
      localStorage.setItem('wsurv.themes.owned','["lab","cafe","gem","deep"]');
      localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,staged:false,sound:false,vibrate:false,fx:'juicy',
        controls:params.get('controls')||'classic',tray:params.get('tray')||'bottom',skin:params.get('skin')||'lab',symbols:true,theme:'dark'}));
    }
    window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});}}};
  </script>`;
  const clean = source => source.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/,'const FIREBASE_CONFIG = null;')
    .replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g,(_,side) => 'var(--test-safe-'+side+',0px)')
    .replace('function endlessRules() {','window.__endlessRules = endlessRules; window.__startGame = startGame; window.__bestKey = () => bestKey();\n  function endlessRules() {');
  const after = clean(fs.readFileSync(path.join(ROOT,'dist/index.html'),'utf8')).replace('<body>','<body>'+init);
  const before = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
    '<style>:root{color-scheme:dark;box-sizing:border-box}body{margin:0}[hidden]{display:none!important}</style><body>'+init+
    clean(fs.readFileSync(path.join(EVIDENCE,'before-source.html'),'utf8'))+'</body></html>';
  const server = http.createServer((req,res) => {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.url.startsWith('/before')?before:after);});
  await new Promise(r => server.listen(8156,'127.0.0.1',r));
  const profile = path.join(EVIDENCE,'profile-'+Date.now()); fs.mkdirSync(profile,{recursive:true});
  const chrome = spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let ws;
  try {
    const activePort = path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(activePort);i++)await wait(100);
    const port = Number(fs.readFileSync(activePort,'utf8').split('\n')[0]);
    const tabs = await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();ws.onmessage=event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(m.error.message)):r(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const load=async(params={},before=false)=>{
      await send('Page.navigate',{url:'http://127.0.0.1:8156/'+(before?'before':'')+'?'+new URLSearchParams(params)});
      for(let i=0;i<100;i++){await wait(30);if(await js('!!window.__snapFn?.().S'))break;}
      // A remote font subset may stall. Keep input tests bounded and disclose fallback geometry.
      const fonts = await js('Promise.race([document.fonts.ready.then(()=>({loaded:true})),new Promise(r=>setTimeout(()=>r({loaded:false,pending:[...document.fonts].filter(f=>f.status==="loading").map(f=>f.family)}),3000))])');
      fontLoads.push({params,before,...fonts});
    };
    const fixture=async(score,n=8,legacy=false,mode='endless')=>{
      await js(`(()=>{const r=sanitizeRules(${mode==='daily'?'DEFAULT_RULES':legacy?'LEGACY_ENDLESS_RULES':'ENDLESS_RULES'}),s=newState('${mode}','late-pressure-ui',r);
        s.score=${score};${mode==='endless'?`s.bottles=Array.from({length:${n}},()=>[]);s.growth.activeColors=${n===8?9:n===7?6:4};s.growth.pendingIntro=[];`:''}
        s.piece=[0,1,1];${mode==='daily'?'s.piece=[0,1];':''}s.cum=[];s.rescueAds=0;s.bestAtStart=1e14;s.newBestShown=true;
        window.__boot({S:s});return true;})()`);await wait(70);
    };
    const state=()=>js('window.__snapFn().S');
    const geom=()=>js(`(()=>{const ci=document.getElementById('colorInfo'),box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
      const range=document.createRange();range.selectNodeContents(ci);return{glass:box(document.querySelector('#rack .glass')),runInfo:box(document.getElementById('runInfo')),
        note:ci.textContent,noteBox:box(ci),textWidth:range.getBoundingClientRect().width,actions:box(document.querySelector('.actions')),
        scroll:[scrollX,scrollY,document.documentElement.scrollWidth,document.documentElement.scrollHeight],viewport:[innerWidth,innerHeight],errors:__errors};})()`);
    const shot=async(name)=>{const value=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(EVIDENCE,name+'.png'),Buffer.from(value.data,'base64'));};
    const press=async(selector,mouse=false,pause=70)=>{
      const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(mouse){await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});}
      else{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0,radiusX:5,radiusY:5,force:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      if(pause)await wait(pause);
    };
    for(const [width,height,safeTop,safeBottom]of [[360,640,0,0],[390,724,47,34]])for(const lang of ['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id'])for(const tray of ['bottom','top']){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await load({lang,tray});
      await js(`document.documentElement.style.setProperty('--test-safe-top','${safeTop}px');document.documentElement.style.setProperty('--test-safe-bottom','${safeBottom}px');dispatchEvent(new Event('resize'));true`);
      await fixture(0,6,false,'daily');const daily=await geom();
      for(const score of [4500,10000,15000,25000]){
        await fixture(score);const g=await geom(),key=[width,height,lang,tray,score].join('/');geometry.push({key,daily,game:g});
        ck('HUD/bottle geometry/'+key,Math.abs(g.glass.h-daily.glass.h)<.2&&g.runInfo.h<=44.2,g);
        ck('localized milestone fits/'+key,g.textWidth<=g.noteBox.w+.5&&g.note.length>0&&!g.note.includes('{0}'),g);
        ck('safe area/no page scroll/'+key,g.actions.b<=height-safeBottom+.2&&g.scroll[0]===0&&g.scroll[1]===0&&g.scroll[2]<=width&&g.errors.length===0,g);
        if(width===390&&lang==='ko'&&tray==='bottom')await shot('ko-'+score);
      }
    }
    console.log('Localized geometry finished: '+checks.filter(c=>c.pass).length+'/'+checks.length);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await load();
    ck('fresh default enables pressure',(await state()).rules.pressureVersion===1);
    await js(`localStorage.setItem('wsurv.rules',JSON.stringify(sanitizeRules(LEGACY_ENDLESS_RULES)));localStorage.removeItem('wsurv.rules.custom');true`);
    ck('previous standard settings upgrade for next run',await js('window.__endlessRules().pressureVersion===1'));
    await js(`localStorage.setItem('wsurv.rules.custom','true');true`);
    ck('explicit old custom stays fixed',await js('!window.__endlessRules().pressureVersion'));
    await fixture(15000,8,true);const legacy=await state();
    await js(`localStorage.setItem('wsurv.game.endless',JSON.stringify(window.__snapFn().S));localStorage.setItem(window.__bestKey(),'777');true`);
    await load({reset:'0'});const resumed=await state();
    ck('real reload keeps old run rules/current/queue/HOLD',!resumed.rules.pressureVersion&&JSON.stringify(resumed.growth.queue)===JSON.stringify(legacy.growth.queue)&&JSON.stringify(resumed.piece)===JSON.stringify(legacy.piece),resumed.rules);
    ck('old best key retained on reload',await js('JSON.parse(localStorage.getItem(window.__bestKey()))===777'));
    await js('giveUp(window.__snapFn().S);window.__boot({S:window.__snapFn().S});true');
    ck('old standard still awards stars on actual run end',(await state()).starsEligible===true);
    const oldBestAfter = await js('JSON.parse(localStorage.getItem(window.__bestKey()))');
    await js(`localStorage.removeItem('wsurv.rules.custom');window.__startGame('endless',true);true`);
    ck('actual fresh restart upgrades and separates records',await js('window.__snapFn().S.rules.pressureVersion===1&&JSON.parse(localStorage.getItem("wsurv.best."+rulesSig(sanitizeRules(LEGACY_ENDLESS_RULES))))==='+oldBestAfter));
    for(const controls of ['classic','tapPlace'])for(const mouse of [false,true]){
      await load({controls});await fixture(9999);
      await js(`(()=>{const s=window.__snapFn().S;s.bottles[0]=[0,0,0];s.piece=[0];s.growth.pieceIntro=-1;window.__boot({S:s});return true;})()`);
      const before=await state();if(controls==='classic')await press('#cup',mouse);await press('#rack [data-i="0"]',mouse);
      const after=await state();ck('native threshold placement/'+controls+'/'+mouse,after.score===10099&&after.turn===before.turn+1,after.score);
      await press('#btnUndo',mouse);const undone=await state();
      ck('actual undo restores queue/generation/rules/'+controls+'/'+mouse,undone.score===before.score&&undone.growth.generation===before.growth.generation&&JSON.stringify(undone.growth.queue)===JSON.stringify(before.growth.queue),undone.score);
      if(controls==='classic')await press('#cup',mouse);await press('#rack [data-i="0"]',mouse);const replay=await state();
      ck('actual replay regenerates same new queue/'+controls+'/'+mouse,JSON.stringify(replay.growth.queue)===JSON.stringify(after.growth.queue));
    }
    for(const spacing of [20,50,80]){
      await load();await fixture(18000);const before=await state();
      await press('#btnHold',false,spacing);await press('#btnHold',false,spacing);const held=await state();
      ck('rapid HOLD locks/'+spacing,held.holdUsed&&held.growth.generation===before.growth.generation+1);
      await press('#cup',false,spacing);await press('#rack [data-i="0"]',false,spacing);
      ck('rapid placement rearms HOLD/'+spacing,(await state()).turn===before.turn+1&&!(await state()).holdUsed);
    }
    for(const skin of ['lab','cafe','gem','deep']){
      await load({skin});await fixture(25000);const g=await geom();ck('skin max-pressure geometry/'+skin,g.glass.h>=135&&g.errors.length===0,g);await shot('skin-'+skin);
    }
    // A paired baseline uses its original policy; no pressure helpers exist there.
    await load({},true);await js(`(()=>{const s=newState('endless','before-height',sanitizeRules(ENDLESS_RULES));s.score=25000;s.bottles=Array.from({length:8},()=>[]);s.growth.activeColors=9;window.__boot({S:s});return true;})()`);const old=await geom();
    await load();await fixture(25000);const latest=await geom();ck('paired baseline bottle height unchanged',Math.abs(old.glass.h-latest.glass.h)<.2,{old,latest});
    ck('no runtime errors',await js('__errors.length===0'));
    await shot('final-mobile');
  } finally { if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));write('browser.json',{...metadata(),checks,geometry,fontLoads,physicalDevice:false,safeArea:'CSS substitution fixture'}); }
  console.log(checks.filter(c=>c.pass).length+'/'+checks.length+' passed');if(checks.some(c=>!c.pass))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
