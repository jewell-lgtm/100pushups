import 'temporal-polyfill/global';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
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
  );
}
