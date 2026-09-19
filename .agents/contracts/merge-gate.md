# Merge Authorization Gate Contract

1. **Human-Only Owner Approval Token**:
   - AGY, subagents, reviewers, final merge reviewers, and orchestrators MUST NEVER emit `OWNER_APPROVED_TO_MERGE` or agent equivalents ("owner approved", "approved by owner", "owner authorization granted").
   - `OWNER_APPROVED_TO_MERGE` is reserved EXCLUSIVELY for an explicit message/comment authored by the human owner in GitHub or active session.
   - AGY agents emit `READY_FOR_OWNER_APPROVAL` (non-UI) or `READY_FOR_OWNER_VISUAL_APPROVAL` (UI). These tokens are NOT merge authorization.

2. **Hard Block Gate & Contradiction Check**:
   - Merge is strictly BLOCKED if ANY applicable reviewer on the CURRENT exact HEAD has:
     `PARTIAL`, `BLOCK`, `REQUEST_CHANGES`, `FAIL`, `NEEDS_WORK`, or `*_PENDING`.
   - A subsequent PASS from one reviewer does NOT erase or override an unresolved PARTIAL/BLOCK from another reviewer.
   - If reviewer states conflict (e.g. `code-reviewer` PASS but `ui-reviewer` PARTIAL), the gate evaluates to `REVIEW_STATE_CONTRADICTION` and merge is BLOCKED.

3. **Mandatory Review Reconciliation Gate**:
   - Merge gate evaluation MUST NOT proceed while `Review Reconciliation Status` is `REVIEW_RECONCILIATION_IN_PROGRESS`.
   - Transition out of `REVIEW_RECONCILIATION_IN_PROGRESS` requires **2 consecutive quiet polls** with unchanged HEAD, 0 unresolved current-head findings, and clean contradiction check (`CLEAN`).
   - Allowed final reconciliation states: `REVIEW_RECONCILIATION_IN_PROGRESS`, `BLOCKED`, `READY_FOR_OWNER_APPROVAL`, `READY_FOR_OWNER_VISUAL_APPROVAL`, `READY_TO_MERGE`.

4. **Material UI Visual Gate**:
   - For material buyer-visible UI changes (reskin, layout, spacing, typography, marker/card redesign, responsive layout, visual hierarchy, interaction affordances, mobile presentation), AGY MUST STOP before merge and request explicit human owner approval.
   - Required execution sequence:
     `implementation` -> `pre-push review` -> `code/test review` -> `review reconciliation` -> `deploy exact HEAD preview` -> `independent visual verification` -> `publish visual evidence` -> `READY_FOR_OWNER_VISUAL_APPROVAL` -> `STOP & WAIT`
   - No timeout, inference, reviewer PASS, silence, or previous approval can substitute for explicit human owner visual approval.

5. **Head-Bound Approval Validity**:
   - Human owner visual approval is strictly bound to the exact HEAD SHA (`head:<full-current-sha>`).
   - Any code-changing push invalidates prior approval (`OWNER APPROVAL = STALE`), requiring fresh visual evidence and fresh human visual approval.

6. **Pre-Merge Verification Checklist**:
   Before executing merge, the orchestrator MUST verify:
   - **Review Reconciliation Complete**: Status is NOT `REVIEW_RECONCILIATION_IN_PROGRESS` and `consecutive_quiet_polls >= 2`.
   - **Current exact HEAD**: Target remote branch HEAD SHA matches reviewed commit SHA.
   - **Reviewer State Ledger**: All required independent reviews are PASS or VISUAL_MATCH with ZERO unresolved PARTIAL, BLOCK, REQUEST_CHANGES, FAIL, or NEEDS_WORK states.
   - **Contradiction-free**: Matrix status is clean with ZERO `REVIEW_STATE_CONTRADICTION`.
   - **Visual Evidence Contract (UI tasks)**: Complete GitHub-visible visual evidence exists (mock reference, BEFORE, AFTER, mobile AFTER, selected/hover states, preview URL, exact HEAD).
   - **Explicit Human Owner Approval**: Explicit human owner approval token (`OWNER_APPROVED_TO_MERGE` or explicit owner merge command) is recorded for current exact HEAD SHA. Neither `READY_FOR_OWNER_APPROVAL` nor `READY_FOR_OWNER_VISUAL_APPROVAL` permits merge execution.
   - **Mergeability**: GitHub reports `MERGEABLE` (`gh pr view <PR> --json mergeable`).

7. **Merge Execution Authority**:
   - **Strict Human Owner Approval Requirement**: No PR (UI or non-UI) may be merged without an explicit human owner approval token (`OWNER_APPROVED_TO_MERGE` or explicit owner merge command) posted for the exact current HEAD.
   - **Non-UI Work**: After all required independent reviews and review reconciliation pass cleanly, emit `READY_FOR_OWNER_APPROVAL` and STOP. Await explicit human owner merge authorization.
   - **Material UI Work**: After visual evidence and independent reviews pass cleanly, emit `READY_FOR_OWNER_VISUAL_APPROVAL` and STOP. Await explicit human owner visual/merge authorization.
   - **Merge Transition**: Upon observing explicit human owner approval for the exact current HEAD SHA, transition status to `READY_TO_MERGE` and execute squash merge (`gh pr merge <PR> --squash --delete-branch`).
