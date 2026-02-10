# Sprint 01 Plan

**Sprint goal**: Deliver the MVP dealer listing flow, admin approval, and user insights dashboard.
**Last updated**: 2026-02-10
**Spec reference**: `docs/MVP_SPEC.md`

---

## Workstreams

| Team | Focus | Lead dependency |
|------|-------|-----------------|
| **A — Data & Security** | DB schema, migrations, RLS, enums, cleanup scripts | None (starts first) |
| **B — Backend** | REST endpoints, JWT authz by role, approval, notifications | Blocked by A (schema) |
| **C — Frontend** | Dealer UI, address picker, image upload, admin approval, insights | Blocked by A (schema) + B (endpoints) |

---

## Team A — Data & Security

### A1: Add `dealer` role and `listing_status` enum

**User story**: As a system, I need the `dealer` role and listing status lifecycle so that dealer-created listings can flow through DRAFT -> LIVE.

**Tasks**:
1. Flyway migration: `ALTER TYPE app_role ADD VALUE 'dealer'`
2. Flyway migration: `CREATE TYPE listing_status AS ENUM (...)`
3. Flyway migration: `ALTER TABLE property_listings ADD COLUMN status listing_status DEFAULT 'SCRAPED'`

**Files** (<=3):
- `backend/src/main/resources/db/migration/V7__add_dealer_role_and_listing_status.sql`
- `backend/src/main/java/com/example/realestate/listing/Listing.java` (add status field)

**Definition of Done**:
- Migration runs without error on existing data
- All existing listings get `status = 'SCRAPED'`
- `mvn test` passes
- Ingestion pipeline unaffected (parse-posts still inserts without specifying status, gets default)

**What could break?**
- Parse-posts edge function inserts without `status` column — OK because DEFAULT handles it
- Existing RLS policies don't filter on status — needs update in A3

**Suggested tests**:
- Migration idempotency (run twice, no error)
- Verify existing listings have status = SCRAPED after migration
- Verify new insert without status column gets SCRAPED

---

### A2: Add dealer listing columns

**User story**: As a dealer, I need address confirmation and review tracking fields so that my listing can go through the approval process.

**Tasks**:
1. Add columns: `address_confirmed`, `rejection_reason`, `submitted_at`, `reviewed_at`, `reviewed_by`, `created_by`, `title`
2. Update Listing entity

**Files** (<=3):
- `backend/src/main/resources/db/migration/V8__add_dealer_listing_columns.sql`
- `backend/src/main/java/com/example/realestate/listing/Listing.java` (add fields)

**Definition of Done**:
- All new columns have safe defaults (NULL or false)
- Existing listings unaffected
- Entity matches schema

**What could break?**
- title column conflicts with computed title in frontend — frontend uses `listing.title` already, so this actually fixes the gap

**Suggested tests**:
- Verify defaults on existing rows
- Insert a new listing with all new fields populated

---

### A3: Create new tables + update RLS

**User story**: As a system, I need tables for listing images, notifications, and saved areas, plus updated RLS policies for the new status and role model.

**Tasks**:
1. Create `listing_images`, `notifications`, `user_saved_areas` tables
2. Add RLS policies:
   - Listings: dealer can CRUD own drafts; public sees LIVE + valid SCRAPED
   - Notifications: user sees own only
   - Listing images: dealer manages own; public reads for visible listings
   - Saved areas: user manages own

**Files** (<=3):
- `backend/src/main/resources/db/migration/V9__create_listing_images_notifications_saved_areas.sql`
- `backend/src/main/resources/db/migration/V10__update_rls_for_mvp_roles.sql`

**Definition of Done**:
- Tables created with correct FKs and indexes
- RLS policies cover all role/status combinations
- Existing admin policies still work
- `is_admin()` and `has_role()` functions still work

**What could break?**
- Changing the public listings RLS policy could break the existing frontend query
- Must ensure: `WHERE status = 'LIVE' OR (status = 'SCRAPED' AND is_valid = true)` is equivalent to current `WHERE is_valid = true` for existing data

**Suggested tests**:
- RLS test: user role can only see LIVE + valid SCRAPED
- RLS test: dealer can see own listings in any status
- RLS test: admin sees all
- Notification visibility: user A cannot see user B's notifications

