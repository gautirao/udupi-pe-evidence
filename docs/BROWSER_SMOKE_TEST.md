# Browser Smoke Test Checklist — Udupi Property Explorer

**Version**: Sprint 4 (post Sprint 3 PRs: PR-1..PR-4 + HOT-5)
**Target environment**: Production
**Estimated time**: 8–10 minutes (full run) / 3–4 minutes (Quick 5-step smoke)
**Last updated**: 2026-02-18

---

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://udupi-property-explorer.pages.dev |
| Backend health | https://udupi-property-explorer.onrender.com/actuator/health |

---

## Prerequisites

Before starting, confirm the following accounts exist and credentials are known. Do NOT record real credentials in this document — use your own secure notes.

| Account | Role | Placeholder |
|---------|------|-------------|
| Test dealer | `dealer` | `<DEALER_EMAIL>` / `<DEALER_PASSWORD>` |
| Test admin | `admin` | `<ADMIN_EMAIL>` / `<ADMIN_PASSWORD>` |
| Test user | `user` | `<USER_EMAIL>` / `<USER_PASSWORD>` |

Also confirm:
- [ ] Browser DevTools is available (Chrome or Firefox recommended)
- [ ] DevTools Network tab is open and recording before each flow
- [ ] DevTools Console tab is visible alongside Network tab
- [ ] At least one existing approved (LIVE) listing exists in the database for map/insights checks

---

## Result Key

Use these markers to record outcomes inline:

| Marker | Meaning |
|--------|---------|
| PASS | Step behaved exactly as expected |
| FAIL | Step did not behave as expected — record actual result |
| WARN | Step partially worked or showed a non-blocking anomaly |

---

## Quick 5-Step Smoke (Fastest Sanity Check)

Run this first. If all 5 pass, the app is up and not catastrophically broken.

| # | Role | Action | Expected | Result |
|---|------|--------|----------|--------|
| Q1 | ANY | Open https://udupi-property-explorer.pages.dev in a fresh private/incognito window | Page loads (no blank screen, no JS error banner). Home tab visible. | PASS / FAIL / WARN |
| Q2 | ANY | Without logging in, navigate to https://udupi-property-explorer.pages.dev/dealer/new-listing | Redirected to login page. The protected URL is not accessible. | PASS / FAIL / WARN |
| Q3 | ANY | Log in with `<USER_EMAIL>` / `<USER_PASSWORD>` | Login succeeds. User is redirected back to the app. No error toast. | PASS / FAIL / WARN |
| Q4 | ANY | Open DevTools Console. Navigate through Home, Map, and Insights tabs. | Zero red CORS errors in Console. Zero failed network requests labeled "CORS" in Network tab. | PASS / FAIL / WARN |
| Q5 | ANY | Open DevTools Console and run: `fetch('https://udupi-property-explorer.onrender.com/api/ingestion/ingest-posts', {method:'POST', headers:{'Content-Type':'application/json'}, body:'[]'}).then(r => console.log('STATUS:', r.status))` | Console prints `STATUS: 401`. Backend rejects the unauthenticated ingestion request. | PASS / FAIL / WARN |

If any Quick step fails, stop and treat it as a P0 incident before continuing.

---

## Section A — App Load and Core Navigation

**Role**: ANY (no login required for these steps)

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| A1 | Open https://udupi-property-explorer.pages.dev in a fresh private window | Page loads. No blank screen. No uncaught JS exceptions visible in Console. Page title is visible. | PASS / FAIL / WARN | |
| A2 | Verify main navigation tabs | At minimum, three navigation items are visible: Home (or Listings), Map, and Insights. Exact labels may vary — check that all three are present and clickable. | PASS / FAIL / WARN | |
| A3 | Click the Map tab | Map renders. OpenStreetMap tile layer loads (map tiles visible, not blank grey boxes). No console errors. | PASS / FAIL / WARN | |
| A4 | Click the Insights tab | Insights page begins to load. No console error about a missing lazy chunk. No CORS error in Network tab for requests to the backend `/api/insights/*` endpoints. | PASS / FAIL / WARN | |
| A5 | Click the Home (or Listings) tab | Listings page loads. Listing cards or an empty state message is shown. No spinner stuck indefinitely. | PASS / FAIL / WARN | |

