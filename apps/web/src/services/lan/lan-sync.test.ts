import 'fake-indexeddb/auto';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelayMidenDatabase } from '../../db/database';
import { TaskRepository } from '../../db/task-repository';
import { SyncRepository } from '../sync/sync-repository';
import {
  buildLanOperationPayload,
  applyIncomingLanOperation,
  recordServerAcceptance,
  getUnsynchronizedOperations,
  submitLocalOperation,
  requestLanSync,
} from './sync';
import { lanConnection, LanConnectionManager } from './connection';
import { createServerInstance, type ServerInstance } from '../../../../server/src/app';
import { taskStateHash, type Task } from '@relay-miden/shared';

describe('Phase 6 Client LAN Synchronization', () => {
  const databases: RelayMidenDatabase[] = [];

  function createDevice(name = crypto.randomUUID()) {
    const database = new RelayMidenDatabase(`lan-test-${name}`);
    databases.push(database);
    const tasks = new TaskRepository(database);
    const sync = new SyncRepository(database, tasks);
    return { database, tasks, sync };
  }

  afterEach(async () => {
    lanConnection.disconnect();
    for (const database of databases.splice(0)) {
      database.close();
      await database.delete();
    }
  });

  describe('Operation Conversion and Building', () => {
    it('builds a valid TASK_CREATE LAN payload from local creation', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'Emergency Rations',
        location: 'Camp 1',
        priority: 'urgent',
      });

      const ops = await dev.tasks.getTaskOperations(task.id);
      expect(ops.length).toBe(1);

      const payload = await buildLanOperationPayload(ops[0]!.operationId, dev.database, dev.sync);
      expect(payload.type).toBe('TASK_CREATE');
      if (payload.type === 'TASK_CREATE') {
        expect(payload.taskId).toBe(task.id);
        expect(payload.task.title).toBe('Emergency Rations');
        expect(payload.resultStateHash).toBe(await taskStateHash(task));
      }
    });

    it('builds a valid TASK_UPDATE LAN payload from local update', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'Emergency Rations',
        location: 'Camp 1',
        priority: 'urgent',
      });

      await dev.tasks.updateTaskStatus(task.id, 'acknowledged');
      const ops = await dev.tasks.getTaskOperations(task.id);
      expect(ops.length).toBe(2);

      const updateOp = ops[1]!;
      const payload = await buildLanOperationPayload(updateOp.operationId, dev.database, dev.sync);
      expect(payload.type).toBe('TASK_UPDATE');
      if (payload.type === 'TASK_UPDATE') {
        expect(payload.update.taskId).toBe(task.id);
        expect(payload.update.baseRevision).toBe(1);
        expect(payload.update.nextRevision).toBe(2);
        expect(payload.update.changes.status).toBe('acknowledged');
      }
    });
  });

  describe('Incoming Operation Application', () => {
    it('applies an incoming TASK_CREATE operation into local IndexedDB', async () => {
      const dev = createDevice();
      const remoteTaskId = crypto.randomUUID();
      const remoteActorId = crypto.randomUUID();
      const remoteTask: Task = {
        id: remoteTaskId,
        action: 'REQUEST_VOLUNTEERS',
        title: 'Medical Assistance Required',
        location: 'Sector 4',
        priority: 'urgent',
        status: 'pending',
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: remoteActorId,
        deletedAt: null,
      };

      const result = await applyIncomingLanOperation(
        {
          type: 'TASK_CREATE',
          operationId: crypto.randomUUID(),
          taskId: remoteTaskId,
          actorId: remoteActorId,
          task: remoteTask,
          resultStateHash: await taskStateHash(remoteTask),
          timestamp: remoteTask.createdAt,
        },
        dev.database,
        dev.sync,
      );

      expect(result.status).toBe('APPLIED');
      expect(result.task?.id).toBe(remoteTaskId);

      const savedTask = await dev.tasks.getTaskById(remoteTaskId);
      expect(savedTask).toBeDefined();
      expect(savedTask?.title).toBe('Medical Assistance Required');
    });

    it('handles duplicate TASK_CREATE operations idempotently', async () => {
      const dev = createDevice();
      const remoteTaskId = crypto.randomUUID();
      const remoteActorId = crypto.randomUUID();
      const opId = crypto.randomUUID();
      const remoteTask: Task = {
        id: remoteTaskId,
        action: 'REQUEST_VOLUNTEERS',
        title: 'First Aid Post',
        location: 'Sector 1',
        priority: 'medium',
        status: 'pending',
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: remoteActorId,
        deletedAt: null,
      };

      const lanOp = {
        type: 'TASK_CREATE' as const,
        operationId: opId,
        taskId: remoteTaskId,
        actorId: remoteActorId,
        task: remoteTask,
        resultStateHash: await taskStateHash(remoteTask),
        timestamp: remoteTask.createdAt,
      };

      const first = await applyIncomingLanOperation(lanOp, dev.database, dev.sync);
      expect(first.status).toBe('APPLIED');

      const second = await applyIncomingLanOperation(lanOp, dev.database, dev.sync);
      expect(second.status).toBe('ALREADY_APPLIED');
    });
  });

  describe('Unsynchronized Operations and Acceptance Tracking', () => {
    it('tracks unsynchronized operations until acknowledged by server', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'REPORT_ISSUE',
        title: 'Road blocked at milestone 4',
        location: 'Highway 9',
        priority: 'high',
      });

      const unsyncedBefore = await getUnsynchronizedOperations(dev.database, dev.tasks);
      const taskOp = unsyncedBefore.find((o) => o.taskId === task.id);
      expect(taskOp).toBeDefined();

      if (taskOp) {
        await recordServerAcceptance(taskOp.operationId, 1, dev.database);
        const unsyncedAfter = await getUnsynchronizedOperations(dev.database, dev.tasks);
        expect(unsyncedAfter.some((o) => o.operationId === taskOp.operationId)).toBe(false);
      }
    });
  });

  describe('Connection Manager URL Validation', () => {
    it('validates HTTP and HTTPS URLs and rejects invalid ones', () => {
      const manager = new LanConnectionManager();
      expect(() => manager.validateUrl('http://192.168.1.50:3001')).not.toThrow();
      expect(() => manager.validateUrl('https://relay.local:443')).not.toThrow();
      expect(() => manager.validateUrl('ftp://example.com')).toThrow();
      expect(() => manager.validateUrl('not-a-url')).toThrow();
    });
  });

  describe('End-to-End Client <-> Server LAN Synchronization', () => {
    let serverInstance: ServerInstance;
    let serverUrl: string;

    beforeEach(async () => {
      serverInstance = createServerInstance({
        port: 0,
        host: '127.0.0.1',
        dbPath: ':memory:',
        sessionToken: 'test-lan-secret',
      });

      await new Promise<void>((resolve) => {
        serverInstance.httpServer.listen(0, '127.0.0.1', resolve);
      });

      const port = (serverInstance.httpServer.address() as AddressInfo).port;
      serverUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
      lanConnection.disconnect();
      await serverInstance.close();
    });

    it('connects, registers, submits local task, and synchronizes', async () => {
      const dev = createDevice();
      const deviceId = await dev.tasks.getDeviceId();
      const connected = await lanConnection.connect(serverUrl, 'test-lan-secret', deviceId);
      expect(connected).toBe(true);
      expect(lanConnection.isConnected()).toBe(true);

      // Create local task on client
      const task = await dev.tasks.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'Insulin units',
        location: 'Clinic 2',
        priority: 'urgent',
      });

      const ops = await dev.tasks.getTaskOperations(task.id);
      expect(ops.length).toBe(1);

      // Submit to server
      const acceptResult = await submitLocalOperation(
        ops[0]!.operationId,
        dev.database,
        dev.tasks,
        dev.sync,
      );
      expect(acceptResult).toBeDefined();
      if (acceptResult && 'status' in acceptResult) {
        expect(acceptResult.status).toBe('APPLIED');
        expect(acceptResult.sequence).toBeGreaterThanOrEqual(1);
      }

      // Initial / manual sync
      const syncResult = await requestLanSync(0, 50, dev.database, dev.tasks, dev.sync);
      expect(syncResult.nextCursor).toBeGreaterThanOrEqual(1);

      // Verify server cursor persisted
      expect(lanConnection.getSyncCursor()).toBeGreaterThanOrEqual(1);
    });
  });
});
