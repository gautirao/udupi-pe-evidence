# Sprint 5 — Resume Checkpoint

**Created:** 2026-02-20 (updated — rate-limit save, team session active)
**Author:** Claude (auto-generated checkpoint)

---

## Current State

### Sprint progress

| Task | PR | Description | Status | Commit |
|------|----|-------------|--------|--------|
| PR-1 | — | Role-aware navigation | ✅ Done | `05bd9a9` |
| PR-2 | — | Dealer Setup + phone persistence | ✅ Done | `83a5abe` |
| Checkpoint PR-3a | — | Dealer landing pages (Dashboard + Listings) | ✅ Done | `4f5e6f2` |
| Task #1 | nav-fix | SavedAreas + /notifications redirect + AppLayout tests | ✅ Done | `f20df11` |
| Task #2 | Sprint PR-3a | ViewingRequest entity + ViewingRequestRepository + V15 migration | ✅ Done | `8be58bf` |
| Task #3 | Sprint PR-5a | V16 insights access migration (profiles column + trigger + RLS hardening M11) | ✅ Done | `55d4067` |
| Task #4 | Sprint PR-3b | BookingController + BookingService + BookingEventListener | ✅ Done | `3b61ea4` |
| Task #4b | follow-up | BookingControllerTest (14 cases) + null guard for SCRAPED listings | ✅ Done | `7b668a9`, `c722b28` |
| Task #5 | Sprint PR-5b | InsightsService access gate + InsightsController 403 + PaymentController stub | ✅ Done | `3a137fa` |
| Task #6 | Sprint PR-4 | useBookings hooks + RequestViewingModal + DealerBookings page | ✅ Done | `177c774` |
| Task #6b | follow-up | Wire RequestViewingModal into ListingDetail | ✅ Done | `2e2bb90` |
| Task #8 | Sprint PR-7 | Smoke tests (BROWSER_SMOKE_TEST.md + e2e specs) | ✅ Done | `ef3649a` |
| **Task #7** | Sprint PR-6 | **Insights frontend: Insights.tsx + PaywallCard + TrialBanner** | ⏳ Frontend agent planning | — |
| **Task #9** | Sprint PR-8 | **Observability: SentryTestController + OBSERVABILITY_VERIFICATION.md** | ⏳ Backend-engineer implementing | — |

### Branch and working tree

- **Branch:** `main`
- **HEAD:** `3a137fa feat(insights): Sprint-PR-5b — insights access gate + payment stub`
- **Ahead of origin/main by ~11 commits** (do NOT push unless user requests)
- **Test counts:** 457 backend tests (0 failures), 61 frontend Vitest tests (0 failures)

### Active team: sprint5-team

- **frontend** agent — assigned Task #7 (insights-frontend), was planning when rate limit hit
- **backend-engineer** agent — assigned Task #9 (observability) + 503→404 fix, was implementing when rate limit hit

---

## Decisions Already Made (DO NOT re-ask)

| Decision | Choice |
|----------|--------|
| C-1: Phone persistence | Option A — V14 migration, phone stored in profiles ✅ DONE |
| Q1: Post-setup redirect | /dealer/dashboard ✅ DONE |
| Q2: Insights CTA on Index.tsx | Defer to PR-3c (not in Sprint 5 scope) |
| Migration V14 | add_phone_to_profiles (taken) |
| Migration V15 | create_viewing_requests (taken) |
| Migration V16 | add_insights_access (taken) |
| 403 vs 402 for expired insights | 403 with structured body (architect decision) |
| PaymentController stub disabled → | 404 (not 503 — backend-engineer had 503 bug, flag to fix) |

---

## Outstanding Items (Remaining Work)

### Task #7 — insights-frontend (frontend agent, 3 files)

Frontend agent was planning when rate limit hit. **Present plan to team-lead, wait for approval.**

Files:
1. `src/pages/Insights.tsx` — MODIFY: conditional render on `insightsAccessUntil`
   - `null || < now` → `<PaywallCard />`
   - `daysRemaining <= 3` → `<TrialBanner daysRemaining={N} />` above charts
   - else → full access (no change)
2. `src/components/insights/PaywallCard.tsx` — NEW: locked overlay + "Upgrade" CTA; saved areas list remains visible below
3. `src/components/insights/TrialBanner.tsx` — NEW: "Your trial ends in N day(s)" dismissible banner

Key note: `insightsAccessUntil` in AuthContext is `string | null` (ISO string). Compare as `new Date(insightsAccessUntil) < new Date()`.

Commit message: `feat(insights): Sprint-PR-6 — insights paywall + trial banner frontend`

### Task #9 — observability (backend-engineer, 2 files + 1-line fix)

