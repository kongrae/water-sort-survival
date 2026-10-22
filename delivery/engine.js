// Included inside script#engine. Bottle actions remain shared with endless.
function isDelivery(S) { return !!S && S.mode === 'delivery' && !!S.delivery; }
function isChainDelivery(S) { return isDelivery(S) && Array.isArray(S.delivery.content.orders); }
function newDelivery(content) {
  const c = JSON.parse(JSON.stringify(content)), color = n => Number.isInteger(n) && n >= 0 && n < c.colors;
  if (!c.id || ![6,7].includes(c.bottles?.length) || ![3,4].includes(c.colors) ||
      c.bottles.some(b => !Array.isArray(b) || b.length > 4 || !b.every(color) || (b.length === 4 && isPure(b))) ||
      !Array.isArray(c.stream) || c.stream.length < 3 || c.stream.some(p => !Array.isArray(p) || p.length < 1 || p.length > 2 || !p.every(color)) ||
      !c.goal || !Object.keys(c.goal).length || Object.entries(c.goal).some(([k,n]) => !color(+k) || !Number.isInteger(n) || n < 1 || !c.stream.some(p => p.includes(+k)))) throw Error('Invalid delivery stage');
  if(c.orders!==undefined&&(!c.practiceOnly||!Array.isArray(c.orders)||c.orders.length<2||c.orders.length>16||
    c.orders.some(goal=>!goal||!Object.keys(goal).length||Object.entries(goal).some(([k,n])=>!color(+k)||!Number.isInteger(n)||n<1||!c.stream.some(p=>p.includes(+k))))||
    JSON.stringify(c.goal)!==JSON.stringify(c.orders[0])))throw Error('Invalid continuous orders');
  const rules = sanitizeRules({bottles:c.bottles.length,cap:4,startColors:c.colors,maxColors:c.colors,colorEvery:0,
    pieceMin:1,pieceMax:2,preview:2,pourLimit:0,autoMerge:false,comboPlace:true,flip:true,flipLimit:2,
    zones:false,zoneTwin:false,spare:false,expansion:1,growthTable:[{score:0,colors:c.colors,bottles:c.bottles.length}],holdVersion:1,holdBottles:7});
  const S = newState('delivery', c.id, rules);
  S.bottles = c.bottles.map(b => b.slice());
  S.growth = {activeColors:c.colors,generation:0,queue:[],pendingIntro:[],pieceIntro:-1,log:[]};
  S.delivery = {content:c,cursor:0,delivered:Array(c.colors).fill(0),phase:'playing'};
  S.undoLeft = 3; S.undoUsed = 0;
  advanceDeliveryPiece(S); checkDelivery(S);
  return S;
}
function advanceDeliveryPiece(S) {
  const d = S.delivery, stream = d.content.stream;
  S.piece = stream[d.cursor++ % stream.length].slice();
  S.growth.pieceIntro = -1;
  S.growth.queue = [0,1].map(i => ({piece:stream[(d.cursor+i)%stream.length].slice(),intro:-1}));
}
function creditDelivery(S, color, removed, hooks, source, kind) {
  const d = S.delivery, accepted = Math.min(removed, Math.max(0,(d.content.goal[color] || 0)-d.delivered[color]));
  d.delivered[color] += accepted;
  if (hooks?.delivery && accepted) hooks.delivery({color,removed,accepted,source,kind});
  return accepted;
}
function previewExtract(S, source, color) {
  if (!isDelivery(S) || S.over) return {ok:false,reason:'ended'};
  const b = S.bottles[source];
  if (!b?.length) return {ok:false,reason:'empty'};
  if (!isPure(b)) return {ok:false,reason:'mixed'};
  if (b[0] !== color) return {ok:false,reason:'color'};
  const remaining = (S.delivery.content.goal[color] || 0)-S.delivery.delivered[color];
  if (remaining <= 0) return {ok:false,reason:'complete'};
  if (b.length >= S.rules.cap) return {ok:false,reason:'full'};
  return {ok:true,color,moved:b.length,removed:b.length,accepted:Math.min(b.length,remaining)};
}
function applyExtract(S, source, color, hooks) {
  const p = previewExtract(S, source, color);
  if (!p.ok) return false;
  S.bottles[source].length = 0;
  creditDelivery(S,color,p.removed,hooks,source,'extract');
  checkDelivery(S);
  return true;
}
function checkDelivery(S) {
  if (S.over) return;
  const d = S.delivery;
  if(isChainDelivery(S)&&d.orderIndex===undefined)d.orderIndex=0;
  if (Object.entries(d.content.goal).every(([c,n]) => d.delivered[c] >= n)) {
    if(isChainDelivery(S)&&d.orderIndex<d.content.orders.length-1){
      d.orderIndex++;d.content={...d.content,goal:d.content.orders[d.orderIndex]};
      d.delivered=Array(d.content.colors).fill(0);S.over=false;S.overReason=null;S.stuck=null;checkDelivery(S);return;
    }
    d.phase = 'won'; S.over = true; S.overReason = 'delivery-win'; S.stuck = null; return;
  }
  S.stuck = null;
  if (roomFor(S.bottles,S.piece.length,S.rules.cap)) return;
  // Only prove an immediate dead end. A reversible pour loop is unknown, not failure.
  const extract = S.bottles.some((b,i) => b.length && previewExtract(S,i,b[0]).ok);
  const pour = S.bottles.some((_,i) => S.bottles.some((_,j) => canPour(S.bottles,i,j,S.rules.cap)));
  if (!extract && !pour && !canHold(S) && !canFlip(S)) {
    d.phase = 'lost'; S.over = true; S.overReason = 'delivery-blocked';
  } else S.stuck = 'delivery-space';
}
function deliveryStars(milliseconds, thresholds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 1;
  return milliseconds <= thresholds[0] ? 3 : milliseconds <= thresholds[1] ? 2 : 1;
}
// UI owns this clock, outside undo snapshots. All calls use performance.now().
function createDeliveryClock(readNow, initialMs = 0) {
  let elapsed = Number.isFinite(initialMs) && initialMs >= 0 ? initialMs : 0, last = readNow(), running = false, finished = false;
  function sample() { const at = readNow(); if (running && !finished) elapsed += Math.max(0,at-last); last = at; return elapsed; }
  return {sample, setRunning(value) { sample(); running = !!value && !finished; },
    finish() { sample(); finished = true; running = false; return elapsed; }};
}
