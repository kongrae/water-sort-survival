// Fixed replay/legacy-save fixtures; no dependency on research outputs or browser storage.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const normalize = text => text.replace(/\r\n/g, '\n').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
const html = read('water-sort-survival.html');
function script(id) {
  const match = html.match(new RegExp('<script id="' + id + '"[^>]*>([\\s\\S]*?)<\\/script>'));
  assert(match, 'Missing embedded script: ' + id);
  return match[1];
}
const E = new Function(script('engine') + '\nreturn {newDelivery,applyPlace,applyPour,applyExtract,applyHold,applyFlip,deliveryStars,createDeliveryClock};')();
const createProgress = require('../delivery/progress');
const pack = require('../delivery/representative-three.json');
const manifest = require('../scripts/delivery-manifest')(pack, require('../delivery/released-packs.json'));
const references = require('./fixtures/delivery-routes.json');
const legacy = require('./fixtures/delivery-legacy-saves.json').saves;
const ratingLegacy = require('./fixtures/delivery-rating-legacy-saves.json').cases;
const methods = { place: 'applyPlace', pour: 'applyPour', extract: 'applyExtract', hold: 'applyHold', flip: 'applyFlip' };
const sentinels = {
  'wsurv.best': '9000', 'wsurv.stars': '125', 'wsurv.game.endless': 'endless-original',
  'wsurv.game.daily': 'daily-original', 'wsurv.campaign.v1': 'campaign-original',
  'wsurv.route.v1': 'route-original', 'wsurv.delivery.recovery.v1': 'recovery-original',
};
function environment(raw) {
  const db = new Map(Object.entries(sentinels)), writes = [];
  if (raw !== undefined) db.set('wsurv.delivery.v1', raw);
  let wall = 10000, owner = true, fail = null, attempt = 0;
  const storage = {
    read: key => db.get(key) ?? null,
    write: (key, value) => { if (key === fail) throw Error('quota'); db.set(key, value); writes.push(key); },
    writable: () => owner, now: () => wall, attempt: () => 'regression-' + (++attempt),
  };
  return {
    db, writes, make: () => createProgress(E, pack, manifest, storage),
    wall: value => { wall = value; }, owner: value => { owner = value; }, fail: value => { fail = value; },
    untouched: () => { for (const [key, value] of Object.entries(sentinels)) assert.equal(db.get(key), value, key); },
  };
}
function act(progress, event, elapsed) {
  const state = progress.snapshot().state;
  assert(E[methods[event[0]]](state, ...event.slice(1)), 'Rejected replay action: ' + event);
  assert(progress.capture(event, state, elapsed).saved, 'Failed capture: ' + event);
  return state;
}
let groups = 0, actions = 0, restores = 0, boundaryUndos = 0;
function test(name, run) { run(); groups++; console.log('PASS ' + name); }

test('Embedded modules, released content and all nine locale columns match their sources', () => {
  assert.deepEqual(JSON.parse(script('deliveryPack')), pack);
  assert.deepEqual(JSON.parse(script('deliveryManifest')), manifest);
  assert.equal(references.packHash, manifest.packHash, 'Reference routes must cover the current pack');
  assert.equal(normalize(script('deliveryProgress')), normalize(read('delivery/progress.js')));
  for (const [marker, file] of [['ENGINE', 'engine.js'], ['UI', 'ui.js'], ['CSS', 'ui.css']]) {
    const match = html.match(new RegExp('/\\* DELIVERY_' + marker + '_START \\*/([\\s\\S]*?)/\\* DELIVERY_' + marker + '_END \\*/'));
    assert(match, marker);
    assert.equal(normalize(match[1]), normalize(read('delivery/' + file)), marker + ' needs embedding');
  }
  assert.equal(normalize(html.match(/<!-- DELIVERY_DIALOGS_START -->([\s\S]*?)<!-- DELIVERY_DIALOGS_END -->/)[1]), normalize(read('delivery/ui.html')));
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/application\/json/.test(match[1])) JSON.parse(match[2]);
    else new vm.Script(match[2]);
  }
  const rows = read('locales/messages.tsv').replace(/\r/g, '').split('\n').filter(Boolean);
  assert.equal(rows.shift(), 'key|en|ja|zh-Hans|zh-Hant|es|pt-BR|hi|id');
  const catalog = {}, placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
  for (const row of rows) {
    const [key, ...values] = row.split('|');
    assert.equal(values.length, 8, key);
    assert(!Object.hasOwn(catalog, key), 'Duplicate translation: ' + key);
    for (const value of values) { assert(value.trim(), key); assert.deepEqual(placeholders(value), placeholders(key), key); }
    catalog[key] = values;
  }
  require('../scripts/check-delivery-locales')(root, catalog);
  require('../scripts/check-route-locales')(root, catalog);
  assert.equal(normalize(script('i18n')), normalize(read('locales/runtime.js').replace('__CATALOG__', JSON.stringify(catalog).replace(/</g, '\\u003c'))));
});

