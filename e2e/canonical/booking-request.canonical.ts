/**
 * Booking request — T16 (anon, interactive-but-gated) / T17 (authed, real
 * booking + /my-bookings row) — issue #1713, PR-4.
 *
 * Targets the already-seeded fixture listing
 * 'e2e00001-0000-0000-0000-000000000001' ('[E2E] 1 Lakh Manipal Apartment')
 * — the same literal constant used by canonical-harness-smoke.canonical.ts
 * and listing-detail-gating.canonical.ts (reused, not re-derived). Creates
 * NO new fixture data.
 *
 * ViewingRequestPanel (src/components/listing/ViewingRequestPanel.tsx) is
 * rendered INLINE on the listing detail page (ListingDetailSidebar.tsx:54),
 * not a modal. TIME_SLOTS (src/hooks/useBookings.ts) are wire-format
 * strings like '09:00-10:00' — this file always drives selection via
 * data-testid attributes (`viewing-date-pill-<iso>` /
 * `viewing-time-slot-<slot>`), never a human label, so it never has to
 * duplicate the '09:00-10:00' -> '9 AM' formatting logic.
 *
 * T16's defended failure mode is a panel that LOOKS interactive/successful
 * for an anonymous visitor without actually doing anything real — hence
 * POSITIVE CONTROLS run FIRST (mounted, interactive, correct anon label),
 * only then the negative assertions (no success state, no real POST). T17
 * was INTENDED as the MIRROR CONTROL that proves `viewing-request-success`
 * and the booking POST can both genuinely happen — without it, T16's
 * negative assertions lose that corroboration. T17 IS DESCOPED for PR-4
 * (see "T17 DESCOPED" below); T16 stands on its own real network-listener
 * check (`bookingPostFired`) as its own proof it isn't vacuous, independent
 * of T17.
 *
 * ---- T17 RE-ENABLED (issue #2247) — corrects a prior wrong diagnosis ----
 *
 * T17 was previously descoped, blamed on `cancelAnyOwnActiveBooking`'s
 * row-detection xpath being a pure test-helper bug ("this is purely a
 * test-helper locator bug, not a product defect" — investigated across
 * three 3x campaigns). That diagnosis was DISPROVEN: the real, reproduced
 * root cause is `useMyBookings`/`useBrokerBookings` (src/hooks/useBookings.ts)
 * reading `.content`/`.page.totalPages` — the shape of the OTHER backend
 * envelope family (Spring `Page<T>`, `PageResponse<T>` in src/lib/api.ts) —
 * off a response that is actually the flat `PagedResponse<T>` envelope
 * (`items` + top-level pagination fields) returned by `/api/bookings/mine`
 * and `/api/bookings/broker`. `data` was therefore always `undefined` and
 * `/my-bookings` always rendered its EMPTY state for every user, even with
 * a real REQUESTED booking and a 2xx response — so the row this xpath
 * hunted for never existed in the DOM at all. Fixed by giving the flat
 * envelope its own type and pointing both hooks at it. The xpath locator
 * was also replaced below with a role-based walk (see
 * `cancelAnyOwnActiveBooking`), since inverting the search direction is
 * more robust independent of this bug. `T17_ENABLED` is `true` again.
 */

import { test, expect } from './support/canonical-test';
import type { Page } from './support/canonical-test';
import { loginAsBroker, hasRealCredentials } from '../helpers';

const FIXTURE_LISTING_ID = 'e2e00001-0000-0000-0000-000000000001';

const brokerEmail = process.env.BROKER_EMAIL || process.env.DEALER_EMAIL || '';
const brokerPassword = process.env.BROKER_PASSWORD || process.env.DEALER_PASSWORD || '';

/** What T17 booked, handed to T17b through this file's module scope (same project, same worker, declaration order). */
let t17Booking: { id: string; date: string; slot: string } | null = null;

