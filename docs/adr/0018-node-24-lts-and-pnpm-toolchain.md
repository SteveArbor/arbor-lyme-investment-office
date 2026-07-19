# 0018. Node.js 24 LTS and pnpm Toolchain Pinning

**Status:** Accepted

## Context

The development machine used to build the Foundation milestone has Node.js
`v26.5.0` installed — the _Current_ release line, not yet an LTS release (Node 26
enters LTS in October 2026). Per explicit instruction, the currently installed
version was not assumed to be the correct production target. The project needs a
Node version that is (a) an Active LTS release, (b) supported by the chosen
Next.js version, and (c) supported by Vercel's Node.js runtime.

Verified at implementation time (July 2026):

- Node.js 24 is the current Active LTS line, supported until April 2028.
- Next.js's current stable release (16.x) requires Node.js ≥ 20.9 and is fully
  compatible with Node 22/24.
- Vercel's supported Node.js runtime versions are **24.x (default), 22.x, 20.x**
  — confirmed directly from Vercel's own documentation
  (`vercel.com/docs/functions/runtimes/node-js/node-js-versions`) — Node 24.x is
  Vercel's own default for new projects.
- Corepack (used to pin the package manager version) remains bundled with
  Node.js up to and including the 24.x line; it was removed from Node 25+ and
  must be installed separately there. This is an additional, independent reason
  to prefer Node 24 over Node 26 for this project right now — Node 26 would
  require a separate Corepack install to achieve the same package-manager pinning
  guarantee.

## Decision

Pin the project to **Node.js 24.x** via `.nvmrc`, `.node-version`, and
`package.json`'s `engines.node: "24.x"` (matching Vercel's own documented
semver-range syntax). Pin the package manager to **pnpm**, version-locked via
`package.json`'s `packageManager` field, managed through Corepack in normal
Node 24 development environments.

The local sandbox used to scaffold this milestone runs Node 26.5.0 without
Corepack available; pnpm was installed globally via `npm install -g pnpm` for
this session only, matching the pinned version. This is documented as a
known environment discrepancy — any contributor following `.nvmrc`
(`nvm use`) will get Node 24 with Corepack intact, and the discrepancy does not
affect any file committed to the repository.

## Consequences

- The project runs on Vercel's default runtime with no configuration override
  needed — reduces deployment configuration surface to zero for this concern.
- Corepack-based package manager pinning works out of the box for any
  contributor on Node 24, without a separate global pnpm install — for
  contributors who stay on newer Node versions in the future, the README
  documents the separate-install fallback.
- The pin will need to be revisited when Node 24 approaches its own end of LTS
  (April 2028) — tracked as a routine, expected future maintenance action, not a
  risk to flag now.

## Alternatives Considered

- **Use the locally installed Node 26** — rejected per explicit instruction not
  to assume the installed version is correct; Node 26 is not yet LTS and would
  require a separate Corepack install.
- **Pin to Node 22 (previous LTS)** — rejected: still supported and valid, but
  Node 24 is Vercel's own default and has a longer remaining support window
  (to April 2028 vs. Node 22's earlier EOL), making it the better long-term
  choice for a multi-year project.
- **npm or yarn instead of pnpm** — not reconsidered here; pnpm was already
  decided in `technology-stack.md` (ADR-adjacent, pre-dating this specific
  version-pinning decision) for its stricter dependency resolution, and nothing
  in this research changed that reasoning.

## Future Review Criteria

Revisit when Node 24 approaches end-of-LTS (April 2028), or sooner if Vercel's
supported version list changes materially.
