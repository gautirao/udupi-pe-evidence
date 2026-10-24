# #2860 L43 (`OQ_R43`): lower-level replacement map for `e2e/discover-agri-direction-first-1448.spec.ts` (Lane C of #2750)

Base: `13319d31` (main). Issue #2860 (`OQ_R43` / manifest row L43). Zero product change; test-only plus this doc.
No spec is deleted, moved or skipped; deletion needs the owner's own by-name comment on the PR.
Neither `docs/testing/e2e-retirement-manifest.csv` nor `docs/testing/e2e-retirement-map-2860.md` is edited by this PR; intended manifest row text is in section 4.
Approved plan: `.claude/handoffs/issue-2860-l43/plan-review-request.toml` (`revision_1`).

Summary of disposition: STAYS on disk (no retirement candidate claimed). Owner ruling `OQ_R43` is `MOVE_DOWN` (lower-level replacement, NOT a canonical extension). Across 36 rows: EXISTING 3, NEW 16, PARTIAL 13, BROWSER_ONLY 2, RETAIN 1, SUSPECTED_STALE 1.

## 1. Coverage standard (B1 / Codex r2)

A row is `EXISTING` or `NEW` only if the cited tests cover the REAL chain the legacy spec exercises (`panel callback -> rightPanelContract wiring -> real useDiscoverUrlState writes -> real agri hooks -> controller -> buildMapSurfaceModel -> DiscoverMapCanvas / AgriJourneyPanel / AgriGroupListingPeek`). Injected props/state, a stubbed child, a mocked hook where the legacy observes HTTP, or leaf-only gating downgrade to `PARTIAL`.
Each new `it` has transient wiring mutations of named production lines that turn that `it` red (`exit 1`), revert byte-identically, and leave product `git diff --stat` empty. Vitest stops an `it` at the first failing `expect`, so a mutation is credited ONLY to the first leg it reddens (`revision_1` first-failure ledger).

## 2. Per-assertion replacement map (`e2e/discover-agri-direction-first-1448.spec.ts`, 12 tests, 36 rows)

