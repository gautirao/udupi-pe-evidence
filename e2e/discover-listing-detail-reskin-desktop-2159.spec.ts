/**
 * Issue #2159 (phase 2, PR #2180) — Listing-detail reskin, desktop (1366x768)
 * evidence. Review 4945543247 (head 6da23aa5) accepted everything else as
 * MATCHED but flagged one gap: only mobile had a committed Playwright spec;
 * the desktop 1366×768 claim was prose-only ("manual browser check" in a PR
 * comment), which is not accepted under this PR's evidentiary contract —
 * only committed, CI-inspectable tests count. This is that test, modeled
 * directly on e2e/discover-listing-detail-reskin-mobile-2159.spec.ts (real
 * dev backend, no page.route() mocks).
 *
 * Covers the reviewer's exact ask:
 *   1. Enter listing detail from the real Area-selected results context
 *      (same JP Nagar node= as the mobile spec), not a synthetic direct
 *      /listing/:id deep link.
 *   2. The materially reskinned detail surface is present at 1366×768 —
 *      hero gallery, title, price/facts block, and the existing primary
 *      actions (viewing-request panel, save, desktop share button) are all
 *      visible.
 *   3. No layout/primary-action obstruction at this viewport — no
 *      horizontal overflow, and the sidebar viewing-request panel doesn't
 *      overlap the main content column.
 *   4. Browser Back returns to the same canonical Area node=/query context
 *      (byte-identical), with listing cards visible again.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5230 ./node_modules/.bin/playwright test \
 *     e2e/discover-listing-detail-reskin-desktop-2159.spec.ts --project=full
 */
import { test, expect } from '@playwright/test';

const AREA_NODE = 'a:IN|KA|Bengaluru|JP Nagar';
const AREA_URL =
  `/discover?city=bangalore&node=${encodeURIComponent(AREA_NODE)}` +
  `&lat=12.90755&lon=77.58744&zoom=14`;

async function dismissConsentBannerIfPresent(page: import('@playwright/test').Page): Promise<void> {
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
}

function currentNodeParam(page: import('@playwright/test').Page): string | null {
  return new URL(page.url()).searchParams.get('node');
}

test.describe('#2159 Listing-detail reskin — desktop (1366x768) evidence', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('reskinned detail surface renders with no layout obstruction, node= survives Area -> Listing -> Back', async ({
    page,
  }) => {
    // Start from the real Area-selected results state — the same
    // representative node= the mobile spec uses — so the listing reached
    // below is a genuine real-user path, not a synthetic direct
    // /listing/:id deep link.
    await page.goto(AREA_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissConsentBannerIfPresent(page);

    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 20_000 });
    expect(currentNodeParam(page), 'fixture sanity: the representative URL must carry the JP Nagar node').toBe(AREA_NODE);

    // Real backend, real listing — no mocked navigation.
    const firstCard = page.locator('[data-testid="listing-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    await page.waitForURL(/\/listing\//, { timeout: 15_000 });

    // 2. The materially reskinned detail surface is present: hero gallery,
    // title, price/facts block, and the existing primary actions (viewing-
    // request panel, save, desktop share) are all visible at 1366×768.
    const gallerySection = page.locator('img[alt="Property image"]').first();
    await expect(gallerySection, 'hero gallery image must be visible').toBeVisible({ timeout: 15_000 });

    const title = page.getByRole('heading', { level: 1 });
    await expect(title, 'listing title (h1) must be visible').toBeVisible({ timeout: 10_000 });

    const shareBtn = page.getByTestId('gallery-share-btn');
    await expect(shareBtn, 'desktop gallery share button must be visible').toBeVisible({ timeout: 10_000 });

    const saveBtn = page.getByTestId('gallery-save-btn');
    await expect(saveBtn, 'desktop gallery save button must be visible').toBeVisible({ timeout: 10_000 });

    const viewingPanel = page.locator('#viewing-request-panel');
    await expect(viewingPanel, 'sidebar viewing-request panel must be visible').toBeVisible({ timeout: 10_000 });

    // Price/facts block — the badges + serif title + mono price block
    // (ListingDetailMainContent.tsx's Summary DetailSection). Scoped by
    // "For sale"/"For rent" badge text, present for any live residential
    // listing regardless of exact price shape (exact/band/on-request).
    const purposeBadge = page.getByText(/for sale|for rent/i).first();
    await expect(purposeBadge, 'purpose badge (For sale/For rent) must be visible').toBeVisible({ timeout: 10_000 });

    // 3a. No horizontal overflow at 1366px.
    const scrollWidths = await page.evaluate(() => ({
      documentElement: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(scrollWidths.documentElement, 'document.documentElement must not overflow the 1366px viewport').toBeLessThanOrEqual(1366);
    expect(scrollWidths.body, 'document.body must not overflow the 1366px viewport').toBeLessThanOrEqual(1366);

    // 3b. No overlap between the main content column and the sidebar's
    // viewing-request panel — a real two-column layout, not one column
    // clipping/covering the other.
    const titleBox = await title.boundingBox();
    const panelBox = await viewingPanel.boundingBox();
    expect(titleBox, 'title must have a real layout box').not.toBeNull();
    expect(panelBox, 'viewing-request panel must have a real layout box').not.toBeNull();
    const mainContentRightEdge = titleBox!.x + titleBox!.width;
    expect(
      panelBox!.x,
      'the sidebar viewing-request panel must not start to the left of where the main content column ends (no overlap)',
    ).toBeGreaterThanOrEqual(mainContentRightEdge);

    // 4. node= continuity — browser Back from the listing-detail page
    // returns to the SAME Area-selected results state (byte-identical
    // node=), with the listing cards visible again.
    await page.goBack();
    await expect.poll(() => currentNodeParam(page), {
      message: 'node= must be byte-identical to AREA_NODE after Back from listing-detail',
      timeout: 10_000,
    }).toBe(AREA_NODE);
    await expect(page.locator('[data-testid="listing-card"]').first(), 'listing cards must be visible again after Back').toBeVisible({
      timeout: 10_000,
    });
  });
});
