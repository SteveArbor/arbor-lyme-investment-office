-- Phase 2.5: Production Readiness demonstration data.
--
-- A representative "Core Growth Portfolio": NVIDIA, Microsoft, Amazon,
-- Meta, Alphabet, TSMC, ASML, plus cash. Every derived figure below
-- (blended_fair_value, decision scores/rating, resulting holdings,
-- portfolio cash) was computed with the application's own formulas
-- (domain/valuation/model.ts, domain/decision/model.ts,
-- domain/trading/model.ts), not invented ad hoc — see
-- docs/implementation/production-readiness.md for the worked figures.
-- Illustrative prices/fundamentals only, not live market data (this
-- application has no market-data provider by design -- see
-- docs/engineering-standards.md's "no invented data" principle, which
-- applies to what the *application* stores as fact; this is clearly
-- demo fixture data, seeded directly, not something the app claims to
-- have sourced live).
--
-- Usage: this file references a single owner via the psql variable
-- `owner_id`, because there is no self-service sign-up
-- (docs/implementation/foundation.md) -- you must create your first real
-- user first (Supabase Dashboard -> Authentication -> Users -> Add user),
-- then run:
--
--   psql "$DATABASE_URL" -v owner_id="'<that user's UUID>'" -f supabase/seed.sql
--
-- or paste this file into the Supabase SQL Editor with the top `\set`
-- line's placeholder replaced by the real UUID (the SQL Editor doesn't
-- support psql's `-v`, so replace :'owner_id' throughout, or just edit
-- the \set line below to a literal UUID before running).
--
-- Idempotent: safe to re-run against the same project (deletes this
-- owner's existing companies/portfolios and everything that cascades
-- from them first).

-- Only falls back to the placeholder if -v owner_id=... wasn't passed on
-- the command line -- otherwise this \set would unconditionally clobber
-- it, since psql processes script-body \set after -v assignments.
\if :{?owner_id}
\else
\set owner_id 'REPLACE_WITH_REAL_USER_UUID'
\endif

-- ---- Clean slate for this owner (cascades to research/theses/valuations/
-- decisions/holdings/transactions/journal entries via their FKs) ----
delete from public.portfolios where owner_id = :'owner_id';
delete from public.companies where owner_id = :'owner_id';

-- ---- Companies ----

insert into public.companies
  (id, owner_id, name, ticker, exchange, sector, industry, currency, status, watchlist, notes, profile)
values
  ('10000000-0000-4000-8000-000000000001', :'owner_id', 'NVIDIA Corporation', 'NVDA', 'NASDAQ', 'Technology', 'Semiconductors', 'USD', 'holding', false,
   'Core AI infrastructure position. Sized for volatility given valuation sensitivity to capex cycle sentiment.',
   'The dominant supplier of GPUs and networking for AI training and inference, with CUDA as a deep, multi-year software moat around its hardware.'),
  ('10000000-0000-4000-8000-000000000002', :'owner_id', 'Microsoft Corporation', 'MSFT', 'NASDAQ', 'Technology', 'Software—Infrastructure', 'USD', 'holding', false,
   'Anchor compounder position. Lowest-conviction-risk name in the book.',
   'Diversified enterprise software and cloud infrastructure leader (Azure, Microsoft 365, GitHub Copilot) with deep switching-cost moats across its product suite.'),
  ('10000000-0000-4000-8000-000000000003', :'owner_id', 'Amazon.com, Inc.', 'AMZN', 'NASDAQ', 'Consumer Discretionary', 'Internet Retail', 'USD', 'holding', false,
   'AWS is the real driver of this thesis; retail is the scale moat that funds it.',
   'E-commerce and logistics scale leader whose AWS cloud segment now drives the majority of consolidated operating profit.'),
  ('10000000-0000-4000-8000-000000000004', :'owner_id', 'Meta Platforms, Inc.', 'META', 'NASDAQ', 'Technology', 'Internet Content & Information', 'USD', 'holding', false,
   'Watching Reality Labs spend discipline closely -- see monitoring metrics.',
   'Social and advertising platform (Facebook, Instagram, WhatsApp) reinvesting core cash flow into AI-driven ad targeting and long-duration AR/VR bets.'),
  ('10000000-0000-4000-8000-000000000005', :'owner_id', 'Alphabet Inc.', 'GOOGL', 'NASDAQ', 'Technology', 'Internet Content & Information', 'USD', 'holding', false,
   'Smallest conviction-adjusted position of the mega-cap names given generative-AI search disruption risk.',
   'Search and advertising leader with a fast-growing, increasingly profitable cloud segment (GCP) as a third pillar alongside YouTube.'),
  ('10000000-0000-4000-8000-000000000006', :'owner_id', 'Taiwan Semiconductor Manufacturing Company', 'TSM', 'NYSE', 'Technology', 'Semiconductors', 'USD', 'holding', false,
   'Position sized down relative to conviction to reflect geopolitical concentration risk.',
   'The world''s leading advanced-node semiconductor foundry; effectively the sole manufacturer of the most advanced logic chips for NVIDIA, Apple, and AMD.'),
  ('10000000-0000-4000-8000-000000000007', :'owner_id', 'ASML Holding N.V.', 'ASML', 'NASDAQ', 'Technology', 'Semiconductor Equipment & Materials', 'USD', 'holding', false,
   'Smallest position by share count given high per-share price; monitor China export-control developments.',
   'Sole global supplier of EUV lithography systems, an irreplaceable chokepoint in the leading-edge semiconductor supply chain.');