| id | legacy assertion | covering test | status |
|---|---|---|---|
| 1448-01 | AC1: `corridor-landing-list` visible before any click; `agri-group-selected-panel` count 0 | `DiscoverRightPanel.agriCorridor.test.tsx` "renders corridor cards with groupName (not raw DIR:BAND codes)"; `discoverPanelState.test.ts` "returns agri-landing when journey=agri-first and no areaKey"; L43-N1 leg 1 (setup) | PARTIAL |
| 1448-02 | AC1: `corridor-card` click writes `region=N` AND `maxKm=25` in ONE step (one-click contract) | `pages/__tests__/MapDiscovery.agriDirectionFirst1448.test.tsx` L43-N1 leg 3 (`M1@3`); isolated parts in `useDiscoverUrlState.test.ts`, `DiscoverRightPanel.agriCorridor.test.tsx`, `agriculturalUrlDomain.test.ts` G1-N3 | NEW (L43-N1, L43-M1) |
| 1448-03 | AC1: `agri-group-selected-panel` visible after the click | `discoverPanelState.test.ts` "#1446-a: agri-first + selectedRegion=North + selectedMaxKm=25 + no listing → agri-group-selected"; composed in L43-N1 leg 4 (uncredited under M1 because leg 3 fails first) | PARTIAL |
| 1448-04 | AC1 HARD GUARD: `corridor-distance-chips` NOT visible after a one-click direction | L43-N1 leg 4 paired with positive twin `DiscoverRightPanel.agriCorridor.test.tsx` "renders distance chips when selectedRegion is set" | PARTIAL |
| 1448-05 | AC2: `distance-chip-25` `aria-pressed=true`, `distance-chip-50` `aria-pressed=false` | `AgriGroupSelectedPanel.test.tsx` "(b) selected chip has aria-pressed=true, others do not" (flat props); composed in L43-N2 leg 1 | PARTIAL |
| 1448-06 | AC2/AC6: destination rows (`agri-group-locality-btn`) show `displayName`, never the pipe-delimited key | `AgriGroupSelectedPanel.test.tsx` "renders one locality button per destination bucket, using displayName as the label" and "G1-N4 destination rows show EXACTLY the displayName and never the raw areaKey (no \"IN\|KA\" / \"\|\" anywhere in the panel)"; composed in L43-N2 legs 1 & 5 | PARTIAL |
| 1448-07 | AC2: sector overlay gate: agri journey + region + maxKm -> `{directionCode, maxKm}` | `DiscoverMapCanvas.test.tsx` "G1-N2 agri journey + region N + maxKm 25 resolves to exactly {directionCode:\"N\",maxKm:25}; maxKm 50 resolves to maxKm 50"; `PropertyMap.agri.test.tsx` "Test B: sectorOverlay set -> Polygon is rendered"; composed in L43-N2 leg 4 (`M5@4`) | EXISTING |
| 1448-08 | AC3: chip 50 click -> URL `maxKm=50` | L43-N2 leg 2 (`M3@2`); isolated parts in `useDiscoverUrlState.test.ts` and `AgriGroupSelectedPanel.test.tsx` | NEW (L43-N2, L43-M3) |
| 1448-09 | AC3: panel stays open (`agri-group-selected-panel` persists); `aria-pressed` flips to 50 | L43-N2 leg 3 (`M4@3`, derived from URL through real `useDiscoverAgriController.ts:65`) | NEW (L43-N2, L43-M4) |
| 1448-10 | AC3: destination rows still present after the switch (tier-following bucket set) | L43-N2 leg 5 (`M6@5`, stub serves `[Manipal]` at 25 km and `[Manipal, Kota]` at 50 km) | NEW (L43-N2, L43-M6) |
| 1448-11 | AC3: overlay still present at 50 and again after switching back to 25 | L43-N2 legs 4 (`M5@4`) and 8 (`sectorOverlay` prop `{"directionCode":"N","maxKm":50}` then `25`) | NEW (L43-N2, L43-M5) |
| 1448-12 | AC3: switch back to chip 25: URL `maxKm=25`, `aria` flips back | L43-N2 leg 8 (round-trip; uncredited because M3-M7 fail on earlier legs) | PARTIAL |
| 1448-13 | AC4: destination row click -> `destKey` in URL; `agri-group-locality-panel` visible | L43-N3 leg 1 (`M8@1`); isolated parts in `AgriGroupSelectedPanel.test.tsx` and `agriculturalUrlDomain.test.ts` G1-N3 | NEW (L43-N3, L43-M8) |
| 1448-14 | AC4: Level-3 rows come from `agri-map-listings` for the single destination | L43-N3 leg 2 (`M9@2`, real `api.get` call with `searchParams.areaKey === 'IN|KA|Udupi|Manipal'` and no `areaKeys`) | NEW (L43-N3, L43-M9) |
| 1448-15 | AC4: row click -> `listing=` PUSH; peek visible; still on `/discover`; view-details and close present | L43-N3 leg 3 (`M10@3`) | NEW (L43-N3, L43-M10) |
| 1448-16 | AC4: the public listing detail is fetched after the peek opens | `AgriGroupListingPeek.test.tsx` "AC5: renders description after lazy load"; L43-N3 leg 3b asserts `api.get` called with `/api/public/listings/<id>` (uncredited) | PARTIAL |
| 1448-17 | AC4: close removes `listing=` only (REPLACE); `region`, `maxKm` and `destKey` preserved | L43-N3 leg 4 (`M11@4`) | NEW (L43-N3, L43-M11) |
| 1448-18 | AC4: panel returns to `agri-group-locality`, peek gone | `discoverPanelState.test.ts` "agri-first + region + maxKm + locality (no listing) → agri-group-locality"; composed in L43-N3 leg 4 | PARTIAL |
| 1448-19 | AC5: Back after the corridor click drops `region` and `maxKm` | `agriculturalUrlDomain.test.ts` "G1-N3 setRegionWithMaxKm is a PUSH: Back returns to the EXACT pre-click URL (no region/maxKm)"; L43-N1 leg 5 (`M2@5`) | EXISTING |
| 1448-20 | AC5: after Back the landing list is visible; chips and selected panel are absent | L43-N1 leg 6 (uncredited under M2 because leg 5 fails first) | PARTIAL |
| 1448-21 | AC6: cold load `?region=N&maxKm=25` restores the selected panel | `discoverPanelState.test.ts` "#1446-a ..." + `useDiscoverUrlState.test.ts`; composed in L43-N2 leg 1 | PARTIAL |
| 1448-22 | AC6: chip 25 pre-selected; destination rows populated from the fixture | As 1448-05/06; composed in L43-N2 leg 1 | PARTIAL |
| 1448-23 | AC7: legacy `?group=N:10_25` canonicalises to `region=N`, `group` removed, `maxKm` backfilled, journey intact | `useDiscoverUrlState.test.ts` "panel reaches agri-group-selected after cold-load via OD-1 + canonicalisation" (+3 sibling OD-1 tests); canonical T9 on main | EXISTING |
| 1448-24 | AC8: `agri-group-selected-clear` drops `region`, `maxKm`, `listing`; landing visible; selected panel gone | L43-N4 leg 1 (`M12@1`); isolated parts in `useDiscoverUrlState.test.ts`, `agriculturalUrlDomain.test.ts` G1-N3, `AgriGroupSelectedPanel.test.tsx` | NEW (L43-N4, L43-M12) |
| 1448-25 | AC9: `area-first` has no sector overlay, no peek, no selected panel | L43-N5 row 1 (`M13`, exercises `useDiscoverPageContext.ts:113`) | NEW (L43-N5, L43-M13) |
| 1448-26 | AC10: `school-first` has no sector overlay, no peek | L43-N5 row 2 (`M13`, paired with `agri-first` positive control row 3) | NEW (L43-N5, L43-M13) |
| 1448-27 | AC12: anon, `pricePaise` null -> `agri-listing-peek-price-signin` visible; numeric price element absent | `AgriGroupListingPeek.test.tsx` "shows \"Sign in to view price\" when anon and pricePaise is null" and "AC1: does not render price element when pricePaise is null"; `AgriGroupLocalityPanel.test.tsx` "anonymous: shows \"Sign in to view price\" and never a rupee value"; canonical T8c on main | PARTIAL |
| 1448-28 | AC11: one-click on a real corridor card -> `region+maxKm`, selected panel, no chip step | L43-N1 leg 3 (`M1@3`) over seed-shaped `regional-area-groups` DTO | NEW (L43-N1, L43-M1) |
| 1448-29 | AC11: chip 25 default and destination rows from the live backend | L43-N2 leg 1 (seed-shaped `agri-destinations` buckets; live-seed data half is 1448-36) | PARTIAL |
| 1448-30 | AC11: sector overlay paths > 0 on the live map (twice: after the card and after chip 50) | As row 1448-35; prop-level gate is rows 1448-07 and 1448-11 | BROWSER_ONLY |
| 1448-31 | AC11: chip 50 switch: URL, `aria-pressed`, destinations for the wider band, map destination markers | L43-N2 legs 2-6 (`M3@2`, `M4@3`, `M5@4`, `M6@5`, `M7@6`) | NEW (L43-N2, L43-M3..M7) |
| 1448-32 | AC11: drill into a destination, open a Level-3 peek, still on `/discover` | L43-N3 legs 1-3 (`M8@1`, `M9@2`, `M10@3`) | NEW (L43-N3, L43-M8..M10) |
| 1448-33 | AC11: close the peek: `listing=` gone, `region` and `maxKm` kept | L43-N3 leg 4 (`M11@4`) | NEW (L43-N3, L43-M11) |
| 1448-34 | AC11 last assertion: `agri-group-selected-panel` visible after the peek close | Suspected stale against #2151 PR C (`destKey` stays in URL so `agri-group-locality-panel` renders); L43-N3 leg 4 pins current behaviour without deleting/modifying the legacy spec | SUSPECTED_STALE |
| 1448-35 | AC2, AC3 (x2), AC6, AC11 (x2): `.leaflet-overlay-pane path` count > 0 (Leaflet SVG polygon painted) | Leaflet SVG paint requires real browser; canonical T8b on main exercises the real map | BROWSER_ONLY |
| 1448-36 | AC11 precondition: the live `REAL_SEED` stack yields >= 1 corridor card, >= 1 destination row and >= 1 Level-3 parcel | Data/seed property of `scripts/seed-agricultural-listings.sh` + backend; canonical T8b on main exercises the real fixture | RETAIN |

