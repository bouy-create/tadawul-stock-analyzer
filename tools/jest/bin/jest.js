#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--test', '__tests__/*.js', '__tests__/*.node.test.js'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
