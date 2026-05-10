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
