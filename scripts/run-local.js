const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const value = line.trim();
    const separator = value.indexOf('=');
    if (!value || value.startsWith('#') || separator < 1) continue;
    const key = value.slice(0, separator).trim();
    const entry = value.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = entry;
  }
}
const backendEnvFile = path.join(root, 'backend', '.env');
if (fs.existsSync(backendEnvFile)) {
  for (const line of fs.readFileSync(backendEnvFile, 'utf8').split(/\r?\n/)) {
    const value = line.trim();
    const separator = value.indexOf('=');
    if (!value || value.startsWith('#') || separator < 1) continue;
    const key = value.slice(0, separator).trim();
    const entry = value.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = entry;
  }
}

const children = [
  spawn(process.execPath, [path.join(root, 'backend/server.js')], { cwd: root, env: process.env, stdio: 'inherit' }),
  spawn(process.execPath, [path.join(root, 'scripts/frontend-server.js')], { cwd: root, env: process.env, stdio: 'inherit' })
];
let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  setTimeout(() => process.exit(code), 250);
}
for (const child of children) child.on('exit', (code) => { if (!stopping && code !== 0) stopAll(code || 1); });
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
