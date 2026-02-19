# Sprint 5 — User Journey + Roles + Booking + Insights Monetization + Navigation

**Sprint**: Sprint 5
**Date**: 2026-02-19
**Status**: DRAFT — awaiting architect + security-reviewer sign-off
**Author**: team-lead

---

## 0. Current State Audit (inputs to this spec)

### What exists today (Sprint 4 baseline)

| Area | Current State | Gap |
|------|---------------|-----|
| Navigation | 2 links: "Map", "Insights" | Missing: Saved Areas, Profile, Dealer nav, logged-out CTA |
| Auth context | `userRole: 'admin' \| 'user' \| null` | No `dealer` in context; no capability fields |
| Onboarding | None — straight to map after signup | No role selection, no first-run screen |
| Dealer section | 1 page: `NewListing` draft creation | No listing management, no edit page, no dashboard |
| Booking system | Not implemented — phone contact only | No ViewingRequest entity, controller, or UI |
| Insights access | All insights free for any auth user | No paywall, no time-pass, no subscription check |
| Payment | Not implemented — zero stubs | No checkout endpoint, no webhook, no plan model |

### What exists and is kept

- Listing lifecycle: SCRAPED → DRAFT → PENDING_REVIEW → LIVE | REJECTED ✅
- Roles in DB: `admin`, `user`, `dealer` (V7 migration, `has_role()` helper) ✅
- Saved areas: CRUD working, drives insights filtering ✅
- Notifications: `listing_approved`, `listing_rejected` (AFTER_COMMIT, async) ✅
- Ingestion pipeline: Chrome extension → raw_posts → AI → SCRAPED listing ✅

---

## 1. Personas

### Persona A — Browser / Prospective Buyer

**Who**: Someone looking to buy or invest in Udupi property. Not yet a dealer.
**Goal**: Discover listings, understand market prices, track areas they care about.
**Pain point today**: Nav is nearly empty; Insights page is hidden behind "you have to find it"; no upgrade prompt.

### Persona B — Dealer / Property Owner / Agent

**Who**: Someone who owns or manages properties and wants to list them.
**Goal**: Create listings, get approved, receive viewing requests, manage bookings.
**Pain point today**: Only one page (`/dealer/listings/new`); can't see their listings; can't receive bookings; onboarding doesn't set dealer role.

---

## 2. User Journeys

### 2A — Browser User Journey

```
[Landing / Map]
    │
    ▼
[Browse listings on map] ── (click listing) ──► [Listing Detail]
    │                                                   │
    │                                          [Phone contact → P.O.C.]
    │                                          [Request Viewing → auth wall if logged out]
    │
[Sign Up / Sign In] ← (triggered by: save area, request viewing, access insights)
    │
    ▼
[Choose intent at first run]
    ├── "I'm looking to buy/invest" → role stays 'user', redirect to map
    └── "I want to list a property" → initiate dealer setup → redirect to /dealer/setup
    │
    ▼ (user path)
[Map with auth] → [Save area from map] → [Insights] → [Saved Areas visible in Insights]
    │
    ▼
[Insights — free trial] (3 days from signup, or first 3 days of access)
    │
    ├── Trial active: Full insights visible + "Trial ends in N days" banner
    └── Trial expired: Paywall screen with upgrade CTA
                            │
                            ▼
                    [Upgrade / Buy Time-Pass]
                       (stubbed for Sprint 5 — shows "Coming Soon" or Razorpay stub)
```

**Acceptance criteria — Persona A:**
- AC-A1: Logged-out user can browse map and listing detail without auth
- AC-A2: "Request Viewing" on listing detail prompts login if not authenticated
- AC-A3: After signup, user sees a first-run choice screen (Browse vs List)
- AC-A4: Saving an area from the map requires login
- AC-A5: Insights shows trial status banner (days remaining or expired)
- AC-A6: After trial expiry, insights charts are replaced with a paywall card; saved areas list remains visible
- AC-A7: Nav shows: Map, Saved Areas, Insights, Notifications (bell), Profile — when logged in as user

---

### 2B — Dealer / Owner User Journey

