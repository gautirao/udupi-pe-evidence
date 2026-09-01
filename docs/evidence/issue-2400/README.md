# #2400 — Insights.tsx decomposition: visual/runtime evidence

## Before/after screenshots (paywalled state)

- `before-main-paywalled.jpg` — `apps/web/src/pages/Insights.tsx` at `main` HEAD `a4793baf` (pre-decomposition), unauthenticated/paywalled state.
- `after-branch-paywalled.jpg` — this branch (`fix/2400-insights-decompose`), same state.

Both were captured via a temporary, uncommitted `/__insights_verify_temp` route added locally to `App.tsx` for the screenshot only, then reverted before committing (see `git log -p` for this branch — `App.tsx` carries no route change). This was necessary because **`Insights.tsx` is not currently mounted on any route in `App.tsx` on `main`** — it was superseded by `/trends` and `/trends/:citySlug/areas/:areaSlug` (`pages/Trends.tsx`, `pages/TrendsAreaResolved.tsx`) before this issue was filed. `find_importers`/`find_references` confirm only `Insights.test.tsx` imports the component. This is pre-existing on `main` and unrelated to this refactor.

The two screenshots are pixel-identical, as expected for a behaviour-preserving structural refactor.

## Accessible/authenticated chart state — fixture limitation

The review asked for browser smoke of the accessible state (filter change, area change, comparison toggle) via the existing authenticated Playwright fixture. Two things block a genuine real-browser Playwright run of this exact page:

1. **No route reaches it** (see above) — Playwright navigates by URL; without a mounted route there is nothing to visit. Adding a permanent route was out of scope for this behaviour-preserving refactor and not requested by #2400.
2. **No safe way to grant the test user real paid Insights access.** `hasAccess` is derived from `insightsAccessUntil`, which is set via `PaymentController` (a real payment/grant flow) against the shared hosted Supabase project referenced by `.env.e2e` (`VITE_SUPABASE_URL=https://elyqnysyqbqoxqqrpiir.supabase.co`). Mutating that record for the e2e test user to force `hasAccess=true` would write to shared state via a payment-shaped endpoint, which this session avoids per its financial-action safety policy — independent of #2400's own guardrail against payment/paywall changes.

**Substituted evidence:** `apps/web/src/pages/__tests__/Insights.accessibleInteractions.test.tsx` (React Testing Library + `@testing-library/user-event`, real component tree, mocked query hooks with multi-area fixture data) exercises exactly the three interactions called out in review, in the accessible (`hasAccess=true`) state:

- property-type filter change → `useAvgPriceByArea` re-queried with the new type, bedrooms reset to 0
- bedroom filter change → `useAvgPriceByArea` re-queried with the new bedroom count
- area change (Price Trend selector) → `usePriceTrend` re-queried with the new area
- comparison-area toggle (add and remove) → `useMultiAreaTrend` re-queried with the updated area list, respecting the existing max-5 rule

It also asserts the accessible state renders all three sections (no paywall) and that the default area/default top-3-comparison selection rules are preserved. 7/7 passing — see PR test evidence for the exact command/output.
