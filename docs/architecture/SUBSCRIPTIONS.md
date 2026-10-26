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
                                                     future — step 5: the row-level policies, Storage
                                                             and the preference RPCs reusing the rule;
                                                             the app reading the mirror; the scheduled
                                                             re-verification and the backfill tool
```

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

**Deliberate limitations.** The reconciliation runs AFTER a webhook only; there is no scheduled
sweep and no operator endpoint yet. Because an absence is never applied, a source that RevenueCat
silently dropped (no event, no listing) stays mirrored until its own end passes — which is why
every row has an end except a complimentary lifetime grant, whose only ends are the revocation
CANCELLATION and the reconciliation's `EXPIRED` once RevenueCat lists it as expired. A sweep and
the operator backfill tool belong to 6.5B, together with the first server-side reader.

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
future server-side reader must treat as "not verified", never as "entitled".

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

Known gaps the procedure cannot close by itself: a customer with NO event to resend and NO grant
(only the REST reconciliation reaches them, which 6.5A triggers after a webhook only); a customer
whose latest state changed while the webhook was not yet installed is reconciled correctly as soon
as ANY later event about them is delivered.

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
