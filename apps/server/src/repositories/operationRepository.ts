import type { DatabaseSync } from 'node:sqlite';
import type { LanOperationPayload } from '@relay-miden/shared';

export interface StoredOperationRow {
  sequence: number;
  operation_id: string;
  task_id: string;
  actor_id: string;
  operation_type: string;
  timestamp: string;
  revision: number;
  parent_revision: number | null;
  parent_operation_id: string | null;
  merged_operation_id: string | null;
  merged_state_hash: string | null;
  base_state_hash: string | null;
  result_state_hash: string;
  changes_json: string | null;
  task_json: string;
  operation_payload_json: string;
}

export interface SaveOperationParams {
  operationId: string;
  taskId: string;
  actorId: string;
  operationType: string;
  timestamp: string;
  revision: number;
  parentRevision?: number | null;
  parentOperationId?: string | null;
  mergedOperationId?: string | null;
  mergedStateHash?: string | null;
  baseStateHash?: string | null;
  resultStateHash: string;
  changesJson?: string | null;
  taskJson: string;
  operationPayload: LanOperationPayload;
}

export class OperationRepository {
  constructor(private readonly db: DatabaseSync) {}

  saveOperation(params: SaveOperationParams): number {
    const stmt = this.db.prepare(`
      INSERT INTO operations (
        operation_id, task_id, actor_id, operation_type, timestamp,
        revision, parent_revision, parent_operation_id, merged_operation_id,
        merged_state_hash, base_state_hash, result_state_hash, changes_json,
        task_json, operation_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      params.operationId,
      params.taskId,
      params.actorId,
      params.operationType,
      params.timestamp,
      params.revision,
      params.parentRevision ?? null,
      params.parentOperationId ?? null,
      params.mergedOperationId ?? null,
      params.mergedStateHash ?? null,
      params.baseStateHash ?? null,
      params.resultStateHash,
      params.changesJson ?? null,
      params.taskJson,
      JSON.stringify(params.operationPayload),
    );

    const seqRow = this.db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    return Number(seqRow.id);
  }

  getOperationById(operationId: string): StoredOperationRow | null {
    const stmt = this.db.prepare('SELECT * FROM operations WHERE operation_id = ?');
    const row = stmt.get(operationId) as StoredOperationRow | undefined;
    return row ?? null;
  }

  getOperationsSince(sequence: number, limit = 100): StoredOperationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      WHERE sequence > ?
      ORDER BY sequence ASC
      LIMIT ?
    `);
    const rows = stmt.all(sequence, limit) as unknown as StoredOperationRow[];
    return rows;
  }

  getTaskOperations(taskId: string): StoredOperationRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      WHERE task_id = ?
      ORDER BY sequence ASC
    `);
    const rows = stmt.all(taskId) as unknown as StoredOperationRow[];
    return rows;
  }

  getCurrentSequence(): number {
    const row = this.db.prepare('SELECT MAX(sequence) as seq FROM operations').get() as {
      seq: number | null;
    };
    return Number(row.seq ?? 0);
  }

  countOperations(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM operations').get() as {
      count: number;
    };
    return Number(row.count ?? 0);
  }
}