---

## Section B — Authentication

**Role**: ANY

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| B1 | While logged out, navigate to https://udupi-property-explorer.pages.dev/dealer/new-listing | App redirects to the login page. The listing creation form is not shown. URL in address bar changes to login route. | PASS / FAIL / WARN | |
| B2 | While logged out, navigate to https://udupi-property-explorer.pages.dev/admin/pending-listings | App redirects to the login page. Admin UI is not shown. | PASS / FAIL / WARN | |
| B3 | On the login page, enter an invalid email (e.g., `invalid@example.com`) and an incorrect password, then submit | Error message is shown (e.g., "Invalid login credentials" or similar). No crash. No redirect to the app interior. | PASS / FAIL / WARN | |
| B4 | Log in with `<DEALER_EMAIL>` / `<DEALER_PASSWORD>` | Login succeeds. User is redirected into the app (not back to login). Dealer-specific navigation items (e.g., "My Listings", "New Listing") are visible. | PASS / FAIL / WARN | |
| B5 | After logging in as dealer, click the logout button | Session is cleared. User is redirected to the login page or the public home page. | PASS / FAIL / WARN | |
| B6 | After logout, attempt to navigate directly to https://udupi-property-explorer.pages.dev/dealer/new-listing | Redirected to login. The protected route does not render without a valid session. | PASS / FAIL / WARN | |

---

## Section C — Listings (Dealer Create and Submit / Admin Approve / Admin Reject)

Complete steps C1–C7 in one browser session. Have one browser window open as dealer, keep a second window ready to log in as admin.

### C1–C4: Dealer creates and submits a draft

| # | Role | Action | Expected | Result | Notes |
|---|------|--------|----------|--------|-------|
| C1 | DEALER | Log in as `<DEALER_EMAIL>`. Navigate to the "New Listing" page (e.g., `/dealer/new-listing`). | New listing form is shown with empty fields. No console errors. | PASS / FAIL / WARN | |
| C2 | DEALER | Fill in the required fields for a `land` listing: Title (any text), Price (e.g., 500000), Property Type = land, Locality (e.g., Manipal), Land Area (e.g., 10), Land Area Unit (e.g., cent). Save as draft. | Draft is saved. A success toast or redirect to an edit/detail page for the draft occurs. Listing appears in the dealer's "My Listings" list with status DRAFT. | PASS / FAIL / WARN | |
| C3 | DEALER | On the draft listing, use the address/location section to search for "Manipal, Udupi", confirm the map pin, and click "Confirm location" (or equivalent). | `address_confirmed` is set. Confirmation feedback is shown (button state change, toast, or label). | PASS / FAIL / WARN | |
| C4 | DEALER | Upload 3 images (JPEG or PNG, under 5 MB each) to the draft listing. Then click "Submit for Review". | After 3 images are uploaded, submit is enabled. After clicking submit, listing status changes to PENDING_REVIEW. Dealer can no longer freely edit the listing. | PASS / FAIL / WARN | |

### C5–C6: Admin approves

| # | Role | Action | Expected | Result | Notes |
|---|------|--------|----------|--------|-------|
| C5 | ADMIN | In the admin browser window, log in as `<ADMIN_EMAIL>`. Navigate to the pending listings queue (e.g., `/admin/pending-listings`). | The listing submitted in step C4 is visible in the queue with status PENDING_REVIEW. Approve and Reject buttons are present. | PASS / FAIL / WARN | |
| C6 | ADMIN | Click "Approve" on the listing. Confirm if a dialog appears. | Listing status changes to LIVE. Success feedback shown. The listing is no longer in the PENDING_REVIEW queue. | PASS / FAIL / WARN | |

### C7: Dealer reject path (can use a second test listing or re-use one that has already been approved and will be re-submitted)

| # | Role | Action | Expected | Result | Notes |
|---|------|--------|----------|--------|-------|
| C7 | DEALER + ADMIN | Create a second draft listing (repeat C1–C4 for a minimal listing). As admin, instead of approving, click "Reject" and enter a rejection reason (e.g., "Insufficient images"). Confirm rejection. Then log back in as dealer and check the listing. | Listing status changes to REJECTED. Dealer sees the rejection reason in the listing detail or notification. Dealer can edit the listing again. After editing and resubmitting, status returns to PENDING_REVIEW. | PASS / FAIL / WARN | |

