# Slice S11c/S11d — Design + ~1200→~1700 floor-refinement finding (ESCALATION)

Base: origin/main @ `7e598574` (MapDiscovery.tsx 1925 after S11a + S11b). The FINAL decomposition slice(s) to
close #1824. Early return `if (!isCityValid) return <CityNotSupported/>` at **L1512**.

## The ~1200 → ~1700 finding (LOAD-BEARING)

Honest LOC math from 1925:

| Extraction | Mechanism | Net → landing |
|---|---|---|
| S11c DiscoverRightPanelContainer | 225-line call site (L1684-1908) → ~105-line container call (the ~30 inline closures + the footer JSX leave the page) | **-120 → ~1805** |
| S11d useDiscoverJourneyPredicates (C1) | ~146-line scattered predicate+comment region (L1340-1510) → ~38-line hook call | **-105 → ~1700** |
| handler command-hook | **REJECTED** (S10 grab-bag lesson — thin delegators + high-coupling handleAreaFirstBack stay page-local) | 0 |

**~1200 is NOT reachable; the realistic floor is ~1700.** The remaining ~1700 lines are dominated by TWO
~100-prop composition-root threading surfaces — `DiscoverMapCanvas` (L1581-1682, ~102 lines) and
`DiscoverRightPanelContainer` (~105 lines) — plus the unavoidable `useDiscover*` hook-call preamble + the effects
that must stay in the component. `DiscoverRightPanel` is ALREADY an extracted leaf; its 225-line call site is
composition-root wiring, not God-component logic. Going below ~1650 needs either (a) props-bundling into typed
sub-objects (a semantic no-op that breaks verbatim + just relocates threading) or (b) deleting threading
inherent to a ~120-prop panel (impossible without a behaviour change). Neither is a legitimate reduction —
the render-identity-over-line-target precedent (user-endorsed S7/S8) + the <800→~1200 re-baseline generalized.

**Close-criterion check — SATISFIED at ~1700:** after S11c+S11d, NO cohesive region exceeds ~600 LOC (the
return tree is ~230 lines of composition; the presentation/camera/journey/filters/marker-resolve clusters are
already in hooks/modules; the predicates in the new hook; the panel closures in the container). The remaining
mass is mechanical prop-threading + hook preamble = a CLEAN composition root, not a God component. The
user-ratified close criterion ("no region >~600 LOC; all cohesive clusters extracted") is MET at ~1700,
independent of the 1200 number (which was an estimate).

## Recommended path (decisive)

- **S11c = DiscoverRightPanelContainer alone** (HIGH — the ~100-110-prop parity surface + the moved
  closures/footer; opus review + performance-analyst pass) → ~1805. Under src/features/discover/views/ (the S11a
  pattern). The JSX + inline closures (onSelectAreaKey L1772-1789, onApplyAgriFilters L1856-1869, onBackToRegion
  L1734-1739, the footer JSX L1887-1907) + ~25 trivial inline arrows move VERBATIM; every closed-over value
  becomes a typed prop (~100-110). Badge/copy stays page-local + threaded (S9b2/S8 guard — the container imports
  NO badge helper). Identical DOM (same DiscoverRightPanel root; DiscoverMapCanvas + DiscoverOverlaySheets + the
  flex wrapper unchanged).
- **S11d = useDiscoverJourneyPredicates alone** (MED-HIGH — pre-layer ordering: called BEFORE
  useDiscoverMapPresentation so its mapLayerKind/mapLayerCategory feed the presentation call). Extracts the C1
  predicates (isLandingState/isAreaFirstCityLanding/liveAreas/cityHasNoListings/isTopGrouped*/mapLayerKind/
  schoolRadiusOverlay/showSchoolBreadcrumb/isSelectedGroupState/isAreaFirstSelectedAreaState/isMarkerPopoverEligible/
  selectedGroupName) into one hook; the 2 genuinely post-layer one-liners (regionGuideVisible/Ring, read
  isRegionOverview) stay page-local → ~1700. Under presentation/**.
- **NO handler hook** (S10 grab-bag). **NO props-bundling.** Two SEPARATE PRs (not one — two HIGH/MED-HIGH
  verbatim moves in one diff defeats the small-PR/blast-radius discipline + makes the ~100-prop parity review
  intractable).
- **CLOSE #1824 at ~1700** on the close criterion, recording the ~1200→~1700 variance under the ratified
  render-identity/re-baseline precedent.

## S11c gates (HIGH, opus + perf)

AC-VERBATIM (JSX byte-for-byte incl. onSelectAreaKey/onApplyAgriFilters/onBackToRegion/footer + all
#1067/#1489/#1547/#1588/#1607/#1798/#1806/#1817 rationale comments); AC-PROP-PARITY (~100-110-prop table +
explicit no-any DiscoverRightPanelContainerProps interface, S11a pattern); AC-BADGE-FORK-GUARD (container imports
no formatDiscoverBadgeCopy/deriveSchoolRadiusPillNoun/hasActiveAnonPropertyFilter; badge copy threaded as props);
AC-COMPOSITION (identical DOM — same root; DiscoverMapCanvas + DiscoverOverlaySheets + flex wrapper unchanged);
AC-PERF (performance-analyst — confirm render-neutral; the container not React.memo'd; the moved closures recreate
per render as before; critically the existing activeContextChips L1224 / filtersContent L1322 useMemo identity
that guards DiscoverRightPanel re-renders passes through untouched); AC-EXISTING-TESTS (journey/panel/#1547/#1798/
agri mounts unedited). Sequence S11c then S11d serially (both edit MapDiscovery.tsx).
