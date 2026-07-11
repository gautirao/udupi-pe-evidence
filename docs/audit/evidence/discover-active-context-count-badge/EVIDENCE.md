# Evidence — Discover active-context chips + trustworthy result-count badge (issue #1817)

Desktop-only, frontend-only. PLAN_REVIEW APPROVED (verdict: `.claude/openai-gates/issue-1817/20260711T034753Z-PLAN_REVIEW/verdict.toml`). Branch: `issue-1817-feat(discover)-add-active-context-chips`.

## 1. COUNT_CONTRACT_REVIEW (mandatory first gate) — result

Full findings live in `.claude/handoffs/issue-1817/approved-plan.toml [count_contract_review]` (PLAN_REVIEW-validated). Summary:

- **Single source (not divergent):** the map badge pill and the panel header stat both render from ONE selector, `deriveDiscoverBadge` → `formatDiscoverBadgeCopy` (`src/pages/MapDiscovery.tsx`). The badge number is NEVER derived from `MarkersTruncationNotice` / marker-pin count (`src/components/discover/MapStatsBar.tsx`). Verified end-to-end by code-reviewer: `MapDiscovery.tsx:2014-2024` computes one `areaResultSummaryText`; the map badge (`~3752-3758`) and the panel stat (`AreaSelectedPanel.tsx:551-552`, threaded via `DiscoverRightPanel.tsx:890/1533`) render that same string — divergence is structurally impossible.
- **N/M derivability per scope (client-side, no backend):** city (sum of area listingCounts), region (member-area aggregate), area group (aggregate N; see limitation below for filtered M in the group-landing state), area (`selectedArea.listingCount` = N, `areaListings.length` = M), anon school (full radius list filtered client-side → N and M).
- **Design-sanctioned no-number fallback** (`Filtered results`, per design §6 "prefer no number to a wrong one") applies where a trustworthy filtered M/N is not derivable client-side:
  1. **authenticated school-radius + filters** (server pre-filters; unfiltered radius N not retained) — PLAN_REVIEW Q1 ruling: use fallback + file backend follow-up; do NOT add a backend field this run.
  2. **area-group-selected landing + filters** (no group-scoped filtered M wired into the selector today; only unfiltered aggregate N) — surfaced during implementation; code-reviewer ruled the honest fallback design-mandated, not a blocker; file a follow-up (design §10/§13 flagged risk).
- **Anon count exposure (PLAN_REVIEW Q2):** the pre-existing guard hiding filtered counts when filters are active and no area is selected is PRESERVED (now returns `state:'stale'` → `Filtered results`, no number) for BOTH anon and authed. code-reviewer confirmed no weakening; unit + isolation confirm no authenticated-only count is exposed to anon.

## 2. Acceptance criteria AC1–AC12 — status

See `.claude/handoffs/issue-1817/validation-matrix.md` for the row-by-row matrix with evidence. All AC satisfied, with the two design-sanctioned no-number fallbacks above operating as AC6 specifies, and the documented minor deviations in §4.

## 3. Test evidence (real commands + exit codes, per CLAUDE.md §11)

### Unit / integration (qa verification, read-only)
- `npx vitest run src/components/discover/__tests__/emptyStateCopy.test.ts` → exit 0, **7/7 passed** (AC7 empty-state cause routing).
- `npx vitest run src/components/discover/__tests__/StartOverButton.test.tsx` → exit 0, **5/5 passed** (AC8 confirm-gating + label/icon/aria).
- `npx vitest run src/pages/__tests__/MapDiscovery.issue1152.test.ts` → exit 0, **42/42 passed** (`formatDiscoverBadgeCopy` M-of-N copy + `state==='stale'` no-number fallback).
- New-code total: **54/54 assertions executed, passing.**
- `npx vitest run src/pages/__tests__/ src/components/discover/` → exit 1: 120 failed / 1198 passed / 3 skipped. **All 120 failures = the pre-existing `useAuth must be used within an AuthProvider` harness gap** (`PropertyCard`→`useSavedListingIds`→`useAuth`, throws before assertions) in pre-existing panel/page test files; NONE in the 3 new #1817 files. **Net-new #1817 failures = 0.**
- `AreaSelectedPanel.test.tsx` (reviewer-flagged) in isolation → exit 1, **10 passed / 41 failed**, every failure the same AuthProvider harness error (real number 41, correcting an earlier ~15 estimate). NOT a #1817 regression.
- `npx tsc --noEmit` → exit 0 (0 errors).
- `npx eslint .` → exit 1, 15 errors / 69 warnings — all 15 errors pre-existing `@typescript-eslint/no-explicit-any` in UNRELATED files (none in the #1817 diff surface).

### E2E (qa e2e-authoring — real backend + frontend)
- Spec: `e2e/discover/active-context-chips-and-badge.spec.ts` (5 tests: cold-load filtered URL → chips+badge; chip-clear → URL/refetch/camera preserved; Start over → bare `?city=`; + AC10 overflow).
- `bash scripts/run-e2e-local.sh --project=full e2e/discover/active-context-chips-and-badge.spec.ts` → **EXIT_CODE=0, 5/5 passed, confirmed twice** against a real booted backend (Spring Boot :8085, Flyway validated vs dev Supabase) + real Vite frontend (:5174) with Playwright global-setup auth. Assertions executed against the live app (Discover API routes mocked).
- Integrity note: qa correctly rejected a stale `test-results/.last-run.json` (mtime predated this session) and a first background run that died pre-Playwright; the passing result is from genuine foreground re-runs.

## 4. Documented limitations / minor deviations (honest)

1. **authed school-radius + filters** → `Filtered results` (no number). Design-sanctioned (AC6), PLAN_REVIEW-approved. Follow-up: backend unfiltered-radius-total field for a numeric M-of-N.
2. **area-group-selected landing + filters** → `Filtered results` (no number). No group-scoped filtered M wired today. Follow-up: a group-scoped filtered count source (frontend) for a numeric M-of-N. (area-SELECTED shows true M-of-N.)
3. **`verified` chip** — N/A: no `verified`-only filter exists in `PropertyFilters` / `DiscoverUrlFilters`; adding one would invent new filter semantics (out of scope). Not implemented by design of the codebase.
4. **Chip overflow** uses a fixed `MAX_VISIBLE_FILTER_CHIPS=4` threshold rather than `ResizeObserver` remeasurement — deliberate, to avoid the resize-instability risk qa-fast flagged; the `+N` popover + `Clear all` behaviour (AC10) is fully present.
5. **prefers-reduced-motion** is threaded through `StartOverButton`/`PanelHeader`; the confirm popover collapses animation. Chip add/remove has no JS-driven animation, so the 4 raw panel sites rely on the existing global `@media (prefers-reduced-motion)` CSS — code-reviewer assessed acceptable (nothing to override).
6. **2 new `AreaSelectedPanel` panel-render tests** are NOT_RUN due to the pre-existing AuthProvider harness gap (they render `PropertyCard` without a provider). The M-of-N copy they target is instead covered by (a) the passing `formatDiscoverBadgeCopy` unit tests and (b) the passing live E2E that renders the real panel. Not a regression; not fixed here (repo-wide harness gap is out of scope).

## 5. Follow-ups to file (out of scope for this frontend-only run)
- Backend: return an unfiltered school-radius total so authed school-radius + filters can show numeric `M of N`.
- Frontend: wire a group-scoped filtered count so area-group-selected landing + filters can show numeric `M of N`.
- Test infra: repo-wide `AuthProvider`/`QueryClientProvider` test-harness wrapper for panel tests that mount `PropertyCard`.
