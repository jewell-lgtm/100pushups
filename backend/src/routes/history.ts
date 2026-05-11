import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { getMonthSessionsForDevice } from '../stats.js';
import { getRecentSessionsForDevice } from '../sessions.js';

// Monthly calendar grid + recent-sessions list for the Stats/History
// screen. The History screen used to do four sequential local-repo
// reads on focus; this bundle plus `/api/v1/stats` (streak +
// longestStreak for the banner) collapse that into two cached
// round-trips so the screen renders instantly from cache after the
// first navigation.
//
// Query params:
//   year:  4-digit int
//   month: 1..12 (1-indexed; Jan=1, Dec=12)
// Both required; 400 on missing/malformed.
//
// Response shape:
//   {
//     days:   [ { day, totalReps, target } ... ]   // grid (this month)
//     recent: [ { id, startedAt, totalReps,         // Recent list — top 3
//                  setCount, userFeedback } ... ]   //   most recent
//                                                   //   across all months
//   }
//
// `recent` is device-wide (not constrained to the query month) so the
// "Recent" list keeps showing context after the user pages back to an
// older month — matches the Phase 11.5 local-repo behaviour the
// screen had before the migration.
export function historyRoutes(db: Database.Database) {
  const app = new Hono();

  app.get('/', (c) => {
    const exerciseId = c.req.query('exerciseId') ?? 'pushups';
    const yearStr = c.req.query('year');
    const monthStr = c.req.query('month');

    if (typeof yearStr !== 'string' || !/^\d{4}$/.test(yearStr)) {
      return c.json({ error: 'invalid year (4-digit integer required)' }, 400);
    }
    const year = parseInt(yearStr, 10);
    if (!Number.isFinite(year) || year < 1970 || year > 9999) {
      return c.json({ error: 'invalid year (4-digit integer required)' }, 400);
    }

    if (typeof monthStr !== 'string' || !/^\d{1,2}$/.test(monthStr)) {
      return c.json({ error: 'invalid month (1..12 required)' }, 400);
    }
    const month = parseInt(monthStr, 10);
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return c.json({ error: 'invalid month (1..12 required)' }, 400);
    }

    const deviceId = c.get('deviceId' as never) as string;
    const days = getMonthSessionsForDevice(db, deviceId, year, month, exerciseId);
    const recentRows = getRecentSessionsForDevice(db, deviceId, { limit: 3 });
    const recent = recentRows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      totalReps: r.totalReps,
      setCount: r.setCount,
      userFeedback: r.userFeedback,
    }));
    return c.json({ days, recent });
  });

  return app;
}
