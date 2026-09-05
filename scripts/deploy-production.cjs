#!/usr/bin/env node
// Windows-safe launcher for scripts/deploy-production.sh.
//
// The deploy script itself is a plain bash script that calls `set -euo pipefail`
// (line 20). On Windows, a bare `bash` from PATH often resolves to the WSL
// launcher (C:\WINDOWS\system32\bash.exe), which rejects `pipefail` as an
// invalid option, so the deploy script dies before doing anything.
//
// This driver selects a bash that supports `pipefail`:
//   - On Windows it prefers Git Bash (C:\Program Files\Git\bin\bash.exe) and
//     falls back to whatever `bash` is on PATH if Git Bash is not installed.
//   - On Linux/macOS it just uses `bash` from PATH.
//
// It then spawns the existing scripts/deploy-production.sh unchanged, with the
// repository root as the working directory, inheriting stdio (so the script's
// interactive [y/N] confirmation works) and propagating the exit code.

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// The repository root = two directories up from this file (scripts/).
const repoRoot = path.resolve(__dirname, '..');

const GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
];

function resolveBash() {
  if (process.platform === 'win32') {
    for (const candidate of GIT_BASH_CANDIDATES) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return 'bash';
}

function main() {
  const bash = resolveBash();

  // Resolve the bash binary so `spawn` finds it even when it is a full path.
  const resolved = path.isAbsolute(bash)
    ? bash
    : (spawnSync(bash === 'bash' ? 'which' : 'where', [bash], { encoding: 'utf8' }).stdout || '').split(/\r?\n/)[0] || 'bash';

  const script = path.join(repoRoot, 'scripts', 'deploy-production.sh');
  console.log(`[deploy-launcher] bash      : ${resolved}`);
  console.log(`[deploy-launcher] script    : ${script}`);
  console.log(`[deploy-launcher] cwd       : ${repoRoot}`);
  console.log(`[deploy-launcher] args      : ${JSON.stringify(process.argv.slice(2))}`);

  const child = spawn(resolved, [script, ...process.argv.slice(2)], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    console.error(`[deploy-launcher] failed to spawn bash (${resolved}): ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[deploy-launcher] deploy terminated by signal ${signal}`);
      process.exit(1);
    }
    process.exit(code == null ? 1 : code);
  });
}

main();
