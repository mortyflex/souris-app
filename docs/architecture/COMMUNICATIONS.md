# Souris — Communication Core

## 1. Purpose and status

The Communication Core is the server-side engine that sends appointment reminders and
reschedule/cancellation notices — later also inactive-client follow-ups — over email (SMS is a
future lot). Lot A built the reliable infrastructure: the queue, its lifecycle, idempotence,
retries, atomic claiming and the transport boundary. Lot B (§12–§20) builds appointment EMAIL
reminders end-to-end on it: the server-authoritative Business preference, the per-appointment
flag, server-side reconciliation from authoritative Postgres state, the fixed French templates,
the real Resend EMAIL transport and the app's narrow status projection.

```text
Lot A   Communication Core                 done — queue, worker, fake transport (§2–§11)
Lot B   Appointment email reminders        done — preference, reconciliation, templates, Resend (§12–§20)
Lot C1  SMS reminder architecture          done — SMS preference, phone rules, channel-generic
                                           reconciliation, per-channel projection (§22–§27);
                                           NO provider, NO user-facing activation
Lot C2  SMS provider                       future — real SMS transport, controlled test-Business send
Lot C3  SMS quota / paywall                future — entitlement, user-facing SMS switch
        Paywall / entitlements             future — separate from the core
        Inactive-client campaigns          future — reuse the same engine (source_type CLIENT)
```

