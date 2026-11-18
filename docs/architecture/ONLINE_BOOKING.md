# BeautIzzy — Online booking

Status: **Sprint 3C-B — public booking flow, development / Staging only** (on top of Sprint 3C-A —
secure booking creation —, Sprint 3B — read-only availability engine —, Sprint 3A — weekly working
hours — and Sprint 2 — public profile and booking settings). A customer can book ONE service on
`/r/<slug>/reserver` without an account (§10); the website reaches the engine through two
server-side endpoints protected by request limits counted in the database. The flow is open only
where `ONLINE_BOOKING_WEB_BOOKING=enabled` and never on the production website; creation stays
closed by its own operator switch (`ONLINE_BOOKING_CREATION`). No confirmation email exists.
Where the database has the multi-service contract (`20261022120000`, §13), the same page offers an
ordered selection of 1 to 8 services booked as ONE appointment (§10.9); everywhere else — Staging
today — it keeps the single-service flow, decided by the server's own answer.

Migration state:

| Migration | Staging | Production |
| --- | --- | --- |
| `20261015120000` … `20261018120000` (Sprints 2 – 3C-A) | applied | not applied |
| `20261019120000_create_online_booking_request_limits.sql` (Sprint 3C-B) | applied | not applied |
| `20261020120000_add_online_booking_location_privacy.sql` (§11) | **NOT applied** — prepared in the repository | **NOT applied** |
| `20261021120000_add_online_booking_service_publication.sql` (§12) | **NOT applied** — prepared in the repository | **NOT applied** |
| `20261022120000_add_online_booking_multi_service.sql` (§13) | **NOT applied** — prepared in the repository | **NOT applied** |

Production states as recorded in `supabase/README.md`. The location privacy migration waits for
its coordinated rollout (§11.7): once applied, the public read returns a location only as the
professional's explicit publication level allows, and never the legacy free-text address. The
service publication migration (§12) is independent of it — neither needs the other, either may be
applied first (§12.8): once applied, the professional chooses her bookable services herself and
each public service carries its price, description and category. The multi-service contract (§13)
needs the service publication migration — so it waits for that activation gate too — and is
independent of the location one: once applied, the database can offer and book an ordered
selection of up to eight services as ONE appointment; no website calls it yet.

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
| owner (`authenticated`) | `online_booking_read_profile`, `online_booking_update_profile`, `online_booking_set_state`, `online_booking_read_working_hours`, `online_booking_save_working_day`, `online_booking_read_conflicts` (§9.5), `online_booking_update_location` (§11, once its migration is applied), `online_booking_read_service_publication` and `online_booking_set_service_publication` (§12, once its migration is applied); Storage select/insert/delete inside her own media folder |
| website (`service_role`, secret key, server-only) | `online_booking_public_profile(slug)`, `online_booking_public_availability(slug, service, date)` (§8), `online_booking_create_booking(…)` (§9) and `online_booking_take_request_quota(counters)` (§10) only |
| operator (SQL Editor) | `online_booking_set_publication_enabled(boolean)`; `online_booking_set_creation_enabled(boolean)` (§9); `online_booking_working_intervals(…)` (§7.4); the internal availability and booking functions and the `business_bookable_services` opt-ins (§8 — the only writer until §12 is applied) |

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
website, a challenge (CAPTCHA) in front of it, a price in the summary, review or confirmation of a
booking (the service cards show one since the catalogue unit C — §10.5),
customer accounts, deposits, Stripe, notifications to the professional, a surface in the app for
overlaps (§9.5) and for telling an online booking apart, customer cancellation or rescheduling,
booking requests awaiting approval, slug history or redirects, a time-zone editor, search
indexing of public pages, server-side cleanup of unreferenced images; for working hours: per-staff
hours, exceptional days and time off, overnight intervals, showing the hours on the public page,
and any effect on the Agenda; for availability: an editor of the booking rules (the screen
choosing the bookable services is built — §12.6 — and works once `20261021120000` is applied), parallel booking during processing time, multi-staff availability,
packages, the same service twice in one booking (several services in ONE booking: §10.9, offered only
where `20261022120000` is applied); for the location (§11): the app's location settings, the
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

Decided since (November 2026, §12): the table IS the final representation — the synced column is
not built — and the owner writes it through `online_booking_set_service_publication` once
`20261021120000` is applied.

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
  id, a client, an appointment, a note, a price or a staff member. (Once `20261021120000` is
  applied each service also carries its catalogue price, description and category — §12.5; still
  bookable services only.) A private, inactive, deleted or
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
endpoints — and the two of §10.9 for a selection), `web/src/features/booking/` (every rule), `web/src/components/booking/booking-flow.tsx`
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
| `GET /api/booking/<slug>/selection/availability?service=…&service=…&date=` | `online_booking_public_selection_availability` — a selection, in order (§10.9) |
| `POST /api/booking/<slug>/selection` | `online_booking_create_selection_booking` — ONE appointment for a selection (§10.9) |

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
- **The service cards** (catalogue unit C, `web/src/components/booking/service-card.tsx`): each
  bookable service shows its name, its duration and — only when the server sent them (§12.5, once
  `20261021120000` is applied) — its price, its description and its category. A server without
  that migration sends none, and the page shows none: the plain list of before, nothing invented.
  Each of the three is validated on its own (`parseService`, `availability.ts`): a malformed
  one is absent, never shown wrong, and the service stays bookable.
  - Price: the server's `price_cents` only — « 45 € », « 45,50 € »; `0` reads « Tarif à
    confirmer », never « gratuit »; « Les tarifs affichés sont indicatifs. » once under the list.
    Nothing suggests an online payment (the page takes none).
  - Description: plain text, rendered as text (never markup), line breaks kept; two lines first,
    « Voir le détail » / « Réduire » only when the two lines actually hide some of it (measured in
    the browser); no placeholder without one. The control is a separate button from « Choisir »
    (`aria-expanded`, `aria-controls`) — never a button inside a button.
  - Categories: hers in her order (position, then id), « Autres prestations » last; a catalogue
    with no category, or a single group, keeps the plain list without a heading.
  - In the single-service flow, still ONE service per booking: « Choisir » selects it and moves
    on; the availability request (service, date) and the booking request (seven keys, the service
    id only) are unchanged. The summary, the review and the confirmation show no price, and the
    booking answer carries none. The selection flow (§10.9) shows each selected price and the
    indicative total in its summary and review — never at the confirmation.

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

