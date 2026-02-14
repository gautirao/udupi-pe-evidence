# Sprint 1 Manual QA Results

**Date**: [To be filled]
**Tester**: [Name]
**Environment**: [Local/Staging/Production]
**Sprint**: Sprint 01 (MVP Dealer Listing Flow)

---

## Prerequisites

- [ ] Backend running on localhost:8080 (or configured API URL)
- [ ] Frontend running on localhost:5173 (or deployed URL)
- [ ] Database migrations applied (V7-V12)
- [ ] Test users created:
  - Dealer user (email: ____________, role: dealer)
  - Admin user (email: ____________, role: admin)
  - Regular user (email: ____________, role: user)
- [ ] Supabase Auth configured
- [ ] Supabase Storage configured (for image uploads)

---

## Test Cases

### 1. Dealer Creates Listing → Saves as Draft

**Steps**:
1. Login as dealer user
2. Navigate to `/dealer/new-listing`
3. Fill in:
   - Property Type: Residential
   - Title: "Test Property - [Date/Time]"
   - Price: 5000000
   - Bedrooms: 3
   - Bathrooms: 2
   - Description: "Test listing for QA"
4. Click "Save Draft"

**Expected**:
- Listing saved with status = DRAFT
- Redirect to listing edit page or success message
- Listing appears in dealer's "My Listings" section

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 2. Dealer Adds Address, Confirms Pin

**Steps**:
1. In the draft listing from Test 1, navigate to address section
2. Click "Add Address" or search field
3. Search for "Manipal, Udupi"
4. Select search result from dropdown
5. Verify map centers on location
6. Drag marker to refine exact location (optional)
7. Click "Confirm Address" button

**Expected**:
- Map centers on searched location
- Marker appears on map
- Address fields populate (address_line1, city, county, postcode)
- `address_confirmed` flag set to true
- Success message: "Address confirmed"

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 3. Dealer Uploads 3 Images

**Steps**:
1. In the same draft listing, navigate to image upload section
2. Upload 1st image (drag-and-drop or file picker)
3. Wait for upload to complete, verify preview appears
4. Upload 2nd image, verify preview appears
5. Upload 3rd image, verify preview appears
6. Verify "Submit for Review" button becomes enabled

**Expected**:
- Each image uploads successfully
- Image previews appear in correct order
- After 3rd image, `canSubmit` = true
- "Submit for Review" button is enabled (not disabled)

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 4. Dealer Submits → Status Changes to PENDING_REVIEW

**Steps**:
1. In the draft listing with address confirmed and 3 images uploaded
2. Click "Submit for Review" button
3. Confirm submission in confirmation dialog (if present)
4. Verify success message

**Expected**:
- Listing status changes from DRAFT to PENDING_REVIEW
- `submitted_at` timestamp is set
- Success message: "Listing submitted for review"
- Dealer can no longer edit listing (or edit is disabled)
- Listing no longer visible to public users

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 5. Admin Sees Listing in Approval Queue

**Steps**:
1. Logout from dealer account
2. Login as admin user
3. Navigate to `/admin/pending-listings`
4. Verify the listing from Test 4 appears in the queue

**Expected**:
- Admin can see "Pending Listings" page
- Listing from Test 4 is in the list with status PENDING_REVIEW
- Listing shows key details: title, property type, price, dealer name
- "Approve" and "Reject" buttons are visible

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 6. Admin Approves → Listing Visible to Users, Dealer Notified

**Steps**:
1. As admin, in the pending listings queue
2. Click "Approve" button for the test listing
3. Confirm approval (if confirmation dialog exists)
4. Verify success message
5. Logout, navigate to public listings page (map or list)
6. Verify listing is now visible to public users
7. Login as dealer, check notification bell for approval notification

**Expected**:
- Listing status changes from PENDING_REVIEW to LIVE
- `reviewed_at` timestamp is set
- `reviewed_by` is set to admin's user ID
- Listing appears on public map/list
- Dealer receives notification: "Your listing '[Title]' has been approved"
- Notification is unread initially

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 7. Admin Rejects with Reason → Dealer Sees Reason, Can Edit and Resubmit

**Steps**:
1. Create another test listing (or use a different listing)
2. Submit for review as dealer
3. Login as admin, navigate to pending listings
4. Click "Reject" button
5. Enter rejection reason: "Missing property images - please upload at least 3 clear photos"
6. Confirm rejection
7. Logout, login as dealer
8. Check notification for rejection reason
9. Navigate to the rejected listing
10. Edit listing, add required images
11. Resubmit for review

