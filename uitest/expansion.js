// Built Pages wrapper + isolated headless Chrome. Native CDP touch/mouse input, DOM replay, screenshots.
// node uitest/expansion.js
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { E, run } = require('../research/expansion/bots');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'outputs', 'expansion');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const debug = process.argv.includes('--debug');
  execFileSync(process.execPath, [path.join(BASE, 'build-pages.js')], { stdio: 'ignore' }); fs.mkdirSync(OUT, { recursive: true });
  const init = `<script>
    const p = new URLSearchParams(location.search);
    if (p.get('reset') !== '0') {
      localStorage.clear(); localStorage.setItem('wsurv.seenHelp','true'); localStorage.setItem('wsurv.locale','"ko"');
      localStorage.setItem('wsurv.prefs', JSON.stringify({seenV2:true,staged:false,sound:false,vibrate:false,controls:p.get('controls')||'classic',tray:p.get('tray')||'bottom',reduceFx:p.get('reduce')==='1'}));
    }
    window.__errors=[]; window.addEventListener('error',e=>window.__errors.push(e.message));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});}}};
  </script>`;
  const html = fs.readFileSync(path.join(BASE, 'dist', 'index.html'), 'utf8').replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/, 'const FIREBASE_CONFIG = null;').replace('<body>', '<body>' + init);
  const file = path.join(OUT, 'test.html'); fs.writeFileSync(file, html);
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars', '--force-prefers-no-reduced-motion','--allow-file-access-from-files','--remote-debugging-port=9337',`--user-data-dir=${path.join(OUT, 'profile-' + Date.now())}`,'about:blank'], { stdio: 'ignore' });
  const rows = [], geometry = []; let ws;
  const ck = (name, pass, detail) => { rows.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); console.log(`${pass ? 'ok' : 'FAIL'} ${name}${!pass ? ' ' + JSON.stringify(detail) : ''}`); };
  try {
    let targets; for (let i=0;i<50&&!targets;i++) { await sleep(100); try { targets=await (await fetch('http://127.0.0.1:9337/json/list')).json(); } catch {} }
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
    let seq=0; const pending=new Map();
    ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((res,rej)=>{const id=++seq;pending.set(id,m=>m.error?rej(new Error(JSON.stringify(m.error))):res(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');
    const url='file:///'+file.replace(/\\/g,'/');
    const load=async(query='',w=390,h=844)=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      await send('Page.navigate',{url:url+'?'+query});
      for(let i=0;i<80;i++){await sleep(50);if(await js('!!window.__snapFn && !!window.__snapFn().S'))break;}
      await sleep(120);
    };
    const setup=async(n=8,piece='[2]',bottles=null)=>js(`(()=>{const s=newState('endless','ui-fixture',sanitizeRules(EXPANDING_RULES));s.score=${n===8?2800:n===7?900:0};updateGrowth(s,false);s.growth.activeColors=${n===8?8:n===7?6:4};s.piece=${piece};${bottles?`s.bottles=${JSON.stringify(bottles)};`:''}s.cum=[];s.rescueAds=0;window.__boot({S:s});return true;})()`);
    const state=()=>js('JSON.parse(JSON.stringify(window.__snapFn().S))');
    const coords=()=>js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,c:[r.x+r.width/2,r.y+r.height/2]};};return{cup:box(document.getElementById('cup')),tubes:[...document.querySelectorAll('#rack>.tube')].map(box),actions:box(document.querySelector('.actions')),status:box(document.getElementById('status')),stage:box(document.getElementById('stage')),scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,viewport:[innerWidth,innerHeight]};})()`);
    const shot=async(name)=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));};
    for(const [w,h] of (debug ? [] : [[360,740],[390,844],[412,915],[768,1024]])) {
      await load('',w,h); ck(`${w}x${h} new endless default`,(await state()).rules.expansion===1);
      let original;
      for(const n of [6,7,8]) {
        await setup(n); await sleep(100); const g=await coords();geometry.push({w,h,n,...g});
        ck(`${w}x${h}/${n} bottles fits viewport`,g.scrollW<=w&&g.actions.y+g.actions.h<=h&&g.tubes.every(t=>t.y>=0&&t.y+t.h<=h),g);
        ck(`${w}x${h}/${n} touch targets >=44px`,g.tubes.every(t=>t.w>=43.9));
        if(!original)original=g.tubes.slice(0,6);
        ck(`${w}x${h}/${n} bottom six remain anchored`,g.tubes.slice(0,6).every((t,i)=>Math.abs(t.x-original[i].x)<.1&&Math.abs(t.y-original[i].y)<.1));
        if(n===8)ck(`${w}x${h} upper bottle positions fixed`,Math.abs(g.tubes[6].x-geometry[geometry.length-2].tubes[6].x)<.1);
        if(w===390)await shot('board-'+n);
      }
    }
    for(const controls of ['classic','tapPlace'])for(const tray of ['bottom','top'])for(const input of ['touch','mouse']) {
      if (debug && (controls !== 'classic' || tray !== 'bottom' || input !== 'touch')) continue;
      const tag=`${controls}/${tray}/${input}`;await load(`controls=${controls}&tray=${tray}`);
      const touch=(type,points)=>send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=0])=>({x,y,id,radiusX:6,radiusY:6,force:1}))});
      const down=async([x,y])=>input==='touch'?touch('touchStart',[[x,y]]):send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
      const move=async([x,y])=>input==='touch'?touch('touchMove',[[x,y]]):send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'left',buttons:1});
      const up=async([x,y])=>{if(input==='touch')await touch('touchEnd',[]);else await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});await sleep(90);};
      const tap=async(p)=>{await down(p);await sleep(25);await up(p);};
      const drag=async(a,b)=>{await down(a);for(let i=1;i<=6;i++){await move([a[0]+(b[0]-a[0])*i/6,a[1]+(b[1]-a[1])*i/6]);await sleep(10);}await up(b);};
      const B=[[0,1],[1,1,2],[2],[],[0,0,1,2],[],[],[]];
      await setup(8,'[2]',B);let p=await coords(),s0=await state();
      if(controls==='classic')await tap(p.cup.c);await tap(p.tubes[6].c);let s=await state();
      ck(`${tag} tap places in upper bottle`,s.turn===s0.turn+1&&s.bottles[6][0]===2);
      await setup(8,'[2]',B);p=await coords();await drag(p.tubes[0].c,p.tubes[7].c);s=await state();
      ck(`${tag} pour crosses rows without placement`,s.turn===0&&s.bottles[0].join()==='0'&&s.bottles[7].join()==='1',s.bottles);
      await setup(8,'[2]',B);p=await coords();const gap=[p.tubes[0].c[0],(p.tubes[6].y+p.tubes[6].h+p.tubes[0].y)/2];await drag(p.tubes[0].c,gap);s=await state();
      ck(`${tag} row gap cancels pour`,JSON.stringify(s.bottles)===JSON.stringify(B));
      await setup(8,'[2]',B);p=await coords();await down(p.cup.c);await move(p.tubes[7].c);
      let target=p.tubes[7].c;
      if(tray==='bottom'){const center=await js(`(()=>{const r=document.querySelector('.ghost.above').getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2];})()`);target=[target[0]+target[0]-center[0],target[1]+target[1]-center[1]];await move(target);}
      const dropDebug=await js(`(()=>{const r=document.querySelector('.ghost:not(.pour)').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,e=document.elementFromPoint(x,y);return{ghost:[x,y,r.width,r.height],element:e?.outerHTML.slice(0,150),status:document.getElementById('status').textContent};})()`);
      await up(target);s=await state();ck(`${tag} cup drag targets upper row`,s.turn===1&&s.bottles[7].join()==='2',{turn:s.turn,bottles:s.bottles,dropDebug,target,tube:p.tubes[7]});
      if(input==='touch'){
        await setup(8,'[2]',B);p=await coords();await down(p.tubes[0].c);await move(p.tubes[7].c);await touch('touchCancel',[]);await sleep(70);
        ck(`${tag} cancel leaves board and ghost clean`,JSON.stringify((await state()).bottles)===JSON.stringify(B)&&await js('document.querySelectorAll(".ghost").length===0'));
        await down(p.tubes[0].c);await move(p.tubes[7].c);await send('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await sleep(100);await up(p.tubes[7].c);
        ck(`${tag} resize cancels active drag`,JSON.stringify((await state()).bottles)===JSON.stringify(B));
      }
    }
    if (debug) return;
    await load(''); await setup(8);
    let fastPos=await coords();
    const quickTap=async([x,y])=>{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
    for(let i=0;i<6;i++){await quickTap(fastPos.cup.c);await quickTap(fastPos.tubes[i].c);}
    ck('native fast taps accept six placements during effects',(await state()).turn===6);
    await setup(8,'[2]',[[0,1],[1,1,2],[2],[],[0,0,1,2],[],[],[]]);fastPos=await coords();
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fastPos.cup.c[0],y:fastPos.cup.c[1],id:0}]});
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fastPos.cup.c[0],y:fastPos.cup.c[1],id:0},{x:fastPos.tubes[7].c[0],y:fastPos.tubes[7].c[1],id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);
    ck('second finger does not place in the upper row',(await state()).turn===0&&(await state()).bottles[7].length===0);
    await load('controls=tapPlace');await setup(8,'[2]',[[0,1],[1,1,2],[2],[],[0,0,1,2],[],[],[]]);
    await js(`document.querySelector('#rack [data-i="0"]').focus()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:8});
    await js(`document.querySelector('#rack [data-i="7"]').focus()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    ck('native keyboard pours into the upper row',(await state()).bottles[7].join()==='1'&&(await state()).turn===0,{state:await state(),focused:await js('document.activeElement.outerHTML.slice(0,100)')});
    await load('');
    await js(`(()=>{const s=newState('endless','undo',sanitizeRules(EXPANDING_RULES));s.score=800;s.growth.activeColors=5;s.bottles[0]=[0,0,0];s.piece=[0];s.cum=[];window.__boot({S:s});document.getElementById('cup').click();document.querySelector('#rack [data-i="0"]').click();return true;})()`);
    ck('UI action unlocks 7th bottle',(await state()).bottles.length===7);
    await js('document.getElementById("btnUndo").click()');let s=await state();ck('UI undo restores board/color/queue/generation',s.bottles.length===6&&s.score===800&&s.growth.activeColors===5&&s.growth.generation===3);
    await js(`document.getElementById('cup').click();document.querySelector('#rack [data-i="0"]').click()`);s=await state();ck('redo earns one growth event',s.bottles.length===7&&s.growth.log.filter(x=>x.kind==='bottle').length===1);
    await js(`history.replaceState(null,'','?reset=0');true`);const saved=await state();await send('Page.reload');await sleep(500);s=await state();ck('reload resumes expansion state',JSON.stringify(s.growth)===JSON.stringify(saved.growth)&&s.score===saved.score&&s.bottles.length===7);
    await js(`(()=>{const r={...DEFAULT_RULES,bottles:7};localStorage.setItem('wsurv.rules',JSON.stringify(r));localStorage.setItem('wsurv.rules.custom','true');document.getElementById('btnNew').click();document.getElementById('btnNew').click();return true;})()`);s=await state();ck('custom fixed-board rules preserved',s.bottles.length===7&&!s.rules.expansion);
    await js(`document.getElementById('btnSettings').click();document.getElementById('btnDefaults').click();document.getElementById('btnApply').click();true`);s=await state();ck('defaults button restores score expansion',s.rules.expansion===1&&s.bottles.length===6);
    await js(`document.getElementById('btnSettings').click();document.getElementById('set-colorEvery').value='30';document.getElementById('btnApply').click();true`);s=await state();ck('settlement period setting keeps score progression',s.rules.expansion===1&&s.rules.colorEvery===30);
    await js(`(()=>{const s=newState('endless','legacy-save',DEFAULT_RULES);s.piece=[1];s.bottles[0]=[0];localStorage.setItem('wsurv.best.'+rulesSig(DEFAULT_RULES),'777');window.__boot({S:s});return true;})()`);ck('old save and old best key preserved',!(await state()).rules.expansion&&await js('document.getElementById("best").textContent==="777"'));
    await load('reduce=1');await setup(8);await js(`(()=>{const s=window.__snapFn().S;giveUp(s);window.__boot({S:s});return true;})()`);s=await state();ck('new standard still earns stars',s.starsEligible===true&&s.starsAdded>0);const stars=await js('localStorage.getItem("wsurv.stars.total")');await js('window.__boot({S:window.__snapFn().S})');ck('re-render does not duplicate permanent reward',await js('localStorage.getItem("wsurv.stars.total")')===stars);
    await load('');const seed='expansion-0', replay=run(E.sanitizeRules(E.EXPANDING_RULES),seed,80,2,true);
    await js(`(()=>{const s=newState('endless',${JSON.stringify(seed)},sanitizeRules(EXPANDING_RULES));s.cum=[];s.rescueAds=0;window.__boot({S:s});return true;})()`);
    for(const a of replay.actions){
      if(a.kind==='flip')await js('document.getElementById("btnFlip").click()');
      else if(a.kind==='place')await js(`document.getElementById('cup').click();document.querySelector('#rack [data-i="${a.args}"]').click()`);
      else await js(`document.querySelector('#rack [data-i="${a.args[0]}"]').click();document.querySelector('#rack [data-i="${a.args[1]}"]').click()`);
    }
    s=await state();ck('natural score progression through DOM input matches headless engine',s.score===replay.score&&JSON.stringify(s.bottles)===JSON.stringify(replay.state.bottles)&&JSON.stringify(s.growth)===JSON.stringify(replay.state.growth),{ui:s.score,engine:replay.score,turn:s.turn});
    ck('natural play reaches both expansions',s.bottles.length===8&&s.growth.log.filter(x=>x.kind==='bottle').length===2);
    await sleep(2000);await shot('natural-play');ck('no script errors',await js('window.__errors.length===0'),await js('window.__errors'));
  } finally { if(ws)ws.close();chrome.kill();fs.mkdirSync(path.join(BASE,'research','expansion','out'),{recursive:true});fs.writeFileSync(path.join(BASE,'research','expansion','out','browser.json'),JSON.stringify({rows,geometry,physicalDevice:false},null,2)); }
  const failed=rows.filter(r=>!r.pass).length;console.log(`expansion browser ${rows.length-failed}/${rows.length}, ${failed} failed`);process.exitCode=failed?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
