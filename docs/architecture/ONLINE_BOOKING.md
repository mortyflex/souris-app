# BeautIzzy — Online booking

Status: **Sprint 3A — weekly working hours** (on top of Sprint 2 — public profile and booking
settings). No availability, no slot, no booking creation, no customer, no payment exists.
Publication is closed by default. The Sprint 3A migration is applied to no Supabase project.

## 1. Shape

```text
Expo app (professional)                 Supabase                          web/ (public)
Plus › Réservation en ligne  ──RPC──▶  business_booking_profiles  ◀──RPC──  /r/<slug>  (server-only)
        images ──Storage──▶  business-public-media (public bucket) ──public URL──▶ <img>
Plus › Horaires              ──RPC──▶  business_working_hours        (nothing reads it publicly)
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
| website (`service_role`, secret key, server-only) | `online_booking_public_profile(slug)` only |
| operator (SQL Editor) | `online_booking_set_publication_enabled(boolean)`; `online_booking_working_intervals(…)` (§7.4) |

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
   Only `https://beautizzy.fr` is presented as a link to share; any other origin is labelled
   « Lien de test ». « Copier le lien » exists only for the stored address of a page that is online.

Closing again is one statement (`…_enabled(false)`): every page goes offline, nothing is rewritten.

## 5. Tests

- Mobile (Jest): `src/domain/online-booking`, `src/features/online-booking` (the working hours
  screen included), `src/infrastructure/supabase/__tests__/online-booking-*.test.ts` (gateway,
  images, the two source-level migration guards).
- Web (Vitest, `web/`): slug, answer parsing, the server lookup, page rendering and 404.
- SQL behavior: an in-process Postgres harness outside the repository (like the other migrations) —
  ownership, slug uniqueness, field separation, publication gating, lapse, Storage policies,
  backward compatibility; for Sprint 3A, ownership, day validation, overlaps, closed days,
  persistence, the CHECK against any writer, DST resolution, session-time-zone independence,
  cascade and backward compatibility (no existing object or row changed; the Sprint 2 harness
  still passes with Sprint 3A applied).

## 6. Not implemented

Availability, slots, booking creation, customers, deposits, Stripe, notifications to the
professional, customer cancellation, slug history or redirects, a time-zone editor, search
indexing of public pages, server-side cleanup of unreferenced images; for working hours: per-staff
hours, exceptional days and time off, overnight intervals, showing the hours on the public page,
and any effect on the Agenda.

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
  or the SQL Editor can call it. The ONE website read stays `online_booking_public_profile`.
