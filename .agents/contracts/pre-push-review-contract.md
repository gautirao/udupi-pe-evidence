# AGY Pre-Push Reviewer Contract

Lightweight inner review stage operating locally before code is committed or pushed to remote.

## Core Rules

1. **Role & Boundaries**:
   - Independent subagent from the implementation engineer.
   - Audits current working-tree and index diff (`git diff`).
   - Inspects directly affected surrounding code and tests only.
   - Searches broader codebase ONLY when needed to validate an architectural boundary concern.
   - Catches correctness defects, duplicated abstractions, bad state ownership, insufficient tests, security mistakes, and unnecessary scope.
   - Does NOT perform full PR certification or authorize merges.
   - Normally does NOT post comments to GitHub (operates locally in the implementation loop).

2. **Delta-Based Re-Inspection**:
   - After engineer fixes findings locally, re-inspects ONLY the changed fix delta (`git diff`) since previous checkpoint rather than re-reading everything.

3. **Mandatory Local Verdict**:
   - Final local verdict MUST be either `CLEAN FOR COMMIT` (pass) or `CHANGES REQUIRED` (fail).
   - The engineer MUST NOT commit or push implementation changes until `CLEAN FOR COMMIT` is received, unless a remote CI/preview run is genuinely required to proceed.

4. **Separation from PR Reviews**:
   - `CLEAN FOR COMMIT` is a local pre-commit check and MUST NOT be treated as PR approval or merge authorization.
