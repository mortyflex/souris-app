# BeautIzzy — Online booking

Status: **Sprint 2 — public profile and booking settings.** No availability, no working hours, no
booking creation, no customer, no payment exists. Nothing is applied to any Supabase project and
publication is closed by default.

## 1. Shape

```text
Expo app (professional)                 Supabase                          web/ (public)
Plus › Réservation en ligne  ──RPC──▶  business_booking_profiles  ◀──RPC──  /r/<slug>  (server-only)
        images ──Storage──▶  business-public-media (public bucket) ──public URL──▶ <img>
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
| owner (`authenticated`) | `online_booking_read_profile`, `online_booking_update_profile`, `online_booking_set_state`; Storage select/insert/delete inside her own media folder |
| website (`service_role`, secret key, server-only) | `online_booking_public_profile(slug)` only |
| operator (SQL Editor) | `online_booking_set_publication_enabled(boolean)` |

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

- Mobile (Jest): `src/domain/online-booking`, `src/features/online-booking`,
  `src/infrastructure/supabase/__tests__/online-booking-*.test.ts` (gateway, images, the
  source-level migration guard).
- Web (Vitest, `web/`): slug, answer parsing, the server lookup, page rendering and 404.
- SQL behavior: an in-process Postgres harness outside the repository (like the other migrations) —
  ownership, slug uniqueness, field separation, publication gating, lapse, Storage policies,
  backward compatibility.

## 6. Not implemented

Working hours, availability, slots, booking creation, customers, deposits, Stripe, notifications to
the professional, customer cancellation, slug history or redirects, a time-zone editor, search
indexing of public pages, server-side cleanup of unreferenced images.
