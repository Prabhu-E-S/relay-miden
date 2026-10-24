import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'node:fs';

export interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
  sessionToken?: string | undefined;
  corsOrigin: string;
  httpsKey?: string | undefined;
  httpsCert?: string | undefined;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const port = overrides.port ?? Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  const defaultDbPath = path.resolve(__dirname, '../../data/relay-miden.sqlite');
  const dbPath = overrides.dbPath ?? process.env.DB_PATH ?? defaultDbPath;
  const host = overrides.host ?? process.env.HOST ?? '0.0.0.0';
  const sessionToken = overrides.sessionToken ?? process.env.LAN_SESSION_TOKEN ?? undefined;
  const corsOrigin = overrides.corsOrigin ?? process.env.CORS_ORIGIN ?? '*';

  const defaultKeyPath = path.resolve(__dirname, '../../../../certs/dev-key.pem');
  const defaultCertPath = path.resolve(__dirname, '../../../../certs/dev-cert.pem');

  let httpsKey = overrides.httpsKey ?? process.env.SSL_KEY_FILE ?? undefined;
  let httpsCert = overrides.httpsCert ?? process.env.SSL_CRT_FILE ?? undefined;

  if (!httpsKey && process.env.HTTPS === 'true' && fs.existsSync(defaultKeyPath)) {
    httpsKey = defaultKeyPath;
  }
  if (!httpsCert && process.env.HTTPS === 'true' && fs.existsSync(defaultCertPath)) {
    httpsCert = defaultCertPath;
  }

  return {
    port,
    host,
    dbPath,
    sessionToken,
    corsOrigin,
    httpsKey,
    httpsCert,
  };
}
