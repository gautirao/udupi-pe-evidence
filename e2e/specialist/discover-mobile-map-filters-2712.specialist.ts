/**
 * Issue #2712 — MapFilterSheet (vaul Drawer, body-portalled, default z-50) painting UNDER
 * DiscoverPageShell's `fixed inset-0 z-[60]` mobile-map overlay (z-[60] is a hard constraint
 * from #1953, never lowered — see that file). Because both are page-level `position: fixed`
 * siblings outside any shared stacking context, plain numeric z-index governs paint order, so
 * the sheet lost to the map and vaul's own `pointer-events: none` on `<body>` sent taps to
 * invisible map chrome instead of the sheet.
 *
 * Fix: `DrawerContent` gained an additive `overlayClassName` prop (mirrors
 * `AlertDialogContentProps.overlayClassName` from #2471); `MapFilterSheet` raises ONLY its own
 * overlay+content to `z-[70]`, scoped — no other `Drawer` consumer exists in the repo
 * (`drawer.tsx` had exactly one importer, confirmed via jCodemunch `find_importers`), so no
 * other surface is touched.
 *
 * This is a real-hit-test proof (JSDOM/unit tests cannot prove paint order) — same
 * `document.elementFromPoint` decisive pattern as
 * `e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts`, and the same seeded
 * `d:southeast` fixture direction that spec uses (real backend data, not `/api/**` stubbing —
 * the established convention for this file family).
 *
 * TEST-ORACLE NOTE [MUTATION-RESULT-PENDING]: while a vaul modal drawer is open, vaul sets
 * `pointer-events: none` on `<body>`, and `document.elementFromPoint` skips `pointer-events: none`
 * elements/ancestors entirely, walking past them to whatever is beneath. This can, in principle,
 * let the pre-existing "ACTUALLY ON TOP (hit-tested)" test below resolve into the sheet even when
 * it is visually painted underneath the map. Two independent oracles are added below that do not
 * share this exposure — see this branch's mutation-run evidence for whether the original test
 * actually failed on the reverted code:
 *
 * 1. `forcedPaintOrderHit()` — temporarily forces `pointer-events: auto !important` on every
 *    element via an injected stylesheet before calling `elementFromPoint`, so the hit-test
 *    result reflects PAINT order (what a real, unsuppressed pointer would land on) rather than
 *    being steered by vaul's `pointer-events: none` body suppression.
 * 2. `samplePixel()` — a hit-testing-FREE oracle: takes a 1x1 `page.screenshot({ clip })` at a
 *    backdrop point before and after the sheet opens and asserts the pixel is visibly darkened
 *    (vaul's default `bg-black/80` backdrop), which only happens if the overlay is actually
 *    painted on top of the map content at that point — DOM/event semantics cannot fake this.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/specialist-test';
import { inflateSync } from 'node:zlib';
import { assertReachable } from '../support/reachability';

const CITY = 'bangalore';
const BASE = `city=${CITY}&journey=area-first`;
const D_S = 'd:southeast';

const VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
];

/** Marks any point painted by the sheet's own overlay (vaul's default `bg-black/80` backdrop
 * class, present regardless of the scoped `z-[70]` override) or by the sheet content itself —
 * i.e. NOT the map subtree, which carries neither class. Kept as the original oracle: real
 * (unforced) `elementFromPoint`, which — per the doc comment above and this branch's mutation
 * proof — can resolve INTO the sheet even while it is invisibly painted underneath the map,
 * because vaul's `pointer-events: none` on `<body>` removes the winning (map) elements from
 * hit-testing rather than making the losing (sheet) elements win the paint race. */
async function topmostIsSheetOrOverlay(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return false;
      return el.closest('[data-testid="map-filter-sheet"]') != null || el.closest('.bg-black\\/80') != null;
    },
    [x, y] as const,
  );
}

/** PAINT-ORDER oracle. Forces `pointer-events: auto !important` on every element via a
 * temporary injected `<style>` immediately before the hit-test, then removes it — this
 * neutralises vaul's `pointer-events: none` on `<body>` (and any other pointer-events
 * suppression) for the instant of the read, so `elementFromPoint` reports what is actually
 * PAINTED on top rather than being redirected past a suppressed-but-visually-winning element.
 * Returns which named region the topmost element under the point belongs to. */
