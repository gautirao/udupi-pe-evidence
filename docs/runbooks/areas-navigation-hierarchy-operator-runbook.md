# Runbook — Areas Navigation-Hierarchy Operator Flow (#1955 Areas PR A)

> Operator walkthrough for taking a city from raw canonical geography to a
> live, publicly-served Areas navigation hierarchy (region -> cluster(s) ->
> area), using the existing #1911 city-launch admin workflow plus the #1955
> navigation-hierarchy machinery layered on top of it. Every step below cites
> the real endpoint/UI action it drives and the test that already exercises
> it — this documents shipped, tested behaviour, not a proposal.
>
> **Listings are never a required input.** The hierarchy is generated purely
> from canonical geography (`sandbox_areas`, `sandbox_city_regions`,
> `city_region_policy`) — see "Listing independence" below. Marked **EXISTING**
> = reused #1911 city-launch machinery; **NEW** = introduced by #1955.

## 0. Prerequisites — dataset & geography validation

Before you touch the admin UI, the target city needs:

1. Canonical geography rows already onboarded (`public.areas`,
   `public.city_regions`, etc. — the #1911 onboarding pipeline, out of scope
   here) that `CanonicalGeographyReader` (EXISTING,
   `backend/.../citylaunch/CanonicalGeographyReader.java`) can read.
2. A `city_region_policy` row for the city if you want a navigation tree
   generated at all. This is **NEW** (#1955, V121) and read verbatim (never
   hardcoded) by `NavigationPolicyReader.findPolicy(cityId)`
   (`backend/.../navigation/NavigationPolicyReader.java`) — knobs:
   `max_direct_children`, `min_areas_per_cluster`, `max_safety_depth`,
   `one_child_prevention`, plus `compactness_threshold` /
   `separation_threshold` (folded into the policy fingerprint but not yet
   consulted by the GEOMETRIC_BISECTION splitter — a documented, intentional
   gap), `partition_method`, `representative_selection`, `outlier_rule`,
   `centre_treatment`.
3. **No policy row = no failure.** `CityLaunchGraphWriter` treats a missing
   `city_region_policy` row as a genuine no-op for the navigation-tree stage
   (logs and continues) rather than failing the six-table geography prep —
   proved by `CityLaunchPrepareNavigationWiringIT` (`AC5: a city WITH a
   city_region_policy row generates a real navigation tree during ...`,
   `backend/src/test/java/.../citylaunch/CityLaunchPrepareNavigationWiringIT.java:175`).
   If you expected a tree and got none, check the policy row first.

## 1. Prepare a city revision (EXISTING, #1911)

`POST /api/admin/city-launch/cities/{cityId}/prepare` (`@IsAdmin`, 202
Accepted, no request body — `created_by` derives only from the JWT
principal) — `AdminCityLaunchController.prepare`
(`backend/.../citylaunch/AdminCityLaunchController.java:53`). Admits a new
`PREPARING` `CityLaunchRevision` synchronously, then kicks the background
graph write from an `afterCommit` callback.

Poll `GET /api/admin/city-launch/cities/{cityId}/prepare` for progress
(`AdminCityLaunchController.getProgress`) until `lifecycle_status` reaches
`PREPARED` (or `FAILED`).

To re-run an already in-flight (`PREPARED`/`VALIDATED`) revision instead of
starting fresh:
`POST /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/rerun`
(202, atomically supersedes then re-admits — `AdminCityLaunchController.rerun`).

## 2. Generate the recursive hierarchy (NEW, #1955 — folded into step 1)

