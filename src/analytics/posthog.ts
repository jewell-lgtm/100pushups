// PostHog analytics for the client app.
//
// Defaults:
//   - Host: https://eu.i.posthog.com (PostHog Cloud EU — user is UK-based,
//     keeps event data inside the EU). Override via EXPO_PUBLIC_POSTHOG_HOST,
//     e.g. point at a self-hosted endpoint without touching code.
//   - Project key: read from EXPO_PUBLIC_POSTHOG_KEY. When unset (dev/CI),
//     `track` becomes a no-op and `initAnalytics` does not start the SDK.
//
// Privacy: callers must keep payloads small. No raw transcripts, no chat
// logs, no free-text user input. Event names are constants exported below
// so call sites never use magic strings.
//
// Identity: `initAnalytics(deviceId)` must be called once after AuthGate
// resolves so events are keyed to the stable bearer-token deviceId. The
// module guards against double-init via a closure-scoped flag.
import PostHog from 'posthog-react-native';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

let client: PostHog | null = null;
let initialized = false;

// Event names — import these instead of writing literals at call sites
// so the taxonomy is greppable and refactor-safe.
export const EVENT_WORKOUT_STARTED = 'workout_started';
export const EVENT_SET_COMPLETED = 'set_completed';
export const EVENT_SESSION_ENDED = 'session_ended';
export const EVENT_VOICE_UTTERANCE_ROUTED = 'voice_utterance_routed';
export const EVENT_SYNC_FAILED = 'sync_failed';
export const EVENT_PLAN_GENERATED = 'plan_generated';

export type AnalyticsEvent =
  | typeof EVENT_WORKOUT_STARTED
  | typeof EVENT_SET_COMPLETED
  | typeof EVENT_SESSION_ENDED
  | typeof EVENT_VOICE_UTTERANCE_ROUTED
  | typeof EVENT_SYNC_FAILED
  | typeof EVENT_PLAN_GENERATED;

export function initAnalytics(deviceId: string): void {
  if (initialized) return;
  if (!POSTHOG_KEY) {
    // No key configured — leave `initialized` false so re-running with a
    // freshly-set env var (hot reload) can pick it up. `track` no-ops below.
    return;
  }
  try {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Bind every event to the stable bearer deviceId. We deliberately
      // skip the SDK's anonymous-id concept — see authStore.deviceId.
      bootstrap: { distinctId: deviceId },
    });
    // identify() also stamps subsequent events even though bootstrap covers
    // the first session — keeps things consistent after process restarts.
    client.identify(deviceId);
    initialized = true;
  } catch {
    // Defensive: never let analytics setup crash the app. Stay un-initialized
    // so `track` no-ops rather than throwing on every call site.
    client = null;
    initialized = false;
  }
}

// Prop values are constrained to JSON-serialisable scalars to keep payloads
// auditable. The SDK's underlying type widens this to `JsonType`, but we
// expose the narrower set so callers think twice before passing transcripts
// or other free-text user input.
export type AnalyticsPropValue = string | number | boolean | null;

export function track(
  event: AnalyticsEvent,
  props?: Record<string, AnalyticsPropValue>,
): void {
  if (!client || !initialized) return;
  try {
    client.capture(event, props);
  } catch {
    // Fire-and-forget contract: never propagate analytics errors.
  }
}

// Test-only: reset the module-level singleton between test cases. Not
// exported from any barrel; runtime callers should ignore it.
export function __resetForTests(): void {
  client = null;
  initialized = false;
}
