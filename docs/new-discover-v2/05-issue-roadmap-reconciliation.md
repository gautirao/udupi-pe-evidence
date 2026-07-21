# 05 — GitHub Issue & Roadmap Reconciliation

Repo: `gautirao/udupi-property-explorer`. All issue reads below were via `gh` and are CONFIRMED
(bodies read directly) unless noted. No issues, PRs, or comments were created, edited, or closed
to produce this document.

## Headline: much of "Discover V2" is already an approved, partially-shipped initiative

**#1882 → #1910 → #1951 (+ #1740 FE guardrails, #1823 camera work) form one coherent, existing
track — this plan should complete and sequence that track, not restart it under a new name.**

**Update (2026-07-21, direct re-verification for the recursive-hierarchy plan revision):** the
items below marked "verify shipped" in the original audit have now been directly re-checked (code,
not just issue bodies) — see [06](06-target-architecture-and-pr-plan.md) Feature 3 for the full
findings. Summary: #1882, #1887, #1900, and #1911 are all confirmed **CLOSED with shipped, tested
code** (not just merged issue bodies); #1910 is confirmed **merged and shipped**, but is a flat,
single-level, non-recursive read-time projection — kept live as a narrow compatibility layer, not
extended to cover the new recursive tree; #1951 is **not superseded** but needs a targeted
amendment (its persisted-identity model and "one optional extra level" framing must generalize to
a self-referential, arbitrary-depth `CLUSTER` node — its naming/threshold/display philosophy is
already depth-agnostic and stands unchanged). No issue was created, edited, or closed to produce
this update.

- **#1882 — Discover map: unify zoom bands, exact area fit, deterministic city regions.**
  CLOSED, **confirmed shipped** (3 PRs merged: #1889, #1894, #1896, with commit SHAs). Establishes
  the deterministic city-region model (central disk + four cardinal sectors, bearing-based
  assignment) and the materialized `city_regions`/`city_region_memberships` tables. Its local plan
  doc, `docs/planning/issue-1882-map-zoom-camera-region-plan.md`, is effectively the de-facto V2
  backend architecture document. Two follow-ups spun out: #1898 (stale `city_regions` pruning) and
  #1899 (production onboarding never triggered — matches the empty-`city_regions` finding in
  [02](02-production-baseline-audit.md) §C.1). **High-value overlap:** this already solves a large
  part of the "directional-region marker" problem and is the root (depth-0) of the new recursive
  tree, not a separate fork.
- **#1910 — Region-scoped presentation-group projections.** OPEN, but **confirmed functionally
  done** (BE PR #1912 commit `09bf7dc2`, FE PR #1913 commit `790e8a42`, both merged; an owner
  comment recommends closing pending a spot-check). **Re-classified for the recursive-hierarchy
  plan:** this is a **flat, single-level, read-time-only projection** (`RegionScopedAreaGroup`, no
  `parentNodeId`, explicit non-goals ruling out new persistence) — it structurally **cannot**
  represent "cluster contains sub-cluster to arbitrary depth." **Decision (see
  [06](06-target-architecture-and-pr-plan.md) D-Areas-6): keep #1910's endpoint live as a narrow,
  additive compatibility layer** for its original bounded use case (a group spanning two regions);
  the new recursive `navigation/{nodeKey}` + `navigation-path` contract is the general case and does
  not extend #1910 in place.
- **#1951 — Design: deterministic optional local directional clusters for city launch and
  adaptive navigation.** OPEN, still explicitly "do not implement yet," unchanged in substance
  (0 comments, no linked PRs). **Not superseded by the recursive-hierarchy decision** — but its
  persisted-identity section (fixed `DIRECTIONAL_REGION`/`LOCAL_CLUSTER`/`AREA`/`LISTINGS` types,
  framed as "subdivided once, not repeatedly") needs a targeted amendment to a self-referential,
  recursive `CLUSTER` node type, since the approved product decision now requires a cluster to be
  able to contain sub-clusters to a policy-bounded depth. Its naming conventions (§4), display
  rules (§7), and depth-agnostic frontend requirements (already written as "must not assume a
  fixed number of levels") **stand unchanged** and are the anchor this plan's data model and API
  build from — see [06](06-target-architecture-and-pr-plan.md) Feature 3 for the full recursive
  model this amendment should reference.
- **#1740 — Design: unified Discover portal implementation guardrails.** OPEN. The approved
  unified-portal FE charter (one portal, region = scope, journey = narrowing method, map/panel
  always synced, macro-region counts only on landing, agri isolated). Route the V2 frontend build
  through this — no conflict with the plan in this folder.
- **#1823 — Context-aware map fit + evidence-based listing-marker zoom thresholds.** OPEN.
  Successor to #1882's camera work across all Discover contexts. Overlaps #1882 on
  `AREA_LAYER_MAX_ZOOM` — clarify division of labour before starting the Areas-feature (Feature 3
  in [06](06-target-architecture-and-pr-plan.md)) camera work in this plan.

## Other named issues audited

- **#1943 — Area-group markers overlap on the all-groups map.** OPEN, P1 bug. The defect is real
  today, but its natural fix boundary ("extend #1815's collision-avoidance to the top-level map")
  is **likely superseded by V2**: the directional-region model structurally reduces top-level
  marker density by replacing a flat 16-group map with `direction → cluster`. **Recommendation:
  fold this into the Areas feature's acceptance criteria (Feature 3 / decision D-Areas-4 in
  [06](06-target-architecture-and-pr-plan.md)) rather than doing a separate #1815-extension fix
  that may become throwaway work.**
