# Buyer Area Intelligence — developer handoff (#1528)

Buyer-facing area intelligence UI. **Design refinement only — do not implement backend or edit APIs.**
Mock: `ui_kits/buyer/area-insights.html` (+ `BuyerArea.jsx`, `data.js`).

## What this screen does
Helps a home buyer understand an area in plain English. It answers, in order:
1. What is this area like? → header + summary
2. How active is the market? → "At a glance" metric cards
3. How confident is the data? → confidence badge + "Data confidence" card
4. What should I know before choosing? → "What this means for you"
5. Which metrics are unavailable? → null cards rendered as "Not enough data yet"

## API
`GET /api/trends/area-intelligence?city={citySlug}&areaKey={full pipe areaKey}` (merged in #1527).

### Buyer-safe fields consumed
| UI element | API field | Notes |
|---|---|---|
| Area name / city / context | `area`, `city`, area metadata | — |
| Summary paragraph | `summary` (plain English) | — |
| Confidence badge + Data-confidence card | `confidence` | one of `Enough data` / `Limited data` / `Not enough data yet` |
| Active listings | `activeListings` | integer |
| Median price | `medianPrice` | preformatted string e.g. `₹55L` |
| Most searched budget | `mostSearchedBudget` | **nullable** → "Not enough data yet" |
| Average listing quality | `avgListingQuality` | **nullable**, out of 100 → "Not enough data yet" |
| Fresh listings | `freshListings` | integer, last 30 days |
| "Good to know" / "Worth checking" | `summary`-derived interpretation | conservative, factual, no buy advice |
| Area character (hero quick facts) | static area metadata | descriptive only — never derived numbers |
| Nearby area tags | static area metadata | `coastal` / `student belt` / `town centre` — navigation, not metrics |

`value: null` is the **only** unavailable signal. Render the unavailable card — never `0`, never a blank.

## Reuse these existing components (`window.ReTrendsDesignSystem_f37966`)
- `Card` / surfaces — hero quick-facts card, empty/error notices.
- `Button` — `primary` (hero View homes), `accent` (clay, in CTA band), `outline` (Save area / Sign in).
- `Badge` — the small "Rough guide" pill on low-confidence metrics (`tone="caution"`).
- `Icon` — building, trending-up, search, star, calendar, shield-check, map-pin, heart, check, alert-triangle, chevron-right, arrow-right, route, message-circle.
- Local to this screen: `Hero` (tinted panel + quick-facts), `MetricCard`/`ConfidenceCard` (value / null / low-conf / prominent / skeleton), `TrustStrip` ("Why we show this"), `MeaningColumn`, `ConfidenceChip`, `CenteredNotice`, `Skeleton`. The metric grid is a custom card (not `StatTile`) because it renders value / null / low-confidence / prominent / skeleton in one component.

### Layout modules (top → bottom)
1. **Hero / area guide** — breadcrumb, `Area · {city}` + `Area guide` eyebrow, serif area name, buyer summary, location chip + confidence chip, primary `View homes` + `Save area`, and a `What it's like` quick-facts card (static area character metadata — coastal, distance, dominant property type; **not** derived metrics).
2. **At a glance** — 6 cards: Active listings, Median price, **Most searched budget** (prominent/gold), Average listing quality, Fresh listings, Data confidence (navy trust card).
3. **Why we show this** — trust strip restating the no-guessing rule.
4. **What this means for you** — promoted, tinted panel, two columns (Good to know / Worth checking).
5. **Compare nearby areas** — navigation cards (name + character tag only).
6. **CTA band** — navy, clay primary.
7. **Footer note** — transparency line + updated date.

## States (all in the mock — switch via the bottom "Mock state" bar; that bar is NOT shipped)
- **Full** — every field present.
- **Partial** — `mostSearchedBudget` and `avgListingQuality` null → "Not enough data yet" + helper "We need more verified … before showing this."
- **Low confidence** — values present, `confidence: Limited data`; each card shows a "Rough guide" pill and a one-line caveat.
- **No snapshot** — no row for the area. Friendly centered notice; no metric grid; CTAs + nearby areas remain.
- **API error** — calm navy notice + "Try again". No red alarm styling.
- **Loading** — skeleton shimmer for header + 6 cards + interpretation.

## Do NOT implement
- No `demand_score` shown, ever (not even derived).
- No raw demand/search counts.
- No broker action language: *demand gap, supply gap, add listing, improve listing, review pricing*.
- Do **not** fabricate `mostSearchedBudget`, and do **not** derive it from listing prices.
- No `0` fallback for suppressed/k-anon values.
- No new backend fields, no new migration, no changes to #1534 broker APIs.

## Area comparison
The API contract does not expose cross-area comparison metrics, so "Compare nearby areas" is **navigation only** (links to each area's own page). Do not invent comparison numbers or add placeholder columns.

## ⚠️ areaKey caution (implementation risk for #1528)
The API needs the **full pipe-delimited** `areaKey` (e.g. `karnataka|udupi|udupi-taluk|malpe`).
The buyer route today appears to carry only a short slug (`malpe`). Before wiring this UI:
- resolve the short slug → full pipe key on the server / via an existing lookup, **or**
- confirm the route already has the full key.

Do **not** solve this in the UI by inventing or hardcoding a key. If unresolved, the call will miss the row and should fall through to the **No snapshot** state — which this design already handles gracefully.
