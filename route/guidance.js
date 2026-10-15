// Content-bound, read-only lesson selection. No solver, move execution or persistence.
(function(root){
  'use strict';
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const keys=(x,allowed)=>Object.keys(x).every(k=>allowed.includes(k));
  const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=500;
  const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  function prepare(stages,raw){
    if(!object(raw)||!keys(raw,['schema','packId','contentVersion','lessons'])||raw.schema!==1||!text(raw.packId)||!text(raw.contentVersion)||!Array.isArray(raw.lessons)||raw.lessons.length!==stages.length)throw Error('Invalid route lessons');
    raw.lessons.forEach((lesson,i)=>{
      const s=stages[i];
      if(!object(lesson)||!keys(lesson,['stageId','contentHash','concept','intro','completion','fallback','automatic','cues'])||lesson.stageId!==s.id||lesson.contentHash!==s.contentHash||raw.contentVersion!==s.contentVersion||typeof lesson.automatic!=='boolean'||!['concept','intro','completion','fallback'].every(k=>text(lesson[k]))||!Array.isArray(lesson.cues)||lesson.cues.length>12)throw Error('Mismatched route lesson: '+s.id);
      const seen=new Set();
      for(const cue of lesson.cues){
        if(!object(cue)||!keys(cue,['id','when','text'])||!text(cue.id)||seen.has(cue.id)||!text(cue.text)||!object(cue.when)||!Object.keys(cue.when).length||!keys(cue.when,['bottles','top','delivered','gateOpen']))throw Error('Invalid route cue: '+s.id);
        seen.add(cue.id);const w=cue.when;
        if(w.gateOpen!==undefined&&typeof w.gateOpen!=='boolean')throw Error('Invalid gate condition');
        for(const field of ['bottles','top','delivered'])if(w[field]!==undefined){
          if(!object(w[field])||!Object.keys(w[field]).length)throw Error('Invalid cue condition');
          for(const [id,value] of Object.entries(w[field])){
            if(field==='delivered'){const o=s.outlets.find(o=>o.id===id);if(!o||!Number.isInteger(value)||value<0||value>o.demand)throw Error('Invalid cue outlet');}
            else if(!s.tankIds.includes(id)||(field==='top'?(!Number.isInteger(value)||value<0||value>12):(!Array.isArray(value)||value.length>4||value.some(c=>!Number.isInteger(c)||c<0||c>12))))throw Error('Invalid cue tank');
          }
        }
      }
    });
    return freeze(JSON.parse(JSON.stringify(raw)));
  }
  function current(stage,state,lesson){
    if(lesson.stageId!==stage.id||lesson.contentHash!==stage.contentHash)throw Error('Lesson does not match stage');
    if(state.phase==='won')return {id:'complete',text:lesson.completion};
    const matches=w=>{
      const b=state.bottles[stage.tankIds.indexOf(stage.gate.tank)],open=b.length>=2&&b.every(c=>c===stage.gate.color);
      if(w.gateOpen!==undefined&&w.gateOpen!==open)return false;
      if(w.bottles&&!Object.entries(w.bottles).every(([id,value])=>JSON.stringify(state.bottles[stage.tankIds.indexOf(id)])===JSON.stringify(value)))return false;
      if(w.top&&!Object.entries(w.top).every(([id,value])=>state.bottles[stage.tankIds.indexOf(id)].at(-1)===value))return false;
      return !w.delivered||Object.entries(w.delivered).every(([id,value])=>state.delivered[stage.outlets.findIndex(o=>o.id===id)]===value);
    };
    const cue=lesson.cues.find(c=>matches(c.when));return cue?{id:cue.id,text:cue.text}:{id:'fallback',text:lesson.fallback};
  }
  const api=Object.freeze({prepare,current});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RouteGuidance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
