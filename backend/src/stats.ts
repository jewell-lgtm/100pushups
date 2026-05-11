// Repository helpers backing the bundled read endpoints
// (`/api/v1/stats`, `/api/v1/history`, `/api/v1/voice/context`). These
// mirror the client-side helpers in `src/db/repository.ts`, but every
// query is scoped by `deviceId` because the backend is a shared
// multi-tenant SQLite where RBAC is enforced application-side via the
// bearer-derived deviceId (see middleware/bearerAuth.ts, README §1.5.7).
//
// SQL shapes are ported verbatim from `src/db/repository.ts` so the
// server-side reads stay equivalent to the on-device reads. The biggest
// translation is the day-name keying for daily-target lookups (mon/tue/
// .../sun, JS `Date.getUTCDay()` returns Sun=0..Sat=6 — we re-map to
// ISO Mon=1..Sun=7 for parity with the client's Temporal calls).
import type Database from 'better-sqlite3';

export interface PersonalBest {
  reps: number;
  date: string;
}

export interface WeekDayTotal {
  date: string;
  totalReps: number;
  target: number | null;
}

export interface TodaySet {
  id: string;
  setNumber: number;
  reps: number;
  recordedAt: string;
}

export interface MonthSessionDay {
  day: number;
  totalReps: number;
  target: number | null;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function parseDailyTargets(json: string): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'number') {
      result[key] = value;
    }
  }
  return result;
}

// `YYYY-MM-DD` for a JS Date in UTC (matches SQLite `date()`).
function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ISO weekday (Mon=1..Sun=7) for a `YYYY-MM-DD` string.
function isoDayOfWeek(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const js = d.getUTCDay(); // Sun=0..Sat=6
  return js === 0 ? 7 : js;
}

// Highest single-set reps for this device + exercise. Tie-break implicit
// (SQLite returns the storage order); the client helper does the same.
export function getPersonalBestForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): PersonalBest | null {
  const row = db
    .prepare(
      `SELECT s.reps, s.recorded_at FROM sets s
       JOIN sessions sess ON s.session_id = sess.id
       WHERE sess.exercise_id = ? AND sess.device_id = ?
       ORDER BY s.reps DESC LIMIT 1`,
    )
    .get(exerciseId, deviceId) as { reps: number; recorded_at: string } | undefined;
  return row ? { reps: row.reps, date: row.recorded_at } : null;
}

// Second-highest single-set reps. Mirrors `getSecondBestSet` in
// `src/db/repository.ts:104` — `LIMIT 2 OFFSET 1`, tie-break by
// `started_at ASC` so the earliest-tied set is the runner-up.
export function getSecondBestSetForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): PersonalBest | null {
  const row = db
    .prepare(
      `SELECT s.reps, s.recorded_at FROM sets s
       JOIN sessions sess ON s.session_id = sess.id
       WHERE sess.exercise_id = ? AND sess.device_id = ?
       ORDER BY s.reps DESC, sess.started_at ASC
       LIMIT 2 OFFSET 1`,
    )
    .all(exerciseId, deviceId) as Array<{ reps: number; recorded_at: string }>;
  const second = row[0];
  return second ? { reps: second.reps, date: second.recorded_at } : null;
}

