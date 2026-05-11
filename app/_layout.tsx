import 'temporal-polyfill/global';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from '../src/auth/AuthGate';
import { ApiStatus } from '../src/components/ApiStatus';
import { useSync } from '../src/hooks/useSync';
import { queryClient } from '../src/data/queryClient';

export default function RootLayout() {
  // Mounted at the root so the AppState listener attaches once and
  // survives screen navigation. Web is a no-op inside useSync.
  useSync();

  return (
    <AuthGate>
      {/* QueryClientProvider sits inside AuthGate so it only mounts once
          auth has bootstrapped — every TanStack query needs a Bearer
          token, and gating the provider at the component-tree level
          enforces that. No screen consumes the client yet (Phase 14.1
          foundation only); existing useState/useEffect flows still own
          their data. Disk persistence will land as a follow-up wrapping
          this with PersistQueryClientProvider — see queryClient.ts. */}
      <QueryClientProvider client={queryClient}>
        {/* ApiStatus sits above the Stack so every screen sees the same banner.
            It renders nothing intrusive when ok (small green dot) and a red
            banner when the backend is unreachable. Placed inside AuthGate so
            it only mounts once a Bearer token exists. */}
        <View style={{ flex: 1 }}>
          <ApiStatus />
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: '#1a1a2e' },
                headerTintColor: '#fff',
                contentStyle: { backgroundColor: '#16213e' },
              }}
            >
              <Stack.Screen name="index" options={{ title: '100 Pushups' }} />
              <Stack.Screen name="workout" options={{ title: 'Workout', headerShown: false }} />
              <Stack.Screen name="complete" options={{ title: 'Complete', headerShown: false }} />
              <Stack.Screen name="history" options={{ title: 'History' }} />
              <Stack.Screen name="plan" options={{ title: 'Weekly Plan' }} />
            </Stack>
          </View>
        </View>
      </QueryClientProvider>
    </AuthGate>
  );
}
