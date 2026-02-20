### Frontend Best Practices (React + Vite + TS + Supabase + Leaflet)

**Baseline tooling (required)**

* TypeScript: `strict: true` + `tsc --noEmit` in CI
* ESLint + Prettier (auto-fix on save)
* Tests: Vitest + Testing Library (`@testing-library/react`, `user-event`)
* E2E smoke: Playwright (top 5 user-journey checks)

**Architecture / structure**

* Feature-first folders:

    * `pages/` = thin route shells
    * `features/<domain>/` = API + hooks + components + schemas
    * `lib/` = shared utilities (env, http, security)
* Keep global state minimal: Auth only (user/session/role/capabilities).

**Auth + roles**

* Supabase Auth in a small `AuthContext` exposing:

    * `user`, `session`, `role`, `isDealer`, `isAdmin`, `refreshRole()`
* Route guards:

    * `RequireAuth`, `RequireDealer`, `RequireInsightsAccess`
* Navigation should be config-driven + capability-filtered (no scattered `if`s).

**API / data fetching**

* One HTTP wrapper (`lib/http.ts`):

    * uses `VITE_BACKEND_BASE_URL`
    * injects `Authorization: Bearer <JWT>` when present
    * consistent error shape
* Prefer TanStack Query for server state (caching, retries, pagination).

**Forms**

* React Hook Form + Zod validation (single source of truth)
* Server errors: map to field errors + one toast

**Maps (react-leaflet)**

* Lazy-load map routes (bundle heavy)
* Memoize markers/layers; don’t recreate icons each render
* Isolate clustering logic in its own component

**Security**

* No `dangerouslySetInnerHTML`
* Escape/sanitize popup content (centralize in `lib/security.ts`)
* Don’t log tokens/PII

**PR checklist (enforce)**

* ✅ `npm run lint && npm run typecheck && npm test`
* ✅ adds/updates at least 1 meaningful test
* ✅ guarded routes for protected pages
* ✅ no direct `fetch` outside `lib/http.ts`
* ✅ map changes verified for performance (no rerender loops)
* ✅ update `docs/BROWSER_SMOKE_TEST.md` if journey changes
* ✅ no direct `console.log` statements with sensitive data
* ✅ feature flags for experimental features
* ✅ accessibility checks for new components
* ✅ internationalization (i18n) for new text content
