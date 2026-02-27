# Sprint 9 Checkpoint — User Journey Completion + Production Readiness

**Written**: 2026-02-27 (end of Sprint 8 session)
**Status**: PLANNING — not started
**To resume**: see "First command + prompt" at the bottom of this doc.

---

## Sprint 8 State Summary

All commits on `main`:
| Commit | PR | What |
|--------|----|------|
| `08d86f0` | 8.1 | DealerBookings isError + badge colors + hover tokens + py-6 |
| `59d123f` | 8.2 | RequestViewingModal loader/error + ListingDetail badges + NewListing payload |
| `2b93d6b` | 8.4 | useSubmitListing + ImageUploader/AddressPicker in EditListing + DealerListings Submit button |
| Pre-built | 8.3–11 | Image API, submit, admin review (PendingListings), notifications, NotificationBell |

Backend: **493 tests, 0 failures**. Frontend: **91 tests, 0 failures**.

---

## Sprint 9 Goals

> **Theme**: Close the last user journey gaps so both the dealer flow and the user flow are end-to-end testable. Harden the three highest-severity UI/accessibility findings from the S7 design review. Ship an E2E smoke suite.

**Dealer flow completeness checklist** (after Sprint 9):
- [ ] Create DRAFT → upload images → confirm address → submit → admin review → LIVE/REJECTED → dealer notified
- [ ] Dealer can cancel/delete a DRAFT listing
- [ ] Inline submit from DealerListings (not navigate-to-edit workaround)
- [ ] Dealer sees image thumbnails on their listing cards

**User flow completeness checklist** (after Sprint 9):
- [ ] Browse map → listing detail → request viewing (authenticated gate)
- [ ] User can cancel their own REQUESTED booking
- [ ] Save/unsave areas in Insights (verify complete, or fix if broken)
- [ ] Insights paywall: trial → purchase → access (SPA-safe, already fixed S7)

**Production readiness checklist** (after Sprint 9):
- [ ] Auth forms use React Hook Form (removes non-standard pattern)
- [ ] Admin nav overflow fixed (10 links overflow at 1024px)
- [ ] Mobile Sheet has accessible SheetTitle
- [ ] Dealer nav has "Bookings" link
- [ ] E2E smoke test suite (Playwright) covering critical paths

---

## PR Breakdown

### PR-9.1 — Booking Cancellation: User Cancel Own Request (P1, backend + frontend)
**Owner**: backend-engineer → frontend
**Why**: `ViewingRequest.cancelled_by` field exists (V15 migration) but no cancel endpoint or UI exists. Users have no way to cancel a booking they no longer want.

**Backend** (`backend-engineer`):
- `POST /api/bookings/{id}/cancel` — requester-only; status must be `REQUESTED` (not yet confirmed); sets `status = 'CANCELLED'`, `cancelled_by = 'requester'`
- 403 if wrong requester; 409 if already CONFIRMED/COMPLETED/CANCELLED
- Test: cancel_validRequested_returns200, cancel_alreadyConfirmed_returns409, cancel_wrongRequester_returns403

**Frontend** (`frontend`):
- `MyBookings.tsx` — add "Cancel" button on REQUESTED bookings; confirm dialog; calls cancel endpoint; removes from list on success
- `useBookings.ts` — add `useCancelBooking()` mutation

**Pipeline**: MEDIUM — backend-engineer → frontend → code-reviewer
**Files**: BookingController.java (1 endpoint), BookingService.java, BookingControllerTest.java (existing), MyBookings.tsx, useBookings.ts
**AC**: Requester can cancel REQUESTED bookings. CONFIRMED bookings show no cancel button. All existing tests pass.

---

### PR-9.2 — Delete DRAFT Listing (P1, frontend only — backend likely exists)
**Owner**: frontend
**Why**: MVP spec §1.2 says dealers can delete own DRAFT listings. `DELETE /api/listings/{id}` likely exists (ListingController has `deleteListing` in Sprint 7 context). DealerListings has no delete button.

**Before implementing**: Verify `DELETE /api/listings/{id}` exists by reading `ListingController.java` lines 1–50.

**Frontend**:
- `DealerListings.tsx` — add "Delete" button on DRAFT cards only; destructive confirm dialog; calls `DELETE /api/listings/{id}`; removes card on success
- `useDealerListings.ts` — add `useDeleteListing()` mutation

**Pipeline**: MEDIUM — frontend → code-reviewer
**Files**: DealerListings.tsx, useDealerListings.ts (+ test update)
**AC**: DRAFT cards have delete button with confirm dialog. Non-DRAFT cards do not. Deleted listing disappears from list.

---

### PR-9.3 — DealerListings Inline Submit (P1, frontend only)
**Owner**: frontend
**Why**: Current "Submit for Review" button navigates to edit page (PR-8.4 workaround). Direct inline submit is better UX when the listing is already ready.

