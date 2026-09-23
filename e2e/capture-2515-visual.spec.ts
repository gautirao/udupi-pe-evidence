import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * #2515 — BEFORE/AFTER mobile visual evidence for the Commercial rent
 * security-deposit submit-gate.
 *
 * <h2>This spec is INERT unless explicitly asked for</h2>
 *
 * Gated on `CAPTURE_2515=1`, following the `capture-2433-visual.spec.ts`
 * convention exactly: the `full` project has no `testMatch` allowlist, so
 * every spec under `e2e/` runs in it — without this gate a capture run would
 * write PNGs into the repo on every unrelated lane's full-suite run. Not
 * added to `smoke`.
 *
 * <h2>Two arms, real Playwright viewport emulation</h2>
 *
 * `CAPTURE_ARM=before|after` selects which arm runs. Each arm is its own
 * process invocation (matching #2433's reasoning: two arms in one process
 * risk state bleeding between them). BEFORE fills every required field
 * EXCEPT the security deposit; AFTER additionally fills the deposit, adds 3
 * photos, and confirms the map pin — mirroring exactly the desktop evidence
 * already accepted on this PR (docs/pr-evidence/issue-2515/01_before_*.jpg,
 * 02_after_*.jpg), so mobile is the same claim at a different viewport, not
 * a different claim.
 *
 * Viewport is set via `test.use({ viewport })`, which is genuine Playwright
 * browser-context viewport emulation (CDP-level), not a real-window resize —
 * this is the "existing Playwright --device-class capture path" referenced
 * on the PR, and unlike a live claude-in-chrome session it actually changes
 * the rendered layout viewport.
 *
 * <h2>Safety: this MUST run against a local backend, never production</h2>
 *
 * `e2e/global-setup.ts` defaults BACKEND_BASE_URL / PLAYWRIGHT_BASE_URL to
 * the deployed production backend/frontend when unset (see #1956). This spec
 * refuses to run unless both env vars are explicitly set to a loopback
 * address, so a bare `CAPTURE_2515=1 npx playwright test` without the local
 * env can never create test data against production.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_STATE = path.join(REPO_ROOT, 'e2e', 'fixtures', 'broker-auth.json');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'pr-evidence', 'issue-2515');
const PHOTOS_DIR = path.join(REPO_ROOT, 'e2e', 'fixtures', 'sample-photos');

const ARM = process.env.CAPTURE_ARM === 'after' ? 'after' : 'before';
const VP = { width: 390, height: 844 } as const;
const PREFIX = `${ARM}-mobile-${VP.width}x${VP.height}`;

function isLoopback(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}