**Global safety rule, unchanged by Lot B:** everything defaults OFF. No existing Business is
opted in by a migration or a deployment; zero email leaves Souris until the professional
explicitly enables reminders — and even then only for eligible future appointments.

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
functions, whose EXECUTE is granted to `service_role` only. Because those functions are
SECURITY INVOKER, `service_role` also needs its own NARROW table privileges — granted
EXPLICITLY by `20260929120000_grant_worker_table_privileges.sql` (SELECT/INSERT/UPDATE on the
queue; never DELETE), after the first production smoke test proved that relying on environment
default privileges was wrong: on the real project they confer no DML on these tables — only a
TRUNCATE/REFERENCES/TRIGGER residue, which `20260930120000_revoke_worker_extra_privileges.sql`
revokes so the explicit set is EXACTLY the audited one (queue: SELECT/INSERT/UPDATE; retry
jobs: SELECT/UPDATE/DELETE). All functions are SECURITY INVOKER
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
`npm:@supabase/server` with `auth: 'secret:communications_worker'`, so the wrapper accepts ONLY
the dedicated server-side secret key named `communications_worker` (an `sb_secret_…` key
(named Secret Keys allow lowercase letters, digits and underscore only)
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

## 9. Lot B decisions, as implemented

The three decisions recorded at the end of Lot A were implemented exactly (server-side
reconciliation triggers, sync-revision-based dedupe keys, a narrow owner projection): §14, §15
and §18 below.

## 10. Explicit non-goals of Lot A

(Historical — most of these ARE Lot B, below.) No reminder or settings UI, no onboarding opt-in,
no per-appointment toggle or status UI, no client email warning, no H-24 scheduling, no
appointment create/reschedule/cancel hooks, no real email or SMS provider, no quotas, no
RevenueCat/paywall, no push notifications, no inactive-client campaigns, no app-side read of the
queue, and NO change to CloudSyncRunner, the push worker, snapshot reload, session providers or
conflict resolution.

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

---

# Lot B — Appointment email reminders

## 12. The two switches

```text
business_communication_preferences        the MASTER switch, server-authoritative, per Business
  business_id (PK → businesses, cascade)
  email_reminders_enabled                 boolean NOT NULL DEFAULT FALSE
  reply_to_email                          nullable; REQUIRED (and shape-CHECKed) when enabled
  created_at / updated_at                 server-owned (before-write trigger)

appointments.client_reminder_enabled      the per-appointment override
  boolean, NULLABLE — NULL = "never explicitly set" = ENABLED (the product default)
```

Effective eligibility is `global ON AND per-appointment not OFF` — the appointment flag alone
never sends anything, which is why it can safely default to enabled: the day a professional
turns the master switch on, her existing future appointments become schedulable without touching
every row. Migration `supabase/migrations/20260927120000_add_appointment_email_reminders.sql`
adds both, additively: the preference table starts EMPTY (a missing row reads as disabled with
no Reply-To), the appointment column NULL with no backfill — no row rewritten, no `sync_version`
moved, no device re-pull, zero records enqueued.

The preference table has NO client surface at all (RLS on, zero policies, zero grants), exactly
like the queue. The app goes through three narrow owner RPCs (SECURITY DEFINER — deliberately,
because the surfaces they guard have no authenticated grants; each one checks
`is_business_owner` FIRST and pins `search_path`):

```text
communications_read_preferences(business)                 → { email_reminders_enabled, reply_to_email, updated_at }
communications_update_preferences(business, enabled, reply_to)
    validates the Reply-To (stable INVALID_REPLY_TO answer; enabling requires one), upserts,
    and the table trigger reconciles: OFF→ON schedules eligible future appointments,
    ON→OFF cancels EVERY pending appointment communication of the Business (idempotent;
    SENT/FAILED history is never touched); a Reply-To change refreshes pending payloads
communications_appointment_reminder_status(business, id)  → §18
```

The per-appointment flag travels with the APPOINTMENT aggregate through the normal sync
(SQLite schema v15 `appointments.client_reminder_enabled`, both sync RPCs replaced in place;
a payload without the key — an older build — keeps the stored value; CLOUD_SYNC.md §25).

## 13. The H-24 rule

```text
scheduled_for = start_at − 24 hours,  exactly — the appointment's absolute instant, server time
created less than 24 h before start  → NO reminder, never a late one
the H-24 boundary itself             → still schedulable
```

An initial reminder is schedulable only while ALL of: global ON, appointment flag not OFF,
appointment live (not tombstoned) and SCHEDULED/CONFIRMED, client live with a usable email
(`communications_is_valid_email` — the same shape rule as `src/domain/communications/email.ts`),
H-24 not passed, and the initial reminder was never SENT. Terminal statuses (CANCELLED, NO_SHOW,
COMPLETED) and IN_PROGRESS never retain a pending reminder. A missing email is NOT a failure —
nothing is enqueued at all.

## 14. Server-side reconciliation

The mobile app NEVER enqueues. AFTER-row triggers run where authoritative state changes, all
SECURITY DEFINER, all swallowing their own errors (a reminder bug must never fail an appointment
write or a sync push):

```text
appointments        insert/update       → reconcile this appointment (+ post-send events, §16)
clients             update              → email / first name / tombstone changed: reconcile the
                                          client's live upcoming appointments
preference row      insert/update       → OFF→ON: reconcile the Business; ON→OFF: cancel its
                                          pending appointment communications; Reply-To: refresh
businesses          update              → name changed: refresh pending payloads
```

Since the hardening migration (`20260928120000_add_communication_reconciliation_retry.sql`) a
swallowed trigger failure is DURABLE, never silent — §14b.

`communications_reconcile_appointment(business, id)` is THE rule, idempotent by construction:

```text
not eligible, active record          → cancel it (communications_cancel)
eligible, active at the same H-24    → refresh recipient/payload IN PLACE
                                       (communications_update_content, §15) — a service rename,
                                       a corrected address, a business rename, a Reply-To change
                                       are NOT new logical events and create NO duplicate
eligible, active at another H-24     → a genuine reschedule: communications_reschedule under a
                                       NEW revision key (old record → CANCELLED)
eligible, nothing active             → enqueue — unless a FAILED record exists for this very
                                       H-24 (content-only changes never revive a failure; a
                                       genuine reschedule supersedes it)
```

Child-row writes (items/phases) reach the appointment trigger through the existing parent-touch
update with `start_at`/`status` unchanged → content refresh only. Because the triggers run
INSIDE the sync-push transaction, a push that ends in CONFLICT rolls its queue effects back too.

## 14b. Durable reconciliation retry

A communication failure must never fail a domain write — but the original Lot B triggers only
`raise warning` on a swallowed exception, so a reminder could be silently lost forever. Now
every swallowed trigger failure records ONE job in `communication_reconciliation_jobs`
(server-only: RLS with zero policies, zero grants; not a sync aggregate; CASCADE on Business
deletion) and the EXISTING worker retries it:

```text
authoritative change → trigger reconciliation fails
  → the domain write STILL succeeds
  → the failure is recorded durably:  (business_id, scope_type, source_id,
      attempt_count, next_attempt_at, last_error, created_at, updated_at)
      scope APPOINTMENT + id   the appointment trigger  → re-run events + reminder
      scope BUSINESS + ''      client / preference / business-name triggers
                               → re-run the preference-aware whole-Business pass
  → the worker pass re-runs the SAME authoritative reconciliation later
```

Properties:

- **No second queue.** A job names a reconciliation TARGET only — never email content, never a
  recipient. `scheduled_communications` remains the one communication queue, and because a job
  stores no state, a retry always reconciles the CURRENT authoritative source ("latest state
  wins" is structural, not implemented).
- **Coalesced.** `UNIQUE (business_id, scope_type, source_id)`: a repeated failure for the same
  target updates the one row — attempts reset to 0, due immediately — never unlimited error rows.
- **Privileges.** The claim/settle functions are SECURITY INVOKER; `service_role`'s explicit
  table grants (`20260929120000…`) are SELECT/UPDATE/DELETE on the jobs table — INSERT stays
  impossible for the worker (recording a retry is the SECURITY DEFINER trigger path only).
- **Concurrency like Lot A.** `communications_claim_reconciliation_jobs` claims atomically
  (`FOR UPDATE SKIP LOCKED`), bumping `attempt_count` and pushing `next_attempt_at` forward by
  the lease — no separate PROCESSING status is needed: a fresh claim is invisible to other
  workers, and a crashed worker's claim simply expires with the lease. Settlements
  (`…_complete_…` / `…_fail_…`) are CONDITIONAL on the `updated_at` observed at claim time, so
  a job coalesced by a NEWER failure while being processed is left with its fresh schedule.
- **Bounded, recoverable.** The worker applies the ONE central retry policy
  (`retry-policy.ts`). Exhausted → the job is PARKED (`next_attempt_at = 'infinity'`): a
  durable, inspectable trace that the next authoritative change of the same target
  automatically revives (attempts reset, due now). Nothing is retried forever and nothing is
  forgotten.
- **Executor.** `communications_run_reconciliation(business, scope, source)` — service_role
  only — runs `communications_reconcile_appointment_events` + `…_reconcile_appointment` for an
  APPOINTMENT scope, and for BUSINESS the preference-aware pass (reconcile while enabled,
  cancel pending while disabled). The reminder rules stay in the database; the worker
  (`core/reconciliation.ts`) never re-implements them.
- **Worker pass order**: retries FIRST, then claim/send — a recovered reconciliation's
  immediate event can go out in the same pass. The summary gains a `reconciliation` block
  (counts only). Errors recorded anywhere on a job are INTERNAL reconciliation errors —
  distinct from provider-send failures — sanitized on both sides (email-shaped tokens
  redacted, bounded length; never a payload, recipient or credential).

## 15. Dedupe keys and revisions

The Lot A idempotence model, fed with the appointment's monotonic server `sync_version` at the
time of the event — never from `start_at` alone:

```text
appointment:<id>:reminder:email:<sync_version>          initial reminder (per scheduling act)
appointment:<id>:rescheduled:email:<sync_version>       one per genuinely saved date/time change
appointment:<id>:cancelled:email                        the post-send cancellation notice
                                                        (FIXED once-ever key — a cancellation
                                                        is a once-per-appointment event; §16)
```

The same synced revision processed any number of times maps to the same key → one record, one
email. A terminal CANCELLED record already holding the minted reminder key (the same revision
was scheduled then cancelled — global OFF→ON, email removed→re-added) is a spent logical event:
the reconciliation extends the key deterministically (a count-based suffix) so a NEW logical
reminder can follow it. Key format is server-side only; no UI ever builds or parses one.

`communications_update_content` is Lot B's one addition to the Lot A mutation surface: it
refreshes recipient/payload/instant of a still-SCHEDULED record in place and never creates,
revives or resends anything (PROCESSING → IGNORED, like the Lot A settlements).

## 16. After the reminder was SENT

Post-send events are DERIVED FROM CURRENT STATE by
`communications_reconcile_appointment_events` (no OLD/NEW needed, so a durable RETRY can mint an
event the failed trigger lost): what the client was last told is read from the queue itself —
the latest live APPOINTMENT_RESCHEDULED notice, else the SENT reminder's H-24 + 24 h. The live
appointments trigger calls it whenever `status` or `start_at` changed; the retry executor calls
it unconditionally. Both events require a SENT initial reminder, automation CURRENTLY on (both
switches) and a usable client email:

```text
APPOINTMENT_RESCHEDULED   status SCHEDULED/CONFIRMED
                          AND start_at > now()                (TEMPORAL GUARD: only a genuinely
                                                               upcoming NEW occurrence)
                          AND start_at ≠ last communicated start
                          → immediately, key appointment:<id>:rescheduled:email:<sync_version>
                            (one per genuinely saved change; the same state twice is a no-op;
                             no new H-24 reminder is ever scheduled after the original was sent)

APPOINTMENT_CANCELLED     status CANCELLED
                          AND start_at > cancelled_at         (TEMPORAL GUARD: the occurrence was
                                                               still upcoming when the
                                                               cancellation was RECORDED)
                          → immediately, key appointment:<id>:cancelled:email
                            (a cancellation is a once-ever event of the appointment: the fixed
                             key makes concurrent minting race-safe)

NO_SHOW, service-only edit             → nothing
cancelled BEFORE the reminder went     → pending reminder CANCELLED, NO email
```

The temporal guards use authoritative server time only — the mobile clock never participates —
and make historical data corrections inert: a past appointment whose date is fixed, or that is
retro-marked CANCELLED, never emails a client. A past appointment genuinely MOVED to an
upcoming date may legitimately produce a modification email. Disabling automation (either
switch) stops new automatic emails; already-sent history is never deleted.

## 17. Payload, templates, transport

The queue payload is exactly what the templates need — never prices, deposits, payments, status
vocabulary, notes or provider data:

```text
{ business_name, client_first_name, appointment_start_at (ISO instant),
  services[ snapshot names in item order ], reply_to }
```

Templates (`core/email-content.ts`) are FIXED V1 French transactional emails — reminder («
Rappel de votre rendez-vous chez … »), rescheduled (« … a été modifié », with the NEW schedule),
cancelled (« … a été annulé », date kept for context, no services) — one restrained
Souris-branded HTML card (email-safe table + inline styles, plum accent, « Envoyé avec Souris »
footer: one centered presentation-table row reading « Envoyé avec [Souris wordmark] » when the
optional `SOURIS_EMAIL_LOGO_URL` secret names a public HTTPS PNG copy of
`assets/brand/logo-wordmark.png` — a fixed 120×40 `<img>` (the asset's exact 3:1 ratio) with
`alt="Souris"`, carrying the brand over the discreet 12px « Envoyé avec »; the brand name is
never doubled as plain text next to the wordmark, and the footer falls back to the plain
« Envoyé avec Souris » whenever the URL is absent, invalid or fails to load) plus a plain-text
version. Every interpolated value is HTML-escaped. Date/time format in
`Europe/Paris` (the V1 single-market constant `APPOINTMENT_EMAIL_TIMEZONE`; a future business
timezone belongs in the payload).

Transport (`core/resend-transport.ts`) — the ONLY module that talks to a provider:

```text
POST https://api.resend.com/emails
From        "<business name, header-sanitized> via Souris" <RESEND_FROM_EMAIL>
Reply-To    the professional's configured address
Idempotency-Key   souris-communication-<communication id>   (stable across every retry:
                  provider-level idempotence ON TOP of the database dedupe)

2xx                       → SENT (provider message id)
429 / 5xx / network       → RETRYABLE_FAILURE (central Lot A policy)
other 4xx                 → PERMANENT_FAILURE
malformed payload/recipient/kind → PERMANENT_FAILURE, no provider call
```

Errors carry the HTTP status and Resend's error `name` only — never the key, the recipient or
the payload. `createProductionTransportRegistry` (used by the entry) requires `RESEND_API_KEY`
and a valid `RESEND_FROM_EMAIL` from Edge Function secrets and refuses the whole pass BEFORE
claiming when either is missing; SMS is bound to `UnsupportedChannelTransport` (permanent,
explicit — never the fake, never silently "sent"). Tests keep the deterministic fake transport
and never touch the network; a source guard keeps `fetch` and the provider name inside the
transport module.

## 18. The app side

```text
src/features/communications/
  gateway.ts                      the narrow boundary (preferences, status projection)
  session/CommunicationsGatewayProvider.tsx     the ONE gateway instance (account root)
  preferences/CommunicationPreferencesProvider  the latest KNOWN server preference, per (app)
  preferences/preferences-cache.ts              Business-scoped souris_metadata cache
  settings/ReminderSettingsScreen.tsx           Plus › Rappels clientes  (/reminder-settings)
  components/MissingEmailNotice.tsx             the inline warning
  presentation.ts                               the French copy in one place
src/infrastructure/supabase/communications-gateway.ts   the three RPCs
```

- **Authority and fail-safe.** The SERVER preference is authoritative. The provider mirrors the
  last server answer, refreshes the Business-scoped cache, falls back to it offline, and with
  neither answers DISABLED — no cached value ever enables anything the server did not confirm.
  There is NO local queue and no device-side scheduling of any kind.
- **Settings** (`Plus › Rappels clientes`): ONE switch, the fixed « 24 h avant le rendez-vous »
  timing (no customization in V1), the Reply-To (prefilled from the account email, validated
  locally AND by the server). Every change is persisted server-side before the UI claims it; the
  server trigger does the reconciliation.
- **Onboarding** (NEW businesses only): one optional « Rappels automatiques » step after the
  Business form — « Activer les rappels » (Reply-To prefilled, editable) or « Plus tard ».
  « Plus tard » saves NOTHING (the OFF default stands). Activation NEVER claims success the
  server did not confirm: the Business is created with the session's `deferEntry` (created and
  bound, but onboarding stays mounted), the preference is saved, and only an accepted save — or
  an explicit « Continuer sans les rappels » — enters the app. A failed save shows a calm
  lavender notice (« Impossible d’activer les rappels pour le moment. / Votre activité a bien
  été créée, mais les rappels restent désactivés. ») with « Réessayer »: the creation is never
  rolled back, a retry never duplicates the Business (the created one is reused; the gateway
  reuses an ALREADY_EXISTS one), and the safe fallback stays OFF. Existing users never see the
  step (onboarding only mounts while no Business exists).
- **Appointment creation and editing**: while the global preference is ON, an Options row
  « Rappel cliente » (native switch, ON by default; editing hydrates from the stored flag). The
  explicit choice is stored on the appointment; an untouched toggle keeps the field absent.
  While the global preference is OFF the row does not exist and nothing is stored. When the
  selected Client has no usable email, a lightweight inline notice (« Aucune adresse e-mail
  renseignée / Le rappel ne pourra pas être envoyé ») offers « Ajouter l’e-mail » through the
  EXISTING Client editor — and never blocks the appointment.
- **Details**: a discreet « Rappel cliente · … » line under the schedule, read from the
  owner-scoped projection `communications_appointment_reminder_status`:

  ```text
  SCHEDULED  Programmé · 26 septembre à 14:30      SENT       Envoyé   (provider acceptance —
  FAILED     Échec de l’envoi (terminal only:                  NEVER a delivery/read claim;
             retries in flight still show Programmé)           no « Lu / Ouvert / Reçu »)
  DISABLED   Désactivé          MISSING_EMAIL  Aucune adresse e-mail
  TOO_LATE   Non programmé · rendez-vous créé trop tard        NONE → no row
  ```

  The projection returns status + instant only — never payload, recipient, provider id or error.
  On any failure the row shows nothing (fail safe, no technical language).

## 19. Offline and multi-device

The Lot A limitation stands: an appointment edited or cancelled fully offline reaches the queue
only when sync pushes it — until then the server acts on the state it last knew, and a reminder
may fire from that state. As soon as the push commits, the triggers reconcile. No device owns a
reminder: whichever device pushes, the SAME server reconciliation runs, and any device reads the
same projection afterwards. The device is never responsible for the scheduled send.

## 20. Verification (Lot B)

Worker: Jest — templates (content, French dates, plain text, escaping with hostile fixtures, the
forbidden-content list), Resend transport (mocked fetch: success + provider id, stable
idempotency key across retries, 429/5xx/network retryable, 4xx permanent, no key/recipient/
payload in errors, no provider call for malformed input, SMS refusal), production registry
(Resend EMAIL + unsupported SMS, refusal without secrets, never the fake), the source guard, the
reconciliation retry pass (success/backoff/park under the central policy, one failing job never
blocks the others, error sanitization, retries run BEFORE sending, zeros without a retry
queue), and the unchanged Lot A worker passes.

Privilege regression (43 checks, STRICT role model — service_role receives NO implicit default
privileges, exactly like the real project): the whole Lot A lifecycle and the whole retry
lifecycle succeed as `service_role` itself; the narrow grants are exact (no direct queue
DELETE, no direct job INSERT); `anon` / `authenticated` hold zero access to both tables and to
every server-only function; the owner RPCs, the DEFINER trigger path and cross-owner refusals
are unchanged. The earlier harness stubs granted service_role implicit defaults, which is why
the missing explicit grants only surfaced in production; the Lot B harnesses now run in the
same strict model.

Hardening database checks (33, `20260928120000…` on top of all previous migrations): a domain
save succeeds although reconciliation throws while ONE sanitized coalesced job appears; atomic
claim + lease; a retry re-runs the authoritative reconciliation (reminder at H-24, twice → no
duplicate); completion removes the job; a stale job reconciles the CURRENT state; failure
backoff, superseded settles, parking and revival by the next authoritative change; the BUSINESS
scope both ways (failed enable → jobs → scheduled; failed disable → retry cancels pending); and
the temporal guards (past corrections and retro-cancellations send nothing; past → future move
sends exactly one modification email and no new reminder; an upcoming cancellation notifies
exactly once).

Database: 66 checks against ALL TWELVE migrations on a populated PGlite (byte-identical existing
rows, re-run harmless, zero enqueues from the migration alone, the preference RPCs and their
isolation/refusals, H-24 scheduling with the exact boundary, every eligibility miss, repeated-
revision idempotence, in-place content refresh for service/email/name/Reply-To changes, email
removal/re-addition, pre-send reschedule and <24 h reschedule, pre-send cancellation, the SENT
path (service-only silence, one rescheduled event per revision, distinct events per reschedule,
the cancellation notice, the switches-off silence), disable/re-enable, FAILED semantics, the
full projection vocabulary and its owner isolation, old-build payload compatibility, pull
round-trip, Business isolation). The Lot A harness (73) and the push/pull regressions still pass
(the pull harness keeps its one historical by-design CLIENT shape mismatch).

App: Jest — the v15 migration, store round trip, sync serialization, the gateway mapping, the
preference provider (server mirror, cache fallback, wrong-Business cache refusal, fail-safe),
the Settings screen, onboarding (« Plus tard » saves nothing, activation saves after creation,
invalid Reply-To refused, draft kept across failures), creation and editing toggles + missing-
email warning, and the Details status line.

## 21. Explicit non-goals of Lot B

No second communication queue (the retry table stores reconciliation targets, never messages),
no SMS (a production SMS record fails permanently and explicitly), no RevenueCat/paywall, no
inactive-client campaigns, no reminder timing customization, no custom templates or subjects, no
delivery/bounce webhooks or open tracking (SENT = provider acceptance), no push notifications on
failure, no manual retry-after-FAILED, no business timezone setting (Europe/Paris constant,
documented), no automatic activation of anything, and still no app access to the queue.

---

# Lot C1 — SMS reminder architecture

Migration `supabase/migrations/20261001120000_add_sms_reminder_architecture.sql`. Structural
preparation ONLY: no provider, no SMS copy, no quota, and **no user-facing activation** — the
migration alone sends nothing and enables nobody, and no app UI can turn SMS on before Lot C3.

## 22. The SMS switch

```text
business_communication_preferences.sms_reminders_enabled   boolean NOT NULL DEFAULT FALSE
```

- **Transactional appointment SMS only** (reminders + their reschedule/cancellation notices).
  It is NEVER consent for campaign/marketing SMS: future campaigns require their own explicit
  preference model. The transactional/marketing boundary is architectural, not a setting.
- Channels are INDEPENDENT: email ON + SMS ON sends BOTH when each channel is independently
  eligible. No preferred channel, no fallback routing, no email-as-baseline coupling.
- `appointments.client_reminder_enabled` stays the ONE per-appointment master switch: OFF means
  no email AND no SMS. There are no per-appointment channel switches.
- Owner RPCs: `communications_update_preferences` keeps its exact signature and updates ONLY
  the email fields (an old build can never reset the SMS switch); its answer and
  `communications_read_preferences` carry `sms_reminders_enabled` additively (absent reads
  false in the app and its Business-scoped cache). `communications_update_sms_preferences`
  (business, enabled) is the narrow SMS sibling — same DEFINER/owner-check/search_path model.
- **C1 exposure: none.** No Settings row, no onboarding change (onboarding stays email-only
  until C3). Enabling SMS is a controlled server-side operation on the dedicated test Business
  (the C2 seam). No hidden app gesture, no debug UI.

## 23. Phone canonicalization and SMS eligibility

`clients.phone` is NEVER rewritten and no canonical value is stored — no SQLite migration, no
sync payload change, no CLIENT aggregate change. The canonical destination is DERIVED at
reconciliation time, exactly like the client email:

```text
communications_client_phone_e164(text) → '+33612345678' | NULL
  strip separators (spaces . - parentheses); then ONE of:
    +[1-9][0-9]{6,14}          already E.164-like        → as-is
    00[1-9][0-9]{6,14}         international 00 prefix   → +…
    0[1-9][0-9]{8}             FRENCH national           → +33…   (the V1 single-market
                                                          fallback, like Europe/Paris; nothing
                                                          stored, so per-Business regions later
                                                          are a change to this ONE function)
  anything else (letters, malformed +, wrong lengths)     → NULL

communications_is_sms_eligible_phone(text) → boolean     DISTINCT from canonical:
    +33…   must be MOBILE (+336/+337) — a landline is canonical but never texted
    other  valid E.164 passes (provider-level destination validation is Lot C2)
```

The app mirrors both rules for UX only (`src/domain/communications/phone.ts`,
`isUsableCommunicationSmsPhone`, `communicationSmsPhoneIssue` → 'missing' | 'invalid'); the
server stays authoritative. Missing or invalid phone behaves like a missing email: **nothing is
enqueued — never a FAILED record.**

## 24. Channel-generic reconciliation

The Lot B decision tables now live ONCE, parameterized by channel — never copied:

```text
communications_reconcile_appointment(business, id)          same name/signature as Lot B
  → shared facts loaded ONCE (appointment, prefs, H-24 target, master flag)
  → communications_reconcile_appointment_channel(…, 'EMAIL', switch, email recipient, email payload)
  → communications_reconcile_appointment_channel(…, 'SMS',   switch, E.164 recipient, SMS payload)

communications_reconcile_appointment_events(business, id)   post-send notices, same shape
  → communications_reconcile_appointment_events_channel(…)  per channel
```

- EMAIL behavior is unchanged (same rules, same `:email:` keys, same payloads); SMS keys use
  the `:sms:` token (`appointment:<id>:reminder:sms:<sync_version>`, `…:cancelled:sms`,
  `…:rescheduled:sms:<sync_version>`). Both channels share the exact H-24 timing.
- The SMS payload (`communications_appointment_sms_payload`) is the email payload MINUS
  `reply_to`: business_name, client_first_name, appointment_start_at, services. Postgres never
  renders provider text; SMS copy/length/encoding is C2 worker code.
- **Per-channel gating everywhere**: a channel mints RESCHEDULED/CANCELLED notices only when
  ITS OWN initial reminder was SENT (a SENT email alone never produces an SMS event); "what the
  client was last told" is read per channel; terminal divergence is legal (EMAIL SENT + SMS
  FAILED and the inverse are two independent records).
- The cancellation notice goes out for BOTH origins — `cancelled_by` BUSINESS and CLIENT — per
  channel (the client-origin message confirms the cancellation was recorded); the temporal
  guards are unchanged, so historical corrections stay silent. NO_SHOW stays silent.
- `communications_cancel_business_appointment_pending(business, channel)` is channel-scoped:
  turning one channel off cancels THAT channel's pending records only (the unscoped Lot B
  helper is dropped). The client trigger now also watches `phone` (recipient refresh in place,
  cancel on unusable, schedule on restored — without disturbing EMAIL), and the retry
  executor's BUSINESS pass converges per channel.
