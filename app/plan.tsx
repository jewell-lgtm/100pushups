import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getDatabase } from '../src/db/getDatabase';
import { parseDailyTargets } from '../src/db/repository';

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

  useEffect(() => {
    (async () => {
    const db = await getDatabase();
    db.getFirstAsync<{
      week_start: string;
      evaluation_reps: number | null;
      daily_targets: string;
      notes: string | null;
    }>(
      `SELECT week_start, evaluation_reps, daily_targets, notes
       FROM weekly_plans WHERE exercise_id = 'pushups'
       ORDER BY week_start DESC LIMIT 1`,
    ).then((row) => {
      if (row) {
        setPlan({
          weekStart: row.week_start,
          evaluationReps: row.evaluation_reps,
          dailyTargets: parseDailyTargets(row.daily_targets),
          notes: row.notes,
        });
      }
    });
    })();
  }, []);

  if (!plan) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>
          No plan yet. Complete your first evaluation to generate a weekly plan.
        </Text>
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
});
