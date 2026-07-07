# Strategic Launch & Marketplace Plan — Udupi Property Explorer

**Date:** 2026-07-07
**Status:** Proposed (founder review required — see §21 Open Decisions)
**Branding note:** Public brand: **ReTrends** (the shipped frontend header brand and design-system source of truth). Repository/project name: Udupi Property Explorer. Outreach copy below uses the public brand.
**Inputs:** full repo/docs audit, backend/search architecture audit, frontend UX audit, GitHub issue/milestone audit, Jul-2026 ship-readiness audit (`docs/audit/evidence/ship-readiness-audit/`), scale baselines (`docs/audit/evidence/*baseline*`), ingestion feasibility (`docs/audit/evidence/property-ingestion-pipeline/`).

---

## 1. Executive summary

The product is engineering-strong and supply-starved. The platform has ~90%+ of the software needed to launch — map discovery on Postgres/PostGIS proven to 100k listings, a full listing lifecycle with admin moderation, a trust/verification framework, broker creation flows, and consent-gated telemetry. What it does not have is **inventory**: production holds roughly **13 LIVE Udupi listings** (plus ~1,737 imported Bangalore records used for scale validation, not real supply). No compliant automated listing source exists for Udupi — the feasibility audit concluded broker exports and manual CSV entry are the only enable-candidates. **The launch bottleneck is founder-led supply operations, not code.**

Three headline corrections to common assumptions:

1. **OpenSearch is not launch-critical.** It is fully dormant (all flags off, no client dependency in `pom.xml`, adopt-triggers like ">500k LIVE listings" and "P95 FTS >200ms" nowhere near met). Discovery runs on Postgres + PostGIS with measured latencies of 3–102 ms at 100k listings. Do not provision, size, or operate OpenSearch for MVP.
2. **The credibility surface currently overpromises.** The landing page claims "500+ Verified Listings" and RERA/document verification that the platform cannot back (all real listings are trust tier D → no badge renders), and shows Bangalore localities on a coastal-Karnataka homepage. This is the single most dangerous trust gap and must be fixed before any broker or consumer sees the site.
3. **There is no demand-capture fallback.** Empty results are dead ends; the only lead channel is a viewing-booking modal; there is no "request a property", no WhatsApp path, no waitlist. For a low-supply launch this is the most important missing product surface.

**Recommended launch shape:** curated early-access launch in a **Manipal + Udupi city residential wedge** (rentals + resale flats/houses/plots), with agricultural land as a curated secondary showcase. Target **25–50 founder-verified listings from 5–10 founding brokers** for early access, **100+ active listings** before calling it a public launch. Run supply manually (done-for-you listing upload, WhatsApp intake) for the first 90 days.

**Infrastructure:** the current stack (Cloudflare Pages + Render + Supabase) can carry early access. For the E2E Networks direction, a **single 4-vCPU / 16 GB VM** running backend + Postgres in Docker, with images on object storage behind Cloudflare, is sufficient and cheap. 8 GB works only because OpenSearch stays off; 16 GB is strongly preferred. Do **not** put 5 TB of images on the VM's root disk.

---

## 2. Chicken-and-egg marketplace diagnosis

### The loop as it applies here

- Buyers/renters in Udupi search on 99acres/MagicBricks/NoBroker/Facebook groups/WhatsApp. They will try a new site once; if it shows 13 listings they never return.
- Udupi/Manipal brokers operate on WhatsApp + Facebook + walk-ins. They will not learn a new tool for zero leads. Their listing data lives in phones and notebooks, not exports.
- The platform's differentiators (map-first discovery, area intelligence, school-radius search, agri boundaries, honest trust tiers) only become visible with real inventory behind them.

### What breaks the loop in this market

The loop is broken on the **supply side first**, for three reasons specific to this repo and market:

1. **Supply is cheap to fake-solve and expensive to real-solve — and this codebase already made the right call.** The ingestion feasibility audit (`docs/audit/evidence/property-ingestion-pipeline/source-feasibility-template.md`) marked every portal RESEARCH_ONLY and prohibits anti-bot bypass. That closes the scraping shortcut and leaves founder-led acquisition as the only path. Plan for it explicitly instead of hoping automation appears.
2. **Broker effort must be ~zero.** The residential form is ~60 fields across ~8 sections. No Udupi broker will self-serve day one. The founder (or an assistant) must do the typing — brokers only need to forward photos + details on WhatsApp.
3. **Demand can be captured before supply exists.** "Tell us what you're looking for" converts empty searches into leads that are *gifts to brokers* — the strongest broker-acquisition asset available ("I have 12 buyers looking for 2BHK rentals near MIT; want them?").

### Sequencing verdict

Supply-first, but with demand capture switched on from day zero so every visitor either finds a listing or leaves a lead. Brokers are recruited with (a) done-for-you listing service, (b) free founding status, and (c) accumulated demand leads — in that order of maturity.

---

## 3. Recommended launch wedge

**Validate of founder hypothesis: correct — go hyperlocal, not "all Udupi".**

