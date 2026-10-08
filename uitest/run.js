// Runs uitest scenarios in headless Chrome and prints pass/fail counts. Test-only.
// usage: node uitest/run.js [scenario ...] [--motion=reduce|full|both] [--only=<variant substring>]
//   default: every scenario, both motion modes. Builds the pages first (make.js).
// Headless Chrome on this PC reports prefers-reduced-motion unless --force-prefers-no-reduced-motion is given,
// so "reduce" is the flagless run and "full" adds that flag.
// A scenario is one frame page (frame-<sc>.html) or several variants (frame-<sc>~<variant>.html), each run in its
// own browser profile because the game keeps its prefs and rules in localStorage.
// Rows a page sends as { data } (geom measurements) are saved to research/controls/out/<sc>-<motion>.json.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const DIR = __dirname;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ALL = ['fresh', 'existing', 'v1saves', 'v1daily', 'themes', 'legacy', 'cloud', 'firebase', 'controls', 'geom'];
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const motionArg = opt('motion', 'both'), only = opt('only', '');
const motions = motionArg === 'both' ? ['reduce', 'full'] : [motionArg];
execFileSync(process.execPath, [path.join(DIR, 'make.js')], { stdio: 'ignore' });
const files = fs.readdirSync(DIR);
const pagesOf = sc => files.filter(f => f === `frame-${sc}.html` || (f.startsWith(`frame-${sc}~`) && f.endsWith('.html')))
  .filter(f => !only || f.includes(only)).sort();
let scenarios = args.filter(a => !a.startsWith('--'));
if (!scenarios.length) scenarios = ALL.filter(sc => pagesOf(sc).length);
const decode = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
let failed = 0;
for (const motion of motions) {
  for (const sc of scenarios) {
    let pass = 0, total = 0, missingDone = [];
    const bad = [], data = [];
    for (const page of pagesOf(sc)) {
      const variant = page.slice(6, -5);
      const prof = path.join(DIR, `prof-${variant}-${motion}`);
      fs.rmSync(prof, { recursive: true, force: true });
      const sizeFile = path.join(DIR, page.replace(/\.html$/, '.size'));
      const size = fs.existsSync(sizeFile) ? fs.readFileSync(sizeFile, 'utf8').trim() : '900,1000';
      const flags = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files',
        `--user-data-dir=${prof}`, `--window-size=${size}`, '--virtual-time-budget=120000'];
      if (motion === 'full') flags.push('--force-prefers-no-reduced-motion');
      let out = '';
      try {
        out = execFileSync(CHROME, flags.concat(['--dump-dom', 'file:///' + path.join(DIR, page).replace(/\\/g, '/')]),
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20, timeout: 300000 });
      } catch (e) { out = e.stdout || ''; }
      fs.writeFileSync(path.join(DIR, `out-${variant}-${motion}.html`), out);
      const m = out.match(/<pre id="out">([\s\S]*?)<\/pre>/);
      const rows = (m ? decode(m[1]) : '').trim().split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch (e) { return { name: 'unparsable: ' + l.slice(0, 80), pass: false }; } });
      for (const r of rows) if (r.data) data.push(r.data);
      const checks = rows.filter(r => !r.done && !r.data);
      total += checks.length; pass += checks.filter(r => r.pass).length;
      bad.push(...checks.filter(r => !r.pass));
      if (!rows.some(r => r.done)) missingDone.push(variant);
    }
    if (data.length) {
      const outDir = path.join(DIR, '..', 'research', 'controls', 'out');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${sc}-${motion}.json`), JSON.stringify(data, null, 1));
    }
    const ok = !bad.length && !missingDone.length && total > 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${sc.padEnd(9)} ${motion.padEnd(6)} pass ${pass}/${total}${missingDone.length ? ` (no done: ${missingDone.join(', ')})` : ''}`);
    for (const r of bad) console.log(`       - ${r.name}${r.detail ? ' :: ' + String(r.detail).slice(0, 160) : ''}`);
  }
}
process.exitCode = failed ? 1 : 0;
