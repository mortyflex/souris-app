# BeautIzzy — Subscriptions: the server-side entitlement mirror

## 1. Purpose and status

BeautIzzy Plus is sold through RevenueCat (App Store today; Google Play is not configured). The
mobile app verifies the subscription through the RevenueCat SDK (`src/infrastructure/revenuecat/`,
`docs/architecture/ARCHITECTURE.md` §10, Phases 6.1–6.4B) and THE domain rule decides access
(`src/domain/access`). Client-side verification is not a security boundary: before enforcement
can ever be enabled, the SERVER must know each professional's entitlement from RevenueCat
directly. Phase 6.5A builds that knowledge — and nothing else:

```text
Phase 6.5A  Server-side entitlement mirror           done — two tables, the subscription_* RPCs,
            + secure RevenueCat webhook                      the revenuecat-webhook Edge Function,
                                                             optional REST reconciliation, the
                                                             effective-access helper (this doc)
Phase 6.5B  Communication entitlement enforcement    done — the server-side switch (disabled by
                                                             default), THE communication rule
                                                             communications_is_entitled, the four
                                                             boundaries, the worker's final check
                                                             (docs/architecture/COMMUNICATIONS.md §46)
Phase 6.5C  Server-side enforcement, continued      step 1 done — the device reads production
                                                             entitlements only (`isSandbox`): a
                                                             Sandbox purchase is never a verified
                                                             production entitlement outside the two
                                                             testing configurations (ARCHITECTURE.md
                                                             §10, Phase 6.5C step 1)
                                                     step 2 done — the verified proof persists on the
                                                             device (one souris_metadata row, with
                                                             its provenance) and a restart without
                                                             network starts from it under the
                                                             unchanged 72-hour offline policy; a
                                                             trusted-test-source proof never restores
                                                             ordinary production access
                                                             (ARCHITECTURE.md §10, Phase 6.5C step 2)
                                                     step 3 done — the client handles the future
                                                             ENTITLEMENT_REQUIRED push answer: the
                                                             entry stays, the Business's push pass
                                                             goes on a bounded hold, the pull goes on,
                                                             and the runner resumes the held writes
                                                             once Plus is back (CLOUD_SYNC.md §26)
                                                     step 4 done — the server-side switch
                                                             BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT
                                                             (disabled), THE business-mutation rule
                                                             business_mutation_is_entitled, and
                                                             sync_push_aggregate answering
                                                             ENTITLEMENT_REQUIRED under it
                                                             (CLOUD_SYNC.md §26) — the RPC boundary
                                                             only; direct table writes, Storage and
                                                             the preference RPCs are step 5
                                                     step 5 done — the row-level write policies of the
                                                             eleven operational tables, the business-
                                                             media upload policy and the three
                                                             preference RPCs reuse the SAME rule
                                                             (CLOUD_SYNC.md §26.2, COMMUNICATIONS.md
                                                             §47): server-side business-mutation
                                                             protection is complete at the database;
                                                             still disabled, still unapplied
                                                     step 6 done — the periodic re-verification sweep
                                                             and the operator backfill: the
                                                             subscription-reconciliation Edge Function
                                                             re-reads bounded batches of accounts from
                                                             RevenueCat's REST API through THE 6.5A
                                                             reconciliation, with dry-run, leases,
                                                             backoff and continuation (§13); nothing
                                                             scheduled, nothing deployed, nothing applied
                                                     step 7 done — offline entitlement clock rollback
                                                             protection: a persisted high-water mark of
                                                             observed local time beside the proof (evidence
                                                             format v2), the offline policy judged at the
                                                             later of the clock and that mark, a rollback
                                                             beyond five minutes refusing the conditional
                                                             grace (read-only, never a deletion); the
                                                             72-hour policy itself unchanged (ARCHITECTURE.md
                                                             §10, Phase 6.5C step 7)
                                                     future — the app reading the mirror; production
                                                             activation (see §12)
```

## 12. Production activation — forbidden until every prerequisite holds

Enabling `BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT` on the production project is NOT part of any
6.5C step and stays forbidden until ALL of the following have been performed and recorded:

1. the 6.5A webhook is deployed on production and receives production events, with the REST
   reconciliation configured;
2. EVERY paying and pilot account has been backfilled (§13, the `subscription-reconciliation`
   function in APPLY mode, after a DRY_RUN read by eye) and every `INVESTIGATE` outcome has been
   settled by hand: a Business whose owner has no mirrored row is REFUSED under enforcement;
3. the step 4 and step 5 migrations have been applied on Staging and the Staging checklist of
   `supabase/README.md` › Business mutation entitlement enforcement — step 5 has been run end to
   end with real devices (write refused, pull continues, hold, resume, Storage, preferences);
4. every device runs a build of Phase 6.5C step 3 or later (an older build reads the refusal as
   an unknown answer and backs off, losing nothing but saying nothing);
5. the client-side wording of the preference refusal exists, or the product accepts the generic
   failure the deployed builds show;
6. the switch is flipped on production by hand, account by account verified, with the rollback
   (`business_mutation_set_entitlement_enforcement(false)`) rehearsed on Staging first.

**What 6.5A does NOT change:** `SUBSCRIPTION_ENFORCEMENT` stays `disabled`; `PURCHASABLE_STORES`
stays `['test-store']`; no sync RPC, reminder function, communication table or existing row is
touched; the mobile app neither reads nor writes the mirror; nothing is deployed or applied by
this phase — the migration and the function are applied and deployed BY HAND (§8).

## 2. Boundaries

