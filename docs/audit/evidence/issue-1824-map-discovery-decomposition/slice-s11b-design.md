# Slice S11b — Design + target-refinement finding (ESCALATION)

Base: origin/main @ `d37228b3` (MapDiscovery.tsx 2181 after S11a). S11b extracts derived-const clusters into
presenter hooks (the S9b pattern). Early return `if (!isCityValid) return <CityNotSupported/>` at **L1768** —
presenter hooks must be called before it.

## Two architect corrections (reshape vs the Main Agent's framing)

1. **C1 (Landing/Journey predicates, L1604-1766) is NOT a clean liftable block.** It is interleaved with the
   existing `useDiscoverMapPresentation({...})` call (L1668-1697) + `handleOverviewAreaClick` (L1699-1720):
   several C1 members (mapLayerKind, isLandingState, isAreaFirstCityLanding, liveAreas, isTopGroupedAgri) are
   INPUTS to those, and regionGuideVisible/regionGuideRingActive consume `isRegionOverview` — an OUTPUT of the
   presentation hook. Lifting C1 as one hook needs a reorder/absorb around the presentation call = higher risk.
   **C1 belongs with S11c** (its mapLayerKind/journey predicates also feed the DiscoverRightPanel prop-assembly
   that S11c extracts). DEFER C1 to S11c.
2. **~1600 is NOT reachable in S11b.** The clean pre-return extractable clusters (C2 100 + C3 75 + C4 55 + C5 40
   ≈ 430 raw) net only ~−220 after call-site threading overhead → **honest S11b landing ~1960**. The ~360-line
   gap to ~1600 is locked in C1's interleaved predicates + the render JSX / DiscoverRightPanel prop-assembly =
   S11c scope. Hitting ~1600 in S11b would require scope-bleed into S11c or harmful over-merging. The
   ~1600/~1200 intermediate ratchet was an architect ESTIMATE, not user-ratified — only the ~1200 FLOOR is
   ratified. Refine: **S11b → ~1960 ; S11c → ~1200** (S11c absorbs the DiscoverRightPanel container heavy-lift +
   C1 + a handler hook; may split into S11c + S11d if reviewers want a tighter envelope).

## Recommended S11b scope (C2 + C3 + C4 + C5)

New hooks under `src/features/discover/presentation/**` (the S9b home). FLAT presenter pattern; inject deps
UNWRAPPED (memo-identity discipline).

- **H1 `useDiscoverGroupResults`** (C2, L353-448): returns groupResultsListings/TotalElements/isLoading/isError/
  refetch + groupResultsMarkers (groupResultsAnonRaw/AnonListings kept internal if no external reader). Members:
  the anon-raw/anon-listings/markers useMemos (toBe/not.toBe identity test) + the plain-const unified surface
  (S9b2 inverse — per-render identity expected). Anon/auth teaser-correctness + trustBadge:null invariant.
- **H2 `useFilteredAgriListings`** (C4, L463-515): returns filteredAgriListings; single useMemo, lift the
  10-entry dep array (L504-515) byte-for-byte.
- **H3 `useSchoolFirstDerivations`** (C3 L1018-1093 + C5 L1126-1165): returns schoolListings +
  schoolRadiusFallbackMarkers + schoolFirstLanding/Zone/AreaSchoolCount + schoolZoneLabels. CRITICAL ordering:
  called BEFORE the page-local `discoverBadge` useMemo (L1179 — reads schoolListings.length); if merging C3+C5,
  called after `focusedGroup` (L1098) and verified nothing in L1018-1115 reads schoolListings.
  **SAFER FALLBACK: 4 hooks** — split H3 into `useSchoolListings` (C3, at the current L1018 spot, no focusedGroup
  dep) + `useSchoolFirstCounts` (C5, after focusedGroup) to preserve schoolListings' exact evaluation point
  (render-identity-over-line-target discipline). Architect + my lean: the 4-hook split.

EXCLUDED (unchanged): badge/copy (page-local S9b2, the copy-fork guard); resolveMarkerPopover (post-return pure
module S10b); C1 (deferred to S11c). C3 schoolListings→page-local-badge dependency respected (hook returns it,
badge reads it).

## Gates (Med-High, opus review)

AC-VERBATIM (each cluster body byte-for-byte incl. the useMemo dep arrays, esp. C4's 10-entry L504-515);
memo-identity (toBe/not.toBe per moved useMemo; S9b2-inverse for the plain-const members); AC-READERS (every
consumer → hook return, zero surviving const; confirm no external reader of groupResultsAnonRaw/AnonListings);
AC-TSC/BUILD/LINT; AC-EXISTING-TESTS (MapDiscovery.groupResults / anon-school-radius / school-pill + the journey
batch). Ordering: H3/useSchoolListings before the discoverBadge useMemo (L1179); all hooks before L1768.

## Landing

S11b ~1960 (C2+C3+C4+C5). S11c ~1200 (RightPanel container + C1 + handler hook; possibly S11c+S11d). The ~1200
FLOOR remains the close criterion for #1824.
