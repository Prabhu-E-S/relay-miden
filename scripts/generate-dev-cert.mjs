import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const certsDir = path.resolve(__dirname, '../certs');

if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

// 1. Detect IPv4 LAN addresses
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const lanIps = getLanIps();
const hostList = ['localhost', '127.0.0.1', ...lanIps];
const keyFile = path.join(certsDir, 'dev-key.pem');
const certFile = path.join(certsDir, 'dev-cert.pem');

console.log('----------------------------------------------------');
console.log('Relay Miden — Secure LAN TLS Certificate Generator');
console.log('----------------------------------------------------');
console.log('Detected LAN IP addresses:', lanIps.length ? lanIps.join(', ') : 'None detected');
console.log('Target hostnames/IPs:', hostList.join(' '));
console.log('');

// Check for mkcert
let mkcertInstalled = false;
try {
  execSync('mkcert -version', { stdio: 'ignore' });
  mkcertInstalled = true;
} catch {
  // mkcert is not available
}

if (mkcertInstalled) {
  console.log('Found mkcert. Generating trusted development certificate...');
  try {
    execSync(`mkcert -key-file "${keyFile}" -cert-file "${certFile}" ${hostList.join(' ')}`, {
      stdio: 'inherit',
    });
    console.log(`\nSuccess! Certificates generated:\n  Key:  ${keyFile}\n  Cert: ${certFile}`);
    console.log('\nTo trust this on your mobile device:');
    console.log('1. Run: mkcert -CAROOT');
    console.log('2. Send rootCA.pem to your phone (AirDrop, email, or local server download)');
    console.log("3. Install rootCA.pem into your phone's Trusted Credentials store.");
  } catch (err) {
    console.error('mkcert execution failed:', err.message);
  }
} else {
  console.log('mkcert not found. Checking openssl...');
  let opensslFound = false;
  try {
    execSync('openssl version', { stdio: 'ignore' });
    opensslFound = true;
  } catch {
    // openssl is not available
  }

  if (opensslFound) {
    console.log('Generating local development certificate via openssl with SAN...');
    const sanList = hostList
      .map((h, i) => (h.match(/^[0-9.]+$/) ? `IP.${i + 1} = ${h}` : `DNS.${i + 1} = ${h}`))
      .join('\n');

    const cnfContent = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = US
ST = Dev
L = Local
O = Relay Miden Dev
OU = LAN Sync
CN = ${lanIps[0] || 'localhost'}

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment

[alt_names]
${sanList}
`;

    const cnfPath = path.join(certsDir, 'openssl.cnf');
    fs.writeFileSync(cnfPath, cnfContent.trim(), 'utf8');

    try {
      execSync(
        `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -config "${cnfPath}"`,
        { stdio: 'inherit' },
      );
      fs.unlinkSync(cnfPath);
      console.log(
        `\nSuccess! OpenSSL development certificates generated:\n  Key:  ${keyFile}\n  Cert: ${certFile}`,
      );
      console.log(
        '\nNOTE: For mobile browsers (Chrome on Android / Safari on iOS) to allow camera scanning',
      );
      console.log(
        'without security blocks, mkcert is strongly recommended because it installs a trusted local root CA:',
      );
      console.log('  choco install mkcert / brew install mkcert');
      console.log('  mkcert -install');
      console.log(`  mkcert -key-file "${keyFile}" -cert-file "${certFile}" ${hostList.join(' ')}`);
    } catch (err) {
      console.error('openssl failed:', err.message);
    }
  } else {
    console.log('Neither mkcert nor openssl is installed.');
    console.log('Please install mkcert (recommended): https://github.com/FiloSottile/mkcert');
    console.log('  mkcert -install');
    console.log(
      `  mkcert -key-file certs/dev-key.pem -cert-file certs/dev-cert.pem localhost 127.0.0.1 ${lanIps.join(' ')}`,
    );
  }
}