There is **no separate "generate" admin action**. `CityLaunchGraphWriter`
(EXISTING skeleton, #1911; NEW navigation stage, #1955) writes the six
sandbox geography tables (areas -> aliases -> city_regions -> memberships ->
area_groups -> group_members) and then, if `city_region_policy` exists for
the city, calls
`NavigationTreeGenerationService.generateAndStoreForRevision(revisionId,
cityId, Instant.now())` (`backend/.../navigation/NavigationTreeGenerationService.java`)
**inside the same prepare transaction**, before the checksum anchor is
computed — so a `PREPARED` revision's `persisted_revision_checksum` already
covers `sandbox_navigation_nodes`
(`backend/.../citylaunch/CityLaunchGraphWriter.java:218-255`).

**Listing independence** (do not skip this if you're worried listings are
needed): `EndToEndNavigationPipelineIT` proves the SAME geography input
generates an IDENTICAL tree with or without listings present
(`@DisplayName("listing independence (generation input): the SAME geography
generates an IDENTICAL ..."`, line 350) and that listings inserted AFTER
promotion change only display-time counts, never tree structure
(`@DisplayName("listing independence (display-time): listings inserted
AFTER promotion change ..."`, line 405).

## 3. Review the blocking validation report (13 invariants)

The generator's output is checked by `NavigationTreeValidationService`
(`backend/.../navigation/NavigationTreeValidationService.java`) against 13
invariants, each with a dedicated `NavigationTreeValidationServiceTest`
case (`backend/src/test/java/.../navigation/NavigationTreeValidationServiceTest.java`):

1. cycle in the parent chain
2. orphan node (`parent_node_key` not present)
3a. invalid depth (child depth != parent depth + 1)
3b. cross-scope (revision/city) parentage
4. one-child cluster
5a. duplicate `AREA` leaf (same `area_key` twice)
5b. missing `AREA` leaf for an expected canonical area
6. an area used as representative of two unrelated clusters
7. representative area not a descendant member of its own cluster
8a. duplicate sibling `node_key`
8b. invalid sibling ordering (not gapless 1..n)
9. incorrect structural `descendant_area_count`
10. missing required bounds
11. max-depth violation
12. orphaned/conflicting overrides (RELABEL / EXCLUDE_AREA / REASSIGN_AREA_REGION
    / MOVE_AREA / SET_REPRESENTATIVES each checked — several sub-cases per kind)
13. direct-search vs guided-navigation ancestry mismatch

You see this report live via the admin "Hierarchy tree" tab (step 4) — its
`status` field is `VALID`/`INVALID` and `errors` is a list of
`CODE: message` strings, sourced from `getPreviewTree`'s
`validationService.validate(...)` call
(`backend/.../citylaunch/CityLaunchNavigationOverrideService.java:106-131`).

## 4. Launch the preview UI (NEW, #1955 — 4 tabs)

Navigate to `/admin/city-launch/:cityId/preview/:revisionId`
(`src/App.tsx:382`, `src/pages/admin/CityLaunchPreview.tsx`). Four tabs:

- **Buyer preview** (`value="map"`, EXISTING #1911 PR3) — the real Discover
  buyer surface rendered against the revision's sandbox geography, via the
  `/preview/{regions,areas,markers,listings,area-groups}` endpoints on
  `AdminCityLaunchPreviewController`
  (`backend/.../citylaunch/AdminCityLaunchPreviewController.java`), all
  `Cache-Control: no-store`.
- **Hierarchy tree** (`value="hierarchy"`, NEW) — `GET .../navigation/tree`
  on `AdminCityLaunchNavigationOverrideController.getTree`
  (`backend/.../citylaunch/AdminCityLaunchNavigationOverrideController.java:44`),
  rendering `NavigationPreviewTreeResponse` (nodes + bounds
  `centreLat/Lon`, `minLat/Lon`, `maxLat/Lon` + counts) plus the validation
  status from step 3. Wire shape (flat array, not nested) proved by
  `AdminCityLaunchNavigationOverrideControllerTest.getTree_wireShape_isFlatNotNestedRootChildren`
  (line 110).
- **Diff** (`value="diff"`, NEW) — `GET .../navigation/diff?against=BASE|PREVIOUS_REVISION`
  (`AdminCityLaunchNavigationOverrideController.getDiff`, line 53), added/
  removed node keys, moved/relabeled nodes, representative changes. Wire
  shape proved by
  `AdminCityLaunchNavigationOverrideControllerTest.getDiff_wireShape_addedRemovedAsNodeKeyStrings_fingerprintNullable`
  (line 153).
- **Overrides** (`value="overrides"`, NEW) — `GET .../navigation/overrides`
  (list) + the mutating routes covered in step 5. The panel is editable
  only when `validation?.lifecycleStatus === 'PREPARED'`
  (`src/pages/admin/CityLaunchPreview.tsx:85`, `overridesEditable`) —
  matches the backend's own PREPARED-only guard (step 5).

## 5. Guided + direct-search review

Cross-check the tree two ways before trusting it:

- **Guided navigation**: walk the "Hierarchy tree" tab from root down.
- **Direct search**: resolve a specific area's ancestry path and confirm it
  matches the guided walk for the same area. This exact equivalence is
  invariant #13 above, and is proved end-to-end (not just in the unit
  validator) by `EndToEndNavigationPipelineIT`'s
  `@DisplayName("ancestry equivalence: GET .../areas/{areaKey}/navigation-path
  ancestry matches ..."` case (line 445), which hits the same public
  endpoint referenced in step 9.

## 6. Apply controlled overrides (NEW, #1955)

On a **PREPARED** revision only (see the 409 guard below), from the
"Overrides" tab:

`POST /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/navigation/overrides`
(`AdminCityLaunchNavigationOverrideController.createOverride`, line 79) —
one of five kinds (`OverrideKind`,
`backend/.../navigation/OverrideKind.java`), each with a required request
shape enforced by `CityLaunchNavigationOverrideService.validateShape`
(`backend/.../citylaunch/CityLaunchNavigationOverrideService.java:357-378`):

| Kind | Required fields |
|---|---|
| `EXCLUDE_AREA` | `subjectAreaKey` only |
| `REASSIGN_AREA_REGION` | `subjectAreaKey` + `targetRegionKey` |
| `MOVE_AREA` | `subjectAreaKey` + `targetNodeKey` |
| `RELABEL` | `subjectNodeKey` + `newLabel` |
| `SET_REPRESENTATIVES` | `subjectNodeKey` + `newRepresentativeAreaKeys` |

`DELETE .../navigation/overrides/{overrideId}` removes one
(`deleteOverride`, line 94; 404 if not found on this revision).

Every mutation is **one transaction**: override row write, tree
regeneration (`generationService.generateAndStoreForRevision`), and
`persisted_revision_checksum` re-stamp all commit or roll back together —
proved by `CityLaunchNavigationOverrideServiceIT`'s `@DisplayName("POST
override regenerates the tree and re-stamps persisted_revision_checksum,
one transaction")` (line 292).

**PREPARED-only guard (409 otherwise)**: `requirePreparedRevisionForUpdate`
(`CityLaunchNavigationOverrideService.java:332`) rejects any mutation on a
non-PREPARED revision with `409 CONFLICT` — proved by
`CityLaunchNavigationOverrideServiceIT`'s `@DisplayName("override mutation on
a non-PREPARED revision is 409 (ResponseStatusException CONFLICT)")`
(line 313) and, at the wire layer, by
`AdminCityLaunchNavigationOverrideControllerTest.createOverride_nonPreparedRevision_returns409`
(line 224).

**Duplicate override (409)**: a second override of the same
`(subject, kind)` on the same revision is rejected — proved by
`CityLaunchNavigationOverrideServiceIT`'s `"a duplicate (area, kind)
override POST is 409 CONFLICT"` (line 328) and
`AdminCityLaunchNavigationOverrideControllerTest.createOverride_duplicate_returns409`
(line 208).

**Blocking 422 on invalid**: an override that would break one of the 13
invariants rolls back entirely — nothing is persisted, not even the
override row — proved at the service layer by two targeted cases:
`"MOVE_AREA that leaves the source cluster with exactly one child is
BLOCKING (invariant #4)"` (line 364) and `"MOVE_AREA of a cluster's own
representative area breaks membership -> BLOCKING (invariant #7)"`
(line 391); and at the wire layer by
`AdminCityLaunchNavigationOverrideControllerTest.createOverride_blockingValidation_returns422WithValidationReport`
(line 239). A specific edge case worth knowing: two `MOVE_AREA` overrides
that between them drain a 2-leaf `CLUSTER` to zero leaves is a controlled
`422`, not a `500` — proved by `CityLaunchNavigationOverrideServiceIT`'s
`"two MOVE_AREA overrides draining a 2-leaf CLUSTER to zero leaves is
BLOCKING (422), not a 500 (B1)"` (line 412).

**Determinism**: identical geography + policy + overrides regenerate to an
identical tree/checksum across two runs — proved by the same IT's
`"determinism: identical geography + policy + overrides -> identical
tree/checksum across two regenerations"` (line 468).

## 7. Re-validate, then approve (mark-validated) — EXISTING #1911

After overrides settle, re-check the "Hierarchy tree" tab's validation
status (step 3) is `VALID`, then run the standard #1911 validation
checklist:

- `GET .../validation` — current checklist state
  (`AdminCityLaunchValidationController.getState`).
- `PUT .../validation/checks/{checkKey}` `{"value": bool}` — toggle one
  checklist item (`toggleCheck`).
- `POST .../validation/reset` — clear all checklist items (`reset`).
- `POST .../validation/mark-validated` — atomic `PREPARED -> VALIDATED`
  transition (`markValidated`, line 75). This is what flips
  `overridesEditable` to `false` in the preview UI (step 4) — overrides are
  frozen from here on.

## 8. Promote (EXISTING #1911, 7-table transaction + checksum gate)

`POST /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/launch`
(`AdminCityLaunchLaunchController.launch`,
`backend/.../citylaunch/AdminCityLaunchLaunchController.java:43`; the UI's
`confirmCityName` body field is a client-side type-to-confirm guard only —
never read server-side). One `@Transactional` in
`CityLaunchPromotionService.launch`:

1. Guarded CAS `VALIDATED -> PROMOTING`.
2. Recompute the checksum from `sandbox_*` (now including
   `sandbox_navigation_nodes` + overrides) and compare to
   `persisted_revision_checksum` — mismatch = `422`, zero writes.
3. Compare-before-write copy of **seven** production tables (the original
   six geography tables plus `navigation_nodes`), locked `FOR UPDATE`
   ascending by natural key.
4. Final CAS `PROMOTING -> PROMOTED` + `promoted_at` +
   `applied_revision_checksum`.
5. Activate the city (`is_active` `false -> true` only).

The seventh-table (navigation) promotion is proved by
`CityLaunchPromotionServiceIT`'s `"seventhTablePromotion: a sandbox nav tree
(1 CLUSTER root + 2 AREA leaves) promotes ..."` (line 826), its rollback
counterpart `"seventhTableFailureRollsBackAllSeven: an FK-violating nav row
... "` (line 885), and re-launch replacing a prior tree via
`"relaunchReplacesPriorNavigationTree: a second VALIDATED revision for the
SAME city, ..."` (line 940). The general promotion contract (checksum gate,
non-`VALIDATED` 409, tamper-rejection, concurrent-launch safety,
idempotent-noop re-launch) is the same machinery #1911's runbook
(`docs/runbooks/city-launch-promotion.md`) already documents — see that
file for the full stuck-`PROMOTING` recovery procedure, which applies
unchanged here.

## 9. Verify the active revision

```sql
SELECT lifecycle_status, promoted_at
FROM city_launch_revision
WHERE id = :revisionId AND city_id = :cityId;

SELECT is_active FROM cities WHERE id = :cityId;
```

Expect `lifecycle_status = 'PROMOTED'`, non-null `promoted_at`,
`is_active = true`.

## 10. Cache warm/refresh + readiness verification (NEW, #1955)

A genuine (non-idempotent-noop) promotion publishes `CityNavigationRevisionPromoted`
(`backend/.../navigation/CityNavigationRevisionPromoted.java`) **AFTER_COMMIT**
on the promotion transaction. `NavigationGraphRefreshListener`
(`backend/.../navigation/NavigationGraphRefreshListener.java`) consumes it
`@Async` and runs load -> validate -> build -> atomic pointer swap -> grace
period -> evict old entry against `NavigationGraphCache`. Proved by
`NavigationGraphCacheLifecycleIT`'s:

- `"refresh: a successful load atomically swaps the pointer to the new
  revision, ..."` (line 212)
- `"refresh: a failed load/validate for the new revision throws AND leaves
  the OLD ..."` (line 183) — a failed refresh **keeps serving the old
  graph**, never blanks the city.
- `"refresh listener: given a CityNavigationRevisionPromoted event, resolves
  the ..."` (line 275)

**Startup readiness**: `NavigationHierarchyReadinessHealthIndicator` +
`NavigationCachePreloadRunner` eagerly warm every public-active city's graph
at boot; `preloadTimeoutSeconds` (default 60s,
`discover.navigation.cache.preload-timeout-seconds`) bounds how long the
health indicator reports NOT-READY before degrading to lazy-load-on-first-
request — proved by `NavigationHierarchyReadinessStateTest`'s
`startsLoading_thenMarkReadyTransitionsToReady`,
`neverMarkedReady_degradesToLazyOncePreloadTimeoutElapses`, and
`onceReady_stableEvenPastTheTimeout` (`backend/.../navigation/NavigationHierarchyReadinessStateTest.java`),
and preload-vs-preview-namespace isolation is proved by
`NavigationGraphCacheLifecycleIT`'s `"preload: loads a public-active
PROMOTED city, skips a disabled city and a ..."` (line 132) and `"preview
isolation: a preview-namespace load never appears via getActiveGraph and
..."` (line 297).

**Safety poll**: every `pollIntervalSeconds` (default 45s,
`discover.navigation.cache.poll-interval-seconds`),
`NavigationHierarchySafetyPoller` re-checks the DB's authoritative
`PROMOTED` revision per public-active city against the cache's pointer and
repairs drift (a missed event, or a second instance that hasn't processed
it yet) — an unchanged revision is a true no-op (same cached graph
instance), proved by `NavigationGraphCacheLifecycleIT`'s `"safety poll:
unchanged revision is a true no-op (same cached graph instance); a ..."`
(line 246).

If, after promotion, the public endpoints (step 11) are still serving stale
structure past a few seconds, check application logs for the refresh
listener's outcome for this `revisionId` before assuming the promotion
itself failed — promotion and cache refresh are two separate steps (a
promoted-but-not-yet-refreshed window is expected and self-heals via the
safety poll).

## 11. Public API smoke (3 endpoints, permitAll, NEW #1955)

All served from `NavigationGraphCache`'s cached, promotion-refreshed graph —
never a live per-request DB read
(`backend/.../navigation/NavigationController.java`):

1. `GET /api/discover/cities/{city}/navigation/{nodeKey}` — structural node
   + ancestry + direct children + `nextLevelType`; `nodeKey=root` resolves
   to the city's synthetic top level; no counts in the body (AC8)
   (`getNode`, line 68).
2. `GET /api/discover/cities/{city}/areas/{areaKey}/navigation-path` — the
   `AREA` leaf + full ancestry, resolved from the same cached graph
   (`getAreaPath`, line 102).
3. `GET /api/discover/cities/{city}/navigation/{nodeKey}/counts?purpose=&propertyType=`
   — display-time counts only, backed by `AreaCountRollupService`'s
   separate short-TTL (`discover.navigation.counts.cache.ttl-seconds`,
   default 30s) revision-aware cache — deliberately decoupled from the
   structural cache above (`getCounts`, line 130).

End-to-end coverage of all three against a real prepare->promote->refresh
run: `EndToEndNavigationPipelineIT`'s `"API checkpoint: shape,
nextLevelType, bounds, dynamic counts, ancestry all present+..."` (line
496). Count-provider correctness against an independent raw query, plus
cache-key isolation across purpose/propertyType, is
`NavigationCountParityAndScaleIT`'s `"count-provider parity: ..."` (line
191) and `"cache-key isolation: sale/rent and house/apartment queries never
contaminate each ..."` (line 252).

