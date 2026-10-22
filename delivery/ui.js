  // Public opt-in trial; dedicated progress never enters ordinary/cloud reward keys.
  const deliveryEnabled = true;
  const deliveryStages = JSON.parse($('deliveryPack').textContent);
  let deliveryReturn = null, deliveryIndex = 0, deliveryClock = null, deliveryResultTimer = 0;
  let deliveryAttempt = 0, deliverySaveAt = 0, deliverySaveRunning = false;
  const deliveryProgress = createDeliveryProgress({newDelivery,applyPlace,applyPour,applyExtract,applyHold,applyFlip,deliveryStars},deliveryStages,JSON.parse($('deliveryManifest').textContent),{
    read:key=>localStorage.getItem(key),write:(key,value)=>localStorage.setItem(key,value),
    writable:()=>writerState==='owner'&&!settlementBlocked,
    attempt:()=> 'delivery-'+Date.now()+'-'+(++deliveryAttempt)+'-'+Math.random().toString(36).slice(2,8),now:()=>Date.now()
  });
  let deliveryExtractLearned = false;
  // Separate learning from scored attempts; neither flag belongs in undo snapshots.
  let deliveryLessonOffered = false, deliveryPractice = false;
  let deliveryMenuIndex = 0, deliveryNextIndex = -1, deliveryMenuPage = -1;
  const deliveryPageSize = 10;
  function deliveryChoiceKind() {
    return !isDelivery(S)?null:S.delivery.content.id==='delivery-late-064'?'F':S.delivery.content.id==='delivery-late-065'?'H':null;
  }
  const deliveryChainPractice = '누적 시간·클리어·진행 중인 한 판을 저장해요. 별점·최고 시간은 기록하지 않아요.';
  const deliveryLateNotes = {
    'delivery-chain-066':'받는 병을 고를 때 다음 주문의 파랑도 살펴보세요.',
    'delivery-chain-067':'현재 주문과 다음 조각을 함께 살펴보세요.',
    'delivery-chain-068':'4칸 완성은 지금 주문에만 반영돼요. 다음 주문도 확인하세요.',
    'delivery-late-064': '64~65판은 도구와 공간 선택을 바꾸는 별점 없는 도전이에요.',
    'delivery-late-065': '지금·다음 조각과 비울 자리를 살펴보세요.',
    'delivery-late-061': '세 주문을 확인하고, 비울 병과 이어 모을 병을 함께 살펴보세요.',
    'delivery-late-062': '섞인 조각을 나눌 병과 같은 색을 받을 병을 구분하세요.',
    'delivery-late-063': '앞 두 판보다 긴 판이에요. 주문을 끝낸 색도 공간을 차지해요. 다음 빨강·노랑을 받을 재료를 살펴보세요.'
  };
  const deliveryLateEntry = '61~63판은 별점 없는 연습이에요. 마지막 63판은 앞 두 판보다 긴 도전이에요.';
  const deliveryLatePractice = '클리어와 이어하기는 저장해요. 재도전해도 별점·최고 시간은 기록하지 않아요.';
  function deliveryStageNote(c) {
    return deliveryLateNotes[c.id] ? (c.id==='delivery-late-061'?tr(deliveryLateEntry)+'\n':'')+tr(deliveryLateNotes[c.id]) : '';
  }
  function deliveryGoals(container,c,delivered) {
    container.textContent='';
    for(const [color,total]of Object.entries(c.goal)){
      const chip=document.createElement('span');chip.className='delivery-goal';chip.style.setProperty('--order-color','var(--liq'+color+')');
      chip.textContent=colorName(+color)+' '+(delivered?delivered[color]+'/':'')+total;container.append(chip);
    }
  }
  function selectDeliveryPreview(index) {
    if(!Number.isInteger(index)||!deliveryStages[index])return;
    deliveryMenuIndex=index;
    const page=Math.floor(index/deliveryPageSize);
    if(deliveryMenuPage!==page||!$('deliveryStageList').children.length)renderDeliveryStagePage(page);
    const saved=deliveryProgress.snapshot(),journey=deliveryProgress.journey(),c=deliveryStages[index],record=saved.envelope.records[c.id];
    const active=journey.activeIndex===index,cleared=!!saved.envelope.cleared[c.id];
    $('deliveryPreviewLabel').textContent=tr(active?'진행 중':cleared?'다시 도전':'다음 도전');
    const practice=c.practiceOnly||(active?saved.envelope.active.practice:index===0&&prefs.staged&&!saved.envelope.learning.offered);
    $('deliveryPreviewMode').textContent=tr(practice?'별점 없는 연습':'별점 도전');
    $('deliveryPreviewTitle').textContent=tr('스테이지 {0}',index+1)+' · '+tr(c.title);
    deliveryGoals($('deliveryPreviewGoals'),active?saved.state.delivery.content:c,active?saved.state.delivery.delivered:null);
    $('deliveryPreviewRecord').textContent=record?'★'.repeat(record.stars)+' · '+tr('최고 {0}',deliveryTimeText(record.bestMs)):cleared?'✓ '+tr('클리어'):tr('주문 색을 모아 탱크를 채우세요.');
    $('deliveryPreviewDetails').textContent=tr('주문 {0}색 · 병 {1}개',Object.keys(c.goal).length,c.bottles.length);
    $('deliveryPreviewNotice').textContent=deliveryStageNote(c);
    $('deliveryPreviewNotice').hidden=!deliveryLateNotes[c.id];
    $('deliveryPreviewTiming').textContent=practice?tr('연습은 시간·별점을 기록하지 않아요. 다시 도전하면 별점을 받아요.'):
      tr('3별 {0} · 2별 {1} · 완료하면 1별',deliveryTimeText(c.starMs[0]),deliveryTimeText(c.starMs[1]));
    if(c.practiceOnly)$('deliveryPreviewTiming').textContent=tr('테스트 판은 시간·별점을 기록하지 않아요. 다시 도전하거나 다음 판을 골라 보세요.');
    if(deliveryLateNotes[c.id])$('deliveryPreviewTiming').textContent=tr(c.orders?deliveryChainPractice:deliveryLatePractice);
    $('deliveryStageStart').textContent=tr(active?'스테이지 {0} 이어하기':cleared?'스테이지 {0} 다시 도전':'스테이지 {0} 시작',index+1);
    $('deliveryStageStart').disabled=!!saved.issue;
    $('deliveryReplaceNote').hidden=journey.activeIndex<0||active;
    $('deliverySavedResume').hidden=journey.activeIndex<0||active;
    $('deliverySavedResume').disabled=!!saved.issue;
    for(const button of $('deliveryStageList').children)button.setAttribute('aria-pressed',String(+button.dataset.stage===index));
  }
  function renderDeliveryStagePage(page) {
    const saved=deliveryProgress.snapshot(),journey=deliveryProgress.journey();
    deliveryMenuPage=Math.max(0,Math.min(Math.ceil(deliveryStages.length/deliveryPageSize)-1,page));
    const start=deliveryMenuPage*deliveryPageSize,end=Math.min(start+deliveryPageSize,deliveryStages.length);
    $('deliveryStageList').textContent='';
    $('deliveryPageRange').textContent=(start+1)+'–'+end+' / '+deliveryStages.length;
    $('deliveryStageList').setAttribute('aria-label',tr('스테이지 {0}~{1}',start+1,end));
    $('deliveryPagePrev').disabled=start===0;$('deliveryPageNext').disabled=end===deliveryStages.length;
    for(let i=start;i<end;i++) {
      const c=deliveryStages[i],button=document.createElement('button');button.className='delivery-stage-node';button.type='button';button.dataset.stage=i;
      const active=journey.activeIndex===i,record=saved.envelope.records[c.id],cleared=!!saved.envelope.cleared[c.id];
      const number=document.createElement('strong'),status=document.createElement('span');number.textContent=i+1;
      status.textContent=active?tr('진행 중'):record?'★'.repeat(record.stars):cleared?'✓':i===journey.nextIndex?tr('다음 도전'):'·';
      button.append(number,status);button.classList.toggle('cleared',cleared);
      button.setAttribute('aria-label',tr('스테이지 {0}',i+1)+' · '+tr(c.title)+' · '+tr(active?'진행 중':cleared?'클리어':'도전 가능')+(record?' · '+tr('별점 {0}개',record.stars):''));
      button.disabled=!!saved.issue;
      button.addEventListener('click',()=>selectDeliveryPreview(i));$('deliveryStageList').append(button);
    }
  }
  function captureDeliveryAction(action) {
    deliveryProgress.capture(action,S,deliveryClock.sample());
  }
  function saveDeliveryTime(running,force=false) {
    if(!isDelivery(S)||!deliveryClock||deliveryProgress.status().issue)return;
    const at=now();
    if(!force&&running===deliverySaveRunning&&(!running||at-deliverySaveAt<1000))return;
    deliveryProgress.checkpoint(deliveryClock.sample(),running);
    deliverySaveAt=at;deliverySaveRunning=running;
  }
  function showDeliveryStorage() {
    const problem=deliveryProgress.status().issue;if(!problem)return;
    deliveryClock?.setRunning(false);
    const messages={
      'write-failed':tr('방금 진행을 저장하지 못했어요. 화면에는 남아 있어요. 저장을 다시 확인해 주세요.'),
      'conflict':tr('다른 저장 변경을 확인했어요. 최신 저장을 열어 이어가세요.'),
      'read-failed':tr('납품 저장을 읽지 못했어요. 기존 기록을 바꾸지 않았어요.'),
      'no-writer':tr('현재 탭에서 안전하게 저장할 수 없어요. 다른 게임 탭을 닫은 뒤 다시 확인해 주세요.'),
      'clock-backwards':tr('기기 시간이 이전 시각으로 바뀌어 경과 시간을 확인할 수 없어요. 시간을 바로잡은 뒤 다시 확인해 주세요.'),
      'backup-exists':tr('이전에 보관한 원본이 있어 덮어쓰지 않았어요.'),
      'recovery-failed':tr('원본을 보관하지 못했어요. 기존 납품 저장은 유지했어요.')
    };
    $('deliveryStorageText').textContent=messages[problem]||tr('납품 저장의 버전이나 내용을 확인할 수 없어요. 원본을 유지했어요.');
    $('deliveryStorageRetry').textContent=tr(problem==='conflict'?'최신 저장 열기':'저장 다시 확인');
    $('deliveryStorageRecover').hidden=['read-failed','write-failed','conflict','no-writer','clock-backwards'].includes(problem);
    if(!$('ovDeliveryResult').hidden)$('ovDeliveryResult').hidden=true;
    if($('ovDeliveryStorage').hidden)$('ovDeliveryStorage').hidden=false;
  }
  function deliveryCoachSource() {
    if (!isDelivery(S) || deliveryIndex !== 0 || deliveryExtractLearned || !prefs.staged || S.over) return -1;
    return S.bottles.findIndex((b,i)=>b.length && previewExtract(S,i,b[0]).ok);
  }
  function deliveryCoachText(source) {
    const name=colorName(S.bottles[source][0]);
    if (sel === source) return tr('② {0} 탱크를 누르세요. 주문이 차고 병이 비어요.',name);
    return ctl() === 'tapPlace' ? tr('① 길게 누르기 → ② 탱크 누르기')+'\n'+tr('짧게 누르면 조각을 넣어요.') :
      tr('① {0} 병 누르기 → ② 탱크 누르기',name);
  }
  function deliveryTank(color) { return $('deliveryOrders').querySelector('[data-delivery="'+color+'"]'); }
  function deliveryTargetAt(x,y) {
    if (!isDelivery(S)) return null;
    const el = document.elementFromPoint(x,y)?.closest('[data-delivery]');
    return el && $('deliveryOrders').contains(el) ? 'order:'+el.dataset.delivery : null;
  }
  const isDeliveryTarget = target => typeof target === 'string' && target.startsWith('order:');
  function deliveryDestinationAt(x,y) { return deliveryTargetAt(x,y) ?? slotAt(x,y); }
  function deliverySelectHint() {
    return ctl()==='tapPlace' ? tr('한 색 병을 길게 누른 뒤 같은 색 탱크를 누르세요.')+'\n'+tr('짧게 누르면 조각을 넣어요.') :
      tr('한 색 병을 누른 뒤 같은 색 탱크를 누르세요.');
  }
  function deliveryReason(p) {
    if(p.reason==='empty')return deliverySelectHint();
    return tr(({mixed:'한 가지 색으로 모으면 보낼 수 있어요.',color:'병과 같은 색의 주문 탱크를 골라 주세요.',
      empty:'보낼 물이 있는 병을 먼저 고르세요.',complete:'이 색 주문은 끝났어요.',ended:'게임이 끝났어요.'})[p.reason] || '같은 색 4칸은 자동으로 납품돼요.');
  }
  function deliveryPreviewText(p) {
    return tr('{0} {1}칸 제출 · 주문 +{2} · 빈칸 +{1}',colorName(p.color),p.removed,p.accepted) +
      (p.removed > p.accepted ? tr(' · 초과 {0}칸은 사라져요',p.removed-p.accepted) : '');
  }
  const deliveryFlightUI = {
    tube:i=>isDeliveryTarget(i)?deliveryTank(+i.slice(6))?.querySelector('.delivery-liquid'):tubeEl(i),
    capacity:()=>4,
    slots:()=>Object.assign({},S.bottles,Object.fromEntries((isChainDelivery(S)?Array.from({length:S.delivery.content.colors},(_,i)=>String(i)):Object.keys(S.delivery.content.goal)).map(c=>['order:'+c,Array(4).fill(+c)])))
  };
  function extractTo(source,target,how,fromRects) {
    const color = +target.slice(6), p = previewExtract(S,source,color);
    if (!p.ok) { flash = deliveryReason(p); sharedBottleUI.reject(deliveryTank(color)); sel = how === 'drag' ? null : source; render(); return; }
    settleFlights([source]);
    const flight = sharedBottleUI.prepare(deliveryFlightUI,source,target,p,how,fromRects);
    snapshot(); sel = null;
    const first = deliveryCoachSource() >= 0;
    applyExtract(S,source,color,hooks); deliveryExtractLearned = true;
    flash = first ? tr('주문 +{0} · 병이 비었어요! 이제 조각을 넣어 보세요.',p.accepted) : deliveryPreviewText(p);
    const goalHint = deliveryGoalHint();
    if (goalHint) flash = tr('주문 +{0}',p.accepted)+'\n'+goalHint;
    lastMove = {kind:'extract',at:now()};
    commit(['extract',source,color]);
    sharedBottleUI.play(flight);
  }
  // Presentation only: use the existing pre-move snapshot and completed state.
  // Keep this outside saved state and undo history; a restored state invalidates it.
  let deliveryLastChange = '', deliveryChangeState = null;
  function recordDeliveryConsequence(action) {
    deliveryLastChange='';deliveryChangeState=null;
    if(isChainDelivery(S)){recordDeliveryChainConsequence(action);return;}
    if(!deliveryChoiceKind() || !['pour','place'].includes(action?.[0]) || !history.length)return;
    const before=JSON.parse(history[history.length-1]),cap=S.rules.cap;
    const changed=S.bottles.map((b,i)=>({index:i,before:cap-before.bottles[i].length,after:cap-b.length})).filter(x=>x.before!==x.after);
    const count=state=>state.bottles.flat().reduce((n,c)=>(n[c]=(n[c]||0)+1,n),{}),old=count(before),current=count(S);
    if(action[0]==='place')for(const c of before.piece)old[c]=(old[c]||0)+1;
    const cleared=Object.keys(old).filter(c=>old[c]>(current[c]||0));
    const orders=cleared.map(c=>Object.hasOwn(S.delivery.content.goal,c)?
      tr('{0} 자동 납품 +{1} · 남음 {2}칸',colorName(+c),S.delivery.delivered[c]-before.delivery.delivered[c],Math.max(0,S.delivery.content.goal[c]-S.delivery.delivered[c])):
      tr('{0} 자동 비움 · 주문 없음',colorName(+c))).join(' / ');
    const move=action[0]==='pour'?tr('{0}번→{1}번 붓기 · 주문 +0',action[1]+1,action[2]+1):tr('{0}번 배치 · 주문 +0',action[1]+1);
    // Describe only current engine-confirmed opportunities, never a preferred move.
    const ready=changed.map(({index:i})=>{
      const oldBottle=before.bottles[i],bottle=S.bottles[i];
      const was=previewExtract(before,i,oldBottle[0]),is=previewExtract(S,i,bottle[0]);
      if(is.ok && (!was.ok || oldBottle[0]!==bottle[0] || was.accepted!==is.accepted))
        return tr('{0}번 {1} {2}칸 제출 가능',i+1,colorName(bottle[0]),is.removed);
      if(was.ok && !is.ok && is.reason==='mixed')return tr('{0}번 혼합 상태 · 지금은 직접 제출 불가',i+1);
      return '';
    }).filter(Boolean).join(' · ');
    deliveryLastChange=[orders||(!ready?move:''),ready,tr('빈칸 {0}',changed.map(x=>tr('{0}번 {1}→{2}',x.index+1,x.before,x.after)).join(' · '))].filter(Boolean).join('\n');
    deliveryChangeState=S;flash='';
  }
  function deliveryConsequenceText() { return deliveryChangeState===S?deliveryLastChange:''; }
  function deliveryOpeningFacts() {
    if(!deliveryChoiceKind() || S.over || S.hold!==null || S.flipped || S.delivery.cursor!==1 ||
       S.delivery.delivered.some(n=>n) || JSON.stringify(S.bottles)!==JSON.stringify(S.delivery.content.bottles))return '';
    // Only the current piece, visible next piece, space and hold availability.
    const next=previewPieces(S)[0]?.piece || [],free=S.bottles.map(b=>S.rules.cap-b.length);
    return deliveryChoiceKind()==='F'?
      tr('지금 아래 {0} → 위 {1}',colorName(S.piece[0]),colorName(S.piece[1]))+'\n'+free.map((n,i)=>n?tr('{0}번 빈칸 {1}칸',i+1,n):'').filter(Boolean).join(' · '):
      tr('지금 {0}칸 · 다음 {1} {2}칸',S.piece.length,next.map(colorName).join('·'),next.length)+'\n'+
      tr('최대 빈칸 {0}칸 · {1}',Math.max(...free),tr(canHold(S)?'홀드 가능':'홀드 사용 중'));
  }
  function deliveryBottleCaption(index,free) {
    return deliveryChoiceKind()?tr('{0}번·{1}칸',index+1,free):tr('{0}칸',free);
  }
  function deliveryStatus() {
    if (S.over) return [tr(S.delivery.phase === 'won' ? '주문 완료' : '더 움직일 수 있는 병이 없어요.'),false];
    if (armed) return [tr('현재 시도를 처음부터 시작해요. 한 번 더 누르세요.'),true];
    if (sel === 'cup') return [deliveryOpeningFacts() || deliveryGoalHint() || tr('조각은 병에 넣고, 한 가지 색으로 모아 주문 탱크에 보내세요.'),false];
    const coachSource=deliveryCoachSource();
    if (coachSource >= 0 && (sel === null || sel === coachSource)) return [deliveryCoachText(coachSource),false];
    if (typeof sel === 'number') {
      const b = S.bottles[sel], p = previewExtract(S,sel,b?.[0]);
      return [p.ok ? deliveryPreviewText(p) : b?.length && !isPure(b) ? deliveryReason(p) : tr('부을 병 또는 같은 색 주문 탱크를 고르세요.'),false];
    }
    const consequence=deliveryConsequenceText(),opening=deliveryOpeningFacts();
    if(consequence)return [consequence,false];
    if(opening)return [opening,false];
    const goalHint = deliveryGoalHint();
    if (goalHint) return [goalHint,false];
    return [S.stuck ? tr('병끼리 붓거나 순수한 병을 제출해 조각이 들어갈 자리를 만드세요.') :
      ctl() === 'tapPlace' ? tr('병을 눌러 조각 넣기 · 병에서 탱크로 끌어 제출') : tr('한 색 병을 고른 뒤 같은 색 탱크를 누르세요. 4칸은 자동 납품돼요.'),false];
  }
  function deliveryGoalHint() {
    if (deliveryIndex !== 2 || S.over || S.stuck || !roomFor(S.bottles,S.piece.length,S.rules.cap)) return '';
    // Use only the same current/next pieces visible to the player, never the hidden stream.
    if (S.bottles.some((b,i)=>b.length && previewExtract(S,i,b[0]).ok)) return '';
    const remaining = Object.entries(S.delivery.content.goal).filter(([c,n])=>S.delivery.delivered[c] < n);
    if (remaining.length !== 1) return '';
    const [color,total] = remaining[0], left = total-S.delivery.delivered[color];
    if (!S.delivery.delivered[color]) return '';
    const visible = [S.piece,...previewPieces(S).map(q=>q.piece)];
    if (visible.flat().filter(c=>c===+color).length < left) return '';
    if (S.piece.includes(+color)) return tr('{0} {1}칸 남음 · 지금 조각에서 모으세요.',colorName(+color),left);
    if (visible.slice(1).some(p=>p.includes(+color))) return tr('{0} {1}칸 남음 · 지금 조각을 넣어 다음 색을 받으세요.',colorName(+color),left);
    return '';
  }
  function deliveryTimeText(ms) {
    const seconds = Math.floor(ms/1000);
    return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  }
  function syncDeliveryClock() {
    const active = isDelivery(S), overlay = !!document.querySelector('.overlay:not([hidden])');
    const blocked = active && (overlay || document.hidden || !canStore() || !!deliveryProgress.status().issue);
    document.querySelector('.app').classList.toggle('delivery-obscured',blocked);
    rack.inert = blocked; incoming.inert = blocked;
    if (!active || !deliveryClock) return;
    const timed=!deliveryPractice||isChainDelivery(S);
    deliveryClock.setRunning(!blocked && !S.over && timed);
    saveDeliveryTime(!blocked && !S.over && timed);
    if(deliveryProgress.status().issue)showDeliveryStorage();
    const elapsed = deliveryClock.sample(), thresholds = S.delivery.content.starMs;
    if(isChainDelivery(S)){renderDeliveryChainSummary();return;}
    if (deliveryPractice) {
      $('deliveryTime').textContent=tr(deliveryChoiceKind()?'누적 납품 · 별점 없는 연습':S.delivery.content.practiceOnly?'별점 없는 연습':'첫 연습 · 시간·별점 기록 없음');
      return;
    }
    const stars = deliveryStars(elapsed,thresholds);
    $('deliveryTime').textContent = tr('경과 {0}',deliveryTimeText(elapsed))+' · '+
      (stars === 1 ? tr('완료하면 1별') : tr('{0}별 기준 {1}',stars,deliveryTimeText(thresholds[stars===3?0:1])));
  }
  const deliveryOverlayWatch = new MutationObserver(syncDeliveryClock);
  document.querySelectorAll('.overlay').forEach(o=>deliveryOverlayWatch.observe(o,{attributes:true,attributeFilter:['hidden']}));
  document.addEventListener('visibilitychange',()=>{
    if (isDelivery(S) && document.hidden && !S.over) pauseDelivery();
    syncDeliveryClock();
  });
  // Registered before the shared writer-release listener; flush before relinquishing ownership.
  window.addEventListener('pagehide',()=>{
    if(isDelivery(S)){deliveryClock.setRunning(false);saveDeliveryTime(false,true);}
  });
  for (const type of ['pointerdown','pointerup','click','keydown']) document.addEventListener(type,e=>{
    syncDeliveryClock();
    if (isDelivery(S) && document.querySelector('.overlay:not([hidden])') && !e.target.closest?.('.overlay')) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  },true);
  setInterval(()=>{if(isDelivery(S))syncDeliveryClock();},100);
  function openDeliveryMenu() {
    if (!deliveryEnabled || !canStore() || isCampaign(S) || routeOpen) return;
    if(isDelivery(S)){deliveryClock.setRunning(false);saveDeliveryTime(false,true);}
    else if(!deliveryProgress.status().dirty)deliveryProgress.load();
    const saved=deliveryProgress.snapshot();
    cancelGesture(); clearFx(); sel = null;
    clearTimeout(deliveryResultTimer); deliveryResultTimer = 0;
    closeAll();
    $('deliveryStageList').textContent = '';
    deliveryMenuPage=-1;
    const journey=deliveryProgress.journey();
    $('deliveryJourneyCount').textContent=tr('{0}/{1} 클리어',journey.count,journey.total);
    $('deliveryJourneyBar').max=journey.total;$('deliveryJourneyBar').value=journey.count;
    $('deliveryJourneyBar').setAttribute('aria-label',$('deliveryJourneyCount').textContent);
    selectDeliveryPreview(journey.recommendedIndex);
    $('deliveryMenuResume').hidden = !isDelivery(S);
    $('ovDeliveryMenu').hidden = false; syncDeliveryClock();showDeliveryStorage();
  }
  function startDelivery(i,fresh=true,ready=false) {
    if (!deliveryEnabled || !canStore() || !deliveryStages[i]) return;
    if(!isDelivery(S)&&!persistRun()){storageIssue(()=>persistRun());return;}
    if(!deliveryProgress.status().loaded)deliveryProgress.load();
    if(isDelivery(S)){deliveryClock.setRunning(false);saveDeliveryTime(false,true);}
    const progress=deliveryProgress.select(i,fresh,prefs.staged);
    if(!progress.ok){showDeliveryStorage();return;}
    if (!isDelivery(S)) {
      deliveryReturn={state:S,history:history.slice(),overClosed,paceDisp,lastMove,lastTap};
    }
    cancelGesture();clearFx();stopCoach();disarm(false);closeAll();clearTimeout(deliveryResultTimer);deliveryResultTimer=0;
    const saved=deliveryProgress.snapshot();
    deliveryIndex=i;S=progress.state;deliveryClock=createDeliveryClock(now,saved.envelope.active.elapsedMs);
    deliveryPractice=saved.envelope.active.practice;deliveryLessonOffered=saved.envelope.learning.offered;deliveryExtractLearned=saved.envelope.learning.extracted;
    deliverySaveAt=now();deliverySaveRunning=false;
    history=[];sel=null;fxq=[];flash='';overClosed=false;paceDisp=null;hadSpare=false;lastMove=null;lastTap=null;
    setHeat(0);rack.classList.remove('dead');stageDirty=true;rackFitKey='';
    $('deliveryPauseTitle').dataset.stage='1';$('deliveryResume').dataset.fresh=fresh?'1':'0';
    updateDeliveryControlHint();
    $('deliveryResume').textContent=tr(fresh?'시작하기':'계속하기');
    // Keep the appendix notice visible on fresh starts, including direct next-stage entry.
    $('ovDeliveryPause').hidden=!isChainDelivery(S)&&ready&&(!fresh||deliveryProgress.journey().count>0&&!deliveryLateNotes[deliveryStages[i].id]);
    render();syncDeliveryClock();
    if(saved.issue)showDeliveryStorage();else if(S.over){$('ovDeliveryPause').hidden=true;showDeliveryResult();}
    else if($('ovDeliveryPause').hidden)focusDeliveryControls();
  }
  function focusDeliveryControls() {
    // Let the shared sheet observer release the board's inert state first.
    queueMicrotask(()=>{if(isDelivery(S)&&!S.over&&!document.querySelector('.overlay:not([hidden])'))$('deliveryPause').focus({preventScroll:true});});
  }
  function pauseDelivery() {
    if (!isDelivery(S) || S.over) return;
    cancelGesture();clearFx();sel=null;
    $('deliveryPauseTitle').dataset.stage='0';$('deliveryResume').dataset.fresh='0';
    updateDeliveryControlHint();
    $('ovDeliveryPause').hidden=false;syncDeliveryClock();
  }
  function exitDelivery() {
    if (!deliveryReturn) { $('ovDeliveryMenu').hidden=true;return; }
    deliveryClock.setRunning(false);saveDeliveryTime(false,true);
    if(deliveryProgress.status().issue){showDeliveryStorage();return;}
    restoreDeliveryReturn();
  }
  function restoreDeliveryReturn() {
    if(!deliveryReturn){closeAll();return;}
    cancelGesture();clearFx();closeAll();clearTimeout(deliveryResultTimer);deliveryResultTimer=0;
    const previous=deliveryReturn;deliveryReturn=null;deliveryClock=null;deliveryPractice=false;
    S=previous.state;history=previous.history;overClosed=previous.overClosed;paceDisp=previous.paceDisp;
    lastMove=previous.lastMove;lastTap=previous.lastTap;sel=null;fxq=[];flash='';hadSpare=!!S.spare;
    disarm(false);setHeat(0);stageDirty=true;rackFitKey='';commit();syncDeliveryClock();$('btnDelivery').focus({preventScroll:true});
  }
  function revealDeliveryResultFocus() {
    const overlay=$('ovDeliveryResult'),target=document.activeElement;
    if(overlay.hidden||!target?.matches('#ovDeliveryResult .campaign-result-actions button')||target.disabled||target.closest('[hidden],[inert]'))return;
    const rect=target.getBoundingClientRect(),sheet=overlay.querySelector('.sheet'),bounds=sheet.getBoundingClientRect();
    // Leave room for the focus outline and scroll only the result sheet.
    const top=Math.max(0,bounds.top)+6,bottom=Math.min(document.documentElement.clientHeight,bounds.bottom)-6;
    const left=Math.max(0,bounds.left)+6,right=Math.min(document.documentElement.clientWidth,bounds.right)-6;
    if(rect.top<top)sheet.scrollTop+=rect.top-top;else if(rect.bottom>bottom)sheet.scrollTop+=rect.bottom-bottom;
    if(rect.left<left)sheet.scrollLeft+=rect.left-left;else if(rect.right>right)sheet.scrollLeft+=rect.right-right;
  }
  let deliveryResultFocusQueued=false;
  function scheduleDeliveryResultFocus() {
    if($('ovDeliveryResult').hidden||deliveryResultFocusQueued)return;
    deliveryResultFocusQueued=true;
    queueMicrotask(()=>{deliveryResultFocusQueued=false;revealDeliveryResultFocus();});
  }
  window.addEventListener('resize',scheduleDeliveryResultFocus);
  window.visualViewport?.addEventListener('resize',scheduleDeliveryResultFocus);
  const deliveryResultResizeObserver=new ResizeObserver(revealDeliveryResultFocus);
  deliveryResultResizeObserver.observe($('ovDeliveryResult').querySelector('.sheet'));
  function showDeliveryResult() {
    if (!isDelivery(S) || !S.over) return;
    if(deliveryProgress.status().issue){showDeliveryStorage();return;}
    $('deliveryResultChange').textContent=deliveryConsequenceText();
    $('deliveryResultChange').hidden=!$('deliveryResultChange').textContent;
    const won=S.delivery.phase==='won', elapsed=deliveryClock.finish(), c=S.delivery.content;
    const record=deliveryProgress.snapshot().envelope.records[c.id];
    const journey=deliveryProgress.journey(deliveryIndex);deliveryNextIndex=journey.nextIndex;
    $('deliveryResultMark').hidden=!won;
    $('deliveryResultTitle').textContent=won?tr('스테이지 {0} 클리어!',deliveryIndex+1):tr('다시 준비해 보세요');
    $('deliveryResultStars').hidden=!won||deliveryPractice;
    $('deliveryResultStars').textContent=won&&!deliveryPractice?'★'.repeat(deliveryStars(elapsed,c.starMs)):'';
    $('deliveryResultStars').setAttribute('aria-label',won&&!deliveryPractice?tr('별점 {0}개',deliveryStars(elapsed,c.starMs)):tr('클리어'));
    $('deliveryResultText').textContent=!won?tr('더 움직일 수 있는 병이 없어요.'):c.practiceOnly?tr('클리어를 저장했어요. 이 판은 별점 없이 플레이해요.'):deliveryPractice?tr('연습은 시간·별점을 기록하지 않아요. 다시 도전하면 별점을 받아요.'):
      tr('이번 {0} · 최고 {1}',deliveryTimeText(elapsed),deliveryTimeText(record.bestMs));
    $('deliveryResultGoal').textContent=Object.entries(c.goal).map(([color,n])=>colorName(+color)+' '+S.delivery.delivered[color]+'/'+n).join(' · ');
    $('deliveryResultTarget').textContent=deliveryPractice?'':tr('3별 {0} / 2별 {1} · 늦어도 완료하면 1별',deliveryTimeText(c.starMs[0]),deliveryTimeText(c.starMs[1]));
    $('deliveryResultTarget').hidden=deliveryPractice;
    $('deliveryRetry').textContent=tr(deliveryPractice&&!c.practiceOnly?'별점 도전':'다시 도전');
    $('deliveryRetry').classList.toggle('primary',!won);
    $('deliveryNext').hidden=!won;
    $('deliveryNext').textContent=deliveryNextIndex<0?tr('스테이지 보기'):tr('스테이지 {0} 도전',deliveryNextIndex+1);
    $('deliveryResultProgress').textContent=journey.count===journey.total?tr('모든 스테이지 클리어!'):tr('{0}/{1} 클리어',journey.count,journey.total);
    const next=deliveryStages[deliveryNextIndex];
    $('deliveryResultNext').textContent=won&&next?tr('다음 도전')+' · '+tr(next.title)+'\n'+Object.entries(next.goal).map(([color,n])=>colorName(+color)+' '+n).join(' / '):'';
    if(won&&next&&deliveryLateNotes[next.id])$('deliveryResultNext').textContent+='\n'+tr('별점 없는 연습')+' · '+deliveryStageNote(next)+'\n'+tr(next.orders?deliveryChainPractice:deliveryLatePractice);
    $('ovDeliveryResult').querySelector('.delivery-result-body').scrollTop=0;
    $('ovDeliveryResult').hidden=false;syncDeliveryClock();
    // The shared sheet observer focuses without scrolling; reveal that button in short viewports.
    queueMicrotask(revealDeliveryResultFocus);
  }
  function renderDeliveryUi() {
    const active=isDelivery(S),app=document.querySelector('.app');app.classList.toggle('delivery',active);
    const chain=isChainDelivery(S);app.classList.toggle('delivery-chain',chain);
    $('deliveryNextOrder').hidden=!chain;
    $('cloudStatus').hidden=chain;$('routeCloudScope').hidden=chain;
    $('deliveryCloudScope').textContent=chain?tr(deliveryChainPractice)+' '+tr('이 주소의 이 브라우저에만 저장해요. 다른 기기·주소와 동기화하지 않아요.'):tr('납품 진행·별점·최고 시간은 이 브라우저에만 저장하며 구글 계정과 동기화하지 않아요.');
    app.classList.toggle('delivery-six',active && S.bottles.length === 6);
    app.classList.toggle('delivery-choice',!!deliveryChoiceKind());
    app.classList.toggle('delivery-choice-h',deliveryChoiceKind()==='H'||chain&&S.bottles.length===7);
    $('deliveryHud').hidden=!active;$('deliveryPause').hidden=!active;
    $('btnDelivery').hidden=!deliveryEnabled||isCampaign(S)||active;
    if(!active){app.classList.remove('delivery-coaching');return;}
    app.classList.add('campaign');$('campaignEntry').hidden=true;$('campaignMenu').hidden=true;$('legacyRoute').hidden=true;
    $('modeChip').textContent=tr('납품')+' '+(deliveryIndex+1);$('modeChip').setAttribute('aria-label',$('modeChip').textContent);$('modeChip').title=$('modeChip').textContent;
    $('btnMode').textContent=tr('원래 모드로');$('btnMode').setAttribute('aria-label',$('btnMode').textContent);
    if(!armed)$('btnNew').textContent=tr('다시 도전');
    $('extraRow').hidden=true;$('zoneBar').hidden=true;
    $('holdSlot').hidden=S.bottles.length<7;document.querySelector('.tray').classList.toggle('has-hold',S.bottles.length>=7);
    const container=$('deliveryOrders'),c=S.delivery.content,coachSource=deliveryCoachSource();
    container.classList.toggle('delivery-orders-multiple',(chain?c.colors:Object.keys(c.goal).length)>=3);
    container.classList.toggle('delivery-orders-cumulative',!!deliveryChoiceKind()||chain);
    app.classList.toggle('delivery-coaching',coachSource >= 0);
    if(coachSource >= 0){const source=tubeEl(coachSource);source.classList.add('delivery-coach-source');source.setAttribute('aria-describedby','status');}
    if(container.dataset.stage!==c.id){
      container.textContent='';container.dataset.stage=c.id;
      for(const color of chain?Array.from({length:c.colors},(_,i)=>String(i)):Object.keys(c.goal)){
        const button=document.createElement('button');button.type='button';button.className='delivery-order';button.dataset.delivery=color;
        const liquid=document.createElement('span');liquid.className='tube delivery-liquid';liquid.setAttribute('aria-hidden','true');
        const text=document.createElement('strong'),name=document.createElement('span'),amount=document.createElement('span'),note=document.createElement('small');
        name.className='delivery-order-name';amount.className='delivery-order-amount';text.append(name,document.createTextNode(' '),amount);
        button.append(liquid,text,note);container.append(button);
      }
    }
    const focusedTank=chain&&container.contains(document.activeElement)&&document.activeElement.matches(':focus-visible')?document.activeElement:null;
    for(const [color,n] of chain?Array.from({length:c.colors},(_,i)=>[String(i),c.goal[i]||0]):Object.entries(c.goal)){
      const button=deliveryTank(+color),done=S.delivery.delivered[color],p=typeof sel==='number'?previewExtract(S,sel,+color):{ok:false};
      // Keep shared liquid rendering; late practice orders merge cells into a cumulative meter.
      button.style.setProperty('--order-color','var(--liq'+color+')');
      const glass=paintTube(button.querySelector('.delivery-liquid'),Array(done).fill(+color),n||4);
      for(let i=done;i<n;i++){
        const empty=document.createElement('span');empty.className='delivery-empty';glass.append(empty);
      }
      button.querySelector('.delivery-order-name').textContent=colorName(+color);
      button.querySelector('.delivery-order-amount').textContent=n?done+'/'+n:'—';
      button.querySelector('small').textContent=!n?tr('이번 주문 없음'):done>=n?tr('완료'):
        (p.ok?tr('제출 +{0}',p.accepted)+' · ':'')+tr('{0}칸 남음',n-done);
      button.classList.toggle('delivery-coach-target',coachSource >= 0 && S.bottles[coachSource][0] === +color);
      button.classList.toggle('can',p.ok);button.classList.toggle('done',done>=n);button.disabled=S.over||!n;button.classList.toggle('delivery-order-inactive',!n);
      button.setAttribute('aria-label',(!n?colorName(+color)+' · '+tr('이번 주문 없음'):tr('{0}: 목표 {2}칸 중 {1}칸 납품',colorName(+color),done,n))+' · '+(p.ok?deliveryPreviewText(p):tr('주문 탱크')));
    }
    if(focusedTank?.disabled&&!S.over)focusDeliveryControls();
    syncDeliveryClock();
  }
  function updateDeliveryControlHint() {
    const choice=!!deliveryChoiceKind()||isChainDelivery(S);
    $('ovDeliveryPause').querySelector('.sheet').classList.toggle('delivery-choice-pause',choice);
    $('deliveryPauseHelp').open=!choice;
    $('deliveryPauseHelpToggle').hidden=!choice;
    $('ovDeliveryPause').querySelector('.delivery-pause-body').tabIndex=choice?0:-1;
    $('deliveryPauseHelpToggle').setAttribute('aria-expanded','false');
    $('deliveryPauseCore').hidden=!choice || $('deliveryResume').dataset.fresh!=='1' || deliveryProgress.journey().count>0;
    $('deliveryPauseBrief').hidden=!choice;
    $('deliveryPauseBrief').textContent=tr(isChainDelivery(S)?'누적 시간·진행 저장 · 별점 없음':'진행 저장 · 별점·시간 기록 없음');
    $('deliveryOpeningFacts').textContent=deliveryOpeningFacts();
    $('deliveryOpeningFacts').hidden=!$('deliveryOpeningFacts').textContent;
    $('deliveryAllGoals').hidden=!deliveryChoiceKind();
    $('deliveryPauseTitle').textContent=$('deliveryPauseTitle').dataset.stage==='1'?tr('스테이지 {0}',deliveryIndex+1)+(choice?'':' · '+tr(deliveryStages[deliveryIndex].title)):tr('잠시 쉬기');
    deliveryGoals($('deliveryPauseGoals'),isDelivery(S)?S.delivery.content:deliveryStages[deliveryIndex],isDelivery(S)?S.delivery.delivered:null);
    $('deliveryPauseNotice').textContent=deliveryStageNote(deliveryStages[deliveryIndex]);
    $('deliveryPauseNotice').hidden=!deliveryLateNotes[deliveryStages[deliveryIndex].id];
    $('deliveryRuleReminder').hidden=!!deliveryLateNotes[deliveryStages[deliveryIndex].id]&&deliveryProgress.journey().count>0;
    $('deliveryResume').textContent=tr($('deliveryResume').dataset.fresh==='1'?'시작하기':'계속하기');
    $('deliveryControlHint').textContent=ctl()==='tapPlace' ?
      tr('탱크로 끌어 제출 · 길게 누르거나 Shift+Enter로 병 선택') :
      tr('병 → 같은 색 탱크 · 드래그로도 보낼 수 있어요.');
    $('deliveryTimingHint').textContent=deliveryStages[deliveryIndex].practiceOnly ? tr('테스트 판은 시간·별점을 기록하지 않아요. 다시 도전하거나 다음 판을 골라 보세요.') : deliveryPractice ? tr('첫 연습은 시간·별점 없이 익혀요. 다음 도전부터 기록해요.') :
      tr('시작하면 생각하는 시간도 흘러요. 늦어도 완료하면 1별이에요.');
    if(deliveryLateNotes[deliveryStages[deliveryIndex].id])$('deliveryTimingHint').textContent=tr('별점 없는 연습')+' · '+tr(deliveryLatePractice);
    if(isChainDelivery(S))$('deliveryTimingHint').textContent=tr('생각하는 시간도 포함해요. 안내·일시정지·앱 이탈 중에는 멈추고, 계속하기를 누르면 다시 흘러요.')+' '+tr(deliveryChainPractice);
  }
  // A fresh tap on a tank must work even during the source bottle's click cooldown.
  // A drag release has no tank pointerdown, so its compatibility click cannot submit twice.
  let deliveryTankPress = null;
  $('deliveryOrders').addEventListener('pointerdown',e=>{
    deliveryTankPress = !gest && e.button <= 0 ? e.target.closest('[data-delivery]')?.dataset.delivery : null;
  });
  $('deliveryOrders').addEventListener('pointercancel',()=>{deliveryTankPress=null;});
  $('deliveryOrders').addEventListener('click',e=>{
    if(!isDelivery(S)||S.over)return;
    const target=e.target.closest('[data-delivery]');if(!target)return;
    const pressed=deliveryTankPress;deliveryTankPress=null;
    if(e.detail!==0 && pressed!==target.dataset.delivery)return;
    if(S.delivery.delivered[target.dataset.delivery]>=S.delivery.content.goal[target.dataset.delivery]){flash=deliveryReason({reason:'complete'});render();return;}
    if(typeof sel!=='number'){flash=deliverySelectHint();render();return;}
    extractTo(sel,'order:'+target.dataset.delivery,e.detail===0?'key':'tap');
  });
  $('btnDelivery').addEventListener('click',openDeliveryMenu);
  $('deliveryPagePrev').addEventListener('click',()=>selectDeliveryPreview((deliveryMenuPage-1)*deliveryPageSize));
  $('deliveryPageNext').addEventListener('click',()=>selectDeliveryPreview((deliveryMenuPage+1)*deliveryPageSize));
  $('deliveryStageStart').addEventListener('click',()=>startDelivery(deliveryMenuIndex,deliveryProgress.journey().activeIndex!==deliveryMenuIndex,true));
  $('deliverySavedResume').addEventListener('click',()=>{const i=deliveryProgress.journey().activeIndex;if(i>=0)startDelivery(i,false,true);});
  $('deliveryMenuClose').addEventListener('click',()=>{if(isDelivery(S)){ $('ovDeliveryMenu').hidden=true;if(S.over)showDeliveryResult();else pauseDelivery(); }else $('ovDeliveryMenu').hidden=true;});
  $('deliveryMenuResume').addEventListener('click',()=>{$('ovDeliveryMenu').hidden=true;if(S.over)showDeliveryResult();else pauseDelivery();});
  $('deliveryPauseHelpToggle').addEventListener('click',()=>{
    const help=$('deliveryPauseHelp'),open=!help.open;
    help.open=open;
    $('deliveryPauseHelpToggle').setAttribute('aria-expanded',String(open));
    if(open)help.scrollIntoView({block:'nearest'});
    else $('ovDeliveryPause').querySelector('.delivery-pause-body').scrollTop=0;
  });
  $('deliveryResume').addEventListener('click',()=>{
    $('ovDeliveryPause').hidden=true;syncDeliveryClock();render();
    focusDeliveryControls();
  });
  $('deliveryPause').addEventListener('click',pauseDelivery);
  $('deliveryList').addEventListener('click',openDeliveryMenu);
  $('deliveryResultList').addEventListener('click',openDeliveryMenu);
  $('deliveryNext').addEventListener('click',()=>{if(deliveryNextIndex<0)openDeliveryMenu();else startDelivery(deliveryNextIndex,true,true);});
  $('deliveryRetry').addEventListener('click',()=>startDelivery(deliveryIndex));
  $('deliveryExit').addEventListener('click',exitDelivery);
  $('deliveryPauseExit').addEventListener('click',exitDelivery);
  $('deliveryStorageRetry').addEventListener('click',()=>{
    const before=deliveryProgress.status().issue,result=deliveryProgress.retry();if(!result.ok){showDeliveryStorage();return;}
    $('ovDeliveryStorage').hidden=true;
    if(before==='write-failed'&&isDelivery(S)&&deliveryProgress.snapshot().state){pauseDelivery();if(S.over)showDeliveryResult();}
    else {restoreDeliveryReturn();openDeliveryMenu();}
  });
  $('deliveryStorageRecover').addEventListener('click',()=>{
    const result=deliveryProgress.restartProtected();if(!result.ok){showDeliveryStorage();return;}restoreDeliveryReturn();openDeliveryMenu();
  });
  $('deliveryStorageExit').addEventListener('click',()=>restoreDeliveryReturn());
  window.addEventListener('wss:localechange',()=>{
    updateDeliveryControlHint();
    if(!$('ovDeliveryMenu').hidden)openDeliveryMenu();
    if(!$('ovDeliveryResult').hidden)showDeliveryResult();
    if(!$('ovDeliveryStorage').hidden)showDeliveryStorage();
  });

  // Continuous-order presentation only. The existing action pipeline records moves.
  function renderDeliveryChainSummary(){
    const c=S.delivery.content,i=S.delivery.orderIndex,next=c.orders[i+1],elapsed=deliveryTimeText(deliveryClock.sample());
    $('deliveryNextOrder').textContent=next?tr('다음 주문 · {0}',Object.entries(next).map(([color,n])=>colorName(+color)+' '+n).join(' · ')):tr('마지막 주문 · 모두 채우면 클리어');
    $('deliveryNextOrder').hidden=false;
    $('deliveryTime').textContent=tr('주문 {0}/{1} · 누적 플레이 {2} · 별점 없음',i+1,c.orders.length,elapsed);
    if(S.over&&!$('ovDeliveryResult').hidden)$('deliveryResultText').textContent=tr(S.delivery.phase==='won'?'누적 플레이 {0} · 클리어 저장 · 별점 없음':'누적 플레이 {0} · 별점 없음',elapsed);
  }
  function recordDeliveryChainConsequence(action){
    if(!action||!history.length)return;
    const previous=JSON.parse(history[history.length-1]);
    const transition=previous.delivery.orderIndex!==S.delivery.orderIndex;
    if(transition)flash=tr('주문 {0}/{1} 시작 · 병과 조각은 이어져요.',S.delivery.orderIndex+1,S.delivery.content.orders.length);
    if(!['place','pour'].includes(action[0]))return;
    const clears=fxq.filter(f=>f.k==='clear');if(!clears.length)return;
    const cap=previous.rules.cap,goal=previous.delivery.content.goal;
    deliveryLastChange=clears.map(f=>{const accepted=Math.min(cap,Math.max(0,(goal[f.c]||0)-previous.delivery.delivered[f.c]));
      return accepted?tr('{0} 자동 납품 +{1}',colorName(f.c),accepted):tr('{0} {1}칸 비움 · {2}',colorName(f.c),cap,tr(goal[f.c]?'이번 주문 완료':'이번 주문 없음'));
    }).join(' / ')+(transition?tr(' · 주문 {0}/{1}',S.delivery.orderIndex+1,S.delivery.content.orders.length):'');
    deliveryChangeState=S;flash='';
  }
  // Previewing the new pack never replaces an existing active attempt.
  $('deliveryChainEntry').addEventListener('click',()=>selectDeliveryPreview(65));