// Consecutive-days streak ending today (in server-local SQLite time,
// matching the client's `Temporal.Now.plainDateISO()`-vs-`date('now')`
// pairing). Walks distinct session dates DESC and counts while each
// day matches today-i.
export function getStreakForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): number {
  const rows = db
    .prepare(
      `SELECT DISTINCT date(started_at) as d FROM sessions
       WHERE exercise_id = ? AND device_id = ? ORDER BY d DESC`,
    )
    .all(exerciseId, deviceId) as Array<{ d: string }>;

  if (rows.length === 0) return 0;

  // "Today" as SQLite would compute it — use `date('now')` so DST/timezone
  // quirks line up with the data already stored. The client uses Temporal
  // ISO dates which agree with SQLite when both are reading wall-clock UTC.
  const todayRow = db.prepare(`SELECT date('now') as d`).get() as { d: string };
  const today = new Date(`${todayRow.d}T00:00:00Z`);

  let streak = 0;
  for (let i = 0; i < rows.length; i++) {
    const expected = new Date(today);
    expected.setUTCDate(today.getUTCDate() - i);
    if (rows[i].d === toIsoDate(expected)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Longest-ever consecutive-days streak. Pulls distinct session dates
// ASC, walks pairs, tracks the max run. Mirrors `getLongestStreak` in
// `src/db/repository.ts:139` — same JS-side run-walk (SQLite on the
// shipped version lacks window functions).
export function getLongestStreakForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): number {
  const rows = db
    .prepare(
      `SELECT DISTINCT date(started_at) as d FROM sessions
       WHERE exercise_id = ? AND device_id = ? ORDER BY d ASC`,
    )
    .all(exerciseId, deviceId) as Array<{ d: string }>;
  if (rows.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(`${rows[i - 1].d}T00:00:00Z`);
    const curr = new Date(`${rows[i].d}T00:00:00Z`);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

// Mon-Sun totals for the current ISO week. Always length 7, with
// `{ totalReps: 0, target }` placeholders on empty days. Mirrors
// `getCurrentWeekTotals` in `src/db/repository.ts:261`.
export function getCurrentWeekTotalsForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): WeekDayTotal[] {
  // Resolve "today" via SQLite for parity with the rest of the date math.
  const todayRow = db.prepare(`SELECT date('now') as d`).get() as { d: string };
  const today = new Date(`${todayRow.d}T00:00:00Z`);
  const dow = isoDayOfWeek(todayRow.d); // Mon=1..Sun=7
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - (dow - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const start = toIsoDate(monday);
  const endExclusive = (() => {
    const e = new Date(sunday);
    e.setUTCDate(sunday.getUTCDate() + 1);
    return toIsoDate(e);
  })();

  const rows = db
    .prepare(
      `SELECT date(started_at) as d, COALESCE(SUM(total_reps), 0) as total_reps
       FROM sessions
       WHERE exercise_id = ? AND device_id = ? AND started_at >= ? AND started_at < ?
       GROUP BY date(started_at)
       ORDER BY d ASC`,
    )
    .all(exerciseId, deviceId, start, endExclusive) as Array<{ d: string; total_reps: number }>;
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.d, r.total_reps ?? 0);

  const plans = db
    .prepare(
      `SELECT week_start, daily_targets FROM weekly_plans
       WHERE exercise_id = ? AND device_id = ? AND week_start < ?
       ORDER BY week_start DESC`,
    )
    .all(exerciseId, deviceId, endExclusive) as Array<{ week_start: string; daily_targets: string }>;
  const parsedPlans = plans.map((p) => ({
    weekStart: p.week_start,
    targets: parseDailyTargets(p.daily_targets),
  }));

  const out: WeekDayTotal[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = toIsoDate(d);
    const dayKey = DAY_KEYS[isoDayOfWeek(dateStr) - 1];
    const plan = parsedPlans.find((p) => p.weekStart <= dateStr);
    const target = plan ? (plan.targets[dayKey] ?? null) : null;
    out.push({
      date: dateStr,
      totalReps: byDate.get(dateStr) ?? 0,
      target,
    });
  }
  return out;
}

// Today's set list (ordered by set_number ASC) for the device's most
// recent session of `date('now')`. Empty when there's no session today.
// Mirrors `getTodaySets` in `src/db/repository.ts:316`.
export function getTodaySetsForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): TodaySet[] {
  const session = db
    .prepare(
      `SELECT id FROM sessions
       WHERE exercise_id = ? AND device_id = ? AND date(started_at) = date('now')
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(exerciseId, deviceId) as { id: string } | undefined;
  if (!session) return [];

  const rows = db
    .prepare(
      `SELECT id, set_number, reps, recorded_at
       FROM sets WHERE session_id = ? ORDER BY set_number ASC`,
    )
    .all(session.id) as Array<{
      id: string;
      set_number: number;
      reps: number;
      recorded_at: string;
    }>;
  return rows.map((r) => ({
    id: r.id,
    setNumber: r.set_number,
    reps: r.reps,
    recordedAt: r.recorded_at,
  }));
}

// Calendar-month grid data. `month` is 1-indexed (Jan=1, Dec=12).
// Returns one entry per day with at least one session in that month
// (empty days are omitted — the UI fills the grid). Mirrors
// `getMonthSessions` in `src/db/repository.ts:207`.
export function getMonthSessionsForDevice(
  db: Database.Database,
  deviceId: string,
  year: number,
  month: number,
  exerciseId: string,
): MonthSessionDay[] {
  const monthStr = String(month).padStart(2, '0');
  const start = `${year}-${monthStr}-01`;
  // First-of-next-month as exclusive upper bound.
  const startDate = new Date(`${start}T00:00:00Z`);
  const next = new Date(startDate);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = toIsoDate(next);

  const rows = db
    .prepare(
      `SELECT date(started_at) as d, COALESCE(SUM(total_reps), 0) as total_reps
       FROM sessions
       WHERE exercise_id = ? AND device_id = ? AND started_at >= ? AND started_at < ?
       GROUP BY date(started_at)
       ORDER BY d ASC`,
    )
    .all(exerciseId, deviceId, start, end) as Array<{ d: string; total_reps: number }>;

  if (rows.length === 0) return [];

  const plans = db
    .prepare(
      `SELECT week_start, daily_targets FROM weekly_plans
       WHERE exercise_id = ? AND device_id = ? AND week_start < ?
       ORDER BY week_start DESC`,
    )
    .all(exerciseId, deviceId, end) as Array<{ week_start: string; daily_targets: string }>;
  const parsedPlans = plans.map((p) => ({
    weekStart: p.week_start,
    targets: parseDailyTargets(p.daily_targets),
  }));

  return rows.map((r) => {
    const date = new Date(`${r.d}T00:00:00Z`);
    const dayKey = DAY_KEYS[isoDayOfWeek(r.d) - 1];
    const plan = parsedPlans.find((p) => p.weekStart <= r.d);
    const target = plan ? (plan.targets[dayKey] ?? null) : null;
    return {
      day: date.getUTCDate(),
      totalReps: r.total_reps ?? 0,
      target,
    };
  });
}

// Yesterday's total reps for the device. Returns the most recent
// session's totalReps when there was a session yesterday; null otherwise.
// Mirrors `getYesterdaySession` in `src/db/repository.ts:78` but reduced
// to the one field voice context needs.
export function getYesterdayTotalForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): number | null {
  const row = db
    .prepare(
      `SELECT total_reps FROM sessions
       WHERE exercise_id = ? AND device_id = ? AND date(started_at) = date('now', '-1 day')
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(exerciseId, deviceId) as { total_reps: number | null } | undefined;
  return row?.total_reps ?? null;
}

// Today's plan target (the reps figure the user is aiming for today).
// Resolves the most-recent weekly_plan whose week_start <= today, then
// indexes its `daily_targets` JSON by ISO weekday name. Mirrors
// `getTodayTarget` in `src/db/repository.ts:161`.
export function getTodayTargetForDevice(
  db: Database.Database,
  deviceId: string,
  exerciseId: string,
): number | null {
  const todayRow = db.prepare(`SELECT date('now') as d`).get() as { d: string };
  const today = todayRow.d;
  const dayKey = DAY_KEYS[isoDayOfWeek(today) - 1];

  const plan = db
    .prepare(
      `SELECT daily_targets FROM weekly_plans
       WHERE exercise_id = ? AND device_id = ? AND week_start <= ?
       ORDER BY week_start DESC LIMIT 1`,
    )
    .get(exerciseId, deviceId, today) as { daily_targets: string } | undefined;
  if (!plan) return null;
  const targets = parseDailyTargets(plan.daily_targets);
  return targets[dayKey] ?? null;
}
