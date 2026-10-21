# E2E retirement map — issue #2860 (canonical coverage for 4 legacy Discover specs)

Per-assertion map of the four legacy specs scheduled to #2860 in
[`e2e-retirement-manifest.csv`](e2e-retirement-manifest.csv) onto the canonical suite
(`e2e/canonical/**`, journey ids in [`e2e-journey-matrix.md`](e2e-journey-matrix.md)). Source of the rows: the
approved plan `.claude/handoffs/issue-2860/approved-plan.toml` `[assertion_map]` (legacy rows and the three
REPLACEMENT rows `*r` are counted separately).

**Nothing in this document is deletion-ready.** No legacy spec is deleted by #2860. A spec can only be presented
for deletion once every one of its rows is EXISTING/NEW with mutation evidence or an accepted NOT_PROVEN reason,
its SUPERSEDED/RETAIN rows are settled by the owner (D2-D4, D8, D9), and the owner names it in a by-name deletion comment.
Manifest disposition stays `MOVE_DOWN` / `SCHEDULED(#2860)` until then.

Status vocabulary: `EXISTING` = already asserted by canonical at the base (a0bc0dd9); `NEW` = added by #2860;
`SUPERSEDED` = the legacy oracle is stale against current product, replaced by the current real outcome (owner
confirms, D2-D4); `RETAIN` = cannot be covered canonically (reason given). Mutation column: the credited
mutation id (defined in the plan's `[mutations].list`) or the NOT_PROVEN reason. Only the FIRST failing assertion
of a test is proven by a mutation, so assertion order inside T8b/T8c/T25 is part of the design (masking rule).

## Decisions

| Id | Decision | Status |
|---|---|---|
| D1 | AC9 rows 1468-55..59 (named Udupi towns Padubidri/Shirva, absent from the canonical fixture) | RETAIN (owner) |
| D2 | 1956 placeholder-text rows 1956-01..04 unreachable for the journey-less groupId URL; replaced by 1956-01r | RULED (owner, 2026-10-21): ACCEPT SUPERSEDED (legacy placeholder text for journey-less groupId URLs) |
| D3 | 2205-16 'zero markers requests' is stale (school-first marker scope is city); replaced by 2205-16r | RULED (owner, 2026-10-21): ACCEPT SUPERSEDED (legacy zero-markers-request assertion; current school-first scope is city-wide; the replacement request-scope guard remains NOT_PROVEN) |
| D4 | 1065 cookie checks vacuous (Supabase session is localStorage) and right-panel testid; replaced by 1065-05r / surface rows | RULED (owner, 2026-10-21): ACCEPT SUPERSEDED (obsolete cookie assertions and legacy right-panel test IDs) |
| D5 | Four new canonical ids T7b, T8c, T10b, T25 (one per legacy spec family, no tiny-test swarm) | RULED (owner, 2026-10-21): APPROVE T7b, T8c, T10b, T25 |
| D6 | `[E2E] Koramangala Fixture Public School` substitutes Bethany High School (not in the canonical chain) | RULED (owner, 2026-10-21): APPROVE the Koramangala fixture school as a behavioural substitute for Bethany High School; no coverage of Bethany-specific data is claimed |
| D7 | No targeted canonical runner at this head; mutation runs are batched FULL-suite runs, labelled as such | ACCEPTED (owner) |
| D8 | NEW (found on the DEV RUN): `/discover?city=udupi&journey=area-first&zoom=14&areaKey=IN\|KA\|Udupi\|Manipal` (authed) keeps the panel on the Udupi city root while the map enters the Manipal selected-area state ("4 verified properties in Manipal"); no listing cards and no listing markers render. Legacy 1065 rows 'cards > 0' (1065-02 card render) and the listing-marker reading of 1065-03 cannot be asserted canonically. SUPERSEDED (areaKey= is a legacy write, #2216) or product defect (map/panel scope split)? | RULED (owner, 2026-10-21): RETAIN 1065-02/03; the map/panel scope disagreement is a POTENTIAL PRODUCT DEFECT for targeted post-Friday verification, not confirmed obsolete |
| D9 | NEW (fix cycle 2): 1065-03 (markers fetch + `.leaflet-marker-icon` > 0) is RETAIN, not asserted by T25: the markers fetch is gated on the LIVE map zoom (> 12) and this zoom=14 deep link does not hold that zoom deterministically (requested in DEV RUN 1, M2, M3, M4, M6; never requested in M5 and DEV RUN 2, camera settled at the Udupi overview). Possible #1065 'mapZoom sync from URL' product defect, or accept RETAIN? | RULED: fixed by #2882 (merge 09c3bc59); follow-up #2884; 1065-03 stays RETAIN |

## Summary per legacy spec

| Legacy spec | Canonical host | Legacy rows | EXISTING | NEW | SUPERSEDED | RETAIN | Replacement rows | Mutation-credited (legacy + replacement) | Deletion-ready |
|---|---|---|---|---|---|---|---|---|---|
| `e2e/discover-agri-locality-marker-1468.spec.ts` | T8b, T9, T8c (anon), T18 bare-city row | 59 | 14 | 40 | 0 | 5 | 0 | 10 + 0 (9 PROVEN; 1468-46 NOT_PROVEN) | NO |
| `e2e/discover/issue-1956-pr6-no-blank-panel.spec.ts` | T10b arms A and B (anon) | 9 | 0 | 5 | 4 | 0 | 1 | 3 + 1 (all PROVEN) | NO |
| `e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts` | T7b (user) | 17 | 0 | 16 | 1 | 0 | 1 | 2 + 0 (both PROVEN; 2205-16r NOT_PROVEN, mutation dropped) | NO |
| `e2e/issue-1065-final.spec.ts` | T25 (user), T10b arm C (anon) | 7 | 0 | 1 | 4 | 2 | 1 | 1 + 1 (both PROVEN; 1065-02 for the status-pill count line only; MUT-1065-MARKERS executed in M1 but no longer credited - 1065-03 RETAIN, D9) | NO |
| **Total** | | 92 | 14 | 62 | 9 | 7 | 3 | 16 + 2 (15 + 2 PROVEN) | NO |

Every NEW row without a credited mutation is NOT_PROVEN by mutation for the reason given in its row (shared proof
of the same write, precondition, fixture-count, masked by an earlier line, or a negative with a paired positive).
Mutation results come from the six mutation runs M1-M6 (`.claude/handoffs/issue-2860/evidence/mutations/<RUN>@<sha8>.txt`);
all six have run, so no row is `PENDING`.

## Mutation tally (M1-M6)

Each run is a MUTATION RUN (full suite; targeted runner unavailable, D7) from a disposable detached worktree on
5376/8376; its non-zero exit is never gate evidence. A mutation is PROVEN only when its target test failed FIRST on
the credited row's own assertion line.

| Bucket | Credited rows | PROVEN | NOT_PROVEN |
|---|---|---|---|
| Legacy rows | 16 | 15: 1468-04, 1468-10, 1468-18, 1468-19, 1468-24, 1468-33, 1468-38, 1468-50, 1468-51; 1956-05, 1956-06, 1956-09; 2205-07, 2205-13; 1065-02 (status-pill count line only). MUT-1065-MARKERS (1065-03) executed in M1 but NO LONGER CREDITED: the row is RETAIN (D9) and its lines were removed from T25 | 1: 1468-46 (MUT-1468-PEEK, M6: T8b failed first at :226, the EXISTING 1468-49 locality-panel line, masking :234) |
| Replacement rows | 3 in the plan (2 with an executed mutation) | 2: 1956-01r, 1065-05r | 1: 2205-16r (MUT-2205-SCOPE dropped: no markers request fires before the school select at base, so there is nothing to scope) |
| **Total** | **19 planned / 18 executed** credited (plus MUT-1065-MARKERS: executed, not credited) | **17** | **2** (1468-46 executed and not proven; 2205-16r not executable) |

| Run | Evidence | Mutations -> target first failure |
|---|---|---|
| M1 | M1@1ffad991.txt | KEY T8b:154; MIG T9:380; ANON-PRICE T8c:288; BLANK-A T10b-A:135; 2205-SEL T7b:165; 1065-MARKERS T25 waiter :282/:301 (no longer credited: 1065-03 RETAIN, D9) |
| M2 | M2@ffae1f36.txt | DESTKEY T8b:176; MIG-RESURRECT T9:391; ANON T8c:289; ROOT-B T10b-B:143; 2205-CLR T7b:181; 1065-CARDS T25:317 (the same line text is T25:307 after fix cycle 2) |
| M3 | M3@24ba1035.txt | NAME T8b:189; PE-A T10b-A guard (tagged) - collateral T9:388 |
| M4 | M4@69d5c560.txt | COLD T8b:248; PE-B T10b-B guard (tagged) - collateral T8c:281 (same COLD mutation) |
| M5 | M5@e2aa2302.txt | CLOSE-NOOP T8b:258; 1065-ANON T10b-C:153 - collateral T9:391 (same CLOSE-NOOP), T25 markers waiter (diagnosed below from the retained logs; no extra runs) |
| M6 | M6@a22c9a6e.txt | PEEK T8b:226 (NOT the credited :234) -> NOT_PROVEN |
| CODEX | CODEX-F1@9c0b4b25.txt, CODEX-F2@9c0b4b25.txt | (Codex round 1, supplementary oracles, not added to the tally above) F1 two-write setSchoolJourney -> T7b:224 URL-transition oracle (the final-URL predicate passed); F2 delayed second surface ~1.2 s after content -> settled recount T10b-A/B/C:144 and T25:329 (the first-match polls passed). Collateral: none |

T7b and T25 at 8a155464 (informational, runs that do not mutate them): T7b passed in M3, M4, M5, M6; T25 passed in
M3, M4, M6 and failed collaterally in M5 (above).

HISTORICAL (superseded by fix cycle 2, kept as evidence): the two paragraphs below describe T25 as it was at
8a155464/d4bd58d1. The markers waiter and request recorder they mention no longer exist, and the "OPEN" oracle question
they raise was resolved by fix cycle 2 (1065-03 RETAIN, D9). For the current state, see "Fix cycle 2" and
"Final-head gate results" below.

T25 M5 diagnosis (HISTORICAL; fix cycle 1, from M5-raw/backend.log + results.json; no rerun). The failure is NOT a waiter predicate
race and NOT the arm-C ProtectedRoute branch (T25's URL carries journey=area-first, so MutAnonGate rendered its
fragment branch throughout - no remount). The frontend never SENT the request: in T25's window (13:43:24-13:43:45
local) the backend logged the city=udupi areas, area-groups, regions, listings and cities/udupi/listings GETs but NO
city=udupi markers GET (the first one is 13:44:09, a later test). DEV RUN 1 shows the healthy order: cities/udupi/
listings, then markers city=udupi, then a second listings refetch. The waiter was armed before page.goto and the
surface asserts passed (20.16 s duration = the waiter's own 20 s timeout), so nothing was missed. Root cause: the
markers query is gated by `markersEnabled` (useDiscoverMapDataController.ts:260-280: isAuthenticated && journey ===
'area-first' && !isTopGroupedLevel && shouldShowMarkers(live mapZoom > 12)); whether it ever flips true on this deep
link depends on the order of auth resolution vs the Udupi camera settle - a product-side timing dependency, which the
M5 wrapper's extra useSearchParams subscriber above DiscoverProvider plausibly perturbed (unproven). Character:
likely-flaky (product timing), not deterministic. Hardening (no oracle change): T25 now records markers requests
alongside the armed waiter and a timeout names "never requested" vs "requested, no response". If T25 reds on that
line outside a mutation run, it is a product finding (markers gate on the legacy areaKey= link), not a test to relax.

DEV RUN 2 @d4bd58d1 (HISTORICAL; unmutated, NOT gate evidence) REPRODUCED it: T25 failed at the 1065-03 waiter with "markers requests
sent=0 (never requested)"; 57/58 passed. The page snapshot shows the map settled at the Udupi OVERVIEW (Direction
cluster bubbles "Kaup Direction" and "Manipal Direction, Brahmavar Direction", breadcrumb "Udupi") with the status
pill "4 verified properties in Manipal": the camera left the URL's zoom=14 for a zoom <= 12 before markersEnabled
became true, so shouldShowMarkers kept the query off. Tally for the markers waiter on this T25 shape: requested in
DEV RUN 1, M2, M3, M4, M6; never requested in M5 and DEV RUN 2. 1065-03 is therefore a product timing dependency
(OPEN - owner/planner decision: product fix, or a re-specified oracle), not a test defect; the oracle was not relaxed.

Fix cycle 2: T25 no longer asserts 1065-03. The markers-response waiter, its request recorder and the
`.leaflet-marker-icon` count line were removed (not weakened, not re-pointed, no fixed-timeout wait added); row 1065-03
is RETAIN under D9 (ruled: fixed by #2882, follow-up #2884, 1065-03 stays RETAIN). T25 now asserts the exactly-one areas shell (1065-01), the Manipal status-pill
count >= 4 (1065-02's credited line, text unchanged, now T25:307) and the auto console guard (1065-04).

Final-head gate results: the post-fix-2 T25 HAS run, twice. The canonical gate (`npm run test:e2e:gate` from inside
the worktree, ports 5376/8376) ran twice at b2c5250e, the last test-code commit. Both runs printed
`CANONICAL E2E GATE: PASS @ b2c5250e695999d1647137b1ff501496539f31c0 results: listed=58 executed=58 results:
passed=58 unexpected=0 skipped=0 flaky=0`. T25, T7b, T8b, T8c, T9, T10b (arms A/B/C) and T18 passed in both runs, and
the two sorted title sets are identical. Evidence: `.claude/handoffs/issue-2860/evidence/final-gate-1.log`,
`final-gate-2.log`, `final-gate-titles-1.txt`, `final-gate-titles-2.txt`. This doc-only correction is re-validated by
a further gate x2 at its own head, recorded under `.claude/handoffs/issue-2860/evidence/final-gate-r1-*`. Final
disposition is unchanged: 1065-03 RETAIN (D9 ruled: fixed by #2882, follow-up #2884), 1065-02 RETAIN (D8 ruled: potential product defect, post-Friday verification), nothing deletion-ready.

## `e2e/discover-agri-locality-marker-1468.spec.ts`

Canonical host: T8b, T9, T8c (anon), T18 bare-city row. Plan note: e2e/canonical/discover-agri-first.canonical.ts T8b (extend), T9 (extend), new T8c [canonical-anon]; panel-exclusivity T18 bare-city row (extend). Canonical equivalents: Shirva -> Fixtureville (far town, 2 parcels), Padubidri -> RR Nagar.

| Row | Legacy assertion | Canonical test | How asserted | Mutation (credited id or NOT_PROVEN reason) | Mutation result | Status |
|---|---|---|---|---|---|---|
| 1468-01 | AC1 agri-group-selected-panel visible at region+maxKm | T8b step 3 (maxKm=50) | toBeVisible | NOT_PROVEN (precondition visibility; no scheduled mutation) | - | NEW |
| 1468-02 | AC1 >=1 agri-group-locality-btn visible | T8b steps 2-3 | RR Nagar + Fixtureville rows visible | existing canon MUT-C1/C2 evidence (issue-2750-canon) | - | EXISTING |
| 1468-03 | AC1 locality-btn count >= 2 | T8b step 3 | count read, expect >=2 | NOT_PROVEN (fixture-count precondition, not a product line) | - | NEW |
| 1468-04 | AC1 no row text contains '\|' | T8b step 3 | allTextContents, each not.toContain('\|') - asserted BEFORE the named-town checks | MUT-1468-KEY (credited row) | PROVEN - T8b:154 (M1@1ffad991) | NEW |
| 1468-05 | AC1 no row text contains 'IN\|KA' | T8b step 3 | same loop, after 1468-04 | NOT_PROVEN (masked: MUT-1468-KEY fails first on 1468-04) | - | NEW |
| 1468-06 | AC1 a row includes 'Padubidri' | T8b step 2/3 | RR Nagar row (canonical equivalent, named fixture town) | existing canon evidence | - | EXISTING (equivalence; real Padubidri name = 1468-55 RETAIN) |
| 1468-07 | AC1 a row includes 'Shirva' | T8b step 3 | Fixtureville row | existing canon evidence | - | EXISTING (equivalence) |
| 1468-08 | AC1 agri-group-listing-row count 0 | T8b step 3 | toHaveCount(0) | none possible: testid deleted from product (#1480); negative guard, disclosed as NO_PRODUCT_LINE | - | NEW |
| 1468-09 | AC2 target town btn visible | T8b step 3 | Fixtureville btn visible | EXISTING | - | EXISTING |
| 1468-10 | AC2 URL destKey = encoded real areaKey | T8b step 4 | searchParams.get('destKey') === 'IN\|KA\|Bengaluru\|Fixtureville' (exact, today only non-empty) | MUT-1468-DESTKEY (credited row) | PROVEN - T8b:176 (M2@ffae1f36) | NEW |
| 1468-11 | AC2 URL has no locality= | T8b step 4 | !has('locality') | EXISTING (T8b L143) | - | EXISTING |
| 1468-12 | AC2 region preserved | T8b step 4 | get('region')==='SW' | NOT_PROVEN (shared proof: AC2 credited to MUT-1468-DESTKEY on 1468-10; a same-test variant run was dropped per owner direction) | - | NEW |
| 1468-13 | AC2 maxKm preserved | T8b step 4 | get('maxKm')==='50' | NOT_PROVEN (shared proof, as 1468-12) | - | NEW |
| 1468-14 | AC2 agri-group-locality-panel visible | T8b step 4 | EXISTING (L144) | - | - | EXISTING |
| 1468-15 | AC2 agri-group-selected-panel count 0 after drill | T8b step 4 | toHaveCount(0) | NOT_PROVEN (shared proof: AC2 credited to MUT-1468-DESTKEY) | - | NEW |
| 1468-16 | AC2 Level-3 request areaKey === real key | T8b step 4 | page.waitForRequest(predicate: pathname endsWith '/api/discover/agri-map-listings') ARMED BEFORE the town click, awaited after; searchParams.get('areaKey') exact | NOT_PROVEN (shared proof: AC2 credited to MUT-1468-DESTKEY; note DESTKEY also changes this request's areaKey, so the evidence file records which line failed first) | - | NEW |
| 1468-17 | AC2 Level-3 request has no areaKeys | T8b step 4 | !has('areaKeys') on the same captured request | NOT_PROVEN (shared proof; backend 400 on a plural param would additionally trip the guard) | - | NEW |
| 1468-18 | AC3 locality panel visible on destKey deep link | T8b new step 8 (cold page.goto of the captured destKey URL) | toBeVisible | MUT-1468-COLD (credited row) | PROVEN - T8b:248 (M4@69d5c560) | NEW |
| 1468-19 | AC3 agri-locality-name text === displayName | T8b step 4 | toHaveText('Fixtureville') | MUT-1468-NAME (credited row) | PROVEN - T8b:189 (M3@24ba1035) | NEW |
| 1468-20 | AC3 header text has no '\|' | T8b step 4 | not.toContain('\|') after 1468-19 | NOT_PROVEN (masked: MUT-1468-NAME fails first on 1468-19) | - | NEW |
| 1468-21 | AC3 >=1 agri-locality-listing-row | T8b step 4 | EXISTING (both parcel rows by title) | - | - | EXISTING |
| 1468-22 | AC3 row count exact (stub 1) | T8b step 4 | rows toHaveCount(2) (Fixtureville seeds exactly 2) | NOT_PROVEN (fixture-count; per-title rows carry canon MUT-C2 evidence) | - | NEW |
| 1468-23 | AC4 agri-locality-close-btn visible | T8b new step 9 | toBeVisible | NOT_PROVEN (precondition visibility) | - | NEW |
| 1468-24 | AC4 destKey removed after close | T8b step 9 | !has('destKey') | MUT-1468-CLOSE-NOOP (credited row) | PROVEN - T8b:258 (M5@e2aa2302) | NEW |
| 1468-25 | AC4 no locality= resurrected | T8b step 9 | !has('locality') | NOT_PROVEN (masked by 1468-24 under CLOSE-NOOP) | - | NEW |
| 1468-26 | AC4 region preserved | T8b step 9 | get('region')==='SW' | NOT_PROVEN (shared proof: AC4 credited to MUT-1468-CLOSE-NOOP on 1468-24; same-test variant dropped) | - | NEW |
| 1468-27 | AC4 maxKm preserved | T8b step 9 | get('maxKm')==='50' | NOT_PROVEN (shared proof, as 1468-26) | - | NEW |
| 1468-28 | AC4 locality panel count 0 | T8b step 9 | toHaveCount(0) | NOT_PROVEN (masked by 1468-24 under CLOSE-NOOP) | - | NEW |
| 1468-29 | AC4 selected panel visible again | T8b step 9 | toBeVisible | NOT_PROVEN (masked by 1468-24 under CLOSE-NOOP) | - | NEW |
| 1468-30 | AC5 cold-load destKey URL mounts locality panel directly | T8b step 8 | fresh page.goto(region=SW&maxKm=50&destKey=<key>) -> locality panel visible without click | covered by 1468-18 assertion (same assertion line; MUT-1468-COLD credited there) | - | NEW |
| 1468-31 | AC5 >=1 listing row on cold load | T8b step 8 | both Fixtureville rows | NOT_PROVEN (masked by 1468-18 under COLD) | - | NEW |
| 1468-32 | AC5 selected panel count 0 on cold load | T8b step 8 | toHaveCount(0) | NOT_PROVEN (masked by 1468-18 under COLD) | - | NEW |
| 1468-33 | AC5b legacy locality=<areaKey> -> destKey=<areaKey> | T9 new leg 3 | goto(...&locality=IN\|KA\|Bengaluru\|Fixtureville&maxKm=50) then toHaveURL destKey exact | MUT-1468-MIG (credited row) | PROVEN - T9:380 (M1@1ffad991) | NEW |
| 1468-34 | AC5b no locality= after migration | T9 leg 3 | !has('locality') | NOT_PROVEN (masked by 1468-33 under MIG) | - | NEW |
| 1468-35 | AC5b no town= after migration | T9 leg 3 | !has('town') | NOT_PROVEN (masked by 1468-33 under MIG) | - | NEW |
| 1468-36 | AC5b locality panel visible after migration | T9 leg 3 | toBeVisible | NOT_PROVEN (masked by 1468-33 under MIG) | - | NEW |
| 1468-37 | AC5b agri-locality-name === displayName | T9 leg 3 | toHaveText('Fixtureville') | NOT_PROVEN (masked by 1468-33 under MIG) | - | NEW |
| 1468-38 | AC5b close does not resurrect locality= | T9 leg 3 | close-btn, !has('destKey') && !has('locality') | MUT-1468-MIG-RESURRECT (credited row: clearLocality re-adds locality=<destKey>) | PROVEN - T9:391 (M2@ffae1f36) | NEW |
| 1468-39 | AC5b re-drill writes destKey, no locality= | T9 leg 3 | click Fixtureville btn, destKey exact, !has('locality') | NOT_PROVEN (shared proof: the setLocality write is credited to MUT-1468-DESTKEY on 1468-10 in T8b) | - | NEW |
| 1468-40 | AC6 listing= in URL after row click | T8b step 5 | EXISTING (L155, exact id) | MUT-B3 (canon) | - | EXISTING |
| 1468-41 | AC6 agri-listing-peek visible | T8b step 5 | EXISTING | - | - | EXISTING |
| 1468-42 | AC6 stays on /discover | T8b step 5 | EXISTING (L152) | - | - | EXISTING |
| 1468-43 | AC6 agri-listing-peek-close visible | T8b step 7 | EXISTING (clicked; click fails if absent) | - | - | EXISTING |
| 1468-44 | AC6 agri-listing-peek-view-details visible | T8b step 6 | EXISTING (clicked) | - | - | EXISTING |
| 1468-45 | AC6 listing= removed after peek close | T8b step 7 | !has('listing') (new) | NOT_PROVEN (shared proof: AC6 credited to MUT-1468-PEEK on 1468-46) | - | NEW |
| 1468-46 | AC6 destKey preserved after peek close | T8b step 7 | destKey exact (new; today only maxKm) | MUT-1468-PEEK (credited row) | NOT_PROVEN - T8b failed first at :226 (EXISTING row 1468-49, locality panel visible after peek close, renders from destKey) so :234 was never reached (M6@a22c9a6e) | NEW |
| 1468-47 | AC6 region+maxKm preserved after peek close | T8b step 7 | region==='SW' (new), maxKm==='50' (EXISTING L181) | NOT_PROVEN (shared proof, as 1468-45) | - | NEW |
| 1468-48 | AC6 peek count 0 after close | T8b step 7 | EXISTING (L177) | - | - | EXISTING |
| 1468-49 | AC6 locality panel visible after close | T8b step 7 | EXISTING (L178) | - | - | EXISTING |
| 1468-51 | AC7 anon agri-listing-peek-price count 0 | T8c (asserted FIRST, before 1468-50, so the two anon mutations fail on different lines) | toHaveCount(0) | MUT-1468-ANON-PRICE (credited row: anon peek renders a price string under agri-listing-peek-price) | PROVEN - T8c:288 (M1@1ffad991) | NEW |
| 1468-50 | AC7 anon peek price-signin visible | NEW T8c [canonical-anon] | goto agri-first region=SW&maxKm=50&destKey=Fixtureville key, row click, peek visible; after 1468-51, 'agri-listing-peek-price-signin' visible; anon proof = 'Sign in' header link visible | MUT-1468-ANON (credited row: showSignInForPrice forced false, priceStr still null, so 1468-51 stays green and 1468-50 fails) | PROVEN - T8c:289 (M2@ffae1f36) | NEW |
| 1468-52 | AC8 area-first: agri-group-locality-panel count 0 | panel-exclusivity T18 bare-city row | toHaveCount(0) | NEGATIVE; discrimination by pair: same testid PRESENT in T8b (containment rule); no mutation (would require mounting agri panel in area-first) - disclosed NOT_PROVEN mutation | - | NEW |
| 1468-53 | AC8 area-first: agri-listing-peek count 0 | T18 bare-city row | toHaveCount(0) | same pair (T8b) | - | NEW |
| 1468-54 | AC8 area-first: agri-group-selected-panel count 0 | T18 bare-city row | toHaveCount(0) | same pair (T8b) | - | NEW |
| 1468-55 | AC9 REAL_SEED town row 'Padubidri' | - | - | - | - | RETAIN: canonical fixture has no Udupi S-direction agri row or Padubidri listing (seeds outside scope); behaviour covered by T8/T8b town rows. |
| 1468-56 | AC9 REAL_SEED town row 'Shirva' | - | - | - | - | RETAIN: no Shirva agri row in the canonical fixture; behaviour covered by T8b (Fixtureville). |
| 1468-57 | AC9 real Shirva click -> destKey, no locality= | - | - | - | - | RETAIN: needs the absent Shirva row; destKey behaviour covered by T8b step 4. |
| 1468-58 | AC9 real locality panel mounts | - | - | - | - | RETAIN: needs the absent Shirva row; panel mount covered by T8b step 4. |
| 1468-59 | AC9 real listing rows >=1 (==3 if 3) | - | - | - | - | RETAIN: needs the 3 absent Shirva listings; row rendering covered by T8b (2 Fixtureville rows). |

## `e2e/discover/issue-1956-pr6-no-blank-panel.spec.ts`

Canonical host: T10b arms A and B (anon). Plan note: NEW T10b [canonical-anon] in e2e/canonical/anon-discover-teaser.canonical.ts (describe 'T10b - anon legacy deep links ...', arms A-C); consoleGuard auto fixture provides the pageerror/console oracle

| Row | Legacy assertion | Canonical test | How asserted | Mutation (credited id or NOT_PROVEN reason) | Mutation result | Status |
|---|---|---|---|---|---|---|
| 1956-01 | T1 journey-less groupId: discover-right-panel visible | - | - | - | - | SUPERSEDED: U1 - URL now resolves to the canonical area-first root (area.ts:250-257, DiscoverPanelSurface.tsx:78). Replaced by 1956-01r |
| 1956-01r | (replacement) journey-less unknown groupId renders a non-blank primary surface | T10b arm A goto /discover?city=bangalore&groupId=no-such-group-2860 | exactly-one-surface (discover-areas-journey-panel-shell visible; discover-right-panel, area-group-focus-panel, discover-schools-journey-panel-shell count 0) + real Direction label 'South-East Bangalore' visible + SETTLED recount after the content (all four surfaces total exactly 1 on 5 consecutive samples 500 ms apart) | MUT-1956-BLANK-A (credited row: AreaFirstJourneyPanel renders an empty shell ONLY when the URL carries groupId - cannot reach arm B); supplementary MUT-CODEX-F2 (delayed second surface) | PROVEN - T10b arm A:135 (M1@1ffad991); settled exclusivity PROVEN - T10b arm A:144 (CODEX-F2@9c0b4b25) | NEW |
| 1956-02 | T1 empty-state-description visible and non-empty | - | - | - | - | SUPERSEDED (placeholder unreachable for this URL; see D2) |
| 1956-03 | T1 text 'Choose a neighbourhood group' | - | - | - | - | SUPERSEDED (D2) |
| 1956-04 | T1 text 'Explore by neighbourhood' | - | - | - | - | SUPERSEDED (D2) |
| 1956-05 | T1 zero uncaught pageerrors | T10b arm A | consoleGuard R-PE (auto, fails the test on any pageerror) | MUT-1956-PE-A (credited row: async setTimeout throw with unique message 'MUT-1956-PE-A' only when groupId resolves to no group, in useDiscoverAreaGroupsController; evidence must show the guard entry text carrying that tag) | PROVEN - T10b arm A guard teardown, entry '[pageerror] MUT-1956-PE-A unresolved groupId no-such-group-2860' (M3@24ba1035) | NEW (guard EXISTING; this URL newly loaded) |
| 1956-06 | T2 journey=area-first no areaKey: discover-right-panel count 0 | T10b arm B goto ?city=bangalore&journey=area-first (NO groupId) | toHaveCount(0) + SETTLED recount after the 'South-East Bangalore' content (all four surfaces total exactly 1 on 5 consecutive samples 500 ms apart) | MUT-1956-ROOT-B (credited row: DiscoverPanelSurface routes explicit journey=area-first with no areaKey/groupId to LegacyRightPanelBridge - reaches only arm B's URL); supplementary MUT-CODEX-F2 | PROVEN - T10b arm B:143 (M2@ffae1f36); settled exclusivity PROVEN - T10b arm B:144 (CODEX-F2@9c0b4b25) | NEW |
| 1956-07 | T2 canonical root visible | T10b arm B | 'discover-areas-journey-panel-shell' visible (inner 'areas-journey-panel' testid only if implementer confirms it in source) | NOT_PROVEN (shared proof: arm B routing credited to MUT-1956-ROOT-B on 1956-06) | - | NEW |
| 1956-08 | T2 root non-blank content | T10b arm B | real Direction label visible (stronger than textContent length>0) | NOT_PROVEN (shared proof, as 1956-07; MUT-1956-BLANK-A is groupId-conditioned and is NOT credited to arm B) | - | NEW |
| 1956-09 | T2 zero pageerrors | T10b arm B | consoleGuard R-PE | MUT-1956-PE-B (credited row: async throw tagged 'MUT-1956-PE-B' only when journey=area-first is explicit and the URL has no groupId/areaKey; separate from PE-A so arm A cannot be its trigger). Harness-wide wiring evidence MUT-A1/A2 (#2822) is shared and NOT counted as route proof | PROVEN - T10b arm B guard teardown, entry '[pageerror] MUT-1956-PE-B explicit area-first root' (M4@69d5c560) | NEW |

## `e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts`

Canonical host: T7b (user). Plan note: NEW T7b [role:user] in e2e/canonical/discover-school-first.canonical.ts; school = '[E2E] Koramangala Fixture Public School' (canonical seed) replacing Bethany (not in chain)

| Row | Legacy assertion | Canonical test | How asserted | Mutation (credited id or NOT_PROVEN reason) | Mutation result | Status |
|---|---|---|---|---|---|---|
| 2205-01 | school-first+groupId=south-premium mounts schools panel | T7b | 'discover-schools-journey-panel-shell' visible; areas shell count 0 | NOT_PROVEN (precondition) | - | NEW |
| 2205-02 | groupId === south-premium on load | T7b | searchParams exact | - (precondition, not a product line) | - | NEW |
| 2205-03 | journey === school-first | T7b | exact | - | - | NEW |
| 2205-04 | schoolId null on load | T7b | toBeNull | - | - | NEW |
| 2205-05 | school-search-input visible | T7b | ORDER: (1) expect input visible; (2) ARM `const searchResp = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/api/public/schools/search') && r.request().method()==='GET' && /koramangala fixture/i.test(decodeURIComponent(new URL(r.url()).search)))` (implementer confirms the query param name in source and narrows the predicate to it); (3) fill 'Koramangala Fixture'; (4) `expect((await searchResp).ok()).toBe(true)`; (5) then 2205-06 | NOT_PROVEN (precondition) | - | NEW |
| 2205-06 | school-card visible | T7b | after the awaited search response: school-card filtered by '[E2E] Koramangala Fixture Public School' visible | NOT_PROVEN (fixture-data precondition) | - | NEW |
| 2205-07 | after select: groupId null (same atomic write) | T7b | toHaveURL predicate schoolId!=null && groupId==null + URL-transition oracle (init-script history pushState/replaceState/popstate recorder + main-frame framenavigated, armed before goto, read after the select settles): no recorded URL holds schoolId AND groupId; recorder non-vacuity (stale-group URL and the select write both recorded) | MUT-2205-SEL (credited row: setSchoolJourney stops deleting groupId, school.ts:232); supplementary MUT-CODEX-F1 (two writes: schoolId first keeping groupId, groupId deleted 100 ms later) | PROVEN - T7b:165 (M1@1ffad991); atomicity PROVEN - T7b:224 (CODEX-F1@9c0b4b25; the final-URL predicate passed under F1) | NEW |
| 2205-08 | after select: journey school-first | T7b | exact | NOT_PROVEN (shared proof: select write credited to MUT-2205-SEL) | - | NEW |
| 2205-09 | after select: schoolId set | T7b | not null | NOT_PROVEN (shared proof, as 2205-08) | - | NEW |
| 2205-10 | after select: areaKey === 'IN\|KA\|Bengaluru\|Koramangala' | T7b | exact (DEV RUN 37a019cf: passed - the school payload carries the Koramangala areaKey) | NOT_PROVEN (fixture/payload-derived) | - | NEW |
| 2205-11 | school-summary-band visible | T7b | toBeVisible | NOT_PROVEN (shared proof, as 2205-08) | - | NEW |
| 2205-12 | change-school-btn visible | T7b | toBeVisible then click | NOT_PROVEN (precondition) | - | NEW |
| 2205-13 | after clear: groupId null (never resurrected) | T7b | toBeNull | MUT-2205-CLR (credited row: the change-school clear path re-sets groupId=south-premium) | PROVEN - T7b:181 (M2@ffae1f36) | NEW |
| 2205-14 | after clear: schoolId null | T7b | toBeNull | NOT_PROVEN (shared proof: clear path credited to MUT-2205-CLR; same-test no-op variant dropped) | - | NEW |
| 2205-15 | after clear: journey school-first | T7b | exact | NOT_PROVEN (shared proof, as 2205-14) | - | NEW |
| 2205-16 | zero /api/discover/markers requests across the sequence | - | - | - | - | SUPERSEDED (D3): school-first marker scope is city (markerScope.ts:161,173) so a city markers request is EXPECTED. Replaced by 2205-16r |
| 2205-16r | (replacement) CONDITIONAL GUARD ONLY: if a markers request fires while the stale groupId is in the URL, it is not group-scoped. No such request was observed, so nothing is proven | T7b | page.on('request') collector installed before goto and snapshotted only after the select settles (post-select URL + summary band), so it spans every URL write of the select transition: every /api/discover/markers request in that window has no areaKeys=, no south-premium member key (Koramangala/Jayanagar/HSR Layout) in any areaKeys=/nodeKey= value, no nodeKey= and no groupId=; no markers request in the whole test carries groupId; counts attached as 'T7b-markers-requests' / 'T7b-markers-requests-total' annotations. School-first is city scope in the reader too (markerScope.ts:161,173), so MUT-CODEX-F1 cannot make these red either. The '>= 1 observed' non-vacuity line was DROPPED: the DEV RUN observed ZERO pre-select markers requests | NOT_PROVEN (MUT-2205-SCOPE cannot be credited: no markers request fires in the pre-select window at base, so a group-scoped request has nothing to scope; the scope assertions are a guard that is vacuous at base) | - | NEW |
| 2205-17 | no console errors (503 prefix filtered) | T7b | consoleGuard (stricter: no 503 filter needed, Bangalore agri seeded) | covered by harness MUT-A1/A2 (canon) | - | NEW (guard EXISTING) |

## `e2e/issue-1065-final.spec.ts`

Canonical host: T25 (user), T10b arm C (anon). Plan note: NEW T25 [role:user] in e2e/canonical/discover-area-first.canonical.ts (J01) + T10b arm C [canonical-anon]

| Row | Legacy assertion | Canonical test | How asserted | Mutation (credited id or NOT_PROVEN reason) | Mutation result | Status |
|---|---|---|---|---|---|---|
| 1065-01 | T1 discover-right-panel visible on area-first areaKey= URL | T25 | exactly-one of the 4 primary surfaces AND discover-areas-journey-panel-shell visible (DEV RUN 37a019cf: the canonical areas shell mounts, at the Udupi city root) + SETTLED recount after the status-pill content (all four surfaces total exactly 1 on 5 consecutive samples 500 ms apart) | NOT_PROVEN (surface identity; no product line to break without breaking the whole route); supplementary MUT-CODEX-F2 for exclusivity | settled exclusivity PROVEN - T25:329 (CODEX-F2@9c0b4b25) | SUPERSEDED (D4: legacy right-panel testid -> canonical areas shell, confirmed on the DEV RUN) |
| 1065-02 | T1 listing-card count > 0 | T25 (listing source only) | the selected-area status pill 'N verified properties in Manipal' visible with N >= 4 (the same areaResultSummaryText the area panel renders; asserted after the 1065-01 shell lines). The CARD render itself is NOT asserted: on the DEV RUN no listing card renders - the panel stays on the Udupi city root while the map is in the Manipal selected-area state | MUT-1065-CARDS (credited row; proves the listing-source line only, not a card render) | PROVEN for the status-pill count line only - T25:317 (M2@ffae1f36; same line text, now T25:307 after fix cycle 2); NOT a card-render proof | RETAIN (D8 ruled: potential product defect, post-Friday verification) - legacy areaKey= on explicit journey=area-first no longer opens the area leaf/cards - map/panel scope split; owner ruled 2026-10-21: potential product defect, not confirmed obsolete |
| 1065-03 | T1 .leaflet-marker-icon count > 0 | - (not asserted since fix cycle 2) | - (the markers-response waiter and the .leaflet-marker-icon count line were removed from T25; the listing-marker reading stays under D8) | MUT-1065-MARKERS executed in M1 (T25 waiter :282/:301 at 1ffad991) but NO LONGER CREDITED: the row is RETAIN | - | RETAIN: markers fetch depends on live map zoom, which this zoom=14 deep link does not hold deterministically (DEV RUN 2, M5) - possible #1065 'mapZoom sync from URL' product defect; D9 ruled: fixed by #2882 (merge 09c3bc59), follow-up #2884; RETAIN (D8 ruled: potential product defect, post-Friday verification) |
| 1065-04 | T1 no critical console errors (404/401/Network filtered) | T25 | consoleGuard (stricter; no filters) | harness MUT-A1/A2 | - | NEW (guard EXISTING) |
| 1065-05 | T2 no auth cookie before navigation | - | - | - | - | SUPERSEDED (D4): Supabase session lives in localStorage, not cookies - the cookie check is vacuous. Replaced by 1065-05r |
| 1065-05r | (replacement) anon areaKey= URL is not gated | T10b arm C goto /discover?city=udupi&zoom=14&areaKey=IN\|KA\|Udupi\|Manipal | not.toHaveURL(/\/auth/) + 'Sign in' header link visible (genuine anon, T10 pattern) + primary surface visible | MUT-1065-ANON (credited row: anon sent to /auth ONLY for the arm-C URL shape; applied as a ProtectedRoute wrapper on the /discover route element because /discover is not ProtectedRoute-wrapped, so a routeAccess.ts edit alone redirects nothing) | PROVEN - T10b arm C:153, the Sign-in/anon line of the 1065-05r block (page was on /auth; the /discover-URL line :154 masked) (M5@e2aa2302) | NEW |
| 1065-06 | T2 discover-right-panel visible | T10b arm C | exactly-one of the 4 primary surfaces AND discover-areas-journey-panel-shell visible AND the shell toContainText 'Manipal' (seeded #2581 Udupi navigation: 'Manipal Direction' card at the root or the 'Manipal' leaf; added fix cycle 1, first observed on DEV RUN 2) (DEV RUN: canonical areas shell; journey virtual-defaults to area-first because Udupi resolves a hierarchy) + SETTLED recount after the 'Manipal' content (all four surfaces total exactly 1 on 5 consecutive samples 500 ms apart) | NOT_PROVEN (shared proof: arm C credited to MUT-1065-ANON on 1065-05r); supplementary MUT-CODEX-F2 for exclusivity | settled exclusivity PROVEN - T10b arm C:144 (CODEX-F2@9c0b4b25) | SUPERSEDED (D4: legacy right-panel testid -> canonical areas shell, confirmed on the DEV RUN) |
| 1065-07 | T2 still no auth cookie after | - | - | - | - | SUPERSEDED (D4): covered by replacement row 1065-05r (Sign-in link still visible after settle) |

## First-run observations (DEV RUN)

DEV RUN 1 (not gate evidence): `npm run test:e2e:gate` from the worktree at 37a019cf, ports 5376/8376, exit 1;
58 collected, 56 expected/passed, 2 unexpected (T25, T7b); console guard clean on every #2860 test (no entries).
Evidence: `.claude/handoffs/issue-2860/evidence/dev-run-1/` (results.json, run.log, backend.log) and `dev-run-1.log`.

- Passed first time: T8b (all new steps incl. exact destKey, Level-3 `areaKey`, cold load, close), T9 leg 3, T8c,
  T18 bare-city row, T10b arms A/B/C.
- Udupi first paint (1065-01/06): the canonical `discover-areas-journey-panel-shell`, exactly one surface, for both
  the authed explicit area-first URL (T25) and the anon journey-less URL (T10b arm C); no 4xx/pageerror.
- T25 failed on the listing-marker line: the map draws only the Direction area markers and the panel stays on the
  Udupi city root; no listing cards. T25 was rewritten to the observed outcome (D8, rows 1065-02/03 above).
- T7b failed only on its '>= 1 pre-select markers request' non-vacuity line (zero observed); every URL assertion
  (select drops groupId, payload areaKey, Change school clears schoolId without resurrecting groupId) passed.
  The line was dropped per the plan and 2205-16r is NOT_PROVEN.
- The rewritten T25 and the trimmed T7b (8a155464) have since run inside the mutation runs (see the tally above);
  those are mutation runs, not gate evidence - the final gate runs confirm them.
- Fix cycle 2 removed T25's markers lines (1065-03 RETAIN, D9). The post-fix-2 T25 then passed in both final
  canonical gate runs at b2c5250e (58/58 each, identical title sets; see "Final-head gate results" above).
