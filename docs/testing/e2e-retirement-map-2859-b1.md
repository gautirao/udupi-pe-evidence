# E2E retirement map — #2859 batch B1 (roles / admin / trust)

Lower-level replacement coverage for four legacy specs. The specs stay on disk, byte-identical to base
`0d17841c`. Their manifest rows keep `SCHEDULED(#2859)`. Only the destination column changes.

| Manifest row | Spec | Section |
|---|---|---|
| 203 | `e2e/nav-roles.spec.ts` | [nav-roles](#nav-roles) |
| 189 | `e2e/journey/admin-listings-inventory-2370.spec.ts` | [admin-listings-inventory](#admin-listings-inventory) |
| 197 | `e2e/journey/trust-identity-review.spec.ts` | [trust-identity-review](#trust-identity-review) |
| 18 | `e2e/broker-preferences.spec.ts` | [broker-preferences](#broker-preferences) |

The dispositions are:

- **COVERED_EXISTING**: an existing test proves the claim.
- **COVERED_NEW**: a test added in B1 proves the claim.
- **RETAIN**: the claim needs a browser, and the reason is given.
- **STALE**: the product contradicts the spec, and the `file:line` evidence is given.

Since Codex round 1, a COVERED claim covers only what its test proves with its injected inputs: mocked auth flags,
a stubbed UI primitive, or a fake fetch, Supabase or api. Where the legacy spec drove that boundary for real, the
boundary part is a separate RETAIN subclaim. See [Codex round 1 changes](#codex-round-1-changes).

Every COVERED claim is mutation-proven. The mutation turned the named test red. The product file was then
restored, its sha256 matched the base blob, and the restored run was green. The register is
`.claude/handoffs/issue-285901/evidence/mutation/register.tsv`, and each diff is `M<id>.diff` beside it.

Test ids below use the form `file > describe > it`. These short names are used for the files:

| Short name | Path |
|---|---|
| `navRoles2859` | `apps/web/src/components/layout/__tests__/AppLayout.navRoles2859.test.tsx` |
| `inventory2859` | `apps/web/src/components/admin/listings/__tests__/ListingEditorDrawer.inventory2859.test.tsx` |
| `Drawer` | `apps/web/src/components/admin/listings/__tests__/ListingEditorDrawer.test.tsx` |
| `editParam2859` | `apps/web/src/pages/admin/__tests__/Listings.editParam2859.test.tsx` |
| `useAdminData` | `apps/web/src/hooks/__tests__/useAdminData.test.ts` |
| `identity2859` | `apps/web/src/components/trust/__tests__/TrustProgressPanel.identity2859.test.tsx` |
| `TPP` | `apps/web/src/components/trust/__tests__/TrustProgressPanel.test.tsx` |
| `IRT` | `apps/web/src/components/admin/trust-review/__tests__/IdentityReviewTable.test.tsx` |
| `TRQ` | `apps/web/src/pages/admin/__tests__/TrustReviewQueue.test.tsx` |
| `addFlow2859` | `apps/web/src/pages/broker/__tests__/Preferences.addFlow2859.test.tsx` |
| `realSelect2859` | `apps/web/src/pages/broker/__tests__/Preferences.realSelect2859.test.tsx` |
| `identityRealSelect2859` | `apps/web/src/components/trust/__tests__/TrustProgressPanel.identityRealSelect2859.test.tsx` |
| `ApproveTest` | `apps/api/src/test/java/com/example/realestate/trust/AdminTrustControllerIdentityApproveTest.java` |
| `IT` | `apps/api/src/test/java/com/example/realestate/trust/TrustIdentityApprovalIT.java` |
| `ALCT` | `apps/api/src/test/java/com/example/realestate/listing/api/AdminListingControllerTest.java` |
| `PLCT` | `apps/api/src/test/java/com/example/realestate/listing/api/PublicListingControllerTest.java` |
| `BDash` | `apps/web/src/pages/broker/__tests__/BrokerDashboard.pageHttp.test.tsx` |

## ⚠️ Security and data-integrity disclosure

- **Admin authz is proven only at the controller guard.** The guard is `AdminTrustController.java` L272-274.
  `ApproveTest` uses a permitAll test filter chain, as `AdminTrustControllerTest` does. M-TIR1 removes that
  guard, and it turns `ApproveTest > approveIdentity_nonAdmin_returns403_…` red. That test uses a genuinely
  non-admin caller (ROLE_BROKER). It verifies no repository save and no `grantIdentityBadge` call, then runs an
  admin control in the same test.
- **Observed: the real filter chain does not stop a dealer on this endpoint.** Under M-TIR1, `IT` also went red.
  `IT` runs the real Spring Security filter chain with DB-resolved roles, and a dealer's POST to
  `/api/admin/trust/identity/{id}/approve` was no longer refused. So for that caller the in-controller check is
  the only gate. This is recorded as an observation for the security reviewer. No product change was made.
- **Role-visibility tests prove UX only.** Hiding nav items is not authorization (pr6a map §1). The dealer
  persona is mocked as `isBroker: true`, so the real role-to-flag mapping is not exercised.
- **Identity PII is synthetic only.** The tests use `Test Owner Name`, `+91 00000 02859` and the file
  `synthetic-id-2859.pdf` with the content `%PDF-1.4 synthetic`. The bearer token is the literal
  `dummy-test-token-2859`. There are no real names, phone numbers, Aadhaar numbers or document content.
- **No network call leaves the IT.** In `IT`, `SupabaseStorageService` is a Mockito bean with `isEnabled() == false`.
  The evidence row therefore stores the `storage-disabled://` sentinel, and no signed URL is ever produced or logged.
- **Supabase direct-write persistence stays RETAIN.** This covers INV1-b.2, INV1-d.2 and INV2-b.4. The FE stateful
  fake proves request, refetch and render behaviour only. It cannot reach PostgREST or RLS.
- **Idempotent approve is now tested.** Approving evidence when IDENTITY is already EARNED goes through the catch at
  `AdminTrustController.java` L295-301. `ApproveTest > approveIdentity_identityAlreadyEarned_isIdempotent_…` now
  covers it, and M-TIR19 turns it red.

<a id="nav-roles"></a>
## nav-roles (`e2e/nav-roles.spec.ts`, csv 203)

Every COVERED nav id is split into two subclaims:

- **(a)** Given the role flags (`isAdmin` / `isBroker` injected through a mocked `useAuth`), the nav shows exactly
  these items. This is COVERED_NEW, as proven.
- **(b)** A signed-in user with stored role X gets flags Y. This is the AuthContext login and role lookup that the
  spec exercised for real. It is RETAIN: no test in scope covers the browser login or the role lookup, and an
  AuthContext test would fall outside the B1 file globs.

The items are read through the always-open pass-through. Reaching them by opening the real menu belongs to N2-c
(RETAIN).

All tests here use the file-scoped always-open DropdownMenu pass-through. `AppLayout.test.tsx` is red at base
(plan F1) and is not cited. Each describe is rendered at `/discover`, using the collapsed header
(`PublicDiscoverLayout`, `DiscoverProvider` and matchMedia 1366), and at the non-Discover route `/notifications`.

| Id | Disposition | Tests | Mutations |
|---|---|---|---|
| N1-a | (a) COVERED_NEW / (b) RETAIN | `navRoles2859 > nav-roles @ /discover (collapsed Discover header) — #2859 B1 > N1-a/b/e user: …`; `navRoles2859 > nav-roles @ non-Discover route (/notifications) — #2859 B1 > N1-a/b/e user: …` | M-NR5, M-NR5b, M-NR2 |
| N1-b | (a) COVERED_NEW / (b) RETAIN | same two its (exact name and href `/saved-areas`) | M-NR7, M-NR2 |
| N1-c | STALE | `userRoleNavigation` (`AppLayout.tsx` L103-110) has no `My Listings`. It exists only in `brokerDetailedNavigation` (L96). The current contract is asserted, but not claimed, in `navRoles2859 > nav-roles same-test controls @ discover/non-discover > N1-c/N1-d (STALE …)` | — |
| N1-d | STALE | A user sees `List property` (`AppLayout.tsx` L104, `/broker/listings/new`). `New listing` exists only in `brokerRoleNavigation` (L90). Same supporting it | — |
| N1-e | (a) COVERED_NEW / (b) RETAIN | the N1-a/b/e its (exact `My bookings`, href `/my-bookings`) | M-NR4 |
| N1-f | (a) COVERED_NEW / (b) RETAIN | `navRoles2859 > nav-roles same-test controls @ discover > N1-f: …` and `@ non-discover > N1-f: …` | M-NR6, M-NR4 |
| N1-g | (a) COVERED_NEW / (b) RETAIN | `navRoles2859 > nav-roles same-test controls @ discover > N1-g: …` and `@ non-discover > N1-g: …` | M-NR2, M-NR1 |
| N2-a | (a) COVERED_NEW / (b) RETAIN | `navRoles2859 > nav-roles @ /discover … > N2-a/N2-b admin: …` (button named exactly `Admin`; at the non-Discover route it is `Admin Console`) | M-NR8 |
| N2-b | (a) COVERED_NEW / (b) RETAIN | the `N2-a/N2-b admin` it and `nav-roles @ non-Discover route … > N2-b admin: …` (the exact 13-item admin set and hrefs) | M-NR1 |
| N2-c | RETAIN | Real Radix portal open and Escape close. A real DropdownMenu open stalls the jsdom worker (plan F1) | — |
| N2-d | (a) COVERED_NEW / (b) RETAIN | `navRoles2859 > nav-roles same-test controls @ discover > N2-d: …` and `@ non-discover > N2-d: …` | M-NR3 |

Row tally (11 ids): (a) COVERED_NEW / (b) RETAIN split 8, STALE 2 (N1-c, N1-d), RETAIN 1 (N2-c).

<a id="admin-listings-inventory"></a>
## admin-listings-inventory (`e2e/journey/admin-listings-inventory-2370.spec.ts`, csv 189)

In `inventory2859`, the real `ListingEditorDrawer` is fed by the real `useAdminListingById`. One in-test state backs
both the `@/integrations/supabase/client` mock and the `@/lib/api` mock. Every transition it asserts the before
state, the action, the follow-up read count and the after state. The real `<Toaster/>` is mounted.

| Id | Disposition | Tests | Mutations |
|---|---|---|---|
| INV1-a | COVERED_NEW | `inventory2859 > ListingEditorDrawer inventory journeys over a stateful fake (#2859 B1) > INV1-a: …` (a LIVE render in the same it is the control) | M-INV1a |
| INV1-b.1 | COVERED_EXISTING | `Drawer > ListingEditorDrawer — #2369 PENDING_REVIEW no-implicit-approval guard > never includes \`status\` in the update payload when saving a PENDING_REVIEW listing` (request subclaim only) | M-INV1 |
| INV1-b.2 | RETAIN | Supabase direct write. Omitting status from the payload does not prove DB state, and no lower layer can re-read it without hosted Supabase | — |
| INV1-b.3 | COVERED_NEW (narrowed, Codex 1) | `inventory2859 > … > INV1-b.3 + INV1-c: …` (reads 1 to 2, edited title in the header, PENDING_REVIEW and the moderation notice) | M-INV9, M-INV1a, M-INV1 |
| INV1-c | COVERED_NEW | the same it (rendered `Listing Updated` and `The property listing has been updated successfully.`) | M-INV10 |
| INV1-d.1 | COVERED_NEW (narrowed, Codex 1) | `useAdminData > useAdminListingsPage — server-side pagination (#2370) > #2859 INV1-d.1: …` (filter subclaim only) | M-INV8 |
| INV1-d.2 | RETAIN | Depends on the persisted Supabase write (INV1-b.2) | — |
| INV2-a | COVERED_EXISTING + COVERED_NEW | `Drawer > … LIVE-only gating > enables the visibility switch for a LIVE listing`; `inventory2859 > … > INV2-a: …` (`Public` and aria-checked true; a hidden LIVE render in the same it is the control) | M-INV14, M-INV11 |
| INV2-b.1 | COVERED_NEW | `inventory2859 > … > INV2-b.1/b.2/b.3: …` (dialog titles; no write before Confirm); existing `Drawer > … > requires confirmation before the publish toggle actually mutates` supports it | M-INV15 |
| INV2-b.2 | COVERED_NEW | the same it (exact `{ is_valid: false }`, then `{ is_valid: true }`, no other key) | M-INV2 |
| INV2-b.3 | COVERED_NEW (narrowed, Codex 1) | the same it (reads 1 to 2 to 3; switch and badge flip both ways) | M-INV6, M-INV11 |
| INV2-b.4 | RETAIN | Supabase direct write, as INV1-b.2 | — |
| INV2-c | COVERED_EXISTING + COVERED_NEW | `Drawer > … > disables the visibility switch for a non-LIVE listing`; `inventory2859 > … > INV2-c: …` (exact `Only LIVE listings can be published/unpublished. This listing is DRAFT.`; a LIVE render in the same it is the control) | M-INV13, M-INV12 |
| INV3-a | COVERED_EXISTING + COVERED_NEW (title, no spinner; narrowed, Codex 1) / STALE (explanatory copy) | `Drawer > … unresolvable deep-link … > shows a "Listing not found" state with a Close control …`; `inventory2859 > … > INV3-a: …` (spinner while resolving, then the `Listing not found` heading and 0 `.animate-spin`). **STALE part:** the spec's `/deleted, or it's outside the/i` (`admin-listings-inventory-2370.spec.ts` L364) cannot match the product copy `This listing couldn't be found — it may have been deleted or the id is invalid.` (`ListingEditorDrawer.tsx` L112) | M-INV18 |
| INV3-b | COVERED_NEW (narrowed, Codex 1) | `editParam2859 > admin Listings ?edit deep link (#2859 B1, INV3-b) > INV3-b: …` (exact URL before and after) | M-INV3 |
| INV4a-a.1 | COVERED_NEW | `inventory2859 > … > INV4a-a.1/a.2: …` (exact `[path, { reasonNote }]`) | M-INV4 |
| INV4a-a.2 | COVERED_NEW (narrowed, Codex 1) | the same it (reads 1 to 2; ARCHIVED, `Hidden` and the `Listing archived` toast) | M-INV7 |
| INV4a-a.3 | RETAIN | Persisted ARCHIVED. `ALCT` is a WebMvc test over a mocked service, so it proves the controller only. B2 (LC1) is the planned owner | — |
| INV4a-a.4 | COVERED_EXISTING (narrowed, Codex 1) | `ALCT > archive_withAdminRole_returns200WithArchivedStatus`, `ALCT > archive_withDealerRole_returns403` (controller subclaim) | M-INV4a4b, M-INV4a4a |
| INV4a-b | COVERED_EXISTING (narrowed, Codex 1) | `PLCT > getListing_archivedListing_returns404` (+ `getById_draftListing_returns404`). This proves the controller status rule (`PublicListingController.java` L94). The 404 is not an unconditional mock | M-INV4b |
| INV4a-c.1 | COVERED_NEW (narrowed, Codex 1) | `useAdminData > … > #2859 INV4a-c.1: …` (filter subclaim only) | M-INV5 |
| INV4a-c.2 | RETAIN | Needs the persisted archive (INV4a-a.3) | — |
| INV4a-d.1 | COVERED_NEW | `inventory2859 > … > INV4a-d.1/d.2: …` (exactly `[path]`, no body) | M-INV16 |
| INV4a-d.2 | COVERED_NEW (narrowed, Codex 1) | the same it (reads 1 to 2; DRAFT, `Hidden` and the `Listing restored to draft` toast) | M-INV17 |
| INV4a-d.3 | RETAIN (persistence) / COVERED_EXISTING (controller subclaim) | The persisted DRAFT state needs B2 (LC1). The controller subclaim is covered by `ALCT > restore_withAdminRole_archivedListing_returns200WithDraftStatus`, `ALCT > restore_withDealerRole_returns403` | M-INV4d3b, M-INV4d3a |
| INV4b | RETAIN | Owner D5: an R5 layout and geometry row; jsdom has no layout | — |

Row tally (26 ids): COVERED_NEW 13, COVERED_EXISTING 3 (INV1-b.1, INV4a-a.4, INV4a-b), COVERED_EXISTING +
COVERED_NEW 2 (INV2-a, INV2-c), COVERED + STALE split 1 (INV3-a), RETAIN 6, RETAIN + COVERED_EXISTING split 1 (INV4a-d.3).

<a id="trust-identity-review"></a>
## trust-identity-review (`e2e/journey/trust-identity-review.spec.ts`, csv 197)

`IT` is untagged on purpose, because `apps/api/pom.xml` surefire excludes `@Tag("integration")` at L174. It runs
with `mvn -f apps/api/pom.xml test -Dtest=TrustIdentityApprovalIT`. The surefire XML shows tests=1, skipped=0,
failures=0, errors=0. `IT` uses Testcontainers `postgis/postgis:15-3.4-alpine`, the real filter chain, the real
controllers and BadgeService, and real repositories.

| Id | Disposition | Tests | Mutations |
|---|---|---|---|
| TIR1 | COVERED_NEW | `identity2859 > TrustProgressPanel IDENTITY journey (#2859 B1) > TIR1 + TIR7-a: …` (AVAILABLE has 1 CTA; an EARNED render in the same it has 0) | M-TIR1fe, M-TIR8 |
| TIR1-x | RETAIN | Featured-listing selection. `BDash > … > recent activity: … a LIVE row triggers exactly one trust-progress GET and a trust section` pins the title of a LIVE row: M-TIR1x-a (select DRAFT) turned it RED. But M-TIR1x-b (status-blind, selects the first non-archived row) **SURVIVED**, because that fixture lists the LIVE row first. LIVE-over-DRAFT is therefore not discriminated. `BDash` is outside the B1 globs, so the test cannot be strengthened here. The PENDING_REVIEW selection is also not pinned | M-TIR1x-a (RED), M-TIR1x-b (SURVIVED) |
| TIR2 | COVERED_NEW | `identity2859 > … > TIR2: …` (no dialog before the click; afterwards the heading, `#ie-legal-name`, `#ie-phone`, `#ie-file` and the combobox) | M-TIR12, M-TIR11, M-TIR1fe |
| TIR3.1 | COVERED_NEW (payload, real Select pick) / RETAIN (browser transport) | Payload: `identity2859 > … > TIR3.1: …` (exact URL, POST, dummy bearer, FormData keys `legal_name`, `phone_number`, `document_type=AADHAAR`, `file`; the Select is a pass-through there). Select interaction (Codex round 1 F1): `identityRealSelect2859 > TrustProgressPanel identity dialog real Radix Select (#2859 B1, TIR3.1 select interaction) > TIR3.1-select: …` drives the REAL Radix Select inside the real Dialog; the picked `PAN Card` reaches FormData `document_type=PAN`. It was green on 2 consecutive runs (exit 0, about 15 s each). RETAIN: the real browser fetch with a real Supabase session token reaching the server. The server side of the multipart is covered by `IT` (TIR3.2) | M-TIR4, M-TIR9, M-TIR10, M-TIR23 |
| TIR3.2 | COVERED_NEW | `IT > submitThenAdminApprove_identityBecomesEarned_endToEndOnRealDb` (the evidence row PENDING and the IDENTITY dimension PENDING are re-read from the DB; trust-progress shows PENDING) | M-TIR20 |
| TIR4 | COVERED_NEW (narrowed, Codex 1) | `identity2859 > … > TIR4: …` (GET 1 to 2; dialog closed; exact `Under review -- usually 1-2 business days`; CTA gone) | M-TIR5, M-TIR6 |
| TIR5 | COVERED_EXISTING + COVERED_NEW (narrowed, Codex 1) | Row testid: `IRT > IdentityReviewTable (standalone, props-only) > renders an item row (with its data-testid) …` and `TRQ > TrustReviewQueue > data-testid="identity-evidence-*" is present only on identity rows`. Tab name: `TRQ > TrustReviewQueue > renders both tabs with their pending counts`. `Aadhaar` label: `IRT > … > #2859 TIR5: …` (a PAN row in the same table is the control) | M-TIR14, M-TIR22, M-TIR13 |
| TIR6-a.1 | COVERED_EXISTING + COVERED_NEW | `IRT > … > renders an item row … and wires approve/reject commands with the correct argument`; the exact POST path is in `TRQ > #2859 TIR6-b: … > TIR6-b: …` | M-TIR16, M-TIR15 |
| TIR6-a.2 | COVERED_NEW | `ApproveTest > approveIdentity_nonAdmin_returns403_…`, `approveIdentity_unknownEvidence_returns404`, `approveIdentity_notPending_returns409_withCurrentState`, `approveIdentity_pending_admin_returns200_setsApproved_andGrantsIdentityForTheEvidenceListing`, `approveIdentity_identityAlreadyEarned_isIdempotent_…`. Persistence is in `IT` (evidence APPROVED, reviewedBy admin, dimension EARNED re-read from the DB) | M-TIR1, M-TIR2, M-TIR17, M-TIR18, M-TIR19, M-TIR3 |
| TIR6-b | COVERED_NEW (narrowed, Codex 1) | `TRQ > #2859 TIR6-b: identity approve -> refetch -> row removal > TIR6-b: …` (rows A and B; approve A; pending GET 1 to 2; A gone and B kept; tab count 2 to 1) | M-TIR7, M-TIR15 |
| TIR7-a | COVERED (composition) | `IT` proves that trust-progress returns IDENTITY EARNED after approve (TIR7-b). `TPP > TrustProgressPanel — full variant > EARNED badge shows "Verified" chip` and `identity2859 > … > TIR1 + TIR7-a` prove that an EARNED response renders `Verified` and that the CTA is gone (an AVAILABLE render in the same it is the control) | M-TIR21, M-TIR8, M-TIR3 |
| TIR7-b | COVERED_NEW | `IT > submitThenAdminApprove_…` (the before-approve read is PENDING in the same test; after approve it is EARNED) | M-TIR3, M-TIR2 |

Row tally (12 ids): COVERED_NEW 8, COVERED_EXISTING + COVERED_NEW 2 (TIR5, TIR6-a.1), COVERED (composition) 1
(TIR7-a), RETAIN 1 (TIR1-x).

<a id="broker-preferences"></a>
## broker-preferences (`e2e/broker-preferences.spec.ts`, csv 18)

BP1-BP3 and BP5 keep their earlier dispositions, and BP4-d and BP5-f stay OBSOLETE. Both are in
`docs/testing/e2e-retirement-map-pr6a.md#broker-preferences`, unchanged by B1. The four call-3 SURVIVED mutations
were re-run verbatim from `issue-2835/evidence/mut/MUT-A29..A33/mutation.diff`, and all four are now RED.

| Id | Disposition | Tests | Mutations |
|---|---|---|---|
| BP4-c | COVERED_NEW | `realSelect2859 > BrokerPreferences real Radix Select pick (#2859 B1, BP4-c) > BP4-c: …` (real Radix Select driven by synchronous keyDown, 90 s timeout; the picked values reach the POST body). It was green on 2 consecutive runs (exit 0, about 45 s each) and in the harness restored run | M-BP4c |
| BP4-e | COVERED_NEW | `addFlow2859 > BrokerPreferences add flow over HTTP (#2859 B1) > BP4-e/f/g: …` (POST count 0 to 1; exact path `/api/broker/market-focus`) | A29 |
| BP4-f | COVERED_NEW | the same it (`toEqual` on the whole body, so no `citySlug`) | A30, A31 |
| BP4-g | COVERED_NEW | the same it (exact `{ areaKey: 'IN\|KA\|Mangalore\|Kadri', propertyType: 'apartment', listingPurpose: 'rent' }`) | M-BP4g, A31 |
| BP4-h | COVERED_NEW | `addFlow2859 > … > BP4-h/i: …` (empty state and no list before; GET 1 to 2; list after) | A33 |
| BP4-i | COVERED_NEW | the same it (exact `Kadri, Mangalore`) | M-BP4i, A33 |
| BP4-j | COVERED_NEW | `addFlow2859 > … > BP4-j: …` (the added row has `manual`; the seeded row in the same list has `seeded` and no `manual`) | M-BP4j |
| BP-422 | COVERED_NEW | `addFlow2859 > … > BP-422: …` (rendered `Unknown area` and `The selected area is not recognised. Please choose a different area.` via the real Toaster; GET stays at 1; the existing row is still rendered) | M-BP422 |

Row tally (8 B1 ids): COVERED_NEW 8.


<a id="codex-round-1-changes"></a>
## Codex round 1 changes

These respond to PR #2875 review 5576171126: F1 (comment 4317557807) and F2 (comment 4317557820). I swept every B1
COVERED claim once for a single class of problem: an input injected by the test (mocked auth flags, a stubbed UI
primitive, or a fake fetch, Supabase or api) where the legacy spec drove that boundary for real. Each such claim is
narrowed to what its test proves, and the boundary part is now RETAIN. No new mutation sweep was run. The only new
mutation is M-TIR23, which proves the new F1 test.

**F1 — TIR3.1 is now COVERED_NEW for the real Select pick, and the browser transport is RETAIN.**
`identityRealSelect2859` drives the real Radix Select inside the real Dialog, with no `ui/select` mock. The picked
document type reaches FormData `document_type`. Evidence:
- The test was green on 2 consecutive runs, each exit 0.
- M-TIR23 makes the doc-type Select `onValueChange` ignore the pick. The test went RED. The file was then restored
  with a matching sha256, and the restored run was green.

**F2 — nav ids are split.** N1-a, N1-b, N1-e, N1-f, N1-g, N2-a, N2-b and N2-d are each now:
- (a) COVERED_NEW: given the flags, the nav shows exactly these items.
- (b) RETAIN: stored role X gives flags Y. This is the AuthContext login and role lookup. No in-scope test covers
  it, and an AuthContext test is outside the B1 file globs.

**Sweep, same class: new RETAIN boundary subclaims.**

| Id | Narrowed COVERED claim (what the test proves) | RETAIN boundary (reason) |
|---|---|---|
| INV-session (all inventory ids) | Each inventory claim holds given `useAuth().isAdmin === true`. This is what enables `useAdminListingById`. | A real admin login resolving to `isAdmin`: the AuthContext role lookup, as in F2. |
| INV1-b.3, INV2-b.3, INV4a-a.2, INV4a-d.2 | Given a re-read that returns the written state, the drawer re-reads (the read count increments) and renders it. | The real Supabase/PostgREST read and the real backend returning that state. This is the persistence already RETAINed as INV1-b.2, INV2-b.4, INV4a-a.3 and INV4a-d.3. |
| INV1-d.1, INV4a-c.1 | The hook sends exactly `eq(status, …)`. | Real PostgREST applying that filter to rows. This is the same boundary as INV1-d.2 and INV4a-c.2. |
| INV3-a | Given a by-id read that returns `null`, the drawer shows the not-found state. | A real by-id query returning `null` for a nonexistent id. |
| INV3-b | The URL-state rule: Close drops `edit` and keeps `tab`. The page data hooks are stubbed. | None. The claim does not depend on the data boundary. Narrowed to the URL rule. |
| INV4a-a.4, INV4a-d.3 (controller) | The controller guard and the response status. The service is mocked, and the jwt authorities are injected with a permitAll test chain. | The real filter chain and the DB role lookup for `/api/admin/listings/**`. |
| INV4a-b | The controller's LIVE-only rule (`PublicListingController.java` L94). | The `findByIdWithActiveCity` SQL, which is mocked in `PLCT`. |
| TIR-session (TIR1, TIR2, TIR3.1, TIR4) | The panel's behaviour given the faked trust-progress GET and a dummy `getSession` token. | A real Supabase session and token. TIR4's server-side PENDING truth comes by composition from `IT` (TIR3.2). |
| TIR5, TIR6-b | Given the pending-list payload the fake serves (and `isAdmin` mocked), the queue shows the `Aadhaar` label and tab count, and drops the approved row after the re-read. | The real `GET /api/admin/trust/identity/pending` payload, and its exclusion of approved evidence. No B1 test calls that endpoint. |
| BP-session (BP4-c..j, BP-422) | Given `useAuth().isBroker === true`. The api fake matches the spec's own `page.route` stub (see the pr6a note), so that boundary is unchanged. The `addFlow2859` Select pass-through is backed by the real-Select BP4-c test. | A real broker login resolving to `isBroker`, as in F2. |

Unchanged by the sweep:
- TIR3.2, TIR6-a.2 and TIR7-b: `IT` uses the real filter chain, DB roles and repositories.
- TIR6-a.1 and TIR7-a: composition with `IT`.
- The STALE and RETAIN ids.

## Deviations from the approved plan

All of these fall under rule R5 ("re-derive") and the rule that the writer confirms or downgrades.

- **Mutation targets re-derived.** M-INV3 targets `useAdminListingsInventory.ts` (`closeEditor`). M-INV6 targets the
  inline `await invalidateListingQueries` in `useListingLifecycleActions.ts`. M-TIR4 and M-TIR6 target
  `useIdentityVerification.ts`. M-TIR7 targets `useTrustReviewMutations.ts`. A29 and A33 are the register's actual
  diffs.
- **Mutations added for R1/AC2.** These were added so that every COVERED claim has its own mutation: M-INV1a,
  M-INV8..18, M-INV4b, M-INV4a4a/b, M-INV4d3a/b, M-NR5..8, M-TIR8..22, M-BP4g/i/j and M-TIR1x-a/b.
- **TIR1-x stays RETAIN** with an observed reason. The mutation discrimination probe M-TIR1x-b SURVIVED.
- **INV3-a is split.** The explanatory-copy part is STALE. The title and no-spinner parts are COVERED.
- **The IT is a `@SpringBootTest`, not `@DataJpaTest` with controllers created by `new`.** It mirrors the untagged
  precedent `BrokerArchivedListingsFilterIT`. So the real filter chain is exercised, which surfaced the
  security observation above.