```text
RevenueCat                 the commercial truth: purchases, renewals, grants, revocations, transfers
      ↓ webhook (POST, shared Authorization value + optional HMAC signature)
revenuecat-webhook         Supabase Edge Function: authenticates, validates, projects ONE event
(supabase/functions/)      onto the row(s) of the product(s) it concerns through the subscription_*
                           RPCs (service_role), then — when REVENUECAT_SECRET_API_KEY is set —
                           fetches the subscriber's current state from RevenueCat's REST API and
                           reconciles each product it describes
      ↓ RPC (SECURITY DEFINER, service_role-only EXECUTE)
Postgres                   subscription_entitlements  one row per granting SOURCE:
                                                      (user, environment, entitlement, product)
                           subscription_events        the append-only history, unique on event id
                           subscription_has_plus_access(user, at)  THE effective-access rule
      ↓ RLS (owner SELECT on her rows only)
Mobile app                 reads NOTHING yet (6.5B); will never write
```

The mirror is server infrastructure, OUTSIDE the aggregate sync engine (`CLOUD_SYNC.md`): no
aggregate type, no SQLite table, no device pull, no business snapshot.

## 3. Identity, Business ownership and the unit of a row

- The RevenueCat **App User ID is the Supabase Auth user id** (`subscription-source.ts`:
  identified-only, never anonymous, never an email). A webhook subscriber is matched by the
  FIRST of `original_app_user_id`, `aliases[]`, `app_user_id` that is a uuid of an existing
  `auth.users` row. Nothing else matches; an unmatched subscriber is recorded `UNMATCHED` and
  changes no row.
- **One user owns exactly one Business**: `businesses.owner_user_id` is `UNIQUE`
  (`20260912120000_create_businesses.sql`). `business_id` is therefore DERIVED from the user at
  every write and never taken from RevenueCat or the caller. A user who buys before creating her
  Business gets rows with `business_id NULL`; the `after insert` trigger on `businesses` binds
  them the moment the Business exists.
- **The product is the unit.** Several sources can grant the same entitlement at once: a paid App
  Store subscription AND a promotional grant, two grants of different durations. RevenueCat emits
  every event about ONE product and expires, cancels or renews that product only, while another
  product may still grant Plus; its REST API likewise lists the state per product
  (`subscriber.subscriptions[product]`). Each granting product is therefore ITS OWN ROW, rewritten
  only by evidence about itself, and effective access is derived from all rows (§5). Two
  promotional grants of the SAME duration share a product id (`rc_promo_plus_lifetime`,
  `rc_promo_plus_monthly`, …) and are ONE RevenueCat subscription whose end is the latest grant's:
  the row keeps the later end, and the earlier grant reaching its end is `STALE`. RevenueCat
  exposes nothing finer than the product, so nothing finer is stored.

## 4. Schema

### `subscription_entitlements` — one row per granting source

Unique on `(user_id, environment, entitlement_id = 'plus', product_id)`.

| column | meaning |
|---|---|
| `user_id` | `auth.users` (cascade) |
| `business_id` | derived from `businesses.owner_user_id`; `NULL` until the Business exists |
| `environment` | `PRODUCTION` \| `SANDBOX` — RevenueCat's vocabulary; Test Store and Apple Sandbox are `SANDBOX` |
| `product_id` | the granting product: an App Store product, `rc_promo_plus_<duration>`, a Test Store product |
| `status` | `ACTIVE`, `TRIAL`, `CANCELLED_ACTIVE`, `BILLING_RETRY`, `COMPLIMENTARY`, `EXPIRED` |
| `plan` | `MONTHLY` / `ANNUAL` from an EXACT App Store product id, else `UNKNOWN` (access never depends on it) |
| `pending_product_id` | the product PRODUCT_CHANGE announced for the next period |
| `store`, `period_type` | RevenueCat vocabulary as received (`APP_STORE`, `PROMOTIONAL`, `TEST_STORE`, `TRIAL`, …), not CHECKed |
| `app_user_id`, `original_app_user_id` | the matched App User ID; the subscriber's first one |
| `purchased_at`, `expires_at`, `grace_period_expires_at` | the store's instants |
| `entitled_until` | **the end of THIS source** as RevenueCat knows it: the store expiration, or the later billing-grace end; `NULL` only for a complimentary grant without an end; exclusive |
| `will_renew`, `unsubscribe_detected_at`, `billing_issue_detected_at` | renewal facts |
| `original_transaction_id`, `latest_transaction_id` | store transaction identifiers |
| `latest_event_id`, `latest_event_type`, `latest_event_at` | the latest APPLIED webhook event about THIS product (ordering guard); `NULL` for a reconciliation-only row |
| `source`, `verified_at` | `WEBHOOK` \| `RECONCILIATION`; the instant the state was confirmed |

Constraints: `entitled_until` may be `NULL` only when `status = 'COMPLIMENTARY'`; a `WEBHOOK` row
names its event; the trigger pins `user_id`, `environment`, `entitlement_id`, `product_id`,
`created_at`.

### `subscription_events` — the append-only history

One row per RevenueCat event received, `UNIQUE (event_id)`: `event_type`, `app_id`,
`environment`, `store`, the subscriber identifiers (`app_user_id`, `original_app_user_id`,
`aliases[]`), the matched `user_id` / `business_id` (set null on deletion: history outlives
accounts), `product_id`, `entitlement_ids[]`, `event_at`, `purchased_at`, `expires_at`,
transaction ids, the `outcome` the mirror gave it (`APPLIED`, `STALE`, `IGNORED`, `UNMATCHED`,
`UNSUPPORTED`), `outcome_detail`, and `payload` — the `event` object as received MINUS
`subscriber_attributes` (business-private; never stored). A `before update` trigger refuses every
UPDATE (`22023`) except the referential `SET NULL` of a deleted user or Business.

