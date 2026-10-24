import Dexie, { type EntityTable } from 'dexie';
import type { Task, TaskOperation } from '@relay-miden/shared';

export const DATABASE_NAME = 'relay-miden-db';

export interface LocalSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class RelayMidenDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  operations!: EntityTable<TaskOperation, 'operationId'>;
  settings!: EntityTable<LocalSetting, 'key'>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      tasks: 'id, status, priority, action, createdAt, updatedAt, deletedAt, [status+updatedAt]',
      operations: 'operationId, taskId, operationType, timestamp, revision, [taskId+revision]',
      settings: 'key, updatedAt',
    });
  }
}

export const db = new RelayMidenDatabase();
