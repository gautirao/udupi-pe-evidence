# Sprint 30 — Search UX & Data Quality: Enriched Specs

## [#605] feat(test): Add Testcontainers integration tests for listing lifecycle persistence
AC:
- [ ] `ListingLifecycleIT.java` exists under `backend/src/test/` with `@Tag("integration")` and uses `@ServiceConnection` with PostgreSQL Testcontainer
- [ ] Test covers: create DRAFT → PUT update fields → register stub images → submit (DRAFT→PENDING_REVIEW) → admin approve (PENDING_REVIEW→LIVE) → archive (LIVE→ARCHIVED) → reopen as DRAFT → resubmit — each step does fresh `findById()` and asserts persisted status
- [ ] `mvn test -Dgroups=integration` runs only integration-tagged tests against a real PostgreSQL container
- [ ] CI workflow has a new job running `mvn test -Dgroups=integration`; existing backend job unchanged
- [ ] Docker is the only local prerequisite (documented)
Out of scope: No changes to existing unit tests. No new Flyway migrations. No production code changes.
Key unknowns: Existing surefire config includes `**/*IT.java` in default `mvn test`. If the AC requires "mvn test without groups runs only unit tests," surefire must exclude IT by default. Clarify before implementation.

---

## [#378] [RE-82] Dealer UX: Mobile-First Responsive Design for Listing Management
AC:
- [ ] NewListing.tsx shows inline field-level validation errors (`text-sm text-destructive`) below required fields when `hasAttempted` is true and field is invalid
- [ ] EditListing.tsx for REJECTED listings: title changes to "Fix & Resubmit Listing" and rejection reason displayed in `Alert variant="destructive"` in header
- [ ] EditListing.tsx displays listing ID (text-xs text-muted-foreground font-mono) next to status badge
- [ ] P1: statusClassName() used for status badge styling, step 3 gated on `addressConfirmed`, video URL label has correct `htmlFor`, step indicator helper text present, ListingDetail shows rejection reason for REJECTED, image gallery supports keyboard navigation
Out of scope: Mobile-specific responsive design (375px width, 48px touch targets) deferred per desktop-first MVP policy. P2 cosmetic fixes out of scope.
Key unknowns: Issue references `statusClassName()` from `status-badge.ts` but no such file exists. Clarify whether this utility needs to be created or is a reference to an existing utility.

---

## [#606] fix(backend): V61 convert property_type enum to VARCHAR
AC:
- [ ] V61 Flyway migration applies cleanly following V60 pattern: drops RLS policies referencing `property_type` with enum casts, alters column to VARCHAR(30), recreates policies, adds CHECK constraint, drops enum type
- [ ] `@ColumnTransformer(write = "?::public.property_type")` and `columnDefinition` removed from `propertyType` field in `Listing.java`
- [ ] All backend tests pass (`mvn test` green)
- [ ] Verification: `SELECT data_type FROM information_schema.columns WHERE column_name = 'property_type' AND table_name = 'property_listings'` returns `character varying`
- [ ] Property type CRUD works correctly after migration
Out of scope: No frontend changes. No validation logic changes. Flyway ceiling advances to V61.
Key unknowns: NONE

---

## [#607] feat(trust): scheduled job to revoke expired trust badges
AC:
- [ ] `BadgeExpiryJob.java` with `@Scheduled(cron = "0 0 2 * * *")` queries `listing_verification_dimension` where `badge_state = 'EARNED'` and `granted_at + TTL < now()`
- [ ] LOCATION badges `granted_at` > 548 days ago → EXPIRED
- [ ] PHOTOS badges `granted_at` > 548 days ago → EXPIRED
- [ ] AUTHORITY badges `granted_at` > 365 days ago → EXPIRED
- [ ] IDENTITY badges never expired (null TTL / skipped in query)
- [ ] Job is idempotent; logs count of expired badges per run
- [ ] All backend tests pass
Out of scope: No new Flyway migration. No frontend changes.
Key unknowns: RESOLVED — use `badge_state = 'EARNED'` (enriched spec overrides issue text which incorrectly said 'GRANTED').

---

## [#608] feat(ui): show trust badges on search cards / map results
AC:
- [ ] `trustTier` added to `ListingResponse.java` record and populated in `ListingResponseMapper` (decision: backend path, not Supabase direct)
- [ ] `PropertyListing` TypeScript interface in `usePropertyListings.ts` updated to include `trustTier: string | null`
- [ ] Listing cards in PropertyMap.tsx popup show trust tier badge chip: green for A/B, amber for C, nothing for D or null
- [ ] Listing preview cards on Index.tsx show same trust tier badge chip
- [ ] No additional API call (uses existing trust_tier from ListingResponse)
- [ ] `PropertyMap.test.tsx` updated: badge chip renders when `trustTier` present (A/B/C), not rendered when null or D
- [ ] TypeScript clean
Out of scope: Badge is display-only, not interactive.
Key unknowns: RESOLVED — add trustTier to ListingResponse.java and populate via mapper/service path.

