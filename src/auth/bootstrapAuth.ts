import { loadAuth, saveAuth, StoredAuth } from './authStore';
import { registerDevice } from './registerClient';

export async function bootstrapAuth(
  baseUrl: string,
  registerKey: string,
): Promise<StoredAuth> {
  const existing = await loadAuth();
  if (existing) return existing;

  const fresh = await registerDevice(baseUrl, registerKey);
  await saveAuth(fresh);
  return fresh;
}
