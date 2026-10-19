# #2750 PR-6 final: disposition of the 32 SCHEDULED(PR-6) manifest rows (issue #2865 TASK 1)

Base: `a0bc0dd9`. No spec deleted, moved or edited. No row becomes RETIRED. #2751 is NOT closed (FC-24 sum stays 66).

Every row that was `SCHEDULED(PR-6)` is now `SCHEDULED(#issue)`, and its slice is the same `#issue`. Rows are applied by
FILE PATH (the csv line numbers below are positions at `a0bc0dd9`, for reference only). Every one of the 32 rationales states
that the legacy spec **claims no coverage**: a MOVE_DOWN or RETAIN_SPECIALIST row only routes work to a follow-up issue,
and a #2861 row is a deletion-gate candidate. Nothing here is deleted. The evidence pointers are static triage
(`.claude/handoffs/issue-2750-analysis/report.md` section 2.2, and the PR-6 maps). They are not gate evidence.

## Reconciliation (32 vs 29)

32 vs 29: the owner's OQ5 count (PR #2862) was 'the 29 SCHEDULED(PR-6) rows not covered by open batches'. At the PR-7 base 182d8d61 there were 41 SCHEDULED(PR-6) rows; the PR-6 batches A/B/C covered 12 (41-12=29). Of those 12, 9 left PR-6 (7 RETIRED: auth-open-redirect-2232, broker-area-insights, broker-dashboard-v2, broker-demand-gaps, gallery-behaviour, anon-teaser, listing-detail-viewing; 2 re-slotted to #2859: discover-commercial-card-summary, issue-1956-pr4-price-auth-contract) and 3 were KEPT by their batch and stayed SCHEDULED(PR-6) (broker-preferences csv18, journey/booking-journey csv193, journey/broker-listing-creation csv194). 29 + 3 = 32.

## 1. Counts by follow-up issue (32 rows)

| Issue | Group | Rows | After decision |
|---|---|---|---|
| #2856 | FU-ADMIT-AUTH (specialist candidates, not admitted) | 2 | RETAIN_SPECIALIST (csv 36, 211) |
| #2858 | FU-LOWER-B (e2e/discover/**) | 5 | MOVE_DOWN (csv 144, 146, 162, 163, 171) |
| #2859 | FU-LOWER-C (every other lower-level row; ownership is owner question D1) | 19 | MOVE_DOWN |
| #2861 | FU-DELGATE (deletion-gate or owner-ruling candidates) | 6 | 3 DELETE_OBSOLETE (csv 4, 94, 188), 2 CANONICAL_GAP_CLOSED (csv 193, 194), 1 MOVE_DOWN (csv 9) |
| | **Total** | **32** | 0 RETIRED |

Decision changes (13): csv 9, 16, 33, 35, 36, 162, 163, 176, 190, 195, 203, 211, 216 (stale DELETE_DUP, CANONICAL_GAP_CLOSED or
DELETE_OBSOLETE labels corrected). The DELETE_OBSOLETE and CANONICAL_GAP_CLOSED rows keep their destination cells unchanged
(csv 4, 94, 188, 193, 194), and csv 18 keeps its destination. Every other MOVE_DOWN row now carries a `#NNNN: <uncovered rows>`
destination (PR-7 precedent).

