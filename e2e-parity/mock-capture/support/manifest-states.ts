/**
 * The capture list for issue #2076 Amendment-1 AC12.
 *
 * Every entry here corresponds to an AC11 cell in docs/audit/issue-2076/state-mapping.md that
 * carries a real frozen reference (REF / REF (shared) / REF (no-self-ID) / PARTIAL's referenced
 * half). Cells classified NO_FROZEN_REFERENCE or NOT_DESIGNED are deliberately absent — capturing
 * them would manufacture a comparison against nothing, which is exactly what the amendment (AC15)
 * forbids downstream.
 *
 * Hashes and interactions here are taken from state-mapping.md's live-verified findings (Step 2 of
 * this amendment), not re-guessed: `#r=north` -> "Inside North Bangalore", `#a=hebbal` ->
 * "Properties in Hebbal", the property-search / filter-toolbar / city-switcher / area-autocomplete
 * selectors below are read directly from
 * docs/design/retrends-design-system/ui_kits/new_discover/src/NDPanel.jsx (data-design-component
 * values + DOM structure), not inferred.
 */

import type { Page } from '@playwright/test';
import type { CaptureState } from './types';

async function clickRentToggle(page: Page): Promise<void> {
  await page.locator('[data-design-component="buy-rent-toggle"] button', { hasText: 'Rent' }).click();
}

async function submitPropertySearch(page: Page, query: string): Promise<void> {
  const input = page.locator('[data-design-component="property-search"] input');
  await input.fill(query);
  await page.locator('[data-design-component="property-search"] button', { hasText: 'Search' }).click();
}

async function toggleVerifiedOnlyChip(page: Page): Promise<void> {
  await page
    .locator('[data-design-component="filter-toolbar"] button', { hasText: 'Verified only' })
    .click();
}

async function openCitySwitcher(page: Page): Promise<void> {
  // CityPill's only direct <button> child is the toggle; the listbox is a sibling that only
  // exists once `open` is true.
  await page.locator('[data-design-component="city-switcher"] > button').click();
}

async function openAreaAutocomplete(page: Page): Promise<void> {
  await page.locator('[data-design-component="area-autocomplete"] input').fill('heb');
}

