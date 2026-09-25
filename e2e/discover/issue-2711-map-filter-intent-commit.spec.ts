/**
 * Issue #2711 — MapFilterSheet's "Apply" must commit the staged Buy/Rent intent through the
 * SAME canonical `setIntent` (city.ts) List's Buy/Rent control uses, so Map's intent+filters
 * write is byte-identical to List's for the same starting state (List/Map parity, AC3) — not a
 * silent no-op (the pre-fix defect: `onIntentChange` was never called from `handleApply`).
 *
 * See apps/web/src/features/discover/components/map/MapFilterSheet.tsx's own `handleApply`
 * comment (Issue #2711 marker) for the production-code side of this contract, and
 * `apps/web/src/features/discover/filters/intentTransition.ts` for the ONE canonical
 * transition rule (Issue #2708) both List (`city.ts`'s `setIntent`) and Map
 * (`handleSelectIntent`) apply.
 *
 * ## Mechanics this spec depends on (read before editing)
 *
 * - Opening the sheet does `window.history.pushState({mapFilterSheet: true}, '')` — ONE new
 *   history entry, same URL as whatever was current. Cancel AND Apply both call
 *   `consumeHistoryEntry()` (`window.history.back()`) exactly once on close, so `history.length`
 *   nets `+1` across a full open → configure → Apply cycle regardless of what happened while the
 *   sheet was open (a `pushState` is never undone by `back()` — `length` only grows on push).
 *   This is what AC1 ("exactly one history entry per Apply action, not two") actually reduces
 *   to observationally: assert the delta once, don't try to catch the sheet's internal
 *   push/back pair as two separate events.
 * - `onIntentChange` (List's `setIntent`, city.ts) is a SYNCHRONOUS single `replaceState`
 *   covering intent + type + price in one atomic write.
 * - `onApply` (`handleFiltersChange` → `urlActions.setFiltersLive`) is a **debounced (300ms)
 *   replace** — the same writer `e2e/discover/issue-2528-back-forward-filter-sync.spec.ts`'s
 *   own header documents ("Every visible filter control writes the URL through
 *   `setFiltersLive`, which is `{replace:true}` and debounced 300ms"). `handleApply` calls
 *   `consumeHistoryEntry()` (a synchronous `history.back()`) immediately after firing that
 *   debounced write, without an explicit flush — so there is a real window in which the debounced
 *   write can land on the WRONG history entry (the one `back()` already moved to) rather than the
 *   one it was scheduled against. This is exactly the "racing/double writes" class AC1 exists to
 *   catch; this spec waits out the debounce window (via `expect.poll`, never a bare sleep used as
 *   the actual oracle) before reading the "final" URL so a race like that is observed, not masked
 *   by reading too early.
 *
 * ## Fixture
 *
 * Reuses `e2e/discover/mobile-map-filters-2712.spec.ts`'s own city/node
 * (`bangalore` / `d:southeast`) and its `openDirectionInMobileMap` / `openFilterSheet` pattern —
 * real seeded backend data, not `/api/**` stubbing (this file family's established convention).
 *
 * Run: `bash scripts/run-e2e-local.sh --project=full issue-2711-map-filter-intent-commit`
 * NOTE: `run-e2e-local.sh` appends `--project=smoke` when no `--project` is given, and
 * `smoke`'s testMatch is an allowlist this file is not on — omit it and the run reports
 * "No tests found" instead of failing (see #2528's own spec header for the same gotcha).
 */
import { test, expect, type Page } from '@playwright/test';
import { assertReachable } from '../support/reachability';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const D_S = 'd:southeast';
const VIEWPORT = { width: 390, height: 844 };

// Residential Buy/Rent budget bands (PropertyFilterGroups.tsx QUICK_BUDGET_BANDS.residential) —
// used as the "budget-range case" filter; values are baked into that constant, not derived.
const BUY_BUDGET_MAX = 5_000_000; // "≤ ₹50L"
const RENT_BUDGET_MAX = 15_000; // "≤ ₹15,000/month"

function baselineUrl(extraParams: string): string {
  return `/discover?${BASE}&node=${encodeURIComponent(D_S)}${extraParams}`;
}

async function declineTelemetryIfPresent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

