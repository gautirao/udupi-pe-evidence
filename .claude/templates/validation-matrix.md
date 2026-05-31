<!--
TEMPLATE — .claude/templates/validation-matrix.md

Purpose: the risk-triggered evidence packet that PR_REVIEW consumes. One final
matrix per issue. Authored by the Team Lead during Phase 5–6 (execution) for
validation_matrix.level = COMPACT or FULL. NOT created for NOT_REQUIRED (a
one-line justification lives in team-lead-plan.toml / workdone-candidate.toml).

Policy / decision rules / evidence rules: .claude/mode3/contracts/validation-matrix.md

Copy the COMPACT block OR the FULL block (matching the approved level) to:
  .claude/handoffs/issue-<N>/validation-matrix.md

Evidence rules (enforced):
  - A row is PASS / VERIFIED / APPROVE only with REAL evidence:
    test command + exit code · file/function ref · runtime output ·
    browser/E2E evidence · PR/report citation · reviewer finding ·
    or explicit NOT_PROVEN with reason + follow-up.
  - Vague rows ("implemented", "looks good", "verified by agent") are NOT evidence.
  - Be honest about deferrals: "NOT_PROVEN — <reason>".

Token-efficiency (enforced):
  - No huge logs. Prefer command summary + exit code + file path.
  - Link/reference detailed artefacts instead of copying them.
  - Keep COMPACT matrices short. Use FULL only for hard-trigger categories.
-->

<!-- ============================ COMPACT ============================ -->
<!-- Use for normal bounded work (small FE/BE behaviour change, bounded bug
     fix, ordinary unit-testable logic, small E2E update, non-dangerous CLI
     helper, low-risk docs whose claims still need evidence). -->

# Validation matrix — issue #<N> (COMPACT)

## Validation verdict

APPROVE / REQUEST_CHANGES

## Acceptance criteria

| AC | Evidence | Status |
|---|---|---|
| <AC1 short text> | <command + exit code / file:line / report citation> | PASS / NOT_PROVEN |

## Not proven / deferred

| Item | Reason | Follow-up |
|---|---|---|
| <item> | <honest reason> | <issue/PR ref or NONE> |

## Required changes before PR_REVIEW

<!-- Empty if none. Any open item here blocks PR_REVIEW. -->

<!-- ============================== FULL ============================== -->
<!-- Use for hard-trigger categories: auth/role/session/JWT/permission;
     public/anonymous endpoint exposure; listing visibility (LIVE vs non-LIVE);
     listing lifecycle (approval/rejection/deletion/archive); data
     migration/schema/geospatial; indexing/search/OpenSearch/Kafka/outbox;
     backfill/rebuild/reset/cleanup scripts; scripts that create/update/delete
     data; cache policy; metrics/observability with cardinality risk;
     workflow/gate/validator/agent changes; security-sensitive product paths;
     any PR whose claims must be factually traced; any issue where failure
     modes matter. -->

# Validation matrix — issue #<N> (FULL)

## Validation verdict

APPROVE / REQUEST_CHANGES

## Acceptance criteria matrix

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| <AC1> | <requirement> | <evidence> | PASS / NOT_PROVEN |

## Safety matrix

| Safety concern | Evidence | Status |
|---|---|---|
| <concern> | <evidence> | PASS / NOT_PROVEN |

## Code traceability matrix

| Behaviour | File/function/test | Evidence | Status |
|---|---|---|---|
| <behaviour> | <path:func / test name> | <evidence> | PASS / NOT_PROVEN |

## Failure-mode matrix

| Failure mode | Expected behaviour | Evidence | Status |
|---|---|---|---|
| <failure mode> | <expected> | <evidence> | PASS / NOT_PROVEN |

## Claims / factual traceability matrix

<!-- Especially important for docs/design PRs that make factual claims based on
     prior reports, ADRs, source code, metrics, or POC evidence. -->

| Claim | Source of truth | Evidence | Status |
|---|---|---|---|
| <claim> | <report/ADR/code/metric ref> | <evidence> | VERIFIED / NOT_PROVEN |

## Not proven / deferred

| Item | Why deferred | Follow-up |
|---|---|---|
| <item> | <honest reason> | <issue/PR ref or NONE> |

## Required changes before PR_REVIEW

<!-- Empty if none. Any open item here blocks PR_REVIEW. -->

## Optional follow-ups

<!-- Non-blocking improvements; explicitly out of scope for this PR. -->
