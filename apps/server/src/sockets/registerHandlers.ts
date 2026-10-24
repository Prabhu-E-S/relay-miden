import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HTTPServer } from 'node:http';
import {
  LanDeviceRegistrationSchema,
  LanOperationSubmitSchema,
  LanSyncRequestSchema,
  LAN_PROTOCOL_VERSION,
} from '@relay-miden/shared';
import type { ServerConfig } from '../config/env.js';
import type { SyncService } from '../services/syncService.js';

export interface SocketsSetupResult {
  io: SocketIOServer;
  serverDeviceId: string;
}

export function registerSocketHandlers(
  httpServer: HTTPServer,
  syncService: SyncService,
  config: ServerConfig,
  serverDeviceId: string,
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: false,
    },
    transports: ['websocket', 'polling'],
  });

  const registeredSockets = new Map<string, string>(); // socket.id -> deviceId

  io.on('connection', (socket: Socket) => {
    socket.on('device:register', (data: unknown) => {
      const parsed = LanDeviceRegistrationSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('server:error', {
          message: 'Invalid device registration data.',
          code: 'REGISTRATION_SCHEMA_INVALID',
        });
        return;
      }

      const reg = parsed.data;

      // Access control check: if LAN_SESSION_TOKEN is configured on host, verify it
      if (config.sessionToken && reg.sessionToken !== config.sessionToken) {
        socket.emit('server:error', {
          message: 'Invalid or missing LAN session token.',
          code: 'UNAUTHORIZED_SESSION',
        });
        return;
      }

      if (reg.protocolVersion !== LAN_PROTOCOL_VERSION) {
        socket.emit('server:error', {
          message: `Unsupported LAN protocol version ${reg.protocolVersion}. Expected ${LAN_PROTOCOL_VERSION}.`,
          code: 'UNSUPPORTED_PROTOCOL_VERSION',
        });
        return;
      }

      syncService.devices.registerOrUpdate(reg);
      registeredSockets.set(socket.id, reg.deviceId);

      socket.emit('device:registered', {
        success: true,
        serverDeviceId,
        protocolVersion: LAN_PROTOCOL_VERSION,
        currentSequence: syncService.operations.getCurrentSequence(),
        message: 'Device successfully registered on local LAN server.',
      });
    });

    socket.on('sync:request', (data: unknown) => {
      const deviceId = registeredSockets.get(socket.id);
      if (!deviceId) {
        socket.emit('server:error', {
          message: 'Device must be registered before requesting synchronization.',
          code: 'NOT_REGISTERED',
        });
        return;
      }

      const parsed = LanSyncRequestSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('server:error', {
          message: 'Invalid sync request payload.',
          code: 'SYNC_REQUEST_INVALID',
        });
        return;
      }

      syncService.devices.touchDevice(deviceId);
      const batch = syncService.getSyncBatch(parsed.data.cursor ?? 0, parsed.data.limit ?? 100);
      socket.emit('sync:operations', batch);
    });

    socket.on('operation:submit', async (data: unknown) => {
      const deviceId = registeredSockets.get(socket.id);
      if (!deviceId) {
        socket.emit('server:error', {
          message: 'Device must be registered before submitting operations.',
          code: 'NOT_REGISTERED',
        });
        return;
      }

      const parsed = LanOperationSubmitSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('server:error', {
          message: 'Invalid operation submission envelope.',
          code: 'OPERATION_ENVELOPE_INVALID',
        });
        return;
      }

      const submit = parsed.data;
      if (submit.deviceId !== deviceId) {
        socket.emit('operation:rejected', {
          requestId: submit.requestId,
          operationId:
            submit.operation.type === 'TASK_CREATE'
              ? submit.operation.operationId
              : submit.operation.update.operationId,
          taskId:
            submit.operation.type === 'TASK_CREATE'
              ? submit.operation.taskId
              : submit.operation.update.taskId,
          classification: 'UNAUTHORIZED',
          reason: 'Submitted device ID does not match registered socket session.',
        });
        return;
      }

      syncService.devices.touchDevice(deviceId);

      try {
        const result = await syncService.processOperation(
          submit.requestId,
          deviceId,
          submit.operation,
        );

        if (result.success) {
          // Acknowledge sender only AFTER durable persistence
          socket.emit('operation:accepted', result.accepted);

          // Broadcast to other connected devices
          if (result.broadcast) {
            socket.broadcast.emit('operation:broadcast', result.broadcast);
          }
        } else {
          socket.emit('operation:rejected', result.rejected);
        }
      } catch (err) {
        socket.emit('server:error', {
          message: err instanceof Error ? err.message : 'Internal error processing operation.',
          code: 'INTERNAL_ERROR',
        });
      }
    });

    socket.on('disconnect', () => {
      const deviceId = registeredSockets.get(socket.id);
      if (deviceId) {
        syncService.devices.touchDevice(deviceId);
        registeredSockets.delete(socket.id);
      }
    });
  });

  return io;
}
