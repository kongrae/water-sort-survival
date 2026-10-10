// node research/late-pressure/compare.js [--n=40] [--cap=1500] [--workers=3] [--resume]
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { E, run } = require('../expansion/bots');
const { OUT, write, metadata, sha } = require('./common');
const opt = (name, fallback) => process.argv.find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const thresholds = [10000,15000,25000], seedPrefix = 'late-pressure-20261010-';
const bucket = score => score < 4500 ? 'below4500' : score < 10000 ? '4500-9999' : score < 15000 ? '10000-14999' : score < 25000 ? '15000-24999' : '25000+';
let configs = [
  ['baseline', E.sanitizeRules(E.LEGACY_ENDLESS_RULES)],
  ['frequency', E.sanitizeRules({ ...E.ENDLESS_RULES, pressureTable: E.PRESSURE_V1.map(row => ({ ...row, tripleMonoPct: 50 })) })],
  ['full', E.sanitizeRules(E.ENDLESS_RULES)],
];
// One predeclared bounded adjustment, retained separately from the initial 240-game comparison.
const TUNED = [{score:4500,triplePct:5,tripleMonoPct:50},{score:10000,triplePct:10,tripleMonoPct:20},
  {score:15000,triplePct:12,tripleMonoPct:15},{score:25000,triplePct:15,tripleMonoPct:10}];
