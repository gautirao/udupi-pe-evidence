# STATE.md — Workflow Session State

<!-- Claude-managed. Tracks where the session is and how to resume.
     NOT a source of project/product truth — decisions live in docs/ and .claude/ARCHITECTURE.md -->

Last updated: 2026-06-08

## Current Position
- Active milestone: **discover-filter-simplification** (GitHub milestone #12)
- Source: Filter Panel Audit (2026-04-30) — Discover filter panel currently mixes page context, area journey, and a school journey with refinement filters; URL persistence is partial
- Mode: standalone ROUTE_AND_RUN execution per issue (not SPRINT_EXECUTOR)
- Phase: **implementation in progress**
- Active issue: **#954** spike — DECISION POSTED (recommend NO URL persistence; use sessionStorage). Awaiting product ack to close.

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
- Last session: 2026-04-30 — milestone #12 created, 8 issues filed (#947–#954), paused before implementation.
- Resume action: User confirms go-ahead → start Issue #947 via ROUTE_AND_RUN (branch `fix/discover-remove-city-from-filter-panel`).
- Checkpoint file: this file (STATE.md). No SPRINT_EXECUTOR checkpoint — standalone per-issue execution.
