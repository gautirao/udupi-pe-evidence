/**
 * Issue #2596 owner follow-up — panel density.
 *
 * CLASS GUARDS, NOT PIXEL PROOFS, and the distinction is the point. JSDOM loads no stylesheet, so
 * no test here can measure a rendered gap. The pixel evidence comes from the running app measured
 * against the served mock at 1366×768 and is recorded on the PR; these assertions exist so the
 * specific classes that produced those pixels cannot be reverted silently.
 *
 * The two `empty:hidden` guards are the interesting ones. Both wrappers pass their render
 * condition (`!isViewportScope`, `activeContextChips != null`) while their CHILD renders nothing,
 * so each contributed margin around zero content — 8px and 10px respectively, measured. A
 * condition that is true while the content is empty is invisible in review, which is why it is
 * pinned here rather than left to the next density pass to rediscover.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { toAreaSelectedPanelContract, type AreaSelectedPanelFlatTestProps } from './areaSelectedPanelTestAdapter';

const mockArea: AreaPoint = {
  areaKey: 'test-area|city|udupi',
  areaLabel: 'Test Area',
  geo_center_lat: 13.5,
  geo_center_lon: 74.5,
  bbox: null,
};

const renderPanel = (props: Partial<AreaSelectedPanelFlatTestProps> = {}) => {
  const defaultProps: AreaSelectedPanelFlatTestProps = {
    selectedArea: mockArea,
    areaListings: [],
    filters: {},
    onFiltersChange: vi.fn(),
    onSelectJourney: vi.fn(),
    onAddSchool: vi.fn(),
    onSearchChange: vi.fn(),
  };
  const { view, commands } = toAreaSelectedPanelContract({ ...defaultProps, ...props });
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <AreaSelectedPanel view={view} commands={commands} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );
};

describe('#2596 density — spacing-sensitive structural classes', () => {
  it('collapses the single-action row when its child renders nothing', () => {
    renderPanel();
    const row = screen.getByTestId('area-single-action-row');
    // Without this the row keeps `mb-2` around zero content — measured at 8px.
    expect(row.className).toContain('empty:hidden');
    expect(row.className).toContain('mb-2');
  });

  it('collapses the active-context-chip row when the chips render nothing', () => {
    // A non-null node that renders nothing — the exact shape that defeats the `!= null` guard.
    renderPanel({ activeContextChips: <></> });
    const chipRow = document.querySelector('.mt-2\\.5.flex.flex-wrap.items-center.gap-1\\.5');
    expect(chipRow).not.toBeNull();
    expect(chipRow!.className).toContain('empty:hidden');
  });

  it('keeps the tightened section padding on the heading and the search/tiles group', () => {
    renderPanel();
    const tileRow = screen.getByTestId('area-set-two-tile-row');
    const group = tileRow.parentElement!;
    // py-3 -> py-2.5 on the workflow group.
    expect(group.className).toContain('py-2.5');
    expect(group.className).not.toContain('py-3');

    // pb-4 pt-3.5 -> pb-2.5 pt-2.5 on the heading section.
    const heading = screen.getByRole('heading', { level: 1 });
    let section: HTMLElement | null = heading.parentElement;
    while (section && !/border-b/.test(section.className || '')) section = section.parentElement;
    expect(section).not.toBeNull();
    expect(section!.className).toContain('pt-2.5');
    expect(section!.className).toContain('pb-2.5');
  });

  // The filter block was protected in the first pass on a measurement that was later retracted
  // (it compared one app SECTION against the kit's whole fixed HEADER). Re-measured, the kit's
  // `filter-toolbar` is 181px with `padding: 0` and a 5px row gap — so this block was the loosest
  // in the panel, not the one at parity. This arm therefore flipped from "pins unchanged" to a
  // real discrimination arm.
  //
  // `classList.contains`, NOT a substring check: 'space-y-1' IS a substring of 'space-y-1.5', so
  // `toContain('space-y-1')` would pass on both arms and measure nothing.
  it('tightens the quick-filter block padding and row gap', () => {
    renderPanel();
    const allChip = screen.getByTestId('quick-chip-all');
    let filterSection: HTMLElement | null = allChip.parentElement;
    while (filterSection && !/border-b/.test(filterSection.className || '')) {
      filterSection = filterSection.parentElement;
    }
    expect(filterSection).not.toBeNull();
    expect(filterSection!.classList.contains('py-1.5')).toBe(true);
    expect(filterSection!.classList.contains('py-2.5')).toBe(false);

    const rowStack = filterSection!.querySelector('.space-y-1');
    expect(rowStack).not.toBeNull();
    expect(rowStack!.classList.contains('space-y-1')).toBe(true);
    expect(rowStack!.classList.contains('space-y-1.5')).toBe(false);
  });

  // Chip height. The owner subsequently authorised the DESKTOP-ONLY variant — keep the 44px
  // mobile touch target, reduce the desktop chip to the kit's 24px — so this arm flipped from
  // "pins unchanged" to a discrimination arm.
  //
  // CLASS ASSERTIONS, NOT HEIGHT PROOFS. JSDOM applies no stylesheet, so nothing here can read a
  // rendered height. The 24px is established on the running app by COMPUTED height (`24px`, with
  // `line-height: 12.5px`, no clipping on `Commercial Building` / `Warehouse / Godown` /
  // `Commercial Land`, and the family row still unwrapped) and recorded on the PR.
  it('uses desktop chip geometry (md:h-auto with padding and typography)', () => {
    // The family row is gated on the Commercial capability, so it must be enabled here — the
    // default render does not show it, which is what made an earlier version of this assertion
    // fail against its own head.
    renderPanel({ isCommercialSubtypeSupported: true });
    const residential = screen.getByTestId('quick-chip-family-residential');
    expect(residential.classList.contains('md:h-auto')).toBe(true);
    expect(residential.className).not.toContain('md:h-[30px]');
    expect(residential.classList.contains('md:leading-normal')).toBe(true);
  });

  // THE OWNER'S EXPLICIT CONSTRAINT, and the likeliest thing to break: a class that lost its
  // `md:` prefix would shrink mobile too, and nothing else here would notice.
  it('leaves the MOBILE touch target at h-11 across every quick chip', () => {
    renderPanel({ isCommercialSubtypeSupported: true });
    const chips = document.querySelectorAll('[data-testid^="quick-chip-"]');
    expect(chips.length).toBeGreaterThan(4);
    for (const chip of chips) {
      expect(chip.classList.contains('h-11')).toBe(true);
    }
  });
});