// T17_ENABLED — see the module docstring's "T17 RE-ENABLED" section above.
// Distinct from listing-lifecycle.canonical.ts's T14_T15_ENABLED, which
// descopes T14/T15 for an unrelated reason (an architectural data-source
// mismatch, #2242). Re-enabled for issue #2247 once the real root cause
// (the envelope-shape bug in useBookings.ts) was fixed.
const T17_ENABLED = true;

/**
 * Self-healing precondition for T17: cancels any ACTIVE (REQUESTED) booking
 * this test's own `[role:user]` account already holds against
 * FIXTURE_LISTING_ID, via the real /my-bookings UI cancel affordance, so the
 * test is idempotent across reruns against this shared, never-cleaned-up
 * fixture listing.
 *
 * Why this is needed (verified directly against the live DB index, the
 * migration source, and independently by Main Agent —
 * backend/.../db/migration/V45 — all three agree):
 *
 *   CREATE UNIQUE INDEX idx_one_active_booking_per_user_listing
 *     ON viewing_requests (listing_id, requester_id)
 *     WHERE status IN ('REQUESTED', 'CONFIRMED', 'NEEDS_RESOLUTION');
 *
 * The uniqueness scope is (listing_id, requester_id) ONLY — requested_date
 * and requested_time_slot are NOT part of it, so varying the date/slot tuple
 * (a prior version of this test's approach) can never avoid a 409 once an
 * active booking exists: every tuple maps to the same (listing_id,
 * requester_id) pair. The only fix that actually changes the tuple the
 * index cares about is to free the slot by cancelling the existing booking —
 * CANCELLED is not in the partial index's status list, so the pair becomes
 * available again for a fresh POST.
 *
 * Drives the real product UI (GET /api/bookings/mine -> /my-bookings ->
 * "Cancel Booking" -> "Yes, cancel" -> PUT /api/bookings/:id/cancel) rather
 * than an arranged API call:
 *   - useCancelBooking() (src/hooks/useBookings.ts:172-192) documents PUT
 *     /api/bookings/:id/cancel as a "user or dealer action" — this test's
 *     own authenticated user is authorised to cancel its own booking.
 *   - /my-bookings (src/pages/MyBookings.tsx) is driven by useMyBookings(),
 *     which calls GET /api/bookings/mine — scoped server-side to the
 *     requesting user's own bookings. It is therefore structurally
 *     impossible for this flow to ever reach the seeded booking that
 *     belongs to the OTHER fixture requester ('b2c3d4e5-...') on the same
 *     listing: that booking never appears in THIS user's /my-bookings
 *     response at all, let alone gets a Cancel Booking button rendered for
 *     it.
 *   - Driving the real "Cancel Booking" -> "Yes, cancel" affordance also
 *     doubles as a live proof that the cancel path itself works, rather
 *     than assuming it.
 *
 * Idempotent: BookingCard (MyBookings.tsx:77-107) only renders the "Cancel
 * Booking" button when `booking.status === 'REQUESTED'` (the only status
 * this suite's booking flow ever produces). If no such row exists for
 * FIXTURE_LISTING_ID — e.g. a fresh database, or a previous run's booking
 * was already cleaned up — this function is a no-op: it must never fail or
 * block on that case.
 */
