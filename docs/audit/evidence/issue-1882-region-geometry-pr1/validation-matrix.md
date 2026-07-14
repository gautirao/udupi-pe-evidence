# Validation Matrix — issue #1882 Track A PR1 (region/geometry foundation)

**Level:** FULL · **Branch:** `issue-1882-region-geometry-pr1` · **Base:** `origin/main @ 7e598574` · **Mode:** /mode3-run (backend-only)
**Scope:** city_region_policy/city_regions/city_region_memberships/regional_area_overrides schema + OSM provenance columns + deterministic region projection + dry-run/apply onboarding (UNIFIED/SPLIT/DEGENERATE safety gates) + PUBLIC Postgres-served region-summary endpoint + the `boundsStatus`/`missingBoundsAreaCount` additive amendment (user-correction-1).

> Evidence discipline per CLAUDE.md §11: a row is PASS only where the command exited 0 AND assertions ran. Tests executed against a real PostGIS Testcontainer (`postgis/postgis:15-3.4`); Flyway applied all migrations incl. V113.

## 1. Gate outcomes (all mandatory gates + amendment revalidation)

| Gate | Model | Verdict | Cycle |
|---|---|---|---|
| qa-fast (pre-impl risk) | — | PASS (no blocker) | 1 |
| backend-engineer (S1 migration / S2 onboarding+projection / S3 API+JwtConfig) | — | PASS (compile 0, unit 6/6) | 1 |
| qa (S4 Testcontainers ITs) | — | PASS (28/28 → 34/34 w/ unit) | 1 |
| code-reviewer (backend) | opus | APPROVE, 0 blocking | 1 |
| security-reviewer (Gate F) | — | APPROVE, 0 blocking | 1 |
| qa-verification | — | PASS | 1 |
| **Amendment** backend-engineer (boundsStatus/missingBoundsAreaCount) | — | PASS (compile 0, test-compile 0) | 1 |
| **Amendment** qa (5 new tests) | — | PASS (39/39) | 1 |
| **Amendment** code-reviewer (scoped) | opus | APPROVE, 0 blocking | 1 |
| **Amendment** security-reviewer | — | NOT TRIGGERED (no auth/endpoint/schema change) | — |
| **Amendment** qa-verification (final) | — | PASS | 1 |

No reroute used (2-cycle budget unused). 10 of 12 specialist invocations. Gate F satisfied at base; not re-triggered by the additive amendment (rework-request-user-correction-1 revalidation clause: security re-check conditional on auth-surface change).

## 2. Acceptance criteria → evidence (base AC1–AC14 + amendment AC-A1–A9)

