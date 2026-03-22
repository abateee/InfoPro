'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const testDir = __dirname;
const files = fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js'));
let failed = 0;

for (const file of files) {
  const full = path.join(testDir, file);
  console.log('\n--- ' + file + ' ---');
  const result = spawnSync(process.execPath, [full], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, INFONET_MODE: 'mock' }
  });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error('\n' + failed + ' test file(s) failed');
  process.exit(1);
}
console.log('\nAll tests passed');