```
[Sign Up]
    │
    ▼
[First-run intent: "I want to list a property"]
    │
    ▼
[Dealer Setup page /dealer/setup]
  • Confirm full name
  • Phone number (for contact on listings)
  • Accept terms
  • "Become a Dealer" CTA → backend assigns 'dealer' role
    │
    ▼
[Dealer Dashboard /dealer/dashboard]
  • My Listings (status counts)
  • Pending booking requests (count badge)
  • Quick link: New Listing
    │
    ├── [New Listing /dealer/listings/new] → [Draft saved] → [Edit Listing /dealer/listings/:id/edit]
    │         → Upload images → Set location → Submit for review → PENDING_REVIEW
    │
    ├── [My Listings /dealer/listings] → filter by status, view each listing
    │
    └── [Viewing Requests /dealer/bookings]
              • Incoming requests: date, time, requester name
              • Confirm / Decline actions
              • Confirmed → shows in user's Upcoming Viewings
```

**Acceptance criteria — Persona B:**
- AC-B1: Dealer setup page requires auth; submitting sets `dealer` role in `user_roles`
- AC-B2: After setup, `AuthContext.userRole` reflects `dealer`; dealer nav links appear
- AC-B3: `/dealer/listings` shows all dealer's listings with status badges
- AC-B4: Listing edit page (`/dealer/listings/:id/edit`) is accessible and functional
- AC-B5: "Request Viewing" on a LIVE listing creates a ViewingRequest with status REQUESTED
- AC-B6: Dealer can CONFIRM or DECLINE a REQUESTED viewing
- AC-B7: User can CANCEL a REQUESTED or CONFIRMED viewing
- AC-B8: Dealer receives in-app notification on new viewing request
- AC-B9: Nav shows dealer-specific links when role is dealer

---

## 3. Screen List + Route Map

### New / Updated Routes

| Route | Component | Auth | Role | New? |
|-------|-----------|------|------|------|
| `/` | `Index` (map) | public | any | existing |
| `/listing/:id` | `ListingDetail` | public | any | update: add "Request Viewing" |
| `/auth` | `Auth` | public | anon | existing |
| `/onboarding` | `Onboarding` | required | any | **NEW** |
| `/insights` | `Insights` | required | any | update: add trial/paywall |
| `/account` | `Account` | required | any | **NEW** |
| `/account/viewings` | `MyViewings` | required | any | **NEW** |
| `/dealer/setup` | `DealerSetup` | required | user only | **NEW** |
| `/dealer/dashboard` | `DealerDashboard` | required | dealer | **NEW** |
| `/dealer/listings` | `DealerListings` | required | dealer | **NEW** |
| `/dealer/listings/new` | `NewListing` | required | dealer | existing |
| `/dealer/listings/:id/edit` | `EditListing` | required | dealer | **NEW** |
| `/dealer/bookings` | `DealerBookings` | required | dealer | **NEW** |
| (admin routes) | (unchanged) | required | admin | existing |

Total new routes: 7
Total updated routes: 2
Existing unchanged: 7+ admin routes

---

## 4. Navigation Map (by auth state + role)

### Logged out

```
[Logo/Home]   [Browse/Map]   [Login]   [Sign up]
```

### Logged in — role: user

```
[Logo]   [Map]   [Saved Areas]   [Insights]   [🔔 Notifications]   [👤 Profile ▾]
                                                                         └─ My Viewings
                                                                         └─ Sign Out
```

### Logged in — role: dealer

```
[Logo]   [Map]   [Saved Areas]   [Insights]   [🔔 Notifications]   [👤 Profile ▾]
                                                                         └─ My Viewings
                                                                         └─ Sign Out
[Dealer]   [My Listings]   [New Listing]   [Booking Requests 🔴N]
```

### Logged in — role: admin

```
[Logo]   [Map]   [Saved Areas]   [Insights]   [🔔 Notifications]   [👤 Profile ▾]
[Feed Runs]   [FB Groups]   [Manual Posts]   [Process Posts]
[Listings]   [Pending Approval]   [Duplicates]   [Chrome Extension]
```

