// Selection is explicit and conservative: the one stronger trial did not lower the capped count.
const fs=require('fs'),path=require('path');
const {E}=require('../../harness');
const {OUT,write,metadata}=require('./common');
const initial=JSON.parse(fs.readFileSync(path.join(OUT,'comparison.json'))),tuning=JSON.parse(fs.readFileSync(path.join(OUT,'tuning.json')));
const chosen=initial.results.find(r=>r.label==='full'&&r.depth===2),trial=tuning.results.find(r=>r.depth===2);
if(!chosen||!trial||chosen.rows.length!==40||trial.rows.length!==40)throw Error('Incomplete comparisons');
if(trial.summary.capped!==chosen.summary.capped)throw Error('Review selection against actual new results before rerunning this decision');
const rules=E.sanitizeRules(chosen.rules);
if(E.rulesSig(rules)!==E.rulesSig(E.sanitizeRules(E.ENDLESS_RULES)))throw Error('Default curve does not match selection');
write('selection.json',{...metadata(),label:'full',rules,signature:E.rulesSig(rules),
  reason:'The bounded 15% trial also capped 24/40; no additional survival-pressure benefit established, retain the lower 12% candidate.',
  baselineCapped:initial.results.find(r=>r.label==='baseline'&&r.depth===2).summary.capped,
  selectedCapped:chosen.summary.capped,tunedCapped:trial.summary.capped,
  releaseBalanceApproved:false,humanFunValidated:false});
console.log('Selected original 12% maximum; balance remains provisional');
