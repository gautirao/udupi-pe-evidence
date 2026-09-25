# Issue #2717 evidence — School results Filters trigger touch target

Captured against a local build of this branch's exact HEAD (mocked API responses via
Playwright route stubs — same fixtures as `e2e/discover-2717-school-filters-touch-target.spec.ts`),
at `/discover?city=udupi&journey=school-first&schoolId=sch-2717&radiusKm=3`.

## Toolbar crop, before vs after (375x667)

Visually identical — the fix only expands the invisible hit area via a `::before`
pseudo-element; the visible chip stays the same `h-7` size.

- `before-375x667-toolbar.png` — pre-fix (main)
- `after-375x667-toolbar.png` — post-fix (this branch)

## Full-panel screenshots, post-fix, at all three required widths

- `after-375x667-full.png`
- `after-390x844-full.png`
- `after-412x915-full.png`

## Automated hit-area measurement

`e2e/discover-2717-school-filters-touch-target.spec.ts` measures the real clickable
rect (button box + `::before` pseudo expansion) via `getBoundingClientRect()` /
`getComputedStyle(el, '::before')` in a real Chromium browser:

- 375x667 / 390x844 / 412x915: hit rect >= 44x44 CSS px; visible chip stays < 32px tall
  (no growth of the visible chip); Filters and Start over stay on PanelHeader's one
  actions row (no wrap).
- 1280px desktop: hit rect == visible chip box (before: rules gated off), height < 32px
  (unchanged from pre-fix).

Run: `npx playwright test --project=full e2e/discover-2717-school-filters-touch-target.spec.ts`
— 4/4 passed locally against this branch's HEAD.

Mutation check: reverting only the `max-[820px]:before:*` classes (keeping the new
`data-testid`) reproduces the exact pre-fix defect — measured height drops to `28`
(the pre-fix `h-7` box) and only the hit-area assertion fails, confirming the test
targets the actual regression rather than passing vacuously.
