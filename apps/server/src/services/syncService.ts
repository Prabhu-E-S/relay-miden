import type { DatabaseSync } from 'node:sqlite';
import {
  applyTaskChanges,
  classifyIncomingOperation,
  taskStateHash,
  type LanOperationAccepted,
  type LanOperationBroadcast,
  type LanOperationPayload,
  type LanOperationRejected,
  type LanSyncBatch,
} from '@relay-miden/shared';
import { runInTransaction } from '../db/connection.js';
import { DeviceRepository } from '../repositories/deviceRepository.js';
import { TaskRepository } from '../repositories/taskRepository.js';
import { OperationRepository } from '../repositories/operationRepository.js';
import { ConflictRepository } from '../repositories/conflictRepository.js';

export type ProcessOperationResult =
  | { success: true; accepted: LanOperationAccepted; broadcast?: LanOperationBroadcast }
  | { success: false; rejected: LanOperationRejected };

export class SyncService {
  readonly devices: DeviceRepository;
  readonly tasks: TaskRepository;
  readonly operations: OperationRepository;
  readonly conflicts: ConflictRepository;

  constructor(private readonly db: DatabaseSync) {
    this.devices = new DeviceRepository(db);
    this.tasks = new TaskRepository(db);
    this.operations = new OperationRepository(db);
    this.conflicts = new ConflictRepository(db);
  }

  async processOperation(
    requestId: string,
    deviceId: string,
    operationPayload: LanOperationPayload,
  ): Promise<ProcessOperationResult> {
    if (operationPayload.type === 'TASK_CREATE') {
      return this.processTaskCreate(requestId, deviceId, operationPayload);
    }
    return this.processTaskUpdate(requestId, deviceId, operationPayload);
  }