/** Lands on the D:southeast node in LIST view (control bar + intent selector reachable). */
async function gotoListBaseline(page: Page, extraParams = ''): Promise<void> {
  await page.goto(baselineUrl(extraParams));
  await page.waitForLoadState('domcontentloaded');
  await declineTelemetryIfPresent(page);
  await expect(page.getByTestId('control-bar-map-trigger')).toBeVisible({ timeout: 15_000 });
}

/** From List view, enters the mobile full-screen Map overlay. */
async function enterMobileMap(page: Page): Promise<void> {
  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await assertReachable(page, mapTrigger);
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

/** Opens the MapFilterSheet via its pill trigger. */
async function openFilterSheet(page: Page): Promise<void> {
  const pill = page.getByTestId('map-filters-pill');
  await assertReachable(page, pill);
  await pill.click();
  await expect(page.getByTestId('map-filter-sheet')).toBeVisible({ timeout: 10_000 });
}

function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

function intentParam(page: Page): string {
  return new URL(page.url()).searchParams.get('intent') ?? 'buy';
}

function typeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('type');
}

function priceMaxParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('priceMax');
}

/**
 * AC3 fix — the Map arm's own `enterMobileMap()` step legitimately writes `lat`/`lon`/`zoom`
 * (the mobile Map overlay's camera committing its viewport), which the List arm never opens and
 * so never carries — a real, expected difference orthogonal to what AC3 tests (intent+filters
 * parity). Strips those three before comparing so the assertion is actually about the thing this
 * issue is about, not an unrelated viewport-commit side effect of entering the Map at all.
 */
function withoutViewportParams(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('lat');
  parsed.searchParams.delete('lon');
  parsed.searchParams.delete('zoom');
  return parsed.toString();
}

/** Waits for the debounced `setFiltersLive` write (and any queued `history.back()`) to settle,
 * using the URL's own `intent` param reaching the expected value as the observable — never a
 * bare timeout as the oracle itself (a bare wait only pads it, per this repo's flakiness rules). */
async function waitForIntentSettled(page: Page, expected: 'buy' | 'rent'): Promise<void> {
  await expect.poll(() => intentParam(page), { timeout: 5_000, message: `intent settles to ${expected}` }).toBe(
    expected,
  );
}

