# E2E retirement assertion map - PILOT (saved-homes, broker-listing-quality, school-badge-suppression)

Issue #2750, slice PILOT, Stage B1 + Stage B2. Base `d81895f5`. Heads: `dce41f50` (B1 cycle 1), `6337cc0c` (B1 rework cycle 1), `f01a2d14`, `960ce411` (the head Codex reviewed in cycle 2, review 5554253412),
B2 heads are `394348f3` (Codex cycle-2 fixes CX-3..CX-6 plus the deletions) and `d1ea7230` (doc LOW fixes). `d1ea7230` is the final CODE head. `npm run test:e2e:gate` ran twice there: 48/48 passed and exit 0 in both runs, with T21 passing. The follow-on commit that adds the ruling comment id is doc-only. Line numbers in the "legacy lines" column are legacy-spec lines at base `d81895f5`.
B2 deletes `e2e/saved-homes.spec.ts` and `e2e/broker-listing-quality.spec.ts` only, under the owner ruling PR #2821 issuecomment-6228697158 (relayed by team-lead 2026-10-17): delete only if the per-assertion
replacement coverage, the mutation proofs and the required canonical runs all pass at the resulting head. `school-badge-suppression.spec.ts` is KEPT and `broker-dashboard-v2.spec.ts` stays outside the pilot.
An `UNCOVERED` or `SURVIVED` row is never re-labelled covered; an uncovered row means the spec is KEPT unless the owner accepts that row by name.

Evidence: `.claude/handoffs/issue-2750-pilot/evidence/mut/MUT-Pnn/{mutation.diff,red.log,red.exit,green.log,green.exit,revert.stat}`,
`evidence/mut/register.tsv`, `evidence/b1-final/exits.tsv` (cycle 1, 15 files), `evidence/b1-final-r1/exits.tsv` (rework cycle 1, authoritative for the 4 re-run files + mvn) and `evidence/b2-cx-final/exits.tsv` (Codex cycle 2, authoritative for the 4 CX files + eslint) (all gitignored handoff dir, quoted here).

## Verdict words

`COVERED_NEW` a B1 test asserts it and its MUT went RED then GREEN. `COVERED_EXISTING` an existing test asserts it, passing at the B1 head,
and its MUT went RED then GREEN (the MUT proves the existing test discriminates). `COVERED_CANONICAL` owned by an E2E canonical journey; NOT_RUN at B1
(needs the local pinned auth stack), established only by the B2 gate runs. `OBSOLETE` vacuous / target gone. `UNCOVERED` nothing asserts it.

## Per-spec index

