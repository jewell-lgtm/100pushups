import { Platform } from 'react-native';

// expo-sqlite requires native modules. On web, we provide a mock.
// The web UI is only for testing the voice flow — real data lives on the device.

interface MockStatement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): void;
}

interface MinimalDB {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  runAsync(sql: string, params?: unknown[]): Promise<void>;
}

function createWebMockDB(): MinimalDB {
  return {
    async execAsync() {},
    async getFirstAsync() { return null; },
    async getAllAsync() { return []; },
    async runAsync() {},
  };
}

export async function getDatabase(): Promise<MinimalDB> {
  if (Platform.OS === 'web') {
    return createWebMockDB();
  }
  const { openDatabaseSync } = await import('expo-sqlite');
  const { initializeDatabase } = await import('./schema');
  const db = openDatabaseSync('pushups.db');
  await initializeDatabase(db);
  return db as unknown as MinimalDB;
}
