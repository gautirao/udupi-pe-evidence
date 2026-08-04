# Issue #2076 — Parity fixture spec (Stage-2 seed SPECIFICATION ONLY)

Stage-1 deliverable (AC7). This document specifies the shape of the Stage-2
parity seed. **It contains zero SQL.** The seed itself — and any Flyway
migration or `scripts/db/fixtures/*.sql` file — is explicitly out of scope
for Stage 1 (forbidden by the executor handoff) and is Stage-2 work.

## Why the seed is deferred, not just delayed for convenience

The tree SHAPE (which Direction, if any, grows a Local Destination level;
which areas cluster densely enough to render as a visual cluster) is an
**output** of the `GEOMETRIC_BISECTION` navigation-tree generator, not an
input the seed can declare directly. The seed can only author
**geography** — area polygons, `city_regions`, membership rows, and
`city_region_policy` knobs — and then run it through the real
prepare→launch pipeline (see `fixture-environment-manifest.md` §2) to see
what shape comes out. Getting a specific target shape (e.g. "at least one
Direction with a Local Destination, at least one with direct AREA children,
at least one dense cluster") is therefore an **empirical tuning loop**:
author geometry, run prepare, inspect the emitted tree, adjust polygons,
repeat.

Two consequences that justify deferring this to Stage 2 rather than
attempting it now:

1. **It cannot be authored correctly in one pass.** A Stage-1 attempt would
   produce a seed that looks plausible but has not actually been proven to
   emit the required shape — exactly the "fabricated verdict" failure mode
   this whole Stage-1 run is designed to avoid elsewhere (see the
   `PENDING_STAGE_2_AUDIT` status in `parity-matrix.md`).
2. **Authoring it before PR #2074 merges risks an amendment PR.** #2074
   changes the visible Discover pricing contract (rent/lease monthly
   pricing). If the seed's inventory mix needed adjustment once #2074's
   exact field names/shapes are final, a Stage-1-authored seed would need a
   follow-up PR anyway — better to author it once, after #2074, with the
   final contract in hand.

The seed must **not** ship as a Flyway migration — per the architecture
decision, it belongs in `scripts/db/fixtures/` (test-only data), run through
the real generator against a local throwaway PostGIS instance, never applied
to the hosted/shared database.

## 1. Target tree shape

Minimum shape required to unblock every `BLOCKED` row in `parity-matrix.md`:

- At least 3 Direction-level nodes under root (enough to exercise "at least
  one of each of the three Direction sub-shapes" below without needing every
  real Direction to serve double duty).
- **At least 1 Direction with direct AREA children** (no intermediate Local
  Destination level) — resolves `directionWithDirectAreas`.
- **At least 1 Direction with at least one Local Destination child** —
  resolves `directionWithLocalDestinations`.
- **That Local Destination must itself have at least 2 AREA children** (not
  1 — see the "no one-child Local Destination" invariant below; a
  Local-Destination-with-exactly-1-area, besides being an actual product
  contract violation per issue #2014, would also make A04's "member subset"
  assertions degenerate to a single row and prove nothing) — resolves
  `localDestinationWithAreas`.
- **At least 1 Direction (or Local Destination) whose AREA children are
  dense enough to render as a visual cluster** rather than individual pins
  — resolves `denseAreaDirection`. "Dense enough" is a rendering-threshold
  question owned by the marker-layer component
  (`src/components/map/AreaMarkerLayer.tsx`), not a fixed area count; the
  seed should aim for materially more areas in one small geographic
  footprint than any non-dense Direction has, and Stage 2 must verify the
  resulting render actually clusters (not just infer it from area count).

## 2. Area / geometry table

Not authored in Stage 1. Specification for what Stage 2 must produce:

- Real (or realistic synthetic) polygon geometry for each fixture area —
  the generator's bisection logic depends on actual spatial relationships,
  not placeholder point coordinates, so a naive "N areas at arbitrary
  lat/lon" seed would not reliably produce the target shape.
- Area names distinct enough to be human-legible in evidence (screenshots,
  matrix rows) without colliding with real Udupi or Bangalore area names —
  avoids a reader mistaking fixture data for either real dataset.
- Every canonical `area_key` used by the fixture must appear **exactly
  once** in the generated hierarchy — this is a #2033-locked invariant the
  Stage-2 `ParityFixtureTreeShapeIT` (see §5) must assert directly, not
  merely hope for.

## 3. Region-policy knobs

Not authored in Stage 1. `city_region_policy` (or equivalent) knobs that
Stage 2 must tune during the empirical loop described above:

- Density/clustering threshold knob(s) that decide when a set of AREA
  children collapses into a visual cluster vs. rendering as individual
  pins — must be tuned until at least one fixture Direction crosses the
  threshold (for `denseAreaDirection`) and at least one stays under it (so
  `directionWithDirectAreas`/dense are provably different states, not the
  same state under two names).
- Any max-depth / max-children knob relevant to the #2033 locked
  shallow-hierarchy contract (City → Direction → optional Local Destination
  → AREA, no deeper) — the seed must never trip the generator into
  producing a shape #2033 forbids.

## 4. Inventory mix (sale / rent / lease)

Not authored in Stage 1. Required once #2074 lands:

- Every fixture AREA needs at least one **sale** listing (unblocks A08 and
  everything downstream of a selected-AREA sale state without any #2074
  dependency).
- At least one fixture AREA needs both a **rent** and a **lease** listing
  once #2074's approved contract (`monthlyRentRupees` authenticated /
  `monthlyRentBand` anonymous, applies to rent AND lease, sale unchanged) is
  live — unblocks A09/A10.
