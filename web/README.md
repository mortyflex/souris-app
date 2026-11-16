# BeautIzzy — web

The BeautIzzy marketing website and the future public booking pages.

A standalone Next.js 16 application (App Router, TypeScript strict, Tailwind CSS 4). It lives in the same Git repository as the mobile application but shares no dependencies, scripts or build with it.

## Requirements

- Node.js 20.9 or later
- npm (never Bun or Yarn)

## Commands

Run every command from `web/`, never from the repository root.

| Command | What it does |
| --- | --- |
| `npm install` | Installs the web dependencies into `web/node_modules` |
| `npm run dev` | Starts the development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Serves the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates the route types, then `tsc --noEmit` |
| `npm run test` | Vitest (`src/**/*.test.ts(x)`) |
| `npm run check` | Lint, type check, tests and build — the validation to run before a review |

From the mobile app in development: the iOS Simulator opens http://localhost:3000, the standard
Android Emulator http://10.0.2.2:3000 (accepted by `allowedDevOrigins` in `next.config.ts`), and a
physical device the address set in the mobile `EXPO_PUBLIC_WEB_DEVICE_URL`
(`docs/architecture/ONLINE_BOOKING.md` §4).

## Environment variables

Copy `.env.example` to `.env.local` (gitignored). The marketing pages need nothing; the public profile pages need the two Supabase values marked below.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical origin of the site. **Indexing:** only `https://beautizzy.fr` (or `www.`) may be indexed, and on Vercel only in the Production environment (`VERCEL_ENV`); every other value — Staging, a preview, local development, or none — and every Vercel Preview, even one given the production origin by mistake, answers `X-Robots-Tag: noindex, nofollow` on every response, a `noindex` robots meta and a `Disallow: /` robots.txt (`src/lib/env/indexing.ts`). Never decided from a request header |
| `NEXT_PUBLIC_CONTACT_EMAIL` | public | Contact link on the marketing pages; empty hides it |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL — **required by `/r/[slug]`** (lookup, image URLs) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable key (unused: the browser never calls Supabase) |
| `SUPABASE_SECRET_KEY` | server only | Supabase secret key — **required by `/r/[slug]`**, read by the profile and availability lookups only |
| `ONLINE_BOOKING_AVAILABILITY_PREVIEW` | server only | `enabled` shows the read-only availability preview on `/r/[slug]/reserver` — **development / Staging only**, ignored on the production website |
| `ONLINE_BOOKING_WEB_BOOKING` | server only | `enabled` opens the public booking flow on `/r/[slug]/reserver` and its endpoints under `/api/booking/[slug]` — **development / Staging only**, ignored on the production website |
| `ONLINE_BOOKING_REQUEST_LIMIT_SECRET` | server only | Random string of 32+ characters, distinct per environment: the HMAC key of the request counters. **Required by the booking flow**: without it every booking endpoint refuses (fail closed) |
| `TURNSTILE_SITE_KEY` | server (handed to the page; public by nature) | Site key of this environment's Cloudflare Turnstile widget (managed mode, hostname = this site's). **Required by the booking flow**: without it the flow is not offered (fail closed). Cloudflare's test keys are honoured on a local site only |
| `TURNSTILE_SECRET_KEY` | server only | The widget's secret, for Cloudflare Siteverify. **Required by the booking flow**: without it every booking is refused (fail closed). Never `NEXT_PUBLIC_`, never committed |

Rules:

- public values are read through `src/lib/env/public.ts`;
- server-only values are read through `src/lib/env/server.ts`, which imports `server-only`: the build fails if a Client Component imports it;
- a secret is never prefixed `NEXT_PUBLIC_`, never committed, and never copied from the mobile `.env` files.

## Routes

| Route | Status |
| --- | --- |
| `/` | Marketing homepage |
| `/r/[slug]` | Public profile of a professional, read from Supabase on every request |
| `/r/[slug]/reserver` | The booking flow where `ONLINE_BOOKING_WEB_BOOKING=enabled` (development / Staging); elsewhere a "not yet available" notice, or the read-only availability preview with its own switch |
| `GET /api/booking/[slug]/availability` | Start times of one service on one date, for the booking flow — server-side, rate-limited, never cached |
| `POST /api/booking/[slug]` | Creates ONE booking — server-side, same-origin JSON only, Turnstile-verified, rate-limited, idempotent by key |

