// Verify the ordinary public URL, not just a cache-busted request or a successful push.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '../..'), URL = 'https://kongrae.github.io/water-sort-survival/';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
async function main() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: BASE, encoding: 'utf8' }).trim();
  const expected = execFileSync('git', ['-C', path.join(BASE, 'outputs/pages'), 'show', 'HEAD:index.html']);
  const replies = await Promise.all([URL, URL+'version.json'].map(u => fetch(u, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })));
  const html = Buffer.from(await replies[0].arrayBuffer());
  const version = JSON.parse((await replies[1].text()).replace(/^\uFEFF/, ''));
  const result = { checkedAt: new Date().toISOString(), url: URL, status: replies.map(r => r.status),
    sourceCommit: commit, deployedCommit: version.sourceCommit, expectedHash: sha(expected), publicHash: sha(html),
    pass: replies.every(r => r.ok) && version.sourceCommit === commit && sha(expected) === sha(html) };
  const out = path.join(BASE, 'outputs/mobile-viewport');fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'deployment.json'), JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify(result));process.exitCode = result.pass ? 0 : 1;
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