| AC | Test / evidence | Result |
|---|---|---|
| AC1 schema expand-only, no region_reindex_job | V113CityRegionGeometryMigrationIT#createsAllFourTablesAndOsmProvenanceColumns, #migrationIsExpandOnly_noRegionReindexJob | PASS |
| AC2 policy seed slug→id idempotent, no city-name conditional | #seedsBangalorePolicyRow_cardinal8_radius8, #seedsUdupiPolicyRow_cardinal4_radius4, #policySeedIsIdempotentOnRerun + code-reviewer grep 0 matches | PASS |
| AC3 deterministic projection (CARDINAL_4/8, DIRECTIONAL_8, central rule) reusing RegionalGeo | CityRegionProjectionTest 6/6 | PASS |
| AC4/AC13 one region per eligible area, none unassigned/doubled — bangalore + udupi | CityRegionOnboardingProjectionIT#oneRegionPerEligibleArea_bangalore/_udupi, #noUnassignedEligibleArea_bangalore/_udupi, #noAreaAssignedTwice | PASS |
| AC5 dry-run categorises UNIFIED/SPLIT/DEGENERATE, no writes | CityRegionOnboardingSafetyIT#dryRunCategorisesGroupsUnifiedSplitDegenerate_noWrites | PASS |
| AC6 apply blocked for unresolved SPLIT/DEGENERATE, no silent fallback | #applyBlockedForUnresolvedSplitGroup, #applyBlockedForDegenerateGroup, #noSilentFirstMemberOrMajorityAssignment | PASS |
| AC7 fingerprint idempotency + scoped stale-AUTO delete | CityRegionOnboardingRegenerationIT#rerunUnchangedPolicyAndInputsIsZeroWriteNoOp, #policyChangeUpdatesMembershipsAndDeletesStaleAutoRows | PASS |
| AC8 OVERRIDE preserved across regen | #overrideRowForcesRegionAndSurvivesRegeneration | PASS |
| AC9 bounds=union, centre=centroid, display_order canonical not count | #regionBoundsAreUnionOfMemberBboxes, #regionCentreIsCentroidOfMemberCentroids, #displayOrderIsCanonicalPolicyOrderNotListingCount | PASS |
| AC10 @Transactional rollback, no partial rows | CityRegionOnboardingSafetyIT#validationFailureRollsBackEntireApply_noPartialRows | PASS |
| AC11 region-summary API (stable order, Postgres count, countStatus, unknown→200-empty, zero-count returned) | RegionSummaryControllerIT#returnsCanonicalRegionsInStableOrder_bangalore, #listingCountServedFromPostgresPath_countStatusOk, #unknownCitySlugReturns200EmptyNot404, #zeroCountRegionStillReturned | PASS |
| AC12 no OS/read-path change, memberships materialized | RegionSummaryControllerIT#membershipsAreMaterialized_noProjectionOnRead + reviewer confirmation | PASS |
| AC14 build + suite green | full suite 39/39 exit 0; build/test-compile exit 0 | PASS |
| Gate F auth posture PUBLIC pinned | RegionSummaryControllerSecurityIT (anon→200, auth-required→401) + security-reviewer APPROVE | PASS |
| City-agnostic invariant | code-reviewer named scan: 0 city-slug matches across 9 production files | PASS |
| AC-A2 all-valid-bbox → COMPLETE/0 + bbox union | RegionSummaryControllerIT#boundsStatusCompleteWhenAllMembersHaveCompleteBbox | PASS |
| AC-A3 one missing → APPROXIMATE/1 + centroid-in-union + membership persisted | RegionSummaryControllerIT#boundsStatusApproximateAndCountOneWhenOneMemberMissingBbox + CityRegionOnboardingProjectionIT#membershipPersistedForAreaWithMissingBbox_classificationUnaffected | PASS |
| AC-A4 multi-missing count + deterministic bounds | RegionSummaryControllerIT#missingBoundsAreaCountAndDeterministicBoundsWhenMultipleMissing | PASS |
| AC-A5 unchanged onboarding idempotent | CityRegionOnboardingRegenerationIT#rerunUnchangedPolicyAndInputsIsZeroWriteNoOp | PASS |
| AC-A6 security posture unchanged, no JwtConfig edit | RegionSummaryControllerSecurityIT green unchanged; git diff shows no amendment JwtConfig change | PASS |
| AC-A7 bangalore + udupi fixtures still pass | the _bangalore/_udupi IT methods | PASS |
| AC-A8 verbatim #1887 note | RegionSummaryService Javadoc (exact text) | PASS |
| AC-A9 read-only SQL evidence artifact | docs/audit/evidence/issue-1882-region-geometry-pr1/bounds-completeness-queries.sql (SELECT-only, prod-warning header) | PASS |

## 3. Test-run evidence (commands + exit codes)

| Command | Exit | Result |
|---|---|---|
| `mvn -f backend/pom.xml test -Dtest=CityRegionProjectionTest,V113CityRegionGeometryMigrationIT,CityRegionOnboardingProjectionIT,CityRegionOnboardingSafetyIT,CityRegionOnboardingRegenerationIT,RegionSummaryControllerIT,RegionSummaryControllerSecurityIT` | 0 | PASS — 39/39 |
| `mvn -f backend/pom.xml test -Dtest=RegionalClassificationBackfillIT,RegionalClassificationBackfillServiceTest,RegionalGeoTest,RegionalAreaGroupsSecurityIT,DiscoverSummaryServiceIT,DiscoverSummaryControllerTest,DiscoverRoutingDiTest,RoutingDiscoverSummaryServiceTest` | 1 | PASS-modulo-known-preexisting — 112/113; sole failure DiscoverSummaryServiceIT.v106Migration_isIdempotentWhenReExecuted (313 vs 314) reproduced on clean base 7e598574, unrelated to PR1 |
| `mvn -q -f backend/pom.xml compile` | 0 | PASS |
| `mvn -q -f backend/pom.xml test-compile` | 0 | PASS |

Per-class (committed suite): CityRegionProjectionTest 6/6 · V113CityRegionGeometryMigrationIT 5/5 · CityRegionOnboardingProjectionIT 9/9 · CityRegionOnboardingSafetyIT 5/5 · CityRegionOnboardingRegenerationIT 3/3 · RegionSummaryControllerIT 9/9 · RegionSummaryControllerSecurityIT 2/2.

## 4. Scope lock

`git diff --stat 7e598574` → only `backend/src/main/java/com/example/realestate/security/JwtConfig.java` (M, +2). All other PR1 paths untracked new-in-PR (V113 migration, 9 production Java, 8 test files, this evidence dir). No existing/base test modified; no forbidden glob touched; no OpenSearch/Track-B/RegionalGeo/RoutingDiscover*/DiscoverSummary* edit. E2E NOT_REQUIRED (backend-only; Testcontainers real-DB ITs are the accepted equivalent; no live smoke vs shared Supabase).

## 5. Documented follow-ups (non-blocking)