---

## Section D — Saved Areas

**Role**: USER (or DEALER — any authenticated role)

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| D1 | Log in as `<USER_EMAIL>`. Navigate to the Insights page (or Saved Areas UI). Click "Add Area" and add an area (e.g., "Manipal"). | Area is saved. It appears in the Saved Areas list. Insights filters update to include this area. | PASS / FAIL / WARN | |
| D2 | Without removing the area from D1, attempt to add the same area again (same area_key). | App shows an error (e.g., "Area already saved" toast) or the backend returns a 409 Conflict. The duplicate is not added to the list. | PASS / FAIL / WARN | |
| D3 | Delete the saved area added in D1. | Area is removed from the list. Insights filters update (area no longer included). Success feedback shown. | PASS / FAIL / WARN | |
| D4 | If more than 5 saved areas exist for this test account: verify that pagination controls (Next, Previous, page numbers) appear and function. | Pagination navigates between pages of saved areas without errors. Each page shows the correct subset of areas. | PASS / FAIL / WARN | If fewer than 5 areas exist, mark as N/A and note it. |

---

## Section E — Insights Page

**Role**: ANY (logged in)

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| E1 | Open DevTools Network tab. Navigate to the Insights tab. | The lazy JavaScript chunk for Insights loads without a network error. No `ERR_CHUNK_LOAD_FAILED` or similar error in Console. | PASS / FAIL / WARN | |
| E2 | On the Insights page, verify charts render. | At minimum one chart (bar chart for avg price by area, or line chart for price trend) renders with visible data or a meaningful empty state. No blank white boxes where charts should be. | PASS / FAIL / WARN | |
| E3 | In DevTools Network tab, filter by XHR/Fetch. Inspect requests to `udupi-property-explorer.onrender.com/api/insights/*`. | All requests return HTTP 200 (or 304). No request shows a CORS error (red text, "CORS" label, or `Access-Control-Allow-Origin` missing in response headers). | PASS / FAIL / WARN | |
| E4 | In DevTools Console, confirm zero red CORS errors are present after full page load and chart render. | Console is clean. Any warnings present are pre-existing (e.g., React key warnings) and not CORS-related. | PASS / FAIL / WARN | |

---

## Section F — Notifications

**Role**: ADMIN (to trigger) + DEALER (to receive)

This section verifies the AFTER_COMMIT notification guarantee from PR-2: the listing approval itself must succeed even if notification delivery is delayed.

| # | Role | Action | Expected | Result | Notes |
|---|------|--------|----------|--------|-------|
| F1 | ADMIN | Approve a listing that was submitted by `<DEALER_EMAIL>` (use the listing from C6, or create and submit another one). | Approval succeeds immediately. Admin sees a success confirmation. The listing is now LIVE. This result must be confirmed before checking whether the notification arrived — approval and notification are decoupled (AFTER_COMMIT). | PASS / FAIL / WARN | |
| F2 | DEALER | Log in as `<DEALER_EMAIL>`. Check the notification bell or notifications panel. | A notification is present: "Your listing '[Title]' has been approved and is now live." It may take a few seconds to appear if the AFTER_COMMIT hook runs asynchronously. Wait up to 10 seconds before marking FAIL. | PASS / FAIL / WARN | |
| F3 | DEALER | Click on the notification. | Notification is marked as read. Notification count badge decrements (or disappears if it was the only unread notification). | PASS / FAIL / WARN | |
| F4 | ANY | Confirm: even if step F2 showed no notification (delayed delivery), the listing approved in F1 is still LIVE and visible on the public map or listings page. | Listing is visible publicly regardless of notification delivery status. Approval is not blocked by notification failure. | PASS / FAIL / WARN | Critical: this verifies the AFTER_COMMIT decoupling from PR-2. |

---

## Section G — Security Checks

**Role**: ANY

These steps verify the security contracts established in Sprint 3 PRs.

