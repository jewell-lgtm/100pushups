export interface RegisterResult {
  token: string;
  deviceId: string;
}

export async function registerDevice(
  baseUrl: string,
  registerKey: string,
  deviceId?: string,
): Promise<RegisterResult> {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registerKey, deviceId }),
  });
  if (!res.ok) {
    throw new Error(`register failed: ${res.status}`);
  }
  const data = (await res.json()) as RegisterResult;
  if (!data.token || !data.deviceId) {
    throw new Error('register response missing token/deviceId');
  }
  return data;
}
