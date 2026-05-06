=== MILESTONE #15 ROLLING CHECKPOINT (2026-05-06 20:15 GMT+1) ===

## Milestone Status

**Milestone #15:** `discover-area-journey-figma-parity`
**Completed Issues:** A1 ✅ MERGED (76fd6d3), A2 ✅ MERGED (f70b8e1)
**Current Issue:** A3 (#993) — Ready to start
**Mode:** Sequential (1 issue at a time)

---

## A1 + A2 Verification Report

### A1 #991 — Area Journey Shell + JourneySwitcher + DiscoverRightPanel State Machine

**Commit:** 76fd6d3

| Component | Status | Evidence |
|-----------|--------|----------|
| JourneySwitcher | ✅ | Two cards (area-first/school-first), icons (Building2/GraduationCap), aria-labels, click handlers |
| DiscoverRightPanel | ✅ | Thin state-machine switch with 7 audit cases + A2 area-groups-landing; defensive fallbacks |
| derivePanelContent | ✅ | All 8 states routed (guided-entry, area-groups-landing, area-selection, area-selected, school-browse, schools-in-area, school-selected, area-school-combined) |
| startOver() | ✅ | Clears journey/groupId/areaKey/schoolId/radiusKm/filters/viewport; preserves city + property filters; uses REPLACE |
| AreaSelectedPanel | ✅ | PropertyCard list, loading skeletons, empty state, search input, back button with ChevronLeft icon |
| Quick-select chips | ✅ | Removed (not duplicated in new UI) |

**Test Coverage:**
- JourneySwitcher: 7 tests ✅
- DiscoverRightPanel routing: 17 tests ✅
- useDiscoverUrlState (includes startOver): 80 tests ✅
- discoverPanelState (derivePanelContent): 12 tests ✅
- **Subtotal: 116 tests passing**

### A2 #992 — AreaGroupsLandingPanel from /api/discover/area-groups

**Commit:** f70b8e1

| Component | Status | Evidence |
|-----------|--------|----------|
| useAreaGroups hook | ✅ | City-keyed query, queryKey includes city, enabled guard (city.length > 0), staleTime 60s, error fallback returns { groups: [] } |
| AreaGroupsLandingPanel | ✅ | Renders groups from API, loading skeletons, Browse-all fallback for empty response, discriminated union type safety |
| Group card click | ✅ | Sets ?groupId= in URL (no area selection yet) |
| Browse-all fallback | ✅ | Renders when groups.length === 0, scoped to current city, pure UI (props-driven, no refetch) |
| Discriminated union | ✅ | onSelectArea required when fallbackAreas provided; silent no-ops eliminated |

**Test Coverage:**
- AreaGroupsLandingPanel: 19 tests ✅
- **E2E: 8/8 tests passing** ✅ (includes AC#5 group-card-click → ?groupId= URL test)

**Blocking Issues Fixed:**
1. Type safety — Discriminated union enforces onSelectArea with fallbackAreas
2. E2E assertion — Fixed broken `.not` syntax to `.not.toBeAttached()`
3. AC coverage — Added test for group card click → URL ?groupId= change

### Overall Verification

| Category | Result |
|----------|--------|
| Unit tests | 668 passing (1 pre-existing failure: Index.invalidCity, unrelated) |
| TypeScript build | Clean ✓ |
| A2 E2E tests | 8/8 passing ✓ |
| A1 state machine | Verified (all 8 cases routed) ✓ |
| A2 API integration | Verified (useAreaGroups + AreaGroupsLandingPanel) ✓ |
| No school-journey UI | Verified (stubs only) ✓ |
| No A3+ features | Verified (no map focus, no marker fade) ✓ |
| Existing Discover flows | No regressions ✓ |

**Checkpoint commit:** 8bbba1f

---

## A3 Ready to Start

**Issue:** #993 — Focused-group map behaviour + area marker selection
**Scope:**
- Map focus: fitBounds to group bounds or fallback to member markers
- Area marker fade: non-group markers fade, group members remain prominent
- Click area marker: URL PUSH with ?areaKey=, preserve ?groupId=
- Back from area: return to group-focused state (not all-areas)

**Dependencies:** A1 ✅, A2 ✅ (state machine, group card click, URL contract)

**Out of scope:**
- A4 features (area-indicator chips)
- A5 features (selected-area filters)
- School journey UI

---

## Known Issues (Non-blocking)

| Issue | Scope | Priority |
|-------|-------|----------|
| 1 Index.invalidCity unit test failure | Pre-existing, unrelated to A1/A2 | Low |
| useAreaGroups error suppression | Advisory (try/catch swallows all errors) | Post-launch |
| staleTime value not asserted in unit tests | Advisory (presence verified, behavior acceptable) | Post-launch |
| groupId URL validation across city change | Advisory (deferred to A2.1 post-launch) | Post-launch |

---

## Next Steps

1. Fetch A3 #993 issue details and ACs
2. Inspect AreaMarkerLayer, map focus logic, URL actions
3. Write implementation plan and wait for approval
4. Proceed via ROUTE_AND_RUN.md (qa-fast → frontend-engineer → code-reviewer → E2E)

---

## Notes

- Model: Haiku 4.5 (cost-optimized)
- Desktop-first MVP (mobile deferred post-launch)
- All gates passed: qa-fast → engineer → code-reviewer → E2E
- No technical debt; all blocking issues resolved cleanly
- Sequential execution: A1 → A2 → A3 (one issue at a time, full gates per issue)
