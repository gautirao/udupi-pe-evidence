# Issue #2454 — scope-aware relaxation previews: evidence

PR #2457, branch `issue-2454-scope-aware-relaxation`, base `origin/main @ 2b360769`.

## 1. Stack used for runtime evidence

| | |
|---|---|
| Database | Own disposable PostGIS container `pg-test-fixture-2454` on `localhost:5437`, restored by `scripts/db/restore-test-fixture.sh` via `scripts/dev/local-fixture-backend.sh` (`PG_TEST_CONTAINER_NAME` / `PG_TEST_PORT` overrides). The shared `pg-test-fixture` (5434) and `pg-dev-issue-2420` (5436) were never touched. |
| Backend | Spring Boot on `8115`, hosted Supabase JWT validation, `CORS_ALLOWED_ORIGINS=http://localhost:5215` |
| Frontend | Vite on `5215`, `VITE_API_BASE_URL=http://localhost:8115`, launched from the worktree cwd |
| Fixture facts used | Bangalore, area `IN\|KA\|Bengaluru\|RR Nagar`: four LIVE sale listings at lat 12.9313–12.9316 / lon 77.5289–77.5319 priced ₹3.5L (agricultural_land), ₹4.2L (agricultural_land), ₹5L (apartment), ₹7.2L (house), plus two ₹0 rent listings at the same spot. CITY boundary present (`canonical_boundary_geometry`, VALID); no AREA boundaries. A ₹3L ceiling is a genuine zero; the first PRICE_MAX rung (×1.2 → ₹4L after lakh rounding) is expected to yield 1. |

## 2. Automated test matrix