### Access model (RLS and grants)

```text
anon            nothing (no grant, no policy)
authenticated   SELECT on subscription_entitlements where user_id = auth.uid()  — ONE policy
                no INSERT / UPDATE / DELETE grant (42501 whatever the policy would say)
                nothing on subscription_events; EXECUTE on no subscription_* function
service_role    NO direct table privilege (the platform residue TRUNCATE/REFERENCES/TRIGGER is revoked)
                EXECUTE on the subscription_* functions ONLY
```

The functions are `SECURITY DEFINER` with `search_path = ''`: they are the single door for the
server — they also read `auth.users` and `businesses`, on which `service_role` holds no privilege
(`20260929120000_grant_worker_table_privileges.sql` learned that the project confers none
implicitly). The client can therefore never grant, extend or erase an entitlement; the server can
only do so through the guarded functions; nothing is client-callable.

### Functions (`service_role` only)

| function | role |
|---|---|
| `subscription_read_mirror(app_user_ids text[], environment)` | matches the user, derives the Business, returns EVERY row of the environment (`snapshots[]`, `_ms` instants) |
| `subscription_apply_revenuecat_event(event jsonb, writes jsonb[])` | inserts the history row (`on conflict (event_id) do nothing` → `DUPLICATE`), then applies each write — one per product — only if that row's `latest_event_id` still equals the one the write was computed against (else `40001`); ONE transaction |
| `subscription_apply_reconciliation(user_id, environment, product_id, snapshot jsonb)` | replaces ONE product's row with the REST API state unless that row was confirmed later (`STALE`); keeps the latest applied event; never touches another row |
| `subscription_has_plus_access(user_id, at default now())` | **THE effective-access rule** (§5) |
| `subscription_write_snapshot(…)` | internal upsert, re-derives `business_id` |

Instants cross the boundary as Unix milliseconds (`*_ms`) in BOTH directions — RevenueCat's own
unit — never as formatted strings.

## 5. Effective Plus access

`subscription_has_plus_access(p_user_id, p_at)` is TRUE when ANY row of the user satisfies ALL of:

```text
environment = 'PRODUCTION'                                     never a Sandbox row
store in ('APP_STORE', 'MAC_APP_STORE', 'PLAY_STORE', 'PROMOTIONAL')
                                                               never a Test Store product, whatever
                                                               environment it was labelled with
status <> 'EXPIRED'                                            confirmed ends and revocations hold —
                                                               an EXPIRED row never grants, not even
                                                               for an instant before its end
entitled_until is null or entitled_until > p_at                a complimentary grant without end
                                                               grants indefinitely; ends are exclusive
```

It checks ends, not starts (a dated grant whose end is ahead grants). It models NO offline grace:
the app's 72-hour grace (`src/domain/access`) belongs to a DEVICE whose last trusted state was in
force and whose renewal verification is temporarily unavailable; a confirmed expiration or
revocation receives no extension anywhere. The function is SECURITY DEFINER, STABLE, EXECUTE
granted to `service_role` only. It was wired to nothing in 6.5A; since Phase 6.5B it is THE rule
behind `communications_is_entitled(business, at)` — the communication boundaries and the worker's
final pre-dispatch check (`COMMUNICATIONS.md` §46), behind a server-side switch that is disabled
by default. Since Phase 6.5C step 4 it is also THE rule behind
`business_mutation_is_entitled(business, at)` — the signed-in owner's own Business, AND enforcement
disabled or Plus access — which `sync_push_aggregate` asks under a second, independent server-side
switch, `BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT` (disabled by default; `CLOUD_SYNC.md` §26). The
rule is SECURITY DEFINER out of necessity (this function and the flag reader are executable by the
schema owner only) and is granted to `authenticated` alone. The per-row TS rule `isEntitledAt`
(`core/entitlement-snapshot.ts`) is the same predicate for one row and never decides access by
itself.

## 6. The webhook (`supabase/functions/revenuecat-webhook`)

```text
index.ts                    Deno entry: withSupabase({ auth: 'none' }) → configuration → handler
core/configuration.ts       the four secrets (§8), read by name, validated, never logged
core/webhook-auth.ts        constant-time Authorization check; RevenueCat HMAC signature
                            (X-RevenueCat-Webhook-Signature: t=<s>,v1=<hex>, HMAC-SHA256 over
                            `<t>.<raw body>`, 5-minute tolerance, several v1 for rotations)
core/revenuecat-event.ts    body validation → ONE normalized event; scrubs subscriber_attributes
core/project-event.ts       THE rule: event + the rows of its environment → outcome + row writes (§7)
core/mirror.ts              the port over the subscription_* RPCs (structural rpc client)
core/reconciliation.ts      GET /v1/subscribers/{id} → pure per-product mapping → per-row writes (§8)
core/handler.ts             the request pipeline and the answers
core/entitlement-snapshot.ts  the row model, isEntitledAt, THE product ids (= the app's), the
                              promotional product rule (`rc_promo_plus_<duration>`)
```

**Security guarantees**

- Authentication happens BEFORE the body is parsed: the exact `REVENUECAT_WEBHOOK_AUTHORIZATION`
  value (constant-time), then the HMAC signature when `REVENUECAT_WEBHOOK_SIGNING_SECRET` is set
  (raw bytes, timestamp tolerance, replay refused). A deployment without the Authorization value
  answers 500 and processes nothing. The minimum length of the shared value is 32 characters.
