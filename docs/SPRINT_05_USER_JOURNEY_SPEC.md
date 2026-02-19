# Sprint 5 — User Journey + Roles + Booking + Insights Monetization + Navigation

**Sprint**: Sprint 5
**Date**: 2026-02-19
**Status**: ✅ APPROVED — architect + security reviews complete. PR-1 and PR-2 are GO. PR-3 and PR-5 are GO after spec amendments below.
**Author**: team-lead

---

## 0. Current State Audit (inputs to this spec)

### What exists today (Sprint 4 baseline)

| Area | Current State | Gap |
|------|---------------|-----|
| Navigation | 2 links: "Map", "Insights" | Missing: Saved Areas, Profile, Dealer nav, logged-out CTA |
| Auth context | `userRole: 'admin' \| 'user' \| null` | No `dealer` in context; no `insightsAccessUntil` field |
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

### Persona B — Dealer / Property Owner / Agent

**Who**: Someone who owns or manages properties and wants to list them.
**Goal**: Create listings, get approved, receive viewing requests, manage bookings.

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
                       (stubbed for Sprint 5 — shows "Coming Soon" or payment stub)
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
  • Phone number (for contact on listings) — validated server-side
  • Accept terms (required)
  • "Become a Dealer" CTA → backend assigns 'dealer' role (server-side constant)
    │
    ▼
[Dealer Dashboard /dealer/dashboard]
  • My Listings (status counts)
  • Pending booking requests (count badge)
  • Quick link: New Listing
    │
    ├── [New Listing /dealer/listings/new] → [Draft] → [Edit /dealer/listings/:id/edit]
    │         → Upload images → Set location → Submit → PENDING_REVIEW
    │
    ├── [My Listings /dealer/listings] → filter by status
    │
    └── [Viewing Requests /dealer/bookings]
              • Incoming requests: date, time, requester name
              • Confirm / Decline actions
```

**Acceptance criteria — Persona B:**
- AC-B1: Dealer setup requires auth; submitting sets `dealer` role server-side
- AC-B2: After setup, `AuthContext.userRole` reflects `dealer`; dealer nav links appear
- AC-B3: `/dealer/listings` shows all dealer's listings with status badges
- AC-B4: "Request Viewing" on a LIVE listing creates a ViewingRequest with status REQUESTED
- AC-B5: Dealer can CONFIRM or DECLINE a REQUESTED viewing
- AC-B6: User can CANCEL a REQUESTED or CONFIRMED viewing
- AC-B7: Dealer receives in-app notification on new viewing request
- AC-B8: Nav shows dealer-specific links when role is dealer

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

### Decision: Role-centric with `insightsAccessUntil` on `profiles`

1. **Role** (`user_roles.role`): `user | dealer | admin` — already exists
2. **insightsAccessUntil** (`profiles.insights_access_until: TIMESTAMPTZ`): controls insights gating

**Why `profiles` table (architect-confirmed):**
- Backend does not currently read from `profiles`, but will add a native query (`findInsightsAccessUntil`) using the same JDBC service-account connection that already bypasses RLS.
- Frontend reads it via the existing Supabase client for display-only purposes (showing days remaining in the banner). Enforcement is done exclusively in the backend.
- This is a documented tech debt (frontend bypasses backend for auth-related display reads — pre-existing pattern in `AuthContext.tsx`). Will be resolved in a future sprint via `/api/account/me` endpoint.

**`AuthContext` additions (PR-1):**

```typescript
// Expanded AppRole type
type AppRole = 'admin' | 'user' | 'dealer';

