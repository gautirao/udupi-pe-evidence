[lane-2015] Issue #2015 approved plan: .claude/handoffs/issue-2015/approved-plan.toml (sha256: bbf4d862a94d806cdb3e24ad24d37ceea6489b829ade3e1f08e07975f141cd91) — PLAN_REVIEW APPROVED, materialized 2026-09-01

=== MILESTONE #15 ROLLING CHECKPOINT (2026-05-07 00:30 GMT+1) ===

**Milestone:** `discover-area-journey-figma-parity`
**Mode:** Sequential (1 issue at a time, full gates per issue)
**Status:** A1 ✅ MERGED | A2 ✅ MERGED | A3 ✅ MERGED | A4 ✅ MERGED | A5 ✅ MERGED → A6 PENDING APPROVAL

---

## Completed Issues (A1–A3)

### A1 #991 — Area journey shell + JourneySwitcher + DiscoverRightPanel state machine
- **Merged:** 76fd6d3 (2026-05-05)
- **Coverage:** 116 unit tests, state-machine routing verified, no regressions
- **Scope:** JourneySwitcher (area-first/school-first), DiscoverRightPanel refactor to state machine, derivePanelContent routing all 8 states

### A2 #992 — AreaGroupsLandingPanel from /api/discover/area-groups
- **Merged:** f70b8e1 (2026-05-06)
- **Coverage:** 19 unit tests, 8/8 E2E tests passing
- **Scope:** useAreaGroups hook, AreaGroupsLandingPanel with browse-all fallback, group card click → ?groupId=

### A3 #993 — Focused-group map behaviour + area marker selection
- **Merged:** PR #1014 (2026-05-07 00:28 GMT+1)
- **Implementation Commits:** c44dbcd (impl), 8987755 (fixes)
- **Test Results:**
  - ✅ 104 unit tests passing (AreaMarkerLayer 7/7, computeGroupBounds 12/12, selectArea 85/85 + new)
  - ✅ E2E 4/4 passing (area-groups-focus.spec.ts: group click, area click, browser back, cold-load)
- **Code Review:** ✅ APPROVED (BLOCKING ref-ordering fix + 3 ADVISORY improvements)
- **CI Status:** Infrastructure blocked (billing issue); all local gates passed
- **Scope:** AreaMarkerLayer opacity control, selectArea groupId preservation, computeGroupBounds helper, MapDiscovery fitBounds integration

### A4 #994 — AreaIndicatorOverlay + ActiveContextChips
- **Merged:** PR #1015 (2026-05-07 06:05 GMT+1)
- **Implementation Cycles:** 2 (frontend-engineer), 3 (code-reviewer)
- **Test Results:**
  - ✅ 726/727 unit tests passing (5 AreaIndicatorOverlay, 23 ActiveContextChips, 6 clearAreaContext hook tests)
  - ✅ E2E 6/6 smoke tests passing (local gate)
  - ⚠️ 1 pre-existing failure (Index.invalidCity.test.tsx line 224, confirmed unrelated)
- **Code Review:** ✅ APPROVED WITH COMMENTS → APPROVE (Cycles 1-3: Full Deselect semantics, atomicity, a11y, stale-closure fix)
- **Scope:** AreaIndicatorOverlay (city/group/area priority rendering), ActiveContextChips (5 dismissible filter chips), clearAreaContext/deselectArea semantics, Chip role="group" a11y

### A5 #995 — Selected-area panel + quick-filter chips + school CTA
- **Merged:** PR #1016 (2026-05-07 09:28 GMT+1)
- **Implementation Cycles:** 1 (ROUTE_AND_RUN full workflow)
- **Test Results:**
  - ✅ 742/743 unit tests passing (16 AreaSelectedPanel tests + 726 prior tests)
  - ✅ E2E 22/22 smoke pass (1 skipped pre-existing, discover-area-selected-filters.spec.ts deferred from smoke—needs real area data)
  - ⚠️ 1 pre-existing failure (Index.invalidCity.test.tsx, confirmed unrelated to A5)
- **Code Review:** ✅ APPROVED (Cycles 1-2: handleClearPropertyFilters preservation, module-level constants, type safety)
- **Scope:** Quick-filter chips (Apartments/Villas/Plots, 2/3 BHK), empty-state clear action (preserves school/polygon), school CTA journey transition, prop threading through DiscoverRightPanel

---

