const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out'), EVIDENCE = path.join(ROOT, 'outputs/color-challenge');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const engineCode = source => source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
function baselineEngine() {
  const source = fs.readFileSync(path.join(EVIDENCE, 'before-source.html'), 'utf8');
  const harness = fs.readFileSync(path.join(EVIDENCE, 'before-harness.js'), 'utf8');
  return new Function(engineCode(source) + harness.match(/new Function\(code \+ `([\s\S]*?)`\)\(\)/)[1])();
}
function write(name, value) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2) + '\n'); }
function metadata() {
  const source = fs.readFileSync(path.join(ROOT, 'water-sort-survival.html'));
  return { checkedAt: new Date().toISOString(), sourceSha256: sha(source), engineSha256: sha(engineCode(source.toString())), node: process.version };
}
module.exports = { ROOT, OUT, EVIDENCE, sha, engineCode, baselineEngine, write, metadata };