-- ---- Portfolio ----

insert into public.portfolios (id, owner_id, name, cash)
values ('20000000-0000-4000-8000-000000000001', :'owner_id', 'Core Growth Portfolio', 600000.00);

-- ---- Transactions (chronological) ----
-- Directly inserted here as the table owner, seeding administratively --
-- not through the app's atomic RPCs (docs/adr/0025), which are the only
-- path an authenticated *application user* has. quantity/average_cost
-- on the corresponding holdings rows below are hand-computed with the
-- same weighted-average-cost/realised-gain formulas the RPCs use
-- (domain/trading/model.ts), so the ledger and the materialized holding
-- stay consistent, matching what the real write path would have produced.

insert into public.transactions
  (owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain, occurred_at, notes)
values
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'buy', 400, 115.00, -46000.00, null, '2025-11-10T14:30:00Z', 'Initial position -- AI infrastructure buildout thesis'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'buy', 200, 128.50, -25700.00, null, '2026-02-18T15:05:00Z', 'Added on post-earnings pullback'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'sell', 150, 142.00, 21300.00, 3375.00, '2026-06-25T16:00:00Z', 'Trimmed into strength to manage position size after re-rating'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'buy', 150, 410.00, -61500.00, null, '2025-11-15T14:35:00Z', 'Initial position -- anchor compounder'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'dividend', null, null, 124.50, null, '2026-03-12T00:00:00Z', 'Quarterly dividend, $0.83/share'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'buy', 250, 185.00, -46250.00, null, '2025-12-02T15:15:00Z', 'Initial position -- AWS-led thesis'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'buy', 100, 495.00, -49500.00, null, '2025-12-10T14:40:00Z', 'Initial position'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'buy', 50, 525.00, -26250.00, null, '2026-03-05T15:20:00Z', 'Added after ad-revenue reacceleration'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'buy', 300, 165.00, -49500.00, null, '2026-01-08T14:45:00Z', 'Initial position'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'buy', 200, 172.00, -34400.00, null, '2026-01-20T13:50:00Z', 'Initial position -- sized down for geopolitical risk'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 'buy', 60, 720.00, -43200.00, null, '2026-02-02T09:10:00Z', 'Initial position -- EUV monopoly thesis'),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', null, 'cash_adjustment', null, null, 50000.00, null, '2026-04-01T00:00:00Z', 'Additional capital contribution');

-- ---- Holdings (resulting state, weighted-average cost by hand) ----
-- NVDA: (400@115.00 + 200@128.50)=600 -> avg 119.50; sell 150 doesn't
--   change avg cost of the remaining 450.
-- META: (100@495.00 + 50@525.00)=150 -> avg 505.00.
-- Portfolio cash: 600000.00 opening - 46000 - 25700 + 21300 - 61500 +
--   124.50 - 46250 - 49500 - 26250 - 49500 - 34400 - 43200 + 50000
--   = 289124.50 (matches the portfolios row below).

insert into public.holdings (owner_id, portfolio_id, company_id, quantity, average_cost, target_allocation_percent)
values
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 450, 119.50, 0.12),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 150, 410.00, 0.12),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 250, 185.00, 0.10),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 150, 505.00, 0.10),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 300, 165.00, 0.10),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 200, 172.00, 0.08),
  (:'owner_id', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 60, 720.00, 0.08);

update public.portfolios set cash = 289124.50 where id = '20000000-0000-4000-8000-000000000001';

-- ---- Research notes ----

insert into public.research_notes
  (owner_id, company_id, business_overview, investment_thesis, economic_moat, management, financial_strength, capital_allocation, growth_drivers, risks, monitoring_metrics, notes)