**Depends on**: A1, A2

---

### A4: Dev cleanup tooling

**User story**: As a developer, I need a safe way to delete test data in development without affecting production.

**Tasks**:
1. SQL script for local/dev use
2. Documentation
3. Optional: admin-only API endpoint (disabled in prod)

**Files** (<=3):
- `scripts/dev_reset.sql`
- `docs/DEV_CLEANUP.md`

**Definition of Done**:
- Script deletes test listings, images, notifications safely
- Environment guard (checks for dev/local)
- Step-by-step instructions in doc
- Does NOT auto-run; requires manual execution

**What could break?**
- Accidental execution in production — mitigated by environment check in script
- FK violations if deletion order is wrong — script handles cascading

**Suggested tests**:
- Run on empty DB (no errors)
- Run on DB with test data (data removed)
- Run on prod-like env (refuses to execute)

**Depends on**: A3 (needs all tables to exist)

---

## Team B — Backend

### B1: Listing CRUD endpoints for dealers

**User story**: As a dealer, I need REST endpoints to create, read, update, and delete my own draft listings.

**Tasks**:
1. `POST /api/listings` — create draft listing
2. `GET /api/listings/mine` — dealer's own listings
3. `PUT /api/listings/{id}` — update own draft/rejected listing
4. `DELETE /api/listings/{id}` — delete own draft

**Files** (<=3):
- `backend/src/main/java/com/example/realestate/listing/ListingController.java`
- `backend/src/main/java/com/example/realestate/listing/ListingService.java`
- `backend/src/main/java/com/example/realestate/listing/ListingRepository.java`

**Definition of Done**:
- Endpoints enforce role = dealer or admin
- Dealers can only access own listings
- Status defaults to DRAFT on create
- Update only allowed for DRAFT or REJECTED status
- Delete only allowed for DRAFT status

**What could break?**
- Existing `/api/ingestion/*` endpoints must not be affected
- Must not introduce new validation that blocks ingestion

**Suggested tests**:
- Auth: USER role gets 403
- Auth: DEALER can create
- Auth: DEALER cannot access another dealer's listing
- Status: cannot update a PENDING_REVIEW listing
- Status: cannot delete a LIVE listing

**Depends on**: A1, A2

---

### B2: Listing submission + validation endpoint

**User story**: As a dealer, I need to submit my listing for review, which validates all required fields.

**Tasks**:
1. `POST /api/listings/{id}/submit` — validate and transition DRAFT -> PENDING_REVIEW
2. Validation logic per property type (see MVP_SPEC section 3)
3. Check: address_confirmed = true, image count >= 3

**Files** (<=3):
- `backend/src/main/java/com/example/realestate/listing/ListingSubmissionService.java`
- `backend/src/main/java/com/example/realestate/listing/dto/ValidationErrorResponse.java`
- `backend/src/main/java/com/example/realestate/listing/ListingController.java` (add endpoint)

**Definition of Done**:
- Returns 422 with field-level errors if validation fails
- Only DRAFT or REJECTED listings can be submitted
- Sets `submitted_at` timestamp
- Creates notification for admins (review_pending)

**What could break?**
- Validation rules must NOT apply to SCRAPED listings
- Image count check queries `listing_images` table, not `raw_posts.images`

**Suggested tests**:
- Submit land listing without land_area -> 422
- Submit apartment without bedrooms -> 422
- Submit with < 3 images -> 422
- Submit with address_confirmed = false -> 422
- Happy path: all fields valid -> status = PENDING_REVIEW

**Depends on**: B1, A3

---

### B3: Admin approval/rejection endpoints

**User story**: As an admin, I can approve or reject listings pending review.

**Tasks**:
1. `POST /api/admin/listings/{id}/approve` — PENDING_REVIEW -> LIVE
2. `POST /api/admin/listings/{id}/reject` — PENDING_REVIEW -> REJECTED (reason required)
3. Create notifications for dealer on approve/reject

