# Souris — Communication Core

## 1. Purpose and status

The Communication Core is the server-side engine that will later send appointment reminders,
reschedule/cancellation notices and inactive-client follow-ups, over email and SMS. Lot A builds
the reliable infrastructure ONLY: the queue, its lifecycle, idempotence, retries, atomic claiming
and the transport boundary. **Lot A sends nothing externally** — no provider SDK, no credential
and no delivery code exist anywhere in the repository.

```text
Lot A   Communication Core                 done — queue, worker, fake transport (this document)
Lot B   Real email provider                future — EMAIL transport, appointment integration, app-side status projection
Lot C   SMS provider                       future — SMS transport, quotas
        Paywall / entitlements             future — separate from the core
        Inactive-client campaigns          future — reuse the same engine (source_type CLIENT)
```

## 2. Boundaries

```text
Mobile app                 business/source state (SQLite + aggregate sync, unchanged)
        ↓  (future Lot B integration)
Server Communication Core  scheduled_communications + communications_* functions:
                           schedule / lifecycle / retries / idempotence — server-owned
        ↓
Transport                  email/SMS implementation later; Lot A has only the fake transport
```

Sending is **server-owned**. The app is never responsible for waking up at the scheduled time:
a communication must be processable while the app is closed, the phone off or replaced, or
several devices are connected. The queue is therefore NOT part of the SQLite snapshot or the
aggregate sync — no local table, no outbox entry, no `sync_*` change. Devices do not own copies
of pending jobs. A future lot may add a safe, owner-scoped read projection; execution stays on
the server.

## 3. The queue — `public.scheduled_communications`

Migration `supabase/migrations/20260926130000_create_communication_core.sql`. One row = one
logical communication:

```text
id                    uuid, server-generated
business_id           → businesses, ON DELETE CASCADE (infrastructure never blocks cleanup;
                        operational rows already guard Business deletion)
source_type/source_id generic source (APPOINTMENT | CLIENT), deliberately NO foreign key:
                        a record may outlive its source, and new sources are additive
kind                  APPOINTMENT_REMINDER | APPOINTMENT_RESCHEDULED | APPOINTMENT_CANCELLED |
                        INACTIVE_CLIENT_FOLLOWUP (CHECKed; adding one is an additive constraint
                        replacement, not a redesign)
channel               EMAIL | SMS
recipient             snapshot of the destination (business-private, never a secret)
payload               jsonb object snapshot of the prepared content — the worker never queries
                        mobile UI state at send time
scheduled_for         absolute timestamptz — the future appointment layer converts its local
                        semantics into this instant
next_attempt_at       when the worker may (re)try; = scheduled_for at enqueue
status                SCHEDULED | PROCESSING | SENT | FAILED | CANCELLED
attempt_count, processing_started_at, sent_at, failed_at, cancelled_at,
last_error (sanitized), provider_message_id
dedupe_key            stable identity of the logical event, UNIQUE per Business
created_at, updated_at
```

A `before insert or update` trigger makes writes server-owned: inserts always start
`SCHEDULED` / attempt 0 on server time whatever they claim; identity (business, dedupe key,
source, kind, channel) is pinned; and only legal lifecycle transitions pass —
`SCHEDULED → PROCESSING|CANCELLED`, `PROCESSING → SENT|FAILED|SCHEDULED|CANCELLED`. Terminal
states have no exit (`cancelled → processing`, `sent → scheduled`, `failed → processing` raise
`22023`). A manual retry-after-failure would be an explicit future operation.

## 4. Security / RLS

RLS is enabled with **zero policies**, and every table privilege is revoked from `public`,
`anon` and `authenticated`: there is NO client read or write path at all — a professional can
never inspect another Business's records because no authenticated path can inspect ANY record.
`service_role` (BYPASSRLS) operates the queue exclusively through the `communications_*`
functions, whose EXECUTE is granted to `service_role` only. All functions are SECURITY INVOKER
with `search_path = ''`, like the sync RPCs. Payloads and recipients are business-private: the
worker returns counts only and never logs them.

## 5. Operations (all `service_role`-only RPCs)

