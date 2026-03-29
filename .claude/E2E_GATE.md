# E2E Gate Design — Smoke/Full Split

## Pre-push gate (fast, local)

The pre-push hook runs `scripts/run-e2e-local.sh` which executes `--project=smoke`.

Smoke project files (4 spec files):
- `quick-smoke.spec.ts` — Q1/Q4/Q5/Q6 run auth-free; Q3/Q7 skip without credentials
- `nav-roles.spec.ts` — N3 runs auth-free; N1/N2 skip without credentials
- `broker-listing-form.spec.ts` — GF1-GF3 run when broker credentials are present; skip otherwise
- `listing-lifecycle.spec.ts` — BC1 runs when broker/admin/user credentials are present; skip otherwise

**Locally** (with `.env.e2e`): all credential-gated tests run. Target: <30 seconds.
**In CI** (auth-free): only Q1/Q4/Q5/Q6 and N3 execute; the credential-gated tests skip gracefully.

## Full suite

Run with: `npm run test:e2e` or `npx playwright test --project=full`

Covers all spec files including auth-required tests.

## CI gate

The `playwright-pr` job in `.github/workflows/ci.yml` currently runs `quick-smoke.spec.ts`
directly against the deployed Cloudflare Pages site on every PR. A follow-up PR will
update it to use `--project=smoke` now that this split is in place.

## E2E Applicability Rules

| PR type | E2E required? |
|---------|--------------|
| Frontend — new page/route | YES |
| Frontend — existing page change | YES |
| Backend — API consumed by existing FE page | YES |
| Backend — no FE consumer | NO |
| Doc-only / Trivial | NO |