test('All released stages and alternate chain routes complete; every prefix restores its frozen state', () => {
  assert.equal(new Set(references.cases.map(c => c.name)).size, references.cases.length);
  assert.deepEqual([...new Set(references.cases.map(c => c.stageId))].sort(), pack.map(c => c.id).sort(), 'Every stage needs a reference route');
  for (const c of references.cases) {
    const index = pack.findIndex(s => s.id === c.stageId), env = environment(), progress = env.make();
    assert.equal(progress.load().issue, null);
    assert(progress.select(index, true, false).saved);
    assert.equal(hash(progress.snapshot().state), c.states[0], c.name + ' initial state');
    assert.equal(c.states.length, c.route.length + 1);
    for (const [i, event] of c.route.entries()) {
      const before = progress.snapshot().state, elapsed = (i + 1) * 137.25;
      const state = act(progress, event, elapsed); actions++;
      assert.equal(hash(state), c.states[i + 1], c.name + ' action ' + (i + 1));
      const savedElapsed = progress.snapshot().envelope.active.elapsedMs;
      assert(progress.checkpoint(elapsed, false).saved);
      const raw = env.db.get(progress.KEY), restoredEnv = environment(raw), resumed = restoredEnv.make();
      assert.equal(resumed.load().issue, null);
      assert.equal(restoredEnv.writes.length, 0, 'Loading must not write');
      assert.deepEqual(resumed.snapshot().state, state);
      assert.deepEqual(resumed.snapshot().envelope, progress.snapshot().envelope);
      assert.equal(env.db.get(progress.KEY), raw);
      restoredEnv.wall(999999);
      assert(resumed.resume().saved);
      assert.equal(resumed.snapshot().envelope.active.elapsedMs, savedElapsed);
      assert.deepEqual(resumed.snapshot().state, state);
      restoredEnv.untouched();
      restores++;
      if (before.delivery.orderIndex !== state.delivery.orderIndex) {
        const branch = environment(raw), undo = branch.make();
        assert.equal(undo.load().issue, null);
        const expected = clone(before);
        expected.undoLeft = state.undoLeft - 1; expected.undoUsed = state.undoUsed + 1;
        assert(undo.capture(['undo'], expected, elapsed + 5).saved, 'Order-boundary undo');
        const restored = branch.make(); assert.equal(restored.load().issue, null);
        assert.deepEqual(restored.snapshot().state, expected);
        assert(restored.resume().saved);
        assert.equal(restored.snapshot().envelope.active.elapsedMs, elapsed + 5);
        branch.untouched(); boundaryUndos++;
      }
    }
    const result = progress.snapshot();
    assert.equal(result.state.delivery.phase, 'won', c.name);
    assert.equal(result.envelope.cleared[c.stageId], true);
    assert.equal(result.envelope.active.practice, false);
    assert.equal(result.envelope.records[c.stageId].bestMs, c.route.length * 137.25);
    assert.equal(result.envelope.records[c.stageId].stars, E.deliveryStars(c.route.length * 137.25, progress.thresholds(c.stageId)));
    env.untouched();
  }
  assert(boundaryUndos >= 6, 'Cover each continuous-order transition');
});

test('Released 3/12/60/63/65 saves upgrade read-only, preserve exact backup and finish the active route', () => {
  for (const fixture of legacy) {
    const env = environment(fixture.raw), progress = env.make(), old = JSON.parse(fixture.raw);
    assert.equal(progress.load().issue, null, 'Old pack: ' + fixture.stageCount);
    assert.equal(hash(progress.snapshot().state), fixture.stateHash);
    assert.equal(env.writes.length, 0);
    assert.equal(env.db.get(progress.KEY), fixture.raw);
    const before = progress.snapshot().envelope;
    for (const key of ['records', 'learning', 'cleared']) assert.deepEqual(before[key], old[key]);
    assert.deepEqual(before.active, {...old.active,clockMode:old.active.practice?'untimed':'legacy-wall'});
    assert(progress.resume().saved);
    const backup = 'wsurv.delivery.upgrade.' + old.packHash + '.v1';
    assert.equal(env.db.get(backup), fixture.raw);
    assert(env.writes.indexOf(backup) < env.writes.indexOf(progress.KEY));
    const reference = references.cases.find(c => c.stageId === old.active.stageId);
    for (const event of reference.route.slice(old.active.events.length)) act(progress, event, 15000);
    assert.equal(progress.snapshot().state.delivery.phase, 'won');
    for (const [id, record] of Object.entries(old.records)) assert.deepEqual(progress.snapshot().envelope.records[id], record);
    env.untouched();
  }
});

