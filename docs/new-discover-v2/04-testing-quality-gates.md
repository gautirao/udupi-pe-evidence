# 04 — Testing & Quality Gates

Read-only audit of current test/CI infrastructure, plus per-slice verification gate
recommendations for the Discover V2 rollout. **Tooling caveat:** the jCodemunch index used for
this audit is truncated — backend Java tests are almost entirely absent from the index; backend
integration-test enumeration below leans on CI config, not a first-hand file listing, and is
flagged UNRESOLVED where it wasn't directly visible.

## Current state

1. **Unit tests — CONFIRMED, dense frontend coverage.** Vitest 3.2 + Testing Library + jsdom
   (`npm run test` → `vitest run`). Discover-relevant specs are extensive and co-located: panels
   (`AreaGroupResultsPanel`, `AreaSelectedPanel`, `SchoolSelectedPanel`, `AgriGroup*`, etc.),
   shell/hooks (`DiscoverRightPanel.routing`, `IntentSelector`, `JourneySwitcher`,
   `MarkerPopoverCard`, `PropertyCard`, etc.), and map (`AreaMarkerLayer.regionCompassLayout`,
   `PropertyMap.cameraIntent`/`.cameraScope`, `SchoolMarkerLayer`).
   **Known constraint:** the full Vitest suite OOMs in one process — always run subsystem batches,
   never gate on a single whole-suite invocation.
   **Backend unit — UNRESOLVED (index-limited).** Only 2 backend test files were directly
   enumerable (`ListingResponseMapperTest`, `PublicListingControllerTest`); CI confirms `mvn test`
   runs a broader `@WebMvcTest`-based suite, but it could not be fully listed from this session's
   tooling.
2. **Integration tests — INFERRED (index-blocked).** CI runs `mvn test -Dgroups=integration` with
   Testcontainers (`@Tag("integration")`, `@ServiceConnection`, Docker on `ubuntu-latest`).
   **Whether each Discover endpoint (markers, area-groups, school-radius) has a dedicated
   Testcontainers IT is UNRESOLVED** — verify directly under `backend/src/test` before relying on
   it as a V2 merge gate.
3. **E2E tests — CONFIRMED, 124 Playwright specs.** Playwright 1.58, `testDir: ./e2e`, `retries:
   0`, `workers: 2`. Projects: `smoke` (6 named specs incl. `discover-real-data-smoke`), `journey`,
   `integration-ui`, `full` (all specs). Discover journey coverage is dense (area drill-down,
   filters, listing-detail nav, map interaction, agri corridor, school-first, URL-state, viewport
   restoration).
   - **The good model to copy:** `e2e/discover-real-data-smoke.spec.ts` — real `expect()`
     assertions, 4 cross-layer journeys against a **live backend**, no `page.route()` mocks,
     asserts on absence of 401/403 + card render.
   - **A confirmed, present hazard:** the `capture-*.spec.ts` family
     (`capture-area-first-screenshots`, `capture-bangalore-1745-evidence`,
     `capture-discover-*`, `capture-school-first-polish-1770`, and others) contains **zero
     `expect()` calls** — these are screenshot-capture-only specs that pass unconditionally and
     run under the `full` project. **Never count a `capture-*` spec as verification of anything.**
4. **Visual regression — MISSING.** No Percy, Chromatic, `toHaveScreenshot`, or `toMatchSnapshot`
   usage anywhere in the repo. Playwright's `screenshot: 'only-on-failure'` captures failure
   artifacts only — there is no baseline comparison. **A redesign the size of Discover V2 has no
   automated visual-regression net today, and the frozen design's own `data-design-component`
   hooks (which such a harness would normally anchor to) don't exist in the exported code either**
   (see [01-frozen-design-audit.md](01-frozen-design-audit.md) Phase 1) — so a harness would need
   to anchor to production `data-testid`s, not the design export's documented-but-fictional
   attributes.
