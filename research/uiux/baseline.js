// Capture the working source, not HEAD: previous feature work may be uncommitted.
// node research/uiux/baseline.js --capture (once, before editing); without flag checks engine identity.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const base = path.resolve(__dirname, '../..');
const out = path.join(base, 'outputs/uiux');
const metaFile = path.join(__dirname, 'baseline.json');
const source = fs.readFileSync(path.join(base, 'water-sort-survival.html'), 'utf8');
const engine = source.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!engine) throw new Error('Missing engine block');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
if (process.argv.includes('--capture')) {
  if (fs.existsSync(metaFile)) throw new Error('Baseline already exists; refusing to overwrite');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'before-source.html'), source);
  execFileSync(process.execPath, [path.join(base, 'build-pages.js'), path.join(out, 'before-site')], { stdio: 'inherit' });
  fs.writeFileSync(metaFile, JSON.stringify({
    date: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: base, encoding: 'utf8' }).trim(),
    status: execFileSync('git', ['status', '--short'], { cwd: base, encoding: 'utf8' }),
    engineSha256: hash(engine[1]), sourceSha256: hash(source), snapshot: 'outputs/uiux/before-source.html',
  }, null, 2) + '\n');
}
const saved = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
const same = hash(engine[1]) === saved.engineSha256;
console.log(`Engine SHA-256 ${hash(engine[1])}: ${same ? 'UNCHANGED' : 'CHANGED'}`);
if (!same) process.exitCode = 1;
