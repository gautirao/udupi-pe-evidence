# Demo/fallback badge logic — confirmation of removal (issue #1567)

## Status: already removed in #1616; this PR keeps it removed and adds no new fake-badge logic.

The demo/fallback badge helpers (`demoTrustFallback`, `demoTrustTierFor`, `data-demo-trust`, deterministic fake badges) were removed in issue **#1616**. A repo-wide search over `src/` finds these tokens ONLY in the regression tests that assert they stay gone:
- `src/components/discover/__tests__/PropertyCard.test.tsx:786` — comment: "demoTrustFallback prop and demoTrustTierFor helper are REMOVED in #1616."
- `src/components/discover/__tests__/PropertyCard.test.tsx:841-855` — structural regression test asserting `demoTrustFallback` prop does not exist and no badge renders for a null value.

## What #1567 changed on the FE (not demo logic)
The only client-side removal in this PR is the now-obsolete `TRUST_TIERS` letter→word map in `PropertyCard.tsx` — that map was the client-side *projection* being relocated to the backend (`TrustBadge.java`), NOT demo/fallback logic. After this PR the FE consumes the backend's public `trustBadge` directly and never derives a badge from a raw letter.

## Result
AC6 (demo/fallback logic absent) is satisfied and regression-guarded. The #1616 regression tests pass in this branch (part of the PropertyCard suite, 76 tests, exit 0).