values
  (:'owner_id', '10000000-0000-4000-8000-000000000001',
   'Designs GPUs and networking silicon; over 85% of revenue now from Data Center (AI training/inference), with Gaming, Professional Visualization, and Automotive as smaller segments.',
   'AI datacenter buildout is a multi-year infrastructure cycle, not a one-time spike -- NVIDIA captures the largest share of that capex via compute (Hopper/Blackwell) and networking (NVLink/InfiniBand) together.',
   'CUDA''s decade-plus software ecosystem lock-in, plus full-stack integration (chip + interconnect + software), makes switching costs for large training clusters very high.',
   'Jensen Huang (founder-CEO) has compounding execution credibility across three architecture generations; capital allocation has been disciplined despite explosive growth.',
   'Gross margins in the mid-70s%, net cash balance sheet, FCF conversion strong even through the current capex-heavy investment phase.',
   'Buybacks resumed alongside R&D reinvestment; no meaningful M&A risk to the balance sheet.',
   'Blackwell ramp, sovereign AI demand, inference workloads scaling as a second growth vector beyond training.',
   'Hyperscaler capex cyclicality, customer concentration (top 4 customers a large revenue share), export-control risk to China, custom-silicon (ASIC) competition from hyperscalers themselves.',
   'Data Center revenue growth QoQ, gross margin trend (Blackwell ramp costs), hyperscaler capex guidance on earnings calls, CUDA developer count.',
   'Highest-conviction, highest-volatility name in the book -- sized accordingly.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000002',
   'Diversified enterprise software and cloud company: Microsoft 365, Azure, LinkedIn, GitHub, Dynamics, and Windows/Gaming.',
   'Azure and AI Copilot attach are expanding wallet share within an already-entrenched enterprise customer base, while the core productivity suite remains close to un-displaceable.',
   'Deep switching costs across the Microsoft 365/Windows/Azure stack for enterprise IT; OpenAI partnership gives a durable AI-model relationship without full model-development capex exposure.',
   'Satya Nadella''s cloud-and-AI pivot has been the standout capital-allocation and cultural turnaround of the last decade in mega-cap tech.',
   'AA-rated balance sheet quality, consistent double-digit FCF growth, dividend growing for two decades.',
   'Disciplined M&A (Activision closed cleanly), consistent buyback + growing dividend alongside heavy AI infrastructure capex.',
   'Azure growth reacceleration, Copilot seat expansion, Gaming/Activision cross-sell.',
   'AI capex intensity pressuring near-term margins and FCF, regulatory scrutiny (EU/US antitrust), Azure growth deceleration risk if AI capex doesn''t convert to revenue fast enough.',
   'Azure revenue growth rate, Microsoft 365 Copilot seat count disclosures, capex-to-revenue ratio trend.',
   'Lowest single-name risk in the book; the position most likely to be added to on weakness.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000003',
   'E-commerce and logistics at global scale (North America and International retail segments) plus AWS, the market-leading cloud infrastructure platform.',
   'AWS margin expansion and reacceleration is the real driver of forward earnings growth; retail operating margin improvement (regionalized fulfillment) is the underappreciated second leg.',
   'Logistics/fulfillment scale that is extremely capital-intensive to replicate, plus AWS switching costs once workloads are architected on the platform.',
   'Andy Jassy''s AWS background gives credibility to the cost-discipline push across retail after the 2021-2022 overbuild.',
   'Retail operating margins recovering meaningfully post-overbuild; AWS remains the highest-margin, highest-growth segment.',
   'Continued fulfillment-network capex, AWS datacenter capex, disciplined post-overbuild cost structure.',
   'AWS AI workload growth, advertising business scaling as a third profit pillar, international segment reaching sustained profitability.',
   'AWS growth deceleration if enterprise cloud migration slows, retail margin give-back if competitive intensity increases, heavy ongoing capex needs.',
   'AWS segment operating margin trend, advertising revenue growth, international segment profitability.',
   'Core AWS-led thesis; retail margin recovery is the swing factor for the stock re-rating further.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000004',
   'Social/advertising platform business (Facebook, Instagram, WhatsApp, Messenger) plus the Reality Labs AR/VR/metaverse investment segment.',
   'Core Family of Apps advertising business is reaccelerating on AI-driven ad ranking and Reels monetization, funding a long-duration optionality bet in Reality Labs.',
   'Network effects across ~3.9B monthly users and best-in-class ad-targeting infrastructure remain very difficult to displace at scale.',
   'Mark Zuckerberg''s willingness to sustain heavy Reality Labs losses is the single biggest capital-allocation debate around this name.',
   'Core ad business generates enormous free cash flow; Reality Labs losses are fully self-funded without balance-sheet stress.',
   'Aggressive AI infrastructure capex plus continued Reality Labs investment; buybacks resumed but secondary to reinvestment.',
   'AI-driven ad load/targeting improvements, Reels/Threads monetization ramp, WhatsApp Business API monetization in emerging markets.',
   'Reality Labs cash burn with no clear profitability timeline, regulatory/antitrust pressure (EU DMA), TikTok-style competitive disruption to engagement.',
   'Family of Apps ad revenue growth and pricing, Reality Labs operating loss trend, daily active people growth.',
   'Watching Reality Labs spend discipline closely -- would reconsider position size if losses accelerate without a credible monetization path.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000005',
   'Search and advertising (Google Search, YouTube, Google Network) plus Google Cloud (GCP) and Other Bets.',
   'Search remains far more resilient to generative-AI disruption than the bear case assumes, while GCP is scaling into genuine profitability as a third growth pillar.',
   'Search distribution defaults (mobile, browser), YouTube''s creator/advertiser ecosystem scale, and GCP''s data/AI-model integration (Gemini, TPUs) with existing enterprise customers.',
   'Sundar Pichai has been slower than Microsoft/Meta to monetize AI investment visibly, a real point of investor skepticism.',
   'Enormous net cash position, GCP now solidly profitable, Search cash generation remains best-in-class.',
   'Heavy AI/TPU capex, continued buybacks, first-ever dividend introduced -- a signal of capital-allocation maturity.',
   'GCP margin expansion, Gemini model competitiveness, YouTube subscription/advertising growth.',
   'Generative AI search competitors (ChatGPT, Perplexity) eroding query volume or ad monetization per query over time; antitrust remedies (US search case) could force structural changes.',
   'Search query volume/monetization trends, GCP revenue growth and margin, capex-to-revenue ratio.',
   'Smallest conviction-adjusted position among the mega-caps given the AI-search-disruption narrative -- watching query trends closely.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000006',
   'The world''s largest dedicated semiconductor foundry, manufacturing chips designed by NVIDIA, Apple, AMD, and others at the most advanced process nodes.',
   'TSMC''s process-node leadership is effectively unchallenged at the leading edge, and AI/HPC demand is driving record utilization and pricing power even as it diversifies fab geography.',
   'Foundry-model scale and process-node lead (3nm/2nm) that Samsung and Intel Foundry have not closed despite years of trying; customers are technically locked in for multi-year product cycles.',
   'C.C. Wei has continued Morris Chang''s disciplined, technology-first capital allocation culture.',
   'Best-in-class gross margins for a foundry business, strong FCF even through the current multi-year capex supercycle.',
   'Heavy leading-edge capex (Arizona, Japan, and continued Taiwan expansion) to diversify geographic footprint while defending technology lead.',
   'AI/HPC chip demand, 2nm ramp, advanced packaging (CoWoS) capacity additions.',
   'Geopolitical concentration risk in Taiwan is the single largest unhedged risk to the thesis; any disruption to Taiwan operations would be a structural, not cyclical, problem.',
   'Leading-edge node revenue mix, capacity utilization rate, Arizona/Japan fab ramp progress, geopolitical developments around Taiwan.',
   'Position sized meaningfully below conviction level specifically because of geopolitical concentration risk, not business-quality doubt.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000007',
   'Sole global manufacturer of EUV (extreme ultraviolet) lithography systems, the equipment required to produce the most advanced semiconductor chips.',
   'ASML sits at an irreplaceable chokepoint in the global chip supply chain; High-NA EUV extends that lead through the next multi-year node transition.',
   'Multi-decade technology lead with no viable competitor for EUV; an entire generation of engineering and supplier-ecosystem knowledge is embedded in the machines.',
   'Christophe Fouquet (new CEO, succeeding Peter Wennink) has continued the long-cycle capital-allocation discipline the business is known for.',
   'Very high gross margins, strong net cash position, order backlog provides multi-year revenue visibility.',
   'Heavy, multi-year R&D investment in High-NA EUV; capital returns (dividend + buybacks) alongside continued reinvestment.',
   'High-NA EUV adoption cycle, China export-restriction-exempt (mature node) system demand as a partial offset, overall wafer fab equipment cycle recovery.',
   'China export restrictions cap a meaningful and growing portion of addressable revenue; extremely long sales/installation cycles make near-term results lumpy.',
   'Bookings/order backlog trend, High-NA EUV system shipment cadence, China revenue mix versus export-control developments.',
   'Smallest position by share count given the very high per-share price; monitoring China export-control policy closely.');

