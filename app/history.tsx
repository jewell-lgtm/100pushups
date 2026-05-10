import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View, FlatList } from 'react-native';
import { getDatabase } from '../src/db/getDatabase';
import { useSync } from '../src/hooks/useSync';

interface SessionRow {
  id: string;
  started_at: string;
  total_reps: number | null;
  set_count: number | null;
  session_type: string;
}

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { triggerSync } = useSync();

  const loadSessions = useCallback(async () => {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SessionRow>(
      `SELECT id, started_at, total_reps, set_count, session_type
       FROM sessions WHERE exercise_id = 'pushups'
       ORDER BY started_at DESC LIMIT 30`,
    );
    setSessions(rows);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Pull-to-refresh: kick a sync, then re-read local rows so the list
  // reflects anything the server confirmed in this round-trip.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await triggerSync();
      await loadSessions();
    } finally {
      setRefreshing(false);
    }
  }, [triggerSync, loadSessions]);

  return (
    <View style={styles.container}>
      {sessions.length === 0 ? (
        <Text style={styles.empty}>No workouts yet. Go do some pushups!</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#e94560"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View>
                <Text style={styles.date}>
                  {new Date(item.started_at).toLocaleDateString()}
                </Text>
                <Text style={styles.type}>
                  {item.session_type === 'evaluation' ? 'Evaluation' : 'Regular'}
                </Text>
              </View>
              <View style={styles.stats}>
                <Text style={styles.reps}>{item.total_reps ?? 0}</Text>
                <Text style={styles.label}>reps</Text>
              </View>
              <View style={styles.stats}>
                <Text style={styles.reps}>{item.set_count ?? 0}</Text>
                <Text style={styles.label}>sets</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    padding: 16,
  },
  empty: {
    color: '#a0a0b0',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  row: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  type: {
    color: '#a0a0b0',
    fontSize: 12,
  },
  stats: {
    alignItems: 'center',
  },
  reps: {
    color: '#e94560',
    fontSize: 24,
    fontWeight: 'bold',
  },
  label: {
    color: '#a0a0b0',
    fontSize: 11,
  },
});
