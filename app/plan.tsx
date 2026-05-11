import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDatabase } from '../src/db/getDatabase';
import { createRepository, parseDailyTargets } from '../src/db/repository';
import { IApiClient } from '../src/api/client';
import { getApiClient } from '../src/api/getApiClient';
import { EVENT_PLAN_GENERATED, track } from '../src/analytics/posthog';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface PlanData {
  weekStart: string;
  evaluationReps: number | null;
  dailyTargets: Record<string, number>;
  notes: string | null;
}

export default function PlanScreen() {
  const [plan, setPlan] = useState<PlanData | null>(null);
  // Bumped after a successful generate so the read-effect re-runs and
  // the screen re-renders the freshly-mirrored row from local SQLite.
  const [reloadKey, setReloadKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // API + repo are loaded post-mount the same way `app/workout.tsx`
  // does it — keeps the screen renderable before the singletons resolve.
  const [api, setApi] = useState<IApiClient | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [repo, setRepo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const [db, client] = await Promise.all([getDatabase(), getApiClient()]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRepo(createRepository(db as any));
      setApi(client);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{
        week_start: string;
        evaluation_reps: number | null;
        daily_targets: string;
        notes: string | null;
      }>(
        `SELECT week_start, evaluation_reps, daily_targets, notes
         FROM weekly_plans WHERE exercise_id = 'pushups'
         ORDER BY week_start DESC LIMIT 1`,
      );
      if (row) {
        setPlan({
          weekStart: row.week_start,
          evaluationReps: row.evaluation_reps,
          dailyTargets: parseDailyTargets(row.daily_targets),
          notes: row.notes,
        });
      }
    })();
  }, [reloadKey]);

  const onGenerate = useCallback(async () => {
    if (!api || !repo || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const fresh = await api.generateWeeklyPlan({ exerciseId: 'pushups' });
      await repo.upsertWeeklyPlan({
        id: fresh.id,
        exerciseId: 'pushups',
        weekStart: fresh.weekStart,
        dailyTargets: fresh.dailyTargets,
        notes: fresh.notes,
      });
      // Analytics: tap-through on a successful generate. Small payload —
      // exerciseId only; the plan body itself never leaves the device.
      track(EVENT_PLAN_GENERATED, { exerciseId: 'pushups' });
      setReloadKey((k) => k + 1);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('generateWeeklyPlan failed', err);
      setError("Couldn't generate plan — check your backend connection");
    } finally {
      setGenerating(false);
    }
  }, [api, repo, generating]);

  const buttonDisabled = generating || !api || !repo;

  if (!plan) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>
          No plan yet. Complete your first evaluation to generate a weekly plan.
        </Text>
        <TouchableOpacity
          testID="plan-generate-button"
          style={[styles.generateButton, buttonDisabled && styles.generateButtonDisabled]}
          onPress={onGenerate}
          disabled={buttonDisabled}
        >
          {generating ? (
            <ActivityIndicator color="#fff" testID="plan-generate-spinner" />
          ) : (
            <Text style={styles.generateButtonText}>Generate plan</Text>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  const todayIndex = Temporal.Now.plainDateISO().dayOfWeek - 1; // 0=Mon

  return (
    <View style={styles.container}>
      <Text style={styles.weekLabel}>
        Week of {Temporal.PlainDate.from(plan.weekStart).toLocaleString()}
      </Text>

      {plan.evaluationReps !== null && (
        <Text style={styles.evalText}>
          Evaluation: {plan.evaluationReps} reps
        </Text>
      )}

      <View style={styles.daysContainer}>
        {DAY_KEYS.map((key, i) => {
          const target = plan.dailyTargets[key];
          const isToday = i === todayIndex;
          return (
            <View
              key={key}
              style={[styles.dayCard, isToday && styles.todayCard]}
            >
              <Text style={[styles.dayName, isToday && styles.todayText]}>
                {DAY_NAMES[i]}
              </Text>
              <Text style={[styles.dayTarget, isToday && styles.todayText]}>
                {target ?? '—'}
              </Text>
            </View>
          );
        })}
      </View>

      {plan.notes && (
        <Text style={styles.notes}>{plan.notes}</Text>
      )}

      <TouchableOpacity
        testID="plan-generate-button"
        style={[styles.generateButton, buttonDisabled && styles.generateButtonDisabled]}
        onPress={onGenerate}
        disabled={buttonDisabled}
      >
        {generating ? (
          <ActivityIndicator color="#fff" testID="plan-generate-spinner" />
        ) : (
          <Text style={styles.generateButtonText}>Generate plan</Text>
        )}
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    padding: 24,
    alignItems: 'center',
  },
  empty: {
    color: '#a0a0b0',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  weekLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  evalText: {
    color: '#a0a0b0',
    fontSize: 14,
    marginBottom: 24,
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  dayCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    width: 80,
    alignItems: 'center',
  },
  todayCard: {
    backgroundColor: '#e94560',
  },
  dayName: {
    color: '#a0a0b0',
    fontSize: 12,
    marginBottom: 4,
  },
  todayText: {
    color: '#fff',
  },
  dayTarget: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  notes: {
    color: '#a0a0b0',
    fontSize: 13,
    marginTop: 24,
    textAlign: 'center',
  },
  generateButton: {
    marginTop: 24,
    backgroundColor: '#e94560',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ffb4b4',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
});
