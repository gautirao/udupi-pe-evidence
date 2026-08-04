/**
 * Capture runner for the frozen-mock harness (issue #2076 Amendment-1, AC12).
 *
 * Reuses e2e-parity/support/determinism.ts's font-wait and animation-kill helpers (NOT modified —
 * see that file). Does NOT reuse waitForMapSettled from that module: it asserts on the shipped
 * app's own "Loading..." text convention, which has no equivalent contract in this mock. Mock
 * readiness is instead driven by the mock's own self-mount signal, `[data-design-screen]` —
 * see waitForMockReady below.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { installDeterminismInitScript, waitForFontsReady } from '../../support/determinism';
import type { CaptureRecord, CaptureState, Verification, VerificationResult } from './types';

const VIEWPORT_BY_KIND = {
  desktop: { width: 1366, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;

/** The exact console text state-mapping.md documented when the mock is served from the wrong document root. */
const CDN_FAILURE_SIGNATURE = /Cannot read properties of undefined \(reading 'Icon'\)/;

/**
 * Registers console/pageerror listeners BEFORE any navigation, so a CDN load failure during the
 * very first paint is observed rather than missed. Returns the accumulating array by reference —
 * callers read it after navigation/mount, they do not need to re-attach anything.
 */
export function installCdnFailureListeners(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });
  return { errors };
}

/**
 * Waits for the mock to mount by waiting for `[data-design-screen]` to attach to the DOM — this
 * attribute is present on every designed composition (its VALUE is not always trustworthy per
 * types.ts's docstring, but its mere presence is a reliable "React has mounted and NewDiscover.jsx
 * ran" signal on every state this harness targets).
 *
 * Fails loudly (throws) if the mock never mounts, or if a known CDN-failure console signature was
 * observed — never silently captures a half-rendered page.
 */
export async function waitForMockReady(page: Page, errors: string[], timeoutMs = 30_000): Promise<void> {
  const screenLocator = page.locator('[data-design-screen]').first();
  try {
    await screenLocator.waitFor({ state: 'attached', timeout: timeoutMs });
  } catch {
    throw new Error(
      `[mock-capture] the mock did not mount within ${timeoutMs}ms — [data-design-screen] never ` +
        'appeared. This usually means the unpkg CDN failed to load React/Babel/Leaflet, or the ' +
        'mock was served from the wrong document root (must be retrends-design-system/, not ' +
        `new_discover/). Captured console/page errors: ${errors.length ? JSON.stringify(errors) : '(none captured)'}`,
    );
  }

  const cdnErrors = errors.filter((e) => CDN_FAILURE_SIGNATURE.test(e));
  if (cdnErrors.length > 0) {
    throw new Error(
      `[mock-capture] CDN-failure signature detected in console/page errors even though ` +
        `[data-design-screen] appeared — this indicates a partial/broken render, not a clean one. ` +
        `Errors: ${JSON.stringify(cdnErrors)}`,
    );
  }
}

