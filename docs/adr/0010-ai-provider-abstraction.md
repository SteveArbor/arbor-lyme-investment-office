# 0010. AI Provider Abstraction

**Status:** Accepted

## Context

The `ai` domain context (briefs, opportunity generation) and `research` context
(AI Summary) both depend on a large language model vendor. The AI vendor landscape
is unusually fast-moving compared to other provider categories (market data,
storage) — model quality, pricing, and capability leadership shift frequently
across OpenAI, Anthropic, and Google (Gemini), making a hardcoded dependency on any
single vendor a specific, near-term risk rather than a theoretical one.

## Decision

Define an `AIProvider` interface (`generateText`, `generateStructured`,
`summarize`) per `provider-architecture.md`, implemented by
`OpenAIProvider`/`AnthropicProvider`/`GeminiProvider`, selected via
`settings-engine.md`'s "AI Provider" setting. `generateStructured` validates
output against a Zod schema regardless of the underlying vendor's function-calling
mechanics, so domain code never depends on a vendor-specific response shape. All
AI-generated content is stored tagged with the provider/model used
(`audit-strategy.md` — "AI Brief Generated," "AI Prompt Updated").

## Consequences

- Switching the active AI vendor (e.g., in response to a pricing or capability
  change) is a settings change plus an `infrastructure/ai/` implementation, not a
  change to `domain/ai` or `domain/research`.
- Structured-output validation via Zod means a vendor's evolving/differing
  function-calling API cannot silently change the shape of data the domain layer
  receives.
- Requires each provider implementation to handle its own prompt-formatting
  differences internally — an accepted, bounded cost per implementation.
- AI outputs being tagged with provider/model creates a reproducibility record,
  important given that identical prompts can yield different results across
  vendors/model versions over time.

## Alternatives Considered

- **Hardcode a single vendor (e.g., OpenAI only)** — rejected: given the pace of
  change in this specific vendor category, this is judged a materially higher risk
  than for other provider categories, and the abstraction cost is low relative to
  the switching cost it avoids.
- **A third-party LLM routing/gateway service** — rejected for this phase as an
  additional vendor and cost layered on top of the vendors it would route to,
  without a clear present need.

## Future Review Criteria

Revisit if a specific vendor's structured-output or function-calling capability
diverges so far from the others that the common interface becomes a genuine
limiting factor rather than a convenience — evaluated when a second real
implementation is actually built, not speculatively now.
