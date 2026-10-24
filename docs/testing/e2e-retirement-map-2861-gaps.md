# E2E Retirement Map — `#2861` Lower-Level Gap Closure (`L4`, `L94`, `L188`, `L193`, `L194`)

- **Issue:** `#2861` (Lower-level test/evidence gap closure for remaining `DELETE_AFTER_REPLACEMENT` rows)
- **Inventory baseline:** `docs/testing/e2e-inventory.md` (`#2859`)
- **Manifest:** `docs/testing/e2e-retirement-manifest.csv` (`L4`, `L94`, `L188`, `L193`, `L194`)
- **Prior deletion-gate artifacts reconciled:**
  - `docs/testing/e2e-retirement-map-journey-duplicates-booking-listing.md` (`#2862`)
  - `docs/testing/e2e-retirement-map-root.md` (`#2866`)
  - `#2879` (`0dccae93` — `BookingPersistenceAndV45IndexIT.java` closing `L193` `UB2-a`, `UB2-b`, `UB1-d`, `UB3-b`)
  - `#2880` (`d075cc34` — `ResidentialListingForm.draftPriceReload.test.tsx` closing `L194` `DL1-7` for `apartment`)

---

## 1. Readiness Summary (`L4`, `L94`, `L188`, `L193`, `L194`)

> **Governance & Deletion Gate Note:** No legacy spec (`e2e/**`) or manifest row (`docs/testing/e2e-retirement-manifest.csv`) is deleted or relabelled by this PR. Technical lower-level replacement coverage is separated below from `OBSOLETE` subclaims and owner-policy gates (`D3` admin ops screen disposition on `L4`/`L188`, `D4` canonical admission question on `L193`/`L194`, and by-name deletion approval on all five rows).

| Manifest Row | Spec File | Total Assertions | Technical Lower-Level Covered | Obsolete / Superseded Subclaims | Remaining Technical Gaps | Owner / Policy Gates Required Before Deletion | Readiness Verdict |
|---|---|---:|---:|---:|---:|---|---|
| `L194` | `e2e/journey/broker-listing-creation.spec.ts` | 15 (`DL1-1`..`DL1-12`, `DL2-1`..`DL2-2`, `DL3-1`) | 15 / 15 | 0 | **0** | `D4` (`#2861` cmt `6099896083`: owner resolved `D4` as lower-level + `T19` sufficient) + explicit owner exact-filename deletion approval | **CANDIDATE — pending independent evidence review and owner exact-filename approval** |
| `L193` | `e2e/journey/booking-journey.spec.ts` | 13 (`UB1-a`..`UB1-d`, `UB2-a`..`UB2-b`, `UB3-a`..`UB3-b`, `UB4-a`..`UB4-c`, `UB5-a`..`UB5-b`) | 13 / 13 | 0 | **0** | `D4` (`#2861` cmt `6099896083`: owner resolved `D4` as lower-level + `T17b` sufficient) + explicit owner exact-filename deletion approval | **CANDIDATE — pending independent evidence review and owner exact-filename approval** |
| `L188` | `e2e/journey/admin-duplicates.spec.ts` | 6 (`AD1`..`AD6`) | 6 / 6 | 0 | **0** | `D3` admin-ops-screen disposition (`#2861` cmt `6099896083` / manifest note; lower-level React + controller tests now cover `AD1`..`AD6` regardless of `D3`) + explicit owner exact-filename deletion approval | **CANDIDATE — pending independent evidence review and owner exact-filename approval** |
| `L4` | `e2e/admin-intelligence-smoke.spec.ts` | 3 (`AI1`..`AI3`) | 3 / 3 | 0 | **0** | `D3` admin-ops-screen disposition (`#2861` cmt `6099896083` / manifest note; lower-level React + controller tests now cover `AI1`..`AI3` regardless of `D3`) + explicit owner exact-filename deletion approval | **CANDIDATE — pending independent evidence review and owner exact-filename approval** |
| `L94` | `e2e/discover-to-trends.spec.ts` | 3 (`Test 1`: C-switch layer transition; `Tests 2–3`: legacy listing-marker popover) | 1 / 3 (`Test 1`) | 2 / 3 (`Tests 2 & 3` — `OBSOLETE` superseded listing-marker popover flow) | **0** | Owner acceptance of `OBSOLETE` classification for `Tests 2 & 3` + explicit owner exact-filename deletion approval | **CANDIDATE — pending independent evidence review and owner exact-filename approval** |

