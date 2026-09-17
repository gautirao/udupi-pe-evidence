# Risk-Based Reviewer Routing Contract

To maximize parallel progress and minimize unnecessary reviewer invocations, dispatch specialist reviewers based on change risk:

| Change Category | Required Reviewers | Parallel Execution |
| :--- | :--- | :--- |
| **Backend / Deterministic Code** | `code-reviewer`, `final-merge-reviewer` | Yes |
| **UI / Frontend Visual** | `code-reviewer`, `ui-reviewer`, `final-merge-reviewer` | Yes |
| **Security / Auth / Secrets** | `code-reviewer`, `security-reviewer`, `final-merge-reviewer` | Yes |
| **Buyer-Facing / Production Discovery** | `code-reviewer`, `buyer-visibility-reviewer`, `final-merge-reviewer` | Yes |
| **Full Stack / Buyer UI & Auth** | `code-reviewer`, `security-reviewer`, `ui-reviewer`, `buyer-visibility-reviewer`, `final-merge-reviewer` | Yes |

## Routing Rules
1. **Parallel Dispatch**: Run all applicable specialist reviewers concurrently via `invoke_subagent`.
2. **Delta Auditing**: For follow-up commits, reviewers inspect only the `A..B` diff plus affected surrounding logic.
3. **Final Gatekeeper**: `final-merge-reviewer` runs after specialist reviews pass to consolidate findings, verify exact HEAD SHA, and emit `OWNER APPROVED TO MERGE`.