-- ---- Theses ----

insert into public.theses (owner_id, company_id, statements, overall_status)
values
  (:'owner_id', '10000000-0000-4000-8000-000000000001', $$[
    {"description": "AI datacenter buildout is a multi-year infrastructure cycle still in its early innings, not a one-time demand spike, and NVIDIA captures the largest share of that capex.", "confidence": 0.90, "status": "strengthening"},
    {"description": "CUDA's software ecosystem lock-in gives NVIDIA a durable moat around its hardware lead that is very difficult for competitors to replicate.", "confidence": 0.90, "status": "stable"},
    {"description": "Customer concentration among a handful of hyperscalers makes the revenue base sensitive to any single large customer's capex pause.", "confidence": 0.40, "status": "weakening"}
  ]$$::jsonb, 'strengthening'),
  (:'owner_id', '10000000-0000-4000-8000-000000000002', $$[
    {"description": "Azure and AI Copilot attach are expanding wallet share within an already-entrenched enterprise customer base.", "confidence": 0.60, "status": "strengthening"},
    {"description": "Deep switching costs across the Microsoft 365/Windows/Azure stack keep the core enterprise franchise durable.", "confidence": 0.90, "status": "stable"},
    {"description": "AI infrastructure capex intensity is pressuring near-term free cash flow margins more than initially guided.", "confidence": 0.45, "status": "weakening"}
  ]$$::jsonb, 'stable'),
  (:'owner_id', '10000000-0000-4000-8000-000000000003', $$[
    {"description": "AWS margin expansion and growth reacceleration is the primary driver of forward consolidated earnings growth.", "confidence": 0.80, "status": "strengthening"},
    {"description": "Fulfillment and logistics scale remains a durable, capital-intensive-to-replicate moat around the retail business.", "confidence": 0.85, "status": "stable"},
    {"description": "Advertising has scaled into a genuine, high-margin third profit pillar alongside AWS and retail.", "confidence": 0.75, "status": "strengthening"}
  ]$$::jsonb, 'strengthening'),
  (:'owner_id', '10000000-0000-4000-8000-000000000004', $$[
    {"description": "Core advertising business is reaccelerating on AI-driven ad ranking and Reels monetization improvements.", "confidence": 0.80, "status": "strengthening"},
    {"description": "Network effects across the Family of Apps' ~3.9B monthly users remain very difficult for competitors to displace.", "confidence": 0.85, "status": "stable"},
    {"description": "Reality Labs continues to burn significant cash with no clear near-term path to profitability.", "confidence": 0.65, "status": "weakening"}
  ]$$::jsonb, 'stable'),
  (:'owner_id', '10000000-0000-4000-8000-000000000005', $$[
    {"description": "Core Search remains more resilient to generative-AI-answer-engine disruption than the bear case assumes.", "confidence": 0.65, "status": "stable"},
    {"description": "Google Cloud is scaling into genuine, expanding profitability as a third growth pillar alongside Search and YouTube.", "confidence": 0.80, "status": "strengthening"},
    {"description": "Generative AI search competitors are a genuine long-term risk to query volume and monetization per query.", "confidence": 0.60, "status": "weakening"}
  ]$$::jsonb, 'stable'),
  (:'owner_id', '10000000-0000-4000-8000-000000000006', $$[
    {"description": "Leading-edge process node leadership (3nm/2nm) remains effectively unchallenged, with no near-term competitor closing the gap.", "confidence": 0.90, "status": "stable"},
    {"description": "AI/HPC chip demand is driving record capacity utilization and pricing power even as fab geography diversifies.", "confidence": 0.85, "status": "strengthening"},
    {"description": "Geopolitical concentration risk in Taiwan remains the single largest, largely unhedged risk to the thesis.", "confidence": 0.70, "status": "weakening"}
  ]$$::jsonb, 'stable'),
  (:'owner_id', '10000000-0000-4000-8000-000000000007', $$[
    {"description": "ASML remains the sole global supplier of EUV lithography systems required for the most advanced chips.", "confidence": 0.95, "status": "stable"},
    {"description": "High-NA EUV rollout extends the technology lead through the next multi-year node transition cycle.", "confidence": 0.80, "status": "strengthening"},
    {"description": "China export restrictions cap a meaningful and growing portion of addressable revenue.", "confidence": 0.55, "status": "weakening"}
  ]$$::jsonb, 'stable');