---

## 2. Row `L194` — `e2e/journey/broker-listing-creation.spec.ts`

### 2.1 Closure of `DL1-7` and `DL1-12`

`docs/testing/e2e-retirement-map-journey-duplicates-booking-listing.md` §4 recorded 13/15 assertions (`DL1-1`..`DL1-6`, `DL1-8`..`DL1-11`, `DL2-1`, `DL2-2`, `DL3-1`) as `COVERED` and held `L194` on two open gaps:

1. **`DL1-7` (Draft reload restores `#price` across all 4 legacy residential subtypes):**
   - `#2880` (`d075cc34`) fixed the product bug (`priceHydrationSeed` in `useResidentialFormState.ts` -> `ResidentialTermsSection.tsx` -> `PriceField.tsx`) and added `apps/web/src/components/broker/__tests__/ResidentialListingForm.draftPriceReload.test.tsx` covering `apartment` (4 tests).
   - `apps/web/src/components/broker/__tests__/ResidentialListingForm.subtypeSubmit2861.test.tsx` (`DL1-7` `it.each(['house', 'villa', 'residential_plot'])`, 3 tests) closes the remaining 3 subtypes (`house`, `villa`, `residential_plot`): mounts `<ResidentialListingForm initialDraftId={draftId} />`, verifies `GET /api/listings/{id}` hydrates `#title` and `#price` (`'50 lakh'`, not `''` or `'75 lakh'`), and verifies clicking `Save draft` without re-typing `#price` sends `PUT /api/listings/{id}` with `price: 5_000_000`.
2. **`DL1-12` (Per-subtype UI form submit transitions `DRAFT -> PENDING_REVIEW` across all 4 legacy residential subtypes):**
   - `apps/web/src/components/broker/__tests__/ResidentialListingForm.test.tsx:669-748` covers `apartment` through `Review -> Submit for review -> POST /api/listings/{id}/submit`.
   - `apps/web/src/components/broker/__tests__/ResidentialListingForm.subtypeSubmit2861.test.tsx` (`DL1-12` `it.each(['house', 'villa', 'residential_plot'])`, 3 tests) closes `house`, `villa`, and `residential_plot`: selects the subtype radio (`aria-checked="true"`), fills required subtype-specific fields (`bhk` + `builtArea` for `house`/`villa`; `landArea` + `landAreaUnit` for `residential_plot`), creates the draft (`POST /api/listings`), confirms the map pin (`PUT /api/listings/{id}` with `addressConfirmed: true`), satisfies the 3-photo gate (`GET /api/listings/{id}/images`), enters `Review` (`data-testid="residential-review-preview"`), clicks `Submit for review` (`POST /api/listings/{id}/submit` returning `status: 'PENDING_REVIEW'`), and asserts `[data-testid="residential-submitted-panel"]` renders `Submitted for review` + `Pending admin approval`.

### 2.2 Per-Assertion Replacement Table (`L194`)