## 3. New tests and transient mutation proof (`L43-N1..N5`, `L43-M1..M13`)

Evidence logs and diffs (captured BEFORE restore): `.claude/handoffs/issue-2860-l43/mutation/L43-M1..L43-M13.{diff,log}` (untracked).
After every restore, `git diff --exit-code` on product files was empty and SHA-256 matched the original bytes.

| New test | File | Mutation (transient) | First failing leg / actual red set | Credited |
|---|---|---|---|---|
| L43-N1 "one click on a direction card PUSHes region and maxKm=25 together, lands on agri-group-selected-panel with no distance-chip step, and Back returns to the landing list" | `pages/__tests__/MapDiscovery.agriDirectionFirst1448.test.tsx` | L43-M1 `rightPanelContract.ts:348` `setRegionWithMaxKm` -> `(dir) => urlActions.setRegion(dir)` | Leg 3 (`maxKm` is `null` instead of `'25'`, exit 1; Leg 4 unreached/uncredited) | Y (Leg 3) |
| | | L43-M2 `agricultural.ts:351` `setRegionWithMaxKm` `{ replace: false }` -> `{ replace: true }` | Leg 5 (Back lands on `/discover?city=udupi` instead of `journey=agri-first` landing, exit 1; Leg 6 unreached/uncredited; overlap with hook-level G1-N3 stated) | Y (Leg 5) |
| L43-N2 "chip 25 -> 50 -> 25 on a cold-loaded corridor updates URL, chip state, destination rows, map overlay prop and destination markers in place" | same | L43-M3 `rightPanelContract.ts:349` `setMaxKm` -> `() => urlActions.setMaxKm(25)` | Leg 2 (URL `maxKm` stays `'25'` after clicking chip 50, exit 1) | Y (Leg 2) |
| | | L43-M4 `useDiscoverAgriController.ts:65` `selectedMaxKm` -> `25` | Leg 3 (`distance-chip-50` `aria-pressed` stays `'false'` while Leg 2 URL `maxKm=50` passes, exit 1) | Y (Leg 3) |
| | | L43-M5 `buildMapSurfaceModel.tsx:790` `agri.selectedMaxKm` -> `25` | Leg 4 (`data-sector-overlay` stays `maxKm:25` while Legs 2-3 pass, exit 1) | Y (Leg 4) |
| | | L43-M6 `AgriGroupSelectedPanel.tsx:233` `useAgriDestinations` 3rd arg -> `25` | Leg 5 (only 1 locality row `[Manipal]` instead of 2 `[Manipal, Kota]` while Legs 2-4 pass, exit 1) | Y (Leg 5) |
| | | L43-M7 `useDiscoverAgriController.ts:114` `useAgriDestinations` 3rd arg -> `25` | Leg 6 (`data-agri-dest-keys` stays `["IN\|KA\|Udupi\|Manipal"]` while Legs 2-5 pass, exit 1) | Y (Leg 6) |
| L43-N3 "drilling into a destination loads its parcels by the single areaKey, a row click opens the peek, and closing the peek keeps region, maxKm and destKey" | same | L43-M8 `rightPanelContract.ts:359` `locality.set` -> `() => urlActions.clearLocality()` | Leg 1 (`destKey` is `null` instead of `'IN\|KA\|Udupi\|Manipal'`, exit 1) | Y (Leg 1) |
| | | L43-M9 `useDiscoverAgriController.ts:80` `selectedDestinationAreaKey` -> `''` | Leg 2 (no `agri-map-listings` request, 0 `agri-locality-listing-row` elements while Leg 1 passes, exit 1) | Y (Leg 2) |
| | | L43-M10 `rightPanelContract.ts:355` `groupListings.select` -> `() => {}` | Leg 3 (`listing` param is `null` after row click while Legs 1-2 pass, exit 1) | Y (Leg 3) |
| | | L43-M11 `rightPanelContract.ts:380` `peek.close` -> `() => urlActions.clearRegionAndMaxKm()` | Leg 4 (`region` and `maxKm` cleared to `null` on peek close while Legs 1-3 pass, exit 1) | Y (Leg 4) |
| L43-N4 "the selected-panel clear button removes all region state and returns to the landing list; Back restores the corridor" | same | L43-M12 `rightPanelContract.ts:356` `groupListings.clearGroup` -> `() => urlActions.clearSelectedListing()` | Leg 1 (`region` stays `'N'` after clicking `agri-group-selected-clear`, exit 1; Leg 2 unreached/uncredited) | Y (Leg 1) |
| L43-N5 "journey %s with region+maxKm: sectorOverlay and agri selected panel follow isAgriJourney=%s" (3 rows) | same | L43-M13 `useDiscoverPageContext.ts:113` `isAgriJourney` -> `true` | Non-agri rows (`area-first`, `school-first`) fail (`data-sector-overlay` is non-null, exit 1); `agri-first` control row stays green | Y (rows 1 & 2) |