### 10.9 Several services in ONE booking (catalogue unit D2) — where `20261022120000` is applied

`web/src/features/availability/selection.ts` (the selection rules, totals and the answer parser),
`web/src/features/booking/{booking-catalog,booking-flow,selection-request,selection-storage,create-selection-booking}.ts`,
`web/src/app/api/booking/[slug]/selection/` (two endpoints),
`web/src/components/booking/{selection-summary,service-card,booking-steps,booking-flow}.tsx`.
No database change; the native application is not touched.

**Which flow — the server's answer, never a guess.** The page reads its catalogue through
`online_booking_public_selection_availability(slug, null, null)` first (`getBookingCatalog`). An
answer (INVALID_SELECTION / EMPTY carries the page's services and window) opens the SELECTION
flow; `null` is the « indisponible » notice; ONLY PostgREST's explicit "no such function" (HTTP
404, `PGRST202` — the migration is not applied) falls back to the single-service read and flow of
§10.1 – §10.5, unchanged. Any other failure (network, 5xx, another 404, a missing grant, an answer
not understood) is the load error — never a reason to offer the older flow. Staging today has no
`20261022120000`: it keeps the single-service flow. In the selection flow ONE booking path is
used, even for one service.

**Activation — two independent steps, and NO separate feature flag.**

- Applying `20261022120000` alone changes nothing a customer sees: the website deployed today
  never calls the multi-service functions. The D2 website code must itself be deployed.
- The D2 website deployed on a database WITHOUT the migration keeps the single-service flow (the
  PGRST202 fallback above) — deploying it first is safe.
- Once BOTH are there, `/r/<slug>/reserver` offers the multi-service flow automatically, at the
  next page render (after PostgREST's schema-cache reload, usually seconds; until then PGRST202
  keeps the single-service flow). Nothing else switches it on, and no flag can hold it back.
- What still holds independently: the deployment gate (`ONLINE_BOOKING_WEB_BOOKING`, never the
  production website), the publication gates of the database, and creation's own operator switch
  (`ONLINE_BOOKING_CREATION`: off, the times are shown and every booking answers « indisponible »).
- Going back needs no migration (they are forward-only): redeploying the previous website build
  returns the single-service flow, since it never calls the new functions; turning
  `ONLINE_BOOKING_WEB_BOOKING` off closes the booking flow altogether.

Coordinated Staging rollout, in order, each step separately authorized:
1. the public-metadata activation gate of `20261021120000` decided (§12.8);
2. `20261021120000` applied by hand (one file, SQL Editor);
3. the D2 website deployed to Staging — still the single-service flow, now with the service cards'
   metadata (§10.5);
4. `20261022120000` applied by hand, only when the multi-service flow may appear on Staging —
   it appears at once, for every page that accepts bookings;
5. the checks of `supabase/README.md` › Online booking multi-service, then a booking end to end
   (creation switch on for that test only, if it is off).
Steps 3 and 4 may be swapped: `20261022120000` without the D2 website is invisible.

**Choosing.** « Choisissez vos prestations »: each card offers « Ajouter » (appended at the END of
her selection — never sorted, one occurrence each), a selected card shows its place in her order
(1, 2, 3…) with « Ajoutée » and « Retirer »; « Voir le détail » stays a separate control. At 8,
every other « Ajouter » is disabled and points (`aria-describedby`) to the message saying it is
the maximum. Categories, descriptions and the card language are Unit C's.

**The summary.** Desktop: « Votre sélection » beside the cards (sticky) — her services in order,
each with its length and price, « Retirer » on each line, « Durée totale », the indicative total,
« Tarifs indicatifs · aucun paiement en ligne. », « Choisir un horaire ». Phone: the same panel at
the end of the list, and a sticky bar (count · combined length, total) with « Choisir un horaire »
that docks at the end of the step — never over the footer, above the safe area; on a narrow
phone it stacks so nothing is cut. Prices: `price_cents > 0` formatted; `0` « Tarif à
confirmer »; absent or invalid: nothing; the total only when EVERY selected price is positive,
« Total à confirmer » otherwise — never « gratuit », never a made-up amount. Over 12 hours
(`online_booking_selection_rules`), « Choisir un horaire » is not offered and says why (the server
checks it too).

**Journey and state** (`booking-flow.ts`, pure). Services → date and time → details → review →
confirmation. A change of the selection or the date clears the chosen time and its fingerprint
(and any attempt); her details are kept. « Modifier » at the review, « Modifier la sélection » at
the times and the browser's Back return to the services without starting over.

**The times of the whole selection.** `GET /api/booking/<slug>/selection/availability`: the
ids as repeated `service` parameters in her order (the order is part of the question), a date;
1 to 8 distinct well-formed ids or 400; no other parameter; the availability counters (fail
closed); never cached. The answers: SLOTS (the server's times, with its reading of the selection —
the `quote`: names, lengths, prices, fingerprint), OUT_OF_WINDOW, DOES_NOT_FIT and
SELECTION_TOO_LONG (said ONCE, with the selection's length, the longest opening and « Modifier ma
sélection » — no date strip to search through), UNKNOWN_SERVICE (that service leaves the
selection, named, back to the services), INVALID_SELECTION (back to the services), `null` or
PGRST202 (« indisponible »), an unreadable answer (« Les horaires n'ont pas pu être chargés »,
never an empty day). The browser never computes a time.

