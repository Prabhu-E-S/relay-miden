import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import Dexie from 'dexie';
import {
  createPaperBridgeEnvelope,
  createPaperBridgeV2Envelope,
  decodeAnyPaperBridgeMessage,
  MAX_PAPERBRIDGE_PAYLOAD_BYTES,
  PaperBridgeError,
  taskStateHash,
  type Task,
} from '@relay-miden/shared';
import { RelayMidenDatabase } from '../../db/database';
import { TaskRepository } from '../../db/task-repository';
import { SyncRepository } from './sync-repository';

const databases: RelayMidenDatabase[] = [];
function device(name = crypto.randomUUID()) {
  const database = new RelayMidenDatabase(`sync-test-${name}`);
  databases.push(database);
  const tasks = new TaskRepository(database);
  return { database, tasks, sync: new SyncRepository(database, tasks) };
}
async function pair() {
  const a = device();
  const b = device();
  const task = await a.tasks.createTask({
    action: 'DELIVER_SUPPLIES',
    title: 'Water delivery',
    location: 'Gate B',
    priority: 'high',
  });
  const qr = await createPaperBridgeEnvelope(task, await a.tasks.getDeviceId());
  expect((await b.tasks.importPaperBridgeTask(qr.envelope)).status).toBe('imported');
  return { a, b, task };
}
async function exportLatest(node: Awaited<ReturnType<typeof pair>>['a'], id: string) {
  const ops = await node.sync.getOutgoingOperations(id);
  return node.sync.createOutgoingTaskUpdate(id, ops.at(-1)!.operationId);
}
afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close();
    await database.delete();
  }
});

