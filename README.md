# 100 Pushups
Voice-controlled pushup tracker with LLM coaching.

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
