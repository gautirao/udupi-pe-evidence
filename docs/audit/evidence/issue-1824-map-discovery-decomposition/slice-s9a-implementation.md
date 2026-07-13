# Issue #1824 — Slice S9a Implementation Note (helper-band relocation + re-export shim)

Stage B execution record. Branch `issue-1824-s9a-helper-relocation` off `origin/main @ 77b76119`. MEDIUM risk (byte-for-byte pure-helper relocation). Companion: `slice-s9-design.md`. (S9b — the useDiscoverMapPresentation presenter hook — is the NEXT slice.)

## What shipped

- 3 NEW pure modules under `src/features/discover/presentation/` (no React/hooks/side-effects):
  - `discoverBadge.ts` — `DiscoverBadgeInput`/`State`/`Result` + `deriveDiscoverBadge` + `formatDiscoverBadgeCopy`.
  - `schoolFirstCounts.ts` — `SchoolFirst*CountInput` + `ShowSchoolMarkersInput` + internal `SchoolFirst*Like` + `deriveSchoolFirstLanding/Zone/AreaSchoolCount` + `deriveShowSchoolMarkers` + `deriveSchoolRadiusPillNoun`.
  - `anonPropertyFilters.ts` — `applyAnonPropertyFilters` + `deriveAnonSchoolRadiusMarkers` + `hasActiveAnonPropertyFilter` + `rupeesToPaise` + the `cityListingToPropertyListing` import.
- `src/pages/MapDiscovery.tsx`: 3342 → 2787 (−555). The L85-690 helper band removed; an **import + re-export shim** added — the body imports the helpers it calls (local bindings), and re-exports all 10 functions + 7 types so every `@/pages/MapDiscovery` importer resolves UNCHANGED. `isNew` (L80) + `AREA_LAYER_MAX_ZOOM` (L83-84) untouched. One dead import (`SchoolRadiusListingItem`, orphaned by the move) removed.

## Byte-for-byte + shim (opus code-reviewer, APPROVE)

- Verbatim: `diff` of the original L85-690 vs the 3 new modules = **0-diff byte-identical** (incl. `deriveDiscoverBadge` L198-358 badge-truthfulness priority ladder school-radius→area→filters→group→city unchanged).
- Shim: MapDiscovery.tsx re-exports all 10 functions + 7 types; the 5 test importers + `DiscoverMapCountBadge.tsx` L7 `import type { DiscoverBadgeResult }` all resolve.
- Body local bindings: the body's memos call all 10 helpers (deriveDiscoverBadge, formatDiscoverBadgeCopy ×4 sites, deriveSchoolFirst* ×3, deriveShowSchoolMarkers, deriveSchoolRadiusPillNoun, applyAnonPropertyFilters ×2, deriveAnonSchoolRadiusMarkers, hasActiveAnonPropertyFilter, rupeesToPaise ×2) — MapDiscovery.tsx IMPORTS them (a bare re-export would not give the body a callable binding; tsc would fail — it doesn't).

## Engineer-caught correction (rupeesToPaise) — code-reviewer APPROVED

The brief assumed `rupeesToPaise` was used only by `applyAnonPropertyFilters`. It is ALSO called directly in the body (agri price-filter, L483/486). Resolution: `rupeesToPaise` is EXPORTED from `anonPropertyFilters.ts` (so the body can import it back) but deliberately KEPT OUT of the public `@/pages/MapDiscovery` re-export shim — it was never a public MapDiscovery export, so excluding it preserves the original public API (no new public symbol). Code-reviewer verified: byte-identical body, not in the public shim, body imports it, applyAnonPropertyFilters still uses it internally. Correct handling.

## Deviations

- **DEV-1 (rupeesToPaise):** exported from the module for the body's local import, NOT in the public shim (preserves the original private-to-MapDiscovery API). Non-functional.
- **AC7 LINE VARIANCE:** net −555 vs the plan's ~−590/−610 projection. The projection assumed a BARE re-export; the CORRECT implementation requires BOTH an import (for the body's 10 helper calls — the body-use correction) AND a re-export (for the shim), inherently landing ~40-55 lines higher. So −555 is the correct-implementation result, not a shortfall in the extraction. Surfaced for WORKDONE_REVIEW.

## Validation evidence (commands + exit codes)

| Check | Command | Exit | Result |
|---|---|---|---|
| tsc (branch vs /tmp 77b76119 baseline) | `npx tsc -p tsconfig.app.json --noEmit` | 2 (both) | 44-error set **byte-identical** → zero net-new (all pre-existing unrelated files) |
| 5 helper unit tests (UNCHANGED via shim) | `npx vitest run <issue1152/issue1175/anon-school-radius/school-pill/MapDiscovery.test.tsx>` | 0 | **118/118 PASS**; `git diff --stat 77b76119` EMPTY on all 5 → unedited |
| Full MapDiscovery mount suite (31 files) | `npx vitest run src/pages/__tests__/MapDiscovery.*` | 0 | **235/235 PASS**; all 31 unedited |
| S8 copy-fork test | `npx vitest run …/DiscoverMapCountBadge.test.tsx` | 0 | 2/2 PASS (DiscoverBadgeResult type-import resolves via shim) |
| Discover batch | `npx vitest run src/components/discover src/features/discover` | 0 | 66 files / **1092 PASS**, 3 skipped (pre-existing unrelated) |
| Lint | `npx eslint <touched files>` | 0 | 15 warns == baseline, 0 errors; new modules 0 lint output; no suppression change |
| Build | `env -C <worktree> npm run build` | **0** | built (post dead-import cleanup) |

## Phase 7A

NOT REQUIRED for S9a (architect + PLAN_REVIEW-confirmed) — a byte-for-byte pure-helper relocation behind a re-export shim has no runtime/data-path/backend change; the moved unit tests + the mount suite + tsc/build are the complete proof.

## Next (S9b)

`useDiscoverMapPresentation` presenter hook (overviewAreas 236-LOC + discoverBadge + areaResultSummaryText + segment builders + count memos) — High risk. The hook imports the relocated helpers from these new `presentation/` modules. Then S10 (handlers) + S11 (JSX) to reach <800. The re-export shim is deferred-cleanup (a later slice drops it + repoints importers, build-verified). #1864 stays a separate issue.
