// Follows campaign/progress.js: dedicated envelope, engine replay, writer ownership,
// compare-before-write and preserved recovery copy. Delivery adds practice and elapsed time.
(function(root){
  'use strict';
  const KEY='wsurv.delivery.v1',RECOVERY_KEY='wsurv.delivery.recovery.v1',MAX_EVENTS=16384,MAX_TEXT=2*1024*1024;
  const clone=x=>JSON.parse(JSON.stringify(x)),object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const only=(x,keys)=>Object.keys(x).every(k=>keys.includes(k)),integer=x=>Number.isSafeInteger(x)&&x>=0;
  const duration=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER;
  const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(x);
  const stable=x=>JSON.stringify(x,(_,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  function createDeliveryProgress(E,stages,manifest,storage){
    if(!stages.length||!/^[a-f0-9]{64}$/.test(manifest?.packHash)||!['read','write','writable','attempt','now'].every(k=>typeof storage?.[k]==='function'))throw Error('Invalid delivery storage contract');
    const empty=()=>({schema:1,revision:0,packHash:manifest.packHash,learning:{offered:false,extracted:false,completed:false},active:null,records:{}});
    const owned=Object.keys(E.newDelivery(stages[0])),projection=s=>Object.fromEntries(owned.map(k=>[k,s[k]]));
    const compatible=new Map();
    if(manifest.compatiblePacks!==undefined&&!Array.isArray(manifest.compatiblePacks))throw Error('Invalid delivery compatibility manifest');
    for(const pack of manifest.compatiblePacks||[]){
      if(!object(pack)||!/^[a-f0-9]{64}$/.test(pack.packHash)||pack.packHash===manifest.packHash||compatible.has(pack.packHash)||!integer(pack.stageCount)||pack.stageCount<1||pack.stageCount>=stages.length)throw Error('Invalid delivery compatibility manifest');
      compatible.set(pack.packHash,pack.stageCount);
    }
    let envelope=empty(),runtime=null,baseText=null,issue=null,dirty=false,loaded=false,upgradeFrom=null;
    function step(r,a){
      if(!Array.isArray(a))return false;
      const [name,...args]=a,s=r.state;
      if(name==='resume'&&a.length===1){r.history=[];return true;}
      if(name==='undo'&&a.length===1){if(!r.history.length||s.over||s.undoLeft<=0)return false;const left=s.undoLeft-1,used=s.undoUsed+1;r.state=r.history.pop();r.state.undoLeft=left;r.state.undoUsed=used;return true;}
      if(s.over)return false;
      const count={place:1,pour:2,extract:2,flip:0,hold:0}[name];
      if(count===undefined||args.length!==count||args.some(n=>!integer(n)))return false;
      if(['place','pour','extract'].includes(name)&&args[0]>=s.bottles.length)return false;
      if(name==='pour'&&args[1]>=s.bottles.length)return false;
      const before=clone(s),fn={place:'applyPlace',pour:'applyPour',extract:'applyExtract',flip:'applyFlip',hold:'applyHold'}[name];
      if(!E[fn](s,...args))return false;
      if(name!=='flip'){r.history.push(before);if(r.history.length>40)r.history.shift();}return true;
    }
    function restore(a){
      if(!object(a)||!only(a,['stageId','attemptId','practice','events','elapsedMs','runningAt'])||!id(a.attemptId)||typeof a.practice!=='boolean'||!duration(a.elapsedMs)||!(a.runningAt===null||integer(a.runningAt))||!Array.isArray(a.events)||a.events.length>MAX_EVENTS)throw Error('invalid-active');
      const c=stages.find(c=>c.id===a.stageId);
      if(!c||(c.practiceOnly&&!a.practice))throw Error('invalid-active');
      if(a.practice&&((!c.practiceOnly&&c!==stages[0])||a.elapsedMs!==0||a.runningAt!==null))throw Error('invalid-active');
      const r={state:E.newDelivery(c),history:[]};for(const event of a.events)if(!step(r,event))throw Error('invalid-action-log');
      if(r.state.over&&a.runningAt!==null)throw Error('invalid-clock');return r;
    }
    function validate(raw){
      if(!object(raw)||!only(raw,['schema','revision','packHash','learning','active','records'])||raw.schema!==1)throw Error('unsupported-schema');
      const stageCount=raw.packHash===manifest.packHash?stages.length:compatible.get(raw.packHash);
      if(!stageCount)throw Error('content-mismatch');
      const allowedIds=new Set(stages.slice(0,stageCount).map(c=>c.id));
      if(!integer(raw.revision)||!object(raw.learning)||!only(raw.learning,['offered','extracted','completed'])||!['offered','extracted','completed'].every(k=>typeof raw.learning[k]==='boolean')||raw.learning.completed&&!raw.learning.offered||!object(raw.records))throw Error('invalid-envelope');
      for(const [key,v]of Object.entries(raw.records)){const c=stages.find(s=>s.id===key);if(!allowedIds.has(key)||!c||c.practiceOnly||!object(v)||!only(v,['bestMs','stars','attemptId'])||!duration(v.bestMs)||!id(v.attemptId)||v.stars!==E.deliveryStars(v.bestMs,c.starMs))throw Error('invalid-record');}
      if(raw.active&&!allowedIds.has(raw.active.stageId))throw Error('invalid-active');
      const r=raw.active===null?null:restore(raw.active);
      if(r){const a=raw.active;if(a.stageId===stages[0].id&&!raw.learning.offered)throw Error('invalid-learning');
        if(a.events.some(e=>e[0]==='extract')&&!raw.learning.extracted)throw Error('invalid-learning');
        if(r.state.delivery.phase==='won'){
          if(a.practice){if(a.stageId===stages[0].id&&!raw.learning.completed)throw Error('incomplete-result');}
          else {const record=raw.records[a.stageId];if(!record||record.attemptId!==a.attemptId||record.bestMs>a.elapsedMs)throw Error('incomplete-result');}
        }
      }return {envelope:{...clone(raw),packHash:manifest.packHash},runtime:r};
    }
    function status(){return {issue,dirty,loaded};}
    function snapshot(){return {...status(),envelope:clone(envelope),state:runtime?clone(runtime.state):null};}
    function load(){
      loaded=true;let text;try{text=storage.read(KEY);}catch(_){issue='read-failed';return snapshot();}
      baseText=text;dirty=false;upgradeFrom=null;
      if(text===null){envelope=empty();runtime=null;issue=null;return snapshot();}
      if(typeof text!=='string'||text.length>MAX_TEXT){issue='invalid-envelope';return snapshot();}
      try{const raw=JSON.parse(text),checked=validate(raw);envelope=checked.envelope;runtime=checked.runtime;issue=null;
        if(raw.packHash!==manifest.packHash)upgradeFrom={key:'wsurv.delivery.upgrade.'+raw.packHash+'.v1',raw:text};}
      catch(e){issue=e instanceof SyntaxError?'invalid-json':e.message;}return snapshot();
    }
    function flush(){
      if(!storage.writable()){issue='no-writer';return {ok:false,reason:issue};}
      if(!dirty)return {ok:!issue,saved:!issue,reason:issue};
      // Only a failed write can be retried against the in-memory candidate.
      if(issue&&issue!=='write-failed')return {ok:false,reason:issue};
      try{if(storage.read(KEY)!==baseText){issue='conflict';return {ok:false,reason:issue};}
        const text=JSON.stringify(envelope);if(text.length>MAX_TEXT){issue='save-limit';return {ok:false,reason:issue};}
        if(upgradeFrom){
          const backup=storage.read(upgradeFrom.key);
          if(backup!==null&&backup!==upgradeFrom.raw){issue='backup-exists';return {ok:false,reason:issue};}
          if(backup===null)storage.write(upgradeFrom.key,upgradeFrom.raw);
          if(storage.read(KEY)!==baseText){issue='conflict';return {ok:false,reason:issue};}
        }
        storage.write(KEY,text);baseText=text;upgradeFrom=null;dirty=false;issue=null;return {ok:true,saved:true};
      }catch(_){issue='write-failed';return {ok:false,reason:issue};}
    }
    function publish(next,r=runtime){
      if(issue)return {ok:false,reason:issue};
      if(!storage.writable()){issue='no-writer';return {ok:false,reason:issue};}
      if(envelope.revision===Number.MAX_SAFE_INTEGER){issue='revision-limit';return {ok:false,reason:issue};}
      envelope={...next,revision:envelope.revision+1};runtime=r;dirty=true;const saved=flush();return {ok:true,state:clone(runtime?.state||null),saved:saved.ok,issue};
    }
    function select(index,fresh,guide){
      if(!loaded||issue)return {ok:false,reason:issue||'not-loaded'};
      if(!integer(index)||!stages[index])return {ok:false,reason:'invalid-stage'};
      if(!fresh&&envelope.active?.stageId===stages[index].id)return resume();
      const attemptId=storage.attempt();if(!id(attemptId))return {ok:false,reason:'invalid-attempt'};
      const practice=stages[index].practiceOnly===true||index===0&&!!guide&&!envelope.learning.offered;
      const active={stageId:stages[index].id,attemptId,practice,events:[],elapsedMs:0,runningAt:null};
      return publish({...envelope,active,learning:{...envelope.learning,offered:envelope.learning.offered||index===0}},restore(active));
    }
    function capture(action,state,elapsedMs){
      if(issue)return {ok:false,reason:issue};if(!runtime||!envelope.active)return {ok:false,reason:'no-active'};
      if(!duration(elapsedMs)||elapsedMs<envelope.active.elapsedMs){issue='invalid-clock';return {ok:false,reason:issue};}
      if(!action){if(stable(projection(state))!==stable(projection(runtime.state))){issue='invalid-runtime';return {ok:false,reason:issue};}return flush();}
      if(envelope.active.events.length>=MAX_EVENTS){issue='save-limit';return {ok:false,reason:issue};}
      const r=clone(runtime);if(!step(r,action)||stable(projection(state))!==stable(projection(r.state))){issue='invalid-runtime';return {ok:false,reason:issue};}
      const a={...envelope.active,events:envelope.active.events.concat([clone(action)]),elapsedMs:envelope.active.practice?0:elapsedMs,runningAt:r.state.over?null:envelope.active.runningAt===null?null:storage.now()};
      const learning={...envelope.learning,extracted:envelope.learning.extracted||action[0]==='extract'},records={...envelope.records};
      if(r.state.delivery.phase==='won'){
        if(a.practice){if(a.stageId===stages[0].id)learning.completed=true;}
        else {const c=stages.find(c=>c.id===a.stageId),bestMs=Math.min(records[c.id]?.bestMs??Infinity,a.elapsedMs);records[c.id]={bestMs,stars:E.deliveryStars(bestMs,c.starMs),attemptId:a.attemptId};}
      }return publish({...envelope,active:a,learning,records},r);
    }
    function checkpoint(elapsedMs,running){
      if(issue||!envelope.active||!runtime)return {ok:false,reason:issue||'no-active'};
      if(!duration(elapsedMs)||elapsedMs<envelope.active.elapsedMs){issue='invalid-clock';return {ok:false,reason:issue};}
      const a=envelope.active;return publish({...envelope,active:{...a,elapsedMs:a.practice?0:elapsedMs,runningAt:running&&!a.practice&&!runtime.state.over?storage.now():null}});
    }
    function resume(){
      if(issue||!envelope.active||!runtime)return {ok:false,reason:issue||'no-active'};
      const a=envelope.active;if(a.events.length>=MAX_EVENTS){issue='save-limit';return {ok:false,reason:issue};}
      const wall=storage.now();if(a.runningAt!==null&&wall<a.runningAt){issue='clock-backwards';return {ok:false,reason:issue};}
      const elapsedMs=a.elapsedMs+(a.runningAt===null?0:wall-a.runningAt);if(!duration(elapsedMs)){issue='invalid-clock';return {ok:false,reason:issue};}
      const r=clone(runtime);step(r,['resume']);return publish({...envelope,active:{...a,elapsedMs,runningAt:null,events:a.events.concat([['resume']])}},r);
    }
    function retry(){if(issue==='write-failed'&&dirty)return flush();load();return {ok:!issue,reason:issue};}
    function restartProtected(){
      if(!storage.writable()||issue==='read-failed')return {ok:false,reason:issue||'no-writer'};
      try{if(storage.read(KEY)!==baseText){issue='conflict';return {ok:false,reason:issue};}
        const backup=storage.read(RECOVERY_KEY);if(backup!==null&&JSON.parse(backup).raw!==baseText){issue='backup-exists';return {ok:false,reason:issue};}
        if(baseText!==null&&backup===null)storage.write(RECOVERY_KEY,JSON.stringify({schema:1,raw:baseText}));
        envelope=empty();runtime=null;dirty=true;issue=null;upgradeFrom=null;return flush();
      }catch(_){issue='recovery-failed';return {ok:false,reason:issue};}
    }
    return Object.freeze({KEY,RECOVERY_KEY,load,status,snapshot,validate,select,capture,checkpoint,resume,retry,restartProtected});
  }
  if(typeof module==='object'&&module.exports)module.exports=createDeliveryProgress;else root.createDeliveryProgress=createDeliveryProgress;
})(typeof globalThis!=='undefined'?globalThis:this);