| Assertion ID | E2E Assertion Summary | Replacement Layer & Test File (`file:line`) | Status |
|---|---|---|---|
| `DL1-1`..`DL1-6`, `DL1-8`..`DL1-11`, `DL2-1`..`DL2-2`, `DL3-1` | Subtype selection, conditional fields, draft create/update, address confirmation, photo minimum gate, agricultural & commercial flows | See `docs/testing/e2e-retirement-map-journey-duplicates-booking-listing.md` §4.1 (`ResidentialListingForm.test.tsx`, `ListingTypePicker.test.tsx`, `AgriculturalListingForm.test.tsx`, `CommercialListingForm.test.tsx`, `ListingCreateControllerTest.java`, `ListingControllerSubmitForReviewTest.java`) | **COVERED** |
| `DL1-7` | Reloading `/broker/listings/{id}/edit` restores saved `#title` and `#price` (`50 lakh`, not empty) across `apartment`, `house`, `villa`, `residential_plot` | `apps/web/src/components/broker/__tests__/ResidentialListingForm.draftPriceReload.test.tsx:167-357` (`apartment`) + `apps/web/src/components/broker/__tests__/ResidentialListingForm.subtypeSubmit2861.test.tsx:266-312` (`house`, `villa`, `residential_plot`) | **COVERED** |
| `DL1-12` | Submitting each residential subtype from Review calls `POST /api/listings/{id}/submit`, transitions `DRAFT -> PENDING_REVIEW`, and renders the submitted confirmation state | `apps/web/src/components/broker/__tests__/ResidentialListingForm.test.tsx:669-748` (`apartment`) + `apps/web/src/components/broker/__tests__/ResidentialListingForm.subtypeSubmit2861.test.tsx:314-466` (`house`, `villa`, `residential_plot`) + `apps/api/src/test/java/com/example/realestate/web/ListingControllerSubmitForReviewTest.java:108-193` | **COVERED** |

---

## 3. Row `L193` — `e2e/journey/booking-journey.spec.ts`

### 3.1 Reconciliation with `#2879` (`0dccae93`)

`docs/testing/e2e-retirement-map-journey-duplicates-booking-listing.md` §3 recorded 9/13 assertions as `COVERED` and held `L193` on 4 database-level gaps (`UB2-a`, `UB2-b`, `UB1-d`, `UB3-b`) because `BookingServiceTest.java` and `BookingControllerIntegrationTest.java` mocked `BookingRepository`.

Commit `0dccae93` (`#2879`) added `apps/api/src/test/java/com/example/realestate/booking/BookingPersistenceAndV45IndexIT.java` (extending `AbstractPostgresIntegrationTest`, real PostGIS + Flyway `V1`..`V45` including `V45__booking_requests_one_active_per_buyer_listing.sql`), with 5 `@Test` methods and 3 verified transient SQL/service mutations (`M1`, `M2`, `M3` documented in the class header at lines 38–57).

### 3.2 Per-Assertion Replacement Table (`L193`)

| Assertion ID | E2E Assertion Summary | Replacement Layer & Test File (`file:line`) | Status |
|---|---|---|---|
| `UB1-a`..`UB1-c`, `UB3-a`, `UB4-a`..`UB4-c`, `UB5-a`..`UB5-b` | Modal open/validation, slot request, `/my-visits` list/empty state, cancel UI, auth gate | See `docs/testing/e2e-retirement-map-journey-duplicates-booking-listing.md` §3.1 (`VisitRequestModal.test.tsx`, `MyVisits.test.tsx`, `BookingControllerIntegrationTest.java`, `BookingServiceTest.java`) | **COVERED** |
| `UB1-d` | Creating a booking persists a `PENDING` row in `booking_requests` and returns it via `findByUserIdOrderByRequestedDateAsc` | `apps/api/src/test/java/com/example/realestate/booking/BookingPersistenceAndV45IndexIT.java:149-168` (`ub1d_createPersistsPendingBookingAndReturnsInBuyerQuery`) | **COVERED** |
| `UB2-a` | Partial unique index `idx_booking_requests_one_active_per_buyer_listing` (`V45`) rejects duplicate active (`PENDING`/`CONFIRMED`) booking for same `(user_id, listing_id)` with `DataIntegrityViolationException` (SQLSTATE `23505`) | `apps/api/src/test/java/com/example/realestate/booking/BookingPersistenceAndV45IndexIT.java:176-214` (`ub2a_v45PartialUniqueIndexRejectsSecondActiveBookingAtDatabaseLayer` & `ub2a_v45PartialUniqueIndexAlsoRejectsPendingWhenConfirmedRowExists`) | **COVERED** |
| `UB2-b` | `BookingService.create()` maps `DataIntegrityViolationException` from `saveAndFlush` into `ResponseStatusException(HttpStatus.CONFLICT, "You already have an active visit request for this property")` (`409`) | `apps/api/src/test/java/com/example/realestate/booking/BookingPersistenceAndV45IndexIT.java:222-260` (`ub2b_serviceTranslatesV45ConstraintViolationInto409Conflict`) | **COVERED** |
| `UB3-b` | Cancelling transitions `status = CANCELLED` (`cancelled_by = 'BUYER'`) in `booking_requests`, and V45 partial unique index (`WHERE status IN ('PENDING', 'CONFIRMED')`) permits a subsequent re-booking for the same `(user_id, listing_id)` | `apps/api/src/test/java/com/example/realestate/booking/BookingPersistenceAndV45IndexIT.java:268-308` (`ub3b_cancelTransitionsRowToCancelledAndPermitsSubsequentRebookingUnderV45`) | **COVERED** |

