import { test, expect, type Page } from '@playwright/test';

/**
 * Issue #2528 — a browser Back that drops the filter from the URL must also drop it from
 * the visible controls and from what the page fetches.
 *
 * ## Three constraints shape this journey, and each one was learned the hard way
 *
 * **1. The history boundary must be an IN-APP push.** Every visible filter control writes
 * the URL through `setFiltersLive`, which is `{ replace: true }` and debounced 300 ms — it
 * creates NO history entry. Two entries can therefore only differ in their filters if a
 * PUSH happens BETWEEN two filter states. (The issue's own repro, "3 beds -> 2 beds ->
 * Back", cannot reproduce anything for exactly this reason.)
 *
 * **2. That push must not reload the document.** A `page.goto()`-created entry would make
 * Back a document navigation; the app would REMOUNT and `useDiscoverPageState`'s mount-time
 * seed would repopulate the filters from the URL — so the test would pass with or without
 * the fix. `assertNoReload` stamps the live document and re-checks it after every traversal.
 *
 * **3. The assertion must sit on the STALE path, not the live one.**
 * This is the subtle one. An earlier draft of this spec asserted on the navigation level's
 * per-destination listing counts after Back. It passed — *and it also passed with the fix
 * mutated out*, because those counts are driven by `useDiscoverPageContext`'s
 * `urlDiscoverFilters`, a LIVE URL derivation that was never stale. It was measuring the
 * half of the page that already worked.
 *
 * The defect lives in `useDiscoverPageState.filters`, which feeds the AREA leaf's quick
 * chips and (via `useDiscoverMapDataController`) the leaf's own listings query. So the
 * assertion has to land on an AREA leaf's chips. Hence the journey below ends by entering a
 * SECOND leaf after the Back: pre-fix, the stale `apartment` narrowing travelled with the
 * user into that leaf even though no URL on the path still carried it.
 *
 * ## Fixture
 *
 * `navigation-hierarchy-fixture-*-seed.sql`, default profile (Bangalore): `d:southeast` has
 * 3 AREA children; its `RR Nagar` leaf carries exactly 2 LIVE sale listings, 1 an apartment
 * — the deterministic 2 -> 1 split `issue-2089-filter-list-map-parity` also relies on.
 *
 * Run: `bash scripts/run-e2e-local.sh --project=full issue-2528-back-forward-filter-sync`
 * NOTE: `run-e2e-local.sh` appends `--project=smoke` when no `--project` is given, and
 * `smoke`'s testMatch is an allowlist this file is not on — omit it and the run reports
 * "No tests found" instead of failing.
 */

const BASE = 'city=bangalore&journey=area-first';
const SOUTHEAST_CARD = 'navigation-child-card-d:southeast';
const LEAF_PANEL = 'areas-journey-panel-listings';

async function grantTelemetryConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('discover_telemetry_consent', 'granted');
  });
}

async function stampDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__issue2528Stamp = 'alive';
  });
}

async function assertNoReload(page: Page, step: string): Promise<void> {
  const stamp = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__issue2528Stamp,
  );
  expect(stamp, `${step} reloaded the document — the assertions after it would be vacuous`).toBe(
    'alive',
  );
}

function typeParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('type');
}

/** Walks root -> South-East direction, leaving the child list on screen. */
async function openSoutheastDirection(page: Page): Promise<void> {
  await page.goto(`/discover?${BASE}`);
  await expect(page.getByTestId(SOUTHEAST_CARD)).toBeVisible({ timeout: 25_000 });
  await stampDocument(page);
  await page.getByTestId(SOUTHEAST_CARD).click();
  await expect(page.getByTestId('navigation-child-list')).toBeVisible({ timeout: 20_000 });
  await assertNoReload(page, 'PUSH into the South-East direction');
}

