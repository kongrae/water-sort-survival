// Mobile Pages regression: OS appearance, real touch/wheel scrolling, safe areas and dialog scrolling.
// node uitest/mobile-viewport.js [--url=https://kongrae.github.io/water-sort-survival/]
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn, execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'outputs/mobile-viewport');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync(process.execPath, [path.join(BASE, 'build-pages.js')], { stdio: 'ignore' });
  const publicUrl = process.argv.find(a => a.startsWith('--url='))?.slice(6);
  const publicOnly = process.argv.includes('--public-only');
  if(publicOnly&&!publicUrl)throw Error('--public-only requires --url.');
  const init = `<script>
    const p = new URLSearchParams(location.search);
    localStorage.clear(); localStorage.setItem('wsurv.locale',JSON.stringify(p.get('locale')||'ko'));
    if (p.get('fresh') !== '1') localStorage.setItem('wsurv.seenHelp','true');
    localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,staged:false,sound:false,vibrate:false,tryLocked:true,skin:p.get('skin')||'lab',tray:p.get('tray')||'bottom'}));
    window.__errors=[]; addEventListener('error',e=>window.__errors.push(e.message));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});window.__fixture=()=>{
      const s=newState('endless','viewport-test',sanitizeRules(EXPANDING_RULES));
      s.score=3200;updateGrowth(s,false);s.bottles=[[0,1],[2],[3,3],[1,2],[2,2],[],[],[]];s.piece=[0,1];
      s.turn=10;s.bestAtStart=1000000;s.newBestShown=true;fn({S:s});return true;
    };if(p.get('fresh')!=='1')window.__fixture();}}};
  </script>`;
  let page = fs.readFileSync(path.join(BASE, 'dist/index.html'), 'utf8')
    .replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/, 'const FIREBASE_CONFIG = null;')
    .replace('<body>', '<body>'+init);
  const server = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);});
  await new Promise(r=>server.listen(8141,'127.0.0.1',r));
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--no-first-run','--force-prefers-no-reduced-motion','--remote-debugging-port=9343',
      '--user-data-dir='+path.join(OUT,'profile-'+Date.now()),'about:blank'],{stdio:'ignore'});
  const checks=[], geometry=[];let ws, safeAreaMode;
  const ck=(name,pass,detail)=>{checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail));};
  try {
    let targets;for(let i=0;i<100&&!targets?.some(t=>t.type==='page');i++){await sleep(100);try{targets=await(await fetch('http://127.0.0.1:9343/json/list')).json();}catch{}}
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(JSON.stringify(m.error))):r(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const protocol=await(await fetch('http://127.0.0.1:9343/json/protocol')).json();
    const safeCommand=protocol.domains.find(d=>d.domain==='Emulation').commands.find(c=>c.name==='setSafeAreaInsets');
    safeAreaMode=safeCommand?'native Chrome emulation':'CSS env substitution fixture (not a physical notch)';
    // Older Chrome has no setSafeAreaInsets. Substitute only the test document's env values,
    // retaining the production max() expressions and viewport fitting calculation.
    if(!safeCommand)page=page.replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g,(_,side)=>'var(--test-safe-area-'+side+', 0px)');
    const safe=async(top=0,bottom=0)=>safeCommand?send('Emulation.setSafeAreaInsets',{[safeCommand.parameters[0].name]:{top,bottom,left:0,right:0}}):undefined;
    const viewport=(w,h)=>send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
    const load=async(query='',w=390,h=844,appearance='light',top=0,bottom=0)=>{
      await viewport(w,h);await safe(top,bottom);
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:appearance}]});
      await send('Page.navigate',{url:'http://127.0.0.1:8141/?'+query});
      for(let i=0;i<100;i++){await sleep(30);if(await js('!!window.__snapFn?.().S'))break;}
      if(!safeCommand)await js("document.documentElement.style.setProperty('--test-safe-area-top','"+top+"px');document.documentElement.style.setProperty('--test-safe-area-bottom','"+bottom+"px');window.dispatchEvent(new Event('resize'));true");
      await js('document.fonts.ready.then(()=>true)');await sleep(100);
    };
    const geom=()=>js(`(()=>{const b=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};},s=getComputedStyle(document.body);return{w:innerWidth,h:innerHeight,visual:visualViewport.height,x:scrollX,y:scrollY,bodyScroll:document.body.scrollTop,rootScroll:document.documentElement.scrollTop,rootH:document.documentElement.scrollHeight,body:b(document.body),paddingTop:parseFloat(s.paddingTop),paddingBottom:parseFloat(s.paddingBottom),bg:s.backgroundColor,scheme:getComputedStyle(document.documentElement).colorScheme,theme:document.documentElement.dataset.theme||null,actions:b(document.querySelector('.actions')),tubes:[...document.querySelectorAll('#rack>.tube')].map(b),errors:window.__errors};})()`);
    const still=g=>g.x===0&&g.y===0&&g.bodyScroll===0&&g.rootScroll===0;
    const swipe=async(x,y,to)=>{
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0,radiusX:6,radiusY:6,force:1}]});
      for(let i=1;i<=8;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(to-y)*i/8,id:0,radiusX:6,radiusY:6,force:1}]});await sleep(20);}
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
    };
    const wheel=async(x,y,deltaY)=>{await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY});await sleep(180);};
    const click=async selector=>{
      const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0,radiusX:5,radiusY:5,force:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);
    };
    if(!publicOnly){
    for(const appearance of ['light','dark'])for(const skin of ['lab','cafe','gem','deep']){
      await load('skin='+skin,390,844,appearance);const g=await geom();
      ck('default dark/'+appearance+'/'+skin,g.theme===null&&g.bg==='rgb(15, 23, 28)'&&g.scheme==='dark',g);
      const glass=await js("getComputedStyle(document.querySelector('#rack .glass')).backgroundColor");
      ck('dark bottle material/'+appearance+'/'+skin,glass===({lab:'rgb(27, 40, 48)',cafe:'rgb(42, 33, 25)',gem:'rgb(29, 26, 40)',deep:'rgb(14, 34, 48)'})[skin],glass);
    }
    await load();const state=await js('JSON.stringify(window.__snapFn().S)');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
    ck('OS appearance change preserves board and dark theme',(await geom()).bg==='rgb(15, 23, 28)'&&await js('JSON.stringify(window.__snapFn().S)')===state);
    for(const [w,h,top,bottom]of [[360,640,0,0],[360,600,24,24],[390,844,47,34],[390,724,47,34],[412,915,24,24]]){
      await load('',w,h,'light',top,bottom);const g=await geom();geometry.push(g);
      ck(`visible controls and safe area/${w}x${h}`,g.body.h<=h+.1&&g.actions.b<=h-g.paddingBottom+.1&&g.tubes.every(t=>t.y>=g.paddingTop&&t.b<=g.actions.y&&t.w>=44)&&g.paddingTop>=top&&g.paddingBottom>=bottom,g);
      for(const area of [{name:'score',x:90,y:118},{name:'status',x:w/2,y:240},{name:'reserved row',x:w-25,y:310}]){
        const a=await geom();await swipe(area.x,area.y,area.y-90);await swipe(area.x,area.y-50,area.y+60);const b=await geom();
        ck(`native swipe does not move game/${w}x${h}/${area.name}`,still(b)&&Math.abs(a.actions.y-b.actions.y)<.1&&a.tubes.every((t,i)=>Math.abs(t.y-b.tubes[i].y)<.1),b);
      }
      await wheel(100,120,400);await wheel(100,120,-400);ck(`wheel does not move game/${w}x${h}`,still(await geom()));
    }
    for(const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id']){
      await load('locale='+locale,360,640);const g=await geom();
      ck('localized portrait fits/'+locale,g.actions.b<=640.1&&g.tubes.every(t=>t.b<=640.1)&&still(g),g);
    }
    for(const [w,h,top,bottom]of [[360,640,0,0],[390,724,47,34]]){
      await load('',w,h,'light',top,bottom);await click('#btnMode');await click('#btnMode');
      const g=await geom();ck('daily challenge remains fully visible/'+w+'x'+h,await js("window.__snapFn().S.mode==='daily'")&&g.actions.b<=h-g.paddingBottom+.1&&g.tubes.every(t=>t.y>=g.paddingTop&&t.b<=h-g.paddingBottom),g);
      await swipe(90,120,40);ck('daily challenge page stays fixed/'+w+'x'+h,still(await geom()));
      const turn=await js('window.__snapFn().S.turn');await click('#cup');await click('#rack [data-i="5"]');
      ck('daily bottle accepts touch after viewport fitting/'+w+'x'+h,await js('window.__snapFn().S.turn')===turn+1&&still(await geom()));
    }
    await load('',390,844,'light',47,34);const beforeResize=await js('JSON.stringify(window.__snapFn().S)');
    for(const h of [724,640,844]){await viewport(390,h);await sleep(180);const g=await geom();ck('available viewport height change/'+h,still(g)&&g.actions.b<=h-g.paddingBottom+.1&&await js('JSON.stringify(window.__snapFn().S)')===beforeResize,g);}
    await safe();await viewport(844,390);await sleep(100);await viewport(390,844);await sleep(180);
    ck('rotation return retains board and fixed game',still(await geom())&&await js('JSON.stringify(window.__snapFn().S)')===beforeResize);
    await load('',360,640);const dialogState=await js('JSON.stringify(window.__snapFn().S)');
    await click('#btnSettings');await js("document.getElementById('labBox').open=true");await sleep(50);
    const sheet=()=>js("(()=>{const e=document.querySelector('#ovSettings .sheet'),r=e.getBoundingClientRect(),c=document.querySelector('#ovSettings [data-close]').getBoundingClientRect();return {top:e.scrollTop,max:e.scrollHeight-e.clientHeight,x:r.x,y:r.y,w:r.width,h:r.height,close:{y:c.y,b:c.bottom}};})()");
    let sh=await sheet();await swipe(sh.x+sh.w/2,sh.y+sh.h-60,sh.y+90);sh=await sheet();
    ck('settings scrolls with native touch while game stays fixed',sh.top>0&&still(await geom()),sh);
    await wheel(sh.x+sh.w/2,sh.y+sh.h/2,2000);sh=await sheet();
    ck('settings wheel scroll stays contained and close remains visible',sh.top>0&&still(await geom())&&sh.close.y>=0&&sh.close.b<=640,sh);
    await swipe(sh.x+sh.w/2,sh.y+sh.h-60,sh.y+80);ck('dialog bottom does not scroll game',still(await geom()));
    await click('#ovSettings [data-close]');
    ck('closing settings retains exact game state',await js('JSON.stringify(window.__snapFn().S)')===dialogState&&still(await geom()));
    await load('fresh=1',360,640);await swipe(180,520,140);
    ck('first-run rules remain usable and contained',await js("!document.getElementById('ovHelp').hidden")&&still(await geom()));
    await click('#ovHelp [data-close]');ck('first-run rules close without scrolling',await js("document.getElementById('ovHelp').hidden")&&still(await geom()));
    await load('',390,844,'light',47,34);
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,'mobile-dark.png'),Buffer.from(shot.data,'base64'));
    ck('no runtime errors',(await geom()).errors.length===0);
    }
    if(publicUrl){
      await viewport(390,844);await safe();
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
      await send('Page.navigate',{url:publicUrl});await sleep(1800);
      ck('published Pages defaults dark under light OS',await js("getComputedStyle(document.body).backgroundColor==='rgb(15, 23, 28)'&&getComputedStyle(document.documentElement).colorScheme==='dark'"));
      if(await js("!document.getElementById('ovHelp').hidden"))await click('#ovHelp [data-close]');
      await swipe(90,120,40);await wheel(90,120,400);
      ck('published Pages prevents native page scroll',await js('scrollY===0&&document.body.scrollTop===0&&document.documentElement.scrollTop===0'));
      const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,'published-dark.png'),Buffer.from(shot.data,'base64'));
    }
  }finally{
    if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));
    fs.writeFileSync(path.join(OUT,publicUrl?'published.json':'checks.json'),JSON.stringify({checks,geometry,safeAreaMode,physicalDevice:false,publicUrl:publicUrl||null},null,2)+'\n');
  }
  const bad=checks.filter(c=>!c.pass);console.log('Mobile viewport '+(checks.length-bad.length)+'/'+checks.length+', '+bad.length+' failed');process.exitCode=bad.length?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