**Booking ONE appointment.** `POST /api/booking/<slug>/selection` with exactly eight keys —
`service_ids` (in order), `starts_at`, `selection_fingerprint` (the quote's), `first_name`,
`last_name`, `email`, `phone`, `idempotency_key` — at most 4 KB, the door of §10.2 in the same
order with the SAME booking counters (a selection is one booking), the Turnstile token in its
header, then `online_booking_create_selection_booking`. No price, name, length or total is ever
accepted (an extra key is a 400). Never one booking per service.

**SELECTION_CHANGED.** Nothing is booked. The flow returns to the services with « Votre sélection
a changé. Rien n'a été réservé… », reads the catalogue again, lists what changed since her review
(« Coupe : tarif 45 € → 50 € », « durée 1 h → 1 h 15 », a new name, a service no longer offered
— removed and named), shows the new values in the cards and the summary, and clears the time and
the fingerprint: she chooses a time again (a new quote, a new fingerprint) and reviews before
anything is sent. Nothing is ever booked with values she has not seen. A change seen while she
chooses a time is said the same way (« Les informations de votre sélection ont été mises à
jour ») and the time is chosen again.

**Retries and idempotency** (the rules of §10.4, unchanged): ONE key per attempt; an unknown
outcome (network, timeout, 502) freezes the request — the retry sends the SAME key and the SAME
body with a NEW Turnstile token; one request in flight; any change of what is booked starts a new
attempt. 40001 (the engine rolled back while copying the phases) is retried BY THE SERVER, with the
same body and key, within the engine's 10-second budget (Turnstile and the counters are not asked
again); if every attempt is rolled back the answer is BUSY — nothing booked, her retry sends the
same request. PGRST202 at booking time (nothing ran) is UNAVAILABLE.

**Review and confirmation.** The review shows the quote — every service in order with its length
and price (« Tarif à confirmer » for 0), the combined length, the indicative total or « Total à
confirmer », « Aucun paiement n'est demandé en ligne », the date and time, the professional, her
details. The confirmation shows what the server confirmed: ONE appointment, every booked service
in order with its length, the combined length, the start – end, the reference — no amount,
« Aucun paiement n'a été effectué en ligne ». The address shown is the profile's, as before (§11.10
when the location contract is applied).

**Session restoration** (`selection-storage.ts`). The selected service IDS only, in the tab's
session storage, per page (`beautizzy:booking-selection:<slug>`) — never a name, contact or time.
On reload they are checked against the page's current services; what is no longer offered is
left out and « Votre sélection a changé depuis votre dernière visite » is said. A storage that is
missing, full or refused reads as nothing saved. Cleared after a confirmed booking.

**Tests.** Vitest: the selection rules, totals and parser (`selection.test.ts`); the request body
and the engine's answers (`selection-request.test.ts`); the flow (`selection-flow.test.ts`: order,
the limit, stale times, fingerprint matching, idempotency, freezes, SELECTION_CHANGED, refusals,
restoration); the storage (`selection-storage.test.ts`); the capability (`booking-catalog.test.ts`:
PGRST202 only); the browser client (`selection-client.test.ts`); both endpoints (`selection/**/route.test.ts`:
the door, the counters, every answer, 40001, PGRST202, unknown outcomes, no leak); the screens
(`selection-steps.test.tsx`); the page in both server states (`page.test.tsx`).
Visual QA on an isolated production build with fictional data (320 – 1440 px): evidence outside
the repository.

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

## 12. Service publication and public service metadata (catalogue expansion, Unit A)

`supabase/migrations/20261021120000_add_online_booking_service_publication.sql` — prepared in the
repository, **NOT applied to Staging, NOT applied to Production** (§12.8 says how it may be).
Database only, functions only: the app screen (§12.6), the website's display of descriptions and
prices, and booking several services at once (§12.9; its database contract is §13) are later units.

### 12.1 What it settles

- The professional chooses, herself, which of her EXISTING catalogue services may be booked
  online. `business_bookable_services` (§8.3) stays THE record — one row = selected, no row =
  private — and is now written by its owner through ONE function instead of the SQL Editor.
- Nothing is duplicated: the catalogue Service (`docs/domain/SERVICES.md`) stays the only source of
  the name, the price, the phases, the description and the category, and its id stays the
  identifier. The selection is independent of editing the catalogue, and outside the offline sync.
- A new Service has no row: it is never published by itself.
- Each public service gains what a customer needs to choose it: `price_cents`, `description`,
  `category`.

### 12.2 Eligibility — ONE rule, decided at each read

`online_booking_service_issue(active, deleted_at, minutes)` answers `NULL` or why not:

| Reason | Meaning |
| --- | --- |
| `DELETED` | tombstoned — never listed to the owner, never offered |
| `INACTIVE` | `active = false` in the catalogue |
| `NO_DURATION` | its phases add up to 0 minute (or it has none) |
| `TOO_LONG` | more than `online_booking_rules().max_service_minutes` (12 hours) |

Three words, three meanings: **selected** (her choice, a stored row), **eligible** (THE rule,
never stored), **bookable** = selected AND eligible — exactly the public list.
`online_booking_bookable_services`, the function the slot rule and booking creation already read,
is replaced in place (same signature, same rows, same order) so that its predicate IS the rule.

- A selected service that becomes **inactive** keeps its row and leaves the public list at once
  (no slot, `UNKNOWN_SERVICE` for a booking). **Reactivated, it is offered again without a new
  choice** — the app must say so where she deactivates or selects (§12.6).
- A **deleted** service is never offered and never listed; its row is inert and is removed at her
  next change of the selection. A catalogue id is never reused by the app, so a deletion ends the
  choice in practice; the one exception is a service re-created under the SAME id before any
  change of the selection (development seeds use deterministic ids): its old row applies again.
- **Selecting** needs a service that is eligible now (`NOT_ELIGIBLE` otherwise). A choice already
  made is never judged again, so a repeated request is a no-op. **Withdrawing** never needs
  eligibility.