/** The sibling AREA leaves under South-East, as {testid, label} pairs. */
async function siblingLeaves(page: Page): Promise<{ testid: string; label: string }[]> {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="navigation-child-list"]');
    if (!list) return [];
    return Array.from(list.querySelectorAll('[data-testid^="navigation-child-card-"]'))
      .map((el) => ({
        testid: (el as HTMLElement).dataset.testid as string,
        label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((c) => !c.testid.endsWith('-count') && !c.testid.includes('-listings-'));
  });
}

test.describe('@integration-ui #2528 Discover: Back must not carry a stale filter forward', () => {
  test.beforeEach(async ({ page }) => {
    await grantTelemetryConsent(page);
  });

  test('a Back that drops the filter leaves the next area unfiltered, and Forward restores the control', async ({
    page,
  }) => {
    await openSoutheastDirection(page);

    const leaves = await siblingLeaves(page);
    const rrNagar = leaves.find((l) => l.label.includes('RR Nagar'));
    const other = leaves.find((l) => !l.label.includes('RR Nagar') && /\d+\s+listing/.test(l.label));
    expect(rrNagar, `expected an RR Nagar leaf among: ${JSON.stringify(leaves)}`).toBeTruthy();
    expect(
      other,
      `expected a second, non-empty sibling leaf among: ${JSON.stringify(leaves)}`,
    ).toBeTruthy();

    // ── Enter RR Nagar and narrow to Apartments ───────────────────────────────
    await page.getByTestId(rrNagar!.testid).click();
    await expect(page.getByTestId(LEAF_PANEL)).toBeVisible({ timeout: 25_000 });
    await assertNoReload(page, 'PUSH into the RR Nagar leaf');

    const apartmentChip = page.getByTestId('quick-chip-apartment');
    const cards = page.getByTestId('listing-card');
    await expect(apartmentChip).toHaveAttribute('aria-pressed', 'false');
    await expect(cards).toHaveCount(2, { timeout: 20_000 });

    // A REPLACE: it mutates this entry rather than adding one.
    await apartmentChip.click();
    await expect(apartmentChip).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(1, { timeout: 20_000 });
    await expect.poll(() => typeParam(page), { timeout: 15_000 }).toBe('apartment');

    // ── BACK to the direction level: the URL no longer carries any filter ─────
    await page.goBack();
    await expect(page.getByTestId('navigation-child-list')).toBeVisible({ timeout: 20_000 });
    await assertNoReload(page, 'Back to the direction level');
    expect(typeParam(page)).toBeNull();

    // ── THE DISCRIMINATING ASSERTION ──────────────────────────────────────────
    // Enter a DIFFERENT leaf. Nothing on the path from here carries `type=`, so its
    // Apartments chip must be unpressed. Before this fix the Back never reached
    // `useDiscoverPageState.filters`, so the narrowing rode along into this leaf and the
    // chip came up pressed over a filtered list.
    await page.getByTestId(other!.testid).click();
    await expect(page.getByTestId(LEAF_PANEL)).toBeVisible({ timeout: 25_000 });
    await assertNoReload(page, 'PUSH into the sibling leaf');

    expect(typeParam(page), 'no URL on this path carries a type filter').toBeNull();
    await expect(
      page.getByTestId('quick-chip-apartment'),
      'the stale Apartments narrowing must not survive the Back',
    ).toHaveAttribute('aria-pressed', 'false');

    // ── Forward leg: a filter set here must come back after Back/Forward ──────
    const villaChip = page.getByTestId('quick-chip-villa');
    await villaChip.click();
    await expect(villaChip).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => typeParam(page), { timeout: 15_000 }).toBe('villa');

    await page.goBack();
    await expect(page.getByTestId('navigation-child-list')).toBeVisible({ timeout: 20_000 });
    await assertNoReload(page, 'Back before the Forward leg');
    expect(typeParam(page)).toBeNull();

    await page.goForward();
    await expect(page.getByTestId(LEAF_PANEL)).toBeVisible({ timeout: 25_000 });
    await assertNoReload(page, 'Forward to the sibling leaf');

    await expect.poll(() => typeParam(page), { timeout: 15_000 }).toBe('villa');
    await expect(page.getByTestId('quick-chip-villa')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('quick-chip-apartment')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