Public profiles live under `/r/` so that a slug can never collide with a marketing or legal page. Future legal pages (privacy, terms, legal notice) go in `src/app/(marketing)/` and inherit the marketing header and footer.

`/r/[slug]` shows only what the professional published in the mobile application (name, description, contact, logo, cover) and whether she accepts online bookings — with « Prendre rendez-vous » where the booking flow is open. Both routes answer a real HTTP 404 when no page is online at the address — unknown, malformed, draft, unpublished, or offline for lack of a verified subscription — and an error (never a 404) when the lookup itself fails. They are excluded from search indexing for now.

The lookup (`src/features/public-profile/get-public-profile.ts`) is server-only: it calls the one database function reserved to the website, `online_booking_public_profile`, with the secret key. Contract and security model: `../docs/architecture/ONLINE_BOOKING.md`.

The booking flow (`src/features/booking/`, `src/components/booking/booking-flow.tsx`, `src/app/api/booking/`) is a four-step journey — service, date and time, details, review — then the server's confirmation. The browser calls the two endpoints above only; they check the origin, the content type, the size and every field, then (booking only) the Cloudflare Turnstile token of the review step — header `X-Turnstile-Token`, verified with Siteverify, fail closed — then take the request quota in the database (`online_booking_take_request_quota`, migration `20261019120000`; fail closed when it is missing), and only then call `online_booking_create_booking` with the secret key. One idempotency key per booking attempt; an unknown outcome is retried with the same key and the same request. No price is shown (the public contract has none) and no confirmation email is sent. Contract, limits and rules: `../docs/architecture/ONLINE_BOOKING.md` §10.

The availability preview (`src/features/availability/`, `src/components/booking/availability-preview.tsx`) calls `online_booking_public_availability` the same way. It shows services, dates and start times as labels only — no form, nothing to book — and only when the page accepts bookings. A displayed time is never a guarantee (`../docs/architecture/ONLINE_BOOKING.md` §8).

Cache Components is off (`next.config.ts`): with it, a request-time lookup runs after the shell is sent and the status could only be 200.

## Structure

```text
src/
  app/
    layout.tsx            fonts, metadata
    (marketing)/          marketing shell: header, footer, homepage
    r/[slug]/             booking shell, profile and booking placeholders
  components/
    ui/                   accessible primitives (shadcn/ui conventions)
    brand/                the official logo
    marketing/            marketing sections
    booking/              public profile view, booking notice
  features/
    public-profile/       slug rules, the public profile contract, the server lookup
    booking/              the booking flow: request rules, answers, flow state, endpoints' protection
  lib/
    env/                  public and server-only environment contracts
  styles/
    tokens.css            design tokens mirrored from the mobile theme
    typography.css        brand typography: families, fluid scale, `type-*` roles
public/
  brand/                  unmodified copies of ../assets/brand logos
```

`components.json` is configured for the shadcn/ui CLI: `npx shadcn@latest add <component>` writes into `src/components/ui`.

## Design tokens

The mobile theme (`../src/shared/ui/theme/`) is the source of truth for colors, radii and shadows. `src/styles/tokens.css` mirrors only the tokens the web uses, and each variable names its original token. Add a token when a screen needs it; never invent a brand value.

Typography is the web's own brand system: Bodoni Moda (display) and Manrope (text), self-hosted by `next/font` in `src/app/layout.tsx`. Use the semantic roles of `src/styles/typography.css` (`type-headline`, `type-body`, `type-label`, …), never a raw family and size. Rules and usage: `../docs/design/BRAND_TYPOGRAPHY.md`.

## Relationship with the mobile application

- The Expo application at the repository root is the product professionals use. This application never imports from it, and it never imports from here.
- The root `tsconfig.json`, `eslint.config.js` and `jest.config.js` exclude `web/`; the root `npm run check` validates the mobile application only.
- Both applications will use the same Supabase backend. Database changes are made by hand through the root `supabase/migrations/`, never from this application.
- Deployment target: Vercel, with `web/` as the project root directory.
