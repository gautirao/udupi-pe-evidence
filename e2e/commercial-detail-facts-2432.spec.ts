/**
 * Issue #2432 — BEFORE/AFTER visual evidence for subtype-aware Commercial listing detail.
 *
 * Not a canonical spec (it lives outside e2e/canonical/), so `test` comes from @playwright/test,
 * matching every other spec under e2e/. A canonical spec would have to import from
 * ./support/canonical-test to keep the no-mock guard armed.
 *
 * Run as:
 *   CAPTURE_MODE=after  bash scripts/run-e2e-local.sh --project=full commercial-detail-facts-2432
 *   CAPTURE_MODE=before bash scripts/run-e2e-local.sh --project=full commercial-detail-facts-2432
 *
 * BEFORE is produced by reverting ListingDetailMainContent.tsx to origin/main, which unmounts the
 * section; nothing in this spec fakes that state.
 *
 * ── Why the non-empty control exists ─────────────────────────────────────────────────────────
 * The canonical fixture carried ZERO Commercial rows until 212672d3. Against an empty dataset a
 * "the Commercial section renders correctly" assertion cannot distinguish a working feature from
 * nothing to render, and a broken page scores BETTER on negative assertions than a working one.
 * So every arm here first proves the page is genuinely populated, and the AFTER arm asserts a
 * positive fact COUNT rather than mere presence.
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsUser } from './helpers';

const MODE = (process.env.CAPTURE_MODE ?? 'after').toLowerCase();
const OUT_DIR = path.resolve('docs/pr-evidence/issue-2432');

/** SHOP row from the #2517 Commercial seed — typed facts applied by the second-pass UPDATE. */
const SHOP_LISTING_ID = 'c0110001-0000-0000-0000-000000000001';
/** Legacy pre-V102 row: property_type='commercial' with NO subtype on either axis (#1742). */
const LEGACY_LISTING_ID = 'c0110001-0000-0000-0000-000000000006';

const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';

const VIEWPORTS = [
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
] as const;

function shot(name: string): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, `${MODE}-${name}.png`);
}

/**
 * Proves the detail page is genuinely loaded and populated before anything is concluded from it.
 * A blank page, a 404 or an auth bounce would otherwise satisfy every negative assertion below.
 */
async function assertPageIsAlive(page: Page, expectedTitleFragment: string) {
  await expect(page.getByText(expectedTitleFragment, { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
  const specsGrid = page.getByTestId('listing-specs-grid');
  await expect(specsGrid).toBeVisible({ timeout: 15_000 });
}

test.describe(`@commercial-detail-2432 Commercial listing detail — ${MODE}`, () => {
  test.skip(
    !userEmail || !userPassword,
    'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not set — typed Commercial facts are auth-only',
  );

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, userEmail, userPassword);
  });

  for (const vp of VIEWPORTS) {
    test(`SHOP listing at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/listing/${SHOP_LISTING_ID}`);
      await page.waitForLoadState('domcontentloaded');

      await assertPageIsAlive(page, 'Shop Unit');

      const section = page.getByTestId('commercial-specs-section');

      if (MODE === 'after') {
        await expect(section).toBeVisible({ timeout: 15_000 });

        // Positive count, not mere presence: an empty section would still be "visible".
        const factCount = await page.locator('[data-testid^="commercial-fact-"]').count();
        expect(factCount, 'the Commercial section must render actual facts').toBeGreaterThan(0);

        // Specific seeded values, so the arm cannot pass on an unrelated render.
        await expect(page.getByTestId('commercial-fact-hub-type')).toContainText('High street');
        await expect(page.getByTestId('commercial-fact-washrooms-public')).toContainText('2');
        await expect(page.getByTestId('commercial-fact-washrooms-private')).toContainText('1');

        // public/private stay distinct — never summed into one "3 washrooms" row.
        const publicW = await page.getByTestId('commercial-fact-washrooms-public').innerText();
        const privateW = await page.getByTestId('commercial-fact-washrooms-private').innerText();
        expect(publicW).not.toEqual(privateW);

        // NO generic-row supersession assertion here — deliberately, and this is a FINDING
        // rather than an omission.
        //
        // An earlier revision asserted that `listing-specs-grid` does NOT contain "Washrooms",
        // to evidence the generic row being superseded by its typed twin. That assertion PASSED,
        // and it was vacuous: it passed because the generic row was never rendered at all, not
        // because supersession removed it.
        //
        // Proven, not assumed — reverting BOTH ListingSpecsGrid.tsx and ListingDetailMainContent
        // .tsx to origin/main (a complete pre-change tree) and re-running leaves the generic row
        // still absent, so this change cannot be what removes it. The cause is the fixture:
        // commercial-listings-seed.sql sets `washrooms` only on listing_commercial_space_details,
        // never on the flat property_listings column, while ListingResponseMapper:432 maps
        // ListingResponse.washrooms from that FLAT column via l.getWashrooms(). It is null for
        // every seeded Commercial row, so there is no generic row to supersede.
        //
        // Supersession is covered where it CAN be falsified: commercialDetailModel.test.ts pairs
        // each case with a legacy control, validated against an unconditional-suppression mutant
        // under which Arm A passed and Arm B FAILED. Browser-level proof would need a fixture row
        // with the flat column and its typed twin both populated; none exists today.
      } else {
        await expect(section).toHaveCount(0);
      }

      await page.screenshot({ path: shot(`shop-${vp.name}`), fullPage: true });
    });
  }

  test('legacy NULL-subtype row renders honestly at desktop-1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/listing/${LEGACY_LISTING_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await assertPageIsAlive(page, 'Legacy Commercial Unit');

    // #1742 — the row has no subtype on either axis. It must never acquire one.
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/Commercial Shop|Commercial Office/);

    // Its generic rows survive: nothing supersedes them, because no typed twin is populated.
    await expect(page.getByTestId('listing-specs-grid')).toBeVisible();

    await page.screenshot({ path: shot('legacy-desktop-1366x768'), fullPage: true });
  });
});