- **#1911 — Admin launch preview for new city geography.** CLOSED, **confirmed shipped by direct
  code investigation** (not just issue-body inference): `CityLaunchPreviewService` implements
  seven read-only preview endpoints reconstructing production Discover DTOs from sandbox data, and
  `CityLaunchPromotionService.launch()` (labeled "#1911 PR5" in its own javadoc) is the fully
  implemented, tested promotion mechanism this plan's recursive hierarchy extends — see
  [06](06-target-architecture-and-pr-plan.md) Feature 3 for the full finding. The admin-only 4-step
  City Launch flow explicitly reuses the real Discover map, not a second implementation — a hard
  downstream constraint this plan's City Launch Preview extension (Areas PR A) honors directly.
- **#1900 — City geography curation pipeline for approved canonical area datasets.** CLOSED,
  **confirmed shipped** — narrowed in scope to an offline OSM/Geofabrik extraction workflow feeding
  #1887 (a heavier DB-backed curation platform was explicitly deferred). The upstream
  data-supply-chain for every launch city (curated, versioned, human-reviewed area datasets —
  explicitly forbids using listing text or LLM output as an authoritative source). Hard
  prerequisite for V2's premise that canonical areas exist independently of listings, and for this
  plan's constraint that hierarchy generation inputs come only from approved geography, never
  listings.
