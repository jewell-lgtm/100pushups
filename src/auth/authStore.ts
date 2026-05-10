import { secureStorage } from '../storage/secureStorage';

const TOKEN_KEY = 'auth.token';
const DEVICE_ID_KEY = 'auth.deviceId';

export interface StoredAuth {
  token: string;
  deviceId: string;
}

export async function loadAuth(): Promise<StoredAuth | null> {
  const [token, deviceId] = await Promise.all([
    secureStorage.getItem(TOKEN_KEY),
    secureStorage.getItem(DEVICE_ID_KEY),
  ]);
  if (!token || !deviceId) return null;
  return { token, deviceId };
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  await Promise.all([
    secureStorage.setItem(TOKEN_KEY, auth.token),
    secureStorage.setItem(DEVICE_ID_KEY, auth.deviceId),
  ]);
}

export async function clearAuth(): Promise<void> {
  await Promise.all([
    secureStorage.deleteItem(TOKEN_KEY),
    secureStorage.deleteItem(DEVICE_ID_KEY),
  ]);
}
