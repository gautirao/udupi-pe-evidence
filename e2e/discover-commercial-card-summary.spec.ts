import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * #2433 — regression guard for the Commercial card summary on the surface that
 * actually delivers it.
 *
 * <h2>Why this journey and not the default one</h2>
 *
 * Commercial FACTS reach a result card only through `/api/discover/listings`
 * (`DiscoverListingResponse`, full allowlist), which feeds `authViewportListings`
 * (#2015 committed VIEWPORT) and `polygonListings` (#2461). The default AREA
 * journey is fed by `/api/discover/cities/{city}/listings` -> `AreaListingCard`,
 * which carries 3 of the 15 `CommercialSummaryFacts`, so it renders no summary at
 * all. That gap is #2516's and is deliberately NOT asserted here — see below.
 *
 * <h2>Reachability is via URL state, not UI composition</h2>
 *
 * The scope is committed through `rscope=vp&rvp=...` rather than by driving the
 * "Search this area" control. A composition-based route dies on "that panel does
 * not mount here"; URL state reaches the data path regardless of what chrome
 * renders around it.
 *
 * `node` is REQUIRED alongside the scope. `useDiscoverListings` is gated on
 * `listingsEnabled`, which top-grouped journey states switch off (#1655), so a
 * bare `city + rscope=vp` fetches nothing and the panel stays empty. An earlier
 * attempt omitted it and measured 0 cards, which reads as "the feature is broken"
 * and is really "the query never ran".
 */

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bengaluru|Sanjeevini Nagar';
const AREA_NODE = `a:${AREA_KEY}`;
/** s,w,n,e around the seeded Commercial inventory (~12.9158..12.9164 / 77.5888..77.5893). */
const RVP = '12.90,77.57,12.93,77.61';

// process.cwd(), not __dirname: this project is ESM, where __dirname is undefined and
// throws at MODULE LOAD — which Playwright reports as "No tests found" rather than as a
// failing test. A collection error is silent and total.
const AUTH_STATE = path.join(process.cwd(), 'e2e', 'fixtures', 'user-auth.json');

const q = (s: string) => encodeURIComponent(s);
const VIEWPORT_URL =
  `/discover?city=${CITY}&node=${q(AREA_NODE)}&rscope=vp&rvp=${q(RVP)}`;

test.describe('#2433 Commercial card summary — authenticated VIEWPORT journey', () => {
  test.skip(
    !fs.existsSync(AUTH_STATE),
    'user-auth.json absent — global-setup did not run; environmental, not a product failure',
  );
  test.use({ storageState: AUTH_STATE });

  test('renders a Commercial summary carrying a real fact', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(VIEWPORT_URL);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 45_000 });

    const cards = await page.locator('[data-testid="listing-card"]').count();
    // The fixture must actually supply inventory here. Without this the summary
    // assertion below could pass vacuously over an empty result set — a filter
    // test against zero rows cannot fail.
    expect(cards, 'fixture precondition: the VIEWPORT must return listing cards')
      .toBeGreaterThan(0);

    const summaries = page.locator('[data-testid="listing-commercial-summary"]');
    const summaryCount = await summaries.count();

    // The actual guarantee. Deliberately >= 1 rather than a pinned literal: the
    // per-area cap and created_at ordering make an exact count brittle, and the
    // claim under test is "the summary renders", not "exactly five of them do".
    expect(
      summaryCount,
      'at least one Commercial card must render its summary on the authenticated '
        + 'VIEWPORT journey — 0 here means facts stopped reaching the card',
    ).toBeGreaterThan(0);

    // ANTI-VACUITY: a present-but-empty element would satisfy the count above.
    // Assert the summary carries readable text, so the test proves a FACT was
    // rendered rather than that a div exists.
    const text = (await summaries.first().innerText()).trim();
    expect(text.length, 'the summary row must carry rendered text, not be an empty element')
      .toBeGreaterThan(0);
  });

  /**
   * Documents the #2516 gap WITHOUT pinning it as expected behaviour.
   *
   * Asserting `summaries === 0` on the AREA journey would make the defect the
   * contract: when #2516 projects the fact set onto `AreaListingCard`, a correct
   * fix would fail this suite and invite someone to "fix the test". So this arm
   * asserts only that the AREA journey still RENDERS CARDS — the invariant that
   * must hold either way — and records the summary count as an annotation for a
   * human rather than as a pass/fail condition.
   */
  test('AREA journey still renders cards (summary count recorded, not asserted)', async ({ page }, testInfo) => {
    test.setTimeout(120_000);

    await page.goto(`/discover?city=${CITY}&node=${q(AREA_NODE)}`);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 45_000 });

    const cards = await page.locator('[data-testid="listing-card"]').count();
    expect(cards, 'the AREA journey must keep rendering listing cards').toBeGreaterThan(0);

    const summaries = await page.locator('[data-testid="listing-commercial-summary"]').count();
    testInfo.annotations.push({
      type: '#2516',
      description:
        `AREA journey commercialSummaryRows=${summaries} (cards=${cards}). `
        + 'Expected 0 until #2516 projects the fact set onto AreaListingCard; '
        + 'not asserted, so a correct fix does not fail this suite.',
    });
  });
});
