# Risk-Based Reviewer Routing Contract

To maximize parallel progress, token efficiency, and review rigor, review responsibilities are split across two tiers:

## Tier 1: Local Pre-Push Reviewer (`pre-push-reviewer`)
- **Scope**: Local working-tree diff before git commit/push.
- **Goal**: Inner-loop defect catching, bad ownership detection, test adequacy, catching scope creep.
- **Output**: Compact local verdict (`CLEAN FOR COMMIT`). Does NOT post to GitHub PR.

## Tier 2: Independent PR Reviewers & Final Gatekeeper
Pushed exact HEAD commits are audited by independent PR subagents according to risk:

| Change Category | Required PR Reviewers | Parallel Execution |
| :--- | :--- | :--- |
| **Backend / Deterministic Code** | `code-reviewer`, `final-merge-reviewer` | Yes |
| **UI / Frontend Visual** | `code-reviewer`, `ui-reviewer`, `final-merge-reviewer` | Yes |
| **Security / Auth / Secrets** | `code-reviewer`, `security-reviewer`, `final-merge-reviewer` | Yes |
| **Buyer-Facing / Production Discovery** | `code-reviewer`, `buyer-visibility-reviewer`, `final-merge-reviewer` | Yes |
| **Full Stack / Buyer UI & Auth** | `code-reviewer`, `security-reviewer`, `ui-reviewer`, `buyer-visibility-reviewer`, `final-merge-reviewer` | Yes |

## Reviewer Identification & Efficiency Rules
1. **PR Code Reviewer Identification**:
   `code-reviewer` MUST identify itself in GitHub PR comments with:
   ```
   Reviewer: PR Code Reviewer
   Exact HEAD: <sha>
   ```
2. **Token Efficiency**:
   - PR reviewers do NOT repeat resolved trivial inner-loop findings previously caught and fixed during pre-push review.
   - `final-merge-reviewer` consumes existing specialist verdicts/evidence and investigates ONLY gaps or contradictions.
3. **Final Gatekeeper**: `final-merge-reviewer` runs after specialist PR reviews pass to consolidate findings, verify exact HEAD SHA, and post mandatory readiness verdict `READY_FOR_OWNER_MERGE_AUTHORIZATION`.
4. **Merge Authorization**: Merge execution requires an explicit top-level comment authored by the project owner containing `OWNER_APPROVED_TO_MERGE head:<full-current-sha>`.
