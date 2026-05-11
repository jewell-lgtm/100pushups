import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { getMonthSessionsForDevice } from '../stats.js';

// Monthly calendar grid for the Stats/History screen. Returns one entry
// per day that has at least one session in that month — the UI fills
// empty grid cells itself. Phase 14.2 partial.
//
// Query params:
//   year:  4-digit int
//   month: 1..12 (1-indexed; Jan=1, Dec=12)
// Both required; 400 on missing/malformed.
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
    return c.json({ days });
  });

  return app;
}