**Expected**:
- Listing status changes from PENDING_REVIEW to DRAFT (or REJECTED)
- `rejection_reason` field is populated
- Dealer receives notification: "Your listing '[Title]' was rejected. Reason: [rejection reason]"
- Dealer can edit the listing
- After editing, dealer can resubmit
- Resubmitted listing status = PENDING_REVIEW
- `submitted_at` timestamp is updated

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 8. User Views Insights Dashboard with Data

**Steps**:
1. Login as regular user (or as dealer/admin)
2. Navigate to `/insights`
3. Verify all 4 panels render:
   - Avg Price by Area (bar chart)
   - Price Trend (line chart)
   - New Listings (list)
   - Recommendations (list)
4. Interact with filters (e.g., select different area for price trend)

**Expected**:
- Insights page loads without errors
- All 4 panels render with data (or show empty state if no data)
- Charts render correctly (bar chart + line chart)
- Filters work (e.g., selecting area updates price trend chart)
- New listings panel shows recent listings (within 7 days by default)

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 9. User Saves Area, Sees Relevant New Listings

**Steps**:
1. As regular user, in the insights page
2. Click "Save Area" button for "Manipal" (or any area)
3. Verify area appears in "Saved Areas" list
4. Verify "New Listings" panel filters to show only listings in saved areas
5. Click "Unsave" button for the area
6. Verify area is removed from saved areas list

**Expected**:
- "Save Area" button toggles to "Unsave"
- Saved area appears in saved areas list
- New listings panel filters to saved areas
- Recommendations panel uses saved areas for suggestions
- Unsaving area removes it from list and updates filters

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 10. Scraped Listings Continue to Work (Full Pipeline Test)

**Steps**:
1. Trigger scraper (via admin endpoint or cron job) to scrape test listings
2. Verify scraped listings appear in admin view
3. Verify scraped listings have status = SCRAPED
4. Verify is_valid = true listings are visible to public users
5. Verify is_valid = false listings are NOT visible to public users
6. Verify existing scraper flow is unaffected by new dealer listing features

**Expected**:
- Scraper runs without errors
- Scraped listings inserted with status = SCRAPED (default)
- `is_valid = true` listings visible on public map
- `is_valid = false` listings NOT visible on public map
- Existing admin pages (Listings, Duplicates, Feed Runs) still work

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

### 11. Existing Admin Pages Still Function Correctly

**Steps**:
1. Login as admin
2. Navigate to `/admin/listings` → verify list loads
3. Navigate to `/admin/duplicates` → verify duplicates load
4. Navigate to `/admin/feed-runs` → verify feed runs load
5. Navigate to `/admin/facebook-groups` → verify groups load
6. Test any critical actions on each page (e.g., mark duplicate, trigger feed run)

**Expected**:
- All admin pages load without errors
- Lists populate with data (or show empty state)
- Critical actions still work (e.g., mark as duplicate, trigger scraper)
- No regressions from Sprint 1 changes

**Actual**: ⬜ Not tested | ✅ Pass | ❌ Fail
**Notes**:

---

## Summary

| Test Case | Status |
|-----------|--------|
| 1. Dealer creates listing → saves as draft | ⬜ |
| 2. Dealer adds address, confirms pin | ⬜ |
| 3. Dealer uploads 3 images | ⬜ |
| 4. Dealer submits → status changes to PENDING_REVIEW | ⬜ |
| 5. Admin sees listing in approval queue | ⬜ |
| 6. Admin approves → listing visible to users, dealer notified | ⬜ |
| 7. Admin rejects with reason → dealer sees reason, can edit and resubmit | ⬜ |
| 8. User views insights dashboard with data | ⬜ |
| 9. User saves area, sees relevant new listings | ⬜ |
| 10. Scraped listings continue to work (full pipeline test) | ⬜ |
| 11. Existing admin pages still function correctly | ⬜ |

**Total**: 0/11 passed

---

## Issues Found

| Issue # | Test Case | Severity | Description | Status |
|---------|-----------|----------|-------------|--------|
| 1 | [Test case #] | [High/Medium/Low] | [Description] | [Open/Fixed/Won't Fix] |

---

## Sign-off

**Tester**: ________________
**Date**: ________________
**Approved for Production**: ⬜ Yes | ⬜ No
**Comments**:

