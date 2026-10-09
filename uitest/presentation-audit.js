// Local typography, motion and real/offline Web Audio audit. Test-only hooks never enter the build.
// node uitest/presentation-audit.js [--before] [--quick] [--effects-only] [--source=path]
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {spawn,execFileSync}=require('child_process');
const BASE=path.resolve(__dirname,'..'),OUT=path.join(BASE,'outputs/presentation-audit');
const DATA=path.join(BASE,'research/presentation-audit/out'),PORT=8152,CDP=9346;
const before=process.argv.includes('--before'),quick=process.argv.includes('--quick'),phase=process.argv.includes('--probe')?'probe':before?'before':'after';
const effectsOnly=process.argv.includes('--effects-only'),sourcePath=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(DATA,{recursive:true});
  execFileSync(process.execPath,[path.join(BASE,'build-pages.js')],{stdio:'ignore'});
  const source=fs.readFileSync(sourcePath||path.join(BASE,'water-sort-survival.html'),'utf8');
  if(before&&!sourcePath)fs.writeFileSync(path.join(OUT,'before-source.html'),source);
  const soundCode=source.slice(source.indexOf('  let AC = null;'),source.indexOf('  function buzz(p)'));
  const init=`<script>
    localStorage.clear();localStorage.setItem('wsurv.seenHelp','true');
    localStorage.setItem('wsurv.locale','"ko"');localStorage.setItem('wsurv.themes.owned','["lab","cafe","gem","deep"]');
    localStorage.setItem('wsurv.prefs',JSON.stringify({seenV2:true,seenCoach:true,staged:false,sound:true,vibrate:false,symbols:true,theme:'dark',fx:'juicy'}));
    window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
    const NativeAudio=window.AudioContext||window.webkitAudioContext;
    window.__audio={started:0,ended:0,stops:0,contexts:0,resumes:[]};
    window.__voices=[];
    if(NativeAudio)window.AudioContext=class extends NativeAudio{
      constructor(...args){super(...args);window.__audioCtx=this;__audio.contexts++;
        const resume=this.resume.bind(this);this.resume=()=>{const r={at:performance.now(),state:this.state,active:navigator.userActivation.isActive};__audio.resumes.push(r);return resume().then(()=>{r.finishedAt=performance.now();r.after=this.state;});};
        for(const method of ['createOscillator','createBufferSource']){
          const create=this[method].bind(this);this[method]=()=>{const n=create(),start=n.start.bind(n),stop=n.stop.bind(n),disconnect=n.disconnect.bind(n);__voices.push(n);
            n.start=(...args)=>{__audio.started++;return start(...args);};n.stop=(...args)=>{__audio.stops++;return stop(...args);};
            n.disconnect=(...args)=>{n.__auditDisconnected=true;return disconnect(...args);};
            n.addEventListener('ended',()=>{n.__auditEnded=true;__audio.ended++;});return n;};
        }
      }
    };
    window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>{window.__boot=fn;fn({});}}};
  </script>`;
  let page=fs.readFileSync(path.join(BASE,'dist/index.html'),'utf8');
  if(sourcePath){
    const title=(source.match(/<title>[^<]*<\/title>/)||[''])[0],description=(source.match(/<meta name="description"[^>]*>/)||[''])[0];
    page=page.slice(0,page.indexOf('<body>')+6)+'\n'+source.replace(title,'').replace(description,'')+'\n</body>\n</html>\n';
  }
  page=page.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/,'const FIREBASE_CONFIG = null;');
  page=page.replace('<body>','<body>'+init).replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,`window.__audit={prefs,SND,chime,clearFx,comboBurst,dangerFx,paintStage,fxLive,fxTimers,startCoach,coachPour,stopCoach,applyFxPrefs,playDeath};})();</script></body>`);
  page=page.replace(/env\(safe-area-inset-(top|bottom|left|right), 0px\)/g,(_,s)=>'var(--test-safe-'+s+', 0px)');
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);});
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const chrome=spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--force-prefers-no-reduced-motion','--remote-debugging-port='+CDP,'--user-data-dir='+path.join(OUT,'profile-'+Date.now()),'about:blank'],{stdio:'ignore'});
  const rows=[],fonts=[],samples=[],snapshots=[];let ws;
  const check=(name,pass,detail)=>{rows.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});if(!pass&&rows.filter(r=>!r.pass).length<=15)console.log('FAIL '+name+' '+JSON.stringify(detail??null).slice(0,1600));};
  try{
    let tabs;for(let i=0;i<80&&!tabs;i++){await pause(100);try{tabs=await(await fetch('http://127.0.0.1:'+CDP+'/json/list')).json();}catch{}}
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((r,j)=>{const n=++id;pending.set(n,m=>m.error?j(Error(method+': '+m.error.message)):r(m.result));ws.send(JSON.stringify({id:n,method,params}));});
    const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('DOM.enable');await send('CSS.enable');await send('Network.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const load=async(w=390,h=844)=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});
      await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
      await send('Page.bringToFront');
      for(let i=0;i<120;i++){await pause(30);if(await js('!!window.__audit&&!!window.__snapFn?.().S'))break;}
      await js('document.fonts.ready.then(()=>true)');
    };
    const tap=async(selector)=>{await js('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center"});true');
      const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(30);
    };
    const shot=async(name)=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,phase+'-'+name+'.png'),Buffer.from(r.data,'base64'));};
    const frame=()=>js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
    const waitAudio=async()=>{for(let i=0;i<50;i++){if(await js('window.__audioCtx?.state==="running"&&__audioCtx.currentTime>0'))return true;await pause(100);}return false;};
    const setup=async(n=8,large=false,warning=false,mode='endless')=>js(`(()=>{
      const s=newState(${JSON.stringify(mode)},'presentation-fixture',sanitizeRules(${mode==='endless'?'ENDLESS_RULES':'DEFAULT_RULES'}));
      if(s.growth){s.score=${n===8?4500:n===7?900:0};updateGrowth(s,false);s.growth.activeColors=${n===8?9:n===7?6:4};s.growth.pieceIntro=-1;}
      s.score=${large?'1234567890':'123456'};s.streak=8;s.maxStreak=8;s.turn=120;s.cum=[];s.rescueAds=0;
      s.piece=s.growth&&s.bottles.length===8?[0,1,1]:[0,1];
      if(s.rules.holdVersion){s.hold=s.bottles.length>=7?{piece:[2,3,3].slice(0,s.piece.length),intro:-1,flipped:false}:null;s.holdUsed=false;}
      if(${warning}){s.bottles=s.bottles.map((_,i)=>[8,8,i]);s.piece=[0,1,1];s.hold={piece:[1],intro:-1,flipped:false};checkStuck(s);}
      window.__boot({S:s});return true;})()`);
    const inspect=()=>js(`(()=>{
      const scope=[...document.querySelectorAll('.overlay:not([hidden]) .sheet')].at(-1)||document.querySelector('.app');
      const problems=[],all=[...scope.querySelectorAll('button,select,h1,h2,h3,.brand-subtitle,.chip,#score,#best,#turn,#combo,.tray-caption,.free,.field>label,.stats dt,.stats dd,.theme-card p,.note,.badge')];
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('[hidden]');};
      for(const e of all.filter(visible)){
        const r=e.getBoundingClientRect(),style=getComputedStyle(e),key=e.id||e.className||e.tagName,text=e.tagName==='SELECT'?e.selectedOptions[0]?.textContent:e.textContent.trim();
        if(!text)continue;
        // Bottle rims and the flip count deliberately extend beyond their controls; inspect their text separately.
        if(!e.matches('.tube,.flipbtn')&&e.scrollWidth>e.clientWidth+1.5&&style.textOverflow!=='ellipsis')problems.push({kind:'text-overflow',key,text:text.slice(0,100),sw:e.scrollWidth,cw:e.clientWidth});
        if(!scope.closest('.overlay')&&(r.left<-1||r.right>innerWidth+1))problems.push({kind:'outside-screen',key,text:text.slice(0,60),x:r.x,right:r.right});
        if(e.tagName==='BUTTON'&&!e.classList.contains('tube')&&r.height<43.8)problems.push({kind:'button-height',key,height:r.height});
      }
      if(!scope.closest('.overlay')){
        const range=e=>{const q=document.createRange();q.selectNodeContents(e);return q.getBoundingClientRect();},a=range(document.getElementById('score')),b=document.querySelector('.meta').getBoundingClientRect();
        if(a.right+3>b.left)problems.push({kind:'score-meta-overlap',right:a.right,left:b.left});
        const actions=document.querySelector('.actions').getBoundingClientRect();
        if(actions.bottom>innerHeight+1)problems.push({kind:'actions-cut',bottom:actions.bottom,height:innerHeight});
        if(document.documentElement.scrollWidth>innerWidth+1)problems.push({kind:'page-width',w:document.documentElement.scrollWidth});
      }else if(scope.scrollWidth>scope.clientWidth+1)problems.push({kind:'sheet-horizontal-scroll',sw:scope.scrollWidth,cw:scope.clientWidth});
      return{problems,lang:document.documentElement.lang,theme:document.documentElement.dataset.theme,skin:document.documentElement.dataset.skin,bottles:window.__snapFn().S.bottles.length,fonts:[...new Set([...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family))],
        resultScore:document.getElementById('oScore').textContent,scoreSize:getComputedStyle(document.getElementById('score')).fontSize,errors:window.__errors,scope:scope.closest('.overlay')?.id||'game'};
    })()`);
    await load();
    const locales=effectsOnly?[]:quick?['ko','hi','pt-BR']:['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id'];
    const viewports=quick?[[360,640,0,0],[390,844,0,0]]:[[360,640,0,0],[390,844,0,0],[412,915,0,0],[768,1024,0,0],[360,600,24,24],[390,724,47,34]];
    for(const locale of locales){
      await js("document.querySelectorAll('.overlay').forEach(e=>e.hidden=true);true");
      await js('WSSLocale.set('+JSON.stringify(locale)+');document.fonts.ready.then(()=>true)');
      for(const [w,h,top,bottom]of viewports){
        await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
        await js(`document.documentElement.style.setProperty('--test-safe-top','${top}px');document.documentElement.style.setProperty('--test-safe-bottom','${bottom}px');true`);
        for(const theme of ['dark','light'])for(const skin of ['lab','cafe','gem','deep'])for(const n of [6,7,8])for(const large of [false,true]){
          await js(`__audit.prefs.theme=${JSON.stringify(theme)};__audit.prefs.skin=${JSON.stringify(skin)};document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.skin=${JSON.stringify(skin)};window.dispatchEvent(new Event('resize'));true`);
          await setup(n,large);await frame();const r=await inspect(),tag=[locale,w+'x'+h,theme,skin,n,large?'large':'normal'].join('/');
          check('typography/'+tag,!r.problems.length&&!r.errors.length&&r.theme===theme&&r.skin===skin&&r.bottles===n,r.problems.length?r.problems:{theme:r.theme,skin:r.skin,bottles:r.bottles});
          if(locale==='hi'&&w===390&&n===8&&large&&theme==='dark'&&skin==='lab'){snapshots.push({tag,...r});await shot('hi-large');}
          if(locale==='ko'&&w===360&&n===8&&large&&theme==='dark'&&skin==='lab'){snapshots.push({tag,...r});await shot('ko-large');}
        }
      }
      await setup(8);await frame();await js('__audit.comboBurst(5,3);true');await pause(140);
      const call=await js("(()=>{const word=document.querySelector('#stage .cb-word');return{present:!!word,text:word?.textContent,sw:word?.scrollWidth,cw:word?.clientWidth};})()");
      check('combo-word/'+locale,call.present&&call.sw<=call.cw+1,call);
      const documentRoot=await send('DOM.getDocument',{depth:1});
      for(const selector of ['.brand h1','#score','#holdAction','#status','.cb-word .f']){
        const {nodeId}=await send('DOM.querySelector',{nodeId:documentRoot.root.nodeId,selector});
        const r=await send('CSS.getPlatformFontsForNode',{nodeId});fonts.push({locale,selector,...r});
      }
      await send('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
      await js("document.documentElement.style.setProperty('--test-safe-top','0px');document.documentElement.style.setProperty('--test-safe-bottom','0px');document.documentElement.dataset.theme='dark';true");
      await setup(8,true);
      for(const sheet of ['help','settings','themes','result','v2','controls']){
        await js("document.querySelectorAll('.overlay').forEach(e=>e.hidden=true);true");
        if(sheet==='help')await js("document.getElementById('btnHelp').click();true");
        else if(sheet==='settings'){await js("document.getElementById('btnSettings').click();document.getElementById('labBox').open=true;true");}
        else if(sheet==='themes')await js("document.getElementById('btnSettings').click();document.getElementById('btnThemes').click();true");
        else if(sheet==='result')await js("(()=>{const s=window.__snapFn().S;s.score=123456789012;giveUp(s);window.__boot({S:s});return true;})()");
        else await js(`document.getElementById(${JSON.stringify(sheet==='v2'?'ovV2':'ovCtl')}).hidden=false;true`);
        await frame();const r=await inspect();check('sheet/'+locale+'/'+sheet,!r.problems.length&&!r.errors.length,r.problems);
        if(sheet==='result'){
          await pause(700);await frame();const settled=await inspect();
          check('sheet/'+locale+'/result-settled',!settled.problems.length&&!settled.errors.length&&await js("document.getElementById('oScore').textContent===new Intl.NumberFormat(window.WSSLocale.current()).format(window.__snapFn().S.score)"),settled.problems);
        }
        if(locale==='hi'&&['settings','result'].includes(sheet))await shot('hi-'+sheet);
      }
      console.log('Typography locale '+locale+' complete');
    }
    // Verify actual fallback font paths rather than assuming font availability.
    await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
    for(const locale of locales){
      await load(360,640);await js('WSSLocale.set('+JSON.stringify(locale)+');document.fonts.ready.then(()=>true)');
      await setup(8,false,true);await frame();const r=await inspect();check('font-outage/'+locale,!r.problems.length&&!r.errors.length,r.problems);
    }
    await send('Network.setBlockedURLs',{urls:[]});
    // The cup selection intentionally has no sound. Use a real flip for the first audible gesture.
    await load();await setup(6);await tap('#btnFlip');const firstRunning=await waitAudio();
    check('first audible trusted touch starts real audio',firstRunning&&await js('__audio.started>0&&window.__snapFn().S.flipped'),await js('({state:__audioCtx?.state,time:__audioCtx?.currentTime,started:__audio.started,flipped:window.__snapFn().S.flipped,ever:navigator.userActivation.hasBeenActive,resumes:__audio.resumes})'));
    const firstStarted=await js('__audio.started');await js('__audioCtx.suspend().then(()=>true)');await tap('#btnFlip');const resumed=await waitAudio();
    check('next audible touch resumes a suspended audio context',resumed&&await js('__audio.started>'+firstStarted),await js('({state:__audioCtx.state,time:__audioCtx.currentTime,started:__audio.started,resumes:__audio.resumes})'));
    await js('__audit.SND.heart();true');await pause(40);
    await js("document.getElementById('optSound').checked=false;document.getElementById('optSound').dispatchEvent(new Event('change',{bubbles:true}));true");await pause(100);
    const muted=await js('({...__audio,state:__audioCtx.state,live:__voices.filter(n=>!n.__auditEnded&&!n.__auditDisconnected).length})');samples.push({kind:'mute',...muted});check('mute stops scheduled sounds',muted.live===0,muted);
    const count=muted.started;await js('__audit.SND.swap();__audit.SND.fanfare();true');await pause(40);check('mute prevents new sounds',await js('__audio.started')===count);
    await load();await setup(6);await tap('#btnFlip');await js('__audit.SND.heart();__audit.clearFx();true');await pause(100);
    const cleaned=await js('({...__audio,live:__voices.filter(n=>!n.__auditEnded&&!n.__auditDisconnected).length})');samples.push({kind:'clear',...cleaned});check('clearFx stops scheduled sounds',cleaned.live===0,cleaned);
    await js('__audit.SND.heart();Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));true');await pause(100);
    const hidden=await js('({...__audio,live:__voices.filter(n=>!n.__auditEnded&&!n.__auditDisconnected).length})');samples.push({kind:'hidden',...hidden});check('hidden tab stops scheduled sounds',hidden.live===0,hidden);
    await load();await setup(6);await tap('#btnFlip');await js('__audioCtx.close().then(()=>true)');await tap('#btnFlip');await pause(100);
    check('closed audio context recovers on the next gesture',await js('__audio.contexts>1&&__audioCtx.state==="running"'),await js('({...__audio,state:__audioCtx.state})'));
    await load();await setup(6);await js('window.AudioContext=undefined;window.webkitAudioContext=undefined;true');await tap('#btnFlip');
    check('unsupported audio is silent and does not block input',await js('window.__snapFn().S.flipped&&__errors.length===0'),await js('__errors'));
    // Offline render of every existing sound, both effect modes. No speakers/account/network needed.
    const offline=await js(`(async()=>{
      const source=${JSON.stringify(soundCode)},cases=[
        ['chord',[5]],['glass',[]],['swap',[]],['warn',[]],['rise',[]],['doMiSol',[]],['clink',[]],['ching',[]],['crack',[]],['thud',[]],
        ['fanfare',[]],['tick',[]],['nope',[]],['drip',[2,12]],['thunk',[12]],['impact',[5]],['cork',[]],['bonk',[]],['heart',[]],['relief',[]],['chime',[20]],['burst',[]]];
      const result=[];
      for(const fx of ['base','juicy'])for(const [name,args]of cases){
        const a=new OfflineAudioContext(1,48000*8,48000);Object.defineProperty(a,'state',{get:()=>'running'});
        const math=Object.create(Math);let seed=0x1234abcd;math.random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
        const api=new Function('prefs','fxMode','window','document','Math',source+';return {SND,chime};')({sound:true},()=>fx,{AudioContext:function(){return a;}},{addEventListener(){}},math);
        if(name==='chime')api.chime(...args);
        else if(name==='burst')for(let i=0;i<12;i++){api.SND.thunk(0);api.SND.impact(5);api.chime(8);}
        else api.SND[name](...args);
        const buffer=await a.startRendering(),values=buffer.getChannelData(0);let peak=0,energy=0,tail=0,bad=0;
        for(let i=0;i<values.length;i++){const v=values[i];if(!Number.isFinite(v))bad++;peak=Math.max(peak,Math.abs(v));energy+=v*v;if(i>values.length-4800)tail=Math.max(tail,Math.abs(v));}
        result.push({fx,name,peak,rms:Math.sqrt(energy/values.length),tail,bad});
      }
      return result;
    })()`);
    for(const r of offline){samples.push(r);check('audio-render/'+r.fx+'/'+r.name,r.peak>0&&r.peak<=1&&r.tail<.0001&&r.bad===0,r);}
    for(const reduce of ['off','preference','os']){
      await load();
      if(reduce==='os')await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await pause(60);await frame();
      await js(`(()=>{__audit.prefs.staged=true;__audit.prefs.seenCoach=false;__audit.prefs.reduceFx=${reduce==='preference'};__audit.applyFxPrefs();
        const s=newState('endless','coach-audit',sanitizeRules(ENDLESS_RULES));s.cum=[];s.rescueAds=0;window.__boot({S:s});__audit.startCoach();return true;})()`);
      await pause(40);
      const motion=await js("({reduced:document.documentElement.classList.contains('fx-reduce'),nodes:document.querySelectorAll('.coach-piece,.coach-dot').length,running:[...document.querySelectorAll('.coach-piece,.coach-dot')].flatMap(e=>e.getAnimations()).filter(a=>a.playState==='running').length})");
      check('tutorial motion/'+reduce,motion.nodes===2&&(reduce==='off'?!motion.reduced&&motion.running===2:motion.reduced&&motion.running===0),motion);
      await js("__audit.stopCoach();const s=window.__snapFn().S;s.bottles=[[0,1],[1],[],[],[],[]];window.__boot({S:s});__audit.coachPour();true");
      await pause(50);
      const pourMotion=await js("({nodes:document.querySelectorAll('.coach-dot').length,running:[...document.querySelectorAll('.coach-dot')].flatMap(e=>e.getAnimations()).filter(a=>a.playState==='running').length})");
      check('tutorial pour motion/'+reduce,pourMotion.nodes>0&&(reduce==='off'?pourMotion.running>0:pourMotion.running===0),pourMotion);
    }
    await load();await setup(8);await js('__audit.comboBurst(5,3);true');await pause(80);
    check('combo burst starts normally',await js("!!document.querySelector('#stage .cb')&&document.querySelector('#stage .cb').getAnimations().some(a=>a.playState==='running')"));
    await js("document.getElementById('optReduce').checked=true;document.getElementById('optReduce').dispatchEvent(new Event('change',{bubbles:true}));true");await pause(80);
    check('enabling reduced effects settles existing motion',await js("document.documentElement.classList.contains('fx-reduce')&&__audit.fxLive.size===0&&__audit.fxTimers.size===0&&!document.getAnimations().some(a=>a.playState==='running'&&!(a instanceof CSSAnimation)&&!(a instanceof CSSTransition))"));
    for(const interruption of ['os-reduce','new-run','hidden']){
      await load();await setup(6);
      await js("(()=>{const s=window.__snapFn().S;s.over=true;s.overReason='noroom';window.__auditDeathDone=0;__audit.playDeath(()=>window.__auditDeathDone++);return true;})()");await pause(30);
      check('death effect starts/'+interruption,await js("!!document.querySelector('.deathghost')&&__auditDeathDone===0"));
      if(interruption==='os-reduce'){await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await pause(80);}
      else if(interruption==='new-run'){await setup(6);await pause(80);}
      else{await js('Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));true');await pause(80);}
      const ended=await js("({ghosts:document.querySelectorAll('.deathghost').length,done:__auditDeathDone,over:window.__snapFn().S.over})");
      check('death effect cleans up/'+interruption,ended.ghosts===0&&ended.done===(interruption==='new-run'?0:1),ended);
      if(interruption==='new-run'){await pause(1150);check('previous death cannot affect a new run',await js("__auditDeathDone===0&&!document.getElementById('rack').classList.contains('dead')&&document.getElementById('ovOver').hidden"));}
    }
    check('no runtime errors after audio audit',await js('__errors.length===0'),await js('__errors'));
  }finally{
    if(ws)ws.close();chrome.kill();await new Promise(r=>server.close(r));
    fs.writeFileSync(path.join(DATA,phase+'.json'),JSON.stringify({rows,fonts,samples,snapshots,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),
      engineSha256:crypto.createHash('sha256').update(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]).digest('hex'),physicalDevice:false,phase,quick,effectsOnly,sourcePath:sourcePath||'water-sort-survival.html'},null,2)+'\n');
  }
  const bad=rows.filter(r=>!r.pass);console.log('Presentation '+phase+' '+(rows.length-bad.length)+'/'+rows.length+', '+bad.length+' failed');process.exitCode=bad.length&&!before?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
