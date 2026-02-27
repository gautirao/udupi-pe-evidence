# Sprint 9 Plan — User Journey Completion + Production Readiness

**Sprint**: Sprint 9
**Date**: 2026-02-27
**Status**: NOT STARTED
**Focus**: Close last user-journey gaps (booking cancel, delete DRAFT, inline submit, save areas), harden top accessibility findings from S7 review, migrate Auth to React Hook Form, ship Playwright E2E smoke suite.

---

## 0. Sprint Goal

> Both the dealer flow and user flow are end-to-end testable. Dealers can create, manage, submit, and delete listings without workarounds. Users can cancel bookings and save areas. Auth forms use standard patterns. Critical accessibility violations are resolved. A Playwright smoke suite provides CI confidence.

---

## PR Status Tracker

| PR | Name | Priority | Status |
|----|------|----------|--------|
| PR-9.1a | Booking cancel — backend endpoint | P1 | 🔲 Not started |
| PR-9.1b | Booking cancel — frontend UI | P1 | 🔲 Not started |
| PR-9.2 | Delete DRAFT listing (frontend) | P1 | 🔲 Not started |
| PR-9.3 | DealerListings inline submit | P1 | 🔲 Not started |
| PR-9.4 | Save/unsave areas verification + fix | P1 | 🔲 Not started |
| PR-9.5 | Auth.tsx React Hook Form migration | P1 | 🔲 Not started |
| PR-9.6 | AppLayout: a11y + dealer Bookings nav + active state | P1 | 🔲 Not started |
| PR-9.7 | Playwright E2E smoke suite | P2 | 🔲 Not started |
| PR-9.8 | Admin nav overflow + map mobile filter | P2 | 🔲 Not started |
| PR-9.9 | Listing image thumbnails on dealer cards | P2 | 🔲 Not started |

---

## Codebase discoveries (pre-sprint)

- `ViewingRequest.cancelled_by TEXT` — field exists in V15 migration; no cancel endpoint exists yet
- `DELETE /api/listings/{id}` — likely exists (Sprint 7 context shows `deleteListing` in ListingService); verify before PR-9.2
- `DealerListings.tsx` "Submit for Review" button navigates to edit page (PR-8.4 workaround) — inline submit requires knowing `imageCount` and `addressConfirmed` per listing; check if `ListingResponse` includes these fields
- `user_saved_areas` table + `SavedAreas.tsx` component both exist; backend `/api/saved-areas` endpoints status unknown — must verify before PR-9.4
- `Auth.tsx` uses manual state + `try/catch` Zod parse; `text-success` token doesn't exist in design system (should be `text-accent`); no React Hook Form
- `AppLayout.tsx`: `SheetContent` missing `SheetTitle` (WCAG 4.1.2); `dealerNavigation` missing `Bookings` link; active state uses exact-match only

---

## 1. Carry-Forward from Sprint 8

| Item | Source | Severity | Notes |
|------|--------|----------|-------|
| Booking cancellation | MVP spec §1.2 | 🟡 HIGH | `cancelled_by` field ready; no endpoint |
| Delete DRAFT listing | MVP spec §1.2 | 🟡 HIGH | Dealer permission defined; UI missing |
| DealerListings inline submit | S8 PR-8.4 | 🟢 MEDIUM | Current flow navigates to edit page |
| Save/unsave areas completeness | S7 UI review | 🟢 MEDIUM | Component exists; backend status unverified |
| Auth.tsx React Hook Form | S7 UI review | 🟡 HIGH | Non-standard forms; `text-success` token bug |
| AppLayout accessibility | S7 UI review | 🟡 HIGH | Missing SheetTitle; dealer nav incomplete |
| Admin nav overflow | S7 UI review | 🟡 HIGH | 10 admin links overflow at 1024px |
| Map mobile filter | S7 UI review | 🟡 HIGH | Filter panel breaks on small screens |

---

## 2. Sprint 9 PR Breakdown

> Rule: Max 3 files per PR (waived only when called out). Each PR follows the risk-tier pipeline from `.claude/PR_RULES.md`.

---

### PR-9.1a — Booking Cancel: Backend Endpoint (P1)

**Priority**: 🟡 HIGH
**Pipeline**: MEDIUM tier — backend-engineer → code-reviewer

**Problem**: Users cannot cancel a booking they no longer want. `ViewingRequest.cancelled_by` exists but there is no `POST /api/bookings/{id}/cancel` endpoint.

