import type { OutboxEntry, OutboxStatus, TaskOperation } from '@relay-miden/shared';
import { db, type RelayMidenDatabase } from '../../db/database';

export interface OutboxStats {
  pending: number;
  inFlight: number;
  acknowledged: number;
  blocked: number;
  failed: number;
  total: number;
}

const SYNCED_OPERATIONS_KEY = 'lan_synced_operations';

/**
 * Calculates exponential backoff delay with random jitter (±20%).
 * Suggested delays: 1s, 2s, 4s, 8s, 16s, capped at 30s.
 */
export function calculateBackoffDelay(
  attemptCount: number,
  baseMs = 1000,
  maxMs = 30000,
  jitterFactor = 0.2,
): number {
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attemptCount - 1)));
  const jitterRange = exponential * jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.round(Math.max(baseMs, Math.min(maxMs, exponential + jitter)));
}

/**
 * Recovers any outbox entries left in IN_FLIGHT state from an interrupted session,
 * tab crash, or page reload back to PENDING.
 */
export async function resetAbandonedInFlight(database: RelayMidenDatabase = db): Promise<number> {
  return database.transaction('rw', database.outbox, async () => {
    const abandoned = await database.outbox.where('status').equals('IN_FLIGHT').toArray();
    for (const entry of abandoned) {
      await database.outbox.update(entry.operationId, {
        status: 'PENDING',
        lastError: 'Recovered from interrupted in-flight state.',
      });
    }
    return abandoned.length;
  });
}

/**
 * Backward-compatible migration pass: backfills outbox records for any existing
 * locally generated operations from previous phases that lack an outbox entry.
 */
export async function backfillLegacyOutbox(database: RelayMidenDatabase = db): Promise<number> {
  return database.transaction(
    'rw',
    [database.operations, database.outbox, database.settings],
    async () => {
      const deviceIdRecord = await database.settings.get('device-id');
      const deviceId = typeof deviceIdRecord?.value === 'string' ? deviceIdRecord.value : null;
      if (!deviceId) return 0;

      const syncedRecord = await database.settings.get(SYNCED_OPERATIONS_KEY);
      const syncedIds = new Set<string>(
        syncedRecord && Array.isArray(syncedRecord.value) ? (syncedRecord.value as string[]) : [],
      );

      const allOps = await database.operations.toArray();
      let created = 0;

      for (const op of allOps) {
        if (
          op.actorId === deviceId &&
          ['TASK_CREATE', 'TASK_UPDATE', 'TASK_DELETE', 'TASK_RESOLVE'].includes(op.operationType)
        ) {
          const existing = await database.outbox.get(op.operationId);
          if (!existing) {
            const isSynced = syncedIds.has(op.operationId);
            await database.outbox.add({
              operationId: op.operationId,
              taskId: op.taskId,
              originDeviceId: deviceId,
              status: isSynced ? 'ACKNOWLEDGED' : 'PENDING',
              attemptCount: isSynced ? 1 : 0,
              createdAt: op.timestamp,
              ...(isSynced ? { acknowledgedAt: op.timestamp } : {}),
            });
            created++;
          }
        }
      }
      return created;
    },
  );
}

/**
 * Returns summary statistics of the durable outbox queue.
 */
export async function getOutboxStats(database: RelayMidenDatabase = db): Promise<OutboxStats> {
  const records = await database.outbox.toArray();
  const stats: OutboxStats = {
    pending: 0,
    inFlight: 0,
    acknowledged: 0,
    blocked: 0,
    failed: 0,
    total: records.length,
  };

  for (const record of records) {
    switch (record.status) {
      case 'PENDING':
        stats.pending++;
        break;
      case 'IN_FLIGHT':
        stats.inFlight++;
        break;
      case 'ACKNOWLEDGED':
        stats.acknowledged++;
        break;
      case 'BLOCKED':
        stats.blocked++;
        break;
      case 'FAILED':
        stats.failed++;
        break;
    }
  }

  return stats;
}

/**
 * Retrieves outbox entries filtered by status.
 */
export async function getOutboxEntries(
  status?: OutboxStatus,
  database: RelayMidenDatabase = db,
): Promise<OutboxEntry[]> {
  if (status) {
    return database.outbox.where('status').equals(status).toArray();
  }
  return database.outbox.orderBy('createdAt').toArray();
}

/**
 * Retrieves eligible PENDING outbox operations sorted in strict causal order.
 * - Parent operations within the same task are scheduled before child operations.
 * - Operations across different tasks are ordered by creation timestamp.
 */
