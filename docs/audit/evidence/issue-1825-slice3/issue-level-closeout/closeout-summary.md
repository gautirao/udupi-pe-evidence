# Issue-level closeout — #1825 two consecutive clean batched full-suite runs

User-approved scope expansion (2026-07-12): verify the issue-level #1825 closeout bar —
two consecutive clean full-suite BATCHED runs on the same final SHA — now that the
Slice-3 fix removed the last OOM'ing test file (EditListing.guard.test.tsx).

Branch: `issue-1825-slice3-cluster-b` (HEAD f5216bc3 + the Slice-3 stable-mock fix in the working tree).
Method: `run-batches.sh` (11 subsystem batches covering all 228 test files). Single-process full run FORBIDDEN (heap OOM). NO subsplit/broker-perfile fallback was needed — the fix lets the pages-broker-admin batch complete directly.

## Results — TWO CONSECUTIVE CLEAN RUNS

| Run | Batches | Total | Passed | Failed | Skipped | Failing files | pages-broker-admin |
|---|---|---|---|---|---|---|---|
| run-4 (pass 1) | 11/11 EXIT 0 | 3527 | 3524 | **0** | 3 | **0** | EXIT 0 (was OOM in all prior runs) |
| run-5 (pass 2) | 11/11 EXIT 0 | 3527 | 3524 | **0** | 3 | **0** | EXIT 0 |

Both runs are byte-identical in totals (deterministic, no flakes). Aggregated via `aggregate.mjs`.

## Interpretation
- **0 failed across the entire frontend suite** (228 files, 3527 tests) on both consecutive passes.
- The pages-broker-admin batch, which OOM'd (ERR_IPC_CHANNEL_CLOSED, 4GB/10min) in every prior baseline run, now completes cleanly — because the Slice-3 EditListing.guard stable-mock fix removed the infinite render loop.
- This satisfies the original issue #1825 body's closeout condition: "two consecutive clean full-suite runs on the same final commit."
- => #1825 could close entirely pending final tsc/lint/build confirmation (tsc/lint have only PRE-EXISTING repo-wide issues, 0 from any #1825 slice; build is clean — see Slice-2/4/3 validation matrices), rather than staying open for a future slice.

## Raw evidence
- run-4: baseline/run-4/_batch-summary.txt + batch-*.json (11) — copied here as run-4-batch-summary.txt
- run-5: baseline/run-5/_batch-summary.txt + batch-*.json (11) — copied here as run-5-batch-summary.txt
(baseline/ = docs/audit/evidence/issue-test-main-129-failures/baseline/)
