# Slice S10 — Design (boundary reshape: S10a + S10b, defer S10c)

Base: origin/main @ `ed0def53` (MapDiscovery.tsx ~2448 lines after S9b2). Early return: `if (!isCityValid) return <CityNotSupported/>` at **L1792**.

## Boundary decision (Main-Agent-ratified 2026-07-13, option A)

The Main Agent's sketch (one `useDiscoverMapHandlers` grab-bag hook) is the wrong boundary. Architect finding:

- **S10a (LOW) — `useDiscoverBadgeAnnounce` HOOK**: the Issue #1817 aria-live announce cluster
  (announcedBadgeText useState L1265 + badgeAnnounceTimer useRef L1266 + debounced effect L1267-1285).
  Pre-early-return, cohesive, mirrors S2a `useReducedMotion`. **Ships a new renderHook + fake-timers test**
  (ZERO existing coverage). No badge-cluster drag (discoverBadge/focusedGroup passed as value props;
  formatDiscoverBadgeCopy imported; the S8 fork-guard consts untouched).
- **S10b (MED) — `resolveMarkerPopover` pure MODULE** (not a hook): the marker-resolve+stepper cluster
  (currentMapMarkerListings L1803-1819 + markerPopoverStepper L1827-1834). handleStepMarkerListing stays inline.
  #1798/#1810/#1815 user-locked no-camera stepper semantics → opus verbatim review.

**Packaging:** two sequenced PRs (S10a first). S10a LOW + S10b MED are independent, different-risk-tier —
keeps the sensitive marker move in a clean-rollback/focused-review unit (S9a/S9b1/S9b2 precedent).

## Scope-reshape (S9b2-TDZ analog, but NOT a TDZ)

The marker cluster's ~15 inputs are ALL declared before L1792, so a pre-early-return hook is *technically*
feasible — but **semantically wrong**: the cluster contains zero React hooks, and hoisting it above the early
return would run marker resolution on the invalid-city `<CityNotSupported>` return path. Correct shape is a
pure module called where it sits today (post-L1792) — the S3 `resolveMarkerListings` precedent.

## Rejected / deferred (recorded so S11 doesn't re-open speculatively)

- **`useDiscoverMapHandlers` grab-bag** (handleOverviewAreaClick + 6 thin delegators): relocation-not-cohesion,
  ~15 injected props across 6 unrelated concerns, PLAN_REVIEW-hostile → page-local.
- **bbox cluster**: STRUCTURALLY BLOCKED — mapBbox read synchronously by useDiscoverMapData at L848
  (S7-deviation class).
- **S10c `useDiscoverDebugBridge`** (__debug effect L1329-1360, ~-32 LOC): DEFERRED (keep S10 minimal).

## Line delta & <800

S10a ~-18 + S10b ~-28 = combined ~-45 (2448 → ~2403). S10 does NOT approach <800 — **S11 (the ~575-line JSX
return L1870-2445) is the only lever that reaches the composition-root target.**

## S10a extraction detail

Move L1265 (useState '') + L1266 (useRef timer) + L1267-1285 (effect) VERBATIM into the hook. Inputs as value
props: discoverBadge, selectedArea, focusedGroup, city, urlStateQ (the one permitted delta: `urlState.q` →
`urlStateQ`). Hook imports formatDiscoverBadgeCopy + CITY_CONFIG directly. Returns the announcedBadgeText string;
the aria-live div (~L2109) reads it. Effect internals byte-for-byte: the `if (discoverBadge.loading) return`
guard, the 500ms clearTimeout+setTimeout debounce, the `!visible ? '' : formatDiscoverBadgeCopy(...)` body with
the scopeLabel ladder (selectedArea?.areaLabel ?? focusedGroup?.name ?? city label) + the homes/properties noun,
the cleanup, the `eslint-disable-next-line react-hooks/exhaustive-deps`, and the dep array.