| spec | anchor | verdict | tests | rows covered / obsolete / uncovered |
|---|---|---|---|---|
| `e2e/saved-homes.spec.ts` | [`#saved-homes`](#saved-homes) | RETIRED (pending gate x2: canonical T21 must pass in both B2 gate runs, else the spec is restored) | 1 | 8 / 0 / 0 (7 rest on canonical T21, NOT_RUN at B1: it must pass in both B2 gate runs) |
| `e2e/broker-listing-quality.spec.ts` | [`#broker-listing-quality`](#broker-listing-quality) | RETIRED (CX-3/4/5 closed with MUTs; security-reviewer APPROVE on the LQ1 destination at `6337cc0c`, Gate F; CX-3/CX-5/deletion review at B2) | 5 | 15 / 0 / 0 |
| `e2e/discover/school-badge-suppression.spec.ts` | [`#school-badge-suppression`](#school-badge-suppression) | KEEP: SBS-J2 (composition plumbing), SBS-1-c (URL-to-state parse + school heading) and SBS-3-b (non-school heading absent) UNCOVERED, MUT-P08 SURVIVED; owner may accept SBS-J2 by name | 3 | 7 / 0 / 3 |
| `e2e/broker-dashboard-v2.spec.ts` | [`#broker-dashboard-v2`](#broker-dashboard-v2) | OUT of the pilot | - | - |

## saved-homes

Spec `e2e/saved-homes.spec.ts` (1 test). Destination for the residual: `SavedListingsRepositoryIT.idsHydration_excludesDeletedId_forThatUserOnly` (N4). Canonical `e2e/canonical/saved-homes.canonical.ts` T21 is not edited.

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| SH-1 (50-58) Discover card with non-empty title | COVERED_CANONICAL | `saved-homes.canonical.ts` T21 `openLeafAndGetHeart` | B2 gate | NOT_RUN at B1; pass status comes from the B2 gate runs |
| SH-2 (60-68) save button visible, pre-clean | COVERED_CANONICAL | T21 PRE-STATE + finally-DELETE guard | - | pre-clean is harness hygiene; T21's PRE-STATE is stricter |
| SH-3 (71-73) heart -> pressed, label "Remove saved property" | COVERED_CANONICAL | T21 | B2 gate | as SH-1 |
| SH-4 (76-78) /saved-homes heading | COVERED_CANONICAL | T21 `openSavedHomes` | B2 gate | as SH-1 |
| SH-5 (80-81) saved card listed | COVERED_CANONICAL | T21 (exactly 1 + href `/listing/<id>`) | B2 gate | as SH-1 |
| SH-6 (86-87) remove -> card hidden | COVERED_CANONICAL | T21 (DELETE 2xx + count 0) | B2 gate | as SH-1 |
| SH-7 (89-91) "No saved homes yet." | COVERED_CANONICAL | T21 (also after reload) | B2 gate | as SH-1 |
| SH-8 (94-100) after unsave, Discover heart is unpressed, "Save property" (residual) | COVERED_NEW + COVERED_EXISTING (composition, 4 links) | (a) `PropertyCard.test.tsx` "hydrates unfilled when the listing id is not in savedIds" - MUT-P18; (b) `useSavedListings.test.ts` "optimistically removes the id from both the ids cache and the card list" - MUT-P19; (c) NEW `SavedListingsRepositoryIT.idsHydration_excludesDeletedId_forThatUserOnly` - MUT-P17 | P17, P17b, P18, P19 | Composition of render polarity + SPA cache removal + the server /ids hydration source excluding the deleted id (other user's id kept). No single test reproduces the full-page-load browser sequence; each link is mutation-proven. P17 proves the USER predicate of the hydration query (RED at the IT's pre-delete precondition, userA ids `[L, L]`); P17b proves the DELETE side (the delete scoped to the other user's row reddens the N4 post-delete asserts at IT:203, plus `idempotentDelete_removesOwnRowOnly` at :168). The IT is `@Testcontainers(disabledWithoutDocker=true)`: the server arm only runs where Docker exists and skips silently elsewhere |

## broker-listing-quality

Spec `e2e/broker-listing-quality.spec.ts` (5 tests; LQ2-LQ5 skip without broker credentials). Destination: NEW `apps/web/src/__tests__/App.brokerListingQualityRoute.test.tsx` (N3, 10 its: (a), (a-self), (b)-(f) incl. (d-dealer), plus the LQ5 panel and LQ4 else-branch its) + NEW `apps/web/src/hooks/__tests__/useBrokerListingQuality.pilot.test.tsx` (N5, 4 its, Codex CX-4: real hook, only the HTTP client mocked) + existing `ListingQuality.test.tsx`.

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| LQ1-a (31-34) anon `/broker/listing-quality` -> `/auth` | COVERED_NEW | N3 (a) App.tsx wires path once as `<ProtectedRoute><BrokerListingQuality/></ProtectedRoute>` (source-text; EVERY assertion in (a) is quote-tolerant (Codex CX-2): the uniqueness scan, the exact-path count, the guarded-`<Route>` wrapper regex and the lazy-import regex all accept `path="..."`, `'...'`, `{"..."}`, `{'...'}` and template literals, and the scan matches `/(^\|\/)listing-quality\/?$/i`; the self-test it `(a-self)` runs the same matcher over synthetic snippets: five quoting styles accepted, guard-less route / renamed path / wrong lazy target rejected, duplicate counted twice). Codex CX-3: the guard check is order- and extra-prop-insensitive: it finds the `<Route ...>` opening tag (brace-depth scan) whose `path` (case-insensitive, `\s*=\s*`) is the LQ route and asserts ITS `element` prop is `<ProtectedRoute><BrokerListingQuality/></ProtectedRoute>`; `(a-self)` also accepts element-before-path, an extra `caseSensitive` prop, `path = '...'`, multi-line and upper-cased paths, and rejects a trailing-slash and a relative `listing-quality` duplicate (`lqPathValues` length 2), unguarded routes with reordered/extra props, and a guarded sibling vouching for an unguarded LQ route; N3 (b) real ProtectedRoute at the real path: location probe `textContent` exactly `/auth\|?redirect=%2Fbroker%2Flisting-quality` | P10, P10r, P10r2, P10r3, P21, P21r, P22, P22r, P23 (tolerance controls), P11, P12, P12r | stricter than the E2E regex (which did not check `redirect`). P10 drops the wrapper (RED on (a)); P10r2 re-runs it against the fully quote-tolerant (a): RED; P21 renames the path to `/broker/listing-quality-v2`: RED; P22 rewrites the real route to single quotes keeping the guard: stays GREEN (TOLERANCE_GREEN, negative control); P11 `if (!user)` -> `if (false)` (RED (b),(c)); P12 Navigate target -> `/` (RED (b),(c)) |
| LQ1-a init race (E2E ran real auth init) | COVERED_NEW | N3 (c): `isLoading:true` shows "Loading...", no `/auth`, no heading; rerender settled with no user -> `/auth` | P11b | P11b removes the `isLoading` branch (RED (c) only): a pre-init redirect would bounce a logged-in broker during session restore |
| LQ1-b (37-39) anon: no "listing quality" heading | COVERED_NEW | N3 (b),(c) `queryByRole('heading', /listing quality/i)` null | P11 | discrimination arm: N3 (d) broker control renders the heading |
| LQ2-a (58) broker stays on the route | COVERED_NEW | N3 (d) broker user renders heading, no `/auth`, `/discover`, `/broker/dashboard`; N3 (e) signed-in `user` -> `/discover`; N3 (f) `canAccessRoute('/broker/listing-quality', r)` true for broker, false for user, anonymous, admin | P16 | P16 clause at `routeAccess.ts:84` denying the route to broker reddens (d),(f). Only N3 (d) proves the broker arm through ProtectedRoute after retirement (the broker-authed E2E skipped without credentials) |
| LQ2-a dealer arm (the legacy spec falls back to DEALER credentials when no broker creds are set; route policy treats broker AND dealer as broker-workspace roles; Codex CX-5) | COVERED_NEW | N3 (d-dealer): signed-in `userRole: 'dealer'` through the real ProtectedRoute at the real path renders the heading, no `/auth`, `/discover`, `/broker/dashboard`; N3 (f): `canAccessRoute('/broker/listing-quality', 'dealer') === true` | P26 | P26 (`routeAccess.ts:84`) excludes dealer for this route only: reddens (d-dealer) and (f), while the broker arms stay GREEN |
| LQ-HOOK (CX-4) the page's data comes from `GET /api/broker/listing-quality` via the real `useBrokerListingQuality`, and the page renders it ("Avg Quality", average, listing) | COVERED_NEW | N5 `useBrokerListingQuality.pilot.test.tsx` (4 its): real hook in a `QueryClientProvider`, only `api.get` mocked (the `@/lib/api` module is replaced whole because the real one builds a Supabase client at import); asserts `api.get` called once with exactly `['/api/broker/listing-quality']` and the hook returns the response; 403 is not retried (one request, status 403); real `ListingQuality` page -> real `useListingQualityView` -> real hook renders "Avg Quality", the `Average quality score: 67` aria-label and the listing, and a null `averageQuality` renders the dash and never 0 | P24, P25 | P24 changes the hook path to `.../listing-quality-v2`: 2 of 4 its RED (exact-path asserts). P25 reads `averageQuality` from `buyerReadyCount` in `ListingQualitySummary.tsx:22-23`: 2 of 4 its RED, both page its. The `Average quality score: 67` label is missing, and the null-dash it renders "0". `ListingQuality.test.tsx` still mocks the hook; N5 is the only test that reaches the real hook |
| LQ2-b (61-63) heading visible | COVERED_EXISTING | `ListingQuality.test.tsx` "renders the page shell, opens the fix-plan panel, and links Edit to the listing edit route" | P13a | h1 text mutated, RED |
| LQ2-c (67) "Avg Quality" | COVERED_EXISTING | `ListingQuality.test.tsx` "renders summary cards with correct data" | P13b | label mutated, RED |
| LQ2-d (70-77) filter group, "All" pressed | COVERED_EXISTING | `ListingQuality.test.tsx` "renders the page shell..." | P13c | `aria-pressed` inverted, RED |
| LQ3 (89-113) row click opens fix-plan panel | COVERED_EXISTING | `ListingQuality.test.tsx` "opens fix-plan panel when a listing row is clicked" (+3 others) | P14a | onClick no-op: 4 its RED |
| LQ4 (140-153) Edit href `/broker/listings/<id>/edit` | COVERED_EXISTING | `ListingQuality.test.tsx` "renders the page shell..." (exact href) | P14b | href builder replaced, RED |
| LQ4 else-branch (147-153) no fix plan -> zero "Edit listing for:" links (structural fallback) | COVERED_NEW | N3 describe "LQ4 else-branch": real `FixPlanPanel`, BUYER_READY listing with `fixPlan: []` -> 0 links by role and by `[aria-label^="Edit listing for:"]`, "No fixes required" shown; control arm: one fix -> exactly 1 link, href `/broker/listings/listing-abc-123/edit` | P15d | no existing test covered the empty-plan branch. P15d makes the panel render a fallback fix (and so an Edit link) for an empty plan: RED. The legacy branch was conditional on live data; here it is deterministic |
| LQ5-a (172-200) Not Scored shows "Not yet scored", never "Score: 0" (worklist row) | COVERED_EXISTING | `ListingQuality.test.tsx` "renders not-scored listing row as "Not yet scored" without a fake 0 score" | P15a | text replaced by "Score: 0", RED |
| LQ5-a panel arm (187-195) fix-plan panel `score-unavailable` visible and never `Score: 0` | COVERED_NEW | N3 describe "LQ5 panel: not-scored listing never shows Score: 0": real `FixPlanPanel`, NOT_SCORED listing -> `score-unavailable` visible, text exactly "Not yet scored", no `/score:\s*0/i` (nor any "score:") in the panel; control arm: SCORED listing shows "Score: 72" and no `score-unavailable` | P15c | P15c makes the panel render "Score: 0" for a null score: RED (first failing assertion is the exact-text one, so the negative assertion is belt-and-braces). Existing test (m) only asserted the testid exists |
| LQ5-b (201-206) empty filter message | COVERED_EXISTING | `ListingQuality.test.tsx` "renders the page shell..." | P15b | message mutated, RED |

Security-reviewer (Gate F, at `6337cc0c`): APPROVE. N3 is a strict superset of LQ1. The remaining real-browser gap is route-specific AuthContext init, which canonical T2b exercises on `/my-bookings` through the same ProtectedRoute; it is not material. `Auth.tsx` passes `redirect`/`returnTo` through `getSafeReturnTo` (`authUtils.ts:32-55`, same-origin only; pre-existing).

Security-reviewer on CX-3 / CX-5 / the LQ deletion, at `394348f3`: APPROVE. No CRITICAL, HIGH or MEDIUM findings.

LOW/INFO evidence gaps:
- AuthContext is mocked, so the isLoading-until-role-fetch handoff is untested. A failure there fails closed.
- No MUT removes ProtectedRoute's `!canAccessRoute` branch. Arm (e) asserts it.
- The comment stripper could mis-parse a `/*` inside a string. None exists today.
- (a) does not check where ProtectedRoute is imported from.

Server-side authorization of `GET /api/broker/listing-quality` was never asserted by the deleted spec. It remains a backend concern.

Follow-ups, NON_BLOCKING and pre-existing, not asserted by any retired spec:
- how `AuthForms` consumes `returnTo` is unverified;
- account switch: the `savedListingIds` cache is keyed by an authed boolean, not the user id.

## school-badge-suppression

Spec `e2e/discover/school-badge-suppression.spec.ts` (3 tests). Destinations: `useDiscoverBadgeController.issue2190.test.ts` (N1, +1 it), NEW `useDiscoverBadgeController.schoolRadiusRender.test.tsx` (N2, 3 its: SBS-1, SBS-2 school-selected, SBS-2 area-school-combined; real `useDiscoverBadgeController` -> real `isDrillDownCountBadgeVisible` -> real `DiscoverMapCountBadge`, journey `school-first`, no hand-built `discoverBadge`).

| assertion | verdict | destination at HEAD | MUT | reasoning |
|---|---|---|---|---|
| SBS-1-a (170-171) radius active, zero results -> badge visible | COVERED_NEW | N1 "#2750 PILOT SBS-1" (visible, state `zero-empty`, count 0, hidden while the radius query loads); N2 "SBS-1" (pill rendered) | P01, P02, P03, P05, P07 | P02 `visible: schoolListingsCount > 0` and P03 `!!count` each redden N1/N2; P07 reddens `buildMapSurfaceModel.test.ts` genuine-zero control |
| SBS-1-b (174-176) badge shows 0, not the area total | COVERED_NEW | N2 "SBS-1": pill text exactly "Showing 0 homes", no 9/18/36; N1 count 0 | P01, P04, P05 | fixture: areaListings 9, area 18, cityTotal 36, all distinct from the radius count |
| SBS-2-a (260-261) 2 results -> visible | COVERED_EXISTING (controller) + COVERED_NEW (render, school-selected arm) | `useDiscoverBadgeController.issue2190.test.ts` BCP-4; N2 "SBS-2" (`school-selected`, no selected area) | P01, P05 | |
| SBS-2-b (264-266) badge shows 2, not 12 | COVERED_EXISTING (controller) + COVERED_NEW (render, school-selected arm) | BCP-4 (2, not 18/25/36); N2 "SBS-2" "Showing 2 homes" | P01, P04 | |
| SBS-2-c (render, combined state) the legacy SBS-2 URL carries `areaKey`, so the real page is `area-school-combined` with a non-null selected area; pill still "Showing 2 homes", not the area count | COVERED_NEW (Codex CX-1) | N2 "SBS-2 (area-school-combined, areaKey present)": real controller given `effectiveSelectedArea` = Kothanur (listingCount 18, distinct from the radius count 2; `areaResultSummaryText` contains "Kothanur", proving the area flows in), same area passed to the real `DiscoverMapCountBadge`, `resolvedPanelContent="area-school-combined"`, journey `school-first`, `isAreaFirstSelectedAreaState={false}`; pill text exactly "Showing 2 homes", no 9/18/36, no "Kothanur" | P20 | `isAreaFirstSelectedAreaState` is derived in `useDiscoverJourneyChromeController.ts:167` as `nav.journey === 'area-first' && !!effectiveSelectedArea && panel in ('area-selected','area-groups-landing')`, so it is FALSE for a `school-first` journey even with a selected area (and the badge's area branch is gated on it). The state is therefore reproduced honestly at this level; the only seam not reproduced is the URL-to-journey resolution (SBS-1-c, already UNCOVERED). P20 (`schoolListingsCount: schoolRadiusActive && !effectiveSelectedArea`, i.e. area context overrides the radius count only when an area is selected) reddens the combined arm only; the school-selected arms stay GREEN (3 its: 1 failed, 2 passed) |
| SBS-J1 anon radius listings feed `schoolListings` | COVERED_EXISTING | `useSchoolListings.test.ts` "anon, active school-radius: applies applyAnonPropertyFilters over schoolRadiusListings" | P06 | 4 its RED |
| SBS-J2 composition passes `schoolListings` into the badge controller (`useDiscoverPageComposition.ts:493`) | UNCOVERED | none: no page/composition harness exists | P08 SURVIVED | `schoolListings: []` at the call site left all 72 SBS-destination tests GREEN (issue2190 incl. N1, N2, buildMapSurfaceModel, useSchoolListings, DiscoverMapCountBadge). Row is NOT claimed covered. Owner may accept SBS-J2 by name as type-checked plumbing, or request a composition harness |
| SBS-1-c (URL-to-state parse of journey/radiusKm/lat/lon, and the school heading) | UNCOVERED | none: N1/N2 start from controller inputs, not the URL | - | not claimed covered; harmless while the spec is KEEP (SBS-J2 already keeps it) |
| SBS-3-a (281-289) no school context: badge = city total | COVERED_EXISTING (controller arm only) | `useDiscoverBadgeController.issue2190.test.ts` BCP-1 (36) | P09 | P09 (cityTotal = first area only) reddens 6 issue2190 its. `MapDiscovery.issue1175.test.ts` stayed GREEN under P09 and is NOT a destination. The page-render arm of SBS-3-a is not MUT-proven (the spec is KEEP anyway) |
| SBS-3-b (293-295) no school heading on non-school path | UNCOVERED (Codex CX-6; was OBSOLETE) | none: N1/N2 start from controller inputs and never mount the page heading | - | reclassified: "no school heading when the URL carries no `schoolId`" is a real page-render assertion, not a vacuous one, and nothing at HEAD asserts it. Not claimed covered; harmless while the spec is KEEP (SBS-J2 and SBS-1-c already keep it) |

## broker-dashboard-v2

OUT of the pilot. BD1-BD3 and the BD4 link href are already covered by `BrokerDashboard.v2.test.tsx` (28/28 at HEAD). The only open assertion is BD4's post-click landing heading "My Listings",
a BrokerListings page-render seam (`BrokerListings.tsx:124` inside `AppLayout`, with `useAuth`, `useBrokerListingsInventory`, `useBrokerListingSelection`, `useBulkDeleteListings`, `useToast` mocks).
It does not land in the LQ1 destination (N3 is a route-guard test that never mounts a page) and closing it needs a new page-render mock harness around `AppLayout` (the #2813 frozen area). Left for PR-6a.

## MUT register

Serial, one mutation at a time; RED log + exit captured before revert; revert verified empty with `git diff --stat`; GREEN re-run exit 0. Source of truth: `evidence/mut/register.tsv`.
40 valid rows: 36 RED_GREEN, 1 SURVIVED (P08), 3 TOLERANCE_GREEN negative controls (P22, P22r, P23). Plan ids P13/P14/P15 are split into sub-MUTs. Rework cycle 1 added P17b, P15c, P15d, P10r, P12r. Codex rework 1 added P20, P10r2, P21, P22. Codex cycle 2 added P10r3, P21r, P22r, P23 (CX-3, against the order-insensitive matcher), P24, P25 (CX-4) and P26 (CX-5). One further register row, P17b0, is an INVALID mutation (the first P17b attempt changed the return type to `long` on a `@Modifying @Query`, a Spring Data error, not the N4 asserts); it is kept in the register for honesty and is not counted.

| id | target (base lines) | mutation | tests that went RED | verdict |
|---|---|---|---|---|
| P01 | `useDiscoverBadgeController.ts:161` | `schoolListings.length` -> `areaListings.length` | issue2190 BCP-4 + N1; N2 SBS-1, SBS-2 | RED_GREEN |
| P02 | `discoverBadge.ts:233` | `visible: true` -> `visible: schoolListingsCount > 0` | N1; N2 SBS-1 | RED_GREEN |
| P03 | `discoverMapCountBadgeVisibility.ts:40` | `count != null` -> `!!count` | N2 SBS-1 | RED_GREEN |
| P04 | `DiscoverMapCountBadge.tsx:214` | `discoverBadge.count` -> `cityTotal` | N2 SBS-1, SBS-2 | RED_GREEN |
| P05 | `useDiscoverBadgeController.ts:110` | `schoolRadiusKm != null` -> `== null` (radius never active) | BCP-4, N1, N2 x2 | RED_GREEN |
| P06 | `useSchoolListings.ts:98` | filtered radius set -> `areaListings` | useSchoolListings x4 | RED_GREEN |
| P07 | `buildMapSurfaceModel.tsx:748-755` | pending predicate -> `= schoolRadiusActive` | buildMapSurfaceModel x4 | RED_GREEN |
| P08 | `useDiscoverPageComposition.ts:493` | `schoolListings,` -> `schoolListings: [],` | none (72/72 GREEN) | SURVIVED |
| P09 | `useDiscoverBadgeController.ts:81` | cityTotal -> first area only | issue2190 x6 (issue1175 stayed GREEN) | RED_GREEN |
| P10 | `App.tsx:230-232` | drop `<ProtectedRoute>` wrapper | N3 (a) | RED_GREEN |
| P11 | `ProtectedRoute.tsx:26` | `if (!user)` -> `if (false)` | N3 (b),(c) | RED_GREEN |
| P11b | `ProtectedRoute.tsx:15` | `if (isLoading)` -> `if (false)` | N3 (c) | RED_GREEN |
| P12 | `ProtectedRoute.tsx:28` | Navigate target -> `/` | N3 (b),(c) | RED_GREEN |
| P13a | `ListingQuality.tsx:32` | h1 "Listing Quality" -> "Listing Scores" | ListingQuality.test page-shell | RED_GREEN |
| P13b | `ListingQualitySummary.tsx:38` | "Avg Quality" -> "Avg Score" | ListingQuality.test summary cards | RED_GREEN |
| P13c | `QualityFilterBar.tsx:45` | `aria-pressed={isActive}` -> `{!isActive}` | ListingQuality.test page-shell | RED_GREEN |
| P14a | `QualityListingWorklist.tsx:59` | onClick -> no-op | ListingQuality.test x4 | RED_GREEN |
| P14b | `FixPlanPanel.tsx:125` | edit link -> `/broker/listings` | ListingQuality.test page-shell | RED_GREEN |
| P15a | `QualityListingWorklist.tsx:96` | "Not yet scored" -> "Score: 0" | ListingQuality.test not-scored row | RED_GREEN |
| P15b | `QualityListingWorklist.tsx:34` | empty message -> "No listings." | ListingQuality.test page-shell | RED_GREEN |
| P16 | `routeAccess.ts:84` | `(isBrokerRoute(clean) && clean !== '/broker/listing-quality') \|\| ...` | N3 (d),(f) | RED_GREEN |
| P17 | `SavedListingRepository.java:22` | `WHERE (s.userId = :userId OR s.userId IS NOT NULL)` (`mvn clean` before each run) | N4 only (IT 9 run, 1 failure; existing single-user tests GREEN) | RED_GREEN |
| P17b | `SavedListingRepository.java:25-26` | `deleteByUserIdAndListingId` becomes `@Query("DELETE ... WHERE s.userId <> :userId AND s.listingId = :listingId")` returning `int` (deletes the OTHER user's row; `mvn clean` before each run) | N4 post-delete assert (IT:203) + `idempotentDelete_removesOwnRowOnly` (:168); IT 9 run, 2 failures, Skipped 0 | RED_GREEN |
| P15c | `FixPlanPanel.tsx:30` | "Not yet scored" -> "Score: 0" | N3 LQ5 panel it | RED_GREEN |
| P15d | `FixPlanPanel.tsx:106-112` | empty fix plan renders a fallback fix (and its Edit link) | N3 LQ4 else-branch it | RED_GREEN |
| P10r | `App.tsx:230-232` | re-run of P10 against the quote-agnostic (a) | N3 (a) | RED_GREEN |
| P12r | `ProtectedRoute.tsx:28` | re-run of P12 against the exact-equality probe assertions | N3 (b),(c) | RED_GREEN |
| P20 | `useDiscoverBadgeController.ts:146` | `schoolListingsCount: schoolRadiusActive` -> `schoolRadiusActive && !effectiveSelectedArea` (area context overrides the radius count only when an area is selected) | N2 SBS-2 area-school-combined only (1 failed, 2 passed: school-selected SBS-1/SBS-2 stay GREEN) | RED_GREEN |
| P10r2 | `App.tsx:230-232` | drop `<ProtectedRoute>` wrapper, against the fully quote-tolerant (a) | N3 (a) (1 failed, 8 passed) | RED_GREEN |
| P21 | `App.tsx:229` | route path renamed to `/broker/listing-quality-v2` | N3 (a) (1 failed, 8 passed) | RED_GREEN |
| P22 | `App.tsx:229` | route path rewritten to `path='/broker/listing-quality'` (guard kept) | none (9/9 GREEN, expected) | TOLERANCE_GREEN (negative control, not a survivor) |
| P10r3 | `App.tsx:230-232` | re-run of P10: drop `<ProtectedRoute>` wrapper, against the order-insensitive (a) | N3 (a) (1 failed, 9 passed) | RED_GREEN |
| P21r | `App.tsx:229` | re-run of P21: path renamed to `/broker/listing-quality-v2`, against the order-insensitive (a) | N3 (a) (1 failed, 9 passed) | RED_GREEN |
| P22r | `App.tsx:229` | re-run of P22: single-quote rewrite, guard kept | none (10/10 GREEN, expected) | TOLERANCE_GREEN (negative control) |
| P23 | `App.tsx:229-234` | reorder the real route's props (`element` first, `path` second), guard kept | none (10/10 GREEN, expected) | TOLERANCE_GREEN (negative control: behaviour-preserving reorder must not false-RED) |
| P24 | `useBrokerListingQuality.ts:22` | endpoint `/api/broker/listing-quality` -> `/api/broker/listing-quality-v2` | N5 exact-path asserts (2 of 4 failed) | RED_GREEN |
| P25 | `ListingQualitySummary.tsx:22-23` | `averageQuality` read from `buyerReadyCount` (hook->page field mapping broken) | N5 both page its (2 of 4 failed: `Average quality score: 67` label missing; null-dash renders "0") | RED_GREEN |
| P26 | `routeAccess.ts:84` | broker-route clause excludes `dealer` for `/broker/listing-quality` only | N3 (d-dealer), (f) (2 failed, 8 passed; broker arms GREEN) | RED_GREEN |
| P18 | `PropertyCard.tsx:357` | `aria-pressed={isSaved}` -> `{!isSaved}` | PropertyCard.test x3 | RED_GREEN |
| P19 | `useSavedListings.ts:151-152` | unsave onMutate keeps the id in the ids cache | useSavedListings.test "optimistically removes..." | RED_GREEN |

## Test results

Codex cycle 2 (`evidence/b2-cx-final/exits.tsv`): App.brokerListingQualityRoute 10, useBrokerListingQuality.pilot 4, ListingQuality 14, routeAccess 13, all exit 0; eslint on the 2 test files exit 0.
B2 guards: `npm run test:e2e:guard` exit 0 (estate: files=147 rows=217 retired=70), `node --test scripts/e2e/*.test.mjs` 192/192 exit 0. `gen-e2e-inventory.py --check` against the staged tree exits 0; the committed doc carries the `HEAD` label, so the default `--check` passes once the deletions are committed. Canonical T21 / T2b and the two `npm run test:e2e:gate` runs: NOT_RUN by this pass (qa verification).
Codex rework 1 (`evidence/codex1-final/exits.tsv`): authoritative for schoolRadiusRender (3 its), App.brokerListingQualityRoute (9 its), issue2190, DiscoverMapCountBadge and eslint on the 2 test files.
Rework cycle 1 (`evidence/b1-final-r1/exits.tsv`): App.brokerListingQualityRoute 8, ListingQuality 14, issue2190 12, schoolRadiusRender 2, all exit 0; mvn `clean` then IT 9 + ControllerTest 14, F0 E0 Skipped 0; eslint exit 0.
Cycle 1 (`evidence/b1-final/exits.tsv`; 15 web files exit 0; N3 then had 6 its): issue2190 12, schoolRadiusRender 2, App.brokerListingQualityRoute 6, buildMapSurfaceModel 29, useSchoolListings 17, DiscoverMapCountBadge 12, MapDiscovery.issue1175 16,
MapDiscovery.anon-school-radius 21, ListingQuality 14, App.propertyRequestsRoute 9, routeAccess 13, BrokerDashboard.v2 28, useSavedListings 14, SavedHomes 13, PropertyCard 102.
mvn (`clean` first): SavedListingsRepositoryIT 9 (F0 E0 S0), SavedListingsControllerTest 14, BUILD SUCCESS. eslint on the 3 new/extended web files: exit 0.
Canonical T21 / T2b: NOT_RUN (need the local pinned auth stack; established only by the B2 gate runs).

## Cost / yield (date -u; source: `.claude/handoffs/issue-2750-pilot/team-lead-execution-log.md`)

| stage | window | minutes | specialist calls |
|---|---|---|---|
| Stage A plan (Team Lead direct + plan-time runs) | 16:14:52Z-16:29:58Z | 15 | 1 (sentinel probe; overhead) |
| B1 qa-fast | 16:34:52Z-16:37:47Z | 3 | 1 |
| B1 qa (write N1-N4, 24 MUTs) | 16:38:26Z-16:52:12Z | 14 | 1 |
| B1 code-reviewer cycle 1 | 16:53:21Z-16:58:17Z | 5 | 1 |
| B1 qa rework cycle 1 (5 MUTs) | 16:58:42Z-17:07:11Z | 8.5 | 1 |
| B1 code-reviewer cycle 2 + security-reviewer (parallel) | 17:07:50Z-17:09:24Z | 1.5 | 2 |
| B1 qa verification | see `b1-candidate.toml` | - | 1 |

B1 used 7 specialist calls (8 for the run including the Stage-A probe); the 12-call budget includes the probe; the B1 elapsed time is in `b1-candidate.toml`.
Codex rework 1: see team-lead-execution-log.md.
B2: see team-lead-execution-log.md. The Team Lead fills in the per-spec call counts, minutes, worked/blocked and the scaling recommendation.

Approximate attribution of the shared calls by work share:
- broker-listing-quality: about 45% (N3 plus the Gate F review, and most of the rework).
- school-badge-suppression: about 35% (N1/N2 plus 9 of the MUTs).
- saved-homes: about 20% (N4 plus 4 MUTs).

Yield:
- 2 of 3 specs are RETIRED at B2 (saved-homes pending gate x2 on T21; broker-listing-quality pending security-reviewer APPROVE).
- 1 spec is KEEP with 3 named uncovered rows (SBS-J2, SBS-1-c, SBS-3-b).
- New mutation-proven coverage for 3 previously untested seams:
  - the badge controller school arm and the rendered school pill;
  - the `/broker/listing-quality` guard wiring, including the isLoading race;
  - the saved-ids hydration after a delete.

What worked:
- Plan-time real runs.
- The qa-fast amendments before the MUTs. They corrected 3 mis-aimed mutations: P11, P16, P17.
- Reviewer focus on rows the MUTs had never reddened. That found the LQ5 panel arm and the delete side of N4.

What blocked or cost time:
- The jCodemunch guard blocked grep and find for every agent.
- One invalid mutation (P17b0).
- One rework cycle for missing rows.

Recommendation:
- Scale to the remaining PR-6 "LOWER-LEVEL / DUPLICATE" candidates in batches of 3-4 specs.
- Have qa-fast aim the MUTs before writing.
- Require a map row for every legacy `expect`, including conditional else-branches, in the first qa pass.
- Specs whose only gap is a composition pass-through (like SBS-J2) need either an owner ruling on plumbing or a shared page-composition harness. Decide that once, centrally, before scaling Discover candidates.
