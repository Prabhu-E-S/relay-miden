import {
  PaperBridgeV2EnvelopeSchema,
  TaskAckPayloadSchema,
  TaskOperationSchema,
  TaskSchema,
  TaskUpdatePayloadSchema,
  applyTaskChanges,
  classifyIncomingOperation,
  completeTaskChanges,
  createPaperBridgeV2Envelope,
  taskChanges,
  taskStateHash,
  verifyEnvelopeChecksum,
  type PaperBridgeV2Envelope,
  type Task,
  type TaskOperation,
  type SyncClassification,
} from '@relay-miden/shared';
import { canonicalJsonStringify } from '@relay-miden/shared';
import { db, type RelayMidenDatabase, type SyncConflictRecord } from '../../db/database';
import { TaskRepository, taskRepository } from '../../db/task-repository';

type UpdateEnvelope = Extract<PaperBridgeV2Envelope, { messageType: 'TASK_UPDATE' }>;
type AckEnvelope = Extract<PaperBridgeV2Envelope, { messageType: 'TASK_ACK' }>;

export type IncomingUpdateResult =
  | { status: 'APPLIED' | 'ALREADY_APPLIED'; task: Task; messageId: string }
  | { status: 'CONFLICT'; conflict: SyncConflictRecord }
  | { status: 'STALE' | 'MISSING_PARENT' | 'INVALID'; message: string };

export class SyncRepository {
  constructor(
    readonly database: RelayMidenDatabase = db,
    readonly tasks: TaskRepository = taskRepository,
  ) {}

  async getOutgoingOperations(taskId: string): Promise<TaskOperation[]> {
    // Live queries are read-only observers. Avoid a nested read-write identity transaction here.
    const ownId = (await this.database.settings.get('device-id'))?.value;
    if (typeof ownId !== 'string') return [];
    const operations = await this.tasks.getTaskOperations(taskId);
    return operations.filter(
      (operation) =>
        operation.actorId === ownId &&
        ['TASK_UPDATE', 'TASK_DELETE', 'TASK_RESOLVE'].includes(operation.operationType),
    );
  }

  async createOutgoingTaskUpdate(taskId: string, operationId: string) {
    const existing = await this.database.outgoing.where('operationId').equals(operationId).first();
    if (existing && JSON.parse(existing.rawJson).messageType === 'TASK_UPDATE') {
      const parsed = PaperBridgeV2EnvelopeSchema.parse(JSON.parse(existing.rawJson));
      return {
        envelope: parsed,
        rawJson: existing.rawJson,
        byteSize: new TextEncoder().encode(existing.rawJson).length,
      };
    }
    const operation = TaskOperationSchema.parse(await this.database.operations.get(operationId));
    if (
      operation.taskId !== taskId ||
      !['TASK_UPDATE', 'TASK_DELETE', 'TASK_RESOLVE'].includes(operation.operationType)
    ) {
      throw new Error('Select a local task change to share.');
    }
    const ownId = await this.tasks.getDeviceId();
    if (operation.actorId !== ownId)
      throw new Error('Only local changes can be exported as updates.');
    const parent = operation.parentOperationId
      ? await this.database.operations.get(operation.parentOperationId)
      : (
          await this.database.operations
            .where('[taskId+revision]')
            .equals([taskId, operation.revision - 1])
            .toArray()
        )[0];
    if (!parent || parent.revision !== operation.revision - 1) {
      throw new Error('The parent task history is unavailable. Export the task snapshot first.');
    }
    const payload = TaskUpdatePayloadSchema.parse({
      taskId,
      operationId: operation.operationId,
      originDeviceId: ownId,
      baseRevision: parent.revision,
      nextRevision: operation.revision,
      parentOperationId: operation.parentOperationId ?? null,
      baseStateHash: await taskStateHash(parent.payload),
      resultStateHash: await taskStateHash(operation.payload),
      changes:
        operation.operationType === 'TASK_RESOLVE'
          ? completeTaskChanges(operation.payload)
          : taskChanges(parent.payload, operation.payload),
      updatedAt: operation.payload.updatedAt,
      ...(operation.operationType === 'TASK_RESOLVE' &&
      operation.mergedOperationId &&
      operation.mergedStateHash
        ? {
            resolution: {
              mergedOperationId: operation.mergedOperationId,
              mergedStateHash: operation.mergedStateHash,
            },
          }
        : {}),
      ...(parent.payload.status === 'completed' && operation.payload.status === 'pending'
        ? { reopen: true }
        : {}),
    });
    const encoded = await createPaperBridgeV2Envelope(
      { messageType: 'TASK_UPDATE', payload },
      ownId,
    );
    await this.database.transaction('rw', this.database.outgoing, async () => {
      const race = await this.database.outgoing.where('operationId').equals(operationId).first();
      if (!race)
        await this.database.outgoing.add({
          messageId: encoded.envelope.messageId,
          taskId,
          operationId,
          createdAt: encoded.envelope.createdAt,
          rawJson: encoded.rawJson,
        });
    });
    const stored = await this.database.outgoing.where('operationId').equals(operationId).first();
    if (stored && stored.messageId !== encoded.envelope.messageId) {
      const envelope = PaperBridgeV2EnvelopeSchema.parse(JSON.parse(stored.rawJson));
      return {
        envelope,
        rawJson: stored.rawJson,
        byteSize: new TextEncoder().encode(stored.rawJson).length,
      };
    }
    return encoded;
  }