  private async processTaskCreate(
    requestId: string,
    _deviceId: string,
    payload: Extract<LanOperationPayload, { type: 'TASK_CREATE' }>,
  ): Promise<ProcessOperationResult> {
    const { operationId, taskId, actorId, task, resultStateHash, timestamp } = payload;

    // Check existing operation idempotence
    const existingOp = this.operations.getOperationById(operationId);
    if (existingOp) {
      if (existingOp.result_state_hash === resultStateHash) {
        return {
          success: true,
          accepted: {
            requestId,
            operationId,
            taskId,
            sequence: existingOp.sequence,
            revision: existingOp.revision,
            resultStateHash,
            status: 'ALREADY_APPLIED',
          },
        };
      }
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'DUPLICATE_MISMATCH',
          reason: 'An operation with this ID was already stored with different content.',
        },
      };
    }

    // Check existing task
    const existingTask = this.tasks.getTask(taskId);
    if (existingTask) {
      if (existingTask.stateHash === resultStateHash) {
        return {
          success: true,
          accepted: {
            requestId,
            operationId,
            taskId,
            sequence: this.operations.getCurrentSequence(),
            revision: existingTask.task.revision,
            resultStateHash,
            status: 'ALREADY_APPLIED',
          },
        };
      }
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'CONFLICT',
          reason: 'A task with this ID already exists on the server with different content.',
        },
      };
    }

    // Validate state hash and revision
    const calculatedHash = await taskStateHash(task);
    if (calculatedHash !== resultStateHash) {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'INVALID',
          reason: 'Calculated task state hash does not match resultStateHash.',
        },
      };
    }

    if (task.revision !== 1) {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'INVALID',
          reason: 'Initial task creation must have revision 1.',
        },
      };
    }

    // Durable atomic insert
    const sequence = runInTransaction(this.db, () => {
      this.tasks.saveTask(task, resultStateHash);
      return this.operations.saveOperation({
        operationId,
        taskId,
        actorId,
        operationType: 'TASK_CREATE',
        timestamp,
        revision: 1,
        parentRevision: null,
        parentOperationId: null,
        resultStateHash,
        taskJson: JSON.stringify(task),
        operationPayload: payload,
      });
    });

    const accepted: LanOperationAccepted = {
      requestId,
      operationId,
      taskId,
      sequence,
      revision: 1,
      resultStateHash,
      status: 'APPLIED',
    };

    const broadcast: LanOperationBroadcast = {
      sequence,
      operation: payload,
    };

    return {
      success: true,
      accepted,
      broadcast,
    };
  }

  private async processTaskUpdate(
    requestId: string,
    _deviceId: string,
    payload: Extract<LanOperationPayload, { type: 'TASK_UPDATE' }>,
  ): Promise<ProcessOperationResult> {
    const update = payload.update;
    const { taskId, operationId, resultStateHash } = update;

    // Check existing operation idempotence
    const existingOp = this.operations.getOperationById(operationId);
    if (existingOp) {
      if (existingOp.result_state_hash === resultStateHash) {
        return {
          success: true,
          accepted: {
            requestId,
            operationId,
            taskId,
            sequence: existingOp.sequence,
            revision: existingOp.revision,
            resultStateHash,
            status: 'ALREADY_APPLIED',
          },
        };
      }
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'DUPLICATE_MISMATCH',
          reason: 'An operation with this ID was already stored with different content.',
        },
      };
    }

    // Check task existence on server
    const currentStored = this.tasks.getTask(taskId);
    if (!currentStored) {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'MISSING_PARENT',
          reason:
            'The target task does not exist on this server. Synchronize the task creation first.',
        },
      };
    }

    const { task: currentTask, stateHash: currentStateHash } = currentStored;

    // Retrieve operation ancestry from server operations table
    const pastOps = this.operations.getTaskOperations(taskId);
    const knownOperationIds = pastOps.map((op) => op.operation_id);
    const ancestorStateHashes = pastOps.map((op) => op.result_state_hash);

    // Classify using Phase 5 pure causal sync engine
    const classification = classifyIncomingOperation(
      {
        revision: currentTask.revision,
        stateHash: currentStateHash,
        knownOperationIds,
        ancestorStateHashes,
      },
      update,
    );

    if (classification === 'ALREADY_APPLIED') {
      return {
        success: true,
        accepted: {
          requestId,
          operationId,
          taskId,
          sequence: this.operations.getCurrentSequence(),
          revision: currentTask.revision,
          resultStateHash,
          status: 'ALREADY_APPLIED',
        },
      };
    }

    if (classification === 'STALE') {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'STALE',
          reason: 'This update is based on an older revision already superseded on the server.',
        },
      };
    }

    if (classification === 'MISSING_PARENT') {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'MISSING_PARENT',
          reason: 'Base revision or intermediate history is missing on the server.',
        },
      };
    }

    if (classification === 'INVALID') {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'INVALID',
          reason: 'Invalid task update revision or ancestry data.',
        },
      };
    }

    if (classification === 'CONFLICT') {
      // Record conflict in server database
      this.conflicts.recordConflict({
        id: operationId,
        taskId,
        incomingOperationId: operationId,
        localTask: currentTask,
        incoming: update,
        createdAt: new Date().toISOString(),
      });

      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'CONFLICT',
          reason:
            'Concurrent task modification conflict detected. Resolve conflict using resolution operation.',
        },
      };
    }

    // Applicable: calculate next task state
    let nextTask;
    try {
      nextTask = applyTaskChanges(currentTask, update);
    } catch (err) {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'INVALID',
          reason: err instanceof Error ? err.message : 'Failed to apply task changes.',
        },
      };
    }

    // Verify calculated state hash
    const calculatedHash = await taskStateHash(nextTask);
    if (calculatedHash !== resultStateHash) {
      return {
        success: false,
        rejected: {
          requestId,
          operationId,
          taskId,
          classification: 'INVALID',
          reason: 'Declared resultStateHash does not match computed state hash.',
        },
      };
    }

    // Durable atomic commit
    const sequence = runInTransaction(this.db, () => {
      this.tasks.saveTask(nextTask, resultStateHash);
      if (update.resolution) {
        this.conflicts.resolveConflict(update.resolution.mergedOperationId);
      }
      return this.operations.saveOperation({
        operationId,
        taskId,
        actorId: update.originDeviceId,
        operationType: update.resolution
          ? 'TASK_RESOLVE'
          : nextTask.deletedAt
            ? 'TASK_DELETE'
            : 'TASK_UPDATE',
        timestamp: update.updatedAt,
        revision: nextTask.revision,
        parentRevision: update.baseRevision,
        parentOperationId: update.parentOperationId,
        mergedOperationId: update.resolution?.mergedOperationId ?? null,
        mergedStateHash: update.resolution?.mergedStateHash ?? null,
        baseStateHash: update.baseStateHash,
        resultStateHash,
        changesJson: JSON.stringify(update.changes),
        taskJson: JSON.stringify(nextTask),
        operationPayload: payload,
      });
    });

    const accepted: LanOperationAccepted = {
      requestId,
      operationId,
      taskId,
      sequence,
      revision: nextTask.revision,
      resultStateHash,
      status: 'APPLIED',
    };

    const broadcast: LanOperationBroadcast = {
      sequence,
      operation: payload,
    };

    return {
      success: true,
      accepted,
      broadcast,
    };
  }

  getSyncBatch(cursor = 0, limit = 100): LanSyncBatch {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    const rows = this.operations.getOperationsSince(cursor, safeLimit);
    const totalServerOperations = this.operations.countOperations();

    const operations: LanOperationBroadcast[] = rows.map((row) => ({
      sequence: row.sequence,
      operation: JSON.parse(row.operation_payload_json),
    }));

    const lastSequence = rows.length > 0 ? rows[rows.length - 1]!.sequence : cursor;
    const hasMore = rows.length === safeLimit;

    return {
      operations,
      cursor: lastSequence,
      hasMore,
      totalServerOperations,
    };
  }
}