test('Existing 65 clears and 51 best-time/star records survive completion of all three chains', () => {
  const old = JSON.parse(legacy.find(f => f.stageCount === 65).raw), env = environment(JSON.stringify(old)), progress = env.make();
  assert.equal(progress.load().issue, null);
  assert.equal(Object.keys(old.records).length, 51);
  assert.equal(progress.journey().count, 65);
  for (const index of [65, 66, 67]) {
    assert(progress.select(index, true, false).saved);
    const route = references.cases.find(c => c.stageId === pack[index].id).route;
    route.forEach((event, i) => act(progress, event, (i + 1) * 137.25));
    for(const [id,record] of Object.entries(old.records))assert.deepEqual(progress.snapshot().envelope.records[id],record);
    assert.equal(progress.snapshot().envelope.records[pack[index].id].bestMs,route.length*137.25);
    assert.equal(progress.journey().count, index + 1);
  }
  assert.equal(progress.journey().nextIndex, -1);
  const restored = env.make(); assert.equal(restored.load().issue, null);
  assert.deepEqual(restored.snapshot().envelope, progress.snapshot().envelope);
  env.untouched();
});

test('Pause, stale running saves, fractional time and legacy timer policies stay distinct', () => {
  const env = environment(), p = env.make(); p.load();
  for (const index of [65, 66, 67]) for (const running of [true, false]) {
    assert(p.select(index, true, false).saved); env.wall(10000);
    assert(p.checkpoint(12345.625, running).saved); env.wall(999999);
    const q = env.make(); assert.equal(q.load().issue, null); assert(q.resume().saved);
    assert.equal(q.snapshot().envelope.active.elapsedMs, 12345.625);
    // This branch writes to the same store; reload before replacing its run.
    assert.equal(p.load().issue, null);
  }
  assert(p.select(0, true, false).saved); env.wall(10000);
  assert(p.checkpoint(3000, true).saved); env.wall(12500); assert(p.resume().saved);
  assert.equal(p.snapshot().envelope.active.elapsedMs, 3000);
  assert(p.select(63, true, false).saved); assert(p.checkpoint(9000, true).saved);
  assert.equal(p.snapshot().envelope.active.elapsedMs, 9000);
  assert.equal(p.snapshot().envelope.active.runningAt, 12500);
  const oldScored=environment(ratingLegacy.find(c=>c.name==='active-2').raw),q=oldScored.make();
  assert.equal(q.load().issue,null);oldScored.wall(12500);assert(q.resume().saved);
  assert.equal(q.snapshot().envelope.active.elapsedMs,14845.625,'Old scored attempts retain legacy wall-time handling');
  const oldUntimed=environment(ratingLegacy.find(c=>c.name==='active-64').raw),u=oldUntimed.make();
  assert.equal(u.load().issue,null);assert(u.checkpoint(9000,true).saved);
  assert.equal(u.snapshot().envelope.active.elapsedMs,0);assert.equal(u.snapshot().envelope.active.runningAt,null);
  let now = 100; const clock = E.createDeliveryClock(() => now, 12.5);
  clock.setRunning(true); now = 150.25; assert.equal(clock.sample(), 62.75);
  now = 200; clock.setRunning(false); now = 900; assert.equal(clock.sample(), 112.5);
  clock.setRunning(true); now = 910; assert.equal(clock.finish(), 122.5);
  now = 2000; clock.setRunning(true); assert.equal(clock.sample(), 122.5);
  env.untouched();
});

