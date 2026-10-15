// One local envelope; completion and its record are committed in the same setItem.
// The host supplies the existing writer lock and storage. No cloud or legacy-mode writes.
(function(root){
  'use strict';
  const KEY='wsurv.route.v1',RECOVERY_KEY='wsurv.route.recovery.v1';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const only=(x,allowed)=>Object.keys(x).every(k=>allowed.includes(k));
  const integer=x=>Number.isSafeInteger(x)&&x>=0;
  const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  function createRouteProgress(Route,stages,storage){
    if(!stages.length||!storage||!['read','write','writable','attempt'].every(k=>typeof storage[k]==='function'))throw Error('Route progress requires prepared stages and storage adapter');
    const empty=()=>({schema:1,revision:0,active:null,records:{},selectedStage:stages[0].id});
    let envelope=freeze(empty()),baseText=null,issue=null,dirty=false,memoryOnly=false,loaded=false;
    const unlocked=e=>{let n=1;while(n<stages.length&&Object.hasOwn(e.records,stages[n-1].id))n++;return n;};
    function validate(raw){
      if(!object(raw)||!only(raw,['schema','revision','active','records','selectedStage'])||raw.schema!==1||!integer(raw.revision)||!object(raw.records)||!stages.some(s=>s.id===raw.selectedStage))return {ok:false,reason:raw?.schema!==1?'unsupported-schema':'invalid-envelope'};
      for(const [id,record]of Object.entries(raw.records)){
        const s=stages.find(s=>s.id===id);
        if(!s||!object(record)||!only(record,['rulesVersion','contentVersion','contentHash','bestMoves'])||record.rulesVersion!==s.rulesVersion||record.contentVersion!==s.contentVersion||record.contentHash!==s.contentHash||!integer(record.bestMoves)||record.bestMoves<1)return {ok:false,reason:'invalid-record'};
      }
      const count=unlocked(raw);
      if(Object.keys(raw.records).some(id=>stages.findIndex(s=>s.id===id)>=count)||stages.findIndex(s=>s.id===raw.selectedStage)>=count)return {ok:false,reason:'locked-stage'};
      let active=null;
      if(raw.active!==null){
        const s=stages.find(s=>s.id===raw.active?.stageId);
        if(!s||s.id!==raw.selectedStage)return {ok:false,reason:'invalid-active-stage'};
        const restored=Route.restoreState(s,raw.active);if(!restored.ok)return {ok:false,reason:'invalid-active-state',errors:restored.errors};active=restored.state;
        if(active.phase==='won'&&(!raw.records[s.id]||raw.records[s.id].bestMoves>active.moves))return {ok:false,reason:'incomplete-clear-record'};
      }
      return {ok:true,envelope:freeze({...clone(raw),active})};
    }
    function snapshot(){
      const stage=stages.find(s=>s.id===envelope.selectedStage);
      return {envelope,stage,state:envelope.active,issue,dirty,memoryOnly,unlocked:unlocked(envelope),cleared:Object.keys(envelope.records).length,loaded};
    }
    function load(){
      let rawText;
      try{rawText=storage.read(KEY);}catch(_){issue='read-failed';loaded=true;return snapshot();}
      baseText=rawText;dirty=false;memoryOnly=false;loaded=true;
      if(rawText===null){envelope=freeze(empty());issue=null;return snapshot();}
      try{const result=validate(JSON.parse(rawText));if(!result.ok){issue=result.reason;return snapshot();}envelope=result.envelope;issue=null;}
      catch(_){issue='invalid-json';}
      return snapshot();
    }
    function flush(){
      if(memoryOnly)return {ok:true,saved:false,memoryOnly:true};
      if(!storage.writable()){issue='no-writer';return {ok:false,reason:issue};}
      if(!dirty)return {ok:true,saved:true};
      try{
        if(storage.read(KEY)!==baseText){issue='conflict';return {ok:false,reason:issue};}
        const text=JSON.stringify(envelope);storage.write(KEY,text);baseText=text;dirty=false;issue=null;return {ok:true,saved:true};
      }catch(_){issue='write-failed';return {ok:false,reason:issue};}
    }
    const allowed=()=>memoryOnly||(!issue&&storage.writable());
    function publish(next,result={ok:true}){
      if(!allowed())return {ok:false,reason:issue||'no-writer'};
      if(envelope.revision===Number.MAX_SAFE_INTEGER){issue='revision-limit';return {ok:false,reason:issue};}
      envelope=freeze({...next,revision:envelope.revision+1});dirty=!memoryOnly;
      const saved=flush();return {...result,ok:true,saved:saved.saved===true,issue:saved.ok?null:saved.reason};
    }
    function select(index,fresh=false){
      if(!Number.isInteger(index)||index<0||index>=unlocked(envelope))return {ok:false,reason:'locked-stage'};
      if(!allowed())return {ok:false,reason:issue||'no-writer'};
      const stage=stages[index];
      if(!fresh&&envelope.active?.stageId===stage.id)return {ok:true,state:envelope.active,saved:!memoryOnly};
      const state=Route.createState(stage,storage.attempt());return publish({...envelope,selectedStage:stage.id,active:state},{ok:true,state});
    }
    function act(kind,move){
      if(!allowed())return {ok:false,reason:issue||'no-writer'};
      const {stage,state}=snapshot();if(!state)return {ok:false,reason:'no-active-stage'};
      const result=kind==='move'?Route.applyMove(stage,state,move):kind==='undo'?Route.undo(stage,state):kind==='restart'?Route.restart(stage,state,storage.attempt()):{ok:false,reason:'invalid-action'};
      if(!result.ok)return result;
      const records={...envelope.records};
      if(result.state.phase==='won')records[stage.id]={rulesVersion:stage.rulesVersion,contentVersion:stage.contentVersion,contentHash:stage.contentHash,bestMoves:Math.min(records[stage.id]?.bestMoves??Infinity,result.state.moves)};
      return publish({...envelope,active:result.state,records},result);
    }
    function retry(){
      if(issue==='conflict'){load();return {ok:!issue,reason:issue};}
      if(dirty)return flush();
      load();return {ok:!issue,reason:issue};
    }
    function continueWithoutSaving(){
      // Failed writes keep the current in-memory action. Damaged or unreadable saves start a fresh pack.
      if(issue&&issue!=='write-failed'&&issue!=='no-writer')envelope=freeze(empty());
      issue=null;dirty=false;memoryOnly=true;loaded=true;return snapshot();
    }
    function restartProtected(){
      if(!storage.writable())return {ok:false,reason:'no-writer'};
      try{
        if(storage.read(KEY)!==baseText){issue='conflict';return {ok:false,reason:issue};}
        const backup=storage.read(RECOVERY_KEY);
        if(backup!==null&&JSON.parse(backup).raw!==baseText)return {ok:false,reason:'backup-exists'};
        if(baseText!==null&&backup===null)storage.write(RECOVERY_KEY,JSON.stringify({schema:1,raw:baseText}));
        // Preserve the original before replacing only the route envelope. The backup itself is never clobbered.
        issue=null;envelope=freeze(empty());dirty=true;return flush();
      }catch(_){issue='recovery-failed';return {ok:false,reason:issue};}
    }
    return Object.freeze({KEY,RECOVERY_KEY,load,snapshot,validate,select,act,retry,flush,continueWithoutSaving,restartProtected});
  }
  if(typeof module==='object'&&module.exports)module.exports=createRouteProgress;else root.createRouteProgress=createRouteProgress;
})(typeof globalThis!=='undefined'?globalThis:this);