```text
communications_enqueue(business, source_type, source_id, kind, channel,
                       recipient, payload, scheduled_for, dedupe_key)
    idempotent on (business_id, dedupe_key): ENQUEUED, or ALREADY_ENQUEUED with the existing
    record (whatever its state — a sent/failed/cancelled logical event is never re-created;
    a new logical event carries a new key, e.g. appointment:<id>:reminder:email:<revision>)

communications_cancel(business, id)
    SCHEDULED|PROCESSING → CANCELLED; ALREADY_CANCELLED on repeat; IGNORED on SENT/FAILED;
    ABSENT for an unknown or other-Business id

communications_reschedule(same args as enqueue)
    the reconcile primitive: cancels ACTIVE records of the same
    (business, source_type, source_id, kind, channel) whose dedupe key differs, then enqueues
    the replacement idempotently — called twice, it cancels nothing more and duplicates nothing

communications_claim_due(batch default 25 [1..100], lease default 600 s)
    FOR UPDATE SKIP LOCKED + status guard: two overlapping workers can never claim the same
    record. Claims SCHEDULED with next_attempt_at <= now(), plus PROCESSING whose lease
    expired (crashed worker: 10 minutes, comfortably above any invocation, so a stale record
    waits at most ~10 min and a live one is never stolen). Sets PROCESSING, increments
    attempt_count. DATABASE time only.

communications_read_status(id)          the worker's pre-dispatch cancellation re-check
communications_mark_sent(id, provider_message_id)
communications_mark_retry(id, error, delay_seconds)   → SCHEDULED, next_attempt_at = now() + delay
communications_mark_failed(id, error)                 → FAILED (terminal)
    all three act only on rows still PROCESSING and report anything else (IGNORED / ABSENT)
```

Cancellation race: the worker re-checks the status immediately before dispatch, so a
cancellation that lands before dispatch always wins. The residual race (cancel between re-check
and transport call) cannot be eliminated around an external provider; if it happens, the record
STAYS `CANCELLED` and `mark_sent` records reality (`provider_message_id`,
`last_error = DISPATCHED_BEFORE_CANCELLATION`) instead of hiding it.

## 6. The worker — `supabase/functions/communications-worker`

