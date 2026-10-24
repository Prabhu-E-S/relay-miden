import { createServer, type Server as HTTPServer } from 'node:http';
import express, { type Express } from 'express';
import cors from 'cors';
import type { DatabaseSync } from 'node:sqlite';
import type { Server as SocketIOServer } from 'socket.io';
import type { HealthResponse } from '@relay-miden/shared';
import { loadConfig, type ServerConfig } from './config/env.js';
import { createDatabaseConnection } from './db/connection.js';
import { SyncService } from './services/syncService.js';
import { registerSocketHandlers } from './sockets/registerHandlers.js';

export interface ServerInstance {
  app: Express;
  httpServer: HTTPServer;
  io: SocketIOServer;
  syncService: SyncService;
  serverDeviceId: string;
  config: ServerConfig;
  db: DatabaseSync;
  close: () => Promise<void>;
}

export function createServerInstance(overrides: Partial<ServerConfig> = {}): ServerInstance {
  const config = loadConfig(overrides);
  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      methods: ['GET', 'POST'],
    }),
  );

  app.get('/health', (_request, response) => {
    const health: HealthResponse = { status: 'ok', service: 'relay-miden-server', phase: 2 };
    response.set('Cache-Control', 'no-store').json(health);
  });

  const db = createDatabaseConnection(config.dbPath);

  // Retrieve or create persistent server device identity
  const serverDeviceIdRow = db
    .prepare("SELECT value FROM server_metadata WHERE key = 'server_device_id'")
    .get() as { value: string } | undefined;

  let serverDeviceId = serverDeviceIdRow?.value;
  if (!serverDeviceId) {
    serverDeviceId = crypto.randomUUID();
    db.prepare("INSERT INTO server_metadata (key, value) VALUES ('server_device_id', ?)").run(
      serverDeviceId,
    );
  }

  const syncService = new SyncService(db);
  const httpServer = createServer(app);
  const io = registerSocketHandlers(httpServer, syncService, config, serverDeviceId);

  const close = async () => {
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => {
          try {
            db.close();
          } catch {
            // Ignore clean closing errors
          }
          resolve();
        });
      });
    });
  };

  return {
    app,
    httpServer,
    io,
    syncService,
    serverDeviceId,
    config,
    db,
    close,
  };
}

// Default export app for backward compatibility with existing tests
export const defaultInstance = createServerInstance();
export const app = defaultInstance.app;
