import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';

// Echoes a client-supplied x-request-id (so a phone session can be traced
// across the cluster) or mints a fresh one. Set on the context for handlers
// that want to include it in their own log lines; always echoed back on the
// response so curl/k8s tooling can correlate.
export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming && incoming.length > 0 ? incoming : randomUUID();
    c.set('reqId' as never, id);
    c.header('x-request-id', id);
    await next();
  };
}