---

## 4. Row `L188` — `e2e/journey/admin-duplicates.spec.ts`

### 4.1 Per-Assertion Replacement Table (`L188`)

All 6 frontend/route assertions (`AD1`..`AD6`) are now covered at the React component + hook + route-guard boundary by `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx` (10 tests) paired with the existing backend controller/service integration tests (independent of the `D3` admin-ops-screen policy disposition):

| Assertion ID | E2E Assertion Summary | Replacement Layer & Test File (`file:line`) | Status |
|---|---|---|---|
| `AD1` | Admin loads `/admin/duplicates`, sees `Suspected Duplicate Listings` heading, pair count (`{totalElements} pairs`), populated table rows (`listingIdA`, `listingIdB`, similarity `%`, distance `m`, `PENDING` badge) or `"No duplicate candidates found."` empty state, and error + `Retry` recovery | `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx:148-252` (3 tests: populated table, empty state, error + `Retry`) + `apps/api/src/test/java/com/example/realestate/web/AdminModerationControllerTest.java:199-243` | **COVERED** |
| `AD2` | Clicking `Confirm` invokes `window.confirm`, calls `POST /api/admin/duplicates/{id}/confirm`, invalidates query to update row badge to `CONFIRMED`, replaces `Confirm`/`Dismiss` with `Undo`, and fires `"Duplicate confirmed"` toast (plus negative control when `window.confirm` returns `false`) | `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx:254-339` (2 tests: positive confirm flow + cancelled `window.confirm` negative control) + `apps/api/src/test/java/com/example/realestate/duplicates/DuplicateDetectionServiceTest.java:43-87` | **COVERED** |
| `AD3` | Clicking `Dismiss` does not prompt `window.confirm`, calls `POST /api/admin/duplicates/{id}/dismiss`, updates row badge to `DISMISSED`, shows `Undo`, and fires `"Candidate dismissed"` toast | `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx:341-379` (1 test) + `apps/api/src/test/java/com/example/realestate/duplicates/DuplicateDetectionServiceTest.java:89-105` | **COVERED** |
| `AD4` | Clicking `Undo` on a `CONFIRMED`/`DISMISSED` row calls `POST /api/admin/duplicates/{id}/undo`, reverts row badge to `PENDING`, restores `Confirm`/`Dismiss` buttons, and fires `"Review undone"` toast | `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx:258-315` (exercised end-to-end after `AD2`) + `apps/api/src/test/java/com/example/realestate/duplicates/DuplicateDetectionServiceTest.java:107-170` | **COVERED** |
| `AD5` | Pagination controls render `Page X of Y` with `Prev`/`Next` buttons when `totalPages > 1`, fetch `page=1` on `Next` and `page=0` on `Prev`, and hide pagination when `totalPages === 1` | `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx:381-443` (2 tests: multi-page `Next`/`Prev` + single-page hidden controls) | **COVERED** |
| `AD6` | `<ProtectedRoute requireAdmin>` redirects unauthenticated visitors to `/auth` and non-admin (`buyer`) users to `/` without calling `GET /api/admin/duplicates` | `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx:445-483` (2 tests: unauthenticated -> `/auth`, non-admin -> `/`) + `apps/web/src/components/auth/__tests__/ProtectedRoute.test.tsx:96-143` | **COVERED** |