5. **Accessibility tests — MISSING.** No `axe-core`, `jest-axe`, or `@axe-core/playwright`
   anywhere; confirmed absent from devDependencies. The frozen design's explicit a11y
   requirements (`role=tablist`/`tab`, `aria-selected`, keyboard nav, visible focus rings,
   full-card button semantics) have **no tooling that could catch a regression** in any of them
   today. This needs new tooling, not just new test cases.
6. **CI wiring — CONFIRMED, 2 workflows.**
   - `.github/workflows/ci.yml` (PR + push to main): `frontend` (lint → `npm run test` → build),
     `backend` (`mvn test`, mocked), `backend-integration` (Testcontainers),
     `playwright-pr` (`--project=smoke` against the **already-deployed** `*.pages.dev` site — this
     tests the *prior* deploy, not the PR's own build, and therefore cannot catch a regression in
     the PR under review before merge).
   - `.github/workflows/e2e-post-deploy.yml` (push to main): full E2E against live prod after
     deploy.
   - **Known hazard:** GitHub Actions billing is currently blocked, so CI is red for reasons
     unrelated to code correctness — a red CI check on this repo right now does not mean a real
     failure.
7. **Pre-push hook — CONFIRMED, with a gap relevant to this rollout.** `.githooks/pre-push` skips
   the local E2E smoke gate entirely for any diff matching
   `^(docs/|README|CLAUDE|\.githooks/|\.claude/|e2e/|\.github/|scripts/|.*\.md$)` —
   **`e2e/`, `scripts/`, and `.github/` are all treated as "doc-only" changes**, so a Discover V2
   PR that touches *only* E2E specs (or CI scripts) will skip the smoke gate silently. Also: the
   local smoke gate (`run-e2e-local.sh`) boots a backend that **applies Flyway migrations against
   the shared hosted Supabase database** — this must never run against shared infra; any V2 slice
   with a migration needs Testcontainers evidence, not a live pre-push smoke run.

## Per-slice verification gates for the Discover V2 rollout

For every PR in the sequenced plan ([06](06-target-architecture-and-pr-plan.md)), require before
merge:

1. **New/changed hook or panel → a co-located Vitest spec with real `expect()` assertions** on
   behaviour (state transitions, URL params, rendered counts) — following the existing model of
   `DiscoverRightPanel.routing` / `AreaGroupSelectedPanel.shownOfTotal`. Run only the relevant
   subsystem batch (the full suite OOMs).
2. **Any URL-state contract change → an assertion on `page.url()`/params** in an E2E spec, not
   element-existence alone. Round-trip: set state → reload/Back → confirm restoration (model:
   `discover-1939-listing-peek-url-restore`).
3. **Any area→listing round-trip change → a real-DOM E2E on the `full` project against a live
   backend**, asserting no 401/403 and that cards render — clone
   `discover-real-data-smoke.spec.ts`'s no-mock approach. **Reject any "proof" that is a
   `capture-*`/screenshot-only spec.**
4. **New: an assertion-free-spec gate.** Add a CI/pre-merge check that fails if any `e2e/**` spec
   outside an allowlisted `capture-*` glob contains zero `expect(`. This structurally kills the
   exact hazard class already present in this repo's E2E suite, before the V2 rollout adds more
   specs on top of it.
5. **New tooling required: accessibility smoke.** Add `jest-axe` (Vitest) for the
   `role=tablist`/`tab`/`aria-selected` mode-selector component, and `@axe-core/playwright` for a
   keyboard-navigation + visible-focus E2E on the live Discover shell. Nothing today catches
   regressions here — this needs to be stood up once, inside Feature 1 (Unified Shell) in
   [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md), and then reused
   by every later feature gate.
