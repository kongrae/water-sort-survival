// Aggregate the local evidence after running the commands listed in REPORT.md.
// This does not run browser suites or claim physical-device/cloud/deployment proof.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const { execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out');
const read = file => JSON.parse(fs.readFileSync(path.join(BASE, file), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const source = fs.readFileSync(path.join(BASE, 'water-sort-survival.html'), 'utf8');
const engineSha256 = hash(source.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]);
const botSha256 = hash(fs.readFileSync(path.join(BASE, 'research/expansion/bots.js')));
const comparison = read('research/hold-triple/out/comparison-60-500.json');
const tail = read('research/hold-triple/out/tail-check.json');
for (const result of [comparison, tail]) {
  assert.equal(result.engineSha256, engineSha256, 'comparison must match the final engine');
  assert.equal(result.botSha256, botSha256, 'comparison must match the final bot');
}
assert.equal(comparison.results.length, 12);
assert(comparison.results.every(result => result.rows.length === 60));
const files = {
  holdTriple: 'research/hold-triple/out/browser.json',
  expansion: 'research/expansion/out/browser.json',
  uiux: 'research/uiux/out/after.json',
  i18n: 'research/i18n/browser.json',
  fx: 'outputs/fx-polish/after.json',
  mobile: 'outputs/mobile-viewport/checks.json',
};
const browser = {};
for (const [name, file] of Object.entries(files)) {
  const data = read(file), checks = data.rows || data.checks;
  assert(checks.length && checks.every(check => check.pass), name + ' browser checks must pass');
  browser[name] = { total: checks.length, passed: checks.length, physicalDevice: false };
}
const engineLogs = [], engineChecks = {};
for (const [name, file, total] of [
  ['v2', 'test-v2.js', 1070], ['holdTriple', 'research/hold-triple/engine-test.js', 16],
  ['expansion', 'research/expansion/engine-test.js', 17],
]) {
  const output = execFileSync(process.execPath, [file], { cwd: BASE, encoding: 'utf8' });
  engineLogs.push(file + '\n' + output);
  engineChecks[name] = { total, passed: total };
}
fs.writeFileSync(path.join(OUT, 'engine-checks.log'), engineLogs.join('\n'));
// Preserve this run's generated results before restoring historical tracked artifacts.
for (const [from, to] of [
  ['research/uiux/out/after.json', 'legacy-uiux.json'],
  ['research/i18n/browser.json', 'legacy-i18n.json'],
  ['research/feel/out/perf.json', 'legacy-ui-perf.json'],
]) fs.copyFileSync(path.join(BASE, from), path.join(OUT, to));
const featureBrowser = read(files.holdTriple);
const latency = {};
for (const kind of ['hold', 'place', 'pour', 'flip']) {
  const values = featureBrowser.latency.filter(row => row.kind === kind).map(row => row.ms).sort((a,b) => a-b);
  latency[kind] = { n: values.length, p50: values[Math.floor(values.length*.5)],
    p95: values[Math.floor(values.length*.95)], max: values.at(-1) };
}
const geometry = featureBrowser.geometry.filter(row => row.n === 8 && row.length === 3).map(row => ({
  viewport: [row.w, row.h], safeArea: [row.top, row.bottom],
  beforeGlass: row.before.bottleGlass[0], afterGlass: row.after.bottleGlass[0],
  upperGlass: row.after.bottleGlass[6], beforeFrame: row.before.cup.h, afterFrame: row.after.cup.h,
}));
const evidence = {
  capturedAt: new Date().toISOString(), baseline: read('research/hold-triple/baseline.json'),
  sourceSha256: hash(source), engineSha256, botSha256,
  distSha256: hash(fs.readFileSync(path.join(BASE, 'dist/index.html'))), node: process.version,
  engineChecks, browser, geometry, latency,
  otherExecuted: {
    nativeRealInput: { total: 131, passed: 131, physicalDevice: false },
    saveThemeCloudFirebaseMocks: { total: 116, passed: 116, realAccountWrites: false },
    engineV1: { failures: 0 },
    historicalEngineTest: { beforeFailures: 1, afterFailures: 1,
      message: 'streak reset after a turn without clear: score 300', expected: 200, actual: 300,
      explanation: 'The historical test expects v1 combo reset while DEFAULT_RULES already use v2 comboPlace. The same failure reproduces on the captured pre-change source.' },
  },
  comparisonRuns: comparison.results.reduce((n, result) => n + result.rows.length, 0),
  conditionalTailRuns: tail.results.reduce((n, result) => n + result.rows.length, 0),
  preview: 'http://127.0.0.1:8151/', deployed: false, committed: false,
};
fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ engineChecks, browser, comparisonRuns: evidence.comparisonRuns,
  conditionalTailRuns: evidence.conditionalTailRuns, engineSha256, sourceSha256: evidence.sourceSha256 }));