---

## 5. Row `L4` — `e2e/admin-intelligence-smoke.spec.ts`

### 5.1 Per-Assertion Replacement Table (`L4`)

All 3 assertions (`AI1`..`AI3`) of `e2e/admin-intelligence-smoke.spec.ts` are covered at the React component + route-guard boundary by `apps/web/src/pages/admin/__tests__/AdminIntelligence.2861.test.tsx` (6 tests) paired with `AdminIntelligenceControllerTest.java` and `AdminIntelligenceSmokeIT.java` (independent of the `D3` admin-ops-screen policy disposition):

| Assertion ID | E2E Assertion Summary | Replacement Layer & Test File (`file:line`) | Status |
|---|---|---|---|
| `AI1` | Admin loads `/admin/intelligence`, sees `Intelligence Validator` heading, loading spinner resolution (`[data-testid="intelligence-loading"]` -> `[data-testid="intelligence-table"]` or `[data-testid="intelligence-empty-state"]`), confidence badges (`Full`, `Limited`, `Insufficient`), and `LIVE (90d)` sort toggle | `apps/web/src/pages/admin/__tests__/AdminIntelligence.2861.test.tsx:157-237` (2 tests: populated table + sort toggle, and empty state) + `apps/api/src/test/java/com/example/realestate/intelligence/AdminIntelligenceControllerTest.java` | **COVERED** |
| `AI2` | `[data-testid="cell-demand-events"]` and `[data-testid="cell-top-gaps"]` render `"—"` (and never `"0"`) when `demandEventCount` is `null` or `topGaps` is `null`/`[]`, and render formatted counts / `budgetBand · propertyType · signalType (score)` when populated | `apps/web/src/pages/admin/__tests__/AdminIntelligence.2861.test.tsx:239-297` (2 tests: null/empty suppression `"—"` vs `"0"` + populated control) + `apps/api/src/test/java/com/example/realestate/intelligence/AdminIntelligenceSmokeIT.java` | **COVERED** |
| `AI3` | `<ProtectedRoute requireAdmin>` redirects unauthenticated visitors to `/auth` and non-admin (`buyer`) users to `/` without calling `GET /api/admin/intelligence/areas` | `apps/web/src/pages/admin/__tests__/AdminIntelligence.2861.test.tsx:299-337` (2 tests: unauthenticated -> `/auth`, non-admin -> `/`) + `apps/web/src/components/auth/__tests__/ProtectedRoute.test.tsx:96-143` | **COVERED** |

---

## 6. Row `L94` — `e2e/discover-to-trends.spec.ts`

### 6.1 Per-Assertion Replacement Table (`L94`)

