import 'fake-indexeddb/auto';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelayMidenDatabase } from '../../db/database';
import { TaskRepository } from '../../db/task-repository';
import { SyncRepository } from '../sync/sync-repository';
import {
  calculateBackoffDelay,
  getOutboxStats,
  getPendingEntriesForReplay,
  markOutboxAcknowledged,
  markOutboxBlocked,
  markOutboxFailed,
  markOutboxInFlight,
  markOutboxRetry,
  resetAbandonedInFlight,
  retryBlockedAndFailed,
  backfillLegacyOutbox,
} from './outbox';
import { submitLocalOperation, requestLanSync } from './sync';
import { lanConnection } from './connection';
import { createServerInstance, type ServerInstance } from '../../../../server/src/app';
import { encodeTaskForQR } from '../paperbridge';

describe('Phase 7 Durable Offline Queue, Automatic Reconnection & Recovery', () => {
  const databases: RelayMidenDatabase[] = [];

  function createDevice(name = crypto.randomUUID()) {
    const database = new RelayMidenDatabase(`phase7-test-${name}`);
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

  describe('Durable Outbox Queue Invariants', () => {
    it('1. Task creation atomically creates a PENDING outbox entry', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'Water purification tablets',
        location: 'Zone 4',
        priority: 'high',
      });

      const ops = await dev.tasks.getTaskOperations(task.id);
      expect(ops.length).toBe(1);
      const op = ops[0]!;

      const outboxEntry = await dev.database.outbox.get(op.operationId);
      expect(outboxEntry).toBeDefined();
      expect(outboxEntry?.operationId).toBe(op.operationId);
      expect(outboxEntry?.taskId).toBe(task.id);
      expect(outboxEntry?.status).toBe('PENDING');
      expect(outboxEntry?.attemptCount).toBe(0);
      expect(outboxEntry?.originDeviceId).toBe(op.actorId);
    });

    it('2. Task update, status change, and deletion create atomic outbox entries', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'REQUEST_ASSISTANCE',
        title: 'Shelter Alpha evacuation',
        location: 'North Ridge',
        priority: 'urgent',
      });

      // Update task
      await dev.tasks.updateTask(task.id, {
        title: 'Shelter Alpha urgent evacuation',
      });

      // Status change
      await dev.tasks.updateTaskStatus(task.id, 'acknowledged');

      // Soft delete
      await dev.tasks.deleteTask(task.id);

      const ops = await dev.tasks.getTaskOperations(task.id);
      expect(ops.length).toBe(4);

      const outboxEntries = await dev.database.outbox.where('taskId').equals(task.id).toArray();
      expect(outboxEntries.length).toBe(4);
      expect(outboxEntries.every((e) => e.status === 'PENDING')).toBe(true);

      const stats = await getOutboxStats(dev.database);
      expect(stats.pending).toBe(4);
      expect(stats.total).toBe(4);
    });

    it('3. Outbox entries survive database close and reopen', async () => {
      const dbName = `persist-${crypto.randomUUID()}`;
      const db1 = new RelayMidenDatabase(dbName);
      databases.push(db1);
      const tasks1 = new TaskRepository(db1);

      const task = await tasks1.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'First aid kits',
        location: 'Outpost B',
        priority: 'medium',
      });
      db1.close();

      // Reopen database
      const db2 = new RelayMidenDatabase(dbName);
      databases.push(db2);
      const tasks2 = new TaskRepository(db2);
      await tasks2.open();

      const ops = await tasks2.getTaskOperations(task.id);
      expect(ops.length).toBe(1);

      const outboxEntry = await db2.outbox.get(ops[0]!.operationId);
      expect(outboxEntry).toBeDefined();
      expect(outboxEntry?.status).toBe('PENDING');
      expect(outboxEntry?.taskId).toBe(task.id);
    });

    it('4. Abandoned IN_FLIGHT entries recover to PENDING upon database restart', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'MOVE_TO_LOCATION',
        title: 'Debris clearance',
        location: 'Highway 7',
        priority: 'high',
      });

      const ops = await dev.tasks.getTaskOperations(task.id);
      const opId = ops[0]!.operationId;

      // Simulate an interrupted transmission where entry was left in IN_FLIGHT
      await markOutboxInFlight(opId, dev.database);
      const inFlightEntry = await dev.database.outbox.get(opId);
      expect(inFlightEntry?.status).toBe('IN_FLIGHT');
      expect(inFlightEntry?.attemptCount).toBe(1);

      // Perform recovery
      const recoveredCount = await resetAbandonedInFlight(dev.database);
      expect(recoveredCount).toBe(1);

      const recoveredEntry = await dev.database.outbox.get(opId);
      expect(recoveredEntry?.status).toBe('PENDING');
      expect(recoveredEntry?.lastError).toContain('Recovered');
    });

    it('5. Legacy outbox backfill populates missing records for historical operations', async () => {
      const dev = createDevice();
      const deviceId = await dev.tasks.getDeviceId();

      // Insert an un-tracked local operation directly (simulating pre-Phase 7 state)
      const fakeOpId = crypto.randomUUID();
      const fakeTaskId = crypto.randomUUID();
      await dev.database.operations.add({
        operationId: fakeOpId,
        taskId: fakeTaskId,
        actorId: deviceId,
        operationType: 'TASK_CREATE',
        timestamp: new Date().toISOString(),
        revision: 1,
        parentRevision: null,
        parentOperationId: null,
        payload: {
          id: fakeTaskId,
          action: 'REPORT_ISSUE',
          title: 'Legacy bridge check',
          location: 'South Bridge',
          priority: 'medium',
          status: 'pending',
          revision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: deviceId,
        },
      });

      // Initially outbox is empty
      expect(await dev.database.outbox.get(fakeOpId)).toBeUndefined();

      // Run migration backfill
      const created = await backfillLegacyOutbox(dev.database);
      expect(created).toBe(1);

      const entry = await dev.database.outbox.get(fakeOpId);
      expect(entry).toBeDefined();
      expect(entry?.status).toBe('PENDING');
      expect(entry?.taskId).toBe(fakeTaskId);
    });

    it('6. QR-imported operations do not create outbox records', async () => {
      const dev = createDevice();
      const senderId = crypto.randomUUID();
      const remoteTaskId = crypto.randomUUID();

      // Encode valid PaperBridge envelope
      const { envelope } = await encodeTaskForQR(
        {
          id: remoteTaskId,
          action: 'DELIVER_SUPPLIES',
          title: 'QR Imported Supplies',
          location: 'Camp Bravo',
          priority: 'urgent',
          status: 'pending',
          revision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: senderId,
        },
        senderId,
      );

      // Import via PaperBridge
      const result = await dev.tasks.importPaperBridgeTask(envelope);
      expect(result.status).toBe('imported');

      // The operation was recorded in database.operations
      const ops = await dev.tasks.getTaskOperations(remoteTaskId);
      expect(ops.length).toBe(1);

      // But NO outbox entry must be created (maintains provenance separation)
      const outbox = await dev.database.outbox.get(ops[0]!.operationId);
      expect(outbox).toBeUndefined();
    });
  });

  describe('Queue State Machine & Causal Replay Order', () => {
    it('7. Replay order enforces parent revision before child revisions', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'Community kitchen rations',
        location: 'Center 1',
        priority: 'urgent',
      });

      await dev.tasks.updateTask(task.id, { title: 'Community kitchen rations - Revised' });
      await dev.tasks.updateTaskStatus(task.id, 'acknowledged');

      const eligible = await getPendingEntriesForReplay(dev.database);
      expect(eligible.length).toBe(3);

      const ops = await Promise.all(
        eligible.map((e) => dev.database.operations.get(e.operationId)),
      );

      // Verify strictly ascending revisions: 1 -> 2 -> 3
      expect(ops[0]?.revision).toBe(1);
      expect(ops[1]?.revision).toBe(2);
      expect(ops[2]?.revision).toBe(3);
    });

    it('8. Queue state transitions: PENDING -> IN_FLIGHT -> ACKNOWLEDGED, BLOCKED, FAILED', async () => {
      const dev = createDevice();
      const task = await dev.tasks.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'Bandages',
        location: 'Station 2',
        priority: 'low',
      });

      const ops = await dev.tasks.getTaskOperations(task.id);
      const opId = ops[0]!.operationId;

      // In flight
      await markOutboxInFlight(opId, dev.database);
      expect((await dev.database.outbox.get(opId))?.status).toBe('IN_FLIGHT');

      // Retry backoff
      await markOutboxRetry(opId, 'Temporary timeout', 5000, dev.database);
      const retrying = await dev.database.outbox.get(opId);
      expect(retrying?.status).toBe('PENDING');
      expect(retrying?.lastError).toBe('Temporary timeout');
      expect(retrying?.nextRetryAt).toBeDefined();

      // Blocked
      await markOutboxBlocked(opId, 'Missing prerequisite revision', dev.database);
      expect((await dev.database.outbox.get(opId))?.status).toBe('BLOCKED');

      // Failed
      await markOutboxFailed(opId, 'Permanent schema failure', dev.database);
      expect((await dev.database.outbox.get(opId))?.status).toBe('FAILED');

      // Retry blocked and failed
      const resetCount = await retryBlockedAndFailed(dev.database);
      expect(resetCount).toBe(1);
      expect((await dev.database.outbox.get(opId))?.status).toBe('PENDING');

      // Acknowledged
      await markOutboxAcknowledged(opId, 42, dev.database);
      const acked = await dev.database.outbox.get(opId);
      expect(acked?.status).toBe('ACKNOWLEDGED');
      expect(acked?.serverSequence).toBe(42);
      expect(acked?.acknowledgedAt).toBeDefined();
    });

    it('9. Exponential backoff calculation includes jitter and upper bound', () => {
      const delay1 = calculateBackoffDelay(1, 1000, 30000, 0.2);
      expect(delay1).toBeGreaterThanOrEqual(800);
      expect(delay1).toBeLessThanOrEqual(1200);

      const delay4 = calculateBackoffDelay(4, 1000, 30000, 0.2); // 8000ms ± 20%
      expect(delay4).toBeGreaterThanOrEqual(6400);
      expect(delay4).toBeLessThanOrEqual(9600);

      // Bounded by maxMs = 30000
      const delay10 = calculateBackoffDelay(10, 1000, 30000, 0.2);
      expect(delay10).toBeLessThanOrEqual(30000);
    });
  });

  describe('End-to-End LAN Replay, Reconnection & Idempotence', () => {
    let serverInstance: ServerInstance;
    let serverUrl: string;

    beforeEach(async () => {
      serverInstance = createServerInstance({
        port: 0,
        host: '127.0.0.1',
        dbPath: ':memory:',
        sessionToken: 'test-phase7-token',
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

    it('10. Offline task creation automatically submits and marks ACKNOWLEDGED on reconnect', async () => {
      const dev = createDevice();
      const deviceId = await dev.tasks.getDeviceId();

      // Device creates task while completely offline (server not connected)
      const task = await dev.tasks.createTask({
        action: 'REPORT_ISSUE',
        title: 'Substation B restart',
        location: 'Grid Sector 3',
        priority: 'urgent',
      });

      const statsBefore = await getOutboxStats(dev.database);
      expect(statsBefore.pending).toBe(1);
      expect(statsBefore.acknowledged).toBe(0);

      // Now connect to LAN server
      const connected = await lanConnection.connect(serverUrl, 'test-phase7-token', deviceId);
      expect(connected).toBe(true);

      // Trigger synchronization pass
      const syncResult = await requestLanSync(0, 50, dev.database, dev.tasks, dev.sync);
      expect(syncResult.outboxReplayed).toBe(1);

      // Verify outbox entry is now durably ACKNOWLEDGED
      const statsAfter = await getOutboxStats(dev.database);
      expect(statsAfter.pending).toBe(0);
      expect(statsAfter.acknowledged).toBe(1);

      // Verify server persisted exactly this task
      const serverTask = serverInstance.syncService.tasks.getTask(task.id);
      expect(serverTask).toBeDefined();
      expect(serverTask?.task.title).toBe('Substation B restart');
    });

    it('11. Lost acknowledgment recovery: retry with same operationId receives ALREADY_APPLIED', async () => {
      const dev = createDevice();
      const deviceId = await dev.tasks.getDeviceId();

      await lanConnection.connect(serverUrl, 'test-phase7-token', deviceId);

      const task = await dev.tasks.createTask({
        action: 'DELIVER_SUPPLIES',
        title: 'Thermal blankets',
        location: 'Refuge 5',
        priority: 'high',
      });

      const ops = await dev.tasks.getTaskOperations(task.id);
      const opId = ops[0]!.operationId;

      // First submission succeeds
      const result1 = await submitLocalOperation(opId, dev.database, dev.tasks, dev.sync);
      expect(result1).toBeDefined();
      if (result1 && 'status' in result1) {
        expect(result1.status).toBe('APPLIED');
      }

      // Simulate a lost acknowledgment: reset outbox entry back to PENDING as if client never saw the response
      await dev.database.outbox.update(opId, { status: 'PENDING' });

      // Retry submitting the exact same operation ID
      const result2 = await submitLocalOperation(opId, dev.database, dev.tasks, dev.sync);
      expect(result2).toBeDefined();
      if (result2 && 'status' in result2) {
        // Server returns ALREADY_APPLIED idempotently without error
        expect(result2.status).toBe('ALREADY_APPLIED');
      }

      // Outbox transitions to ACKNOWLEDGED
      const entry = await dev.database.outbox.get(opId);
      expect(entry?.status).toBe('ACKNOWLEDGED');

      // Verify server operations table has exactly ONE operation record for this operationId
      const serverOps = serverInstance.syncService.operations.getTaskOperations(task.id);
      expect(serverOps.length).toBe(1);
    });

    it('12. Concurrent conflict detection and resolution synchronization via outbox', async () => {
      // Create Device A and Device B
      const devA = createDevice();
      const devB = createDevice();
      const idA = await devA.tasks.getDeviceId();
      const idB = await devB.tasks.getDeviceId();

      // Device A connects and creates shared task
      await lanConnection.connect(serverUrl, 'test-phase7-token', idA);
      const task = await devA.tasks.createTask({
        action: 'REQUEST_ASSISTANCE',
        title: 'Trauma triage setup',
        location: 'Clinic 1',
        priority: 'urgent',
      });
      await requestLanSync(0, 50, devA.database, devA.tasks, devA.sync);

      // Device B connects and pulls initial task
      lanConnection.disconnect();
      await lanConnection.connect(serverUrl, 'test-phase7-token', idB);
      await requestLanSync(0, 50, devB.database, devB.tasks, devB.sync);

      const taskOnB = await devB.tasks.getTaskById(task.id);
      expect(taskOnB).toBeDefined();
      expect(taskOnB?.revision).toBe(1);

      // Device B disconnects (goes offline)
      lanConnection.disconnect();

      // Device A (online) updates task status to acknowledged (revision 2 on server)
      await lanConnection.connect(serverUrl, 'test-phase7-token', idA);
      await devA.tasks.updateTaskStatus(task.id, 'acknowledged');
      await requestLanSync(0, 50, devA.database, devA.tasks, devA.sync);

      // Device B (offline) updates task title (revision 2 on Device B)
      await devB.tasks.updateTask(task.id, { title: 'Trauma triage and ICU setup' });

      // Device B reconnects to LAN
      lanConnection.disconnect();
      await lanConnection.connect(serverUrl, 'test-phase7-token', idB);

      // Synchronize: Device B pulls Device A's remote revision 2, detecting concurrent conflict
      await requestLanSync(0, 50, devB.database, devB.tasks, devB.sync);

      // Verify conflict was recorded on Device B
      const conflicts = await devB.sync.getConflicts(task.id);
      expect(conflicts.length).toBe(1);

      // User on Device B resolves the conflict
      const resolvedTask = await devB.sync.resolveConflict(conflicts[0]!.id, 'ACCEPT_INCOMING');
      expect(resolvedTask.revision).toBe(3);

      // Verify resolution operation was added to Device B's outbox atomically
      const outboxEntries = await devB.database.outbox.where('taskId').equals(task.id).toArray();
      const resolveOutbox = outboxEntries.find((e) => e.status === 'PENDING');
      expect(resolveOutbox).toBeDefined();

      // Replay outbox: resolution is sent and accepted by server
      await requestLanSync(0, 50, devB.database, devB.tasks, devB.sync);
      const resolveAck = await devB.database.outbox.get(resolveOutbox!.operationId);
      expect(resolveAck?.status).toBe('ACKNOWLEDGED');

      // Server task revision is now 3
      const finalServerTask = serverInstance.syncService.tasks.getTask(task.id);
      expect(finalServerTask?.task.revision).toBe(3);
    });

    it('13. Single-flight synchronization lock serializes concurrent sync triggers', async () => {
      const dev = createDevice();
      const deviceId = await dev.tasks.getDeviceId();
      await lanConnection.connect(serverUrl, 'test-phase7-token', deviceId);

      await dev.tasks.createTask({
        action: 'REQUEST_ASSISTANCE',
        title: 'Emergency transport',
        location: 'Zone 1',
        priority: 'urgent',
      });

      // Call requestLanSync concurrently 3 times
      const p1 = requestLanSync(0, 50, dev.database, dev.tasks, dev.sync);
      const p2 = requestLanSync(0, 50, dev.database, dev.tasks, dev.sync);
      const p3 = requestLanSync(0, 50, dev.database, dev.tasks, dev.sync);

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1.nextCursor).toBe(r2.nextCursor);
      expect(r2.nextCursor).toBe(r3.nextCursor);
      expect(lanConnection.getSyncCursor()).toBeGreaterThanOrEqual(1);
    });
  });
});
