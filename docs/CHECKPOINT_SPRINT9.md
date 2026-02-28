# Sprint 9 Checkpoint — User Journey Completion + Production Readiness

**Written**: 2026-02-28 (mid-sprint, rate-limit pause)
**Status**: IN PROGRESS — 6 of 10 PRs done
**To resume**: see "Resume prompt" at the bottom of this doc.

---

## Sprint 9 State Summary

All commits on `main` (in order):
| Commit | PR | What |
|--------|----|------|
| `c61a64e` | 9.6 | AppLayout: SheetTitle sr-only + dealer Bookings nav + startsWith active state |
| `cb24d6d` | 9.2 | Delete DRAFT listing: useDeleteListing hook + AlertDialog in DealerListings |
| `dd042e2` | 9.1a | POST /api/bookings/{id}/cancel backend (requester + dealer paths, 498 tests) |
| `dcd8504` | 9.5 + 9.1b | Auth RHF migration (schemas/auth.ts + Auth.tsx) + MyBookings/DealerBookings cancel AlertDialogs (96 tests) |
| `a6d7762` | 9.3 backend | imageCount added to ListingResponse DTO (500 tests) |

Backend: **500 tests, 0 failures**. Frontend: **96 tests, 0 failures**.

---

## Sprint 9 Goals — Updated Checklist

**Dealer flow completeness checklist**:
- [ ] Inline submit from DealerListings — backend DTO done; **frontend TODO (PR-9.3)**
- [x] Dealer can cancel/delete a DRAFT listing (PR-9.2 ✅)
- [ ] Dealer sees image thumbnails on their listing cards (PR-9.9, P2)
- [x] Create DRAFT → upload images → confirm address → submit → admin review → LIVE/REJECTED (pre-built Sprint 8)

**User flow completeness checklist**:
- [x] User can cancel their own REQUESTED booking (PR-9.1a + 9.1b ✅)
- [ ] Save/unsave areas in Insights — **TODO (PR-9.4)**
- [x] Browse map → listing detail → request viewing (pre-built Sprint 8)
- [x] Insights paywall: trial → purchase → access (Sprint 7)

**Production readiness checklist**:
- [x] Auth forms use React Hook Form (PR-9.5 ✅)
- [x] Mobile Sheet has accessible SheetTitle (PR-9.6 ✅)
- [x] Dealer nav has "Bookings" link (PR-9.6 ✅)
- [ ] Admin nav overflow fixed (PR-9.8, P2)
- [ ] E2E smoke test suite (PR-9.7, P2)

---

## Remaining PRs (in priority order)

### Next up — PR-9.3 frontend (1 file, unblocked)
`src/pages/dealer/DealerListings.tsx` only.
`imageCount` and `addressConfirmed` are now in `ListingResponse`.
`useSubmitListing` mutation already exists in `useDealerListings.ts`.

Logic:
- `listing.addressConfirmed && listing.imageCount >= 3` → "Submit for Review" button (variant="default") → calls `useSubmitListing().mutate(listing.id)` → toast "Submitted for review"
- Otherwise → "Complete & Submit" (variant="outline") → navigate to edit page + hint text (what's missing)

### PR-9.4 — Save/Unsave Areas (qa-fast verification first)
Run qa-fast against `src/components/insights/SavedAreas.tsx` + backend `/api/saved-areas` endpoints.
If broken: add `useSavedAreas.ts` hook + wire UI.

### PR-9.7 — Playwright E2E smoke suite (P2)
4 spec files in `e2e/`: dealer-listing-lifecycle, user-browse-and-book, admin-review, auth.
Use environment variables for test accounts.

### PR-9.8 — Admin nav overflow + map mobile filter (P2)
AppLayout.tsx: move 8 admin links into "Admin ▾" DropdownMenu.
MapFilters.tsx or Index.tsx: wrap filter in Sheet for mobile.

### PR-9.9 — Listing image thumbnails on dealer cards (P2)
DealerListings.tsx: show `firstImageUrl` thumbnail or building icon placeholder.
Check if `ListingResponse` has `firstImageUrl` — if not, 1-line backend addition.

---

## Resume Prompt

```
Resume Sprint 9 from docs/CHECKPOINT_SPRINT9.md.

State: 6 PRs done (9.6, 9.2, 9.1a, 9.5, 9.1b, 9.3-backend).
Backend: 500 tests. Frontend: 96 tests. Both on `main`.

Execute in this order (no TeamCreate):
1. PR-9.3 frontend (DealerListings inline submit) — frontend agent, 1 file (DealerListings.tsx):
   - imageCount + addressConfirmed now in ListingResponse
   - useSubmitListing already exists in useDealerListings.ts
   - If eligible (addressConfirmed && imageCount >= 3): inline Submit button
   - Else: "Complete & Submit" → navigate to edit page with hint

2. PR-9.4 (Save areas) — qa-fast first to verify, then frontend if broken

3. PR-9.7 (Playwright E2E) — qa agent

4. PR-9.8 (Admin nav + map mobile) — frontend agent (2 files)

5. PR-9.9 (Listing thumbnails) — frontend agent (1–2 files)
```

---

*Checkpoint written 2026-02-28. Rate limit hit after 5 PRs shipped.*
