# Sprint 32 Enriched Specs — E2E Fidelity Refactor

## #666 feat(e2e): booking UI journey — request viewing modal end-to-end

AC:
- [ ] New file `e2e/journey/booking-journey.spec.ts` exists
- [ ] UB1: Using user storageState, navigate to test listing detail page, click "Request Viewing" button, fill `#requested-date` (3 days from today `YYYY-MM-DD`), select first option in `#time-slot` Radix Select, fill `#requester-message` with "Automated test booking", click "Send Request". Assert success toast matching `/viewing request sent/i` visible. Assert "Send Request" button disabled or dialog closes.
- [ ] UB2: With booking from UB1 existing, re-open modal and attempt submit. Assert inline error with class `.text-destructive` visible (not just a network 409).
- [ ] UB3: Using broker storageState, navigate to `/broker/bookings` (NOT `/dealer/bookings`). Assert booking from UB1 visible in table.
- [ ] `beforeAll` authenticates as test user and cancels any pre-existing booking on the test listing before UB1 runs. 409 is NOT a valid pass for UB1.
- [ ] `afterAll` cancels/deletes the test booking via API (documented API-assist — fixture cleanup only).

Out of scope: Unauthenticated RequestViewingModal state. No changes to modal component.
Key unknowns: NONE — route corrected to `/broker/bookings`. Actual toast text confirmed as "Viewing request sent" (from `useCreateBooking` in `src/hooks/useBookings.ts`); `/viewing request sent/i` matches.

---

## #667 fix(e2e): DL1 image upload — replace React fiber introspection with standard file input

AC:
- [ ] `e2e/broker-listing-creation.spec.ts` no longer contains any reference to `__reactFiber`, `__reactInternalInstance`, `fiber.return`, or `memoizedProps.onDrop`. The "Strategy A" fiber-walk block (lines ~273-294) is removed.
- [ ] Image upload uses `setInputFiles` with `{ force: true }` on the hidden `<input type="file">`, OR uses a native `DragEvent` dispatch with `DataTransfer`. No React internals.
- [ ] After upload, at least one preview thumbnail image is visible in the step-2 panel before the test continues.
- [ ] `e2e/fixtures/test-image.jpg` exists — a valid JPEG (~100×100px) checked into the repo.
- [ ] DL1 test passes end-to-end with the new upload strategy.

Out of scope: No changes to `ImageUploader` React component.
Key unknowns: If `setInputFiles({ force: true })` does not trigger the React `onChange`, the fallback is native `DragEvent` dispatch (not fiber walk). If neither works, a small `data-testid` addition to the component may be needed — this expands scope and requires a note to the user before proceeding.

---

## #668 fix(e2e): remove weak assertions and waitForTimeout across suite

**Scope corrections applied:**
- `map-filters.spec.ts` is NOT in scope — current file has zero `waitForTimeout` calls.
- BC1 is in `listing-lifecycle.spec.ts`, NOT `user-journeys.spec.ts`. Scope for `user-journeys.spec.ts` is U4 only.

