/** Focused unit coverage: short labels, plain cross-page navigation semantics, the shared `getDiscoverRoute` URL/history mechanism, and the region-guide ring + aria-live helper text. */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { DiscoverHeaderJourneyTabs, type DiscoverHeaderRegionGuide } from '../DiscoverHeaderJourneyTabs';
import { getDiscoverRoute } from '@/lib/navUtils';

function renderTabs(
  currentJourney: 'area-first' | 'school-first' | 'agri-first' | null,
  regionGuide?: DiscoverHeaderRegionGuide,
) {
  return render(
    <MemoryRouter>
      <DiscoverHeaderJourneyTabs currentCity="udupi" currentJourney={currentJourney} regionGuide={regionGuide} />
    </MemoryRouter>,
  );
}

const activeRegionGuide: DiscoverHeaderRegionGuide = {
  ringActive: true,
  markerKind: 'zones',
  nonce: 1,
  prefersReducedMotion: false,
  helperText: 'North selected. The map shows this region’s zones — choose how you want to continue below.',
};

describe('DiscoverHeaderJourneyTabs', () => {
  it('renders a plain nav of exactly 3 links with the short label variant (not an ARIA Tabs widget)', () => {
    renderTabs(null);
    const nav = screen.getByRole('navigation', { name: /choose how you want to search/i });
    expect(nav).toBeInTheDocument();
    // Cross-page navigations, so no tablist/tab roles here.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /explore by area/i })).toHaveTextContent('By area');
    expect(screen.getByRole('link', { name: /search near a school/i })).toHaveTextContent('Near a school');
    expect(screen.getByRole('link', { name: /find agricultural land/i })).toHaveTextContent('Agricultural land');
  });

  it('marks no link as the current page when currentJourney is null (journey-less landing)', () => {
    renderTabs(null);
    expect(screen.getByTestId('discover-header-journey-tab-area-first')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('discover-header-journey-tab-school-first')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('discover-header-journey-tab-agri-first')).not.toHaveAttribute('aria-current');
  });

  it('marks the active journey link aria-current="page" and leaves the others unset', () => {
    renderTabs('school-first');
    expect(screen.getByTestId('discover-header-journey-tab-school-first')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('discover-header-journey-tab-area-first')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('discover-header-journey-tab-agri-first')).not.toHaveAttribute('aria-current');
  });

  it('each link points to the SAME canonical getDiscoverRoute URL the old top-nav links used (preserves URL/history semantics)', () => {
    renderTabs('area-first');
    expect(screen.getByTestId('discover-header-journey-tab-area-first')).toHaveAttribute(
      'href',
      getDiscoverRoute('udupi', 'area-first'),
    );
    expect(screen.getByTestId('discover-header-journey-tab-school-first')).toHaveAttribute(
      'href',
      getDiscoverRoute('udupi', 'school-first'),
    );
    expect(screen.getByTestId('discover-header-journey-tab-agri-first')).toHaveAttribute(
      'href',
      getDiscoverRoute('udupi', 'agri-first'),
    );
  });

  describe('region-guide ring + aria-live helper', () => {
    it('renders no ring class and no helper text when regionGuide is omitted', () => {
      renderTabs('area-first');
      expect(screen.getByTestId('discover-header-journey-tabs-section')).not.toHaveClass('dp-attn-on');
      expect(screen.getByTestId('discover-header-journey-tabs-section')).not.toHaveClass('dp-attn-static');
      expect(screen.queryByTestId('discover-header-region-guide-helper')).not.toBeInTheDocument();
    });

    it('renders no ring class and no helper text when regionGuide.ringActive is false', () => {
      renderTabs('area-first', { ...activeRegionGuide, ringActive: false });
      expect(screen.getByTestId('discover-header-journey-tabs-section')).not.toHaveClass('dp-attn-on');
      expect(screen.queryByTestId('discover-header-region-guide-helper')).not.toBeInTheDocument();
    });

    it('renders the animated ring class and the aria-live helper text when ringActive is true (full motion)', () => {
      renderTabs('area-first', activeRegionGuide);
      const section = screen.getByTestId('discover-header-journey-tabs-section');
      expect(section).toHaveClass('dp-attn-on');
      expect(section).not.toHaveClass('dp-attn-static');
      const helper = screen.getByTestId('discover-header-region-guide-helper');
      expect(helper).toHaveAttribute('aria-live', 'polite');
      expect(helper).toHaveTextContent(activeRegionGuide.helperText);
    });

    it('renders the static ring class (no animation) when prefersReducedMotion is true', () => {
      renderTabs('area-first', { ...activeRegionGuide, prefersReducedMotion: true });
      const section = screen.getByTestId('discover-header-journey-tabs-section');
      expect(section).toHaveClass('dp-attn-static');
      expect(section).not.toHaveClass('dp-attn-on');
    });
  });

  describe('helper copy transfer (sole selector at >=1366px)', () => {
    it('exposes the SAME per-journey helper text JourneySwitcher shows, as an accessible description, not visible text', () => {
      renderTabs(null);
      expect(screen.getByTestId('discover-header-journey-tab-area-first')).toHaveAccessibleDescription(
        'Recommended. Start with the neighbourhood. Explore Udupi localities. See properties, schools and insights',
      );
      expect(screen.getByTestId('discover-header-journey-tab-school-first')).toHaveAccessibleDescription(
        'Pick a school as your anchor and see only the homes within a commute radius',
      );
      expect(screen.getByTestId('discover-header-journey-tab-agri-first')).toHaveAccessibleDescription(
        'Looking for farmland instead? Search parcels by corridor, direction and distance from town',
      );
    });

    it('the area-first description is city-dynamic, matching JourneySwitcher\'s cityLabel interpolation', () => {
      render(
        <MemoryRouter>
          <DiscoverHeaderJourneyTabs currentCity="bangalore" currentJourney={null} cityLabel="Bangalore" />
        </MemoryRouter>,
      );
      expect(screen.getByTestId('discover-header-journey-tab-area-first')).toHaveAccessibleDescription(
        'Recommended. Start with the neighbourhood. Explore Bangalore localities. See properties, schools and insights',
      );
    });

    it('also carries the same text as a native title tooltip, and the sr-only description does not replace the short visible label', () => {
      renderTabs(null);
      const areaTab = screen.getByTestId('discover-header-journey-tab-area-first');
      expect(areaTab).toHaveAttribute(
        'title',
        'Recommended. Start with the neighbourhood. Explore Udupi localities. See properties, schools and insights',
      );
      // The short label stays its own text node; the long copy lives only in the sr-only description span.
      expect(screen.getByText('By area')).toBeInTheDocument();
      const description = areaTab.querySelector('.sr-only');
      expect(description).toHaveClass('sr-only');
      expect(description).toHaveTextContent('Recommended.');
    });
  });
});