test('Write/backup failures, stale tabs and lost ownership never overwrite the original save', () => {
  const fixture = legacy.find(f => f.stageCount === 65), old = JSON.parse(fixture.raw);
  const backup = 'wsurv.delivery.upgrade.' + old.packHash + '.v1';
  for (const kind of ['backup', 'main', 'backup-exists', 'owner', 'conflict']) {
    const env = environment(fixture.raw), p = env.make(); assert.equal(p.load().issue, null);
    if (kind === 'backup') env.fail(backup);
    if (kind === 'main') env.fail(p.KEY);
    if (kind === 'backup-exists') env.db.set(backup, 'different-backup');
    if (kind === 'owner') env.owner(false);
    if (kind === 'conflict') env.db.set(p.KEY, fixture.raw + ' ');
    assert(!p.resume().saved, kind);
    const reasons = { backup: 'write-failed', main: 'write-failed', 'backup-exists': 'backup-exists', owner: 'no-writer', conflict: 'conflict' };
    assert.equal(p.status().issue, reasons[kind]);
    assert.equal(env.db.get(p.KEY), kind === 'conflict' ? fixture.raw + ' ' : fixture.raw);
    if (kind === 'backup' || kind === 'main') {
      env.fail(null); assert(p.retry().ok); assert.equal(env.db.get(backup), fixture.raw);
      const q = env.make(); assert.equal(q.load().issue, null); assert.deepEqual(q.snapshot().state, p.snapshot().state);
    }
    env.untouched();
  }
  for (const [name, mutate, reason] of [
    ['unknown pack', raw => { raw.packHash = '0'.repeat(64); }, 'content-mismatch'],
    ['corrupt action', raw => { raw.active.events.push(['pour', 999, 0]); }, 'invalid-action-log'],
  ]) {
    const raw = clone(old); mutate(raw); const text = JSON.stringify(raw), env = environment(text), p = env.make();
    assert.equal(p.load().issue, reason, name); assert(!p.resume().saved);
    assert.equal(env.db.get(p.KEY), text); assert.equal(env.writes.length, 0); env.untouched();
  }
});

test('All 68 stages award inclusive time-based stars, including the first guided attempt',()=>{
  assert.equal(Object.keys(manifest.starPolicy.thresholds).length,pack.length);
  for(const [index,c] of pack.entries()){
    const bounds=manifest.starPolicy.thresholds[c.id],route=references.cases.find(r=>r.stageId===c.id).route;
    if(c.starMs)assert.deepEqual(bounds,c.starMs,'Keep published thresholds');
    for(const [elapsed,stars]of [[bounds[0],3],[bounds[0]+0.25,2],[bounds[1],2],[bounds[1]+0.25,1]]){
      const env=environment(),p=env.make();p.load();assert(p.select(index,true,true).saved);
      assert.equal(p.snapshot().envelope.active.practice,false,'Guidance must not suppress stars');
      assert.equal(p.snapshot().envelope.active.clockMode,'play');
      route.forEach(a=>act(p,a,elapsed));
      const result=p.snapshot();assert.equal(result.envelope.records[c.id].stars,stars,c.id+' boundary '+elapsed);
      assert.equal(result.envelope.records[c.id].bestMs,elapsed);assert.equal(result.envelope.cleared[c.id],true);
      const restored=env.make();assert.equal(restored.load().issue,null);assert.deepEqual(restored.snapshot().envelope,result.envelope);
      env.untouched();
    }
  }
});

test('Slower retries never lower stars or overwrite the best time on any stage',()=>{
  for(const [index,c] of pack.entries()){
    const env=environment(),p=env.make();p.load();const route=references.cases.find(r=>r.stageId===c.id).route,bounds=p.thresholds(c.id);
    for(const elapsed of [bounds[1]+10,bounds[0],bounds[1]]){
      assert(p.select(index,true,false).saved);route.forEach(a=>act(p,a,elapsed));
    }
    assert.equal(p.snapshot().envelope.records[c.id].bestMs,bounds[0]);assert.equal(p.snapshot().envelope.records[c.id].stars,3);
    assert.equal(env.make().load().issue,null);env.untouched();
  }
});

test('23 frozen public-schema cases preserve boards, clears, records and legacy time policy',()=>{
  for(const fixture of ratingLegacy){
    const old=JSON.parse(fixture.raw),env=environment(fixture.raw),p=env.make();
    assert.equal(p.load().issue,null,fixture.name);assert.equal(env.writes.length,0);
    assert.deepEqual(p.snapshot().state,fixture.state,fixture.name+' board');
    for(const k of ['records','cleared','learning'])assert.deepEqual(p.snapshot().envelope[k],old[k],fixture.name+' '+k);
    const a=p.snapshot().envelope.active,chain=!!pack[fixture.stage-1].orders;
    for(const k of ['stageId','attemptId','events','elapsedMs','runningAt'])assert.deepEqual(a[k],old.active[k],fixture.name+' '+k);
    assert.equal(a.practice,old.active.practice&&(!chain||fixture.state.over));
    env.wall(10000);assert(p.resume().saved);
    assert.equal(p.snapshot().envelope.active.elapsedMs,old.active.elapsedMs);
    assert.equal(env.db.get('wsurv.delivery.upgrade.schema2.'+old.packHash+'.v1'),fixture.raw);
    const elapsed=old.active.elapsedMs+20000.25;
    fixture.remaining.forEach(event=>act(p,event,elapsed));
    assert.equal(p.snapshot().state.delivery.phase,'won');
    const result=p.snapshot(),record=result.envelope.records[a.stageId];
    if(a.practice){assert.deepEqual(result.envelope.records,old.records,'No fabricated legacy stars or times');}
    else{assert.equal(record.bestMs,elapsed);assert.equal(record.stars,E.deliveryStars(elapsed,p.thresholds(a.stageId)));}
    const reloaded=env.make();assert.equal(reloaded.load().issue,null);assert.deepEqual(reloaded.snapshot().envelope,result.envelope);
    if(a.practice&&!fixture.state.over){
      assert(p.select(fixture.stage-1,true,true).saved);
      references.cases.find(r=>r.stageId===a.stageId).route.forEach(event=>act(p,event,30000));
      assert.equal(p.snapshot().envelope.records[a.stageId].bestMs,30000,'Old untimed progress can earn stars on retry');
    }
    env.untouched();
  }
});

