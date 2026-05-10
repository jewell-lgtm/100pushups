import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { getDatabase } from '../src/db/getDatabase';
import { createRepository } from '../src/db/repository';

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<{
    yesterdayTotal: number | null;
    personalBest: number | null;
    streak: number;
    todayTarget: number | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const repo = createRepository(db as any);
      const context = await repo.buildVoiceContext('pushups');
      setStats({
        yesterdayTotal: context.yesterdayTotal,
        personalBest: context.personalBest,
        streak: context.streak,
        todayTarget: context.todayTarget,
      });
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>100 Pushups</Text>

      {stats && (
        <View style={styles.statsContainer}>
          <StatCard label="Today's Target" value={stats.todayTarget ?? '—'} />
          <StatCard label="Yesterday" value={stats.yesterdayTotal ?? '—'} />
          <StatCard label="Personal Best" value={stats.personalBest ?? '—'} />
          <StatCard label="Streak" value={stats.streak > 0 ? `${stats.streak} days` : '—'} />
        </View>
      )}

      <TouchableOpacity
        style={styles.startButton}
        onPress={() => router.push('/workout')}
      >
        <Text style={styles.startButtonText}>Start Workout</Text>
      </TouchableOpacity>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/history')}>
          <Text style={styles.navButtonText}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/plan')}>
          <Text style={styles.navButtonText}>Weekly Plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{String(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 32,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 40,
  },
  statCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    width: 140,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#a0a0b0',
    marginTop: 4,
  },
  startButton: {
    backgroundColor: '#e94560',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 30,
    marginBottom: 24,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  navRow: {
    flexDirection: 'row',
    gap: 16,
  },
  navButton: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  navButtonText: {
    color: '#a0a0b0',
    fontSize: 14,
  },
});