- RevenueCat cannot send a Supabase API key, so THIS function is deployed with JWT verification
  OFF (`--no-verify-jwt`) — the one deliberate exception to the worker's rule (§9). Nothing is
  reachable without the shared secret.
- The service role never leaves the server: the function receives the privileged client from the
  platform (`ctx.supabaseAdmin`), the mobile app holds the publishable key only.
- `REVENUECAT_ALLOWED_APP_IDS` (optional) records events of another RevenueCat app as `IGNORED`;
  events without `app_id` (promotional grants) pass. It is defence in depth, not the security
  boundary: the shared secret binds the webhook to one RevenueCat project, and the entitlement
  check plus the environment and store rules bound what any event can do. Set it at deployment.
- Bodies over 256 KB are refused (413); malformed bodies are refused (400) without being recorded.
- Logs and answers carry the event id, its type, the environment, the outcome, counts and
  configuration BOOLEANS — never an App User ID, a transaction, a price, a header or a secret.

**Reliability guarantees**

- Idempotent on the RevenueCat event id: a retried delivery is `DUPLICATE` (200) and changes
  nothing, reconciliation skipped.
- Atomic: history row and row writes are ONE transaction; a database failure answers 500 with
  no history row left behind, so RevenueCat's retry is processed in full.
- Concurrency-safe: each write names the `latest_event_id` of ITS row; a delivery that landed in
  between makes the guard raise `40001` → 500 → RevenueCat retries against the new rows.
- Ordered per product: an event older than its row's latest applied event is `STALE`; an
  EXPIRATION whose `expiration_at` is earlier than the row's known expiration is `STALE` (a later
  renewal or grant of the same product is known). An event about another product is never stale
  because of this one. Two events at the same instant apply in arrival order.
- A reconciliation failure never fails the delivery (the event is recorded already).

**Answers:** 200 recorded (any outcome) or DUPLICATE · 400 malformed · 401 unauthorized /
signature · 405 not POST · 413 too large · 500 mirror write failed (retried by RevenueCat).

## 7. Event semantics

Supported lifecycle events: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`,
`EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`, `SUBSCRIPTION_EXTENDED`, `NON_RENEWING_PURCHASE`;
plus `TRANSFER` and the dashboard `TEST`. Everything else (`SUBSCRIPTION_PAUSED`,
`REFUND_REVERSED`, `TEMPORARY_ENTITLEMENT_GRANT`, …) is recorded `UNSUPPORTED` and settled by
the reconciliation when configured.

Every event rewrites the row of ITS product, computed from the event's AUTHORITATIVE fields,
never from its name alone — with ONE exception, the promotional revocation:

| event | effect on the product's row |
|---|---|
| INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / SUBSCRIPTION_EXTENDED | `ACTIVE` (or `TRIAL` for `period_type TRIAL`), renewing, `entitled_until = expiration_at`; clears cancellation and billing trouble; RENEWAL clears the pending product |
| NON_RENEWING_PURCHASE (store) | `ACTIVE`, not renewing, until `expiration_at` |
| NON_RENEWING_PURCHASE (`store` / `period_type` PROMOTIONAL) | a **complimentary grant**: `COMPLIMENTARY`; without an expiration, **no end**; a further grant of the SAME product keeps the LATER end (no end wins) |
| CANCELLATION (store) | **not an expiration**: `CANCELLED_ACTIVE`, renewal off, access stays until the known expiration |
| CANCELLATION (PROMOTIONAL) | a **revocation**: RevenueCat "removes all active promotional grants for that entitlement immediately" and emits CANCELLATION — EVERY promotional row of the user in that environment is `EXPIRED` at the event instant; paid rows are untouched; a grant never mirrored gets an `EXPIRED` row |
| BILLING_ISSUE | **not a loss of entitlement**: `BILLING_RETRY`, access until the later of the expiration and `grace_period_expiration_at`; `EXPIRED` only if that end is already behind the event |
| PRODUCT_CHANGE | **may be future**: the current product, period and access stay; `pending_product_id` records the announced product; the renewal then lands on the new product's row |
| EXPIRATION | the confirmed end of THIS product: `EXPIRED`, `entitled_until = expiration_at` (the event instant when none); a dated grant reaching its end arrives this way too |
| TRANSFER | transferred-from users lose their mirrored STORE rows at once (`EXPIRED`); promotional grants belong to the account and stay; transferred-to users get NO invented row and are reconciled |

Rules that always hold: an access whose end is already behind the event instant reads `EXPIRED`
(nothing in force is written for a period that is over); a store purchase WITHOUT an expiration is
`IGNORED` (no evidence of an indefinite grant — only a promotional grant may have no end); a
product whose `entitlement_ids` does not contain `plus` is `IGNORED`; an event without
`environment` or without `product_id` is `IGNORED` (the mirror is per environment and per product).

**Sandbox vs production.** Rows are keyed by environment. A SANDBOX event (RevenueCat Test Store,
Apple Sandbox) can only write SANDBOX rows; PRODUCTION rows are never read for it, never its
subject. Effective access reads PRODUCTION rows of production stores only (§5): an active Sandbox
trial beside a production grant changes nothing, and a Test Store product grants nothing even if
its environment were mislabelled.

**Complimentary pilot access.** Granted individually in the RevenueCat dashboard or REST API
(entitlement `plus`, a preset duration or "until date", or lifetime). It arrives as a production
NON_RENEWING_PURCHASE with store and period `PROMOTIONAL` and `expiration_at_ms null` for
lifetime → its own `COMPLIMENTARY` row, no end. Several grants coexist as several rows (or one
row with the latest end for the same duration). Revocation ends them all at once (CANCELLATION,
above). No list of free accounts exists in the app or in the server code: the grant lives in
RevenueCat, the mirror reflects it, and a paid subscription bought meanwhile or kept afterwards
is never affected.

## 8. Reconciliation (RevenueCat REST API)

RevenueCat recommends fetching the subscriber's current state after any webhook rather than
deriving it event by event. When `REVENUECAT_SECRET_API_KEY` is configured, the function does so
after every recorded, non-duplicate delivery whose subject is known (the subject of a lifecycle
event, both sides of a TRANSFER): `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}`
(Bearer secret key), mapped purely (`mapSubscriberResponse`), **one source per product**:

- `subscriber.entitlements.plus` is RevenueCat's SUMMARY — one product, one expiration — and
  cannot enumerate concurrent sources, so the mapping does NOT rely on it. The sources are read
  from `subscriber.subscriptions`, keyed by product. A product is a Plus source when it is one of
  THE App Store products, a promotional product of the `plus` entitlement
  (`rc_promo_plus_<duration>` — the entitlement id inside the product id is its association; a
  promotional product of another entitlement is ignored), or the product the summary itself names
  (a Test Store product, a product added later). `non_subscriptions` are not read: BeautIzzy sells
  no such product.
- `is_sandbox` decides the environment of EACH product; lowercase vocabularies (`app_store`,
  `promotional`, `trial`) are upper-cased to the webhook's; an expiration behind `request_date` or a
  `refunded_at` reads `EXPIRED`; billing issue → `BILLING_RETRY` to the grace end; unsubscribe →
  `CANCELLED_ACTIVE`; `trial` → `TRIAL`; promotional → `COMPLIMENTARY` (no end without
  `expires_date`); else `ACTIVE`. A store subscription without expiration is skipped (no evidence).
- **Conservative policy.** Each described product replaces ITS row unless that row was confirmed
  LATER (`STALE`); the webhook facts the API lacks (original transaction, pending product, latest
  applied event) are kept. A row the answer does NOT describe is left exactly as it is: an absence
  — a product no longer listed, a summary naming another product, a malformed or failed answer —
  is never evidence that a source expired. Confirmed ends the answer DOES carry are applied.

Without the key, the mirror is webhook-only: correct for every supported event, blind to
unsupported ones and to the receiver of a transfer until the next event about them.

**Deliberate limitations.** The webhook's reconciliation runs AFTER a delivery only. Because an
absence is never applied, a source that RevenueCat silently dropped (no event, no listing) stays
mirrored until its own end passes — which is why every row has an end except a complimentary
lifetime grant, whose only ends are the revocation CANCELLATION and the reconciliation's
`EXPIRED` once RevenueCat lists it as expired. Since Phase 6.5C step 6 the SAME reconciliation
also runs without a webhook — the periodic sweep and the operator backfill of §13 — and reports
such an absence as `INVESTIGATE` instead of deciding it.

## 9. Deployment, secrets and configuration (manual, in this order)

Nothing below runs automatically. Production data is never touched by this phase: the migration
creates empty tables; the function writes only what RevenueCat sends after the webhook is
configured.

```text
1. Apply supabase/migrations/20261004120000_create_subscription_entitlements.sql BY HAND
   (SQL Editor). Additive; creates no row. Verify (supabase/README.md › Entitlement mirror).
