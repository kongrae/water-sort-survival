// Product menu and local-storage recovery around the shared view. No endless/daily state.
(function(global){
  'use strict';
  async function createRouteApplication(options){
    const tr=window.WSSLocale.t;
    const $=id=>document.getElementById(id),Route=createRouteEngine(options.core,options.hashText);
    const stages=await Promise.all(JSON.parse($('routePack').textContent).map(s=>Route.prepareStage(s)));
    const guides=RouteGuidance.prepare(stages,JSON.parse($('routePackGuides').textContent));
    const progress=createRouteProgress(Route,stages,options.storage),host=$('routeView');
    host.append($('routeViewTemplate').content.cloneNode(true));
    host.querySelector('#route-stageSelect').hidden=true;host.querySelector('header').hidden=true;
    let menu=true,lastIssue=null;
    const errorText={
      'read-failed':'물길 저장을 읽지 못했어요. 다시 확인하거나 저장 없이 시작할 수 있어요.',
      'write-failed':'방금 이동을 저장하지 못했어요. 화면에는 남아 있어요. 저장을 재시도하거나 이번에는 저장 없이 계속할 수 있어요.',
      'no-writer':'이 환경에서는 물길 진행을 안전하게 저장할 수 없어요. 저장 없이 플레이할 수 있어요.',
      'conflict':'다른 저장 변경을 확인했어요. 최신 저장을 열거나 저장 없이 새로 시작할 수 있어요.',
      'backup-exists':'이전에 보관한 원본이 있어 덮어쓰지 않았어요. 저장 없이 플레이할 수 있어요.',
      'recovery-failed':'원본을 보관하지 못해 기존 저장을 바꾸지 않았어요. 저장 없이 플레이할 수 있어요.'
    };
    function refresh(){
      const s=progress.snapshot(),problem=lastIssue||s.issue||(!s.memoryOnly&&!options.storage.writable()?'no-writer':null);
      $('routeProgress').textContent=tr("{0} / {1} 완료",s.cleared,stages.length);
      host.closest('.sheet').classList.toggle('route-playing',!menu);
      $('routeSaveStatus').textContent=problem?tr("저장 확인 필요"):s.memoryOnly?tr("저장 안 함"):tr("이 브라우저에 저장");
      $('routeSaveStatus').title=tr(s.memoryOnly?'이번 플레이는 저장하지 않아요. 새로고침하면 지금 진행이 사라져요.':'진행·최소 이동·되돌리기는 이 브라우저에만 저장됩니다.');
      $('routeNotice').hidden=!problem;
      if(problem)$('routeNoticeText').textContent=tr(errorText[problem]||'물길 저장의 버전이나 내용을 확인할 수 없어요. 원본을 보존했습니다. 원본을 보관하고 새 팩을 시작하거나 저장 없이 플레이할 수 있어요.');
      $('routeRetry').hidden=!problem||['no-writer','backup-exists'].includes(problem);
      $('routeRetry').textContent=tr(problem==='conflict'?'최신 저장 열기':'저장 다시 확인');
      $('routeRecover').hidden=!problem||['read-failed','write-failed','no-writer','conflict'].includes(problem);
      $('routeMemory').hidden=!problem;
      $('routeMenu').hidden=!menu;host.hidden=menu;$('routeList').hidden=menu;
      $('routeResume').hidden=!!problem||s.state?.phase!=='playing';
      if(s.state)$('routeResume').textContent=tr("{0}번 이어하기 · {1}수",stages.indexOf(s.stage)+1,s.state.moves);
      $('routeStageList').replaceChildren(...stages.map((stage,i)=>{
        const b=document.createElement('button'),record=s.envelope.records[stage.id];b.type='button';b.className='btn route-stage-choice';b.dataset.routeStage=String(i);b.disabled=!!problem||i>=s.unlocked;
        const title=document.createElement('strong'),note=document.createElement('small');title.textContent=`${i+1}. ${tr(stage.title)}`;
        note.textContent=i>=s.unlocked?tr("{0}번을 완료하면 열려요",i):record?tr("완료 · 최소 {0}수 · 다시 도전",record.bestMoves):s.state?.stageId===stage.id&&s.state.phase==='playing'?tr("진행 중 · {0}수",s.state.moves):tr("시작하기");b.append(title,note);return b;
      }));
      if(!menu)view.render();
    }
    function choose(index,fresh=false){
      const r=progress.select(index,fresh);lastIssue=r.ok?null:r.reason;
      if(r.ok){menu=false;view.cancel();view.render();view.say(r.state.moves?'저장된 진행을 이어서 플레이합니다.':'모든 물을 같은 색 도착지로 보내세요.');}refresh();
      if(r.ok){host.closest('.sheet').scrollTop=0;host.querySelector('.route-scroll').scrollTop=0;$('routeList').focus({preventScroll:true});}return r;
    }
    const view=createRouteView({root:host,translate:tr,prefix:'route-',bottleUI:options.bottleUI,Route,stages,guides,snapshot:progress.snapshot,blocked:()=>!!(lastIssue||progress.snapshot().issue||(!progress.snapshot().memoryOnly&&!options.storage.writable())),
      select:index=>choose(index),dispatch:(kind,move)=>{const r=progress.act(kind,move);if(!r.ok&&progress.snapshot().issue)lastIssue=progress.snapshot().issue;refresh();return r;},
      next:()=>{const index=stages.indexOf(progress.snapshot().stage);if(index<stages.length-1)choose(index+1);else showMenu();},
      preferences:options.preferences,setPreferences:options.setPreferences,lastNextLabel:'스테이지 목록으로'});
    function showMenu(){menu=true;view.cancel();refresh();host.closest('.sheet').scrollTop=0;host.querySelector('.route-scroll').scrollTop=0;}
    $('routeStageList').addEventListener('click',e=>{const b=e.target.closest('[data-route-stage]');if(!b||b.disabled)return;const i=Number(b.dataset.routeStage);choose(i,progress.snapshot().state?.phase==='won');});
    $('routeResume').addEventListener('click',()=>{menu=false;view.cancel();refresh();view.say('저장된 진행을 이어서 플레이합니다.');});
    $('routeList').addEventListener('click',showMenu);
    $('routeRetry').addEventListener('click',()=>{lastIssue=null;const r=progress.retry();if(!r.ok)lastIssue=r.reason;view.cancel();if(!progress.snapshot().state)menu=true;refresh();});
    $('routeMemory').addEventListener('click',()=>{lastIssue=null;progress.continueWithoutSaving();if(!progress.snapshot().state)menu=true;view.cancel();refresh();});
    $('routeRecover').addEventListener('click',()=>{lastIssue=null;const r=progress.restartProtected();if(!r.ok)lastIssue=r.reason;else showMenu();refresh();});
    return Object.freeze({show:()=>{const s=progress.snapshot();if(!s.loaded||(!s.memoryOnly&&!s.dirty))progress.load();lastIssue=null;showMenu();},refresh,pause:()=>view.cancel(),close:()=>view.cancel()});
  }
  if(typeof module==='object'&&module.exports)module.exports=createRouteApplication;else global.createRouteApplication=createRouteApplication;
})(typeof globalThis!=='undefined'?globalThis:this);
