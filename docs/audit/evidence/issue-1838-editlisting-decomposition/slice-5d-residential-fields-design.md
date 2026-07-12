# Slice 5d (residential-fields) — boundary decisions & extraction design

**Scope:** roadmap row 5 (architecture-review.md §9), 4th of 5 domain-field-hook PRs (agri→commercial→rent→**residential**→common). Extract residential-family field state/hydration out of `EditListingForm.tsx` into `useResidentialFields()`, mirroring 5a/5b/5c. This is the LARGEST domain (~39 fields) and carries a MANDATORY disposition of the 5 fields slice 5c deferred. Investigated Phase 0.7 (architect + explorer-planner, read-only) + orchestrator direct CONFIG_MAP reads. Citations are the slice-5d worktree.

## Governing rule
`useResidentialFields` owns fields that CONFIG_MAP makes visible **only** for residential-family types (apartment/house/villa/residential_plot) and **no other domain** (not commercial, not agri). A field shared with another domain stays component-owned (→ slice 5e common), exactly as 5a kept `ownershipType` and 5b kept `carpetArea`/etc. The hook owns only `useState` + `hydrate`; all gating (`fieldVisible`/`isRent`/`isResidenceType`/sale) stays in the JSX + the frozen slice-3 payload builder, unchanged.

## Three boundary decisions (all surfaced for PLAN_REVIEW; all recommended below)

### Decision #1 — the 5 slice-5c-deferred dual-gated fields → **IN `useResidentialFields`** (recommended)
`maintenanceIncluded`, `rentNegotiable`, `petsAllowed`, `availabilityTimeline`, `preferredTenants`. Gated `isResidentialFamily AND listingPurpose==='rent'` (listingFieldConfig.ts:492-503). They ARE residential-family fields (a commercial rent listing never shows them); their hydrate shapes (tri-state via `boolToTriState`, array `?? []`, string `?? ''`) are already the residential-domain norm (residential owns 14 tri-states + amenities/specialLocationViews arrays). A separate "terms" hook would be premature decomposition of a 5-field subset with no domain of its own. Structural precedent: `numberOfUnits` (5b) is commercial-exclusive but sub-gated to commercial_building/warehouse and lives in `useCommercialFields` with the sub-gate in `fieldVisible`. Same here: the `isRent` sub-gate stays in JSX/payload; the hook just owns state+hydrate. BOTH specialists validated. This resolves the 5c deferral — they are NOT re-deferred.