async function forcedPaintOrderHit(
  page: Page,
  x: number,
  y: number,
): Promise<{ isSheetOrOverlay: boolean; isMapSurface: boolean }> {
  return page.evaluate(
    ([px, py]) => {
      const style = document.createElement('style');
      style.textContent = '*{pointer-events:auto !important;}';
      document.head.appendChild(style);
      try {
        const el = document.elementFromPoint(px as number, py as number);
        if (!el) return { isSheetOrOverlay: false, isMapSurface: false };
        const isSheetOrOverlay =
          el.closest('[data-testid="map-filter-sheet"]') != null || el.closest('.bg-black\\/80') != null;
        // DiscoverPageShell's mobile full-screen map wrapper (Issue #1953) — the element the
        // sheet must beat. Identified by its own stable testid (`mobile-map-surface-wrapper`,
        // added on this branch for exactly this purpose) rather than the Tailwind
        // arbitrary-value class string, which is easy to accidentally desync from the source if
        // the z-index value itself ever changes.
        const mapSurfaceWrapper = document.querySelector('[data-testid="mobile-map-surface-wrapper"]');
        const isMapSurface = mapSurfaceWrapper != null && mapSurfaceWrapper.contains(el);
        return { isSheetOrOverlay, isMapSurface };
      } finally {
        style.remove();
      }
    },
    [x, y] as const,
  );
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Decodes the single pixel of a 1x1 PNG buffer (as produced by
 * `page.screenshot({ clip: { width: 1, height: 1 } })`) without pulling in an image-decoding
 * dependency. This relies on one fact that only holds for a 1x1 image: every PNG filter type
 * (None/Sub/Up/Average/Paeth) reconstructs the FIRST pixel of the FIRST scanline as the raw
 * byte value unmodified, because Sub/Up/Average/Paeth all reference a left/upper neighbour that
 * doesn't exist for pixel (0,0) and is defined to be treated as 0 — so the filter byte can be
 * skipped and the following channel bytes read directly. This does NOT generalise to any image
 * larger than 1x1. */
function readSinglePixelPng(buffer: Buffer): Rgba {
  let offset = 8; // past the 8-byte PNG signature
  const idatChunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer.readUInt8(dataStart + 8);
      colorType = buffer.readUInt8(dataStart + 9);
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // 4 = CRC
  }
  if (width !== 1 || height !== 1) {
    throw new Error(`readSinglePixelPng expects a 1x1 image, got ${width}x${height}`);
  }
  if (bitDepth !== 8) {
    throw new Error(`readSinglePixelPng only supports 8-bit PNGs, got bit depth ${bitDepth}`);
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (channels == null) {
    throw new Error(`readSinglePixelPng only supports color type 2 (RGB) or 6 (RGBA), got ${colorType}`);
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  const pixelStart = 1; // skip the single scanline's filter-type byte
  return {
    r: raw[pixelStart],
    g: raw[pixelStart + 1],
    b: raw[pixelStart + 2],
    a: channels === 4 ? raw[pixelStart + 3] : 255,
  };
}

async function samplePixel(page: Page, x: number, y: number): Promise<Rgba> {
  const buffer = await page.screenshot({
    clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
  });
  return readSinglePixelPng(buffer);
}

function luminance({ r, g, b }: Rgba): number {
  return (r + g + b) / 3;
}

async function openDirectionInMobileMap(page: Page) {
  await page.goto(`/discover?${BASE}&node=${encodeURIComponent(D_S)}`);
  await page.waitForLoadState('domcontentloaded');
  const decline = page.getByRole('button', { name: /decline anonymous usage data collection/i });
  if (await decline.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await decline.click();
  }
  const mapTrigger = page.getByTestId('control-bar-map-trigger');
  await expect(mapTrigger).toBeVisible({ timeout: 15_000 });
  await mapTrigger.click();
  await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible({ timeout: 10_000 });
}

async function openFilterSheet(page: Page) {
  const pill = page.getByTestId('map-filters-pill');
  await assertReachable(page, pill);
  await pill.click();
  const sheet = page.getByTestId('map-filter-sheet');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  // vaul opens the Drawer with a slide-up (translateY) transition. `toBeVisible()` only proves
  // the element is attached and has a non-empty box — it does not wait for the transition to
  // finish, so a `boundingBox()` read immediately after can land mid-animation and report a box
  // far below the viewport (observed: y-midpoint ~937 against a 667px-tall viewport). Every
  // hit-test in this spec depends on a settled, final-resting-position box, so poll here once,
  // for every caller, until the box agrees with what the PREVIOUS poll attempt observed.
  //
  // Earlier version of this fix took two `boundingBox()` reads back-to-back inside a single poll
  // callback and compared those. That is not a real settle check: both reads execute in the same
  // microtask turn with no animation frame between them, so they trivially agree at ANY point
  // during the slide-up (mid-animation included) — the poll then reports "settled" on its very
  // first attempt, before vaul's transition has actually finished, and downstream hit-tests miss
  // against the still-sliding sheet (observed: 11/21 assertions in this spec failing this way).
  // Comparing against the box `expect.poll`'s PREVIOUS invocation saw is the fix: consecutive
  // poll attempts are separated by real wall-clock time (expect.poll's own retry interval), so
  // two agreeing reads there actually span an animation frame.
  let previousBox: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(
      async () => {
        const box = await sheet.boundingBox();
        if (!box) {
          previousBox = null;
          return null;
        }
        const prev = previousBox;
        previousBox = box;
        if (!prev) return null;
        const settled = box.x === prev.x && box.y === prev.y && box.width === prev.width && box.height === prev.height;
        const viewport = page.viewportSize();
        const withinViewport = viewport != null && box.y + box.height <= viewport.height + 1;
        return settled && withinViewport ? box : null;
      },
      { timeout: 10_000, message: 'sheet transition settles to a final-resting box inside the viewport' },
    )
    .not.toBeNull();
  return sheet;
}

for (const viewport of VIEWPORTS) {
  test.describe(`@integration-ui #2712 — MapFilterSheet paints above the mobile Map overlay at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('the sheet content is ACTUALLY ON TOP (hit-tested), never merely present in the DOM', async ({ page }) => {
      await openDirectionInMobileMap(page);
      const sheet = await openFilterSheet(page);

      // Decisive hit-test at the visible sheet's own centre and near its top edge (both inside
      // the region the map's z-60 chrome — recenter buttons, zoom control, legend — previously
      // stole taps from before this fix).
      const box = await sheet.boundingBox();
      expect(box, 'sheet has a layout box').not.toBeNull();
      const points: Array<[number, number]> = [
        [box!.x + box!.width / 2, box!.y + box!.height / 2],
        [box!.x + box!.width / 2, box!.y + 12],
      ];
      for (const [x, y] of points) {
        const isHit = await sheet.evaluate(
          (el, [px, py]) => {
            const atPoint = document.elementFromPoint(px as number, py as number);
            return atPoint != null && (atPoint === el || el.contains(atPoint));
          },
          [x, y] as const,
        );
        expect(isHit, `elementFromPoint(${x}, ${y}) resolves to the sheet or a descendant`).toBe(true);
      }
    });

    test('PAINT-ORDER probe: sheet centre, sheet top, and backdrop are topmost even with vaul\'s pointer-events:none neutralised', async ({
      page,
    }) => {
      await openDirectionInMobileMap(page);
      const sheet = await openFilterSheet(page);
      const box = await sheet.boundingBox();
      expect(box, 'sheet has a layout box').not.toBeNull();

      const backdropY = Math.max(4, box!.y - 20);
      const backdropX = viewport.width / 2;
      const points: Array<[string, number, number]> = [
        ['sheet centre', box!.x + box!.width / 2, box!.y + box!.height / 2],
        ['sheet top edge', box!.x + box!.width / 2, box!.y + 12],
        ['backdrop', backdropX, backdropY],
      ];

      for (const [label, x, y] of points) {
        const { isSheetOrOverlay, isMapSurface } = await forcedPaintOrderHit(page, x, y);
        expect(isSheetOrOverlay, `${label}: forced-paint-order hit at (${x}, ${y}) is the sheet or its overlay`).toBe(
          true,
        );
        expect(isMapSurface, `${label}: forced-paint-order hit at (${x}, ${y}) is NOT the mobile-map z-[60] surface`).toBe(
          false,
        );
      }
    });

    test('PIXEL probe: a backdrop point visibly darkens once the sheet opens (no hit-testing involved)', async ({
      page,
    }) => {
      await openDirectionInMobileMap(page);

      // Fixed sample point: above where the sheet will settle (its top edge sits well below
      // this in every one of these three viewports — the sheet is a bottom-anchored drawer with
      // `mt-24` and its own content), so it is guaranteed to be covered by the backdrop once
      // open and by ordinary map chrome (sky/tiles/controls — never black) beforehand.
      const sampleX = Math.round(viewport.width / 2);
      const sampleY = 60;

      const before = await samplePixel(page, sampleX, sampleY);

      await openFilterSheet(page);
      const after = await samplePixel(page, sampleX, sampleY);

      // vaul's backdrop is `bg-black/80` — an opaque-black layer at 80% alpha compositing OVER
      // whatever is beneath it, so the result is dominated by black (each channel <=
      // ~0.2 * original, i.e. well under half of any plausible "before" brightness) regardless
      // of what color the map happened to be painting at that pixel. A hit-testing exploit
      // cannot fake this: the actual rendered pixel must physically be dark.
      expect(
        luminance(after),
        `backdrop pixel at (${sampleX}, ${sampleY}) darkens once the sheet opens: before=rgb(${before.r},${before.g},${before.b}) after=rgb(${after.r},${after.g},${after.b})`,
      ).toBeLessThan(luminance(before) * 0.5 + 1);
      expect(luminance(after), 'backdrop pixel is dark in absolute terms once the sheet opens').toBeLessThan(80);
    });

    test('the backdrop above the sheet is topmost too — the map shell never wins the paint race', async ({ page }) => {
      await openDirectionInMobileMap(page);
      const sheet = await openFilterSheet(page);
      const box = await sheet.boundingBox();
      expect(box, 'sheet has a layout box').not.toBeNull();

      // A point ABOVE the sheet's top edge (still inside the viewport) — covered by the vaul
      // backdrop, never by the sheet content itself, and previously covered by the map's own
      // fixed z-60 chrome before this fix.
      const backdropY = Math.max(4, box!.y - 20);
      const backdropX = viewport.width / 2;
      const isSheetOrOverlay = await topmostIsSheetOrOverlay(page, backdropX, backdropY);
      expect(isSheetOrOverlay, 'topmost element at a backdrop point belongs to the Drawer overlay/content').toBe(
        true,
      );
    });

    test('a backdrop tap closes the sheet only — the Map stays open', async ({ page }) => {
      await openDirectionInMobileMap(page);
      const sheet = await openFilterSheet(page);
      const box = await sheet.boundingBox();
      expect(box, 'sheet has a layout box').not.toBeNull();
      const backdropY = Math.max(4, box!.y - 20);

      await page.mouse.click(viewport.width / 2, backdropY);

      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible();
    });

    test('Escape closes the sheet, not the Map', async ({ page }) => {
      await openDirectionInMobileMap(page);
      const sheet = await openFilterSheet(page);

      await page.keyboard.press('Escape');

      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('mobile-map-close-list-button')).toBeVisible();
    });

    test('a real, unforced tap on an in-sheet control changes its state', async ({ page }) => {
      await openDirectionInMobileMap(page);
      await openFilterSheet(page);

      const rentButton = page.getByTestId('map-filter-sheet-intent-rent');
      await assertReachable(page, rentButton);
      await expect(rentButton).toHaveAttribute('aria-pressed', 'false');

      await rentButton.click();

      await expect(rentButton).toHaveAttribute('aria-pressed', 'true');
    });
  });
}
