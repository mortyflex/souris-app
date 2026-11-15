# BeautIzzy — Online booking

Status: **Sprint 3B — read-only availability engine** (on top of Sprint 3A — weekly working
hours — and Sprint 2 — public profile and booking settings). Start times can be COMPUTED; nothing
can be booked: no booking creation, no customer, no payment exists. Publication is closed by
default, and the website shows availability only in a development / Staging preview (§8.6). The
Sprint 3B migration is applied to no Supabase project.

## 1. Shape

```text
Expo app (professional)                 Supabase                          web/ (public)
Plus › Réservation en ligne  ──RPC──▶  business_booking_profiles  ◀──RPC──  /r/<slug>  (server-only)
        images ──Storage──▶  business-public-media (public bucket) ──public URL──▶ <img>
Plus › Horaires              ──RPC──▶  business_working_hours        (nothing reads it publicly)
                     appointments, calendar blocks, services (synced) ─┐
                     business_bookable_services (opt-in)              ├▶ availability ◀──RPC── /r/<slug>/reserver
                                                                       ┘   (read-only)          (preview only)
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
| owner (`authenticated`) | `online_booking_read_profile`, `online_booking_update_profile`, `online_booking_set_state`, `online_booking_read_working_hours`, `online_booking_save_working_day`; Storage select/insert/delete inside her own media folder |
| website (`service_role`, secret key, server-only) | `online_booking_public_profile(slug)` and `online_booking_public_availability(slug, service, date)` (§8) only |
| operator (SQL Editor) | `online_booking_set_publication_enabled(boolean)`; `online_booking_working_intervals(…)` (§7.4); the internal availability functions and the `business_bookable_services` opt-ins (§8) |

- The table has RLS enabled, **no policy and no grant**: every access goes through a
  `SECURITY DEFINER` function with `search_path = ''`, revoked from `public`, `anon`,
  `authenticated` and `service_role`, then granted to exactly one role.
- Every owner RPC starts with `is_business_owner(p_business_id)` (42501 otherwise).
- The public read returns ten fields — `slug`, `name`, `description`, `phone`, `email`, `address`,
  `logo_path`, `cover_path`, `time_zone`, `booking_enabled` — and `NULL` for an unknown, malformed,
  draft, unpublished or offline slug alike. Never a Business id, an owner, a subscription fact, a
  client, an appointment or an amount.
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
- `booking_enabled` only changes what the public page says (« arrive bientôt » / « en pause »):
  `/r/<slug>/reserver` stays an unavailable notice until the booking engine exists.

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
  harnesses still pass with Sprint 3B applied).

## 6. Not implemented

Booking creation, holding a slot, customers, deposits, Stripe, notifications to the
professional, customer cancellation, slug history or redirects, a time-zone editor, search
indexing of public pages, server-side cleanup of unreferenced images; for working hours: per-staff
hours, exceptional days and time off, overnight intervals, showing the hours on the public page,
and any effect on the Agenda; for availability: the professional's editor of bookable services
and of the booking rules, parallel booking during processing time, multi-staff availability, a
public (non-preview) booking page, rate limiting at the edge.

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
- Bounds: one service, one local date per call; at most 96 candidates; appointments read through
  the `(business_id, start_at)` index from 7 days before the day; every input validated (the web
  validates the slug, the service id and the date before calling).

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
- The future booking creation must, in ONE transaction: lock the Business (e.g. `select … from
  business_booking_profiles where business_id = $1 for update`), call
  `online_booking_slot_is_available(business, service, starts_at, now())` (the SAME rule as the
  displayed slots), then create the request or the appointment. The professional's own sync push
  does not take that lock: an overlap with a not-yet-synchronized appointment stays possible, which
  manual scheduling already allows (`CLAUDE.md` §16); the confirmation step must surface it.
- `online_booking_compute_slots(business, service, date, now)` takes `now` explicitly: deterministic
  and testable; the public entry point passes `now()`.
