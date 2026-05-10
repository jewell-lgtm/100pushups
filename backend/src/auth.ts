import crypto from 'node:crypto';

// Stateless HMAC tokens. Format: base64url(deviceId).base64url(hmac).
// Verifying does not need a DB — just AUTH_SECRET. Trade-off:
// no per-device revocation; rotating AUTH_SECRET invalidates all tokens.

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 2) % 4);
  return Buffer.from(padded, 'base64');
}

export function signToken(deviceId: string, secret: string): string {
  const idB64 = b64url(Buffer.from(deviceId, 'utf8'));
  const mac = crypto.createHmac('sha256', secret).update(idB64).digest();
  return `${idB64}.${b64url(mac)}`;
}

export function verifyToken(token: string, secret: string): { deviceId: string } | null {
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return null;
  const idB64 = token.slice(0, dot);
  const macB64 = token.slice(dot + 1);
  let providedMac: Buffer;
  try {
    providedMac = fromB64url(macB64);
  } catch {
    return null;
  }
  const expectedMac = crypto.createHmac('sha256', secret).update(idB64).digest();
  if (providedMac.length !== expectedMac.length) return null;
  if (!crypto.timingSafeEqual(providedMac, expectedMac)) return null;
  let deviceId: string;
  try {
    deviceId = fromB64url(idB64).toString('utf8');
  } catch {
    return null;
  }
  return { deviceId };
}
