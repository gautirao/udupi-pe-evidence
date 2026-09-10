# Issue #2456 — nearby-candidates `listingPurpose` runtime evidence

Local fixture stack only (never the shared DB): dedicated PostGIS container
`pg-test-fixture-2456` on :5438 restored by `scripts/dev/local-fixture-backend.sh`
(Bangalore navigation-hierarchy fixture), backend on :8121, two Vite servers against
the SAME backend — baseline `d36b358b` (origin/main) on :5222 and this branch on :5221.
Captured headless with Playwright Chromium.

## Scenario

Committed single-Area scope **Deepanjali Nagar**, filter `priceMax=100000` (₹1 lakh),
"Add nearby areas" draft open. RR Nagar is a nearby candidate. Its LIVE fixture rows
(read from the local fixture DB): 3 sale listings at ₹4,20,000 / ₹5,00,000 / ₹7,20,000
(all above the cap) and 2 rent rows at ₹0
(`navigation-hierarchy-fixture-rent-listings-seed.sql`).

URL (Buy): `/discover?node=a:IN|KA|Bengaluru|Deepanjali Nagar&areaKey=IN|KA|Bengaluru|Deepanjali Nagar&lat=12.96&lon=77.53&zoom=15&rscope=area&priceMax=100000`
URL (Rent): same plus `&intent=rent`

## Observed RR Nagar candidate count ("N listings · 1 schools")

| # | File | Intent | Viewport | Build | RR Nagar count | Request sent |
|---|------|--------|----------|-------|----------------|--------------|
| 1 | `1-before-buy-priceMax1L-1366x768.png` | Buy | 1366x768 | main d36b358b | **2 listings** (the two ₹0 rent rows) | no `listingPurpose` |
| 2 | `2-after-buy-priceMax1L-1366x768.png` | Buy | 1366x768 | branch | **0 listings** | `listingPurpose=sale` |
| 3 | `3-before-buy-priceMax1L-390x844.png` | Buy | 390x844 | main d36b358b | **2 listings** | no `listingPurpose` |
| 4 | `4-after-buy-priceMax1L-390x844.png` | Buy | 390x844 | branch | **0 listings** | `listingPurpose=sale` |
| 5 | `5-before-rent-priceMax1L-1366x768.png` | Rent | 1366x768 | main d36b358b | 2 listings | no `listingPurpose` |
| 6 | `6-after-rent-priceMax1L-1366x768.png` | Rent | 1366x768 | branch | 2 listings (unchanged) | `listingPurpose=rent` |
| 7 | `7-before-rent-priceMax1L-390x844.png` | Rent | 390x844 | main d36b358b | 2 listings | no `listingPurpose` |
| 8 | `8-after-rent-priceMax1L-390x844.png` | Rent | 390x844 | branch | 2 listings (unchanged) | `listingPurpose=rent` |

Buy count drops by exactly the two ₹0 rent rows; Rent is unchanged.

## API cross-check (same backend, curl)

```
GET /api/discover/areas/nearby-candidates?city=bangalore&selected=IN|KA|Bengaluru|Deepanjali Nagar&priceMax=100000
  -> RR Nagar eligibleListingCount 2
... &listingPurpose=sale  -> RR Nagar eligibleListingCount 0
... &listingPurpose=rent  -> RR Nagar eligibleListingCount 2
```

## Request URLs intercepted in the browser (branch build)

```
/api/discover/areas/nearby-candidates?city=bangalore&priceMax=100000&listingPurpose=sale&selected=IN%7CKA%7CBengaluru%7CDeepanjali+Nagar   (AreaSetDraftProvider, Buy)
/api/discover/areas/nearby-candidates?city=bangalore&priceMax=100000&listingPurpose=rent&selected=IN%7CKA%7CBengaluru%7CDeepanjali+Nagar   (AreaSetDraftProvider, Rent)
/api/discover/areas/nearby-candidates?city=bangalore&priceMax=100000&selected=IN%7CKA%7CBengaluru%7CDeepanjali+Nagar                       (AreaZeroResultRecovery — lane-2454's file, still purpose-less; see PR body)
```

## Sequenced follow-up (after PR #2457): `AreaZeroResultRecovery` — `recovery/`

Same scenario, now the zero-result recovery panel's own "Nearby areas with
matches" rows (the last purpose-less nearby request in the table above).
Fresh lane stack: `pg-test-fixture-2462` on :5439, backend :8191, one Vite
:5291 serving this worktree. BEFORE = component reverted in the working tree to
the merge head `a58f03e3` (origin/main `d9475ad5` merged in); AFTER = HEAD.
Headless Playwright Chromium, anonymous, no draft opened.

| Arm | Intent | Viewport | RR Nagar recovery row | Recovery request |
|-----|--------|----------|-----------------------|------------------|
| before | Buy | 1366x768 / 390x844 | **2 listings** (the ₹0 rent rows) | no `listingPurpose` |
| after | Buy | 1366x768 / 390x844 | **row absent**; "No nearby area has matches with these filters either." | `listingPurpose=sale` |
| before | Rent | 1366x768 / 390x844 | 2 listings | no `listingPurpose` |
| after | Rent | 1366x768 / 390x844 | 2 listings (unchanged) | `listingPurpose=rent` |

Intercepted URLs are in `recovery/before-results.json` / `after-results.json`.
In BEFORE a third, purpose-less `nearby-candidates?...&selected=...` request
sits alongside the provider's purpose-carrying ones; in AFTER every
nearby-candidates request carries the purpose.

API cross-check on the same backend (:8191): no purpose → RR Nagar
`eligibleListingCount` 2; `listingPurpose=sale` → 0; `listingPurpose=rent` → 2.

### Reviewer-renderable crops

The full 1366x768 frames are ~740 KB each, which some review retrieval paths
expose as encoded/truncated content rather than renderable pixels. The two crops
below are cut from those exact committed frames (no re-run, no re-shoot): the
right-hand panel region `x 690..1366, y 70..665`, 256-colour PNG, ~26 KB each.

| File | Shows |
|------|-------|
| `recovery/2456-before-1366x768-buy-recovery-rr-nagar-2-listings-CROP.png` | Buy · Deepanjali Nagar · up to ₹1 L — "NEARBY AREAS WITH MATCHES — YOUR FILTERS" with `RR Nagar · 2.3 km away · 2 listings · Add` |
| `recovery/2456-after-1366x768-buy-recovery-no-matching-nearby-CROP.png` | Same scenario — that section absent, replaced by "No nearby area has matches with these filters either." |

The full-resolution originals are retained unchanged alongside them.

