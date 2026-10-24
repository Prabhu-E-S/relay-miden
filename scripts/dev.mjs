import { spawn } from 'node:child_process';

const isLan = process.argv.includes('--lan') || process.env.LAN === 'true';
const isHttps = process.argv.includes('--https') || process.env.HTTPS === 'true';

const env = {
  ...process.env,
  ...(isLan || isHttps ? { HOST: '0.0.0.0', VITE_HOST: '0.0.0.0' } : {}),
  ...(isHttps ? { HTTPS: 'true' } : {}),
};

if (isHttps) {
  console.log('[dev] Starting Relay Miden in SECURE LAN (HTTPS) mode on 0.0.0.0...');
} else if (isLan) {
  console.log('[dev] Starting Relay Miden in LAN mode on 0.0.0.0...');
} else {
  console.log('[dev] Starting Relay Miden in localhost development mode...');
}

// Use npm's JavaScript entrypoint to avoid Windows shell quoting differences.
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Start development with npm run dev.');
const children = ['@relay-miden/web', '@relay-miden/server'].map((workspace) =>
  spawn(process.execPath, [npm, 'run', 'dev', '-w', workspace], { stdio: 'inherit', env }),
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
