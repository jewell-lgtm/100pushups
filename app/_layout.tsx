import 'temporal-polyfill/global';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { AuthGate } from '../src/auth/AuthGate';
import { ApiStatus } from '../src/components/ApiStatus';
import { useSync } from '../src/hooks/useSync';

export default function RootLayout() {
  // Mounted at the root so the AppState listener attaches once and
  // survives screen navigation. Web is a no-op inside useSync.
  useSync();

  return (
    <AuthGate>
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
            <Stack.Screen name="history" options={{ title: 'History' }} />
            <Stack.Screen name="plan" options={{ title: 'Weekly Plan' }} />
          </Stack>
        </View>
      </View>
    </AuthGate>
  );
}
