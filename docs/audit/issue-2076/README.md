# Issue #2076 — Discover V2 Areas post-cutover parity sign-off

**This PR covers Stage 1 only: parity planning and current-state audit.**
Stages 2 (audit execution beyond the 6 known findings), 3 (child-issue filing) and 4
(final baseline/sign-off) are explicitly out of scope for this branch.

## Stage-1 deliverables

- [x] `parity-matrix.md` — canonical state matrix (A01–A24) at 1366×768 and 390×844, crossed with anon/auth (96 rows). Most rows carry `PENDING_STAGE_2_AUDIT` (a documented, deliberate Stage-1-only status — see the file's "Status vocabulary" section) rather than a fabricated `MATCH`; only rows backed by real Stage-1 evidence (F1/F2/F3 hosted observation, or structural Stage-2-seed dependency) carry a real verdict.
- [x] `fixture-environment-manifest.md` — deterministic fixture/environment contract, including a "Known gaps" section that is honest about what is NOT yet implemented (fixed clock, event-driven map-settle signal, marker-rendering-technology question, tile-pack licence).
- [x] `screenshot-manifest.md` — state-ID → baseline-filename mapping (no PNGs committed in Stage 1)
- [x] `discrepancy-register.md` — reproduce-or-refute the 6 known findings (F1–F6) — authored by a prior Stage-1 specialist; this run only reads it as evidence, per its ownership boundary.
- [x] `parity-fixture-spec.md` — Stage-2 seed specification (spec only, no SQL)
- [x] `playwright.parity.config.ts` + `e2e-parity/` harness skeleton + one pilot spec (`e2e-parity/pilot-a01-city-root.spec.ts`, state A01 only)

## What this Stage-1 run does NOT cover (explicit scope statement)

- **No Stage-2 seed.** The five roles in `e2e-parity/support/parity-nodes.ts`
  (`cityRoot`, `directionWithDirectAreas`, `directionWithLocalDestinations`,
  `localDestinationWithAreas`, `denseAreaDirection`) are declared but only
  `cityRoot` is actually resolved — the other four return `null` and any
  spec that requests them throws loudly rather than guessing. See
  `parity-fixture-spec.md`.
- **No baseline `.png` files, anywhere, for any state.** Every
  `toHaveScreenshot()` call and every approved reference image is Stage-4
  work, gated on PR #2074 merging.
- **No Stage-2 audit of the 18 states beyond A01 and the F1/F2/F3-covered
  rows.** `parity-matrix.md` names their owning spec files but those files
  do not exist yet (`e2e-parity/aNN-*.spec.ts` for N ≠ 01 are planned
  filenames, not written code).
- **No child issues filed**, no production source changed, no SQL/Flyway
  migration authored, no #2074 code cherry-picked.
- **Stage 4 baselines/full-matrix execution are out of scope.** The A01 pilot
  spec itself WAS executed as part of this run's evidence (3 runs: a genuine
  local run against a real fixture backend, a read-only hosted diagnostic run
  under explicit user authorisation, and a hosted re-run after fixing a
  spec-authoring defect the diagnostic run uncovered — final result: both
  desktop and mobile projects PASS). See `docs/audit/issue-2076/evidence/` and
  `workdone-candidate.toml` `[evidence.e2e_detail]` for the full, un-collapsed
  3-run history. Only the other 23 states' owning specs remain unwritten.

## Dependency on PR #2074

**UPDATE (Amendment-1 Step 5, 2026-08-04):** PR #2074 (issue #2051,
rental/lease monthly pricing) has **merged** at
`bbef09b274b02f23f59426b7fa4b009fcde38977`. This does **not** mean rent/lease
pricing parity is verified: this Stage-1 pass never audited rendered
pricing against the merged implementation, and Amendment-1 Step 4's
rent-probe (7 hosted Bangalore areas sampled across 3 of 5 macro-regions
under the Rent toggle) found **zero rent inventory** in every one, so the
merged contract's rendered pricing could not be observed rendering at all.
Every parity-matrix row that was marked `BLOCKED_PENDING_2074_FINAL_HEAD` is
now marked `ENVIRONMENT_BLOCKED_2074_RENDER` for exactly that reason — see
`parity-matrix.md`'s dedicated subsection and `discrepancy-register.md` F4 +
its "#2074 rent-probe findings" section for the full evidence. The merged
backend contract tests (`CityAreaListingsControllerTest` /
`CityAreaListingsIT` / etc.) prove the CONTRACT only, and are never cited
anywhere in this audit as evidence of the RENDER. No code from #2074 is
cherry-picked into this branch, no rent/lease baseline is frozen, and no
rent/lease pricing **render** parity is claimed.