**Files (max 3):**
1. `backend/.../booking/BookingController.java` — add `POST /api/bookings/{id}/cancel`:
   - Auth: requester only (JWT `sub` must match `requester_id`)
   - Allowed when `status = 'REQUESTED'` only (409 if CONFIRMED/COMPLETED/CANCELLED)
   - Sets `status = 'CANCELLED'`, `cancelledBy = 'requester'`, `updatedAt = now()`
   - Returns 200 + updated booking; 403 wrong requester; 409 wrong status; 404 not found
2. `backend/.../booking/BookingService.java` — `cancelBooking(UUID bookingId, UUID requesterId)` with the above validation
3. `backend/src/test/.../booking/BookingControllerTest.java` — add tests:
   - `cancelBooking_validRequested_returns200WithCancelledStatus`
   - `cancelBooking_alreadyConfirmed_returns409`
   - `cancelBooking_wrongRequester_returns403`
   - `cancelBooking_notFound_returns404`

**Acceptance criteria:**
- Requester can cancel a REQUESTED booking → status becomes CANCELLED
- CONFIRMED/COMPLETED/CANCELLED bookings return 409 with clear error
- All 493+ existing tests pass

---

### PR-9.1b — Booking Cancel: Frontend UI (P1)

**Priority**: 🟡 HIGH
**Pipeline**: MEDIUM tier — frontend → code-reviewer
**Depends on**: PR-9.1a merged

**Files (max 2):**
1. `src/pages/MyBookings.tsx` — on REQUESTED booking cards: add "Cancel" button (`variant="outline"` with `text-destructive border-destructive/50`); open a confirm `AlertDialog`; on confirm call `useCancelBooking(bookingId).mutate()`; on success remove card with toast "Booking cancelled"
2. `src/hooks/useBookings.ts` — add `useCancelBooking(bookingId)` mutation: `POST /api/bookings/{id}/cancel`; invalidate `['my-bookings']` on success

**Acceptance criteria:**
- REQUESTED bookings show "Cancel" button; CONFIRMED/COMPLETED do not
- Cancel requires confirmation dialog
- Success removes card and shows toast
- `npm test -- --run` → all tests pass

---

### PR-9.2 — Delete DRAFT Listing (P1)

**Priority**: 🟡 HIGH
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Pre-check**: Before implementing, read `ListingController.java` to confirm `DELETE /api/listings/{id}` exists (expected: yes, from Sprint 7 context). If missing, add it in this PR (counts as 1 of 3 files).

**Files (max 2):**
1. `src/pages/dealer/DealerListings.tsx` — on DRAFT cards only: add "Delete" button (`variant="ghost"` with `text-destructive`); open confirm `AlertDialog` ("This will permanently delete your draft listing."); on confirm call `useDeleteListing(listing.id).mutate()`; on success remove card with toast "Listing deleted"
2. `src/hooks/useDealerListings.ts` — add `useDeleteListing(listingId)` mutation: `DELETE /api/listings/{id}`; invalidate `['dealer-listings']` on success

**Acceptance criteria:**
- Only DRAFT cards show the Delete button
- Confirm dialog required before deletion
- Deleted listing disappears from the list immediately
- `npm test -- --run` → all tests pass

---

### PR-9.3 — DealerListings Inline Submit (P1)

**Priority**: 🟢 MEDIUM (current navigate-to-edit workaround is functional)
**Pipeline**: MEDIUM tier — backend-engineer (if DTO change needed) → frontend → code-reviewer

**Pre-check**: Read `ListingController.java` `ListingResponse` record — does it include `imageCount` (or `images` list) and `addressConfirmed`?

**If `imageCount`/`addressConfirmed` missing from `ListingResponse`:**
Add them to the record (1-line backend change + test update) as a micro-PR before or within this PR.

**Frontend files (max 3):**
1. `src/pages/dealer/DealerListings.tsx` — replace "Submit for Review" navigate-button with:
   - If `listing.addressConfirmed && listing.imageCount >= 3`: active Submit button → calls `useSubmitListing` inline; on success shows toast + refreshes list
   - Else: "Complete & Submit" button → navigates to `/dealer/listings/{id}/edit`; tooltip explains what's missing
2. `src/hooks/useDealerListings.ts` — `useSubmitListing` already added in PR-8.4; no change needed unless DTO update required

**Acceptance criteria:**
- Listings with ≥3 images + confirmed address get a direct Submit button
- Incomplete listings get "Complete & Submit" → edit page
- Successful submit updates card status to PENDING_REVIEW inline
- `npm test -- --run` → all tests pass

