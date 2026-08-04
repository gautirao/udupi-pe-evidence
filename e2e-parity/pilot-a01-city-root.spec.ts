/**
 * Pilot spec for the Discover-V2 parity harness (issue #2076, Stage 1).
 *
 * Scope: exactly ONE state — A01, the city-root landing (`node=root`,
 * area-first journey, anon arm) — for whatever city the operator declares
 * via `PARITY_CITY`. See docs/audit/issue-2076/parity-matrix.md for A01's
 * full row and docs/audit/issue-2076/fixture-environment-manifest.md for
 * `PARITY_CITY`'s contract (required, no default; the local fixture seeds
 * Udupi, the hosted environment has Bangalore).
 *
 * The city is NOT hardcoded here on purpose: a harness whose whole purpose
 * is to run against a declared fixture city must not bake one city into a
 * spec file — the fixture-environment manifest is what declares which city
 * is under test for a given run, not this file.
 *
 * Purpose: prove the harness itself works BEFORE 48 baseline states get
 * built on top of it —
 *   - playwright.parity.config.ts's globalSetup runs and does not throw
 *   - the app is reachable at the configured PLAYWRIGHT_BASE_URL (never the
 *     deployed-site fallback — see playwright.parity.config.ts)
 *   - ROLE-based node resolution (parity-nodes.ts) produces a real URL
 *   - the map settles (waitForMapSettled) without requiring a page.route
 *     mock of our own API
 *   - the ambiguous discover-badge testid (two pills, same testid — see
 *     src/components/discover/DiscoverMapCountBadge.tsx) is disambiguated
 *     by COPY TEXT, never by testid alone
 *
 * This spec makes real, functional `expect()` assertions. It contains NO
 * screenshot-comparison calls and commits ZERO `.png` baselines — visual
 * baseline capture is explicitly Stage 4 work (see
 * docs/audit/issue-2076/screenshot-manifest.md), gated on PR #2074 merging
 * first (BLOCKED_PENDING_2074_FINAL_HEAD elsewhere in the matrix does not
 * apply to A01, which is pricing-independent, but the "no baselines in
 * Stage 1" rule applies to every state uniformly).
 *
 * If the target environment is unreachable, this spec must fail loudly —
 * never silently pass, and never fall back to the deployed site. There is
 * no try/catch around the initial navigation for that reason.
 */

import { test, expect } from '@playwright/test';
import {
  installDeterminismInitScript,
  waitForFontsReady,
  waitForMapSettled,
  installNoApiMockGuard,
  assertBackendTrafficWasReal,
} from './support/determinism';
import { resolveParityNodes, urlForRole } from './support/parity-nodes';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL;

/**
 * The city under test must be declared explicitly by the operator, never
 * assumed. A silent default (e.g. falling back to 'bangalore') is exactly
 * the false-provenance failure mode this issue has been guarding against
 * throughout — a run could believe it tested one city while actually
 * testing another. Fail loudly and immediately if it is unset.
 *
 * See docs/audit/issue-2076/fixture-environment-manifest.md: the local
 * fixture seeds Udupi only; the hosted environment has Bangalore only.
 */
const PARITY_CITY = process.env.PARITY_CITY;
if (!PARITY_CITY) {
  throw new Error(
    '[pilot-a01-city-root] PARITY_CITY is not set. This harness refuses to ' +
    'guess which city to test — set PARITY_CITY explicitly (e.g. "udupi" ' +
    'for the local fixture, "bangalore" for the hosted environment). See ' +
    'docs/audit/issue-2076/fixture-environment-manifest.md.',
  );
}

