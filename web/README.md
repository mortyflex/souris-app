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
| `npm run check` | Lint, type check and build — the validation to run before a review |

There is no test runner yet: nothing in this sprint has behavior worth one. Add it with the first booking logic.

## Environment variables

Copy `.env.example` to `.env.local` (gitignored). Every variable is optional today; no Supabase connection is opened.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical origin of the site |
| `NEXT_PUBLIC_CONTACT_EMAIL` | public | Contact link on the marketing pages; empty hides it |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL (unused yet) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable key (unused yet) |
| `SUPABASE_SECRET_KEY` | server only | Reserved for the future booking server modules (unused yet) |

Rules:

- public values are read through `src/lib/env/public.ts`;
- server-only values are read through `src/lib/env/server.ts`, which imports `server-only`: the build fails if a Client Component imports it;
- a secret is never prefixed `NEXT_PUBLIC_`, never committed, and never copied from the mobile `.env` files.

## Routes

| Route | Status |
| --- | --- |
| `/` | Marketing homepage |
| `/r/[slug]` | Future public profile of a professional — shows a "not yet available" notice |
| `/r/[slug]/reserver` | Future booking flow — shows a "not yet available" notice |

Public profiles live under `/r/` so that a slug can never collide with a marketing or legal page. Future legal pages (privacy, terms, legal notice) go in `src/app/(marketing)/` and inherit the marketing header and footer.

The booking routes are placeholders: no availability, no form and no reservation exists behind them, and they are excluded from search indexing.

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
    booking/              booking page components
  features/
    public-profile/       slug rules and paths
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
