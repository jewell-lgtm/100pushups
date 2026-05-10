import type { MiddlewareHandler } from 'hono';
import { verifyToken } from '../auth.js';

export function bearerAuth(authSecret: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return c.json({ error: 'missing bearer token' }, 401);
    }
    const token = header.slice('Bearer '.length).trim();
    const result = verifyToken(token, authSecret);
    if (!result) {
      return c.json({ error: 'invalid token' }, 403);
    }
    c.set('deviceId' as never, result.deviceId);
    await next();
  };
}