| Layer | Command (from `apps/api` / `apps/web` / repo root) | Result | Exit |
|---|---|---|---|
| Backend WebMvc | `mvn test -Dtest=RelaxationPreviewsControllerTest,PolygonRelaxationPreviewsControllerTest,RelaxationPreviewsSecurityIT,RelaxationPreviewsFilterParityTest,BboxParserTest` | Tests run: 46, Failures: 0, Errors: 0 — BUILD SUCCESS | 0 |
| Backend Testcontainers (PostGIS) | `mvn test -Dtest=RelaxationPreviewsServiceIT` | Tests run: 18, Failures: 0, Errors: 0 — incl. `polygonScope_countsEqualTheListingsPredicate`, `viewportScope_countsEqualTheListingsPredicate`, `scope_overridesScopeComponentsLeftInFilters`, `polygonEndpoint_realPolicyRejectsBeforeAnyCount` (real `PolygonGeographicSafetyPolicy`, reason `polygon_outside_searchable_city`) | 0 |
| Backend rate-limit pairing | `mvn test -Dtest=DiscoverRateLimitFilterTest` | Tests run: 10, Failures: 0, Errors: 0. On clean main this class ERRORs 10/10 at context load (its `@WebMvcTest` slice lacked the `NavigationGraphCache` / `PolygonGeographicSafetyPolicy` mocks the listings/markers controllers have required since #2087/#2420); repaired here and the new authenticated path added to its exclusion assertion | 0 |
| Frontend hook | `npx vitest run src/hooks/__tests__/useRelaxationPreviews.test.ts` | 16 passed | 0 |
| Frontend component | `npx vitest run src/components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx` | 45 passed | 0 |
| Frontend neighbours | `npx vitest run …/AreaSelectedPanel.test.tsx …/DiscoverRightPanel.routing.test.tsx …/DiscoverPanelSurface.test.tsx` | 77 + 47 + 27 passed (see PR body for the post-purpose-fix re-run) | 0 |
| Mutation proof (hook guard) | `scopeIsAskable = hasScope` (guard removed) → `npx vitest run src/hooks/__tests__/useRelaxationPreviews.test.ts` | 2 failed: "POLYGON (signed OUT): never calls any endpoint", "POLYGON: signing in enables the query" — `expected "spy" to not be called at all, but actually been called 1 times`; guard restored → 16 passed | 1 → 0 |
| Mutation proof (component guard) | `canOfferRelaxations` without `previewScope.kind !== 'POLYGON' \|\| isSignedIn` | Covered by "POLYGON (signed OUT): renders NO relaxation rows even if a reply is somehow present" (hook mocked, so only the component gate can hide the rows) | — |
| E2E (real browser, real backend) | `PLAYWRIGHT_BASE_URL=http://localhost:5215 BACKEND_BASE_URL=http://localhost:8115 npx playwright test --project=full --workers=1 e2e/issue-2454-scope-aware-relaxation-previews.spec.ts` | 6 passed. Project: `full`. Storage states: signed-in arms `e2e/fixtures/user-auth.json` (minted by global-setup from `SMOKE_USER_*`, proven by the Sign in link being absent); anonymous arms `{cookies:[],origins:[]}` (proven by the Sign in link being visible) | 0 |
| Typecheck | `npm run typecheck` | FAILS on this base with pre-existing fingerprints (`src/test-utils/mockReactQueryResults.ts`, `AuthCallback.consumerInvariant.test.tsx`, `CityLaunchReadiness.test.tsx`, `MapDiscovery.recenter.test.ts`, `AreaSelectedPanel.tsx:274/277`); none in lines touched by this PR | 2 (pre-existing) |
| ESLint | `npx eslint <changed files>` | NOT_RUN — the worktree's root ESLint config imports `@eslint/js`, which is not installed in the worktree's root `node_modules` | — |

## 3. Runtime evidence rows (E2E arms, screenshots in this directory)

Parity column = the number on the row vs `totalElements` of the `/api/discover/listings?…&<scope>=` query the app issues after the row is applied (the slice-2 invariant's other half). All counts are read from the server, never hard-coded.

| # | Arm | Storage state | What is proven | Preview → after apply | Screenshot | Kit (EPZero) |
|---|---|---|---|---|---|---|
| 1 | Desktop 1366×768, POLYGON drawn through the product entry ("Draw search area" → 3 vertices → close on first → "Replace and search" → `rscope=poly`), then `priceMax=300000` | signed in | Zero state "No matching homes inside your drawn area"; counts came from `GET /api/discover/listings/relaxation-previews` (`scopeKind: POLYGON`); the anonymous endpoint was never asked with a polygon; row "Increase maximum price to ₹4 L → 1 listing"; DOM count == server count; kit order scope-actions → rows; scope untouched after apply (`rscope=poly`, same `rpoly`), `priceMax` → 400000 | 1 → 1 | `desktop-1366x768-signed-in-polygon-zero-relaxation-rows.png`, `desktop-1366x768-signed-in-polygon-row-applied.png` | **MATCHED** (rows under POLYGON, L330-342; order L290/L330). Panel card list after apply stays area-keyed: **MISMATCH — DEFERRED TO #2461** (§4). Footnote "Each option changes one filter only. Your drawn area stays exactly as it is." — kit has no footnote under the block: **ACCEPTED_DEVIATION** (ruled: explanatory scope-preservation copy, not mock parity; slice-2 carry-over, now scope-aware) |
| 2 | Desktop 1366×768, VIEWPORT (`rscope=vp&rvp=12.925,77.52,12.94,77.54`, `priceMax=300000`) | signed in | Zero state "in the visible map area"; counts from the public endpoint with `viewportScope=` and no `areaKeys` (`scopeKind: VIEWPORT`); row → 1; after apply the panel says "1 verified property for sale in this area" and lists the ₹3.50 L card; `rscope=vp` unchanged | 1 → 1 | `desktop-1366x768-signed-in-viewport-zero-relaxation-rows.png`, `desktop-1366x768-signed-in-viewport-row-applied.png` | **MATCHED** (rows under VIEWPORT). The kit's VIEWPORT action block ("Expand visible map area", L300-310) is not rendered — slice-3 deferral, unchanged here: **MISMATCH — OWNER DECISION REQUIRED** (pre-existing) |
| 3 | Desktop 1366×768, POLYGON restored by URL, `priceMax=300000` | anonymous | Sign in link visible; zero state renders with Clear filters; after a 3 s grace: no `area-zero-recovery-relaxations`, zero requests to `/api/discover/listings/relaxation-previews`, zero requests carrying `polygon=` to any relaxation endpoint | — | `desktop-1366x768-anonymous-polygon-zero-no-relaxation-rows.png` | **MATCHED** by ruling (anonymous polygon = no path, #2452) |
| 4 | Mobile 390×844, POLYGON restored by URL (the same `rpoly` contract a drawn polygon persists through, #2016 item 3b), `priceMax=300000` | signed in | Rows render in the list-first shell; polygon endpoint answered; row → 1; polygon listings query after apply → 1 | 1 → 1 | `mobile-390x844-signed-in-polygon-zero-relaxation-rows.png`, `mobile-390x844-signed-in-polygon-row-applied.png` | **MATCHED** |
| 5 | Mobile 390×844, VIEWPORT | signed in | Rows render; row → 1; panel shows "1 verified …" and the ₹3.50 L card | 1 → 1 | `mobile-390x844-signed-in-viewport-zero-relaxation-rows.png`, `mobile-390x844-signed-in-viewport-row-applied.png` | **MATCHED** |
| 6 | Mobile 390×844, POLYGON restored by URL | anonymous | Same guards as row 3 | — | `mobile-390x844-anonymous-polygon-zero-no-relaxation-rows.png` | **MATCHED** by ruling |

## 4. What the real browser found (and what was done about it)

**Fixed in this PR — purpose gap in the slice-2 hook.** The first run's mobile POLYGON arm previewed 3 and the shopper got 1. The preview request carried no `listingPurpose`, so the server's never-relaxed envelope admitted the two ₹0 RENT rows for a BUY search (`baselineCount: 2` on a screen showing a zero result). The hook now forwards the same `listingPurpose` the listings query sends (`intent === 'rent' ? 'rent' : 'sale'`, the app's existing mapping), the purpose is part of the query key, and two hook tests pin it. This also applied to the slice-2 AREA path; it is fixed for all three kinds. (The sibling `/areas/nearby-candidates` request has the same omission — out of scope, recorded on #2456.)

**Pre-existing, MISMATCH — DEFERRED TO #2461 (option A ruled) — the Areas-journey panel list is not polygon-scoped.** Under a committed POLYGON the `AreaSelectedPanel` card list still shows the AREA-keyed result set (`DiscoverRightPanel.tsx:1745` substitutes `viewportListings` only for VIEWPORT; there is no polygon equivalent), and that area endpoint (`CityAreaListingsService`) excludes `agricultural_land` unconditionally. So after applying "₹4 L → 1 listing" under POLYGON, the canonical polygon listings query returns 1 (the map badge set) while the panel's own list stays at 0 and the zero state re-renders with the next offer (visible in `desktop-1366x768-signed-in-polygon-row-applied.png`). The relaxation count is right; the panel is asking a different question. This is a #2016/#2419 seam, not a relaxation-preview one, so it is not changed here. Ruled option A: filed as #2461 (wire `polygonListings` into the panel the way `viewportListings` is). VIEWPORT is unaffected (rows 2/5 assert the panel line end to end).

## 5. Deferred / not done

- Mobile drawing by touch (first-vertex finish) — #2419 PR-2's evidence; mobile POLYGON arms here restore the polygon by URL.
- The kit's VIEWPORT action block and the "Replace with …" / "Return to previous selected areas" actions — slice-3 deferrals, untouched.
- ESLint in the worktree (root dependency not installed); typecheck baseline failures predate this branch.