### Decision #2 — carpetArea/carpetAreaUnit/floorNumber/totalFloors/furnishingStatus → **stay component-owned, defer to 5e** (recommended)
Residential ∩ commercial (5b's `useCommercialFields.ts:8-10` header explicitly names them SHARED, left component-owned). A residential-only hook would strand commercial (commercial listings read `carpetArea`/`floorNumber`/`totalFloors`/`furnishingStatus`). Their clean home is a future slice 5e (common/shared) or permanent component ownership — out of scope for 5d.

### Decision #3 — the shared-with-agri / apartment-only resolution (from CONFIG_MAP, orchestrator-verified)
- **`facing` → OUT (stays component-owned).** In `RESIDENCE_SHARED_FIELDS` (listingFieldConfig.ts:262) AND `PLOT_ONLY_FIELDS` (:275) AND `agricultural_land` renders it via `...AGRI_FACING_FIELD` (:305, #1627). So `facing` is shared residential ∩ agri (analogous to carpetArea's residential∩commercial) → NOT residential-exclusive; stays component-owned / 5e.
- **`ownershipType` → OUT (stays component-owned).** In `RESIDENCE_SHARED_FIELDS` (:270) + `PLOT_ONLY_FIELDS` (:284), shared with agri; slice 5a already deliberately left it component-owned. Unchanged.
- **`surveyNumber` → OUT (already agri-owned by 5a).** In `PLOT_ONLY_FIELDS` (:289) but is one of the 8 fields `useAgriFields` (5a) owns — do NOT duplicate.
- **`superBuiltArea`/`superBuiltAreaUnit` → IN (residential-exclusive).** `superBuiltArea` is in `APARTMENT_ONLY_FIELDS` (:236) — apartment-only, NOT in any commercial set → residential-exclusive. `superBuiltArea` is `number | null` (NOT a string) — the hydrate must be `listing.superBuiltArea ?? null` (state `useState<number|null>(null)`), NOT `String()`; `superBuiltAreaUnit` defaults `'SQ_FT'`. This is the single highest shape-mismatch trap (architect flag) — RESOLVED here.
- **`bedrooms`, `builtArea`/`builtAreaUnit`, `landArea`/`landAreaUnit` → OUT (base fields).** `builtArea`/`landArea` span many types (house/apartment/commercial/plot/agri) — genuinely shared base area fields; `bedrooms` is residence-only but is rendered in the base "Describe" section alongside price/title (architect), not the residential-details block. Recommend keeping these base fields component-owned for now (a minor boundary note, not blocking); PLAN_REVIEW may pull `bedrooms` in if preferred.

## Residential-exclusive field set (bucket A, ~34) + the 5 dual-gated (= ~39-field hook)
Per CONFIG_MAP, grouped by hydrate shape (engineer verifies each field against CONFIG_MAP; the non-optional `ListingFormState` + before/after anchors catch any error):

- **Group N — `useState('')`, hydrate `!= null ? String(x) : ''`** (numeric-in-string): bathrooms, balconies, parking2wCount, parking4wCount, roadWidthFt, maintenancePaise.
- **Group E — `useState('')`, hydrate `?? ''`** (enum/free-text): propertyAge, residentialWaterSource, plotDimensions, conversionStatus, khataNumber, propertyTaxPid, approvingAuthority, projectName, builderName, possessionStatus, + **availabilityTimeline** (dual).
- **Group T — `useState('')`, hydrate `boolToTriState(x)`** (tri-state): priceNegotiable, hasLift, hasPowerBackup, isGated, hasGarden, hasTerrace, hasCompound, hasServantRoom, isCornerPlot, hasBoundaryWall, isGatedLayout, hasWaterConnection, hasElectricityConnection, hasDrainage, + **maintenanceIncluded, rentNegotiable, petsAllowed** (dual).
- **Group A — `useState<string[]>([])`, hydrate `?? []`** (arrays): amenities, specialLocationViews, + **preferredTenants** (dual).
- **Group X — special (do NOT stringify):** superBuiltArea `useState<number|null>(null)` hydrate `?? null`; superBuiltAreaUnit `useState('SQ_FT')` hydrate `?? 'SQ_FT'`.

`boolToTriState` is exported from `@/components/broker/ChipGroup` (not local) — the hook imports it cleanly, no cycle. `useResidentialFields.ts` imports only react + `type ListingResponse` + `boolToTriState`.

## Threading
Bare-destructure `values`/`setters` into identically-named consts (mirror 5a/5b/5c) so the residential JSX + the `buildListingUpdatePayload({...})` call-site object literal stay byte-identical; replace the ~34+5 `useState` decls + their prefill assignments with a single `residential.hydrate(listing);` slotted into the EXISTING single prefill effect (alongside agri/commercial/rent.hydrate); extend the dep array to `[listing, agri.hydrate, commercial.hydrate, rent.hydrate, residential.hydrate]` (stable useCallback([])). `buildUpdatePayload.ts` + `buildUpdatePayload.test.ts` are FROZEN (untouched, stay green). The non-optional `ListingFormState` (slice-3) is the compile-time safeguard: a dropped/renamed field fails `tsc` at the call site.

## Test strategy
`EditListing.residential.test.tsx` is the existing PRIMARY anchor — it already exercises the 5 relocated dual-gated fields under rent-purpose (fixtures + prefill-reflect + type-switch omission) and multiple type-switches. Run it UNCHANGED before/after; add assertions ONLY if a residential-exclusive field (e.g. `superBuiltArea` number|null round-trip) is uncovered — additive, never weaken. Hook unit test: SKIP (series-consistent with 5a/5b/5c; the anchor + non-optional ListingFormState give equivalent coverage). Mandatory before/after: guard + residential + agri + commercial + rent anchors + buildUpdatePayload.test.ts GREEN against the UNMODIFIED component, then identically AFTER.

## Risks (large ~39-field extraction)
| Risk | Catch |
|---|---|
| Dropped field (1 of ~39) | non-optional ListingFormState → tsc call-site error before tests |
| Shape mismatch — stringify superBuiltArea (number|null) or drop boolToTriState on a tri-state | superBuiltArea state typed number|null → tsc error; buildUpdatePayload.test.ts (frozen) + residential anchor assert exact serialized output |
| Wrong default (superBuiltAreaUnit '' vs 'SQ_FT') | residential anchor prefill/reflect |
| Mis-bucketed shared field (facing/ownershipType/carpetArea pulled in) | Decision #2/#3 exclude them; agri/commercial anchors stay green |
| dep-array omission of residential.hydrate | react-hooks/exhaustive-deps lint (established pattern) |

## Files touched (exactly)
1. `src/pages/broker/editListing/EditListingForm.tsx` — remove ~39 useState + prefill lines; compose hook + bare-destructure + `residential.hydrate(listing)` + dep array + import.
2. `src/pages/broker/editListing/useResidentialFields.ts` — NEW (~39-field hook).
3. `src/pages/broker/__tests__/EditListing.residential.test.tsx` — extend ONLY if an uncovered residential-exclusive field warrants (additive; likely no change).
No hook unit test (skip). Frozen (do NOT open): buildUpdatePayload.ts + its test, useAgriFields.ts, useCommercialFields.ts, useRentFields.ts, ChipGroup.tsx, listingFieldConfig.ts, the other 4 anchors. No import cycle.

## Process note (from 5a/5b/5c)
All specialist edits/test runs MUST occur in `/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer-worktrees/issue-1838-slice5d-residential-fields` — verify `git status` there before trusting evidence. Run lock: `.claude/active-runs/issue-1838.lock`; ports FE 5194 / BE 8094.

## Open items for PLAN_REVIEW
1. Ratify Decision #1 (5 dual-gated → IN), #2 (carpetArea set → 5e), #3 (facing/ownershipType/surveyNumber OUT; superBuiltArea IN).
2. Minor: `bedrooms` component-owned (base section) vs residence-exclusive — recommend keep component-owned; PLAN_REVIEW may override.
