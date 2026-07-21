# Market Data Provider Evaluation

**Status:** Research and recommendation only. No implementation exists yet — see
"What this document is not" below.

## Purpose

Before building the first `MarketDataProvider` implementation
(`docs/provider-architecture.md`'s interface, currently interface-only), this
document evaluates candidate vendors against the real, current shape of the
portfolio this platform tracks — not a generic "stock API" comparison — and
recommends one.

## The requirement that actually matters most

Before comparing vendors, it's worth stating plainly what "live market data"
needs to cover for the Arbor Lyme Capital portfolio as it exists today (HL
Stocks & Shares ISA + Core Growth Portfolio, 20+ holdings):

- **7 exchange-traded securities**: NVIDIA (NASDAQ), Broadcom (NASDAQ), AMD
  (NASDAQ), e.l.f. Beauty (NYSE), Taiwan Semiconductor ADS (NYSE), ASML ordinary
  shares (Euronext Amsterdam, EUR), WPP (LSE). These trade on an exchange, have a
  ticker, and every mainstream API prices them.
- **9 UK OEIC / unit trust funds**, identified by SEDOL (`BJMD6R8`, `BJS8SJ3`,
  `B3D4SX8`, `B8N45T8`, `BKGR3F0`, `BLRZQC8`, `BN13X43`, `B8XYYQ8`, `BDFB5M5`) —
  Artemis, Fidelity, HL's own Global Bond fund, Invesco, Legal & General, Royal
  London (×2), Vanguard. These do **not** trade on an exchange at all — they are
  priced once a day, directly by the fund's administrator, via NAV.

That second category is more than half the current holding count, and this is
the finding that should shape the decision more than any single vendor's
headline pricing: **none of the mainstream, self-serve, affordably-priced
market data APIs reliably price UK OEIC/unit trust funds by SEDOL.** This isn't
a gap specific to Financial Modeling Prep — it's true of every API compared
below. It's a genuine, structural gap in this part of the market, not
carelessness on any one vendor's part: OEIC/unit trust NAV data is licensed
fund-manager-by-fund-manager (300+ managers, per Exchange Data International's
own description of the space), which is exactly the kind of aggregation a
consumer-priced API generally can't absorb into a $29–99/month plan. The
realistic options for that data are specialist B2B vendors (Exchange Data
International, Xignite, Morningstar Direct) that price by enterprise quote, not
publicly — overkill for a single-user tool, and not something to buy on
spec.

**This changes the shape of the recommendation.** Rather than "which API
prices the whole portfolio," the honest framing is: "which API is the best fit
for the exchange-traded half of the portfolio, and what do we do about funds."

## Comparison — exchange-traded securities

| | Financial Modeling Prep | Twelve Data | EODHD | Finnhub | Alpha Vantage |
|---|---|---|---|---|---|
| **Coverage (US)** | Strong — the platform's original focus | Strong | Strong | Strong | Strong for large-caps; independent reviews commonly describe coverage outside large US names as thinner/less consistent |
| **Coverage (UK)** | UK/Canada equities from the Premium tier up | Included from the Pro tier (70+ markets) | LSE explicitly listed among 70+ exchanges | Included in "60+ global exchanges" | Present via symbol search; depth unconfirmed |
| **Coverage (Europe / Euronext Amsterdam)** | Not clearly confirmed publicly; likely gated to the top ("Ultimate") tier | **Explicitly confirmed** (XAMS listed by name), included from Pro tier, "Real-time EU market data" | Not exchange-confirmed in public docs (LSE only explicitly named) | Included in general international coverage; not individually confirmed | Not confirmed |
| **Mutual fund / ETF data** | Has a mutual-fund endpoint, but oriented to US-style fund tickers | NAV data explicitly included from Pro tier — again not confirmed for UK OEIC/SEDOL specifically | "Mutual Funds Fundamentals" included from the Fundamentals tier — US-fund-oriented in practice | Explicitly supports ISIN-based lookup for global funds — the most promising signal for non-US funds, worth testing empirically | Listed as a supported asset class; depth unconfirmed |
| **Reliability** | Long-established, widely used in hobby/fintech projects; solid track record | Established, positioned as enterprise-capable (99.95% SLA at the top tier) | Established, EOD-data specialist since 2011 | Established; smaller mindshare than the others but no red flags found | Long-established; free tier reliability complaints are common in developer reviews |
| **Cost (entry tier with real-time-ish US data)** | ~$29–79/month | $79/month (Grow) — but Grow **excludes** funds/Euronext | ~$20–30/month (EOD/intraday tiers) | $11.99–99.99/month band | $49.99/month minimum; real-time US only from $99.99 |
| **Cost (tier that actually covers this portfolio's needs — UK+EU equities and an attempt at funds)** | Likely the top ("Ultimate") tier — pricing not publicly itemised beyond "custom" | **$229/month** (Pro) — the only tier here with UK+EU+funds all publicly confirmed together | ~$60–100/month (Fundamentals or ALL-IN-ONE tier) — geographic coverage at that tier not itemised in public docs | Uncertain — international/fund depth not tier-itemised publicly | Real-time US alone is $99.99; full breadth unclear |
| **API limits at that tier** | Not itemised publicly beyond bandwidth caps | 1,597 requests/minute, no daily cap | 100,000 requests/day | Scales with plan; free tier alone is 60/min | Scales with plan; per-minute only, no daily cap on paid tiers |
| **Future scalability** | Broad historical depth (30+ years), transcripts/13F data if the AI/research phases ever want it | Positioned toward enterprise (dedicated CSM, WebSocket streaming) at the top tier — comfortably has room to grow into | Strong fundamentals depth if company-level (not fund-level) research data becomes a priority | Smallest ecosystem of the group; fine for this use case, less proven at scale | Same API surface has been stable for years — low migration risk, but coverage complaints suggest a ceiling |

**A cautionary, concrete data point on vendor risk** (relevant to "future
scalability" and "reliability" both): **IEX Cloud** — a well-regarded, popular
provider in this exact space — shut down entirely in August 2024 after
operating at a loss since inception, with ~48 hours' notice extended to a
90-day wind-down. It's excluded from this comparison for that reason, and it's
the concrete example behind this document's recommendation to keep the
`MarketDataProvider` interface strictly vendor-neutral (already the design in
`docs/provider-architecture.md`) rather than letting any vendor's shape leak
into `domain/market`.

## Recommendation

**Twelve Data (Pro tier, $229/month), for exchange-traded securities only —
diverging from the initial instinct toward Financial Modeling Prep.**

Reasoning:

1. Twelve Data is the only vendor in this comparison with Euronext Amsterdam
   coverage **confirmed by name** (not inferred from a general "international
   coverage" claim) — directly relevant, since ASML's Euronext Amsterdam
   ordinary shares are already a real holding, not a hypothetical.
2. Its tier structure gates features by market/asset-class breadth, not by
   real-time-ness — which matches this platform's actual need (an
   overnight/on-open EOD refresh, not tick-by-tick streaming; this is a
   decision-support tool, not a trading terminal) better than providers whose
   pricing scales primarily around real-time latency.
3. FMP remains a perfectly reasonable second choice — broader historical depth,
   a larger community, and transcripts/13F data that could matter if the AI
   Research Assistant phase wants earnings-call context later — but its public
   pricing docs don't confirm Euronext coverage at any published tier, and its
   tier structure is more US-first than Twelve Data's.
4. **Neither solves the fund side of the portfolio**, and no realistically-priced
   vendor does. Recommendation: **do not buy fund data yet.** Keep the
   existing, deliberate "manual price mark" workflow (Milestone 2.7's Portfolio
   Performance panel) for the 9 OEIC/unit trust holdings — this is not a
   compromise forced by budget, it's the same "no invented data" principle
   this platform already applies everywhere else, now correctly extended to
   "no vendor actually has this data at a price worth paying for a
   single-user tool." Revisit if/when Exchange Data International, Xignite, or
   a similar specialist becomes worth a quoted price — a decision to make with
   a real quote in hand, not speculatively now.

$229/month (~£2,000–2,700/year depending on FX) is a real, ongoing cost worth
being explicit about before committing — this is not a "starts at $29" decision
once Euronext and fund coverage are both genuine requirements, and it should be
weighed by the user against how much daily value live pricing on the
equity/ADR half of the portfolio actually delivers versus the current
session-only manual marking workflow, before implementation begins.

## What this document is not

- Not an ADR. If this recommendation is accepted, the actual vendor selection,
  the `TwelveDataProvider` implementation shape, its position in
  `domain/market`'s existing (interface-only) design, and the fund-data gap's
  disposition belong in a new ADR written at implementation time — this
  document is the research that ADR would cite, not a replacement for it.
- Not a coverage guarantee. The Euronext Amsterdam and mutual-fund-NAV claims
  above are the vendors' own public marketing/documentation claims, verified as
  consistently stated across multiple independent sources — not verified
  against a live trial API key with this portfolio's actual SEDOL codes. That
  empirical check (a free-tier trial call for one exchange-traded holding and
  one fund SEDOL, before any paid commitment) is the natural first step of an
  implementation phase, not something to skip on the strength of documentation
  alone.
- Not a decision to write code. Per the instruction this evaluation was
  requested under, no implementation, provider class, or API key integration
  has been started.
