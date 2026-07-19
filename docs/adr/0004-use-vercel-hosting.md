# 0004. Use Vercel for Hosting

**Status:** Accepted

## Context

The application needs production hosting with minimal operational burden, fast
global delivery for a mobile-friendly experience, and a smooth preview/review
workflow for a continuously-deployed, small-team project (`deployment-strategy.md`).

## Decision

Host the Next.js application on Vercel, as specified in `technology-stack.md`, with
automatic preview deployments per pull request and production deployment from
`main`.

## Consequences

- Zero-configuration deployment for Next.js specifically, since Vercel builds the
  framework.
- Automatic, isolated preview environments per PR materially improve review
  quality (a reviewer can click through a real running instance, not just read a
  diff).
- Introduces a hosting dependency on Vercel's serverless execution model, which
  directly shaped the internal event system's two-tier design
  (`event-system.md`) — an architectural consequence worth naming explicitly, since
  it is not a cost-free choice.
- No custom server/container management required, consistent with the project's
  preference for minimal infrastructure (`architecture.md`).

## Alternatives Considered

- **AWS (via a framework like SST/Amplify)** — rejected: more setup and ongoing
  operational complexity than a small team needs for this scale.
- **Self-hosted (a VPS running Node)** — rejected: forfeits the preview-deployment
  workflow and requires manual scaling, TLS, and process management.
- **Netlify** — comparable, but Vercel's Next.js integration is deeper and more
  actively maintained by the framework's own authors.

## Future Review Criteria

Revisit if Vercel's pricing at higher traffic/usage becomes a material cost
concern, or if a specific workload (e.g., a genuinely long-running background job)
does not fit Vercel's serverless execution model and requires a supplementary
always-on process elsewhere.
