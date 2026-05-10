import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { bootstrapAuth } from './bootstrapAuth';
import { getApiBase, resetApiClientCache } from '../api/getApiClient';

const REGISTER_KEY = process.env.EXPO_PUBLIC_REGISTER_API_KEY;

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<'pending' | 'ready' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('pending');
      setError(null);
      try {
        if (!REGISTER_KEY) {
          throw new Error('EXPO_PUBLIC_REGISTER_API_KEY is not set');
        }
        await bootstrapAuth(getApiBase(), REGISTER_KEY);
        resetApiClientCache();
        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryNonce]);

  if (status === 'pending') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.text}>Setting up…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Cannot reach server</Text>
        <Text style={styles.text}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => setRetryNonce((n) => n + 1)}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  text: {
    color: '#a0a0b0',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#e94560',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#e94560',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