### 12.3 Owner RPCs

Both are `authenticated` only, `SECURITY DEFINER`, `search_path = ''`, and start with
`is_business_owner` (42501 otherwise: another professional, a signed-out session, an unknown
Business). Neither needs a subscription — like the draft of the page.

| Function | Answer |
| --- | --- |
| `online_booking_read_service_publication(business)` | the owner view; writes nothing, not even the draft |
| `online_booking_set_service_publication(business, service_ids text[], selected boolean)` | `UPDATED` + the owner view · `UNKNOWN_SERVICE` + `service_id` · `NOT_ELIGIBLE` + `service_id`, `reason` |

```jsonc
// The owner view — every LIVE service of the Business, by name then id
{ "max_service_minutes": 720, "selected_count": 3, "bookable_count": 2,
  "services": [ { "id": "…", "name": "Coupe", "type": "SERVICE", "active": true,
                  "price_cents": 4500, "duration_minutes": 45,
                  "description": "Shampooing inclus.", "category": { "id": "…", "name": "Coupes", "position": 1 },
                  "selected": true, "eligible": true, "ineligible_reason": null, "bookable": true } ] }
```

- ONE write for one service or many: a single toggle is an array of one; « Tout proposer » and
  « Tout retirer » send the ids the screen shows — never "everything", so a service created
  meanwhile on another device is never swept in. All or nothing: one unknown or ineligible id
  refuses the whole request and writes nothing.
- A service id is looked up inside THAT Business only: an id of another Business and an id that
  does not exist get the same `UNKNOWN_SERVICE`. A deleted service reads the same.
- Input: 1 to 200 ids of 1 to 200 characters, one dimension, an explicit `selected` — otherwise
  22023 before anything is read. Duplicate ids are one choice; the primary key makes a second row
  impossible.
- `description` and `category` in the owner view are the PUBLIC forms (§12.5): she sees what a
  customer would.
- The write creates the profile draft when none exists (the same empty, unpublished row the first
  read of Réservation en ligne creates): the Business lock needs a row.

Publication is still decided elsewhere and at read time: a selection on a draft, a paused page, a
page whose Plus access lapsed or any page while `ONLINE_BOOKING_PUBLICATION` is off is public
nowhere (§3). The migration reads no subscription fact and no publication state.

### 12.4 Locking and races

The write locks THE Business row of booking creation (`business_booking_profiles … FOR UPDATE`,
§9.2), before it decides anything:

| Order | Outcome |
| --- | --- |
| a booking in flight, then a withdrawal of its service | the withdrawal waits; the booking commits and stays; the service is then withdrawn |
| a withdrawal in flight, then a booking | the booking waits (3 s at most, `BUSY` after), then is refused `UNKNOWN_SERVICE` — nothing written |
| a selection in flight, then a booking of that service | the booking waits, then is booked |
| two devices of the owner at once | serialized; the last change wins; never a duplicate row, never a deadlock |

It takes no lock of its own on a synced table. The one lock it shares with the sync is the
foreign key's: selecting a service holds a key-share on THAT service row until the (short)
transaction ends, so a push of that very service waits for it and then applies — never refused; a
push of anything else, and a withdrawal, wait for nothing.

### 12.5 The public service contract

`online_booking_public_availability(slug, service, date)` keeps its signature, its
`service_role`-only grant, its gate (§8.5) and every status. Each service of its answer —
`services[]` and `service` — is built by ONE function, `online_booking_public_services`, on top of
`online_booking_bookable_services` (so a service that is not bookable cannot appear):

```jsonc
{ "id": "…", "name": "Coupe", "duration_minutes": 45,          // unchanged, same order (name, id)
  "price_cents": 4500,                                           // new
  "description": "Shampooing inclus.\nSéchage naturel.",         // new — or null
  "category": { "id": "…", "name": "Coupes", "position": 1 } }   // new — or null
```

- **`price_cents`** is the catalogue price, decided by the server. **`0` is not « free »**: the
  catalogue cannot tell a free service from a price that was never set (the onboarding starters
  are created at 0 — `SERVICES.md` §5). No pricing-status field exists; a client applies ONE
  reading: `> 0` → the price; `0` → « Tarif à confirmer ». A total is shown only when every
  selected service has a positive price (« Total indicatif »), else « Total à confirmer » with the
  known prices still visible.
