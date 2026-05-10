import { Hono } from 'hono';
import crypto from 'node:crypto';
import { signToken } from '../auth.js';

interface RegisterRequest {
  registerKey: string;
  deviceId?: string;
}

export function authRoutes(authSecret: string, registerApiKey: string) {
  const app = new Hono();
  const expectedKey = Buffer.from(registerApiKey, 'utf8');

  app.post('/register', async (c) => {
    let body: RegisterRequest;
    try {
      body = await c.req.json<RegisterRequest>();
    } catch {
      return c.json({ error: 'invalid json' }, 400);
    }

    if (typeof body.registerKey !== 'string') {
      return c.json({ error: 'missing registerKey' }, 400);
    }

    const provided = Buffer.from(body.registerKey, 'utf8');
    if (provided.length !== expectedKey.length || !crypto.timingSafeEqual(provided, expectedKey)) {
      return c.json({ error: 'invalid registerKey' }, 401);
    }

    const deviceId =
      typeof body.deviceId === 'string' && body.deviceId.length > 0
        ? body.deviceId
        : crypto.randomUUID();
    const token = signToken(deviceId, authSecret);
    return c.json({ token, deviceId });
  });

  return app;
}