---

### PR-9.4 — Save/Unsave Areas: Verify + Fix (P1)

**Priority**: 🟢 MEDIUM
**Pipeline**: LOW tier — qa-fast verification first, then frontend if broken

**Step 1**: Run `qa-fast` agent to verify `SavedAreas.tsx` + backend `/api/saved-areas` endpoints are wired correctly. Check if `GET /api/saved-areas`, `POST /api/saved-areas`, `DELETE /api/saved-areas/{id}` exist and return correct data.

**If already working**: This PR is closed with a "verified complete" commit to the sprint tracker — no code change.

**If broken (missing endpoints or broken hooks):**

**Backend** (if needed):
- `GET /api/saved-areas` — returns caller's saved areas
- `POST /api/saved-areas` — `{ areaKey, areaLabel }` → saves; 409 if duplicate
- `DELETE /api/saved-areas/{id}` — deletes; 403 if wrong owner

**Frontend** (if needed):
- `src/hooks/useSavedAreas.ts` (NEW if missing) — `useSavedAreas()`, `useSaveArea()`, `useUnsaveArea()`
- `src/components/insights/SavedAreas.tsx` — wire hooks if currently using stub data

**Acceptance criteria:**
- User can save an area from the Insights page; it persists on reload
- User can remove a saved area; it disappears
- `npm test -- --run` → all tests pass

---

### PR-9.5 — Auth.tsx React Hook Form Migration (P1)

**Priority**: 🟡 HIGH
**Pipeline**: MEDIUM tier — frontend → code-reviewer

**Problem**: `Auth.tsx` uses manual `useState` + imperative Zod parse. Non-standard, missing field-level blur validation, no `<FormField>`/`<FormMessage>` integration. Also has `text-success` token that doesn't exist (silent no-op).

**Files (max 2):**
1. `src/pages/Auth.tsx` — migrate sign-in and sign-up tabs to `useForm` + `zodResolver`:
   - Extract schemas: `signInSchema` (email, password), `signUpSchema` (email, password, fullName)
   - Replace `useState` for form fields with `register`/`watch`
   - Add `<FormField>`/`<FormMessage>` per field for inline error display
   - `fullName` now validates (non-empty for sign-up)
   - `text-success` → `text-accent` on Features Preview icons
   - Keep existing Supabase auth call logic unchanged
2. `src/lib/schemas/auth.ts` (NEW, optional) — extract Zod schemas if they reduce Auth.tsx length

**Acceptance criteria:**
- Sign-in form shows per-field errors on blur (invalid email, short password)
- Sign-up `fullName` field validates non-empty
- `text-success` runtime warning is gone
- Existing auth behavior unchanged (Supabase calls identical)
- `npm test -- --run` → all tests pass; `npm run build` clean

---

### PR-9.6 — AppLayout: Accessibility + Dealer Nav + Active State (P1)

**Priority**: 🟡 HIGH (WCAG violation; dealer usability gap)
**Pipeline**: LOW tier — frontend → code-reviewer
**Files**: 1 file only (`AppLayout.tsx`)

**Three fixes in one file:**

1. **SheetTitle** (WCAG 4.1.2): Add inside `SheetContent`:
   ```tsx
   <SheetHeader>
     <SheetTitle className="sr-only">Navigation</SheetTitle>
   </SheetHeader>
   ```

2. **Dealer Bookings link**: Add to `dealerNavigation` array:
   ```tsx
   { name: 'Bookings', href: '/dealer/bookings', icon: CalendarCheck2 }
   ```
   (`CalendarCheck2` already imported from Sprint 7 MyBookings work)

3. **Active state prefix matching**: Replace exact-match active detection:
   ```tsx
   // Before:
   location.pathname === item.href
   // After:
   item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href)
   ```

**Acceptance criteria:**
- No WCAG SheetTitle accessibility warning in browser console
- Dealer nav shows "Bookings" link
- Navigating to `/dealer/listings/123/edit` highlights "My Listings" as active
- `AppLayout.test.tsx` passes (update link count if asserted)

---

### PR-9.7 — Playwright E2E Smoke Suite (P2)

**Priority**: 🟢 MEDIUM
**Pipeline**: QA agent only

**Setup**: `npx playwright install` + add `playwright.config.ts` if absent.

**4 spec files (`e2e/`):**

