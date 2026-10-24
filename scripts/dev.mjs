import { spawn } from 'node:child_process';

// Use npm's JavaScript entrypoint to avoid Windows shell quoting differences.
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Start development with npm run dev.');
const children = ['@relay-miden/web', '@relay-miden/server'].map((workspace) =>
  spawn(process.execPath, [npm, 'run', 'dev', '-w', workspace], { stdio: 'inherit' }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 0));
}