**Files** (<=3):
- `backend/src/main/java/com/example/realestate/listing/AdminListingController.java`
- `backend/src/main/java/com/example/realestate/notification/NotificationService.java`
- `backend/src/main/java/com/example/realestate/notification/Notification.java`

**Definition of Done**:
- Only admin role can call these endpoints
- Reject requires non-empty reason
- Sets `reviewed_at`, `reviewed_by`
- Creates notification for listing owner

**What could break?**
- Must not affect existing admin listing toggle (is_valid) in admin Listings page

**Suggested tests**:
- Approve: PENDING_REVIEW -> LIVE, notification created
- Reject without reason -> 400
- Reject with reason -> REJECTED, notification has reason
- Non-admin gets 403
- Approve a DRAFT listing -> 400 (wrong status)

**Depends on**: B1, A3

---

### B4: Notification endpoints

**User story**: As a user, I can fetch my notifications and mark them as read.

**Tasks**:
1. `GET /api/notifications` — user's own notifications (paginated)
2. `PUT /api/notifications/{id}/read` — mark as read
3. `GET /api/notifications/unread-count` — badge count

**Files** (<=3):
- `backend/src/main/java/com/example/realestate/notification/NotificationController.java`
- `backend/src/main/java/com/example/realestate/notification/NotificationRepository.java`

**Definition of Done**:
- Any authenticated user can read own notifications
- Cannot access others' notifications
- Unread count returns a number

**What could break?**
- Nothing in existing system — this is a new feature

**Suggested tests**:
- User A cannot see User B's notifications
- Mark as read is idempotent
- Unread count decrements after mark-as-read

**Depends on**: A3

---

### B5: Image upload endpoints

**User story**: As a dealer, I can upload and manage images for my listing.

**Tasks**:
1. `POST /api/listings/{id}/images` — upload image to Supabase Storage
2. `DELETE /api/listings/{id}/images/{imageId}` — remove image
3. `PUT /api/listings/{id}/images/reorder` — update positions

**Files** (<=3):
- `backend/src/main/java/com/example/realestate/listing/ListingImageController.java`
- `backend/src/main/java/com/example/realestate/listing/ListingImageService.java`
- `backend/src/main/java/com/example/realestate/listing/ListingImage.java`

**Definition of Done**:
- Only listing owner or admin can upload/delete
- Upload only for DRAFT or REJECTED listings
- Max 10 images per listing
- Max 5 MB per file
- Accepted: JPEG, PNG, WebP
- Stores in Supabase Storage, saves metadata in `listing_images` table

**What could break?**
- Supabase Storage bucket must exist and have correct policies
- Large file uploads may need multipart handling

**Suggested tests**:
- Upload succeeds, metadata saved
- Upload 11th image -> 400
- Upload 6MB file -> 400
- Upload to another dealer's listing -> 403
- Delete image from LIVE listing -> 400

**Depends on**: A3, B1

---

### B6: Insights / dashboard endpoints

**User story**: As a user, I can view price analytics and recommendations for my saved areas.

**Tasks**:
1. `GET /api/insights/avg-price-by-area` — uses `area_stats_latest` or `area_price_weekly`
2. `GET /api/insights/price-trend?area_key=X` — time series from `area_price_weekly`
3. `GET /api/insights/new-listings?days=7` — recent listings in user's saved areas
4. `GET /api/insights/recommendations` — deterministic scoring

**Files** (<=3):
- `backend/src/main/java/com/example/realestate/insights/InsightsController.java`
- `backend/src/main/java/com/example/realestate/insights/InsightsService.java`
- `backend/src/main/java/com/example/realestate/insights/InsightsRepository.java`

**Definition of Done**:
- All endpoints require authentication (any role)
- Price trend returns weekly data points
- Recommendations use the heuristic from MVP_SPEC section 7.1.4
- New listings endpoint respects user's saved areas

**What could break?**
- `area_price_weekly` may have stale data — document refresh strategy
- Recommendations with no saved areas should return general recommendations

**Suggested tests**:
- Avg price returns data grouped by area
- Price trend for non-existent area -> empty array
- Recommendations scoring is deterministic (same input = same output)

**Depends on**: A3

---

### B7: Saved areas endpoints

**User story**: As a user, I can save and manage areas I'm interested in.