A Supabase Edge Function (Deno entry `index.ts`; the engine under `core/` is plain TypeScript,
unit-tested with the app's Jest suite). One invocation = one pass:

```text
claim a bounded batch (SQL defaults: 25, lease 600 s)
for each record:
  attempt_count > max (4)?  → mark_failed          (bounds crash loops)
  status re-check ≠ PROCESSING? → skip             (cancellation won)
  transport = registry[channel] → send
  SENT               → mark_sent
  PERMANENT_FAILURE  → mark_failed
  RETRYABLE_FAILURE  → retry-policy.ts decides:
                        attempt 1 → +60 s, 2 → +300 s, 3 → +900 s, 4 → FAILED
  (a throwing transport counts as retryable)
```

The retry policy lives in ONE module (`core/retry-policy.ts`); the claim batch/lease defaults
live in ONE place (the SQL function). The worker holds no clock: dueness, leases and retry
instants are computed by the database (`now()` + delay), so a wrong worker or phone clock never
matters.

Transport boundary (`core/transport.ts`): `send(message) → SENT | RETRYABLE_FAILURE |
PERMANENT_FAILURE`. Provider-specific detail (HTTP statuses, SDK errors) is translated into
these classes inside a transport and never leaks further. Lot A registers ONLY
`FakeCommunicationTransport` for both channels: deterministic (driven by a
`payload.fakeOutcome` directive, never randomness), no network. **A deployed Lot A worker that
finds a due record marks it SENT with `provider_message_id = fake:<id>` and delivers nothing,
nowhere.** A Jest guard asserts the registry holds only the fake transport and that no provider
SDK, endpoint or `fetch` exists in the worker sources.

## 7. Scheduler

No scheduler infrastructure existed before Lot A (audited 2026-09-25: no Edge Function, no
pg_cron, no service-role usage anywhere). The chosen mechanism is Supabase-native:
`pg_cron` + `pg_net` invoke the Edge Function about once per minute. Exact-second precision is
irrelevant: dueness is `next_attempt_at <= now()`, so a late tick just sends slightly later.
The migration deliberately does NOT create the cron job (it needs the project URL and a key);
setup is a manual step (`supabase/README.md`). Nothing needs to be deployed during Lot A —
nothing enqueues records in production yet.

Worker authentication uses the CURRENT Supabase secret-key model, not the legacy
`service_role` JWT (deprecated by Supabase): the entry is wrapped in `withSupabase` from
`npm:@supabase/server` with `auth: 'secret:communications-worker'`, so the wrapper accepts ONLY
the dedicated server-side secret key named `communications-worker` (an `sb_secret_…` key
created in the Dashboard, sent on the `apikey` header) and refuses publishable keys, user JWTs
and unauthenticated calls with a 401 before the handler runs. Secret keys are not JWTs, so
`verify_jwt` is disabled for this function; the secret-key check replaces it. The handler's
`ctx.supabaseAdmin` is the privileged server client — it still resolves to the Postgres
`service_role` ROLE, which keeps its EXECUTE grants on the `communications_*` functions
unchanged (the SQL privilege architecture is the database-role layer; the HTTP credential is a
separate, rotatable, per-component key). The future cron job stores that one key in Vault and
sends it on `apikey`. The key must never exist in Expo env, the app bundle, SQLite, public
database rows or source control. **No provider secret exists.** When Lot B adds one, it lives
ONLY in Edge Function secrets (`npx supabase secrets set`): never in Expo public env, the app
bundle, SQLite or a public table.

## 8. Offline edge case (for Lot B)

If an appointment is modified or cancelled while the device is completely offline, the server
cannot cancel or reschedule an already-scheduled communication it never heard about: the
correction reaches the queue only when the aggregate sync pushes the edit after connectivity
returns. This is unavoidable and must not be papered over; Lot B's appointment integration must
reconcile (cancel/reschedule by dedupe-key revision) on every synced change, and accept that a
reminder may fire from state the server last knew.

## 9. Accepted Lot B decisions (documented, NOT implemented)

- **Scheduling integration**: server-side appointment reconciliation, triggered after synced
  appointment state reaches Postgres — never an app-side enqueue call. The mobile app never
  receives queue-write privileges.
- **Dedupe revision**: derived from the appointment's monotonic server/sync revision for
  communication-relevant scheduling events, not from `start_at` alone; reconciliation must not
  create a new communication because an unrelated appointment field changed.
- **Status UI**: a narrow, owner-scoped, read-only RPC/projection; the app never reads
  `scheduled_communications` directly.

## 10. Explicit non-goals of Lot A

No reminder or settings UI, no onboarding opt-in, no per-appointment toggle or status UI, no
client email warning, no H-24 scheduling, no appointment create/reschedule/cancel hooks, no
real email or SMS provider, no quotas, no RevenueCat/paywall, no push notifications, no
inactive-client campaigns, no app-side read of the queue, and NO change to CloudSyncRunner, the
push worker, snapshot reload, session providers or conflict resolution. The sync engine and the
appointment schema are untouched.

## 11. Verification

Worker engine: Jest (`supabase/functions/communications-worker/core/__tests__/`) — retry
policy, fake transport determinism, worker passes (success, retryable→failed, permanent,
throwing transport, cancellation between claim and dispatch, the residual dispatch-vs-cancellation race, crash-loop bound, mixed batch,
no-real-provider guard).

Database: 73 checks executed against ALL ELEVEN migrations, applied in order on a populated
in-process Postgres (PGlite, the usual scratch harness with stubbed auth/storage and the
anon/authenticated/service_role roles): additivity and byte-identical existing rows, re-run
harmlessness, the full security surface, enqueue idempotence, claiming (due/future/terminal,
bounded batch, fresh-lease protection, stale-lease reclaim), every settlement and its races,
cancellation idempotence, reschedule reconciliation, the lifecycle guards, forged-write
normalization, vocabulary/validation errors, Business isolation and Business-deletion cascade.
The existing push/pull regression harnesses also pass with the new migration appended (the pull
harness keeps its one historical by-design exact-shape mismatch that predates the photo
columns). PGlite is single-connection, so the FOR UPDATE SKIP LOCKED overlap of two truly
simultaneous claims is verified at the status-guard level (a claimed record is never claimable
again), not with two live connections.
