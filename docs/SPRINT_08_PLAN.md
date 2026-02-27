# Sprint 8 Plan — Listing Lifecycle Completion + UI Polish

**Sprint**: Sprint 8
**Date**: 2026-02-27
**Status**: COMPLETE ✅ (2026-02-27)
**Focus**: Complete the dealer-to-live listing pipeline (image upload → address confirmation → submission → admin review → notifications). Run the top-priority UI fixes from the S7 design review in parallel.

---

## 0. Sprint Goal

> Dealers can upload images, confirm their listing's map location, and submit for admin review. Admins can approve or reject from a review queue. Approved listings go live automatically. In-app notifications inform dealers of outcomes. Top CRITICAL/HIGH findings from the S7 UI review are resolved.

---

## PR Status Tracker

| PR | Name | Priority | Status |
|----|------|----------|--------|
| PR-8.1 | UI polish — DealerBookings + badge colors + hover tokens | P1 | ✅ Done — commit 08d86f0 |
| PR-8.2 | UI polish — RequestViewingModal + ListingDetail + NewListing | P1 | ✅ Done — commit 59d123f |
| PR-8.3 | Image upload backend (V18 migration + upload endpoint) | P1 | ✅ Already built (ListingImageController, V9 schema) |
| PR-8.4 | EditListing workflow: ImageUploader + address confirm + Submit button | P1 | ✅ Done — commit 2b93d6b |
| PR-8.5 | Address geocode + pin confirmation (frontend) | P1 | ✅ Covered by PR-8.4 (AddressPicker already existed) |
| PR-8.6 | Listing submission backend (POST /submit + validation) | P1 | ✅ Already built (ListingController.submit, full validation) |
| PR-8.7 | DealerListings: Submit for Review button | P1 | ✅ Done — merged into PR-8.4 (commit 2b93d6b) |
| PR-8.8 | Admin review backend (approve + reject endpoints) | P1 | ✅ Already built (AdminListingController) |
| PR-8.9 | Admin review frontend (admin listings queue page) | P2 | ✅ Already built (PendingListings.tsx) |
| PR-8.10 | Notifications backend (trigger on approve/reject) | P2 | ✅ Already built (NotificationEventListener) |
| PR-8.11 | Notifications frontend (NotificationBell real data) | P2 | ✅ Already built (NotificationBell + useNotifications) |

---

## Codebase discoveries (pre-sprint)

- `listing_images` table exists in V9 migration — already has `id`, `listing_id`, `storage_path`, `url`, `position`, `created_at`
- `property_listings.address_confirmed BOOLEAN DEFAULT false` — already added per MVP spec (confirm which migration)
- `notifications` table exists in V9 migration — already has the schema from MVP spec §4.3
- `viewing_request_status` is TEXT (confirmed S7) — same may apply to `listing_status` (check before assuming enum)
- `NewListing.tsx` captures `landArea` and `bedrooms` in state but silently drops them from the mutation payload — dead fields (HIGH finding from S7 review, fixed in PR-8.2)
- `RateLimiterService` already protects `POST /api/bookings` and `POST /api/payments` — add image upload endpoint to rate limiting in PR-8.3
- Supabase Storage bucket: `listing-images` (per MVP spec §6.2) — confirm it exists in Supabase project before PR-8.4
- `@EnableScheduling` already on `RealEstateApplication` (added S7 PR-7.6)

---

## 1. Carry-Forward from Sprint 7

| Item | Source | Severity | Notes |
|------|--------|----------|-------|
| DealerBookings silent error | S7 UI review | 🔴 CRITICAL | `isError` not destructured; network failure shows blank sections |
| Status badge semantic colors | S7 UI review | 🟡 HIGH | LIVE=green, PENDING_REVIEW=amber, REJECTED=red, DRAFT=gray |
| `hover:bg-accent/50` token misuse | S7 UI review | 🟡 HIGH | Affects Insights.tsx (×2), SavedAreas.tsx |
| `py-12` → `py-6` dealer pages | S7 UI review | 🟡 HIGH | DealerDashboard, DealerListings, DealerBookings |
| Empty states missing icons | S7 UI review | 🟡 HIGH | DealerListings, DealerBookings (×2 sections) |
| Image upload | S7 deferral | 🟡 HIGH | Blocks submission flow |
| Address geocode + pin confirmation | S7 deferral | 🟡 HIGH | Required for submission validation |
| Listing submission flow | S7 deferral | 🟡 HIGH | Core dealer workflow — no listings can go LIVE without it |
| Admin review queue | S7 deferral | 🟡 HIGH | Admins can't approve/reject without UI |
| Notifications system | S7 deferral | 🟢 MEDIUM | Depends on approve/reject flow |

