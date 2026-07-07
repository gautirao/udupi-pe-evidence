# PR-A — Discover school-search region scoping (issue #1798, regression 3)

## What this PR fixes
A buyer in Bangalore/north searching schools for "heb" via the Discover scoped search was seeing
Udupi schools, because `GET /api/public/schools/search` was globally unscoped. PR-A adds an optional
city scope end-to-end so the reproduced area-first journey returns Hebbal (Bangalore) schools.

## Root cause (from bug-repro-report.toml, REPRODUCED)
- `GET /api/public/schools/search` (`SchoolController.search`) accepted only `q` + `limit` — no
  city/region scope, unlike sibling `popular` (city+areaKey) and `by-area`/`nearby` (geo-scoped).
- The FE hook `useSchoolSearch` and its call sites passed only the text query.

## Fix (backend-owned scope; no fabrication; no migration)
- **Backend**: `GET /api/public/schools/search` now accepts an OPTIONAL `city` query param (a city
  slug, e.g. `udupi`/`bangalore`, matching the sibling `/popular` param). `SchoolService.search`
  branches: non-blank city → scoped repository query; null/blank city → the original unscoped query
  (byte-identical prior behaviour — backward compatible). The scoped query
  (`findByNameContainingIgnoreCaseAndCity`) reuses the trusted district-based city JOIN already used
  by `findPopularByCity` (`cities.slug → areas.district → schools.district`). **No Flyway migration**
  — `School` already carries populated `district`/`areaKey`/geo fields.
- **Frontend**: `useSchoolSearch(query, city?)` appends `&city=<slug>` only when non-blank (omitted
  otherwise) and includes `city` in the React Query key. The reproduced journey's scoped search box
  (`<ScopedSearch>` in `AreaGroupsLandingPanel.tsx`) now passes `citySlug={city}` (the panel's
  existing city slug), so the area-first North → north-growth corridor → search "heb" path is
  city-scoped.

## Reproduced journey now fixed
area-first: North → north-growth corridor (browse areas) → scoped search "heb" via
`AreaGroupsLandingPanel`'s `<ScopedSearch>` → returns Hebbal (Bangalore) schools, not Udupi.
(After selecting Hebbal, the in-area "search school name" box in `SchoolsInAreaPanel` is a
client-side filter over an already area-scoped `useSchoolsByArea` list — it never calls the search
endpoint and is not part of this bug.)

## KNOWN SECONDARY SURFACE — deferred to PR-B (documented, intentional)
`AreaGroupSelectedPanel.tsx` also renders a `<ScopedSearch>` (a parallel group-selected surface, not
the exact reproduced path). Its `<ScopedSearch>` remains **globally unscoped** after PR-A because that
panel does not currently have a city **slug** in scope — it receives only `cityLabel` (a
human-readable string like "Udupi"), and `AreaGroup` carries no slug field. Scoping it would require
threading a new `citySlug` prop from its parent (new plumbing beyond PR-A's approved boundary; the
parent wiring is PR-B-owned). Per the team-lead decision (2026-07-07) this is **deferred to PR-B**,
which owns `AreaGroupSelectedPanel.tsx` and its parent panel wiring. PR-A does not claim to scope this
surface. Audit trail: `approved-execution-handoff.toml` → `scope_expansion_1_correction`.

## Scope / constraints honoured
- Counts/coordinates/schools stay backend-owned; scoping only NARROWS results; no fabricated data;
  no frontend fetch-all workaround.
- No auth/PII/secrets surface (Gate F not triggered) — public read endpoint, query filter only.
- No migration against shared Supabase; no live smoke against shared hosted Supabase.
- No area-marker/camera/popover/#1738-gate code touched.

## Test evidence
See PR description + qa verification matrix. Backend unit/slice/Testcontainers and FE e2e assert the
in-scope-returned / out-of-scope-excluded behaviour and the reproduced area-first Hebbal journey.
Pre-existing unrelated failures (e.g. `SchoolSelectedPanel` `useAuth`-wrapper gaps) are called out
separately from newly-introduced failures.
