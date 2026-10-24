import type { DatabaseSync } from 'node:sqlite';
import { TaskSchema, type Task } from '@relay-miden/shared';

export interface StoredTaskRow {
  id: string;
  action: string;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  location: string;
  priority: string;
  status: string;
  instruction_json: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string | null;
  revision: number;
  state_hash: string;
}

export function rowToTask(row: StoredTaskRow): Task {
  const candidate: Record<string, unknown> = {
    id: row.id,
    action: row.action,
    title: row.title,
    location: row.location,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    deletedAt: row.deleted_at ?? null,
    revision: row.revision,
  };

  if (row.description !== null) candidate.description = row.description;
  if (row.quantity !== null) candidate.quantity = row.quantity;
  if (row.unit !== null) candidate.unit = row.unit;
  if (row.instruction_json !== null) {
    candidate.instruction = JSON.parse(row.instruction_json);
  }

  return TaskSchema.parse(candidate);
}

export class TaskRepository {
  constructor(private readonly db: DatabaseSync) {}

  getTask(id: string): { task: Task; stateHash: string } | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as StoredTaskRow | undefined;
    if (!row) return null;
    return {
      task: rowToTask(row),
      stateHash: row.state_hash,
    };
  }

  saveTask(task: Task, stateHash: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, action, title, description, quantity, unit, location,
        priority, status, instruction_json, created_at, updated_at,
        created_by, deleted_at, revision, state_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        action = excluded.action,
        title = excluded.title,
        description = excluded.description,
        quantity = excluded.quantity,
        unit = excluded.unit,
        location = excluded.location,
        priority = excluded.priority,
        status = excluded.status,
        instruction_json = excluded.instruction_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        created_by = excluded.created_by,
        deleted_at = excluded.deleted_at,
        revision = excluded.revision,
        state_hash = excluded.state_hash
    `);

    stmt.run(
      task.id,
      task.action,
      task.title,
      task.description ?? null,
      task.quantity ?? null,
      task.unit ?? null,
      task.location,
      task.priority,
      task.status,
      task.instruction ? JSON.stringify(task.instruction) : null,
      task.createdAt,
      task.updatedAt,
      task.createdBy,
      task.deletedAt ?? null,
      task.revision,
      stateHash,
    );
  }

  getAllTasks(): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC');
    const rows = stmt.all() as unknown as StoredTaskRow[];
    return rows.map(rowToTask);
  }
}
