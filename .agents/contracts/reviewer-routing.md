# Risk-Based Reviewer Routing Contract

To maximize parallel progress, token efficiency, and review rigor, review responsibilities are split across two tiers:

## Tier 1: Local Pre-Push Reviewer (`pre-push-reviewer`)
- **Scope**: Local working-tree diff before git commit/push.
- **Goal**: Inner-loop defect catching, bad ownership detection, test adequacy, catching scope creep.
- **Output**: Compact local verdict (`CLEAN FOR COMMIT`). Does NOT post to GitHub PR.

## Tier 2: Independent PR Reviewers & Final Gatekeeper
Pushed exact HEAD commits are audited by independent PR subagents according to risk:

| Change Category | Required PR Reviewers | Verdict Options | Parallel Execution |
| :--- | :--- | :--- | :--- |
| **Backend / Deterministic Code** | `code-reviewer`, `final-merge-reviewer` | `PASS` / `REQUEST_CHANGES` | Yes |
| **UI / Frontend Visual** | `code-reviewer`, `ui-reviewer`, `final-merge-reviewer` | `VISUAL_MATCH` / `VISUAL_MISMATCH` / `PARTIAL` | Yes |
| **Security / Auth / Secrets** | `code-reviewer`, `security-reviewer`, `final-merge-reviewer` | `PASS` / `FAIL` | Yes |
| **Buyer-Facing / Production Discovery** | `code-reviewer`, `buyer-visibility-reviewer`, `final-merge-reviewer` | `PASS` / `FAIL` | Yes |
| **Full Stack / Buyer UI & Auth** | `code-reviewer`, `security-reviewer`, `ui-reviewer`, `buyer-visibility-reviewer`, `final-merge-reviewer` | Matrix combination | Yes |

## Reviewer Identification & Specific Roles
1. **PR Code Reviewer Identification**:
   `code-reviewer` MUST identify itself in GitHub PR comments with:
   ```
   Reviewer: PR Code Reviewer
   Exact HEAD: <sha>
   ```
2. **UI Visual Reviewer Role (`ui-reviewer`)**:
   - `ui-reviewer` is an **evidence and difference verifier**, NOT an owner proxy.
   - Compares: `APPROVED MOCK` vs `BEFORE` vs `AFTER`.
   - Reports concrete MATCH and MISMATCH findings.
   - Emits verdict: `VISUAL_MATCH`, `VISUAL_MISMATCH`, or `PARTIAL`.
   - Cannot authorize merge.
3. **Contradiction Check**:
   - The orchestrator and `final-merge-reviewer` MUST scan all current-head reviewer results.
   - If one reviewer reports `PASS` or `VISUAL_MATCH` while another reports `PARTIAL`, `BLOCK`, `VISUAL_MISMATCH`, or `REQUEST_CHANGES`, the optimistic result MUST NOT be chosen.
   - Evaluate as `REVIEW_STATE_CONTRADICTION` and block merge until resolved.
4. **Token Efficiency**:
   - PR reviewers do NOT repeat resolved trivial inner-loop findings previously caught and fixed during pre-push review.
   - `final-merge-reviewer` consumes existing specialist verdicts/evidence and investigates ONLY gaps or contradictions.
5. **Final Gatekeeper (`final-merge-reviewer`)**:
   - Runs after specialist PR reviews pass to consolidate findings and verify exact HEAD SHA.
   - Emits `READY_FOR_OWNER_APPROVAL` (non-UI) or `READY_TO_MERGE` (UI, after explicit human owner visual approval).
   - MUST NEVER emit `OWNER_APPROVED_TO_MERGE`.