**Approach**:
- Fetch image count + addressConfirmed per listing on the DealerListings page (either from the listing object if already included, or via a batch endpoint)
- If `listing.addressConfirmed && listing.imageCount >= 3`: show active "Submit for Review" button that calls `POST /api/listings/{id}/submit` inline
- Otherwise: show "Complete listing" button → navigate to edit page

**Check first**: Does `ListingResponse` from `GET /api/listings/dealer/mine` include `imageCount` and `addressConfirmed`? If not, the backend needs a 1-field addition to the response DTO.

**Pipeline**: MEDIUM — frontend (or backend-engineer if DTO change needed) → code-reviewer
**Files**: DealerListings.tsx, useDealerListings.ts, ListingController.java (if DTO change)

---

### PR-9.4 — Save/Unsave Areas Flow Verification (P1, frontend)
**Owner**: frontend (or qa-fast to verify first)
**Why**: `user_saved_areas` table exists (V9), `SavedAreas.tsx` component exists, but it's unclear if the add/remove area flow is complete end-to-end.

**Before implementing**: Run the `qa-fast` agent to verify the SavedAreas component against the backend `/api/saved-areas` endpoints (check if endpoints exist).

**If broken**: Add missing mutation hooks (`useSaveArea`, `useUnsaveArea`) in a new `useSavedAreas.ts` hook and wire to the UI.

**Pipeline**: LOW tier (read-only verification first) — qa-fast → frontend → code-reviewer

---

