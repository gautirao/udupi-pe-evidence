# STATE.md — Workflow Session State

<!-- Claude-managed. Tracks where the session is and how to resume.
     NOT a source of project/product truth — decisions live in docs/ and .claude/ARCHITECTURE.md -->

Last updated: 2026-08-30

## Current Position
- Active thread: #2402 Cloudflare Pages build-failure follow-up — lockfile regeneration (root cause was an incomplete lockfile, not the npm-version bug PR #2402 assumed) — via standalone /quick
- Mode: standalone ROUTE_AND_RUN / /quick execution per issue
- Phase: PR #2403 (regenerate lockfile with full Linux optional-dependency records; corrects #2402's DEPLOYMENT.md workaround) open, awaiting review — not merged
- Prior: PR #2384 (#2380 split PendingListings.tsx) remains READY_AWAITING_OWNER — not merged, awaiting owner review
- Prior entries (PR #2178, milestone #12) remain parked/stale — not touched this session

## Milestone #12 — Execution Order

Sequenced PRs, one branch per issue, do NOT stack until prior issue is merged:

| # | Issue | Title | Risk | Depends on |
|---|-------|-------|------|------------|
| 1 | #947 | Remove city selector from filter panel | Low | — |
| 2 | #948 | Add active filter count and removable filter chips | Low–Med | #947 |
| 3 | #949 | Show transparent loading state on filter refetch | Low | #948 |
| 4 | #950 | Remove locality filter from panel; preserve refinements on area select | Med | #947–#949 |
| 5 | #951 | Move near-school radius search out of generic filter panel | Med | #948 (chip surface) |
| 6 | #952 | Remove or relocate free-text search from filter panel | Low | — |
| 7 | #953 | Persist remaining simple Discover filters in URL (no polygon) | Med | #952 |
| F | #954 | Decision spike: polygon URL-shareable? (blocked:decision, spike) | Low | #948 |

Guardrails for the milestone:
- Do NOT change `/api/discover/listings` or `/api/discover/markers` contract.
- Do NOT weaken marker/listing predicate consistency.
- Do NOT implement polygon URL persistence until #954 decision lands.
- Preserve city as page-level context (not a filter).
- Preserve selected area as discovery context (not a filter).
- Preserve refinement filters when selecting an area unless a proven conflict.

## Prior Position (parked)
- Active milestone: discover-trends-redesign-2-parity-fixes (GitHub milestone #11) — ✅ COMPLETE
- Standalone issue #935 (paginated server-filtered Discover endpoint) — merged 2026-04-29 (PR #936/#943, etc.)

## Blockers
- NONE — paused per user request before Issue 1 implementation.

## Recent Completions (last 6)
- #2472 (polygon draw "Undo last point" enabled-but-no-op at exactly 1 vertex) → PR #2705 OPEN, awaiting review (2026-09-24) [/quick, lane-2472]
- #2402 follow-up (Cloudflare Pages build failure — actual root cause was an incomplete lockfile, not the npm-version bug PR #2402 diagnosed) → PR #2403 OPEN, awaiting review (2026-08-30) [/quick]
- #2207 (admin hierarchy tree: node selection, contextual override actions — first deliverable, bulk deferred) → PR #2383 OPEN, draft, awaiting review (2026-08-29) [/quick]
- #2264 (pending-listings admin queue truncation banner showed a false loaded-row count — stale issue text vs #2369's redesign, but the banner's `PENDING_PAGE_FETCH_SIZE * MAX_PAGES` math ignored the backend's real `max-page-size: 100` clamp) → PR #2378 OPEN (draft), READY_AWAITING_OWNER (2026-08-28) [/quick]
- #2345 (visual-cluster marker cards leak stale residential hero content into schools journey) → PR #2358 OPEN, awaiting review (2026-08-27) [/quick]
- #2177 (City Launch checksum-drift false positive blocking promotion) → PR #2178 OPEN, READY_AWAITING_OWNER_MANUAL_TEST (2026-08-15) [/quick]
- #2175 (City Launch rerun succeeds but leaves admin on dead old-revision screen) → PR #2176 merged 4eb7ecb0 (2026-08-15)
- #2151 (City Launch preview city-identity + Agri corridor bugs) → PR #2167 merged, plus follow-ups #2169/#2170/#2171 → PRs #2173/#2172/#2174 all merged (2026-08-15)
- #1403 (dev seed: agricultural land listings for local Discover testing) → PR #1404 OPEN, READY_TO_MERGE awaiting approval (2026-06-08) [/quick]
- #953 (URL persistence for multi-seller, status booleans, date range) → PR #961 merged (2026-04-30)
- #952 (relocate text search to listings header + q= URL persistence) → PR #960 merged (2026-04-30)
- #951 (move near-school search to dedicated sheet) → PR #959 merged (2026-04-30)
- #950 (remove locality filter; preserve refinements on area select) → PR #958 merged (2026-04-30)
- #949 (transparent loading state on filter refetch) → PR #957 merged (2026-04-30)
- #948 (active filter count badge + removable chips) → PR #956 merged (2026-04-30)
- #947 (remove city selector from filter panel) → PR #955 merged (2026-04-30)
- #935 (paginated discover listings + markers) → PR #943 merged (2026-04-29)
- #858 toggle position → PR #863 merged (2026-04-26)
- #859 state sync → PR #864 merged (2026-04-26)
- #857 mobile filter panel → PR #865 merged (2026-04-26)
- #860 zero-preview copy → PR #866 merged (2026-04-26)
- #862 anonymous AppLayout email → PR #867 merged (2026-04-26)

## Session Continuity
- Last session: 2026-08-15 — City Launch preview/promotion bug sweep on the real hosted Udupi city: fixed #2151 preview city-identity + Agri corridor bugs (PR #2167 + follow-ups #2169–#2171, all merged), then investigated and fixed the "Preview not ready" rerun leaving the admin stranded (#2175, PR #2176 merged), then diagnosed and fixed a live checksum-drift false positive blocking promotion (#2177, PR #2178 open).
- Resume action: owner manual-tests PR #2178 on the live Udupi promotion flow (re-run prepare → validate → launch) and approves merge; once merged, #2151's parent DoD sweep (desktop/mobile, Back/Forward/refresh/direct-URL, Areas/Schools regression) is still outstanding and not yet revisited this session.
- Checkpoint file: this file (STATE.md). No SPRINT_EXECUTOR checkpoint — standalone per-issue execution.
- Prior 2026-04-30 milestone #12 checkpoint (below, parked) is unrelated and untouched.