  async applyIncomingUpdate(untrusted: PaperBridgeV2Envelope): Promise<IncomingUpdateResult> {
    const parsed = PaperBridgeV2EnvelopeSchema.parse(untrusted);
    if (parsed.messageType !== 'TASK_UPDATE')
      throw new Error('This QR does not contain a task update.');
    if (!(await verifyEnvelopeChecksum(parsed)))
      throw new Error('QR checksum verification failed.');
    const incoming = parsed as UpdateEnvelope;
    if (incoming.senderId !== incoming.payload.originDeviceId)
      throw new Error('Update sender and origin do not match.');
    const task = await this.tasks.getTaskById(incoming.payload.taskId, true);
    const operations = task ? await this.tasks.getTaskOperations(task.id) : [];
    const hashes = await Promise.all(
      operations.map((operation) => taskStateHash(operation.payload)),
    );
    const classification: SyncClassification = classifyIncomingOperation(
      task
        ? {
            revision: task.revision,
            stateHash: await taskStateHash(task),
            knownOperationIds: operations.map((operation) => operation.operationId),
            ancestorStateHashes: hashes,
          }
        : null,
      incoming.payload,
    );
    if (classification === 'ALREADY_APPLIED' && task) {
      const prior = operations.find(
        (operation) => operation.operationId === incoming.payload.operationId,
      );
      if (!prior || (await taskStateHash(prior.payload)) !== incoming.payload.resultStateHash) {
        return { status: 'INVALID', message: 'An operation with this ID has different content.' };
      }
      return { status: 'ALREADY_APPLIED', task, messageId: incoming.messageId };
    }
    if (classification === 'CONFLICT' && task) {
      const baseIndex = hashes.indexOf(incoming.payload.baseStateHash);
      if (baseIndex < 0)
        return {
          status: 'MISSING_PARENT',
          message: 'The incoming branch base is missing. Transfer its earlier update first.',
        };
      try {
        const proposed = applyTaskChanges(operations[baseIndex]!.payload, incoming.payload);
        if ((await taskStateHash(proposed)) !== incoming.payload.resultStateHash) {
          return {
            status: 'INVALID',
            message: 'The incoming branch does not match its declared state hash.',
          };
        }
      } catch {
        return { status: 'INVALID', message: 'The incoming branch contains invalid task changes.' };
      }
      const conflict: SyncConflictRecord = {
        id: incoming.payload.operationId,
        taskId: task.id,
        incomingOperationId: incoming.payload.operationId,
        incomingMessageId: incoming.messageId,
        localTask: task,
        incoming: incoming.payload,
        createdAt: new Date().toISOString(),
      };
      await this.database.transaction('rw', this.database.conflicts, async () => {
        if (!(await this.database.conflicts.get(conflict.id)))
          await this.database.conflicts.add(conflict);
      });
      return { status: 'CONFLICT', conflict: (await this.database.conflicts.get(conflict.id))! };
    }
    if (classification !== 'APPLICABLE' || !task) {
      const messages = {
        STALE: 'This update belongs to an older branch and was not applied.',
        MISSING_PARENT:
          'The original task or an earlier update is missing. Transfer that QR first.',
        INVALID: 'The update has invalid revision or ancestry data.',
        CONFLICT: 'The update conflicts with local history.',
        ALREADY_APPLIED: 'This update was already applied.',
        APPLICABLE: '',
      };
      const status =
        classification === 'STALE' || classification === 'MISSING_PARENT'
          ? classification
          : 'INVALID';
      return { status, message: messages[classification] };
    }
    if (task.deletedAt && incoming.payload.changes.deletedAt !== task.deletedAt) {
      const conflict: SyncConflictRecord = {
        id: incoming.payload.operationId,
        taskId: task.id,
        incomingOperationId: incoming.payload.operationId,
        incomingMessageId: incoming.messageId,
        localTask: task,
        incoming: incoming.payload,
        createdAt: new Date().toISOString(),
      };
      await this.database.conflicts.put(conflict);
      return { status: 'CONFLICT', conflict };
    }
    const next = applyTaskChanges(task, incoming.payload);
    if ((await taskStateHash(next)) !== incoming.payload.resultStateHash) {
      return {
        status: 'INVALID',
        message: 'Update result does not match its declared state hash.',
      };
    }
    const operation = TaskOperationSchema.parse({
      operationId: incoming.payload.operationId,
      taskId: task.id,
      actorId: incoming.payload.originDeviceId,
      operationType: incoming.payload.resolution
        ? 'TASK_RESOLVE'
        : next.deletedAt
          ? 'TASK_DELETE'
          : 'TASK_UPDATE',
      timestamp: next.updatedAt,
      revision: next.revision,
      parentRevision: task.revision,
      parentOperationId: incoming.payload.parentOperationId,
      ...(incoming.payload.resolution
        ? {
            mergedOperationId: incoming.payload.resolution.mergedOperationId,
            mergedStateHash: incoming.payload.resolution.mergedStateHash,
          }
        : {}),
      payload: next,
      messageId: incoming.messageId,
    });
    const inserted = await this.database.transaction(
      'rw',
      [this.database.tasks, this.database.operations, this.database.imports],
      async () => {
        const current = await this.database.tasks.get(task.id);
        if (canonicalJsonStringify(current) !== canonicalJsonStringify(task)) {
          throw new Error(
            'The local task changed while this QR was being processed. Scan it again.',
          );
        }
        if (await this.database.operations.get(operation.operationId)) return false;
        await this.database.tasks.put(next);
        await this.database.operations.add(operation);
        await this.database.imports.put({
          messageId: incoming.messageId,
          taskId: task.id,
          senderId: incoming.senderId,
          importedAt: new Date().toISOString(),
          rawJson: canonicalJsonStringify(incoming),
        });
        return true;
      },
    );
    return {
      status: inserted ? 'APPLIED' : 'ALREADY_APPLIED',
      task: inserted ? next : (await this.tasks.getTaskById(task.id, true))!,
      messageId: incoming.messageId,
    };
  }