**Tasks**:
1. `GET /api/saved-areas` — user's saved areas
2. `POST /api/saved-areas` — save an area
3. `DELETE /api/saved-areas/{id}` — unsave

**Files** (<=3):
- `backend/src/main/java/com/example/realestate/insights/SavedAreaController.java`
- `backend/src/main/java/com/example/realestate/insights/SavedArea.java`
- `backend/src/main/java/com/example/realestate/insights/SavedAreaRepository.java`

**Definition of Done**:
- Any authenticated user can manage own saved areas
- Duplicate area_key for same user returns 409
- Delete is idempotent

**What could break?**
- Nothing in existing system

**Suggested tests**:
- Save area, verify returned
- Save duplicate -> 409
- Delete non-existent -> 404 or 204

**Depends on**: A3

---

## Team C — Frontend

### C1: Dealer listing creation page

**User story**: As a dealer, I can create a new draft listing with property details.

**Tasks**:
1. New page: `/dealer/listings/new`
2. Form with property type selector, conditional fields per type
3. Save as draft (calls `POST /api/listings`)

**Files** (<=3):
- `src/pages/dealer/CreateListing.tsx`
- `src/hooks/useDealerListings.ts`
- `src/App.tsx` (add route)

**Definition of Done**:
- Form shows correct required fields per property type
- Saves draft on submit
- Dealer role required (route guard)
- Toast on success/error

**What could break?**
- Adding route to App.tsx must not affect existing routes

**Suggested tests**:
- Component renders for each property type
- Required field validation shown before submit
- API call made with correct payload

**Depends on**: B1

---

### C2: Address picker component

**User story**: As a dealer, I can search for a location and confirm the pin on the map.

**Tasks**:
1. Nominatim search input with debounce
2. Map with draggable pin
3. "Confirm location" button sets address_confirmed

**Files** (<=3):
- `src/components/dealer/AddressPicker.tsx`
- `src/lib/geocode.ts` (Nominatim API wrapper)

**Definition of Done**:
- Search returns OSM results
- Pin is draggable
- Confirm saves lat/lon + sets address_confirmed = true
- Rate limited (1 req/sec to Nominatim)

**What could break?**
- Nominatim rate limiting if not throttled
- Must not conflict with existing PropertyMap component

**Suggested tests**:
- Search returns results
- Pin drag updates coordinates
- Confirm button sets flag

**Depends on**: C1

---

### C3: Image upload component

**User story**: As a dealer, I can upload, reorder, and delete images for my listing.

**Tasks**:
1. Drag-and-drop upload zone
2. Image preview grid with reorder
3. Delete button per image

**Files** (<=3):
- `src/components/dealer/ImageUploader.tsx`
- `src/hooks/useListingImages.ts`

**Definition of Done**:
- Upload to backend endpoint (which stores in Supabase Storage)
- Shows upload progress
- Drag to reorder
- Shows count: "3/10 images (minimum 3 required)"
- Validation: blocks submission if < 3

**What could break?**
- Large images may be slow — consider client-side resize (nice-to-have, not MVP)

**Suggested tests**:
- Upload succeeds, preview shown
- Delete removes from list
- Count updates correctly

**Depends on**: B5

---

### C4: Admin listing approval UI

**User story**: As an admin, I can view pending listings and approve/reject them.

**Tasks**:
1. Admin page: pending listings queue
2. Detail view with approve/reject buttons
3. Reject requires reason text input

**Files** (<=3):
- `src/pages/admin/ListingApproval.tsx`
- `src/hooks/useAdminApproval.ts`
- `src/App.tsx` (add admin route)

**Definition of Done**:
- Shows only PENDING_REVIEW listings
- Approve -> listing goes LIVE
- Reject -> modal with required reason
- List refreshes after action

**What could break?**
- Must not interfere with existing admin Listings.tsx page
- Adding route to App.tsx — same care as C1

**Suggested tests**:
- Approve button calls correct endpoint
- Reject without reason shows validation error
- List filters only PENDING_REVIEW

**Depends on**: B3

---

### C5: Notification bell + dropdown

**User story**: As a user, I can see my unread notifications and mark them as read.