### Active-state rules

- Current route's nav item is highlighted
- "Booking Requests" badge shows unread count (same polling pattern as notifications)
- Dealer links are hidden (not just disabled) from users without dealer role

---

## 5. Capability Model

### Decision: Role-centric with `insightsAccessUntil` field

Rather than a full capability table (too complex for Sprint 5 scope), we use:

1. **Role** (`user_roles.role`): `user | dealer | admin` — already exists
2. **insightsAccessUntil** (`user_profiles.insights_access_until: TIMESTAMPTZ`): controls insights gating

**Why not a full capability table?**
- Adds migration + service complexity that is not yet paid off by any real use case
- A single `insightsAccessUntil` field handles trial + paid access uniformly
- Easy to extend in Sprint 6 to a `user_capabilities` table when payment is real

**Capability derivation in frontend (`AuthContext`):**

```typescript
// Derived from user profile row (fetched after auth)
interface UserCapabilities {
  canList: boolean;                     // role === 'dealer' || role === 'admin'
  insightsAccessUntil: Date | null;     // null = no access; Date in future = active
  insightsTrial: boolean;               // active AND within 3-day signup window
}
```

**Backend enforcement:**
- `GET /api/insights/*` checks `insights_access_until >= NOW()` for the calling user
- If expired/null: returns HTTP 402 Payment Required (or 403 Forbidden — decision below)
- HTTP 402 is semantically correct and distinguishes from auth failure (401)

**Trial window:**
- On first signup: `insights_access_until = NOW() + INTERVAL '3 days'` (set by trigger or by `/api/account/register` endpoint)
- After expiry: NULL (or past date) — gated
- After upgrade (stub): set to `NOW() + INTERVAL '30 days'` (or whatever the purchased tier grants)

---

## 6. Booking State Machine

```
                    REQUESTED
                   /          \
              CONFIRMED      DECLINED (dealer action)
             /        \
        COMPLETED   CANCELLED (user or dealer)
```

**State transitions:**

| From | To | Actor | Trigger |
|------|-----|-------|---------|
| — | REQUESTED | User | POST /api/bookings |
| REQUESTED | CONFIRMED | Dealer | PUT /api/bookings/:id/confirm |
| REQUESTED | DECLINED | Dealer | PUT /api/bookings/:id/decline |
| REQUESTED | CANCELLED | User | PUT /api/bookings/:id/cancel |
| CONFIRMED | CANCELLED | User or Dealer | PUT /api/bookings/:id/cancel |
| CONFIRMED | COMPLETED | System (scheduled) | viewing date has passed |

**Rules:**
- A user cannot have two REQUESTED or CONFIRMED bookings for the same listing
- A dealer cannot CONFIRM a time slot that overlaps with another CONFIRMED booking for the same listing
- Cancellation by dealer automatically re-opens the slot
- COMPLETED transition: scheduled job runs daily, marks confirmed bookings where `requested_date < NOW() - 24h`

**ViewingRequest entity (new table: `viewing_requests`):**

```sql
CREATE TABLE public.viewing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  dealer_id UUID NOT NULL,                    -- denormalized for fast dealer queries
  requested_date DATE NOT NULL,
  requested_time_slot TEXT NOT NULL,           -- e.g., "10:00-11:00", "14:00-15:00"
  status TEXT NOT NULL DEFAULT 'REQUESTED',    -- REQUESTED | CONFIRMED | DECLINED | CANCELLED | COMPLETED
  requester_message TEXT,                      -- optional note from buyer
  decline_reason TEXT,                         -- optional note from dealer on decline
  cancelled_by TEXT,                           -- 'user' | 'dealer'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate active bookings per user per listing
CREATE UNIQUE INDEX idx_one_active_booking_per_user_listing
  ON viewing_requests (listing_id, requester_id)
  WHERE status IN ('REQUESTED', 'CONFIRMED');
```

---

## 7. Insights Time-Pass Model

### Model: `insightsAccessUntil` timestamp on user profile