Manifest totals after this change: 217 rows; RETIRED 77; SCHEDULED(PR-6) 0; SCHEDULED(#2856) 8, (#2858) 12, (#2859) 46,
(#2861) 9. The script-verified comparison is `.claude/handoffs/issue-2865/evidence/csv-compare.txt`.

## 2. Per-row disposition

| csv@a0bc0dd9 | spec | before (decision / status) | after (decision / status) | evidence | follow-up (owner question) |
|---|---|---|---|---|---|
| 4 | `e2e/admin-intelligence-smoke.spec.ts` | DELETE_OBSOLETE / SCHEDULED(PR-6) | DELETE_OBSOLETE / SCHEDULED(#2861) | analysis #5: route /admin/intelligence still live in App.tsx; OBSOLETE stands only with an owner 'ops screen not supported' ruling; else LOWER-LEVEL (AI1/AI2 page render, AI3 anon redirect -> routeAccess). 2/3 tests self-skip | #2861 (D3) |
| 9 | `e2e/auth-journey-1509.spec.ts` | DELETE_DUP / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2861) | analysis #1 + §2.1(d): CANONICAL GAP; sign-in/returnTo = T1/T2, sign-out and reload are in no canonical title | #2861 (D2) |
| 11 | `e2e/broker-address-reconciliation.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #7: LOWER-LEVEL M; phantom destination; BASE_URL production default (disclosed, #2854) | #2859 (D1) |
| 16 | `e2e/broker-listing-form.spec.ts` | CANONICAL_GAP_CLOSED / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #11: LOWER-LEVEL M | #2859 (D1) |
| 18 | `e2e/broker-preferences.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | manifest csv18 rationale + e2e-retirement-map-pr6a.md#broker-preferences; real Radix Select is drivable in jsdom (BrokerDemandGaps.pageHttp precedent), so not specialist | #2859 (D1) |
| 33 | `e2e/commercial-create-listing-1684.spec.ts` | DELETE_DUP / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #14: LOWER-LEVEL M; 17 page.route mocks | #2859 (D1) |
| 35 | `e2e/commercial-subtype-implied-type-hotfix.spec.ts` | DELETE_DUP / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #15: LOWER-LEVEL S | #2859 (D1) |
| 36 | `e2e/commercial-subtype-wrap-2450.spec.ts` | DELETE_OBSOLETE / SCHEDULED(PR-6) | RETAIN_SPECIALIST / SCHEDULED(#2856) | analysis #42: SPECIALIST KEEP; static scan: storageState user-auth.json at spec :194/:348, test.skip when absent :370, viewport 390x844 :195 | #2856 (D6) |
| 94 | `e2e/discover-to-trends.spec.ts` | DELETE_OBSOLETE / SCHEDULED(PR-6) | DELETE_OBSOLETE / SCHEDULED(#2861) | analysis #41: OBSOLETE (popover 'View Details' gone; 'View Area Trends' moved to AreaLeafListingsSurface.tsx; tests 2-3 test.skip(true)) | #2861 (-) |
| 144 | `e2e/discover/issue-2205-admin-preview-node-scoping-browser-proof.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2858) | analysis #18: LOWER-LEVEL M | #2858 (D1) |
| 146 | `e2e/discover/issue-2207-admin-hierarchy-node-selection.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2858) | analysis #19: LOWER-LEVEL M | #2858 (D1) |
| 162 | `e2e/discover/property-request-card-legacy-and-browse-all-2795.spec.ts` | CANONICAL_GAP_CLOSED / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2858) | analysis #20: LOWER-LEVEL M; gated on PROPERTY_REQUEST_E2E=1 (never runs in the default estate) | #2858 (D1) |
| 163 | `e2e/discover/property-request-card.spec.ts` | CANONICAL_GAP_CLOSED / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2858) | analysis #21: LOWER-LEVEL M; PROPERTY_REQUEST_E2E gated | #2858 (D1, D5) |
| 171 | `e2e/discover/sr024-error-vs-empty.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2858) | analysis #22: LOWER-LEVEL M | #2858 (D1) |
| 176 | `e2e/homepage-listing-journey.spec.ts` | DELETE_DUP / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #24: LOWER-LEVEL S | #2859 (D1) |
| 188 | `e2e/journey/admin-duplicates.spec.ts` | DELETE_OBSOLETE / SCHEDULED(PR-6) | DELETE_OBSOLETE / SCHEDULED(#2861) | analysis #25: LOWER-LEVEL M; /admin/duplicates live; backend AdminDuplicateLifecycleIT + AdminDuplicateControllerTest exist; production BASE_URL default | #2861 (D3) |
| 189 | `e2e/journey/admin-listings-inventory-2370.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #26: LOWER-LEVEL M; production default | #2859 (D1, D5) |
| 190 | `e2e/journey/admin-moderation.spec.ts` | DELETE_DUP / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #27: LOWER-LEVEL M | #2859 (D1) |
| 192 | `e2e/journey/area-trends-2581.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #28: LOWER-LEVEL M; self-skips without admin creds + local DB; spec-level mvn env hazard was #2863 (closed) | #2859 (D1) |
| 193 | `e2e/journey/booking-journey.spec.ts` | CANONICAL_GAP_CLOSED / SCHEDULED(PR-6) | CANONICAL_GAP_CLOSED / SCHEDULED(#2861) | manifest csv193 + e2e-retirement-map-pr6c.md#booking-journey-e2ejourneybooking-journeyspects-3-tests (MA-1 gaps; owner relay 6237012111 did not name it) | #2861 (D4) |
| 194 | `e2e/journey/broker-listing-creation.spec.ts` | CANONICAL_GAP_CLOSED / SCHEDULED(PR-6) | CANONICAL_GAP_CLOSED / SCHEDULED(#2861) | manifest csv194 + e2e-retirement-map-pr6c.md#broker-listing-creation-e2ejourneybroker-listing-creationspects-3-tests-house-villa-residential_plot; analysis #3 (DUPLICATE) superseded by the batch-C B1 finding | #2861 (D4) |
| 195 | `e2e/journey/listing-lifecycle.spec.ts` | CANONICAL_GAP_CLOSED / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #30: LOWER-LEVEL M; production default | #2859 (D1) |
| 196 | `e2e/journey/pending-approvals-review-2369.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #31: LOWER-LEVEL L | #2859 (D1, D5) |
| 197 | `e2e/journey/trust-identity-review.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #32: LOWER-LEVEL M | #2859 (D1) |
| 199 | `e2e/listing-rejection-resubmit.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #34: LOWER-LEVEL M; production default | #2859 (D1) |
| 203 | `e2e/nav-roles.spec.ts` | DELETE_DUP / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #35: LOWER-LEVEL S | #2859 (D1) |
| 204 | `e2e/poi-display.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #36: LOWER-LEVEL M | #2859 (D1) |
| 205 | `e2e/poi-locality-teaser.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #37: LOWER-LEVEL M; production default | #2859 (D1) |
| 210 | `e2e/residential-create-listing-1722.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #38: LOWER-LEVEL L | #2859 (D1) |
| 211 | `e2e/residential-required-fields-2040.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | RETAIN_SPECIALIST / SCHEDULED(#2856) | analysis #43: SPECIALIST KEEP (trim to the occlusion test); static scan: test 'AC5 mobile occlusion' :432, viewport 390x844 :419, injected session :62 | #2856 (D6) |
| 215 | `e2e/trends.spec.ts` | MOVE_DOWN / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #39: LOWER-LEVEL M; data-dependent test.skip(true); reads backend/.env DB settings (PR-7 disclosure, #2854) | #2859 (D1) |
| 216 | `e2e/user-journeys.spec.ts` | DELETE_DUP / SCHEDULED(PR-6) | MOVE_DOWN / SCHEDULED(#2859) | analysis #40: LOWER-LEVEL S; 10 self-skips | #2859 (D1) |

## 3. Deletion gate: the 6 #2861 rows

None of these rows is deleted in this PR, and none is a deletion approval. Each one stays on disk, claims no coverage, and has a
named blocker:

| csv | spec | blocker before any deletion |
|---|---|---|
| 4 | `e2e/admin-intelligence-smoke.spec.ts` | Owner ruling D3: the admin ops screen is unsupported (the /admin/intelligence route is live). If the owner rules it supported, the row becomes MOVE_DOWN #2859. |
| 9 | `e2e/auth-journey-1509.spec.ts` | Owner ruling D2: extend canonical T1 [role:user] with sign-out + reload, or delete. Sign-out (A6-A7, A11-A13) and refresh-keeps-session (A5) are a canonical gap. |
| 94 | `e2e/discover-to-trends.spec.ts` | A per-assertion table for residual test 1 (custom-marker layer at zoom>12 vs the PropertyMap marker tests), plus the owner's by-name approval. |
| 188 | `e2e/journey/admin-duplicates.spec.ts` | Owner ruling D3: the admin ops screen is unsupported (/admin/duplicates is live). Otherwise MOVE_DOWN #2859, because pages/admin/Duplicates.tsx has no FE test. |
| 193 | `e2e/journey/booking-journey.spec.ts` | #2844 (real-DB integration test): UB2-a/b, UB1-d and UB3-b stay PARTIAL until it lands. KEPT by PR-6 batch C B2. |
| 194 | `e2e/journey/broker-listing-creation.spec.ts` | Product defect #2843 (DL1-7 UNCOVERED: the draft-reload price is not restored). DL1-12 is PARTIAL. The spec is STALE (it cannot pass today: ImageUploader copy vs InlinePhotos). Owner ruling D4: repair or delete. |

**Deletion rule.** A spec is deleted only on a PR that carries the owner's own by-name comment naming that spec for deletion.
A relayed copy of an owner message, a gate verdict, or this map does not count.

## 4. Owner questions D1-D6

These are lane defaults applied in this PR. They are **not owner rulings**, and they are to be raised on the PR.

- **D1:** Where the non-Discover MOVE_DOWN rows are tracked. #2859 is titled 'top-level Discover', but the assignment allows only #2857/#2858/#2859. Default: e2e/discover/** -> #2858, every other row -> #2859, plus a scope-note comment on #2859/#2858 that lists the added rows. Alternative: file one new FU-LOWER-D issue for the admin/broker/listing/POI/trends rows.
- **D2:** csv 9 auth-journey-1509 is a CANONICAL GAP (sign-out + reload), not lower-level work. Default: SCHEDULED(#2861) owner-ruling candidate, decision MOVE_DOWN (the stale DELETE_DUP is corrected; the row claims no coverage). The owner rules whether to extend canonical T1 or delete. #2860 scope (lane-2860) is not touched.
- **D3:** csv 4 admin-intelligence-smoke and csv 188 admin-duplicates. DELETE_OBSOLETE stands only if the owner rules the admin ops screens unsupported (the routes are live). Default: #2861 conditional candidates. If the owner rules them supported, they become MOVE_DOWN #2859.
- **D4:** csv 193/194 were kept by batch C. Default: SCHEDULED(#2861) deletion-gate candidates, decision CANONICAL_GAP_CLOSED unchanged, with the blocker named (#2844 real-DB IT / #2843 product defect). csv 194 is STALE. Under the #2750 'no home for permanent red' condition, the owner rules repair-or-delete on #2861.
- **D5:** R5 layout rows (csv 163 mobile geometry probes, csv 189 INV4b, csv 196 PA5). Default: MOVE_DOWN, with the layout rows carried as notes. The owner may trim them to specialist candidates.
- **D6:** Specialist tracking for csv 36 and csv 211. Default: #2856 (auth), because csv 36 uses hosted user-auth.json and csv 211 injects a session tied to the hosted project ref. The owner may move csv 211 to #2855 if a loopback session injection is confirmed.
