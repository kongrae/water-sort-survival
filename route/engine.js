// Single route-v1 rule implementation for the browser and offline tools.
// The existing game's pure pouring primitives and a SHA-256 function are injected.
(function (root) {
  'use strict';
  function createRouteEngine(core, hashText) {
    if (!core || !['canPour', 'doPour', 'topSeg'].every(k => typeof core[k] === 'function') || typeof hashText !== 'function') {
      throw new Error('Route engine requires pouring primitives and SHA-256');
    }
    const RULES_VERSION = 'route-v1', SCHEMA = 1, HISTORY_LIMIT = 100;
    const prepared = new WeakSet(), trustedStates = new WeakMap();
    const clone = value => JSON.parse(JSON.stringify(value));
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const dense = value => Array.isArray(value) && Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i)).every(Boolean);
    const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
    const freeze = value => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value);
      }
      return value;
    };
    const onlyKeys = (obj, allowed) => Object.keys(obj).every(k => allowed.includes(k));
    function definitionErrors(raw, requireHash = true) {
      const errors = [], add = (field, code) => errors.push({ field, code });
      if (!record(raw)) return [{ field: 'stage', code: 'object-required' }];
      if (!onlyKeys(raw, ['schema','id','rulesVersion','contentVersion','contentHash','capacity','tankIds','initial','outlets','gate','edges','title','description','layout'])) add('stage','unknown-field');
      if (raw.schema !== SCHEMA) add('schema','unsupported');
      if (!id(raw.id)) add('id','invalid-id');
      if (raw.rulesVersion !== RULES_VERSION) add('rulesVersion','unsupported');
      if (!id(raw.contentVersion)) add('contentVersion','invalid-version');
      if (requireHash && (typeof raw.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.contentHash))) add('contentHash','sha256-required');
      if (raw.capacity !== 4) add('capacity','unsupported');
      const tanksOK = dense(raw.tankIds) && integer(raw.tankIds.length,4,6) && raw.tankIds.every(id) && new Set(raw.tankIds).size === raw.tankIds.length;
      if (!tanksOK) add('tankIds','invalid-tanks');
      const initialOK = tanksOK && dense(raw.initial) && raw.initial.length === raw.tankIds.length && raw.initial.every(b => dense(b) && b.length <= 4 && b.every(c => integer(c,0,12)));
      if (!initialOK) add('initial','invalid-layers');
      const outletsOK = dense(raw.outlets) && integer(raw.outlets.length,2,6) && raw.outlets.every(o => record(o) && onlyKeys(o,['id','color','demand']) && id(o.id) && integer(o.color,0,12) && integer(o.demand,1,24));
      if (!outletsOK) add('outlets','invalid-outlets');
      const nodesOK = tanksOK && outletsOK && new Set([...raw.tankIds,...raw.outlets.map(o => o.id)]).size === raw.tankIds.length + raw.outlets.length;
      if (tanksOK && outletsOK && !nodesOK) add('outlets','duplicate-node-id');
      if (initialOK && outletsOK) {
        const counts = Array(13).fill(0), demands = Array(13).fill(0);
        raw.initial.flat().forEach(c => counts[c]++); raw.outlets.forEach(o => demands[o.color] += o.demand);
        if (!integer(counts.filter(n => n > 0).length,2,3)) add('initial','color-count');
        if (counts.some((n,c) => n !== demands[c])) add('outlets','mass-mismatch');
        if (counts[1] < 2) add('gate','insufficient-control-color');
      }
      if (!record(raw.gate) || !onlyKeys(raw.gate,['tank','color','minUnits']) || !tanksOK || !raw.tankIds.includes(raw.gate.tank) || raw.gate.color !== 1 || raw.gate.minUnits !== 2) add('gate','invalid-gate');
      if (!dense(raw.edges) || !integer(raw.edges.length,1,66)) add('edges','invalid-edges');
      else if (nodesOK) {
        const nodes = new Set([...raw.tankIds,...raw.outlets.map(o => o.id)]), seen = new Set();
        raw.edges.forEach((e,i) => {
          if (!record(e) || !onlyKeys(e,['from','to','gated']) || !raw.tankIds.includes(e.from) || !nodes.has(e.to) || e.from === e.to || (e.gated !== undefined && typeof e.gated !== 'boolean')) { add('edges.'+i,'invalid-edge'); return; }
          const k = e.from+'>'+e.to; if (seen.has(k)) add('edges.'+i,'duplicate-edge'); seen.add(k);
        });
      }
      for (const [field,max] of [['title',120],['description',1000]]) if (raw[field] !== undefined && (typeof raw[field] !== 'string' || raw[field].length > max)) add(field,'invalid-text');
      if (raw.layout !== undefined) {
        if (!record(raw.layout) || !nodesOK) add('layout','invalid-layout');
        else {
          const nodes = [...raw.tankIds,...raw.outlets.map(o => o.id)];
          if (Object.keys(raw.layout).length !== nodes.length || !nodes.every(n => Object.hasOwn(raw.layout,n))) add('layout','node-mismatch');
          const points = new Set();
          for (const [n,p] of Object.entries(raw.layout)) {
            if (!nodes.includes(n) || !record(p) || !onlyKeys(p,['x','y']) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) add('layout.'+n,'invalid-point');
            else { const k = p.x+','+p.y; if (points.has(k)) add('layout.'+n,'duplicate-point'); points.add(k); }
          }
        }
      }
      return errors;
    }
    function canonicalContent(raw) {
      const errors = definitionErrors(raw,false);
      if (errors.length) throw contentError(errors);
      return JSON.stringify({schema:SCHEMA,id:raw.id,rulesVersion:raw.rulesVersion,capacity:raw.capacity,
        tankIds:raw.tankIds,initial:raw.initial,outlets:raw.outlets.map(o => ({id:o.id,color:o.color,demand:o.demand})),
        gate:{tank:raw.gate.tank,color:raw.gate.color,minUnits:raw.gate.minUnits},
        edges:raw.edges.map(e => ({from:e.from,to:e.to,gated:e.gated === true})).sort((a,b) => a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0)});
    }
    function contentError(errors) {
      const error = new Error('Invalid route content: '+errors.map(e => e.field+':'+e.code).join(', '));
      error.code = 'ROUTE_CONTENT_INVALID'; error.errors = errors; return error;
    }
    async function prepareStage(raw) {
      const errors = definitionErrors(raw);
      if (errors.length) throw contentError(errors);
      // Copy before awaiting the digest so callers cannot change the checked payload.
      const stage = clone(raw), computed = await hashText(canonicalContent(stage));
      if (typeof computed !== 'string' || !/^[a-f0-9]{64}$/.test(computed)) throw new Error('SHA-256 provider returned an invalid digest');
      if (stage.contentHash !== computed) throw contentError([{field:'contentHash',code:'mismatch'}]);
      stage.edges = stage.edges.map(e => ({from:e.from,to:e.to,gated:e.gated === true}));
      freeze(stage); prepared.add(stage); return stage;
    }
    function requireStage(stage) { if (!prepared.has(stage)) throw new Error('Prepare route stage before using it'); }
    function positionErrors(stage,p) {
      const errors = [];
      if (!record(p) || !dense(p.bottles) || p.bottles.length !== stage.tankIds.length || !p.bottles.every(b => dense(b) && b.length <= 4 && b.every(c => integer(c,0,12))) || !dense(p.delivered) || p.delivered.length !== stage.outlets.length) return [{field:'position',code:'invalid-shape'}];
      const expected = Array(13).fill(0), actual = Array(13).fill(0);
      stage.initial.flat().forEach(c => expected[c]++); p.bottles.flat().forEach(c => actual[c]++);
      stage.outlets.forEach((o,i) => { if (!integer(p.delivered[i],0,o.demand)) errors.push({field:'delivered.'+i,code:'invalid-quantity'}); else actual[o.color] += p.delivered[i]; });
      if (expected.some((n,c) => n !== actual[c])) errors.push({field:'position',code:'mass-mismatch'});
      return errors;
    }
    function gate(stage,p) { const b = p.bottles[stage.tankIds.indexOf(stage.gate.tank)]; return b.length >= 2 && b.every(c => c === 1); }
    function complete(stage,p) { return stage.outlets.every((o,i) => p.delivered[i] === o.demand); }
    function position(p) { return {bottles:p.bottles.map(b => b.slice()),delivered:p.delivered.slice()}; }
    function snapshot(state) { return {...position(state),moves:state.moves,phase:state.phase}; }
    function transfer(stage,p,move) {
      if (!dense(move) || move.length !== 2 || !move.every(x => typeof x === 'string')) return {ok:false,reason:'invalid-action'};
      const [from,to] = move, i = stage.tankIds.indexOf(from), j = stage.tankIds.indexOf(to), oi = stage.outlets.findIndex(o => o.id === to);
      const reject = reason => ({ok:false,reason,from,to});
      if (complete(stage,p)) return reject('attempt-complete');
      if (i < 0 || (j < 0 && oi < 0)) return reject('unknown-node');
      if (from === to) return reject('same-node');
      const edge = stage.edges.find(e => e.from === from && e.to === to);
      if (!edge) return reject('not-connected');
      const gateBefore = gate(stage,p);
      if (edge.gated && !gateBefore) return reject('gate-closed');
      if (!p.bottles[i].length) return reject('empty-source');
      const color = p.bottles[i].at(-1), next = position(p); let moved;
      if (j >= 0) {
        if (p.bottles[j].length >= 4) return reject('tank-full');
        if (!core.canPour(p.bottles,i,j,4)) return reject('color-mismatch');
        moved = core.doPour(next.bottles,i,j,4);
      } else {
        if (p.delivered[oi] >= stage.outlets[oi].demand) return reject('outlet-full');
        if (color !== stage.outlets[oi].color) return reject('color-mismatch');
        moved = Math.min(core.topSeg(p.bottles[i]).n,stage.outlets[oi].demand-p.delivered[oi]);
        next.bottles[i].splice(next.bottles[i].length-moved,moved); next.delivered[oi] += moved;
      }
      const gateAfter = gate(stage,next), completedOutlet = oi >= 0 && next.delivered[oi] === stage.outlets[oi].demand ? to : null;
      return {ok:true,from,to,moved,color,gateBefore,gateAfter,completedOutlet,won:complete(stage,next),next};
    }
    function validatePosition(stage,p) { requireStage(stage); const errors = positionErrors(stage,p); return {ok:!errors.length,errors}; }
    function simulatePosition(stage,p,move) {
      const check = validatePosition(stage,p); if (!check.ok) return {ok:false,reason:'invalid-state',errors:check.errors};
      return transfer(stage,p,move);
    }
    function positionMoves(stage,p) {
      const check = validatePosition(stage,p); if (!check.ok) throw contentError(check.errors);
      return stage.edges.map(e => transfer(stage,p,[e.from,e.to])).filter(r => r.ok);
    }
    function validateState(stage,state) {
      requireStage(stage);
      if (trustedStates.get(state) === stage) return {ok:true,errors:[]};
      const errors = [], add = (field,code) => errors.push({field,code});
      if (!record(state)) return {ok:false,errors:[{field:'state',code:'object-required'}]};
      if (!onlyKeys(state,['schema','mode','stageId','rulesVersion','contentVersion','contentHash','attemptId','bottles','delivered','moves','phase','history'])) add('state','unknown-field');
      for (const [field,value] of Object.entries({schema:SCHEMA,mode:'route',stageId:stage.id,rulesVersion:stage.rulesVersion,contentVersion:stage.contentVersion,contentHash:stage.contentHash})) if (state[field] !== value) add(field,'mismatch');
      if (typeof state.attemptId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(state.attemptId)) add('attemptId','invalid-id');
      if (!integer(state.moves,0,Number.MAX_SAFE_INTEGER)) add('moves','invalid-count');
      const currentErrors = positionErrors(stage,state); errors.push(...currentErrors);
      if (!currentErrors.length && state.phase !== (complete(stage,state) ? 'won' : 'playing')) add('phase','mismatch');
      if (!dense(state.history) || state.history.length > HISTORY_LIMIT || state.history.length > state.moves) add('history','invalid-length');
      else if (state.phase === 'won' && state.history.length) add('history','completed-attempt');
      else {
        const chain = [...state.history,state];
        for (let i=0;i<state.history.length;i++) {
          const p = chain[i], after = chain[i+1];
          if (!record(p) || !onlyKeys(p,['bottles','delivered','moves','phase']) || positionErrors(stage,p).length || !integer(p.moves,0,Number.MAX_SAFE_INTEGER) || p.phase !== 'playing' || complete(stage,p)) { add('history.'+i,'invalid-snapshot'); continue; }
          if (!record(after) || after.moves !== p.moves+1 || positionErrors(stage,after).length || !stage.edges.some(e => {
            const r = transfer(stage,p,[e.from,e.to]); return r.ok && JSON.stringify(r.next) === JSON.stringify(position(after));
          })) add('history.'+i,'invalid-transition');
          if (p.moves === 0 && (JSON.stringify(p.bottles) !== JSON.stringify(stage.initial) || p.delivered.some(n => n !== 0))) add('history.'+i,'invalid-start');
        }
      }
      if (!currentErrors.length && state.moves === 0 && (JSON.stringify(state.bottles) !== JSON.stringify(stage.initial) || state.delivered.some(n => n !== 0))) add('state','invalid-start');
      return {ok:!errors.length,errors};
    }
    function sealState(stage,state) { freeze(state); trustedStates.set(state,stage); return state; }
    function createState(stage,attemptId) {
      requireStage(stage);
      const state = {schema:SCHEMA,mode:'route',stageId:stage.id,rulesVersion:stage.rulesVersion,contentVersion:stage.contentVersion,contentHash:stage.contentHash,
        attemptId,bottles:clone(stage.initial),delivered:stage.outlets.map(() => 0),moves:0,phase:'playing',history:[]};
      const check = validateState(stage,state); if (!check.ok) throw contentError(check.errors);
      return sealState(stage,state);
    }
    function restoreState(stage,raw) {
      const check = validateState(stage,raw); if (!check.ok) return {ok:false,reason:'invalid-state',errors:check.errors};
      return {ok:true,state:sealState(stage,clone(raw))};
    }
    function previewMove(stage,state,move) {
      const check = validateState(stage,state); if (!check.ok) return {ok:false,reason:'invalid-state',errors:check.errors};
      if (state.moves === Number.MAX_SAFE_INTEGER) return {ok:false,reason:'move-count-limit'};
      const r = transfer(stage,state,move); if (!r.ok) return r;
      return {...r,next:{...r.next,moves:state.moves+1,phase:r.won?'won':'playing'}};
    }
    function applyMove(stage,state,move) {
      const r = previewMove(stage,state,move); if (!r.ok) return r;
      const next = sealState(stage,{...state,...r.next,history:r.won?[]:[...state.history,snapshot(state)].slice(-HISTORY_LIMIT)});
      const events = [{type:'transfer',from:r.from,to:r.to,color:r.color,units:r.moved}];
      if (r.completedOutlet) events.push({type:'outlet-complete',outlet:r.completedOutlet});
      if (r.gateBefore !== r.gateAfter) events.push({type:'gate-changed',controller:stage.gate.tank,open:r.gateAfter});
      if (r.won) events.push({type:'won',stageId:stage.id,moves:next.moves});
      return {...r,state:next,events};
    }
    function undo(stage,state) {
      const check = validateState(stage,state); if (!check.ok) return {ok:false,reason:'invalid-state',errors:check.errors};
      if (state.phase === 'won') return {ok:false,reason:'attempt-complete'};
      if (!state.history.length) return {ok:false,reason:'no-history'};
      const next = sealState(stage,{...state,...clone(state.history.at(-1)),history:state.history.slice(0,-1)});
      const events = [{type:'undo',moves:next.moves}];
      if (gate(stage,state) !== gate(stage,next)) events.push({type:'gate-changed',controller:stage.gate.tank,open:gate(stage,next)});
      return {ok:true,state:next,events};
    }
    function restart(stage,state,attemptId) {
      const check = validateState(stage,state); if (!check.ok) return {ok:false,reason:'invalid-state',errors:check.errors};
      if (attemptId === state.attemptId) return {ok:false,reason:'new-attempt-required'};
      return {ok:true,state:createState(stage,attemptId),events:[{type:'restart'}]};
    }
    function availableMoves(stage,state) {
      const check = validateState(stage,state); if (!check.ok) return {ok:false,reason:'invalid-state',errors:check.errors};
      return {ok:true,moves:stage.edges.map(e => previewMove(stage,state,[e.from,e.to])).filter(r => r.ok)};
    }
    function status(stage,state) {
      const check = validateState(stage,state); if (!check.ok) return {ok:false,reason:'invalid-state',errors:check.errors};
      return {ok:true,phase:state.phase,gateOpen:gate(stage,state),blocked:state.phase === 'playing' && !positionMoves(stage,state).length,canUndo:state.phase === 'playing' && state.history.length > 0};
    }
    function positionKey(stage,p) {
      const check = validatePosition(stage,p); if (!check.ok) throw contentError(check.errors);
      return stage.rulesVersion+'|'+stage.contentVersion+'|'+stage.contentHash+'|'+JSON.stringify([p.bottles,p.delivered]);
    }
    return Object.freeze({RULES_VERSION,SCHEMA,HISTORY_LIMIT,definitionErrors,canonicalContent,prepareStage,
      validatePosition,simulatePosition,positionMoves,positionKey,validateState,createState,restoreState,
      previewMove,applyMove,undo,restart,availableMoves,status,
      initialPosition:stage => { requireStage(stage); return {bottles:clone(stage.initial),delivered:stage.outlets.map(() => 0)}; }});
  }
  if (typeof module === 'object' && module.exports) module.exports = createRouteEngine;
  else root.createRouteEngine = createRouteEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
