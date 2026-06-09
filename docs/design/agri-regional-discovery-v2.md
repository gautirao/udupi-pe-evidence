# Agri Regional Discovery — Right-Panel Journey v2 (Design)

Status: design / pre-implementation
Tracking milestone: **MVP3.1 — Agri Regional Discovery UX v2** (#33)
Parent epic: **#1426**
Phase 1 slice: **#1425**
Date: 2026-06-10

---

## 1. Motivation

MVP3 shipped agri regional groups: groups render in the right panel, selecting a group
filters/focuses the map (#1410), and the URL uses `group=<directionCode>:<bandCode>`
(e.g. `group=N:0_10`).

Manual UX feedback: the current labels are technically correct but not human-friendly,
and distance bands are baked into each group cell rather than behaving like visible,
removable filters.

- Current labels (server-composed): `North of Udupi · Within 10 km`,
  `South of Udupi · 10–25 km`, `East of Udupi · 50+ km`.
- Desired direction labels: `North of Udupi towards Kundapura`,
  `South of Udupi towards Mangalore`, `East of Bangalore towards Kolar`.
- Desired distance behaviour: `Within 10 km`, `10–25 km`, `25–50 km`, `50+ km`
  presented as visible/removable filters.

## 2. Grounding in the current implementation

- **Labels are composed server-side** in
  `RegionalAreaGroupsService.composeLabel(directionLabel, citySlug, bandLabel)`
  → `"North of Udupi · 10–25 km"`. `direction_label` / `band_label` come from
  DB-joined classification metadata. The frontend renders `group.label` verbatim.
- **Direction is pure bearing math** (`RegionalGeo.directionKey`) from the city
  centroid to the area centroid; bands are `[min, max)` ranges in `distanceBandKey`.
  There is **no town/landmark dataset** anywhere, so "towards <place>" is net-new data,
  not derivable today.
- **DTO today** (`RegionalAreaGroup`): `label, directionKey, distanceBandKey,
  listingCount, agriAcreage, areaKeys`. Nothing structured for independent
  direction/distance display.
- **URL**: `group=N:10_25` is a single coupled, regex-validated param in
  `src/hooks/useDiscoverUrlState.ts`; `selectRegionalGroup` PUSHes on select/clear and
  preserves `areaKey`.
- **Panel routing**: `src/utils/discoverPanelState.ts` `derivePanelContent` routes
  agri-first → `agri-selected` only when `areaKey` is present and never reads `group=`.
  That is the #1425 gap — selecting a group filters the map but leaves the panel on
  `agri-landing`.
- **Map data** for a selected group reuses `useAgriMapListings` (#1410), which consumes
  `areaKeys[]`. "All bands in a direction" is therefore a **client-side union** of the
  city's `N:*` group `areaKeys` — within-city aggregation only, no #1419 cross-city
  radius required.

## 3. Phase 1 decisions (this milestone, #1425)

Phase 1 is deliberately the smallest change that closes the visible gap.

- **Keep per-direction×band cards** on the landing — no direction-first regroup yet.
- **Keep existing labels** (`"North of Udupi · Within 10 km"`).
- **Keep the `group=<dir>:<band>` URL contract** — no `direction`/`band` params yet.
- **Skip "towards <place>" labels** in Phase 1.
- **No backend / DTO / model changes**, no Supabase seeding, no #1419.

What Phase 1 adds: a selected-region panel state for agri-first when a `group` is
selected (no `areaKey`), a header/chip with the group label + clear action, the matching
agri listings in the right panel (reusing the selected group's `areaKeys` and
`useAgriMapListings`), loading/empty/error states, listing → `/listing/:id`, and
clear → back to the group list. Browser Back/Forward and `group=` deep-links restore
state. Residential / area-first / school-first journeys and Start Over stay unchanged.

Full acceptance criteria and test plan live in issue #1425.

## 4. v2 design (parent epic #1426, after Phase 1)

Target mental model: **direction-first, distance-as-refinement, chips as the visible
filter state.**

1. **Direction-first landing** — one card per direction (fold `N:*` cells), with a
   roll-up count and the distance span it covers.
2. **Selected-region view** — filter header with a removable **direction chip** and an
   optional removable **distance chip**, a distance band segmented selector
   (`All · Within 10 km · 10–25 km · 25–50 km · 50+ km`, only non-empty bands enabled),
   and the listings list below; the map focuses on the selected region's `areaKeys`.
3. **Remove distance (keep direction)** — broaden to all bands in that direction via the
   client-side `areaKeys` union.
4. **Remove direction** — return to the landing direction list.
5. **Clear / Start Over** — wipe direction + band, keep `city` + `journey=agri-first`.

### URL contract (v2)

- Introduce `direction=N` + optional `band=10_25`; `band` without a valid `direction`
  is ignored (direction-first invariant).
- Keep legacy `group=N:10_25` as a **read-only alias**, canonicalised to
  `direction`/`band` on cold-load via REPLACE. Only write the new params going forward.
- PUSH on every user filter change (select direction, select/change band, remove a chip)
  so Back restores and Forward reapplies. Start Over and cold-load normalisation use
  REPLACE.

### "Towards <place>" labels

- **Preferred future approach: a frontend config map** keyed by `(citySlug, directionKey)`,
  e.g. `udupi: { N: 'Kundapura', S: 'Mangalore', E: 'Karkala' }`. Compose the display
  string frontend-side with **graceful fallback** to the current label when no entry
  exists. Zero migration, no Supabase.
- Promote to a DB/backend `direction metadata` column or a derive-from-landmarks service
  **only if needed later**. Deriving "nearest notable town along the bearing" requires a
  landmarks dataset that does not exist today.

### Optional backend follow-up (additive, not a gate)

Expose `directionLabel` ("North") and `distanceLabel` ("10–25 km") on the
`RegionalAreaGroup` DTO so the frontend stops string-parsing the composed `label`. Both
already exist inside `GroupAccumulator`. `@JsonInclude` keeps it backward-compatible;
leave the existing `label` field untouched.

## 5. Issue breakdown & sequencing

- **#1425** — Phase 1: selected group → right-panel listings (first slice; keeps cards
  and `group=`). Merge before the v2 items.
- **v2-A** — URL contract foundation: `direction`/`band` params + legacy `group` alias
  + canonicalising REPLACE. No UI; unblocks the rest.
- **v2-B** — direction-first landing + chips. Depends on v2-A.
- **v2-C** — independent distance filter + client-side direction union. Depends on
  v2-A/v2-B.
- **v2-D** — "towards" labels via frontend config map. Small; parallelisable.
- **v2-E** — Back/Forward + deep-link E2E hardening (extends the #1412 spec) +
  residential/school regression guard. Last.
- **v2-F (optional)** — additive backend `directionLabel`/`distanceLabel` DTO fields.

## 6. Out of scope (this milestone, unless explicitly pulled in later)

- **#1419** cross-city radius classification.
- **Supabase seeding** and any production data changes.
- **OpenSearch** work.
- **Backend DTO / model changes** — optional v2-F only; not a gate for the UX work.
- Unrelated Discover journeys (residential / area-first / school-first) beyond keeping
  them regression-safe.

## 7. Risks / trade-offs

- **`group` → `direction`/`band` migration** — low risk (pre-release agri feature); the
  legacy alias + canonicalising REPLACE protect existing tests (#1412 fixtures) and any
  shared links.
- **Client-side direction union** assumes the frontend holds all of a city's groups
  (true today). Document the assumption; it breaks if group fetching is ever paginated.
- **"Towards" config staleness/correctness** — hand-curated content; graceful fallback
  to the current label is mandatory.
- **PUSH-on-every-change history depth** — acceptable; Start Over collapses it. It is the
  only model that satisfies both "removing a filter updates the URL" and "Back restores
  the previous filter state".
- **Dead distance chips** — bands with zero listings must be hidden/disabled.