test.describe('@integration-ui #2711 — MapFilterSheet Apply commits Buy/Rent intent (List/Map parity)', () => {
  test.use({ viewport: VIEWPORT });

  // ── AC1 — atomicity: exactly one history entry added per Apply, not two ──────────────────
  test('AC1 — Map → Filters → Rent + budget → Apply adds exactly one history entry', async ({ page }) => {
    await gotoListBaseline(page);
    await enterMobileMap(page);

    const baselineLength = await historyLength(page);
    const baselineUrlStr = page.url();

    await openFilterSheet(page);
    await page.getByTestId('map-filter-sheet-intent-rent').click();
    await expect(page.getByTestId('map-filter-sheet-intent-rent')).toHaveAttribute('aria-pressed', 'true');

    // Engage a real filter while staged (rent budget band — valid post-transition, per AC1's
    // own "set a filter" instruction).
    await page.getByTestId(`quick-chip-budget-${RENT_BUDGET_MAX}`).click();
    await expect(page.getByTestId(`quick-chip-budget-${RENT_BUDGET_MAX}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTestId('map-filter-sheet-apply').click();
    await expect(page.getByTestId('map-filter-sheet')).toHaveCount(0);

    // Let the debounced setFiltersLive write (and the sheet's own history.back()) fully settle
    // before reading the final length — reading too early would only prove the synchronous half.
    await waitForIntentSettled(page, 'rent');

    const afterLength = await historyLength(page);
    expect(
      afterLength - baselineLength,
      `history.length: baseline=${baselineLength} url=${baselineUrlStr}, after=${afterLength} url=${page.url()}`,
    ).toBe(1);

    // AC1's "not racing" half, in URL terms: the settled URL must carry BOTH the intent commit
    // AND the filter commit — not one at the expense of the other (the exact failure shape a
    // debounced write landing on the wrong history entry after an unflushed back() would produce).
    expect(intentParam(page), `final URL: ${page.url()}`).toBe('rent');
    expect(priceMaxParam(page), `final URL: ${page.url()}`).toBe(String(RENT_BUDGET_MAX));
  });

  // ── AC2 — Back-button cleanliness ─────────────────────────────────────────────────────────
  test('AC2 — browser Back after Apply lands cleanly on the pre-open state, no intermediate hop', async ({
    page,
  }) => {
    await gotoListBaseline(page);
    await enterMobileMap(page);

    const preOpenUrl = page.url();

    await openFilterSheet(page);
    await page.getByTestId('map-filter-sheet-intent-rent').click();
    await page.getByTestId(`quick-chip-budget-${RENT_BUDGET_MAX}`).click();
    await page.getByTestId('map-filter-sheet-apply').click();
    await expect(page.getByTestId('map-filter-sheet')).toHaveCount(0);
    await waitForIntentSettled(page, 'rent');

    const postApplyUrl = page.url();
    expect(postApplyUrl, 'Apply must actually change the URL from the pre-open state').not.toBe(preOpenUrl);

    await page.goBack();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);

    // Decisive: one Back from the post-Apply state must land EXACTLY on the pre-open URL — no
    // partial (e.g. intent committed but budget not, or vice versa) state ever observable as a
    // distinct hop in between.
    await expect
      .poll(() => page.url(), { timeout: 5_000, message: `Back lands on pre-open URL (${preOpenUrl})` })
      .toBe(preOpenUrl);
    await expect(page.getByTestId('map-filter-sheet')).toHaveCount(0);
  });

  // ── AC3 — List/Map parity ─────────────────────────────────────────────────────────────────
  // Case 1: Buy → Rent, with a pre-existing Plot (residential_plot) filter that must be dropped
  // identically by both paths (Plot has no rental inventory contract — intentTransition.ts).
  test('AC3a — List Buy→Rent and Map sheet Buy→Rent→Apply produce an identical URL (Plot drop)', async ({
    page,
  }) => {
    const extra = '&type=residential_plot';

    // ── List arm ── List's `setIntent` (city.ts) re-derives `type`/`priceMin`/`priceMax`
    // straight from the CURRENT URLSearchParams — it needs no filter panel open/rendered, so
    // this arm only ever touches the always-reachable control-bar intent selector (confirmed
    // reachable at 390×844 by e2e/discover/control-bar-mobile-reachability-1953.spec.ts).
    await gotoListBaseline(page, extra);
    expect(typeParam(page), 'List arm baseline URL must carry the Plot filter').toBe('residential_plot');
    await page.getByTestId('intent-selector-rent').click();
    await expect.poll(() => intentParam(page), { timeout: 5_000 }).toBe('rent');
    const listUrl = page.url();

    // ── Map arm — SAME starting URL, fresh navigation ──
    await gotoListBaseline(page, extra);
    await enterMobileMap(page);
    await openFilterSheet(page);
    // The draft is seeded from the same URL-derived filters — Plot should already show pressed.
    await expect(page.getByTestId('quick-chip-residential_plot')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('map-filter-sheet-intent-rent').click();
    await page.getByTestId('map-filter-sheet-apply').click();
    await expect(page.getByTestId('map-filter-sheet')).toHaveCount(0);
    await waitForIntentSettled(page, 'rent');
    const mapUrl = page.url();

    expect(withoutViewportParams(mapUrl), `List URL=${listUrl} vs Map URL=${mapUrl}`).toBe(
      withoutViewportParams(listUrl),
    );
    expect(typeParam(page), 'Plot must be dropped on the Rent transition').toBeNull();
  });

  // Case 2: Rent → Buy, with a pre-existing budget filter that must reset identically.
  test('AC3b — List Rent→Buy and Map sheet Rent→Buy→Apply produce an identical URL (budget reset)', async ({
    page,
  }) => {
    const extra = `&intent=rent&priceMax=${RENT_BUDGET_MAX}`;

    // ── List arm ── (see AC3a's comment on why no filter panel needs to be open here)
    await gotoListBaseline(page, extra);
    expect(priceMaxParam(page), 'List arm baseline URL must carry the budget filter').toBe(
      String(RENT_BUDGET_MAX),
    );
    await page.getByTestId('intent-selector-buy').click();
    await expect.poll(() => intentParam(page), { timeout: 5_000 }).toBe('buy');
    const listUrl = page.url();

    // ── Map arm — SAME starting URL, fresh navigation ──
    await gotoListBaseline(page, extra);
    await enterMobileMap(page);
    await openFilterSheet(page);
    await expect(page.getByTestId(`quick-chip-budget-${RENT_BUDGET_MAX}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('map-filter-sheet-intent-buy').click();
    await page.getByTestId('map-filter-sheet-apply').click();
    await expect(page.getByTestId('map-filter-sheet')).toHaveCount(0);
    await waitForIntentSettled(page, 'buy');
    const mapUrl = page.url();

    expect(withoutViewportParams(mapUrl), `List URL=${listUrl} vs Map URL=${mapUrl}`).toBe(
      withoutViewportParams(listUrl),
    );
    expect(priceMaxParam(page), 'budget must reset on the Buy transition').toBeNull();
  });

  // ── AC5 (code-review follow-up) — a field the intent transition does NOT own, staged in the
  // SAME visit as an intent switch, must still commit — not be silently dropped just because
  // `onApply` can no longer also fire for an intent-changed Apply. Regression coverage for a
  // real reviewer-caught data-loss gap: `onIntentChange`'s `filtersOverride` now carries the
  // buyer's ENTIRE staged draft (`toDiscoverUrlFilters(draft)`), not just the intent-owned
  // propertyTypes/priceMin/priceMax subset — see MapFilterSheet.tsx's `handleApply` and
  // city.ts's `setIntent` for the production-code side.
  test('AC5 — a bedrooms edit staged alongside an intent switch is NOT dropped from the committed URL', async ({
    page,
  }) => {
    await gotoListBaseline(page);
    await enterMobileMap(page);
    await openFilterSheet(page);

    await page.getByTestId('quick-chip-2-bhk').click();
    await expect(page.getByTestId('quick-chip-2-bhk')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('map-filter-sheet-intent-rent').click();
    await expect(page.getByTestId('map-filter-sheet-intent-rent')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('map-filter-sheet-apply').click();
    await expect(page.getByTestId('map-filter-sheet')).toHaveCount(0);
    await waitForIntentSettled(page, 'rent');

    // Both the intent-owned write AND the unrelated staged field must be in the SAME committed
    // URL — the exact combination the pre-fix code silently dropped one half of.
    expect(intentParam(page), `final URL: ${page.url()}`).toBe('rent');
    expect(
      new URL(page.url()).searchParams.get('beds'),
      `beds must survive alongside the intent commit, final URL: ${page.url()}`,
    ).toBe('2');
  });

  // ── AC4 — Cancel / reopen commits nothing (regression guard) ─────────────────────────────
  test('AC4 — a staged intent switch that is Cancelled commits nothing, and reopening re-seeds from applied state', async ({
    page,
  }) => {
    await gotoListBaseline(page);
    await enterMobileMap(page);
    const preOpenUrl = page.url();

    await openFilterSheet(page);
    await page.getByTestId('map-filter-sheet-intent-rent').click();
    await expect(page.getByTestId('map-filter-sheet-intent-rent')).toHaveAttribute('aria-pressed', 'true');

    // Cancel, not Apply. The sheet has no explicit "Cancel" button (only "Clear all" +
    // "Show N …" in its footer) — dismissal is Escape / backdrop-tap / swipe-down, all routed
    // through `handleCancel` via the Drawer's `onOpenChange(false)` (see MapFilterSheet.tsx).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('map-filter-sheet')).toHaveCount(0);

    // Nothing committed — URL unchanged, no lingering debounced write ever lands.
    await page.waitForTimeout(500);
    expect(page.url(), 'Cancel must not write the staged intent to the URL').toBe(preOpenUrl);
    expect(intentParam(page)).toBe('buy');

    // Reopen — draft must re-seed from the (still-applied) Buy state, not the discarded Rent draft.
    await openFilterSheet(page);
    await expect(page.getByTestId('map-filter-sheet-intent-buy')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('map-filter-sheet-intent-rent')).toHaveAttribute('aria-pressed', 'false');
  });
});