- **#1887 — City onboarding: canonical areas, aliases, trusted geometry, zero-listing support.**
  CLOSED, **confirmed shipped** — 3 PRs merged (#1901, #1902, #1905); a follow-up guardrail issue
  (#1906, region-onboarding readiness) was filed. Follow-up to #1882; onboards a reviewed area
  catalogue into canonical `areas` before any listing exists. Hard prerequisite for both #1882's
  regions and #1951's canonical-area naming, and for this plan's zero-listing-area retention
  requirement.
- **#1666 — [M39-ARCH-04] Extract state slice from MapDiscovery.** OPEN. Directly relevant to the
  prop-drilling risk flagged in [02-production-baseline-audit.md](02-production-baseline-audit.md)
  §A.2 — coordinate any V2 shell rework with this issue rather than duplicating the effort.
- **#1926 / #1927 — Agricultural-journey E2E infra defects** (auth selector drift,
  consent-banner pointer interception). OPEN. Fix these before adding more agri E2E coverage in
  Agricultural PR A (Feature 4 in [06](06-target-architecture-and-pr-plan.md)), or new specs in
  PR B will inherit the same flakiness.
- **Mobile MUX cluster (#1211 P0, #1212–#1217).** Mobile Discover is largely unbuilt under this
  older initiative. **Gap: no single issue owns "unified Discover shell on mobile" under the V2
  umbrella** — the `≤820px` responsive shell work in this plan (Feature 1 in
  [06](06-target-architecture-and-pr-plan.md)) should either supersede or explicitly link to these.

## Gaps implied by the frozen design with no corresponding issue today

- **Recursive directional-cluster generation service** — #1951 describes only a flat, one-level
  design intent; #1910 is confirmed a flat read-time projection, not generation+persistence, and
  cannot represent recursion as-is. **Confirmed (this revision): a new recursive generation +
  persistence service is a genuine gap**, not covered by #1910 — see
  [06](06-target-architecture-and-pr-plan.md) Feature 3 for the full recommended model.
- **Schools journey V2 backend contract** — not actually a gap: the production audit
  ([02](02-production-baseline-audit.md) §C.3) confirms the Schools backend already fully exists.
  No new issue needed here — only the frontend re-skin work in Feature 2 (Schools) in
  [06](06-target-architecture-and-pr-plan.md).
- **Agricultural journey V2 backend contract (Town/Destination entity)** — open agri issues
  (#1396, #1426, #1442, #1443, #1513) are all UX/perf/parity; none define the backend entity gap
  identified in [02-production-baseline-audit.md](02-production-baseline-audit.md) §C.4. This is a
  genuine gap.
- **V2 mobile ownership** — no single issue owns "unified Discover shell on mobile" (see Mobile
  MUX note above).

## Synthesis table

| Issue / doc | Verdict | Confidence |
|---|---|---|
| #1951 directional clusters (design) | VALID, not superseded — needs a targeted recursive-node amendment; naming/threshold/display philosophy stands unchanged | CONFIRMED (re-verified 2026-07-21) |
| #1943 all-groups marker overlap | Likely SUPERSEDED by V2's root-fix; fold into Areas-feature (Feature 3) acceptance criteria, graded against the issue's own repro | CONFIRMED |
| #1911 admin launch preview | CLOSED, **confirmed shipped by direct code read** — `CityLaunchPreviewService`/`CityLaunchPromotionService` fully implemented and tested | CONFIRMED (re-verified 2026-07-21) |
| #1900 geography curation pipeline | CLOSED, **confirmed shipped** — narrowed to offline OSM/Geofabrik workflow feeding #1887 | CONFIRMED (re-verified 2026-07-21) |
| #1887 city onboarding / canonical areas | CLOSED, **confirmed shipped** — 3 PRs merged (#1901/#1902/#1905); follow-up #1906 filed | CONFIRMED (re-verified 2026-07-21) |
| #1882 zoom/camera/deterministic regions | CLOSED, **confirmed shipped** — 3 PRs merged (#1889/#1894/#1896); follow-ups #1898/#1899 filed | CONFIRMED (re-verified 2026-07-21) |
| #1740 unified portal guardrails | VALID / DEPENDENCY — route V2 FE build through this | CONFIRMED |
| #1910 region-scoped group projections | **Confirmed merged and shipped** (PR #1912/#1913), but flat/single-level/non-recursive by its own non-goals — retained as a narrow compatibility layer, not extended for the recursive tree | CONFIRMED (re-verified 2026-07-21) |
| #1823 context-aware camera fit | DEPENDENCY — V2 camera work; overlaps #1882, clarify division of labour | CONFIRMED |
| #1666 MapDiscovery decomposition | VALID — coordinate with V2 shell rework | CONFIRMED |
| Mobile MUX #1211–#1217 | Needs scope reconciliation with the unified shell; no single V2-mobile owner | CONFIRMED |
| #1926 / #1927 agri E2E infra | VALID — fix before adding V2 agri E2E coverage | CONFIRMED |
| `docs/planning/issue-1882-...md` | DEPENDENCY — de-facto V2 backend architecture doc | CONFIRMED |
| `docs/planning/issue-1900-*.md` (x2) | VALID — launch-city data-supply planning | CONFIRMED |
| `docs/audit/milestone-36-validity-audit.md` | UNRELATED (audits M29 buyer/broker area intelligence on `/trends`, not the Discover map redesign) | CONFIRMED |
| Schools journey V2 backend | Not a gap — backend fully exists already | CONFIRMED |
| Agricultural journey V2 backend | GAP — no issue defines the Town/Destination entity | CONFIRMED |
| Recursive directional-cluster generation service | GAP, confirmed genuine (this revision) — #1910 cannot cover it, it is flat by design | CONFIRMED (re-verified 2026-07-21) |

## Recommendation for issue hygiene (not executed in this session — planning only)

- Do **not** create a new top-level "Discover V2" epic issue that duplicates #1951/#1740 — this
  plan should be linked from those issues instead.
- **#1910**: once the recursive navigation contract exists, recommend a comment (not filed in this
  session) stating the endpoint is retained as a narrow, additive compatibility layer for its
  original bounded use case, and pointing callers needing arbitrary depth at the new
  `navigation/{nodeKey}` contract instead.
- **#1951**: recommend amending its persisted-identity section and typed-node list (not filed in
  this session) to a self-referential recursive `CLUSTER` node type, reframing "one optional extra
  level" as "zero or more nested optional levels, decided independently per node" — its
  naming/threshold/display sections need no change.
- Once product/backend confirm the recursive hierarchy model is promoted, #1943 should be
  explicitly marked superseded-by-V2 rather than independently extended.
- One new issue is likely needed once implementation is authorized: the Agricultural
  Town/Destination entity design + migration (Feature 4 in
  [06](06-target-architecture-and-pr-plan.md)) — the recursive directional-cluster generation
  service (Feature 3) is now confirmed **not** covered by #1910 and would also need its own issue,
  separate from #1951 (which remains the design charter, not the implementation tracker).
