// Real DOM regression checks in an isolated Chrome profile; no player storage is touched.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..'), OUT = path.join(BASE, 'outputs/i18n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync(process.execPath, [path.join(BASE, 'build-pages.js')], { stdio: 'ignore' });
  const source = fs.readFileSync(path.join(BASE, 'dist/index.html'), 'utf8');
  const init = function () {
    const p = new URLSearchParams(location.search);
    document.documentElement.dataset.theme = 'dark';
    if (p.get('reset') !== '0') {
      localStorage.clear();
      if (p.get('choice')) localStorage.setItem('wsurv.locale', JSON.stringify(p.get('choice')));
      localStorage.setItem('wsurv.seenHelp', 'true');
      localStorage.setItem('wsurv.prefs', JSON.stringify({seenV2:true,staged:false,sound:false,vibrate:false,reduceFx:true,controls:'classic',tray:'bottom'}));
    }
    if (p.get('browser')) Object.defineProperty(navigator, 'languages', {get: () => p.get('browser').split(',')});
    window.__errors = []; addEventListener('error', e => window.__errors.push(e.message));
    window.claude = { hot: {snapshot:fn => window.__snapFn=fn, ready:fn => {
      window.__boot = fn; fn({});
      if (p.get('reset') === '0') return;
      const n = Number(p.get('fixture') || 8);
      if(p.get('mode')==='daily'){const s=newState('daily','daily:2026-10-09',sanitizeRules(DEFAULT_RULES));s.score=123456;s.turn=7;fn({S:s});return;}
      const s = newState('endless','i18n-fixture',sanitizeRules(EXPANDING_RULES));
      s.score = n === 8 ? 3200 : 0; updateGrowth(s,false); s.turn = 7;
      s.bottles = [[0,1],[2,0,2],[3,1,0,3],[],[],[]].concat(n===8?[[4,5],[6]]:[]);
      s.piece = [3,1]; s.cum = []; fn({S:s});
    }}};
  };
  const html = source.replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/, 'const FIREBASE_CONFIG = null;')
    .replace('<body>', '<body><script>(' + init.toString() + ')();</script>');
  const file = path.join(OUT, 'test.html'); fs.writeFileSync(file, html);
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--allow-file-access-from-files','--remote-debugging-port=9339','--user-data-dir='+path.join(OUT,'profile-'+Date.now()),'about:blank'], {stdio:'ignore'});
  const rows = []; let ws;
  const ck = (name,pass,detail) => { rows.push({name,pass:!!pass,...(detail===undefined?{}:{detail})}); if(!pass)console.log('FAIL '+name+' '+JSON.stringify(detail)); };
  try {
    const engine = source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
    ck('engine unchanged', crypto.createHash('sha256').update(engine).digest('hex') === '1797179475c5812719a0f3555fb5fb654e3f31770a401b3db2025876dc22b832');
    for (const script of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Function(script[1]);
    let targets; for(let i=0;i<150&&!targets?.some(t=>t.type==='page');i++){await sleep(100);try{targets=await(await fetch('http://127.0.0.1:9339/json/list')).json();}catch{}}
    if(!targets?.some(t=>t.type==='page'))throw Error('Isolated test Chrome did not become ready; exit code '+chrome.exitCode);
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let seq=0;const pending=new Map();
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
    const js=async(fn,...args)=>{const r=await send('Runtime.evaluate',{expression:'('+fn.toString()+')('+args.map(a=>JSON.stringify(a)).join(',')+')',returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const load=async(query,w=360,h=640)=>{
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
      await send('Page.navigate',{url:'file:///'+file.replace(/\\/g,'/')+'?'+query});
      for(let i=0;i<100;i++){await sleep(50);if(await js(()=>!!window.__snapFn?.().S))break;}
      await js(()=>document.fonts.ready.then(()=>true));await sleep(90);
    };
    const visible=()=>js(()=>{
      const remnant=[]; const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const n=walker.currentNode,e=n.parentElement;
        if(!e.closest('script,style,#optLanguage,textarea') && e.getBoundingClientRect().width && /[가-힣]/.test(n.nodeValue))remnant.push(n.nodeValue.trim());
      }
      const attrs=[...document.querySelectorAll('[aria-label],[title]')].filter(e=>e.getBoundingClientRect().width)
        .flatMap(e=>['aria-label','title'].map(a=>e.getAttribute(a)).filter(v=>v&&/[가-힣]/.test(v)));
      return {remnant,attrs,errors:window.__errors,title:document.title,lang:document.documentElement.lang,
        scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,
        sheetW:[...document.querySelectorAll('.overlay:not([hidden]) .sheet')].map(e=>({w:e.clientWidth,scroll:e.scrollWidth})),
        headerH:document.querySelector('.top').getBoundingClientRect().height,
        headerOverlap:document.getElementById('modeChip').getBoundingClientRect().right>document.querySelector('.top-btns').getBoundingClientRect().left,
        buttons:[...document.querySelectorAll('.app button')].map(e=>e.getBoundingClientRect()).filter(r=>r.width).map(r=>({w:r.width,h:r.height})),
        actionsBottom:document.querySelector('.actions').getBoundingClientRect().bottom};
    });
    const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));};
    const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
    for(const lang of ['ko','en','ja','zh-Hans','zh-Hant','es','pt-BR','hi','id'].filter(l=>!only||l===only)){
      for(const n of [6,8]){
        await load('choice='+lang+'&fixture='+n);
        const g=await visible();
        ck(lang+'/'+n+' correct locale and no errors',g.lang===lang&&g.errors.length===0,g);
        if(lang!=='ko')ck(lang+'/'+n+' all visible text and accessibility localized',!g.remnant.length&&!g.attrs.length&&!/[가-힣]/.test(g.title),g);
        ck(lang+'/'+n+' fits 360x640',g.scrollW<=360&&g.scrollH<=641&&g.actionsBottom<=640&&g.headerH<=60&&!g.headerOverlap,g);
        ck(lang+'/'+n+' touch targets',g.buttons.every(r=>r.w>=43.9&&r.h>=43.9),g.buttons);
      }
      await shot(lang+'-board');
      await js(()=>{const s=window.__snapFn().S;s.score=20000;s.growth.activeColors=9;s.growth.pendingIntro=[];window.__boot({S:s});});
      let tail=await visible();
      ck(lang+' fully expanded HUD fits',tail.scrollW<=360&&tail.scrollH<=641&&tail.actionsBottom<=640,tail);
      await js(()=>{const s=newState('daily','daily:2026-10-09',sanitizeRules(DEFAULT_RULES));s.score=123456;s.turn=7;window.__boot({S:s});});
      const daily=await visible();
      ck(lang+' daily gameplay fits 360x640',daily.scrollW<=360&&daily.scrollH<=641&&daily.actionsBottom<=640&&daily.headerH<=60&&!daily.headerOverlap,daily);
      await shot(lang+'-daily');
      await load('choice='+lang+'&fixture=8',390,844);
      const large=await visible();
      ck(lang+' 390x844 fits',large.scrollW<=390&&large.scrollH<=845&&large.actionsBottom<=844,large);
      await load('choice='+lang+'&fixture=8');
      await js(()=>document.getElementById('btnSettings').click());
      await js(()=>{document.getElementById('labBox').open=true;});
      let g=await visible();
      if(lang!=='ko')ck(lang+' settings complete',!g.remnant.length&&!g.attrs.length,g);
      ck(lang+' settings fits',g.scrollW<=360&&g.sheetW.every(r=>r.scroll<=r.w),g);
      if(['hi','en'].includes(lang))await shot(lang+'-settings');
      await js(()=>document.querySelector('#ovSettings [data-close]').click());
      await js(()=>document.getElementById('btnHelp').click());g=await visible();
      if(lang!=='ko')ck(lang+' help complete',!g.remnant.length&&!g.attrs.length,g);
      ck(lang+' help fits',g.scrollW<=360&&g.sheetW.every(r=>r.scroll<=r.w),g);
      await js(()=>document.querySelector('#ovHelp [data-close]').click());
      await js(()=>{document.getElementById('btnSettings').click();document.getElementById('btnThemes').click();});g=await visible();
      if(lang!=='ko')ck(lang+' themes complete',!g.remnant.length&&!g.attrs.length,g);
      ck(lang+' themes fit',g.scrollW<=360&&g.sheetW.every(r=>r.scroll<=r.w),g);
      await js(()=>{document.querySelector('#ovThemes [data-close]').click();document.querySelector('#ovSettings [data-close]').click();});
      await js(()=>{const s=newState('daily','daily:2026-10-09',sanitizeRules(DEFAULT_RULES));s.score=123456;s.bestAtStart=100000;s.turn=42;s.bottles[0]=[0,0,0];s.bottles[1]=[1,1,1];s.piece=[2,2];s.over=true;s.overReason='noroom';window.__boot({S:s});});await sleep(200);
      g=await visible();
      if(lang!=='ko')ck(lang+' results and sharing localized',!g.remnant.length&&!g.attrs.length&&await js(()=>!/[가-힣]/.test(document.getElementById('shareText').value)),g);
      ck(lang+' results fit',g.scrollW<=360&&g.sheetW.every(r=>r.scroll<=r.w),g);
      if(['en','hi','ja'].includes(lang))await shot(lang+'-results');
    }
    // Language switches preserve game, undo history, local save contracts and unapplied rules.
    await load('choice=ko&fixture=6');
    await js(()=>{document.getElementById('cup').click();document.querySelectorAll('#rack>.tube')[3].click();});
    const placed=await js(()=>JSON.stringify(window.__snapFn().S));
    await js(()=>{document.getElementById('btnSettings').click();document.getElementById('set-cap').value='5';});
    const savedBefore=await js(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='wsurv.locale').map(k=>[k,localStorage.getItem(k)])));
    for(const lang of ['en','hi','ja','zh-Hant','es','pt-BR','id','zh-Hans','ko']){
      await js(code=>{const s=document.getElementById('optLanguage');s.value=code;s.dispatchEvent(new Event('change',{bubbles:true}));},lang);
      ck(lang+' switch preserves live run',await js(()=>JSON.stringify(window.__snapFn().S))===placed);
      ck(lang+' switch preserves pending rules and focusable selector',await js(()=>document.getElementById('set-cap').value==='5'&&document.getElementById('optLanguage').options.length===10));
    }
    ck('language never rewrites existing saves',JSON.stringify(savedBefore)===JSON.stringify(await js(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='wsurv.locale').map(k=>[k,localStorage.getItem(k)])))));
    await js(()=>{window.WSSLocale.set('id');document.querySelector('#ovSettings [data-close]').click();document.getElementById('btnUndo').click();});
    ck('undo still works after switches',await js(()=>{const s=window.__snapFn().S;return s.turn===7&&s.bottles[3].length===0;}));
    await load('reset=0');
    ck('manual choice survives reload',await js(()=>window.WSSLocale.current()==='id'));
    for(const [browser,expected] of [['es-MX','es'],['pt-PT','pt-BR'],['hi-IN','hi'],['id-ID','id'],['in-ID','id'],['zh-TW','zh-Hant'],['zh-HK','zh-Hant'],['zh-CN','zh-Hans'],['zh-Hans-TW','zh-Hans'],['zh-Hant-CN','zh-Hant'],['fr-FR,ja-JP','ja'],['fr-FR','en']]){
      await load('browser='+encodeURIComponent(browser));ck(browser+' auto detection',await js(()=>window.WSSLocale.current())===expected);
    }
    await load('choice=ko&lang=en');
    ck('share URL can override display without saving it',await js(()=>window.WSSLocale.current()==='en'&&JSON.parse(localStorage.getItem('wsurv.locale'))==='ko'));
    await js(()=>window.WSSLocale.set('auto'));
    ck('manual setting clears temporary URL override',await js(()=>!new URLSearchParams(location.search).has('lang')));
  } finally {
    if(ws)ws.close();chrome.kill();fs.mkdirSync(path.join(BASE,'research/i18n'),{recursive:true});
    fs.writeFileSync(path.join(BASE,'research/i18n/browser.json'),JSON.stringify({rows,physicalDevice:false},null,2)+'\n');
  }
  const failed=rows.filter(r=>!r.pass).length;console.log('I18N '+(rows.length-failed)+'/'+rows.length+', '+failed+' failed');process.exitCode=failed?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