---

## 2. Sprint 8 PR Breakdown

> Rule: Max 3 files per PR (waived only when called out). Each PR follows the risk-tier pipeline from `.claude/PR_RULES.md`.

---

### PR-8.1 — UI Polish: DealerBookings + Badge Colors + Hover Tokens + Padding (HIGH)

**Priority**: 🟡 HIGH (bugs visible on primary dealer screens)
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Fixes (from S7 review):**

1. **CRITICAL fix** — `DealerBookings.tsx`: destructure `isError` from `useDealerBookings()`, add error `Alert` in both Pending and Confirmed sections
2. **HIGH fix** — `DealerListings.tsx`: replace `statusVariant` function with semantic className-based badge colors per design system §9:
   - LIVE → `bg-green-100 text-green-800 border-0`
   - PENDING_REVIEW → `bg-amber-100 text-amber-800 border-0`
   - REJECTED → `bg-red-100 text-red-800 border-0`
   - DRAFT → `bg-gray-100 text-gray-600 border-0`
3. **HIGH fix** — `Insights.tsx`: replace `hover:bg-accent/50` → `hover:bg-secondary/50` on New Listings rows (line ~251) and Recommendations rows (line ~321)
4. **HIGH fix** — `SavedAreas.tsx`: same hover token fix (line ~72)
5. **HIGH fix** — `DealerDashboard.tsx`, `DealerListings.tsx`, `DealerBookings.tsx`: change `py-12` → `py-6` container padding

**Files (max 5 — limit waived; all are 1-3 line edits each):**
1. `src/pages/dealer/DealerBookings.tsx`
2. `src/pages/dealer/DealerListings.tsx`
3. `src/pages/Insights.tsx`
4. `src/components/insights/SavedAreas.tsx`
5. `src/pages/dealer/DealerDashboard.tsx`

**Acceptance criteria:**
- `DealerBookings` API failure shows destructive `Alert` in both sections
- LIVE badges are green, PENDING_REVIEW amber, REJECTED red, DRAFT gray
- Hovering list rows in Insights shows warm-beige tint (not teal)
- Dealer page top padding matches Insights page
- `npm test -- --run` → all tests pass; `npm run build` succeeds

---

### PR-8.2 — UI Polish: RequestViewingModal + ListingDetail Badges + NewListing Dead Fields (HIGH)

**Priority**: 🟡 HIGH (user-visible bugs in booking + listing creation flows)
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Fixes (from S7 review):**

1. **HIGH fix** — `RequestViewingModal.tsx`: add `Loader2` spinner to submit button during `isPending`; add `isError` alert below form fields
2. **HIGH fix** — `ListingDetail.tsx`: update `propertyConfig` badge colors to light-background pattern (`bg-green-100 text-green-800 border-0` etc.)
3. **HIGH fix** — `NewListing.tsx`: include `landArea`, `bedrooms`, `builtArea` in the `createListing.mutate()` payload (currently captured in state but silently dropped)

**Files (max 3):**
1. `src/components/listing/RequestViewingModal.tsx`
2. `src/pages/ListingDetail.tsx`
3. `src/pages/dealer/NewListing.tsx`

**Acceptance criteria:**
- RequestViewingModal submit shows spinner; API failure shows inline error message
- Property type badges in ListingDetail use light-background pattern
- NewListing mutation includes all captured fields
- `npm test -- --run` → all tests pass; `npm run build` succeeds

---

### PR-8.3 — Image Upload Backend: V18 Migration + Upload Endpoint (HIGH)

**Priority**: 🟡 HIGH (critical path unblocked for submission)
**Pipeline**: CRITICAL tier — qa-fast → backend-engineer → code-reviewer → security-reviewer

**Problem**: Dealers cannot upload listing images. The `listing_images` table exists (V9) but no upload endpoint exists. The submission flow (PR-8.6) requires `≥ 3 images` before allowing DRAFT → PENDING_REVIEW.

**Approach**: Backend provides a signed URL endpoint. Frontend uploads directly to Supabase Storage using the signed URL (avoids routing binary data through the Spring backend).

