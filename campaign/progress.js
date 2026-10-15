// Dedicated local envelope. Existing engine actions also validate saved action logs.
// The host owns the shared writer lock; no general-mode, cloud, or route keys are written here.
(function(root){
  'use strict';
  const KEY='wsurv.campaign.v1',RECOVERY_KEY='wsurv.campaign.recovery.v1',MAX_EVENTS=16384,MAX_TEXT=2*1024*1024;
  const clone=x=>JSON.parse(JSON.stringify(x)),object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const only=(x,keys)=>Object.keys(x).every(k=>keys.includes(k)),integer=x=>Number.isSafeInteger(x)&&x>=0;
  const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(x);
  const stable=x=>JSON.stringify(x,(_,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  function createCampaignProgress(E,stages,manifest,storage){
    if(!stages.length||!manifest||!/^[a-f0-9]{64}$/.test(manifest.packHash)||!storage||!['read','write','writable','attempt'].every(k=>typeof storage[k]==='function'))throw Error('Campaign progress requires content, engine, manifest and storage');
    for(const s of stages)if(!/^[a-f0-9]{64}$/.test(manifest.stages?.[s.id]||''))throw Error('Missing campaign signature');
    const empty=()=>({schema:1,revision:0,packHash:manifest.packHash,selectedStage:stages[0].id,inCampaign:false,active:null,records:{}});
    const ownedKeys=Object.keys(E.newCampaign(stages[0],'campaign-check'));
    const projection=s=>Object.fromEntries(ownedKeys.map(k=>[k,s[k]]));
    let envelope=empty(),runtime=null,baseText=null,issue=null,dirty=false,memoryOnly=false,loaded=false;
    const unlocked=e=>{let n=1;while(n<stages.length&&Object.hasOwn(e.records,stages[n-1].id))n++;return n;};
    function step(r,a){
      if(!Array.isArray(a))return false;
      const name=a[0],args=a.slice(1),state=r.state;
      if(name==='resume'&&a.length===1){r.history=[];return true;}
      if(name==='undo'&&a.length===1){
        if(!r.history.length||state.undoLeft<=0||state.campaign.phase==='won')return false;
        const left=state.undoLeft-1,used=state.undoUsed+1;r.state=r.history.pop();r.state.undoLeft=left;r.state.undoUsed=used;return true;
      }
      if(state.over)return false;
      if(name==='end'&&a.length===1)return E.endCampaign(state);
      const fn={place:'applyPlace',pour:'applyPour',flip:'applyFlip',hold:'applyHold'}[name],count={place:1,pour:2,flip:0,hold:0}[name];
      if(!fn||args.length!==count||args.some(n=>!integer(n)||n>=state.bottles.length))return false;
      const before=clone(state);if(!E[fn](state,...args))return false;
      if(['place','pour','hold'].includes(name)){r.history.push(before);if(r.history.length>40)r.history.shift();}
      return true;
    }
    function restore(active){
      if(!object(active)||!only(active,['stageId','attemptId','events'])||!id(active.attemptId)||!Array.isArray(active.events)||active.events.length>MAX_EVENTS)throw Error('invalid-attempt');
      const stage=stages.find(s=>s.id===active.stageId);if(!stage)throw Error('invalid-stage');
      const r={state:E.newCampaign(stage,active.attemptId),history:[]};
      for(const a of active.events)if(!step(r,a))throw Error('invalid-action-log');
      return r;
    }
    function validate(raw){
      if(!object(raw)||!only(raw,['schema','revision','packHash','selectedStage','inCampaign','active','records'])||raw.schema!==1)return{ok:false,reason:'unsupported-schema'};
      if(raw.packHash!==manifest.packHash)return{ok:false,reason:'content-mismatch'};
      if(!integer(raw.revision)||typeof raw.inCampaign!=='boolean'||!object(raw.records)||!stages.some(s=>s.id===raw.selectedStage))return{ok:false,reason:'invalid-envelope'};
      for(const [key,record]of Object.entries(raw.records)){
        const stage=stages.find(s=>s.id===key);
        if(!stage||!object(record)||!only(record,['rulesVersion','contentVersion','contentHash','attemptId'])||!id(record.attemptId)||record.rulesVersion!==stage.rulesVersion||record.contentVersion!==stage.contentVersion||record.contentHash!==manifest.stages[key])return{ok:false,reason:'invalid-record'};
      }
      const count=unlocked(raw);if(Object.keys(raw.records).some(key=>stages.findIndex(s=>s.id===key)>=count)||stages.findIndex(s=>s.id===raw.selectedStage)>=count)return{ok:false,reason:'locked-stage'};
      let restored=null;
      if(raw.active!==null){
        if(raw.active?.stageId!==raw.selectedStage)return{ok:false,reason:'invalid-active-stage'};
        try{restored=restore(raw.active);}catch(_){return{ok:false,reason:'invalid-action-log'};}
        if(restored.state.campaign.phase==='won'&&!Object.hasOwn(raw.records,raw.selectedStage))return{ok:false,reason:'incomplete-clear-record'};
      }else if(raw.inCampaign)return{ok:false,reason:'invalid-active-stage'};
      return{ok:true,envelope:clone(raw),runtime:restored};
    }
    function snapshot(){return{envelope:clone(envelope),state:runtime?clone(runtime.state):null,issue,dirty,memoryOnly,loaded,unlocked:unlocked(envelope),cleared:Object.keys(envelope.records).length};}
    function load(){
      let text;loaded=true;
      try{text=storage.read(KEY);}catch(_){issue='read-failed';return snapshot();}
      baseText=text;dirty=false;memoryOnly=false;
      if(text===null){envelope=empty();runtime=null;issue=null;return snapshot();}
      if(typeof text!=='string'||text.length>MAX_TEXT){issue='invalid-envelope';return snapshot();}
      try{const checked=validate(JSON.parse(text));if(!checked.ok){issue=checked.reason;return snapshot();}envelope=checked.envelope;runtime=checked.runtime;issue=null;}
      catch(_){issue='invalid-json';}
      return snapshot();
    }
    function flush(){
      if(memoryOnly)return{ok:true,saved:false,memoryOnly:true};
      if(!storage.writable()){issue='no-writer';return{ok:false,reason:issue};}
      if(!dirty)return{ok:!issue,saved:!issue,reason:issue};
      try{
        if(storage.read(KEY)!==baseText){issue='conflict';return{ok:false,reason:issue};}
        const text=JSON.stringify(envelope);if(text.length>MAX_TEXT){issue='save-limit';return{ok:false,reason:issue};}
        storage.write(KEY,text);baseText=text;dirty=false;issue=null;return{ok:true,saved:true};
      }catch(_){issue='write-failed';return{ok:false,reason:issue};}
    }
    function publish(next,nextRuntime){
      if(issue)return{ok:false,reason:issue};
      if(!memoryOnly&&!storage.writable()){issue='no-writer';return{ok:false,reason:issue};}
      if(envelope.revision===Number.MAX_SAFE_INTEGER){issue='revision-limit';return{ok:false,reason:issue};}
      envelope={...next,revision:envelope.revision+1};runtime=nextRuntime;dirty=!memoryOnly;
      const saved=flush();return{ok:true,state:clone(runtime?.state||null),saved:saved.saved===true,issue:saved.ok?null:saved.reason};
    }
    function select(index,fresh=false){
      if(!integer(index)||index>=unlocked(envelope))return{ok:false,reason:'locked-stage'};
      const stage=stages[index];
      if(!fresh&&envelope.active?.stageId===stage.id)return resume();
      const attemptId=storage.attempt();if(!id(attemptId))return{ok:false,reason:'invalid-attempt'};
      const active={stageId:stage.id,attemptId,events:[]};return publish({...envelope,selectedStage:stage.id,inCampaign:true,active},restore(active));
    }
    function capture(action,state){
      if(issue)return{ok:false,reason:issue};
      if(!runtime||!envelope.active)return{ok:false,reason:'no-active-stage'};
      if(!action){if(stable(projection(state))!==stable(projection(runtime.state))){issue='invalid-runtime';return{ok:false,reason:issue};}return flush();}
      if(envelope.active.events.length>=MAX_EVENTS){issue='save-limit';return{ok:false,reason:issue};}
      const next=clone(runtime);if(!step(next,action)||stable(projection(state))!==stable(projection(next.state))){issue='invalid-runtime';return{ok:false,reason:issue};}
      const active={...envelope.active,events:envelope.active.events.concat([clone(action)])},records={...envelope.records},stage=stages.find(s=>s.id===active.stageId);
      if(next.state.campaign.phase==='won'&&!Object.hasOwn(records,stage.id))records[stage.id]={rulesVersion:stage.rulesVersion,contentVersion:stage.contentVersion,contentHash:manifest.stages[stage.id],attemptId:active.attemptId};
      return publish({...envelope,active,records},next);
    }
    function resume(){
      if(!runtime||!envelope.active)return{ok:false,reason:'no-active-stage'};
      if(envelope.active.events.length>=MAX_EVENTS){issue='save-limit';return{ok:false,reason:issue};}
      const next=clone(runtime);step(next,['resume']);
      return publish({...envelope,inCampaign:true,active:{...envelope.active,events:envelope.active.events.concat([['resume']])}},next);
    }
    function leave(){return publish({...envelope,inCampaign:false},runtime);}
    function retry(){if(issue==='conflict'||!dirty){load();return{ok:!issue,reason:issue};}return flush();}
    function continueWithoutSaving(){
      // Keep actions after a failed write, otherwise preserve the unreadable original and start in memory.
      if(issue&&issue!=='write-failed'&&issue!=='no-writer'){envelope=empty();runtime=null;}
      issue=null;dirty=false;memoryOnly=true;loaded=true;return snapshot();
    }
    function restartProtected(){
      if(!storage.writable())return{ok:false,reason:'no-writer'};
      try{
        if(storage.read(KEY)!==baseText){issue='conflict';return{ok:false,reason:issue};}
        const backup=storage.read(RECOVERY_KEY);
        if(backup!==null){let previous;try{previous=JSON.parse(backup);}catch(_){issue='backup-exists';return{ok:false,reason:issue};}if(previous.raw!==baseText){issue='backup-exists';return{ok:false,reason:issue};}}
        if(baseText!==null&&backup===null)storage.write(RECOVERY_KEY,JSON.stringify({schema:1,raw:baseText}));
        envelope=empty();runtime=null;dirty=true;memoryOnly=false;issue=null;return flush();
      }catch(_){issue='recovery-failed';return{ok:false,reason:issue};}
    }
    return Object.freeze({KEY,RECOVERY_KEY,MAX_EVENTS,load,snapshot,validate,select,capture,resume,leave,retry,flush,continueWithoutSaving,restartProtected});
  }
  if(typeof module==='object'&&module.exports)module.exports=createCampaignProgress;else root.createCampaignProgress=createCampaignProgress;
})(typeof globalThis!=='undefined'?globalThis:this);
