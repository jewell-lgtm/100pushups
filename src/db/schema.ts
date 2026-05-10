import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
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
      synced INTEGER NOT NULL DEFAULT 0
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
}
