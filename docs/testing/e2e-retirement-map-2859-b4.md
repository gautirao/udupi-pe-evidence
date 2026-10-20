# E2E retirement map — #2859 batch B4 (pages, POI, trends)

Handoff 285904. Seven legacy specs, one disposition per subclaim. The specs stay on disk, byte-identical, and still claim no coverage. Nothing in this batch deletes anything. Manifest status stays `SCHEDULED(#2859)`.

Dispositions: `COVERED_NEW` (a new test written in this batch), `COVERED_EXISTING` (an existing test, green at base, with its own mutation), `COVERED_EXISTING (canonical, unmutated)`, `RETAIN` (a reason is given), `STALE` (the product contradicts the spec; a file:line is given), and `OBSOLETE`. An arm marked "asserted, unmutated" is checked by the cited test but has no mutation of its own, so it is not claimed as covered.

Test ids are written as `file > describe > it`. Mutation ids are rows in `.claude/handoffs/issue-285904/evidence/mutation/register.tsv`. Every cited mutation is `RED`: its observed red set contains the cited test, the product was restored byte-identical, and the re-run was green.

## Evidence and base

- **Worktree.** `issue-2859-b4-pages-poi-trends`, now at `bac4c7c8` (#2877 merged after the assignment base `435bf9db`). `git diff --stat 435bf9db bac4c7c8 -- apps/web apps/api/src/main` lists only B23 **test** files. Every product file mutated here, and every cited test file, is unchanged, so the `web-base-*` runs taken at `435bf9db` still stand as the R_base_red evidence. The harness BASE is `bac4c7c8`.
- **Base runs (R_base_red).** Logs are in `evidence/runs/web-base-*`, each one vitest invocation, with a loopback env.

| File | Result at base | Exit code |
|---|---|---|
| LandingPage.test.tsx | **RED**, 15 of 37 its fail | 1 |
| AreaGuide | 38/38 | 0 |
| MyBookings | 11/11 | 0 |
| editListingSelectors | 19/19 | 0 |
| Trends.exhaustiveDeps | 6/6 | 0 |
| PropertyTypeFilter.impliedPropertyType | 19/19 | 0 |
| TrendsAreaResolved | 12/12 | 0 |
| AreaMarketWidget | 11/11 | 0 |
| discoverSearchParams.commercialSubtype | 3/3 | 0 |
| PoiManager.test | 23/23 | 0 |
| ListingDetail.test | 45/45 | 0 |
| features/.../commercialSubtype.test | 13/13 | 0 |
| ReviewStep.test | 10/10 | 0 |
| ListingGallery.test | 2/2 | 0 |

  **None of LandingPage.test.tsx's its are cited.** Its landing claims are proved in the new `LandingPage.navigation2859` file instead. The causes of the red its: the default city is now `bangalore` (`localityUtils.ts:18`), the brand is now PropertySignal, and the hero copy changed.
- **Final run.** `evidence/runs/web-final.log` / `.json`: one vitest invocation over 15 files, **185/185 passed, exit 0**.
- **Mutations.** 60 rows: 56 RED and 4 SURVIVED. Every row has restored_sha_ok=true and green_after=true. The 4 SURVIVED rows are a predicate-string error, corrected below. `final-restore-check.txt` shows `VERDICT: BYTE_IDENTICAL`.
- **Predicate correction.** MA1, MA2, MA3 and MPT1 were scored SURVIVED only because their predicted substrings left out the quotes that vitest puts around `it.each` `$`-interpolated values. Their observed sets do contain the cited its (see `observed/MA1.txt` and the others). The original rows are kept. The same edits were re-run with corrected predicates as MA1r, MA2r, MA3r and MPT1r, and all four are RED.

## Web section

### csv176 — e2e/homepage-listing-journey.spec.ts

`NAV` = `apps/web/src/pages/__tests__/LandingPage.navigation2859.test.tsx > LandingPage navigation #2859 B4 (real router, no useNavigate mock)`
`GAL` = `apps/web/src/components/listing/__tests__/ListingGallery.anonLock2859.test.tsx > ListingGallery anonymous lock #2859 B4 (given isAnonymous)`

| Id | Disposition | Destination / reason | Mutation |
|---|---|---|---|
| H1a URL stays `/` | RETAIN | real router/redirect boundary | — |
| H1b h1 'Find Your Perfect Home with Trust' | STALE | `LandingHero.tsx:42-44` ('Homes in Karnataka , honestly curated') | — |
| H2a Explore on Map + 'Search localities' | COVERED_NEW | NAV > H2a: the hero search renders the Explore on Map button and the "Search localities..." input | ML6 (ML7 also reddens it) |
| H2b 'Why Choose ReTrends?' | STALE | `LandingFeaturesSection.tsx:45` ('Why Choose PropertySignal?') | — |
| H2c 'Trending Localities' | STALE | `TrendingLocalitiesSection.tsx:49` ('Localities in {cityLabel}') | — |
| H2d 'Understanding Trust Badges' | STALE | `LandingTrustSection.tsx:52` ('How we keep listings honest') | — |
| H2e 'Area Overview Pages' | COVERED_NEW | NAV > H2e: the "Area Overview Pages" section heading renders | ML8 |
| H2f 'Ready to Find Your Perfect Home?' | COVERED_NEW | NAV > H2f / H3b.href: the bottom CTA heading renders … | ML9 |
| H3.arg navigate argument | COVERED_NEW | subsumed by H3.land (the landed URL proves the argument). The LandingPage.test.tsx it is red at base and is not cited. | ML1 |
| H3.land click lands on /discover?city= | COVERED_NEW | NAV > H3.land: Explore on Map lands on /discover?city=<default city> … | ML1 |
| H3b.href header Discover | COVERED_NEW | NAV > H3b.land: the header Discover link carries /discover?city=<default city> … | ML2 |
| H3b.href Start Map Search / Explore Trends | COVERED_NEW | NAV > H2f / H3b.href: … Start Map Search -> /discover?city=<default> and Explore Trends -> /trends | ML3 / ML4 |
| H3b.land Discover / Start Map Search / Explore Trends | COVERED_NEW | NAV > H3b.land: the header Discover link … / … Start Map Search click lands … / … Explore Trends click lands on /trends | ML2 / ML3 / ML4 |
| H4.src image 0 has its src | COVERED_NEW (given isAnonymous) | GAL > H4-H7 index path … ; GAL > H5-H7 locked path … | MG6 |
| H4.nolock no lock at image 0 | COVERED_NEW (given isAnonymous) | GAL > H4-H7 index path … | MG3 |
| H5 Next / Previous visible | COVERED_NEW (given isAnonymous) | both GAL its | MG4 |
| H6.index Next → lock (images ≥ 2) | COVERED_NEW (given isAnonymous); the signed-in control is in the same it | GAL > H4-H7 index path: … Next locks … | MG1 (`>=1 -> >=2`) |
| H6.locked Next at last real image → lock without advancing | COVERED_NEW (given isAnonymous); the signed-in control is in the same it | GAL > H5-H7 locked path: … | MG2 |
| H7 CTA href /auth?returnTo=/listing/<id> | COVERED_NEW (exact href, raw and decoded) | both GAL its | MG5 |
| H4-7.user the page treats `useAuth().user === null` as anonymous | COVERED_EXISTING | `apps/web/src/pages/__tests__/ListingDetail.test.tsx > ListingDetail — anonymous gallery lock (issue #835) > anon: clicking next image shows locked overlay` | MG7 (`ListingDetail.tsx:438`) |
| H4-7.anon-derive the real session → user | RETAIN | R_injected: useAuth is mocked in every web test. Canonical T11 (`e2e/canonical/listing-detail-gating.canonical.ts:91-160`, body read) drives a real anonymous browser to this exact lock and href. It is unmutated here and noted as corroboration only, not claimed. | — |
| H4-7.server truncation for anonymous callers | RETAIN | no backend test was located in the web slice (the backend slice may cite one). T11 exercises the real anonymous teaser shape; it is unmutated and not claimed. | — |
| H8 authed `/`: no redirect + same h1 | h1 STALE (as H1b); no-redirect RETAIN (real session) | — | — |
| P1a anonymous Sign in link | COVERED_NEW | NAV > P1a: the anonymous header Sign in link points at /auth with returnTo=/ | ML10 |
| P1b header has no 'undefined' | COVERED_NEW (Sign in + brand control in the same it) | NAV > P1b: … | ML5 |

**Note.** The `>=1 -> >=2` mutation (MG1) reddens **only** the index-path it. The locked-path it survives it, by design: with a single real image only `galleryLocked` can lock. That is why each path has its own it, with MG1 and MG2 as the separate proofs.

### csv216 — e2e/user-journeys.spec.ts

| Id | Disposition | Destination / reason | Mutation |
|---|---|---|---|
| U1 /saved-areas h1 + no error boundary | COVERED_NEW | `apps/web/src/pages/__tests__/SavedAreas2859.test.tsx > SavedAreas page #2859 B4 (U1) > U1: renders the "My Saved Areas" h1 and the saved rows, and not the error-boundary copy` (+ the `U1: an empty list …` it). A test-local boundary renders the Sentry copy, because the Sentry boundary in `main.tsx:14` is not mounted. | MS1 (heading); MS2 (a page crash → boundary copy) |
| U2 /my-bookings h1 + no error | COVERED_NEW | `apps/web/src/pages/__tests__/MyBookings.test.tsx > MyBookings page > #2859 U2: renders the "My Bookings" h1 with content and no error copy; a failed load renders the error copy` | MB1 (heading); MB2 (error branch) |
| U3 /insights → /trends | RETAIN | owner DEFERRED. App.tsx has no /insights route (catch-all NotFound at `App.tsx:415`). | — |
| U4a no error boundary | OBSOLETE | no failing positive | — |
| U4b listing title visible | COVERED_EXISTING | `apps/web/src/pages/__tests__/ListingDetail.test.tsx > ListingDetail — residential redesign smoke > summary card renders title, price and a Google Maps link when coords exist` | MD1 |
| U4c AreaMarketWidget state | OBSOLETE (the spec only console.logs); mounting on ListingDetail RETAIN (ListingDetail.test mocks the widget) | — | — |
| UJ1.helpers `data.content` | STALE | `user-journeys.spec.ts:223-225, 288-291, 343-346` read `content`; the API returns `items` (MyBookings.test.tsx makePagedResponse) | — |
| UJ1.flow POST + success + row on /my-bookings | COVERED_EXISTING (canonical, unmutated) | T17, `e2e/canonical/booking-request.canonical.ts:298-409` (body read: real POST 2xx, `viewing-request-success`, row by date + slot) | — |
| UJ1.card fields | COVERED_EXISTING (time slot only) | `MyBookings.test.tsx > MyBookings page > renders a booking row (listing id, date, time slot) from the real five-key PagedResponse envelope`. MB4 swaps only the time slot (`MyBookings.tsx:69`). Listing id and date: asserted, unmutated. | MB4 |
| UJ1.badge 'Requested' | COVERED_NEW | `MyBookings.test.tsx > MyBookings page > #2859 UJ1: a REQUESTED booking card shows the "Requested" badge, distinct from a CONFIRMED card` | MB3 |
| UJ1.dialog / Radix Select / visible toast | RETAIN | Radix dialog + Select + the real Toaster (R_jsdom, R_toast). Non-agri detail now uses the inline panel (ListingDetail.test.tsx:665-677), but the spec fixture's type is unknown. | — |

### csv204 — e2e/poi-display.spec.ts

`NP` = `apps/web/src/components/poi/__tests__/NearbyPois2859.test.tsx > NearbyPois #2859 B4 (component, api.get mocked)`
`PM` = `apps/web/src/components/poi/__tests__/PoiManager.approve2859.test.tsx > PoiManager approve #2859 B4`

| Id | Disposition | Destination / reason | Mutation |
|---|---|---|---|
| P1a heading | COVERED_NEW | NP > P1a-d / PM1k.render: … | MN4 |
| P1b-c POI names | COVERED_NEW | NP > P1a-d / PM1k.render | MN3 |
| P1d OSM attribution | COVERED_NEW | NP > P1a-d / PM1k.render | MN2 |
| P1.endpoint GET /api/listings/{id}/pois, skipAuth | COVERED_NEW | NP > P1a-d / PM1k.render (exact path + `{ skipAuth: true }`) | MN1 |
| P2 hidden when empty (land) | STALE | `NearbyPois.tsx:269-274` (the land card stays, showing 'Location context not yet computed') | — |
| P2 hidden when empty (apartment) | COVERED_NEW (rerender control) | NP > P2 (apartment): … | MN7 |
| P3a-c broker sees same POIs | OBSOLETE | duplicate of P1; anonymous skipAuth endpoint | — |
| P4a-c town / bus stand / hospital | COVERED_NEW | NP > P4a-c: … | MN5 (town), MN6 (bus stop), MN3 (hospital) |
| P4 'Settlement Context' wording | STALE | `NearbyPois.tsx:286-293` ('Nearest town' FactRow) | — |
| PM1b-d suggestion rows + Approve buttons | COVERED_NEW | PM > PM1b-e / POI1c-e: … (PoiManager.test.tsx not cited) | MP8 |
| PM1e settlement has no Approve button | COVERED_NEW (amenity Approve in the same it) | PM > PM1b-e / POI1c-e | MP2 |
| PM1f-j PATCH path | COVERED_NEW | PM > PM1f-j / POI2b-f: … | MP5 |
| PM1f-j follow-up GET count increment | COVERED_NEW | same it | MP6 |
| PM1f-j Approved tab active | COVERED_NEW | same it | MP1 |
| PM1f-j badge 1 | COVERED_NEW | same it | MP7 |
| PM1.error toast argument | COVERED_NEW (hoisted spy) | PM > PM1.error: … | MP4 |
| PM1.error tab stays Suggested | COVERED_NEW | PM > PM1.error | MP1 |
| PM1.error visible toast | RETAIN | R_toast: the real Toaster is not mounted | — |
| PM1k.stub | OBSOLETE | the spec's own page.route stub | — |
| PM1k.persist | COVERED_NEW | POI > ownerApprove_persists_andAppearsOnAnonymousPublicRead (AC4(a), DB re-read; see the Backend section) | MBP1 |
| PM1k.public | COVERED_NEW | POI > ownerApprove_persists_andAppearsOnAnonymousPublicRead (AC4(b), anonymous read absent before / present after, same test; see the Backend section) | MBP2 |
| PM1k.render | COVERED_NEW (component) | NP > P1a-d / PM1k.render (renders a GET response). The page mount on /listing/:id is RETAIN. | MN3 |
| PM1.authz | COVERED_NEW | POI > adminApprove_onAnotherBrokersListing_succeeds / nonOwnerBroker_isForbidden_andPoiStaysUnapprovedAndHidden / poiOfAnotherListing_isNotFound_andUnchanged / settlementPoi_isBadRequest_andUnchanged (AC4(c)-(f); see the Backend section) | MBP4 / MBP3 / MBP5 / MBP6 |

### csv205 — e2e/poi-locality-teaser.spec.ts

| Id | Disposition | Destination / reason | Mutation |
|---|---|---|---|
| POI1a/POI2a/LG1a/LG3d wait for step-4-panel | STALE | `EditListingForm.tsx:279` (agri boundary step only) vs `:289` `step-review-panel` | — |
| POI1b skeleton while loading | COVERED_NEW | PM > POI1b: shows the skeleton while suggestions load, then the rows replace it | MP3 |
| POI1c-e suggested rows + Approve | COVERED_NEW | PM > PM1b-e / POI1c-e (synthetic names) | MP8 |
| POI2b-f approve → Approved tab + row + badge | COVERED_NEW | PM > PM1f-j / POI2b-f | MP1 (also MP5, MP6, MP7) |
| LG1b-d copy + disabled Submit | COVERED_NEW (render level) | `apps/web/src/pages/broker/editListing/steps/__tests__/ReviewStep.locality2859.test.tsx > ReviewStep locality gate #2859 B4 (render level) > LG1b-d -> LG3e-f: …` (+ `LG1c rent variant …`) | MR1 (copy), MR2 (disabled), MR4 (rent copy) |
| LG.derive blank locality → incomplete | COVERED_NEW (sale guard only; 'Manipal' control) | `apps/web/src/pages/broker/editListing/__tests__/editListingSelectors.test.ts > selectRequiredFieldsComplete / selectAllConditionsMet > #2859 LG.derive: …`. MSEL1 removes only the sale `!!locality` guard (`editListingSelectors.ts:179`). The rent guard (`:178`): asserted, unmutated. | MSEL1 |
| LG.derive whitespace-only | not claimed | the client check is `!!locality` (`editListingSelectors.ts:178-179`), so whitespace passes on the client. The rejection is the server rule: LTPT > missingLocality_…[3] (whitespace-only), see the Backend section. | (MBL2) |
| LG2a-c 422 errors[] locality | rule COVERED_NEW; envelope COVERED_EXISTING | rule: LTPT > missingLocality_yieldsOnlyTheLocalityError_completeListingPasses [1] null / [2] empty / [3] whitespace-only; envelope: ListingControllerTest > submit_tooFewImages_returns422 (see the Backend section) | MBL1 (rule) / MBL3 (envelope) |
| LG3a-c step 1 #locality + PUT | RETAIN | EditListingForm.commands.test.tsx was not examined for a locality PUT payload in the web slice | — |
| LG3e-f checklist turns green after save | COVERED_NEW (render level) | ReviewStep.locality2859 > LG1b-d -> LG3e-f (rerender complete). The cross-reload part is RETAIN (R_reload). | MR3 |
| POI.teaser | OBSOLETE | out of scope | — |

### csv192 — e2e/journey/area-trends-2581.spec.ts

| Id | Disposition | Destination / reason | Mutation |
|---|---|---|---|
| A1 'Enough data' chip | COVERED_NEW | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > #2859 A1-A3 — AreaGuideHero confidence chip tier > 'Enough data' renders the chip text with 'bg-emerald-50'` | MA1r |
| A2 'Limited data' chip | COVERED_NEW | `… > 'Limited data' renders the chip text with 'bg-amber-50'` | MA2r |
| A3 'Not enough data yet' chip | COVERED_NEW | `… > 'Not enough data yet' renders the chip text with 'bg-slate-100'` | MA3r |
| A1-A3.tier | COVERED_EXISTING (count → tier: FULL boundary only; tier → label: all three) | AreaIntelligenceSnapshotRollupJobIT > run_seedsThreeBands_persistsDistinctConfidenceOutcomes (count → tier; the LIMITED boundary `>= 10` is asserted, unmutated) + BuyerAreaIntelligenceServiceTest T1-T3 (tier → buyer label); see the Backend section | MBA1 / MBA2 |
| A1-A3.wiring | RETAIN | real backend + seed | — |
| A4 anonymous no redirect | RETAIN | routing/auth | — |
| A5 signed-in LIMITED | RETAIN | role mapping | — |
| A6 mobile 390 | RETAIN | viewport (D5) | — |
| A7 reload | RETAIN | R_reload | — |
| A8.href 'View homes in <area>' | COVERED_EXISTING | `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx > TrendsAreaResolved — #2750 PR-5 buyer-area-route-1539 destination > matched slug: breadcrumb landmark names city and area, both View-homes CTAs carry the exact discover href` | MTA1 |
| A8.land | RETAIN | Discover may ignore a stale areaKey under area-first (Trends.tsx:66-75) | — |
| A0 Discover Trends link | RETAIN | cross-page resolver | — |
| A9 admin badge vs buyer label | RETAIN | two code paths | — |

### csv215 — e2e/trends.spec.ts

| Id | Disposition | Destination / reason | Mutation |
|---|---|---|---|
| T1a/T2b h1 = seeded area name | STALE as written | for a pipe areaKey Trends.tsx:215 renders the AreaGuide, fed by useAreaIntelligence (Trends.tsx:166 -> GET /api/trends/area-intelligence, useAreaIntelligence.ts:83, which reads area_intelligence_snapshot); the spec seeds area_overview_stats instead (e2e/trends.spec.ts:71-95), so its seeded name is never the h1. The hero h1 rendering is not claimed (no mutation run for AreaGuide.test.tsx:221). | — |
| T1b-c legacy tabs + cards | STALE | a pipe areaKey returns the guide at `Trends.tsx:215`; the tabs (`:419-421`) and cards (`:369`, `:408`) are the legacy view, for non-pipe keys only | — |
| T1d no 'Area not found' | OBSOLETE | negatives without a live positive | — |
| T2a city-only URL gets areaKey | COVERED_EXISTING | `apps/web/src/pages/__tests__/Trends.exhaustiveDeps.test.tsx > Trends.tsx:116 — [optionsData, city] trigger (Category B) > writes the canonical URL once options resolve with defaults, for a bare /trends visit` | MT2 |
| T2a ordering by listing count | RETAIN | backend; no IT located in the web slice | — |
| T3a > 3 areaKeys trimmed to 3 | COVERED_EXISTING | `Trends.exhaustiveDeps.test.tsx > Trends.tsx:92 — mount-only URL normalize (Category A) > trims >3 areaKeys to the canonical 3 on mount` | MT1 (`:120` `> 3` → `> 5`) |
| T3a double guard | checked | MT1b (`:63` `slice(0, 3)` → `slice(0, 5)`) also reddens the same it on its own, so neither half masks the other with 5 keys | (MT1b) |
| T4 dropdown reorders URL | STALE | `handleAreaChange` (`Trends.tsx:238`) is wired only in the legacy view (`:335`) | — |
| T5 Discover 'View Trends' | RETAIN | Radix combobox + real network | — |
| T6 'View Area Trends' href | RETAIN | vacuous early-return in the spec | — |
| T7 /area-overview | STALE | no route; catch-all NotFound at `App.tsx:415` | — |

### csv35 — e2e/commercial-subtype-implied-type-hotfix.spec.ts

`PT` = `apps/web/src/components/map/filters/__tests__/PropertyTypeFilter.impliedPropertyType.test.tsx > a picked subtype implies its own property type`
`UD` = `apps/web/src/hooks/__tests__/useDiscoverUrlState.subtype2859.test.ts > #2859 B4 — useDiscoverUrlState mixed commercial subtype URL`. This is a new file; it is not useDiscoverUrlState.test.ts, which is red at base (#2813). The import-graph guard it is green.

| Id | Disposition | Destination / reason | Mutation |
|---|---|---|---|
| S1-S5.emission | COVERED_EXISTING | PT > self-describing subtypes — the shipped defect > 'Commercial building' / 'Warehouse' / 'Commercial land' implies …; PT > bearing subtypes — must keep working > 'Shop' / 'Office' still implies the commercial family | MPT1r |
| S1-S5.membership | COVERED_EXISTING (BUILDING arm only; narrowed: controller + query) | CS > eachPeerSelectsItsOwnFamily (T1). SHOP, OFFICE, WAREHOUSE and LAND: asserted, unmutated (SHOP and OFFICE run on the subtype-column predicate path). See the Backend section. | MBS1 |
| S.http-binding | RETAIN | no test drives the real HTTP binding. Client-side request emission is in discoverSearchParams.commercialSubtype.test.ts (green at base; not claimed here). | — |
| S6a mixed emission | COVERED_EXISTING | PT > mixed selection — the arm a naive fix fails > Shop + Warehouse implies BOTH commercial and warehouse | MPT2 |
| S6b URL type=commercial,warehouse & subtype=SHOP,WAREHOUSE | COVERED_NEW (write + read back; a load variant in a separate it) | UD > S6b: a mixed Shop + Warehouse selection writes … and reads back both | MU1 |
| S6c rows visible | OBSOLETE | smoke | — |
| S6d mixed membership (backend) | COVERED_NEW (narrowed: controller + query) | CS > s6d_listings_explicitTypes_mixedShopWarehouse + CS > s6d_markers_explicitTypes_mixedShopWarehouse; see the Backend section | MBS2 |
| S7.emission untick Warehouse clears subtype | COVERED_EXISTING | PT > unticking a property type clears only the subtypes that lived in it > unticking Warehouse clears WAREHOUSE rather than stranding it | MPT3 |
| S7.url subtype removed, type=apartment stays | COVERED_NEW | UD > S7.url: unticking Warehouse removes the subtype param while type=apartment stays | MU2 |
| S7.backend AND FALSE | COVERED_EXISTING | CS > filter_contradictoryRequest_returnsZero_ratherThanWideningToEverything; see the Backend section | MBS3 |
| S8 mobile 390 | RETAIN | mobile Sheet (D5) | — |
| S.double-guard | not claimed jointly | the TS side is proved by MPT1r/MPT2/MPT3 and the Java side by MBS1 (DiscoverFilterNormalizer map, CS > eachPeerSelectsItsOwnFamily) | — |

### Web disposition counts (subclaim rows above)

| Row | COVERED_NEW | COVERED_EXISTING | canonical | RETAIN | STALE | OBSOLETE | backend (see Backend section) | other |
|---|---|---|---|---|---|---|---|---|
| csv176 | 16 | 1 | 0 | 3 | 4 | 0 | 0 | H8 split (STALE + RETAIN) |
| csv216 | 3 | 2 | 1 | 2 | 1 | 1 | 0 | U4c split (OBSOLETE + RETAIN) |
| csv204 | 15 | 0 | 0 | 1 | 2 | 2 | 3 | — |
| csv205 | 6 | 0 | 0 | 1 | 1 | 1 | 1 | LG.derive whitespace not claimed |
| csv192 | 3 | 1 | 0 | 8 | 0 | 0 | 1 | — |
| csv215 | 0 | 2 | 0 | 3 | 4 | 1 | 0 | T3a double guard checked |
| csv35 | 2 | 3 | 0 | 2 | 0 | 1 | 3 | S.double-guard not claimed jointly |

The "backend" column above counts the web-table rows whose final ids now point into the Backend section below; their dispositions are counted there.

## Backend section

`POI` = `apps/api/src/test/java/com/example/realestate/poi/PoiApproveAuthorization2859IT.java > PoiApproveAuthorization2859IT` (new, untagged, Testcontainers `postgis/postgis:15-3.4-alpine`)
`LTPT` = `apps/api/src/test/java/com/example/realestate/listing/workflow/ListingTransitionPolicyTest.java > ListingTransitionPolicyTest$GuardCompletenessLocality2859B4` (new nested class; the B23 `GuardCompletenessFieldErrors2859` tests are untouched)
`CS` = `apps/api/src/test/java/com/example/realestate/discover/CommercialSubtypeFilter2431IT.java > CommercialSubtypeFilter2431IT` (untagged; +2 tests, +1 typed `markerIds(subtypes, types)` overload; existing helpers and callers unchanged)
`LCT` = `apps/api/src/test/java/com/example/realestate/listing/api/ListingControllerTest.java > ListingControllerTest`
`ROLL` = `apps/api/src/test/java/com/example/realestate/intelligence/AreaIntelligenceSnapshotRollupJobIT.java > AreaIntelligenceSnapshotRollupJobIT` (untagged)
`BAIS` = `apps/api/src/test/java/com/example/realestate/intelligence/BuyerAreaIntelligenceServiceTest.java > BuyerAreaIntelligenceServiceTest`

### Backend evidence

- **Final run.** One invocation, `mvn -f <wt>/apps/api/pom.xml test -Dtest=PoiApproveAuthorization2859IT,CommercialSubtypeFilter2431IT,ListingTransitionPolicyTest,ListingControllerTest,AreaIntelligenceSnapshotRollupJobIT,BuyerAreaIntelligenceServiceTest`, exit 0. Every stale XML for those classes was deleted first. Log: `evidence/runs/be-final.log`; fresh XML: `evidence/runs/be-final-xml/`.

| Class | tests | skipped | failures | errors |
|---|---|---|---|---|
| PoiApproveAuthorization2859IT | 5 | 0 | 0 | 0 |
| CommercialSubtypeFilter2431IT | 35 | 0 | 0 | 0 |
| ListingTransitionPolicyTest (all nested) | 143 | 0 | 0 | 0 |
| ListingControllerTest | 124 | 0 | 0 | 0 |
| AreaIntelligenceSnapshotRollupJobIT | 2 | 0 | 0 | 0 |
| BuyerAreaIntelligenceServiceTest | 20 | 0 | 0 | 0 |

- **Base green (R_base_red).** The cited existing classes (LCT, ROLL, BAIS, and CS's existing 33 tests) are unedited, and `apps/api/src/main` is byte-identical to `bac4c7c8`, so their green runs above, and in each mutation's green re-run, are base runs.
- **Mutations.** 16 backend rows (`MB*`) appended to `register.tsv`: **16 RED, 0 SURVIVED**. Every row has restored_sha_ok=true and green_after=true. After the last run, `final-restore-check.txt` reports `VERDICT: BYTE_IDENTICAL`, with `git diff --quiet bac4c7c8 -- apps/api/src/main` exit 0. MBP2b, MBP7 and MBL2 are probes. Each corroborates one half of a claim whose proof is a different row; none is cited as a claim's only proof.
- **How AC4 is wired.** Everything is real: the Spring Security filter chain (`JwtConfig.java:108` permitAll for the GET; the PATCH is authenticated), `DbRoleJwtAuthenticationConverter` against seeded `user_roles` rows (`broker`, `broker`, `admin`), `CallerInfoResolver`, `ListingPoiController`, `ListingWorkflowService.findListingForCaller` and Postgres. Nothing is mocked. The test `JwtDecoder` maps the bearer value to the subject, as in `BrokerArchivedListingsFilterIT`. Every anonymous read sends **no** Authorization header. Synthetic ids use the `28590400-` prefix. `@AfterEach` deletes `listing_status_history`, the listings (which cascades `listing_pois`), `user_roles` and `auth.users`.

### Backend dispositions

| Id | Disposition | Destination | Mutation |
|---|---|---|---|
| PM1k.persist (AC4 a) | COVERED_NEW | POI > ownerApprove_persists_andAppearsOnAnonymousPublicRead: the owner's PATCH returns 200 with approved=true. A DB re-read gives `approved=true, approved_by=owner`. | MBP1 (drop `setApprovedBy`, `ListingPoiController.java:151`) |
| PM1k.public (AC4 b) | COVERED_NEW | same test: an anonymous `GET /api/listings/{id}/pois` lacks the POI before the approve and contains it, approved=true, after it | MBP2 (`ListingPoiService.getApproved` reads `findByListingId` instead of `…AndApprovedTrue`). Probes: MBP2b (skip `setApproved(true)`, `:150`) and MBP7 (`JwtConfig.java:108` permitAll → authenticated) also redden it. |
| PM1.authz admin (AC4 c) | COVERED_NEW | POI > adminApprove_onAnotherBrokersListing_succeeds: the precondition shows the listing's created_by is the owner. The admin's PATCH returns 200, the DB has `approved_by=admin`, and the anonymous read shows the POI. | MBP4 (`isAdmin` → `false` in approvePoi, `:134`) |
| PM1.authz non-owner (AC4 d) | COVERED_NEW | POI > nonOwnerBroker_isForbidden_andPoiStaysUnapprovedAndHidden: the non-owner gets 403 with the exact error. The DB row is unchanged (false/null) and the POI is still absent from the anonymous read. **Control, same test:** the owner's identical request returns 200 and the POI is then publicly visible. | MBP3 (`isAdmin` → `true` in approvePoi, `:134`) |
| PM1.authz cross-listing IDOR (AC4 e) | COVERED_NEW | POI > poiOfAnotherListing_isNotFound_andUnchanged: the owner of listing A asks for B's POI under A's URL and gets 404 "POI not found". B's row is unchanged, and the POI is absent from both listings' anonymous reads. **Control, same test:** the same POI under B's URL, by B's owner, returns 200. | MBP5 (drop the `listingId.equals(poi.getListingId())` scope, `:143`) |
| PM1.authz settlement (AC4 f) | COVERED_NEW | POI > settlementPoi_isBadRequest_andUnchanged: approving TOWN_CENTER returns 400. The DB row is unchanged and the POI is absent from the anonymous read. **Control, same test:** the owner's amenity approve on the same listing returns 200. | MBP6 (settlement guard disabled, `:145`) |
| LG2a-c rule | COVERED_NEW | LTPT > missingLocality_yieldsOnlyTheLocalityError_completeListingPasses `[1]` null, `[2]` "", `[3]` "   \t ". Each gives `containsExactly({field: locality, message: "Locality is required"})`, and the complete-listing control passes in the same test. Broker submit reaches this rule only through `guardCompleteness` (`ListingWorkflowService.java:139`). | MBL1 (message, `ListingTransitionPolicy.java:349`; all 3 red). Probe: MBL2 (`isBlank` → `isEmpty`, `:348`) reddens only `[3]`. |
| LG2a-c envelope | COVERED_EXISTING | LCT > submit_tooFewImages_returns422: the 422 asserts `$.errors[0].field` **and** `$.errors[0].message`. The rule's own message is not re-asserted here: the service is mocked in this WebMvc test, so the claim is the envelope shape only. | MBL3 (the submit 422 body drops `message`, `ListingController.java:432`). B23's M24b (key `errors` → `error`) also has this test in its observed set. |
| S1-S5.membership | COVERED_EXISTING for the BUILDING arm only (narrowed: controller + query; the HTTP binding is S.http-binding, RETAIN) | CS > eachPeerSelectsItsOwnFamily (T1). The SHOP, OFFICE, WAREHOUSE and LAND arms are asserted, unmutated. SHOP and OFFICE run on the subtype-column predicate path, which MBS1 does not touch. | MBS1 (`BUILDING` → `commercial_land`, `DiscoverFilterNormalizer.java:195`) |
| S6d | COVERED_NEW (narrowed as above) | CS > s6d_listings_explicitTypes_mixedShopWarehouse + CS > s6d_markers_explicitTypes_mixedShopWarehouse: the browser's typed arguments `propertyTypes=[commercial, warehouse]`, `commercialSubtypes=[SHOP, WAREHOUSE]` (`hasTypes=true`, unlike T2). The result is exactly {SHOP, lower-case shop, WAREHOUSE}. **Controls, same test:** without subtypes, the same typed request returns OFFICE, the legacy NULL-subtype row and the legacy no-row row (markers too). Apartment is returned for `[apartment]` and is never pinned by the commercial request. getMarkers slot 2 = `propertyTypes` and slot 3 = `commercialSubtypes` were confirmed at `DiscoverMarkersController.java:63-65`. | MBS2 (union ` OR ` → ` AND `, `DiscoverListingPredicateBuilder.java:324`) |
| S7.backend | COVERED_EXISTING | CS > filter_contradictoryRequest_returnsZero_ratherThanWideningToEverything (with its apartment control) | MBS3 (` AND FALSE` → ` AND TRUE`, `:307`) |
| A1-A3.tier count → tier | COVERED_EXISTING for the FULL boundary only | ROLL > run_seedsThreeBands_persistsDistinctConfidenceOutcomes (36 / 15 / 3 LIVE → full / limited / insufficient, through the real `run()`). MBA1 proves the FULL boundary (`>= 30`). The LIMITED boundary (`>= 10`, `AreaConfidence.java:37`) is asserted, unmutated. | MBA1 (`>= 30` → `>= 37`, `AreaConfidence.java:35`) |
| A1-A3.tier tier → buyer label | COVERED_EXISTING | BAIS > getAreaIntelligence_fullConfidence_allMetricsPopulated / …_limitedConfidence_overallLabelLimitedData / …_insufficientSuppressed_metricsNull ('Enough data' / 'Limited data' / 'Not enough data yet') | MBA2 (label rotation, `BuyerConfidenceLabel.java:59-61`; all three red) |

**Boundaries this section does not claim.**
- AC4 runs on MockMvc (`webEnvironment=MOCK`) through the real filter chain. It does not prove a real socket, CORS, or the browser's `skipAuth` client.
- The `JwtDecoder` is a test decoder, so the real Supabase signature check is not proved. Role mapping from `user_roles` is real.
- qa-fast observed that the public read does not check listing status. That is not asserted here.
- H4-7.server (anonymous image truncation) was not examined in this slice and stays RETAIN.
- S.http-binding stays RETAIN.

### Backend disposition counts

| Rows | COVERED_NEW | COVERED_EXISTING | RETAIN | probes (not claims) |
|---|---|---|---|---|
| csv204 (PM1k.persist, PM1k.public, PM1.authz c-f) | 6 | 0 | 0 | MBP2b, MBP7 |
| csv205 (LG2a-c rule, envelope) | 1 | 1 | 0 | MBL2 |
| csv35 (S1-S5.membership, S6d, S7.backend) | 1 | 2 | 0 (S.http-binding counted in the web table) | — |
| csv192 (A1-A3.tier, 2 halves) | 0 | 2 | 0 | — |
| **Total** | **8** | **5** | **0** | 3 |

Two of the five COVERED_EXISTING rows are narrowed to their mutated arm: S1-S5.membership covers the BUILDING arm, and A1-A3.tier count → tier covers the FULL boundary. The other arms are asserted, unmutated. The row counts do not change.

## Follow-ups (non-blocking, not fixed in this PR)

- `apps/web/src/pages/__tests__/MyBookings.test.tsx:290`: the `queryByText(/Something went wrong/)` negative is vacuous. Nothing in that it can render the text: there is no boundary and no such copy. Delete the line, or mount a test boundary as SavedAreas2859 does. (code-reviewer finding 3)
- `apps/web/src/hooks/__tests__/useDiscoverUrlState.subtype2859.test.ts:66-75`: the S7.url it's title says "unticking Warehouse", but it injects `commercialSubtypes: undefined`. Rename the it, or drive the untick. (code-reviewer finding 5)
- The anonymous `GET /api/listings/{id}/pois` returns approved POIs for listings that are not public, such as a DRAFT. This is a product issue for the owner, raised by the security review. PoiApproveAuthorization2859IT does not assert it.
