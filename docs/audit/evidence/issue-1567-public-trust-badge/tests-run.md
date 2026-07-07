# Tests run — issue #1567 (provenance-labelled)

Per CLAUDE.md §11: a check is PASS only if the command executed AND assertions ran. Provenance:
[BE-eng]=backend-engineer, [orch]=Mode-3 orchestrator first-hand, [main]=Main Agent first-hand re-run.

## Backend (Spring, Testcontainers/mocked — no shared-Supabase mutation)
| Suite | Command | Exit | Result | By |
|---|---|---|---|---|
| Discover package | `mvn -f backend/pom.xml test -Dtest="com.example.realestate.discover.**"` | 0 | 670 tests, 0 failures | [BE-eng] |
| Discover package (re-run) | same | 0 | discover suite green | [main] |

Includes `TrustBadgeTest` (allow-list: A/B/C/D/null/lowercase/unknown/empty), `CityAreaListingsServiceTest` (anon==authed projection), and NEGATIVE assertions `jsonPath("$..trustTier").doesNotExist()` in `CityAreaListingsControllerTest` + `CityAreaListingsIT`.

## Frontend unit (vitest, JSDOM)
| Suite | Command | Exit | Result | By |
|---|---|---|---|---|
| PropertyCard + AreaGroupResultsPanel | `vitest run PropertyCard.test.tsx AreaGroupResultsPanel.test.tsx` | 0 | 84 passed | [orch] |
| MapDiscovery (with VITE_SUPABASE_* set) | `vitest run src/pages/__tests__/MapDiscovery` | 0 | 22 files / 168 passed | [orch] |
| Full FE unit re-run | `vitest run` | 0 | 364/364 passed | [main] |

Note: an orchestrator MapDiscovery run WITHOUT `VITE_SUPABASE_*` showed 4 files failing at MODULE LOAD (`src/integrations/supabase/client.ts`) — an env-init artifact, NOT a regression; all tests that ran passed, and with the env set the full suite is green.

## E2E (Playwright, network-mocked, anon — no shared-Supabase mutation)
| Spec | Command | Exit | Result | By |
|---|---|---|---|---|
| discover-trust-badge-1567 | `PLAYWRIGHT_BASE_URL=http://localhost:5187 playwright test --project=full e2e/discover-trust-badge-1567.spec.ts` | 0 | 6 passed (5.7s) | [orch] |
| discover-trust-badge-1567 (re-run) | same, `PLAYWRIGHT_BASE_URL=http://localhost:5187` | 0 | 6/6 passed | [main] |

**Important — false-negative note:** an earlier [main] run reported 4/6 fail; that was a PROD-baseURL false negative (Playwright default baseURL is the deployed pages.dev site, which lacks this branch). With `PLAYWRIGHT_BASE_URL=http://localhost:5187` (the local worktree stack) the spec is 6/6. Always set the local base URL for this branch.

Mutation-safety: E2E ran with NO broker/admin/user creds → Playwright `global-setup` wrote empty storage states and skipped listing creation; `global-teardown` found nothing to clean. Network-mocked (`page.route`); no Java backend required for the spec.

## Typecheck
`tsc --build tsconfig.app.json tsconfig.node.json` — the prior compile break (`MapDiscovery.tsx:804 TS2339 trustTier`) is resolved; 0 trust-related / 0 changed-source errors; 114 pre-existing unrelated errors remain (Supabase generated-type drift, TS2556 mock-spread in test files) — not introduced by this change. [orch]

## Live product verification (2026-07-06, worktree stack FE :5187 / BE :8093)
- Phase 7A (live browser): area-first sale view 0 badges (clean); rent view 5 'Listed' badges; no letter badge; no `trustTier` in any response. Screenshots: `live-browser-01-default-sale-view.png`, `live-browser-02-rent-view-listed-badge.png`. [orch]
- Phase 7B (network+code): school-radius (9 items) + agri-map (2 items) carry no `trustTier`/`trustBadge` — badge-free by contract, cross-journey consistent. [orch]
