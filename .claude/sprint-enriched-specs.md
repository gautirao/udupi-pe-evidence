# Design Polish Sprint 1 Enriched Specs

## #748 feat(frontend): marketing landing page — hero, value props, footer CTA

AC:
- [ ] Unauthenticated users visiting `/` render the marketing landing page with Hero, "Why Choose ReTrends?" (3 static cards), Trending Localities placeholder (3 skeleton cards), and Footer CTA sections, in that order.
- [ ] Authenticated users visiting `/` are redirected to the map route (`/discover`) — no flash of marketing content.
- [ ] Hero "Explore on Map" CTA navigates to `/discover` (decorative — no area pre-selection per pre-flight decision).
- [ ] Footer CTA buttons: "Start Map Search" navigates to `/discover`; "Explore Area Overview" navigates to `/area-overview` (no `areaKey` required).
- [ ] Existing anonymous teaser E2E (map anonymous view) still passes after the route change; selectors updated if `/` no longer renders map.
- [ ] Page renders without errors for both anonymous and authenticated users.

Out of scope: Trending Localities data wiring (#749), trust badge explainer section, dynamic stat counts, mobile-specific layout tuning.

Key unknowns: RESOLVED
- Routing: anon `/` → marketing page; auth `/` → `/discover`. Hero CTA decorative → `/discover`, no area pre-selection.
- Footer "Explore Area Overview" → `/area-overview` (no `areaKey`). `/area-overview` must render graceful empty state (not a dead-end).

---

## #745 feat(frontend): listing detail — two-column layout, sidebar, Locality Insights card, Key Highlights

AC:
- [ ] At viewport ≥1024px, `ListingDetail.tsx` renders a two-column layout: main content (carousel, title/price/stats, About, Key Highlights) on the left; sticky sidebar (Interested heading, Request Viewing, Contact Broker, Locality Insights card) on the right.
- [ ] At viewport <1024px, layout collapses to single column with no overlap or sticky regressions.
- [ ] "Request Viewing" and "Contact Broker" both open the existing `RequestViewingModal` with unchanged submit behavior; only the triggering button label differs.
- [ ] Locality Insights card renders when an `areaKey` is derivable from the listing's locality and links to `/area-overview?areaKey=<key>`; card is omitted (not errored) when no areaKey can be derived.
- [ ] Key Highlights section renders top-3 trust badges from existing `DIMENSION_LABELS` mapping as a bullet list; shows "+ N more" affordance when more than 3 badges are present.
- [ ] UJ1 E2E journey passes; admin and broker preview modes render without regression.

Out of scope: Heart/wishlist button, distinct Contact Broker flow with phone reveal, any backend changes, mobile-specific optimizations.

Key unknowns: RESOLVED
- areaKey blocker = add areaKey field to ListingResponse + ListingResponseMapper as part of #745.

---

## #746 feat(map): add View Area Overview button to filter bar + New badge on listing cards

AC:
- [ ] "View Area Overview" button appears beside the Filters button in the map sidebar and is enabled only when exactly one area is selected; clicking navigates to `/area-overview?areaKey=<selectedAreaKey>`.
- [ ] Button is hidden (not disabled) when 0 or >1 areas are selected; state updates reactively as selection changes.
- [ ] Listing cards in the map sidebar show an orange "New" badge when `created_at` is within the last 7 days (UTC-based computation against `Date.now()`).
- [ ] "New" badge is not shown for listings with `created_at` ≥ 7 days ago.
- [ ] Existing map interactions unchanged: locality multi-select, fit-to-selection, nearby chip, filter modal, infinite query pagination.

Out of scope: Backend changes, badge styling variants beyond "orange", mobile tap-target tuning.

Key unknowns: RESOLVED
- Button: **hidden** (absent) when 0 or >1 areas selected.
- "New" badge: **UTC-based rolling 7×24h** check against `Date.now()`.

---

## #747 feat(backend): GET /api/public/areas/trending — top areas by 30d activity

AC:
- [ ] `GET /api/public/areas/trending` returns 200 with shape `{ areas: [{ areaKey, areaLabel, districtLabel, medianPricePaise, listingCount90d }] }`; no auth required.
- [ ] `limit` query param defaults to 6, clamps silently to max 12 (no 400).
- [ ] Results sorted by `listing_count_90d DESC` (per pre-flight decision).
- [ ] Areas with zero listings are excluded from the response.
- [ ] Empty dataset returns 200 with `{ "areas": [] }`, never 404.
- [ ] Backend unit/integration test covers: sorted ordering, limit enforcement (default + clamp), zero-listing exclusion, empty-table case.

Out of scope: New Flyway migration, changes to `AreaOverviewRollupJob`, caching layer, frontend wiring (#749).

Key unknowns: RESOLVED
- Sort column: `listing_count_90d DESC`.
- `limit` > 12: **silent clamp to 12** (no 400). Optional: server-side metrics logging for clamped requests.

---

## #749 feat(frontend): wire Trending Localities section on landing page

AC:
- [ ] Landing page Trending Localities section calls `GET /api/public/areas/trending?limit=6` on mount (no auth header) and renders locality cards with `areaLabel`, `districtLabel`, price from `medianPricePaise` (formatted as INR crores/lakhs), and `listingCount90d` formatted as "N properties".
- [ ] Each card's "Explore Area →" link navigates to `/area-overview?areaKey=<areaKey>` using the exact key returned by the API.
- [ ] While fetching, exactly 3 skeleton cards are rendered in place of the section body.
- [ ] On error response or empty `areas: []`, the entire Trending Localities section (including header) is hidden.
- [ ] "Trending" badge renders on each card.
- [ ] Desktop shows 3 cards initially with a "Show more" button revealing all 6.

Out of scope: Backend changes, authenticated variant, mobile-specific card layout, analytics on card clicks.

Key unknowns: RESOLVED
- Expansion: **"Show more" button** reveals cards 4–6 (one-step progressive disclosure).
- Price formatting: `medianPricePaise` → **≥ 1 Cr: "₹X.XX Cr"** | **≥ 1 L and < 1 Cr: "₹XX L"**.