**Chosen over credits because:**
- Simpler to implement (1 field, not a ledger)
- Simpler to test (is `NOW() < insightsAccessUntil`?)
- Simpler to display (show expiry date to user)
- Credits require deduction logic, race conditions, and audit trail — over-engineered for Sprint 5

### Access tiers (Sprint 5)

| Tier | Access | Source |
|------|--------|--------|
| Trial | 3 days from signup | Trigger on `auth.users` insert |
| Paid (stub) | 30 days from purchase | POST /api/payments/insights-pass (stubbed) |
| Expired | No access | insights_access_until IS NULL or < NOW() |

### Backend enforcement

```java
// InsightsController — before each insights handler:
@GetMapping("/avg-price-by-area")
public ResponseEntity<?> getAvgPriceByArea(Authentication auth) {
    UUID userId = extractUserId(auth);
    if (!insightsService.hasInsightsAccess(userId)) {
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
               .body(new InsightsGatedResponse("TRIAL_EXPIRED", null));
    }
    // ... existing logic
}
```

### Frontend gating

```
Insights page:
  if (insightsAccessUntil === null || insightsAccessUntil < now):
    → Show PaywallCard component
    → Saved Areas list still visible (not gated)
    → Charts replaced with blurred/locked overlay + upgrade CTA
  else if (daysRemaining <= 3):
    → Show TrialBanner: "Your trial ends in N day(s)"
  else:
    → Full access, no banner
```

### Payment stub (Sprint 5 scope)

- **Endpoint**: `POST /api/payments/insights-pass` (stubbed — immediately grants 30 days)
- **Real payment**: Razorpay integration deferred to Sprint 6
- **Webhook contract** (defined now, not implemented):
  ```
  POST /api/payments/webhook/razorpay
  Body: { event: "payment.captured", payload: { order_id, user_id, plan: "insights-30d" } }
  Action: UPDATE user_profiles SET insights_access_until = NOW() + INTERVAL '30 days' WHERE id = user_id
  ```

### Migration needed

```sql
-- V14: Add insights_access_until to user_profiles (or create if not exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS insights_access_until TIMESTAMPTZ;

-- Set trial for all existing users (retroactive)
UPDATE public.profiles
  SET insights_access_until = created_at + INTERVAL '3 days'
  WHERE insights_access_until IS NULL;

-- Trigger: set trial on new user profile creation
CREATE OR REPLACE FUNCTION set_insights_trial()
RETURNS TRIGGER AS $$
BEGIN
  NEW.insights_access_until = NOW() + INTERVAL '3 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_set_trial
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_insights_trial();
```

---

## 8. Acceptance Criteria Summary

