import Database from 'better-sqlite3';
import path from 'node:path';

export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(process.env['DATA_DIR'] ?? '/data', 'pushups.db');
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'reps'
    );

    CREATE TABLE IF NOT EXISTS weekly_plans (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      week_start TEXT NOT NULL,
      evaluation_reps INTEGER,
      daily_targets TEXT NOT NULL,
      notes TEXT,
      device_id TEXT NOT NULL DEFAULT 'legacy',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      weekly_plan_id TEXT REFERENCES weekly_plans(id),
      session_type TEXT NOT NULL DEFAULT 'regular',
      target_reps INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      total_reps INTEGER,
      set_count INTEGER,
      user_feedback TEXT,
      -- device_id is application-enforced NOT NULL: every write goes through
      -- /sync which stamps it from the Bearer-derived deviceId. Kept nullable
      -- at the DDL level because SQLite can't ALTER an existing column to
      -- NOT NULL without a table rebuild, and the admin wipe (see README)
      -- removes any pre-RBAC NULL rows.
      device_id TEXT
    );

    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      set_number INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      rest_seconds INTEGER
    );

    INSERT OR IGNORE INTO exercises (id, name, unit) VALUES ('pushups', 'pushups', 'reps');
  `);

  // Idempotent column add for pre-existing weekly_plans tables that predate
  // the device_id column. SQLite ALTER TABLE ADD COLUMN won't tolerate a
  // NOT NULL constraint without a default; the default backfills old rows
  // with 'legacy' so admins can wipe them (see README).
  const wpCols = db.prepare(`SELECT name FROM pragma_table_info('weekly_plans')`).all() as Array<{ name: string }>;
  if (!wpCols.some((c) => c.name === 'device_id')) {
    db.exec(`ALTER TABLE weekly_plans ADD COLUMN device_id TEXT NOT NULL DEFAULT 'legacy'`);
  }

  return db;
}
