// UI snapshots and layout/accessibility regressions on the real Pages document in an isolated profile.
// node uitest/uiux.js --before; node uitest/uiux.js
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'outputs/uiux');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const before = process.argv.includes('--before'), phase = before ? 'before' : 'after';
  fs.mkdirSync(OUT, { recursive: true });
  if (!before) execFileSync(process.execPath, [path.join(BASE, 'build-pages.js')], { stdio: 'ignore' });
  const source = fs.readFileSync(path.join(before ? path.join(OUT, 'before-site') : path.join(BASE, 'dist'), 'index.html'), 'utf8');
  const init = `<script>
    const reviewParams = new URLSearchParams(location.search);
    document.documentElement.dataset.theme=reviewParams.get('theme')||'dark';
    localStorage.clear(); localStorage.setItem('wsurv.seenHelp','true'); localStorage.setItem('wsurv.locale','"ko"');
    localStorage.setItem('wsurv.prefs', JSON.stringify({seenV2:true,staged:false,sound:false,vibrate:false,controls:'classic',tray:reviewParams.get('tray')||'bottom',fx:reviewParams.get('fx')||'juicy',reduceFx:reviewParams.get('reduce')==='1',symbols:reviewParams.get('symbols')==='1',theme:reviewParams.get('theme')||'dark',skin:reviewParams.get('skin')||'lab'}));
    window.__errors=[]; addEventListener('error',e=>window.__errors.push(e.message));
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{
      window.__boot=fn; fn({});
      const n=Number(reviewParams.get('fixture')||6);
      const s=newState('endless','uiux-fixture',sanitizeRules(EXPANDING_RULES));
      s.score=n===8?3200:n===7?1100:0; updateGrowth(s,false);
      s.growth.activeColors=n===8?8:n===7?6:4;
      s.turn=7; s.bottles=[[0,1],[2,0,2],[3,1,0,3],[],[],[]].concat(n>=7?[[4,5]]:[],n===8?[[6]]:[]);
      s.piece=[3,1]; s.cum=[]; s.rescueAds=0; fn({S:s});
      if(reviewParams.get('sheet')==='settings')document.getElementById('btnSettings').click();
      if(reviewParams.get('sheet')==='help')document.getElementById('btnHelp').click();
      if(reviewParams.get('sheet')==='result'){giveUp(s);fn({S:s});}
    }}};
  </script>`;
  const html = source.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/, 'const FIREBASE_CONFIG = null;').replace('<body>', '<body>'+init);
  const file = path.join(OUT, phase+'-test.html'); fs.writeFileSync(file, html);
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--allow-file-access-from-files','--remote-debugging-port=9338',`--user-data-dir=${path.join(OUT,'profile-'+Date.now())}`,'about:blank'], {stdio:'ignore'});
  const rows=[], geometry=[]; let ws;
  const ck=(name,pass,detail)=>{rows.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail));};
  try {
    let targets; for(let i=0;i<50&&!targets;i++){await sleep(100);try{targets=await(await fetch('http://127.0.0.1:9338/json/list')).json();}catch{}}
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
    let seq=0;const pending=new Map(),fontRequests=new Set(),fontFailures=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent'&&/fonts\.(googleapis|gstatic)\.com/.test(m.params.request.url))fontRequests.add(m.params.requestId);if(m.method==='Network.loadingFailed'&&fontRequests.has(m.params.requestId))fontFailures.push(m.params);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,m=>m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const load=async(query='',w=390,h=844)=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      await send('Page.navigate',{url:'file:///'+file.replace(/\\/g,'/')+'?'+query});
      for(let i=0;i<80;i++){await sleep(50);if(await js('!!window.__snapFn && !!window.__snapFn().S'))break;}
      await js('document.fonts.ready.then(()=>true)');await sleep(180);
    };
    const shot=async name=>{await sleep(100);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,phase+'-'+name+'.png'),Buffer.from(r.data,'base64'));};
    const geom=()=>js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};return {w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,tubes:[...document.querySelectorAll('#rack>.tube')].map(box),cup:box(document.getElementById('cup')),actions:box(document.querySelector('.actions')),header:[...document.querySelectorAll('.top .sbtn')].map(box),buttons:[...document.querySelectorAll('.app button')].filter(e=>e.getBoundingClientRect().height>0).map(box),info:box(document.querySelector('.info')),score:box(document.querySelector('.scorebar')),font:getComputedStyle(document.getElementById('score')).fontFamily,loadedFonts:[...new Set([...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family))],errors:window.__errors};})()`);
    for(const [w,h] of before?[[390,844]]:[[360,740],[390,844],[412,915],[768,1024],[360,640]]) {
      let first,upper;
      for(const n of [6,7,8]) {
        await load('fixture='+n,w,h);const g=await geom();geometry.push({n,...g});
        if(w===390)await shot('board-'+n);
        if(before)continue;
        ck(`${w}x${h}/${n} all gameplay fits`,g.scrollW<=w&&g.scrollH<=h+1&&g.actions.b<=h&&g.tubes.every(t=>t.y>=0&&t.b<=h),g);
        ck(`${w}x${h}/${n} touch targets`,g.tubes.every(t=>t.w>=43.9)&&g.buttons.every(t=>t.w>=43.9&&t.h>=43.9),g.buttons);
        if(!first)first=g.tubes.slice(0,6);
        ck(`${w}x${h}/${n} fixed bottom six`,g.tubes.slice(0,6).every((t,i)=>Math.abs(t.x-first[i].x)<.1&&Math.abs(t.y-first[i].y)<.1));
        if(n===7)upper=g.tubes[6];
        if(n===8)ck(`${w}x${h} seventh bottle stays fixed`,Math.abs(g.tubes[6].x-upper.x)<.1&&Math.abs(g.tubes[6].y-upper.y)<.1);
        ck(`${w}x${h}/${n} no runtime errors`,g.errors.length===0,g.errors);
        if(n===8) {
          const tray=await js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width};},panel=box(document.querySelector('.incoming')),c=box(document.getElementById('cup')),previews=[...document.querySelectorAll('#queue .tube')].map(box),labels=[...document.querySelectorAll('.tray-caption')].map(box);return {panel,c,previews,labels,inside:[document.getElementById('cup'),document.getElementById('btnFlip'),...document.querySelectorAll('#queue .tube')].every(e=>{const r=box(e);return r.x>=panel.x&&r.r<=panel.r&&r.y>=panel.y&&r.b<=panel.b;}),accessible:[...document.querySelectorAll('#queue .tube')].every(e=>e.getAttribute('role')==='img'&&e.getAttribute('aria-label').includes('아래부터'))};})()`);
          ck(`${w}x${h} current/next tray hierarchy and alignment`,tray.inside&&tray.accessible&&tray.c.w>=52&&tray.previews.length===2&&Math.abs(tray.previews[0].b-tray.previews[1].b)<.1&&Math.abs(tray.labels[0].y-tray.labels[1].y)<.1,tray);
        }
      }
    }
    for(const sheet of ['settings','help','result']){await load('fixture=8&sheet='+sheet);if(sheet==='result')await sleep(850);await shot(sheet);}
    if(before)return;
    // Existing custom preview counts and the spare cup/offer must also fit the regrouped tray.
    for(const count of [0,1,2,3])for(const spare of ['none','held','offer']) {
      await load('',360,740);
      await js(`(()=>{const s=newState('endless','tray-fixture',sanitizeRules({...DEFAULT_RULES,preview:${count},spare:true}));s.turn=7;s.spare=${spare==='held'?'[2]':'null'};s.spareOffer=${spare==='offer'};s.spareOfferSeen=true;window.__boot({S:s});return true;})()`);await sleep(80);
      const t=await js(`(()=>{const panel=document.querySelector('.incoming').getBoundingClientRect(),parts=[document.getElementById('cup'),document.getElementById('btnFlip'),...document.querySelectorAll('#queue .tube'),...document.querySelectorAll('#spareSlot button')].filter(e=>e.getBoundingClientRect().width),boxes=parts.map(e=>e.getBoundingClientRect());return {count:document.getElementById('queue').children.length,hidden:document.querySelector('.next-pieces').hidden,inside:boxes.every(r=>r.left>=panel.left&&r.right<=panel.right&&r.top>=panel.top&&r.bottom<=panel.bottom),overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)),scrollW:document.documentElement.scrollWidth};})()`);
      ck(`preview ${count}/${spare} fits and preserves visibility`,t.count===count&&t.hidden===(count===0)&&t.inside&&!t.overlap&&t.scrollW<=360,t);
    }
    // Dialog keyboard behavior, short-screen close visibility, and unchanged engine state.
    await load('',360,640);const saved=await js('JSON.stringify(window.__snapFn().S)');
    await js('document.getElementById("btnSettings").focus();document.getElementById("btnSettings").click()');await sleep(70);
    ck('settings focuses inside dialog',await js('!!document.activeElement.closest("#ovSettings")'));
    await js('document.querySelector("#ovSettings [data-close]").focus()');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    ck('Tab stays in settings',await js('!!document.activeElement.closest("#ovSettings")'));
    await js('document.getElementById("labBox").open=true;document.querySelector("#ovSettings .sheet").scrollTop=2000');
    ck('settings close remains visible on short screen',await js('(()=>{const r=document.querySelector("#ovSettings [data-close]").getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight;})()'));
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(60);
    ck('Escape closes and restores opener focus',await js('document.getElementById("ovSettings").hidden&&document.activeElement.id==="btnSettings"'));
    ck('opening and closing settings preserves run',await js('JSON.stringify(window.__snapFn().S)')===saved);
    await js('document.getElementById("btnSettings").click()');await sleep(40);
    await js('document.getElementById("btnThemes").focus();document.getElementById("btnThemes").click()');await sleep(40);
    await js('document.querySelector("#ovThemes .sheet").scrollTop=2000');
    ck('themes close stays visible on short screen',await js('(()=>{const r=document.querySelector("#ovThemes [data-close]").getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight;})()'));
    await js('document.querySelector("#ovThemes [data-close]").click()');await sleep(40);
    ck('nested theme dialog restores settings focus',await js('!document.getElementById("ovSettings").hidden&&document.activeElement.id==="btnThemes"'));
    await js('document.querySelector("#ovSettings [data-close]").click()');await sleep(40);
    // Mode confirmation protects a started run and cancels when play resumes.
    await js('document.getElementById("btnMode").click()');
    ck('first mode press protects progress',await js('JSON.stringify(window.__snapFn().S)')===saved);
    await js(`document.getElementById('cup').click();document.querySelector('#rack [data-i="4"]').click()`);
    ck('playing cancels mode confirmation',await js('!document.getElementById("btnMode").classList.contains("armed")'));
    await js('document.getElementById("btnMode").click();document.getElementById("btnMode").click()');
    ck('second mode press changes mode',await js('window.__snapFn().S.mode==="daily"'));
    // Rule descriptions follow the form context and active tray, without changing rule values.
    await load('');await js('document.getElementById("btnSettings").click()');
    ck('growth settings describe settlement, not turn colors',await js('document.getElementById("zonesDescription").textContent.includes("점수")&&!document.getElementById("zonesDescription").textContent.includes("20턴마다 새 색")'));
    await js('document.getElementById("btnClassic").click()');
    ck('legacy settings describe turn colors',await js('document.getElementById("zonesDescription").textContent.includes("턴")'));
    // All four bottle skins, both appearances and symbol mode retain readable geometry.
    for(const theme of ['light','dark'])for(const skin of ['lab','cafe','gem','deep']){
      await load(`fixture=8&theme=${theme}&skin=${skin}&symbols=1`);await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.skin=${JSON.stringify(skin)};true`);
      const g=await geom();ck(`${theme}/${skin} fits with symbols`,g.scrollW<=390&&g.scrollH<=845&&g.tubes.every(t=>t.w>=43.9));
      await shot('board-8-'+theme+'-'+skin);
      if(skin==='lab')await shot('board-8-'+theme);
    }
    // Actual text contrast against its actual computed surfaces (same formula as WCAG).
    for(const theme of ['light','dark']){
      await load('fixture=8');await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)};true`);
      const contrast=await js(`(()=>{const ctx=document.createElement('canvas').getContext('2d');ctx.canvas.width=ctx.canvas.height=1;const rgb=s=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);},lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};return ['#colorInfo','#zoneNote','.free','#score','.btn:not(:disabled)'].map(sel=>{const e=document.querySelector(sel),s=getComputedStyle(e);let p=e,bg;while(p){bg=getComputedStyle(p).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;p=p.parentElement;}return {sel,color:s.color,bg,ratio:ratio(s.color,bg||getComputedStyle(document.body).backgroundColor)};});})()`);
      ck(`${theme} primary text contrast >=4.5`,contrast.every(x=>x.ratio>=4.5),contrast);
    }
    await load('fixture=8',360,640);
    await js('(()=>{const s=window.__snapFn().S;s.score=123456;s.streak=123;s.maxStreak=123;s.bestAtStart=987654;window.__boot({S:s});return true;})()');await sleep(150);
    ck('large score and combo fit their containers',await js('(()=>{const score=document.getElementById("score"),a=score.getBoundingClientRect(),b=document.querySelector(".meta").getBoundingClientRect(),range=e=>{const q=document.createRange();q.selectNodeContents(e);return q.getBoundingClientRect();},text=range(score),combo=document.getElementById("combo");return !(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)&&text.width<=score.clientWidth*.9&&range(combo).width<=combo.getBoundingClientRect().width+.2&&document.documentElement.scrollWidth<=innerWidth;})()'));
    await shot('large-numbers');
    // The longest normal warning and an unlock banner must clear the eight-bottle board on a short screen.
    const fixed=await geom();
    await js('(()=>{const s=window.__snapFn().S;s.stuck="room";window.__boot({S:s});const b=document.getElementById("banner");b.textContent="새 빈병 도착!";b.hidden=false;return true;})()');await sleep(100);
    const warning=await js(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom};},hit=(a,b)=>a.x<b.r&&a.r>b.x&&a.y<b.b&&a.b>b.y;const b=box(document.getElementById('banner')),s=box(document.getElementById('status')),extra=box(document.getElementById('extraRow'));return {b,s,extra,text:document.getElementById('status').textContent,overlap:[...document.querySelectorAll('#rack>.tube'),document.getElementById('status'),document.getElementById('extraRow'),document.querySelector('.actions')].some(e=>hit(b,box(e))),scrollH:document.documentElement.scrollHeight};})()`);
    ck('long warning and unlock banner fit eight-bottle short screen',!warning.overlap&&warning.scrollH<=641&&warning.s.y>=0&&warning.s.b<=640,warning);
    const warned=await geom();ck('long warning and give-up row do not move bottles',warned.tubes.every((t,i)=>Math.abs(t.x-fixed.tubes[i].x)<.1&&Math.abs(t.y-fixed.tubes[i].y)<.1),{fixed,warned});
    await shot('short-warning');
    await load('fixture=8&reduce=1',360,640);const reduced=await geom();
    ck('reduced effects fit the eight-bottle short screen',reduced.scrollW<=360&&reduced.scrollH<=641&&reduced.actions.b<=640&&reduced.tubes.every(t=>t.w>=43.9));
    await shot('board-8-reduced');
    // A font outage is not allowed to wrap the header or shift the fixed-row contract.
    await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.clearBrowserCache');await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});await send('Page.navigate',{url:'about:blank'});await load('fixture=8',360,640);
    const outage=await js(`(()=>{const links=[...document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')];return {links:links.map(l=>({href:l.href,loaded:!!l.sheet})),faces:[...document.fonts].filter(f=>/IBM Plex|Jua/.test(f.family)).map(f=>({family:f.family,status:f.status}))};})()`);
    ck('font outage actually uses fallback fonts',fontFailures.some(f=>f.blockedReason==='inspector')&&outage.faces.every(f=>f.status!=='loaded'),{...outage,failures:fontFailures});
    const fallback=await geom();ck('font outage still fits short viewport',fallback.scrollW<=360&&fallback.scrollH<=641&&fallback.header.every(t=>t.h>=44),fallback);
    await send('Network.setBlockedURLs',{urls:[]});
  } finally {
    if(ws)ws.close();chrome.kill();fs.mkdirSync(path.join(BASE,'research/uiux/out'),{recursive:true});
    fs.writeFileSync(path.join(BASE,'research/uiux/out',phase+'.json'),JSON.stringify({rows,geometry,physicalDevice:false},null,2)+'\n');
  }
  const failures=rows.filter(r=>!r.pass).length;console.log(`UIUX ${rows.length-failures}/${rows.length}, ${failures} failed`);process.exitCode=failures?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
