const {E}=require('../../harness'),{baselineEngine}=require('./common');
const baseline=baselineEngine().ENDLESS_RULES;
const full={...baseline,lateGrowthVersion:2,maxColors:13,growthTable:E.SCORE_FULL_GROWTH_V2};
const pressure=values=>E.PRESSURE_V1.concat([30000,40000,70000,100000].map((score,i)=>({score,triplePct:values[i],tripleMonoPct:10})));
const configurations={baseline,color:{...full,growthTable:full.growthTable.map(row=>({...row,bottles:Math.min(9,row.bottles)}))},A:full,
 B:{...full,pressureTable:pressure([12,14,17,20])},C:{...full,pressureTable:pressure([12,16,22,28])},D:{...full,pressureTable:pressure([12,13,15,18])}};
const protocol={depth:2,cap:1500,tuneN:20,finalN:40,holdoutN:20,prefix:{tune:'full-board-tune-20261011-',final:'full-board-final-20261011-',holdout:'full-board-holdout-20261011-'},
 screening:{cappedTarget:[.1,.4],cappedWarning:.5,bottle12ReachWarning:.2,color50DeathWarning:.3,bottle12ObservedSurvivalTarget:[100,500]},
 conditional:{prefix:'full-board-final-20261011-',n:40,cap:1000,checkpointBefore:30000},maxAdditionalCandidates:1};
module.exports={configurations,protocol};