| Dimension | Recommendation | Rationale |
|---|---|---|
| Geography | **Manipal + Udupi city** (Manipal, Udupi town, Malpe road corridor; Kundapur/Kaup later) | Manipal has the region's highest transaction velocity — a large student, faculty, medical, and parent population with annual rental churn; Udupi city is where brokers physically sit. The `areas`/`area_groups` model already seeds udupi + kundapur. |
| Primary category | **Residential rentals + resale flats/houses/plots** | Rentals close fast (validates the funnel in weeks, not months), and Manipal rental demand is perennial and searchable ("flat near MIT Manipal"). Resale flats/plots give the sale-side inventory brokers most want to promote. |
| Secondary category | **Curated agricultural land / plots showcase** | Genuine differentiator (drawn PostGIS boundaries, mandatory "verify legally" disclaimer already shipped). Low freshness pressure — agri listings stay valid for months. But it is a *showcase*, not the wedge: transactions are slow and diligence-heavy. |
| First broker segment | 10–20 established Udupi-city/Manipal brokers with active rental + resale books, already posting to Facebook/WhatsApp groups | They have inventory in hand and feel portal pain (99acres fees, poor local coverage). |
| First consumer segment | Manipal-bound students/parents and staff seeking rentals; Udupi NRI/out-of-town buyers researching flats/plots remotely | Both segments *research online before arriving* — exactly whom a map/area-first product serves better than a WhatsApp group. |

**Anti-recommendation:** do not launch commercial, warehouse, or Bangalore-anything. The Bangalore import is scale-test data; it must never appear as real supply (see §7).

---

## 4. Supply-side strategy: brokers and listings

### 4.1 Broker value proposition

"Free professional listing service for Udupi's founding brokers: send us photos and details on WhatsApp, we build a verified, map-placed listing page you can share with any client — and we send you buyer enquiries from people searching Udupi/Manipal online. No fees during the founding period. Your number is never shown publicly; enquiries come to you."

Key honest points: free, done-for-you, WhatsApp-native, phone-privacy by design (the platform never leaks `contact_phone` to anonymous users — this is already enforced in code), and a shareable listing URL brokers can use *today* in their own WhatsApp marketing even before platform traffic exists. That last point is the answer to "why bother before you have traffic".

### 4.2 Getting to 5 active brokers → 25 listings → 100 listings

**First 5 active brokers (weeks 1–3):**
1. List 20 candidate brokers: office addresses in Udupi city/Manipal, active in "Udupi Properties"-type Facebook groups, Google-Maps-listed agencies with reviews. Criteria: has ≥10 current listings in hand, responsive on WhatsApp, deals in the wedge categories.
2. Visit in person (this is a relationship market — WhatsApp-first outreach converts far worse than a chai meeting). Pitch below.
3. Close with: "Give me your 5 best current properties right now — photos and details on WhatsApp — and I'll have them live with their own pages by tomorrow."
4. Same-day turnaround on the first listing per broker. Speed is the trust signal.

**25 listings (weeks 2–4):** 5 brokers × 5 listings each. Founder does 100% of data entry through the existing broker forms (or admin manual-entry path), gets pin confirmation via WhatsApp location share, uploads photos.

**100 listings (days 30–75):** expand to 15–20 brokers; add owner-direct listings *by referral only* (broker-tolerated, avoids channel conflict at this stage); re-canvass founding brokers weekly for new stock; convert "request a property" demand into targeted broker asks ("do you have anything matching these 4 open requests?").

### 4.3 Manual listing onboarding workflow (founder-operated)

1. Broker sends photos + details + location pin via WhatsApp.
2. Founder enters listing via broker account (or on-behalf-of flow), runs the draft-description builder, confirms pin.
3. Quality checklist (below); submit for review; founder-as-admin approves via the existing `PENDING_REVIEW → LIVE` moderation queue.
4. Send broker their live URL + a ready-to-forward WhatsApp blurb.
5. Log in the supply tracker (see §14 weekly dashboard).

**WhatsApp scope clarification:** all WhatsApp usage in this plan (broker intake, "still available?" reconfirmations, new-listings broadcasts, lead forwarding) is **manual, founder-operated communication on the founder's own WhatsApp** — allowed and expected for MVP operations. **No in-product WhatsApp integration is required before MVP**, and WhatsApp automation (Business API, bots, automated broadcasts) should not be built until supply and demand are validated. The product itself remains WhatsApp-free at launch; the frontend audit's "no WhatsApp in codebase" finding is consistent with this plan, not contradicted by it.

**Listing quality checklist (gate to LIVE):** ≥3 real photos (no watermarks from other portals, no stock), price or honest "price on request", pin confirmed by broker (≤200 m), correct property type + purpose, locality + area_key set, description free of unverifiable claims, broker consent recorded (see 4.5), phone number captured (encrypted at rest — set a real `PHONE_ENCRYPTION_KEY` first, see §13).

### 4.4 Broker verification checklist (founding tier)

Phase-1-honest verification (matches `VERIFICATION_TRUST_SPEC.md`): founder met broker in person or video call; office/identity sighted; phone verified by the founder actually calling it; RERA number *recorded as a seller assertion, never displayed as "verified"*. This is enough to justify a "Founding broker — onboarded in person" surface without fabricating KYC.

### 4.5 Broker agreement / consent items

One-page WhatsApp-forwardable consent note: broker confirms authority to market each listing; grants permission to display photos/details; agrees prices kept current (platform may archive after N days without reconfirmation — see §9); understands free founding period and that future pricing will be discussed before any charge; consents to platform storing contact details for lead routing. Not a heavy contract — a consent record.

### 4.6 Objections and responses

| Objection | Response |
|---|---|
| "Nobody uses your site." | "Correct — today. That's why it's free and done-for-you. You lose 10 minutes on WhatsApp and gain a professional page you can forward to any client immediately. Leads are upside." |
| "99acres already does this." | "For Udupi? Check their Udupi coverage and their fees. We're local-only, map-first, and free for founders." |
| "Will you show my number / steal my clients?" | "Your number is never shown publicly. Enquiries come to you. We're the catalogue, you're the dealmaker." |
| "I don't have time." | "You don't need any. Forward the WhatsApp messages you already send clients. We do the rest." |
| "What happens when you start charging?" | "Founding brokers get advance notice and founder pricing. Nothing changes without a conversation." |

