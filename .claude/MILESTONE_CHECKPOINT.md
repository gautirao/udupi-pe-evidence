# MILESTONE_CHECKPOINT.md — discover-city-listings-sprint

Last updated: 2026-04-27
Status: ✅ COMPLETE · 4/4 issues merged

## Issues

| # | Title | Size | Status |
|---|---|---|---|
| #886 | feat(discover): city-first area listings backend endpoint | medium | ✅ MERGED PR #889 |
| #887 | feat(discover): render selected-area listings in right panel | medium | ✅ MERGED PR #890 |
| #880 | fix(loader): reflect true data readiness on discover map | medium | ✅ MERGED PR #891 |
| #888 | feat(discover): wire filters into city-first area listings | medium | ✅ MERGED PR #892 |

## PR Records

### PR #892 — feat(discover): wire filters into city-first area listings query (#888)
Date: 2026-04-27
Files: CityAreaListingsController.java, CityAreaListingsService.java, CityAreaListingsControllerTest.java, useDiscoverCityListings.ts, useDiscoverCityListings.test.ts, Index.tsx, LandingPage.test.tsx
Key fix: filter clauses on LEFT JOIN ON (not inner WHERE) to preserve zero-listing areas; bedrooms=4 uses SQL literal 4; param order: filter → city → areaKeys → limit
Tests: 18/18 backend pass; 345/365 frontend pass (3 pre-existing jsdom failures)
Status: MERGED ✅

### PR #891 — fix(loader): reflect true data readiness on discover map (#880)
Date: 2026-04-27
Files: PropertyMap.tsx, Index.tsx, LandingPage.tsx, PropertyMap.test.tsx
Key fix: MapReadySignal (useRef for onReady callback), 200ms delayed-show, error gate independent of mapReady, LandingPage return-null removed
Tests: 14/14 PropertyMap; 15/15 LandingPage; 345 total frontend pass
Status: MERGED ✅

### PR #890 — feat(discover): render selected-area listings in right panel (#887)
Date: 2026-04-27
Files: useDiscoverCityListings.ts, DiscoverRightPanel.tsx, DiscoverRightPanel.test.tsx, Index.tsx, discover-area-cards.spec.ts
Key fix: URLSearchParams.append() (no encodeURIComponent), areaKey lookup not array index
Tests: 14 unit pass; 8/8 E2E pass
Status: MERGED ✅

### PR #889 — feat(discover): city-first area listings backend endpoint (#886)
Date: 2026-04-27
Files: CityAreaListingsController.java, CityAreaListingsService.java, + DTOs, JwtConfig.java, V74 migration
Key: ROW_NUMBER window function, LEFT JOIN preserves empty areas, unknown:true for bad areaKeys
Tests: 14/14 controller tests pass
Status: MERGED ✅

## Deferred / Next

| # | Title | Notes |
|---|---|---|
| #875 | [PERF] Discover scalability | No code required for MVP; viewport-bounded marker query deferred to 10k+ scale |
| #717 | fix(ux): reorder mobile filter sheet | Next sprint candidate |
| #714 | test(e2e): locality selection UX | Next sprint candidate |
