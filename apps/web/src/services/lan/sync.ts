import {
  TaskSchema,
  TaskOperationSchema,
  generateUuid,
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
import {
  calculateBackoffDelay,
  getPendingEntriesForReplay,
  markOutboxAcknowledged,
  markOutboxBlocked,
  markOutboxFailed,
  markOutboxInFlight,
  markOutboxRetry,
} from './outbox';

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
    await markOutboxAcknowledged(operationId, serverSequence, database);

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
      const existingHash = await taskStateHash(existingTask);
      if (existingHash !== operation.resultStateHash) {
        return {
          status: 'CONFLICT',
          task: existingTask,
          message: 'A task with this ID exists locally with different content.',
        };
      }
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

    if (result.status === 'APPLIED' || result.status === 'ALREADY_APPLIED') {
      await recordServerAcceptance(operation.update.operationId, undefined, database);
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

  // Mark outbox entry as IN_FLIGHT
  await markOutboxInFlight(operationId, database);

  try {
    const payload = await buildLanOperationPayload(operationId, database, sync);
    const deviceId = await tasks.getDeviceId();
    const requestId = generateUuid();

    const submitEnvelope: LanOperationSubmit = {
      protocolVersion: LAN_PROTOCOL_VERSION,
      requestId,
      deviceId,
      operation: payload,
    };

    return await new Promise((resolve) => {
      const timer = setTimeout(async () => {
        cleanup();
        const timeoutMsg = 'Operation submission timed out waiting for server response.';
        await markOutboxRetry(operationId, timeoutMsg, calculateBackoffDelay(1), database);
        resolve({
          requestId,
          operationId,
          classification: 'INVALID',
          reason: timeoutMsg,
        });
      }, 8000);

      const onAccepted = async (data: unknown) => {
        const parsed = LanOperationAcceptedSchema.safeParse(data);
        if (parsed.success && parsed.data.requestId === requestId) {
          cleanup();
          await recordServerAcceptance(operationId, parsed.data.sequence, database);
          resolve(parsed.data);
        }
      };

      const onRejected = async (data: unknown) => {
        const parsed = LanOperationRejectedSchema.safeParse(data);
        if (parsed.success && parsed.data.requestId === requestId) {
          cleanup();
          const rejection = parsed.data;
          switch (rejection.classification) {
            case 'CONFLICT':
            case 'MISSING_PARENT':
            case 'STALE':
              await markOutboxBlocked(operationId, rejection.reason, database);
              break;
            case 'INVALID':
            case 'UNAUTHORIZED':
            case 'DUPLICATE_MISMATCH':
              await markOutboxFailed(operationId, rejection.reason, database);
              break;
          }
          resolve(rejection);
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
    const msg = err instanceof Error ? err.message : 'Failed to build or submit operation';
    await markOutboxRetry(operationId, msg, calculateBackoffDelay(1), database);
    return null;
  }
}

/**
 * Replays all eligible pending outbox operations in strict causal order.
 */
export async function replayPendingOutbox(
  database: RelayMidenDatabase = db,
  tasks: TaskRepository = taskRepository,
  sync: SyncRepository = syncRepository,
): Promise<{ replayed: number; acknowledged: number; blocked: number; failed: number }> {
  const eligible = await getPendingEntriesForReplay(database);
  const stats = { replayed: 0, acknowledged: 0, blocked: 0, failed: 0 };
  const blockedTasks = new Set<string>();

  for (const entry of eligible) {
    if (blockedTasks.has(entry.taskId)) {
      await markOutboxBlocked(
        entry.operationId,
        'Prerequisite parent operation for this task is blocked.',
        database,
      );
      stats.blocked++;
      continue;
    }

    stats.replayed++;
    const result = await submitLocalOperation(entry.operationId, database, tasks, sync);

    if (!result) {
      // Transport failed or socket disconnected; pause remaining replay
      break;
    }

    if ('status' in result) {
      // Accepted: APPLIED or ALREADY_APPLIED
      stats.acknowledged++;
    } else {
      // Rejected
      blockedTasks.add(entry.taskId);
      if (['CONFLICT', 'MISSING_PARENT', 'STALE'].includes(result.classification)) {
        stats.blocked++;
      } else {
        stats.failed++;
      }
    }
  }

  return stats;
}

// Single-flight synchronization lock to prevent concurrent sync loops
let activeSyncPromise: Promise<{
  operationsApplied: number;
  nextCursor: number;
  outboxReplayed?: number;
}> | null = null;

export async function requestLanSync(
  cursor?: number,
  limit = 50,
  database: RelayMidenDatabase = db,
  tasks: TaskRepository = taskRepository,
  sync: SyncRepository = syncRepository,
): Promise<{ operationsApplied: number; nextCursor: number; outboxReplayed?: number }> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    const socket = lanConnection.getSocket();
    if (!socket || !lanConnection.isConnected()) {
      throw new Error('Cannot synchronize: LAN server is not connected.');
    }

    const deviceId = await tasks.getDeviceId();
    let currentCursor = cursor ?? lanConnection.getSyncCursor();
    let totalApplied = 0;
    let hasMore = true;

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

      // Detect cursor invalidation (e.g. server reset or wiped database)
      if (currentCursor > batch.totalServerOperations && batch.totalServerOperations >= 0) {
        console.warn(
          'Server sequence is lower than local cursor (server database may have been reset). Resetting cursor to 0.',
        );
        currentCursor = 0;
        lanConnection.setSyncCursor(0);
      }

      for (const item of batch.operations) {
        try {
          const res = await applyIncomingLanOperation(item.operation, database, sync);
          if (res.status === 'APPLIED') {
            totalApplied++;
          }
          // Cursor safety: advance contiguous sequence only after durable commit
          if (item.sequence > currentCursor) {
            currentCursor = item.sequence;
            lanConnection.setSyncCursor(currentCursor);
          }
        } catch (err) {
          console.error('Error applying remote operation from sync batch:', err);
          break;
        }
      }

      hasMore = batch.hasMore;
    }

    // Replay pending outbox entries in strict causal order
    const replayStats = await replayPendingOutbox(database, tasks, sync);

    // If outbox operations were accepted, do a quick catch-up check for any concurrent updates
    if (replayStats.acknowledged > 0) {
      try {
        const followUpBatch = await new Promise<LanSyncBatch>((resolve, reject) => {
          const timer = setTimeout(() => {
            socket.off('sync:operations', onFollowUp);
            reject(new Error('Follow-up sync timed out.'));
          }, 5000);

          const onFollowUp = (data: unknown) => {
            const parsed = LanSyncBatchSchema.safeParse(data);
            if (parsed.success) {
              clearTimeout(timer);
              socket.off('sync:operations', onFollowUp);
              resolve(parsed.data);
            }
          };

          socket.on('sync:operations', onFollowUp);
          socket.emit('sync:request', {
            protocolVersion: LAN_PROTOCOL_VERSION,
            deviceId,
            cursor: currentCursor,
            limit: 50,
          });
        });

        for (const item of followUpBatch.operations) {
          try {
            const res = await applyIncomingLanOperation(item.operation, database, sync);
            if (res.status === 'APPLIED') {
              totalApplied++;
            }
            if (item.sequence > currentCursor) {
              currentCursor = item.sequence;
              lanConnection.setSyncCursor(currentCursor);
            }
          } catch (err) {
            console.error('Error in follow-up sync batch:', err);
            break;
          }
        }
      } catch {
        // Follow up batch timeout is non-fatal
      }
    }

    lanConnection.setLastSyncAt(new Date().toISOString());

    return {
      operationsApplied: totalApplied,
      nextCursor: currentCursor,
      outboxReplayed: replayStats.replayed,
    };
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}
