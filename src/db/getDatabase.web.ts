interface MinimalDB {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  runAsync(sql: string, params?: unknown[]): Promise<void>;
}

export async function getDatabase(): Promise<MinimalDB> {
  return {
    async execAsync() {},
    async getFirstAsync() { return null; },
    async getAllAsync() { return []; },
    async runAsync() {},
  };
}