## 12. Metrics / log evidence

There is no dedicated audit table for the navigation-hierarchy pipeline
(same convention as #1911's promotion runbook) — the durable record is the
revision row itself (`lifecycle_status`, `promoted_at`,
`applied_revision_checksum`) plus structured SLF4J log lines at each
controller/service boundary documented above (`log.info`/`log.debug` on
every admin route, `log.error` with `stageReached` on a failed graph write
in `CityLaunchGraphWriter.writeGraphAsync`). For query-cost evidence,
`NavigationCountParityAndScaleIT`'s `"EXPLAIN ANALYZE: the area-level GROUP
BY count query produces a real aggregation ..."` (line 289) and `"scale
(representative volume): area-level count query cost scales with rows
..."` (line 329) capture actual `EXPLAIN ANALYZE` plans for the counts
query path — use these as the reference shape if you need to diagnose a
slow counts response in production.

## 13. Rollback semantics

This feature follows expand/contract, not a runtime kill-switch:

- **No feature-flag property exists** to disable navigation-tree
  generation, the public endpoints, or the cache consumers independently —
  this runbook will not claim one that isn't in the code. The closest thing
  to an operator-level "off switch" for generation is the precondition
  already described in step 0.3: deleting/never-creating a city's
  `city_region_policy` row makes `CityLaunchGraphWriter` skip navigation
  generation entirely on the next prepare (a genuine no-op, not an error).
  This does not retract an already-`PROMOTED` tree.
- To roll back a bad **promotion**, follow the existing #1911 procedure:
  a promotion is one transaction, so a normal failure already rolls back to
  `VALIDATED` with zero partial writes (see
  `docs/runbooks/city-launch-promotion.md`, "Checksum mismatch / canonical
  drift"). There is no automated "un-promote" for an already-committed
  `PROMOTED` revision in this slice — re-launching a fresh, corrected
  revision (steps 1–8 again) is the supported path, matching the
  `relaunchReplacesPriorNavigationTree` behaviour proved in step 8.
- To roll back the **code/config change** itself (a bad deploy of this
  feature), a standard expand/contract revert applies: redeploy the prior
  application version. `navigation_nodes`, `sandbox_navigation_nodes`, and
  `sandbox_navigation_overrides` (Flyway V121/V122) are additive tables —
  **retain them**; do not drop them as part of a rollback. The public
  `NavigationController` routes and `NavigationGraphCache`/preload/safety-
  poller beans simply stop being invoked once the prior version is running;
  no destructive migration is needed to disable them.
- If only the **cache consumers** need to stop serving (e.g. a bad graph
  loaded), the safety poller (step 10) self-heals against the DB's
  authoritative `PROMOTED` state on its own cadence
  (`pollIntervalSeconds`) — a full redeploy/restart is not required to
  recover from cache drift, only from a genuine code defect.

## Scope note

This runbook covers the full seed-to-production operator flow for one city.
Cross-city bulk operations, and any per-city operator scoping (today every
`ROLE_ADMIN` caller can act on any city — a documented, intentional #1911
MVP decision carried forward unchanged by #1955), are out of scope.
