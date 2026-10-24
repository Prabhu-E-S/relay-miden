import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import {
  taskStateHash,
  type LanDeviceRegistration,
  type LanOperationAccepted,
  type LanOperationBroadcast,
  type LanOperationRejected,
  type LanSyncBatch,
  type Task,
  type TaskUpdatePayload,
} from '@relay-miden/shared';
import { createServerInstance, type ServerInstance } from './app.js';

describe('Phase 6 LAN Server & Synchronization', () => {
  let tmpDir: string;
  let dbPath: string;
  let serverInstance: ServerInstance;
  let serverUrl: string;
  let deviceAId: string;
  let deviceBId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-miden-lan-test-'));
    dbPath = path.join(tmpDir, 'test-server.sqlite');
    deviceAId = crypto.randomUUID();
    deviceBId = crypto.randomUUID();

    serverInstance = createServerInstance({
      dbPath,
      port: 0,
      host: '127.0.0.1',
    });

    await new Promise<void>((resolve) => {
      serverInstance.httpServer.listen(0, '127.0.0.1', resolve);
    });

    const port = (serverInstance.httpServer.address() as AddressInfo).port;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await serverInstance.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on windows locks
    }
  });

  function createSocketClient(): ClientSocket {
    return ioc(serverUrl, {
      transports: ['websocket'],
      autoConnect: false,
    });
  }

  function connectAndRegister(
    client: ClientSocket,
    deviceId: string,
    displayName?: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        client.emit('device:register', {
          protocolVersion: 1,
          deviceId,
          displayName,
        });
      });
      client.on('device:registered', () => resolve());
      client.on('server:error', (err) => reject(new Error(err.message)));
      client.on('connect_error', reject);
      client.connect();
    });
  }

  it('1 & 2. server starts and health endpoint works', async () => {
    const res = await fetch(`${serverUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('relay-miden-server');
  });

  it('3. SQLite database initializes with persistent server device ID', () => {
    expect(serverInstance.serverDeviceId).toBeDefined();
    expect(serverInstance.serverDeviceId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('5. Device registration works over Socket.IO', async () => {
    const client = createSocketClient();

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        const reg: LanDeviceRegistration = {
          protocolVersion: 1,
          deviceId: deviceAId,
          displayName: 'Coordinator Alpha',
          appVersion: '0.1.0',
        };
        client.emit('device:register', reg);
      });

      client.on('device:registered', (result) => {
        try {
          expect(result.success).toBe(true);
          expect(result.protocolVersion).toBe(1);
          expect(result.serverDeviceId).toBe(serverInstance.serverDeviceId);
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          client.disconnect();
        }
      });

      client.on('server:error', (err) => reject(new Error(err.message)));
      client.connect();
    });
  });

  it('6 & 7. Invalid registration and unsupported protocol version are rejected', async () => {
    const client = createSocketClient();

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        // Send invalid protocol version
        client.emit('device:register', {
          protocolVersion: 99,
          deviceId: deviceAId,
        });
      });

      client.on('server:error', (err) => {
        try {
          expect(err.code).toBe('REGISTRATION_SCHEMA_INVALID');
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          client.disconnect();
        }
      });

      client.connect();
    });
  });

  it('8. Session token rejection when configured on host', async () => {
    const authDbPath = path.join(tmpDir, 'auth-test.sqlite');
    const authServer = createServerInstance({
      dbPath: authDbPath,
      port: 0,
      host: '127.0.0.1',
      sessionToken: 'SECRET_LAN_PASS',
    });

    await new Promise<void>((resolve) => {
      authServer.httpServer.listen(0, '127.0.0.1', resolve);
    });

    const port = (authServer.httpServer.address() as AddressInfo).port;
    const client = ioc(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => {
        // Submit without token
        client.emit('device:register', {
          protocolVersion: 1,
          deviceId: deviceAId,
        });
      });

      client.on('server:error', (err) => {
        try {
          expect(err.code).toBe('UNAUTHORIZED_SESSION');
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          client.disconnect();
          void authServer.close();
        }
      });

      client.connect();
    });
  });

  it('9 & 20. Valid operation is accepted and broadcast to other connected clients', async () => {
    const clientA = createSocketClient();
    const clientB = createSocketClient();

    await Promise.all([
      connectAndRegister(clientA, deviceAId, 'Device A'),
      connectAndRegister(clientB, deviceBId, 'Device B'),
    ]);

    const taskId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sampleTask: Task = {
      id: taskId,
      action: 'DELIVER_SUPPLIES',
      title: 'Deliver bottled water to Relief Camp',
      quantity: 50,
      unit: 'Bottles',
      location: 'Relief Camp A',
      priority: 'high',
      status: 'pending',
      instruction: {
        schemaVersion: 1,
        actionCode: 'DELIVER',
        itemCode: 'WATER',
        quantity: 50,
        unitCode: 'BOTTLE',
        locationText: 'Relief Camp A',
      },
      createdAt: now,
      updatedAt: now,
      createdBy: deviceAId,
      revision: 1,
      deletedAt: null,
    };

    const stateHash = await taskStateHash(sampleTask);

    const broadcastPromise = new Promise<LanOperationBroadcast>((resolve) => {
      clientB.on('operation:broadcast', (b: LanOperationBroadcast) => resolve(b));
    });

    const acceptedPromise = new Promise<LanOperationAccepted>((resolve) => {
      clientA.on('operation:accepted', (a: LanOperationAccepted) => resolve(a));
    });

    clientA.emit('operation:submit', {
      protocolVersion: 1,
      requestId: crypto.randomUUID(),
      deviceId: deviceAId,
      operation: {
        type: 'TASK_CREATE',
        operationId,
        taskId,
        actorId: deviceAId,
        task: sampleTask,
        resultStateHash: stateHash,
        timestamp: now,
      },
    });

    const accepted = await acceptedPromise;
    expect(accepted.operationId).toBe(operationId);
    expect(accepted.taskId).toBe(taskId);
    expect(accepted.status).toBe('APPLIED');
    expect(accepted.sequence).toBeGreaterThan(0);

    const broadcast = await broadcastPromise;
    expect(broadcast.sequence).toBe(accepted.sequence);
    expect(broadcast.operation.type).toBe('TASK_CREATE');

    clientA.disconnect();
    clientB.disconnect();
  });

  it('10. Duplicate operation is idempotent', async () => {
    const client = createSocketClient();
    await connectAndRegister(client, deviceAId);

    const taskId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sampleTask: Task = {
      id: taskId,
      action: 'DELIVER_SUPPLIES',
      title: 'Collect Blankets',
      location: 'Warehouse B',
      priority: 'medium',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      createdBy: deviceAId,
      revision: 1,
      deletedAt: null,
    };

    const stateHash = await taskStateHash(sampleTask);
    const payload = {
      protocolVersion: 1 as const,
      requestId: crypto.randomUUID(),
      deviceId: deviceAId,
      operation: {
        type: 'TASK_CREATE' as const,
        operationId,
        taskId,
        actorId: deviceAId,
        task: sampleTask,
        resultStateHash: stateHash,
        timestamp: now,
      },
    };

    // First submission
    const firstRes = await new Promise<LanOperationAccepted>((resolve) => {
      client.once('operation:accepted', resolve);
      client.emit('operation:submit', payload);
    });
    expect(firstRes.status).toBe('APPLIED');

    // Second submission with exact same operationId
    const secondRes = await new Promise<LanOperationAccepted>((resolve) => {
      client.once('operation:accepted', resolve);
      client.emit('operation:submit', {
        ...payload,
        requestId: crypto.randomUUID(),
      });
    });
    expect(secondRes.status).toBe('ALREADY_APPLIED');
    expect(secondRes.sequence).toBe(firstRes.sequence);

    client.disconnect();
  });

  it('11. Invalid operation is rejected', async () => {
    const client = createSocketClient();
    await connectAndRegister(client, deviceAId);

    const taskId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sampleTask: Task = {
      id: taskId,
      action: 'REPORT_ISSUE',
      title: 'Fix Generator',
      location: 'Camp 3',
      priority: 'high',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      createdBy: deviceAId,
      revision: 1,
      deletedAt: null,
    };

    // Provide WRONG resultStateHash
    const rejectedPromise = new Promise<LanOperationRejected>((resolve) => {
      client.on('operation:rejected', resolve);
    });

    client.emit('operation:submit', {
      protocolVersion: 1,
      requestId: crypto.randomUUID(),
      deviceId: deviceAId,
      operation: {
        type: 'TASK_CREATE',
        operationId,
        taskId,
        actorId: deviceAId,
        task: sampleTask,
        resultStateHash: '0000000000000000000000000000000000000000000000000000000000000000',
        timestamp: now,
      },
    });

    const rejected = await rejectedPromise;
    expect(rejected.classification).toBe('INVALID');
    expect(rejected.reason).toContain('hash');

    client.disconnect();
  });

  it('12. Missing-parent operation is handled safely', async () => {
    const client = createSocketClient();
    await connectAndRegister(client, deviceAId);

    const nonExistentTaskId = crypto.randomUUID();
    const rejectedPromise = new Promise<LanOperationRejected>((resolve) => {
      client.on('operation:rejected', resolve);
    });

    const updatePayload: TaskUpdatePayload = {
      taskId: nonExistentTaskId,
      operationId: crypto.randomUUID(),
      originDeviceId: deviceAId,
      baseRevision: 1,
      nextRevision: 2,
      parentOperationId: crypto.randomUUID(),
      baseStateHash: '1111111111111111111111111111111111111111111111111111111111111111',
      resultStateHash: '2222222222222222222222222222222222222222222222222222222222222222',
      changes: { status: 'in_progress' },
      updatedAt: new Date().toISOString(),
    };

    client.emit('operation:submit', {
      protocolVersion: 1,
      requestId: crypto.randomUUID(),
      deviceId: deviceAId,
      operation: {
        type: 'TASK_UPDATE',
        update: updatePayload,
      },
    });

    const rejected = await rejectedPromise;
    expect(rejected.classification).toBe('MISSING_PARENT');

    client.disconnect();
  });

  it('13 & 14. Concurrent operations create conflict and resolution is accepted', async () => {
    const clientA = createSocketClient();
    const clientB = createSocketClient();

    await Promise.all([
      connectAndRegister(clientA, deviceAId, 'Device A'),
      connectAndRegister(clientB, deviceBId, 'Device B'),
    ]);

    const taskId = crypto.randomUUID();
    const createOpId = crypto.randomUUID();
    const now = new Date().toISOString();

    const initialTask: Task = {
      id: taskId,
      action: 'DELIVER_SUPPLIES',
      title: 'First Aid Kits',
      location: 'Sector 4',
      priority: 'high',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      createdBy: deviceAId,
      revision: 1,
      deletedAt: null,
    };

    const initialHash = await taskStateHash(initialTask);

    // 1. Submit initial creation
    await new Promise<void>((resolve) => {
      clientA.once('operation:accepted', () => resolve());
      clientA.emit('operation:submit', {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        deviceId: deviceAId,
        operation: {
          type: 'TASK_CREATE',
          operationId: createOpId,
          taskId,
          actorId: deviceAId,
          task: initialTask,
          resultStateHash: initialHash,
          timestamp: now,
        },
      });
    });
    console.log('--- TEST 13 STEP 1 DONE ---');

    // 2. Client A submits update revision 1 -> 2 (status: 'acknowledged')
    const taskRev2A: Task = {
      ...initialTask,
      status: 'acknowledged',
      revision: 2,
      updatedAt: new Date().toISOString(),
    };
    const hash2A = await taskStateHash(taskRev2A);
    const op2AId = crypto.randomUUID();

    await new Promise<void>((resolve, reject) => {
      clientA.once('operation:accepted', () => resolve());
      clientA.once('operation:rejected', (r) =>
        reject(new Error('Rejected in Step 2: ' + JSON.stringify(r))),
      );
      clientA.once('server:error', (e) =>
        reject(new Error('Server error in Step 2: ' + JSON.stringify(e))),
      );
      clientA.emit('operation:submit', {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        deviceId: deviceAId,
        operation: {
          type: 'TASK_UPDATE',
          update: {
            taskId,
            operationId: op2AId,
            originDeviceId: deviceAId,
            baseRevision: 1,
            nextRevision: 2,
            parentOperationId: createOpId,
            baseStateHash: initialHash,
            resultStateHash: hash2A,
            changes: { status: 'acknowledged' },
            updatedAt: taskRev2A.updatedAt,
          },
        },
      });
    });
    console.log('--- TEST 13 STEP 2 DONE ---');

    // 3. Client B concurrently submits update revision 1 -> 2 based on Rev 1
    const taskRev2B: Task = {
      ...initialTask,
      title: 'First Aid Kits and Bandages',
      revision: 2,
      updatedAt: new Date().toISOString(),
    };
    const hash2B = await taskStateHash(taskRev2B);
    const op2BId = crypto.randomUUID();

    const conflictPromise = new Promise<LanOperationRejected>((resolve, reject) => {
      clientB.once('operation:rejected', resolve);
      clientB.once('operation:accepted', (a) =>
        reject(new Error('Unexpectedly accepted: ' + JSON.stringify(a))),
      );
      clientB.once('server:error', (e) => reject(new Error('Server error: ' + JSON.stringify(e))));
    });

    clientB.emit('operation:submit', {
      protocolVersion: 1,
      requestId: crypto.randomUUID(),
      deviceId: deviceBId,
      operation: {
        type: 'TASK_UPDATE',
        update: {
          taskId,
          operationId: op2BId,
          originDeviceId: deviceBId,
          baseRevision: 1,
          nextRevision: 2,
          parentOperationId: createOpId,
          baseStateHash: initialHash,
          resultStateHash: hash2B,
          changes: { title: 'First Aid Kits and Bandages' },
          updatedAt: taskRev2B.updatedAt,
        },
      },
    });

    const rejectedConflict = await conflictPromise;
    console.log('--- TEST 13 STEP 3 DONE ---');
    expect(rejectedConflict.classification).toBe('CONFLICT');

    // 4. Resolution operation: Client A resolves conflict by merging op2BId and advancing to revision 3
    const resolvedTask: Task = {
      ...taskRev2A,
      title: 'First Aid Kits and Bandages',
      status: 'acknowledged',
      revision: 3,
      updatedAt: new Date().toISOString(),
    };
    const resolvedHash = await taskStateHash(resolvedTask);
    const resolveOpId = crypto.randomUUID();

    const resolvePromise = new Promise<LanOperationAccepted>((resolve, reject) => {
      clientA.once('operation:accepted', resolve);
      clientA.once('operation:rejected', (r) =>
        reject(new Error('Rejected resolution: ' + JSON.stringify(r))),
      );
      clientA.once('server:error', (e) =>
        reject(new Error('Server error on resolution: ' + JSON.stringify(e))),
      );
    });

    clientA.emit('operation:submit', {
      protocolVersion: 1,
      requestId: crypto.randomUUID(),
      deviceId: deviceAId,
      operation: {
        type: 'TASK_UPDATE',
        update: {
          taskId,
          operationId: resolveOpId,
          originDeviceId: deviceAId,
          baseRevision: 2,
          nextRevision: 3,
          parentOperationId: op2AId,
          baseStateHash: hash2A,
          resultStateHash: resolvedHash,
          changes: {
            action: resolvedTask.action,
            title: resolvedTask.title,
            location: resolvedTask.location,
            priority: resolvedTask.priority,
            status: resolvedTask.status,
          },
          updatedAt: resolvedTask.updatedAt,
          resolution: {
            mergedOperationId: op2BId,
            mergedStateHash: hash2B,
          },
        },
      },
    });

    const acceptedResolution = await resolvePromise;
    console.log('--- TEST 13 STEP 4 DONE ---');
    expect(acceptedResolution.status).toBe('APPLIED');
    expect(acceptedResolution.revision).toBe(3);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('16, 17 & 18. Incremental synchronization returns ordered operations and pagination works', async () => {
    const client = createSocketClient();
    await connectAndRegister(client, deviceAId);

    // Request from cursor 0 with limit 2
    const batch1 = await new Promise<LanSyncBatch>((resolve) => {
      client.once('sync:operations', resolve);
      client.emit('sync:request', {
        protocolVersion: 1,
        deviceId: deviceAId,
        cursor: 0,
        limit: 2,
      });
    });

    expect(batch1.operations.length).toBeLessThanOrEqual(2);
    expect(batch1.totalServerOperations).toBeGreaterThan(0);
    expect(batch1.hasMore).toBe(true);

    // Request next batch
    const batch2 = await new Promise<LanSyncBatch>((resolve) => {
      client.once('sync:operations', resolve);
      client.emit('sync:request', {
        protocolVersion: 1,
        deviceId: deviceAId,
        cursor: batch1.cursor,
        limit: 100,
      });
    });

    expect(batch2.operations.length).toBeGreaterThan(0);
    expect(batch2.cursor).toBeGreaterThan(batch1.cursor);

    client.disconnect();
  });

  it('4 & 16. SQLite data and sequence numbers survive server restart', async () => {
    const currentSeq = serverInstance.syncService.operations.getCurrentSequence();
    const count = serverInstance.syncService.operations.countOperations();
    expect(count).toBeGreaterThan(0);

    // Close server
    await serverInstance.close();

    // Reopen new server instance against the exact same SQLite file
    const restartedServer = createServerInstance({
      dbPath,
      port: 0,
      host: '127.0.0.1',
    });

    await new Promise<void>((resolve) => {
      restartedServer.httpServer.listen(0, '127.0.0.1', resolve);
    });

    const restartedPort = (restartedServer.httpServer.address() as AddressInfo).port;
    const client = ioc(`http://127.0.0.1:${restartedPort}`, {
      transports: ['websocket'],
      autoConnect: false,
    });

    await connectAndRegister(client, deviceAId);

    expect(restartedServer.syncService.operations.countOperations()).toBe(count);
    expect(restartedServer.syncService.operations.getCurrentSequence()).toBe(currentSeq);

    client.disconnect();
    await restartedServer.close();

    // Restore serverInstance for afterAll cleanup
    serverInstance = restartedServer;
  });
});
