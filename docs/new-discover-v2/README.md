# Discover V2 — Planning Audit & Migration Plan

**Status:** Planning only. No production code, migrations, or APIs were changed to produce this
plan. No PRs opened. Repo: `gautirao/udupi-property-explorer`, audited at `main`
(Flyway `V120`, jCodemunch index truncated at 2000/8065 files — see caveats in each doc).

**Date:** 2026-07-21 (audit); delivery plan restructured 2026-07-21 into feature-sliced gates, then
revised same-day to a recursive, variable-depth Areas hierarchy — see notes below.

## Delivery structure

[06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md) is organized as **4
sequential feature gates, max 6 implementation PRs total**, each a complete, sign-offable customer
journey (frontend + backend + map + URL state + desktop + mobile + accessibility + loading/error +
tests + real-data E2E + visual comparison), delivered one at a time:

1. **Unified Discover shell** — 1 PR.
2. **Schools journey** — 1 PR.
3. **Areas journey** — 2 PRs (recursive hierarchy generation/preview/promotion enablement, then the
   full adaptive-depth UX).
4. **Agricultural journey** — 2 PRs (Town/Destination data enablement, then the full UX).

The audit evidence in docs 01–05 is **not** rewritten wholesale — only corrected where direct
re-investigation found a stale claim (see "Recursive hierarchy revision" below), and the delivery
sequencing in doc 06. See doc 06 for full detail, the decision gates each feature requires before
it can start, and the explicit sign-off checklist per feature.

## Recursive hierarchy revision (2026-07-21, same day as the feature-slice restructure)

Areas' scope was revised from a single flat "optional cluster" level to a genuinely **recursive,
variable-depth** hierarchy: `City → primary directional region → zero or more nested local
directional clusters (a cluster may contain sub-clusters, to a policy-bounded depth) → canonical
area → listings`. Depth adapts per city (e.g. `Hubli → North → Vidya Nagar` vs.
`Bangalore → North → Thanisandra & R.K. Hegde Nagar → Hebbal & Nagawara → Hebbal`) and is never
hardcoded in the frontend. This was grounded in 4 parallel investigation agents before writing any
plan content:

- **City-launch pipeline, directly re-verified.** The V118 migration header's claim that
  sandbox→production promotion is "PR8+ concerns" is **stale documentation, not a real gap** —
  `CityLaunchPromotionService.launch()` is fully implemented and covered by real Testcontainers/HTTP
  integration tests driving the actual prepare→validate→promote cycle. Areas PR A extends this
  proven, already-tested mechanism to a seventh table, rather than building promotion from scratch.
  See the correction in [02-production-baseline-audit.md](02-production-baseline-audit.md) §C.6.
- **No existing tree/hierarchy pattern anywhere in the codebase** (confirmed by an exhaustive
  schema search) — the recursive data model is genuinely net-new. Chosen: adjacency list with
  denormalized `depth`/`ancestor_ids` and node-materialized counts/bounds (not a closure table or
  `ltree`), following the existing `city_regions`/city-launch sandbox-and-promote conventions.
- **#1910 is confirmed shipped but flat/non-recursive** by design (its own non-goals rule out new
  persistence) — retained as a narrow compatibility layer, not extended. **#1951 is not superseded**
  but needs a targeted amendment from "one optional extra level" to a self-referential recursive
  node type; its naming/threshold/display philosophy already generalizes unchanged. See
  [05-issue-roadmap-reconciliation.md](05-issue-roadmap-reconciliation.md).
- **A typed navigation API + ancestry resolver** (`GET .../navigation/{nodeId}` +
  `GET .../areas/{areaId}/navigation-path`) and a single stable `node` URL param (replacing the
  earlier-proposed serialized cluster-path param) were recommended based on this repo's actual DTO
  and URL-state conventions, not invented from scratch.

Full detail — the generation algorithm, invariants, City Launch Preview extension, override model,
and promotion flow — is in [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md)
Feature 3. The four-gate / six-PR structure, and Areas' A/B split, are unchanged by this revision.

## Hierarchy loading & caching architecture (approved, 2026-07-21, same day)

A further approved decision fixes how the promoted hierarchy is served: **Postgres** stays
authoritative for all hierarchy structure/revisions/promotion; **OpenSearch** owns listing search
and dynamic listing-count aggregations only (still optional/disabled); a new **application-level
hierarchy cache** gives immutable, revision-keyed (`citySlug:revisionId`) in-memory access to the
promoted navigation graph — eagerly preloaded at startup for all public-active cities with
readiness gating, refreshed on a new `CityNavigationRevisionPromoted` AFTER_COMMIT event plus a
30–60s safety poll (load → validate → atomic pointer swap → grace-period eviction; restart is
manual recovery only), with a single-flight request fallback, an isolated preview-cache namespace,
and a separate short-TTL dynamic-count cache rolled up from unique leaf areas. Grounded in direct
code investigation (three agents): promotion currently publishes no event at all; no Redis exists
(Caffeine is sufficient initially); an Actuator named-health-group precedent and a DB-poller
precedent already exist to follow; Bangalore-scale graphs are low-single-digit MB; and the current
three-query region-count shape in `DiscoverSummaryService` must be **replaced** by (not wrapped
under) the new single area-level roll-up. All scoped inside **Areas PR A** — no extra caching PR;
still 4 gates / 6 PRs. Full detail in doc 06 Feature 3, "Hierarchy loading & caching architecture."

