# Provider Plugin Architecture

## Purpose

Every external dependency this system relies on — a market data vendor, an AI
model vendor, a notification channel, a document processor, an object store, an
identity provider — is a decision made under today's constraints (price, coverage,
API quality) that may not hold in two years. Vendors change pricing, get acquired,
degrade, or are simply outperformed by a newer entrant. A production system built to
last "many years" (per `vision.md`) must not let any single vendor's API leak into
domain logic, or replacing that vendor becomes a rewrite instead of a swap.

The pattern applied throughout is: **the domain layer depends on an interface it
owns; `infrastructure/` provides one or more implementations of that interface;
composition (in `app/`, or a small DI/bootstrap module) decides which
implementation is active, informed by `settings-engine.md` and
`feature-flags.md`.** This is the same dependency-inversion rule established in
`domain-driven-design.md`, applied specifically to third-party integrations.

This document defines the interfaces only. No implementation is written at this
stage.

## Common Design Rules Across All Providers

- Every provider interface is defined in the domain layer that consumes it (e.g.,
  `MarketDataProvider` lives in `domain/market/`), not in `infrastructure/`, because
  the _consumer_ owns the contract it needs — the implementation fulfills the
  contract, not the reverse.
- Provider methods are `async` and return domain types, never vendor-shaped
  response objects. Mapping a vendor's JSON shape into the domain's own types is
  the implementation's job, done once, at the boundary.
- Provider methods throw/return a small set of domain-defined error types (e.g.,
  `ProviderRateLimitError`, `ProviderUnavailableError`, `ProviderAuthError`), not
  raw HTTP errors — so calling code can react to "the vendor is rate-limiting us"
  the same way regardless of which vendor is active.
- Every provider is swappable via configuration (`settings-engine.md`), not a code
  change — selecting AlphaVantage vs. Polygon, or OpenAI vs. Anthropic, is a
  settings value read at composition time.
- Providers are stateless from the application's point of view — any
  caching/rate-limit tracking a provider needs internally is its own concern, not
  leaked into the interface.

## Interfaces

### `MarketDataProvider` (refined by ADR 0030 — see below)

Supplies prices and reference data to the `market` domain context. The flat
shape originally sketched here —

```ts
interface MarketDataProvider {
  getQuote(symbol: AssetSymbol): Promise<Quote>;
  getQuotes(symbols: AssetSymbol[]): Promise<Quote[]>;
  getHistoricalPrices(symbol: AssetSymbol, range: DateRange): Promise<PricePoint[]>;
  searchInstruments(query: string): Promise<InstrumentSummary[]>;
  getInstrumentDetails(symbol: AssetSymbol): Promise<InstrumentDetails>;
}
```

— turned out to leak exactly the way this document's own design rules
warn against, once a real requirement (UK OEIC/unit trust funds needing an
entirely different provider from exchange-traded equities) existed to test
it against. **`docs/adr/0030-price-engine-architecture.md`** replaces this
sketch with a security-type-routed `PriceEngine` (`domain/market/service.ts`)
sitting in front of a `SecurityPriceProviderMap` (`domain/market/providers.ts`)
— one provider slot per `SecurityType`, so equities, ETFs, investment
trusts, and funds can each have their own vendor without the consuming
domain ever knowing. A separate `FxRateProvider` handles currency
conversion, deliberately not folded into pricing itself. This is a
refinement of the decision ADR 0006 made (vendor-neutral interfaces,
selected at composition time), not a reversal of it — ADR 0006's own Future
Review Criteria anticipated this exact redesign.

