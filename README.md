# 100 Pushups
Voice-controlled pushup tracker with LLM coaching.

## Run on a phone

### Fast path — Expo Go

Every native module the app uses (`expo-secure-store`, `expo-sqlite`,
`expo-speech`, `expo-crypto`, `expo-font`, `expo-linear-gradient`,
`expo-splash-screen`, `react-native-svg`, `react-native-reanimated`) is
bundled in Expo Go on SDK 54 — no custom dev client required for the
MVP.

1. Install **Expo Go** from the Play Store on the phone.
2. Set `.env.local` for the device build:
   ```
   EXPO_PUBLIC_API_BASE=https://pushups.wire.mattjewell.co.uk/
   EXPO_PUBLIC_REGISTER_API_KEY=<value from k8s — see "Auth secret"
                                  section below; never commit>
   ```
3. Phone and laptop on the same Wi-Fi.
4. `mise exec -- pnpm start` from the repo root. Metro prints a QR code.
5. Open Expo Go on the phone, scan the QR — JS bundles and the app
   launches.

For cellular-only testing (no LAN shortcut), append `--tunnel` to the
start command. The tunnel hop is slower but verifies the real public
hostname path.

### Slow path — custom dev client

Only needed if you've added a native module that isn't bundled in
Expo Go, or for a production-style signed APK. Materializes a real
`android/` Gradle project and produces a 137MB debug APK.

`android/` is a generated artifact — gitignored, re-materialised from
`app.json` on every prebuild.

### Toolchain

Versions are pinned in `.mise.toml`. From the repo root:

```
mise install            # one-time, installs java 17, android-sdk, node
eval "$(mise activate zsh)"   # or prefix every command with `mise exec --`
```

Verify:

```
mise exec -- java -version    # OpenJDK 17 (Temurin)
mise exec -- adb --version    # platform-tools on PATH
```

Accept Android SDK licenses once per machine:

```
yes | mise exec -- sdkmanager --licenses
```

### Generate the native project

```
mise exec -- npx expo prebuild --platform android --no-install
```

`--no-install` is required because dependencies are managed with pnpm,
not npm. Re-run this any time `app.json` or any Expo config plugin
changes (e.g. after adding `expo-system-ui`); the command is
idempotent.

### Run on a USB-connected device

1. Enable Developer Options + USB debugging on the phone, plug it in,
   accept the host's RSA fingerprint prompt.
2. Confirm `mise exec -- adb devices` lists the phone as `device`
   (not `unauthorized`).
3. Build + install the dev client:

   ```
   mise exec -- npx expo run:android --device
   ```

The first build takes 5-20 minutes (Gradle pulls AGP, Kotlin, React
Native artifacts). Subsequent builds are incremental.

### Required environment variables

`EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time. Expo
itself reads them from `.env.local` in the repo root (no mise plumbing
needed). The dev-laptop `.env.local` points at `http://localhost:3000`
which is **not reachable from the phone** — override either by editing
`.env.local` before the build or by passing them inline:

```
EXPO_PUBLIC_API_BASE=https://pushups.wire.mattjewell.co.uk/ \
EXPO_PUBLIC_REGISTER_API_KEY=<shared secret> \
mise exec -- npx expo run:android --device
```

TLS terminates at the edge Caddy (managed out-of-band, in the
`mattjewell.co.uk` repo). Traffic inside the VPS is plain HTTP —
`k8s/ingress.yaml` uses the `web` entrypoint deliberately. The phone
always talks to the backend over HTTPS via the public hostname; LAN
addressing is not supported.

On first launch the app exchanges `REGISTER_API_KEY` for a per-device
bearer token via `/auth/register` and stores it in `expo-secure-store`.
See the **Auth secret rotation** section below for how to roll either
key.

### Regenerating `android/`

If `android/` gets into a weird state, delete it and re-prebuild — no
state in there is hand-edited, everything flows from `app.json`:

```
rm -rf android
mise exec -- npx expo prebuild --platform android --no-install
```

## Auth secrets (provisioned externally)

The `pushup-api-auth` Secret (containing `AUTH_SECRET` and
`REGISTER_API_KEY`) is **not** managed from this repo. It's provisioned
out-of-band — Terraform in the `mattjewell.co.uk` repo — and lives only
in the cluster. `k8s/kustomization.yaml` deliberately omits the Secret
manifest so `kubectl apply -k k8s/` and ArgoCD never overwrite it.

If you need to bootstrap the Secret manually (e.g. for a fresh dev
cluster before Terraform has run):

```
kubectl create secret generic pushup-api-auth -n pushups \
  --from-literal=AUTH_SECRET=$(openssl rand -base64 32) \
  --from-literal=REGISTER_API_KEY=$(openssl rand -base64 32)
```

Rotation procedure is in the **Auth secret rotation** section below.

## Database admin

Dev/staging only — production has no real users yet so this is safe. After
deploying the RBAC migration (Phase 1.5.7) run this one-shot SQL block by
hand against `pushups.db` to remove pre-RBAC rows that have no owning
device. Do NOT auto-run on startup.

```sql
DELETE FROM sessions WHERE device_id IS NULL;
DELETE FROM weekly_plans WHERE device_id = 'legacy';
```

After the wipe every remaining row carries a real Bearer-derived
`device_id` and RBAC filters work as intended.