## Correction pass (approved, 2026-07-21, same day) — 13 narrow corrections, no redesign

A final review-driven correction pass resolved the remaining contradictions and operational gaps
in doc 06 (each marked "Correction N" inline where it landed):

1. **No live `listing_count` on `navigation_nodes`** — structural geography only (including a
   structural `descendant_area_count`); live counts come exclusively from the separate count
   service; preview counts are display-time merges, never part of the checksum/diff/revision.
2. **Public identity is the stable natural `node_key`** — in the URL (`node=<stable-node-key>`),
   the API paths, React Query keys, and ETags; surrogate IDs stay database-internal; stale links
   resolve via a simple three-step ladder (node_key → area_key → nearest valid ancestor), no
   surrogate-ID history lookup.
3. **Rollback wording unified** — expand/contract everywhere: application code disables, applied
   Flyway tables stay; same standard for Agricultural PR A.
4. **Active-revision pointer resolved** — the existing `city_launch_revision` table with its
   `uq_clr_current_promoted` partial unique index is the authoritative source; no new pointer
   table; the two-query startup preload is now confirmed, not provisional.
5. **A complete seed-to-production operator runbook** added (input contract, 18-step workflow with
   [exists]/[PR A] markers grounded in the actual admin endpoints, launch fixtures).
6. **Enforceable performance budgets** — baseline → recorded budgets → acceptance fails if
   exceeded, with explicit merge gates (zero-SQL cache hits, no N+1, 100k/200k/500k listing-volume
   assessment, roll-up scales with areas not listings).
7. **Overrides simplified** — six initial operations, no merge-clusters action unless real
   preview usage demonstrates need.
8. **`AreaCountProvider` abstraction** (Postgres + OpenSearch implementations, shared roll-up,
   parity-tested) keeps OpenSearch strictly non-blocking.
9. **Metrics tiered** — required-initial vs secondary; observability never delays the feature;
   bounded cardinality enforced.
10. **Shell E2E corrected** — no false "switch city" claim while one city is live; disabled-city
    interaction asserted instead.
11. **Shell decisions resolved** — city-scoped autocomplete; nearest-valid-ancestor deep-link
    fallback; a Discover-scoped React context façade over URL state (no duplicate store).
12. **Agricultural rings are geodesic-verified** (sampled distances within tolerance) — projected
    shape distortion is no longer an acceptance criterion.
13. **The mock's full adaptive-depth intent re-confirmed** — Hubli shallow path, Bangalore deep
    path, the Hebbal breadcrumb example, and identical direct-search/guided ancestry all remain
    explicit acceptance requirements.

