const H = require('./harness.js'); const E = H.E;
const D = E.DEFAULT_RULES;
const orig = E.newState;
let PREFILL = 0;
// mulberry/hash not exported; use simple LCG seeded from string for sim only
function rng(s){ let h=2166136261>>>0; for (const ch of s){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619);} return ()=>{ h=(Math.imul(h,1664525)+1013904223)>>>0; return h/4294967296; }; }
E.newState = function(mode, seed, rules){
  const S = orig(mode, seed, rules);
  const r = rng('pre:'+seed); const k = rules.startColors;
  let placed = 0, guard = 0;
  while (placed < PREFILL && guard++ < 1000) {
    const b = Math.floor(r()*rules.bottles); if (S.bottles[b].length >= rules.cap-1) continue;
    const c = Math.floor(r()*k);
    S.bottles[b].push(c);
    // avoid pre-complete bottles
    if (E.isDone(S.bottles[b], rules.cap)) { S.bottles[b].pop(); continue; }
    placed++;
  }
  return S;
};
function trial(label, rules, prefill, T, G, n){
  PREFILL = prefill; let ok=0; const cl=[];
  for (let i=0;i<n;i++){ const S = H.runBot(E.sanitizeRules({...D,...rules}), `lv-${label}-${i}`, T); cl.push(S.clears); if (S.clears>=G) ok++; }
  cl.sort((a,b)=>a-b);
  console.log(`${label.padEnd(30)} prefill=${prefill} T=${T} G=${G} success=${(100*ok/n).toFixed(0)}% clears p50=${cl[Math.floor(n/2)]}`);
}
const n=60;
trial('easy c4', {colorEvery:0}, 6, 20, 5, n);
trial('easy c4', {colorEvery:0}, 6, 20, 6, n);
trial('mid c5', {startColors:5,maxColors:5,colorEvery:0}, 10, 25, 6, n);
trial('mid c5', {startColors:5,maxColors:5,colorEvery:0}, 10, 25, 7, n);
trial('hard c6', {startColors:6,maxColors:6,colorEvery:0}, 12, 30, 6, n);
trial('hard c6', {startColors:6,maxColors:6,colorEvery:0}, 12, 30, 8, n);
trial('hard c6 7b', {bottles:7,startColors:6,maxColors:6,colorEvery:0}, 14, 30, 8, n);
trial('ramp default', {}, 8, 30, 8, n);