async function cancelAnyOwnActiveBooking(page: Page): Promise<void> {
  const myBookingsPromise = page.waitForResponse(
    (r) => r.url().includes('/api/bookings/mine') && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/my-bookings');
  const myBookingsResp = await myBookingsPromise;
  expect(myBookingsResp.ok(), 'GET /api/bookings/mine (T17 precondition check) must respond 2xx').toBe(true);
  await page.waitForLoadState('domcontentloaded');

  // AUTO-RETRY DISCIPLINE NOTE (T17 rework, cycle 4 — read before touching
  // this precondition again): cycle 3's fix ("wait for 'Loading your
  // bookings...' to have count 0") looked like it closed the ordering race,
  // but it did not — it was itself a negative assertion on a transient
  // signal, and `toHaveCount(0)` is satisfied by TWO different DOM states:
  // (a) the loading text was shown and then cleared, and (b) the loading
  // text has never appeared yet, e.g. because MyBookings.tsx hasn't
  // committed its first render (it sits behind ProtectedRoute + AuthContext
  // resolution). Immediately after `await myBookingsPromise` resolves,
  // state (b) is common, so `toHaveCount(0)` passed INSTANTLY and
  // vacuously, before React ever rendered the fetched rows. The subsequent
  // `.count()` sample on `activeBookingRow` then read 0 and this
  // precondition wrongly concluded "nothing to cancel" even when a genuine
  // active REQUESTED booking existed (verified directly against the live
  // DB: requester 86bec885-... — this test's own [role:user] account —
  // held one) — and the following booking POST then 409'd against it. This
  // is exactly the negative-assertion-vacuity failure class T16's positive
  // controls exist to catch in the product code; we'd failed to apply the
  // same discipline to our own helper.
  //
  // Lesson: an auto-retrying assertion for ABSENCE of a transient signal
  // provides no ordering guarantee — "not currently showing" also means
  // "not started yet". The only way to guarantee the DOM reflects the
  // fetch's outcome is to wait for a POSITIVE signal that is true in every
  // terminal (post-fetch) state and false before the component has ever
  // rendered real data.
  //
  // Fix: MyBookings.tsx (src/pages/MyBookings.tsx) renders exactly one of
  // four states from a single ternary chain keyed off `isLoading` /
  // `isError` / `bookings.length`: loading ("Loading your bookings..."),
  // error ("Failed to load bookings. Please try again later."), empty
  // ("You have no viewing requests yet."), or populated (one BookingCard
  // per booking, each unconditionally rendering the static label "Listing"
  // next to a `font-mono` span of the listing id — see BookingCard,
  // MyBookings.tsx:41-126). None of loading/error/empty/populated's marker
  // text exists before MyBookings has mounted and committed its first
  // render, so waiting for ANY of the three post-fetch terminal states to
  // become visible is a real ordering guarantee, not just an absence check.
  // We wait for empty OR populated (scoped to `main` so "Listing" can never
  // match the page header/nav, which never renders that word for a signed
  // in [role:user] account) OR error, then fail fast with a clear message
  // if it was the error branch — the `myBookingsResp.ok()` assertion above
  // means that should never happen, but this still gives a diagnosable
  // failure instead of a silent hang if useMyBookings ever surfaces a
  // client-side error despite a 2xx response.
  const emptyState = page.getByText('You have no viewing requests yet.');
  const errorState = page.getByText('Failed to load bookings. Please try again later.');
  const populatedState = page.locator('main').getByText('Listing', { exact: false }).first();
  await expect(emptyState.or(errorState).or(populatedState)).toBeVisible({ timeout: 15_000 });
  if (await errorState.isVisible()) {
    throw new Error(
      '[T17 precondition] GET /api/bookings/mine responded 2xx but MyBookings rendered its ' +
      'error state — cannot verify whether an active booking exists to cancel.',
    );
  }

  // Locate the "Cancel Booking" button first, then walk UP to the nearest
  // ancestor <div> that contains FIXTURE_LISTING_ID — the INVERSE of the
  // old getByText(id)-then-walk-up approach, which was previously (wrongly)
  // blamed for T17's failures; see the module docstring's "T17 RE-ENABLED"
  // section for the real root cause (a hook envelope-shape bug that made
  // /my-bookings always render its empty state, so no row — and no button —
  // ever existed for either locator to find). Inverting the direction is
  // still preferable: `getByRole('button', ...)` matches on the accessible
  // name (unaffected by whether the label text is a direct child or nested
  // in an icon+text wrapper), so it sidesteps the raw-text-node fragility a
  // `normalize-space(text())` xpath predicate has.
  //
  // The id and the button live in SIBLING subtrees whose nearest common
  // ancestor is the `div.flex.items-start.justify-between` row wrapper
  // (src/pages/MyBookings.tsx:54) — walking up from the button to the
  // nearest ancestor <div> whose subtree contains FIXTURE_LISTING_ID lands
  // on that same row, scoping this to THIS listing's row specifically. The
  // fixture listing accumulates bookings with no guaranteed ordering from
  // `/api/bookings/mine`, so if this account ever held more than one active
  // booking (only possible across different listings — one per listing is
  // enforced by the unique index), this filters to the one row that
  // actually matches FIXTURE_LISTING_ID rather than any Cancel Booking
  // button on the page.
  const activeBookingRow = page
    .getByRole('button', { name: 'Cancel Booking' })
    .locator(`xpath=ancestor::div[.//*[contains(text(),"${FIXTURE_LISTING_ID}")]][1]`)
    .first();

  if ((await activeBookingRow.count()) === 0) {
    console.log(
      '[T17 precondition] no active (REQUESTED) booking exists yet for this requester against ' +
      'FIXTURE_LISTING_ID — nothing to cancel, proceeding straight to booking.',
    );
    return;
  }

  await activeBookingRow.getByRole('button', { name: 'Cancel Booking' }).click();
  // AlertDialogContent renders in a Radix portal (outside activeBookingRow's
  // own subtree), so the confirm button must be located at the page level.
  const confirmButton = page.getByRole('button', { name: 'Yes, cancel' });
  await expect(confirmButton).toBeVisible({ timeout: 10_000 });

  const cancelPutPromise = page.waitForResponse(
    (r) => /\/api\/bookings\/.+\/cancel$/.test(r.url()) && r.request().method() === 'PUT',
    { timeout: 15_000 },
  );
  await confirmButton.click();
  const cancelPutResp = await cancelPutPromise;
  expect(cancelPutResp.ok(), 'PUT /api/bookings/:id/cancel (T17 precondition cleanup) must respond 2xx').toBe(true);

  // Confirm the cancel actually took effect (not just that the request
  // returned 2xx): once useCancelBooking's onSuccess invalidates
  // ['my-bookings'] and it refetches, the same row-matching locator (listing
  // id + a live Cancel Booking button) must no longer resolve to anything.
  await expect(activeBookingRow).toHaveCount(0, { timeout: 10_000 });

  console.log(
    '[T17 precondition] cancelled a pre-existing active booking for this requester against FIXTURE_LISTING_ID.',
  );
}

test('T16 — anon: panel is genuinely interactive, but submit never books and never fakes success', async ({ page }) => {
  await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
  await page.waitForLoadState('domcontentloaded');

  // ── POSITIVE CONTROLS FIRST ──
  await expect(page.getByRole('heading', { name: 'Request a viewing time' })).toBeVisible({ timeout: 15_000 });
  const firstDatePill = page.locator('[data-testid^="viewing-date-pill-"]').first();
  await expect(firstDatePill).toBeVisible({ timeout: 10_000 });
  const submitButton = page.getByTestId('request-viewing-btn');
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toHaveText('Sign in to request viewing');
  await expect(submitButton).toBeDisabled();

  // Select a date, then a time slot — proves the panel is genuinely
  // INTERACTIVE for an anonymous visitor (Option A / #1797).
  await firstDatePill.click();
  const firstTimeSlot = page.locator('[data-testid^="viewing-time-slot-"]').first();
  await expect(firstTimeSlot).toBeVisible({ timeout: 10_000 });
  await firstTimeSlot.click();
  await expect(submitButton).toBeEnabled({ timeout: 10_000 });

  // Register a real network listener BEFORE the click — the strongest form
  // of "it did not silently succeed": a real request-issued check, not a
  // bare `.not.toBeVisible()` on the success testid alone.
  let bookingPostFired = false;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/bookings')) {
      bookingPostFired = true;
    }
  });

  await submitButton.click();

  // Anon path stores intent in sessionStorage and opens the auth modal
  // (ViewingRequestPanel.tsx:234-243) — assert the real sign-in affordance
  // that modal renders (AuthModalContext.tsx mounts <AuthForms> inside a
  // Dialog; AuthForms reuses the same #signin-email id the real /auth page
  // uses — see e2e/helpers.ts's loginAsUser).
  await expect(page.locator('#signin-email')).toBeVisible({ timeout: 10_000 });

  await expect(page.getByTestId('viewing-request-success')).toHaveCount(0);
  expect(bookingPostFired, 'no POST /api/bookings must ever be issued for an anonymous submit attempt').toBe(false);
});

