# 0022. Baseline `'unsafe-inline'` CSP for Foundation, Not Nonce-Based

**Status:** Accepted

## Context

The Foundation brief requires "a Content-Security-Policy compatible with
the current application." Next.js supports two approaches: a nonce-based
CSP (strict, but requires every page in the app to be dynamically
rendered, since a nonce can only be generated per-request) or a
`next.config.ts`-level static CSP using `'unsafe-inline'` for
script/style-src (compatible with static rendering, less strict against
inline-script injection).

## Decision

Use the static, `'unsafe-inline'`-based CSP (`next.config.ts`), preserving
static rendering for `/`, `/sign-in`, `/access-denied`, and `/_not-found`.
Paired with strict values everywhere else: `object-src 'none'`,
`frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`,
`upgrade-insecure-requests`, plus `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security`
headers.

## Consequences

- Preserves static generation for the app's public/unauthenticated pages —
  faster, cacheable, no per-request rendering cost for pages that don't
  need it.
- Does **not** protect against inline-script injection as strongly as a
  nonce-based policy would — an XSS that manages to inject an inline
  `<script>` tag would still execute under this policy. This is an
  accepted residual risk for Foundation specifically because there is no
  current path for attacker-controlled content to reach a rendered page
  as HTML: no `dangerouslySetInnerHTML` anywhere in the codebase, no
  third-party script, no user-generated rich text yet
  (`docs/threat-model.md` §4).
- Verified working, not just configured: rebuilt and confirmed via a real
  HTTP request that all six security headers are present on a live
  response and the page still renders and functions correctly under the
  policy (`docs/implementation/foundation.md`).
- Creates an explicit future trigger: the moment any feature renders
  content whose origin isn't purely this codebase's own JSX (rich-text
  research notes, an AI-generated brief rendered as HTML rather than
  plain text, an embedded third-party script), this decision must be
  revisited — most likely by adopting the nonce-based approach at that
  point, accepting the static-rendering trade-off it requires.

## Alternatives Considered

- **Nonce-based CSP** (Next.js's stricter, officially documented option)
  — rejected for Foundation specifically because of the static-rendering
  cost: it would force `/`, `/sign-in`, `/access-denied`, and `/_not-found`
  into dynamic rendering purely for CSP strictness, a real performance
  regression for a threat this milestone doesn't yet have (no rendered
  third-party or user-controlled content).
- **No CSP at all** — rejected: even the baseline policy here is a
  meaningful improvement (blocks framing entirely, restricts script/style/
  image/connect sources to self, forces HTTPS) over having none.
- **Subresource Integrity (SRI) as an alternative strict approach** —
  rejected for now: still experimental in Next.js at time of writing, and
  solves a different problem (verifying static asset integrity) than the
  inline-script-injection concern nonces address.

## Future Review Criteria

Revisit immediately when any feature is planned that renders non-JSX-authored
content as HTML (rich-text research notes — `docs/research-workspace.md`;
AI-generated content rendered beyond plain text — `docs/decision-engine.md`)
or introduces a third-party script (analytics, a payment widget, etc. — none
currently planned, per `docs/development-roadmap.md`).