1. **[code-reviewer advisory]** `CityRegionOnboardingService.apply()` prunes stale AUTO memberships but not stale `city_regions` rows on a region-MODEL change — unreachable in PR1 (fixed seeded models, no runtime policy-mutation path). Add a scoped `city_regions` prune when a policy-admin/model-change path is introduced (Track B / later slice).
2. **[code-reviewer nit]** `CityRegionProjection.hasCompleteValidBbox` is currently referenced only via Javadoc `{@link}` (the read derivation inlines the equivalent SQL); the real drift guard is IT #2/#3 (which assert stored bounds == `COALESCE(bbox, centroid)` union). Add a truth-table unit test or drop the method in a later touch.
3. **[code-reviewer nit]** An override targeting an area outside the classified set contributes nothing to stored bounds yet is still counted "missing" if its bbox has a null corner — minor semantic nuance, self-consistent with the Javadoc contract; defer to #1887.
4. Stale-AUTO cleanup uses a `DELETE … area_key NOT IN (<placeholders>)` list — fine at current area counts (tens); batch at large scale.
5. OSM provenance columns are nullable placeholders only (ingestion deferred).

## 6. #1887 narrowing recommendation (recorded, NOT implemented here)

Per rework-request-user-correction-1: #1882 consumes existing canonical areas and their bounds; completeness of the city area catalogue and correction of missing bounds belong to **#1887**. #1887 should be narrowed to a lightweight, version-controlled area/bbox onboarding process: add missing canonical city/area records (centre + 4 bbox values); validate; generate a map preview; dry-run + idempotent apply; carry source/reviewer/fingerprint metadata; support zero-listing areas; require **no new admin screen** (a data file + validation command + generated preview suffice). This PR did NOT implement #1887 and did NOT edit the #1887 issue.

## 7. Amendment 2 — isNoOp regeneration bugfix (PR_REVIEW rework, pr-review-1)

**Defect (blocking, found at head `15d5c0d4` after a prior PR_REVIEW APPROVED_TO_MERGE):** `CityRegionOnboardingService.isNoOp()` compared only `policy_fingerprint` + the membership map, ignoring the per-area geometry (`geo_center_lat/lon`, `min/max lat/lon`) that `upsertCityRegions` derives `city_regions.centre/bounds` from. A geometry-only change (same policy + same assignments, changed bbox/centre — e.g. a future #1887 bbox correction) was misclassified as a no-op, leaving stale materialized `city_regions`.

**Fix (approach a, no schema change):** `apply()` derives the expected `city_regions` rows once (`computeExpectedRegionRows`); `isNoOp` now also compares those expected rows (new `ExpectedRegionRow` record, epsilon `1e-9`, null-aware) against the stored rows, in addition to fingerprint + membership map. `policy_fingerprint` semantics/name/Javadoc unchanged. Only `CityRegionOnboardingService.java` changed.

**Regression test (`CityRegionOnboardingRegenerationIT`, +2):**

| Scenario | Method | Result |
|---|---|---|
| bbox change → regeneration (ctid rewrite + updated max_lat); missing→complete bbox flips region-summary boundsStatus APPROXIMATE→COMPLETE + missingBoundsAreaCount 1→0 + bounds = corrected union; final unchanged re-apply = true zero-write no-op (ctid + generated_at unchanged, city-wide) | `geometryChangeRegeneratesMaterializedBoundsAndFinalUnchangedRerunIsNoOp` | PASS |
| centre-only change → centre_lat/lon regenerated, bounds unchanged (ctid rewrite) | `geometryCentreOnlyChangeRegeneratesCentreOnRerun` | PASS |

Test genuinely fails pre-fix: pre-fix `isNoOp` short-circuits → no `upsertCityRegions` → `ctid` unchanged + stale bounds = assertion failure. The final no-op assertion uses **`ctid`-unchanged** (not just `generated_at`, which is frozen under `@DataJpaTest`'s single transaction) to genuinely prove zero writes — per the code-reviewer's prescribed strengthening.

**Gates (all cleared, no reroute beyond the reviewer-prescribed cycle-2 test strengthening):** backend-engineer PASS · qa PASS (41/41) · code-reviewer (opus, scoped) APPROVE 0-must-fix · qa cycle-2 (ctid strengthening) PASS · security-reviewer NOT TRIGGERED (no auth/endpoint/schema change) · qa-verification PASS.

**Test evidence:** `mvn -f backend/pom.xml test -Dtest=<7 committed classes>` → exit 0, **41/41** (CityRegionOnboardingRegenerationIT 5). Regression subset 112/113 (sole failure = the known pre-existing v106 idempotency case on clean base `7e598574`). `test-compile` exit 0.

**Scope (uncommitted on head `15d5c0d4`, for the Main Agent to commit onto branch/PR #1889 — orchestrator did NOT commit):** `CityRegionOnboardingService.java` (M, production fix) + `CityRegionOnboardingRegenerationIT.java` (M, +2 tests + ctid strengthening). No schema/migration/auth/base-test change. Prior WORKDONE_REVIEW/PR_REVIEW verdicts are VOID once the head SHA changes.