-- ---- Valuations ----
-- Scenario fair values and blended_fair_value below match
-- calculateScenarioFairValue/calculateBlendedFairValue
-- (domain/valuation/model.ts) exactly for the inputs shown -- see
-- docs/implementation/production-readiness.md for how they were derived.

insert into public.valuations
  (owner_id, company_id, projection_years, required_return, margin_of_safety, bear, base, bull, blended_fair_value)
values
  (:'owner_id', '10000000-0000-4000-8000-000000000001', 5, 0.12, 0.25,
   '{"epsAssumption": 3.00, "growthRateAssumption": 0.15, "terminalMultiple": 28, "discountRate": 0.10, "probability": 0.25, "fairValue": 104.9071}'::jsonb,
   '{"epsAssumption": 3.00, "growthRateAssumption": 0.28, "terminalMultiple": 38, "discountRate": 0.09, "probability": 0.50, "fairValue": 254.5788}'::jsonb,
   '{"epsAssumption": 3.00, "growthRateAssumption": 0.38, "terminalMultiple": 48, "discountRate": 0.085, "probability": 0.25, "fairValue": 479.3020}'::jsonb,
   273.3417),
  (:'owner_id', '10000000-0000-4000-8000-000000000002', 5, 0.10, 0.20,
   '{"epsAssumption": 14.50, "growthRateAssumption": 0.08, "terminalMultiple": 24, "discountRate": 0.085, "probability": 0.25, "fairValue": 340.0551}'::jsonb,
   '{"epsAssumption": 14.50, "growthRateAssumption": 0.14, "terminalMultiple": 30, "discountRate": 0.08, "probability": 0.50, "fairValue": 570.0261}'::jsonb,
   '{"epsAssumption": 14.50, "growthRateAssumption": 0.19, "terminalMultiple": 34, "discountRate": 0.075, "probability": 0.25, "fairValue": 819.4820}'::jsonb,
   574.8973),
  (:'owner_id', '10000000-0000-4000-8000-000000000003', 5, 0.12, 0.25,
   '{"epsAssumption": 6.50, "growthRateAssumption": 0.12, "terminalMultiple": 26, "discountRate": 0.095, "probability": 0.25, "fairValue": 189.1935}'::jsonb,
   '{"epsAssumption": 6.50, "growthRateAssumption": 0.20, "terminalMultiple": 33, "discountRate": 0.09, "probability": 0.50, "fairValue": 346.8974}'::jsonb,
   '{"epsAssumption": 6.50, "growthRateAssumption": 0.27, "terminalMultiple": 38, "discountRate": 0.085, "probability": 0.25, "fairValue": 542.7088}'::jsonb,
   356.4243),
  (:'owner_id', '10000000-0000-4000-8000-000000000004', 5, 0.11, 0.20,
   '{"epsAssumption": 27.00, "growthRateAssumption": 0.06, "terminalMultiple": 17, "discountRate": 0.09, "probability": 0.25, "fairValue": 399.2175}'::jsonb,
   '{"epsAssumption": 27.00, "growthRateAssumption": 0.13, "terminalMultiple": 22, "discountRate": 0.085, "probability": 0.50, "fairValue": 727.8300}'::jsonb,
   '{"epsAssumption": 27.00, "growthRateAssumption": 0.19, "terminalMultiple": 26, "discountRate": 0.08, "probability": 0.25, "fairValue": 1140.1268}'::jsonb,
   748.7511),
  (:'owner_id', '10000000-0000-4000-8000-000000000005', 5, 0.10, 0.20,
   '{"epsAssumption": 8.50, "growthRateAssumption": 0.07, "terminalMultiple": 18, "discountRate": 0.09, "probability": 0.25, "fairValue": 139.4690}'::jsonb,
   '{"epsAssumption": 8.50, "growthRateAssumption": 0.13, "terminalMultiple": 22, "discountRate": 0.085, "probability": 0.50, "fairValue": 229.1317}'::jsonb,
   '{"epsAssumption": 8.50, "growthRateAssumption": 0.18, "terminalMultiple": 26, "discountRate": 0.08, "probability": 0.25, "fairValue": 344.0991}'::jsonb,
   235.4579),
  (:'owner_id', '10000000-0000-4000-8000-000000000006', 5, 0.13, 0.30,
   '{"epsAssumption": 9.50, "growthRateAssumption": 0.10, "terminalMultiple": 15, "discountRate": 0.11, "probability": 0.30, "fairValue": 136.1957}'::jsonb,
   '{"epsAssumption": 9.50, "growthRateAssumption": 0.17, "terminalMultiple": 19, "discountRate": 0.095, "probability": 0.45, "fairValue": 251.3830}'::jsonb,
   '{"epsAssumption": 9.50, "growthRateAssumption": 0.23, "terminalMultiple": 23, "discountRate": 0.09, "probability": 0.25, "fairValue": 399.8016}'::jsonb,
   253.9315),
  (:'owner_id', '10000000-0000-4000-8000-000000000007', 5, 0.11, 0.25,
   '{"epsAssumption": 28.00, "growthRateAssumption": 0.09, "terminalMultiple": 22, "discountRate": 0.095, "probability": 0.25, "fairValue": 602.0639}'::jsonb,
   '{"epsAssumption": 28.00, "growthRateAssumption": 0.16, "terminalMultiple": 27, "discountRate": 0.09, "probability": 0.50, "fairValue": 1031.9989}'::jsonb,
   '{"epsAssumption": 28.00, "growthRateAssumption": 0.22, "terminalMultiple": 31, "discountRate": 0.085, "probability": 0.25, "fairValue": 1560.1638}'::jsonb,
   1056.5564);