test.describe(`A01 — city root (area-first, anon) [PARITY_CITY=${PARITY_CITY}]`, () => {
  test('city-root landing settles, shows the city-wide badge by copy text, and talks to the real backend', async ({ page }) => {
    test.skip(!BACKEND_BASE_URL, 'BACKEND_BASE_URL must be set for the parity harness — see parity-global-setup.ts.');

    // Mechanically enforce "no page.route mocks of our own API" — see
    // determinism.ts docstring. Installed before any navigation.
    const backendGuard = await installNoApiMockGuard(page, { backendOrigin: BACKEND_BASE_URL as string });

    await installDeterminismInitScript(page);

    // cityRoot is the one role resolvable without a live DOM walk (it is
    // always `node=root` / the param omitted) — see parity-nodes.ts.
    const nodeMap = await resolveParityNodes(page);
    const url = urlForRole('cityRoot', nodeMap, { city: PARITY_CITY, journey: 'area-first' });

    // No try/catch here by design: an unreachable target must fail this
    // test loudly, not be swallowed into a false pass.
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await waitForFontsReady(page);
    await waitForMapSettled(page);

    // Desktop and mobile deliberately assert DIFFERENT compositions here —
    // this is not an oversight. Per issue #2014 §9, Discover mobile is
    // LIST-FIRST: `DiscoverMapMount` (src/features/discover/views/
    // DiscoverMapMount.tsx) genuinely UNMOUNTS the whole map subtree —
    // Leaflet, DiscoverMapCanvas, and therefore the discover-badge pill —
    // until the user taps the "Map" control (mobile `mobileView` state
    // starts as 'LIST'). Asserting the map-surface badge on mobile would
    // assert a surface that correctly does not exist in the default mobile
    // state, so the mobile branch instead asserts the real mobile list-first
    // composition: the city heading, the child-node list
    // (data-testid="navigation-child-list", src/components/discover/
    // navigation/NavigationChildList.tsx), and a real backend-derived count
    // rendered on at least one child card. `test.info().project.name` is
    // used to branch, since it is the same signal Playwright itself uses to
    // pick the 1366x768 vs 390x844 viewport for this run (see
    // playwright.parity.config.ts's `parity-desktop` / `parity-mobile`
    // project names).
    if (test.info().project.name === 'parity-mobile') {
      // City heading — NavigationLevelPanel.tsx renders the current node's
      // `displayLabel` inside this testid; at the city root that label is
      // the city name itself (e.g. "Bangalore"). Same case-insensitive
      // match against PARITY_CITY as the desktop badge assertion below, for
      // the same reason (CITY_CONFIG capitalizes the slug — see the comment
      // there historically attached to the desktop branch).
      const cityHeading = page
        .getByTestId('navigation-level-heading')
        .getByRole('heading', { level: 2 });
      await expect(cityHeading).toBeVisible({ timeout: 15_000 });
      await expect(cityHeading).toHaveText(new RegExp(`^${PARITY_CITY}$`, 'i'));

      // The direct-children list itself must be present and non-empty —
      // this is the actual mobile list-first composition, not a container
      // that could render empty on a broken page.
      const childList = page.getByTestId('navigation-child-list');
      await expect(childList).toBeVisible({ timeout: 15_000 });
      const childCards = childList.getByRole('listitem');
      await expect(childCards.first()).toBeVisible({ timeout: 15_000 });
      expect(
        await childCards.count(),
        'city root must resolve at least one child node on mobile list-first',
      ).toBeGreaterThan(0);

      // A real backend-derived count must render on at least one card
      // (NavigationChildCard.tsx's `navigation-child-card-count-*` testid)
      // — this is what would fail if the child data were empty/broken even
      // though the list container itself rendered.
      const childCardCounts = childList.locator('[data-testid^="navigation-child-card-count-"]');
      await expect(childCardCounts.first()).toBeVisible({ timeout: 15_000 });
    } else {
      // Disambiguate the shared data-testid="discover-badge" by COPY TEXT —
      // the city-wide pill's exact signature phrase, per
      // src/components/discover/DiscoverMapCountBadge.tsx's public-landing
      // branch ("Showing {N} verified properties across {City}").
      const cityWideBadge = page
        .getByTestId('discover-badge')
        .filter({ hasText: /verified properties across/i });

      await expect(cityWideBadge).toBeVisible({ timeout: 15_000 });

      // The rendered {City} label is NOT necessarily the same string as the
      // `city` URL slug: DiscoverMapCountBadge looks the slug up in
      // CITY_CONFIG (src/lib/localityUtils.ts) and renders `label`, which for
      // every city currently configured (udupi/kundapur/mangalore/bangalore)
      // is just the slug with its first letter capitalized — e.g.
      // `city=bangalore` renders "...across Bangalore". Because the assertion
      // below is case-insensitive (`/i`), asserting directly against
      // PARITY_CITY's raw casing is safe without reimplementing that
      // capitalization: a case-insensitive match on "bangalore" equally
      // matches a rendered "Bangalore". This does NOT assume the label is
      // *textually* the same as the slug beyond casing — if CITY_CONFIG ever
      // gains a city whose label diverges from a capitalized slug (e.g. an
      // abbreviation or alias), this assertion would need to derive the
      // expected label from CITY_CONFIG instead; recorded as a known
      // limitation rather than guessed around here.
      await expect(cityWideBadge).toContainText(
        new RegExp(`verified properties across ${PARITY_CITY}`, 'i'),
      );
    }

    // The URL must reflect the resolved city-root state — no leaked
    // area/direction node param and no stale camera params from a previous
    // navigation in this same browser context.
    expect(page.url()).toContain('journey=area-first');
    expect(page.url()).not.toContain('node=a');
    expect(page.url()).not.toContain('node=d');
    expect(page.url()).not.toContain('node=c');

    // Proves this run observed the REAL backend, not a page.route stub of
    // our own API — see determinism.ts::assertBackendTrafficWasReal.
    assertBackendTrafficWasReal(backendGuard.interceptedBackendRequests);
  });
});
