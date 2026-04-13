# PR Fixlog — #747 feat(backend): GET /api/public/areas/trending — top areas by 30d activity

## Counters
| Field | Value |
|-------|-------|
| engineer-cycles | 1 |
| code-review-cycles | 1 |
| qa-verify-cycles | 0 |
| qa-targeted-reruns | 0 |
| qa-full-reruns | 0 |

## Reviewer Baseline
baseline_sha: bf51b9811760357480bf9e4b47edab2f45b862fb

## Findings
| ID | Severity | File | Line | Status |
|----|----------|------|------|--------|
| F1 | BLOCKING | AreaOverviewService.java | getTrending RowMapper | OPEN — districtLabel emits "" not null when deriveDistrictKeyFromParts returns null |
| F2 | BLOCKING | AreaOverviewService.java | deriveDistrictKeyFromParts | OPEN — 3rd copy of district derivation logic; inconsistent guard (< 3 vs != 4); delete + consolidate |
| F3 | BLOCKING | TrendingAreasControllerTest.java | (missing) | OPEN — no security boundary test for permitAll rule (pattern: TrustControllerSecurityTest) |
| F4 | ADVISORY | TrendingAreasServiceTest.java | (missing) | OPEN — 5-segment areaKey + null district_area_key divergent behavior untested |
| F5 | ADVISORY | AreaOverviewController.java | @RequestParam | OPEN — ?limit=abc error handling not verified |

## QA Failures
| ID | Spec | Test | Status | Notes | Rerun Scope |
|----|------|------|--------|-------|-------------|

## Agent Ledger
| Step | Agent | Action | Notes |
|------|-------|--------|-------|
| 1 | qa-fast | Pre-impl risk scan | Spring Security config + column name verification critical; E2E YES (for #749) |
| 2 | backend-engineer | Implement #747 | 6 files; 1397 tests pass |
| 3 | code-reviewer | Review | REQUEST CHANGES — F1 (null→""), F2 (dup logic), F3 (no security test) |