### 4.7 Outreach copy (ready to use)

**WhatsApp (first touch):**
> Namaskara {name} avare 🙏 I'm Goutham, building ReTrends — a map-based property site only for Udupi/Manipal. I'm onboarding 10 founding brokers: we create professional listing pages for your properties free of charge (you just WhatsApp us photos + details), and buyer enquiries come straight to you. Your number is never displayed publicly. Can I show you a 2-minute demo this week — your office or over chai?

**Email:**
> Subject: Founding broker invitation — ReTrends Udupi (free listing service)
> {Name}, I'm building ReTrends, a map-first property discovery site focused only on Udupi and Manipal. I'm inviting 10 established local brokers as founding partners: we do the listing work for you (send photos + details on WhatsApp, we publish a verified, map-placed page within a day), it's free during the founding period, and enquiries route directly to you with your number kept private. I'd like 15 minutes to show you the site and put your first 5 properties live this week. — Goutham, {phone}

**In-person pitch outline (5 min):** who I am + local focus → show map with a real listing on their street → "your listings, done for you, free" → phone privacy + lead routing → "give me your best 5 now" → same-day publish promise.

**Follow-up (3 days, no reply):**
> {Name} — quick follow-up. I've put {n} Udupi properties live this week (link). I've reserved a founding-broker slot for you until Friday — one WhatsApp with photos of your best property and I'll have its page live tomorrow. Shall I hold the slot?

**Broker onboarding checklist:** consent note acknowledged → phone verified → broker account created (role `broker`) → first listing live same day → broker sent their listing URL + how-to-forward blurb → added to founding-brokers WhatsApp broadcast list → weekly stock check scheduled.

### 4.8 Retention and immediate broker-facing needs

Retention loop: weekly WhatsApp touch (new leads, listing views once analytics exist, "anything new/sold?"), instant lead forwarding, mark-sold-same-day service. **Already sufficient in product:** broker dashboard, quality summary, `/mine` stats, archive/restore lifecycle. **Can wait:** demand-gap analytics, engagement tiles ("coming soon" cards are fine), self-serve bulk tools, any payment/monetisation surface.

---

## 5. Demand-side strategy: consumers

### 5.1 Positioning and landing message

Replace the current overclaiming hero with honest curation:

> **Find your place in Udupi & Manipal.**
> Every listing personally verified with local brokers. Explore by map, area, or school — currently in curated early access with {N} live properties.

Sub-messaging: "No fake listings. No stale inventory. Broker-verified, map-accurate." — this is a *positioning weapon* against the big portals' known stale-listing problem, and the codebase's honest-trust architecture genuinely backs it.

### 5.2 First 100 users (weeks 1–6, zero budget)

