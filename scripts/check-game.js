// Read-only regression entry point. Run from any directory: node scripts/check-game.js
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const checks = ['engine-test.js', 'engine-test-v1.js', 'test-v2.js', 'tests/delivery-regression.js'];
let failures = 0;
for (const file of checks) {
  console.log('\nCHECK ' + file);
  const result = spawnSync(process.execPath, [path.join(root, file)], {
    cwd: root, stdio: 'inherit', timeout: 120000,
  });
  if (result.error || result.status !== 0) {
    failures++;
    console.error('FAILED ' + file + ': ' + (result.error?.message || result.signal || 'exit ' + result.status));
  }
}
console.log('\nGame regression: ' + checks.length + ' suites, ' + failures + ' failed');
process.exitCode = failures ? 1 : 0;
