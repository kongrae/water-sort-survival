// Separate test origin and in-memory records: the 10k fixtures never write player saves.
const fs=require('fs'),path=require('path'),http=require('http');
const {ROOT,EVIDENCE}=require('./common');
const init=`<script>
  window.__fixtureStore=new Map([
    ['wsurv.seenHelp',true],['wsurv.themes.owned',['lab','cafe','gem','deep']],
    ['wsurv.prefs',{seenV2:true,seenCoach:true,staged:false,sound:true,vibrate:false,fx:'juicy',controls:'classic',symbols:true,theme:'dark'}]
  ]);
  window.__fixtureState=()=>{const s=newState('endless','color-goal-demo',sanitizeRules(ENDLESS_RULES));
    s.score=10000;s.cum=[];s.rescueAds=0;s.bestAtStart=10000;s.newBestShown=true;
    const double=new URLSearchParams(location.search).get('goal')==='2';
    s.bottles=double?[[0,0,0],[0,0,0],[],[],[],[],[],[]]:[[0,0],[1,1,1],[1],[0,2],[2,2],[],[],[]];
    s.growth.activeColors=9;s.growth.pendingIntro=[];s.growth.pieceIntro=-1;s.piece=[0];
    s.growth.queue=[{piece:[0],intro:-1},{piece:[1],intro:-1}];updateColorChallenge(s,{},false);return s;};
  window.claude={hot:{snapshot:fn=>window.__snapFn=fn,ready:fn=>fn({S:window.__fixtureState()})}};
  window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
</script>`;
const wrapper=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보트리스 색상 도전 체험</title>
<style>body{margin:0;height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr);justify-items:center;background:#0f171c;color:#e7f3f5;font:14px system-ui}header{padding:10px 12px;text-align:center;max-width:480px;box-sizing:border-box}h1{font-size:18px;margin:0}p{margin:6px 0;color:#afc7cf;font-size:12px}button{padding:7px 12px;border:1px solid #557080;border-radius:8px;background:#1b2830;color:inherit;cursor:pointer}iframe{width:min(390px,100%);height:100%;border:0}</style>
<header><h1>색상 도전 체험</h1><p>검증용 10,000점 상태입니다. 기록은 저장되지 않습니다.<br>빨강을 먼저 완성하세요. 파랑을 먼저 완성하면 보너스 목표만 끝납니다.</p>
<button id="single">준비가 필요한 1병 목표</button> <button id="double">2병 목표</button> <button id="reset">초기화</button></header>
<iframe id="game" title="색상 도전 게임" src="/game?goal=1"></iframe><script>const frame=document.getElementById('game');document.getElementById('single').onclick=()=>frame.src='/game?goal=1';document.getElementById('double').onclick=()=>frame.src='/game?goal=2';document.getElementById('reset').onclick=()=>frame.src=frame.src;</script></html>`;
const page=()=>fs.readFileSync(path.join(ROOT,'dist/index.html'),'utf8')
  .replace(/const FIREBASE_CONFIG = (null|\{[\s\S]*?\n  \});/,'const FIREBASE_CONFIG = null;')
  .replace(/  const LS = \{[\s\S]*?\n  \};/,`  const LS={get:(k,d)=>window.__fixtureStore.has(k)?window.__fixtureStore.get(k):d,
    set:(k,v)=>{window.__fixtureStore.set(k,JSON.parse(JSON.stringify(v)));return true;},del:k=>window.__fixtureStore.delete(k),keys:()=>[...window.__fixtureStore.keys()]};`)
  .replace('<body>','<body>'+init);
fs.mkdirSync(EVIDENCE,{recursive:true});fs.writeFileSync(path.join(EVIDENCE,'demo.html'),page());
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(new URL(req.url,'http://localhost').pathname==='/game'?page():wrapper);})
  .listen(8159,'127.0.0.1',()=>console.log('Color goal demo: http://127.0.0.1:8159/ (memory-only records)'));
