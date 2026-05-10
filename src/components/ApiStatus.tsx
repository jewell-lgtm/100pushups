import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getApiClient } from '../api/getApiClient';

type Status = 'pending' | 'ok' | 'unreachable';

interface ApiStatusProps {
  // Polling interval (ms). Defaults to 30s; tests pass a small value.
  pollIntervalMs?: number;
}

// A self-contained pill/banner that polls `apiClient.isReachable()` and
// renders one of three states. Sits above the screen content so the user
// always knows whether the backend is reachable. Voice flow continues to
// work via FallbackParser when unreachable, so this is informational only.
export function ApiStatus({ pollIntervalMs = 30000 }: ApiStatusProps) {
  const [status, setStatus] = useState<Status>('pending');
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const probe = async () => {
      try {
        const client = await getApiClient();
        const ok = await client.isReachable();
        if (cancelledRef.current) return;
        setStatus(ok ? 'ok' : 'unreachable');
      } catch {
        // getApiClient can throw before AuthGate completes (no token, etc).
        // Treat as pending — once auth lands the next probe will succeed.
        if (cancelledRef.current) return;
        setStatus('pending');
      }
      if (cancelledRef.current) return;
      timer = setTimeout(probe, pollIntervalMs);
    };

    probe();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollIntervalMs]);

  if (status === 'pending') {
    return (
      <View style={styles.pillRow} testID="api-status-pending">
        <View style={styles.pendingPill}>
          <Text style={styles.pendingText}>checking…</Text>
        </View>
      </View>
    );
  }

  if (status === 'unreachable') {
    return (
      <View style={styles.banner} testID="api-status-unreachable">
        <Text style={styles.bannerText}>
          Backend unreachable. Voice flow uses fallback parser. Check your
          connection.
        </Text>
      </View>
    );
  }

  // OK — small green dot + faint label. Nearly invisible by design.
  return (
    <View style={styles.pillRow} testID="api-status-ok">
      <View style={styles.okDot} />
      <Text style={styles.okText}>API: ok</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#0f0f23',
  },
  okDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3ecf8e',
    marginRight: 6,
  },
  okText: {
    color: '#5a5a70',
    fontSize: 11,
  },
  pendingPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
  },
  pendingText: {
    color: '#a0a0b0',
    fontSize: 11,
  },
  banner: {
    backgroundColor: '#7a1a2a',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