Founding brokers forwarding their own listing URLs (each broker's WhatsApp network is the cold-start distribution); Manipal student/parent Facebook groups and subreddits at admission season (July intake is *now* — post genuinely useful rental round-ups, not ads); Udupi residents' groups; founder's personal network + NRI Udupi communities; every listing URL shared anywhere is an acquisition channel because listing detail pages work for anonymous users (teaser mode).

### 5.3 First 1,000 users (days 30–90)

SEO area pages (below) start compounding; Google Business Profile for ReTrends; 2 posts/week of hyperlocal content; WhatsApp "new listings this week in {area}" broadcast users can join (works without any new code — a link + manual broadcast); referral: "know someone hunting in Udupi? Forward this"; local partnerships — Manipal university admission consultants, hostels-overflow wardens, 2–3 housing-adjacent businesses (packers/movers, furniture rental) for cross-promotion.

### 5.4 Content/SEO plan (Udupi-specific)

Pillar pages: Best areas to live in Udupi (family/student/NRI cuts) · Rentals near Manipal/MIT — honest price guide · Flats near Udupi's top schools (leverages school-radius search as interactive proof) · Buying agricultural land in coastal Karnataka — legal checklist (leverages agri disclaimer credibility) · New vs resale in Udupi · Renter's checklist for Manipal students/parents · Area explainers (Manipal, Malpe, Ambalpadi, Santhekatte, Kaup, Kundapur) · "How brokers work in Udupi" transparency guide.

**Prerequisite:** the SPA currently ships Lovable placeholder meta on every page with no sitemap/robots (§8). SEO spend is wasted until that is fixed.

### 5.5 Lead capture + concierge

Every visitor must have a next action even when supply fails them: **"Request a property"** (3 fields: what, budget, phone/WhatsApp) on empty states, area pages, and the homepage; **concierge search** for the first ~50 requesters (founder personally matches or asks brokers — this is demand-side white-glove and generates the broker-gift lead pool); **"Notify me when new listings match"** (manual WhatsApp broadcast initially — do not build alerting infra yet).

### 5.6 30/60/90 GTM summary

- **Days 0–30:** honesty fixes live (§8), 5 brokers, 25–50 curated listings, request-a-property live, soft "early access" framing, first 100 users via broker networks + Manipal groups, analytics baseline on.
- **Days 31–60:** 15+ brokers, 75–100 listings, SEO foundations + first 6 content pieces, GBP live, weekly new-listings broadcast, first 20 concierge matches, measure lead→viewing conversion.
- **Days 61–90:** 100–150 listings with freshness policy enforced, public launch announcement (local press/groups), referral push, double down on whichever channel produced leads, decide on Kundapur/Kaup expansion.

**Metrics to watch weekly:** new listings added, listings reconfirmed fresh, active brokers (≥1 action/week), sessions, searches with ≥1 result (%), listing-detail views, viewing requests + property requests (leads), lead→broker-forwarded time, broker response rate.

---

## 6. Trust and verification strategy

The trust architecture (`VERIFICATION_TRUST_SPEC.md`, trust tiers A–D, dimension badges, complaint system) is well-designed and *ahead of supply*. The strategy is to make honesty the brand:

1. **Fix the overclaim first.** Landing hero says "500+ Verified Listings" + RERA/document verification copy; reality is ~13 listings, all tier D, no rendered badges. Replace with real counts (the discover summary API provides them) and "curated early access" framing. This is pre-launch item #1.
2. **Actually earn tier C→B for founding listings.** The founder-operated onboarding (photos verified, pin confirmed, identity sighted) maps directly onto the existing verification dimensions. Run each founding listing through photo + identity verification so real badges render — the trust system stops being dead code the moment supply ops uses it.
3. **Badge vocabulary stays honest:** "Verified" (A) / "Trusted" (B) / "Listed" (C) mapping already enforced server-side (`TrustBadge.publicBadge`, D→no badge, never fabricated). Add one founding-era surface: "Founding listing — onboarded in person by ReTrends" as *copy*, not a fake badge.
4. **Freshness as a trust feature:** show "verified/updated {date}" prominently (cards currently show `createdAt` relative time; prefer last-confirmed date once the freshness policy of §9 exists). Stale = archived, and say so publicly ("we remove listings brokers don't reconfirm").
5. **RERA:** display as "RERA no. provided by seller" only — the spec already mandates this; ensure no surface upgrades it to "RERA verified".
6. **Wire "Report this listing"** (currently non-functional on detail page) to the existing complaint system — even a mailto/WhatsApp link at MVP.

---

## 7. MVP scope cut

### Journey-by-journey verdict

| Surface | Verdict | Notes |
|---|---|---|
| Map-first discover (`/discover`) | **MVP core** | The product's spine; already strong. |
| Area-first journey + area pages | **MVP core** | Best SEO surface + hyperlocal positioning. |
| Listing detail + booking flow | **MVP core** | Needs trust/CTA polish (§8), not rework. |
| Broker creation + admin moderation | **MVP core (founder-operated)** | Used *by the founder* initially; brokers self-serve later. |
| School-first journey | **Keep, secondary** | Already built + polished; differentiating content hook ("flats near schools"). Don't invest further pre-launch. |
| Agri-first journey | **Keep as curated showcase** | Differentiator; low maintenance; don't push as primary wedge. |
| Saved homes / saved areas | **Keep** (just shipped) | Fix the known non-persisting heart button on cards or hide the heart where it's cosmetic. |
| Trends / valuation / area intelligence | **Soften/hide at launch** | With 13→100 listings, trends charts look empty/misleading. Gate behind "coming as data grows" or show only where data honestly supports it. |
| Broker demand-gap alerts, market focus, intelligence dashboards | **Post-MVP** | "Coming soon" tiles are fine; no further work. |
| Owner-direct listing flow | **Post-MVP** (referral-only manual exceptions) | Avoid broker channel conflict during founding period. |
| Notifications | **Hide from nav** | Route is dead (`/notifications` → `/`); remove the nav item. |
| Bangalore data | **Must not ship as supply** | Keep for internal scale tests only; exclude from prod discover surfaces and landing fallbacks. |
| OpenSearch cutover, Kafka relay, outbox indexer | **Post-MVP, trigger-gated** | Already correctly dormant; leave off. |
| AI description (LLM), WhatsApp OTP, SMS OTP, isochrone/commute, RAG Q&A | **Post-MVP** | Already iceboxed; keep them there. |

### The cut line, stated plainly

Before launch, build **only**: honesty/trust copy fixes, request-a-property lead capture, empty-state fallbacks, SEO/meta foundations, deploy-config hardening, and the freshness policy. Everything else on the backlog (M33 stragglers, M38 AI-guardrail leftovers, mobile-UX milestone 23, workflow automation M28) is post-launch or parallel-track. **The riskiest failure mode for this project is continuing to polish discovery UX instead of doing broker visits.** The codebase shows a strong bias toward building; launch requires a 90-day bias toward operating.

---

## 8. UX and conversion audit

### Biggest consumer trust gaps (from frontend audit)

1. Landing page overclaims (fake "500+ Verified", unbacked RERA/KYC copy, Bangalore localities in "Trending", Unsplash stock hero, Lovable `<title>`).
2. No broker identity anywhere (cards show nothing; detail shows only "Listed by broker") — buyers can't tell who they're dealing with. BuyerPreviewCard's verified-broker badge was correctly *removed* for honesty (#1722); the fix is real founding-broker attribution, not a fake badge.
3. Single photo per card, glyph fallback for missing images; no gallery affordance signal.
4. Freshness shows `createdAt` only — no "still available, confirmed {date}" signal.
5. Backend errors render as "no properties" on the anonymous landing journey (SR-024) — indistinguishable from an empty marketplace.

### Biggest broker trust gaps

Phone privacy is good but under-communicated (say "your number is never shown" during creation); no visible "what happens after submit" (review SLA); leads arrive as bookings with no notification channel a broker will actually see (in-app only → founder must forward via WhatsApp manually at MVP, fine — but say so).

### Top 5 UX changes BEFORE launch

1. **Honest landing rewrite:** real counts from `/api/discover/summary`, "curated early access" framing, Udupi/Manipal areas, real local photo, real `<title>`/meta. (Small, highest impact.)
2. **Request-a-property + empty-state fallback:** one lead-capture component (what/budget/WhatsApp) rendered on zero-result states, area panels, and homepage; stores a lead server-side or, at minimum MVP, posts to the existing telemetry-free contact path / a simple table. Includes "new listings weekly — join the WhatsApp update list".
3. **Listing detail trust block:** founding-broker attribution line, "verified by ReTrends on {date}", working Report link, honest RERA phrasing.
4. **Anon error states:** distinguish backend failure from empty results on the landing/discover hooks (SR-024) — an empty-looking marketplace you *do* have must never be caused by a 500.
5. **Fix or hide the cosmetic save-heart on cards** (currently pure `useState`, no persistence — a visible broken promise; saved-homes persistence exists on detail via #1566, so wire cards to it or drop the heart there).

### Top 5 UX changes AFTER launch

1. Multi-photo carousel on cards + real placeholder imagery.
2. Broker profile pages (name, founding badge, listing count, response signal).
3. WhatsApp deep-link lead option alongside booking ("WhatsApp this broker via ReTrends" — routed/masked, or founder-relayed at first).
4. Mobile discover hardening (existing M23 backlog — real usage will re-prioritise it).
5. Similar-listings + area cross-sell polish (also: move `useSimilarListings` off direct Supabase onto the API layer for consistency/RLS safety).

### Map UX risks

Marker fetch is auth-gated + zoom-gated (anon never sees markers) — at launch supply levels consider showing the ≤20 anon teaser pins per area so the map never looks dead to the majority (anonymous) audience; keep coordinate coarsening (~1.1 km / `GeoCoarsener`) exactly as is for privacy. The 1000-marker cap and bbox/debounce patterns are healthy and need no work at this scale.

---

## 9. Listing supply and data quality plan

**Minimum launch data per listing** (aligned with existing `validateFields` gate): type + purpose, price (or explicit POR) , locality + confirmed pin, ≥3 photos, 1–2 key size fields for the type, broker contact (encrypted), honest description. **Ideal:** + amenities, floor/age, area_sqft normalised, RERA assertion, boundary polygon for land.

**Too much for brokers initially:** the full ~60-field residential form. Founder-operated entry hides this; when brokers self-serve later, introduce a "quick listing" subset (the field-config system `isListingFieldVisible` makes a reduced tier feasible).

**Critical for search/map quality:** `area_key`, geocoded pin, `price_paise`, `property_type`/`listing_purpose`, `land_area`/`built_area` — these drive every predicate in `DiscoverListingPredicateBuilder`. Founder entry must never skip them.

**Freshness policy (new — no issue exists yet):** every LIVE listing reconfirmed by broker every **21 days** (WhatsApp "still available?" — manual at first); unconfirmed at 30 days → founder archives via existing ARCHIVED lifecycle; card/detail show "confirmed {date}"; sold/rented marked same day (broker retention promise). Later automate: reminder job + auto-archive + `back_on_market` re-listing flow (fields already exist: `last_live_at`, `back_to_market_at`).

**Duplicates:** proximity + hash dedupe already exists (`ProximityDuplicateBatchJob`, `dedupe_hash`, admin Duplicates queue) — sufficient; founder resolves conflicts favouring the consenting broker. **Fake/stale prevention:** everything enters through founder review at MVP; the ingestion API key **must** be rotated off `changeme-local-dev-only` so nothing can inject listings (§13).

**Seed import:** use #1779's pipeline in its compliant configuration only — synthetic data stays in dev; production seed = broker exports + manual CSV entered through the normal lifecycle so every listing has provenance and consent. **Never present synthetic/Bangalore data as real inventory.**

---

## 10. OpenSearch / map performance audit

**Current reality:** discovery = Postgres + PostGIS, single `property_listings` table, shared predicate builder, generated FTS `search_vector`, GiST-indexed `geog`, `/api/discover/summary` facets via live GROUP BY (Caffeine-cached 120 s). OpenSearch: raw-RestClient adapter + routing services + outbox tables exist but all three flags default off, no pom dependency active, Spring outbox writer unimplemented, rebuild scripts lack auth (P0 noted in docs), no prod cluster provisioned. **This dormancy is correct. Keep it.**

**Measured headroom (repo evidence):** markers bbox 3–40 ms and school-radius 71–102 ms at 100 k listings; window pagination 17 ms at 10 k; regions summary 158 ms at 100 k (only budget miss, deferred). At launch scale (10²–10³ listings) every query is sub-10 ms. **There is no MVP search-performance problem.**

**Risks worth tracking (not fixing now):**
- Keyword `q` is applied to cards/counts but **not** markers (`/api/discover/markers` receives q=null) — close before shipping any keyword-search UX, else map and list disagree.
- GIN FTS index not used at 10 k (post-scan filter) — irrelevant until tens of thousands of rows; revisit with EXPLAIN when >25 k.
- COUNT(*)/OFFSET/GROUP-BY cliffs are 1 M-row projections — ignore for now.
- If/when OpenSearch is adopted: single-node, 1 shard + 0–1 replica per index is right for <1 M docs; heap = 50% of container RAM capped well below 32 GB (2–4 GB heap is plenty initially); snapshots to object storage; anon coordinate-coarsening must move into the OS read path; fix script auth + build the transactional outbox writer first. **Adoption triggers (from the local-first roadmap): P95 FTS >200 ms, P95 geo >300 ms, >500 k LIVE listings, >500 inserts/min, or a facet/autocomplete requirement Postgres can't meet.** None are close.

**What stays in Postgres:** everything, for MVP — listings, transactions, rollups, discover reads, facets. **Caching:** existing 120 s summary cache + FE staleTimes are adequate; add Cloudflare edge caching only for public anon GETs if load ever demands it. **Avoid before MVP:** provisioning OpenSearch, Kafka/relay work, any reindex tooling investment, load tests beyond a simple k6 smoke (50 concurrent users on discover endpoints) run once against staging.

---

## 11. E2E Networks infrastructure plan

**Context:** current live topology is Cloudflare Pages (frontend) + Render (backend; free-tier cold start measured 43.4 s) + Supabase (Postgres/auth/storage). The E2E Networks direction replaces the backend/database hosting; assessed against 4 vCPU / 8–16 GB / 5 TB.

### Verdict on the proposed shape

- **4 vCPU: yes, sufficient** for Spring Boot + Postgres at early-launch traffic (hundreds of DAU, ~10 rps peak). The 10 scheduled jobs are light and off-peak.
- **8 vs 16 GB: 16 GB strongly preferred, but only ~₹ marginal — take it.** Rough budget on 16 GB: JVM 2–3 GB, Postgres shared_buffers 2–4 GB + OS page cache, OS/Docker overhead ~1 GB, ~6 GB headroom. On 8 GB it *works* (JVM 1.5 GB, PG 1 GB buffers) **only because OpenSearch stays off**; the first time you enable OpenSearch (needs its own 2–4 GB heap + equal page cache) 8 GB is immediately over. 16 GB buys the option without a migration.
- **One VM vs several: one VM for MVP** — backend + Postgres + Caddy/nginx on a single 4/16 machine via Docker Compose. Split later in this order: (1) Postgres to its own VM or managed PG, (2) OpenSearch VM when triggers fire, (3) backend horizontal scale (requires fixing the in-memory rate limiter + adding ShedLock to the 10 scheduled jobs — both single-instance-only today).
- **5 TB on the VM: no — not for images.** Local 5 TB block storage is a single point of loss, un-CDN-able, and couples data lifespan to the VM. Put listing images in **object storage** (E2E EOS S3-compatible, or Cloudflare R2 — R2 has zero egress fees and pairs with the CDN you'll use anyway) behind Cloudflare. This also aligns with open issue **#1715 (listing images → object storage + CDN before go-live)**. Note the current code uploads to Supabase Storage via signed URLs — either keep Supabase Storage + Cloudflare in front (cheapest path, zero code change) or repoint `SupabaseStorageService` at any S3-compatible endpoint as part of #1715. Reality check: 100 listings × 10 photos × 5 MB = **5 GB**. You are years from 5 TB; don't pay for it yet.
- **Redis: avoidable at MVP.** Caffeine + in-memory buckets are fine single-instance. Redis becomes justified only at 2+ backend instances (shared rate-limit buckets + cache).
- **Cloudflare: yes, unambiguously.** Keep Pages for the frontend (free, global, already live), free-tier CDN/TLS/WAF in front of the API origin, cache public anon GET endpoints if needed. This alone removes most "is 4 cores enough" doubt.

### Recommended MVP topology

```
Cloudflare (DNS, CDN, TLS, Pages for frontend SPA)
        │
E2E VM (4 vCPU / 16 GB / 100–200 GB SSD)   ← not 5 TB
  ├─ caddy or nginx (reverse proxy; sets X-Forwarded-For correctly)
  ├─ backend (Spring Boot container, 2–3 GB heap, JSON logs)
  ├─ postgres 16 + postgis (container, 2–4 GB shared_buffers, volume-mounted)
  └─ node-exporter / promtail (metrics+logs shipping)
Object storage (Supabase Storage or R2/E2E-EOS): listing images
Supabase: auth (JWT issuer) — unchanged
Uptime Kuma / Grafana Cloud free tier: monitoring + alerts
```

Keep Supabase auth regardless of where compute lives — the backend only needs the JWT issuer URL; migrating auth is high-risk, zero-reward at this stage.

### Operations

- **Backups:** nightly `pg_dump` (or wal-g base+WAL for PITR) to object storage, 14-day retention, **weekly restore test** (a backup you haven't restored is a hope, not a backup). Images: object storage versioning or weekly sync to a second bucket. VM snapshot weekly via E2E panel.
- **Monitoring:** the backend already exposes `/actuator/prometheus` (key-guarded) — scrape it; Grafana Cloud free tier + Uptime Kuma external probe on `/actuator/health` and the homepage; alert on: site down >2 min, p95 API >1 s, disk >80%, Postgres connections >80%, backup job failure.
- **Logging:** JSON logs → Loki/Grafana Cloud or plain journald + logrotate at minimum; **turn off the global DEBUG logging** (`application.yml` — currently app-wide with no prod profile).
- **Deploy/rollback:** tagged Docker images, `docker compose pull && up -d`, keep previous tag for one-command rollback; Flyway is expand-only by house rule so DB rollback = roll code back only.
- **Staging:** don't run a second VM. Use Render (current setup) or docker-compose-on-laptop as staging; promote images by tag.
- **Cost control:** one VM + Cloudflare free + Supabase existing plan + object storage pennies ≈ the cheapest credible shape. First upgrades as traffic grows, in order: managed/separate Postgres → second backend instance behind LB (with Redis + ShedLock) → OpenSearch node (only on trigger).

---

## 12. Deployment / operations plan (go-live checklist)

Config landmines from the ship-readiness audit — **each silently breaks production if unset:**

| # | Item | Failure if wrong |
|---|---|---|
| 1 | `VITE_API_BASE_URL` set at frontend build time | Bundle silently calls `localhost:8085` (SR-012) |
| 2 | `PHONE_ENCRYPTION_KEY` real value | Broker PII encrypted with repo-committed dev key (SR-005) |
| 3 | `INGESTION_API_KEY` rotated off `changeme-local-dev-only` | Anyone can inject listings (SR-003) |
| 4 | `trust-forwarded-header=true` **plus** proxy-validated XFF at the edge | All anon users share one rate bucket → launch-day 429 avalanche (SR-011) |
| 5 | `CORS_ALLOWED_ORIGINS` = real frontend origin | Frontend blocked entirely (SR-016) |
| 6 | Supabase edge functions: `verify_jwt`, CORS, LLM spend caps | Unauthenticated service-role writes + unbounded spend (SR-002) |
| 7 | Prod logging profile (no DEBUG), JWT audience validation | Log flood/PII risk; token-audience laxity |

Plus: fix rate-limiter `buckets.clear()` fail-open (attacker-resettable throttling — small code fix, do before launch); run the 3 failing journey E2Es (#1721) to green or explicitly waive; untrack backend `.env` + rotate (#1577).

---

## 13. Security, privacy, compliance audit

**Strong foundations:** fail-closed DB-backed roles (not JWT claims), phone AES-GCM at rest and never exposed to anon, LIVE-only public projection with teaser DTOs, coordinate coarsening for anon, PII-free-by-construction telemetry with default-deny consent, constant-time API-key filters, admin audit log.

**Must-fix before launch:** the 7-item table in §12; rate-limiter fail-open; #1602 (broker area-insights endpoint: no rate limit + userId logged at WARN); auth-cache scoping gap (SR-021 — stale price data across sign-in/out on shared devices); image `sizeBytes` is client-declared (enforce via storage-side bucket limits at minimum); inconsistent admin authz style in `AdminListingController` (only `approve` uses `@PreAuthorize` — align to annotations; 30-minute change that prevents a future missed guard).

**Can wait:** #1605 k-anon suppression for `avgListingQuality` (fix before broker-insights marketing, not before launch); JWT `aud` validation; `getSafeReturnTo` backslash hardening; polygon vertex cap beyond the existing 3–500 check; ShedLock on scheduled jobs (single instance).

**Legal/compliance needs (none exist in repo):** Terms of Service, Privacy Policy (DPDP Act 2023: consent for broker phone storage, purpose limitation, deletion rights), broker listing-consent record (§4.5), takedown/complaint process (wire Report link), a statement that the platform is a discovery/advertising venue, not a RERA-registered agent — and confirm whether the *platform itself* needs Karnataka RERA registration as an advertising intermediary. **Get one local-lawyer hour on the last two points before public launch.**

---

## 14. Analytics and metrics plan

Instrumentation reality: bespoke consent-gated `discover_event` (3 event types: FILTER_APPLY, PANEL_OPEN, LEAD_INTENT), Micrometer latency metrics, and nothing else — no page views, no funnel, no search-zero-result tracking, and the consent default-deny means near-zero coverage of anon users. **Decision needed (§21):** add a privacy-respecting aggregate pageview layer (self-hosted Plausible/Umami — cookieless, arguably consent-exempt, keeps the honest-privacy brand) rather than expanding the consented event schema pre-launch.

**Day-one dashboard (founder, weekly, a spreadsheet is fine):**
- **Supply:** LIVE count by area/type · new this week · reconfirmed fresh · archived-stale · % with ≥5 photos · median quality score.
- **Brokers:** total onboarded · active (≥1 action/wk) · median lead-response time · churn risk (no contact 2 wks).
- **Demand:** sessions · discover sessions · searches with ≥1 result (**the** empty-marketplace metric) · listing-detail views · detail-view→lead %.
- **Leads:** viewing requests · property requests · concierge matches made · lead→site-visit conversions (ask brokers).
- **SEO:** indexed pages · impressions/clicks (Search Console) · area-page entrances.
- **Infra:** uptime · p95 API · error rate · disk/backup status.

Server-side supply/broker metrics need **no new instrumentation** — they are SQL over existing tables; write 6 queries, not a feature. Demand metrics need the pageview decision.

---

## 15. Marketing and SEO plan (technical foundations)

Before any content spend: replace Lovable placeholder `<title>`/description/OG image in `index.html`; call `usePageMeta` (or a helmet equivalent) from homepage, `/discover`, `/listing/:id`, and area pages (today only 2 trends pages set meta); add `robots.txt` + generated `sitemap.xml` (listing + area URLs — a tiny backend endpoint or build step); per-listing OG tags so WhatsApp shares of listing URLs render a photo + price card (**this is the highest-leverage marketing feature in the plan** — WhatsApp forwarding is the region's primary channel and every broker share becomes an ad); prerender or SSR the public pages (pragmatic MVP: prerender area pages + listing detail via a service or a lightweight SSR route on the VM — full SSR migration is post-MVP); JSON-LD (`RealEstateListing`/`Place`) on detail and area pages; Google Business Profile + Search Console from day one.

Then execute the §5.4 content calendar at 2 pieces/week, each tied to a live interactive surface (area page, school search, agri map) rather than generic blog posts.

---

## 16–19. Action plans

### 16. Two-week action plan (pre-early-access)

**Product (small, sequenced):** honest landing rewrite · request-a-property + empty-state component · anon error states (SR-024) · fix/hide card save-heart · remove dead `/notifications` nav · real meta/OG/robots/sitemap basics.
**Ops/infra:** go-live config table (§12) closed · rate-limiter fail-open fix · `.env` untrack + rotate (#1577) · decide hosting (stay Render vs E2E VM now — recommend: **stay on current stack for early access**, migrate to E2E during days 30–60; don't couple launch to a migration).
**Marketplace:** 20-broker target list · consent note drafted · first 5 broker visits · first 10–15 listings live via done-for-you flow · WhatsApp broadcast list created.
**Legal:** ToS/Privacy draft + lawyer hour booked.

### 17. 30-day plan

25–50 curated listings, 5–8 active brokers, early-access soft launch to Manipal groups (July intake timing!), concierge on every property request, analytics baseline live (pageviews + 6 SQL supply queries), freshness reconfirmation loop running manually, first 4 SEO content pieces, E2E VM provisioned + staging deploy tested (backup/restore drill included).

### 18. 60-day plan

75–100 listings, 15+ brokers, production migrated to E2E VM (or consciously deferred), per-listing OG cards + prerendered area pages live, first "new listings weekly" broadcasts, referral ask added post-lead, review funnel metrics → kill/double channels, decide owner-direct policy, badge-earning (photo+identity dimensions) applied to all founding listings so real "Trusted/Verified" badges render.

### 19. 90-day launch-readiness plan

**Public launch gate (all must be true):** ≥100 active listings in wedge (or a deliberate 50-listing "curated" positioning) · ≥10 active brokers · freshness policy enforced ≥3 weeks with <10% stale · search-with-results ≥80% for wedge queries · lead loop proven (≥25 leads forwarded, ≥5 confirmed site visits) · uptime ≥99.5% over 30 days with restore-tested backups · §12 table green · ToS/Privacy published. Then: announcement (local press/college groups/broker co-promotion), referral push, and the post-launch UX list (§8) becomes the backlog.

---

## 20. Recommended GitHub issue changes

**Housekeeping:** close 5 zero-open milestones (M23 #24, M26 #27, M27 #29, M28 #34, M30 #37); sweep the 8 Post-MVP icebox issues (#404, #552, #637–640, #383, #717) with an explicit "deferred until PMF" comment; M23 mobile-UX milestone re-triaged after real mobile usage data.

**Well covered — do not duplicate:** listing seeding (#1779 + PRs #1782/#1783 + M28-prep cluster), OpenSearch production rollout (M27 fully closed — resist reopening; it's trigger-gated), images→CDN (#1715), secrets (#1577), E2E failures (#1721), saved-listings hardening (#1790).

**Genuine gaps (confirmed zero existing coverage) — new issues:**

1. **Founding-broker onboarding & done-for-you supply operations** (ops-heavy issue anchoring §4; P0-launch).
2. **Low-supply UX: request-a-property lead capture + empty-state fallbacks** (§8 item 2; P0-launch).
3. **Honest landing page & trust-copy rewrite** (§8 item 1; P0-launch).
4. **Listing freshness/expiry/reconfirmation policy** (§9; P1).
5. **SEO foundations: meta/OG/sitemap/robots/prerender for public pages** (§15; P1).
6. **Pre-launch analytics: pageview layer decision + founder weekly dashboard queries** (§14; P1).
7. **Production go-live config hardening + E2E Networks deployment runbook** (§11–12; P0-launch; complements #1715/#1577 without duplicating them).
8. **Rate-limiter fail-open fix (`buckets.clear()` + XFF trust)** — may fold into 7 or ride #1790's hardening train; P1.

**Suggested new milestone:** `M40 — Launch GTM & Supply Ops` holding 1–8 above, so launch work stops hiding inside engineering milestones. **Suggested labels:** `gtm`, `supply-ops`, `seo`, `lead-capture` (the ~90-label taxonomy has no demand-side vocabulary at all — itself evidence of the build-vs-operate imbalance).

---

## 21. Founder decisions (accepted defaults, 2026-07-07)

The following recommendations are **accepted as defaults**; revisit only if circumstances change.

1. **Hosting sequence — DECIDED:** launch early access on the current Render/Cloudflare/Supabase stack; migrate to the E2E Networks VM during days 30–60. Launch is not coupled to a migration.
2. **Image storage (#1715) — DECIDED:** Supabase Storage + Cloudflare in front first (zero code change); consider R2/E2E-EOS via S3 API later if egress cost or coupling demands it.
3. **Launch bar — DECIDED:** 25–50 curated verified listings for early access; 100+ active listings before broader public launch.
4. **Anon map pins — DECIDED:** show coarsened teaser pins to anonymous users, provided the existing privacy model (`GeoCoarsener` ~1.1 km coarsening, no exact pins, no PII) remains intact.
5. **Analytics — DECIDED (tool pending):** self-hosted privacy-respecting pageviews via Plausible or Umami; final tool choice pending a short evaluation. Not GA4; do not expand the consented event schema pre-launch.
6. **Owner-direct listings — DECIDED:** referral-only during the founding period.
7. **Trends surfaces — DECIDED:** hide/gate behind "coming as data grows" until enough real local data exists to display honestly.
8. **Legal — DECIDED:** book one local-lawyer hour (platform RERA/intermediary status + DPDP privacy policy) before public launch.
9. **Monetisation wording — DECIDED:** free founding period, with future founder pricing and advance notice before any charge ("free until further notice with founder pricing promise").

---

*This plan supersedes nothing; it fills the gap left by the absent DELIVERY/DEPLOYMENT/MARKETING/OPENSEARCH-PRODUCTION plan docs. If those are authored later, they should derive from and link back to this document.*
