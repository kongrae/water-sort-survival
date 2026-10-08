// node research/expansion/compare.js [--n=60] [--cap=500] [--workers=3]
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { E, run } = require('./bots');
const opt = (name, fallback) => Number((process.argv.find(s => s.startsWith(`--${name}=`)) || '').split('=')[1]) || fallback;
function profile(scores, ninth) {
  const table = E.SCORE_GROWTH_V1.map((r, i) => ({ ...r, score: i ? scores[i - 1] : 0 }));
  if (!ninth) table.pop();
  return E.sanitizeRules({ ...E.EXPANDING_RULES, maxColors: ninth ? 9 : 8, growthTable: table, tailDoublePct: 50 });
}
const tailExperiment = process.argv.includes('--tails');
const configs = tailExperiment ? [80, 90, 100].map(pct => [`steady-tail-${pct}`, E.sanitizeRules({ ...profile([300, 900, 1700, 2800, 4500], true), tailDoublePct: pct })]) : [
  ['baseline', E.sanitizeRules(E.DEFAULT_RULES)],
  ['early-8', profile([300, 700, 1300, 2200, 3600], false)],
  ['steady-9', profile([300, 900, 1700, 2800, 4500], true)],
  ['late-9', profile([500, 1300, 2500, 4000, 6500], true)],
];
function summary(rows) {
  const q = (field, p) => { const a = rows.map(r => r[field]).filter(v => v !== null).sort((a, b) => a - b); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
  const unlock = n => rows.map(r => r.metrics.unlocks.find(u => u.to >= n)).filter(Boolean);
  const phase = {};
  for (const r of rows) for (const [k, ph] of Object.entries(r.metrics.phases)) { const a = phase[k] || (phase[k] = { count: 0, free: 0, targets: 0 }); for (const f of Object.keys(a)) a[f] += ph[f]; }
  return { n: rows.length, turnP50: q('turn', .5), turnP90: q('turn', .9), scoreP50: q('score', .5), scoreP90: q('score', .9), capped: rows.filter(r => !r.over).length, unlock7: unlock(7).length, unlock8: unlock(8).length, unlock7P50: summaryTurn(unlock(7)), unlock8P50: summaryTurn(unlock(8)), firstClearP50: summaryTurn(rows.map(r => ({ turn: r.metrics.firstClear })).filter(r => r.turn !== null)), maxStreakP50: q('maxStreak', .5), poursPerPlace: rows.reduce((n, r) => n + r.metrics.pours, 0) / rows.reduce((n, r) => n + r.turn, 0), reasons: rows.reduce((a, r) => { const k = r.over ? r.reason : 'capped'; a[k] = (a[k] || 0) + 1; return a; }, {}), phases: Object.fromEntries(Object.entries(phase).map(([k, p]) => [k, { count: p.count, freeMean: p.free / p.count, targetsMean: p.targets / p.count }])) };
}
function summaryTurn(a) { return a.length ? a.map(r => r.turn).sort((a, b) => a - b)[Math.floor(a.length / 2)] : null; }
if (!isMainThread) {
  const { label, rules, depth, n, cap } = workerData;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = run(rules, `expansion-${i}`, cap, depth); delete r.state; rows.push(r);
    if ((i + 1) % 15 === 0) parentPort.postMessage({ progress: `${label}/d${depth}: ${i + 1}/${n}` });
  }
  parentPort.postMessage({ label, rules, depth, cap, rows, summary: summary(rows) });
} else if (require.main === module) {
  const n = opt('n', 60), cap = opt('cap', 500), workers = Math.max(1, Math.min(4, opt('workers', 3)));
  const jobs = configs.flatMap(([label, rules]) => [1, 2].map(depth => ({ label, rules, depth, n, cap })));
  const results = [], started = Date.now(); let pending = 0, next = 0;
  const dispatch = () => {
    while (pending < workers && next < jobs.length) {
      const job = jobs[next++]; pending++;
      const w = new Worker(__filename, { workerData: job });
      w.on('message', r => { if (r.progress) console.log(r.progress); else { results.push(r); console.log(JSON.stringify({ label: r.label, depth: r.depth, ...r.summary })); } });
      w.on('error', e => { console.error(e); process.exitCode = 1; });
      w.on('exit', () => {
        pending--; dispatch();
        if (!pending && next === jobs.length) {
          const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
          const name = `${tailExperiment ? 'tail-' : ''}comparison-${n}-${cap}.json`;
          fs.writeFileSync(path.join(dir, name), JSON.stringify({ baselineCommit: '5d7afe243ec64b0c9002ce55d405b21310585902', seedPrefix: 'expansion-', n, cap, elapsedMs: Date.now() - started, results: results.sort((a, b) => a.label.localeCompare(b.label) || a.depth - b.depth) }, null, 2));
          console.log(`saved ${name}, elapsed ${(Date.now() - started) / 1000}s`);
        }
      });
    }
  };
  dispatch();
}
module.exports = { profile, summary };
