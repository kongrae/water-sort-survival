// Material, same-bottle reuse and motion evidence in an isolated Chrome profile.
// node uitest/bottle-quality.js [--before]
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'outputs/bottle-quality'), DATA = path.join(BASE, 'research/bottle-quality/out');
const before = process.argv.includes('--before'), phase = before ? 'before' : 'after', PORT = 8153;
const pause = ms => new Promise(r => setTimeout(r, ms)), sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function main() {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
  execFileSync(process.execPath, ['build-pages.js'], { cwd: BASE, stdio: 'ignore' });
  const source = fs.readFileSync(before ? path.join(OUT, 'before-source.html') : path.join(BASE, 'water-sort-survival.html'), 'utf8');
  let page = fs.readFileSync(path.join(BASE, 'dist/index.html'), 'utf8').split('<body>')[0] + '<body>' + source.replace(/<title>[^<]*<\/title>/, '').replace(/<meta name="description"[^>]*>/, '') + '\n</body></html>';
  const init = `<script>
    const query=new URLSearchParams(location.search);localStorage.clear();localStorage.setItem('wsurv.seenHelp','true');
    document.documentElement.dataset.theme=query.get('theme')||'dark';localStorage.setItem('wsurv.themes.owned','["lab","cafe","gem","deep"]');
    localStorage.setItem('wsurv.locale',JSON.stringify('ko'));
    localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,sound:false,vibrate:false,symbols:query.get('symbols')==='1',controls:'classic',tray:query.get('tray')||'bottom',fx:'juicy',reduceFx:query.get('reduce')==='1',theme:query.get('theme')||'dark',skin:query.get('skin')||'lab'}));
    window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});
      window.__fixture=(o={})=>{const n=o.n||8,s=newState(o.mode||'endless','bottle-quality-fixed',sanitizeRules(EXPANDING_RULES));
        s.score=n===8?3200:n===7?1100:0;updateGrowth(s,false);s.turn=10;s.streak=3;s.lastBigTurn=-1;s.newBestShown=true;s.bestAtStart=1000000;s.paceAhead=true;
        s.bottles=[[0,1,1],[2,2],[3,3,3],[0,0,3],[1,2],[]].concat(n>=7?[[]]:[],n===8?[[]]:[]);s.piece=[2,2];s.cum=[];s.rescueAds=0;
        for(const k of ['bottles','piece','streak'])if(o[k]!==undefined)s[k]=o[k];fn({S:s});return true;};__fixture();
    }}};
  </script>`;
  page = page.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/, 'const FIREBASE_CONFIG = null;').replace('<body>', '<body>' + init);
  page = page.replace(/\}\)\(\);\s*<\/script>\s*<\/body>/, 'window.__quality={clearFx,fxLive,fxTimers,prefs,SND,paintPieceTube,clearViews:typeof clearViews==="undefined"?null:clearViews};})();</script></body>');
  page = page.replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g, (_, s) => 'var(--test-safe-' + s + ', 0px)');
  fs.writeFileSync(path.join(OUT, phase + '-test.html'), page);
  const server = http.createServer((req,res) => { res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' }); res.end(page); });
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const profile=path.join(OUT,'profile-'+phase+'-'+Date.now()),activePort=path.join(profile,'DevToolsActivePort');
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'], {stdio:'ignore'});
  let ws; const checks=[], geometry=[], scenes=[], materials=[];
  const ck=(name,pass,detail)=>{ checks.push({name,pass:!!pass,detail});if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail)); };
  try {
    for(let n=0;n<100&&!fs.existsSync(activePort);n++){await pause(100);if(chrome.exitCode!==null)throw Error('Dedicated Chrome exited: '+chrome.exitCode);}
    const CDP=Number(fs.readFileSync(activePort,'utf8').split('\n')[0]);
    let targets;for(let n=0;n<100&&!targets?.some(t=>t.type==='page');n++){await pause(100);try{targets=await(await fetch('http://127.0.0.1:'+CDP+'/json/list')).json();}catch{}}
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);j(Error('CDP timed out: '+method));},20000);pending.set(n,m=>{clearTimeout(t);m.error?j(Error(JSON.stringify(m.error))):r(m.result);});ws.send(JSON.stringify({id:n,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');
    let navigation=0;
    const load=async(q='',w=390,h=844,top=0,bottom=0)=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      const url='http://127.0.0.1:'+PORT+'/?'+q+'&qaLoad='+(++navigation);
      await send('Page.navigate',{url});
      await send('Page.bringToFront');
      for(let n=0;n<100;n++){await pause(30);if(await js('location.href==='+JSON.stringify(url)+'&&!!window.__snapFn?.().S&&!!window.__quality'))break;}
      await js(`document.documentElement.style.setProperty('--test-safe-top','${top}px');document.documentElement.style.setProperty('--test-safe-bottom','${bottom}px');dispatchEvent(new Event('resize'));document.fonts.ready.then(()=>true)`);await pause(160);
      const actual=await js('({prefs:__quality.prefs,theme:document.documentElement.dataset.theme,skin:document.documentElement.dataset.skin,reduce:document.documentElement.classList.contains("fx-reduce"),os:matchMedia("(prefers-reduced-motion: reduce)").matches,hidden:document.hidden})');
      const requested=new URLSearchParams(q);
      ck('requested presentation/'+q,actual.prefs.fx==='juicy'&&actual.reduce===(requested.get('reduce')==='1')&&actual.theme===(requested.get('theme')||'dark')&&actual.skin===(requested.get('skin')||'lab'),actual);
    };
    const click=async selector=>{const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await pause(6);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
    const pour=async(a,b)=>{await click('#rack [data-i="'+a+'"]');await click('#rack [data-i="'+b+'"]');};
    const geom=()=>js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{glass:[...document.querySelectorAll('#rack .glass')].map(box),tubes:[...document.querySelectorAll('#rack>.tube')].map(box),cup:box(document.getElementById('cup')),scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],errors:__errors};})()`);
    const fx=()=>js(`({nodes:[...__quality.fxLive].reduce((n,e)=>n+1+e.querySelectorAll('*').length,0),timers:__quality.fxTimers.size,views:__quality.clearViews?.size||0,filled:document.querySelectorAll('.fx-clear').length,waiting:document.querySelectorAll('#rack .await').length,drops:document.querySelectorAll('.fx-drop').length,flow:document.querySelectorAll('.fx-flow').length,surfaces:document.querySelectorAll('.fx-surface').length,score:document.getElementById('score').textContent,state:JSON.parse(JSON.stringify(__snapFn().S)),errors:__errors})`);
    const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,phase+'-'+name+'.png'),Buffer.from(r.data,'base64'));};
    for(const [w,h,top,bottom] of [[360,640,0,0],[360,600,24,24],[390,724,47,34],[390,844,0,0],[412,915,0,0],[768,1024,0,0]]) {
      for(const tray of ['bottom','top']) {
        await load('tray='+tray,w,h,top,bottom);
        for(const mode of ['endless','daily'])for(const n of [6,7,8]) {
          await js(`__fixture({n:${n},mode:'${mode}'})`);await pause(65);const g=await geom();geometry.push({w,h,top,bottom,tray,mode,n,...g});
          ck('fits/'+[w,h,tray,mode,n].join('/'),g.scroll[0]<=w&&g.scroll[1]<=h+1&&g.tubes.every(t=>t.w>=44&&t.h>=44)&&g.errors.length===0,g.scroll);
        }
      }
    }
    for(const theme of ['dark','light'])for(const skin of ['lab','cafe','gem','deep']) {
      await load('skin='+skin+'&theme='+theme+'&symbols=1');
      await js('__fixture({bottles:[[0,0,0],[1,1,1,2],[2,3,3],[4,4],[5,6],[7,7,8],[],[]],piece:[8,8]})');await pause(100);
      await shot('material-'+theme+'-'+skin);
      materials.push({theme,skin,values:await js(`({layers:[...document.querySelectorAll('#rack .layer')].map(e=>({color:e.dataset.color,text:e.textContent,background:getComputedStyle(e).backgroundImage,cls:e.className})),glass:getComputedStyle(document.querySelector('#rack .glass')).boxShadow})`)});
    }
    for(const scene of ['pour','place','clear','high']) {
      await load();await js(`__fixture({streak:${scene==='high'?6:3}})`);await pause(100);await shot(scene+'-start');
      if(scene==='pour')await pour(0,5);else if(scene==='place'){await click('#cup');await click('#rack [data-i="6"]');}else await pour(3,2);
      const started=Date.now(),frames=[];
      for(const at of [20,120,230,350,470,650,950,1500]) {await pause(Math.max(0,at-(Date.now()-started)));const sample=await fx();frames.push({at,observedAt:Date.now()-started,...sample});await shot(scene+'-'+at);}
      scenes.push({scene,frames});const end=frames.at(-1);ck('scene drains/'+scene,end.nodes===0&&end.waiting===0&&end.views===0&&end.errors.length===0,{nodes:end.nodes,views:end.views,waiting:end.waiting});
      ck('motion really plays/'+scene,frames.some(f=>f.flow>0||f.surfaces>0)&&(['pour','place'].includes(scene)||frames.some(f=>f.drops>0)));
    }
    if(!before) {
      const baseline=JSON.parse(fs.readFileSync(path.join(DATA,'before.json'),'utf8'));
      for(let i=0;i<geometry.length;i++) {const b=baseline.geometry[i],a=geometry[i];ck('geometry unchanged/'+i,JSON.stringify(a.glass)===JSON.stringify(b.glass)&&JSON.stringify(a.tubes)===JSON.stringify(b.tubes)&&JSON.stringify(a.cup)===JSON.stringify(b.cup),{screen:[a.w,a.h],n:a.n,mode:a.mode});}
      await load('symbols=1');await js('__fixture({bottles:[[0,0,1,1],[2,2,2],[],[],[],[],[],[]]})');
      ck('joined water keeps four real cells and symbols',await js(`(()=>{const a=[...document.querySelectorAll('#rack [data-i="0"] .layer')],b=[...document.querySelectorAll('#rack [data-i="1"] .layer')];return a.length===4&&a.every(e=>!!e.textContent)&&a[0].classList.contains('join-above')&&a[1].classList.contains('join-below')&&!a[1].classList.contains('join-above')&&a[2].classList.contains('join-above')&&b[1].classList.contains('join-above')&&b[1].classList.contains('join-below');})()`));
      await click('#cup');
      ck('preview cells never join real water',await js("[...document.querySelectorAll('.ghostL')].every(e=>!e.classList.contains('join-below')&&!e.classList.contains('join-above'))"));
      for(const gap of [20,50,80,260,390]) {
        const states=[];
        for(const reduce of [false,true]) {
          await load('reduce='+(reduce?1:0));await pour(3,2);await pause(gap);await click('#cup');await click('#rack [data-i="2"]');
          const used=await fx();states.push(used.state);
          ck('same bottle reusable/'+gap+'/'+reduce,used.state.bottles[2].join()==='2,2'&&used.errors.length===0,used.state.bottles[2]);
          await pause(30);ck('old filled column yields/'+gap+'/'+reduce,await js("document.querySelectorAll('.fx-clear[data-slot=\"2\"]').length===0"));
          await pause(1550);const end=await fx();ck('reuse settles/'+gap+'/'+reduce,end.nodes===0&&end.timers===0&&end.views===0&&end.waiting===0&&end.score===new Intl.NumberFormat('ko-KR').format(end.state.score),{nodes:end.nodes,timers:end.timers,views:end.views,score:end.score});
        }
        ck('replay same engine state/'+gap,JSON.stringify(states[0])===JSON.stringify(states[1]),{seed:'bottle-quality-fixed',actions:[['pour',3,2],['place',2]],gap});
      }
      // Observe the envelope during seven simultaneous clears, including all descendant nodes.
      await load();await js(`__fixture({bottles:[[0],[0,0,0],[1,1,1,1],[2,2,2,2],[3,3,3,3],[4,4,4,4],[5,5,5,5],[6,6,6,6]],streak:8});window.__impactTimes=[];const impact=__quality.SND.impact;__quality.SND.impact=(...args)=>{__impactTimes.push({at:performance.now(),drops:document.querySelectorAll('.fx-drop').length});return impact(...args);};window.__peak={nodes:0,drops:0};window.__sample=setInterval(()=>{__peak.nodes=Math.max(__peak.nodes,[...__quality.fxLive].reduce((n,e)=>n+1+e.querySelectorAll('*').length,0));__peak.drops=Math.max(__peak.drops,document.querySelectorAll('.fx-drop').length);},5);true`);
      await pour(0,1);await pause(400);await shot('multi');await pause(1900);
      const multi=await js('clearInterval(__sample);({peak:__peak,sounds:__impactTimes})');ck('one audible impact for a multi-clear group',multi.sounds.length===1&&multi.sounds[0].drops>0,multi);
      ck('global budget counts descendants',multi.peak.nodes<=180&&multi.peak.drops<=96,multi.peak);const settled=await fx();ck('multi clear drains',settled.nodes===0&&settled.views===0&&settled.timers===0,settled.nodes);
      for(const action of ['undo','settings','locale','skin','resize','hidden','new','mode','reduce']) {
        await load();await pour(3,2);await pause(240);
        if(action==='undo')await click('#btnUndo');
        if(action==='settings')await click('#btnSettings');
        if(action==='locale')await js("WSSLocale.set('hi')");
        if(action==='skin'){
          await click('#btnSettings');await js("document.getElementById('btnThemes').scrollIntoView({block:'center'});true");await click('#btnThemes');
          const selector='.theme-card:has([data-skin="deep"]) button';await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});true`);await click(selector);
          ck('skin changed through native controls',await js('document.documentElement.dataset.skin==="deep"'));
        }
        if(action==='resize')await send('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
        if(action==='hidden'){const t=await send('Target.createTarget',{url:'about:blank'});await pause(150);const hidden=await js('({hidden:document.hidden,state:document.visibilityState})');ck('hidden tab during clear',hidden.hidden===true,hidden);await send('Page.bringToFront');await send('Target.closeTarget',{targetId:t.targetId});}
        if(action==='new'){await click('#btnNew');await pause(80);await click('#btnNew');ck('new run through native controls',await js('__snapFn().S.turn===0&&__snapFn().S.score===0'));}
        if(action==='mode'){await click('#btnMode');await pause(80);await click('#btnMode');ck('daily mode through native controls',await js('__snapFn().S.mode==="daily"'));}
        if(action==='reduce')await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
        await pause(1500);const end=await fx();ck('interruption drains/'+action,end.nodes===0&&end.views===0&&end.timers===0&&end.waiting===0&&end.errors.length===0,{nodes:end.nodes,timers:end.timers,views:end.views,errors:end.errors});
        if(action==='reduce')await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      }
    }
  } finally {
    ws?.close();chrome.kill();await new Promise(r=>server.close(r));
    fs.writeFileSync(path.join(DATA,phase+'.json'),JSON.stringify({phase,checkedAt:new Date().toISOString(),sourceSha256:sha(source),engineSha256:sha(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]),checks,geometry,materials,scenes,physicalDevice:false},null,2)+'\n');
  }
  const failed=checks.filter(c=>!c.pass);console.log('Bottle quality '+phase+' '+(checks.length-failed.length)+'/'+checks.length+', '+failed.length+' failed');process.exitCode=failed.length?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
