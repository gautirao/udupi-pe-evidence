# Slice 4 (Cluster C) — singleton classification — issue #1825

Base: branch `issue-1825-slice4-cluster-c` @ c2ee9da5 (fresh origin/main, includes Slice 2 merge PR #1831). All 4 reproduced in isolation (EXIT 1) — see repro/. Full-suite OOM constraint still applies; use batched runners.

## 1. src/lib/listingFieldConfig.test.ts — STALE TEST (test-only)
- **Failure:** `agricultural_land: unexpected extra fields: expected ['facing'] to deeply equal []` (test:45; test expects 10 fields "landArea + all 9 agri-specific", line 69).
- **Product truth:** listingFieldConfig.ts:302-305 INTENTIONALLY includes `facing` in agricultural_land visibleFields (`['landArea', ...AGRI_FIELDS, ...AGRI_FACING_FIELD]`). Extensively documented at :194-202 — "Issue #1627 — 'facing' for agricultural_land. Confirmed against [family validation]... additive to the #1458 agri field set." Deliberate, backend-validated product decision.
- **Introducing commit:** #1627 (facing added to agri config); the test's 10-field expectation predates it and was not updated.
- **Classification:** STALE-OR-INCORRECT TEST. `facing` is intended. NOT a product regression.
- **Fix (smallest surface, test-only):** update the expected list + "(10 total)" → 11, adding `'facing'`. Keep exact-equality assertion (assertExactFields) intact — do NOT weaken.

## 2. src/lib/routeAccess.test.ts — STALE/INCORRECT TEST (test-only) [assignment-flagged HIGH-RISK]
- **Failure:** test 12 (regression guard, #1633/#1741), line 94: `expect(canAccessRoute('/broker/listings/new/residential', 'user')).toBe(false)` — actual `true`.
- **Product truth:** routeAccess.ts:99-100 EXPLICITLY allows `/broker/listings/new/residential` for `user` — comment "#1719 — residential deep-link sibling of /broker/listings/new". Identical pattern to `/broker/listings/new/commercial` (#1741) and `/agricultural` (#1627), all intentional typed-listing-journey routes. **Test 11 in the SAME file (line 76) already asserts the commercial sibling → `true`.**
- **git-blame timeline (decisive):** test line 94 written in `cbc5bf8e9` (#1741, 2026-07-03 10:10); residential-allow (routeAccess.ts:100) added in `278954389` (#1719, 2026-07-03 18:00) — ~8h LATER. So residential became a legitimately-allowed route AFTER the guard was written, and the guard assertion was not updated.
- **Classification:** STALE-OR-INCORRECT TEST — a legitimately-added sibling route the guard wasn't updated for. NOT a product regression. The guard's real intent (no accidental prefix-broadening) is preserved by lines 95-96 which correctly keep `/broker/listings/new/commercial/extra` and `/broker/listings/newcommercial` → `false` (those are NOT real routes).
- **HIGH-RISK review:** default assumption (regression) was tested against evidence and REJECTED: residential is an intentional, documented, exact-match-allowed product route consistent with its commercial/agri siblings and with test 11. No authorization broadening bug exists (exact-match, not prefix-startsWith).
- **Fix (smallest surface, test-only):** change line 94 to `.toBe(true)` with a comment noting residential is an intended deep-link sibling (#1719), consistent with test 11. Do NOT touch lines 95-96 (valid anti-broadening guard). Do NOT weaken/delete the guard.

## 3. src/lib/map/areaMarkerBucketing.test.ts — STALE COUNT (test-only) — RUNTIME-CONFIRMED
- **Failure:** test "30-tight-core" (16-30 band), line 207: `expect(result.representatives.length).toBeGreaterThanOrEqual(10)` — actual `8` (band 10-12 expected).
- **Product truth / timeline:** test written `5be3d0574` (#1802, 2026-07-07). Then #1815/#1820 (`abdaf621`, 2026-07-11) added "dense-group area-label collision avoidance" — a demote-on-collision pass that INTENTIONALLY reduces representative counts in dense cores to prevent label overlap (see [[discover-dense-group-quadrant-vs-overlap-conflict]]). A 26-area tight core now demotes overlapping reps, yielding 8.
- **RUNTIME EVIDENCE (probe, this session):** a throwaway copy of the test with ONLY the two count asserts (lines 207-208) disabled was run (`node node_modules/.bin/vitest run areaMarkerBucketing.probe.test.ts` → exit 0, 20/20 pass). Probe log: `PROBE_30_TIGHT_CORE reps=8 clusters=9 edgesPresent=["edge-ne","edge-nw","edge-se","edge-sw"]`. Evidence: docs/audit/evidence/issue-1825-slice4/probe-run.txt (probe generator make-probe.mjs; probe file deleted after run).
- **DEFINITIVE CLASSIFICATION: STALE COUNT EXPECTATION — TEST-ONLY.** At 8 reps the quadrant-coverage guarantee HOLDS: all 4 quadrant edges (edge-ne/nw/se/sw) are representatives (lines 213-217 pass), clusters=9>0 (line 209 passes), and allAreaIds (line 219) passes. The ONLY failing assertion is the count band's lower bound (>=10). #1815/#1820's collision-demotion intentionally reduced the tight-core rep count while preserving the quadrant guarantee. This is NOT a product regression — no product fix in areaMarkerBucketing.ts is required.
- **Introducing commit:** #1815/#1820 (`abdaf621`).
- **Fix (smallest surface, test-only):** change line 207 lower bound `toBeGreaterThanOrEqual(10)` → `toBeGreaterThanOrEqual(8)` (keep `toBeLessThanOrEqual(12)` — 8≤12 holds) and update the test title/comment ("~10-12" → "~8-12, post-#1815 collision-demotion") with a comment referencing #1815. Keep ALL quadrant asserts (213-217), the clusters assert, and allAreaIds STRICT and unchanged.

## 4. src/pages/__tests__/LandingPage.test.tsx — TOO-LOOSE TEST QUERY after intended product change (test-only)
- **Failure:** test "renders Saved and List property actions for signed-in normal consumers" (line 98-103): `screen.getByRole('link', { name: /Saved/i })` throws "Found multiple elements with role link and name /Saved/i". One match = `/saved-areas` ("Saved").
- **Product truth:** #1566 (saved homes) added a SECOND Saved entry point (`/saved-homes`) alongside `/saved-areas`. routeAccess.ts:93 allows BOTH `/saved-areas` and `/saved-homes` for `user` — two saved destinations are intended product-wide. The header now renders both, so the substring `/Saved/i` query matches two links.
- **Classification:** TOO-LOOSE / STALE TEST QUERY after an intended product change (NOT a duplicate-nav regression — two Saved entry points are deliberate).
- **Fix (smallest surface, test-only):** execution reads the two links' exact accessible names in LandingPage's header, then disambiguates the line-101 query (e.g. `getByRole('link', { name: /^Saved$/i })` for the saved-areas link, or match by exact label) and ADDS coverage asserting the saved-homes link → `/saved-homes`. Do NOT delete or weaken — tighten + extend. Confirm the anon test (line 95, `queryByRole /^Saved$/i` absent) still passes.

## Summary
- All 4 are TEST-ONLY fixes (stale/incorrect/too-loose), with product behaviour intentional in each case — INCLUDING the HIGH-RISK routeAccess (stale guard for an intentionally-added route; no authz broadening bug) AND areaMarkerBucketing (RUNTIME-CONFIRMED stale count; quadrant guarantee holds at 8 reps — no product regression).
- No product/source change is required for any of the 4. The earlier areaMarkerBucketing product-fix contingency is now RESOLVED (runtime evidence shows quadrant guarantee intact → test-only count adjustment).
- No BUG_REPRO-as-distinct-product-bug needed: reproduction done; none is a product regression.

## Evidence-citation index (per required-change #2 — every alignment claim has direct evidence)
- listingFieldConfig → product intent: listingFieldConfig.ts:194-202 (#1627 doc comment) + :305 (facing in visibleFields set). Test staleness: test:69 "(10 total)" predates it.
- routeAccess → product intent: routeAccess.ts:99-100 (#1719 residential-allow) + test 11 line 76 (commercial sibling blessed true). git-blame: guard cbc5bf8e9 (07-03 10:10) < residential-allow 278954389 (07-03 18:00). Guard-intact proof: lines 95-96 stay false (non-routes).
- areaMarkerBucketing → runtime probe: probe-run.txt `reps=8 ... edgesPresent=[all 4]`, 20/20 pass with count asserts disabled. Intent: #1815/#1820 abdaf621 collision-demotion.
- LandingPage → product intent: routeAccess.ts:93 (both /saved-areas + /saved-homes allowed for user, #1566). Test ambiguity: repro shows getByRole(/Saved/i) matches 2 links. NOTE: execution reads LandingPage header for the two links' EXACT accessible names before writing the disambiguated query (label text not yet directly cited — the ONE inferred-but-unconfirmed detail; qa-fast confirms it first).