- Reconciliation error scrubbing redacts phone-shaped tokens next to emails
  (`communications_scrub_error`).

## 25. Per-channel status projection

`communications_appointment_reminder_status` is UNTOUCHED (deployed builds parse its exact
shape; it stays EMAIL-only). The NEW owner RPC:

```text
communications_appointment_reminder_statuses(business, id) →
  [ { channel: EMAIL, status, scheduled_for?/sent_at? },
    { channel: SMS,   status, … } ]

SMS vocabulary: SCHEDULED SENT FAILED DISABLED MISSING_PHONE INVALID_PHONE TOO_LATE NONE
  MISSING_PHONE  no number at all            (derived — never a queue row)
  INVALID_PHONE  a number SMS cannot reach   (derived — never a queue row)
  QUOTA_UNAVAILABLE is RESERVED for Lot C3 and not implemented.
```

Never exposes recipient, payload, provider id, attempts, errors or dedupe keys; owner-scoped.

App side: while SMS is globally OFF (every real user in C1) the Details row renders EXACTLY
the Lot B single email line through the legacy projection. With SMS enabled (test Business),
it lists one compact line per channel under « Rappels cliente » (« E-mail · Envoyé »,
« SMS · Programmé · … »; « Aucun numéro de téléphone » / « Numéro non reconnu »). The
per-appointment toggle copy is channel-neutral (« Rappel automatique 24 h avant le
rendez-vous »), and `MissingPhoneNotice` (missing/invalid variants, opening the existing
Client editor) appears in creation/editing only when SMS is globally enabled — invisible in
production.

## 26. Future quota seam (Lot C3 — NOT implemented)

Enforcement will live server-side in PostgreSQL, in the SMS branch of
`communications_reconcile_appointment_channel`, between channel eligibility and the enqueue
(the marked seam):

```text
SMS eligibility → atomic quota reservation → SMS enqueue
```

One reservation per LOGICAL communication: retries re-use the claimed record and never consume
again; concurrent devices/workers cannot overspend (row-locked DB operation); email is
structurally unaffected. No quota tables, counters, reservations or RevenueCat exist in C1.

## 27. Explicit non-goals of Lot C1

No SMS provider, SDK, endpoint or secret (the production registry still binds
`SMS → UnsupportedChannelTransport`: even a hand-enqueued SMS fails permanently and
explicitly); no SMS renderer; no worker changes at all; no Settings SMS switch; no onboarding
change; no quota/entitlement/paywall; no marketing consent; no per-appointment channel
switches; no timing customization; no stored canonical phone; no phone backfill; no new sync
aggregate or payload change.
