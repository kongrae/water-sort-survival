const { E, runBot } = require('./harness.js');
const D = E.DEFAULT_RULES;
const q = (arr, p) => { arr = arr.slice().sort((a,b)=>a-b); return arr[Math.min(arr.length-1, Math.floor(p*arr.length))]; };
function stats(label, rules, n, maxTurns) {
  const turns=[], clears=[], c20=[], c30=[], maxStreak=[];
  for (let i=0;i<n;i++){
    // track clears at turn 20/30 by running stepwise: approximate via turnLog
    const S = runBot(E.sanitizeRules({...D,...rules}), `m2-${label}-${i}`, maxTurns);
    turns.push(S.turn); clears.push(S.clears); maxStreak.push(S.maxStreak);
    const log = S.turnLog.concat([S.turnClears]);
    c20.push(log.slice(0,20).reduce((a,b)=>a+b,0));
    c30.push(log.slice(0,30).reduce((a,b)=>a+b,0));
  }
  console.log(`${label.padEnd(24)} turns p50=${q(turns,.5)} clears p10/p50/p90=${q(clears,.1)}/${q(clears,.5)}/${q(clears,.9)} clears@20 p50=${q(c20,.5)} @30 p25/p50/p75=${q(c30,.25)}/${q(c30,.5)}/${q(c30,.75)} maxStreak p50/p90=${q(maxStreak,.5)}/${q(maxStreak,.9)}`);
}
stats('default', {}, 60, 400);
stats('zen 7b c5 fixed', { bottles:7, startColors:5, maxColors:5, colorEvery:0 }, 40, 300);
stats('zen 6b c4 fixed', { startColors:4, maxColors:4, colorEvery:0 }, 40, 300);
stats('zen 7b c4 fixed', { bottles:7, startColors:4, maxColors:4, colorEvery:0 }, 30, 300);
stats('zen 6b c4 automerge', { startColors:4, maxColors:4, colorEvery:0, autoMerge:true }, 30, 300);
stats('twist 7b cap5', { bottles:7, cap:5 }, 40, 400);
stats('twist 7b piece1-3', { bottles:7, pieceMax:3 }, 40, 400);
stats('twist automerge ramp10', { autoMerge:true, colorEvery:10 }, 40, 400);
stats('twist ramp40 start3', { startColors:3, colorEvery:15 }, 40, 400);
stats('twist 5b automerge', { bottles:5, autoMerge:true }, 40, 400);
