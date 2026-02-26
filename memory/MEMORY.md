# Project Memory

## User Preferences

- **Sequential execution only**: Never run multiple tool calls or agents in parallel. Always wait for each step to complete before starting the next. This applies to agents, bash commands, file reads, etc.

## Project

- Spring Boot backend + React/Vite frontend
- Supabase for auth, PostgreSQL for persistence
- Flyway migrations (currently at V16)
- Test suite: 83 frontend tests (vitest), 472 backend tests (JUnit)

## Sprint 6 State — COMPLETE

- PR-S6-1 ✅ `abf5fec` — atomic booking state machine
- PR-S6-2 ✅ `63f1d33` — PaymentController atomicity + tests
- PR-S6-3 ✅ `131befc` — frontend paywall tests (83 frontend tests)
- PR-S6-4 ✅ `108ffe9` — booking pagination + V17 composite indexes (476 backend tests)
- PR-S6-5 ✅ closed — App.tsx already lazy-loads; PaywallCard SPA fix deferred (auth state is React context, not TanStack Query)
- Agent optimisation ✅ `d33c605` — security-reviewer/code-reviewer → haiku, terse table output, risk-tier pipeline in PR_RULES

Flyway is now at V17. Backend tests: 476. Frontend tests: 83.

## Sprint 7 Backlog (carry-over)

- Global @ControllerAdvice (PropertyReferenceException → 400, catch-all)
- Rate limiting on payment + booking endpoints
- PaywallCard SPA fix: expose refreshAuth() from AuthContext
- Frontend: update booking list consumers to handle Page<> (read .content)
- Boundary test: insights_access_until == NOW()

## Key Patterns

- `window.location.reload` in vitest/jsdom: use `Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...window.location, reload: reloadMock } })` in `beforeEach`. `vi.spyOn` does NOT work because jsdom defines location as non-configurable.
- Atomic booking state: `@Modifying(clearAutomatically=true) @Query` JPQL UPDATE with `WHERE id=? AND status=? AND callerId=?`
- Agent team workflow: qa-fast → implementer → qa → code-reviewer → security-reviewer (all sequential now)
