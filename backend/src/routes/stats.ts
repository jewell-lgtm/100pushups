import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import {
  getPersonalBestForDevice,
  getSecondBestSetForDevice,
  getStreakForDevice,
  getLongestStreakForDevice,
  getCurrentWeekTotalsForDevice,
  getTodaySetsForDevice,
  getYesterdayTotalForDevice,
  getTodayTargetForDevice,
} from '../stats.js';

// Bundled stats read endpoint. Phase 14.2 partial: replaces the four
// sequential round-trips the Stats screen does today with one payload.
// Device-scoped via Bearer (bearerAuth middleware stamps `deviceId`).
// Additive — does NOT supersede `/api/v1/workouts/stats`, which stays
// in place for the existing client.
export function statsRoutes(db: Database.Database) {
  const app = new Hono();

  app.get('/', (c) => {
    const exerciseId = c.req.query('exerciseId') ?? 'pushups';
    const deviceId = c.get('deviceId' as never) as string;

    return c.json({
      personalBest: getPersonalBestForDevice(db, deviceId, exerciseId),
      secondBestSet: getSecondBestSetForDevice(db, deviceId, exerciseId),
      streak: getStreakForDevice(db, deviceId, exerciseId),
      longestStreak: getLongestStreakForDevice(db, deviceId, exerciseId),
      weekTotals: getCurrentWeekTotalsForDevice(db, deviceId, exerciseId),
      todaySets: getTodaySetsForDevice(db, deviceId, exerciseId),
      yesterdayTotal: getYesterdayTotalForDevice(db, deviceId, exerciseId),
      todayTarget: getTodayTargetForDevice(db, deviceId, exerciseId),
    });
  });

  return app;
}