AC:
- [ ] `e2e/poi-display.spec.ts` line 157: `waitForTimeout(2_000)` replaced with `waitForResponse` on the POI endpoint or `waitForSelector` that resolves when POI data is rendered. No `waitForTimeout` remains in this file.
- [ ] `e2e/user-journeys.spec.ts` U4 (line ~161): `waitForTimeout(3_000)` replaced with `waitForResponse` on the area-market RPC endpoint or deterministic selector wait. No `waitForTimeout` remains. **Scope for this file ends here — no BC1 block exists in user-journeys.spec.ts.**
- [ ] No `waitForTimeout` in `e2e/broker-listing-creation.spec.ts` — DO NOT touch this file (covered by #667).
- [ ] No new `waitForTimeout` calls introduced in any modified file.

Out of scope: `map-filters.spec.ts`. `broker-listing-creation.spec.ts`. BC1 block (lives in `listing-lifecycle.spec.ts`, handled by #671).
Key unknowns: NONE after scope correction.

---

## #669 feat(e2e): admin moderation journey — approve and reject listings via UI

AC:
- [ ] New file `e2e/journey/admin-moderation.spec.ts` exists.
- [ ] AM1: Admin storageState, navigate to `/admin/listings`, click "Approve" button on test listing row. Assert toast `/listing approved/i` (actual: "Listing Approved"). Assert listing row removed from queue OR status badge changes.
- [ ] AM2: Second PENDING_REVIEW listing created via API in `beforeAll`. Admin opens reject dialog (click "Reject"), selects `REJECTION_CODES` option from the Select component, fills rejection note textarea, clicks "Reject Listing". Assert toast `/listing rejected/i`. Assert row removed.
- [ ] AM3: Broker storageState, navigate to `/broker/listings`, find rejected listing from AM2, assert REJECTED badge. Navigate to detail, assert rejection reason text visible.
- [ ] `beforeAll` creates two PENDING_REVIEW listings via API (broker creates + submits). `afterAll` cleans up both via admin delete API.
- [ ] L4 API-only approve block in `listing-lifecycle.spec.ts` is deleted (coordinated with #671).

Out of scope: "Return for Edits" flow. No changes to `PendingListings.tsx`.
Key unknowns: PendingListings reads from Supabase directly (not Spring backend). The `beforeAll` creates listings via Spring API. If Supabase RLS or replication lag causes the listing to not appear in the admin queue, the test will need a `waitForSelector` with polling.

---

## #670 feat(e2e): saved areas journey — save area, delete area, alert toggle

**⚠️ ISSUE-CORRECTION PENDING — awaiting user decision on SA1 scope.**

Finding: The "Save Area" UI button does not exist. `useSaveArea()` hook is implemented but has zero callers. There is no UI for a user to initiate saving an area.

Options surfaced to user:
- **Option A:** Remove SA1 from scope. Implement SA2 + SA3 only (API-seeded area in `beforeAll`). Add TODO comment for SA1.
- **Option B:** Separate prerequisite issue to build the Save Area UI button first. SA1 blocked on that issue.

AC (SA2 + SA3 only — pending Option A confirmation):
- [ ] New file `e2e/journey/saved-areas.spec.ts` exists.
- [ ] `beforeAll` creates a saved area via `POST /api/saved-areas` API (documented API-assist fixture).
- [ ] SA2: Navigate to `/saved-areas`, click `aria-label="Remove saved area"` button, confirm if dialog, assert area removed from list.
- [ ] SA3: Navigate to `/saved-areas`, click the alerts Switch, assert state changes, reload, assert state persisted.
- [ ] `afterAll` cleans up any remaining test saved areas via API.
- [ ] Spec includes `// TODO SA1: test save-area UI when useSaveArea() is wired to a UI button` comment.

Out of scope: SA1 (UI save interaction — no button exists). No changes to `SavedAreas.tsx`.
Key unknowns: NONE for SA2/SA3 once user confirms Option A.

---

## #671 refactor(e2e): move API-only backend tests out of Playwright

**Scope correction:** BC1 is in `listing-lifecycle.spec.ts` (lines 552-698), NOT `user-journeys.spec.ts`. Both L4 and BC1 API-only blocks are in the same file.

AC:
- [ ] `e2e/listing-lifecycle.spec.ts` L4 (API-only approve block, lines ~218-333): Deleted. Note: #669 also deletes from `listing-lifecycle.spec.ts` (L4 block). #669 must merge before #671 to avoid conflict — coordinate on which PR owns which block.
- [ ] `e2e/listing-lifecycle.spec.ts` BC1 (API-only cascade block, lines ~552-698): All `page.evaluate(fetch(...))` assertion blocks removed or ported. `BookingControllerTest.java` covers HTTP 201 happy path; assess whether cascade integration coverage exists in `@SpringBootTest` — if not, port to `BookingCascadeIntegrationTest.java`.
- [ ] No API-only `page.evaluate(fetch(...))` assertions remain in `listing-lifecycle.spec.ts`. `user-journeys.spec.ts` is NOT touched by this issue.
- [ ] Existing Playwright UI tests (L1, L2, L3, L5, LC1 in `listing-lifecycle.spec.ts`) are not affected.

Out of scope: `user-journeys.spec.ts` (no BC1 there — already confirmed). No new E2E UI tests.
Key unknowns: BC1 cascade coverage in `@SpringBootTest` may be missing — if porting needed, PR gains a backend component; flag to user before proceeding.

---

## #672 chore(e2e): Playwright config — smoke/journey/integration-ui project split + CI update

AC:
- [ ] `playwright.config.ts` has 4 projects: `smoke` (existing files in e2e/ root), `journey` (matches `e2e/journey/**/*.spec.ts`), `integration-ui` (matches `e2e/integration-ui/**/*.spec.ts`), and `full` (runs all three).
- [ ] `package.json` adds scripts: `test:e2e:smoke`, `test:e2e:journey`, `test:e2e:full`.
- [ ] `.github/workflows/ci.yml` `playwright-pr` job: `npx playwright test e2e/quick-smoke.spec.ts` → `npx playwright test --project=smoke`.
- [ ] `.github/workflows/e2e-post-deploy.yml`: `npm run test:e2e` → `npm run test:e2e:full` (or equivalent).
- [ ] `e2e/journey/` and `e2e/integration-ui/` directories exist before this PR merges. If landing before other PRs, add `.gitkeep` files so config is valid.

Out of scope: No test file content changes.
Key unknowns: NONE.