| ID | Phase | Criterion | Testable? |
|----|-------|-----------|-----------|
| AC-A1 | Phase 1 | Logged-out user sees Map, Browse, Login/Sign up in nav | Unit test |
| AC-A2 | Phase 1 | Logged-in user nav includes Saved Areas, Insights, Notifications | Unit test |
| AC-A3 | Phase 1 | Dealer nav includes My Listings, New Listing, Booking Requests | Unit test |
| AC-A4 | Phase 2 | First-run screen shown on first login (choose intent) | E2E smoke |
| AC-A5 | Phase 2 | Choosing "list property" initiates dealer setup; role becomes dealer | Integration test |
| AC-A6 | Phase 4 | Trial countdown banner shown when insights access within 3 days | Unit test |
| AC-A7 | Phase 4 | Insights charts locked when trial expired; upgrade CTA visible | Unit test |
| AC-A8 | Phase 4 | GET /api/insights/* returns 402 when user has no valid access | Backend test |
| AC-B1 | Phase 3 | POST /api/bookings creates ViewingRequest with status REQUESTED | Backend test |
| AC-B2 | Phase 3 | Duplicate active booking for same listing+user → 409 Conflict | Backend test |
| AC-B3 | Phase 3 | Dealer PUT /confirm changes status to CONFIRMED | Backend test |
| AC-B4 | Phase 3 | User PUT /cancel changes status to CANCELLED from any non-terminal state | Backend test |
| AC-B5 | Phase 3 | Dealer receives notification on new viewing request | Backend test |
| AC-B6 | Phase 3 | Frontend: "Request Viewing" modal on listing detail | Manual QA |
| AC-B7 | Phase 3 | Frontend: Dealer dashboard shows incoming requests with confirm/decline | Manual QA |
| AC-B8 | Phase 5 | Smoke test covers: nav links by role, trial banner, booking request flow | Playwright |
| AC-B9 | Phase 6 | Sentry captures at least one event in staging with requestId | Manual verification |

---

## 9. PR Breakdown (implementation order)

> Rule: Max 3 files per PR. Each PR follows qa-fast preflight → implement → qa tests → reviewers.

### PR-1 — Navigation / IA (Phase 1)
**Goal**: Fix discoverability. Expand nav from 2 links to role-aware navigation.

**Files (3):**
1. `src/contexts/AuthContext.tsx` — add `isDealer: boolean` derived field; fetch profile row for `insightsAccessUntil`
2. `src/components/layout/AppLayout.tsx` — replace hardcoded 2-link nav with role-aware nav; add Saved Areas, Profile menu, Dealer section
3. `src/components/layout/__tests__/AppLayout.test.tsx` — NEW: nav rendering tests per auth state

**Reviewers**: code-reviewer, qa
**Security-reviewer**: not required (no auth logic, no payment)

---

### PR-2 — Dealer Setup + Role Assignment (Phase 2)
**Goal**: Onboarding path so users can self-assign dealer role.

**Files (3):**
1. `src/pages/dealer/DealerSetup.tsx` — NEW: onboarding form + POST /api/dealer/setup call
2. `src/pages/Onboarding.tsx` — NEW: first-run intent screen (Buy vs List)
3. `backend/...DealerSetupController.java` — NEW: POST /api/dealer/setup assigns dealer role

**Reviewers**: security-reviewer (role assignment), code-reviewer
**Migration**: V14 (separate from Flyway, added in backend PR)

---

### PR-3 — Booking Backend (Phase 3a)
**Goal**: ViewingRequest entity, migration, endpoints.

**Files (3):**
1. `backend/.../booking/ViewingRequest.java` — NEW entity
2. `backend/.../booking/BookingController.java` — NEW controller (create, confirm, decline, cancel, list)
3. `backend/src/main/resources/db/migration/V15__create_viewing_requests.sql` — NEW migration

**Reviewers**: security-reviewer (booking ownership scoping), backend-engineer QA
**Note**: Migration file counts as 1 of 3 files

---

### PR-4 — Booking Frontend (Phase 3b)
**Goal**: Request viewing UI on listing detail; dealer booking management.

**Files (3):**
1. `src/pages/listing/RequestViewingModal.tsx` — NEW component
2. `src/pages/dealer/DealerBookings.tsx` — NEW page
3. `src/hooks/useBookings.ts` — NEW hooks (useCreateBooking, useDealerBookings, useConfirmBooking)

**Reviewers**: code-reviewer, qa-fast
**Depends on**: PR-3 merged

---

### PR-5 — Insights Time-Pass Backend (Phase 4a)
**Goal**: `insightsAccessUntil` gating in backend; payment stub.

**Files (3):**
1. `backend/src/main/resources/db/migration/V14__add_insights_access.sql` — alter profiles, trigger
2. `backend/.../insights/InsightsController.java` — update: add access check before each handler
3. `backend/.../insights/InsightsService.java` — add `hasInsightsAccess(UUID userId)` + stub payment grant

**Reviewers**: security-reviewer (paywall bypass risk), backend-engineer QA

---

### PR-6 — Insights Time-Pass Frontend (Phase 4b)
**Goal**: Paywall UI, trial banner, upgrade CTA.

**Files (3):**
1. `src/pages/Insights.tsx` — update: conditional render based on `insightsAccessUntil`
2. `src/components/insights/PaywallCard.tsx` — NEW: locked overlay + upgrade CTA
3. `src/components/insights/TrialBanner.tsx` — NEW: "N days remaining" banner

**Reviewers**: code-reviewer, qa-fast
**Depends on**: PR-5 merged

---

### PR-7 — Smoke Tests Update (Phase 5)
**Goal**: Update BROWSER_SMOKE_TEST.md + add Playwright tests for new journeys.

**Files (3):**
1. `docs/BROWSER_SMOKE_TEST.md` — add: nav links by persona, onboarding, booking, paywall
2. `e2e/quick-smoke.spec.ts` — add: Q6 (nav links by role), Q7 (booking request creates 409 on dupe)
3. `e2e/dealer-smoke.spec.ts` — NEW: dealer journey smoke (setup → listing → booking request)

**Reviewers**: qa
**Depends on**: PR-1 through PR-4 merged

---

### PR-8 — Observability Verification (Phase 6)
**Goal**: Confirm Sentry staging event + log correlation.

**Files (1–2):**
1. `backend/.../config/SentryTestController.java` — staging-only endpoint that throws a test error (profile-gated)
2. `docs/OBSERVABILITY_VERIFICATION.md` — document how to trigger + verify

**Reviewers**: security-reviewer (ensure staging gate cannot be triggered in prod)

---

## 10. Sequencing + Parallelism

```
Week 1:
  PR-1 (Nav) ──────────────────────────────► merge
  PR-2 (Dealer Setup) ─────────────────────► merge
  PR-3 (Booking Backend) ──────────────────► merge

Week 2 (after PR-1, PR-3 merge):
  PR-4 (Booking Frontend) ─────────────────► merge
  PR-5 (Insights Backend) ─────────────────► merge

Week 3 (after PR-5 merge):
  PR-6 (Insights Frontend) ────────────────► merge
  PR-7 (Smoke Tests) ──────────────────────► merge
  PR-8 (Observability) ────────────────────► merge
```

**Critical path**: PR-1 → PR-4 (nav must land before booking frontend to avoid conflicting AppLayout edits)

---

## 11. Open Questions for Architect Review

1. **insightsAccessUntil location**: `profiles` table (Supabase) vs separate `user_capabilities` Spring-managed table. Supabase profiles are currently not read by the Spring backend — does this change the preferred location?
2. **Dealer role assignment**: Should `/api/dealer/setup` use a privileged service account to `INSERT INTO user_roles`, or should this be done via an RLS-enabled Supabase call from the frontend? Guidance from ARCHITECTURE.md is that all business logic lives in Spring Boot — recommending Spring Boot approach with a service-account DB connection.
3. **Booking time slot representation**: Text slot (`"10:00-11:00"`) vs start/end timestamps. Text is simpler; timestamps are more queryable. Leaning text for Sprint 5 since no overlap-detection query is planned yet (conflict prevention is approximate).
4. **402 vs 403 for expired insights**: HTTP 402 (`Payment Required`) is semantically correct but unusual. HTTP 403 is more common. Frontend can distinguish via response body (`reason: "TRIAL_EXPIRED"`). Team preference?
5. **Notification on booking**: Which notification type — add `viewing_requested`, `viewing_confirmed`, `viewing_declined`, `viewing_cancelled` to the notification type enum? Or use a generic `booking_update` type with metadata?

## 12. Open Questions for Security-Reviewer

1. **Role escalation**: POST `/api/dealer/setup` sets a new role. Must validate: (a) user is authenticated, (b) user does not already have `dealer` or `admin` role, (c) no input from the request body can influence which role is granted. Review needed.
2. **Booking ownership scoping**: All booking mutations must verify: requester is the authenticated user (for user-side operations) OR listing.createdBy matches authenticated user (for dealer-side operations). No cross-user mutation allowed.
3. **Insights paywall bypass**: Can a user with an expired trial set `insights_access_until` via Supabase direct API? RLS policy on `profiles` must prevent users from updating `insights_access_until` directly. Only the backend service can update this field.
4. **Payment stub**: Even stubbed, the `POST /api/payments/insights-pass` endpoint must be authenticated and not callable anonymously. If it immediately grants 30 days, it must be rate-limited per user.
5. **COMPLETED transition job**: The scheduled job that marks bookings as COMPLETED must run under a background service context, not as a user request — no user-facing privilege escalation.