Backend-engineer was implementing when rate limit hit. **Present plan to team-lead, wait for approval.**

Files:
1. `backend/.../config/SentryTestController.java` — NEW: `GET /api/sentry/test` gated by `@ConditionalOnProperty(name="sentry.test.enabled", havingValue="true", matchIfMissing=false)`. Throws RuntimeException so Sentry captures it with requestId in MDC.
2. `docs/OBSERVABILITY_VERIFICATION.md` — NEW: how to trigger and verify in staging.

**ALSO REQUIRED (1-line fix):** `PaymentController.java` currently returns 503 when `payments.stub.enabled=false`. Must be changed to 404 (security — endpoint should appear non-existent). Fix in same commit or separate 1-line patch.

Commit message: `feat(observability): Sprint-PR-8 — Sentry test endpoint + verification doc`

---

## Known Issues / Technical Debt

| Issue | File | Notes |
|-------|------|-------|
| PaymentController 503→404 | PaymentController.java | Backend-engineer must fix before Task #9 commit |
| W-1 (pre-existing) | AuthContext.tsx | fetchUserRole reads Supabase directly, bypasses backend. Track for future GET /api/account/me |
| W-4 (pre-existing) | AuthContext.tsx | refreshRole() no-op if user is null (session expired mid-form) |
| TIMESTAMPTZ→OffsetDateTime | InsightsService.java | Verify pgjdbc 42.x+ in staging. If getObject(col, OffsetDateTime.class) fails → everyone gets 403 |
| Missing profile row | InsightsService.java + PaymentController | Returns 500 if profile row missing. Should alert in staging. |

---

## Security Controls Status

| Control | PR | Status |
|---------|-----|--------|
| M1 | PR-2 | ✅ DEALER_ROLE constant |
| M2 | PR-2 | ✅ 409 if already dealer/admin |
| M3 | PR-2 | ✅ Phone regex + max 15 chars |
| M4 | PR-3b | ✅ requester_id=JWT.sub, dealer_id=listing.created_by |
| M5 | PR-3b | ✅ 404 (not 403) for non-owners |
| M6 | PR-3a | ✅ RLS on viewing_requests |
| M7 | PR-3b | ✅ time slot regex |
| M8 | PR-3b | ✅ future date, max 90 days |
| M9 | PR-3b | ✅ max 500 chars on free-text |
| M10 | PR-3b | ✅ self-booking prevention |
| M11 | PR-5a | ✅ profiles UPDATE RLS restricted |
| M12 | PR-5b | ✅ 409 if insights_access_until > NOW() |
| M13 | PR-5b | ⚠️ Implemented but returns 503 instead of 404 — fix pending |
| M14/M15 | PR-5b | ✅ 30d constant, @Scheduled only |

---

## How To Resume

### If rate limit clears mid-session (team still active)

Send to each agent:
```
"Rate limit cleared. Resume your current task.
backend-engineer: Task #9 (observability) + fix PaymentController 503→404. Present plan to team-lead.
frontend: Task #7 (insights-frontend). Present plan to team-lead."
```

### If starting a new session (team dissolved)

```bash
cd /Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer
tmux  # ensure in tmux for team agent panes
claude
```

Resume prompt:
> "Resume Sprint 5 from docs/CHECKPOINT_SPRINT5.md. Team was active with sprint5-team. Tasks #7 (insights-frontend) and #9 (observability + 503→404 fix) are the only remaining items. Recreate the team if needed and assign. Do NOT redo any completed tasks."

### Verify working tree on resume:
```bash
git log --oneline -5   # expect HEAD = 3a137fa
git status             # expect clean working tree (no uncommitted changes)
npm test -- --run      # expect 61 tests pass
mvn -pl backend test   # expect 457 tests pass, 0 failures
```

---

## Done Definition

**Sprint 5 complete** when:
1. Task #7 committed: Insights.tsx shows paywall/trial banner; PaywallCard + TrialBanner components exist
2. Task #9 committed: SentryTestController.java (staging-only) + OBSERVABILITY_VERIFICATION.md; PaymentController returns 404 (not 503) when stub disabled
3. `mvn -pl backend test` → 0 failures
4. `npm test -- --run` → 61+ tests pass
5. Manual smoke: user → insights paywall visible if expired; trial banner if within 3 days; dealer booking flow works end-to-end

**Remaining Sprint 5 PRs after this sprint:**
- PR-3c: Insights CTA on Index.tsx (deferred)
- PR-5c / future: Real payment integration (Razorpay webhook)

Full sprint spec: `docs/SPRINT_05_USER_JOURNEY_SPEC.md`
Team config: `~/.claude/teams/sprint5-team/config.json`