2. RevenueCat › Project › Integrations › Webhooks › + New: URL
   https://<ref>.supabase.co/functions/v1/revenuecat-webhook
   Authorization header value = a long random value (≥ 32 chars; `Bearer <random>` recommended)
   Optionally enable signing and copy the signing secret (shown once).
   Send events for: the production app AND the Test Store app, or one webhook per app
   (the mirror separates environments; REVENUECAT_ALLOWED_APP_IDS can pin the app ids).
3. npx supabase secrets set REVENUECAT_WEBHOOK_AUTHORIZATION='<the exact header value>'
   npx supabase secrets set REVENUECAT_WEBHOOK_SIGNING_SECRET='<signing secret>'      (optional)
   npx supabase secrets set REVENUECAT_SECRET_API_KEY='<sk_… secret API key, v1 read>'  (optional, enables reconciliation)
   npx supabase secrets set REVENUECAT_ALLOWED_APP_IDS='<app id>,<test store app id>'  (recommended)
4. npx supabase functions deploy revenuecat-webhook --no-verify-jwt
   (RevenueCat cannot send a Supabase API key; the function authenticates the request itself.
    The communications-worker keeps verify_jwt ON — this flag is per function.)
5. RevenueCat › the webhook › "Send test event": the answer is 200 with outcome IGNORED
   ("dashboard test event") and ONE row in subscription_events. A 401 means the Authorization
   value differs; a 500 names the missing secret.
6. Sandbox check with a dedicated test account (Phase 6.4B bench): a Sandbox purchase yields an
   INITIAL_PURCHASE → a SANDBOX row for that product; PRODUCTION rows stay absent;
   select public.subscription_has_plus_access('<user id>') stays false.
