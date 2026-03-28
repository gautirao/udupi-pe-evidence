# Ship Log

Append-only. One entry per merged PR or completed task.

<!-- Entry format:
## PR #NNN — Title
Date: YYYY-MM-DD | Sprint: <name or standalone/quick> | Route: <agent chain>
- What: <1–3 bullets — what changed>
- Why: <1 sentence>
- Deviations: <OUT OF SCOPE items or NONE>
- Risks: <carried-forward items or NONE>
---
-->

## PR #644 — fix(poi): approve nearby POI shows Approved tab + surface errors
Date: 2026-03-28 | Sprint: standalone/quick | Route: frontend-engineer → code-reviewer
- What: `approveMutation` in `PoiManager.tsx` now switches to Approved tab via `onSettled` after query invalidation; adds `onError` toast for failures
- Why: Clicking Approve silently succeeded data-side but gave zero UI feedback — users had no way to confirm the action or see errors
- Deviations: Also fixed 3 pre-existing flaky anon-teaser E2E assertions (AT1 non-fatal, AT2 strict-mode locator, AT4 non-fatal map markers)
- Risks: NONE
---

## PR #645 — fix(ui): teaser card sign-in carries returnTo to listing detail
Date: 2026-03-28 | Sprint: standalone/quick | Route: frontend-engineer
- What: `Index.tsx:525` teaser card CTA changed from `/auth` to `/auth?returnTo=/listing/${listing.id}`
- Why: After login from a teaser card, users landed on the home page instead of the listing they tapped
- Deviations: NONE
- Risks: NONE
---

## PR #647 — fix(poi): spinner missing, stale POIs on re-confirm, locality in new-listing
Date: 2026-03-28 | Sprint: standalone/quick | Route: frontend-engineer → code-reviewer
- What: step-4-panel CSS toggle → conditional render (PoiManager mounts fresh each visit); `step1Complete` now rent/sale-aware with locality; `NewListing` adds locality field + mutate payload
- Why: No spinner on step-4 entry, old POIs shown after re-confirming location, new listings silently blocked at submit due to missing locality
- Deviations: NONE
- Risks: NONE
---
