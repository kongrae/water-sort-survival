// Verify the actual CDN response, not just a successful push or HTTP 200.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '..'), SITE = 'https://kongrae.github.io/water-sort-survival/';
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
async function main() {
  const commit = execFileSync('git',['rev-parse','HEAD'],{cwd:BASE,encoding:'utf8'}).trim();
  const suffix = '?verify='+Date.now();
  const [page,version] = await Promise.all([
    fetch(SITE+suffix,{signal:AbortSignal.timeout(30000)}),
    fetch(SITE+'version.json'+suffix,{signal:AbortSignal.timeout(30000)})
  ]);
  if(!page.ok||!version.ok)throw Error('Public response: HTML '+page.status+', version '+version.status);
  const bytes = Buffer.from(await page.arrayBuffer());
  const release = JSON.parse((await version.text()).replace(/^\uFEFF/,''));
  const localHash = hash(fs.readFileSync(path.join(BASE,'dist/index.html'))), publicHash = hash(bytes);
  const html = bytes.toString('utf8'), engine = html.match(/<script id="engine">([\s\S]*?)<\/script>/)?.[1];
  const checks = {
    exactBuild:localHash===publicHash,
    exactSourceCommit:release.sourceCommit===commit,
    localizedRuntime:html.includes('<script id="i18n">')&&html.includes("['hi', 'हिन्दी']")&&html.includes("['id', 'Bahasa Indonesia']"),
    oneTitle:(html.match(/<title>/g)||[]).length===1,
    engineUnchanged:!!engine&&hash(engine)==='1797179475c5812719a0f3555fb5fb654e3f31770a401b3db2025876dc22b832'
  };
  const report = {checkedAt:new Date().toISOString(),url:SITE,expectedCommit:commit,release,localHash,publicHash,checks};
  const out = path.join(BASE,'outputs/i18n');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'public.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  process.exitCode = Object.values(checks).every(Boolean)?0:1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
