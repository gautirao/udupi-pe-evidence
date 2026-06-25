---
name: workdone-review
description: Verification gate and workdone review protocol before PR opening.
---

# Workdone Verification Review

Before declaring an implementation candidate ready for PR creation, the Main Agent must evaluate collected evidence against the issue requirements.

## Gate Verification Checklist

1. **Scope Compliance**: Verify that changed files are strictly within the agreed issue boundaries. Flag any unscoped edits.
2. **Authoritative Frontend Correctness**: Check that frontend code passed repo-specific verification:
   ```bash
   node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
   ```
3. **Baseline Isolation**: If TypeScript baseline errors exist on `main`, verify that net-new regressions were evaluated using the comparison tuple `file + TS code + normalized message`.
4. **Test Assertions**: Confirm automated tests ran with exit code 0 AND assertions actually executed (not skipped or environment-failed).
5. **Browser Verification**: If UI or user-visible features were modified, confirm browser verification evidence is captured.

## Verdicts

- **PASS (Workdone Confirmed)**: Proceed to `.antigravity/commands/closeout.md`.
- **REVISION_REQUIRED**: Write rework brief `.antigravity/templates/rework-request.md` to disk, route back to the implementer subagent, and re-enter validation.
- **NEEDS_USER_DECISION**: Stop if unresolved baseline issues or architectural contradictions require human input.
