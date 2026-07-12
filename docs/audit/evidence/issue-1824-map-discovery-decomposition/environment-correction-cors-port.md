# Environment correction — Phase 7A "no seeded data" was a CORS/port misdiagnosis

**Date:** 2026-07-12
**Discovered during:** Slice S4 Phase 7A live browser verification (PR #1851), at the user's explicit request to re-check the port after two prior attempts showed only empty states.

## What was previously believed (WRONG)

Across S2c's live 7A check and S3/S4's PLAN_REVIEW-approved 7A SKIP justifications, the dev environment was documented as having **no seeded area/property data for any city** (Bangalore and Udupi both showing "No areas found" / "No properties listed"). This was used as one of two independent grounds to accept deterministic-test proof-substitution instead of a live browser check.

## What was actually happening (CORRECTED)

`backend/src/main/resources/application.yml` line 161:

```yaml
cors:
  allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:5173,http://localhost:5174,http://localhost:3000}
```

The backend (port 8085) only allowlists browser origins `5173`, `5174`, and `3000`. This worktree's dev server (per `.claude/active-runs/issue-1824.lock` `selected_ports`) was running on **port 5220**, which is not in that allowlist. As a result:

- Every browser `fetch` from `localhost:5220` to `localhost:8085/api/discover/*` got an `OPTIONS` preflight `403` and the underlying `GET` a `503`.
- A direct `curl` to the same endpoint (no `Origin` header, no browser CORS enforcement) succeeded and returned full real data.
- The frontend's error/empty-state handling silently rendered "No areas found" / "No properties listed" for what was actually a blocked network layer, not an empty database.

**Re-verification:** starting a second Vite instance on the allowlisted port 5174 and navigating there immediately surfaced real data — **Bangalore: 16 area groups, 313 areas, 1,736 verified properties** (e.g. Whitefield 83 listings, Electronic City 78, Thanisandra-Hennur Belt 181).

## Correction to prior slices

- **S2c** (PR #1846, merged): the live 7A "PASS_WITH_ENVIRONMENT_LIMITATION" verdict and its "no seeded area data" finding were based on this same port/CORS misdiagnosis, not a genuinely empty database.
- **S3** (PR #1848, merged): the 7A SKIP justification's second independent ground ("dev env has NO city with seeded area data") was also based on this misdiagnosis. (S3's first ground — full unit/integration coverage of the pure selector — stands independently and was not affected.)
- **S4** (PR #1851): re-ran the full originally-requested Phase 7A check battery against port 5174 with real data. Results: checks 1 (typing), 2 (clear via chip), 3 (URL hydration), 4 (back/forward), and 6 (rapid typing) all **PASS** live. Check 5 (Clear All) surfaced a genuine, reproducible, **pre-existing** defect unrelated to S4's diff (see the filed follow-up issue).

## Standing instruction for S5–S8 browser verification

Before any future Phase 7A live browser check in this worktree:

1. Confirm which Vite port is running (`.claude/active-runs/issue-1824.lock` → `selected_ports`).
2. If that port is not in the backend's `cors.allowed-origins` list, **do not conclude the environment lacks data**. Either:
   - Start (or redirect the browser check to) a Vite instance on an allowlisted port — **5174 is verified working** — or
   - Explicitly set `CORS_ALLOWED_ORIGINS` to include the worktree's assigned port before testing.
3. Bangalore has substantial real seeded data (1,736 listings as of this check) and is a good default city for live verification; Udupi's status was not re-checked under the corrected port and should not be assumed empty either.
