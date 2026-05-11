import 'temporal-polyfill/global';
import { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AuthGate } from '../src/auth/AuthGate';
import { ApiStatus } from '../src/components/ApiStatus';
import { useSync } from '../src/hooks/useSync';
import { queryClient } from '../src/data/queryClient';

// Hold the splash up until JS has loaded fonts so the first paint
// already has Fraunces + Inter — never a system-serif fallback flash.
// Safe to call at module scope; idempotent on subsequent reloads.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Allowed to fail in test/web environments where there is no native
  // splash to suppress. Returning the rejection is enough.
});

export default function RootLayout() {
  // Mounted at the root so the AppState listener attaches once and
  // survives screen navigation. Web is a no-op inside useSync.
  useSync();

  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_700Bold,
  });

  const onReady = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void onReady();
  }, [onReady]);

  if (!fontsLoaded && !fontError) return null;

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
