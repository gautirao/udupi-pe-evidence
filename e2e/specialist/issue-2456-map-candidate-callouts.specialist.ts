/**
 * E2E: Issue #2456 — NON-INTERACTIVE nearby-candidate callouts on the map
 * while the AREA_SET draft editor is open.
 *
 * Owner-ruled architecture (PR #2465): the map renders one dashed callout per
 * nearby candidate, 1:1 with the panel's suggestion rows (same identities,
 * same filter-aware counts), bypassing cluster bucketing; the callouts are
 * NON-INTERACTIVE — no click, hover or keyboard path may mutate scope; the
 * panel is the ONLY Add path; closing the draft removes every callout.
 *
 * OWNER-RULED REVERSAL — supersedes the clickable candidate behaviour from
 * #2424 / #2453.
 *
 * Fixtures (seeded Bangalore local dev stack — scripts/dev/local-fixture-backend.sh):
 *   RR Nagar (2 listings) with real nearby candidates incl. Deepanjali Nagar.
 *
 * Every interaction below is a GENUINE pointer / keyboard input through
 * Playwright's input pipeline (page.mouse / keyboard / locator.click), never a
 * DOM-dispatched synthetic event.
 *
 * Run (against a running worktree stack):
 *   PLAYWRIGHT_BASE_URL=http://localhost:<fe> BACKEND_BASE_URL=http://localhost:<be> \
 *     npx playwright test --project=full e2e/issue-2456-map-candidate-callouts.spec.ts
 */

import { type Page } from '@playwright/test';
import { test, expect } from './support/specialist-test';

const AREA_RR_NAGAR = 'a:IN|KA|Bengaluru|RR Nagar';
const AREA_RR_NAGAR_KEY = 'IN|KA|Bengaluru|RR Nagar';

const CALLOUT = '[data-testid="area-set-candidate-callout"]';
/**
 * Issue #2456 (owner ruling C2) — a draft MEMBER on the map: the app's
 * canonical white selected "View homes" shell (`markerShellHtml`, the same
 * shell behind `area-single-marker`) rendered by AreaSetCandidateCalloutLayer
 * with `interactive: false`.
 */
const MEMBER_CARD = '.area-set-draft-member-marker-icon [data-testid="area-set-draft-member-marker"][data-interactive="false"]';

