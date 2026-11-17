# BeautIzzy — Online booking

Status: **Sprint 3C-B — public booking flow, development / Staging only** (on top of Sprint 3C-A —
secure booking creation —, Sprint 3B — read-only availability engine —, Sprint 3A — weekly working
hours — and Sprint 2 — public profile and booking settings). A customer can book ONE service on
`/r/<slug>/reserver` without an account (§10); the website reaches the engine through two
server-side endpoints protected by request limits counted in the database. The flow is open only
where `ONLINE_BOOKING_WEB_BOOKING=enabled` and never on the production website; creation stays
closed by its own operator switch (`ONLINE_BOOKING_CREATION`). No confirmation email exists.

Migration state:

| Migration | Staging | Production |
| --- | --- | --- |
| `20261015120000` … `20261018120000` (Sprints 2 – 3C-A) | applied | not applied |
| `20261019120000_create_online_booking_request_limits.sql` (Sprint 3C-B) | applied | not applied |
| `20261020120000_add_online_booking_location_privacy.sql` (§11) | **NOT applied** — prepared in the repository | **NOT applied** |

Production states as recorded in `supabase/README.md`. The location privacy migration waits for
its coordinated rollout (§11.7): once applied, the public read returns a location only as the
professional's explicit publication level allows, and never the legacy free-text address.

## 1. Shape

```text
Expo app (professional)                 Supabase                          web/ (public)
Plus › Réservation en ligne  ──RPC──▶  business_booking_profiles  ◀──RPC──  /r/<slug>  (server-only)
        images ──Storage──▶  business-public-media (public bucket) ──public URL──▶ <img>
Plus › Horaires              ──RPC──▶  business_working_hours        (nothing reads it publicly)
                     appointments, calendar blocks, services (synced) ─┐
                     business_bookable_services (opt-in)              ├▶ availability ◀──RPC── /r/<slug>/reserver
                                                                       ┘   (read-only)          (preview only)
   appointments + items + phases, clients  ◀── booking creation (§9) ◀──RPC── /api/booking/<slug> (§10)
        │  normal pull                          online_bookings (record + idempotency)     ▲ request limits:
        │                                       online_booking_request_counters ◀──RPC─────┘ (opaque HMAC keys)
        ▼
   Expo app: the booking appears in the Agenda like any synchronized appointment
```

- One row per Business in `public.business_booking_profiles`
  (`supabase/migrations/20261015120000_create_online_booking_profiles.sql`).
- **Outside the offline sync**: not an aggregate, no SQLite table, no outbox entry, no sync RPC.
  The settings screen needs connectivity; a failed call changes nothing and nothing is queued.
- The Business name is not copied: `public_name` is an optional override of `businesses.name`.
- `time_zone` is stored (`Europe/Paris` by default) and has no editing surface yet.

## 2. Security model

| Caller | Access |
| --- | --- |
| `anon` | nothing — no grant on any object of the feature |
| owner (`authenticated`) | `online_booking_read_profile`, `online_booking_update_profile`, `online_booking_set_state`, `online_booking_read_working_hours`, `online_booking_save_working_day`, `online_booking_read_conflicts` (§9.5), `online_booking_update_location` (§11, once its migration is applied); Storage select/insert/delete inside her own media folder |
| website (`service_role`, secret key, server-only) | `online_booking_public_profile(slug)`, `online_booking_public_availability(slug, service, date)` (§8), `online_booking_create_booking(…)` (§9) and `online_booking_take_request_quota(counters)` (§10) only |
| operator (SQL Editor) | `online_booking_set_publication_enabled(boolean)`; `online_booking_set_creation_enabled(boolean)` (§9); `online_booking_working_intervals(…)` (§7.4); the internal availability and booking functions and the `business_bookable_services` opt-ins (§8) |

- The table has RLS enabled, **no policy and no grant**: every access goes through a
  `SECURITY DEFINER` function with `search_path = ''`, revoked from `public`, `anon`,
  `authenticated` and `service_role`, then granted to exactly one role.
- Every owner RPC starts with `is_business_owner(p_business_id)` (42501 otherwise).
- The public read returns ten fields — `slug`, `name`, `description`, `phone`, `email`, `address`,
  `logo_path`, `cover_path`, `time_zone`, `booking_enabled` — and `NULL` for an unknown, malformed,
  draft, unpublished or offline slug alike. Never a Business id, an owner, a subscription fact, a
  client, an appointment or an amount. Once `20261020120000` is applied it returns eleven: the
  `location` the professional's publication level allows, and `address` only as the complete
  address of a `FULL_ADDRESS` page — never the legacy free text (§11).
- Public image paths start with `media_id`, a random identifier that exists only for that purpose.
  The private `business-media` bucket (Client and Product photos) is untouched and stays private.
- Bucket `business-public-media`: public, JPEG only, 2 MB. Path
  `<media_id>/<logo|cover>/<uuid>.jpg`, enforced by the Storage policies AND by the profile row.
  No update policy: an image is never overwritten, a replacement is a new object.
- The website never exposes the secret key: `web/src/lib/env/server.ts` imports `server-only`.
  The browser never calls Supabase.

## 3. Draft, publication and BeautIzzy Plus

| Action | Requirement |
| --- | --- |
| edit the draft, upload images | ownership only |
| publish, open bookings | ownership AND `ONLINE_BOOKING_PUBLICATION` enabled AND `subscription_has_plus_access(owner)` |
| unpublish, pause bookings | ownership only |
| be served to the website | published AND the same two conditions **at read time** |

- The rule is `online_booking_may_be_public`. It calls THE existing access rule
  (`docs/architecture/SUBSCRIPTIONS.md` §5): trials and complimentary `PROMOTIONAL` grants count,
  Sandbox and Test Store never do.
- It deliberately does not use `business_mutation_is_entitled`, which answers TRUE while its
  enforcement switch is off. Neither existing enforcement switch is read or changed.
- A lapsed subscription takes the page offline without rewriting a row; the profile, and every
  appointment, stay available to the professional. The page returns when access does.
- The mobile app never decides: its own subscription state is not consulted, and a refusal
  (`PUBLICATION_UNAVAILABLE`, `ENTITLEMENT_REQUIRED`, `INCOMPLETE_PROFILE`) leaves the stored
  state as it is.
- `booking_enabled` decides what the public page offers: « Prendre rendez-vous » where the booking
  flow is open (§10), « arrive bientôt » elsewhere, « en pause » when it is off.

## 4. Activation prerequisites (per environment, Staging first)

Publication stays closed until ALL of these hold:

1. The migration is applied by hand (`supabase/README.md` › Online booking profiles).
2. The entitlement mirror is deployed and populated for the accounts that must publish: a
   `subscription_entitlements` row that `subscription_has_plus_access` accepts
   (`environment = 'PRODUCTION'`, a production store or `PROMOTIONAL`, not expired). On Staging,
   Sandbox and Test Store purchases do NOT qualify: use a RevenueCat promotional grant mirrored
   by the webhook or the reconciliation.
3. The Staging validation of §5 passes with the switch still OFF (draft editing, refusals).
4. An operator enables the switch: `select public.online_booking_set_publication_enabled(true);`
   and reads the returned counts.
