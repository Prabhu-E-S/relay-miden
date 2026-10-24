import Dexie, { type EntityTable } from 'dexie';
import type { Task, TaskOperation } from '@relay-miden/shared';

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
}

export class RelayMidenDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  operations!: EntityTable<TaskOperation, 'operationId'>;
  settings!: EntityTable<LocalSetting, 'key'>;
  imports!: EntityTable<PaperBridgeImportRecord, 'messageId'>;

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
  }
}

export const db = new RelayMidenDatabase();
