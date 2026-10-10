const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out'), EVIDENCE = path.join(ROOT, 'outputs/late-pressure');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const engineCode = source => source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
function baselineEngine() {
  const source = baselineFile('before-source.html', 'water-sort-survival.html');
  const harness = baselineFile('before-harness.js', 'harness.js');
  const exports = harness.match(/new Function\(code \+ `([\s\S]*?)`\)\(\)/)[1];
  return new Function(engineCode(source) + exports)();
}
function baselineFile(copy, repositoryPath) {
  const file = path.join(EVIDENCE, copy);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const baseline = JSON.parse(fs.readFileSync(path.join(OUT, 'baseline.json'), 'utf8'));
  return require('child_process').execFileSync('git', ['show', baseline.commit + ':' + repositoryPath], {cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});
}
function baselineBot(E) {
  const module = { exports: {} }, helpers = require('../../harness');
  const code = baselineFile('before-bots.js', 'research/expansion/bots.js');
  new Function('require', 'module', code)(name => {
    if (name !== '../../harness') throw Error('Unexpected baseline dependency');
    return { ...helpers, E };
  }, module);
  return module.exports;
}
function write(name, value) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2) + '\n');
}
function metadata() {
  const source = fs.readFileSync(path.join(ROOT, 'water-sort-survival.html'), 'utf8');
  return { checkedAt: new Date().toISOString(), sourceSha256: sha(source), engineSha256: sha(engineCode(source)),
    botSha256: sha(fs.readFileSync(path.join(ROOT, 'research/expansion/bots.js'))), node: process.version };
}
module.exports = { ROOT, OUT, EVIDENCE, sha, engineCode, baselineEngine, baselineBot, write, metadata };