describe('Phase 5 two-way PaperBridge sync', () => {
  it('preserves v1 create, applies a v2 update, and records a matching ACK without changing revision', async () => {
    const { a, b, task } = await pair();
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const outgoing = await exportLatest(b, task.id);
    expect(outgoing.envelope.messageType).toBe('TASK_UPDATE');
    expect((await decodeAnyPaperBridgeMessage(outgoing.rawJson)).messageType).toBe('TASK_UPDATE');
    const applied = await a.sync.applyIncomingUpdate(outgoing.envelope);
    expect(applied.status).toBe('APPLIED');
    expect((await a.tasks.getTaskById(task.id))?.status).toBe('acknowledged');
    expect((await a.tasks.getTaskById(task.id))?.revision).toBe(2);
    if (outgoing.envelope.messageType !== 'TASK_UPDATE') throw new Error('wrong type');
    const ack = await a.sync.createAcknowledgment(outgoing.envelope, 'APPLIED');
    expect((await decodeAnyPaperBridgeMessage(ack.rawJson)).messageType).toBe('TASK_ACK');
    expect(await b.sync.recordAcknowledgment(ack.envelope)).toBe('RECORDED');
    expect(await b.sync.recordAcknowledgment(ack.envelope)).toBe('DUPLICATE');
    expect((await b.tasks.getTaskById(task.id))?.revision).toBe(2);
    expect((await b.database.outgoing.get(outgoing.envelope.messageId))?.acknowledgedBy).toBe(
      await a.tasks.getDeviceId(),
    );
    expect(await b.database.acknowledgments.count()).toBe(1);
  });

  it('keeps outgoing message identity stable and applies each operation once', async () => {
    const { a, b, task } = await pair();
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const ops = await b.sync.getOutgoingOperations(task.id);
    const first = await b.sync.createOutgoingTaskUpdate(task.id, ops[0]!.operationId);
    const second = await b.sync.createOutgoingTaskUpdate(task.id, ops[0]!.operationId);
    expect(second.rawJson).toBe(first.rawJson);
    expect((await a.sync.applyIncomingUpdate(first.envelope)).status).toBe('APPLIED');
    expect((await a.sync.applyIncomingUpdate(first.envelope)).status).toBe('ALREADY_APPLIED');
    expect(
      (await a.tasks.getTaskOperations(task.id)).filter(
        (op) => op.operationId === ops[0]!.operationId,
      ),
    ).toHaveLength(1);
  });

  it('requires missing earlier operations before applying later ones', async () => {
    const { a, b, task } = await pair();
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    await b.tasks.updateTaskStatus(task.id, 'in_progress');
    const ops = await b.sync.getOutgoingOperations(task.id);
    const first = await b.sync.createOutgoingTaskUpdate(task.id, ops[0]!.operationId);
    const second = await b.sync.createOutgoingTaskUpdate(task.id, ops[1]!.operationId);
    expect((await a.sync.applyIncomingUpdate(second.envelope)).status).toBe('MISSING_PARENT');
    expect((await a.tasks.getTaskById(task.id))?.revision).toBe(1);
    expect((await a.sync.applyIncomingUpdate(first.envelope)).status).toBe('APPLIED');
    expect((await a.sync.applyIncomingUpdate(second.envelope)).status).toBe('APPLIED');
    expect((await a.tasks.getTaskById(task.id))?.status).toBe('in_progress');
  });

  it.each(['KEEP_LOCAL', 'ACCEPT_INCOMING'] as const)(
    'detects and resolves concurrent branches: %s',
    async (choice) => {
      const { a, b, task } = await pair();
      await a.tasks.updateTask(task.id, { title: 'Local title' });
      await b.tasks.updateTaskStatus(task.id, 'acknowledged');
      const incoming = await exportLatest(b, task.id);
      const result = await a.sync.applyIncomingUpdate(incoming.envelope);
      expect(result.status).toBe('CONFLICT');
      expect((await a.tasks.getTaskById(task.id))?.title).toBe('Local title');
      expect(await a.database.conflicts.count()).toBe(1);
      expect((await a.sync.applyIncomingUpdate(incoming.envelope)).status).toBe('CONFLICT');
      expect(await a.database.conflicts.count()).toBe(1);
      if (result.status !== 'CONFLICT') throw new Error('expected conflict');
      const resolved = await a.sync.resolveConflict(result.conflict.id, choice);
      expect(resolved.revision).toBe(3);
      expect((await a.tasks.getTaskOperations(task.id)).at(-1)).toMatchObject({
        operationType: 'TASK_RESOLVE',
        mergedOperationId:
          incoming.envelope.messageType === 'TASK_UPDATE'
            ? incoming.envelope.payload.operationId
            : '',
      });
      expect(await a.sync.getConflicts(task.id)).toHaveLength(0);
      const resolution = await exportLatest(a, task.id);
      expect((await b.sync.applyIncomingUpdate(resolution.envelope)).status).toBe('APPLIED');
      expect(await taskStateHash((await a.tasks.getTaskById(task.id)) as Task)).toBe(
        await taskStateHash((await b.tasks.getTaskById(task.id)) as Task),
      );
    },
  );

  it('rejects unknown acknowledgments and never changes task state on ACK', async () => {
    const { a, b, task } = await pair();
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const outgoing = await exportLatest(b, task.id);
    await a.sync.applyIncomingUpdate(outgoing.envelope);
    if (outgoing.envelope.messageType !== 'TASK_UPDATE') throw new Error('wrong type');
    const ack = await a.sync.createAcknowledgment(outgoing.envelope, 'APPLIED');
    await expect(a.sync.recordAcknowledgment(ack.envelope)).rejects.toThrow('known outgoing');
    expect((await a.tasks.getTaskById(task.id))?.revision).toBe(2);
  });

  it('persists conflicts and outgoing records across database reinitialization', async () => {
    const { a, b, task } = await pair();
    await a.tasks.updateTask(task.id, { title: 'A' });
    await b.tasks.updateTask(task.id, { title: 'B' });
    const outgoing = await exportLatest(b, task.id);
    await a.sync.applyIncomingUpdate(outgoing.envelope);
    const name = a.database.name;
    a.database.close();
    const reopened = new RelayMidenDatabase(name);
    databases.push(reopened);
    const again = new SyncRepository(reopened, new TaskRepository(reopened));
    expect(await again.getConflicts(task.id)).toHaveLength(1);
    expect((await reopened.tasks.get(task.id))?.title).toBe('A');
    expect((await b.database.outgoing.get(outgoing.envelope.messageId))?.rawJson).toBe(
      outgoing.rawJson,
    );
  });

  it('rejects modified checksums, unsupported versions, types, and oversized messages', async () => {
    const { b, task } = await pair();
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const update = await exportLatest(b, task.id);
    const altered = JSON.parse(update.rawJson) as Record<string, unknown>;
    (altered.payload as Record<string, unknown>).nextRevision = 99;
    await expect(decodeAnyPaperBridgeMessage(JSON.stringify(altered))).rejects.toMatchObject({
      code: 'INVALID_ENVELOPE',
    });
    const wrongVersion = { ...JSON.parse(update.rawJson), version: 9 };
    await expect(decodeAnyPaperBridgeMessage(JSON.stringify(wrongVersion))).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    });
    const wrongType = { ...JSON.parse(update.rawJson), messageType: 'TASK_UNKNOWN' };
    await expect(decodeAnyPaperBridgeMessage(JSON.stringify(wrongType))).rejects.toMatchObject({
      code: 'UNSUPPORTED_MESSAGE_TYPE',
    });
    const tampered = { ...JSON.parse(update.rawJson), senderId: crypto.randomUUID() };
    await expect(decodeAnyPaperBridgeMessage(JSON.stringify(tampered))).rejects.toMatchObject({
      code: 'INVALID_CHECKSUM',
    });
    await expect(
      decodeAnyPaperBridgeMessage('x'.repeat(MAX_PAPERBRIDGE_PAYLOAD_BYTES + 1)),
    ).rejects.toMatchObject({ code: 'OVERSIZED_PAYLOAD' });
    expect(PaperBridgeError).toBeDefined();
  });

  it('classifies an unknown operation yielding an old known state as stale', async () => {
    const { a, b, task } = await pair();
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const rev2 = await exportLatest(b, task.id);
    await a.sync.applyIncomingUpdate(rev2.envelope);
    await b.tasks.updateTaskStatus(task.id, 'in_progress');
    const rev3 = await exportLatest(b, task.id);
    await a.sync.applyIncomingUpdate(rev3.envelope);
    if (rev2.envelope.messageType !== 'TASK_UPDATE') throw new Error('wrong type');
    const replay = await createPaperBridgeV2Envelope(
      {
        messageType: 'TASK_UPDATE',
        payload: {
          ...rev2.envelope.payload,
          operationId: crypto.randomUUID(),
        },
      },
      rev2.envelope.senderId,
    );
    expect((await a.sync.applyIncomingUpdate(replay.envelope)).status).toBe('STALE');
    expect((await a.tasks.getTaskById(task.id))?.revision).toBe(3);
  });

  it('rejects an oversized update without truncating its saved local task', async () => {
    const { b, task } = await pair();
    const updated = await b.tasks.updateTask(task.id, {
      description: 'x'.repeat(1000),
      instruction: {
        actionCode: 'DELIVER',
        itemCode: 'WATER',
        locationText: 'Gate B',
        additionalNotes: 'y'.repeat(1000),
      },
    });
    const ops = await b.sync.getOutgoingOperations(task.id);
    await expect(
      b.sync.createOutgoingTaskUpdate(task.id, ops[0]!.operationId),
    ).rejects.toMatchObject({ code: 'OVERSIZED_PAYLOAD' });
    expect((await b.tasks.getTaskById(task.id))?.description).toBe(updated.description);
    expect(await b.database.outgoing.count()).toBe(0);
  });

  it('keeps deleted local tasks safe and rejects an invalid status transition', async () => {
    const { a, b, task } = await pair();
    await a.tasks.deleteTask(task.id);
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const update = await exportLatest(b, task.id);
    expect((await a.sync.applyIncomingUpdate(update.envelope)).status).toBe('CONFLICT');
    expect((await a.tasks.getTaskById(task.id, true))?.deletedAt).toBeTruthy();

    const c = device();
    const d = device();
    const initial = await c.tasks.createTask({ title: 'Help', location: 'Clinic' });
    const create = await createPaperBridgeEnvelope(initial, await c.tasks.getDeviceId());
    await d.tasks.importPaperBridgeTask(create.envelope);
    const invalid = await createPaperBridgeV2Envelope(
      {
        messageType: 'TASK_UPDATE',
        payload: {
          taskId: initial.id,
          operationId: crypto.randomUUID(),
          originDeviceId: await c.tasks.getDeviceId(),
          baseRevision: 1,
          nextRevision: 2,
          parentOperationId: null,
          baseStateHash: await taskStateHash(initial),
          resultStateHash: await taskStateHash(initial),
          changes: { status: 'completed' },
          updatedAt: new Date().toISOString(),
        },
      },
      await c.tasks.getDeviceId(),
    );
    await expect(d.sync.applyIncomingUpdate(invalid.envelope)).rejects.toThrow(
      'Invalid task status transition',
    );
    expect((await d.tasks.getTaskById(initial.id))?.revision).toBe(1);
  });

  it('preserves structured canonical data and each device language setting', async () => {
    const a = device();
    const b = device();
    const task = await a.tasks.createTask({
      action: 'DELIVER_SUPPLIES',
      title: 'Water',
      location: 'Gate B',
      priority: 'high',
      quantity: 20,
      unit: 'Bottles',
      instruction: {
        actionCode: 'DELIVER',
        itemCode: 'WATER',
        unitCode: 'BOTTLE',
        quantity: 20,
        locationText: 'Gate B',
      },
    });
    const create = await createPaperBridgeEnvelope(task, await a.tasks.getDeviceId());
    await b.database.settings.put({
      key: 'language',
      value: 'ta',
      updatedAt: new Date().toISOString(),
    });
    await b.tasks.importPaperBridgeTask(create.envelope);
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const update = await exportLatest(b, task.id);
    expect((await a.sync.applyIncomingUpdate(update.envelope)).status).toBe('APPLIED');
    expect((await a.tasks.getTaskById(task.id))?.instruction).toEqual(task.instruction);
    expect((await b.database.settings.get('language'))?.value).toBe('ta');
  });

  it('rolls back task and import writes when an operation insert fails', async () => {
    const { a, b, task } = await pair();
    await b.tasks.updateTaskStatus(task.id, 'acknowledged');
    const outgoing = await exportLatest(b, task.id);
    const original = a.database.operations.add.bind(a.database.operations);
    const failure = vi.spyOn(a.database.operations, 'add').mockImplementation(() => {
      throw new Error('injected storage failure');
    });
    await expect(a.sync.applyIncomingUpdate(outgoing.envelope)).rejects.toThrow(
      'injected storage failure',
    );
    failure.mockRestore();
    expect(original).toBeDefined();
    expect((await a.tasks.getTaskById(task.id))?.revision).toBe(1);
    expect(await a.database.imports.get(outgoing.envelope.messageId)).toBeUndefined();
  });

  it('opens a version 2 database as version 3 without losing task or operation history', async () => {
    const name = `migration-test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      tasks: 'id, status, priority, action, createdAt, updatedAt, deletedAt, [status+updatedAt]',
      operations: 'operationId, taskId, operationType, timestamp, revision, [taskId+revision]',
      settings: 'key, updatedAt',
    });
    old.version(2).stores({ imports: 'messageId, taskId, importedAt' });
    await old.open();
    const task: Task = {
      id: crypto.randomUUID(),
      action: 'CUSTOM',
      title: 'Legacy task',
      location: 'Camp',
      priority: 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: crypto.randomUUID(),
      revision: 1,
      deletedAt: null,
    };
    const operation = {
      operationId: crypto.randomUUID(),
      taskId: task.id,
      actorId: task.createdBy,
      operationType: 'TASK_CREATE',
      timestamp: task.updatedAt,
      revision: 1,
      parentRevision: null,
      payload: task,
    };
    await old.table('tasks').add(task);
    await old.table('operations').add(operation);
    old.close();
    const upgraded = new RelayMidenDatabase(name);
    databases.push(upgraded);
    await upgraded.open();
    expect(await upgraded.tasks.get(task.id)).toEqual(task);
    expect((await upgraded.operations.get(operation.operationId))?.payload).toEqual(task);
    expect(await upgraded.conflicts.count()).toBe(0);
  });
});