6. **New tooling, scoped: visual regression.** No baseline-diff tool exists today. Adopt
   Playwright's `toHaveScreenshot` on 3–5 canonical states (landing, area-selected, school-first
   selected, results panel, mobile stacked) — gate only once baselines are committed
   post-redesign. If this is declined for cost/scope reasons, explicitly label visual correctness
   as **manual-verify only** in every PR's evidence block, per CLAUDE.md §11 (never claim
   automated visual PASS without a real baseline diff).
7. **Any change to Discover backend endpoints (markers/area-group/school-radius counts) → a
   Testcontainers integration test with seeded data**, not a mocked-only unit test. Action item
   before the Areas/Agricultural PR-A backend-enablement work (Feature 3/4 in
   [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md)) starts: confirm
   which Discover ITs actually exist today (the
   index truncation blocked enumeration this session) — don't assume coverage that hasn't been
   directly verified.
8. **Pre-push awareness.** Any slice that is `e2e/`-only or `scripts/`-only will **not**
   self-verify on push (the DOC_PATTERN skip) — reviewers must run the smoke suite manually for
   those PRs. And never let any local smoke run hit the shared Supabase database — Testcontainers
   evidence + explicit user-approved `--no-verify` is the fallback pattern already established in
   this repo for migration-bearing PRs.
9. **New, added for the recursive-hierarchy revision of Areas (Feature 3 in
   [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md)): a
   listing-inventory-independence gate.** Because generation must never derive cluster membership,
   depth, or labels from live listing counts, add a Testcontainers IT that mutates seeded listing
   counts while holding geography/policy/overrides fixed and asserts the generated tree (structure
   and labels) is byte-for-byte unchanged — only the informational aggregate count may change. This
   is a correctness gate as important as the cluster-total invariant in item 7, and should block
   promotion the same way.
10. **New: a determinism + promotion-fidelity gate.** Regenerating a tree from identical inputs
    must produce an identical tree; promoting an approved sandbox tree must copy it verbatim (same
    node keys, ancestry, labels, ordering, bounds, checksum) with zero regeneration at promotion
    time. Both should be Testcontainers ITs following the existing
    `CityLaunchPromotionServiceIT`/`AdminCityLaunchLaunchControllerIT` pattern of driving the real
    pipeline, not hand-seeding a shortcut — that pattern is confirmed already proven safe to extend
    (see [02](02-production-baseline-audit.md) §C.6's corrected finding).
11. **New: an ancestry-consistency gate.** For every node in a seeded test tree, the direct-search
    ancestry resolver (`navigation-path`) and guided navigation (`navigation/{nodeKey}`) must return
    byte-identical ancestry for the same area — tested explicitly, not assumed from shared code
    paths.
12. **New, added with the approved hierarchy-cache architecture (Areas PR A in
    [06-target-architecture-and-pr-plan.md](06-target-architecture-and-pr-plan.md)): cache
    lifecycle gates.** (a) Startup-warmup ITs asserting readiness stays unhealthy until every
    public-active city's graph is loaded and valid, and that the preload uses the fixed set-based
    query count (no N+1); (b) promotion-refresh ITs asserting the load→validate→swap→grace→evict
    order, that a failed load leaves the old revision serving, and that no restart is needed;
    (c) a count-separation IT asserting the structural graph is byte-unchanged by listing-inventory
    changes and that the new single area-level count roll-up equals the totals of the three
    region-granularity queries it replaces (migration-equivalence); (d) a metrics-cardinality check
    that no cache metric is labeled by `nodeId`/`areaId`/`revisionId`. Full test list in doc 06's
    "Hierarchy-cache tests" section.

## Unresolved, flagged for follow-up before backend-heavy phases (4–5) start

- Full backend integration-test inventory — raise the jCodemunch file-index cap (or list
  `backend/src/test` directly) before relying on any specific IT existing.
- A mechanical, one-time count of `expect()`-free specs across all 124 current E2E files (gate #4
  above effectively performs this continuously going forward, but a baseline count now would be
  useful before adding more).
