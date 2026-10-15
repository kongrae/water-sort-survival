// Shared route renderer and input. State transitions and persistence belong to the host.
(function(global){
'use strict';
function createRouteView(options){
 const root=options.root,prefix=options.prefix||'', $=id=>root.querySelector('#'+prefix+id);
 const Route=options.Route,stages=options.stages,guides=options.guides||null;
 const tr=options.translate||((key,...args)=>key.replace(/\{(\d+)\}/g,(_,i)=>args[Number(i)]??''));
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const html=(key,...args)=>esc(tr(key,...args));
 const names=['빨강','파랑','노랑','초록','보라','주황','청록','분홍','갈색','은색','라임','남색','살구'];
 const symbols=['●','■','▲','◆','★','✚','♥','♣','✿','≋','✦','◐','≡'];
 let stage,state,selected=null,previewTarget=null,busy=false,pulse=[],drag=null,suppressClickUntil=0,focusNode=null,hintOpen=false,timer=null,gateLinksOpen=false,announcement=null,lessonStage=null;
 let controls=null,input=null;
 const bottles=options.bottleUI;
 root.classList.toggle('shared-bottles',!!bottles);
 function fitBottles(){
   if(!bottles)return;const height=$('nodes').getBoundingClientRect().height;
   root.querySelectorAll('[data-node].tube').forEach(el=>{
     const cap=Number(el.style.getPropertyValue('--cap')),box=Math.max(58,height*(el.classList.contains('outlet')?0.16:0.232));
     const rim=parseFloat(getComputedStyle(el).getPropertyValue('--rim-h'))||6;
     el.style.setProperty('--lh',Math.max(6,Math.min(30,(box-33-rim)/cap))+'px');
   });
 }
 const reduced=()=>options.preferences().reduceFx===true||matchMedia('(prefers-reduced-motion: reduce)').matches;
 function setHelp(open){
   if(open){controls?.cancel();bottles?.clear();}
   $('helpPanel').hidden=!open;$('helpToggle').setAttribute('aria-expanded',String(open));
   root.querySelector('.route-scroll').inert=open;
   for(const id of ['undo','restart','cancel'])$(id).inert=open;
   (open?$('helpClose'):$('helpToggle')).focus({preventScroll:true});
 }
  const color = c => `var(--liq${c})`;
  const outletName = o => stage.outlets.filter(p=>p.color===o.color).length>1 ? tr("{0} ({1}칸)",tr(names[o.color]),o.demand) : tr(names[o.color]);
  const outletShortName = o => tr(names[o.color]);
  const hasGates = () => stage.edges.some(e=>e.gated);
  const label = id => stage.outlets.find(o => o.id === id) ? tr("{0} 도착지",outletName(stage.outlets.find(o => o.id === id))) : hasGates() && id === stage.gate.tank ? tr("{0} 제어 탱크",id) : tr("{0} 탱크",id);
  const layout = () => {
    if(stage.layout)return Object.fromEntries(Object.entries(stage.layout).map(([id,p])=>[id,[p.x*600,p.y*560]]));
    const points = {A:[85,85],B:[300,85],C:[515,85],K:[175,265],J:[425,265],P:[75,470],R:[425,470],'B-out':[245,470],G:[545,470]};
    if (stage.id === 'B-release') { points.A=[130,85];points.B=[465,85];points.R=[425,470];points['B-out']=[175,470]; }
    if (stage.id === 'A-retain') points['B-out']=[175,470];
    return points;
  };
  function say(key,error=false,...args) { announcement={key,error,args};$('message').textContent=tr(key,...args);$('message').classList.toggle('error',error);root.classList.toggle('has-error',error); }
  const reasons={
    'gate-closed':'수문이 닫혀 있어요. K에 파랑만 2칸 이상 필요해요.',
    'not-connected':'두 지점을 직접 잇는 화살표가 없어요. 다른 탱크를 건너뛸 수 없어요.',
    'empty-source':'이 탱크는 비어 있어요.', 'tank-full':'도착 탱크에 빈칸이 없어요.',
    'outlet-full':'이 도착지의 목표는 이미 달성했어요.',
    'color-mismatch':'맨 위 색이 맞지 않아요. 빈 탱크나 같은 색 탱크로 보내세요. 도착지는 지정 색만 받아요.',
    'attempt-complete':'클리어한 판이에요. 다시 시작하면 새 시도로 도전할 수 있어요.',
    'no-history':'되돌릴 이동이 없어요.'
  };
  const reasonText = reason => tr(reasons[reason]||"이 이동은 할 수 없어요.");
  function previewText(r) {
    if (!r.ok) return reasonText(r.reason);
    const change = r.gateBefore === r.gateAfter ? (r.gateAfter?tr("수문 유지"):tr("수문 닫힘 유지")) : (r.gateAfter?tr("수문 열림"):tr("수문 닫힘"));
    return `${tr("{0} {1}칸",tr(names[r.color]),r.moved)}${hasGates()?" · "+change:""}${r.won?" · "+tr("모든 목표 달성"):""}`;
  }
  function showPreview(id) {
    if (!selected || busy || options.blocked?.() || state.phase === 'won') return;
    previewTarget=id;
    const r=Route.previewMove(stage,state,[selected,id]);
    $('preview').textContent=`${selected} → ${label(id)}: ${previewText(r)}`;
    root.querySelectorAll('.node').forEach(el => el.classList.toggle('preview',el.dataset.node===id));
  }
  function render() {
    const session=options.snapshot();stage=session.stage;state=session.state;if(!state)return;
    const active=document.activeElement;
    root.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=tr(el.dataset.i18n));
    root.querySelectorAll('[aria-label]').forEach(el=>{if(!el.dataset.node){el.dataset.i18nAria??=el.getAttribute('aria-label');el.setAttribute('aria-label',tr(el.dataset.i18nAria));}});
    if(announcement){$('message').textContent=tr(announcement.key,...announcement.args);$('message').classList.toggle('error',announcement.error);}
    for(const [i,option] of [...$('stageSelect').options].entries())option.textContent=`${i+1}. ${tr(stages[i].title)}`;
    const prefs=options.preferences();$('symbols').checked=prefs.symbols===true;$('reduce').checked=prefs.reduceFx===true;
    const locked=busy||options.blocked?.()===true;
    const activeId=active?.dataset.node || active?.dataset.target || focusNode;
    const status=Route.status(stage,state), points=layout();
    const moves=Route.availableMoves(stage,state).moves;
    const guided=!!guides&&stages.indexOf(stage)===0&&state.phase!=='won';
    const suggestion=guided?(selected?moves.find(r=>r.from===selected):['A','J','B','K'].map(id=>moves.find(r=>r.from===id)).find(Boolean)):null;
    $('stageName').textContent=`${stages.indexOf(stage)+1}. ${tr(stage.title)}`;
    $('coach').textContent=state.phase==='won'?tr(stages.indexOf(stage)===stages.length-1?"모든 목표를 달성했어요.":"성공! 다음 스테이지로 가 보세요."):selected&&!moves.some(r=>r.from===selected)?tr("이 탱크에서 지금 보낼 수 있는 곳이 없어요. 다른 탱크를 고르거나 되돌려 보세요."):selected?
      (suggestion?tr("② 빛나는 {0}를 누르세요.",label(suggestion.to)):tr("{0} 선택 · 빛나는 곳을 누르세요.",label(selected))):
      (suggestion?tr("① {0}를 누르세요.",label(suggestion.from)):tr("보낼 물이 있는 탱크를 누르세요."));
    const lesson=guides?.lessons[stages.indexOf(stage)];
    $('lesson').hidden=!lesson;
    if(lesson){
      if(lessonStage!==stage.id){$('lesson').open=lesson.automatic;lessonStage=stage.id;}
      const cue=RouteGuidance.current(stage,state,lesson);
      if(!guided&&!selected&&lesson.automatic&&state.phase!=='won')$('coach').textContent=tr(cue.text);
      $('lessonTitle').textContent=`${stages.indexOf(stage)+1} / ${stages.length} · ${tr(stage.title)}`;
      $('lessonIntro').textContent=tr(lesson.intro);
      $('lessonHint').textContent=tr(cue.text);$('lessonHint').dataset.cue=cue.id;
      $('lessonHint').hidden=!(lesson.automatic||hintOpen||state.phase==='won');
      $('guideToggle').hidden=lesson.automatic||state.phase==='won';
      $('guideToggle').textContent=hintOpen?tr("힌트 접기"):tr("힌트 보기");
      $('guideToggle').setAttribute('aria-expanded',String(hintOpen));
    }
    $('moves').textContent=state.moves;
    $('stageSelect').value=String(stages.indexOf(stage));
    $('gatePanel').hidden=!hasGates();$('gateRule').hidden=!hasGates();$('gateLegend').hidden=!hasGates();
    const blue=state.bottles.flat().filter(c=>c===stage.gate.color).length;
    $('gate').textContent=tr("{0} · K에 파랑만 2칸 이상 · 남은 파랑 {1}칸",status.gateOpen?tr("▯ 수문 열림"):tr("× 수문 닫힘"),blue);
    $('gateToggle').textContent=gateLinksOpen?tr("수문 연결 접기"):tr("수문 연결 보기");
    $('gateToggle').setAttribute('aria-expanded',String(gateLinksOpen));$('gateLinks').hidden=!gateLinksOpen;
    $('gateLinks').textContent=tr("K가 제어하는 길: {0}",stage.edges.filter(e=>e.gated).map(e=>e.from+' → '+label(e.to)).join(', '));
    root.classList.toggle('show-gates',gateLinksOpen);
    $('goals').classList.toggle('many-goals',stage.outlets.length>3);
    $('goals').innerHTML=stage.outlets.map((o,i)=>`<div class="goal ${state.delivered[i]===o.demand?'done':''}"><span class="dot" style="background:${color(o.color)}"></span><div><small>${html("{0} 도착지",outletName(o))}</small><strong>${state.delivered[i]} / ${o.demand}</strong></div></div>`).join('');
    const destinationMoves=moves.filter(r=>r.from===selected);
    $('nodes').innerHTML=stage.tankIds.map((id,i)=>{
      const b=state.bottles[i], [x,y]=points[id], ctrl=hasGates()&&id===stage.gate.tank;
      const description=b.length?b.slice().reverse().map(c=>tr(names[c])).join(", "):tr("비어 있음");
      const cue=suggestion&&(selected?suggestion.to===id:suggestion.from===id);
      return `<button class="node ${ctrl?'controller':''} ${selected===id?'selected':''} ${destinationMoves.some(r=>r.to===id)?'possible':''} ${pulse.includes(id)?'pulse':''} ${cue?(selected?'coach-target':'coach-source'):''}" data-node="${id}" style="left:${x/6}%;top:${y/5.6}%" aria-label="${html("{0}, 위에서부터 {1}, {2}/4칸",label(id),description,b.length)}" aria-pressed="${selected===id}" ${hasGates()&&(ctrl||stage.edges.some(e=>e.gated&&(e.from===id||e.to===id)))?`aria-describedby="${prefix}gate"`:""} ${locked?'disabled':''}><span class="label">${id}</span><span class="vessel">${b.map(c=>`<span class="layer" style="--water:${color(c)}">${$('symbols').checked?`<span class="symbol">${symbols[c]}</span>`:''}</span>`).join('')}</span><span class="type">${ctrl?html("제어"):b.length+" / 4"}</span>${cue?`<span class="cue-tag" aria-hidden="true">${selected?'②':'①'}</span>`:''}</button>`;
    }).join('')+stage.outlets.map((o,i)=>{
      const [x,y]=points[o.id], complete=state.delivered[i]===o.demand;
      const cue=selected&&suggestion?.to===o.id;
      return `<button class="node outlet ${complete?'complete':''} ${destinationMoves.some(r=>r.to===o.id)?'possible':''} ${pulse.includes(o.id)?'pulse':''} ${cue?'coach-target':''}" data-node="${o.id}" style="left:${x/6}%;top:${y/5.6}%" aria-label="${html("{0}, {1}/{2}칸",label(o.id),state.delivered[i],o.demand)}" ${locked?'disabled':''}><span class="dot" style="background:${color(o.color)}"></span><span class="label">${esc(outletShortName(o))}</span><span class="quantity">${state.delivered[i]}/${o.demand}</span>${cue?'<span class="cue-tag" aria-hidden="true">②</span>':''}</button>`;
    }).join('');
    if(bottles){
      root.querySelectorAll('[data-node]').forEach(el=>{
        const id=el.dataset.node,index=stage.tankIds.indexOf(id),out=stage.outlets.find(o=>o.id===id);
        const layers=index>=0?state.bottles[index]:Array(state.delivered[stage.outlets.indexOf(out)]).fill(out.color),cap=index>=0?4:out.demand;
        const title=el.querySelector('.label'),quantity=el.querySelector('.type,.quantity'),cue=el.querySelector('.cue-tag'),dot=el.querySelector('.dot');
        el.classList.add('tube');el.classList.toggle('sel',selected===id);
        bottles.paint(el,layers,cap);if(dot)title.prepend(dot);el.prepend(title);el.append(quantity);if(cue)el.append(cue);
        const move=destinationMoves.find(r=>r.to===id);if(move)bottles.ghost(el,move.color,move.moved);
      });
      fitBottles();
    }
    const defs=`<defs><marker id="${prefix}arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>`;
    $('paths').innerHTML=defs+stage.edges.map((e,i)=>{
      const [sx,sy]=points[e.from], [tx,ty]=points[e.to], up=ty<sy;
      const siblings=stage.edges.filter(f=>f.from===e.from), port=(siblings.indexOf(e)-(siblings.length-1)/2)*19;
      const x1=sx+port,y1=sy+(up?-65:65),x2=tx,y2=ty+(up?65:-(stage.tankIds.includes(e.to)?65:46));
      const mid=(y1+y2)/2+(i%3-1)*9;
      const d=`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
      const active=selected===e.from, usable=destinationMoves.some(r=>r.to===e.to), closed=e.gated&&!status.gateOpen;
      return `<path class="edge ${closed?'closed':''} ${e.gated?'gated':''} ${selected&&!active?'dim':''} ${active&&usable&&!closed?'active':''}" data-edge="${e.from}:${e.to}" d="${d}" marker-end="url(#${prefix}arrow)"/>${e.gated?`<g class="gate-mark ${status.gateOpen?'open':''}" opacity="${selected&&!active?.2:1}" transform="translate(${(x1+x2)/2},${mid})"><rect x="-22" y="-13" width="44" height="26" rx="4"/><text>K ${status.gateOpen?'▯':'×'}</text></g>`:''}`;
    }).join('');
    $('choices').innerHTML=selected?(destinationMoves.length?destinationMoves.map(r=>`<button data-target="${r.to}" ${locked?'disabled':''}><strong>${esc(selected)} → ${esc(label(r.to))}</strong>${esc(previewText(r))}</button>`).join(''):`<span class="hint">${html("이 탱크에서 지금 보낼 수 있는 곳이 없어요. 다른 탱크를 고르거나 되돌려 보세요.")}</span>`):`<span class="hint">${hasGates()?html("탱크를 고르면 보낼 물량과 수문 변화를 볼 수 있어요."):html("탱크를 고르면 보낼 물량을 볼 수 있어요.")}</span>`;
    $('preview').textContent='';previewTarget=null;
    $('undo').disabled=locked||!status.canUndo;$('undo').textContent=`${tr("되돌리기")}${state.history.length?" ("+state.history.length+")":""}`;
    $('restart').disabled=locked;$('cancel').disabled=locked||!selected;$('stageSelect').disabled=locked;
    for(const option of $('stageSelect').options)option.disabled=Number(option.value)>=(session.unlocked??stages.length);
    $('clear').hidden=state.phase!=='won';
    $('next').disabled=locked;
    $('clearText').textContent=tr("{0}수로 모든 도착지 목표를 달성했습니다.",state.moves);
    $('next').textContent=options.lastNextLabel&&stages.indexOf(stage)===stages.length-1?tr(options.lastNextLabel):guides?(stages.indexOf(stage)===stages.length-1?tr("1번부터 다시 도전"):tr("다음 스테이지")):(stages.indexOf(stage)===stages.length-1?tr("첫 검증 판으로"):tr("다음 검증 판"));
    root.dataset.reduce=String(reduced());
    if (status.blocked) say('지금 가능한 이동이 없어요. 되돌리기나 다시 시작으로 다른 순서를 시도하세요.',true);
    if(!busy&&activeId) { root.querySelector(`[data-node="${activeId}"]`)?.focus({preventScroll:true});focusNode=null; }
    controls?.reapply();
  }
  function chooseSource(id) {
    selected=id;render();const canSend=Route.availableMoves(stage,state).moves.some(r=>r.from===id);
    if(canSend)say("빛나는 곳을 누르면 물을 보내요.");
    else say("이 탱크에서 지금 보낼 수 있는 곳이 없어요. 다른 탱크를 고르거나 되돌려 보세요.",true);
    return canSend;
  }
  function commit(from,to,how='tap',fromRects) {
    if (busy||options.blocked?.()) return;
    const preview=Route.previewMove(stage,state,[from,to]);
    const flight=preview.ok&&bottles?bottles.prepare(input,from,to,preview,how,fromRects):null;
    const result=options.dispatch('move',[from,to]);
    if (!result.ok) { say(reasons[result.reason]||"이 이동은 할 수 없어요.",true);showPreview(to);if(bottles)bottles.reject(input.tube(to));return; }
    focusNode=to;state=result.state;selected=null;pulse=bottles?[]:[from,to];busy=!bottles&&!reduced();render();
    if(bottles)bottles.play(flight);
    say(result.won?'모든 목표를 달성했어요.':'물을 옮겼어요.');
    if(Route.status(stage,state).blocked) say('지금 가능한 이동이 없어요. 되돌리기나 다시 시작으로 다른 순서를 시도하세요.',true);
    // The lock prevents a second input during the same transfer's visual feedback.
    if (busy) timer=setTimeout(()=>{busy=false;pulse=[];render();if(state.phase==='won'&&root.getClientRects().length)$('next').focus();},220);
    else { pulse=[];if(state.phase==='won')$('next').focus(); }
  }
  function activate(id) {
    if (busy||options.blocked?.()) return;
    if (state.phase==='won') { say(reasons['attempt-complete']);return; }
    if (selected===id) { selected=null;render();say('선택을 해제했습니다.');return; }
    if (selected) {
      const preview=Route.previewMove(stage,state,[selected,id]);
      if(!preview.ok&&stage.tankIds.includes(id)&&state.bottles[stage.tankIds.indexOf(id)].length){if(chooseSource(id))say('출발 탱크를 바꿨어요. 빛나는 곳을 누르세요.');return;}
      commit(selected,id);return;
    }
    if (!stage.tankIds.includes(id)) { say('물을 보낼 출발 탱크를 먼저 골라 주세요.');return; }
    if (!state.bottles[stage.tankIds.indexOf(id)].length) { say(reasons['empty-source'],true);return; }
    chooseSource(id);
  }
  function reset(index) { const result=options.select(index);if(!result.ok)return;clearTimeout(timer);busy=false;selected=null;pulse=[];drag=null;hintOpen=false;$('stageSelect').value=String(index);render();say('모든 물을 같은 색 도착지로 보내세요.'); }
  $('gateToggle').addEventListener('click',()=>{gateLinksOpen=!gateLinksOpen;render();});
  $('guideToggle').addEventListener('click',()=>{hintOpen=!hintOpen;render();$('guideToggle').focus({preventScroll:true});});
  if(bottles){
    input={
      blocked:()=>!state||state.phase==='won'||!!options.blocked?.()||!$('helpPanel').hidden||!root.getClientRects().length,
      slots:()=>Object.fromEntries([...stage.tankIds.map((id,i)=>[id,state.bottles[i]]),...stage.outlets.map((o,i)=>[o.id,Array(state.delivered[i]).fill(o.color)])]),
      capacity:id=>stage.outlets.find(o=>o.id===id)?.demand||4,
      tube:id=>root.querySelector('[data-node="'+id+'"]'),canSource:id=>stage.tankIds.includes(id),
      preview:(from,to)=>Route.previewMove(stage,state,[from,to]),
      select:id=>{selected=id;},render,tap:activate,pick:chooseSource,pour:commit,
      longPress:()=>false,notice:()=>{}
    };
    controls=bottles.bind($('board'),input);
    new ResizeObserver(fitBottles).observe($('board'));
  }else $('nodes').addEventListener('click',e=>{const node=e.target.closest('[data-node]');if(node&&!drag&&(e.detail===0||performance.now()>=suppressClickUntil))activate(node.dataset.node);});
  $('choices').addEventListener('click',e=>{const b=e.target.closest('[data-target]');if(b&&selected)commit(selected,b.dataset.target);});
  for (const event of ['pointerover','focusin']) {
    $('nodes').addEventListener(event,e=>{const node=e.target.closest('[data-node]');if(node&&node.dataset.node!==selected)showPreview(node.dataset.node);});
    $('choices').addEventListener(event,e=>{const b=e.target.closest('[data-target]');if(b)showPreview(b.dataset.target);});
  }
  // Drag is the same action as two taps. Pointer cancellation never sends water.
  if(!bottles)$('board').addEventListener('pointerdown',e=>{
    const node=e.target.closest('[data-node]');if(busy||options.blocked?.()||drag||!e.isPrimary||e.button!==0||!node)return;
    // A fresh primary press is not the residual click from a cancelled gesture.
    suppressClickUntil=0;
    if(!stage.tankIds.includes(node.dataset.node)||state.phase==='won')return;
    drag={id:node.dataset.node,x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false};
  });
  if(!bottles)$('board').addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>10){if(!drag.moved){drag.moved=true;selected=drag.id;render();}if(!$('board').hasPointerCapture(e.pointerId))$('board').setPointerCapture(e.pointerId);}});
  if(!bottles)$('board').addEventListener('pointerup',e=>{
    if(!drag||drag.pointer!==e.pointerId)return;const d=drag;drag=null;
    if($('board').hasPointerCapture(e.pointerId))$('board').releasePointerCapture(e.pointerId);
    if(!d.moved)return;suppressClickUntil=performance.now()+350;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-node]');
    if(target&&root.contains(target)&&target.dataset.node!==d.id)commit(d.id,target.dataset.node);else {cancelInput();render();say('드래그를 취소했습니다.');}
  });
  function cancelInput(announce=false) {
    controls?.cancel();
    const interrupted=!!(drag||selected),pointer=drag?.pointer;drag=null;selected=null;previewTarget=null;
    if(pointer!==undefined&&$('board').hasPointerCapture(pointer))$('board').releasePointerCapture(pointer);
    if(interrupted)suppressClickUntil=performance.now()+350;
    if(announce){render();say('선택을 해제했습니다.');}
  }
  if(!bottles)$('board').addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId)cancelInput(true);});
  if(!bottles)$('board').addEventListener('lostpointercapture',e=>{if(drag?.pointer===e.pointerId)cancelInput(true);});
  const interrupt=()=>{if(root.getClientRects().length&&(drag||selected))cancelInput(true);};
  addEventListener('blur',interrupt);addEventListener('resize',interrupt);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupt();});
  $('undo').addEventListener('click',()=>{if(busy)return;controls?.cancel();bottles?.clear();const r=options.dispatch('undo');if(r.ok){state=r.state;selected=null;render();say('직전 이동의 물과 목표, 수문을 복원했어요.');}});
  $('restart').addEventListener('click',()=>{if(busy)return;controls?.cancel();bottles?.clear();const r=options.dispatch('restart');if(r.ok){state=r.state;selected=null;hintOpen=false;render();say('같은 판을 새 시도로 시작했습니다.');}});
  $('cancel').addEventListener('click',()=>cancelInput(true));
  root.addEventListener('keydown',e=>{
    if(!$('helpPanel').hidden){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setHelp(false);}
      if(e.key==='Tab'){
        const items=[...$('helpPanel').querySelectorAll('button,input,select,summary')].filter(el=>!el.disabled&&el.getClientRects().length),first=items[0],last=items.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
      return;
    }
    if(e.key==='Escape'&&!busy&&(selected||drag)){e.preventDefault();e.stopPropagation();cancelInput(true);}
  });
  $('helpToggle').addEventListener('click',()=>setHelp($('helpPanel').hidden));
  $('helpClose').addEventListener('click',()=>setHelp(false));
  $('stageSelect').addEventListener('change',()=>reset(Number($('stageSelect').value)));
  $('next').addEventListener('click',()=>{if(!busy&&!options.blocked?.()){options.next();selected=null;hintOpen=false;render();}});
  for(const id of ['symbols','reduce'])$(id).addEventListener('change',()=>{options.setPreferences({[id==='symbols'?'symbols':'reduceFx']:$(id).checked});render();say('표시 설정을 적용했습니다.');});

 $('stageSelect').innerHTML=stages.map((s,i)=>`<option value="${i}">${i+1}. ${s.title}</option>`).join('');
 if(guides)$('stageSelect').setAttribute('aria-label','스테이지 선택');
 const cancel=()=>{clearTimeout(timer);busy=false;cancelInput();bottles?.clear();pulse=[];hintOpen=false;gateLinksOpen=false;announcement=null;$('helpPanel').hidden=true;$('helpToggle').setAttribute('aria-expanded','false');root.querySelector('.route-scroll').inert=false;for(const id of ['undo','restart','cancel'])$(id).inert=false;};
 return Object.freeze({render,reset,cancel,say});
}
if(typeof module==='object'&&module.exports)module.exports=createRouteView;else global.createRouteView=createRouteView;
})(typeof globalThis!=='undefined'?globalThis:this);
