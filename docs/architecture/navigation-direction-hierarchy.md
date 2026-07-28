# Navigation tree: the DIRECTION node (#1956 PR1)

## Why this exists

A production navigation revision was generated, validated (13/13 pre-existing invariants), promoted,
and then found to be contract-invalid and rolled back. Root cause: `NavigationTreeGenerator` never
emitted a node for a city's macro-region ("Direction") — the region only ever traveled as the
`region_key` *column* on every CLUSTER/AREA row. With `max_safety_depth = 0` (Bangalore's actual
policy value) the generated tree collapsed to `City -> AREA`: every area became a root node with
`parent_node_id = NULL`. Publicly, `GET /navigation/root` returned hundreds of AREA children instead
of a handful of Directions, `GET /navigation/{CENTRAL|E|N|S|W}` 404'd, and `navigation-path` ancestry
was empty for every area.

The product contract allows exactly two public shapes:

```
City -> Direction -> AREA
City -> Direction -> Local Destination (CLUSTER) -> AREA
```

Direction must be a genuine **ancestor node** in the tree — not only row metadata — so that root
listing, ancestry, and resolve all agree with each other by construction.

## Node representation chosen

- New node kind: `DIRECTION`, alongside the existing `CLUSTER` and `AREA`.
- New node key: `NavigationKeys.directionNodeKey(regionKey)` = `"d:" + slug(regionKey)` — a pure
  function of geography, matching the `"a:"`/`"c:"` convention (`#1955 D5`). No surrogate id, no
  iteration-order dependency, and (unlike cluster keys) no collision disambiguation is ever needed:
  region keys are unique per city.
- `NavigationTreeGenerator#generateRegion` emits exactly **one** DIRECTION node per region, at
  depth 0, `parent_node_id = NULL`, `ancestor_keys = []`. Its `region_key` is the region's own key,
  `area_key` is `NULL`, `descendant_area_count` is the region's total member-area count, bounds are
  computed from all its members (the same bounds helper CLUSTER nodes already use), representative
  areas are chosen via the existing `CENTROID_NEAREST` selection, and `display_label` is the
  region's canonical `city_regions.display_label`.
- Every one of the region's members is then expanded **beneath** the DIRECTION node, starting at
  depth 1 (`parent_node_id` = the Direction's id, `ancestor_keys = [directionKey, ...]`). Deeper
  CLUSTER recursion appends to `ancestor_keys` exactly as it already did.
- Directions are now the **only** root nodes. The city-wide, gapless `display_order` counter
  `#2024` introduced for roots (to avoid a collision class when hundreds of AREAs were roots) is
  preserved unchanged — it now simply numbers a handful of Directions (1..N) instead of hundreds of
  areas. Direction order follows the region's **canonical** `city_regions.display_order`
  (CENTRAL, N, E, S, W), not the `region_key` alphabetical sort `generateCity` still uses for
  processing determinism; ties (e.g. every region defaulting to the same order) are broken by
  `region_key` for determinism. Children beneath one Direction keep the pre-existing per-parent
  `local_order` 1..M — collision-free, since they now share a *real* parent instead of `NULL`.

## `max_safety_depth` semantics — unchanged for operators

`max_safety_depth` still means exactly what it meant before this change: **how many CLUSTER levels
may nest beneath a Direction**. Existing policy rows keep their meaning; Bangalore's `0` still
yields `City -> Direction -> AREA` with zero CLUSTER levels.

Mechanically, the generator's recursion now compares a **cluster depth** (`depth - 1`, since depth 0
is occupied by the Direction) against `max_safety_depth`, instead of comparing `depth` directly as
before this change. This is a pure re-basing, not a relaxation: the same number of CLUSTER levels is
still allowed, shifted by exactly the one new Direction level sitting above them.

`NavigationTreeValidationService#checkMaxDepth` (invariant #11) mirrors this from the validation
side: it now permits `depth <= max_safety_depth + 1` rather than `depth <= max_safety_depth`, for the
same reason. `max_direct_children`'s meaning is untouched.

## The missing invariant (#14)

A 14th, purely additive invariant was added to `NavigationTreeValidationService` — this is the rule
whose absence let the incident's flat tree pass all 13 pre-existing checks:

- `MISSING_DIRECTION_ANCESTOR`: fires when a root node is not a DIRECTION, when a non-DIRECTION
  node has empty `ancestor_keys`, or when a non-DIRECTION node's root ancestor is not DIRECTION-typed.
- `INVALID_HIERARCHY_SHAPE`: fires for an unrecognized node kind (outside
  `{DIRECTION, CLUSTER, AREA}`), for a DIRECTION node ever appearing below depth 0, when a node's
  own `region_key` disagrees with the `region_key` of its DIRECTION ancestor, for any node deeper
  than `MAX_PUBLIC_DEPTH` (2), or for any CLUSTER at depth >= 2 (a forbidden third public level).

None of the original 13 checks were touched.

The depth ceiling is deliberately **absolute**, not policy-conditional. It is independent of
invariant #11's operator-configurable `max_safety_depth`: a tree can satisfy #11 (the policy permits
deeper recursion) and still fail #14 (the product contract does not expose that depth publicly).
Making it per-city or policy-driven would leave a path by which some future city could promote a
contract-violating tree — the exact class of defect that cost a full de-promotion cycle here.

Deep-cluster generation capability is preserved and tested at the algorithm level; the promotion
pipeline now rejects it product-wide per the locked five-Direction/no-third-level contract. Concretely,
that split is:

- **Algorithm generality** — `NavigationControllerTest`'s stale-cluster-key resolution tests build
  multi-level cluster graphs directly in memory (`buildGraph()`, mocked graph cache, no prepare call)
  and still prove the resolver picks the *deepest* containing ancestor across several nested levels.
  #1955's resolution algorithm is untouched and ungated by the promotion-time contract.
- **Promotion pipeline** — the integration tests that actually call `prepareValidateAndPromote` use
  fixtures that produce a contract-conformant tree (`Direction -> [Local Destination] -> Area`) and
  assert `PREPARED`. That is the guarantee going forward: nothing deeper than the locked shape can
  ever reach VALIDATED or PROMOTED.

## Cache correctness (#1956 D11)

`NavigationHierarchySafetyPoller#reconcile` previously iterated only
`PublicActiveCityRevisionReader#findAll()`, which returns cities that currently **have** a PROMOTED
revision. A de-promoted (or rolled-back, or deactivated) city simply falls out of that result set —
so its cached graph was never evicted and kept serving forever.

The poller now also asks `NavigationGraphCache#cachedCitySlugs()` for every city slug the cache
currently believes is active, and calls `NavigationGraphCache#evict(citySlug)` for any cached slug
absent from the current PROMOTED-revision result set. `evict` removes the active pointer first (so
no new request can resolve it) and then invalidates that pointer's cache entry — safe alongside an
in-flight `refreshActiveRevision`'s grace-scheduled eviction of a *different* (older) revision key.
