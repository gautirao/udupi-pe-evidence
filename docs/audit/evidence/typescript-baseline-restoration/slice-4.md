# Issue #1850 Slice 4 — TypeScript compiler-baseline restoration

Command used (from repo's tsc via the worktree's tsconfig):

```
node /Users/gouthamrao/projects/udupi-property-explorer/node_modules/.bin/tsc --noEmit \
  -p /Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1850-slice4-fixtures/tsconfig.app.json
```

## Counts

- Before: **91** errors
- After: **80** errors
- Removed: **11** errors, 0 added elsewhere

## Errors removed, per file

### Cluster D — stale test fixtures (9 errors)

- `src/components/discover/__tests__/AreaIndicatorOverlay.test.tsx`
  - `:11` TS2353 `'lat'` not on `AreaPoint` → fixture now uses `geo_center_lat`/`geo_center_lon`/`bbox: null`
  - `:21` TS2353 `'city'` not on `AreaGroup` → removed; added required `region_label`/`school_count`
  - `:29` TS2353 `'city'` not on `AreaGroup` → same fix for second fixture
- `src/components/discover/__tests__/DiscoverRightPanel.test.tsx`
  - `:584` TS2353 `'area_count'` not on `AreaGroup` → obsolete fields (`area_count`, `listing_count`, `bounding_box`, `centroid`, `default_zoom`, `display_order`) dropped; `school_count` added
  - `:599` TS2353 `'area_count'` not on `AreaGroup` → same fix for second fixture
- `src/components/discover/panels/__tests__/AreaSelectedPanel.test.tsx`
  - `:12` TS2353 `'lat'` not on `AreaPoint` → fixture now uses `geo_center_lat`/`geo_center_lon`/`bbox: null`
  - `:19` TS2561 `'property_type'` → `propertyType` on `DiscoverCityListingItem`; `price`/`price_unit` (not valid keys) replaced with `pricePaise`
- `src/components/map/SchoolMarkerLayer.test.tsx`
  - `:36` TS2353 `'category'` not on `SchoolResult` → removed; added required `boardType`, `address`, `distanceKm`
  - `:44` TS2353 `'category'` not on `SchoolResult` → same fix for second fixture

### Cluster E — leaflet Default-icon cast (2 errors)

- `src/components/map/PropertyMap.tsx:62` — `as Record<string, unknown>` → `as { _getIconUrl?: unknown }`
- `src/components/broker/AddressPicker.tsx:19` — `as Record<string, unknown>` → `as { _getIconUrl?: unknown }`

Both are type-only narrowing casts; emitted JS is unchanged (erased at compile time).

## Explicitly untouched (out of scope)

- `src/components/map/PropertyMap.tsx:514` and `:1438` (PropertyType errors, #1859) — confirmed still present in the after-run.
- `src/pages/__tests__/MapDiscovery.issue1175.test.ts` `schoolLat` error — deferred, untouched.
- No other file outside the allow-list was edited.

## Test verification

All 4 affected vitest suites run individually from the worktree using the main repo's vitest binary (`--root` pointed at the worktree; dummy local `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` env vars supplied only to satisfy the Supabase client constructor — no network calls made, no real credentials used):

| Suite | Result |
|---|---|
| `AreaIndicatorOverlay.test.tsx` | 6/6 passed, exit 0 |
| `DiscoverRightPanel.test.tsx` | 32/32 passed, exit 0 |
| `AreaSelectedPanel.test.tsx` | 51/51 passed, exit 0 |
| `SchoolMarkerLayer.test.tsx` | 19/19 passed, exit 0 |