## 4. Intended manifest row text (NOT applied by this PR)

Decision stays `MOVE_DOWN`, status stays `SCHEDULED(#2860)`.

- L43 (`e2e/discover-agri-direction-first-1448.spec.ts`): "#2860 (OQ_R43) added MapDiscovery.agriDirectionFirst1448.test.tsx (L43-N1..N5, 7 test executions across 5 blocks, 13 transient wiring mutations L43-M1..M13 over the real MapDiscovery page, real useDiscoverUrlState, and real agri hooks). Across 36 rows: 3 EXISTING, 16 NEW, 13 PARTIAL, 2 BROWSER_ONLY (Leaflet SVG path paint), 1 RETAIN (live REAL_SEED data precondition, complemented by canonical T8b on main), 1 SUSPECTED_STALE (AC11 final assertion after Level-3 peek close). Spec STAYS on disk pending owner ruling."

## 5. Final GREEN runs (this branch, restored product code)

Run from `apps/web` with `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=dummy-local-key VITE_API_BASE_URL=http://127.0.0.1:8080 npx vitest run <file>`.

| file | exit | counts |
|---|---|---|
| `src/pages/__tests__/MapDiscovery.agriDirectionFirst1448.test.tsx` (new) | 0 | 7 passed |
| `src/pages/__tests__/MapDiscovery.issue1430.test.tsx` (baseline) | 0 | 12 passed |
| `src/features/discover/state/url/__tests__/agriculturalUrlDomain.test.ts` (baseline) | 0 | 18 passed |

eslint on `apps/web/src/pages/__tests__/MapDiscovery.agriDirectionFirst1448.test.tsx`: exit 0, 0 errors.