if (opt('conditions','') === 'tuned') configs = [['tuned',E.sanitizeRules({...E.ENDLESS_RULES,pressureTable:TUNED})]];
function measure(rules, seed, cap, depth) {
  const phases = {}, generated = {}, milestones = {}, reasons = {};
  const result = run(rules, seed, cap, depth, false, (S, kind, generation) => {
    for (const threshold of thresholds) if (!milestones[threshold] && S.score >= threshold) milestones[threshold] = { turn:S.turn, score:S.score };
    const key = bucket(S.score);
    if (kind === 'place' || kind === 'hold') {
      const phase = phases[key] || (phases[key] = {placements:0,holds:0,free:0,targets:0});
      if (kind === 'hold') phase.holds++;
      else { phase.placements++; phase.free += S.bottles.reduce((n,b) => n + S.rules.cap - b.length,0); phase.targets += S.bottles.filter(b => S.rules.cap-b.length >= S.piece.length).length; }
    }
    if (S.growth.generation > generation) {
      if (S.growth.generation !== generation + 1) throw Error('Unexpected generation delta');
      const entry = rules.preview ? S.growth.queue.at(-1) : {piece:S.piece,intro:S.growth.pieceIntro};
      const g = generated[key] || (generated[key] = {introduced:0,ineligible:0,eligible:0,one:0,two:0,triple:0,mono:0,mixed:0,expectedTriple:0,expectedMono:0,maxColorsEligible:0});
      if (entry.intro >= 0) g.introduced++;
      else if (!E.hasTriple(rules) || S.bottles.length < rules.tripleBottles) g.ineligible++;
      else {
        const pressure = E.pressureAt(S), pct = pressure ? pressure.triplePct : rules.triplePct, mono = pressure ? pressure.tripleMonoPct : rules.tripleMonoPct;
        g.eligible++; if (S.growth.activeColors === 9) g.maxColorsEligible++;
        g.expectedTriple += pct/100; g.expectedMono += pct/100 * mono/100;
        if (entry.piece.length === 1) g.one++; else if (entry.piece.length === 2) g.two++;
        else { g.triple++; g[new Set(entry.piece).size === 1 ? 'mono' : 'mixed']++; }
      }
    }
  });
  result.milestones = milestones; result.scorePhases = phases; result.generatedPhases = generated;
  result.signature = E.rulesSig(rules);
  result.termination = !result.over ? 'placement-cap/right-censored' : result.reason === 'noroom' ? 'engine-no-legal-room' : 'bot-gave-up/search-limited';
  reasons[result.termination] = 1; delete result.state; return result;
}
const q = (rows,p) => { const values = rows.slice().sort((a,b) => a-b); return values.length ? values[Math.min(values.length-1,Math.floor(p*values.length))] : null; };
function summary(rows) {
  const phases = {}, generated = {}, endReasons = {};
  for (const row of rows) {
    endReasons[row.termination] = (endReasons[row.termination] || 0) + 1;
    for (const [key,values] of Object.entries(row.scorePhases)) for (const [name,value] of Object.entries(values)) {
      const target = phases[key] || (phases[key] = {}); target[name] = (target[name] || 0) + value;
    }
    for (const [key,values] of Object.entries(row.generatedPhases)) for (const [name,value] of Object.entries(values)) {
      const target = generated[key] || (generated[key] = {}); target[name] = (target[name] || 0) + value;
    }
  }
  for (const phase of Object.values(phases)) { phase.freeMean = phase.placements ? phase.free/phase.placements : null; phase.targetsMean = phase.placements ? phase.targets/phase.placements : null; }
  for (const g of Object.values(generated)) {
    g.tripleRate = g.eligible ? g.triple/g.eligible : null; g.monoConditionalRate = g.triple ? g.mono/g.triple : null;
  }
  const milestone = {};
  for (const threshold of thresholds) {
    const reached = rows.filter(row => row.milestones[threshold]), capped = reached.filter(row => !row.over);
    milestone[threshold] = { reached:reached.length, ended:reached.length-capped.length, censored:capped.length,
      observedAfterP50:q(reached.map(row => row.turn-row.milestones[threshold].turn),.5),
      observedAfterP50IsLowerBound:capped.length > 0, firstTurnP50:q(reached.map(row => row.milestones[threshold].turn),.5) };
  }
  return {n:rows.length,capped:rows.filter(row => !row.over).length,observedTurnP50:q(rows.map(row => row.turn),.5),
    scoreP50:q(rows.map(row => row.score),.5),milestone,phases,generated,endReasons,
    unknownObservations:rows.reduce((n,row) => n+row.metrics.unknown,0)};
}
if (!isMainThread) {
  const { label,rules,depth,seeds,cap } = workerData, rows = [];
  for (let i=0;i<seeds.length;i++) {
    rows.push(measure(rules,seeds[i],cap,depth));
    if ((i+1)%10 === 0) parentPort.postMessage({progress:label+'/d'+depth+': '+(i+1)+'/'+seeds.length});
  }
  parentPort.postMessage({label,rules,signature:E.rulesSig(rules),depth,rows,summary:summary(rows)});
} else {
  const n = Number(opt('n',40)), cap = Number(opt('cap',1500)), workers = Math.max(1,Math.min(4,Number(opt('workers',3))));
  const name = opt('name','comparison'), meta = {...metadata(),comparisonSha256:sha(fs.readFileSync(__filename))}, results = [];
  const jobs = configs.flatMap(([label,rules]) => [1,2].map(depth => ({label,rules,depth,cap,seeds:Array.from({length:n},(_,i) => seedPrefix+i)})));
  if (process.argv.includes('--resume') && fs.existsSync(path.join(OUT,name+'.json'))) {
    const saved = JSON.parse(fs.readFileSync(path.join(OUT,name+'.json')));
    if (saved.engineSha256 !== meta.engineSha256 || saved.botSha256 !== meta.botSha256 || saved.comparisonSha256 !== meta.comparisonSha256 || saved.n !== n || saved.cap !== cap) throw Error('Resume metadata mismatch');
    results.push(...saved.results);
  }
  const done = new Set(results.map(r => r.label+'/'+r.depth)), queue = jobs.filter(j => !done.has(j.label+'/'+j.depth));
  let active = 0, failed = false; const started = Date.now();
  const save = () => write(name+'.json',{...meta,seedPrefix,n,cap,workers,elapsedMs:Date.now()-started,
    selection:'all fixed seeds from fresh start; no checkpoints or selected survivors',
    policy:'unchanged 1/2-pour evaluation, HOLD tie policy, greedy 60/40, room path depth 10/node 30000',
    results:results.slice().sort((a,b) => a.label.localeCompare(b.label)||a.depth-b.depth)});
  function dispatch() {
    while (!failed && active < workers && queue.length) {
      const worker = new Worker(__filename,{workerData:queue.shift()}); active++;
      worker.on('message',value => {
        if (value.progress) console.log(value.progress);
        else { results.push(value); save(); console.log(JSON.stringify({label:value.label,depth:value.depth,...value.summary.milestone,capped:value.summary.capped})); }
      });
      worker.on('error',error => { console.error(error); failed = true; process.exitCode = 1; });
      worker.on('exit',code => { active--; if(code){failed=true;process.exitCode=1;}dispatch();if(!active){save();console.log('saved '+name+'.json ('+results.length+'/'+jobs.length+' jobs)');} });
    }
  }
  dispatch(); if (!queue.length && !active) save();
}
