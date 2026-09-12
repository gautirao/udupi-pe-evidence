import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * #2433 — BEFORE/AFTER visual evidence capture for the Commercial card summary.
 *
 * <h2>This spec is INERT unless explicitly asked for</h2>
 *
 * It is gated on `CAPTURE_2433=1`. The `full` project has no `testMatch`
 * allowlist, so every spec under `e2e/` runs in it — without this gate a capture
 * spec would write PNGs into the repo on every unrelated lane's full-suite run.
 * It is deliberately NOT added to `smoke`.
 *
 * <h2>Why two arms and how BEFORE is produced</h2>
 *
 * BEFORE is not a different URL, a different fixture or a different journey — it
 * is the SAME journey with `PropertyCard.tsx` restored to `541dbd43` (the
 * merge-of-main commit that precedes the wiring at `12076c91`). Only the property
 * under test varies; everything else is held constant, so a difference between the
 * two frames is attributable to the wiring and to nothing else.
 *
 * The arms therefore must NOT be run in one process. The runner sets
 * `CAPTURE_ARM`, the source is swapped between runs, and each arm writes its own
 * frames plus a meta JSON recording the counts it actually observed.
 *
 * <h2>Anti-recycling</h2>
 *
 * Each arm records `listingCards` / `commercialSummaryRows` alongside its frames.
 * If the two arms ever produce identical counts AND identical frames, the capture
 * did not re-render and the evidence is void — a stale frame and a genuine
 * no-change look the same on disk. The counts make that distinguishable.
 *
 * <h2>Reachability is via URL state, not UI composition</h2>
 *
 * Same reasoning as the committed regression guard: `rscope=vp&rvp=...` reaches the
 * data path regardless of what chrome renders, and `node` is REQUIRED because
 * `useDiscoverListings` is gated on `listingsEnabled`, which top-grouped journey
 * states switch off (#1655). Omitting it measures 0 cards and reads as "broken"
 * when it really means "the query never ran".
 */

const CITY = 'bangalore';
const AREA_KEY = 'IN|KA|Bengaluru|Sanjeevini Nagar';
const AREA_NODE = `a:${AREA_KEY}`;
/** s,w,n,e around the seeded Commercial inventory (~12.9158..12.9164 / 77.5888..77.5893). */
const RVP = '12.90,77.57,12.93,77.61';

// Paths are derived from THIS FILE's location, not from process.cwd().
//
// `__dirname` is undefined in this ESM project and throws at MODULE LOAD, which
// Playwright reports as "No tests found" rather than as a failing test — a
// collection error is silent and total. `import.meta.url` is the ESM-correct
// equivalent and is safe here.
//
// cwd is deliberately NOT used, which is a departure from the sibling specs.
// `scripts/run-e2e-local.sh` never cd's; it runs `npx playwright test` in the
// CALLER's cwd. In a worktree that is easy to get wrong, and when it is wrong the
// failure is silent in the worst possible way for evidence: frames would be written
// into a DIFFERENT checkout's docs/ and the auth fixture read from that checkout
// too, producing plausible-looking PNGs that do not depict this branch at all.
// Anchoring to the spec file makes the output tree a property of which file ran.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_STATE = path.join(REPO_ROOT, 'e2e', 'fixtures', 'user-auth.json');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'pr-evidence', 'issue-2433');

const ARM = process.env.CAPTURE_ARM === 'before' ? 'before' : 'after';

/**
 * #2433 names BOTH viewports explicitly — Required behaviour ("keep card
 * height/density usable at mobile 390x844"), Tests ("responsive browser evidence
 * at 390x844 AND 1366x768") and the Definition of Done. Desktop-only frames
 * therefore evidence half the contract.
 *
 * Mobile is not the same claim photographed twice. On desktop the question is
 * whether the summary RENDERS; at 390x844 the question is whether the card stays
 * COMPACT AND USABLE once it carries an extra row. That is the requirement
 * actually written down, and a desktop frame cannot answer it.
 */
const VIEWPORTS = {
  desktop: { width: 1366, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;
const VP = process.env.CAPTURE_VIEWPORT === 'mobile' ? VIEWPORTS.mobile : VIEWPORTS.desktop;
const PREFIX = `${ARM}-viewport-${VP.width}x${VP.height}`;

const q = (s: string) => encodeURIComponent(s);
const VIEWPORT_URL = `/discover?city=${CITY}&node=${q(AREA_NODE)}&rscope=vp&rvp=${q(RVP)}`;

test.describe('#2433 visual evidence — authenticated VIEWPORT journey', () => {
  test.skip(
    process.env.CAPTURE_2433 !== '1',
    'evidence capture is opt-in; set CAPTURE_2433=1 to run it',
  );
  test.skip(
    !fs.existsSync(AUTH_STATE),
    'user-auth.json absent — global-setup did not run; environmental, not a product failure',
  );
  test.use({ storageState: AUTH_STATE, viewport: { width: VP.width, height: VP.height } });

  test(`capture ${ARM} ${VP.width}x${VP.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    fs.mkdirSync(OUT_DIR, { recursive: true });

    await page.goto(VIEWPORT_URL);
    await page.waitForSelector('[data-testid="listing-card"]', { timeout: 45_000 });

    // Dismiss the telemetry consent banner before capturing. It floats over the
    // lower-left of the viewport and occluded the first card in the initial
    // capture. DECLINE, not Accept: the product's contract is default-deny, and a
    // capture run must not opt a fixture user into data collection as a side
    // effect of taking a screenshot.
    const decline = page.getByRole('button', { name: /decline/i });
    if (await decline.isVisible().catch(() => false)) {
      await decline.click();
      await page.waitForTimeout(500);
    }

    const cards = page.locator('[data-testid="listing-card"]');
    const cardCount = await cards.count();

    // The cards render BELOW the fold — the panel opens on its header. A raw
    // viewport shot therefore depicts the map and the panel header and no card at
    // all, which is exactly what the first capture produced: a frame that looks
    // like evidence and shows nothing under test.
    //
    // Note this scroll is also why the panel frames do NOT contain the result-scope
    // header: scrolling the first card into view pushes it above the viewport. An
    // earlier version of the evidence comment claimed that header was visible and
    // cited it as proof of which journey was captured; it is not there. The journey
    // is evidenced by the URL recorded in each meta JSON, by the breadcrumb, and by
    // the in-image "N verified properties" badge.
    await cards.first().scrollIntoViewIfNeeded();
    // Settle, so a summary painted on a later tick is not captured as absent.
    await page.waitForTimeout(2500);

    // Without inventory the frames would show an empty panel in BOTH arms, and the
    // pair would "agree" for a reason that has nothing to do with the wiring.
    expect(cardCount, 'fixture precondition: the VIEWPORT must return listing cards')
      .toBeGreaterThan(0);

    const summaryCount = await page
      .locator('[data-testid="listing-commercial-summary"]')
      .count();

    // Frame 1 — the cards themselves, clipped to the union of the first three
    // bounding boxes. Derived from live geometry rather than a hardcoded region so
    // the crop follows the cards instead of asserting where they "should" be; the
    // BEFORE arm's cards are shorter (no summary row), and a fixed clip would
    // silently crop that difference out of the very frame meant to show it.
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < Math.min(3, cardCount); i++) {
      const box = await cards.nth(i).boundingBox();
      if (box) boxes.push(box);
    }

    const PAD = 8;
    const clip = boxes.length
      ? (() => {
          const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - PAD);
          const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - PAD);
          const right = Math.max(...boxes.map((b) => b.x + b.width)) + PAD;
          const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + PAD;
          return {
            x,
            y,
            width: Math.min(right - x, VP.width - x),
            height: Math.min(bottom - y, VP.height - y),
          };
        })()
      : undefined;

    await page.screenshot({
      path: path.join(OUT_DIR, `${PREFIX}-cards.png`),
      ...(clip ? { clip } : {}),
    });

    // Frame 2 — whole viewport, for context: which journey, how many results, the
    // declined-consent state and the signed-in chrome. Taken AFTER the scroll, so
    // the cards are actually in it.
    await page.screenshot({
      path: path.join(OUT_DIR, `${PREFIX}-panel.png`),
      fullPage: false,
    });

    // Frame 3 — a tight crop of a single card, so a reviewer does not have to hunt
    // for the changed pixels.
    await cards.first().screenshot({
      path: path.join(OUT_DIR, `${PREFIX}-first-card.png`),
    });

    // The mobile requirement is about DENSITY — "cards remain compact and usable".
    // A frame shows a card is not visibly broken; it does not answer "how much
    // taller did the summary make it". Recording the rendered height turns that
    // into a BEFORE/AFTER delta a reviewer can check arithmetically instead of
    // eyeballing, which is the same move that made the crop geometry persuasive.
    const firstCardBox = await cards.first().boundingBox();

    fs.writeFileSync(
      path.join(OUT_DIR, `${PREFIX}-meta.json`),
      JSON.stringify(
        {
          arm: ARM,
          url: VIEWPORT_URL,
          authenticated: true,
          viewport: `${VP.width}x${VP.height}`,
          listingCards: cardCount,
          commercialSummaryRows: summaryCount,
          // Both counts above are DOM-measured via locator.count(), NOT counted by
          // eye in the frames — only part of the card list falls inside a crop.
          countsAre: 'DOM-measured (locator.count()), not visible-in-frame counts',
          firstCardHeightPx: firstCardBox ? Math.round(firstCardBox.height) : null,
          firstCardWidthPx: firstCardBox ? Math.round(firstCardBox.width) : null,
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    // eslint-disable-next-line no-console
    console.log(
      `[capture-2433] arm=${ARM} viewport=${VP.width}x${VP.height} cards=${cardCount} `
        + `summaries=${summaryCount} firstCardH=${firstCardBox ? Math.round(firstCardBox.height) : 'n/a'}`,
    );
  });
});