// T17 — DESCOPED pending a follow-up issue fixing `cancelAnyOwnActiveBooking`'s
// row-detection xpath. See the module docstring's "T17 DESCOPED" section for
// the full mechanism and rationale: this `if` is a module-load-time
// non-registration guard (never `test.skip`/`test.fixme`), permanently
// `false` today, so this test never enters Playwright's model for any
// project. T17 remains fully authored and unweakened below, re-enablable by
// flipping `T17_ENABLED` to `true` once the follow-up issue lands.
if (T17_ENABLED) {
test('[role:user] T17 — authed: real booking POST succeeds; success state renders; row appears on /my-bookings', async ({ page }) => {
  // Self-healing precondition — FIXTURE_LISTING_ID is a shared fixture
  // listing that is NEVER cleaned up between runs, and the seeded DB state
  // may already carry an active (REQUESTED) booking from a previous run of
  // THIS test. See cancelAnyOwnActiveBooking's doc comment for the full
  // rationale (real UNIQUE INDEX constraint, why tuple-selection could never
  // have worked, and why cancel-first is correct). Idempotent either way —
  // it is a no-op when no active booking exists yet.
  await cancelAnyOwnActiveBooking(page);

  await page.goto(`/listing/${FIXTURE_LISTING_ID}`);
  await page.waitForLoadState('domcontentloaded');

  // Authed-only positive early — a broken/expired storageState must fail
  // this immediately (mirrors listing-detail-gating.canonical.ts's T12).
  await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole('heading', { name: 'Request a viewing time' })).toBeVisible({ timeout: 15_000 });

  // Note trap (ViewingRequestPanel.tsx:197-215): a sessionStorage intent
  // restore can auto-repopulate date/time once `user` becomes truthy. This
  // canonical harness gives every test a fresh browser context (no prior
  // anon attempt ran in THIS context/session), so sessionStorage is empty
  // and no restore fires here.
  //
  // Which date/time-slot tuple gets picked is irrelevant to the constraint
  // that actually matters here. idx_one_active_booking_per_user_listing
  // (backend/.../db/migration/V45) is a UNIQUE INDEX scoped to
  // (listing_id, requester_id) ONLY — requested_date/requested_time_slot are
  // NOT part of it — so it is the precondition cancel above, not tuple
  // choice, that keeps this test's POST clear of a 409. With that handled,
  // simply picking the first quick-pick date and first time slot is safe and
  // deterministic.
  const firstDatePill = page.locator('[data-testid^="viewing-date-pill-"]').first();
  await expect(firstDatePill).toBeVisible({ timeout: 10_000 });
  await firstDatePill.click();
  const selectedDateTestId = await firstDatePill.getAttribute('data-testid');
  const selectedDateIso = (selectedDateTestId ?? '').replace('viewing-date-pill-', '');
  expect(selectedDateIso, 'must have resolved a real selected-date iso from the pill testid').toBeTruthy();

  const firstTimeSlot = page.locator('[data-testid^="viewing-time-slot-"]').first();
  await expect(firstTimeSlot).toBeVisible({ timeout: 10_000 });
  await firstTimeSlot.click();
  const selectedSlotTestId = await firstTimeSlot.getAttribute('data-testid');
  const selectedSlot = (selectedSlotTestId ?? '').replace('viewing-time-slot-', '');
  expect(selectedSlot, 'must have resolved a real selected time slot from the slot testid').toBeTruthy();

  const submitButton = page.getByTestId('request-viewing-btn');
  await expect(submitButton).toHaveText('Request viewing time');
  await expect(submitButton).toBeEnabled({ timeout: 10_000 });

  const bookingPostPromise = page.waitForResponse(
    (r) => r.url().includes('/api/bookings') && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await submitButton.click();
  const bookingPostResp = await bookingPostPromise;
  expect(bookingPostResp.ok(), 'POST /api/bookings must respond 2xx for an authed submit').toBe(true);
  // T17b links to THIS booking by id (BookingResponse.id) — captured from the real response, never re-derived.
  const createdBooking = (await bookingPostResp.json()) as { id?: string };
  expect(createdBooking.id, 'POST /api/bookings must return the created booking id').toBeTruthy();
  t17Booking = { id: String(createdBooking.id), date: selectedDateIso, slot: selectedSlot };

  // MIRROR CONTROL — proves the testid T16 asserts absent CAN genuinely
  // render, making T16's negative assertion meaningful rather than vacuous.
  await expect(page.getByTestId('viewing-request-success')).toBeVisible({ timeout: 10_000 });

  const myBookingsPromise = page.waitForResponse(
    (r) => r.url().includes('/api/bookings/mine') && r.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await page.goto('/my-bookings');
  const myBookingsResp = await myBookingsPromise;
  expect(myBookingsResp.ok(), 'GET /api/bookings/mine must respond 2xx').toBe(true);
  await page.waitForLoadState('domcontentloaded');

  // BookingCard (src/pages/MyBookings.tsx) renders the raw listingId (no
  // testid on these rows) plus the requested date/time slot verbatim — no
  // listing title is shown on this page, so match on those three real,
  // specific values instead.
  //
  // Anchor on rendered CONTENT, not a Tailwind utility class (a layout tweak
  // would silently break a class-based selector — see BookingCard's
  // `div.space-y-2` wrapper, which this file previously anchored on and
  // listing-lifecycle.canonical.ts's own "Card is the nearest ancestor..."
  // comment already argues against for the same reason). BookingCard nests
  // the listingId `<p>` and the date/time `<span>`
  // pair as siblings under the SAME `div.space-y-1` (MyBookings.tsx:55-72),
  // so walking up from the listingId text to the nearest ancestor <div> that
  // also contains BOTH the exact requested date and the exact requested time
  // slot lands on that same row's container, using only real, semantically
  // meaningful rendered content as the anchor.
  //
  // FIXTURE_LISTING_ID is a shared fixture listing that is never cleaned up,
  // so repeated runs accumulate multiple bookings against it, and
  // /api/bookings/mine's ordering is not guaranteed anywhere in this file,
  // useMyBookings, or the backend. `.first()` must therefore be applied AFTER
  // the date/slot ancestor filter, not on the raw listingId match — narrowing
  // to `.first()` before filtering can bind to an older run's row (whose
  // subtree lacks this run's date/slot) and make the closing assertions time
  // out on a perfectly healthy app.
  const listingIdNode = page.getByText(FIXTURE_LISTING_ID, { exact: false });
  // Positive control: prove /my-bookings actually rendered booking rows for
  // this fixture listing at all, so a blank/errored page fails loudly here
  // instead of producing a confusing narrow-selector timeout below.
  await expect(listingIdNode.first()).toBeVisible({ timeout: 10_000 });
  const bookingRow = listingIdNode.locator(
    `xpath=ancestor::*[self::div][.//*[contains(text(),"${selectedDateIso}")]][.//*[contains(text(),"${selectedSlot}")]][1]`,
  ).first();
  await expect(bookingRow.getByText(selectedDateIso, { exact: false })).toBeVisible();
  await expect(bookingRow.getByText(selectedSlot, { exact: true })).toBeVisible();
});

// T17b (J10) — the broker who OWNS the booked listing sees THE SAME booking on /broker/bookings.
//
// OWNERSHIP (an arranged precondition, stated so it is never mistaken for a proven one): a booking's broker is the listing's
// created_by (BookingService.createBooking), and GET /api/bookings/broker returns only the caller's own. The seeded fixture
// listing T17 books belongs to the synthetic fixture broker, not to this run's generated broker, so
// scripts/e2e/auth-stack/create-users.sh hands that one listing to the run's broker (per-run, disposable fixture only, no grant
// changed) right after the role users are created. Without it this test would find nothing for a reason that looks like a product bug.
//
// PLACEMENT: tagged [role:user] on purpose (canonical-user), declared right after T17 — the two share `t17Booking` through
// module scope, which only works inside one project's queue (see listing-lifecycle.canonical.ts' PROJECT-TOPOLOGY note). The
// in-test identity switch is the established T14 pattern: clear the page's storage and perform a REAL UI sign-in as the broker
// on the same tracked page (a second untracked context would escape installNoApiMockGuard).
//
// FALSIFIABLE: the match is on the booking ID returned by T17's POST, in the broker's own API response, plus the UI row carrying
// the same date and slot. A different/missing booking id, or a broker who does not own the listing, fails the id assertion.
test('[role:user] T17b — the broker who owns the booked listing sees the same booking on /broker/bookings', async ({ page }) => {
  if (!t17Booking) {
    throw new Error('[T17b] T17 did not record its booking (T17 failed or was not run before T17b in this project).');
  }
  if (!hasRealCredentials(brokerEmail, brokerPassword)) {
    throw new Error('[T17b] BROKER_EMAIL/PASSWORD absent — this test needs the broker credential IN ADDITION to the user credential that put it in canonical-user.');
  }
  const booking = t17Booking;

  // This default page starts as the signed-in USER (project storageState). Become the broker through the real sign-in form.
  await page.goto('/my-bookings');
  await expect(page.getByRole('heading', { name: 'My Bookings', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();

  await loginAsBroker(page, brokerEmail, brokerPassword);
  await expect(page.getByRole('link', { name: 'Broker dashboard', exact: true })).toBeVisible({ timeout: 15_000 });

  const brokerBookingsPromise = page.waitForResponse(
    (r) => /\/api\/bookings\/broker(\?|$)/.test(r.url()) && r.request().method() === 'GET',
    { timeout: 20_000 },
  );
  await page.goto('/broker/bookings');
  const brokerBookingsResp = await brokerBookingsPromise;
  expect(brokerBookingsResp.ok(), 'GET /api/bookings/broker must respond 2xx').toBe(true);

  // The broker's own API response carries THE booking T17 created, by id, for the booked listing, still REQUESTED.
  const body = (await brokerBookingsResp.json()) as { items?: Array<{ id: string; listingId: string; status: string; requestedDate: string; requestedTimeSlot: string }> };
  const items = body.items ?? [];
  expect(items.length, 'CONTROL: the broker\'s booking list must be non-empty (an unowned listing yields an empty list)').toBeGreaterThan(0);
  const mine = items.find((b) => b.id === booking.id);
  expect(mine, `T17 booking ${booking.id} must be in the owning broker's /api/bookings/broker response (got ids: ${items.map((b) => b.id).join(', ')})`).toBeTruthy();
  expect(mine?.listingId).toBe(FIXTURE_LISTING_ID);
  expect(mine?.status).toBe('REQUESTED');
  expect(mine?.requestedDate).toBe(booking.date);
  expect(mine?.requestedTimeSlot).toBe(booking.slot);

  // And the page renders it: Pending Requests carries a card with the same date and time slot, with the Confirm/Decline actions.
  await expect(page.getByRole('heading', { name: 'Booking Requests', exact: true })).toBeVisible({ timeout: 15_000 });
  const pendingCard = page
    .getByRole('button', { name: 'Confirm', exact: true })
    .locator(`xpath=ancestor::div[.//*[contains(text(),"${booking.date}")]][.//*[contains(text(),"${booking.slot}")]][1]`)
    .first();
  await expect(pendingCard, 'the broker page must render a pending card with the T17 booking\'s date and slot').toBeVisible({ timeout: 15_000 });
  await expect(pendingCard.getByText(booking.date, { exact: false })).toBeVisible();
  await expect(pendingCard.getByText(booking.slot, { exact: true })).toBeVisible();
});
}