### G1 — Ingestion endpoint rejects unauthenticated requests (PR-1)

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| G1 | Open DevTools Console on any page (logged in or out). Run the following command exactly as written: `fetch('https://udupi-property-explorer.onrender.com/api/ingestion/ingest-posts', {method:'POST', headers:{'Content-Type':'application/json'}, body:'[]'}).then(r => console.log('STATUS:', r.status))` | Console prints `STATUS: 401`. The backend rejects the request because no `X-Ingestion-Api-Key` header was provided. A 200 response here is a P0 security failure. | PASS / FAIL / WARN | |

### G2 — Logout clears session and blocks protected routes

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| G2 | While logged in as any user, click the logout button. Then in the same tab, attempt to navigate to `/dealer/new-listing` or `/admin/pending-listings`. | Redirected to the login page. No protected content is rendered. Browser does not retain a usable auth cookie or token that bypasses the redirect. | PASS / FAIL / WARN | |

### G3 — CORS: no red CORS errors on any page

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| G3 | With DevTools Network tab open, navigate through Home, Map, Insights, and (if accessible) any admin page. Look in the Network tab for any request shown in red with a CORS-related failure. Also check Console for `Access to fetch at ... has been blocked by CORS policy`. | Zero CORS errors on any page. All requests to `udupi-property-explorer.onrender.com` succeed with correct `Access-Control-Allow-Origin: https://udupi-property-explorer.pages.dev` response header. | PASS / FAIL / WARN | HOT-5 fixed CORS for `Accept` and `DNT` headers. If you see CORS errors specifically on `/api/insights/*`, check that the backend is running commit `f1aab23` or later. |

---

## Section H — Logout (Full Verification)

**Role**: ANY (logged in)

| # | Action | Expected | Result | Notes |
|---|--------|----------|--------|-------|
| H1 | Log in with any test account. Confirm you are inside the app (not on the login page). | Login confirmed. | PASS / FAIL / WARN | |
| H2 | Click the logout button or menu item. | User is redirected to the login page or public home page. Auth token is cleared from browser storage (verify in DevTools Application tab → Local Storage / Session Storage: no Supabase auth token visible). | PASS / FAIL / WARN | |
| H3 | Without logging in again, attempt to navigate to https://udupi-property-explorer.pages.dev/dealer/new-listing | Redirected to login. Session is truly cleared. | PASS / FAIL / WARN | |

---

## Summary Scorecard

Fill this in after completing all sections.

| Section | Steps | Pass | Fail | Warn |
|---------|-------|------|------|------|
| Quick 5-step smoke | 5 | | | |
| A — App Load and Navigation | 5 | | | |
| B — Authentication | 6 | | | |
| C — Listings (create/submit/approve/reject) | 7 | | | |
| D — Saved Areas | 4 | | | |
| E — Insights | 4 | | | |
| F — Notifications | 4 | | | |
| G — Security | 3 | | | |
| H — Logout | 3 | | | |
| **Total** | **41** | | | |

**Sign-off**

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Environment | Production / Staging / Local |
| Commit on main at time of test | (run `git rev-parse --short HEAD`) |
| Go / No-Go | GO / NO-GO |
| Blocking issues found | |

---

## Known Non-Blocking Warnings (Do Not Fail On These)

The following are pre-existing, accepted conditions as of Sprint 4. Do not mark a step FAIL for these alone.

| Warning | Source | Action |
|---------|--------|--------|
| 5 npm audit vulnerabilities (low severity) | Sprint 3 baseline | Monitor. Not high/critical. Run `npm audit` for details. |
| ESLint `no-explicit-any` in `AddressPicker.tsx`, `PropertyMap.tsx` | Sprint 3 baseline | Tracked for Sprint 5. |
| ESLint empty interfaces in `ui/` shadcn components | Generated code | Accept as-is. |
| 7 Docker-gated integration tests skipped in backend test suite | Pre-existing | Not a regression. Docker not available in CI. |

---

## Re-run Reference

To re-run the automated smoke test (non-browser) that gates production deployments:

```
./scripts/smoke_test.sh --prod
```

This script covers: backend health, frontend availability, CORS preflight, unauthenticated API 401, and ingestion endpoint security. It does NOT cover browser-interactive flows (auth UI, form submission, chart rendering) — those require this manual checklist.
