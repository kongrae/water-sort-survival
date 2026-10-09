// Focused geometry and native-input checks for the compact game HUD.
// node uitest/compact-hud.js [--before] [--quick] [--counter-only]
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {spawn,execFileSync}=require('child_process');
const BASE=path.resolve(__dirname,'..'),OUT=path.join(BASE,'outputs/hud-balance'),DATA=path.join(BASE,'research/hud-balance/out');
const before=process.argv.includes('--before'),quick=process.argv.includes('--quick'),counterOnly=process.argv.includes('--counter-only'),phase=counterOnly?'counter':before?'before':'after';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
  fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(DATA,{recursive:true});
  execFileSync(process.execPath,[path.join(BASE,'build-pages.js')],{stdio:'ignore'});
  const source=fs.readFileSync(path.join(BASE,'water-sort-survival.html'),'utf8');
  if(before)fs.writeFileSync(path.join(OUT,'before-source.html'),source);
  const init=`<script>
    const p=new URLSearchParams(location.search);localStorage.clear();
    localStorage.setItem('wsurv.locale',JSON.stringify(p.get('lang')||'ko'));localStorage.setItem('wsurv.seenHelp','true');
    localStorage.setItem('wsurv.themes.owned','["lab","cafe","gem","deep"]');
    localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,staged:false,sound:false,vibrate:false,fx:'juicy',
      controls:'classic',tray:p.get('tray')||'bottom',skin:p.get('skin')||'lab',symbols:true,theme:p.get('theme')||'dark'}));
    window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});}}};
  </script>`;
  const page=fs.readFileSync(path.join(BASE,'dist/index.html'),'utf8')
    .replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/,'const FIREBASE_CONFIG = null;')
    .replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g,(_,s)=>'var(--test-safe-'+s+', 0px)')
    .replace('<body>','<body>'+init);
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);});
  await new Promise(r=>server.listen(8153,'127.0.0.1',r));
  const profile=path.join(OUT,'profile-'+Date.now()),activePort=path.join(profile,'DevToolsActivePort');
  const chrome=spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--remote-debugging-port=0',
      '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const checks=[],geometry=[];let ws;
  const ck=(name,pass,detail)=>{checks.push({name,pass:!!pass,...(pass||detail===undefined?{}:{detail})});if(!pass&&checks.filter(c=>!c.pass).length<=12)console.log('FAIL '+name+' '+JSON.stringify(detail));};
  try{
    for(let i=0;i<100&&!fs.existsSync(activePort);i++){await pause(100);if(chrome.exitCode!==null)throw Error('Dedicated Chrome exited: '+chrome.exitCode);}
    const port=Number(fs.readFileSync(activePort,'utf8').split('\n')[0]);
    let tabs;for(let i=0;i<80&&!tabs?.some(t=>t.type==='page');i++){await pause(100);try{tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();}catch{}}
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(m.error.message)):r(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const load=async(lang,tray,w,h,top,bottom,skin='lab',theme='dark')=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
      await send('Page.navigate',{url:'http://127.0.0.1:8153/?'+new URLSearchParams({lang,tray,skin,theme})});
      for(let i=0;i<100;i++){await pause(25);if(await js('!!window.__snapFn?.().S'))break;}
      await js('document.fonts.ready.then(()=>true)');
      await js(`document.documentElement.style.setProperty('--test-safe-top','${top}px');document.documentElement.style.setProperty('--test-safe-bottom','${bottom}px');dispatchEvent(new Event('resize'));true`);await pause(70);
    };
    const setup=async(mode,n=6,score=null,warn=false)=>{
      await js(`(()=>{const s=newState('${mode}','${mode==='daily'?'daily:2026-10-09':'hud-fixture'}',sanitizeRules(${mode==='daily'?'DEFAULT_RULES':'ENDLESS_RULES'}));
        s.score=${score===null?(n===8?4500:n===7?900:0):score};${mode==='endless'?`updateGrowth(s,false);s.growth.activeColors=${n===8?9:n===7?6:4};s.growth.pendingIntro=[];s.growth.pieceIntro=-1;`:''}
        s.piece=[0,1];s.cum=[];s.rescueAds=0;s.bestAtStart=1e14;s.newBestShown=true;
        ${warn?'s.stuck="hold";':''}window.__boot({S:s});return true;})()`);await pause(70);
    };
    const geom=()=>js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,right:r.right};};
      const rack=document.getElementById('rack'),app=document.querySelector('.app'),sb=document.querySelector('.scorebar'),text=e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().width;};
      return{lang:WSSLocale.current(),skin:document.documentElement.dataset.skin,mode:window.__snapFn().S.mode,n:rack.children.length,
        top:box(document.querySelector('.top')),scorebar:box(sb),runInfo:box(document.getElementById('runInfo')),status:box(document.getElementById('status')),
        rack:box(rack),glass:[...rack.querySelectorAll('.glass')].map(box),tubes:[...rack.children].map(box),incoming:box(document.querySelector('.incoming')),
        actions:box(document.querySelector('.actions')),score:box(document.getElementById('score')),scoreText:text(document.getElementById('score')),
        scoreRoom:document.querySelector('.score').clientWidth,best:box(document.getElementById('best')),app:box(app),
        viewport:[innerWidth,innerHeight],scroll:[scrollX,scrollY,document.documentElement.scrollWidth,document.documentElement.scrollHeight],
        hidden:['.brand-subtitle','.pace','.meta>div:nth-child(2)','#dots','#zoneBar'].map(s=>!document.querySelector(s).getBoundingClientRect().height),
        hold:{disabled:document.getElementById('btnHold').disabled,hidden:document.getElementById('holdSlot').hidden},errors:__errors};})()`);
    const tap=async selector=>{
      const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0,radiusX:5,radiusY:5,force:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(70);
    };
    const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,phase+'-'+name+'.png'),Buffer.from(s.data,'base64'));};
    const scenarios=[[360,640,0,0],[390,844,0,0],[412,915,0,0],[768,1024,0,0],[360,600,24,24],[390,724,47,34]];
    const languages=counterOnly?[]:before||quick?['ko']:['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id'];
    for(const lang of languages)for(const [w,h,top,bottom]of scenarios)for(const tray of ['bottom','top']){
      await load(lang,tray,w,h,top,bottom);await setup('daily');const daily=await geom();
      if(lang==='ko'&&tray==='bottom')await shot('daily-'+w+'x'+h);
      for(const n of [6,7,8]){
        await setup('endless',n);const g=await geom(),key=[lang,w,h,top,bottom,tray,n].join('/');
        geometry.push({key,w,h,top,bottom,tray,lang,n,daily,game:g});
        ck('portrait fits/'+key,g.actions.b<=h-bottom+.2&&g.scroll[0]===0&&g.scroll[1]===0&&g.scroll[2]<=w&&g.tubes.every(t=>t.w>=44&&t.y>=top&&(tray==='bottom'?t.b<=g.incoming.y+.2:t.b<=g.status.y+.2)),g);
        ck('hold gate/'+key,!g.hold.hidden&&g.hold.disabled===(n===6),g.hold);
        if(!before){
          ck('essential compact HUD/'+key,g.hidden.every(Boolean)&&g.top.h===44&&g.runInfo.h<=44.2&&g.scorebar.h<=40,g);
          ck('daily bottle height/'+key,Math.abs(g.glass[0].h-daily.glass[0].h)<.2,{daily:daily.glass[0].h,endless:g.glass[0].h});
        }
        if(lang==='ko'&&tray==='bottom'&&n===8)await shot('endless-'+w+'x'+h);
      }
    }
    if(!before&&!counterOnly){
      for(const skin of ['lab','cafe','gem','deep'])for(const theme of ['dark','light']){
        await load('hi','bottom',390,724,47,34,skin,theme);await setup('daily');const d=await geom();
        await setup('endless',8,999999999999,true);const g=await geom();
        ck('large numbers and warning/'+skin+'/'+theme,g.scoreText<=g.scoreRoom*.9&&g.score.right<=g.top.right&&g.actions.b<=690.2&&g.errors.length===0,g);
        ck('skin bottle height/'+skin+'/'+theme,Math.abs(g.glass[0].h-d.glass[0].h)<.2,{daily:d.glass[0].h,endless:g.glass[0].h});
      }
      await load('ko','bottom',390,844,0,0);await setup('endless',7);await tap('#btnHold');
      ck('native HOLD use locks',await js('window.__snapFn().S.holdUsed&&document.getElementById("btnHold").disabled'));
      await tap('#cup');await tap('#rack [data-i="5"]');
      ck('native placement restores HOLD',await js('window.__snapFn().S.turn===1&&!window.__snapFn().S.holdUsed&&!document.getElementById("btnHold").disabled'));
      await tap('#btnSettings');await js('document.getElementById("labBox").open=true');
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:180,y:500,deltaX:0,deltaY:1400});await pause(150);
      ck('settings scroll stays inside sheet',await js('document.querySelector("#ovSettings .sheet").scrollTop>0&&scrollY===0'));
      await tap('#ovSettings [data-close]');ck('no runtime errors',await js('__errors.length===0'),await js('__errors'));
      await shot('ko-final');
    }
    if(counterOnly){
      for(const lang of ['ko','en','ja']){
        await load(lang,'bottom',360,640,0,0);await setup('endless',8,123456789012);
        await send('Emulation.setCPUThrottlingRate',{rate:4});
        await js('(()=>{const s=window.__snapFn().S;giveUp(s);window.__boot({S:s});return true;})()');
        const samples=await js(`new Promise(resolve=>{const rows=[],start=performance.now(),e=document.getElementById('oScore'),sheet=document.querySelector('#ovOver .sheet');
          function sample(){const range=document.createRange();range.selectNodeContents(e);rows.push({text:e.textContent,width:range.getBoundingClientRect().width,available:e.clientWidth,sheetWidth:sheet.scrollWidth,sheetAvailable:sheet.clientWidth});
            if(performance.now()-start<850)requestAnimationFrame(sample);else resolve(rows);}requestAnimationFrame(sample);})`);
        ck('result count fits every frame at CPU x4/'+lang,samples.length>=10&&samples.every(s=>s.width<=s.available*.9&&s.sheetWidth<=s.sheetAvailable+1)&&
          samples.at(-1).text===await js('new Intl.NumberFormat(WSSLocale.current()).format(window.__snapFn().S.score)'),samples);
        geometry.push({lang,scenario:'result count CPU x4',samples});
        await send('Emulation.setCPUThrottlingRate',{rate:1});
      }
    }
  }finally{
    if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));
    fs.writeFileSync(path.join(DATA,'ui-'+phase+'.json'),JSON.stringify({checkedAt:new Date().toISOString(),sourceSha256:sha(source),engineSha256:sha(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]),checks,geometry,physicalDevice:false},null,2)+'\n');
  }
  const bad=checks.filter(c=>!c.pass);console.log('Compact HUD '+(checks.length-bad.length)+'/'+checks.length+', '+bad.length+' failed');process.exitCode=bad.length?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
