import {
  TaskSchema,
  TaskOperationSchema,
  taskStateHash,
  type Task,
  type TaskOperation,
} from '@relay-miden/shared';
import { db, type RelayMidenDatabase } from '../../db/database';
import { taskRepository, type TaskRepository } from '../../db/task-repository';
import { syncRepository, type SyncRepository } from '../sync/sync-repository';
import {
  LAN_PROTOCOL_VERSION,
  LanOperationAcceptedSchema,
  LanOperationRejectedSchema,
  LanSyncBatchSchema,
  type LanOperationPayload,
  type LanOperationSubmit,
  type LanOperationAccepted,
  type LanOperationRejected,
  type LanSyncBatch,
} from './protocol';
import { lanConnection } from './connection';

const SYNCED_OPERATIONS_KEY = 'lan_synced_operations';

export async function getSyncedOperationIds(database: RelayMidenDatabase = db): Promise<string[]> {
  try {
    const record = await database.settings.get(SYNCED_OPERATIONS_KEY);
    if (record && Array.isArray(record.value)) {
      return record.value as string[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function recordServerAcceptance(
  operationId: string,
  serverSequence?: number,
  database: RelayMidenDatabase = db,
): Promise<void> {
  try {
    const existing = await getSyncedOperationIds(database);
    if (!existing.includes(operationId)) {
      existing.push(operationId);
      await database.settings.put({
        key: SYNCED_OPERATIONS_KEY,
        value: existing,
        updatedAt: new Date().toISOString(),
      });
    }
    if (serverSequence !== undefined && serverSequence > lanConnection.getSyncCursor()) {
      lanConnection.setSyncCursor(serverSequence);
    }
  } catch (err) {
    console.error('Failed to record server acceptance:', err);
  }
}

export async function getUnsynchronizedOperations(
  database: RelayMidenDatabase = db,
  tasks: TaskRepository = taskRepository,
): Promise<TaskOperation[]> {
  try {
    const syncedIds = new Set(await getSyncedOperationIds(database));
    const deviceId = await tasks.getDeviceId();
    const allOps = await database.operations.toArray();

    return allOps.filter(
      (op) =>
        op.actorId === deviceId &&
        ['TASK_CREATE', 'TASK_UPDATE', 'TASK_DELETE', 'TASK_RESOLVE'].includes(op.operationType) &&
        !syncedIds.has(op.operationId),
    );
  } catch {
    return [];
  }
}

export async function buildLanOperationPayload(
  operationId: string,
  database: RelayMidenDatabase = db,
  sync: SyncRepository = syncRepository,
): Promise<LanOperationPayload> {
  const op = await database.operations.get(operationId);
  if (!op) {
    throw new Error(`Operation ${operationId} not found in local database.`);
  }

  if (op.operationType === 'TASK_CREATE') {
    const task = TaskSchema.parse(op.payload);
    const resultStateHash = await taskStateHash(task);
    return {
      type: 'TASK_CREATE',
      operationId: op.operationId,
      taskId: op.taskId,
      actorId: op.actorId,
      task,
      resultStateHash,
      timestamp: op.timestamp,
    };
  }

  const updatePayload = await sync.buildTaskUpdatePayload(op.taskId, op.operationId);
  return {
    type: 'TASK_UPDATE',
    update: updatePayload,
  };
}

export async function applyIncomingLanOperation(
  operation: LanOperationPayload,
  database: RelayMidenDatabase = db,
  sync: SyncRepository = syncRepository,
): Promise<{ status: string; task?: Task | undefined; message?: string | undefined }> {
  if (operation.type === 'TASK_CREATE') {
    const existingTask = await database.tasks.get(operation.taskId);
    const existingOp = await database.operations.get(operation.operationId);

    if (existingOp) {
      await recordServerAcceptance(operation.operationId, undefined, database);
      return { status: 'ALREADY_APPLIED', task: existingTask };
    }

    if (existingTask) {
      await recordServerAcceptance(operation.operationId, undefined, database);
      return { status: 'ALREADY_APPLIED', task: existingTask };
    }

    const task = TaskSchema.parse(operation.task);
    const taskOp = TaskOperationSchema.parse({
      operationId: operation.operationId,
      taskId: task.id,
      actorId: operation.actorId,
      operationType: 'TASK_CREATE',
      timestamp: operation.timestamp,
      revision: 1,
      parentRevision: null,
      parentOperationId: null,
      payload: task,
    });

    await database.transaction('rw', [database.tasks, database.operations], async () => {
      if (!(await database.tasks.get(task.id))) {
        await database.tasks.add(task);
      }
      if (!(await database.operations.get(taskOp.operationId))) {
        await database.operations.add(taskOp);
      }
    });

    await recordServerAcceptance(operation.operationId, undefined, database);
    return { status: 'APPLIED', task };
  }

  if (operation.type === 'TASK_UPDATE') {
    const result = await sync.applyIncomingTaskUpdatePayload(
      operation.update,
      operation.update.originDeviceId,
      `lan-${operation.update.operationId}`,
    );

    await recordServerAcceptance(operation.update.operationId, undefined, database);

    if (result.status === 'APPLIED' || result.status === 'ALREADY_APPLIED') {
      return { status: result.status, task: result.task };
    }

    if (result.status === 'CONFLICT') {
      return { status: 'CONFLICT', message: 'Concurrent update conflict detected.' };
    }

    return { status: result.status, message: 'message' in result ? result.message : undefined };
  }

  return { status: 'INVALID', message: 'Unknown operation type.' };
}

export async function submitLocalOperation(
  operationId: string,
  database: RelayMidenDatabase = db,
  tasks: TaskRepository = taskRepository,
  sync: SyncRepository = syncRepository,
): Promise<LanOperationAccepted | LanOperationRejected | null> {
  const socket = lanConnection.getSocket();
  if (!socket || !lanConnection.isConnected()) {
    return null;
  }

  try {
    const payload = await buildLanOperationPayload(operationId, database, sync);
    const deviceId = await tasks.getDeviceId();
    const requestId = crypto.randomUUID();

    const submitEnvelope: LanOperationSubmit = {
      protocolVersion: LAN_PROTOCOL_VERSION,
      requestId,
      deviceId,
      operation: payload,
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve({
          requestId,
          operationId,
          classification: 'INVALID',
          reason: 'Operation submission timed out waiting for server response.',
        });
      }, 8000);

      const onAccepted = (data: unknown) => {
        const parsed = LanOperationAcceptedSchema.safeParse(data);
        if (parsed.success && parsed.data.requestId === requestId) {
          cleanup();
          void recordServerAcceptance(operationId, parsed.data.sequence, database);
          resolve(parsed.data);
        }
      };

      const onRejected = (data: unknown) => {
        const parsed = LanOperationRejectedSchema.safeParse(data);
        if (parsed.success && parsed.data.requestId === requestId) {
          cleanup();
          resolve(parsed.data);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('operation:accepted', onAccepted);
        socket.off('operation:rejected', onRejected);
      };

      socket.on('operation:accepted', onAccepted);
      socket.on('operation:rejected', onRejected);

      socket.emit('operation:submit', submitEnvelope);
    });
  } catch (err) {
    console.error('Failed to submit local operation to LAN:', err);
    return null;
  }
}

export async function requestLanSync(
  cursor?: number,
  limit = 50,
  database: RelayMidenDatabase = db,
  tasks: TaskRepository = taskRepository,
  sync: SyncRepository = syncRepository,
): Promise<{ operationsApplied: number; nextCursor: number }> {
  const socket = lanConnection.getSocket();
  if (!socket || !lanConnection.isConnected()) {
    throw new Error('Cannot synchronize: LAN server is not connected.');
  }

  const deviceId = await tasks.getDeviceId();
  let currentCursor = cursor ?? lanConnection.getSyncCursor();
  let totalApplied = 0;
  let hasMore = true;

  // Push unsynchronized local operations first
  const unsynced = await getUnsynchronizedOperations(database, tasks);
  for (const op of unsynced) {
    try {
      await submitLocalOperation(op.operationId, database, tasks, sync);
    } catch (err) {
      console.warn('Failed to push unsynced operation during sync:', op.operationId, err);
    }
  }

  // Pull missing operations from server
  while (hasMore) {
    const batch = await new Promise<LanSyncBatch>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('sync:operations', onBatch);
        reject(new Error('Sync request timed out waiting for server operations.'));
      }, 10000);

      const onBatch = (data: unknown) => {
        const parsed = LanSyncBatchSchema.safeParse(data);
        if (parsed.success) {
          clearTimeout(timer);
          socket.off('sync:operations', onBatch);
          resolve(parsed.data);
        }
      };

      socket.on('sync:operations', onBatch);

      socket.emit('sync:request', {
        protocolVersion: LAN_PROTOCOL_VERSION,
        deviceId,
        cursor: currentCursor,
        limit,
      });
    });

    for (const item of batch.operations) {
      try {
        const res = await applyIncomingLanOperation(item.operation, database, sync);
        if (res.status === 'APPLIED') {
          totalApplied++;
        }
      } catch (err) {
        console.error('Error applying remote operation from sync batch:', err);
      }
    }

    if (batch.operations.length > 0) {
      const last = batch.operations[batch.operations.length - 1];
      if (last && last.sequence > currentCursor) {
        currentCursor = last.sequence;
      }
    }
    hasMore = batch.hasMore;
    lanConnection.setSyncCursor(currentCursor);
  }

  lanConnection.setLastSyncAt(new Date().toISOString());

  return { operationsApplied: totalApplied, nextCursor: currentCursor };
}