---

## [#609] refactor(workflow): wire ListingTransitionPolicy guard stubs to existing validation
AC:
- [ ] `guardReasonCodeRequired(String reasonCode)` validates non-null/non-blank; `rejectListing()` delegates to this guard instead of inline check
- [ ] `guardCompleteness(Object listing)` delegates to `validateForSubmission()` logic; called from `submitListing()`
- [ ] `guardFastRestore(Object listing)` compares current entity against `last_approved_snapshot` JSONB; called from `restoreArchivedListing()`
- [ ] `guardSubmissionCount(Object listing)` checks against configurable limit
- [ ] All 1299+ backend tests pass; no behavioral change from user's perspective
Out of scope: No new transitions. No new error codes. No frontend changes.
Key unknowns: `validateForSubmission()` is private in `ListingWorkflowService` and takes a `boolean enforceImageMinimum` parameter. Clarify dependency direction before implementation. Also clarify the configurable submission count limit value.

---

## [#610] fix(ui): enforce 5MB file size limit in ImageUploader
AC:
- [ ] In `ImageUploader.tsx` `handleFiles()`, files with `file.size > 5 * 1024 * 1024` rejected before `uploadImage()`
- [ ] User-visible toast error for each oversized file (includes file name)
- [ ] Multiple files: oversized filtered out, valid files proceed
- [ ] Unit test: mock File > 5MB verifies `uploadImage` not called, toast error shown
- [ ] TypeScript clean
Out of scope: No backend file size validation changes.
Key unknowns: NONE

---

## [#611] chore(frontend): remove legacy src/pages/dealer/ duplication
AC:
- [ ] `src/pages/dealer/` directory completely removed
- [ ] `npx tsc --noEmit` passes clean
- [ ] Legacy `/dealer/*` redirect routes in App.tsx still redirect to `/broker/*`
- [ ] E2E tests pass (they use `/broker/*` paths)
Out of scope: No changes to redirect routes. No renaming of `dealer` values in backend/DB.
Key unknowns: Verify no imports reference `src/pages/dealer/` before deletion. `src/pages/dealer/__tests__/EditListing.test.tsx` should be removed with the directory.

---

## [#612] docs(spec): align commercial property spec with implemented granular types
AC:
- [ ] `docs/MVP_SPEC.md` property type section lists 3 granular commercial types with validation rules matching `ListingWorkflowService.validateForSubmission()`
- [ ] Legacy "commercial" type documented (still valid, has carpet_area + floor_number validation)
- [ ] No code changes — doc-only PR
Out of scope: No code changes. No validation logic changes.
Key unknowns: Legacy "commercial" type still exists with its own validation. Clarify whether spec should document all 4 commercial-related types or state that "commercial" is deprecated.

---

## [#613] feat(auth): enable Google Sign-In as primary MVP auth method
AC:
- [ ] "Sign in with Google" button visible on `Auth.tsx` above email+password form, full-width with Google branding
- [ ] Clicking button calls `supabase.auth.signInWithOAuth({ provider: 'google' })` and opens Google OAuth consent screen
- [ ] Successful Google auth creates Supabase user and redirects to home
- [ ] User role assignment (user/broker) works for Google-authenticated users
- [ ] Existing email+password flow still works
- [ ] AuthCallback.tsx handles OAuth redirect; `/auth/callback` route added to App.tsx
- [ ] TypeScript clean; E2E smoke test Q1 still passes
Out of scope: No backend changes. Supabase dashboard Google OAuth config is a manual setup step.
Key unknowns: (1) `/auth/callback` route missing from App.tsx — must be added. (2) `returnTo` coordination with #616 if both in same sprint. (3) Supabase identity linking needs "Automatically link identities" enabled in dashboard. (4) OAuth redirect URI must match Google Cloud Console config.

---

## [#488] [RE-180] Extract shared listing form constants from NewListing/EditListing (F-6)
AC:
- [ ] `PROPERTY_TYPES`, `COMMERCIAL_TYPES`, `FURNISHING_OPTIONS` extracted to `src/lib/listing-constants.ts`
- [ ] `intOrUndef` and `floatOrUndef` extracted to `src/lib/listing-utils.ts`
- [ ] Both `NewListing.tsx` and `EditListing.tsx` import from new shared modules
- [ ] `npx tsc --noEmit` passes clean; no behavioral changes
- [ ] Shared form field sub-components extracted where feasible
Out of scope: No form behavior/validation changes. No backend changes.
Key unknowns: Scope of sub-component extraction is open-ended. Clarify: constants/helpers only, or also refactor conditional form field JSX into shared components?

---