test.describe('#2515 visual evidence — Commercial rent deposit gate (mobile)', () => {
  test.skip(
    process.env.CAPTURE_2515 !== '1',
    'evidence capture is opt-in; set CAPTURE_2515=1 to run it',
  );
  test.skip(
    !isLoopback(process.env.BACKEND_BASE_URL) || !isLoopback(process.env.PLAYWRIGHT_BASE_URL),
    'refusing to run: BACKEND_BASE_URL and PLAYWRIGHT_BASE_URL must both be explicit loopback '
      + 'addresses for a capture run (this repo\'s global-setup otherwise defaults to production).',
  );
  test.skip(
    !fs.existsSync(AUTH_STATE),
    'broker-auth.json absent — global-setup did not authenticate a broker (BROKER_EMAIL/PASSWORD '
      + 'not set, or Supabase auth failed); environmental, not a product failure',
  );
  test.use({ storageState: AUTH_STATE, viewport: { width: VP.width, height: VP.height } });

  test(`capture ${ARM} ${VP.width}x${VP.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(OUT_DIR, { recursive: true });

    await page.goto('/broker/listings/new/commercial');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /create a listing/i })).toBeVisible({ timeout: 15_000 });

    // Subtype: Office
    await page.locator('[id*="subtype" i]').first().click();
    await page.getByRole('option', { name: 'Office', exact: true }).click();

    // Purpose: For Rent
    await page.getByRole('button', { name: 'For Rent', exact: true }).click();

    // Locality: search "Manipal" (real geocode result — matches the desktop
    // evidence exactly, same fixture-adjacent city).
    const localityInput = page.getByPlaceholder(/search for a location/i);
    await localityInput.fill('Manipal');
    await page.getByRole('button', { name: 'Use', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(page.getByText(/location confirmed/i)).toBeVisible({ timeout: 10_000 });

    // Title
    await page.getByPlaceholder(/500 sqft shop/i).fill(
      ARM === 'before' ? '500 sqft Office in Manipal' : '500 sqft Office in Manipal (deposit added)',
    );

    // Built area preset + floor
    await page.getByRole('radio', { name: '500 sqft', exact: true }).click();
    await page.locator('#floorChoice').click();
    await page.getByRole('option', { name: 'Ground floor', exact: true }).click();

    // Monthly rent
    await page.locator('#monthlyRent').fill('25000');

    if (ARM === 'after') {
      await page.locator('#securityDepositMonths').fill('2');

      // The Photos section only exposes a real file input once a draft exists
      // (before that it shows "Save your details to add photos."). Save the
      // draft first — this mirrors the manual desktop capture, where photos
      // were only uploadable after the first Review/Save-draft round-trip.
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText(/save your details to add photos/i).waitFor({ state: 'hidden', timeout: 15_000 });

      // 3 photos, so the deposit gate is isolated as the ONLY difference vs
      // the before-arm baseline of "not enough" (matches desktop evidence).
      fs.mkdirSync(PHOTOS_DIR, { recursive: true });
      const photoPaths: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const p = path.join(PHOTOS_DIR, `sample-${i}.png`);
        if (!fs.existsSync(p)) {
          // 1x1 PNG, distinct per index only in filename — content is irrelevant,
          // only the fact that 3 images exist matters to the gate under test.
          fs.writeFileSync(
            p,
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              'base64',
            ),
          );
        }
        photoPaths.push(p);
      }
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(photoPaths);
      await expect(page.getByText(/no photos added yet/i)).toHaveCount(0, { timeout: 10_000 });

      // Confirm the map pin (separate from locality text confirmation).
      await page.getByRole('button', { name: /pin location on map/i }).click();
      await page.getByRole('button', { name: 'Confirm Location', exact: true }).click();
      await expect(page.getByText(/pin confirmed/i).first()).toBeVisible({ timeout: 10_000 });
    }

    // Reach the Review step.
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.has('draftId'), { timeout: 15_000 });
    await page.waitForTimeout(1000);

    const submitBtn = page.getByRole('button', { name: /submit for review/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    const submitDisabled = await submitBtn.isDisabled();

    // The claim under test: BEFORE must be blocked, AFTER must be enabled.
    // A capture that silently produced the wrong state would otherwise look
    // like valid evidence while proving nothing.
    if (ARM === 'before') {
      expect(submitDisabled, 'BEFORE arm: Submit for review must be disabled (deposit missing)').toBe(true);
      await expect(page.getByText(/add the security deposit/i)).toBeVisible();
    } else {
      expect(submitDisabled, 'AFTER arm: Submit for review must be enabled (deposit filled)').toBe(false);
      await expect(page.getByText(/add the security deposit/i)).toHaveCount(0);
    }

    await page.screenshot({ path: path.join(OUT_DIR, `${PREFIX}.png`), fullPage: false });

    fs.writeFileSync(
      path.join(OUT_DIR, `${PREFIX}-meta.json`),
      JSON.stringify(
        {
          arm: ARM,
          viewport: `${VP.width}x${VP.height}`,
          url: page.url(),
          submitDisabled,
          depositMissingItemVisible: await page.getByText(/add the security deposit/i).count() > 0,
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    // eslint-disable-next-line no-console
    console.log(`[capture-2515] arm=${ARM} viewport=${VP.width}x${VP.height} submitDisabled=${submitDisabled}`);
  });
});