export async function getPendingEntriesForReplay(
  database: RelayMidenDatabase = db,
): Promise<OutboxEntry[]> {
  const now = new Date().toISOString();
  const pendingRecords = await database.outbox.where('status').equals('PENDING').toArray();

  // Filter out records whose retry timer is in the future
  const eligible = pendingRecords.filter((entry) => !entry.nextRetryAt || entry.nextRetryAt <= now);

  if (eligible.length <= 1) {
    return eligible;
  }

  // Fetch the corresponding operations to determine revisions and dependencies
  const opIds = eligible.map((e) => e.operationId);
  const operations = await database.operations.where('operationId').anyOf(opIds).toArray();
  const opMap = new Map<string, TaskOperation>(operations.map((op) => [op.operationId, op]));

  // Group by taskId
  const byTask = new Map<string, OutboxEntry[]>();
  for (const entry of eligible) {
    const list = byTask.get(entry.taskId) ?? [];
    list.push(entry);
    byTask.set(entry.taskId, list);
  }

  // Sort within each task by revision ascending
  for (const [, list] of byTask.entries()) {
    list.sort((a, b) => {
      const opA = opMap.get(a.operationId);
      const opB = opMap.get(b.operationId);
      const revA = opA?.revision ?? 0;
      const revB = opB?.revision ?? 0;
      if (revA !== revB) {
        return revA - revB;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  // Interleave tasks preserving causal task order
  // Sort tasks by earliest pending operation creation time
  const taskGroups = Array.from(byTask.values()).sort((groupA, groupB) => {
    const firstA = groupA[0]?.createdAt ?? '';
    const firstB = groupB[0]?.createdAt ?? '';
    return firstA.localeCompare(firstB);
  });

  return taskGroups.flat();
}

/**
 * Marks an outbox entry as IN_FLIGHT when transmission begins.
 */
export async function markOutboxInFlight(
  operationId: string,
  database: RelayMidenDatabase = db,
): Promise<void> {
  await database.transaction('rw', database.outbox, async () => {
    const existing = await database.outbox.get(operationId);
    if (existing) {
      await database.outbox.update(operationId, {
        status: 'IN_FLIGHT',
        attemptCount: existing.attemptCount + 1,
        lastAttemptAt: new Date().toISOString(),
      });
    }
  });
}

/**
 * Marks an outbox entry as ACKNOWLEDGED when durably confirmed by server.
 */
export async function markOutboxAcknowledged(
  operationId: string,
  sequence?: number,
  database: RelayMidenDatabase = db,
): Promise<void> {
  await database.transaction('rw', database.outbox, async () => {
    const existing = await database.outbox.get(operationId);
    if (existing) {
      await database.outbox.update(operationId, {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date().toISOString(),
        lastError: undefined,
        ...(sequence !== undefined ? { serverSequence: sequence } : {}),
      });
    }
  });
}

/**
 * Marks an outbox entry as BLOCKED due to a missing dependency or conflict.
 */
export async function markOutboxBlocked(
  operationId: string,
  reason: string,
  database: RelayMidenDatabase = db,
): Promise<void> {
  await database.transaction('rw', database.outbox, async () => {
    await database.outbox.update(operationId, {
      status: 'BLOCKED',
      lastError: reason,
    });
  });
}

/**
 * Marks an outbox entry as FAILED due to a permanent validation or protocol error.
 */
export async function markOutboxFailed(
  operationId: string,
  error: string,
  database: RelayMidenDatabase = db,
): Promise<void> {
  await database.transaction('rw', database.outbox, async () => {
    await database.outbox.update(operationId, {
      status: 'FAILED',
      lastError: error,
    });
  });
}

/**
 * Reverts an outbox entry to PENDING with an exponential backoff retry timestamp.
 */
export async function markOutboxRetry(
  operationId: string,
  error: string,
  backoffMs: number,
  database: RelayMidenDatabase = db,
): Promise<void> {
  await database.transaction('rw', database.outbox, async () => {
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    await database.outbox.update(operationId, {
      status: 'PENDING',
      lastError: error,
      nextRetryAt,
    });
  });
}

/**
 * User action: resets all BLOCKED and FAILED entries back to PENDING for re-evaluation.
 */
export async function retryBlockedAndFailed(database: RelayMidenDatabase = db): Promise<number> {
  return database.transaction('rw', database.outbox, async () => {
    const eligible = await database.outbox.where('status').anyOf(['BLOCKED', 'FAILED']).toArray();

    for (const entry of eligible) {
      await database.outbox.update(entry.operationId, {
        status: 'PENDING',
        lastError: undefined,
        nextRetryAt: undefined,
      });
    }

    return eligible.length;
  });
}
