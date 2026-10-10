// The baseline copies are taken before source mutation. Never overwrite them with the new implementation.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { ROOT, EVIDENCE, sha, engineCode, write } = require('./common');
const source = fs.readFileSync(path.join(EVIDENCE, 'before-source.html'));
const commit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const compare = cp.execFileSync('git', ['show', commit + ':research/hold-triple/compare.js'], { cwd: ROOT });
fs.writeFileSync(path.join(EVIDENCE, 'before-compare.js'), compare);
write('baseline.json', { checkedAt: new Date().toISOString(), commit, sourceSha256: sha(source), engineSha256: sha(engineCode(source.toString())),
  harnessSha256: sha(fs.readFileSync(path.join(EVIDENCE, 'before-harness.js'))),
  botSha256: sha(fs.readFileSync(path.join(EVIDENCE, 'before-bots.js'))), comparisonSha256: sha(compare) });
console.log('Captured original source/engine/harness/bot/comparison hashes');