// Additional context fields
interface AuthContextType {
  // existing...
  isDealer: boolean;                        // userRole === 'dealer'
  insightsAccessUntil: Date | null;         // from profiles row
}
```

**Backend enforcement:**
- `GET /api/insights/*` checks `insights_access_until >= NOW()` via native query on `profiles`
- If expired/null: returns HTTP **403 Forbidden** (not 402 — see architect decision in §11)
- Response body: `{"error": "INSIGHTS_ACCESS_EXPIRED", "expiresAt": "...", "upgradePath": "/api/payments/insights-pass"}`

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
| CONFIRMED | COMPLETED | System (@Scheduled only) | viewing date passed + 24h |

**Server-side ownership rules (security-reviewer mandated — CRITICAL):**

| Endpoint | Server-Side Derivation | Ownership Check |
|---|---|---|
| `POST /api/bookings` | `requester_id = JWT.sub`; `dealer_id = listing.created_by` (never from body) | Reject if `requester_id == dealer_id` (cannot book own listing); listing must be LIVE |
| `PUT /api/bookings/:id/confirm` | Load booking; verify `dealer_id == JWT.sub` | Return 404 if no match (not 403 — avoids leaking existence) |
| `PUT /api/bookings/:id/decline` | Load booking; verify `dealer_id == JWT.sub` | Return 404 if no match |
| `PUT /api/bookings/:id/cancel` | Load booking | `requester_id == JWT.sub` → cancel from REQUESTED or CONFIRMED; `dealer_id == JWT.sub` → cancel from CONFIRMED only; set `cancelled_by` server-side; 404 if neither match |
| `GET /api/bookings/mine` | Filter by `requester_id = JWT.sub` | Never accept `userId` param |
| `GET /api/bookings/dealer` | Verify dealer role; filter `dealer_id = JWT.sub` | `resolveCallerOrForbid` pattern (same as `ListingController`) |

**Input validation rules:**
- `requested_time_slot`: regex `^\d{2}:\d{2}-\d{2}:\d{2}$`; allowlist of valid slots
- `requested_date`: must be a future date, not more than 90 days out
- `requester_message` and `decline_reason`: max 500 characters; no HTML
- `requested_date` and `requested_time_slot` from request body only; `requester_id` and `dealer_id` always server-side

**ViewingRequest entity (new table: `viewing_requests`):**

```sql
CREATE TABLE public.viewing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  dealer_id UUID NOT NULL,                    -- denormalized; set from listing.created_by server-side
  requested_date DATE NOT NULL,
  requested_time_slot TEXT NOT NULL,           -- format: "HH:MM-HH:MM"
  status TEXT NOT NULL DEFAULT 'REQUESTED',    -- REQUESTED | CONFIRMED | DECLINED | CANCELLED | COMPLETED
  requester_message TEXT,                      -- optional; max 500 chars
  decline_reason TEXT,                         -- dealer note; max 500 chars
  cancelled_by TEXT,                           -- 'user' | 'dealer'; set server-side
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate active bookings per user per listing
CREATE UNIQUE INDEX idx_one_active_booking_per_user_listing
  ON viewing_requests (listing_id, requester_id)
  WHERE status IN ('REQUESTED', 'CONFIRMED');

-- Performance indexes
CREATE INDEX idx_viewing_requests_dealer_id ON viewing_requests (dealer_id, status);
CREATE INDEX idx_viewing_requests_requester_id ON viewing_requests (requester_id, status);

-- RLS (MANDATORY — security-reviewer requirement)
ALTER TABLE public.viewing_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings"
    ON public.viewing_requests FOR SELECT
    TO authenticated
    USING (requester_id = auth.uid() OR dealer_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE by users — all mutations through backend service account
CREATE POLICY "Admins can manage all bookings"
    ON public.viewing_requests FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));
```

---

## 7. Insights Time-Pass Model

### Model: `insightsAccessUntil` timestamp on `profiles`

**Trial window:** 3 days from signup (set by BEFORE INSERT trigger on `profiles`).

### V14 Migration (complete DDL including security hardening)

```sql
-- V14: Add insights_access_until to profiles with trial trigger + RLS hardening
-- SECURITY: The existing UPDATE policy on profiles allows unrestricted column updates.
-- This migration REPLACES it with a column-restricted policy to prevent users from
-- setting insights_access_until to an arbitrary future date via the Supabase REST API.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS insights_access_until TIMESTAMPTZ;

-- Retroactive trial for existing users (grace period: 3 days from now)
UPDATE public.profiles
  SET insights_access_until = NOW() + INTERVAL '3 days'
  WHERE insights_access_until IS NULL;

-- Trigger: set trial on new user profile creation
-- SECURITY DEFINER required for trigger context; this function must not be called directly.
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

-- RLS HARDENING: Replace the unrestricted UPDATE policy with a column-restricted one.
-- The backend service-account connection (JDBC DataSource) bypasses RLS and can still
-- update insights_access_until for payment grants.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update own profile display fields"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        -- Prevent modification of insights_access_until by the user directly
        AND (insights_access_until IS NOT DISTINCT FROM (
            SELECT insights_access_until FROM public.profiles WHERE user_id = auth.uid()
        ))
    );
```

### Payment stub (Sprint 5 scope)

**Endpoint**: `POST /api/payments/insights-pass`

**Security controls (security-reviewer mandated):**
- Authentication required (enforced by Spring Security)
- Controlled by feature flag: `payments.stub.enabled` (default `false` in production; must be explicitly set in dev/staging)
- Idempotency: reject with 409 if `insights_access_until > NOW()`
- Per-user rate limit: 1 successful grant per 30-day period
- Audit log every call: `userId`, `timestamp`, `previousExpiry`, `newExpiry`
- Grant duration (30 days) is a server-side constant — never taken from request body
- Returns new `insights_access_until` only; no internal state

**Webhook contract (defined now, implemented Sprint 6):**
```
POST /api/payments/webhook/razorpay
Body: { event: "payment.captured", payload: { order_id, user_id, plan: "insights-30d" } }
Action: UPDATE profiles SET insights_access_until = NOW() + INTERVAL '30 days' WHERE user_id = :userId
```

### Frontend gating

```
Insights page:
  if (insightsAccessUntil === null || insightsAccessUntil < now):
    → PaywallCard (charts locked, saved areas still visible, upgrade CTA)
  else if (daysRemaining <= 3):
    → TrialBanner: "Your trial ends in N day(s)"
  else:
    → Full access
```

---

## 8. Notification Types for Booking

Four specific types (string constants — no DB enum migration needed, consistent with existing `listing_approved`, `listing_rejected` pattern):

| Type | Recipient | Trigger |
|------|-----------|---------|
| `viewing_requested` | Dealer | User creates a viewing request |
| `viewing_confirmed` | User (requester) | Dealer confirms |
| `viewing_declined` | User (requester) | Dealer declines |
| `viewing_cancelled` | Counterparty | Either party cancels |

---

## 9. Acceptance Criteria Summary

| ID | Phase | Criterion | Testable? |
|----|-------|-----------|-----------|
| AC-A1 | Phase 1 | Logged-out user sees Map, Browse, Login/Sign up in nav | Unit test |
| AC-A2 | Phase 1 | Logged-in user nav includes Saved Areas, Insights, Notifications | Unit test |
| AC-A3 | Phase 1 | Dealer nav includes My Listings, New Listing, Booking Requests | Unit test |
| AC-A4 | Phase 2 | First-run screen shown on first login | E2E smoke |
| AC-A5 | Phase 2 | Choosing "list property" → dealer setup → role becomes dealer | Integration test |
| AC-A6 | Phase 4 | Trial countdown banner within 3 days | Unit test |
| AC-A7 | Phase 4 | Insights charts locked on expiry; upgrade CTA visible | Unit test |
| AC-A8 | Phase 4 | GET /api/insights/* returns 403 when no valid access | Backend test |
| AC-B1 | Phase 3 | POST /api/bookings creates ViewingRequest REQUESTED | Backend test |
| AC-B2 | Phase 3 | Duplicate active booking → 409 Conflict | Backend test |
| AC-B3 | Phase 3 | Dealer confirm → CONFIRMED | Backend test |
| AC-B4 | Phase 3 | User cancel from REQUESTED or CONFIRMED → CANCELLED | Backend test |
| AC-B5 | Phase 3 | Dealer receives `viewing_requested` notification | Backend test |
| AC-B6 | Phase 3 | Self-booking prevention (requester == dealer → 400) | Backend test |
| AC-B7 | Phase 3 | IDOR: User B cannot cancel User A's booking → 404 | Backend test |
| AC-B8 | Phase 5 | Smoke test covers nav links by persona | Playwright |
| AC-B9 | Phase 6 | Sentry captures at least one event with requestId | Manual |

---

## 10. PR Breakdown (implementation order)

> Rule: Max 3 files per PR. Each PR follows qa-fast preflight → implement → qa tests → reviewers.

### PR-1 — Navigation / IA (Phase 1) — **GO**

**Files (3):**
1. `src/contexts/AuthContext.tsx` — expand `AppRole` to include `'dealer'`; add `isDealer: boolean`; fetch `insightsAccessUntil` from `profiles`; call `refreshRole()` after dealer setup
2. `src/components/layout/AppLayout.tsx` — role-aware nav (logged-out / user / dealer / admin)
3. `src/components/layout/__tests__/AppLayout.test.tsx` — nav rendering tests per auth state

> Note: If `AuthContext.tsx` changes require a test file for the context itself, split into PR-1a (AuthContext + its test) and PR-1b (AppLayout + its test).

**Reviewers**: code-reviewer, qa

---

### PR-2 — Dealer Setup + Role Assignment (Phase 2) — **GO** (depends on PR-1)

> Note: PR-2 depends on PR-1 because `DealerSetup.tsx` and `Onboarding.tsx` import from the updated `AuthContext` interface. Do NOT run in parallel.

> Note: No migration needed. The `dealer` enum value was added in V7. `user_roles` table exists.

**Files (3):**
1. `src/pages/Onboarding.tsx` — NEW: first-run intent screen (Browse vs List)
2. `src/pages/dealer/DealerSetup.tsx` — NEW: dealer setup form; calls POST /api/dealer/setup; calls `refreshRole()` on success
3. `backend/.../dealer/DealerSetupController.java` — NEW: POST /api/dealer/setup with mandatory security controls below

**Security controls (mandatory per security-reviewer M1-M3):**
- Role value `'dealer'` is a Java constant — never from request body
- Check existing role before INSERT: reject 409 if already `dealer` or `admin`
- INSERT with `ON CONFLICT (user_id, role) DO NOTHING` (idempotent)
- Phone number validated: regex for valid Indian number, max 15 chars
- `acceptedTerms` must be `true` or reject 400
- Entire operation in `@Transactional`

**Reviewers**: security-reviewer (role assignment), code-reviewer

---

### PR-3a — Booking Entity + Repository + Migration (Phase 3a) — **GO after spec amendment**

**Files (3):**
1. `backend/.../booking/ViewingRequest.java` — NEW entity (fields per Section 6 DDL)
2. `backend/.../booking/ViewingRequestRepository.java` — NEW Spring Data JPA repository
3. `backend/src/main/resources/db/migration/V14__create_viewing_requests.sql` — NEW migration (includes RLS policies per Section 6)

**Reviewers**: backend-engineer QA

---

### PR-3b — Booking Controller + Service + Event Listener (Phase 3b) — depends on PR-3a

**Files (3):**
1. `backend/.../booking/BookingController.java` — NEW controller (all endpoints; ownership checks per Section 6 table)
2. `backend/.../booking/BookingService.java` — NEW service (state transitions, validation, event publishing)
3. `backend/.../booking/BookingEventListener.java` — NEW: AFTER_COMMIT listener for 4 booking notification types

**Reviewers**: security-reviewer (IDOR + ownership scoping), code-reviewer

---

### PR-4 — Booking Frontend (Phase 3c) — depends on PR-3b

**Files (3):**
1. `src/components/listing/RequestViewingModal.tsx` — NEW modal on listing detail
2. `src/pages/dealer/DealerBookings.tsx` — NEW dealer booking management page
3. `src/hooks/useBookings.ts` — NEW hooks (useCreateBooking, useDealerBookings, useConfirmBooking, useCancelBooking)

**Reviewers**: code-reviewer, qa-fast

---

### PR-5a — Insights Access Migration (Phase 4a) — can run parallel with PR-3a

**Files (1):**
1. `backend/src/main/resources/db/migration/V15__add_insights_access.sql` — V14 DDL from Section 7 (profiles column + trigger + RLS hardening)

> Separate from the controller changes so the migration can be reviewed and deployed independently.

**Reviewers**: security-reviewer (RLS hardening)

---

### PR-5b — Insights Access Backend (Phase 4b) — depends on PR-5a

**Files (3):**
1. `backend/.../insights/InsightsController.java` — add `hasInsightsAccess` check before each handler; return 403 with structured body on expiry
2. `backend/.../insights/InsightsService.java` — add `hasInsightsAccess(UUID userId)` via native query on `profiles`
3. `backend/.../payment/PaymentController.java` — NEW: `POST /api/payments/insights-pass` stub with all security controls from Section 7

**Reviewers**: security-reviewer (paywall bypass + stub controls), code-reviewer

---

### PR-6 — Insights Frontend (Phase 4c) — depends on PR-5b

**Files (3):**
1. `src/pages/Insights.tsx` — conditional render based on `insightsAccessUntil`
2. `src/components/insights/PaywallCard.tsx` — NEW: locked overlay + upgrade CTA
3. `src/components/insights/TrialBanner.tsx` — NEW: "N days remaining" banner

**Reviewers**: code-reviewer, qa-fast

---

### PR-7 — Smoke Tests Update (Phase 5) — depends on PR-1 through PR-4

**Files (3):**
1. `docs/BROWSER_SMOKE_TEST.md` — add: nav links by persona, onboarding, booking request, paywall
2. `e2e/quick-smoke.spec.ts` — add Q6 (nav links by role), Q7 (booking request → 409 on dupe)
3. `e2e/dealer-smoke.spec.ts` — NEW: dealer journey smoke (setup → listing → booking request)

**Reviewers**: qa

---

### PR-8 — Observability Verification (Phase 6)

**Files (2):**
1. `backend/.../config/SentryTestController.java` — staging-only endpoint (gated by `sentry.test.enabled`, default false)
2. `docs/OBSERVABILITY_VERIFICATION.md` — how to trigger + verify

**Reviewers**: security-reviewer (staging gate cannot be triggered in prod)

---

## 11. Sequencing + Parallelism (corrected)

```
Week 1:
  PR-1 (Nav) ─────────────────────────────────────► merge
      └─► PR-2 (Dealer Setup) ───────────────────► merge (after PR-1)
  PR-3a (Booking Entity+Repo+Migration V14) ──────► merge (parallel to PR-1)
  PR-5a (Insights Migration V15) ─────────────────► merge (parallel to PR-1)

Week 2 (after PR-1, PR-3a, PR-5a merge):
  PR-3b (Booking Controller+Service) ─────────────► merge (after PR-3a)
  PR-5b (Insights Backend) ───────────────────────► merge (after PR-5a)

Week 3 (after PR-2, PR-3b, PR-5b merge):
  PR-4  (Booking Frontend) ───────────────────────► merge (after PR-3b)
  PR-6  (Insights Frontend) ──────────────────────► merge (after PR-5b)
  PR-7  (Smoke Tests) ────────────────────────────► merge (after PR-4)
  PR-8  (Observability) ──────────────────────────► merge
```

**Migration sequence (Flyway):**
- V14: `V14__create_viewing_requests.sql` (PR-3a, Week 1)
- V15: `V15__add_insights_access.sql` (PR-5a, Week 1, can be parallel with V14)

**Critical path**: PR-1 → PR-2 → PR-4 (nav must land before dealer setup which must land before booking frontend)

---

## 12. Open Questions — RESOLVED

| # | Question | Resolution | Source |
|---|----------|------------|--------|
| 1 | `insightsAccessUntil` location | `profiles` table; backend reads via native query; writes via service account; RLS hardened | Architect |
| 2 | Dealer role assignment | Spring Boot POST /api/dealer/setup; native INSERT; role hardcoded `'dealer'`; idempotent | Architect |
| 3 | Time slot representation | TEXT `"HH:MM-HH:MM"` + regex validation; timestamps deferred to Sprint 6 | Architect |
| 4 | 402 vs 403 for expired insights | **403** with structured body — 402 avoided due to proxy/CDN (Cloudflare) risk | Architect |
| 5 | Notification types | 4 types: `viewing_requested`, `viewing_confirmed`, `viewing_declined`, `viewing_cancelled` | Architect |

---

## 13. Security Open Questions — RESOLVED

| # | Question | Resolution | Source |
|---|----------|------------|--------|
| 1 | Role escalation in dealer setup | Hardcode `'dealer'`; check existing role; idempotent INSERT; validate phone+terms; `@Transactional` | Security |
| 2 | Booking ownership scoping | All IDs server-side derived; per-endpoint ownership table in §6; 404 for non-matching (not 403) | Security |
| 3 | Paywall bypass via Supabase API | **CRITICAL**: V15 migration MUST replace profiles UPDATE policy with column-restricted WITH CHECK | Security |
| 4 | Payment stub security | Feature flag `payments.stub.enabled`; idempotency; per-user rate limit; audit log; 30d constant | Security |
| 5 | COMPLETED transition job | @Scheduled only; no HTTP endpoint; CONFIRMED→COMPLETED only; idempotent | Security |

---

## 14. Security Mandatory Controls Checklist

These MUST be in code before the corresponding PR merges. Reviewers verify each.

| # | PR | Control | Severity |
|---|---|---|---|
| M1 | PR-2 | Dealer role value hardcoded as `'dealer'` constant; never from request body | CRITICAL |
| M2 | PR-2 | Existing role check: reject 409 if user already has `dealer` or `admin` | HIGH |
| M3 | PR-2 | Phone number validated server-side (regex + max 15 chars) | MEDIUM |
| M4 | PR-3b | `requester_id = JWT.sub` and `dealer_id = listing.created_by`; never from body | CRITICAL |
| M5 | PR-3b | Per-endpoint ownership check per §6 table; return 404 (not 403) for non-owners | CRITICAL |
| M6 | PR-3a | RLS enabled on `viewing_requests` with policies from §6 DDL | HIGH |
| M7 | PR-3b | `requested_time_slot` validated against `^\d{2}:\d{2}-\d{2}:\d{2}$` | MEDIUM |
| M8 | PR-3b | `requested_date` validated as future date, max 90 days out | MEDIUM |
| M9 | PR-3b | Free-text fields (`requester_message`, `decline_reason`) max 500 chars | MEDIUM |
| M10 | PR-3b | Self-booking prevention: `requester_id == dealer_id` → 400 | HIGH |
| M11 | PR-5a | `profiles` UPDATE RLS policy replaced with column-restricted WITH CHECK | CRITICAL |
| M12 | PR-5b | Payment stub: reject 409 if `insights_access_until > NOW()` | HIGH |
| M13 | PR-5b | Payment stub: `payments.stub.enabled` feature flag; default false | HIGH |
| M14 | PR-5b | COMPLETED job: `@Scheduled` only; no HTTP endpoint | HIGH |
| M15 | PR-5b | COMPLETED job: only transitions `CONFIRMED` status | MEDIUM |

---

## 15. Review Summary

### Architect Review (2026-02-19)

**Verdict: APPROVED WITH CHANGES** (all changes incorporated in this version)

Key decisions:
- `insightsAccessUntil` on `profiles` table; backend native query; RLS hardened
- PR-3 split into PR-3a + PR-3b to respect 3-file limit
- PR-2 must follow PR-1 (not parallel) — `Onboarding.tsx` needs updated AuthContext interface
- Migration numbers: V14 = viewing_requests, V15 = insights_access
- HTTP 403 (not 402) for expired insights
- 4 booking notification types; string constants (no enum migration)
- COMPLETED job deferred to post-Sprint-5 (cosmetic; doesn't block functionality)

### Security Review (2026-02-19)

**Overall Verdict: GO** (after spec amendments above)
- PR-1 (Navigation): GO
- PR-2 (Dealer Setup): GO with M1-M3 controls
- PR-3 (Booking): GO — IDOR ownership rules documented in §6; RLS in migration DDL
- PR-5 (Insights): GO — `profiles` RLS hardening included in V15 migration DDL

Two previously BLOCKED items resolved in this spec version:
1. `profiles` UPDATE RLS now has column-restricted WITH CHECK (§7 V15 DDL)
2. `requester_id` and `dealer_id` server-side derivation explicitly stated (§6 ownership table)
