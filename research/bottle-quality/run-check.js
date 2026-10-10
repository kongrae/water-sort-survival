// Run existing checks without overwriting their historical evidence.
// node research/bottle-quality/run-check.js before|after perf|fx|hud|hold|i18n|mobile|real|engine
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');
const BASE = path.resolve(__dirname, '../..');
const task = process.argv.find(a => a.startsWith('--task='))?.slice(7) || 'bottle-quality';
if (!/^[a-z][a-z0-9-]*$/.test(task)) throw Error('Invalid evidence task');
const DATA = path.join(BASE, 'research', task, 'out'), OUT = path.join(BASE, 'outputs', task);
const [phase, name] = process.argv.slice(2);
if (!/^(before|after|probe[-\w]*)$/.test(phase || '')) throw Error('Expected before, after or probe-name');
const configs = {
  perf: ['research/feel/perf.js', ['research/feel/out/perf.json']],
  fx: ['uitest/fx-polish.js', ['outputs/fx-polish']],
  hud: ['uitest/compact-hud.js', ['outputs/hud-balance', 'research/hud-balance/out/ui-after.json']],
  hold: ['uitest/hold-triple.js', ['outputs/hold-triple', 'research/hold-triple/out/browser.json']],
  i18n: ['uitest/i18n.js', ['outputs/i18n', 'research/i18n/browser.json']],
  mobile: ['uitest/mobile-viewport.js', ['outputs/mobile-viewport']],
  real: ['uitest/real.js', []],
  engine: ['test-v2.js', []],
  feel: ['uitest/run.js', ['research/feel/out/feel-full.json', 'research/feel/out/feel-reduce.json'], ['feel', '--motion=both']],
  presentation: ['uitest/presentation-audit.js', [], ['--out=outputs/' + task + '/presentation', '--data=research/' + task + '/out/presentation']],
  holdEngine: ['research/hold-triple/engine-test.js', []],
  expansionEngine: ['research/expansion/engine-test.js', []]
};
const config = configs[name]; if (!config) throw Error('Unknown check');
const extraArgs = process.argv.slice(4).filter(a => !a.startsWith('--task='));
fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const sourceArg = extraArgs.find(a => a.startsWith('--source='));
const source = fs.readFileSync(sourceArg ? path.resolve(sourceArg.slice(9)) : path.join(BASE, 'water-sort-survival.html'));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
if (phase === 'before' && !fs.existsSync(path.join(OUT, 'before-source.html'))) {
  fs.writeFileSync(path.join(OUT, 'before-source.html'), source);
  fs.writeFileSync(path.join(DATA, 'baseline.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: BASE, encoding: 'utf8' }).trim(), sourceSha256: sha(source), engineSha256: sha(source.toString().match(/<script id="engine">([\s\S]*?)<\/script>/)[1]) }, null, 2) + '\n');
}
const files = () => [...config[1], 'research/hold-triple/out/distribution.json'].flatMap(p => {
  const abs = path.join(BASE, p);
  return fs.existsSync(abs) && fs.statSync(abs).isDirectory()
    ? fs.readdirSync(abs, { withFileTypes: true }).filter(e => e.isFile()).map(e => path.join(abs, e.name)) : [abs];
});
const backup = new Map(files().map(p => [p, fs.existsSync(p) ? fs.readFileSync(p) : null]));
const result = spawnSync(process.execPath, [config[0], ...(config[2] || []), ...extraArgs], { cwd: BASE, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
try {
  for (const file of files()) if (fs.existsSync(file)) {
    const previous = backup.get(file), content = fs.readFileSync(file);
    if (previous && content.equals(previous)) continue;
    const dest = path.join(OUT, phase, name, path.relative(BASE, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content);
    if (file.endsWith('.json')) {
      const data = path.join(DATA, phase + '-' + name + '-' + path.basename(file)); fs.writeFileSync(data, content);
    }
  }
} finally {
  // Restore only pre-existing files. Newly generated ignored artifacts may stay in place.
  for (const [file, bytes] of backup) if (bytes) fs.writeFileSync(file, bytes);
}
const log = { checkedAt: new Date().toISOString(), command: ['node',config[0],...(config[2]||[]),...extraArgs].join(' '), sourceSha256: sha(source), exitCode: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr };
fs.writeFileSync(path.join(DATA, phase + '-' + name + '-command.json'), JSON.stringify(log, null, 2) + '\n');
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exitCode = result.status ?? 1;