-- ---- Decision recommendations ----
-- quality/valuation/overall/conviction/rating below match
-- calculateQualityScore/calculateValuationScore/calculateOverallScore/
-- calculateConviction/calculateInvestmentRating (domain/decision/model.ts)
-- exactly for the `inputs` shown.

insert into public.decision_recommendations
  (owner_id, company_id, inputs, quality_score, valuation_score, overall_score, conviction, rating, conclusion_source, generated_at)
values
  (:'owner_id', '10000000-0000-4000-8000-000000000001',
   '{"businessQuality": 0.95, "economicMoat": 0.92, "financialStrength": 0.90, "capitalAllocation": 0.85, "growth": 0.95, "riskLevel": 0.55, "expectedReturn": 0.1432, "marginOfSafety": 0.4878}'::jsonb,
   0.8367, 0.7265, 0.7926, 0.8367, 'strong_buy', 'deterministic_rules', '2026-07-15T10:00:00Z'),
  (:'owner_id', '10000000-0000-4000-8000-000000000002',
   '{"businessQuality": 0.93, "economicMoat": 0.90, "financialStrength": 0.95, "capitalAllocation": 0.88, "growth": 0.78, "riskLevel": 0.25, "expectedReturn": 0.0411, "marginOfSafety": 0.1825}'::jsonb,
   0.8650, 0.2510, 0.6194, 0.8650, 'buy', 'deterministic_rules', '2026-07-15T10:05:00Z'),
  (:'owner_id', '10000000-0000-4000-8000-000000000003',
   '{"businessQuality": 0.88, "economicMoat": 0.85, "financialStrength": 0.78, "capitalAllocation": 0.80, "growth": 0.82, "riskLevel": 0.40, "expectedReturn": 0.0964, "marginOfSafety": 0.3687}'::jsonb,
   0.7883, 0.5293, 0.6847, 0.7883, 'buy', 'deterministic_rules', '2026-07-15T10:10:00Z'),
  (:'owner_id', '10000000-0000-4000-8000-000000000004',
   '{"businessQuality": 0.85, "economicMoat": 0.80, "financialStrength": 0.85, "capitalAllocation": 0.75, "growth": 0.75, "riskLevel": 0.45, "expectedReturn": 0.0524, "marginOfSafety": 0.2254}'::jsonb,
   0.7583, 0.3127, 0.5801, 0.7583, 'buy', 'deterministic_rules', '2026-07-15T10:15:00Z'),
  (:'owner_id', '10000000-0000-4000-8000-000000000005',
   '{"businessQuality": 0.87, "economicMoat": 0.85, "financialStrength": 0.90, "capitalAllocation": 0.78, "growth": 0.70, "riskLevel": 0.40, "expectedReturn": 0.0552, "marginOfSafety": 0.2355}'::jsonb,
   0.7833, 0.3275, 0.6010, 0.7833, 'buy', 'deterministic_rules', '2026-07-15T10:20:00Z'),
  (:'owner_id', '10000000-0000-4000-8000-000000000006',
   '{"businessQuality": 0.90, "economicMoat": 0.95, "financialStrength": 0.82, "capitalAllocation": 0.80, "growth": 0.78, "riskLevel": 0.60, "expectedReturn": 0.0597, "marginOfSafety": 0.2518}'::jsonb,
   0.7750, 0.3513, 0.6055, 0.7750, 'buy', 'deterministic_rules', '2026-07-15T10:25:00Z'),
  (:'owner_id', '10000000-0000-4000-8000-000000000007',
   '{"businessQuality": 0.90, "economicMoat": 0.97, "financialStrength": 0.80, "capitalAllocation": 0.78, "growth": 0.75, "riskLevel": 0.50, "expectedReturn": 0.0626, "marginOfSafety": 0.2618}'::jsonb,
   0.7833, 0.3660, 0.6164, 0.7833, 'buy', 'deterministic_rules', '2026-07-15T10:30:00Z');

