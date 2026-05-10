import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { generateWeeklyPlan, OllamaAuth } from '../ollama.js';

export function planningRoutes(db: Database.Database, ollamaUrl: string, model: string, ollamaAuth?: OllamaAuth) {
  const app = new Hono();

  app.post('/weekly', async (c) => {
    const body = await c.req.json<{ exerciseId?: string }>();
    const exerciseId = body.exerciseId ?? 'pushups';

    // Get this week's sessions with feedback
    const weeklyHistory = db.prepare(`
      SELECT date(started_at) as date, total_reps, user_feedback
      FROM sessions
      WHERE exercise_id = ? AND started_at >= date('now', '-7 days')
      ORDER BY started_at
    `).all(exerciseId) as Array<{ date: string; total_reps: number; user_feedback: string | null }>;

    // Get latest evaluation
    const evaluation = db.prepare(`
      SELECT total_reps FROM sessions
      WHERE exercise_id = ? AND session_type = 'evaluation'
      ORDER BY started_at DESC LIMIT 1
    `).get(exerciseId) as { total_reps: number } | undefined;

    // Get previous plan
    const previousPlan = db.prepare(`
      SELECT daily_targets FROM weekly_plans
      WHERE exercise_id = ? ORDER BY week_start DESC LIMIT 1
    `).get(exerciseId) as { daily_targets: string } | undefined;

    // Get streak
    const streakRows = db.prepare(`
      SELECT DISTINCT date(started_at) as d FROM sessions
      WHERE exercise_id = ? ORDER BY d DESC
    `).all(exerciseId) as Array<{ d: string }>;

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < streakRows.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      if (streakRows[i].d === expected.toISOString().split('T')[0]) {
        streak++;
      } else {
        break;
      }
    }

    const plan = await generateWeeklyPlan(ollamaUrl, model, {
      evaluationReps: evaluation?.total_reps ?? null,
      weeklyHistory: weeklyHistory.map(h => ({
        date: h.date,
        totalReps: h.total_reps,
        feedback: h.user_feedback,
      })),
      currentStreak: streak,
      previousTargets: previousPlan ? JSON.parse(previousPlan.daily_targets) : null,
    }, ollamaAuth);

    // Calculate next Monday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    const weekStart = nextMonday.toISOString().split('T')[0];

    const planId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO weekly_plans (id, exercise_id, week_start, evaluation_reps, daily_targets, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(planId, exerciseId, weekStart, evaluation?.total_reps ?? null, JSON.stringify(plan.dailyTargets), plan.notes);

    return c.json({
      id: planId,
      weekStart,
      dailyTargets: plan.dailyTargets,
      notes: plan.notes,
    });
  });

  return app;
}