## Main Branch Sync
- ✅ Synced post-merge (A5 PR #1016 merged)
- Working tree clean, ready for A6

---

## A6 — School Journey UI (In Progress)

### A6.1 #997 — School journey shell + school-count area marker variant
**Status:** BLOCKED (E2E gate failure — pre-existing #970 failures)
**Branch:** main (changes committed locally, NOT merged)
**Implementation state:**
- ✅ Pre-flight: 5/5 required fields
- ✅ Changed files: 5 files (AreaMarkerLayer, PropertyMap, MapDiscovery, useDiscoverMapData, test file)
- ✅ Engineer tests: 17 passed, all ACs covered
- ✅ Code-reviewer: APPROVE (no BLOCKING issues, 4 ADVISORY-FIX findings)
- ❌ E2E smoke: BLOCKED by pre-existing failures in #970 discover-school-journey.spec.ts

**Blocking issue:** discover-school-journey.spec.ts failures (3 deterministic failures, unrelated to #997 changes)
- Failure [1] `happy path — narrowing area in sheet, picking school writes URL state and chip` — line 171 — Filters button not found post-school-selection
- Failure [2] `cold-load restoration — direct URL with schoolId hydrates chip and filters` — line 222 — aria-pressed=false when should be true
- Failure [3] `clearing the school chip removes schoolId and radiusKm from URL` — line 259 — same root cause as [2]
- Root cause: NearSchoolSheet / aria-pressed binding in useDiscoverUrlState (issue #970, PR #979)
- Sentinel status: stale (.e2e-passed SHA 211195197c does not match HEAD 6d982f69)

**Acceptance criteria (A6.1):**
| AC | Status |
|----|----|
| Area markers show school count when journey='school-first' AND !selectedSchool | ✅ COVERED (unit tests) |
| Area markers fall back to property count in area-first journey | ✅ COVERED |
| school-browse panel renders without errors | ✅ COVERED (no changes needed; placeholder remains) |
| No regression on area-first journey | ✅ COVERED (area-groups-landing E2E 8/8 pass) |

**Why #997 cannot merge:**
- Route-and-run protocol: PR creation gate requires `.e2e-passed` sentinel to match HEAD
- Current sentinel is stale due to pre-existing #970 failures
- #997 code is correct and complete, but cannot be merged until sentinel is refreshed
- Merging #997 code without refreshing sentinel would mask the pre-existing #970 failures

**Recommended next step:**
Fix issue #970 school-journey E2E failures first (NearSchoolSheet aria-pressed wiring), update sentinel, then resume #997 merge gate.

**Not in scope of #997:**
- School markers on map (A6.3 #999)
- SchoolsInAreaPanel implementation (A6.2 #998)
- Selected-school radius logic (A6.4 #1000)

---

### Upcoming Issues (A6.2+)

**A6.2 #998** — SchoolsInAreaPanel with school cards + board/category chips (pending A6.1 merge)
**A6.3 #999** — SchoolMarkerLayer + journey-aware marker visibility (pending A6.1 merge)
**A6.4 #1000** — Selected-school state: radius selector + nearby homes (pending A6.1 merge)
**A6.5 #1001** — Property filters compose with selected school + radius context (pending A6.1 merge)

---

## Known Issues (Non-blocking)

| Issue | Scope | Status |
|-------|-------|--------|
| UJ1 (user-journeys.spec.ts) | Pre-existing E2E flaky test | Not A3 regression; classified pre-existing on main |
| CI infrastructure | GitHub Actions billing hold | Awaiting restoration (not code-related) |

---

## Model & Conventions

- Model: Haiku 4.5 (cost-optimized)
- Desktop-first MVP (mobile deferred post-launch)
- Sequential execution: A1 → A2 → A3 → A4 (one issue at a time)
- All gates: qa-fast → engineer → code-reviewer → E2E
- Commit after completing each PR; no uncommitted work between issues

## Project Item IDs

#931 → PVTI_lAHOAAVnaM4BSWI7zgrX0xY

## Sprint Issues

- #931  [FE][AUDIT+EPIC] Global UI theme alignment — migrate to mock design system  ✅ PR #933

## Execution Order

Phase 1: #931 ✅ — token baseline + cluster fix (PR #933, merged 2026-04-29)

## Dependencies

None (single-issue sprint)

## Enriched Specs

SEE .claude/sprint-enriched-specs.md

## Sprint-level Conventions

- Token reference: mock authoritative source is mockup/ReTrends/src/styles/theme.css
- Primary target: #030213 (dark navy) → HSL 244 81% 4%
- All hardcoded orange-* usages in src/ are property-type legends (intentional) — do not modify
- --pin-house and --chart-1 stay orange (intentional semantic tokens)
- qa-risk: ui-theme::src/index.css — Leaflet cluster uses bg-primary; token flip cascade affects all primary-themed surfaces including clusters (from #931)

## Known Temporary Exceptions

(none)

## Risks

(none — all resolved)

## Progress

#931 ✅ PR #933 (merged 2026-04-29 — primary token: terracotta→dark navy; --ring→neutral gray; --pin-cluster added)

---

=== PR RECORDS BEGIN ===

## PR #933 — [FE] Global UI theme alignment — migrate to mock design system (#931)
Issue: #931
Date: 2026-04-29
Route: qa-fast → frontend-engineer(×2) → code-reviewer(×2) → E2E smoke
Touched files:
  - src/index.css (16 token values changed; --pin-cluster token added)
Acceptance criteria:
  - AC1 ✅ --primary: 244 81% 4% (dark navy) in :root
  - AC2 ✅ --primary-foreground: 0 0% 100% (white)
  - AC3 ✅ --ring: 0 0% 40% (neutral gray, WCAG 3:1 on light bg)
  - AC4 ✅ --sidebar-primary: 244 81% 4% / dark: 264 58% 38%
  - AC5 ✅ --pin-house: 16 65% 45% unchanged (intentional orange)
  - AC6 ✅ --chart-1: 16 65% 45% unchanged (chart data color)
  - AC7 ✅ rg check: 8 hits, all property-type legends — no unintended orange classes
  - AC8 ✅ E2E smoke 6/6 pass — no homepage regression
  - AC9 ✅ --pin-cluster: 175 45% 40% (teal) — Leaflet clusters visible after token flip
Key decisions:
  - --ring uses 0 0% 40% (slightly darker than mock's 71%) to meet WCAG 3:1 on light backgrounds
  - --pin-cluster added as new token (not reusing --primary) following --pin-* pattern
  - dark --sidebar-primary: 264 58% 38% (accurate oklch→HSL conversion of mock value)
Gate Satisfaction Record:
  - qa-fast: COMPLETE (4 risks: HIGH cluster visibility, HIGH ring WCAG, MEDIUM Trends hardcoded blue, LOW chart stroke)
  - Engineer materialization: PASS (2 cycles — cycle 2 fixed cluster + sidebar + comment issues)
  - Code-reviewer: APPROVE (cycle 2, delta-only)
  - E2E: PASS (6/6, Q7 permanent skip)
  - All gates satisfied: YES
Risks: NONE
Spec invalidation: NONE