- At least one fixture AREA needs a **filter-boundary-crossing** mix of
  listings (e.g. price points that land on both sides of a documented filter
  threshold) — required for A12/A13's filtered/empty-state assertions to be
  meaningful rather than vacuously true.
- Sale pricing in the fixture must be realistic enough that `formatPrice()`
  (per `lib/formatters.ts`) does not need any special-case handling —
  matches the general "no literal expected price STRING in the matrix"
  rule; the fixture proves the FORM (band vs. exact), never a frozen number.

## 5. School rows for A20

Not authored in Stage 1. A20 ("Schools shortcut from a selected AREA
retaining area context") needs, at minimum, one school row associated with
at least one fixture AREA so the school-first journey's area-scoped count
is non-zero and distinguishable from a city-wide count (mirroring the exact
kind of badge-scoping assertion F2 already proved necessary for the
listings badge). Exact school-row shape (name, location, any
count-contributing fields) is deferred to Stage 2, contingent on whichever
schema `PublicSchoolRadiusListingsPage`/`PublicSchoolRadiusListingCard`
(identified in the plan's production-owner map) actually consume.

## 6. Assertion list for a future `ParityFixtureTreeShapeIT`

Specification only — this backend integration test is **not written** in
Stage 1 (writing it would touch `backend/**`, forbidden by this stage's
boundary). Once Stage 2 authors the seed and runs it through the real
prepare→launch pipeline, `ParityFixtureTreeShapeIT` must assert:

1. Exactly **N** Direction children of root, where N is whatever the final
   seed geometry produces and this assertion pins it (prevents silent
   drift if the generator or its tuning knobs change later).
2. **At least 1** Direction with direct AREA children (no Local Destination
   intermediate).
3. **At least 1** Direction with at least one Local Destination child.
4. **No** Local Destination has exactly 1 AREA child (the "no one-child
   Local Destination" invariant from the issue's functional acceptance
   contract).
5. Every canonical `area_key` used by the fixture appears **exactly once**
   in the generated hierarchy.
6. Maximum tree depth is within the #2033-locked contract (City → Direction
   → optional Local Destination → AREA — never deeper).
7. **At least 1** Direction (or Local Destination) has enough AREA children,
   in a tight enough geographic footprint, to be expected to render as a
   visual cluster — this assertion checks the *generator's structural
   output* (area count + bounding-box tightness), not the *frontend's
   rendering decision*; the frontend cluster-threshold behaviour itself is
   verified separately by the Stage-2 `e2e-parity/a05-*.spec.ts` against a
   live render, not by this backend IT.

## 7. Offline map tile pack — licence question (recorded, not resolved)

Per the repo-owner's OQ3 ruling: deferred to Stage 4 (when baselines are
actually captured). This document records the requirement only:

- **Open question:** which tile-provider licence terms (if any) permit
  redistributing a small offline tile pack scoped to the fixture city's
  bounding box, for use in committed visual baselines that must not depend
  on live third-party tile variability (`fixture-environment-manifest.md`
  §10/§14).
- **No tile pack is committed by this branch or any Stage-1 deliverable.**
- **Stage-4 fallback if redistribution turns out to be barred:** a
  committed flat-colour tile substitute plus the masked-canvas + numeric-
  assertion strategy already specified for full-map frames in
  `fixture-environment-manifest.md` §10/§14 — i.e. the fallback is not a
  new invention, it is the same strategy already adopted for A21/A22/A24
  extended to every map-showing baseline if no legally redistributable real
  tile pack can be sourced.
