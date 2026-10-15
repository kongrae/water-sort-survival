// Read-only lessons keyed by stage ID. Input, rules and undo remain in the shared game.
(function(root){
  'use strict';
  const lessons=['first','preview','goals','direction','mixed','hold','repeat','combine'];
  function prepare(stages,raw){
    if(!raw||raw.schema!==1||!Array.isArray(raw.lessons)||raw.lessons.length!==stages.length)throw Error('Invalid campaign lessons');
    const result={};
    for(const g of raw.lessons){
      const stage=stages.find(s=>s.id===g.stageId);
      if(!stage||stage.contentVersion!==raw.contentVersion||result[g.stageId]||!lessons.includes(g.lesson)||typeof g.title!=='string'||!g.title.trim()||typeof g.intro!=='string'||!g.intro.trim())throw Error('Mismatched campaign lesson');
      result[g.stageId]=Object.freeze({...g});
    }
    return Object.freeze(result);
  }
  function current(guide,state,context={}){
    if(!guide||!state?.campaign||guide.stageId!==state.campaign.content.id||state.campaign.phase!=='playing'||state.stuck||context.armed||context.selected!==null)return null;
    const cue=(id,text,focus=null)=>({id,text,focus});
    if(guide.lesson==='first'){
      if(state.turn===0)return cue('place',state.clears?'완성한 병은 비워져요. 지금 조각을 넣어 보세요.':context.control==='tapPlace'?'병을 누르면 조각이 들어가요. 병에서 병으로 끌면 부어요.':'조각을 병으로 끌거나, 조각을 누른 뒤 병을 누르세요.',context.control==='tapPlace'?null:'cup');
      if(!state.clears)return cue('complete','같은 색 4칸을 모으면 병이 비워져요.');
      return cue('pour','완성한 병은 비워져요. 병끼리 부어 한 병 더 완성하세요.');
    }
    if(state.turn!==0)return null;
    if(guide.lesson==='direction'&&state.flipped)return cue('flipped','위에 남는 색을 보고 넣을 자리를 고르세요.');
    if(guide.lesson==='hold'&&state.holdUsed)return cue('held','한 번 놓은 뒤 보관한 조각을 다시 바꿔 쓸 수 있어요.');
    return cue('intro',guide.intro,guide.lesson==='preview'?'queue':null);
  }
  const api=Object.freeze({prepare,current});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CampaignGuidance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
