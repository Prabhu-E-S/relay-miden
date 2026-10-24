import Dexie, { type EntityTable } from 'dexie';
import type { Task, TaskOperation } from '@relay-miden/shared';
import type { PaperBridgeV2Envelope, TaskUpdatePayload } from '@relay-miden/shared';

export const DATABASE_NAME = 'relay-miden-db';

export interface LocalSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface PaperBridgeImportRecord {
  messageId: string;
  taskId: string;
  senderId: string;
  importedAt: string;
  rawJson?: string;
}

export interface OutgoingRecord {
  messageId: string;
  taskId: string;
  operationId: string;
  createdAt: string;
  rawJson: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export interface AcknowledgmentRecord {
  messageId: string;
  acknowledgedMessageId: string;
  taskId: string;
  receivedAt: string;
  envelope: Extract<PaperBridgeV2Envelope, { messageType: 'TASK_ACK' }>;
}

export interface SyncConflictRecord {
  id: string;
  taskId: string;
  incomingOperationId: string;
  incomingMessageId: string;
  localTask: Task;
  incoming: TaskUpdatePayload;
  createdAt: string;
  resolvedAt?: string;
  resolution?: 'KEEP_LOCAL' | 'ACCEPT_INCOMING';
  resolutionOperationId?: string;
}

export class RelayMidenDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  operations!: EntityTable<TaskOperation, 'operationId'>;
  settings!: EntityTable<LocalSetting, 'key'>;
  imports!: EntityTable<PaperBridgeImportRecord, 'messageId'>;
  outgoing!: EntityTable<OutgoingRecord, 'messageId'>;
  acknowledgments!: EntityTable<AcknowledgmentRecord, 'messageId'>;
  conflicts!: EntityTable<SyncConflictRecord, 'id'>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      tasks: 'id, status, priority, action, createdAt, updatedAt, deletedAt, [status+updatedAt]',
      operations: 'operationId, taskId, operationType, timestamp, revision, [taskId+revision]',
      settings: 'key, updatedAt',
    });
    this.version(2).stores({
      imports: 'messageId, taskId, importedAt',
    });
    this.version(3).stores({
      operations:
        'operationId, taskId, operationType, timestamp, revision, [taskId+revision], parentOperationId, mergedOperationId',
      outgoing: 'messageId, taskId, operationId, acknowledgedAt',
      acknowledgments: 'messageId, acknowledgedMessageId, taskId',
      conflicts: 'id, taskId, incomingOperationId, resolvedAt',
    });
  }
}

export const db = new RelayMidenDatabase();