**Candidate implementations:** `AlphaVantageProvider`, `PolygonProvider`,
`TwelveDataProvider`, `YahooFinanceProvider`. Different vendors have different
coverage (equities vs. crypto vs. fx) and rate limits; the interface is
deliberately vendor-neutral so a composite implementation (e.g., "use Polygon for
US equities, fall back to TwelveData for FX") is possible later without touching
`domain/market` or `domain/analytics`.

### `AIProvider`

Supplies text/structured generation to the `ai` domain context (briefs,
summaries, opportunity narratives) and to `research` (AI Summary sections).

```ts
interface AIProvider {
  generateText(prompt: PromptRequest): Promise<GeneratedText>;
  generateStructured<T>(prompt: PromptRequest, schema: ZodSchema<T>): Promise<T>;
  summarize(input: SummarizationRequest): Promise<GeneratedText>;
}
```

**Candidate implementations:** `OpenAIProvider`, `AnthropicProvider`,
`GeminiProvider`. `generateStructured` returns data validated against a Zod schema
regardless of which vendor's function-calling/JSON-mode mechanics were used
underneath — the domain never depends on a vendor-specific tool-calling format. All
AI-generated content is tagged with the provider/model used and stored (see
`audit-strategy.md` — "AI Brief Generated," "AI Prompt Updated"), both for
reproducibility and because model behavior varies and matters for review.

### `NotificationProvider`

Delivers alerts and system notifications to a user, decoupled from the channel.

```ts
interface NotificationProvider {
  send(notification: NotificationRequest): Promise<NotificationResult>;
  supportsChannel(channel: NotificationChannel): boolean;
}
```

**Candidate implementations:** `EmailNotificationProvider` (e.g., via Resend or
SendGrid), `PushNotificationProvider`, `InAppNotificationProvider` (writes to a
table the UI polls/subscribes to — likely the default/first implementation, since
it requires no external vendor). A user's channel preference is read from
`settings-engine.md` (Notification Preferences), and the `alerts` context picks
the provider(s) accordingly — a single alert may fan out to more than one channel.

### `DocumentProvider`

Handles document-specific processing beyond raw storage: text extraction, OCR, and
(future) semantic indexing, for the `documents` context.

```ts
interface DocumentProvider {
  extractText(document: StoredDocumentRef): Promise<ExtractedText>;
  generateThumbnail(document: StoredDocumentRef): Promise<ThumbnailRef>;
  index(document: StoredDocumentRef, text: ExtractedText): Promise<void>;
}
```

**Candidate implementations:** a `NullDocumentProvider` (no-op; acceptable
default for early phases where documents are stored but not processed), later a
`LocalTextExtractionProvider` (PDF/Word text extraction without OCR), and further
out an OCR-capable provider (e.g., built on a cloud vision/document API). This
interface exists from the start specifically so "future OCR support" and "future
semantic search" (`document-management.md`) are additive implementations, not
schema or domain changes.

### `StorageProvider`

Persists document/file binaries for the `documents` context (and any other future
binary asset needs).

```ts
interface StorageProvider {
  upload(file: FileInput, path: StoragePath): Promise<StoredFileRef>;
  getSignedUrl(ref: StoredFileRef, expiry: Duration): Promise<string>;
  delete(ref: StoredFileRef): Promise<void>;
}
```

**Candidate implementations:** `SupabaseStorageProvider` (the default — see
`technology-stack.md`), with a `S3StorageProvider` documented as the natural
alternative if storage needs ever outgrow Supabase's offering. `getSignedUrl`
exists so the application never serves file bytes itself or exposes a permanent
public URL — access is always time-limited and mediated by authorization.

### `AuthenticationProvider`

Abstracts identity even though Supabase Auth is the committed choice
(`technology-stack.md`, ADR 0002) — documented as an interface both for testing
(a fake implementation in unit tests) and so identity is not hardcoded throughout
the app.

```ts
interface AuthenticationProvider {
  getCurrentUser(request: RequestContext): Promise<AuthenticatedUser | null>;
  requireUser(request: RequestContext): Promise<AuthenticatedUser>;
  signOut(request: RequestContext): Promise<void>;
}
```

**Candidate implementation:** `SupabaseAuthProvider`. Unlike the other providers,
this one is not expected to be swapped in practice — Supabase Auth is deeply
integrated with Row-Level Security (`security-principles.md`), and replacing it
would be a significant undertaking regardless of interface abstraction. The
interface exists primarily for testability and to keep `app/` code from calling
the Supabase SDK directly in a hundred places, not as a realistic migration path.

## Selecting a Provider at Runtime

A small composition module (e.g., `infrastructure/providers.ts`) reads the active
provider selection from `settings-engine.md` (system-level settings, e.g. "AI
Provider" / "Market Data Provider") and constructs the corresponding
implementation, gated where relevant by `feature-flags.md` (e.g., a new provider
can be flagged on for the principal only before wider rollout). This is the single
place in the codebase that knows concrete provider classes exist — everywhere else
depends only on the interface.

## Testing Implication

Because domain code depends only on these interfaces, unit tests use lightweight
fake/in-memory implementations (e.g., a `FakeAIProvider` returning canned
responses) rather than mocking HTTP calls to a specific vendor. This keeps domain
tests fast, deterministic, and vendor-agnostic — consistent with the testing
philosophy in `engineering-standards.md`.