/** Draft member cards as `{ areaKey, ...non-interactive contract }`. */
async function readMemberCards(page: Page) {
  return page.evaluate((sel) =>
    Array.from(document.querySelectorAll<HTMLElement>(sel)).map((el) => {
      const markerEl = el.closest('.leaflet-marker-icon');
      return {
        areaKey: el.dataset.nodeKey ?? '',
        selected: el.dataset.selected,
        role: el.getAttribute('role'),
        tabindex: el.getAttribute('tabindex'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaHidden: el.getAttribute('aria-hidden'),
        pointerEvents: getComputedStyle(el).pointerEvents,
        cursor: getComputedStyle(el).cursor,
        leafletInteractive: markerEl?.classList.contains('leaflet-interactive') ?? null,
        white: (() => {
          const body = el.querySelector<HTMLElement>('.rc-body');
          return !!body && getComputedStyle(body).backgroundColor === 'rgb(255, 255, 255)';
        })(),
        footer: el.querySelector('.rc-footer')?.textContent?.trim() ?? '',
        bodyText: el.querySelector('.rc-body')?.textContent?.trim() ?? '',
        outlined: (el.querySelector<HTMLElement>('.rc-shell')?.getAttribute('style') ?? '').includes('outline:2px solid'),
      };
    }), MEMBER_CARD);
}

function assertMemberCardContract(card: Awaited<ReturnType<typeof readMemberCards>>[number]) {
  expect(card.selected, `${card.areaKey} data-selected`).toBe('true');
  expect(card.role, `${card.areaKey} role`).toBeNull();
  expect(card.tabindex, `${card.areaKey} tabindex`).toBeNull();
  expect(card.ariaLabel, `${card.areaKey} aria-label`).toBeNull();
  expect(card.ariaHidden, `${card.areaKey} aria-hidden`).toBe('true');
  expect(card.pointerEvents, `${card.areaKey} pointer-events`).toBe('none');
  expect(card.cursor, `${card.areaKey} cursor`).not.toBe('pointer');
  expect(card.leafletInteractive, `${card.areaKey} leaflet-interactive`).toBe(false);
  expect(card.white, `${card.areaKey} white body`).toBe(true);
  expect(card.footer, `${card.areaKey} footer`).toMatch(/View homes/);
  expect(card.outlined, `${card.areaKey} selected outline`).toBe(true);
  expect(card.bodyText, `${card.areaKey} member secondary copy`).toMatch(/(\d+\s*LISTINGS?|Selected)/i);
}

function urlParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

async function declineConsentBannerIfPresent(page: Page): Promise<void> {
  const banner = page.getByTestId('discover-consent-banner');
  if (await banner.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await banner.getByRole('button', { name: /decline/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  }
}

async function reachSingleAreaRrNagar(page: Page): Promise<void> {
  await page.goto(
    `/discover?node=${encodeURIComponent(AREA_RR_NAGAR)}&areaKey=${encodeURIComponent(AREA_RR_NAGAR_KEY)}&lat=12.93169&lon=77.52932&zoom=16&rscope=area`,
  );
  await page.waitForLoadState('domcontentloaded');
  await declineConsentBannerIfPresent(page);
}

/**
 * The panel's suggestion rows as `{ areaKey, count }` — the panel is the
 * source of truth. Desktop renders them in AreaSetDraftPanel
 * (`area-set-draft-panel-suggestion-<key>`); the mobile shell renders the
 * SAME `AreaSetDraftContext.data.candidates` in AreaSetChips' popover
 * (`area-set-suggestion-<key>`).
 */
async function readPanelRows(page: Page): Promise<Array<{ areaKey: string; count: number }>> {
  return page.evaluate(() => {
    const prefixes = ['area-set-draft-panel-suggestion-', 'area-set-suggestion-'];
    const out: Array<{ areaKey: string; count: number }> = [];
    for (const prefix of prefixes) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`))) {
        const id = el.dataset.testid ?? '';
        if (id.endsWith('-add')) continue;
        out.push({
          areaKey: id.replace(prefix, ''),
          count: Number(el.textContent?.match(/(\d+) listings/)?.[1] ?? NaN),
        });
      }
      if (out.length > 0) break;
    }
    return out;
  });
}

function addButtonFor(page: Page, areaKey: string) {
  return page
    .getByTestId(`area-set-draft-panel-suggestion-${areaKey}-add`)
    .or(page.getByTestId(`area-set-suggestion-${areaKey}-add`));
}

/** The map callouts as `{ areaKey, count }` plus their non-interactive contract. */
async function readCallouts(page: Page) {
  return page.evaluate((sel) =>
    Array.from(document.querySelectorAll<HTMLElement>(sel)).map((el) => {
      const countText = el.querySelector('span span')?.textContent ?? '';
      const markerEl = el.closest('.leaflet-marker-icon');
      return {
        areaKey: el.dataset.areaKey ?? '',
        count: Number(countText.replace(/,/g, '')),
        role: el.getAttribute('role'),
        tabindex: el.getAttribute('tabindex'),
        ariaHidden: el.getAttribute('aria-hidden'),
        pointerEvents: getComputedStyle(el).pointerEvents,
        leafletInteractive: markerEl?.classList.contains('leaflet-interactive') ?? null,
        dashed: (el.querySelector('span')?.getAttribute('style') ?? '').includes('dashed'),
      };
    }), CALLOUT);
}

/**
 * Focuses the Leaflet map container (a real `tabindex="0"` surface) and
 * presses Enter and Space there. Any callout / member card that had a
 * keyboard path would have to be reachable from here; none is (they carry no
 * tabindex), and the map itself has no activation handler for them.
 */
async function focusMapAndPressActivationKeys(page: Page): Promise<void> {
  await page.locator('.leaflet-container').first().focus();
  const focusedMap = await page.evaluate(() => !!document.activeElement?.closest('.leaflet-container'));
  expect(focusedMap, 'focus must be on the map surface before Enter/Space').toBe(true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
}

function sortByKey<T extends { areaKey: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.areaKey.localeCompare(b.areaKey));
}

async function draftStat(page: Page): Promise<string | null> {
  return page.evaluate(() => document.body.textContent?.match(/\d of 3/)?.[0] ?? null);
}

async function setMobileMapOpenIfMobile(page: Page, open: boolean): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1366, height: 768 };
  if (vp.width >= 768) return;
  if (open) {
    const mapTrigger = page.getByTestId('control-bar-map-trigger');
    if (await mapTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await mapTrigger.click();
    }
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 10_000 });
  } else {
    const listToggle = page.getByTestId('mobile-map-close-list-button');
    if (await listToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await listToggle.evaluate((el: HTMLButtonElement) => el.click());
      await expect(listToggle).toBeHidden({ timeout: 5_000 });
    }
  }
}

async function runScenario(page: Page, _tag: string) {
  await reachSingleAreaRrNagar(page);

  // No draft open → no callouts (mount map on mobile so the 0-count check is non-vacuous).
  await setMobileMapOpenIfMobile(page, true);
  await expect(page.locator(CALLOUT)).toHaveCount(0);
  await setMobileMapOpenIfMobile(page, false);

  // Open the draft editor from the real entry path (genuine pointer click).
  const addNearbyTile = page.getByTestId('area-set-add-nearby-tile');
  const addTrigger = page.getByTestId('area-set-add-trigger');
  if (await addNearbyTile.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await addNearbyTile.click();
  } else {
    await expect(addTrigger, 'an AREA_SET draft entry point must be visible').toBeVisible({ timeout: 10_000 });
    await addTrigger.click();
  }

  // Panel rows are the source of truth; wait until they exist.
  await expect
    .poll(async () => (await readPanelRows(page)).length, { timeout: 15_000, message: 'panel suggestion rows' })
    .toBeGreaterThan(0);
  const rows = await readPanelRows(page);

  // Ensure the map surface is mounted on mobile while the draft remains open.
  await setMobileMapOpenIfMobile(page, true);

  // 1:1 — same count, same identities, same filter-aware counts.
  await expect.poll(async () => (await readCallouts(page)).length, { timeout: 10_000 }).toBe(rows.length);
  const callouts = await readCallouts(page);
  expect(sortByKey(callouts.map(({ areaKey, count }) => ({ areaKey, count })))).toEqual(sortByKey(rows));

  // Non-interactive contract on every callout.
  for (const c of callouts) {
    expect(c.role, `${c.areaKey} role`).toBeNull();
    expect(c.tabindex, `${c.areaKey} tabindex`).toBeNull();
    expect(c.ariaHidden, `${c.areaKey} aria-hidden`).toBe('true');
    expect(c.pointerEvents, `${c.areaKey} pointer-events`).toBe('none');
    expect(c.leafletInteractive, `${c.areaKey} leaflet-interactive`).toBe(false);
    expect(c.dashed, `${c.areaKey} dashed border`).toBe(true);
  }

  // Owner ruling C2 — the committed area is already a draft member: it renders
  // as the canonical white selected card, non-interactive.
  await expect.poll(async () => (await readMemberCards(page)).length, { timeout: 10_000 }).toBe(1);
  const openMembers = await readMemberCards(page);
  expect(openMembers[0].areaKey).toBe(AREA_RR_NAGAR_KEY);
  assertMemberCardContract(openMembers[0]);

  // Snapshot of everything a mutation could change.
  const rareasBefore = urlParam(page, 'rareas');
  const rscopeBefore = urlParam(page, 'rscope');
  const statBefore = await draftStat(page);
  const chipSelector = '[data-testid^="area-set-draft-panel-chip-"], [data-testid^="area-set-chip-"]';
  const chipsBefore = await page.locator(chipSelector).count();

  // Genuine pointer HOVER + CLICK on every callout that is inside the viewport.
  // Only callouts whose centre is actually the topmost MAP surface are clicked:
  // on the mobile shell floating map chrome or the draft popover can overlay part
  // of the map, and a pointer click there would hit that control — not the callout.
  const boxes = await page.locator(CALLOUT).evaluateAll((els) =>
    els.map((el) => {
      const r = (el.querySelector('span') ?? el).getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const overlaid = !!hit?.closest(
        '[data-testid="area-set-draft-panel"], [data-testid="area-set-suggestions-popover"], [data-testid="area-set-chips"], button, a, [role="button"]',
      );
      return { x, y, w: r.width, h: r.height, overlaid };
    }),
  );
  const vp = page.viewportSize() ?? { width: 1366, height: 768 };
  const inView = boxes.filter(
    (b) => b.x > 0 && b.y > 0 && b.x < vp.width && b.y < vp.height && b.w > 0 && !b.overlaid,
  );
  if (vp.width >= 768) {
    expect(
      inView.length,
      'desktop: at least one callout must be inside the viewport and not overlaid to exercise pointer input',
    ).toBeGreaterThan(0);
  } else if (inView.length === 0) {
    // Mobile shell: the draft popover overlays the map strip where the
    // candidates sit, so there is no un-overlaid callout to click. Pointer
    // proof is therefore the desktop arm; the structural non-interactive
    // contract asserted above (pointer-events:none, not leaflet-interactive,
    // no role/tabindex) and the keyboard pass below are viewport-independent.
    test.info().annotations.push({
      type: 'pointer-proof',
      description: 'mobile: every callout is overlaid by the draft popover or off-screen — pointer clicks skipped; structural + keyboard proof only',
    });
  }
  for (const b of inView) {
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(150);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(300);
  }
  // Genuine keyboard: Tab through the document; a callout must never take focus.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const focusedInCallout = await page.evaluate(
      (sel) => !!document.activeElement?.closest(sel),
      CALLOUT,
    );
    expect(focusedInCallout, `Tab #${i + 1} landed inside a callout`).toBe(false);
  }
  // Enter/Space with focus ON THE MAP surface (not on whatever panel control
  // the Tab loop ended on — a panel Add button is the legitimate Add path and
  // proves nothing about the map).
  await focusMapAndPressActivationKeys(page);

  // Nothing mutated.
  expect(urlParam(page, 'rareas'), 'rareas after hover/click/keyboard').toBe(rareasBefore);
  expect(await draftStat(page), 'draft stat after hover/click/keyboard').toBe(statBefore);
  expect(await page.locator(chipSelector).count(), 'draft chips after hover/click/keyboard').toBe(chipsBefore);
  await expect(page.locator(CALLOUT)).toHaveCount(rows.length);

  // Panel Add (the ONLY Add path) — first suggestion row.
  await setMobileMapOpenIfMobile(page, false);
  const first = rows[0];
  const addButton = addButtonFor(page, first.areaKey).first();
  await addButton.scrollIntoViewIfNeeded();
  await addButton.click();
  await setMobileMapOpenIfMobile(page, true);
  await expect
    .poll(async () => (await readCallouts(page)).some((c) => c.areaKey === first.areaKey), {
      timeout: 10_000,
      message: 'added candidate must leave the callout layer',
    })
    .toBe(false);
  // Still 1:1 with the (refreshed) panel.
  await expect
    .poll(
      async () => {
        const r = await readPanelRows(page);
        const c = await readCallouts(page);
        return JSON.stringify(sortByKey(c.map(({ areaKey, count }) => ({ areaKey, count })))) === JSON.stringify(sortByKey(r));
      },
      { timeout: 10_000, message: 'map/panel parity after panel Add' },
    )
    .toBe(true);
  // Owner ruling C2 — the added candidate is now a draft MEMBER: its dashed
  // callout is replaced by the canonical white selected "View homes" card.
  await expect
    .poll(async () => (await readMemberCards(page)).map((m) => m.areaKey).sort(), {
      timeout: 10_000,
      message: 'added candidate must become a selected member card',
    })
    .toEqual([AREA_RR_NAGAR_KEY, first.areaKey].sort());
  const addedCards = await readMemberCards(page);
  for (const card of addedCards) assertMemberCardContract(card);

  // Add is DRAFT-ONLY: the committed scope/URL is untouched until Show/Search.
  expect(urlParam(page, 'rareas'), 'rareas after panel Add (draft-only)').toBe(rareasBefore);
  expect(urlParam(page, 'rscope'), 'rscope after panel Add (draft-only)').toBe(rscopeBefore);
  expect(await draftStat(page), 'draft stat after Add').toBe('2 of 3');

  // Genuine pointer + keyboard on the NEW selected card: nothing mutates.
  const memberBoxes = await page.locator(MEMBER_CARD).evaluateAll((els) =>
    els.map((el) => {
      const r = (el.querySelector('.rc-shell') ?? el).getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const overlaid = !!hit?.closest(
        '[data-testid="area-set-draft-panel"], [data-testid="area-set-suggestions-popover"], [data-testid="area-set-chips"], button, a, [role="button"]',
      );
      return { x, y, w: r.width, overlaid };
    }),
  );
  const memberInView = memberBoxes.filter(
    (b) => b.x > 0 && b.y > 0 && b.x < vp.width && b.y < vp.height && b.w > 0 && !b.overlaid,
  );
  if (vp.width >= 768) {
    expect(memberInView.length, 'desktop: at least one member card must be clickable-in-viewport').toBeGreaterThan(0);
  } else if (memberInView.length === 0) {
    test.info().annotations.push({
      type: 'pointer-proof-member-card',
      description: 'mobile: every member card is overlaid by the draft popover or off-screen — pointer clicks skipped; structural + keyboard proof only',
    });
  }
  for (const b of memberInView) {
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(150);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(300);
  }
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const focusedInMember = await page.evaluate((sel) => !!document.activeElement?.closest(sel), MEMBER_CARD);
    expect(focusedInMember, `Tab #${i + 1} landed inside a member card`).toBe(false);
  }
  await focusMapAndPressActivationKeys(page);
  expect(urlParam(page, 'rareas'), 'rareas after member-card pointer/keyboard').toBe(rareasBefore);
  expect(urlParam(page, 'rscope'), 'rscope after member-card pointer/keyboard').toBe(rscopeBefore);
  expect(await draftStat(page), 'draft stat after member-card pointer/keyboard').toBe('2 of 3');
  expect((await readMemberCards(page)).length, 'member cards after pointer/keyboard').toBe(2);

  // Cancel closes the draft → every callout AND every member card is gone.
  await setMobileMapOpenIfMobile(page, false);
  const cancel = page.getByTestId('area-set-draft-panel-cancel').or(page.getByTestId('area-set-panel-cancel'));
  await cancel.first().scrollIntoViewIfNeeded();
  await cancel.first().click();
  await setMobileMapOpenIfMobile(page, true);
  await expect(page.locator(CALLOUT)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator(MEMBER_CARD)).toHaveCount(0, { timeout: 10_000 });
  expect(urlParam(page, 'rareas')).toBe(rareasBefore);
  expect(urlParam(page, 'rscope')).toBe(rscopeBefore);
}

test.describe('Issue #2456 — non-interactive AREA_SET nearby-candidate callouts (desktop 1366x768)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test('callouts are 1:1 with the panel, inert to pointer/keyboard, removed on Add and on Cancel', async ({ page }) => {
    test.setTimeout(120_000);
    await runScenario(page, 'desktop-1366x768');
  });
});

test.describe('Issue #2456 — non-interactive AREA_SET nearby-candidate callouts (mobile 390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('callouts are 1:1 with the panel, inert to pointer/keyboard, removed on Add and on Cancel', async ({ page }) => {
    test.setTimeout(120_000);
    await runScenario(page, 'mobile-390x844');
  });
});
