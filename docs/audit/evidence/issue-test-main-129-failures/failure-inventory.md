# Frontend test-suite failure inventory — issue #1825

**SHA under test:** `ddb946d7` (local `main` == `origin/main` at capture time)
**Test runner:** vitest 3.2.4, command `node node_modules/.bin/vitest run`
**Capture method:** batched by subsystem (full-suite run OOMs — see below). Raw per-batch JSON + stdout under `baseline/run-1/`.
**Aggregator:** `baseline/aggregate.mjs` (parses all `baseline/run-1/batch-*.json`).

## Why batched, not full-suite
Running the entire suite (228 test files) in one `vitest run` process reliably crashes with a V8 JavaScript heap OOM (`FATAL ERROR: … heap limit`, surfaced as `Unhandled Rejection: Channel closed` / `ERR_IPC_CHANNEL_CLOSED`, exit 1) **before** vitest emits any summary. `vitest.config.ts` sets `all: false` for the same reason. Baseline therefore captured as 11 subsystem batches; the heavy `pages/broker` batch was further split to per-file runs. All 228 files covered.

## Aggregate totals (run-1, all runnable batches)
| Metric | Count |
|---|---|
| Total tests executed | 3522 |
| Passed | 3396 |
| **Failed** | **123** |
| Skipped | 3 |
| Failing files (runnable) | 10 |
| Files that could not run (OOM) | 1 (`EditListing.guard.test.tsx`) |

123 assertion failures + the un-runnable `EditListing.guard.test.tsx` (whose internal tests never executed) ≈ the issue's "~129" estimate.

## Failing files — count, signature, path
| # fail | Signature | File |
|---|---|---|
| 41 | `useAuth must be used within an AuthProvider` | src/components/discover/panels/__tests__/AreaSelectedPanel.test.tsx |
| 40 | `useAuth must be used within an AuthProvider` | src/components/discover/panels/__tests__/SchoolSelectedPanel.test.tsx |
| 25 | `useAuth must be used within an AuthProvider` | src/components/discover/panels/__tests__/AreaSchoolCombinedPanel.test.tsx |
| 8 | `useAuth must be used within an AuthProvider` | src/components/discover/panels/SchoolJourneyPanels.test.tsx |
| 3 | `useAuth must be used within an AuthProvider` | src/components/discover/__tests__/DiscoverRightPanel.test.tsx |
| 2 | `useAuth must be used within an AuthProvider` | src/components/discover/__tests__/DiscoverRightPanel.routing.test.tsx |
| 1 | agri config: unexpected extra field `facing` (`expected ['facing'] to deeply equal []`) | src/lib/listingFieldConfig.test.ts |
| 1 | route-access predicate: `expected true to be false` (`/broker/listings/new`) | src/lib/routeAccess.test.ts |
| 1 | quadrant bucketing: `expected 8 to be >= 10` | src/lib/map/areaMarkerBucketing.test.ts |
| 1 | duplicate `Saved` link: `Found multiple elements with the role "link" and name /Saved/i` | src/pages/__tests__/LandingPage.test.tsx |
| — | **OOM — file never completed (4GB+ heap, ~658s alone)** | src/pages/broker/__tests__/EditListing.guard.test.tsx |

## Shared error signature (119 of 123 failures)
```
Error: useAuth must be used within an AuthProvider
  at useAuth            (src/contexts/AuthContext.tsx:222:11)
  at useSavedListingIds (src/hooks/useSavedListings.ts:57:23)
  at PropertyCard       (src/components/discover/PropertyCard.tsx:117:31)
```
PropertyCard (line 117) unconditionally calls `useSavedListingIds()` → `useAuth()`. The six discover panel / right-panel test files render trees containing `PropertyCard` without an `AuthProvider` (and without `QueryClientProvider` / `AuthModalProvider`, also required by the same code path: `useSaveListing`, `useUnsaveListing`, `useAuthModal`).

**Introduction point:** Issue #1566 (server-backed saved homes, merged 2026-07-06) added the save/unsave feature to PropertyCard. The panel tests predate that provider dependency; their render helpers were not updated. This is stale test-harness setup, not a product regression (the #1566 feature is intentional and passed its gates).

## Flake / determinism
Not yet re-run for the 2-run determinism check (deferred to Slice 1 execution — see plan). The dominant 119 failures are deterministic module-context load errors (throw at hook call), not timing-sensitive, so flakiness is highly unlikely for Cluster A. The 4 singletons are deterministic value assertions. `SchoolJourneyPanels` reported as "timeout" is the same AuthProvider throw surfacing as an async render timeout, not a genuine flake.
