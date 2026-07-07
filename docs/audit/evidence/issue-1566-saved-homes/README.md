# Evidence — issue #1566: persist saved homes

Feature: server-backed saved homes (save/unsave from listing cards, hydrated heart state, `/saved-homes` profile page, anon sign-in prompt). Branch `feat/1566-saved-homes`.

## Contents
- `api-contract.md` — endpoints, status codes, idempotency semantics, authz
- `db-migration.md` — V107 saved_listings table + rationale
- `auth-security-checks.md` — IDOR / anon-401 / injection / data-exposure review outcomes (Gate F)
- `frontend-behaviour.md` — hook, PropertyCard wiring, SavedHomes page, anon guard
- `tests-run.md` — commands + exit codes + pass counts
- `known-gaps.md` — E2E deferral, screenshots, listSaved IT

## Gate outcomes (Mode-3 Stage B)
| Gate | Verdict |
|---|---|
| qa-fast (pre-impl) | PASS (security boundary set) |
| backend-engineer | PASS (22/22 tests) |
| frontend-engineer | PASS (139/139 targeted) |
| code-reviewer (opus) | APPROVE (0 blocking) |
| security-reviewer (Gate F, opus) | APPROVE (0 blocking) |
| qa e2e-authoring | spec authored; execution NOT_RUN (justified) |
| qa verification | PASS |

Authoritative log: `.claude/handoffs/issue-1566/team-lead-execution-log.md`. Validation matrix (FULL): `.claude/handoffs/issue-1566/validation-matrix.md`.
