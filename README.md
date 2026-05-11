# 100 Pushups
Voice-controlled pushup tracker with LLM coaching.

## Build for Android

The Expo app ships as a custom dev client (not Expo Go) because it
uses `expo-secure-store` and `expo-sqlite`. `android/` is a generated
artifact — it's gitignored and re-materialised from `app.json` on
every prebuild.

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
EXPO_PUBLIC_API_BASE=https://pushups.example/ \
EXPO_PUBLIC_REGISTER_API_KEY=<shared secret> \
mise exec -- npx expo run:android --device
```

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