1. `dealer-listing-lifecycle.spec.ts`:
   - Sign in as dealer → create DRAFT listing → verify it appears in DealerListings → click Edit → mock upload 3 images → confirm address → click Submit for Review → expect card status = PENDING_REVIEW

2. `user-browse-and-book.spec.ts`:
   - Visit `/` → map loads with listings → click a listing pin → listing detail page opens → click "Request Viewing" → modal renders → fill form → expect POST to `/api/bookings`

3. `admin-review.spec.ts`:
   - Sign in as admin → navigate to `/admin/listings/review` → expect pending listing → click Approve → listing card disappears from queue

4. `auth.spec.ts`:
   - Visit `/auth` → sign up with test email → expect redirect to onboarding → sign out → sign in → expect redirect to map

**AC:**
- `npx playwright test` passes in 3 consecutive runs (no flakiness)
- Tests use environment variables for test accounts (`E2E_DEALER_EMAIL`, etc.)
- Added to `package.json` scripts: `"test:e2e": "playwright test"`

---

### PR-9.8 — Admin Nav Overflow + Map Mobile Filter (P2)

**Priority**: 🟢 MEDIUM (HIGH from S7 review; deferred due to complexity)
**Pipeline**: MEDIUM tier — frontend → ui-designer review → code-reviewer

**Files (max 2):**

1. `src/components/layout/AppLayout.tsx` — admin desktop nav:
   - Keep primary links (`Map`, `Insights`) in the horizontal bar
   - Move 8 admin-specific links into a `DropdownMenu` labeled "Admin ▾"
   - Mobile sheet layout unchanged

2. `src/pages/Index.tsx` or `src/components/map/MapFilters.tsx` — map mobile filter:
   - Wrap filter panel in shadcn `Sheet side="left"` for `md:` and below
   - Keep inline sidebar for `lg:` and above
   - Add a "Filters" trigger button visible only below `lg:`

**Acceptance criteria:**
- Admin nav bar doesn't overflow at 1024px; all links accessible via dropdown
- Map filter is accessible on 375px screen without pushing the map
- `npm test -- --run` → all tests pass

---

### PR-9.9 — Listing Image Thumbnails on Dealer Cards (P2)

**Priority**: 🔵 LOW
**Pipeline**: LOW tier — frontend → code-reviewer

**Problem**: Dealers see no visual preview of their listing on the DealerListings cards.

**Pre-check**: Does `ListingResponse` (from `GET /api/listings/dealer/mine`) include a `firstImageUrl` or `images` array? If yes, no backend change needed. If no, add `firstImageUrl: String` to `ListingResponse` (1-line backend change in `ListingController`).

**Files (max 2):**
1. `src/pages/dealer/DealerListings.tsx` — add thumbnail at top of each card:
   ```tsx
   {listing.firstImageUrl ? (
     <img src={listing.firstImageUrl} className="w-full h-32 object-cover rounded-t-lg" alt="" />
   ) : (
     <div className="w-full h-32 bg-secondary flex items-center justify-center rounded-t-lg">
       <Building2 className="h-8 w-8 text-muted-foreground/40" />
     </div>
   )}
   ```
2. `backend/.../listing/ListingController.java` — if `firstImageUrl` missing from `ListingResponse`: add it, populated from `imageRepository.findFirstByListingIdOrderByPositionAsc(id)`

**Acceptance criteria:**
- Cards with images show a 128px tall thumbnail
- Cards without images show a building icon placeholder
- `npm test -- --run` → all tests pass

---

## 3. Sequencing

```
Phase 1 — Quick wins (do first, independent):
  PR-9.6 (AppLayout 1-file a11y fix) ────────────────► merge  [frontend, LOW risk]

Phase 2 — UX gaps (parallel where possible):
  PR-9.1a (Booking cancel backend) ──────────────────► merge  [backend]
  PR-9.2  (Delete DRAFT) ────────────────────────────► merge  [frontend]
  PR-9.5  (Auth RHF migration) ──────────────────────► merge  [frontend]

Phase 3 — depends on Phase 2:
  PR-9.1b (Booking cancel frontend) ─────────────────► merge  [frontend, depends on 9.1a]
  PR-9.3  (Inline submit) ───────────────────────────► merge  [frontend, may need backend DTO]
  PR-9.4  (Save areas verify + fix) ─────────────────► merge  [qa-fast → frontend]

Phase 4 — polish + QA:
  PR-9.7  (Playwright E2E suite) ─────────────────────► committed  [qa]
  PR-9.8  (Admin nav + map mobile) ───────────────────► merge  [frontend]
  PR-9.9  (Listing thumbnails) ───────────────────────► merge  [frontend]
```