**Adversarially reviewed.** Before finalizing, 6 parallel specialist agents challenged the plan
from product-completeness, frontend-architecture, backend-feasibility, map/geospatial,
functional-parity, and testing/rollout-risk perspectives. The plan's 4-gate / 6-PR structure held
up (the reviewers confirmed the Areas/Agricultural 2-PR splits are unavoidable and the count can't
safely go lower), but the review surfaced real gaps that are now folded into doc 06 directly:
an unflagged product decision (deep-link-to-unavailable-data fallback, now **D-Shell-2**); a
hidden precondition (whether the V118 city-launch promotion pipeline has actually shipped, now
**D-Areas-5**); no plan for `MapDiscovery.tsx`'s prop-drilling risk in Feature 1 (now **D-Shell-3**
plus an explicit sign-off item); an unbounded dependency on issue #1910 (now **D-Areas-6**'s
2-week timeboxed default); unquantified #1926/#1927 test-infra scope inside Agricultural PR A (now
**D-Agri-2**); an understated "just reuse arc-sampling primitives" characterization of the
Agricultural concentric-ring work (now scoped as real geometry/UX work); an unfalsifiable #1943
closure criterion (now gated on the issue's own original repro coordinates); a missing
debounced-viewport-race regression test in Areas PR B; two under-named retention items (the
listing-peek popover in Areas, the full Agri panel chain in Agricultural); and an explicit
ownership rule for the final cross-feature regression run. See doc 06 for exactly where each fix
landed.

## What this is

A repository-grounded plan for transforming the existing production Discover page into the
frozen Discover V2 design (`docs/design/retrends-design-system/ui_kits/new_discover/`), produced
by 7 parallel specialist audits (design, frontend, map/geo, backend, functional parity, testing,
issue/roadmap) reconciled by a lead pass.

## Documents in this folder

| Doc | Contents |
|---|---|
| [01-frozen-design-audit.md](01-frozen-design-audit.md) | Manifest structural validation, live-browser walkthrough of all 20 states, guide-vs-rendered-reality reconciliation |
| [02-production-baseline-audit.md](02-production-baseline-audit.md) | Current frontend architecture, map/geospatial implementation, backend data model & city-launch pipeline |
| [03-functional-parity-matrix.md](03-functional-parity-matrix.md) | Every design state + cross-cutting capability classified ALREADY-BUILT / VISUAL-ONLY-CHANGE / NEEDS-REFACTOR / MISSING-BACKEND / MISSING-FRONTEND / DESIGN-NOT-SPECIFIED |
| [04-testing-quality-gates.md](04-testing-quality-gates.md) | Current test/CI infrastructure and per-slice verification gates for the rollout |
| [05-issue-roadmap-reconciliation.md](05-issue-roadmap-reconciliation.md) | How #1882/#1887/#1900/#1910/#1911/#1936/#1943/#1951/#1740 etc. relate to this plan |
| [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md) | **The plan.** Feature-sliced delivery plan: 4 sequential feature gates (Unified Shell → Schools → Areas → Agricultural), max 6 implementation PRs total, each feature fully sign-offable end to end before the next begins |

## Headline findings (read this if nothing else)

1. **Discover V2 is much further along than the design brief assumes.** The compass-directional
   region layout, bidirectional map/panel sync, school markers + radius search, the directional
   search-sector wedge, and anonymous price-band coarsening are **already built and
   production-wired**. This is a design-to-production *reconciliation and completion* exercise for
   large parts of the surface, not a from-scratch build.
2. **Two parallel backend region models coexist today**: the legacy `area_groups` table (flat,
   editorial, no Centre bucket — what production currently reads) vs. the new `city_regions` table
   (proper N/E/S/W/Centre with versioning, built under issue #1882, confirmed shipped). Resolution:
   adopt `city_regions` as the root of the new recursive tree — see finding 3 below and
   [06](06-target-architecture-and-pr-plan.md) Feature 3.
3. **Production must support a genuinely recursive, variable-depth navigation hierarchy** (a
   cluster may contain sub-clusters, to a policy-bounded depth) — not a single flat "optional
   cluster" level as originally scoped. No table, no generator, and **no existing tree pattern
   anywhere in this codebase** exist for this today (confirmed by exhaustive schema search).
   Issue #1951 is the design charter (needs a targeted recursive amendment, not superseded); issue
   #1910 is a confirmed-shipped but flat, non-recursive projection, retained as a narrow
   compatibility layer. This is the largest single scope item in the whole plan — see
   [06](06-target-architecture-and-pr-plan.md) Feature 3 for the full recursive model, generation
   algorithm, typed API, City Launch Preview extension, and promotion flow.
4. **The Schools journey is fully built end-to-end already** (backend entity, API, frontend
   drill-down, radius search, homes-near-school grid) and is missing only visual re-skinning. It
   is the safest, cheapest first vertical to ship at design parity.
5. **The Agricultural journey's "town/destination" step has no backing entity.** Only raw
   agricultural-land listings and manually-seeded direction-label strings exist today — there is
   nothing to query for "towns near this corridor." This is the second-largest backend gap and
   the reason Agricultural is sequenced last.
6. **A global, mode-aware, cross-city area-jump autocomplete does not exist in production.**
   Today there is only a per-city substring filter and a fixed city dropdown. This is shell-level,
   needed by all three journeys, and should be built once, early.
7. **The frozen design's own instrumentation is broken:** `VISUAL_RULES.md` and
   `DESIGN_STATE_MANIFEST.json` both document `data-design-component` / `data-design-screen`
   attributes as the way to bind automated tooling to design states. **These attributes do not
   exist anywhere in the exported JSX or the live DOM** (confirmed both statically and at
   runtime). Any future automated visual-parity tooling must be built against the real DOM hooks
   (`data-nd-*`, `role="tab"`/`"tablist"`) or the design export must be re-instrumented — do not
   assume `data-design-component` selectors work.
8. **No visual-regression or accessibility test tooling exists in this repo at all.** Both are
   net-new additions this rollout should introduce, not just new test *cases* in existing tooling.
9. **Much of "Discover V2" is already an approved, partially-shipped initiative under a different
   name.** Issues #1882 (closed, deterministic region model), #1910 (open, region-scoped group
   projections), #1951 (open, directional-cluster design charter), and #1740 (open, unified-portal
   FE guardrails) form one coherent existing track. This plan should slot into and complete that
   track, not restart it under a new "V2" label. See
   [05-issue-roadmap-reconciliation.md](05-issue-roadmap-reconciliation.md).

## What was NOT done in this session (by design)

- No production frontend or backend code was modified.
- No Flyway migrations were created.
- No APIs were changed.
- No GitHub issues were created, edited, or closed.
- No PRs were opened.
- Implementation has **not** been authorized — see
  [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md) for the explicit
  list of product decisions that must be made before PR-1 can start.