`docs/testing/e2e-retirement-map-root.md` §3 (`L94`) and `docs/testing/e2e-retirement-manifest.csv` (`L94`) separate `e2e/discover-to-trends.spec.ts` into two distinct categories:
- **Test 1 (C-switch layer transition across `AREA_LAYER_MAX_ZOOM = 12`):** Covered at the mounted `<PropertyMap>` component boundary by `apps/web/src/components/map/__tests__/PropertyMap.discoverToTrends2861.test.tsx` (2 tests passing `initialCenter`/`initialZoom`/`mapZoom` props directly to `<PropertyMap>`) paired with pure zoom-band tests (`zoomPolicy.test.ts`, `useZoomBand.test.ts`). Note: `PropertyMap.discoverToTrends2861.test.tsx` exercises `<PropertyMap>` via props (`initialCenter`, `initialZoom`, `mapZoom`), not a routed `/discover?lat=...&lon=...&zoom=...` page; URL query parsing for `?lat&lon&zoom` is covered separately by `apps/web/src/hooks/__tests__/useDiscoverUrlState.test.ts`.
- **Tests 2 & 3 (Legacy listing-marker click popover with `"View Details"` and conditional `"View Area Trends"` link, lines `52-135`):** Classified as **`OBSOLETE` (superseded listing-marker popover flow)** per `docs/testing/e2e-retirement-manifest.csv` (`L94`) and `docs/testing/e2e-retirement-map-root.md` §3. `PropertyMap.discoverToTrends2861.test.tsx` does **not** mount or click a listing popover. In the current product architecture, the `"View Area Trends"` entry point lives on the selected area right-hand surface (`AreaLeafListingsSurface` -> `AreaSelectedPanel` `trendsHref: '/trends/{city}/areas/{slug}'`), which is the modern successor flow (tested in `AreaLeafListingsSurface.test.tsx` and `AreaTrendsDetail.test.tsx`), not direct coverage of the removed listing-popover interaction.

| Assertion / Step | E2E Assertion Summary | Disposition & Replacement / Successor Evidence (`file:line`) | Status |
|---|---|---|---|
| `Test 1 — Step 1` | At city overview zoom (`zoom = 11 <= AREA_LAYER_MAX_ZOOM = 12`), `<PropertyMap>` mounts `AreaMarkerLayer` (`.leaflet-marker-icon.area-marker` count > 0) and suppresses `MarkerClusterLayer` (`.custom-marker` count === 0) | `apps/web/src/components/map/__tests__/PropertyMap.discoverToTrends2861.test.tsx:186-206` (`<PropertyMap>` prop boundary) + `apps/web/src/shared/map/__tests__/zoomPolicy.test.ts:104-149` | **COVERED** |
| `Test 1 — Steps 2 & 3` | Above `AREA_LAYER_MAX_ZOOM = 12` (`zoom = 14`, Manipal coords `[13.3525, 74.7925]`), `<PropertyMap>` unmounts `.area-marker` (`count === 0`) and mounts `MarkerClusterLayer` (`.custom-marker.property-marker` with `[data-testid="property-marker"]` price pill `₹45 L`). (`<PropertyMap>` tested via `initialCenter`/`initialZoom`/`mapZoom` props; `?lat&lon&zoom` URL parsing covered separately) | `apps/web/src/components/map/__tests__/PropertyMap.discoverToTrends2861.test.tsx:208-235` (`<PropertyMap>` prop boundary) + `apps/web/src/hooks/__tests__/useZoomBand.test.ts:27-95` + `apps/web/src/hooks/__tests__/useDiscoverUrlState.test.ts` (URL param parsing) | **COVERED** |
| `Test 2` (`lines 52-97`) | Clicking a `.custom-marker` listing pin opens a lazy-hydrated listing popover with `"View Details"` link to `/listing/:id` | **Product status:** Superseded/obsolete listing-marker popover flow (`docs/testing/e2e-retirement-manifest.csv` `L94`; `docs/testing/e2e-retirement-map-root.md` §3). Modern listing selection opens the right-hand peek/detail surface (`DiscoverRightPanel.routing.test.tsx`, canonical `T15`) | **OBSOLETE (superseded popover flow)** |
| `Test 3` (`lines 99-135`) | Conditional `"View Area Trends"` link inside the legacy listing-marker popover navigates to `/trends/udupi/areas/:slug` | **Product status:** Removed from listing-marker popover (`docs/testing/e2e-retirement-manifest.csv` `L94`; `docs/testing/e2e-retirement-map-root.md` §3). Modern successor `"View Area Trends"` link lives on the area leaf panel (`apps/web/src/components/discover/panels/__tests__/AreaLeafListingsSurface.test.tsx` `trendsHref: '/trends/udupi/areas/manipal'` + `apps/web/src/pages/__tests__/AreaTrendsDetail.test.tsx`) | **OBSOLETE (superseded by area-panel `trendsHref`)** |