**Files (max 3):**
1. `backend/.../listing/ListingImageController.java` (NEW) — 2 endpoints:
   - `POST /api/listings/{id}/images/upload-url` → returns a Supabase Storage signed upload URL (`{ uploadUrl, path }`)
   - `DELETE /api/listings/{id}/images/{imageId}` → deletes metadata from `listing_images` + calls Supabase Storage delete API
   - Auth: dealer only, listing must belong to caller, status must be DRAFT or REJECTED (PENDING_REVIEW/LIVE = 409)
   - Rate limit: 20 images/user/hour (add to `RateLimiterService`)
2. `backend/.../listing/ListingImageService.java` (NEW):
   - `generateUploadUrl(UUID listingId, UUID dealerId, String filename)` → validates owner + status, calls Supabase Storage REST API to generate signed URL, returns URL + storage path
   - `recordUpload(UUID listingId, String storagePath, String publicUrl, int position)` — saves row to `listing_images`
   - `deleteImage(UUID imageId, UUID dealerId)` — validates ownership, deletes from `listing_images`, calls Supabase Storage delete API
   - Supabase Storage URL: `${SUPABASE_URL}/storage/v1/object/sign/listing-images/{path}` (service role key in header)
3. `backend/src/test/.../listing/ListingImageControllerTest.java` (NEW):
   - `getUploadUrl_validDraftListing_returns200WithUrl`
   - `getUploadUrl_wrongOwner_returns403`
   - `getUploadUrl_pendingReviewListing_returns409`
   - `deleteImage_validOwner_returns204`
   - `deleteImage_wrongOwner_returns403`

**Environment variable needed**: `SUPABASE_SERVICE_ROLE_KEY` — add to `application.yml` as `supabase.service-role-key: ${SUPABASE_SERVICE_ROLE_KEY}` and inject in the service.

**Acceptance criteria:**
- Signed upload URL returned for valid DRAFT/REJECTED listings
- 403 on wrong owner, 409 on locked status
- Image delete removes DB row (Storage deletion failure should log warning but not fail the request)
- Rate limit: 20 upload URLs/user/hour
- All 493+ existing tests pass

---

### PR-8.4 — Image Upload Frontend: Supabase Storage UI (HIGH)

**Priority**: 🟡 HIGH (critical path)
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Problem**: No image upload UI exists. Dealers can't add images to their listings.

**Files (max 3):**
1. `src/components/listing/ImageUploader.tsx` (NEW):
   - Accepts up to 10 images, requires min 3 for submission gate (visual indicator)
   - File picker with drag-and-drop (use shadcn `Card` as drop zone)
   - On file select: call `POST /api/listings/{id}/images/upload-url`, then `PUT {signedUrl}` directly from browser to Supabase Storage
   - After upload: call `POST /api/listings/{id}/images/record` (or pass the path back to backend to record) — implement whichever pattern was decided in PR-8.3
   - Shows thumbnail previews; delete button on each; re-orders by drag (position tracking)
   - Shows upload progress per file
   - Accepted: JPEG, PNG, WebP; max 5 MB each (per spec §6.4)
2. `src/pages/dealer/NewListing.tsx` — embed `<ImageUploader listingId={...} />` in the form (after the listing is first saved as DRAFT, the `listingId` is available)
3. `src/pages/dealer/EditListing.tsx` — same: embed `<ImageUploader listingId={id} existingImages={listing.images} />` when status is DRAFT or REJECTED

**Acceptance criteria:**
- Dealer can upload 1–10 images; each uploads directly to Supabase Storage
- Image count badge shows current count; turns green when ≥ 3
- Invalid type or oversized file shows toast error (not uploaded)
- Delete removes image from preview + calls delete endpoint
- `npm test -- --run` → all tests pass; `npm run build` succeeds

---

### PR-8.5 — Address Geocode + Pin Confirmation (frontend) (HIGH)

**Priority**: 🟡 HIGH (required for submission validation per spec §5)
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Problem**: Dealer creates a listing with a `locality` text field, but there is no geocoding step and no `address_confirmed` flag. Submission requires `address_confirmed = true` (spec §5.3).

