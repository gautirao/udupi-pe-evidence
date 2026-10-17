# E2E supported-journey matrix (issue #2750)

Source of truth: [`e2e/canonical/journey-matrix.json`](../../e2e/canonical/journey-matrix.json). This page is the
human view; the JSON is what `scripts/e2e/check-canonical-journeys.mjs` enforces (static, list and results
phases). Counts live in [`e2e-inventory.md`](e2e-inventory.md) (generated), the fate of every legacy spec in
[`e2e-retirement-manifest.csv`](e2e-retirement-manifest.csv).

Status vocabulary: `COVERED` = every listed canonical id is collected in its project and must finish
expected+passed in a gate run. `GAP_CLOSING_IN_C2` = a supported, material journey whose closing canonical test
lands in the next commit group of the PR-1 series; its partial ids are already enforced, and the row can only
become `COVERED` or an explicit `DESCOPED_DARK` row with a written reason (never a silent absence).

## Journey matrix

"Supported / material" is YES for all 16 rows (each is a live route a user or broker can complete, and its failure
means a cross-layer break, which is the bar for a browser E2E). Lower-layer references name where narrower rules
are or will be asserted (planned destinations are in the manifest).

| Id | Journey | Family | Canonical proof today (project) | Lower-layer coverage | Gap | Closing test / PR |
|---|---|---|---|---|---|---|
| J01 | Area-first Discover | discover | T4, T5, T6, T18, T24 (user) | selectors, URL-state, areas-journey component tests (manifest MOVE_DOWN rows) | none | - |
| J02 | School-first Discover | discover | T7, T18 (user) | school panel/filter component tests | none | - |
| J03 | Agricultural Discover | agri | T8, T8b, T9 (user) | agri map/price-gate component tests | none | - |
| J04 | Residential buyer discovery | discover | T5, T6 (user), T10, T11 (anon), T12 (user) | card/presentation tests | none | - |
| J05 | Commercial buyer discovery | commercial | CC4 (broker) | commercial card summary test | none | - |
| J06 | Residential create -> submit -> approve -> LIVE -> buyer Discover membership | lifecycle | T13, T14, T15, T15b (broker) | listing validation tests | none | T15b closed it (PR-1 C2) |
| J07 | Commercial lifecycle | commercial | CC1, CC1b, CC1c, CC2, CC3, CC4 (broker) | subtype/narrowing tests | none | - |
| J08 | Auth sign-in + return-to | auth | T1 (user, broker, admin), T2, T2b, T3 (user), T1c (user; sign-out, `localAuthOnly`: required in the local gate, absent from the ENVIRONMENT_GATED hosted collection) | `getSafeReturnTo` unit test (R4, mutation-proven, PR-6) | none | T2b closed it (PR-1 C2) |
| J09 | Listing detail gating -> unlock | gating | T11 (anon), T12 (user) | gallery/price gate component tests | none | - |
| J10 | Booking buyer -> My Bookings -> Broker Bookings | booking | T16 (anon), T17, T17b (user) | duplicate-booking rule at API IT level | none | T17b closed it (PR-1 C2) |
| J11 | Map marker interaction | map | T19, T20 (anon) | cluster/camera unit tests | none | - |
| J12 | Request-a-property buyer flow + Admin visibility (#1793) | request | RQ1 (user), RQ2 (admin) | error-vs-empty and card state component tests | none | RQ1, RQ2 closed it (PR-1 C2; flags on in the canonical TEST stack only, production defaults stay false and are guarded, FC-14) |
| J13 | Saved Homes persistence | saved | T21 (user) | saved-homes component tests | none | T21 closed it (PR-1 C2) |
| J14 | Broker edit persistence | lifecycle | T13 (create), T22 (edit read-back) (broker) | form validation matrix (manifest MOVE_DOWN) | none | T22 closed it (PR-1 C2) |
| J15 | Agricultural create -> submit -> approve -> LIVE -> agri discovery | agri | T8, T9 (user), AG1, AG2, AG3 (broker) | agri form validation | none (AG1: created via the real form; closed submit gate proven in UI; submit via the product endpoint (arranged), because AgriculturalListingForm has no draft hydration - open product question; see agri-lifecycle.canonical.ts) | AG1-AG3 closed it (PR-1 C2; owner Q2 may descope) |
| J16 | Buy/Rent intent continuity | discover | T5, T6 (single intent), T23 (user) | MapFilterSheet intent-commit component test | none | T23 closed it (PR-1 C2) |

## Owner gap audit (issue #2750 comment, "Required gap-analysis output")

| Candidate journey | Supported now? | Existing canonical proof | Legacy proof | Cross-stack risk/value | Decision |
|---|---|---|---|---|---|
| Booking lifecycle | YES (`/my-bookings`, `/broker/bookings`) | T16, T17 (buyer side only) | `journey/booking-journey.spec.ts` (UB1-UB3) | HIGH | ADD CANONICAL: T17b (broker sees the same booking). Duplicate-booking validation stays lower-layer. |
| Saved Homes | YES (`/saved-homes`) | NONE | `saved-homes.spec.ts` (retired in the #2750 pilot; proof is now T21 plus the SH-8 lower-layer tests, see e2e-retirement-map-pilot.md#saved-homes) | HIGH/MED | ADD CANONICAL: T21 (save, reload, list, unsave) |
| Broker edit/rework | YES (`/broker/listings/:id/edit`) | T13 creates only | `broker-listing-form.spec.ts` | HIGH/MED | ADD CANONICAL: T22 (edit one deterministic field, read back). Rejection -> resubmit: MOVE LOWER (backend state machine IT, manifest row `listing-rejection-resubmit.spec.ts`); the owner may override via Q2. |
| Agricultural create -> LIVE | YES (`/broker/listings/new/agricultural`) | T8, T9 are discovery over seeded data | `broker-agri-listing.spec.ts` | HIGH | ADD CANONICAL: AG1-AG3 (create/submit, approve, agri discovery membership) |
| Auth return-to | YES | T2 (Discover returnTo), T1/T3 | `auth-journey-1509.spec.ts`, `journey/anon-teaser.spec.ts` | MED | ADD CANONICAL: T2b (gated non-Discover route -> /auth -> back, unlocked) |
| Buy/Rent/filter continuity | YES | T5/T6 under one intent | `discover-area-selected-filters.spec.ts` (component-level matrix) | MED | ADD CANONICAL: T23 (Buy -> Rent changes the result set; also closes Map <-> List) |
| Map <-> List continuity | YES | T19/T20 exercise the map only | map/list parity specs under `e2e/discover/` | MED | ADD CANONICAL: folded into T23 as ONE journey, not a matrix |
| Residential lifecycle -> Discover membership (found during the audit) | YES | T13/T14/T15 (detail page, not membership) | `journey/listing-lifecycle.spec.ts` | HIGH | ADD CANONICAL: T15b |
| Request-a-property (#1793, found during the audit) | YES, flag-dark in production | NONE | `discover/property-request-card*.spec.ts` | MED | ADD CANONICAL: RQ1/RQ2, flags on in the canonical test stack only |

Deliberately NOT added as canonical (reasoning recorded so the omission is not silent):

- Admin rejection -> broker resubmit: a backend state machine; canonical only if the rejection UI is confirmed
  current product behaviour, otherwise MOVE LOWER. Recorded in the manifest either way; owner Q2 can override.
- Search-this-area / viewport result scope (`issue-2015`, `issue-2016`): viewport -> bounds request mapping is a
  component/integration concern. MOVE LOWER (manifest rows). It becomes an extension of T6 only if no lower-layer
  equivalent can express it.
- Admin ops screens (duplicates, trust review, listings inventory, intelligence, feeds, audit log): not business
  critical journeys per the owner comment; DELETE_OBSOLETE or MOVE LOWER per the manifest.
- Broker preferences, demand gaps, listing quality, area insights: operational pages; component-level.
