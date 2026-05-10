import { Hono } from 'hono';
import { requestId } from '../src/middleware/requestId.js';

describe('requestId middleware', () => {
  it('echoes a client-supplied x-request-id', async () => {
    const app = new Hono();
    app.use('*', requestId());
    app.get('/', (c) => c.json({ reqId: c.get('reqId' as never) }));

    const res = await app.request('/', {
      headers: { 'x-request-id': 'phone-session-abc' },
    });

    expect(res.headers.get('x-request-id')).toBe('phone-session-abc');
    expect(await res.json()).toEqual({ reqId: 'phone-session-abc' });
  });

  it('mints a fresh uuid when no header is present', async () => {
    const app = new Hono();
    app.use('*', requestId());
    app.get('/', (c) => c.json({ reqId: c.get('reqId' as never) }));

    const res = await app.request('/');
    const id = res.headers.get('x-request-id');

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect((await res.json()) as { reqId: string }).toEqual({ reqId: id });
  });

  it('mints a fresh uuid when the header is empty', async () => {
    const app = new Hono();
    app.use('*', requestId());
    app.get('/', (c) => c.text('ok'));

    const res = await app.request('/', { headers: { 'x-request-id': '' } });
    const id = res.headers.get('x-request-id');

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