_Original Stage-1 statement (superseded above, preserved for history): "PR
#2074 (issue #2051, rental/lease monthly pricing) is not merged. Every
pricing-dependent parity state in this stage is marked
`BLOCKED_PENDING_2074_FINAL_HEAD`. No code from #2074 is cherry-picked, no
rent/lease baseline is frozen, and no rent/lease pricing parity is claimed
in this branch."_

## Amendment-1 status (as of Step 5, 2026-08-04)

Amendment-1 is a later, separate pass over this same branch, layered on top
of the Stage-1 deliverables above rather than replacing them. Summary, so a
reader does not have to reconstruct it from individual files:

- **Step 2** (`state-mapping.md`, AC11/AC13): mapped all 24 A-states × 2
  viewports against the frozen mock. Corrected the originating amendment's
  own MEDIUM-confidence rows — most importantly, **A02/A04 share exactly
  ONE mock reference** (`areas-region-areas`) and **A03/A05 share exactly
  ONE mock reference** (`areas-region-clusters`); they are not independent
  references, and any coverage count elsewhere in this folder must not
  double-count them as two.
- **Step 4** (AC16 visual comparison, `parity-matrix.md`'s "Amendment-1
  Step 4" section + `discrepancy-register.md`): compared 10 of 48 possible
  cells against the frozen mock (the other 38 have no frozen reference or
  are not designed, per Step 2's mapping — not a coverage gap). Produced
  three new findings, none of the issue's original 6:
  - **F7** — region/area listing-count badges are unfiltered by intent
    (Buy vs. Rent); same root cause as the pre-existing F2, different scope
    axis.
  - **F8** — the city-root heading pattern ("Bangalore / 1737 listings")
    diverges from the frozen mock's invitational-question pattern ("Where
    do you want to explore?"), reproduced identically at desktop and
    mobile.
  - **F9** — the shipped Direction-level panel never renders a
    Local-Destination cluster-selection list; it always flattens straight
    to an AREA card list. **Caveat that must travel with F9 everywhere it
    is summarised: only 2 of Bangalore's 5 macro-regions (West, North)
    were sampled — this is not a proven citywide claim.**
  - Also produced the 7-area rent-probe finding described above (feeds F4).
- **Step 5** (this pass): relabelled every `BLOCKED_PENDING_2074_FINAL_HEAD`
  occurrence to `ENVIRONMENT_BLOCKED_2074_RENDER` across this folder, added
  a Risk-R11 re-validation confirming F1/F2/F3 are not contradicted by
  Step 4's evidence (see `discrepancy-register.md`), and swept for stale
  cross-artefact claims.
- **(Added 2026-08-04)** Step 4's AC16 comparison was scoped to individual
  components (well motivated — the mock and shipped app share no common
  attribute and each renders its own Leaflet instance), which left it
  structurally blind to page-shell composition (pane order/side, split
  ratio, control-bar placement). **F10** — the frozen desktop mock is
  map-LEFT/panel-RIGHT while the shipped desktop app is panel-LEFT/map-RIGHT,
  inverted across all six sampled states — was found by direct human
  comparison, not by the AC16 audit. This is a methodology gap, not an
  execution failure: see `fixture-environment-manifest.md`'s "Known gaps"
  item 8 and `parity-matrix.md`'s "Methodology gap: component scope vs.
  page-shell scope" section for the full writeup and the Stage-2
  requirement (shell-level comparison alongside, not instead of,
  component-level comparison).

None of this constitutes the formal "Stage-2 audit" referenced in the
Stage-1 deliverables list above — Amendment-1's AC16 comparison is a
narrower, mock-vs-shipped visual check, not a re-run of the full A01–A24
matrix against a seeded fixture. The "No Stage-2 audit of the 18 states..."
scope statement above still holds.

## Open questions

Tracked as top-level PR comments. See the PR conversation for OQ1–OQ4 and their status.

## Source

- Issue: https://github.com/gautirao/udupi-property-explorer/issues/2076
- Plan: `.claude/handoffs/issue-2076/team-lead-plan.toml` (main-repo checkout, not tracked in this branch)