---

## 7. Mutation Proof Register (`#2861`)

Every new replacement test was verified against a transient product mutation (`RED -> revert -> GREEN`), with zero residual diff on product files:

| Mutation ID | Row & Assertion | Product File & Line Mutated | Transient Mutation Applied | Observed RED Failure | Reverted & Green |
|---|---|---|---|---|---|
| `M1` | `L194` (`DL1-7`) | `apps/web/src/components/broker/residential/ResidentialTermsSection.tsx:57` | `initialRupees={props.priceHydrationSeed}` -> `initialRupees={null}` | 3/3 `DL1-7` tests (`house`, `villa`, `residential_plot`) in `ResidentialListingForm.subtypeSubmit2861.test.tsx` failed (`AssertionError: expected '' to be '50 lakh'`) | Yes (6/6 pass) |
| `M2` | `L194` (`DL1-12`) | `apps/web/src/components/broker/residential/useResidentialListingDraft.ts:197` | Early `return;` at top of `handleSubmitForReview` | 3/3 `DL1-12` tests (`house`, `villa`, `residential_plot`) in `ResidentialListingForm.subtypeSubmit2861.test.tsx` failed (`expect(apiPostMock).toHaveBeenCalledWith('/api/listings/{id}/submit', {})` — 0 calls) | Yes (6/6 pass) |
| `M3` | `L188` (`AD2`, `AD4`) | `apps/web/src/pages/admin/SuspectedDuplicates.tsx:94,115` | `onClick={() => onConfirm(candidate.id)}` and `onClick={() => onUndo(candidate.id)}` -> `onClick={() => {}}` | 2 `AD2`/`AD4` tests in `Duplicates.2861.test.tsx` failed (`expect(confirmSpy).toHaveBeenCalledWith(...)` — 0 calls) | Yes (10/10 pass) |
| `M4` | `L4` (`AI2`) | `apps/web/src/pages/admin/Intelligence.tsx:322,343` | Changed null/empty fallback `<span className="text-muted-foreground">—</span>` to `'0'` in `cell-demand-events` and `cell-top-gaps` | `AI2` test in `AdminIntelligence.2861.test.tsx` failed (`AssertionError: expected '0' to be '—'`) | Yes (6/6 pass) |
| `M5` | `L94` (`Test 1`) | `apps/web/src/shared/map/zoomPolicy.ts:135` | Changed `return input.band === 'overview' ? 'area' : 'residentialMarkers';` to `return 'area';` in `selectPrimaryMapLayer` | `Step 2 & 3 (zoom = 14 > AREA_LAYER_MAX_ZOOM = 12)` in `PropertyMap.discoverToTrends2861.test.tsx` failed (`expect(queryByTestId('area-marker-layer')).toBeNull()` received `<div data-testid="area-marker-layer">`) | Yes (2/2 pass) |
| `M6` (`#2879`) | `L193` (`UB2-a`, `UB2-b`, `UB1-d`, `UB3-b`) | `BookingService.java` / `V45` index (`0dccae93`) | 3 transient SQL/service mutations recorded in `BookingPersistenceAndV45IndexIT.java:38-57` (dropping `idx_booking_requests_one_active_per_buyer_listing`, removing `DataIntegrityViolationException -> 409` translation, mutating `cancel()` status) | All 5 `@Test` methods in `BookingPersistenceAndV45IndexIT` failed under their respective mutations | Yes (5/5 pass in `#2879`) |
