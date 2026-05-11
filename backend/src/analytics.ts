// Backend-side PostHog capture for voice-route outcomes. We want server-
// side ground truth (latency, fallback usage, route) even if the client
// never flushes — phones go offline, kill the app mid-event, etc.
//
// Defaults mirror the client:
//   - Host: https://eu.i.posthog.com (PostHog Cloud EU). Override with
//     POSTHOG_HOST to point at a self-hosted endpoint.
//   - Project key: POSTHOG_API_KEY. When unset (dev/CI), `track` and
//     `shutdown` no-op so the server runs without analytics wiring.
//
// Singleton: one client for the process lifetime. Constructing per-request
// would spin up a flush timer every call.
import { PostHog } from 'posthog-node';

const POSTHOG_API_KEY = process.env['POSTHOG_API_KEY'];
const POSTHOG_HOST = process.env['POSTHOG_HOST'] ?? 'https://eu.i.posthog.com';

export const EVENT_VOICE_RESPOND = 'voice_respond';

let client: PostHog | null = null;
if (POSTHOG_API_KEY) {
  client = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });
}

export interface VoiceCaptureProps {
  route: string;
  latencyMs: number;
  fallbackUsed: boolean;
  deviceId: string | undefined;
}

export function trackVoiceRespond(props: VoiceCaptureProps): void {
  if (!client) return;
  try {
    // distinctId must be a string. Fall back to a sentinel so anonymous
    // calls (no Bearer middleware) still get captured but stay grouped.
    client.capture({
      distinctId: props.deviceId ?? 'unknown-device',
      event: EVENT_VOICE_RESPOND,
      properties: {
        route: props.route,
        latencyMs: props.latencyMs,
        fallbackUsed: props.fallbackUsed,
      },
    });
  } catch (err) {
    // Never let analytics break the request path.
    // eslint-disable-next-line no-console
    console.warn('posthog capture failed:', err instanceof Error ? err.message : err);
  }
}

// Flush in-flight events on shutdown so we don't lose the last few captures
// when the pod gets a SIGTERM during a rollout.
export async function shutdownAnalytics(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch {
    // best-effort
  }
}