```

The secret values must never exist in Expo env, the app bundle, SQLite, public database rows or
source control. The `.env.example` of the app documents none of them on purpose.

## 10. Existing accounts: reconciliation and backfill procedure

Installing the webhook is NOT retroactive: RevenueCat delivers events generated AFTER the
integration exists. Development and test accounts already hold purchase histories (Test Store,
Apple Sandbox), and pilot grants may predate the webhook. Until each is reconciled, its mirror is
simply ABSENT — which, with enforcement disabled, changes nothing for anyone, and which the
server-side readers treat as "not verified", never as "entitled".

Since Phase 6.5C step 6 the backfill is the `subscription-reconciliation` function (§13): a
DRY_RUN over the accounts to backfill, read by eye, then the same request in APPLY mode, batch by
batch, until the cursor is exhausted — then every `INVESTIGATE` settled by hand. The procedure
below is the 6.5A one, kept for an account the function reports `NO_SUBSCRIBER` for whose grant
must be (re)created, and as the manual fallback.

Safe procedure, to run against a NON-production project first (a Supabase branch or a second
project pointed at the same RevenueCat project), never against production as part of this phase:

```text
1. Apply the migration, deploy the function, configure the webhook and REVENUECAT_SECRET_API_KEY.
2. For each existing account to backfill (Supabase user id = RevenueCat App User ID):
   a. RevenueCat › Customers › <the id> › verify the current entitlement state by eye;
   b. trigger ONE delivery for that customer so the reconciliation runs:
      - either resend the customer's latest event from the webhook's event log (Integrations ›
        Webhooks › the webhook › recent events › Resend — RevenueCat recomputes the signature),
      - or, for a complimentary pilot, grant (or re-grant) the promotional entitlement from the
        customer page: the NON_RENEWING_PURCHASE it emits is applied AND reconciled;
   c. verify: select product_id, status, environment, entitled_until, source, verified_at
              from public.subscription_entitlements where user_id = '<id>' order by product_id;
              select public.subscription_has_plus_access('<id>');
3. Any event recorded UNMATCHED (select * from public.subscription_events where outcome =
   'UNMATCHED') names a subscriber whose App User ID is not a Supabase user (an anonymous
   RevenueCat id, a deleted account): decide by hand; nothing is invented.
4. Only once the procedure is validated there, repeat it on production, account by account.
```

The gaps of this manual procedure — a customer with NO event to resend and NO grant, a state that
changed while the webhook was not installed, a missed delivery — are exactly what §13 closes.

## 11. Tests

- `supabase/functions/revenuecat-webhook/core/__tests__/` (Jest, part of `npm run check`):
  authentication and signatures (RFC 4231 vector, replay, re-serialized body), configuration,
  body parsing (every refusal), the row model and the promotional product rule, the projection —
  purchases and renewals, trial activation and conversion, paid cancellation versus promotional
  revocation, billing issues with and without a grace, product change, expiration and
  reactivation, complimentary grants, and the coexistence scenarios: a lifetime grant surviving a
  paid subscription's expiration, a paid subscription surviving a grant's revocation, an expired
  Sandbox trial beside a production grant, grants of different durations, two grants of the same
  product, delayed and out-of-order deliveries per product, the superseded-period expiration, a
  transfer leaving the grant with the account — the handler end to end (401/400/413/405,
  idempotence, environment separation and production isolation, database failure → 500 with
  nothing recorded, concurrent guard, the three coexistence scenarios through the fake mirror's
  effective-access rule, reconciliation outcomes, privacy of answers and logs), the REST
  reconciliation (per-product mapping with concurrent sources, a summary naming one product only,
  products of another entitlement, refunds, the conservative absence rule, partial and failed
  answers), and the boundary guard (Deno imports, no app dependency, THE app's product ids, no
  hardcoded secret, the migration's unique key, access model and production-only helper,
  enforcement untouched).
- The migration is validated against an isolated in-process Postgres (PGlite) with the strict
  Supabase role stub over the full migration chain — `supabase/README.md` › Entitlement mirror
  lists the checks. Per project policy (`CLOUD_SYNC.md` §13) that harness lives outside the
  repository.
- Phase 6.5B (communication enforcement): `supabase/functions/communications-worker/core/__tests__/`
  (the worker gate, the adapter, `entitlement-boundary.test.ts`) and the 131-check PGlite harness of
  `20261005120000_add_communication_entitlement_enforcement.sql` — `COMMUNICATIONS.md` §46.
- Phase 6.5C step 6 (sweep and backfill): `supabase/functions/subscription-reconciliation/core/__tests__/`
  — the dedicated secret (missing, blank, the wrong kind of key), the hardened client (the exact
  request without `X-Platform`, 200 versus 201, `Retry-After`, doubling bounded backoff, the
  attempt bound, timeouts, 401/403 and other 4xx never retried, malformed bodies, message privacy,
  no global fetch), one account in every state (active, trial, cancelled inside its period,
  expired, renewed after an expiration, billing grace, dated and indefinite complimentary grants,
  Sandbox-only, Test Store, wrong product or entitlement, two concurrent sources), the
  non-evidence answers (missing subscriber with and without a source in force, no sources, the
  absence rule, a Sandbox absence, malformed, every failure class, mirror failures), ordering and
  races (confirmed later → STALE, an older EXPIRATION losing to the listed renewal, duplicate
  reconciliation → CONFIRMED), isolation (another account's rows, an alias to another account, an
  anonymous original id, ids matching nobody), DRY_RUN parity, the pass (the request contract and
  its refusals, single-user and batched backfill, partial failures, dry run, continuation, bounded
  requests and spacing, the rate-limit and unauthorized stops, a settle failure, a claim failure,
  the sweep's selection, the log line), the RPC bindings, and the boundary guard (Deno imports,
  the shared 6.5A core, the named secret key, the dedicated credential, the migration's shape:
  additive, sorting last, no schedule, no switch, THE rule reused, service_role-only grants, the
  app untouched, the webhook's file set unchanged, no network in the suites). The migration is
  validated by an 89-check PGlite harness (`supabase/README.md` › Subscription reconciliation);
  the 6.5A (84), 6.5B (144), step 4 (87) and step 5 (378) harnesses still pass with it appended.

## 13. Periodic reconciliation and operator backfill (Phase 6.5C, step 6)

`supabase/functions/subscription-reconciliation` and
`supabase/migrations/20261008120000_add_subscription_reconciliation.sql`. The webhook reconciles
an account AFTER a delivery about it; two gaps remain: an account whose history predates the
webhook (§10) and a delivery RevenueCat never made. Step 6 closes both with the SAME
reconciliation — the webhook's `mapSubscriberResponse`, the same merge of the webhook facts, the
same `subscription_apply_reconciliation` — run on a bounded batch of accounts WITHOUT a webhook,
either by an operator (the backfill) or by a scheduler an operator creates by hand (the sweep).
No second interpretation of a subscription exists: the step adds bookkeeping, not rules.

```text
operator (curl) or pg_cron job      POST /functions/v1/subscription-reconciliation
   apikey: the DEDICATED secret key `subscription_reconciliation` (verify_jwt ON; never 'none')
      ↓ body: what to reconcile, and whether to write (DRY_RUN by default)
