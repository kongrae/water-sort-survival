// Second patch: optional cup lifetime (spareTurns, 0 = until the run ends). A "cracked" cup breaks once it is
// empty and spareTurns turns have passed since it was granted, so liquid is never destroyed.
const fs = require('fs');
const f = __dirname + '/water-sort-survival.html';
let h = fs.readFileSync(f, 'utf8'); let n = 0;
function rep(a, b) { if (!h.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); h = h.replace(a, b); n++; }
rep(`spare: false, spareCap: 1, spareFrom: 15, spareMaxEmpty: 0, spareMaxFree: 5, spareSticky: false };`,
`spare: false, spareCap: 1, spareFrom: 15, spareMaxEmpty: 0, spareMaxFree: 5, spareSticky: false, spareTurns: 0 };`);
rep(`    spareSticky: !!r.spareSticky,
  };`, `    spareSticky: !!r.spareSticky,
    spareTurns: num(r.spareTurns, 0, 500, D.spareTurns),
  };`);
rep(`function checkStuck(S) {
  S.stuck = null;
  if (!S.over`, `function checkStuck(S) {
  S.stuck = null;
  if (S.spare && S.rules.spareTurns && !S.spare.length && S.turn - S.spareTurn >= S.rules.spareTurns) S.spare = null;
  if (!S.over`);
fs.writeFileSync(f, h); console.log('replacements:', n);