  async createAcknowledgment(incoming: UpdateEnvelope, result: 'APPLIED' | 'ALREADY_APPLIED') {
    const operation = await this.database.operations.get(incoming.payload.operationId);
    if (!operation || operation.messageId !== incoming.messageId) {
      throw new Error('An acknowledgment requires an applied incoming message.');
    }
    const receiverDeviceId = await this.tasks.getDeviceId();
    return createPaperBridgeV2Envelope(
      {
        messageType: 'TASK_ACK',
        payload: {
          acknowledgedMessageId: incoming.messageId,
          acknowledgedOperationId: incoming.payload.operationId,
          taskId: incoming.payload.taskId,
          receiverDeviceId,
          appliedRevision: operation.revision,
          result,
          acknowledgedAt: new Date().toISOString(),
        },
      },
      receiverDeviceId,
    );
  }

  async getAcknowledgableUpdates(taskId: string) {
    const imports = await this.database.imports.where('taskId').equals(taskId).toArray();
    return imports
      .filter((record) => record.rawJson)
      .map((record) => ({ messageId: record.messageId, rawJson: record.rawJson! }));
  }

  async createAcknowledgmentForMessage(messageId: string) {
    const record = await this.database.imports.get(messageId);
    if (!record?.rawJson) throw new Error('No applied update was found for this message.');
    const envelope = PaperBridgeV2EnvelopeSchema.parse(JSON.parse(record.rawJson));
    if (envelope.messageType !== 'TASK_UPDATE') throw new Error('This message is not an update.');
    return this.createAcknowledgment(envelope, 'APPLIED');
  }

