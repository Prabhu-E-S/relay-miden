import type { DatabaseSync } from 'node:sqlite';
import type { Task, TaskUpdatePayload } from '@relay-miden/shared';

export interface StoredConflictRow {
  id: string;
  task_id: string;
  incoming_operation_id: string;
  local_task_json: string;
  incoming_payload_json: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ConflictRecord {
  id: string;
  taskId: string;
  incomingOperationId: string;
  localTask: Task;
  incoming: TaskUpdatePayload;
  createdAt: string;
  resolvedAt?: string | null;
}

export class ConflictRepository {
  constructor(private readonly db: DatabaseSync) {}

  recordConflict(conflict: ConflictRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO conflicts (
        id, task_id, incoming_operation_id, local_task_json, incoming_payload_json, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        local_task_json = excluded.local_task_json,
        incoming_payload_json = excluded.incoming_payload_json
    `);

    stmt.run(
      conflict.id,
      conflict.taskId,
      conflict.incomingOperationId,
      JSON.stringify(conflict.localTask),
      JSON.stringify(conflict.incoming),
      conflict.createdAt,
      conflict.resolvedAt ?? null,
    );
  }

  resolveConflict(operationId: string): void {
    const stmt = this.db.prepare(`
      UPDATE conflicts
      SET resolved_at = ?
      WHERE incoming_operation_id = ?
    `);
    stmt.run(new Date().toISOString(), operationId);
  }

  getConflict(id: string): ConflictRecord | null {
    const stmt = this.db.prepare('SELECT * FROM conflicts WHERE id = ?');
    const row = stmt.get(id) as StoredConflictRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      taskId: row.task_id,
      incomingOperationId: row.incoming_operation_id,
      localTask: JSON.parse(row.local_task_json),
      incoming: JSON.parse(row.incoming_payload_json),
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    };
  }

  getPendingConflictsForTask(taskId: string): ConflictRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conflicts
      WHERE task_id = ? AND resolved_at IS NULL
    `);
    const rows = stmt.all(taskId) as unknown as StoredConflictRow[];
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      incomingOperationId: row.incoming_operation_id,
      localTask: JSON.parse(row.local_task_json),
      incoming: JSON.parse(row.incoming_payload_json),
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));
  }
}