**Files (max 3):**
1. `src/components/listing/AddressConfirmationMap.tsx` (NEW):
   - Renders a Leaflet map (reuse existing map setup from `PropertyMap.tsx`)
   - On mount: geocodes `locality` string via Nominatim OSM API (`https://nominatim.openstreetmap.org/search?q={locality}&format=json&limit=1`)
   - Shows draggable marker at geocoded position
   - "Confirm Location" button: saves `lat`, `lon`, `address_confirmed = true` via `PATCH /api/listings/{id}/location` (new lightweight endpoint — can be added in this PR or PR-8.6)
   - If no geocode result: shows "Could not geocode address — drag pin manually"
   - Rate limit: 1 Nominatim request/second (use `setTimeout` debounce client-side per Nominatim ToS)
2. `src/pages/dealer/NewListing.tsx` — add step 2: after saving DRAFT, show `<AddressConfirmationMap locality={form.locality} listingId={savedListingId} />` before proceeding to image upload
3. `src/pages/dealer/EditListing.tsx` — show address map if `!listing.addressConfirmed` and status is DRAFT/REJECTED

**Backend**: Add `PATCH /api/listings/{id}/location` (latitude, longitude, addressConfirmed=true) to `ListingController` — 1 endpoint, owner + status check. Can be added here (add to `ListingController.java` + `ListingService.java` + test) without creating new files (file limit waived for this endpoint since it's 3-line additions to existing files).

**Acceptance criteria:**
- Nominatim geocodes locality on mount; pin placed at result
- Dealer can drag pin; clicking "Confirm Location" sends lat/lon to backend
- `listing.address_confirmed = true` after confirmation
- Works without network (pin drag still saves if geocode failed)
- `npm test -- --run` → all tests pass; `npm run build` succeeds

---

### PR-8.6 — Listing Submission Backend: POST /submit (P1)

**Priority**: 🟡 HIGH (critical path; enables listings to go live)
**Pipeline**: CRITICAL tier — qa-fast → backend-engineer → code-reviewer → security-reviewer

**Problem**: No `POST /api/listings/{id}/submit` endpoint exists. Without it, DRAFT listings cannot transition to PENDING_REVIEW.

**Validation rules** (per spec §3):
- Status must be DRAFT or REJECTED (else 409)
- Owner must match (else 403)
- `address_confirmed = true` (else 422 `{"error": "ADDRESS_NOT_CONFIRMED"}`)
- At least 3 images in `listing_images` (count query, else 422 `{"error": "INSUFFICIENT_IMAGES", "required": 3, "current": N}`)
- `price > 0` (else 422)
- `property_type` in allowed set (else 422)
- `locality` non-empty (else 422)
- Property-type-specific fields (land → landArea; apartment → bedrooms + builtArea)

**Files (max 3):**
1. `backend/.../listing/ListingController.java` — add `POST /api/listings/{id}/submit` (dealer-only)
2. `backend/.../listing/ListingService.java` — `submitListing(UUID listingId, UUID dealerId)`:
   - Run all validation checks (throw 422 with specific error codes per above)
   - Set `status = 'PENDING_REVIEW'`, `submittedAt = now()`
   - Save + return updated listing
3. `backend/src/test/.../listing/ListingControllerTest.java` — add tests:
   - `submit_validDraftListing_returns200WithPendingReviewStatus`
   - `submit_validRejectedListing_returns200`
   - `submit_addressNotConfirmed_returns422`
   - `submit_insufficientImages_returns422`
   - `submit_wrongOwner_returns403`
   - `submit_alreadyPendingReview_returns409`
   - `submit_liveListing_returns409`

**Acceptance criteria:**
- Valid DRAFT → PENDING_REVIEW on submit
- Each validation failure returns distinct 422 error code
- All 493+ existing tests pass

---

### PR-8.7 — Listing Submission Frontend: Submit Button + Locked State (P1)

**Priority**: 🟡 HIGH (critical path)
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Files (max 3):**
1. `src/pages/dealer/DealerListings.tsx` — on DRAFT and REJECTED cards: add "Submit for Review" button (disabled if `imageCount < 3 || !addressConfirmed`; tooltip explains why disabled); calls `POST /api/listings/{id}/submit`; on success toast "Listing submitted for review"
2. `src/pages/dealer/EditListing.tsx` — add "Submit for Review" at the bottom of the edit form (same disabled logic); after submit success, navigate to `/dealer/listings`
3. `src/pages/dealer/__tests__/DealerListings.test.tsx` (update) or new test file — add: submit button visible on DRAFT/REJECTED; disabled when images < 3; calls submit endpoint on click; shows success toast

**Acceptance criteria:**
- Submit button visible on DRAFT and REJECTED cards only
- Button disabled (with tooltip) if < 3 images or address not confirmed
- Successful submission → listing card moves to PENDING_REVIEW state; edit button disappears
- `npm test -- --run` → all tests pass; `npm run build` succeeds

---

### PR-8.8 — Admin Review Backend: Approve + Reject Endpoints (P1)

**Priority**: 🔴 CRITICAL (admin-only write endpoints)
**Pipeline**: CRITICAL tier — qa-fast → backend-engineer → code-reviewer → security-reviewer

**Problem**: No endpoints exist for admin approve/reject. Once a listing reaches PENDING_REVIEW, admins have no way to act on it.

**Files (max 3):**
1. `backend/.../listing/AdminListingController.java` (NEW or add to existing AdminController):
   - `POST /api/admin/listings/{id}/approve` — admin only:
     - Set `status = 'LIVE'`, `reviewedAt = now()`, `reviewedBy = adminId`
     - Return 200 + updated listing
     - 404 if not found; 409 if status ≠ PENDING_REVIEW; 403 if not admin
   - `POST /api/admin/listings/{id}/reject` — admin only:
     - Body: `{ "reason": "..." }` (required, non-empty)
     - Set `status = 'REJECTED'`, `rejectionReason = reason`, `reviewedAt = now()`, `reviewedBy = adminId`
     - Return 200 + updated listing; 422 if reason blank
2. `backend/.../listing/ListingService.java` — `approveListing(UUID listingId, UUID adminId)`, `rejectListing(UUID listingId, UUID adminId, String reason)`
3. `backend/src/test/.../listing/AdminListingControllerTest.java` (NEW):
   - `approve_pendingReviewListing_returns200WithLiveStatus`
   - `approve_notPendingReview_returns409`
   - `approve_nonAdminUser_returns403`
   - `reject_pendingReviewListing_returns200WithRejectedStatus`
   - `reject_blankReason_returns422`
   - `reject_nonAdminUser_returns403`

**Admin auth check**: Follow the pattern in the existing `AdminController` (check how admin role is verified from the JWT).

**Acceptance criteria:**
- Approve: PENDING_REVIEW → LIVE atomically; reviewer stamped
- Reject: PENDING_REVIEW → REJECTED; reason stored
- Non-admin → 403; wrong status → 409
- All 493+ existing tests pass

---

### PR-8.9 — Admin Review Frontend: Listings Queue Page (P2)

**Priority**: 🟢 MEDIUM
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Files (max 3):**
1. `src/pages/admin/AdminListingsReview.tsx` (NEW):
   - Fetch `GET /api/admin/listings?status=PENDING_REVIEW` (or existing admin listing endpoint, paginated)
   - Card per listing: title, dealer, submitted date, price, property type, images (thumbnail strip)
   - Approve button → `POST /api/admin/listings/{id}/approve` → toast + remove from list
   - Reject button → opens inline `Textarea` for reason → `POST /api/admin/listings/{id}/reject` → toast + remove
   - Empty state: "No listings pending review"
2. `src/App.tsx` — add route `/admin/listings/review` (admin-only, lazy import)
3. `src/components/layout/AppLayout.tsx` — add "Review Listings" to `adminNavigation` array (icon: `ClipboardList`)

**Acceptance criteria:**
- Admin sees all PENDING_REVIEW listings with approve/reject actions
- Approve/reject updates list immediately (optimistic or refetch)
- Empty state when queue is clear
- `npm test -- --run` → all tests pass

---

### PR-8.10 — Notifications Backend: Trigger on Approve/Reject (P2)

**Priority**: 🟢 MEDIUM
**Pipeline**: MEDIUM tier — backend-engineer → code-reviewer

**Problem**: `notifications` table exists (V9) but nothing writes to it on listing approval/rejection events. Dealers don't know when their listings are reviewed.

**Files (max 3):**
1. `backend/.../notification/NotificationService.java` (NEW — check if exists):
   - `notifyListingApproved(UUID dealerId, UUID listingId, String listingTitle)`
   - `notifyListingRejected(UUID dealerId, UUID listingId, String listingTitle, String reason)`
   - Both: INSERT into `notifications` table with appropriate `type`, `title`, `message`, `metadata`
   - Use `JdbcTemplate` or Spring Data (check existing pattern)
2. `backend/.../listing/ListingService.java` — inject `NotificationService`, call after successful `approveListing` and `rejectListing`
3. `backend/src/test/.../notification/NotificationServiceTest.java` (NEW):
   - `notifyApproved_insertsNotificationForDealer`
   - `notifyRejected_insertsNotificationWithReason`

**Notification types** (per spec §4.2):
- Approved: `type = 'listing_approved'`, title = "Listing approved", message = "Your listing '{title}' has been approved and is now live."
- Rejected: `type = 'listing_rejected'`, title = "Listing rejected", message = "Your listing '{title}' was rejected. Reason: {reason}"

**Acceptance criteria:**
- Row inserted in `notifications` after approve/reject
- Dealer UUID is the `user_id`
- All 493+ existing tests pass

---

### PR-8.11 — Notifications Frontend: NotificationBell Real Data (P2)

**Priority**: 🟢 MEDIUM
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Problem**: `NotificationBell` component exists but is presumed to use stub/empty data. It should read from `GET /api/notifications` (paginated, unread first) and mark as read on click.

**Files (max 3):**
1. `src/hooks/useNotifications.ts` (NEW or update existing):
   - `GET /api/notifications` → `{ content: NotificationResponse[], totalElements }` (paginated)
   - `POST /api/notifications/{id}/read` → mark single as read
   - `POST /api/notifications/read-all` → mark all as read
2. `src/components/layout/NotificationBell.tsx` — wire to `useNotifications`, show unread count badge, dropdown list of notifications with `markAsRead` on click
3. `backend/.../notification/NotificationController.java` (NEW) — if the notification read endpoints don't exist:
   - `GET /api/notifications` (user-scoped, paginated) — returns caller's notifications
   - `POST /api/notifications/{id}/read` — marks notification as read (only if `user_id` matches)
   - `POST /api/notifications/read-all`

**Note**: If a `NotificationController` already exists, extend it instead of creating new.

**Acceptance criteria:**
- Bell shows unread count badge (0 when all read)
- Clicking bell opens dropdown with notification list
- Clicking a notification marks it read; count decrements
- `npm test -- --run` → all tests pass

---

## 3. Sequencing

```
Phase 1 — UI Polish (parallel with feature work):
  PR-8.1 (DealerBookings + badges + hover + padding) ──► merge  [frontend]
  PR-8.2 (RequestViewingModal + ListingDetail + NewListing) ──► merge  [frontend]

Phase 2 — Image upload (critical path entry):
  PR-8.3 (Image upload backend) ──────────────────────► merge  [backend, CRITICAL]
  PR-8.4 (Image upload frontend) ─────────────────────► merge  [frontend, depends on 8.3]

Phase 3 — Address + Submission:
  PR-8.5 (Address confirmation) ──────────────────────► merge  [frontend, parallel with 8.3/8.4]
  PR-8.6 (Submission backend) ────────────────────────► merge  [backend, depends on 8.3+8.5]
  PR-8.7 (Submission frontend) ───────────────────────► merge  [frontend, depends on 8.6]

Phase 4 — Admin review:
  PR-8.8 (Admin review backend) ──────────────────────► merge  [backend, CRITICAL, depends on 8.6]
  PR-8.9 (Admin review frontend) ─────────────────────► merge  [frontend, depends on 8.8]

Phase 5 — Notifications:
  PR-8.10 (Notifications backend) ────────────────────► merge  [backend, depends on 8.8]
  PR-8.11 (Notifications frontend) ───────────────────► merge  [frontend, depends on 8.10]
```

**Critical path**: PR-8.3 → PR-8.4 → PR-8.6 → PR-8.7 → PR-8.8 → PR-8.9 → PR-8.10 → PR-8.11

PR-8.1, PR-8.2, and PR-8.5 are independent and can run in parallel with the critical path.

---

## 4. Open Questions

1. **`listing_images` table**: V9 creates it — confirm the schema matches what PR-8.3 needs (`storage_path`, `url`, `position`, `created_at`). If `url` is missing, V18 migration must add it.
2. **`property_listings.address_confirmed`**: Check whether `address_confirmed BOOLEAN DEFAULT false` was already added to `property_listings`. If not, V18 must add it (alongside any other missing columns from MVP spec §10.1).
3. **`notifications` table**: V9 creates it — confirm it matches spec §4.3 exactly (`type`, `title`, `message`, `metadata JSONB`, `is_read BOOLEAN`).
4. **Admin role check pattern**: Confirm how the existing `AdminController` verifies admin role from JWT (custom claim? role lookup?). PR-8.8 must use the same pattern.
5. **Supabase Storage bucket**: Confirm `listing-images` bucket exists in the Supabase project and is private (signed URLs required for upload; public URL for display).
6. **`PATCH /api/listings/{id}/location`**: Needed for PR-8.5. Can be added to `ListingController` (minimal endpoint). If adding it would push PR-8.5 over 3 files, it can be added as part of PR-8.6 instead (batch backend change).

---

## 5. Risk Assessment

| PR | Risk | Notes |
|----|------|-------|
| 8.1 | LOW | All 1–3 line CSS class changes. No logic changes. |
| 8.2 | LOW | Small UI additions. Dead field fix is mechanical. |
| 8.3 | HIGH | Calls external Supabase Storage API; service role key in backend. Rate limit on upload URLs. |
| 8.4 | MEDIUM | Direct browser→Supabase upload (no Spring in the path). Signed URL expiry must match upload time. |
| 8.5 | MEDIUM | Nominatim rate limit (1 req/sec); must debounce. No API key required. |
| 8.6 | HIGH | Multi-condition validation; distinct error codes per field. All paths must be tested. |
| 8.7 | LOW | UI gate only; submission state comes from API. |
| 8.8 | CRITICAL | New admin-only write endpoints; incorrect auth check = security hole. |
| 8.9 | LOW | Read-heavy admin UI; approve/reject delegate to API. |
| 8.10 | LOW | Write to `notifications` table only; no external calls. |
| 8.11 | LOW | Read-only for bell; mark-read is low-risk write. |

---

## 6. Testing Mandate

Every PR must:
- Pass `npm run lint && npx tsc --noEmit && npm test -- --run` (frontend PRs)
- Pass `cd backend && mvn test` with 0 failures (backend PRs)
- Add or update at least 1 meaningful test
- Include "What could break?" in the implementation report

---

## 7. Not in Sprint 8 (deferred)

| Item | Reason |
|------|--------|
| Razorpay webhook integration | Payment still stubbed; needs real payment provider setup |
| Image moderation | Manual admin review is sufficient for MVP |
| Email / SMS notifications | In-app only per spec §4.1; Phase 2 |
| Listing expiry / auto-archive | Not in MVP scope |
| Dealer verification / KYC | Admin manually promotes — no self-serve flow |
| Google / Facebook OAuth | No user demand yet |
| `@Transactional` service extraction | Nice-to-have refactor; no user impact |
| Admin overflow nav (desktop) | Medium-severity UI finding; lower ROI than feature completeness |
| Auth.tsx React Hook Form migration | HIGH finding from review; impactful but large refactor; Sprint 9 |
| Map mobile filter (Sheet) | HIGH finding; requires Leaflet layout refactor; Sprint 9 |
| Marker cluster flicker fix | MEDIUM finding; perf improvement; Sprint 9 |

---

## 8. PR Summary Table

| PR | Type | Priority | Backend | Frontend | Pipeline |
|----|------|----------|---------|----------|----------|
| 8.1 | UI fix | 🟡 HIGH | ❌ | ✅ | MEDIUM |
| 8.2 | UI fix | 🟡 HIGH | ❌ | ✅ | MEDIUM |
| 8.3 | Feature | 🟡 HIGH | ✅ | ❌ | CRITICAL |
| 8.4 | Feature | 🟡 HIGH | ❌ | ✅ | MEDIUM |
| 8.5 | Feature | 🟡 HIGH | ✅ (1 endpoint) | ✅ | MEDIUM |
| 8.6 | Feature | 🟡 HIGH | ✅ | ❌ | CRITICAL |
| 8.7 | Feature | 🟡 HIGH | ❌ | ✅ | MEDIUM |
| 8.8 | Feature | 🔴 CRITICAL | ✅ | ❌ | CRITICAL |
| 8.9 | Feature | 🟢 MEDIUM | ❌ | ✅ | MEDIUM |
| 8.10 | Feature | 🟢 MEDIUM | ✅ | ❌ | MEDIUM |
| 8.11 | Feature | 🟢 MEDIUM | ❌ | ✅ | MEDIUM |

---

*Sprint 8 plan authored 2026-02-27. Based on Sprint 7 checkpoint, UI_DESIGN_REVIEW_S7.md, MVP_SPEC.md §5/6/4, and carry-forward deferrals.*
