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
| `NEXT_PUBLIC_SITE_URL` | public | Canonical origin of the site |
| `NEXT_PUBLIC_CONTACT_EMAIL` | public | Contact link on the marketing pages; empty hides it |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL — **required by `/r/[slug]`** (lookup, image URLs) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable key (unused: the browser never calls Supabase) |
| `SUPABASE_SECRET_KEY` | server only | Supabase secret key — **required by `/r/[slug]`**, read by the profile and availability lookups only |
| `ONLINE_BOOKING_AVAILABILITY_PREVIEW` | server only | `enabled` shows the read-only availability preview on `/r/[slug]/reserver` — **development / Staging only**, ignored on the production website |

Rules:

- public values are read through `src/lib/env/public.ts`;
- server-only values are read through `src/lib/env/server.ts`, which imports `server-only`: the build fails if a Client Component imports it;
- a secret is never prefixed `NEXT_PUBLIC_`, never committed, and never copied from the mobile `.env` files.

## Routes

| Route | Status |
| --- | --- |
| `/` | Marketing homepage |
| `/r/[slug]` | Public profile of a professional, read from Supabase on every request |
| `/r/[slug]/reserver` | Future booking flow — a "not yet available" notice for an online profile; with the preview switch (Staging / development), a read-only availability preview |

Public profiles live under `/r/` so that a slug can never collide with a marketing or legal page. Future legal pages (privacy, terms, legal notice) go in `src/app/(marketing)/` and inherit the marketing header and footer.

`/r/[slug]` shows only what the professional published in the mobile application (name, description, contact, logo, cover) and whether she accepts online bookings. No availability, form or reservation exists behind it. Both routes answer a real HTTP 404 when no page is online at the address — unknown, malformed, draft, unpublished, or offline for lack of a verified subscription — and an error (never a 404) when the lookup itself fails. They are excluded from search indexing for now.

The lookup (`src/features/public-profile/get-public-profile.ts`) is server-only: it calls the one database function reserved to the website, `online_booking_public_profile`, with the secret key. Contract and security model: `../docs/architecture/ONLINE_BOOKING.md`.

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
  lib/
    env/                  public and server-only environment contracts
  styles/
    tokens.css            design tokens mirrored from the mobile theme
public/
  brand/                  unmodified copies of ../assets/brand logos
```

`components.json` is configured for the shadcn/ui CLI: `npx shadcn@latest add <component>` writes into `src/components/ui`.

## Design tokens

The mobile theme (`../src/shared/ui/theme/`) is the source of truth. `src/styles/tokens.css` mirrors only the tokens the web uses, and each variable names its original token. Add a token when a screen needs it; never invent a brand value.

Typography: Plus Jakarta Sans (the mobile family) for text, Instrument Serif (web-only) for editorial headings.

## Relationship with the mobile application

- The Expo application at the repository root is the product professionals use. This application never imports from it, and it never imports from here.
- The root `tsconfig.json`, `eslint.config.js` and `jest.config.js` exclude `web/`; the root `npm run check` validates the mobile application only.
- Both applications will use the same Supabase backend. Database changes are made by hand through the root `supabase/migrations/`, never from this application.
- Deployment target: Vercel, with `web/` as the project root directory.