5. The website is configured (`web/.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
6. The mobile build knows the public origin (`EXPO_PUBLIC_WEB_URL`); without it the app shows the
   path of the page only and offers no link.
   Only `https://beautizzy.fr` is presented as a link to share (« Lien public »); a remote test
   origin is labelled « Lien de test », the developer's own computer « Lien de test local ».
   « Copier le lien » exists only for the stored address of a page that is online.

   ONE resolver decides the origin of « Voir ma page », the address shown and « Copier le lien »
   (`src/features/online-booking/public-page-url.ts`). In a development build, an origin naming
   « this machine » (`localhost`, `127.0.0.1`, `10.0.2.2`) is re-targeted for the runtime:

   | Runtime | `EXPO_PUBLIC_WEB_URL=http://localhost:3000` opens |
   | --- | --- |
   | iOS Simulator | `http://localhost:3000` |
   | standard Android Emulator | `http://10.0.2.2:3000` |
   | physical device | `EXPO_PUBLIC_WEB_DEVICE_URL` (e.g. `http://192.168.1.20:3000`); without it, no link and a notice — `10.0.2.2` is never assumed |

   A private-network origin (`192.168.x.x`, `10.x`, `172.16–31.x`, `*.local`) is used as
   configured. A release build never shows a local origin (it reads as not configured) and never
   reads `EXPO_PUBLIC_WEB_DEVICE_URL`; production and remote test origins are identical on every
   runtime. The web dev server accepts the emulator's live-reload socket from `10.0.2.2`
   (`allowedDevOrigins`, `web/next.config.ts`, development only).

Closing again is one statement (`…_enabled(false)`): every page goes offline, nothing is rewritten.

## 5. Tests

- Mobile (Jest): `src/domain/online-booking`, `src/features/online-booking` (the working hours
  screen included), `src/infrastructure/supabase/__tests__/online-booking-*.test.ts` (gateway,
  images, the two source-level migration guards).
- Web (Vitest, `web/`): slug, answer parsing, the server lookups (profile and availability), the
  preview switch, page rendering and 404, the availability preview (slots, empty, unknown service,
  out of window, loading, error, inactive).
- SQL behavior: an in-process Postgres harness outside the repository (like the other migrations) —
  ownership, slug uniqueness, field separation, publication gating, lapse, Storage policies,
  backward compatibility; for Sprint 3A, ownership, day validation, overlaps, closed days,
  persistence, the CHECK against any writer, DST resolution, session-time-zone independence,
  cascade and backward compatibility (no existing object or row changed; the Sprint 2 harness
  still passes with Sprint 3A applied); for Sprint 3B, every rule of §8.2 on a populated world
  with deterministic clocks — normal day, closed day, break, exact end fit, crossing a break,
  overlapping appointments, CANCELLED / NO_SHOW / deleted, COMPLETED / IN_PROGRESS, another staff
  member, an overnight appointment, calendar blocks, durations, notice, horizon, past, empty,
  midnight, year change, both Paris DST Sundays, session time zones, the Business time zone —
  plus the gating, the grants, malformed input, isolation between Businesses, the absence of
  private fields, the revalidation function and backward compatibility (the Sprint 2 and 3A
  harnesses still pass with Sprint 3B applied); for Sprint 3C-A, see §9.8 — the behavior runs
  against a REAL PostgreSQL, because locking and concurrent snapshots cannot be shown in-process.

## 6. Not implemented

Confirmation emails and SMS (§10.6), holding a slot, the public booking flow on the production
website, a challenge (CAPTCHA) in front of it, prices on the public pages (§10.5),
customer accounts, deposits, Stripe, notifications to the professional, a surface in the app for
overlaps (§9.5) and for telling an online booking apart, customer cancellation or rescheduling,
booking requests awaiting approval, slug history or redirects, a time-zone editor, search
indexing of public pages, server-side cleanup of unreferenced images; for working hours: per-staff
hours, exceptional days and time off, overnight intervals, showing the hours on the public page,
and any effect on the Agenda; for availability: the professional's editor of bookable services
and of the booking rules, parallel booking during processing time, multi-staff availability,
booking several services at once; for the location (§11): the app's location settings, the
website's reading of `location` (city-only rendering included), maps, directions links,
coordinates, and the location in confirmations, emails or calendar exports.

## 7. Weekly working hours (Sprint 3A)

`supabase/migrations/20261016120000_create_online_booking_working_hours.sql`, edited in
Plus › Horaires (`src/features/online-booking/working-hours/`). Domain rules:
`src/domain/online-booking/working-hours.ts`.

### 7.1 Model

```text
business_working_hours        one row per (Business, ISO weekday); a missing row reads as closed
├── business_id               → businesses, ON DELETE CASCADE
├── weekday                   1 = Monday … 7 = Sunday (ISO 8601, `extract(isodow …)`)
├── is_open
└── intervals                 jsonb [{ "start_minute": 540, "end_minute": 720 }, …], ascending
```

- An open day has one to four intervals; a closed day has none. A **break** is the gap between two
  intervals — there is no break entity.
- Minutes are whole minutes after LOCAL midnight, `0 ≤ start < end ≤ 1440`; ends are exclusive, so
  adjacent intervals (`09:00–12:00`, `12:00–14:00`) are allowed, overlapping ones never are.
- ONE validation rule, `online_booking_working_day_issue(is_open, intervals)`, backs the table's
  CHECK constraint (a stored day can never be invalid, whoever writes it) and the save RPC (which
  answers the broken rule: `INTERVAL_REQUIRED`, `CLOSED_DAY_INTERVALS`, `TOO_MANY_INTERVALS`,
  `INVALID_INTERVAL`, `OVERLAP`, `INVALID_DAY`). The app's `validateWorkingDay` applies the same
  rules first, so a refusal is a defensive fallback.
- Keyed by Business, not by staff member: one professional per Business today (`CLAUDE.md` §18).
  Per-staff hours would be a later, separate structure.

### 7.2 Ownership, sync and scheduling

- Owner RPCs: `online_booking_read_working_hours(business)` (the week, Monday first, with its time
  zone) and `online_booking_save_working_day(business, weekday, is_open, intervals)` (replaces ONE
  day, answers the week). Both check `is_business_owner` first (42501) and need no subscription.
  Both make sure the booking profile row exists, because it carries the time zone — the same
  empty, unpublished draft the first read of Réservation en ligne creates.
- Table: RLS enabled, no policy, no grant to any API role. `anon` and the website receive nothing:
  `online_booking_public_profile` is unchanged and exposes no hour.
- Outside the offline sync: not an aggregate, no SQLite table, no outbox entry. The screen needs
  connectivity; a failed save keeps the day sheet and its edits open with the reason, writes
  nothing and is never retried automatically.
- Working hours never constrain manual scheduling: Appointments, phases, Calendar Blocks, the
  Agenda and the sync never read them, and nothing in the migration reads those.

### 7.3 Time zone and daylight saving

- The time zone of a Business is `business_booking_profiles.time_zone` (Sprint 2, `Europe/Paris`
  for every Business today, no editing surface). Working hours store **wall-clock** minutes in it —
  never an instant, never a UTC offset — so they mean the same local hours all year.
- A concrete date is resolved by ONE rule, only when asked:
  `(local date + minutes) AT TIME ZONE <time zone>`. The weekday is the ISO weekday of the LOCAL
  civil date. The result does not depend on the session time zone of the caller.
- Across a DST change, 09:00 stays 09:00 local; only its UTC offset moves (Paris: 08:00Z in winter,
  07:00Z in summer).
- On the change day itself an interval lasts what the wall clock says: 01:00–04:00 is 2 hours on
  the spring-forward Sunday and 4 hours on the fall-back Sunday.
- A wall-clock time inside the skipped hour, or inside the repeated hour, is read as **standard
  time** (PostgreSQL's rule): 02:30 on 29 March 2026 → 01:30Z (03:30 CEST); 02:30 on 25 October
  2026 → 01:30Z (the second, CET, occurrence). Deterministic, and irrelevant to normal working
  hours.
- The app never converts these minutes through a `Date`: it formats them as they are
  (« 09:00 – 12:00 ») and says which clock they follow (« Horaires à l’heure de Paris. »).

### 7.4 The availability-engine contract (read-only)

`online_booking_working_intervals(p_business_id, p_from date, p_to date)` returns
`(local_date, starts_at timestamptz, ends_at timestamptz)`, one row per working interval between
two local dates (inclusive, at most 92), chronological, resolved by §7.3.

- Working time only — never a bookable slot: appointments, staff-required phases, Calendar Blocks,
  lead time and horizon belong to the future engine.
- It asks nothing about publication or subscription: its caller decides.
- No EXECUTE grant: only a SECURITY DEFINER function owned by the table owner (the future engine)
  or the SQL Editor can call it. Sprint 3B consumes it from `online_booking_compute_slots` (§8),
  without granting it to anyone.

## 8. Availability engine (Sprint 3B) — read-only

`supabase/migrations/20261017120000_create_online_booking_availability.sql`. It computes the start
times that COULD be offered; it never writes an appointment and never holds a slot.

### 8.1 What the engine reads — findings of the inspection (November 2026)

| Concern | Where it lives | What the engine relies on |
| --- | --- | --- |
| Publication | `business_booking_profiles` (Sprint 2) | `published`, `booking_enabled`, `time_zone`; THE rule `online_booking_may_be_public` (operator switch + `subscription_has_plus_access`) |
| Working hours | `business_working_hours` (Sprint 3A) | `online_booking_working_intervals(business, date, date)` — wall-clock minutes resolved in the Business time zone, DST-safe, zero grants (kept) |
| Services | synced `services` + `service_phases` | `active`, `deleted_at` (sync tombstone), ordered phases with `duration_minutes` ≥ 0 and `requires_staff`; a service's duration is the sum of its phases (`calculateAppointmentTimeline`) |
| Online bookability | **did not exist** — `SERVICES.md` §12 is design only | new opt-in table `business_bookable_services` (§8.3) |
| Appointments | synced `appointments` + `appointment_items` + `appointment_phases` | `start_at`, `status`, `deleted_at`; end = `start_at` + Σ every phase of every item (items and phases are strictly sequential) |
| Blocking statuses | `doesAppointmentOccupySchedule` (`src/domain/appointments/occupancy.ts`) | every status except `CANCELLED` and `NO_SHOW` occupies the schedule (`SCHEDULED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`); no new status |
| Calendar blocks | synced `calendar_blocks` | `[start_at, end_at)`, `deleted_at` |
| Staff | `staff_member_id` text on appointments and blocks; ONE placeholder in the app (`current-staff-member.ts`), no staff table | one professional per Business: every appointment and block of the Business occupies her, whatever the id |
| Concurrency of the sync | per-row `FOR UPDATE` + `sync_version` inside `sync_push_aggregate`; no Business-wide lock | nothing changed; see §8.7 |
| Website access | `web/src/lib/env/server.ts` (`server-only`), RPC over PostgREST with the secret key | a second narrowly scoped `service_role` function |

No approved slot rule existed (`APPOINTMENTS.md` §21 lists future inputs only), so the sprint's
defaults apply.

### 8.2 Rules

THE default rules live in ONE function, `online_booking_rules()`:

| Rule | Value |
| --- | --- |
| start grid | every 15 minutes of LOCAL wall-clock time (09:00, 09:15 …) |
| minimum notice | 24 hours: a start is offered only if `start ≥ now + 24 h` |
| horizon | the last bookable local date is today + 30 days (business time zone) |
| service length | 1 to 720 minutes (sum of its catalog phases) |

The window is `[local date of (now + notice), local today + 30]`. A slot is offered only when:

1. the page is published, accepts bookings (`booking_enabled`) and passes THE publication rule;
2. the service is opted in, active, not deleted, and lasts 1–720 minutes;
3. the local date is inside the window, and the start is at least the notice after now;
4. the WHOLE service `[start, start + duration)` fits inside ONE working interval of that date —
   so it never crosses a break, a closed day or midnight;
5. it intersects no busy interval: an appointment occupies its **full span** (processing phases
   included — conservative MVP, no parallel booking), unless `CANCELLED`, `NO_SHOW` or deleted;
   an appointment of length 0 occupies nothing; a calendar block occupies `[start_at, end_at)`.

Ends are exclusive everywhere: a slot may end exactly when an appointment, a block or a working
interval starts or ends.

### 8.3 Bookable services — a deliberate deviation from `SERVICES.md` §12

`SERVICES.md` §12 designs online visibility as a synced `services.online_visibility` column. That
requires a SERVICE sync change, which Sprint 3B excludes. The opt-in therefore lives server-side,
like the profile and the hours: `business_bookable_services (business_id, service_id)`, FK to the
synced service (cascade), absent = not bookable. There is no writer yet besides the operator's SQL
Editor; the professional's editor (and the final representation) is a decision for a later sprint.

### 8.4 Time

- Candidates are LOCAL minutes of the date, turned into instants by THE Sprint 3A rule
  `(date + minutes) AT TIME ZONE tz` — never the session or the server time zone.
- Spring forward: a candidate that does not come back as the same wall-clock time does not exist
  and is never offered (29 March 2026: 02:00–02:45 are skipped; 01:45 and 03:00 are offered).
- Fall back: a wall-clock time that exists twice is offered ONCE, as its standard-time occurrence
  (25 October 2026: « 02:00 » is 01:00Z, never also 00:00Z). No duplicate start, no duplicate label.
- Durations are real minutes: on a DST Sunday a working interval has its real length (§7.3).
- The answer carries UTC instants (`…Z`) for a future booking and the local label (« 09:15 ») for
  display: web and mobile show the same wall-clock time without any time-zone arithmetic.

### 8.5 Security

- ONE public entry point, `online_booking_public_availability(p_slug, p_service_id, p_date)`,
  `service_role` only, keyed by the public slug: no Business id and no staff id is accepted. It
  answers `NULL` — the same `NULL` — for an unknown or malformed slug, a draft, a page that does
  not accept bookings, a lapsed subscription and any slug while the operator switch is off.
- Every other function and the new table have no grant at all; `anon` and `authenticated` reach
  nothing. `online_booking_working_intervals` keeps its zero-grant boundary.
- The answer names services (id, name, duration), the window and start times — never a Business
  id, a client, an appointment, a note, a price or a staff member. A private, inactive, deleted or
  foreign service gets the same `UNKNOWN_SERVICE`.
- Bounds: one service, one local date per call; at most 96 candidates; every input validated (the
  web validates the slug, the service id and the date before calling). Appointments are read
  through the `(business_id, start_at)` index up to the end of the day, with NO lower bound since
  Sprint 3C-A (§9.6): Sprint 3B started 7 days before the day and silently ignored a longer one.

### 8.6 Web — a read-only preview, development and Staging only

- `/r/<slug>/reserver` keeps the « pas encore disponible » notice everywhere by default.
- With `ONLINE_BOOKING_AVAILABILITY_PREVIEW=enabled` (server-only variable) — and never when
  `NEXT_PUBLIC_SITE_URL` is the production website — it shows « Aperçu »: the bookable services,
  the dates of the window and the start times of the chosen day as plain labels, with an empty
  state, a loading state (Suspense keyed by the selection) and an error state. No form, no button
  that books, no customer field; the page says a displayed time is never reserved.
- The profile lookup completes before anything streams, so an unknown address still answers a
  real HTTP 404.
- No rate limiting exists at the edge: the endpoint is bounded per request and, in production,
  not exposed at all. A public booking page must add rate limiting (or a challenge) first.

### 8.7 What the server cannot see — and the booking-creation contract

- An appointment created on a device and not synchronized yet is invisible to the server. A
  displayed slot is therefore never a guarantee, and the website never says it is.
- Booking creation (§9, Sprint 3C-A) does exactly that, in ONE transaction: it locks the Business
  (`select … from business_booking_profiles where business_id = $1 for update`), calls
  `online_booking_slot_is_available(business, service, starts_at, now)` (the SAME rule as the
  displayed slots), then creates the appointment. The professional's own sync push does not take
  that lock: an overlap with a not-yet-synchronized appointment stays possible, which manual
  scheduling already allows (`CLAUDE.md` §16); it is derived and reported, never silent (§9.5).
- `online_booking_compute_slots(business, service, date, now)` takes `now` explicitly: deterministic
  and testable; the public entry point passes `now()`.

## 9. Booking creation (Sprint 3C-A) — backend only

`supabase/migrations/20261018120000_create_online_booking_creation.sql`. ONE server-side function
turns a customer's request into a real Appointment. The website calls it from ONE server-only
module since Sprint 3C-B (§10); the operator switch `ONLINE_BOOKING_CREATION` ships disabled.

### 9.1 What the inspection established (November 2026)

| Concern | Finding | Consequence |
| --- | --- | --- |
| Appointment model | `appointments` + `appointment_items` + `appointment_phases`, snapshots without FK to the catalog; no origin / source field | the booking writes THE canonical rows; the note « Réservation en ligne » is the only marker |
| How a device creates one | UUID v4 id, `SCHEDULED`, items `<appointment>-item-<order>`, phases under the CATALOG phase ids with `position` = index, no note, discount and reminder flag NULL (`build-appointment.ts`, `snapshot.ts`) | the server writes the same shapes |
| `CONFIRMED` | listed, never created by any V1 flow, no documented meaning | an online booking is `SCHEDULED` |
| Staff | ONE placeholder, `'staff-amelie'` (`current-staff-member.ts`); the Agenda does not filter on it, the Calendar Block rule does | ONE server constant, pinned to the app's by a test |
| Client model | only `first_name` required; phone and email stored as typed (trimmed), never normalized; no duplicate rule outside the import, where the email is the strong identifier | §9.3 |
| Pull | whole answer validated first — ONE refused row fails the whole pull (`remote-snapshot.ts`); `first_name` must be non-blank after JavaScript `trim()`; a live Appointment whose Client is not held is not applied and HOLDS the cursor; a restore refuses a dataset where a live Appointment names a deleted Client | strict text validation (§9.3); the Client invariant kept server-side (§9.4) |
| Pull cursor | `updated_at` = START of the writing transaction; the device re-reads 5 minutes before its cursor | the booking transaction must stay short: its lock wait is bounded to 3 seconds |
| Push | `sync_push_aggregate`, SECURITY INVOKER, per-row `FOR UPDATE` + `sync_version`; no Business-wide lock; a CLIENT `DELETE` is not guarded server-side (the device guards it) | not replaced; §9.4 |
| Conflicts | `CONFLICT` keeps the entry pending forever, nothing resolves it (V1E not built) and nothing shows it to the professional | the server must never create one: a matched Client is never touched |
| Reminders | AFTER triggers on `appointments` (SECURITY DEFINER, no `auth.uid()`), under the owner's own preference | an online appointment gets the existing H-24 email like any other; nothing new is sent |

### 9.2 The booking transaction

`online_booking_create_booking(slug, service_id, starts_at, first_name, last_name, email, phone,
idempotency_key)` → `online_booking_book(…, now)`. All or nothing:

1. the switch is ON, the request is well-formed (§9.3), the slug names a profile;
2. the Business is LOCKED: its `business_booking_profiles` row, `FOR UPDATE`, waiting at most
   3 seconds — `BUSY`, nothing written, retry with the same key. The slug and the time zone are
   read from the locked row, not before the wait: a slug renamed or handed to another Business
   meanwhile answers `NULL` (as an unknown slug does) and writes nothing, and the time zone stored
   on the booking is the one the slot rule reads;
3. the idempotency key is looked up: the same request answers the stored booking again and writes
   nothing; another request under the same key is `IDEMPOTENCY_KEY_REUSED`;
4. everything is decided AGAIN under the lock, from committed data: published, `booking_enabled`,
   THE publication rule (`online_booking_may_be_public`: operator switch + verified Plus); the
   service opted in, active, not deleted (`online_booking_bookable_services`); the start still
   offered by THE slot rule (`online_booking_slot_is_available` — nothing is recomputed here);
5. the customer becomes a Client of THAT Business (§9.3);
6. the Appointment, its item and its phases are written as a device writes them, a snapshot of the
   catalog service at that instant; the written length must equal the validated one (40001
   otherwise);
7. the booking record (`online_bookings`) is written with the key and the answer.

Never read from the caller: the Business id, the staff member, the duration, the price, the
phases, the subscription state, the availability.

| Answer | Meaning |
| --- | --- |
| `NULL` | nothing can be booked here — switch off, unknown slug, draft, offline, paused, lapsed Plus (the same `NULL`) |
| `INVALID_REQUEST` + `field` | the first unacceptable field; says nothing about any Business |
| `BUSY` | locked for more than 3 seconds; nothing written |
| `IDEMPOTENCY_KEY_REUSED` | the key already booked a different request |
| `UNKNOWN_SERVICE` | not a bookable service of this Business, whatever the reason |
| `SLOT_UNAVAILABLE` | the start is not offered any more, whatever the reason |
| `BOOKED` + `booking` | `reference`, `service` (id, name, duration), `starts_at`, `ends_at` (UTC), `local_date`, `local_time`, `time_zone` — never a Business, Client or Appointment id, never an amount |

Concurrency and idempotency:

- one booking of a Business at a time (the row lock); in READ COMMITTED each statement sees what
  the previous holder committed, so the second request for a slot is refused at step 4. The
  function refuses to run under any other isolation level (25001);
- the lock is the row the owner's `online_booking_set_state` / `online_booking_update_profile`
  lock: pausing bookings and a booking in flight are serialized;
- the key is durable: `unique (business_id, idempotency_key)` plus a sha256 fingerprint of the
  normalized request. A replay answers from the record, so it is byte-identical to the first
  answer, also after the page was paused. With the switch off even a replay answers `NULL`; so
  does a replay through a slug that no longer names the Business (the key is found through the
  Business the slug names now — never across Businesses);
- nothing is held in application memory.

### 9.3 The customer

Validation (`online_booking_request_issue`, a pure rule — it reads no table):

| Field | Rule |
| --- | --- |
| `idempotency_key` | 16–128 characters of `[A-Za-z0-9_-]` |
| `service_id` | 1–200 characters |
| `starts_at` | a finite instant |
| `first_name`, `last_name` | 1–80 characters once cleaned, at least one visible character, no control character, line separator or bidirectional override |
| `email` | THE email shape rule (`communications_is_valid_email`), no whitespace of any kind |
| `phone` | at most 40 characters, readable by THE phone rule (`communications_client_phone_e164`) |

« Cleaned » means without the leading and trailing characters JavaScript `trim()` removes
(`online_booking_clean_text`): the device validates pulled rows with that trim, and a first name
made of a no-break space would stop every pull of that Business. Values are stored as typed,
cleaned — never lowercased, never canonicalized (the Client conventions, `CLIENTS.md`).

Matching (`online_booking_find_client`) — an existing Client is reused only when ALL hold:

- same Business (every predicate is scoped by `business_id`: never merged across Businesses);
- live (not tombstoned) and not archived;
- the same email, trimmed and lowercased — the strong identifier of the import rule;
- a compatible name: the same first name, and the same last name or none recorded (case and
  spacing ignored; accents are not folded).

The oldest one when several qualify. Otherwise a NEW Client is created with identity and contact
only: no note, no birthday, no photo, and NO consent of any kind — `sms_marketing_consent` stays
NULL (unknown). A booking is not a marketing permission.

**A matched Client is never modified.** Public, unauthenticated input must not rewrite a record
the professional keeps (a contact detail would redirect her reminders), and a server-side change
of a Client the device is editing offline would create a conflict nothing resolves (§9.1). The
contact given for THIS booking is kept on the booking record instead.

### 9.4 Offline-first synchronization

- **No sync change.** No sync RPC is replaced, no payload key or status is added, SQLite is
  untouched. The booking reaches the device through the normal pull, as an appointment made on
  another device would: validated, applied with its Client first, acknowledged, never echoed.
  From then on it is hers: she edits, moves, cancels or deletes it and the push applies.
- **Pull window.** The rows carry the start time of the booking transaction; the lock wait is
  bounded (3 s), so a booking is always inside the 5-minute overlap the device re-reads.
- **A deleted Client never orphans a booking** (trigger `clients_online_booking_reattach`). A
  device refuses to delete a Client an Appointment references — but it cannot apply that guard to
  a booking it has not pulled yet. When such a deletion reaches the server, each live Appointment
  of an online booking that names the tombstoned Client is moved, in the same transaction, to a
  NEW Client built from the contact given for that booking — as if the deletion had come first.
  Several bookings may have matched that one Client with different contacts (the phone is not
  compared, and a Client without a last name matches any): one new Client is created per
  distinct contact, exactly as stored, and each Appointment goes to the one built from its own
  booking — never another booking's details. Nothing of the deleted record is carried over.
  The moves are ordinary writes of the deleting push: `appointments_sync_before_write` gives the
  moved Appointments a new `sync_version` and the transaction's `updated_at`, the same instant as
  the tombstone and the new Clients, so every device pulls the three together under its usual
  cursor (one that already held the booking applies the new Client and the move first, then the
  tombstone). Without it the device could never apply that appointment (cursor held for ever) and
  a new device could not restore.
- **Her own schedule is never refused.** The sync push takes NO Business lock, on purpose:
  overlapping appointments are allowed (`CLAUDE.md` §16) and an appointment created offline must
  never be rejected or dropped. What a push committed before a booking makes that booking
  impossible; what it commits after (or during) coexists with it — §9.5.

### 9.5 Overlaps with an online booking — derived, never stored

The exact scenario: the professional creates an appointment (or a calendar block, or moves an
appointment) while her device has not synchronized; a customer books that time, which the server
sees as free; the device then pushes. `sync_push_aggregate` answers `APPLIED` — both exist.

- `online_booking_conflicts(business, now)` lists, for every online booking whose Appointment
  still occupies the schedule and has not ended, each OTHER busy interval that intersects it: an
  appointment (full span, the engine's conservative rule; `CANCELLED`, `NO_SHOW` and deleted ones
  occupy nothing) or a calendar block. Ends are exclusive.
- It is computed from the committed calendar at each call. Nothing is stored, so nothing can be
  stale, and a race between a push and a booking needs no lock to be seen.
- It reads the Appointment as it is NOW: a conflict disappears the moment she moves or cancels
  either side — that is the recovery; nothing is ever rewritten or discarded for her.
- The owner reads hers through `online_booking_read_conflicts(business)` (ownership checked):
  the ids and instants of her own appointments and blocks, nothing of the booking record.

**Not built: the app does not call it.** Until a surface exists in the Expo application (and a
notification to the professional), an overlap is represented and queryable on the server but she
is not TOLD. Double-booking protection is therefore complete between online customers and against
everything already synchronized, and NOT complete against an unsynchronized device — a
prerequisite of any public launch (§9.9).

### 9.6 The busy-interval lookback

Sprint 3B read appointments from 7 days before the window. Nothing bounds the length of an
appointment (any number of items, any phase duration), so an appointment longer than 7 days was
silently ignored. `online_booking_busy_intervals` is replaced in place — same signature, same
zero-grant boundary — WITHOUT a lower bound: every live appointment that starts before the end of
the window is measured. Cost: one phase-sum probe per appointment of the Business; measured on
real PostgreSQL with 20 000 appointments (60 000 phases) at about 20 ms per day of slots, against
0.2 ms bounded. If a history ever outgrows that, the exact remedy is a stored per-Business maximum
span maintained by a trigger — not a guessed constant.

### 9.7 Security

- ONE write entry point, `service_role` only, keyed by the public slug. `anon` and `authenticated`
  cannot execute it; no browser code can.
- `online_bookings`: RLS enabled, no policy, no grant. Every internal function is revoked from
  `public`, `anon`, `authenticated` and `service_role`; SECURITY DEFINER functions pin
  `search_path = ''` and are owned by the table owner.
- No SQL identifier comes from the caller; no dynamic SQL exists in the migration.
- Refusals say `NULL` or a status — never why a page is offline, never which Client matched.
  `INVALID_REQUEST` is decided before any table is read.
- The answer carries a random booking reference that grants nothing: no function is keyed by it.
- The switch `ONLINE_BOOKING_CREATION` is a row the operator flips by hand
  (`online_booking_set_creation_enabled`). Enable it on Staging only until the public flow is
  approved. The migration enables nothing: no flag, no profile, no opt-in.

### 9.8 Tests

Scratch harnesses outside the repository, like the other migrations — here against a REAL
PostgreSQL 18 (separate connections, real row locks), with every migration owned by a role that is
neither superuser nor BYPASSRLS:

- functional (255 checks): the gate; the created Appointment, item, phases, Client and record;
  the pull seen by the owner, key for key like a device-made appointment; device edits, stale
  push, tombstone; idempotency (replay, cosmetic differences, reuse, pause, switch off); outside
  hours, break, closed day, off-grid, existing appointment, calendar block, `CANCELLED` /
  `NO_SHOW` / deleted; stale availability; notice and horizon boundaries; both Paris DST Sundays;
  session time zone; services (private, inactive, deleted, foreign); page eligibility (paused,
  unpublished, expired Plus, Sandbox, switch off); every invalid field; matching; rollback on an
  injected failure; the isolation guard; overlaps and their recovery; the Client deletion race;
  the long-running appointment; privacy of the public reads; grants, RLS and ownership;
- concurrency (57 checks): two customers on one slot (wait, then refusal; rollback hands the slot
  over); 20 simultaneous requests → exactly one booking; 20 simultaneous duplicates of one key →
  one booking; a packed day never over-filled; two Businesses never wait for each other; `BUSY`
  after 3 seconds; the owner pausing during a booking, both orders; a push never blocked by a
  booking and the overlap derived, both orders; the Client deletion race, both orders; a device
  edit of the matched Client; a pull during a booking; the reminder trigger;
- upgrade (26 checks): the migration applied onto a populated Sprint 3B database — no existing row
  or object changed besides the replaced function, the old lookback defect shown then fixed, the
  public availability and the sync unchanged, the scan cost measured;
- review (52 checks): a Client deleted by a device that never pulled its booking — the moved
  Appointment and its new Client carry the tombstone's own `updated_at` and a new
  `sync_version`, and reach both devices through the real pull under the device cursor rule
  (cursor − 5 minutes), also when the deletion is still uncommitted during a pull; a slug renamed
  or handed to another Business, and a time zone changed, while a booking waits on the lock;
  five bookings with different contacts on one deleted Client;
- the Sprint 2 / 3A / 3B harnesses still pass with it applied (166 / 147 / 172, in-process).

In the repository: `online-booking-creation-migration.test.ts` (source-level guard: scope, grants,
order of the decisions, shapes, the staff constant, no caller in `web/`) and
`sync-online-booking-pull.test.ts` (a server-created booking through the real validator, pull
worker and stores — including a device that already held a booking whose Client another device
deleted).

### 9.9 Before a public booking flow (Sprint 3C-B and after)

Status after Sprint 3C-B (§10):

- DONE: the server-only web action behind its own deployment gate (§10.1); request limits per
  network, per customer email and per page, counted in the database (§10.3);
- DONE on Staging (reported by the user): the scenarios of `supabase/README.md` › Online booking
  creation, except genuinely simultaneous requests on Staging itself;
- OPEN: a surface in the app for `online_booking_read_conflicts`, and a notification to the
  professional when a booking arrives — without them she is not told (§9.5);
- OPEN: the confirmation the customer receives (email, §10.6): a lost answer is only recovered by
  the same key, in the same browser tab;
- DONE locally, to validate on a hosted Staging: a challenge against automated bookings —
  Cloudflare Turnstile in front of the request limits (§10.8); the limits still bound what a
  solved challenge can do;
- OPEN: product decisions recorded here as defaults, to confirm: `SCHEDULED` status, the note
  « Réservation en ligne », phone required, archived Clients not matched, the matching rule.

## 10. Public booking flow (Sprint 3C-B) — development / Staging only

`web/src/app/r/[slug]/reserver/page.tsx` (the page), `web/src/app/api/booking/[slug]/` (two
endpoints), `web/src/features/booking/` (every rule), `web/src/components/booking/booking-flow.tsx`
and `booking-steps.tsx` (the screens), and ONE migration,
`supabase/migrations/20261019120000_create_online_booking_request_limits.sql`.

### 10.1 Gate and journey

- Open only where the server variable `ONLINE_BOOKING_WEB_BOOKING=enabled` is set AND the site is
  not the production website (`isBookingFlowEnabled`, `web/src/features/booking/flow-gate.ts`).
  Elsewhere `/r/<slug>/reserver` keeps its notice (or the §8.6 preview) and both endpoints answer
  404. The database still decides whether anything can be booked (publication, `booking_enabled`,
  Plus, `ONLINE_BOOKING_CREATION`).
- The profile (`/r/<slug>`) offers « Prendre rendez-vous » when the flow is open and the page
  accepts bookings.
- Four steps, then the outcome: Prestation (ONE bookable service) → Date et horaire (the window's
  dates; the start times of the chosen date) → Coordonnées (first name, last name, email, phone —
  all required, no account) → Confirmation (review, explicit « Confirmer le rendez-vous ») →
  the confirmed booking.
- The profile and the bookable services are read on the server before anything is sent (a real
  404 for an address with no page; « en pause » / « indisponible » notices). Times and booking go
  through the website's own endpoints; the browser never talks to Supabase.
- Browser Back / Forward move between steps (one history entry per step, no URL change); the
  focus moves to each new step's heading, or to the first refused field.

### 10.2 The two endpoints

| Endpoint | What it does |
| --- | --- |
| `GET /api/booking/<slug>/availability?service=&date=` | `online_booking_public_availability`, validated query (only `service` and `date`), never cached, 120 reads / 10 min per network |
| `POST /api/booking/<slug>` | `online_booking_create_booking`; the answers of §9.2 forwarded as they are |

The POST checks, each BEFORE the next and all before the engine: the gate, the slug shape, the
origin (an `Origin` equal to the site's own; `Sec-Fetch-Site` cross-site refused), JSON only, at
most 2 KB read (whatever `Content-Length` claims), exactly seven string keys (`service_id`,
`starts_at`, `first_name`, `last_name`, `email`, `phone`, `idempotency_key` — nothing else can be
forwarded), the field rules of the engine (mirrored in `booking-request.ts`, the engine stays the
authority), then the bot challenge (§10.8), then the request limits. Answers: the engine's (200),
`REJECTED` (400/403/404/413/415), `INVALID_REQUEST` + field (400), `CHALLENGE_FAILED` (403),
`RATE_LIMITED` (429), `PROTECTION_UNAVAILABLE` (503), `ERROR` (502, outcome unknown). Nothing the
customer typed, no request body, no token and no secret is logged; a failure is logged as a
status or a Cloudflare error code only.

### 10.3 Request limits — counted in the database

An in-memory counter holds per server instance only (a serverless deployment has many): the
counters live in the database every instance shares.

- `online_booking_request_counters`: fixed windows keyed by `HMAC-SHA256(secret, scope + window +
  identifier)` — 64 hex digits; the table never holds an IP address, an email or a slug (CHECKed).
  RLS on, no policy, no grant.
- `online_booking_take_request_quota(counters)` (`service_role` only): increments every counter
  of a request (a refused request counts too), in key order (no deadlock between concurrent
  callers), and answers whether all are within their limits. Expired windows are deleted in
  bounded batches.
- The policy (`web/src/features/booking/request-protection.ts`):

  | Action | Per | Limit |
  | --- | --- | --- |
  | availability | network | 120 / 10 min |
  | booking | network | 10 / 10 min and 40 / 24 h |
  | booking | customer email | 6 / 24 h |
  | booking | page (slug) | 30 / 10 min |

  A network is the IPv4 address or the IPv6 /64, read from `x-real-ip` / `x-forwarded-for` as
  the platform sets them (Vercel overwrites them; a self-hosted proxy must do the same).
- Two steps per booking request, two calls: the client's OWN counters (network, email) first —
  a request they refuse still counts on them —, then the page's SHARED counter, only for a
  request they allowed. One client, however often it is refused, adds at most its own allowance
  to the page (10 of its 30) and cannot lock the page's other customers out. Both steps share one
  5-second budget.
- FAIL CLOSED: without `ONLINE_BOOKING_REQUEST_LIMIT_SECRET` (32+ characters), without the
  function (migration not applied), or when it does not answer, both endpoints refuse every
  request (`PROTECTION_UNAVAILABLE`) and the engine is never called.
- Limits, not a wall: a botnet rotating networks and emails is bounded per page (30 / 10 min),
  which also lets it exhaust that page's quota — three networks suffice, and one IPv6
  subscriber often holds many /64s. The challenge (§10.8) stands in front of them: a request
  without a verified token touches no counter, so exhausting a page now takes solved challenges.

### 10.4 Idempotency, retries and stale data

- ONE key per booking attempt (32 hex digits from `crypto.getRandomValues`), an attempt being one
  immutable request. `planSend` (`booking-flow.ts`) draws a key only for a new attempt.
- Unknown outcome (network failure, timeout, 5xx, an answer not understood): the request and its
  key are FROZEN — nothing can be edited, Back cannot leave the review — and « Réessayer » sends
  the very same body; the engine replays the booking instead of creating another. The key is
  never replaced silently.
- One request in flight at most (a guard outside React state, and a disabled button).
- Every send carries a NEW Turnstile token in its own header (§10.8): a retry is the same body
  under the same key with a new token — the token is never part of an attempt.
- `BUSY`, `RATE_LIMITED`, `PROTECTION_UNAVAILABLE`, `CHALLENGE_FAILED`: retry with the same key;
  when nothing was uncertain, changing the request starts a new attempt. `CHALLENGE_FAILED` after
  an earlier unknown outcome keeps the request frozen (« Réessayer », the same request).
- `SLOT_UNAVAILABLE`: back to the times of the same date, read again; the details are kept.
  `UNKNOWN_SERVICE`: back to the services, read again. `INVALID_REQUEST`: the refused field, or
  the times again. `IDEMPOTENCY_KEY_REUSED`: nothing booked this time; a new attempt needs the
  customer to confirm again. `UNAVAILABLE` (the engine's NULL): booking closed — and, after an
  earlier unknown outcome, an explicit « nous ne pouvons pas confirmer » with the contact.
- Availability reads are never cached (endpoint `no-store`, fetch `no-store`); every new read
  aborts the previous one and an answer older than the latest read is discarded (`STALE`). A time
  shown is never held: creation decides again under the Business lock (§9.2).
- Not covered: a reload during an unknown outcome loses the frozen request (it lives in memory
  only); the customer is told to contact the professional.

### 10.5 What is shown — and what is not

- Times are the server's: a start is the slot's own `local_time`; an end is the UTC instant
  formatted in the time zone the server returned (`formatTimeInZone`, explicit `timeZone`) —
  never the browser's or the server's zone. « Horaires à l’heure de Paris. » says which clock.
- The confirmation shows what the engine confirmed: the reference, the service, the local date,
  start – end, the professional (her published name, and address if published — after
  `20261020120000`, exactly what the profile's location level allows, never more: §11.10).
- **No price**: the public contract (`online_booking_public_profile`,
  `online_booking_public_availability`, the booking answer) exposes none, and the website does
  not read restricted tables to find one. Showing prices needs a deliberate change of the public
  contract.

### 10.6 Confirmation email — not built

The communications queue (`scheduled_communications`) knows reminder, rescheduling,
cancellation and client-lifecycle kinds only; a booking confirmation needs a new kind, its
enqueue at booking time (deduplicated by the booking, so a replay never sends twice), its
template in the worker and a deployment of the worker — out of this increment. The confirmation
page says that no email is sent. An online appointment still gets the existing H-24 reminder
under the professional's own preference (§9.1).

### 10.7 Tests

- Web (Vitest): the two endpoints at the server boundary (success, every engine answer, unknown
  outcomes, every refusal before the engine with no call made, rate limit before the engine,
  fail-closed protection, the gate, no customer detail or secret in an answer or a log); the
  request rules; the flow reducer (one key per attempt, frozen retries, no double send, every
  answer); the browser client (same-key retries, timeouts, stale reads); times in the
  professional's zone whatever the runtime's; the screens and the page wiring. The challenge
  (§10.8), every outside call mocked: Siteverify's request, every refusal and every failure, the
  configuration rules (test keys local only), the order (challenge before any counter, a flood of
  unverified requests touching none), single use, same-body retries with new tokens, the widget's
  options, states and script loading, and the review step's states.
- Real PostgreSQL (scratch harnesses outside the repository): the request counters (privileges,
  semantics, malformed input, window rollover, cleanup, 30 concurrent callers against a limit of
  10 → exactly 10); the website end to end through `next start` and a PostgREST stand-in — two
  booking transactions shown in flight at the same time with exactly one booked, a lost answer
  then the same-key retry, rate limits before the engine, fail-closed protection; the journey in
  headless Chrome at 390 px and 1280 px with a New York browser time zone.

### 10.8 Bot challenge — Cloudflare Turnstile

`web/src/features/booking/turnstile.ts` (server-only: configuration and Siteverify),
`web/src/features/booking/challenge.ts` (shared: header, action, token shape; the browser's
script loading and widget), `web/src/components/booking/turnstile-widget.tsx` (the widget on the
review step). No migration, no npm dependency.

- ONE managed widget, on the review step just before « Confirmer le rendez-vous », action
  `booking`, French, invisible unless Cloudflare asks for an interaction (`interaction-only`),
  refreshed automatically when it expires; `compact` below 300 px of width, `flexible` above (no
  horizontal overflow on a 320 px phone). Cloudflare's script (`api.js?render=explicit`) is loaded
  from its own address once, on that step only.
- The button waits for a fresh token (« Vérification de sécurité en cours… »; « complétez la
  vérification ci-dessus » when an interaction is needed). If the check cannot run (script
  blocked, network, unsupported browser): an alert, « Relancer la vérification », the
  professional's contact — never a way around it.
- A token is SINGLE-USE and lives 300 s (Cloudflare's rules). It travels in the
  `X-Turnstile-Token` header, never in the body; every send spends it and the widget is reset
  at once, so a retry carries a new token with the same body and key (§10.4).
- The server, after the request's own checks and BEFORE any counter or the engine, asks
  Siteverify (secret, token, the client's address; uncached; 3 s): PASSED only for `success`,
  the action `booking` and the CONFIGURED site's host (`NEXT_PUBLIC_SITE_URL`, never a host the
  request claims). No, malformed, invalid, expired or reused token (`timeout-or-duplicate`) →
  `CHALLENGE_FAILED` (403). Cloudflare unreachable, slow, failing or answering something
  unexpected, a refused secret, a missing or inconsistent configuration →
  `PROTECTION_UNAVAILABLE` (503): FAIL CLOSED, nothing is booked without a verified token.
- Worst case of one request: 3 s (challenge) + 5 s (limits) + 10 s (engine) = 18 s, inside the
  browser's 20 s.
- Configuration, per environment: `TURNSTILE_SITE_KEY` (handed to the page by the server) and
  `TURNSTILE_SECRET_KEY` (server-only), from one Turnstile widget per environment whose hostname
  is that environment's site. Without them the page does not offer the flow and the endpoint
  refuses every booking. Cloudflare's TEST keys are honoured only when both the configured site
  and the request's own host are local (loopback, `*.localhost`, a private IPv4 network) — never
  on a hosted deployment.
- The availability reads are NOT challenged (read-only, rate-limited; a single-use token per date
  change would cost the customer for little).

## 11. Location privacy — the server-enforced contract (implementation unit 1)

`supabase/migrations/20261020120000_add_online_booking_location_privacy.sql` — prepared in the
repository, **NOT applied to Staging, NOT applied to Production** (§11.7 says when it may be).
Database only: the app's settings, the website's rendering,
maps, directions, confirmation emails and calendar exports are later units (§11.8 – §11.10).

Where a professional works is HER decision. She chooses ONE publication level; the public SQL
function alone decides what leaves the database. No client — the app, the website, a future email
— receives a value and is trusted to hide it.

### 11.1 The four states

| `address_visibility` | What `online_booking_public_profile` returns |
| --- | --- |
| `FULL_ADDRESS` | street, postal code, city, and a plain-text directions destination built from them |
| `CITY_ONLY` | the city name — nothing else: no street, number, postal code, full address, coordinates or directions query |
| `HIDDEN` | no location |
| `NULL` — never chosen | no location: the SAME answer as `HIDDEN`, so the public cannot tell them apart |

Approved product decisions (November 2026):

1. A profile without an explicit choice is **private**. Its legacy free-text `address` is kept
   for the professional and never returned to the website again.
2. `CITY_ONLY` returns the city name only.
3. A booking never overrides the choice (§11.10).
4. No level is preselected: the professional chooses explicitly, and `NULL` can never be chosen
   back — `HIDDEN` is the explicit private choice.

### 11.2 Storage and THE location rule

Four nullable `text` columns on `business_booking_profiles`, no default (every existing row is
unconfigured): `address_visibility`, `address_street`, `address_postal_code`, `address_city`. No
coordinates are stored or computed. The legacy `address` column is kept, unchanged and private.

ONE rule, `online_booking_location_issue(visibility, street, postal code, city)` — NULL or the
first broken rule — backs the table's CHECK (`business_booking_profiles_location_rule`, so the SQL
Editor cannot store a level its data cannot honor either) AND the owner save:

| Reason | Meaning |
| --- | --- |
| `INVALID_VISIBILITY` | not `FULL_ADDRESS`, `CITY_ONLY` or `HIDDEN` (the save also refuses a missing level) |
| `INVALID_STREET` | not 1 … 200 characters of plain single-line text in its cleaned form |
| `INVALID_POSTAL_CODE` | not 3 … 10 letters or digits, single inner spaces or hyphens (`69001`, `1000`, `SW1A 1AA`, `12345-678`) |
| `INVALID_CITY` | not 1 … 100 characters of plain single-line text in its cleaned form (a line break cannot smuggle a postal code into a city) |
| `MISSING_STREET`, `MISSING_POSTAL_CODE` | `FULL_ADDRESS` without them |
| `MISSING_CITY` | `FULL_ADDRESS` or `CITY_ONLY` without a city |

"Plain text" and "cleaned" are the booking engine's own rules (`online_booking_is_plain_text`,
`online_booking_clean_text`, §9.3): no control character, no line or paragraph separator, no
bidirectional override, no edge whitespace the device's `trim()` would remove. `HIDDEN` requires
nothing; what it stores stays private.

### 11.3 The owner save — `online_booking_update_location`

`online_booking_update_location(business, visibility, street, postal_code, city)` — `authenticated`
only, `SECURITY DEFINER`, `search_path = ''`, ownership checked first (42501 otherwise: another
professional, a signed-out session, an unknown Business). Everything is sent together; a blank text
clears the stored value; texts are stored cleaned. Needs no subscription and works whatever the
publication state — the public read applies the level at its next request.

- `{ status: 'UPDATED', …owner view }`;
- `{ status: 'INVALID_LOCATION', reason }` — a reason of §11.2. Nothing is written, not even the
  empty draft.

It never reads nor writes the legacy `address`, the slug or the publication state. The owner view
(`online_booking_read_profile` and every owner answer) gains `address_visibility`,
`address_street`, `address_postal_code` and `address_city`; it keeps the legacy `address` (her
data).

### 11.4 The public contract

`online_booking_public_profile(slug)` keeps its signature, its `service_role`-only grant and its
gate (published AND `online_booking_may_be_public` at read time — the same NULL for every page that
is not online). It no longer reads the legacy `address` column. Its answer gains ONE key,
`location`, built by `online_booking_public_location` (not client-callable), which fails closed: a
combination THE rule refuses publishes nothing, never a degraded part of it.

```jsonc
// FULL_ADDRESS
"location": { "visibility": "FULL_ADDRESS", "street": "12 avenue Jean Jaurès", "postal_code": "69007",
              "city": "Lyon", "directions_destination": "12 avenue Jean Jaurès, 69007 Lyon" },
"address": "12 avenue Jean Jaurès\n69007 Lyon"
// CITY_ONLY
"location": { "visibility": "CITY_ONLY", "city": "Lyon" },
"address": null
// HIDDEN, or never chosen
"location": null,
"address": null
```

- `address` is a **compatibility alias** for a website deployed before the migration: the complete
  address on two lines under `FULL_ADDRESS`, `NULL` otherwise. It is built from `location`, so it
  can never say more. New code reads `location` only.
- `directions_destination` is plain text, never a URL: a client builds a directions link itself,
  percent-encoding it for a known maps host. It exists under `FULL_ADDRESS` only.
- Availability (`online_booking_public_availability`) and the booking answer
  (`online_booking_book`) carry no location, before and after the migration; `online_bookings`
  stores none.

### 11.5 Legacy profiles — private by default

The migration rewrites no row: every existing profile becomes unconfigured, so its page stays
online WITHOUT a location. On Staging this is intended for `studio-esthetique`: its address
disappears from `staging.beautizzy.fr` at the website's next request (the profile fetch is
`no-store`, no redeploy) and stays hidden until its professional explicitly chooses
`FULL_ADDRESS`. The free text is never parsed into the new fields (BeautIzzy never invents a
street or a city); the professional types her address once in the new settings.

### 11.6 Installed builds and deployed websites

- **App builds that predate the location settings** keep working: `online_booking_update_profile`
  (nine arguments) is unchanged and still stores the free text, the owner view only gains keys
  (`toBookingProfile` copies the keys it knows), and nothing is refused. But their « Adresse »
  field — labelled « Adresse postale affichée sur votre page » — is no longer published: those
  builds say something false until the professional updates. Their preview does not show the
  address (`BookingProfilePreview`), so no preview misleads. They cannot choose a level, so a page
  edited only from them shows no location.
- **A new build that retires the free-text field** must keep sending the stored `address` back
  through `online_booking_update_profile` (every field is sent; a blank clears): dropping it
  silently would erase the professional's private text.
- **A website deployed before the migration** reads `address` only: it shows the complete address
  of a `FULL_ADDRESS` page and nothing otherwise — a `CITY_ONLY` page shows no city until the
  website reads `location` (under-disclosure, never over-disclosure).
- **A website that reads `location`, deployed before the migration**, finds no `location` key and
  must show no location — it must never fall back to `address` (which still holds the raw legacy
  text until the migration is applied).

### 11.7 Coordinated rollout — the migration is NOT applied yet

The app shipped today has no control to choose a level. Applying the migration now would hide the
Staging page's address (§11.5) with no way for its professional to choose one again. So the
migration waits, in this order — each step separately approved:

1. Commit and verify the privacy contract (this unit: migration, source-level guard, scratch
   PostgreSQL evidence — §11.11).
2. Implement the native location privacy settings (§11.8).
3. Prepare compatible public-web consumers (§11.9, §11.6: read `location`, never fall back to
   `address`).
4. Apply the migration to Staging — by hand, with explicit authorization only.
5. Verify every privacy level on Staging: `FULL_ADDRESS`, `CITY_ONLY`, `HIDDEN` and an unconfigured
   page, by the checks of `supabase/README.md` › Online booking location privacy and the website.
6. Production stays separately authorized: `20261015` → `20261019` and then this migration, in
   the same Production rollout, BEFORE `ONLINE_BOOKING_PUBLICATION` is enabled there — no
   Production page ever serves the raw free text (`supabase/README.md` records `20261015` –
   `20261019` as not applied on Production).

Dependencies: the migration requires `20261015120000` (the table, the owner view, the public read)
and `20261018120000` (`online_booking_clean_text`, `online_booking_is_plain_text`), and sorts
after `20261019120000` — all three applied on Staging, none on Production.

Until a build with the settings exists, a level can only be chosen through the owner RPC with the
professional's own session: there is no operator path, and writing the columns from the SQL
Editor is a hosted data change that needs explicit authorization.

**Never restore the public visibility of a legacy address automatically** — not by a migration,
not by a backfill, not by an operator default. A location becomes public only through its
professional's explicit choice.

### 11.8 How the native settings will use the contract (unit 2 — not built)

- Read the four values from `online_booking_read_profile`; show the level chooser with NOTHING
  selected while `address_visibility` is `NULL`; save through `online_booking_update_location`
  with the four fields together; map `INVALID_LOCATION` + `reason` to the field; mirror THE rule
  in the domain (like `validateWorkingDay`) to refuse before calling — the server stays the
  authority.
- The legacy free text, when present, is shown as a private hint to retype, never as the published
  address, and never parsed.
- The settings say what the page will show, from the same rule (`CITY_ONLY` → the city only).
- Settings need connectivity, like the rest of the profile: nothing is queued, no sync aggregate.

### 11.9 How the website will consume the contract (unit 3 — not built)

- `parsePublicProfile` validates `location` strictly — exactly the two shapes of §11.4, anything
  else reads as no location — and stops reading `address`.
- The profile page, the booking flow (slot summary, review, confirmation) and any metadata take the
  parsed `location`, never a raw field: `FULL_ADDRESS` → address lines (+ a directions link built
  from `directions_destination`, percent-encoded, to a known maps host — later, with the map
  unit); `CITY_ONLY` → the city alone, no pin precision, no directions; nothing otherwise.
- Every read stays `no-store`, so a level change applies at the next request.

### 11.10 The same level on every channel

A booking never discloses more than the page: the confirmation step shows the same `location` as
the profile it was booked from. Every future channel — the confirmation email, reminders, a
calendar export (`.ics` `LOCATION`), structured data or Open Graph, a share card — must resolve the
location through `online_booking_public_location` (or the public read) at the moment it renders,
never from the columns, never from the legacy `address`, never from a value captured earlier: a
professional who hides her address after a booking is respected by every later message.
`CITY_ONLY` writes the city only; `HIDDEN` and unconfigured write no location (point to contacting
the professional instead).

### 11.11 Tests

- Mobile (Jest): `src/infrastructure/supabase/__tests__/online-booking-location-migration.test.ts`
  (source-level guard: ordering, additive nullable columns, no row rewritten, ONE rule behind the
  CHECK and the save, exact grants, ownership first, owner view keys, public keys, the legacy
  column never read by the public function, the `CITY_ONLY` shape, no coordinate or URL).
- Real PostgreSQL (scratch harness outside the repository, populated world built with every
  earlier migration, legacy addresses published the old way, then this migration applied twice):
  every existing row untouched and unconfigured; legacy pages online without a location;
  `FULL_ADDRESS`, `FULL_ADDRESS` → `CITY_ONLY` → `HIDDEN` → back; blank and partial fields; every
  refusal reason, writing nothing; accepted postal codes of several countries; the CHECK against
  the table owner; the public shape failing closed; cross-owner, signed-out, `anon`,
  `service_role` and grant-less callers refused; exact function and table privileges; drafts,
  unpublished pages and the operator switch; a new profile without a choice; an old build's
  free-text save after the migration; availability unchanged; a booking, its idempotent replay
  and its answer carrying no location, the page's level unchanged after it; a leak sweep of
  every online page in every state — 142 checks. The Sprint 2, 3A, 3B, 3C-A and 3C-B harnesses
  still pass with the migration on top (182 / 147 / 172 / 255 + 57 concurrency / 43), their
  exact-shape expectations updated for `location`, the four owner keys and the new grant only.
- Limitation, deliberate: the repository has no PostgreSQL test harness and no PostgreSQL
  dependency — SQL behavior is verified by scratch scripts outside it (`CLOUD_SYNC.md` §13
  policy, followed by every migration since). Retaining these scenarios as executable repository
  tests would need new test infrastructure (an embedded PostgreSQL or PGlite, a role stub, a
  runner), out of this unit's scope. The repository keeps the source-level guard; the harness and
  its logs are preserved outside the repository; `supabase/README.md` › Online booking location
  privacy lists the checks to run on a hosted project after applying.
