// Isolated Pages fixtures, native Chrome mouse input, motion frames and layout/lifecycle checks.
// node uitest/fx-polish.js [--before]. Uses the saved pre-change site only for the comparison run.
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'outputs/fx-polish');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const before = process.argv.includes('--before'), phase = before ? 'before' : 'after';
  fs.mkdirSync(OUT, { recursive: true });
  if (!before) execFileSync(process.execPath, [path.join(BASE, 'build-pages.js')], { stdio: 'ignore' });
  const source = fs.readFileSync(path.join(before ? path.join(OUT, 'before-site') : path.join(BASE, 'dist'), 'index.html'), 'utf8');
  const init = `<script>
    const p = new URLSearchParams(location.search);
    localStorage.clear(); localStorage.setItem('wsurv.seenHelp','true'); localStorage.setItem('wsurv.locale',JSON.stringify(p.get('locale')||'ko'));
    localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,staged:false,sound:false,vibrate:false,controls:p.get('controls')||'classic',tray:p.get('tray')||'bottom',fx:p.get('fx')||'juicy',reduceFx:p.get('reduce')==='1',theme:p.get('theme')||'dark',skin:p.get('skin')||'lab'}));
    window.__errors=[]; addEventListener('error',e=>window.__errors.push(e.message));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{
      window.__boot=fn; fn({});
      window.__fixture=(n=8,k=3,score=null)=>{
        const s=newState('endless','fx-polish',sanitizeRules(EXPANDING_RULES));
        s.score=score===null?(n===8?3200:n===7?1100:0):score; updateGrowth(s,false);
        s.growth.activeColors=n===8?8:n===7?6:4;
        s.turn=10;s.streak=k;s.turnClears=0;s.lastBigTurn=-1;s.newBestShown=true;s.bestAtStart=1000000;s.paceAhead=true;
        s.bottles=[[0,1,1],[2,2],[3,3,3],[0,0,3],[1,2],[]].concat(n>=7?[[]]:[],n===8?[[]]:[]);
        s.piece=[2,2];s.cum=[];s.rescueAds=0;fn({S:s});return true;
      };
      window.__fixture(Number(p.get('n')||8),Number(p.get('combo')||3));
    }}};
  </script>`;
  const file = path.join(OUT, phase + '-test.html');
  fs.writeFileSync(file, source.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/, 'const FIREBASE_CONFIG = null;').replace('<body>', '<body>'+init));
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--allow-file-access-from-files','--remote-debugging-port=9342','--user-data-dir='+path.join(OUT,'profile-'+Date.now()),'about:blank'],{stdio:'ignore'});
  let ws; const checks=[], geometry=[], frames=[];
  const ck=(name,pass,detail)=>{checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail));};
  try {
    let targets;for(let i=0;i<100&&!targets?.some(t=>t.type==='page');i++){await sleep(100);try{targets=await(await fetch('http://127.0.0.1:9342/json/list')).json();}catch{}}
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,m=>m.error?j(Error(JSON.stringify(m.error))):r(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');
    let navigation=0;
    const load=async(query='',w=390,h=844)=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      const url='file:///'+file.replace(/\\/g,'/')+'?'+query+'&qaLoad='+(++navigation);
      await send('Page.navigate',{url});await send('Page.bringToFront');
      for(let i=0;i<100;i++){await sleep(30);if(await js('location.href==='+JSON.stringify(url)+'&&!!window.__snapFn?.().S'))break;}
      await js('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))))');await sleep(90);
    };
    const click=async selector=>{
      const pt=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',clickCount:1});
      await sleep(6);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pt,button:'left',clickCount:1});
    };
    const pour=async(a,b)=>{await click('#rack [data-i="'+a+'"]');await sleep(10);await click('#rack [data-i="'+b+'"]');};
    const state=()=>js('JSON.parse(JSON.stringify(window.__snapFn().S))');
    const fx=()=>js(`(()=>{const q=s=>document.querySelectorAll(s).length;return {nodes:q('#fxLayer *')+q('#stage .fx, #stage .fx *'),drops:q('.fx-drop'),flows:q('.fx-flow'),surfaces:q('.fx-surface'),waiting:q('#rack .await'),combo:document.querySelector('.cb')?.textContent||'',score:document.getElementById('score').textContent,reduce:document.documentElement.classList.contains('fx-reduce'),errors:window.__errors};})()`);
    const geom=()=>js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom};};return{w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,tubes:[...document.querySelectorAll('#rack>.tube')].map(box),glass:box(document.querySelector('#rack .glass')),cup:box(document.getElementById('cup')),score:box(document.querySelector('.scorebar')),stage:box(document.getElementById('stage')),actions:box(document.querySelector('.actions')),errors:window.__errors};})()`);
    const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,phase+'-'+name+'.png'),Buffer.from(r.data,'base64'));};
    for(const [w,h]of [[360,640],[360,740],[390,844],[412,915],[768,1024]]){
      let first,upper;
      for(const n of [6,7,8]){
        await load('n='+n,w,h);const g=await geom();geometry.push({n,...g});
        if(n===8)await shot('board-'+w+'x'+h);
        if(before)continue;
        ck(`${w}x${h}/${n} fits`,g.scrollW<=w&&g.scrollH<=h+1&&g.actions.b<=h+.1,g);
        ck(`${w}x${h}/${n} targets`,g.tubes.every(t=>t.w>=44&&t.h>=44));
        first||=g;ck(`${w}x${h}/${n} six anchors and tray`,g.tubes.slice(0,6).every((t,i)=>Math.abs(t.y-first.tubes[i].y)<.1&&Math.abs(t.x-first.tubes[i].x)<.1)&&Math.abs(g.cup.y-first.cup.y)<.1);
        if(n===7)upper=g.tubes[6];if(n===8)ck(`${w}x${h} upper anchor`,Math.abs(upper.x-g.tubes[6].x)<.1&&Math.abs(upper.y-g.tubes[6].y)<.1);
        if(w===390)ck('original glass height at 390x844/'+n,Math.abs(g.glass.h-136)<1,g.glass);
      }
    }
    // A time sequence of a real completing pour: flight, anticipation, burst, then cleared screen.
    await load('n=8&combo=3');const g0=await geom();await pour(3,2);
    const started=Date.now();
    for(const at of [20,230,390,550,850,1500]){
      await sleep(Math.max(0,at-(Date.now()-started)));const f=await fx();frames.push({at,observedAt:Date.now()-started,...f});await shot('clear-'+at);
    }
    if(!before){
      ck('colored flow appears before landing',frames[0].flows>0,frames[0]);
      ck('completion produces two waves and particles',frames.some(f=>f.drops>0)&&frames.some(f=>f.surfaces>0),frames);
      ck('completion finishes and shows actual score',frames.at(-1).nodes===0&&frames.at(-1).waiting===0&&frames.at(-1).score===new Intl.NumberFormat('ko-KR').format((await state()).score),frames.at(-1));
      const g1=await geom();ck('reward never transforms the live rack buttons',g1.tubes.every((t,i)=>Math.abs(t.x-g0.tubes[i].x)<.1&&Math.abs(t.y-g0.tubes[i].y)<.1));
      const overlap=(a,b)=>a.x<b.r&&a.r>b.x&&a.y<b.b&&a.b>b.y;
      ck('expanded combo stage clears every bottle and score',g0.tubes.every(t=>!overlap(g0.stage,t))&&!overlap(g0.stage,g0.score),g0.stage);
    }
    // Same native input sequence must reach exactly the same engine state under each FX preference.
    if(!before){
      for(const gap of [20,50,80]){
        const states=[];
        for(const opts of ['fx=base','fx=juicy','fx=juicy&reduce=1']){
          await load('n=8&'+opts);await pour(3,2);await sleep(gap);await pour(0,5);
          states.push(await state());const f=await fx();
          ck(`quick ${gap}ms/${opts} two pours accepted`,states.at(-1).bottles[2].length===0&&states.at(-1).bottles[5].join()==='1,1'&&states.at(-1).pours===2);
          if(opts==='fx=juicy')ck('quick render preserves prior effects/'+gap,f.nodes>0);
          await sleep(1600);const end=await fx();ck('quick effects settle/'+gap+'/'+opts,end.nodes===0&&end.waiting===0,end);
        }
        const differences=states.map(s=>Object.keys(s).filter(k=>JSON.stringify(s[k])!==JSON.stringify(states[0][k])).map(k=>({key:k,reference:states[0][k],actual:s[k]})));
        ck('identical final engine state/'+gap,differences.every(d=>d.length===0),differences);
      }
      await load('n=6&reduce=0');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(50);
      await pour(3,2);const os=await fx();ck('OS reduction overrides saved full-effects preference',os.reduce&&os.flows===0&&os.drops===0&&os.waiting===0&&os.score===new Intl.NumberFormat('ko-KR').format((await state()).score),os);
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await js('new Promise(requestAnimationFrame)');await sleep(50);
      const restored=await fx();ck('OS reduction change restores full effects without resetting state',!restored.reduce&&(await state()).bottles[2].length===0,{...restored,bottle:(await state()).bottles[2],media:await js("matchMedia('(prefers-reduced-motion: reduce)').matches")});
      for(const action of ['undo','settings','locale','resize','visibility','new']){
        await load('n=8');await pour(3,2);
        if(action==='undo')await click('#btnUndo');
        if(action==='settings')await click('#btnSettings');
        if(action==='locale')await js("window.WSSLocale.set('hi')");
        if(action==='resize')await send('Emulation.setDeviceMetricsOverride',{width:360,height:740,deviceScaleFactor:1,mobile:true});
        if(action==='visibility'){
          const other=await send('Target.createTarget',{url:'about:blank'});await sleep(100);
          ck('background Chrome tab is actually hidden',await js('document.hidden'));
          await send('Page.bringToFront');await send('Target.closeTarget',{targetId:other.targetId});
        }
        if(action==='new')await js('window.__fixture(6,0)');
        await sleep(1500);const f=await fx();ck('discarded FX do not return after '+action,f.nodes===0&&f.waiting===0,f);
      }
      // Several simultaneous completions and overlapping flights exercise the global decoration budget.
      await load('n=8');await js(`(()=>{const s=window.__snapFn().S;s.bottles=[[0],[0,0,0],[1,1,1,1],[2,2,2,2],[3,3,3,3],[4,4,4,4],[5,5,5,5],[6,6,6,6]];s.streak=8;window.__boot({S:s});window.__maxFx=0;window.__fxSample=setInterval(()=>{window.__maxFx=Math.max(window.__maxFx,document.querySelectorAll('#fxLayer *').length+document.querySelectorAll('#stage .fx, #stage .fx *').length);},10);return true;})()`);
      await pour(0,1);await sleep(520);await shot('multi-clear');await sleep(2000);
      const max=await js('clearInterval(window.__fxSample);window.__maxFx');ck('global FX DOM budget under multi-clear',max<=180,{max,limit:180});ck('multi-clear nodes drain',(await fx()).nodes===0);
      await load('n=8');
      for(let i=0;i<20;i++){await js('window.__fixture(8,3)');await pour(3,2);await sleep(25);await js('window.__fixture(8,0)');}
      await sleep(1700);const repeat=await fx();ck('20 interrupted runs leave no nodes or delayed score',repeat.nodes===0&&repeat.waiting===0&&repeat.score==='3,200',repeat);
      await load('n=6&combo=0');await js('window.__fixture(6,0,899)');await pour(3,2);await sleep(350);await shot('growth');ck('new seventh bottle works immediately',(await state()).bottles.length===7);
      await click('#cup');await click('#rack [data-i="6"]');ck('new bottle accepts piece during its glow',(await state()).bottles[6].length===2);
      await load('n=6&combo=24');await js('window.__fixture(6,24,899)');await pour(3,2);await sleep(150);
      const earned=await js("({n:window.__snapFn().S.bottles.length,text:document.getElementById('banner').textContent})");
      ck('two earned bottles share one accurate growth notice',earned.n===8&&earned.text.startsWith('빈병 +2'),earned);
      for(const locale of ['en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id']){
        await load('n=8&combo=6&locale='+locale,360,640);await pour(3,2);await sleep(400);
        const g=await geom();ck('short localized FX fits/'+locale,g.scrollW<=360&&g.scrollH<=641&&g.actions.b<=640.1&&g.errors.length===0,g);
        if(locale==='hi')await shot('hi-combo');
        ck('localized combo words remain readable/'+locale,await js("[...document.querySelectorAll('.cb-word .f')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)"));
        await js('window.__fixture(6,0,899)');await sleep(60);await pour(3,2);await sleep(250);
        const notice=await js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,r:r.right,b:r.bottom};},b=document.getElementById('banner'),r=box(b),hit=e=>{const a=box(e);return r.x<a.r&&r.r>a.x&&r.y<a.b&&r.b>a.y;};return{clipped:b.scrollHeight>b.clientHeight+1,overlap:[...document.querySelectorAll('#rack>.tube'),document.getElementById('status'),document.querySelector('.scorebar')].some(hit),text:b.textContent,visible:!b.hidden};})()`);
        ck('localized growth notice clears gameplay/'+locale,notice.visible&&!notice.clipped&&!notice.overlap,notice);
      }
      await load('n=8&combo=6');await pour(3,2);await sleep(420);await shot('high-combo');
      await load('n=8&combo=3&tray=top');await pour(3,2);await sleep(420);await shot('top-combo');
      ck('no runtime errors in final motion scene',(await fx()).errors.length===0,(await fx()).errors);
    }
  }finally{
    if(ws)ws.close();chrome.kill();
    fs.writeFileSync(path.join(OUT,phase+'.json'),JSON.stringify({checks,geometry,frames,physicalDevice:false},null,2)+'\n');
  }
  const bad=checks.filter(c=>!c.pass);console.log('FX polish '+(checks.length-bad.length)+'/'+checks.length+', '+bad.length+' failed');process.exitCode=bad.length?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