  async recordAcknowledgment(untrusted: PaperBridgeV2Envelope): Promise<'RECORDED' | 'DUPLICATE'> {
    const parsed = PaperBridgeV2EnvelopeSchema.parse(untrusted);
    if (parsed.messageType !== 'TASK_ACK') throw new Error('This QR is not an acknowledgment.');
    if (!(await verifyEnvelopeChecksum(parsed)))
      throw new Error('QR checksum verification failed.');
    const incoming = parsed as AckEnvelope;
    const ack = TaskAckPayloadSchema.parse(incoming.payload);
    if (ack.receiverDeviceId !== incoming.senderId)
      throw new Error('Acknowledgment sender does not match receiver.');
    return this.database.transaction(
      'rw',
      [this.database.outgoing, this.database.acknowledgments],
      async () => {
        const outgoing = await this.database.outgoing.get(ack.acknowledgedMessageId);
        if (
          !outgoing ||
          outgoing.operationId !== ack.acknowledgedOperationId ||
          outgoing.taskId !== ack.taskId
        ) {
          throw new Error('This acknowledgment does not match a known outgoing task update.');
        }
        const original = PaperBridgeV2EnvelopeSchema.parse(JSON.parse(outgoing.rawJson));
        if (
          original.messageType !== 'TASK_UPDATE' ||
          original.payload.nextRevision !== ack.appliedRevision
        ) {
          throw new Error('Acknowledged revision does not match the outgoing update.');
        }
        const prior = await this.database.acknowledgments
          .where('acknowledgedMessageId')
          .equals(outgoing.messageId)
          .first();
        if (prior) return 'DUPLICATE';
        await this.database.acknowledgments.add({
          messageId: incoming.messageId,
          acknowledgedMessageId: outgoing.messageId,
          taskId: ack.taskId,
          receivedAt: new Date().toISOString(),
          envelope: incoming,
        });
        await this.database.outgoing.update(outgoing.messageId, {
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy: ack.receiverDeviceId,
        });
        return 'RECORDED';
      },
    );
  }

  async getConflicts(taskId?: string): Promise<SyncConflictRecord[]> {
    const records = taskId
      ? await this.database.conflicts.where('taskId').equals(taskId).toArray()
      : await this.database.conflicts.toArray();
    return records.filter((record) => !record.resolvedAt);
  }

  async resolveConflict(id: string, decision: 'KEEP_LOCAL' | 'ACCEPT_INCOMING'): Promise<Task> {
    const conflict = await this.database.conflicts.get(id);
    if (!conflict || conflict.resolvedAt) throw new Error('This conflict is no longer pending.');
    const current = await this.tasks.getTaskById(conflict.taskId, true);
    if (!current) throw new Error('The local task is missing.');
    const currentHash = await taskStateHash(current);
    const storedHash = await taskStateHash(conflict.localTask);
    if (currentHash !== storedHash)
      throw new Error('The local task changed since this conflict was recorded. Review again.');
    const nextRevision = Math.max(current.revision, conflict.incoming.nextRevision) + 1;
    const resolutionPayload = TaskUpdatePayloadSchema.parse({
      ...conflict.incoming,
      baseRevision: current.revision,
      nextRevision,
      baseStateHash: currentHash,
      changes: decision === 'KEEP_LOCAL' ? completeTaskChanges(current) : conflict.incoming.changes,
      updatedAt: new Date().toISOString(),
      resolution: {
        mergedOperationId: conflict.incoming.operationId,
        mergedStateHash: conflict.incoming.resultStateHash,
      },
    });
    // A full state is required for either branch to reproduce the decision.
    const history = await this.tasks.getTaskOperations(current.id);
    let branchBase: Task | undefined;
    for (const item of history) {
      if ((await taskStateHash(item.payload)) === conflict.incoming.baseStateHash) {
        branchBase = item.payload;
        break;
      }
    }
    if (decision === 'ACCEPT_INCOMING' && !branchBase) {
      throw new Error(
        'The incoming branch base is unavailable. Transfer its earlier task history first.',
      );
    }
    const accepted =
      decision === 'KEEP_LOCAL' ? current : applyTaskChanges(branchBase!, conflict.incoming);
    const next = TaskSchema.parse({
      ...accepted,
      id: current.id,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      revision: nextRevision,
      updatedAt: resolutionPayload.updatedAt,
    });
    const actorId = await this.tasks.getDeviceId();
    const head = [...(await this.tasks.getTaskOperations(current.id))]
      .reverse()
      .find((op) => op.revision === current.revision);
    const operation = TaskOperationSchema.parse({
      operationId: crypto.randomUUID(),
      taskId: current.id,
      actorId,
      operationType: 'TASK_RESOLVE',
      timestamp: next.updatedAt,
      revision: next.revision,
      parentRevision: current.revision,
      parentOperationId: head?.operationId ?? null,
      mergedOperationId: conflict.incoming.operationId,
      mergedStateHash: conflict.incoming.resultStateHash,
      payload: next,
    });
    await this.database.transaction(
      'rw',
      [this.database.tasks, this.database.operations, this.database.conflicts],
      async () => {
        const latest = await this.database.tasks.get(current.id);
        if (canonicalJsonStringify(latest) !== canonicalJsonStringify(current))
          throw new Error('Task changed during conflict resolution.');
        await this.database.tasks.put(next);
        await this.database.operations.add(operation);
        await this.database.conflicts.update(id, {
          resolvedAt: new Date().toISOString(),
          resolution: decision,
          resolutionOperationId: operation.operationId,
        });
      },
    );
    return next;
  }
}

export const syncRepository = new SyncRepository();
