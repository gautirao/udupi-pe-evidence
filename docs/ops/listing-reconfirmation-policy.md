# Listing Freshness & Reconfirmation Policy (Phase 1 — manual, Minimal-MVP)

> Status: **Active (pre-automation, manual)**. Issue #1794 Phase 1.
> "No stale listings" is this product's clearest trust differentiator. Phase 1 makes a start on that
> promise with an honest, minimal mechanism and a manual founder review loop. It deliberately ships the
> *current* implementation unchanged and is candid about its limits (see "What the signal actually
> measures" below); a purpose-built confirmation action comes in Phase 2.

## Why this exists

Buyers on Indian property portals are burned most by stale listings. We promise the opposite. With
founder-curated supply this can start as a manual loop, but the signal, the review cadence, and the
honesty of the buyer-facing label need to be defined now so the promise is truthful from launch.

## The signal: `last_confirmed_at`

- Every listing carries a nullable `last_confirmed_at` timestamp (exposed to clients as `confirmedAt`).
- It is set/refreshed to "now" **whenever a listing (re-)ENTERS the LIVE state from a non-LIVE state**
  through the existing workflow transitions. Most of these are admin-only — first approval
  (PENDING_REVIEW→LIVE), approve-scraped, and admin restore-from-rejected (REJECTED→LIVE) — but **one is
  owner-invokable: a broker/owner fast-restoring their OWN archived listing** (ARCHIVED→LIVE via
  `PUT /api/listings/{id}/restore`, ownership-gated, `ActorType.BROKER`) also refreshes it.
  `first_published_at` is preserved; only `last_live_at`/`last_confirmed_at` refresh.
- **It is nullable and is NEVER backfilled.** A listing that has never actually (re-)entered LIVE through
  the workflow shows **no** "Confirmed" date — the absence is honest on the card and detail page. We never
  default it from the creation or last-updated date to make an old listing look fresh.

Buyers see **"Confirmed {date}"** on the listing card and detail page when `confirmedAt` is present; when it
is absent they see the honest existing "listed"/"updated" information, never a fabricated confirmation.

## What the signal actually measures (be honest about the limit)

In Phase 1, `last_confirmed_at` is a **proxy: it records the last time a listing (re-)entered LIVE through
the lifecycle workflow (an admin moderation transition, or an owner fast-restoring their own archived
listing), not a purpose-built "we checked, it's still available" confirmation.**
Approval ("allowed to publish") and reconfirmation ("we verified it's still available") are two different
business concepts; Phase 1 does not model reconfirmation as its own action — it reuses the moderation
timestamp as the best available proxy. This is an intentional Minimal-MVP trade-off, corrected honestly
here rather than overstated in the product.

**Phase 1 does NOT provide a dedicated "Confirm still available" action.** If a listing naturally goes
through the normal moderation workflow (an edit that returns it to review and is re-approved, a restore,
etc.) *for its own reasons*, `last_confirmed_at` may **incidentally** refresh as a side effect of that
lifecycle event. That incidental refresh is **not** a reconfirmation procedure and must not be treated or
described as one — do **not** bounce a healthy LIVE listing through review just to move the timestamp.

## The manual review loop

The operative Phase-1 tool is a **founder review**, not a per-listing reconfirm action:

| Cadence | Actor | Action |
|---|---|---|
| Weekly | Founder/Admin | Review the early-review worklist — LIVE listings not confirmed in >14 days (admin endpoint below). |
| Per stale candidate | Founder/Admin | **Manually decide**, case by case: leave it live; contact the broker to verify availability with the owner; or archive it via the existing **ARCHIVED transition with a reason code** (no new status). |
| At 30 days without a recorded confirmation | Founder/Admin | Archive the listing via the existing ARCHIVED transition. |
| Incidentally (not a deliberate step) | — | If a listing passes through the moderation workflow for its own reasons, `last_confirmed_at` refreshes as a side effect. |

Availability verification (a broker/founder WhatsApp touch with the owner) is an operational check that
writes nothing by itself. The **admin approval / reject / archive / restore-from-rejected** transitions are
**admin-only**; a normal broker/dealer cannot invoke them. The **one** lifecycle transition an owner can
invoke themselves is fast-restoring their **own archived** listing (ARCHIVED→LIVE, ownership-gated), which
also incidentally refreshes `last_confirmed_at` — another reason the timestamp is a lifecycle-touch proxy,
not a verified availability check.

## Two distinct thresholds (do not conflate)

- **14 days — early-review worklist threshold.** The admin stale endpoint surfaces LIVE listings not
  confirmed in >14 days so the founder's **weekly review** has candidates to look at *before* they become
  genuinely stale. Appearing on this list is a prompt to review, not an archival trigger.
- **30 days — archive threshold.** A listing still without a recorded confirmation at 30 days is
  **archived** by a Founder/Admin. These two numbers are deliberately different and must not be treated as
  interchangeable.

### The early-review worklist

```
GET /api/admin/listings/stale?days=14      (admin-only; default early-review threshold 14 days)
```

Returns LIVE listings **not confirmed in more than `days` days**, oldest-confirmed first. Listings that
have **never** been confirmed (`last_confirmed_at IS NULL`) are treated as **stale** and appear first — the
honest worst case, never hidden.

## Out of scope for Phase 1 (deferred to Phase 2)

Intentionally **not** built yet and must not be assumed to exist:

- **A dedicated "Confirm still available" action** that updates `last_confirmed_at` **without requiring a
  moderation-workflow transition** — i.e. a real reconfirmation as its own domain action (and, for brokers,
  a "one-tap reconfirm"). This is the main thing Phase 2 adds; it is explicitly declined for Phase 1.
- Scheduled reminder jobs and automatic archiving of unconfirmed listings.
- Back-on-market automation using `back_to_market_at`.
- In-app / WhatsApp notification automation.

These are tracked as Phase 2 of issue #1794.
