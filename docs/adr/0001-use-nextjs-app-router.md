# 0001. Use Next.js App Router

**Status:** Accepted

## Context

Arbor Lyme Capital needs a web application framework that supports server-rendered
pages (for fast, SEO-irrelevant but performance-relevant initial loads), a mobile
friendly responsive UI, and a straightforward path to an API layer, while being
deployable on Vercel (a stated hosting requirement) with minimal operational
overhead for a small team.

## Decision

Use Next.js with the App Router (React Server Components, Server Actions, Route
Handlers) and TypeScript as the application framework, per `technology-stack.md`.

## Consequences

- One codebase serves both UI and backend API surface, minimizing deployable units.
- Server Components let read paths query Supabase directly on the server, reducing
  client-side JavaScript and avoiding exposure of privileged query logic.
- The team takes on the App Router's relative newness compared to the Pages
  Router — mitigated by it being the actively developed, Vercel-recommended path.
- Ties the project's server runtime model to Vercel's supported Next.js versions;
  accepted as reasonable given Vercel is already the committed host (ADR 0004).

## Alternatives Considered

- **Remix** — a comparable React meta-framework; rejected mainly because Vercel's
  first-party optimization and preview-deployment integration is strongest for
  Next.js specifically.
- **SPA (Vite + React) with a separate API service** — rejected as unnecessary
  architectural complexity (two deployables instead of one) for the current scale.
- **Pages Router** — rejected in favor of the App Router's Server Components model,
  which better fits the server-first data-fetching approach in `architecture.md`.

## Future Review Criteria

Revisit if Vercel/Next.js's roadmap diverges materially from this project's needs,
or if a genuine requirement emerges for a backend independent of the web frontend's
deployment lifecycle (see `architecture.md`'s "Why Not Microservices" section).
