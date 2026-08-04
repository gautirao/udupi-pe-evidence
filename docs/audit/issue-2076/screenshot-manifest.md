# Issue #2076 — Screenshot manifest (Stage 1)

Stage-1 deliverable (AC3). Maps every baseline-protected parity-matrix state
to a filename under a documented naming convention, with viewport, auth arm
and mask set per entry.

**No `.png` is committed by this branch.** Baseline capture (the actual
`toHaveScreenshot()` calls and their approved reference images) is Stage-4
work, explicitly gated on PR #2074 merging first — capturing baselines now
would either (a) omit rent/lease pricing entirely and need re-capture the
moment #2074 lands, or (b) require cherry-picking #2074's draft code, both
forbidden by this stage's scope. See `parity-matrix.md`'s
`ENVIRONMENT_BLOCKED_2074_RENDER` rows (renamed in Amendment-1 Step 5 from
the original Stage-1 label `BLOCKED_PENDING_2074_FINAL_HEAD` — PR #2074 has since merged, but rendered
rent/lease pricing remains unobservable per the rent-probe evidence in
`discrepancy-register.md`) for exactly which states that applies
to; every other state's screenshot is deferred for the same reason stated
generally in the issue body ("Final screenshot baselines... must wait until
#2051 / PR #2074 is merged into main").

## Naming convention

```
A{NN}-{state-slug}-{viewport}-{auth}.png
```

- `{NN}` — two-digit matrix state id (`01`–`24`), zero-padded.
- `{state-slug}` — kebab-case short description, stable once assigned (do
  not rename a slug after Stage 2 starts referencing it in committed specs).
- `{viewport}` — `desktop` (1366×768) or `mobile` (390×844). Mobile-only
  states (A21–A24) omit `{viewport}` entirely since only mobile applies.
- `{auth}` — `anon` or `auth`.

Example: `A07-showallareas-desktop-anon.png` (the naming example given in
the executor handoff — A07's actual slug per this manifest is
`show-all-areas-reset`; adjust to match whichever slug Stage 2 finalizes,
but the four-part `A{NN}-{slug}-{viewport}-{auth}.png` shape is fixed).

## Entries

Every entry below is generated directly from `parity-matrix.md`'s per-state
"Screenshot" column — this file exists so the filename↔state mapping is
reviewable as its own artifact (AC3) without re-deriving it from the larger
matrix, and so Stage 2/4 has one place to check a filename is not already
taken before adding a new masked variant.

| State | Filename | Viewport | Auth | Mask set (ref: fixture-environment-manifest.md §14) |
|---|---|---|---|---|
| A01 | `A01-cityroot-desktop-anon.png` | desktop | anon | none |
| A01 | `A01-cityroot-desktop-auth.png` | desktop | auth | none |
| A01 | `A01-cityroot-mobile-anon.png` | mobile | anon | none |
| A01 | `A01-cityroot-mobile-auth.png` | mobile | auth | none |
| A02 | `A02-direction-direct-areas-desktop-anon.png` | desktop | anon | none |
| A02 | `A02-direction-direct-areas-desktop-auth.png` | desktop | auth | none |
| A02 | `A02-direction-direct-areas-mobile-anon.png` | mobile | anon | none |
| A02 | `A02-direction-direct-areas-mobile-auth.png` | mobile | auth | none |
| A03 | `A03-direction-local-destinations-desktop-anon.png` | desktop | anon | BLOCKED — no filename reserved until Stage-2 seed resolves the role |
| A03 | `A03-direction-local-destinations-desktop-auth.png` | desktop | auth | BLOCKED |
| A03 | `A03-direction-local-destinations-mobile-anon.png` | mobile | anon | BLOCKED |
| A03 | `A03-direction-local-destinations-mobile-auth.png` | mobile | auth | BLOCKED |
| A04 | `A04-local-destination-areas-desktop-anon.png` | desktop | anon | BLOCKED |
| A04 | `A04-local-destination-areas-desktop-auth.png` | desktop | auth | BLOCKED |
| A04 | `A04-local-destination-areas-mobile-anon.png` | mobile | anon | BLOCKED |
| A04 | `A04-local-destination-areas-mobile-auth.png` | mobile | auth | BLOCKED |
| A05 | `A05-visual-area-clusters-desktop-anon.png` | desktop | anon | BLOCKED + map mask once unblocked |
| A05 | `A05-visual-area-clusters-desktop-auth.png` | desktop | auth | BLOCKED + map mask once unblocked |
| A05 | `A05-visual-area-clusters-mobile-anon.png` | mobile | anon | BLOCKED + map mask once unblocked |
| A05 | `A05-visual-area-clusters-mobile-auth.png` | mobile | auth | BLOCKED + map mask once unblocked |
| A06 | `A06-focused-cluster-subset-desktop-anon.png` | desktop | anon | BLOCKED + map mask once unblocked |
| A06 | `A06-focused-cluster-subset-desktop-auth.png` | desktop | auth | BLOCKED + map mask once unblocked |
| A06 | `A06-focused-cluster-subset-mobile-anon.png` | mobile | anon | BLOCKED + map mask once unblocked |
| A06 | `A06-focused-cluster-subset-mobile-auth.png` | mobile | auth | BLOCKED + map mask once unblocked |
| A07 | `A07-show-all-areas-reset-desktop-anon.png` | desktop | anon | BLOCKED + map mask once unblocked |
| A07 | `A07-show-all-areas-reset-desktop-auth.png` | desktop | auth | BLOCKED + map mask once unblocked |
| A07 | `A07-show-all-areas-reset-mobile-anon.png` | mobile | anon | BLOCKED + map mask once unblocked |
| A07 | `A07-show-all-areas-reset-mobile-auth.png` | mobile | auth | BLOCKED + map mask once unblocked |
| A08 | `A08-selected-area-sale-desktop-anon.png` | desktop | anon | none reserved; visual DEFERRED pending #2074 |
| A08 | `A08-selected-area-sale-desktop-auth.png` | desktop | auth | none reserved; visual DEFERRED pending #2074 |
| A08 | `A08-selected-area-sale-mobile-anon.png` | mobile | anon | none reserved; visual DEFERRED pending #2074 |
| A08 | `A08-selected-area-sale-mobile-auth.png` | mobile | auth | none reserved; visual DEFERRED pending #2074 |
| A09 | `A09-selected-area-rent-desktop-anon.png` | desktop | anon | ENVIRONMENT_BLOCKED_2074_RENDER — no filename reserved (dependency merged @bbef09b2, rendered pricing unobservable — see parity-matrix.md) |
| A09 | `A09-selected-area-rent-desktop-auth.png` | desktop | auth | ENVIRONMENT_BLOCKED_2074_RENDER |
| A09 | `A09-selected-area-rent-mobile-anon.png` | mobile | anon | ENVIRONMENT_BLOCKED_2074_RENDER |
| A09 | `A09-selected-area-rent-mobile-auth.png` | mobile | auth | ENVIRONMENT_BLOCKED_2074_RENDER |
| A10 | `A10-selected-area-lease-desktop-anon.png` | desktop | anon | ENVIRONMENT_BLOCKED_2074_RENDER — shipped-status also unverified |
| A10 | `A10-selected-area-lease-desktop-auth.png` | desktop | auth | ENVIRONMENT_BLOCKED_2074_RENDER |
| A10 | `A10-selected-area-lease-mobile-anon.png` | mobile | anon | ENVIRONMENT_BLOCKED_2074_RENDER |
| A10 | `A10-selected-area-lease-mobile-auth.png` | mobile | auth | ENVIRONMENT_BLOCKED_2074_RENDER |
| A11 | `A11-within-area-search-desktop-anon.png` | desktop | anon | none reserved; visual DEFERRED pending #2074 |
| A11 | `A11-within-area-search-desktop-auth.png` | desktop | auth | none reserved; visual DEFERRED pending #2074 |
| A11 | `A11-within-area-search-mobile-anon.png` | mobile | anon | none reserved; visual DEFERRED pending #2074 |
| A11 | `A11-within-area-search-mobile-auth.png` | mobile | auth | none reserved; visual DEFERRED pending #2074 |
| A12 | `A12-listing-filters-active-desktop-anon.png` | desktop | anon | none reserved; visual DEFERRED pending #2074 |
| A12 | `A12-listing-filters-active-desktop-auth.png` | desktop | auth | none reserved; visual DEFERRED pending #2074 |
| A12 | `A12-listing-filters-active-mobile-anon.png` | mobile | anon | none reserved; visual DEFERRED pending #2074 |
| A12 | `A12-listing-filters-active-mobile-auth.png` | mobile | auth | none reserved; visual DEFERRED pending #2074 |
| A13 | `A13-empty-filtered-reset-desktop-anon.png` | desktop | anon | none reserved; visual DEFERRED pending #2074 |
| A13 | `A13-empty-filtered-reset-desktop-auth.png` | desktop | auth | none reserved; visual DEFERRED pending #2074 |
| A13 | `A13-empty-filtered-reset-mobile-anon.png` | mobile | anon | none reserved; visual DEFERRED pending #2074 |
| A13 | `A13-empty-filtered-reset-mobile-auth.png` | mobile | auth | none reserved; visual DEFERRED pending #2074 |
| A14 | `A14-browse-all-desktop-anon.png` | desktop | anon | pending OQ2 shipped-status check |
| A14 | `A14-browse-all-desktop-auth.png` | desktop | auth | pending OQ2 shipped-status check |
| A14 | `A14-browse-all-mobile-anon.png` | mobile | anon | pending OQ2 shipped-status check |
| A14 | `A14-browse-all-mobile-auth.png` | mobile | auth | pending OQ2 shipped-status check |
| A15 | `A15-listing-peek-restoration-desktop-anon.png` | desktop | anon | none reserved; visual DEFERRED pending #2074 |
| A15 | `A15-listing-peek-restoration-desktop-auth.png` | desktop | auth | none reserved; visual DEFERRED pending #2074 |
| A15 | `A15-listing-peek-restoration-mobile-anon.png` | mobile | anon | none reserved; visual DEFERRED pending #2074 |
| A15 | `A15-listing-peek-restoration-mobile-auth.png` | mobile | auth | none reserved; visual DEFERRED pending #2074 |
| A16 | `A16-guided-nav-hierarchy-back-desktop-anon.png` | desktop | anon | none |
| A16 | `A16-guided-nav-hierarchy-back-desktop-auth.png` | desktop | auth | none |
| A16 | `A16-guided-nav-hierarchy-back-mobile-anon.png` | mobile | anon | none |
| A16 | `A16-guided-nav-hierarchy-back-mobile-auth.png` | mobile | auth | none |
| A17 | `A17-browser-back-forward-desktop-anon.png` | desktop | anon | none |
| A17 | `A17-browser-back-forward-desktop-auth.png` | desktop | auth | none |
| A17 | `A17-browser-back-forward-mobile-anon.png` | mobile | anon | none |
| A17 | `A17-browser-back-forward-mobile-auth.png` | mobile | auth | none |
| A18 | `A18-deep-link-refresh-ancestry-desktop-anon.png` | desktop | anon | none |
| A18 | `A18-deep-link-refresh-ancestry-desktop-auth.png` | desktop | auth | none |
| A18 | `A18-deep-link-refresh-ancestry-mobile-anon.png` | mobile | anon | none |
| A18 | `A18-deep-link-refresh-ancestry-mobile-auth.png` | mobile | auth | none |
| A19 | `A19-search-selection-convergence-desktop-anon.png` | desktop | anon | none |
| A19 | `A19-search-selection-convergence-desktop-auth.png` | desktop | auth | none |
| A19 | `A19-search-selection-convergence-mobile-anon.png` | mobile | anon | none |
| A19 | `A19-search-selection-convergence-mobile-auth.png` | mobile | auth | none |
| A20 | `A20-schools-shortcut-area-context-desktop-anon.png` | desktop | anon | pending affordance confirmation |
| A20 | `A20-schools-shortcut-area-context-desktop-auth.png` | desktop | auth | pending affordance confirmation |
| A20 | `A20-schools-shortcut-area-context-mobile-anon.png` | mobile | anon | pending affordance confirmation |
| A20 | `A20-schools-shortcut-area-context-mobile-auth.png` | mobile | auth | pending affordance confirmation |
| A21 | `A21-mobile-list-mode-cityroot.png` | mobile | anon+auth (both captured) | none (List mode has no map region to mask) |
| A21 | `A21-mobile-list-mode-direction.png` | mobile | anon+auth | none |
| A21 | `A21-mobile-list-mode-area.png` | mobile | anon+auth | none |
| A22 | `A22-mobile-fullscreen-map-cityroot.png` | mobile | anon+auth | full map-canvas mask (fixture-environment-manifest.md §14) |
| A22 | `A22-mobile-fullscreen-map-direction.png` | mobile | anon+auth | full map-canvas mask |
| A22 | `A22-mobile-fullscreen-map-area.png` | mobile | anon+auth | full map-canvas mask |
| A23 | `A23-mobile-area-single-column-anon.png` | mobile | anon | none reserved; visual DEFERRED pending #2074 |
| A23 | `A23-mobile-area-single-column-auth.png` | mobile | auth | none reserved; visual DEFERRED pending #2074 |
| A24 | `A24-mobile-toggle-no-history.png` | mobile | anon+auth | full map-canvas mask |

**Note on A21/A22/A24 filenames:** these three states are recorded in
`parity-matrix.md` as one 2-row table per state (anon/auth) rather than four
(no separate desktop rows exist for mobile-only states), and A21/A22 further
collapse the per-level filenames to one representative name per hierarchy
level rather than per (level × auth) — auth arm does not change map/list
composition in a way expected to need a separate baseline, but Stage 2 must
verify that assumption empirically before finalizing; if auth-only chrome
(e.g. a favourite icon) appears in-frame, split the filename per auth arm
following the pattern used everywhere else in this manifest.

## Stage-4 capture procedure (documented now, executed later)

Not performed in Stage 1. When Stage 4 begins (after #2074 merges):

1. Rebase the parity branch onto the latest `main`.
2. Confirm the Stage-2 seed's navigation revision is LIVE (see
   `parity-fixture-spec.md`).
3. Run every Stage-2-authored `e2e-parity/aNN-*.spec.ts` with
   `--update-snapshots` once, under full manual review of every generated
   PNG (a baseline update is a visual product change, never a mechanical
   accept, per the issue body).
4. Commit the approved baselines alongside the spec that captures them —
   never a same-PR baseline update without the diff being visually reviewed.
