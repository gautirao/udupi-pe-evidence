/**
 * Issue #2450 — the Commercial subtype row must WRAP at 390px, never truncate and never scroll.
 *
 * WHY THIS IS A SPECIALIST E2E AND NOT A UNIT TEST. The owner ratified D3 in the stronger form —
 * wrapping is REQUIRED, truncation and horizontal scrolling are forbidden. That is a statement
 * about measured layout, and JSDOM has no layout engine: `offsetWidth`, `scrollWidth` and
 * `getBoundingClientRect` are all zero there, so a unit assertion would pass on any markup.
 *
 * WHAT EACH ASSERTION RULES OUT:
 *   - `scrollWidth <= clientWidth`  -> the row does not scroll horizontally;
 *   - distinct vertical `y` tops    -> it actually wrapped onto more than one line, rather than
 *                                      fitting by having been truncated or shrunk;
 *   - full label text present       -> no chip was ellipsised to make it fit;
 *   - ALL SIX CHIPS RENDERED        -> the row was not made to fit by rendering fewer chips.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/specialist-test';
import { grantDiscoverConsent, loginAsUser } from '../helpers';

test.use({
  viewport: { width: 390, height: 844 },
});

const DISCOVER_URL = `/discover?city=udupi&node=${encodeURIComponent('a:IN|KA|Udupi|Manipal')}&areaKey=${encodeURIComponent('IN|KA|Udupi|Manipal')}`;

const SUBTYPE_CHIPS = [
  { testId: 'quick-chip-subtype-all', label: 'All commercial' },
  { testId: 'quick-chip-subtype-shop', label: 'Shop' },
  { testId: 'quick-chip-subtype-office', label: 'Office' },
  { testId: 'quick-chip-subtype-building', label: 'Commercial Building' },
  { testId: 'quick-chip-subtype-warehouse', label: 'Warehouse / Godown' },
  { testId: 'quick-chip-subtype-land', label: 'Commercial Land' },
] as const;

/** The two labels that make this row wrap; both are #2450's ratified wording. */
const LONGEST_LABELS = ['Warehouse / Godown', 'Commercial Building'] as const;

async function assertSessionLiveAtRuntime(page: Page): Promise<void> {
  const authed = await page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
  );
  expect(
    authed,
    'expected the live page to hold an active local Supabase session',
  ).toBe(true);
}

async function openCommercialSubtypeRow(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const blankGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (srcDesc?.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        ...srcDesc,
        set(v: string) {
          srcDesc.set!.call(this, typeof v === 'string' && v.includes('800x600?text=E2E+Fixture+Photo') ? blankGif : v);
        },
      });
    }
    const origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, val: string) {
      if (this instanceof HTMLImageElement && name.toLowerCase() === 'src' && typeof val === 'string' && val.includes('800x600?text=E2E+Fixture+Photo')) {
        return origSetAttr.call(this, name, blankGif);
      }
      return origSetAttr.call(this, name, val);
    };
  });
  await loginAsUser(page, process.env.SMOKE_USER_EMAIL!, process.env.SMOKE_USER_PASSWORD!);
  await grantDiscoverConsent(page);
  await page.goto(DISCOVER_URL);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('areas-journey-panel-listings')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('quick-chip-family-commercial').click();

  const row = page.getByTestId('quick-subtype-row');
  await expect(row).toBeVisible({ timeout: 10_000 });
  await assertSessionLiveAtRuntime(page);

  // Guard against "it fit because we showed fewer chips". Every measurement below is only
  // meaningful over the complete row, so this runs before any of them.
  for (const chip of SUBTYPE_CHIPS) {
    await expect(
      row.getByTestId(chip.testId),
      `subtype chip "${chip.label}" is not rendered — the row cannot be measured for wrapping ` +
        'until the whole vocabulary is on screen',
    ).toBeVisible();
  }
  await expect(
    row.getByTestId(/^quick-chip-subtype-/),
    'the subtype row renders a different number of chips than the ratified vocabulary',
  ).toHaveCount(SUBTYPE_CHIPS.length);
}

test.describe('#2450 — Commercial subtype row at 390x844', () => {
  test('does not scroll horizontally', async ({ page }) => {
    await openCommercialSubtypeRow(page);

    const box = await page.getByTestId('quick-subtype-row').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      box.scrollWidth,
      `row scrolls horizontally: scrollWidth ${box.scrollWidth} > clientWidth ${box.clientWidth}`,
    ).toBeLessThanOrEqual(box.clientWidth);
  });

  test('wraps onto more than one line rather than fitting by shrinking', async ({ page }) => {
    await openCommercialSubtypeRow(page);

    const row = page.getByTestId('quick-subtype-row');
    const tops: number[] = [];
    for (const chip of SUBTYPE_CHIPS) {
      const box = await row.getByTestId(chip.testId).boundingBox();
      expect(box, `chip "${chip.label}" has no box — layout did not run`).not.toBeNull();
      tops.push(box!.y);
    }

    // Round to whole pixels so sub-pixel baseline jitter within one line does not read as a wrap.
    const distinctRows = new Set(tops.map((y) => Math.round(y)));
    expect(
      distinctRows.size,
      `all six chips share ${distinctRows.size} vertical position(s) (${[...distinctRows].join(', ')}) ` +
        '— the row did not wrap onto a second line',
    ).toBeGreaterThan(1);
  });

  test('shows every label in full — nothing ellipsised to make it fit', async ({ page }) => {
    await openCommercialSubtypeRow(page);

    const row = page.getByTestId('quick-subtype-row');

    for (const label of LONGEST_LABELS) {
      const chip = row.getByTestId(
        SUBTYPE_CHIPS.find((c) => c.label === label)!.testId,
      );
      await expect(chip).toBeVisible();

      await expect(chip, `"${label}" is not rendered in full`).toHaveText(label);

      const clipped = await chip.evaluate((el, rowTestId) => {
        const report = (node: HTMLElement) => ({
          tag: node.tagName,
          testId: node.dataset.testid ?? null,
        });
        for (let node: HTMLElement | null = el as HTMLElement; node; node = node.parentElement) {
          if (node.scrollWidth > node.clientWidth) return report(node);
          if (node.dataset.testid === rowTestId) break;
        }
        for (const node of Array.from((el as HTMLElement).querySelectorAll<HTMLElement>('*'))) {
          if (node.scrollWidth > node.clientWidth) return report(node);
        }
        return null;
      }, 'quick-subtype-row');

      expect(
        clipped,
        `"${label}" is ellipsised at 390px by ${clipped?.testId ?? clipped?.tag ?? ''}`,
      ).toBeNull();
    }
  });
});