async function runVerification(page: Page, verification: Verification): Promise<VerificationResult> {
  switch (verification.kind) {
    case 'data-design-screen-attribute': {
      const locator = page.locator('[data-design-screen]').first();
      await locator.waitFor({ state: 'attached', timeout: 15_000 });
      const observed = (await locator.getAttribute('data-design-screen')) ?? '(attribute missing)';
      const passed = verification.assertEquality ? observed === verification.expectedScreenId : true;
      return {
        kind: verification.kind,
        description: verification.assertEquality
          ? 'data-design-screen equals the cited manifest state id'
          : 'data-design-screen value recorded (not asserted — see manifest-states.ts note for this capture)',
        expected: verification.expectedScreenId,
        observed,
        passed,
        recordOnly: !verification.assertEquality,
      };
    }
    case 'heading-text': {
      const locator = page.getByRole('heading', { level: 2 }).first();
      await expect(locator).toBeVisible({ timeout: 15_000 });
      const observed = ((await locator.textContent()) ?? '').trim();
      const passed =
        verification.expectedText instanceof RegExp
          ? verification.expectedText.test(observed)
          : observed === verification.expectedText;
      return {
        kind: verification.kind,
        description: 'h2 heading text matches the manifest expectedHeading',
        expected: String(verification.expectedText),
        observed,
        passed,
        recordOnly: false,
      };
    }
    case 'dom-text': {
      const scope = verification.scopeSelector ? page.locator(verification.scopeSelector) : page;
      const locator = scope.getByText(verification.expectedText).first();
      let passed = true;
      let observed: string;
      try {
        await expect(locator).toBeVisible({ timeout: 15_000 });
        observed = ((await locator.textContent()) ?? '').trim();
      } catch {
        passed = false;
        observed = '(not found / not visible)';
      }
      return {
        kind: verification.kind,
        description: verification.description,
        expected: String(verification.expectedText),
        observed,
        passed,
        recordOnly: false,
      };
    }
    case 'input-value': {
      const locator = page.locator(verification.selector);
      await locator.waitFor({ state: 'attached', timeout: 15_000 });
      const observed = await locator.inputValue();
      return {
        kind: verification.kind,
        description: verification.description,
        expected: verification.expectedValue,
        observed,
        passed: observed === verification.expectedValue,
        recordOnly: false,
      };
    }
    case 'aria-pressed': {
      const locator = page.locator(verification.selector);
      await locator.waitFor({ state: 'attached', timeout: 15_000 });
      const observed = (await locator.getAttribute('aria-pressed')) ?? '(attribute missing)';
      return {
        kind: verification.kind,
        description: verification.description,
        expected: String(verification.expectedPressed),
        observed,
        passed: observed === String(verification.expectedPressed),
        recordOnly: false,
      };
    }
    case 'component-visible': {
      const locator = page.locator(verification.selector).first();
      let passed = true;
      try {
        await expect(locator).toBeVisible({ timeout: 15_000 });
      } catch {
        passed = false;
      }
      return {
        kind: verification.kind,
        description: verification.description,
        expected: 'visible',
        observed: passed ? 'visible' : 'not visible / not found',
        passed,
        recordOnly: false,
      };
    }
    default: {
      const exhaustive: never = verification;
      throw new Error(`[mock-capture] unhandled verification kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Navigates to the state's hash, waits for the mock to mount, runs any required interaction,
 * hard-asserts the viewport, runs every declared verification, screenshots, and writes one JSON
 * metadata file per capture. Throws (does not swallow) on any failure — a capture that cannot be
 * verified is a FAILED capture, per the task contract.
 */
export async function runCapture(page: Page, state: CaptureState, outputDir: string): Promise<CaptureRecord> {
  const { errors } = installCdnFailureListeners(page);
  await installDeterminismInitScript(page);

  await page.goto(`/ui_kits/new_discover/index.html${state.hash}`, { waitUntil: 'domcontentloaded' });
  await waitForMockReady(page, errors);
  await waitForFontsReady(page);

  if (state.interact) {
    await state.interact(page);
    // The mock re-renders via a plain React state update after each interaction (no
    // event-driven "settled" signal exists for it, unlike the app's CameraIntent hook) — a fixed
    // settle window here mirrors the same fixed-wait pattern determinism.ts documents for the
    // shipped app's map, for the same reason: no better signal is available.
    await page.waitForTimeout(1_000);
  } else {
    await page.waitForTimeout(500);
  }

  const expectedViewport = VIEWPORT_BY_KIND[state.viewport];
  const observedViewport = page.viewportSize();
  if (!observedViewport || observedViewport.width !== expectedViewport.width || observedViewport.height !== expectedViewport.height) {
    throw new Error(
      `[mock-capture:${state.id}] viewport mismatch: expected ${JSON.stringify(expectedViewport)}, ` +
        `got ${JSON.stringify(observedViewport)}. A silently-wrong-size capture is treated as a hard failure.`,
    );
  }

  const verifications: VerificationResult[] = [];
  for (const verification of state.verifications) {
    verifications.push(await runVerification(page, verification));
  }
  const failed = verifications.filter((v) => !v.passed);
  if (failed.length > 0) {
    throw new Error(
      `[mock-capture:${state.id}] ${failed.length} verification(s) failed:\n` +
        failed
          .map((f) => `  - [${f.kind}] ${f.description}: expected ${JSON.stringify(f.expected)}, observed ${JSON.stringify(f.observed)}`)
          .join('\n'),
    );
  }

  const capturesDir = path.join(outputDir, 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });
  const screenshotPath = path.join(capturesDir, `${state.id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const record: CaptureRecord = {
    id: state.id,
    manifestStateId: state.manifestStateId,
    aStates: state.aStates,
    viewport: state.viewport,
    hash: state.hash,
    requestedViewport: expectedViewport,
    observedViewport,
    verifications,
    screenshotPath: path.relative(outputDir, screenshotPath),
    notes: state.notes,
    capturedAt: new Date().toISOString(),
  };

  const metadataDir = path.join(outputDir, 'metadata');
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(path.join(metadataDir, `${state.id}.json`), JSON.stringify(record, null, 2));

  return record;
}