**Tasks**:
1. Bell icon in header with unread count badge
2. Dropdown showing recent notifications
3. Click to mark as read

**Files** (<=3):
- `src/components/notifications/NotificationBell.tsx`
- `src/hooks/useNotifications.ts`
- `src/components/layout/AppLayout.tsx` (add bell to header)

**Definition of Done**:
- Badge shows unread count (polls every 60s)
- Dropdown shows last 10 notifications
- Click marks as read, count decrements
- Links to relevant listing

**What could break?**
- AppLayout.tsx modification must preserve existing header

**Suggested tests**:
- Badge shows correct count
- Click marks as read
- Empty state: "No notifications"

**Depends on**: B4

---

### C6: User insights dashboard

**User story**: As a user, I can view price analytics and recommendations.

**Tasks**:
1. New page: `/insights`
2. Charts: avg price by area, price trend
3. New listings list, recommendations list

**Files** (<=3):
- `src/pages/Insights.tsx`
- `src/hooks/useInsights.ts`
- `src/App.tsx` (add route)

**Definition of Done**:
- All 4 insight panels render
- Charts use a lightweight library (recharts — already may be available)
- Handles empty state gracefully
- Respects user's saved areas

**What could break?**
- Chart library dependency — must be added to package.json

**Suggested tests**:
- Component renders with mock data
- Empty state shown when no data
- Filters update charts

**Depends on**: B6, B7

---

### C7: Saved areas management

**User story**: As a user, I can save areas I'm interested in from the map or insights page.

**Tasks**:
1. "Save area" button on map/listing views
2. Saved areas list in insights page or sidebar
3. Remove saved area

**Files** (<=3):
- `src/components/insights/SavedAreas.tsx`
- `src/hooks/useSavedAreas.ts`

**Definition of Done**:
- Save/unsave toggles correctly
- Saved areas shown in insights dashboard
- Used as filter for new listings and recommendations

**What could break?**
- Must not break existing map interactions

**Suggested tests**:
- Save area, appears in list
- Unsave area, removed from list
- Duplicate save handled gracefully

**Depends on**: B7

---

## Execution Order & Dependencies

```
Week 1:
  A1 ──> A2 ──> A3 ──> A4
                  │
Week 2:           ├──> B1 ──> B2
                  ├──> B3
                  ├──> B4
                  ├──> B5
                  ├──> B6
                  └──> B7
                        │
Week 3:                 ├──> C1 ──> C2 ──> C3
                        ├──> C4
                        ├──> C5
                        ├──> C6 ──> C7
```

**Critical path**: A1 -> A2 -> A3 -> B1 -> B2 -> C1 -> C2 -> C3

**Parallel opportunities**:
- B3, B4, B5, B6, B7 can all start as soon as A3 is done
- C4, C5, C6 can start as soon as their backend dependency is done
- A4 (cleanup tooling) can happen anytime after A3

---

## Test Strategy

### Backend testing

| Area | Approach |
|------|----------|
| Role authorization | Spring Security test with mock JWT per role |
| Status transitions | Unit tests for service layer |
| Validation rules | Parameterized tests per property type |
| Notification creation | Integration test verifying DB insert on status change |
| Migrations | Run on empty + populated DB |

### Frontend testing

| Area | Approach |
|------|----------|
| Form validation | Component tests with React Testing Library |
| Conditional fields | Snapshot or assertion per property type |
| Image upload gating | Mock hook, verify submit button disabled when < 3 |
| Address confirmation | Mock map, verify flag set |

### Manual QA checklist

- [ ] Dealer creates listing -> saves as draft
- [ ] Dealer adds address, confirms pin
- [ ] Dealer uploads 3 images
- [ ] Dealer submits -> status changes to PENDING_REVIEW
- [ ] Admin sees listing in approval queue
- [ ] Admin approves -> listing visible to users, dealer notified
- [ ] Admin rejects with reason -> dealer sees reason, can edit and resubmit
- [ ] User views insights dashboard with data
- [ ] User saves area, sees relevant new listings
- [ ] Scraped listings continue to work (full pipeline test)
- [ ] Existing admin pages still function correctly
