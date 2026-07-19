# 0017. Practical, Asset-Centric Threat Modelling Approach

**Status:** Accepted

## Context

The system needs a threat model covering authentication, session handling,
injection classes, RLS, credentials, uploads, supply chain, AI-specific risks,
market data integrity, calculation correctness, audit integrity, backups, and
administrative access — a broad list spanning both implemented and not-yet-built
functionality. A formal methodology (full STRIDE per data-flow-diagram element,
or a dedicated threat-modelling tool) is the industry-standard heavyweight
approach but is disproportionate for a single-developer-maintained private
application at this stage.

## Decision

Adopt a practical, asset-centric model (`threat-model.md`): each threat is
evaluated directly — asset at risk, threat scenario, existing/planned control,
residual risk, required validation — with an explicit status marker
(Implemented / Planned / Design-level) distinguishing what Foundation actually
built from what the architecture anticipates for later phases. The document is
revisited every roadmap phase and whenever a new integration/data category is
introduced, rather than on a fixed audit calendar.

## Consequences

- The model stays honest about what's actually protected today versus what's
  designed-for-later — avoiding the common failure mode of a threat model that
  claims coverage a system doesn't yet have.
- Threats against not-yet-built features (market data manipulation, AI prompt
  injection, malicious document uploads) are captured now, ensuring the relevant
  phase's implementation is designed against them from its first commit rather
  than discovering the gap after building the feature.
- Lower rigor than a formal per-data-flow STRIDE exercise — accepted as the right
  trade-off for current team size and system criticality; the residual risk of
  missing a threat class that a more exhaustive method would catch is judged
  acceptable given this system's private, small-user-base nature (see
  `vision.md`).
- Creates an explicit review obligation (every phase, every new integration) —
  without this discipline, the "Planned"/"Design-level" markers would silently
  rot into false claims of coverage.

## Alternatives Considered

- **Full STRIDE across every `data-flow.md` diagram element** — rejected as
  disproportionate process overhead for the current team size and system
  criticality; revisit if the system's risk profile changes materially (e.g.,
  real multi-user adoption at scale, or handling data subject to a specific
  regulatory regime).
- **A dedicated threat-modelling tool (e.g., Microsoft Threat Modeling Tool,
  OWASP Threat Dragon)** — rejected: introduces tooling overhead disproportionate
  to a markdown-native documentation set already serving this project well.
- **No formal threat model; handle security ad hoc via `security-principles.md`
  alone** — rejected: `security-principles.md` states principles and controls but
  doesn't systematically enumerate specific attack scenarios against specific
  assets, which is what this document adds.

## Future Review Criteria

Revisit the model's rigor if the user base or data sensitivity profile changes
materially (e.g., genuine multi-tenant usage, regulatory scope), or if an actual
security incident reveals a threat class this practical model's structure failed
to surface.