test('Schema-2 same-pack migration backs up exact bytes before writing and remains fail-safe',()=>{
  const raw=ratingLegacy.find(c=>c.name==='all-68-cleared').raw,old=JSON.parse(raw);
  const backup='wsurv.delivery.upgrade.schema2.'+old.packHash+'.v1';
  for(const kind of ['backup','main','backup-exists','conflict','owner']){
    const env=environment(raw),p=env.make();assert.equal(p.load().issue,null);
    if(kind==='backup')env.fail(backup);if(kind==='main')env.fail(p.KEY);
    if(kind==='backup-exists')env.db.set(backup,'other-original');
    if(kind==='conflict')env.db.set(p.KEY,raw+' ');if(kind==='owner')env.owner(false);
    assert(!p.resume().saved,kind);assert.equal(env.db.get(p.KEY),kind==='conflict'?raw+' ':raw);
    if(kind==='backup'||kind==='main'){
      env.fail(null);assert(p.retry().ok);assert.equal(env.db.get(backup),raw);
      const q=env.make();assert.equal(q.load().issue,null);assert.equal(q.journey().count,68);
      assert.deepEqual(q.snapshot().envelope.records,old.records);assert.deepEqual(q.snapshot().envelope.cleared,old.cleared);
      assert(q.resume().saved);assert.equal(env.db.get(backup),raw);
    }
    env.untouched();
  }
});

test('Schema-1 proofs and unknown schema/rating/clock data never silently reset records',()=>{
  const old=JSON.parse(ratingLegacy.find(c=>c.name==='all-68-cleared').raw);old.schema=1;delete old.cleared;
  const text=JSON.stringify(old),env=environment(text),p=env.make();assert.equal(p.load().issue,null);
  assert.deepEqual(p.snapshot().envelope.records,old.records);assert(p.resume().saved);
  assert.equal(env.db.get('wsurv.delivery.upgrade.schema1.'+old.packHash+'.v1'),text);
  const upgraded=p.snapshot().envelope;
  for(const mutate of [r=>{r.schema=4;},r=>{r.ratingVersion=99;},r=>{r.active.clockMode='unknown';}]){
    const r=clone(upgraded);mutate(r);const raw=JSON.stringify(r),bad=environment(raw),q=bad.make();
    assert(q.load().issue);assert(!q.resume().saved);assert.equal(bad.db.get(q.KEY),raw);assert.equal(bad.writes.length,0);
  }
  env.untouched();
});

test('Order changes never reset cumulative time; pause/reload exclude time away',()=>{
  for(const index of [65,66,67]){
    const env=environment(),p=env.make();p.load();p.select(index,true,false);
    const route=references.cases.find(r=>r.stageId===pack[index].id).route;let elapsed=500;
    for(const a of route){
      elapsed+=1111.125;const state=act(p,a,elapsed);assert.equal(p.snapshot().envelope.active.elapsedMs,elapsed);
      if(!state.over){
        const q=env.make();q.load();env.wall(999999);assert(q.resume().saved);assert.equal(q.snapshot().envelope.active.elapsedMs,elapsed);
        p.load();
      }
    }
    assert.equal(p.snapshot().envelope.records[pack[index].id].bestMs,elapsed);
  }
});

console.log('Delivery regression: ' + groups + ' groups, ' + pack.length + ' stages, ' + references.cases.length +
  ' routes, ' + actions + ' actions, ' + restores + ' restores, ' + boundaryUndos + ' boundary undos');