subscription-reconciliation        ONE pass: claim a batch → for each account, in turn, one request
(Edge Function)                    apart: read the mirror, GET /v1/subscribers/{user id}, map, apply
                                   per product → settle → finish; answer the per-account report
      ↓ RPC (SECURITY DEFINER, service_role-only EXECUTE)
Postgres                           subscription_reconciliation_claim / _settle / _finish
                                   subscription_read_mirror, subscription_apply_reconciliation (6.5A)
                                   subscription_has_plus_access (THE rule, for the report)
                                   subscription_reconciliation_state   lease, last attempt, outcome, backoff
                                   subscription_reconciliation_runs    one row per pass: counts, report, cursor
```

### 13.1 The RevenueCat REST client (`core/revenuecat-api.ts`)

The v1 endpoint the webhook already reads, verified against the reference (`api-v1/customers`,
`api-v1/customer-info-model`): `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}`,
`Authorization: Bearer <secret key>`. Facts the client is built on:

- it **gets or creates**: 200 = the customer was found, **201 = it did not exist and was created,
  empty, by this read**. The client reports `created`, and the pass never reads a created customer
  as a verified absence of entitlement (`NO_SUBSCRIBER`, below). The v2 `GET
  /projects/{id}/customers/{id}` answers 404 instead, but needs a v2 key, a project id and a
  different data model (`gives_access`, `status`), i.e. a second mapping: not chosen;
- `X-Platform` is never sent: it would rewrite the customer's `last_seen` on an informational read;
- rate limits: v1 answers 429 (RevenueCat's guidance for v1: about one request per second, pause
  on 429; v2 documents `Retry-After` in seconds and `backoff_ms`). The client honours
  `Retry-After` when present (bounded to 10 s), doubles its own backoff otherwise (1 s, 2 s, …,
  10 s), and gives up after **3 attempts**; the pass spaces requests **1 s** apart;
- a request is aborted after **10 s** (`AbortController`) and counts as a timeout;
- failure classes: `unauthorized` (401/403, never retried, stops the pass), `rate_limited` (429
  after the bound, stops the pass), `unavailable` (5xx after the bound), `network`, `timeout`,
  `malformed` (a 2xx that is not JSON, never retried), `rejected` (another 4xx, never retried).
  Messages carry the class and the status only — never the body, never the key.

### 13.2 One account (`core/account-reconciliation.ts`)

The account's Supabase user id IS its App User ID (`subscription-source.ts`). The mirror is read
in both environments through `subscription_read_mirror` with the user id and every App User ID
the mirror already holds for it; the subscriber is fetched; the answer is mapped per product by
the webhook's rule (`is_sandbox` decides the environment of EACH product) and each described
product is applied through `subscription_apply_reconciliation` — which keeps a row confirmed
LATER (`STALE`). Outcomes, one per account, in the vocabulary of the state and run tables:

| outcome | meaning | written |
|---|---|---|
| `APPLIED` | at least one row changed (state, end, store, renewal…) | the described rows |
| `CONFIRMED` | the answer agreed with the mirror: rows re-verified only | the described rows (`verified_at`) |
| `STALE` | every described row had been confirmed later (a webhook landed in between) | nothing |
| `NO_SUBSCRIBER` | RevenueCat had never seen the account (201) and the mirror holds no source in force | nothing |
| `NO_SOURCES` | the customer exists, grants nothing, and the mirror holds no source in force | nothing |
| `INVESTIGATE` | the answer disagrees with a mirrored source IN FORCE: it does not list it; it lists no customer or no source beside it; or the subscriber's `original_app_user_id` is ANOTHER Supabase account (an alias or a transfer that merged two accounts) | the described rows only; the rest untouched |
| `FAILED` | RevenueCat unreachable, rate limited, unauthorized, a malformed answer, a database error | nothing |

Rules that hold in every case: an absence is never an expiration (the 6.5A policy — a source
RevenueCat no longer lists is reported, never ended); a failed read is never a lost entitlement;
nothing is invented for an account without a RevenueCat history; an indefinite complimentary
grant keeps no end; Sandbox and Test Store products land in `SANDBOX` rows (or keep their
non-production store) and never grant; `subscription_has_plus_access` is asked, not re-implemented,
for the `accessBefore` / `accessAfter` of the report. **DRY_RUN** performs the same reads, the same
request and the same mapping, decides `would-apply` / `would-confirm` / `would-be-stale` per
product with the same "confirmed later" comparison, and writes nothing — a preview that is exactly
the apply.

### 13.3 The pass, the request, the bookkeeping (`core/run.ts`, the migration)

```jsonc
{}                                                      // dry-run SWEEP of every mirrored account
{ "kind": "SWEEP", "mode": "APPLY", "limit": 20, "minAgeSeconds": 72000 }   // the scheduled sweep
{ "users": ["<uuid>"] }                                 // dry-run backfill of ONE account
{ "users": ["<uuid>", "…"], "mode": "APPLY" }           // backfill of an explicit list (≤ 50)
{ "source": "businesses", "kind": "BACKFILL", "mode": "APPLY", "limit": 25, "after": "<uuid>" }
```

- everything defaults to the safe side: no body is a DRY_RUN; writing takes `"mode": "APPLY"`;
  an unknown key is refused (400) rather than ignored, so a misspelt `mode` never silently
  dry-runs — or writes; `limit` is 1..50 (20 by default), bounded again in the database;
- scopes: an explicit `users` list (unknown or malformed ids are reported in `unknownUsers`, never
  invented; the failure backoff is ignored — the operator asked for THESE accounts now), every user
  with a mirrored row (`source: "mirrored"`, the sweep's), every Business owner
  (`source: "businesses"`, the full backfill — it reaches accounts RevenueCat may never have seen,
  which the v1 read then creates empty: expect `NO_SUBSCRIBER` for them);
- `subscription_reconciliation_claim` opens the run row, skips the accounts another pass holds
  (`lease_until`), the accounts RevenueCat answered for less than `minAgeSeconds` ago and the
  accounts in failure backoff, orders a SWEEP by least recently attempted (rotation) and a
  BACKFILL by user id (with `after`, the continuation cursor the answer carries while accounts
  remain), and — in APPLY mode only — leases the batch for 5 minutes. A DRY_RUN leases nothing and
  writes no account state;
- accounts are processed one after the other, one request apart; each is settled at once
  (`subscription_reconciliation_settle`: counts, requests and a bounded report on the run; the
  lease released, the failure count and backoff — 15 min × 2^(failures − 1), at most 24 h — on the
  state row in APPLY mode), so a crash loses nothing already recorded;
- two failures stop the pass on purpose: an `unauthorized` key (every further request would fail
  the same way) and a `rate_limited` that survived the retries (the pass yields; the next
  invocation resumes). `subscription_reconciliation_finish` closes the run (`COMPLETED`,
  `STOPPED`, `FAILED`) and releases every lease it still holds; a run left `RUNNING` by a crash is
  closed as `ABANDONED` by the next claim after one hour, its leases having expired by time;
- the answer is the pass summary: status, `stoppedBy`, counts per outcome, requests, the
  per-account reports (user id, outcome, detail, access before / after, per-product before →
  after with its result, the unlisted sources in force), `unknownUsers`, `skipped`, `eligible`,
  `nextCursor`. The log line carries counts and vocabularies only.

Bounds, by construction: at most 50 accounts × 3 attempts per invocation, one request at a time,
1 s apart; a SWEEP with `minAgeSeconds` reconciles each account at most once per that interval.

**Ordering safety with the webhook.** Both paths write through `subscription_apply_reconciliation`
and the webhook's own guarded apply; the row's `verified_at` decides: an answer older than the
row's last confirmation is `STALE`, a webhook event older than the reconciliation's `request_date`
is `STALE` for the webhook. A sweep can therefore never roll back a newer event, and a webhook can
never be overwritten by an older API answer. Nothing in the append-only `subscription_events`
history is touched by this step.

### 13.4 Authentication and secrets

- The function is reachable through ONE dedicated server-side secret key, named
  `subscription_reconciliation` (`withSupabase({ auth: 'secret:subscription_reconciliation' })`,
  `verify_jwt` ON — never `--no-verify-jwt`): publishable keys, user JWTs, the worker's key and
  unauthenticated calls are refused before the handler runs. There is no public endpoint.
- The RevenueCat credential is `REVENUECAT_RECONCILIATION_API_KEY`: a RevenueCat **secret** API key
  (`sk_…`, v1, read) DEDICATED to this function — never the public SDK key, never the webhook's
  shared Authorization value, and a separate key from the webhook's own `REVENUECAT_SECRET_API_KEY`
  so each can be rotated or revoked alone. Read by name through an injected reader in one file
  (`core/configuration.ts`); a missing or malformed value answers 500 and claims nothing; it exists
  in Edge Function secrets only and appears in no message, answer or log.
- The database surface is SECURITY DEFINER functions with `search_path = ''`, EXECUTE granted to
  `service_role` only; the two bookkeeping tables have RLS on, zero policies and zero grants — not
  even the server role reads them directly. An operator reads them in the SQL Editor as the owner.

### 13.5 What this step does NOT do

Nothing is scheduled: no migration names `cron.schedule`, and the sweep stays unscheduled until
an operator creates the pg_cron job by hand (`supabase/README.md` › Subscription reconciliation).
Nothing is deployed or applied; no secret is set; no real RevenueCat call is made by the test
suites. Neither switch moves; `SUBSCRIPTION_ENFORCEMENT` stays `disabled`; `PURCHASABLE_STORES`
stays `['test-store']`; the 72-hour offline policy is untouched; the mobile app changes nothing.
The `businesses` scope may create empty RevenueCat customers for accounts that never ran a 6.1+
build (the v1 read's documented side effect): run the backfill on Staging first, with explicit
user lists in production where that matters.