### PR-9.5 — Auth.tsx React Hook Form Migration (P1, frontend)
**Owner**: frontend
**Why**: Highest-leverage maintainability fix from S7 review. Auth forms use manual state + Zod parse — non-standard, missing field-level validation, missing blur validation. Also fixes `text-success` token (doesn't exist — should be `text-accent`).

**Files (max 3)**:
1. `src/pages/Auth.tsx` — migrate to `useForm` + `zodResolver`; field-level error display via `<FormField>`/`<FormMessage>`; fix `text-success` → `text-accent`
2. Auth test file (update mocks if any)
3. Any shared auth validation schema (extract to `src/lib/schemas/auth.ts` if worth it)

**Pipeline**: MEDIUM — frontend → code-reviewer
**AC**: Sign-in and sign-up forms show per-field errors on blur. `fullName` validates. `text-success` compile error gone. All 91+ tests pass.

---

### PR-9.6 — Nav Accessibility + Dealer Nav Bookings Link (P1, frontend)
**Owner**: frontend
**Why**: THREE findings from S7 review combined (all in AppLayout.tsx):
  1. Mobile `Sheet` missing `SheetTitle` → WCAG 4.1.2 failure
  2. Dealer nav missing `Bookings` link (dealers can't navigate to `/dealer/bookings` from nav)
  3. Active state uses exact match → nested routes not highlighted

**Files (max 1)**: `src/components/layout/AppLayout.tsx` only
- Add `<SheetTitle className="sr-only">Navigation</SheetTitle>` inside `SheetContent`
- Add `{ name: 'Bookings', href: '/dealer/bookings', icon: CalendarCheck2 }` to `dealerNavigation`
- Fix active state: `item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)`

**Pipeline**: LOW tier — frontend → code-reviewer
**AC**: No WCAG SheetTitle warning. Dealer sees "Bookings" in nav. `/dealer/listings/123/edit` highlights "My Listings". All tests pass.

---

### PR-9.7 — E2E Smoke Test Suite (P2, qa)
**Owner**: qa
**Why**: No E2E tests exist. Critical paths need smoke coverage for CI confidence.

**Scope** (Playwright, `e2e/` directory):
- `dealer-listing-lifecycle.spec.ts`: create DRAFT → upload image → submit → expect PENDING_REVIEW status
- `user-browse-and-book.spec.ts`: map loads → open listing → request viewing modal renders
- `admin-review.spec.ts`: admin approves listing → dealer sees notification
- `auth.spec.ts`: sign-up → sign-in → role redirect

**Pipeline**: QA agent only
**AC**: `npx playwright test` passes in CI. Tests use test accounts / mock data. No flakiness on 3 consecutive runs.

---

### PR-9.8 — Admin Nav Overflow + Map Mobile Filter (P2, frontend)
**Owner**: frontend (or ui-designer to spec first)
**Why**: Two remaining HIGH findings from S7 review:
  1. Admin desktop nav overflows at 1024px (10 links in horizontal bar)
  2. Map filter panel breaks on mobile (288px sidebar pushes map to zero width)

**Files (max 3)**:
1. `src/components/layout/AppLayout.tsx` — move 8 admin-specific links into `DropdownMenu` labeled "Admin" for desktop; keep primary `Map`/`Insights` inline
2. `src/components/map/MapFilters.tsx` or `src/pages/Index.tsx` — wrap filter panel in shadcn `Sheet` for `md:` and below (design system §15)

**Pipeline**: MEDIUM — frontend → ui-designer review → code-reviewer
**AC**: Admin nav does not overflow at 1024px. Map filter is accessible on 375px mobile. All tests pass.

---

### PR-9.9 — Listing Images in DealerListings Cards (P2, frontend)
**Owner**: frontend
**Why**: Dealers see no thumbnail of their listings on the cards; image upload was added in S8 but the card UI wasn't updated.

**Files (max 2)**:
1. `src/pages/dealer/DealerListings.tsx` — show first image thumbnail (if exists) on each card; fall back to a placeholder icon if no images
2. `src/hooks/useDealerListings.ts` — confirm `ListingResponse` includes `firstImageUrl` or equivalent; if not, backend DTO needs updating (separate mini-PR)

**Pipeline**: LOW — frontend → code-reviewer

---

## Sequencing

```
Phase 1 — UX gaps (can run in parallel):
  PR-9.1  (Booking cancel) backend ─────────────────► merge [backend]
  PR-9.2  (Delete DRAFT)   ────────────────────────► merge [frontend]
  PR-9.6  (Nav a11y + dealer bookings link) ────────► merge [frontend, 1 file]

Phase 2 — depends on Phase 1 or independent:
  PR-9.1 frontend ──────────────────────────────────► merge [frontend, depends on 9.1 backend]
  PR-9.3 (Inline submit) ──────────────────────────► merge [frontend/backend]
  PR-9.4 (Save areas verify) ──────────────────────► merge [frontend]
  PR-9.5 (Auth RHF) ───────────────────────────────► merge [frontend]

Phase 3 — polish + QA:
  PR-9.7  (E2E smoke suite) ───────────────────────► committed [qa]
  PR-9.8  (Admin nav + map mobile) ────────────────► merge [frontend]
  PR-9.9  (Listing thumbnails) ────────────────────► merge [frontend]
```

PR-9.6 is 1 file, ~10 lines — do it first (zero risk, immediate nav fix).

---

## Decisions Needed (max 5)

1. **PR-9.3 DTO change**: Does `GET /api/listings/dealer/mine` return `imageCount` and `addressConfirmed` per listing? If not, should we add them (1-line backend change) or derive inline submit eligibility differently?

2. **E2E framework**: Use Playwright (recommended — already works with Vite) or extend existing Vitest tests with `@testing-library/user-event` for integration? Playwright needs `npx playwright install`.

3. **PR-9.5 scope**: Full React Hook Form migration of Auth.tsx (medium effort, ~100 lines rewritten) or minimal fix (add fullName validation + fix `text-success` token only, ~10 lines)? Full migration is cleaner but larger diff.

4. **PR-9.4 (Save areas)**: Should this be a verification-only task (qa-fast checks it works) or a full implementation task? Need to know if the backend `/api/saved-areas` endpoints exist.

5. **Sprint 9 priority order**: If time is limited, which P1 should be cut? Suggested cut: PR-9.3 (inline submit) — navigate-to-edit is functional even if not ideal.

---

## Out of Scope (Sprint 9)

| Item | Reason |
|------|--------|
| Razorpay webhook | Real payment provider setup needed |
| Image moderation | Manual admin review sufficient |
| Email/SMS notifications | In-app only per spec |
| Dark mode | Non-goal for MVP |
| Listing expiry/auto-archive | Not in MVP spec |
| `@Transactional` service extraction | No user impact |
| Real-time WebSocket updates | Polling sufficient for MVP |
| Google/Facebook OAuth | No user demand |
| NavLinks inner component hoist | Low-impact refactor; Sprint 10 |
| Marker cluster flicker fix | Perf improvement; Sprint 10 |

---

## Resume Instructions

### First command (verify state)
```bash
cd /Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer
git log --oneline -8
cd backend && mvn test -q 2>&1 | tail -3
```

### First prompt to resume execution
```
Resume Sprint 9 from docs/CHECKPOINT_SPRINT9.md.

Before starting: answer decision 1 (DTO) and decision 3 (Auth scope):
- For PR-9.3: read ListingController.java to check if imageCount/addressConfirmed are in the dealer listing response DTO. If yes, proceed. If no, add them as a backend micro-PR first.
- For PR-9.5: do the FULL React Hook Form migration (not the minimal fix).

Then execute in this order (no TeamCreate — call agents directly):
1. PR-9.6 (AppLayout nav fixes) — frontend agent, 1 file, do first, fastest win
2. PR-9.1 backend (booking cancel) + PR-9.2 (delete DRAFT) in parallel
3. PR-9.1 frontend after backend lands
4. PR-9.5 (Auth RHF migration)
5. Remaining PRs as capacity allows.
```

---

*Checkpoint written 2026-02-27. Backend 493 tests passing. Frontend 91 tests passing.*
