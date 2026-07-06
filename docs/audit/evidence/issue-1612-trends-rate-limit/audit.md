# Audit evidence — issue #1612: rate-limit public /api/trends/**

## Summary

The fully-anonymous public GET family `/api/trends/**` (`/options`, `/overview`, `/area-intelligence`, `/resolve-area`) had no per-IP rate limiting, leaving it open to resource-exhaustion / scraping abuse. This change adds `TrendsRateLimitFilter`, a per-IP Bucket4j `OncePerRequestFilter` that mirrors the already-shipped, already-reviewed `DiscoverRateLimitFilter` (#1671), registered before JWT validation so it covers the anonymous permitAll paths. No change to the endpoints' response contract, data, params, or auth semantics.

## Approach selection

Two existing rate-limit precedents were investigated:

- **Precedent A — `RateLimiterService`** (per-authenticated-user Bucket4j; used by bookings/payments/geocoding/upload-url #1699). **Rejected**: keys per user id; `/api/trends/**` is fully anonymous (`JwtConfig.java` `.requestMatchers(HttpMethod.GET, "/api/trends/**").permitAll()`), so no principal exists to key on.
- **Precedent B — `DiscoverRateLimitFilter`** (per-IP `OncePerRequestFilter`, #1671). **Chosen**: the only correct fit for anonymous traffic; reused near-verbatim.

Key delta vs the discover template: `/api/trends/**` has **no** authenticated sub-paths, so `TrendsRateLimitFilter` omits the `AUTHENTICATED_EXACT_PATHS` exclusion set the discover filter carries.

## Locked design decisions (PLAN_REVIEW approved)

| Setting | Value |
|---|---|
| Config namespace | `app.ratelimit.trends.*` |
| Default requests-per-minute | 60 (`${RATE_LIMIT_TRENDS_REQUESTS_PER_MINUTE:60}`) |
| HEAD scope | included (anti-`curl -I`-bypass, same as discover) |
| trust-forwarded-header | false by default (XFF spoofable when true; documented caveat) |
| max-entries | 100000, clear-before-insert cap + hourly eviction |
| Kill-switch | `app.ratelimit.trends.enabled` (default true) |
| 429 shape | status 429 + `Retry-After: 60` + `{"error": "..."}` JSON + counter `trends.ratelimit.throttled` |

## Files changed

- `backend/src/main/java/com/example/realestate/security/TrendsRateLimitFilter.java` (new)
- `backend/src/main/java/com/example/realestate/security/JwtConfig.java` (additive ObjectProvider wiring; discover wiring + permitAll matcher untouched)
- `backend/src/main/resources/application.yml` (`app.ratelimit.trends.*` block)
- `backend/src/test/resources/application.properties` (`app.ratelimit.trends.enabled=false` test-classpath shield — `.properties` not `.yml` to avoid shadowing main config)
- `backend/src/test/java/com/example/realestate/security/TrendsRateLimitFilterTest.java` (new; 3 `@WebMvcTest` classes, 9 tests)

## Verification evidence

| Check | Command | Result |
|---|---|---|
| Compile | `mvn -q -f backend/pom.xml -DskipTests compile` | exit 0 |
| New filter tests | `mvn -f backend/pom.xml -Dtest=TrendsRateLimitFilterTest,TrendsRateLimitFilterKeyIsolationTest,TrendsRateLimitFilterDisabledTest test` | exit 0 — 9/9 pass |
| Full backend suite (regression) | `mvn -q -f backend/pom.xml test` | Tests run: 3004, Failures: 0, Errors: 0, Skipped: 0 (incl. DiscoverRateLimitFilterTest 10/10) |

## Gates

- qa-fast: PASS (pre-implementation risk scan; E2E authoring recommended: NO)
- code-reviewer (opus): APPROVE, no blocking findings
- security-reviewer (Gate F): APPROVE WITH COMMENTS — no blocking findings; one LOW advisory (XFF `split(",")[0]` AIOOBE reachable only when `trust-forwarded-header=true`, inherited from the precedent) recommended as a fast-follow across both filters
- qa verification: full backend suite green (3004/0/0/0)

## Known follow-up

Harden `resolveClientKey` XFF split against an all-comma/whitespace `X-Forwarded-For` header (AIOOBE) in both `TrendsRateLimitFilter` and `DiscoverRateLimitFilter` before `trust-forwarded-header` is enabled in any environment. Non-blocking; out of scope for this PR (discover filter is scope-locked here).