## Ollama transport

The backend (`pushup-api` in k8s namespace `pushups`) and Ollama run on
the same host. The backend reaches Ollama through an OrbStack-internal
hostname (`host.docker.internal` by default, or an OrbStack `.local`
name once you've confirmed it's reachable from inside the pod). That
hop is intentionally **unauthenticated**: it never leaves the host's
internal network, so adding basic auth would buy nothing.

If Ollama ever moves off-box (different host, public reach), set
`OLLAMA_USER` and `OLLAMA_PASSWORD` in `pushup-api-ollama` (k8s
Secret, already wired as `envFrom: optional: true` in
`k8s/deployment.yaml`). The plumbing in `backend/src/ollama.ts`
applies the basic-auth header automatically when both are set, and
no-ops when either is missing — no code change required.

Verify the in-cluster path:

```
kubectl exec -n pushups deploy/pushup-api -- curl -sS $OLLAMA_URL/api/tags
```

Should return 200 with the installed model list. From off-host
(laptop on the same LAN, phone on cellular) the same URL must be
**unreachable** — that's the isolation claim doing its job.

## Auth secret rotation

Tokens are stateless HMACs over `(deviceId, AUTH_SECRET)` — there is
no per-device revocation list. Rotating `AUTH_SECRET` invalidates
**every** device's token at once, and every device must re-register
on its next API call (the app's bearer wrapper catches the 401,
calls `/auth/register` with `EXPO_PUBLIC_REGISTER_API_KEY`, saves the
new token, and retries the failed call — silent to the user).

To rotate in k8s:

```
# 1. Generate a new secret value
NEW_SECRET=$(openssl rand -base64 32)

# 2. Edit the Secret in place (or apply a fresh manifest)
kubectl edit secret pushup-api-auth -n pushups
#   set data.AUTH_SECRET to $(echo -n "$NEW_SECRET" | base64)

# 3. Restart the deployment so the new env is picked up
kubectl rollout restart deploy/pushup-api -n pushups
kubectl rollout status   deploy/pushup-api -n pushups
```

After the rollout, every device will see one 401 on its next call,
silently re-register, and keep going. To rotate
`REGISTER_API_KEY` instead (compromised app bundle scenario), follow
the same steps for that key and ship a new app build with the
matching `EXPO_PUBLIC_REGISTER_API_KEY`. Devices on the old build
will fail to re-register until updated.

## Analytics

The app sends a small set of product-analytics events to
[PostHog](https://posthog.com). Identity is the per-device bearer
`deviceId` from `src/auth/authStore.ts` — the same one that scopes
data on the backend — so events are stable across app launches and
never tied to PII.

### What we capture

Client-side (`src/analytics/posthog.ts`):

| Event | Props | Fired from |
| --- | --- | --- |
| `workout_started` | `todayTarget`, `hasPlan` | `useWorkoutSession.startSession` |
| `set_completed` | `setIndex`, `reps`, `targetReps` | `useWorkoutSession` effect on `setsCompleted` |
| `session_ended` | `totalReps`, `setsCount`, `feltCategory` | `useWorkoutSession` effect on `appState=idle` after `record_feedback` |
| `voice_utterance_routed` | `tool`, `fromState`, `fallbackUsed` | `useWorkoutSession.handleTranscript` |
| `sync_failed` | `pendingCount`, `errorClass` | `src/db/sync.ts` catch path |
| `plan_generated` | `exerciseId` | `app/plan.tsx` after a successful generate |
| `session_reflection_viewed` | `hasReflection` | `app/complete.tsx` once the reflection resolves (true = string from backend, false = null/error → static fallback) |

Backend-side (`backend/src/analytics.ts`):

| Event | Props | Fired from |
| --- | --- | --- |
| `voice_respond` | `route`, `latencyMs`, `fallbackUsed`, `distinctId=deviceId` | `backend/src/routes/voice.ts` after each call |

### What we don't capture

- Raw transcripts (we only log lengths server-side; analytics carries
  `tool` + `fromState` instead).
- Chat logs of any kind.
- Free-text user input — the `userFeedback` shorthand from
  `record_feedback` is short and is sent as `feltCategory`. Goals text
  (captured in onboarding, Phase 11) is never sent to PostHog.
- IP, device fingerprint, or anything beyond the `deviceId` already
  used for backend scoping.

### How to disable

Unset the env vars and analytics stops at boot:

- Client: leave `EXPO_PUBLIC_POSTHOG_KEY` out of the build env. The
  SDK is not initialised; `track(...)` is a no-op.
- Backend: leave `POSTHOG_API_KEY` out of the pod env. No PostHog
  client is constructed.

Both modules tolerate the unset case without logging spam.

### How to self-host

Point both env vars at your self-hosted PostHog endpoint and ship
the matching project keys:

```
EXPO_PUBLIC_POSTHOG_HOST=https://posthog.example
EXPO_PUBLIC_POSTHOG_KEY=<project key from self-hosted instance>

# Backend (k8s secret on the same shape)
POSTHOG_HOST=https://posthog.example
POSTHOG_API_KEY=<project key from self-hosted instance>
```

Defaults are PostHog Cloud EU (`https://eu.i.posthog.com`) — UK-based
project, EU data residency by default.