## [#614] feat(backend): anonymous teaser data contract — redacted public listing endpoints
AC:
- [ ] `ListingTeaserResponse` DTO with exactly 6 fields: `id`, `primaryImageUrl`, `price`, `propertyType`, `locality` (mapped as city), `listingPurpose`
- [ ] `toTeaserResponse(Listing l)` in `ListingResponseMapper` — latitude, longitude, address, description, sellerType, bedrooms, builtArea, landArea, reraNumber, contactPhone, createdBy all absent
- [ ] New `GET /api/public/listings/discovery` — paginated, LIVE only, teaser responses, no auth required
- [ ] `GET /api/public/listings/within-polygon` returns teaser responses (coordinated breaking change — #615 must follow immediately)
- [ ] `GET /api/public/listings/{id}` JWT-aware via `SecurityContextHolder` (endpoint stays `permitAll`):
  - No token present → return teaser (anonymous access allowed)
  - Valid JWT present → return full `ListingResponse`
  - **Malformed/invalid JWT → return 401** (do NOT silently downgrade to teaser — invalid token = explicit rejection)
- [ ] Backend unit tests: `toTeaserResponse()` excludes all sensitive fields; `PublicListingControllerTest` covers no-token (200 teaser), valid JWT (200 full), invalid JWT (401)
- [ ] Existing broker/admin flows unaffected
Out of scope: No frontend changes (handled by #615-#617). No changes to authenticated broker/admin endpoints.
Key unknowns: RESOLVED — (1) use SecurityContextHolder for JWT-awareness; invalid JWT = 401 not silent downgrade. (2) use locality as the "city" field in teaser DTO. (3) within-polygon change is coordinated with #615 (ship together or backward-compat until #615 merges).

---

## [#615] feat(frontend): anonymous teaser home experience — public map with teaser cards
AC:
- [ ] `ProtectedRoute` removed from `/` route in App.tsx; unauthenticated users reach `/` without redirect
- [ ] Home page fetches from `GET /api/public/listings/discovery` when not logged in
- [ ] Teaser cards render with only 6 allowed fields (image, price, property type, city) — no address, coordinates, contact visible
- [ ] Map renders but no pin locations / markers for anonymous users
- [ ] Login CTA visible ("Sign in to see full details and contact brokers") linking to `/auth`
- [ ] Authenticated users see existing full home experience unchanged
- [ ] No TypeScript errors
Out of scope: No backend changes. Blocked by #614.
Key unknowns: Existing home page fetches via Supabase direct query in `usePropertyListings` — anonymous path needs different data source. Clarify: conditional path in existing hook or separate hook.

---

## [#616] feat(frontend): listing detail login gate with deep-link returnTo
AC:
- [ ] `ProtectedRoute` removed from `/listing/:id` in App.tsx; anonymous users can view page
- [ ] Anonymous: teaser-only detail; locked sections show "Sign in to view full details" CTA
- [ ] CTA links to `/auth?returnTo=/listing/<id>`
- [ ] `Auth.tsx` reads `?returnTo` query param as fallback when `location.state?.from?.pathname` absent
- [ ] After login: redirect to returnTo (query param) OR state.from.pathname OR `/` — that priority order
- [ ] `returnTo` sanitised: relative paths starting with `/` only; external URLs rejected
- [ ] No TypeScript errors; no regression on existing in-app redirect flow
Out of scope: No backend changes. Blocked by #614.
Key unknowns: Adding `?returnTo` support requires parsing `useSearchParams()` and integrating with existing redirect flow.

---

## [#617] feat(frontend): authenticated full discovery unlock — remove teaser restrictions post-login
AC:
- [ ] After login, home page shows full listing cards (all fields, full map markers) — no teaser fields, no Login CTA
- [ ] After login, `/listing/:id` shows full fields (address, contact, broker name/phone visible)
- [ ] "Sign in to view full details" CTAs not rendered when authenticated
- [ ] No stale teaser data after auth state change (query cache invalidated/refetched)
- [ ] Logout reverts to anonymous teaser mode
- [ ] No TypeScript errors; no regressions on broker/admin flows
Out of scope: No backend changes. No new auth state management.
Key unknowns: Auth state transition must trigger re-fetch. Clarify: TanStack Query `queryKey` including auth state vs manual `queryClient.invalidateQueries()` in auth context.

---

## [#618] test: anonymous teaser discovery — backend contract + E2E gate flows
AC:
- [ ] Backend: `ListingResponseMapperTest` verifies `toTeaserResponse()` includes exactly 6 fields and excludes 12+ fields; handles null optional fields
- [ ] Backend: `PublicListingControllerTest` — discovery (no auth) → 200 teaser; detail (no auth) → 200 teaser; detail (with JWT) → 200 full ListingResponse; within-polygon (no auth) → 200 teaser
- [ ] E2E anon home: `/` loads without redirect, cards visible, no pin coords in DOM, CTA present
- [ ] E2E returnTo: direct nav to `/listing/<id>` → teaser → CTA → `/auth?returnTo=/listing/<id>` → login → returned to listing
- [ ] E2E deep-link: fresh browser context → login → query param fallback returns to listing
- [ ] E2E full unlock: login → full cards + markers; logout → teaser mode
Out of scope: No production code changes. Blocked by #614, #615, #616, #617.
Key unknowns: Blocked by all feature PRs. E2E tests require a LIVE listing fixture in test environment.
