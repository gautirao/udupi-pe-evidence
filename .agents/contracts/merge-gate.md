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

3. **Material UI Visual Gate**:
   - For material buyer-visible UI changes (reskin, layout, spacing, typography, marker/card redesign, responsive layout, visual hierarchy, interaction affordances, mobile presentation), AGY MUST STOP before merge and request explicit human owner approval.
   - Required execution sequence:
     `implementation` -> `pre-push review` -> `code/test review` -> `deploy exact HEAD preview` -> `independent visual verification` -> `publish visual evidence` -> `READY_FOR_OWNER_VISUAL_APPROVAL` -> `STOP & WAIT`
   - No timeout, inference, reviewer PASS, silence, or previous approval can substitute for explicit human owner visual approval.

4. **Head-Bound Approval Validity**:
   - Human owner visual approval is strictly bound to the exact HEAD SHA (`head:<full-current-sha>`).
   - Any code-changing push invalidates prior approval (`OWNER APPROVAL = STALE`), requiring fresh visual evidence and fresh human visual approval.

5. **Pre-Merge Verification Checklist**:
   Before executing merge, the orchestrator MUST verify:
   - **Current exact HEAD**: Target remote branch HEAD SHA matches reviewed commit SHA.
   - **Reviewer State Ledger**: All required independent reviews are PASS or VISUAL_MATCH with ZERO unresolved PARTIAL, BLOCK, REQUEST_CHANGES, FAIL, or NEEDS_WORK states.
   - **Contradiction-free**: Matrix status is clean with ZERO `REVIEW_STATE_CONTRADICTION`.
   - **Visual Evidence Contract (UI tasks)**: Complete GitHub-visible visual evidence exists (mock reference, BEFORE, AFTER, mobile AFTER, selected/hover states, preview URL, exact HEAD).
   - **Human Owner Visual Approval (UI tasks)**: Explicit human owner approval is recorded for current exact HEAD.
   - **Mergeability**: GitHub reports `MERGEABLE` (`gh pr view <PR> --json mergeable`).

6. **Merge Execution Authority**:
   - **Non-UI Work**: Autonomous merge is allowed after all required independent reviews pass cleanly and `final-merge-reviewer` emits `READY_FOR_OWNER_APPROVAL`.
   - **Material UI Work**: Autonomous merge is allowed ONLY AFTER actual human visual approval is observed for current exact HEAD and `final-merge-reviewer` emits `READY_TO_MERGE`.
   - Execute squash merge: `gh pr merge <PR> --squash --delete-branch`.