-- ---- Decision journal entries ----
-- One open entry per position, snapshotting the decision-time state
-- (purchase price = the first buy's price; fair_value/expected_return/
-- conviction reused from the valuation/decision rows above as the
-- analysis roughly coincident with the purchase decision).

insert into public.journal_entries
  (owner_id, company_id, portfolio_id, status, purchase_date, purchase_price, fair_value_at_purchase,
   expected_return_at_purchase, position_size, conviction_at_purchase, thesis_summary, risks, invalidation_conditions)
values
  (:'owner_id', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'open',
   '2025-11-10T14:30:00Z', 115.00, 273.3417, 0.1432, 46000.00, 0.8367,
   'AI datacenter buildout is a multi-year infrastructure cycle still in its early innings; NVIDIA captures the largest share of that capex via compute and networking together.',
   'Hyperscaler capex cyclicality, customer concentration, export-control risk to China, and rising custom-silicon competition from hyperscalers themselves.',
   'Thesis is invalidated if two or more top-4 hyperscaler customers guide to sustained (not one-quarter) AI capex deceleration, or if gross margin compresses below 65% for two consecutive quarters without a clear transitional explanation.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'open',
   '2025-11-15T14:35:00Z', 410.00, 574.8973, 0.0411, 61500.00, 0.8650,
   'Azure and AI Copilot attach are expanding wallet share within an already-entrenched enterprise base, while the core productivity suite remains close to un-displaceable.',
   'AI capex intensity pressuring near-term margins, regulatory scrutiny, and Azure growth deceleration risk if AI capex doesn''t convert to revenue fast enough.',
   'Thesis is invalidated if Azure growth decelerates below 15% YoY for two consecutive quarters without a clear one-time explanation, or if Microsoft 365 seat growth stalls outright.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'open',
   '2025-12-02T15:15:00Z', 185.00, 356.4243, 0.0964, 46250.00, 0.7883,
   'AWS margin expansion and reacceleration is the primary driver of forward earnings growth, with retail margin recovery as the underappreciated second leg.',
   'AWS growth deceleration if enterprise cloud migration slows, retail margin give-back under competitive pressure, heavy ongoing capex needs.',
   'Thesis is invalidated if AWS operating margin contracts for two consecutive quarters, or AWS revenue growth falls below overall public-cloud market growth (implying share loss).'),
  (:'owner_id', '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'open',
   '2025-12-10T14:40:00Z', 495.00, 748.7511, 0.0524, 75750.00, 0.7583,
   'Core advertising business is reaccelerating on AI-driven ad ranking and Reels monetization, funding a long-duration Reality Labs optionality bet.',
   'Reality Labs cash burn with no clear profitability timeline, regulatory/antitrust pressure, TikTok-style competitive disruption to engagement.',
   'Thesis is invalidated if Family of Apps ad revenue growth decelerates meaningfully without a macro explanation, or Reality Labs losses accelerate without a credible monetization roadmap.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'open',
   '2026-01-08T14:45:00Z', 165.00, 235.4579, 0.0552, 49500.00, 0.7833,
   'Search remains more resilient to generative-AI-answer-engine disruption than the bear case assumes, while GCP scales into genuine profitability as a third pillar.',
   'Generative AI search competitors eroding query volume or monetization per query over time; antitrust remedies could force structural changes.',
   'Thesis is invalidated if Search revenue growth turns negative excluding FX, or if a court-ordered antitrust remedy forces a structural change to the Search distribution business.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'open',
   '2026-01-20T13:50:00Z', 172.00, 253.9315, 0.0597, 34400.00, 0.7750,
   'Leading-edge process node leadership is effectively unchallenged, and AI/HPC demand is driving record utilization and pricing power.',
   'Geopolitical concentration risk in Taiwan is the single largest unhedged risk to the thesis -- a structural, not cyclical, risk if realized.',
   'Thesis is invalidated by any material disruption to Taiwan fab operations, or if Samsung/Intel Foundry close the leading-edge process gap to within one node generation.'),
  (:'owner_id', '10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', 'open',
   '2026-02-02T09:10:00Z', 720.00, 1056.5564, 0.0626, 43200.00, 0.7833,
   'Sole global supplier of EUV lithography systems required for leading-edge chips, with High-NA EUV extending that lead through the next node cycle.',
   'China export restrictions cap a meaningful and growing portion of addressable revenue; extremely long sales/installation cycles make results lumpy.',
   'Thesis is invalidated if a competing EUV supplier reaches commercial viability, or if export restrictions expand to cover a majority of ASML''s current addressable revenue base.');
