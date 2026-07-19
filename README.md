# Arbor Lyme Capital

A private investment decision-support platform. Arbor Lyme Capital is not a
regulated financial advice product and does not execute trades — it exists
to make investment data (holdings, transactions, research, and eventually
rule-driven and AI-assisted analysis) trustworthy, structured, and
auditable for its owner.

See [`docs/vision.md`](docs/vision.md) for the full project vision.

## Current Milestone: Foundation

This repository is at the **Foundation** milestone: authentication,
settings, and audit are implemented; no financial functionality
(portfolios, transactions, market data, research, AI) exists yet. See
[`docs/implementation/foundation.md`](docs/implementation/foundation.md)
for exactly what is implemented, what is deferred, and known limitations,
and [`docs/development-roadmap.md`](docs/development-roadmap.md) for what
comes next.

## Technology Stack

- **Framework:** Next.js 16 (App Router), TypeScript 6 (strict mode)
- **Styling:** Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL, Auth, Row-Level Security)
- **Validation:** Zod
- **Testing:** Vitest (unit/component), Playwright (end-to-end)
- **Hosting:** Vercel (not yet connected — see
  [`docs/vercel-preparation.md`](docs/vercel-preparation.md))
- **Package manager:** pnpm

Full reasoning for every choice is in
[`docs/technology-stack.md`](docs/technology-stack.md).

## Prerequisites

- Node.js **24.x** (see "Node Version Management" below)
- pnpm (via Corepack, bundled with Node ≤ 24 — see below)
- A Supabase account, when you're ready to connect a real backend (not
  required to run the app locally against placeholder values for
  UI/build/test work)

## Node Version Management

This project pins Node.js 24.x via `.nvmrc`, `.node-version`, and
`package.json`'s `engines` field — see
[ADR 0018](docs/adr/0018-node-24-lts-and-pnpm-toolchain.md) for why 24.x
specifically (Active LTS, Vercel's own default runtime).

Using [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install   # reads .nvmrc
nvm use
```

Using [fnm](https://github.com/Schniz/fnm) or [volta](https://volta.sh/),
both read `.nvmrc`/`.node-version` automatically via `fnm use` / `volta`
respectively — no extra configuration needed.

**pnpm via Corepack:** Node 24.x still bundles Corepack (removed starting
Node 25 — see ADR 0018), so once you're on Node 24:

```bash
corepack enable
corepack prepare pnpm@11.15.0 --activate
```

If you're on a newer Node version without Corepack, install pnpm directly:
`npm install -g pnpm@11.15.0`.

## Installation

```bash
pnpm install
```

## Environment Setup

```bash
cp .env.example .env.local
```

Fill in the values per `.env.example`'s comments. See "Supabase Setup"
below for where the Supabase values come from. `.env.local` is
git-ignored — never commit it.

Environment variables are validated at first use via Zod
(`src/config/env.public.ts`, `src/config/env.server.ts`) — a missing or
malformed variable fails with a clear error naming which variable is
wrong, never a value. Validation is lazy (not at import time), so
`pnpm build` succeeds even without real credentials — see the comment in
`env.public.ts` for why that matters.

## Supabase Setup

**Recommended: a hosted Supabase development project, not local
Docker-based Supabase.** Full reasoning and step-by-step setup in
[`docs/local-supabase-strategy.md`](docs/local-supabase-strategy.md).

Database schema lives in `supabase/migrations/*.sql` — applied via the
Supabase CLI (`supabase db push`) once you've linked a project, per the
guide above. There is no self-service sign-up in the app UI; your first
user is created via the Supabase dashboard.

## Development Commands

```bash
pnpm dev              # start the dev server
pnpm build             # production build
pnpm start             # run a production build locally

pnpm lint               # ESLint
pnpm format             # Prettier — write
pnpm format:check        # Prettier — check only
pnpm typecheck           # tsc --noEmit

pnpm test                # unit/component tests (Vitest)
pnpm test:watch           # unit/component tests, watch mode
pnpm test:e2e              # end-to-end tests (Playwright)
pnpm test:e2e:ui             # Playwright's interactive UI mode

pnpm check                # format:check + lint + typecheck + test — the full non-destructive gate
```

## Testing

- **Unit/component tests** (`src/**/*.test.ts(x)`, Vitest): domain logic is
  tested without any framework or infrastructure (per
  [`docs/engineering-standards.md`](docs/engineering-standards.md)'s
  testing philosophy); component tests use `@testing-library/react` with a
  per-file `jsdom` environment.
- **End-to-end tests** (`e2e/*.spec.ts`, Playwright): exercise the real
  running app — sign-in, route protection, 404 handling — against
  placeholder Supabase credentials (no real project needed). One
  authenticated-journey test is prepared but skipped by default; see
  `e2e/authenticated-journey.spec.ts` for how to run it against a real
  test account.

## Architecture Documentation

Start with [`docs/architecture.md`](docs/architecture.md) and
[`docs/domain-driven-design.md`](docs/domain-driven-design.md). The full
documentation set (30+ documents covering every domain, provider
interface, the event system, security posture, threat model, and the
product specification) lives in [`docs/`](docs/), with every significant
architectural decision recorded as a numbered ADR in
[`docs/adr/`](docs/adr/).

## Deployment

Not yet connected to Vercel — see
[`docs/vercel-preparation.md`](docs/vercel-preparation.md) for the
prepared environment variables, preview/production approach, and rollback
strategy, and [`docs/deployment-strategy.md`](docs/deployment-strategy.md)
for the broader CI/CD design.

## Security

See [`SECURITY.md`](SECURITY.md) for how to report a vulnerability, and
[`docs/security-principles.md`](docs/security-principles.md) /
[`docs/threat-model.md`](docs/threat-model.md) for the project's security
posture.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
