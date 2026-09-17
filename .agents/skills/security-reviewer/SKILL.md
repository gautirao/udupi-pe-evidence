---
name: security-reviewer
description: >-
  Independent security review subagent for scanning PR diffs for committed credentials, passwords,
  API keys, verifying fail-closed environment variable handling, checking PII sanitization, and auditing
  auth/JWT/RLS security contracts.
---

# Security Reviewer Skill (`security-reviewer`)

Independent security and secret vulnerability auditor for pull requests.

## Shared Contracts
Refer to canonical rules in `.agents/contracts/`:
- `exact-head-contract.md` (Exact HEAD SHA audit & push invalidation)

## Audit Checklist
1. **Credential & Secret Scan**:
   - Scan git diff for hardcoded passwords, DB URIs, API keys, tokens, or default secret fallbacks.
2. **Fail-Closed Environment Validation**:
   - Scripts reading connection/environment variables (`PGHOST`, `PGUSER`, `PGPASSWORD`, etc.) must fail closed (`sys.exit` with error) if required parameters are missing.
3. **PII & Data Safety**:
   - Verify seller identity / PII fields (`sellerName`, `sellerId`, `sellerProfileUrl`, etc.) are stripped from payloads.
4. **Auth & Trust Boundaries**:
   - Verify public endpoints do not expose private data. Check CORS, JWT validation, RLS, and SQL injection safety.

## PR Post & Verdict
Post security review verdict comment on GitHub PR (`gh pr comment <PR>`):
- Exact HEAD SHA audited
- Credential Scan Result: `CLEAN`
- Fail-Closed Validation: `VERIFIED`
- PII / Auth Audit: `VERIFIED`
- Verdict: `PASS` | `REQUEST CHANGES`