export const MOCK_STATES: CaptureState[] = [
  {
    id: 'areas-city-default',
    manifestStateId: 'areas-city-default',
    aStates: ['A01'],
    viewport: 'desktop',
    hash: '#',
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-city-default', assertEquality: true },
      { kind: 'heading-text', expectedText: 'Where do you want to explore?' },
    ],
    notes: 'Self-identifying. Canonical desktop city-root landing.',
  },
  {
    id: 'areas-region-clusters',
    manifestStateId: 'areas-region-clusters',
    aStates: ['A03', 'A05'],
    viewport: 'desktop',
    hash: '#r=north',
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-region-clusters', assertEquality: true },
      { kind: 'heading-text', expectedText: /Inside North Bangalore/ },
    ],
    notes:
      'Self-identifying. state-mapping.md proved A03 and A05 are the literal same manifest state ' +
      '(live two-level drill-down) — this one capture stands for both A-numbers.',
  },
  {
    id: 'areas-region-areas',
    manifestStateId: 'areas-region-areas',
    aStates: ['A02', 'A04'],
    viewport: 'desktop',
    hash: '#r=south',
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-region-areas', assertEquality: true },
      { kind: 'heading-text', expectedText: /Areas in South/ },
    ],
    notes:
      'Self-identifying. state-mapping.md proved A02 and A04 are the literal same manifest state ' +
      '(live two-level drill-down) — this one capture stands for both A-numbers.',
  },
  {
    id: 'areas-area-listings',
    manifestStateId: 'areas-area-listings',
    aStates: ['A08', 'A20'],
    viewport: 'desktop',
    hash: '#a=hebbal',
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-area-listings', assertEquality: true },
      { kind: 'heading-text', expectedText: 'Properties in Hebbal' },
      {
        kind: 'component-visible',
        description: 'A20 school-shortcut affordance is present inside this same composition',
        selector: '[data-design-component="school-shortcut"]',
      },
    ],
    notes:
      'Self-identifying. Also captures A20 (school-shortcut) inline — it is part of this same ' +
      'composition per the manifest, not a separate designed state; the Schools destination it ' +
      'links to is out of scope per #2076 non-goals.',
  },
  {
    id: 'areas-area-listings-rent-variant',
    manifestStateId: 'areas-area-listings',
    aStates: ['A09'],
    viewport: 'desktop',
    hash: '#a=hebbal',
    interact: clickRentToggle,
    verifications: [
      // Recorded, NOT asserted: screenId never branches on buyRent (proved by source read in
      // state-mapping.md), so this attribute is expected to stay identical to the Buy composition.
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-area-listings', assertEquality: false },
      {
        kind: 'dom-text',
        description: 'rent-framing copy replaces the sale-framing copy after toggling Rent',
        expectedText: /rental/i,
      },
    ],
    notes:
      'A09 is NOT a distinct manifest state id — state-mapping.md proved this by reading the ' +
      '`screenId` IIFE, which never branches on `buyRent`. This capture is evidence of a real ' +
      'rendering variant (verified live: copy changes to "N rentals"), not a designed state; the ' +
      'attribute check above is intentionally record-only.',
  },
  {
    id: 'areas-listings-query-active',
    manifestStateId: 'areas-listings-query-active',
    aStates: ['A11'],
    viewport: 'desktop',
    hash: '#a=hebbal',
    interact: (page) => submitPropertySearch(page, '3 bhk'),
    verifications: [
      // The manifest cites this state's id as `areas-listings-query-active`; the DOM never emits
      // it (screenId does not branch on listingQuery) — recorded, not asserted, per state-mapping.md.
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-listings-query-active', assertEquality: false },
      {
        kind: 'input-value',
        description: 'property-search input retains the submitted query',
        selector: '[data-design-component="property-search"] input',
        expectedValue: '3 bhk',
      },
      {
        kind: 'dom-text',
        description: '"N of M" filtered-count header with a Reset action is shown',
        expectedText: /of \d+/,
      },
    ],
    notes:
      'No-self-ID per state-mapping.md (A11): the manifest id is never the value of ' +
      'data-design-screen at runtime. Verified instead by the search input retaining its value ' +
      'and the filtered "N of M" header rendering.',
  },
  {
    id: 'areas-listings-filters-active',
    manifestStateId: 'areas-listings-filters-active',
    aStates: ['A12'],
    viewport: 'desktop',
    hash: '#a=hebbal',
    interact: toggleVerifiedOnlyChip,
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-listings-filters-active', assertEquality: false },
      {
        kind: 'aria-pressed',
        description: 'the "Verified only" filter chip is pressed after toggling it',
        selector: '[data-design-component="filter-toolbar"] button:has-text("Verified only")',
        expectedPressed: true,
      },
    ],
    notes:
      'No-self-ID per state-mapping.md (A12): same screenId mechanism as A11 (filters live in ' +
      'ctx.filters, also absent from the screenId branch conditions). Verified instead by the ' +
      'chip\'s own aria-pressed state, which is a real, mock-authored a11y signal.',
  },
  {
    id: 'areas-listings-empty-results',
    manifestStateId: 'areas-listings-query-active',
    aStates: ['A13'],
    viewport: 'desktop',
    hash: '#a=hebbal',
    interact: (page) => submitPropertySearch(page, 'zzzznomatch123'),
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-listings-query-active', assertEquality: false },
      {
        kind: 'dom-text',
        description: 'the designed "No homes match" empty state renders for a query with zero results',
        expectedText: 'No homes match',
      },
    ],
    notes:
      'A13 (empty filtered results) is documented inside areas-listings-query-active\'s manifest ' +
      'notes, not as its own state id, and inherits the same no-self-ID mechanism as A11/A12 per ' +
      'state-mapping.md. Verified by the empty-state title rendering for a query with no matches.',
  },
  {
    id: 'areas-browse-all',
    manifestStateId: 'areas-browse-all',
    aStates: ['A14'],
    viewport: 'desktop',
    hash: '#b=1',
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-browse-all', assertEquality: true },
      { kind: 'heading-text', expectedText: /All homes in Bangalore/ },
    ],
    notes: 'Self-identifying.',
  },
  {
    id: 'shell-city-switcher-open',
    manifestStateId: 'shell-city-switcher-open',
    aStates: [],
    viewport: 'desktop',
    hash: '#',
    interact: openCitySwitcher,
    verifications: [
      // Manifest's own note says "Overlay only; underlying state unchanged" — the correct,
      // positive assertion here is that the underlying screen id is UNCHANGED (areas-city-default),
      // not that it became "shell-city-switcher-open" (which the DOM never reports).
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-city-default', assertEquality: true },
      {
        kind: 'component-visible',
        description: 'the city-switcher listbox overlay opened',
        selector: '[data-design-component="city-switcher"] [role="listbox"]',
      },
    ],
    notes:
      'AC13 shell overlay, not a numbered A-state. The manifest itself documents this as ' +
      '"overlay only; underlying state unchanged" — this capture verifies that contract directly ' +
      'rather than asserting a screen id the mechanism was never designed to emit.',
  },
  {
    id: 'shell-area-autocomplete-open',
    manifestStateId: 'shell-area-autocomplete-open',
    aStates: ['A19'],
    viewport: 'desktop',
    hash: '#',
    interact: openAreaAutocomplete,
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-city-default', assertEquality: true },
      {
        kind: 'component-visible',
        description: 'the area-autocomplete results listbox opened for a query with matches',
        selector: '[data-design-component="area-autocomplete"] [role="listbox"]',
      },
    ],
    notes:
      'A19\'s PARTIAL/REF half — the autocomplete overlay composition, per state-mapping.md. The ' +
      'node-convergence itself is behavioural and has no composition to capture.',
  },
  {
    id: 'areas-city-default-mobile',
    manifestStateId: 'areas-city-default-mobile',
    aStates: ['A01', 'A21'],
    viewport: 'mobile',
    hash: '#',
    verifications: [
      // Known mechanically: the -mobile ids are NEVER emitted at any viewport (screenId has zero
      // reference to isMobile). Recorded, not asserted — see types.ts docstring.
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-city-default-mobile', assertEquality: false },
      { kind: 'heading-text', expectedText: 'Where do you want to explore?' },
    ],
    notes:
      'No-self-ID by construction (mobile-id-emission finding in state-mapping.md, not a defect ' +
      'in this harness). Verified by the manifest\'s own expectedHeading text at the mandated ' +
      '390x844 viewport (hard-asserted separately by the capture runner).',
  },
  {
    id: 'areas-area-listings-mobile',
    manifestStateId: 'areas-area-listings-mobile',
    aStates: ['A08', 'A21', 'A23'],
    viewport: 'mobile',
    hash: '#a=hebbal',
    verifications: [
      { kind: 'data-design-screen-attribute', expectedScreenId: 'areas-area-listings-mobile', assertEquality: false },
      { kind: 'heading-text', expectedText: 'Properties in Hebbal' },
    ],
    notes:
      'No-self-ID by construction, same mobile-id-emission finding as areas-city-default-mobile. ' +
      'Verified by expectedHeading text at 390x844.',
  },
];
