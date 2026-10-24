import { DatabaseSync } from 'node:sqlite';

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const currentVersionRow = db
    .prepare('SELECT MAX(version) as version FROM schema_migrations')
    .get() as { version: number | null } | undefined;
  const currentVersion = currentVersionRow?.version ?? 0;

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        display_name TEXT,
        protocol_version INTEGER NOT NULL,
        app_version TEXT,
        registered_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        quantity INTEGER,
        unit TEXT,
        location TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        instruction_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        deleted_at TEXT,
        revision INTEGER NOT NULL,
        state_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS operations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT UNIQUE NOT NULL,
        task_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        revision INTEGER NOT NULL,
        parent_revision INTEGER,
        parent_operation_id TEXT,
        merged_operation_id TEXT,
        merged_state_hash TEXT,
        base_state_hash TEXT,
        result_state_hash TEXT NOT NULL,
        changes_json TEXT,
        task_json TEXT NOT NULL,
        operation_payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_operations_sequence ON operations(sequence);
      CREATE INDEX IF NOT EXISTS idx_operations_task_revision ON operations(task_id, revision);
      CREATE INDEX IF NOT EXISTS idx_operations_actor ON operations(actor_id);

      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        incoming_operation_id TEXT NOT NULL,
        local_task_json TEXT NOT NULL,
        incoming_payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_conflicts_task ON conflicts(task_id);

      CREATE TABLE IF NOT EXISTS server_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT INTO schema_migrations (version, applied_at)
      VALUES (1, datetime('now'));
    `);
  }
}