**Critical path**: PR-9.1a → PR-9.1b. All others are independent.

---

## 4. Open Questions

1. **PR-9.3 DTO**: Does `GET /api/listings/dealer/mine` response include `imageCount` and `addressConfirmed` per listing? Read `ListingController.java` `ListingResponse` record before starting PR-9.3.
2. **PR-9.4 endpoints**: Do `/api/saved-areas` CRUD endpoints exist? Run qa-fast verification before assuming either direction.
3. **PR-9.5 scope**: Full React Hook Form migration (recommended) vs minimal fix (fullName validation + `text-success` → `text-accent` only). Decision affects effort by ~2×.
4. **PR-9.7 E2E accounts**: Are test Supabase accounts provisioned? If not, E2E tests will need to mock auth or use Supabase local emulator.
5. **PR-9.1 dealer cancel**: Should dealers also be able to cancel a CONFIRMED booking (not just REQUESTED)? MVP spec §2.3 doesn't mention dealer cancellation — confirm before implementing.

---

## 5. Risk Assessment

| PR | Risk | Notes |
|----|------|-------|
| 9.1a | LOW | Small service method; well-defined state machine |
| 9.1b | LOW | Pure UI; mutation follows existing patterns |
| 9.2 | LOW | Delete with confirm guard; verify backend endpoint first |
| 9.3 | MEDIUM | DTO change may be needed; inline submit changes DealerListings behavior |
| 9.4 | LOW–HIGH | Low if endpoints exist; high if full backend implementation needed |
| 9.5 | MEDIUM | Form refactor touches auth critical path; test coverage essential |
| 9.6 | LOW | 1 file, 3 small changes; AppLayout tests may need count update |
| 9.7 | MEDIUM | E2E tests require test accounts; environment setup may block |
| 9.8 | MEDIUM | AppLayout dropdown + Leaflet layout refactor |
| 9.9 | LOW | Additive only; may need 1-line backend DTO change |

---

## 6. Testing Mandate

Every PR must:
- Pass `npm run lint && npx tsc --noEmit && npm test -- --run` (frontend PRs)
- Pass `cd backend && mvn test` with 0 failures (backend PRs)
- Add or update at least 1 meaningful test
- Include "What could break?" in the implementation report

---

## 7. Not in Sprint 9 (deferred)

| Item | Reason |
|------|--------|
| Razorpay webhook integration | Real payment provider setup needed |
| Email / SMS notifications | In-app only per spec §4.1 |
| Google / Facebook OAuth | No user demand yet |
| `@Transactional` service extraction | No user impact |
| Real-time WebSocket updates | Polling sufficient for MVP |
| Dark mode | Non-goal for MVP |
| Image moderation | Manual admin review sufficient |
| Listing expiry / auto-archive | Not in MVP spec |
| NavLinks inner component hoist | Low-impact refactor |
| Marker cluster flicker fix | Perf improvement; Sprint 10 |
| Dealer verification / KYC | Admin manually promotes — no self-serve |

---

## 8. PR Summary Table

| PR | Type | Priority | Backend | Frontend | Pipeline |
|----|------|----------|---------|----------|----------|
| 9.1a | Feature | 🟡 HIGH | ✅ | ❌ | MEDIUM |
| 9.1b | Feature | 🟡 HIGH | ❌ | ✅ | MEDIUM |
| 9.2 | Feature | 🟡 HIGH | ❌ (verify) | ✅ | MEDIUM |
| 9.3 | Feature | 🟢 MEDIUM | ✅ (if DTO) | ✅ | MEDIUM |
| 9.4 | Feature | 🟢 MEDIUM | ✅ (if missing) | ✅ (if broken) | LOW→MEDIUM |
| 9.5 | Refactor | 🟡 HIGH | ❌ | ✅ | MEDIUM |
| 9.6 | Fix | 🟡 HIGH | ❌ | ✅ (1 file) | LOW |
| 9.7 | Tests | 🟢 MEDIUM | ❌ | ✅ | QA only |
| 9.8 | Feature | 🟢 MEDIUM | ❌ | ✅ | MEDIUM |
| 9.9 | Feature | 🔵 LOW | ✅ (if DTO) | ✅ | LOW |

---

*Sprint 9 plan authored 2026-02-27. Based on Sprint 8 checkpoint, UI_DESIGN_REVIEW_S7.md findings, and MVP_SPEC.md carry-forward items.*