- **`description`** is the existing `Service.description` — no second, public-only text. It is
  returned as plain text by `online_booking_public_text`, whoever wrote the row: line endings
  normalized to `\n` (`\r\n`, `\r`, U+2028, U+2029), at most one blank line in a row, a tab as a
  space, no control character and no bidirectional override, trimmed as the device trims, at most
  1000 characters (the catalogue's own `SERVICE_DESCRIPTION_MAX_LENGTH`, pinned by a test), `null`
  when nothing visible remains. Never markup: a client renders it as text, keeping its line breaks.
- **`category`** is the professional's own category, or `null` (none, deleted, unknown). `position`
  is her order (ties by `id`, the app's rule). A consumer that groups by category orders the
  groups itself; the list order stays name, then id.
- Never returned: a service that is not bookable (private, inactive, deleted, another Business's),
  its type, its phases, its `active` flag, a category's description, a Business or owner id.
- The booking answer (`online_booking_create_booking`) is untouched: ONE service, no price.

### 12.6 The app screen (Unit B — implemented locally, needs this migration to show anything)

« Prestations proposées en ligne » (`src/features/online-booking/services/`, route
`/online-booking-services`), opened from ONE row of Réservation en ligne placed above the
publication switches: « N sur M proposées en ligne » (offered over available, read from the
server when the screen is focused) and « Seules les prestations proposées et disponibles
apparaissent sur votre page. ». The row never takes part in « Enregistrer » or in the page state.

- **The server's list is the source of truth** (`readServicePublication`, parsed strictly by the
  gateway: `bookable` must equal `selected AND eligible` and the counts must add up, or the
  answer is refused). The device's catalogue is read for two things only: which services the
  editor can open, and how many local services the server does not list yet (« … s'affichera
  après la synchronisation »). The list is read again when the screen regains focus (back from
  the editor); it reads no sync state (`production-boundary.test.ts`).
- **Grouping** follows her catalogue (`catalogue-presentation.ts`): Services / Techniques,
  subdivided by her categories when she assigned some (hairdressing and the established
  activities); her categories in her order then « Sans catégorie » (nails, esthetics, wellness).
  Every unavailable service is gathered last under « Indisponibles en ligne ».
- **Each row**: the family pictogram, the name, « durée · prix » — « Tarif à confirmer » for a
  price of 0, never « gratuit » —, the first two lines of the description or a discreet
  « Description non renseignée », the reason when unavailable, « Aperçu en ligne », and the
  native switch.
- **Transparency**: « Aperçu en ligne » opens a sheet with exactly what a customer reads — the
  duration, the price (with the 0 € explanation), the category, the WHOLE description as the
  server publishes it (selectable text), a reminder that it comes from her catalogue and must
  contain nothing personal, its own « Proposer en ligne » switch, and « Modifier dans mon
  catalogue » (the existing editor, `/services/[serviceId]`, opened once the sheet is gone) — or,
  for a service not on this device yet, why it cannot be edited here. Nothing is stored here.
- **Saving**: a switch saves at once. While the request is in flight the switch shows the asked
  value with a spinner, every other control waits, and nothing says « proposée » until the
  server answered. The answer of a success is the new list (another device's changes included);
  a refusal (`UNKNOWN_SERVICE`, `NOT_ELIGIBLE`) or a failure puts the server's state back, says
  why in plain French and, for a refusal, reads the list again. Never retried on its own.
- **Unavailable services**: a service never chosen cannot be switched on; a chosen one that
  became unavailable keeps its switch on with « Proposée, mais désactivée … Réactivez-la … » and
  can be withdrawn — withdrawn, it can only be chosen again once available.
- **« Tout proposer » / « Tout retirer »**: a confirmation first (what becomes public, and
  when), then ONE all-or-nothing change naming exactly the ids of the list (available ones only
  for « Tout proposer »; every chosen one for « Tout retirer »); not offered beyond 200 ids.
- **One line of context** from the page state: draft (choices saved, visible once published),
  offline, bookings paused, or online — a chosen service is never presented as visible by itself.
  No subscription is needed to prepare the selection.
- **Offline / without this migration**: no list, a notice and « Réessayer » — never a spinner
  that does not end, never a fake state. A project without `20261021120000` answers PGRST202,
  which the gateway reads as `UNAVAILABLE` (« pas encore disponible sur votre compte »; the entry
  row reads « Bientôt disponible »): the build can ship before the migration.

Tests: `src/features/online-booking/services/__tests__/` (the screen against the fake server,
the grouping and bulk plans, the copy), the entry in `OnlineBookingSettingsScreen.test.tsx`, and
the parsing and error mapping in `online-booking-gateway.test.ts`.

**Staging activation of Unit B — in this order, each step separately authorized (NOT done):**

1. Review the public description of the service already selected on Staging (`studio-esthetique`,
   one row, read 2026-11-17) with its professional: nothing private or inappropriate.
2. Confirm its price of 0 reads « Tarif à confirmer » (never « Gratuit ») wherever it is shown.
3. Authorize applying `20261021120000` ALONE to Staging, by hand (§12.8) — never
   `20261020120000` with it.
4. Run the checks of `supabase/README.md` › Online booking service publication.
5. Test this screen against Staging on a device (selection, withdrawal, bulk, offline, an
   inactive service), then the website's reading.

### 12.7 Compatibility

- **The website deployed today** reads `id`, `name` and `duration_minutes` of each service and
  ignores every other key: it behaves exactly as before. **The website of unit C** (not deployed)
  reads the three new keys when they are there and shows nothing of them when they are not
  (pinned by web tests): it may be deployed before or after the migration. Deployed with the
  migration applied, it SHOWS the descriptions and prices at once — the activation gate of §12.8.
  The single-service booking API — `online_booking_public_availability(slug, service, date)`,
  `online_booking_create_booking(8 arguments)`, the slot rule, the request limits — is not
  redefined; only `online_booking_bookable_services` and `online_booking_availability_json` are
  replaced, in place, with their Sprint 3B signature.
- **App builds that predate the screen** change nothing: the selection stays what it is (on
  Staging, the one row made in the SQL Editor), and the sync is untouched — no aggregate, no
  payload key, no SQLite change.
- **Visible at once on a page online:** nothing, until a client reads the new keys.

### 12.8 Deployment — an activation gate; independent of `20261020120000`; by hand only

The migration sorts after the location privacy one (the filename rule) but does **not** need it:
it defines neither `online_booking_public_profile` nor `online_booking_owner_profile_json` (the
two functions `20261020120000` replaces), reads no address column and alters no table. Verified on
a real PostgreSQL in both orders — `20261015` … `20261019` then `20261021` (Staging as it is
today), then `20261020` on top; and the filename order — with the same final schema, functions and
privileges.

- Requires `20260914120000`, `20261010120000`, `20261015120000`, `20261017120000` and
  `20261018120000` (all applied on Staging; `20261015` – `20261019` not on Production).
- **Apply it alone, by hand** (SQL Editor: paste the one file). Never through tooling that replays
  unrecorded files: the migration history recorded on Staging stops at `20261014120000` (read
  2026-11-17; `20261015` – `20261019` were applied by hand and are not recorded), so
  `supabase db push` there would run `20261015` – `20261020` again — the location migration
  included, before its own rollout (§11.7).
- Order of this work: 1. this contract committed and verified; 2. the activation gate below
  decided; 3. Staging apply, with explicit authorization; 4. the checks of `supabase/README.md` ›
  Online booking service publication; 5. the app screen (§12.6) and the website's cards, in either
  order; 6. Production with the online-booking rollout, separately authorized.
- Nothing to roll back in data: the migration writes no row.

**Activation gate — the public metadata of services that are ALREADY selected.** Applying the
migration is itself a publication act. From that instant the answer of
`online_booking_public_availability` carries the `description`, the `price_cents` and the
`category` of every service that is bookable at that moment — a service selected BEFORE the
migration included (in the SQL Editor, on Staging) — and it needs no website change to do so.
Those descriptions are existing catalogue content: the app labels the field « Description de la
prestation (facultative) », nothing has published it until now, and a professional may have
written it for herself.

- What limits the exposure today is not a control. `anon` and `authenticated` cannot call the
  function, and the website deployed today forwards only `id`, `name` and `duration_minutes` to a
  browser (`availabilityToWire`, pinned by a test): at apply time the new values reach the website
  server and stop there. That is a property of ONE deployed consumer; the contract now defines
  them as public, and the first website that reads them shows them.
- **So the migration is not applied to a hosted project until it is decided how the services
  selected before it are reviewed, or consented to, for that exposure.** Not decided (November
  2026). It is a product decision, taken per environment; this unit chooses nothing, and the SQL
  contract is not bent to it speculatively.
- The inventory to decide on is ONE read-only query (`supabase/README.md` › Online booking
  service publication), valid before the migration: the selected services of each Business with
  their price and the length of their description. Known state: Staging has ONE selected service
  (of `studio-esthetique`), with a 35-character description and a price of 0 (read 2026-11-17);
  Production has no opt-in table yet (`20261017120000` is not applied there, as recorded in
  `supabase/README.md`), so nothing is selected there before its own rollout.
- The gate holds afterwards for any selection made in the SQL Editor instead of by the
  professional: the app screen (§12.6) is where she sees the public text before she chooses.

### 12.9 Approved decisions for booking several services

Recorded so the next units implement them as decided (November 2026). The database contract
(§13, Unit D1) and the website (§10.9, Unit D2) follow them:

- at most **eight distinct services** per booking, and **twelve hours** of cumulative duration as
  a hard ceiling;
- the complete appointment must fit inside ONE actual working interval (§8.2, rule 4);
- **one occurrence** of each service in the first public version;
- the **customer's order** of selection is kept, validated by the server — never silently sorted
  by category;
- ONE transaction validates and creates every selected service: all or nothing, one Appointment
  with one item per service;
- the browser keeps the selected ids only, for the session; the server validates them again, and
  they are cleared after a confirmed booking;
- Turnstile, the Business lock, idempotency and the request limits are kept as they are.

An appointment's items are strictly sequential in the domain timeline
(`calculateAppointmentTimeline`) and an appointment blocks its full span (§8.2, rule 5): the
availability of a selection is THE slot rule applied to the sum of its durations.

### 12.10 Tests

- Mobile (Jest): `online-booking-service-publication-migration.test.ts` — source-level guard:
  ordering; functions only; the only writes; exact function list and the two replaced signatures;
  no object shared with the location migration, in both directions; booking, slot rule, limits and
  publication gate not redefined; grants; ownership first; the Business lock before any decision;
  ONE eligibility rule; the public and owner shapes; the description limit equal to the app's;
  outside the sync; no caller in the website.
- Web (Vitest): an answer carrying the new keys parses, and is sent to the browser, exactly as
  before.
- Real PostgreSQL (scratch harness outside the repository, `supabase/README.md`): the migration
  applied onto a populated database WITHOUT `20261020120000` — no table, column, constraint,
  trigger, policy, index, privilege or row changed, seven functions new, two redefined, every
  other definition byte-identical; the deployed website's view of every answer unchanged;
  ownership (another owner, signed-out, `anon`, `service_role`, a role with no grant); foreign,
  unknown and deleted ids; every ineligibility reason; all-or-nothing; retries and duplicates;
  malformed input; bulk selection and withdrawal; deactivation, reactivation and deletion through
  the real sync push; every description, price and category edge; the subscription and
  publication gates; the single-service booking, its replay and its pull; seven races on separate
  connections; both migration orders compared; cost with 65 bookable services — 234 checks. The
  Sprint 2, 3A, 3B, 3C-A, 3C-B and location harnesses still pass with it on top (210 / 147 / 170 /
  255 + 57 / 43 / 142), their expectations changed only for the two owner grants, the seven new
  functions and the three public keys; booking creation, concurrency and request limits also pass
  in the Staging order, without `20261020120000` (255 / 57 / 43).

## 13. Booking several services — the database contract (catalogue expansion, Unit D1)

`supabase/migrations/20261022120000_add_online_booking_multi_service.sql` — prepared in the
repository, **NOT applied to Staging, NOT applied to Production** (§13.10 says how it may be).
Database and server contract. The website's multi-service flow is §10.9 (Unit D2): it calls these
functions only where they exist, and its single-service endpoints are unchanged.

### 13.1 What it settles

A customer may book an **ordered selection of 1 to 8 distinct bookable services** as **ONE
Appointment** holding one item per service, in her order, each item with the catalogue phases of
its service — the Appointment the app itself builds (`build-appointment.ts`), pulled by the device
through the normal sync. The decisions of §12.9 are implemented as recorded; nothing else is:
no package, no service twice, nothing booked during a waiting phase.

### 13.2 THE slot rule, by length — the single service unchanged

The slot rule of §8.2 is now written ONCE, by length:
`online_booking_compute_slots_for_minutes(business, minutes, date, now)` is the Sprint 3B query
word for word, the service's length a parameter (a source-level test pins the identity). The
single service uses it with its catalogue length: `online_booking_compute_slots` keeps its
signature, is replaced in place and only delegates. `online_booking_slot_is_available`,
`online_booking_availability_json`, `online_booking_public_availability`, `online_booking_book`
and `online_booking_create_booking` are not touched.

Parity is proven, not assumed: on a populated real database (two Businesses, ten services incl.
private, inactive, deleted, foreign and unknown ids, two bookings and a calendar block), every
single-service answer was recorded before the migration and compared after it — the slots of
every date from the day before the window to beyond its end at three instants, the revalidation of
the first and last start and of an off-grid one, every availability answer, the public gate of
four slugs and a replay: **2 801 recorded answers** (each a whole day of slots, a revalidation or
a whole answer) **identical**, no row of any table changed.

### 13.3 A selection — THE rules

- **Shape** (`online_booking_selection_issue`, reads no table): `EMPTY` (no id), `MALFORMED`
  (not one list, a null or blank id, edge spaces, more than 200 characters), `TOO_MANY` (more than
  8), `DUPLICATE` (one occurrence of each service).
- **Limits** in ONE place (`online_booking_selection_rules`): 8 services; the booking rules'
  maximum length (`online_booking_rules`, 12 hours) for the whole selection.
- **Resolution** (`online_booking_resolve_selection`): each id must name a bookable service of
  THIS Business — selected by the professional AND eligible, through the public service shape of
  `20261021120000` (§12.2, §12.5). Another professional's, private, inactive, deleted or unknown
  service is the same `UNKNOWN_SERVICE`, naming the first such id in the customer's order.
- **Order**: the customer's, never sorted. Items are written `item_order` 0, 1, 2… in the order of
  the ids sent; the order is part of the request (§13.6).
- **Length**: the sum of the services' catalogue phases, waiting phases included. An appointment's
  items run one after the other (`calculateAppointmentTimeline`) and an appointment blocks its full
  span (§8.2, rule 5): the selection is THE slot rule applied to that sum — the whole span inside
  one working interval, never across a break, no busy interval met (appointments, calendar
  blocks), notice, horizon, 15-minute local grid, time zone and DST as for one service.

### 13.4 The availability of a selection

`online_booking_public_selection_availability(slug, service_ids, date?)` — `service_role` only,
the gate of the single-service read (published, `booking_enabled`, `online_booking_may_be_public`
at read time; `NULL` otherwise). The answer keeps the single-service envelope (`time_zone`,
`slot_minutes`, `first_date`, `last_date`, `services` — the public catalogue) and adds:

| `status` | Meaning |
| --- | --- |
| `INVALID_SELECTION` + `reason` | the shape rule refused the ids (§13.3) |
| `UNKNOWN_SERVICE` + `service_id` | the first id that is not a bookable service of this page |
| `SELECTION_TOO_LONG` + `selection`, `max_minutes` | longer than 12 hours |
| `DOES_NOT_FIT` + `selection`, `longest_interval_minutes` | longer than every working interval of the window: no date can offer it — said once, without a date |
| `CHOOSE_DATE` + `selection` | no date asked |
| `OUT_OF_WINDOW` + `selection`, `date` | outside the booking window |
| `SLOTS` + `selection`, `date`, `slots` | the starts of THE slot rule for the whole length (may be empty: a closed or full day) |

`selection` = `{ services: [public service shape, in her order], duration_minutes, fingerprint }`.
A Business with no working interval at all in the window answers empty days, as for one service —
its agenda is closed, the selection is not "too long".

### 13.5 What the customer was shown — the fingerprint

The prices, names and lengths booked are the catalogue's at the instant of the booking, decided
under the Business lock; nothing is read from the caller. So that a customer never books something
other than what she saw, the availability answer carries a `fingerprint`: the sha256 of the
ordered snapshots `[{ id, name, duration_minutes, price_cents }]` (`'selection-v1'` prefix).
The booking sends it back; under the lock, the server reads the snapshots ONCE and compares —
a different name, length or price answers **`SELECTION_CHANGED`** and books nothing; the website
reads the availability again and shows the new values. A description or category change alters
nothing booked, so it is not part of it. A client-provided total is never accepted.

### 13.6 The booking transaction

`online_booking_create_selection_booking(slug, service_ids, starts_at, first_name, last_name,
email, phone, selection_fingerprint, idempotency_key)` → `online_booking_book_selection(…, now)`
— `service_role` only, behind the same creation switch (`ONLINE_BOOKING_CREATION`). New names;
the single-service functions are not overloaded. All or nothing, in this order:

1. READ COMMITTED (25001 otherwise); the switch is ON; the request is well-formed —
   `online_booking_selection_request_issue`: the key, the ids (§13.3), the fingerprint (64 hex
   digits), then every other field through THE single-service rule (§9.3); the slug names a
   profile;
2. the Business is LOCKED — THE lock of §9.2, 3 seconds at most (`BUSY`);
3. the idempotency key is looked up: the same request answers the stored booking again,
   byte-identical; another request under the key is `IDEMPOTENCY_KEY_REUSED`;
4. everything is decided AGAIN, from committed data: published, `booking_enabled`, THE
   publication rule; every service bookable (`UNKNOWN_SERVICE`); the snapshots read once and
   compared with the fingerprint (`SELECTION_CHANGED`); the total within 12 hours
   (`SELECTION_TOO_LONG`); the start still offered by THE slot rule for the whole length
   (`online_booking_minutes_slot_is_available` — `SLOT_UNAVAILABLE`);
5. THE Client rule of §9.3 (a reliable match reused, never modified; otherwise identity and
   contact only);
6. ONE Appointment (`SCHEDULED`, the app's staff identifier, the « Réservation en ligne » note),
   then one item per service, `<appointment>-item-<n>` in her order, each written from the
   snapshot read at step 4 (name, type, price) with its catalogue phases under their own ids;
   each item's phases must add up to its snapshot length — a catalogue change committed between
   the read and the copy fails the whole booking (40001, retry with the same key);
7. the booking record, with the ordered snapshots (§13.7).

| Answer | Meaning |
| --- | --- |
| `NULL` | nothing can be booked here (as §9.2) |
| `INVALID_REQUEST` + `field` (+ `reason` for `service_ids`) | the first unacceptable field |
| `BUSY`, `IDEMPOTENCY_KEY_REUSED`, `SLOT_UNAVAILABLE` | as §9.2 |
| `UNKNOWN_SERVICE` + `service_id` | the first id not bookable any more |
| `SELECTION_CHANGED` | a name, length or price is not what the customer was shown |
| `SELECTION_TOO_LONG` | longer than 12 hours |
| `BOOKED` + `booking` | `reference`, `services` (id, name, duration, in order), `duration_minutes` (total), `starts_at`, `ends_at`, `local_date`, `local_time`, `time_zone` — never a Business, Client or Appointment id, never an amount |

### 13.7 The booking record — additive

`online_bookings` gains ONE nullable column, `services jsonb`: the ordered snapshots
`[{ id, name, duration_minutes, price_cents }]` of a selection booking. `service_id` and
`service_name` lose their NOT NULL: they name the service of a single-service record and are
`NULL` on a selection record, which has several. A CHECK (`online_bookings_shape`) keeps exactly
one representation per record (and 1 to 8 snapshots). `duration_minutes` is the booked length in
both shapes — the sum, for a selection. Every existing row is a single-service record: it
satisfies the CHECK, keeps its values, and replays through `online_booking_book` as before. The
`services` of a selection record hash to the fingerprint it was booked with. No reader of the
record needs a service column: overlaps (§9.5) read the Appointment's phases, the client re-attach
trigger reads the contact.

### 13.8 Idempotency, concurrency, rollback

- The request hash covers the ids **in order** (`to_jsonb(ids)`), the fingerprint, the start and
  the customer key of §9.2: the same services in another order are a different request. A
  single-service key sent to the selection entry point, or the reverse, is
  `IDEMPOTENCY_KEY_REUSED` — never an answer built from the other shape.
- One booking of a Business at a time (THE lock): a single-service booking, a selection booking,
  the owner's page changes and service selection are serialized together. Twelve identical
  submissions give ONE appointment and twelve identical answers; twelve customers on one start —
  selections, or selections and single services mixed on overlapping spans — give exactly ONE
  booking; an owner withdrawing a selected service and a booking in flight wait for each other.
- A failure at any step leaves nothing: no Client, Appointment, item, phase or record.

### 13.9 Security

The Sprint 2 – 3C model unchanged: the two website functions are granted to `service_role` only,
keyed by the public slug, behind the publication gate (and the creation switch); `anon`,
`authenticated` and any other role have nothing; every internal function is revoked from every API
role; `search_path` is pinned on all of them; no table privilege changes; RLS on `online_bookings`
unchanged (enabled, no policy, no grant). Nothing of the offline sync is touched: the Appointment
reaches the device through the normal pull.

### 13.10 Deployment — after `20261021120000`; independent of `20261020120000`; by hand only

- **Requires `20261021120000`** (the eligibility rule and the public service shape), and through
  it `20261015` – `20261018`. It therefore waits for the **activation gate of §12.8**: it cannot
  be applied before the service publication migration is.
- **Does not need `20261020120000`** and shares no object with it (no function, no address
  column; a source-level test checks both directions). Verified on a real PostgreSQL: `20261015`
  … `20261019`, `20261021`, `20261022` (Staging as it would be), then `20261020` on top, compared
  with the filename order — the same functions, definitions, privileges, columns, constraints and
  grants.
- **Apply it alone, by hand** (SQL Editor, one file), after `20261021120000` — never through
  tooling that replays unrecorded files (§12.8: `supabase db push` on Staging would replay
  `20261015` – `20261020`). Re-running it is harmless.
- Nothing to roll back in data: the migration writes no row. The relaxed NOT NULL and the CHECK
  accept every existing record.
- **What applying it switches on:** nothing on a website without the D2 code; with the D2 website
  deployed, the multi-service flow of every page that accepts bookings — at once, without a
  separate flag (§10.9 › Activation, and its rollout order).

### 13.11 The website (unit D2) — §10.9

The public flow of §10.9 calls these two functions through its own endpoints, only where they
exist. The deployed single-service endpoints and flow are unchanged.

### 13.12 Tests

- Mobile (Jest): `online-booking-multi-service-migration.test.ts` — source-level guard: ordering;
  the only table change; exact function list, ONE function replaced with its signature, no
  overload; the Sprint 3B query word for word, by length; booking creation, gates, limits and
  publication not redefined; no object shared with the location migration, both directions; ONE
  place for the limits; the customer's order kept; the status order of the availability; the
  booking steps in order under ONE lock; the only writes; items from the snapshot read; per-item
  lengths; the order-sensitive request hash; no amount in the answer; grants; outside the sync;
  no caller yet. The five migration-ordering guards list the new file.
- Real PostgreSQL (scratch harness outside the repository, `supabase/README.md` › Online booking
  multi-service) — 133 checks: the single-service parity (§13.2); objects and privileges; one,
  two and eight services; the order; the span against an independent oracle; waiting phases;
  breaks, closed days, calendar blocks, notice, window; every shape refusal; every ineligible id;
  `SELECTION_TOO_LONG`, `DOES_NOT_FIT`; the public gates; the written Appointment, items, phases
  and record; the pull; idempotency (order, start, customer, fingerprint, cross-shape keys,
  legacy replay); every refusal writing nothing; price, length and name changes
  (`SELECTION_CHANGED`) — a description change still books; deactivation; the gates; the record
  CHECK; a failure on the second item and a phase change during the copy, both rolling everything
  back; a deleted Client; six races on separate connections; both migration orders compared. The
  Sprint 2, 3A, 3B, 3C-A, 3C-B, location and service publication harnesses still pass with it on
  top (230 / 147 / 170 / 255 + 57 / 43 / 142 / 234), their expectations changed only for the two
  new `service_role` grants and the five new functions their filters see; booking creation,
  concurrency and request limits also pass in the Staging order, without `20261020120000`
  (255 / 57 / 43).
