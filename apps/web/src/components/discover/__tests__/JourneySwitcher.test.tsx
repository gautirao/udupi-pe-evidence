import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { JourneySwitcher } from '../JourneySwitcher';

describe('JourneySwitcher', () => {
  it('renders all three journey cards', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-agri-first')).toBeInTheDocument();
  });

  it('renders correct copy for area-first card', () => {
    render(
      <JourneySwitcher
        onSelectJourney={vi.fn()}
        cityLabel="Udupi"
        totalProperties={30}
        areasCount={10}
      />,
    );
    expect(screen.getByText('Explore by area')).toBeInTheDocument();
    expect(
      screen.getByText(/Start with the neighbourhood\. Explore Udupi localities/),
    ).toBeInTheDocument();
    // Recommended badge + count chips driven by props.
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('10 areas')).toBeInTheDocument();
    expect(screen.getByText('30 properties')).toBeInTheDocument();
    expect(screen.getByText('Explore areas')).toBeInTheDocument();
  });

  it('area-first copy is city-dynamic (uses cityLabel, not hardcoded Udupi)', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} cityLabel="Bangalore" />);
    expect(
      screen.getByText(/Explore Bangalore localities/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Explore Udupi localities/)).not.toBeInTheDocument();
  });

  it('renders correct copy for school-first card', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByText('Search near a school')).toBeInTheDocument();
    expect(
      screen.getByText(/Pick a school as your anchor and see only the homes/),
    ).toBeInTheDocument();
    expect(screen.getByText('Find homes near schools')).toBeInTheDocument();
  });

  it('clicking area-first card calls onSelectJourney with "area-first"', async () => {
    const user = userEvent.setup();
    const onSelectJourney = vi.fn();
    render(<JourneySwitcher onSelectJourney={onSelectJourney} />);
    await user.click(screen.getByTestId('journey-card-area-first'));
    expect(onSelectJourney).toHaveBeenCalledTimes(1);
    expect(onSelectJourney).toHaveBeenCalledWith('area-first');
  });

  it('clicking school-first card calls onSelectJourney with "school-first"', async () => {
    const user = userEvent.setup();
    const onSelectJourney = vi.fn();
    render(<JourneySwitcher onSelectJourney={onSelectJourney} />);
    await user.click(screen.getByTestId('journey-card-school-first'));
    expect(onSelectJourney).toHaveBeenCalledTimes(1);
    expect(onSelectJourney).toHaveBeenCalledWith('school-first');
  });

  it('renders correct copy for agri-first card', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByText('Find agricultural land')).toBeInTheDocument();
    expect(
      screen.getByText(/Looking for farmland instead\? Search parcels by corridor/),
    ).toBeInTheDocument();
    expect(screen.getByText('Search farmland')).toBeInTheDocument();
  });

  it('agri-first card uses farmland-specific terminology (regression guard)', () => {
    // Issue #2108 follow-up — the "Farmland only" chip now renders in the
    // metadata strip (only for the ACTIVE journey), not hidden inside every
    // card, so agri-first must be selected to surface it.
    render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="agri-first" />);
    // ReTrends mock title + farmland CTA — never residential "homes" wording here.
    expect(screen.getByText('Find agricultural land')).toBeInTheDocument();
    expect(screen.getByText('Farmland only')).toBeInTheDocument();
  });

  it('agri-first card subtitle is the corridor-first copy', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(
      screen.getByText(/Search parcels by corridor, direction and distance from town/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Explore farmland and agricultural plots by area'),
    ).not.toBeInTheDocument();
  });

  it('clicking agri-first card calls onSelectJourney with "agri-first"', async () => {
    const user = userEvent.setup();
    const onSelectJourney = vi.fn();
    render(<JourneySwitcher onSelectJourney={onSelectJourney} />);
    await user.click(screen.getByTestId('journey-card-agri-first'));
    expect(onSelectJourney).toHaveBeenCalledTimes(1);
    expect(onSelectJourney).toHaveBeenCalledWith('agri-first');
  });

  it('agri-first card has accessible role and label', () => {
    // Issue #1953 build step 6 (AC9) — cards are now ARIA tabs (role="tab"),
    // not plain buttons, since this component is the persistent mode-tab
    // control. The underlying element is still a <button> (keyboard
    // activation unchanged) but its exposed role is "tab".
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('tab', { name: /find agricultural land/i });
    expect(card).toBeInTheDocument();
  });

  it('area-first card has accessible role and label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('tab', { name: /explore by area/i });
    expect(card).toBeInTheDocument();
  });

  it('area-first accessible name CONTAINS the visible label (WCAG 2.5.3 Label in Name)', () => {
    // Regression guard: the visible compact-tab text is "Explore by area"
    // (j.title). The accessible name must contain that string verbatim so
    // voice-control users saying "Explore by area" can match the control.
    // Previously ariaLabel was the longer "Explore properties by area",
    // which does not contain the visible label as a substring.
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByTestId('journey-card-area-first');
    const accessibleName = card.getAttribute('aria-label') ?? '';
    expect(accessibleName.toLowerCase()).toContain('explore by area');
  });

  it('school-first card has accessible role and label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('tab', { name: /search near a school/i });
    expect(card).toBeInTheDocument();
  });

  // ─── Issue #1953 build step 6 — persistent tab-card semantics ───────────
  // AC9 (tablist/tab/aria-selected + visible focus rings) and AC27/#1808 A3
  // (dp-attn-target relocated to the tablist CONTAINER, never per-tab) —
  // migrated here from GuidedEntryPanel.regionGuide.test.tsx, which tested
  // this exact behaviour when it lived on GuidedEntryPanel's now-removed
  // "journey-switcher-section" wrapper (see that file's header comment).

  it('root container exposes role="tablist" with an accessible label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByRole('tablist', { name: /choose how you want to search/i })).toBeInTheDocument();
  });

  it('aria-selected reflects activeJourney on the matching tab only', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="school-first" />);
    expect(screen.getByTestId('journey-card-school-first')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('journey-card-area-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-agri-first')).toHaveAttribute('aria-selected', 'false');
  });

  it('no tab is selected when activeJourney is null (bare landing)', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney={null} />);
    expect(screen.getByTestId('journey-card-area-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-school-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-agri-first')).toHaveAttribute('aria-selected', 'false');
  });

  it('#1808 A3 — dp-attn-target ring class lands on the outer CONTAINER, not per-tab, when active', () => {
    // Issue #1953 (ARIA sweep) — dp-attn-target/dp-attn-on now live on the
    // outer wrapper (data-testid="journey-switcher-section"), not on the
    // role="tablist" element itself: the tablist was narrowed to contain
    // ONLY role="tab" children (see the "only role=tab children" test
    // below), so the ring/attention classes moved to the container that
    // actually still wraps everything (heading, helper, and the tablist).
    render(
      <JourneySwitcher
        onSelectJourney={vi.fn()}
        regionGuideRingActive
        regionGuideHelperText="North Bangalore selected. The map shows this region's zones — choose how you want to continue below."
        regionGuideNonce={1}
      />,
    );
    const container = screen.getByTestId('journey-switcher-section');
    expect(container).toHaveClass('dp-attn-target');
    expect(container).toHaveClass('dp-attn-on');
    // Never applied to individual tabs.
    expect(screen.getByTestId('journey-card-area-first')).not.toHaveClass('dp-attn-on');
    expect(screen.getByTestId('journey-card-school-first')).not.toHaveClass('dp-attn-on');
    expect(screen.getByTestId('journey-card-agri-first')).not.toHaveClass('dp-attn-on');
  });

  it('ring is OFF (no dp-attn-on/dp-attn-static) when regionGuideRingActive=false', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} regionGuideRingActive={false} />);
    const container = screen.getByTestId('journey-switcher-section');
    expect(container).not.toHaveClass('dp-attn-on');
    expect(container).not.toHaveClass('dp-attn-static');
  });

  it('prefers-reduced-motion swaps the pulse for a static ring class', () => {
    render(
      <JourneySwitcher
        onSelectJourney={vi.fn()}
        regionGuideRingActive
        regionGuideHelperText="Selected."
        regionGuideNonce={1}
        prefersReducedMotion
      />,
    );
    const container = screen.getByTestId('journey-switcher-section');
    expect(container).toHaveClass('dp-attn-static');
    expect(container).not.toHaveClass('dp-attn-on');
  });

  // ─── Issue #1953 (ARIA sweep) — valid tablist structure + keyboard model ─

  it('the tablist contains only role="tab" children (aria-live helper and heading live outside it)', () => {
    render(
      <JourneySwitcher
        onSelectJourney={vi.fn()}
        regionGuideRingActive
        regionGuideHelperText="Selected."
        regionGuideNonce={1}
      />,
    );
    const tablist = screen.getByRole('tablist');
    const children = Array.from(tablist.children);
    expect(children.length).toBe(3);
    for (const child of children) {
      expect(child.getAttribute('role')).toBe('tab');
    }
    // The aria-live helper must still render — just as a sibling of the
    // tablist, not as its child. (Issue #2108 removed the visible "Choose
    // how you want to search" eyebrow heading that used to sit alongside it;
    // the tablist's aria-label — asserted elsewhere — now solely carries
    // that accessible name.)
    expect(screen.getByTestId('region-guide-helper')).toBeInTheDocument();
    expect(tablist.contains(screen.getByTestId('region-guide-helper'))).toBe(false);
  });

  it('ArrowRight/ArrowLeft/Home/End move roving focus between tabs', async () => {
    const user = userEvent.setup();
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const areaTab = screen.getByTestId('journey-card-area-first');
    const schoolTab = screen.getByTestId('journey-card-school-first');
    const agriTab = screen.getByTestId('journey-card-agri-first');

    // Initial roving tabIndex: first tab is 0, the rest are -1.
    expect(areaTab).toHaveAttribute('tabindex', '0');
    expect(schoolTab).toHaveAttribute('tabindex', '-1');
    expect(agriTab).toHaveAttribute('tabindex', '-1');

    areaTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(schoolTab).toHaveFocus();
    expect(schoolTab).toHaveAttribute('tabindex', '0');
    expect(areaTab).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowRight}');
    expect(agriTab).toHaveFocus();

    // Wraps around from the last tab back to the first.
    await user.keyboard('{ArrowRight}');
    expect(areaTab).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(agriTab).toHaveFocus();

    await user.keyboard('{End}');
    expect(agriTab).toHaveFocus();

    await user.keyboard('{Home}');
    expect(areaTab).toHaveFocus();
  });

  it('region-guide helper is aria-live and renders the supplied copy only when the ring is active', () => {
    const { rerender } = render(
      <JourneySwitcher onSelectJourney={vi.fn()} regionGuideRingActive={false} regionGuideHelperText="Selected." />,
    );
    expect(screen.queryByTestId('region-guide-helper')).not.toBeInTheDocument();

    rerender(
      <JourneySwitcher
        onSelectJourney={vi.fn()}
        regionGuideRingActive
        regionGuideHelperText="North Bangalore selected. The map shows this region's zones — choose how you want to continue below."
        regionGuideNonce={1}
      />,
    );
    const helper = screen.getByTestId('region-guide-helper');
    expect(helper).toHaveAttribute('aria-live', 'polite');
    expect(helper).toHaveTextContent(
      "North Bangalore selected. The map shows this region's zones — choose how you want to continue below.",
    );
  });

  it('no new journey-choice row/component exists alongside the tab cards', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.queryByTestId('journey-choice-row')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/journey-choice/)).toHaveLength(0);
  });

  // ─── Compact-vs-full density (product-owner ruling; #1953 follow-up) ─────
  // Full journey cards (icon tile, headline, description, chip row, CTA) are
  // reserved for the bare Discover landing. Once any non-landing panel is
  // showing, this same persistent mount switches to a compact tab strip.
  // Density is driven by the explicit `compact` prop — DECOUPLED from
  // `activeJourney` — because DiscoverRightPanel derives it from
  // `panelContent !== 'guided-entry'`, not from the raw `journey` URL param
  // (see DiscoverRightPanel.test.tsx for the panelContent-level regression
  // covering journey-less inferred states like a bare `areaKey` with no
  // `journey=` param). All existing invariants (testids, tablist/tab roles,
  // aria-selected, roving tabIndex, click-to-switch) must hold in BOTH
  // densities.

  describe('compact vs full density', () => {
    it('renders full cards (desc, chips, CTA, Recommended badge) when compact=false (the bare landing)', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney={null} compact={false} />);
      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(screen.getByText('Explore areas')).toBeInTheDocument();
      expect(
        screen.getByText(/Pick a school as your anchor and see only the homes/),
      ).toBeInTheDocument();
      // Issue #2108 — the approved mock has no visible "Choose how you want
      // to search" eyebrow; the tablist's aria-label (asserted elsewhere)
      // carries that accessible name instead.
      expect(screen.queryByText('Choose how you want to search')).not.toBeInTheDocument();
    });

    it('renders compact tabs (no desc/chips/CTA/heading) when compact=true', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact />);
      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
      expect(screen.queryByText('Explore areas')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Pick a school as your anchor and see only the homes/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Choose how you want to search')).not.toBeInTheDocument();
      // Short label text remains, so the tab is still identifiable.
      expect(screen.getByTestId('journey-card-area-first')).toHaveTextContent('Explore by area');
    });

    it('#1953 regression — compact renders even when activeJourney is null (journey-less inferred state)', () => {
      // This is the exact shape DiscoverRightPanel produces for a
      // journey-less deep link (e.g. areaKey present, journey= absent):
      // `activeJourney` is null (no `journey` URL param) but `compact` is
      // still true (derived from panelContent). Before the fix, density
      // was `activeJourney != null`, which would have rendered FULL cards
      // here — this test fails on that old implementation.
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney={null} compact />);
      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
      expect(screen.queryByText('Choose how you want to search')).not.toBeInTheDocument();
      expect(screen.getByTestId('journey-card-area-first')).toHaveTextContent('Explore by area');
    });

    it('full cards render even when activeJourney is set, if compact=false (no transient flip on activeJourney alone)', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="school-first" compact={false} />);
      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(screen.queryByText('Choose how you want to search')).not.toBeInTheDocument();
    });

    it('preserves the three journey-card testids, tablist/tab roles and aria-selected in compact density', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="school-first" compact />);
      expect(screen.getByRole('tablist', { name: /choose how you want to search/i })).toBeInTheDocument();
      const areaTab = screen.getByTestId('journey-card-area-first');
      const schoolTab = screen.getByTestId('journey-card-school-first');
      const agriTab = screen.getByTestId('journey-card-agri-first');
      expect(areaTab).toHaveAttribute('role', 'tab');
      expect(schoolTab).toHaveAttribute('role', 'tab');
      expect(agriTab).toHaveAttribute('role', 'tab');
      expect(schoolTab).toHaveAttribute('aria-selected', 'true');
      expect(areaTab).toHaveAttribute('aria-selected', 'false');
      expect(agriTab).toHaveAttribute('aria-selected', 'false');
    });

    it('preserves dp-attn-target on the outer container only (never per-tab) in compact density', () => {
      render(
        <JourneySwitcher
          onSelectJourney={vi.fn()}
          activeJourney="agri-first"
          compact
          regionGuideRingActive
          regionGuideHelperText="Selected."
          regionGuideNonce={1}
        />,
      );
      const container = screen.getByTestId('journey-switcher-section');
      expect(container).toHaveClass('dp-attn-target');
      expect(container).toHaveClass('dp-attn-on');
      expect(screen.getByTestId('journey-card-area-first')).not.toHaveClass('dp-attn-on');
      expect(screen.getByTestId('journey-card-agri-first')).not.toHaveClass('dp-attn-on');
    });

    it('preserves roving tabIndex + ArrowRight/Home/End keyboard navigation in compact density', async () => {
      const user = userEvent.setup();
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact />);
      const areaTab = screen.getByTestId('journey-card-area-first');
      const schoolTab = screen.getByTestId('journey-card-school-first');
      const agriTab = screen.getByTestId('journey-card-agri-first');

      expect(areaTab).toHaveAttribute('tabindex', '0');
      expect(schoolTab).toHaveAttribute('tabindex', '-1');

      areaTab.focus();
      await user.keyboard('{ArrowRight}');
      expect(schoolTab).toHaveFocus();

      await user.keyboard('{End}');
      expect(agriTab).toHaveFocus();
    });

    it('preserves click-to-switch in compact density', async () => {
      const user = userEvent.setup();
      const onSelectJourney = vi.fn();
      render(<JourneySwitcher onSelectJourney={onSelectJourney} activeJourney="area-first" compact />);
      await user.click(screen.getByTestId('journey-card-school-first'));
      expect(onSelectJourney).toHaveBeenCalledWith('school-first');
    });

    it('compact tabs remain a real tablist (role="tablist" with only role="tab" children), not a decorative strip', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact />);
      const tablist = screen.getByRole('tablist');
      const children = Array.from(tablist.children);
      expect(children.length).toBe(3);
      for (const child of children) {
        expect(child.getAttribute('role')).toBe('tab');
      }
    });
  });

  // ─── Landing row layout (#1953 mobile follow-up, extended desktop-wide by #2108) ─
  // Product-owner measured the landing tablist stacking to 769px (91% of a
  // 390x844 viewport) with three cards one-per-row and BLOCKED that on mobile
  // (#1953). Issue #2108 (visual reskin to the approved mock's `mode-selector`
  // density) established that the mock's `ModeCard` (NDPanel.jsx) is the SAME
  // compact 3-up grid card at every width, with no larger desktop treatment —
  // so the `sm:` reversion to a stacked full-card column (with chips/CTA) is
  // removed entirely; the compact grid now applies at every width. jsdom has
  // no layout engine, so this cannot assert real pixel heights (that proof
  // lives in e2e/discover/mobile-landing-journey-switcher-1953.spec.ts, which
  // measures getBoundingClientRect() in a real browser) — what a component
  // test CAN, and must, verify is that the responsive Tailwind contract is
  // actually wired: the tablist stays a 3-up grid at every width, never
  // reverting to a stacked column.
  describe('landing row layout (#1953, extended desktop-wide by #2108)', () => {
    it('landing (compact=false) tablist is a 3-column grid at every width — never reverts to a stacked column', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney={null} compact={false} />);
      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveClass('grid');
      expect(tablist).toHaveClass('grid-cols-3');
      // #2108 — no `sm:` reversion to the old stacked full-card layout.
      expect(tablist.className).not.toContain('sm:flex');
      expect(tablist.className).not.toContain('sm:flex-col');
    });

    it('landing tab buttons use the compact card sizing (rounded-lg/p-2.5) at every width — never revert to the rich card (rounded-xl/p-5)', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney={null} compact={false} />);
      const areaTab = screen.getByTestId('journey-card-area-first');
      expect(areaTab).toHaveClass('rounded-lg');
      expect(areaTab).toHaveClass('p-2.5');
      // #2108 — no `sm:` reversion to the larger desktop card.
      expect(areaTab.className).not.toContain('sm:rounded-xl');
      expect(areaTab.className).not.toContain('sm:p-5');
    });

    it('#2108 — the selected landing card carries a trailing check badge (selection signalled beyond colour alone)', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact={false} />);
      expect(screen.getByTestId('journey-card-area-first-selected-check')).toBeInTheDocument();
      expect(screen.queryByTestId('journey-card-school-first-selected-check')).not.toBeInTheDocument();
      expect(screen.queryByTestId('journey-card-agri-first-selected-check')).not.toBeInTheDocument();
    });

    it('#2108 follow-up — the area-first check badge uses the copper accent token, never the dark navy --primary', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact={false} />);
      const badge = screen.getByTestId('journey-card-area-first-selected-check');
      expect(badge.className).toContain('copper');
      expect(badge.className).not.toContain('bg-primary');
    });

    it('#2108 — no check badge renders on any landing card when no journey is active', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney={null} compact={false} />);
      expect(screen.queryByTestId('journey-card-area-first-selected-check')).not.toBeInTheDocument();
      expect(screen.queryByTestId('journey-card-school-first-selected-check')).not.toBeInTheDocument();
      expect(screen.queryByTestId('journey-card-agri-first-selected-check')).not.toBeInTheDocument();
    });

    it('chips and CTA are present in the DOM (still readable/testable) but permanently CSS-hidden (#2108 — not part of the approved ModeCard mock at any width)', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney={null} compact={false} />);
      // Content stays queryable (existing full-card tests above rely on
      // this), but the wrapping element carries the hidden contract at
      // every width now — no `sm:inline-flex` reversion.
      const cta = screen.getByText('Explore areas');
      expect(cta.closest('span')).toHaveClass('hidden');
      expect(cta.closest('span')?.className).not.toContain('sm:inline-flex');
    });

    it('#2108 follow-up — a visible metadata strip renders below the card row for the active journey, using only already-computed chip data', () => {
      render(
        <JourneySwitcher
          onSelectJourney={vi.fn()}
          activeJourney={null}
          compact={false}
          totalProperties={30}
          areasCount={10}
        />,
      );
      const strip = screen.getByTestId('journey-metadata-strip');
      // Falls back to the area-first (Recommended) journey's chips when no
      // journey is selected yet, same as the mock's own default branch.
      expect(strip).toHaveTextContent('10 areas');
      expect(strip).toHaveTextContent('30 properties');
      expect(strip).toHaveTextContent('Locality insights');
      // Never the invented multi-select/browse-all copy from the raw mock —
      // this app has neither feature in this context.
      expect(screen.queryByText(/Up to 3 selected areas/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Browse all listings/)).not.toBeInTheDocument();
    });

    it('#2108 follow-up — the metadata strip reflects the SELECTED journey, not always area-first', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="school-first" compact={false} />);
      const strip = screen.getByTestId('journey-metadata-strip');
      expect(strip).toHaveTextContent('5 or 10 km radius');
      expect(strip).toHaveTextContent('Homes near schools');
      expect(strip).not.toHaveTextContent('Locality insights');
    });

    it('#2108 follow-up — the metadata strip is absent in compact (non-landing) density', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact />);
      expect(screen.queryByTestId('journey-metadata-strip')).not.toBeInTheDocument();
    });

    it('compact density (non-landing) is completely unaffected by the responsive landing change', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact />);
      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveClass('flex');
      expect(tablist).toHaveClass('items-center');
      expect(tablist).toHaveClass('overflow-x-auto');
      expect(tablist).not.toHaveClass('grid');
    });

    it('landing selected-card accent branch renders when a journey IS active (currently unreachable via the app, exercised directly)', () => {
      // The accent border/background exist so the landing selected state is not
      // colour-only. Review established this branch is UNREACHABLE through the
      // app today: `compact = panelContent !== 'guided-entry'`, and guided-entry
      // is the only non-compact state, where activeJourney is always null.
      //
      // Rather than delete the branch or leave it untested, exercise it DIRECTLY
      // here — bypassing the caller's constraint — so it cannot rot silently
      // before the landing can carry a selection (which the frozen mock does
      // show). An unexecuted branch is the thing that breaks the day it is first
      // reached, and this test is the only path that currently runs it.
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="school-first" compact={false} />);
      const selected = screen.getByTestId('journey-card-school-first');
      const unselected = screen.getByTestId('journey-card-area-first');
      expect(selected).toHaveAttribute('aria-selected', 'true');
      expect(unselected).toHaveAttribute('aria-selected', 'false');
      // Not colour-only: the selected card carries an accent border class the
      // unselected one does not.
      expect(selected.className).not.toBe(unselected.className);
    });
  });

  // ─── Roving focus resync on external journey change (#1953 follow-up) ───

  describe('roving focus resync', () => {
    it('resyncs focusedIndex to the active tab when activeJourney changes via an external route (not a tab click)', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact />,
      );
      const areaTab = screen.getByTestId('journey-card-area-first');
      const schoolTab = screen.getByTestId('journey-card-school-first');
      const agriTab = screen.getByTestId('journey-card-agri-first');

      // Move roving focus off the selected tab WITHOUT selecting a new one
      // (simulates a keyboard user arrowing away from area-first without
      // committing a click/Enter).
      areaTab.focus();
      await user.keyboard('{ArrowRight}');
      expect(schoolTab).toHaveFocus();
      expect(schoolTab).toHaveAttribute('tabindex', '0');
      expect(areaTab).toHaveAttribute('tabindex', '-1');

      // External navigation (map marker / breadcrumb / StartOverButton)
      // changes `activeJourney` WITHOUT going through a tab click.
      rerender(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="agri-first" compact />);

      // Roving tabIndex must resync to the now-selected tab, not stay
      // stranded on school-first — a keyboard user Tabbing into the strip
      // must land on the currently-selected tab.
      expect(agriTab).toHaveAttribute('tabindex', '0');
      expect(schoolTab).toHaveAttribute('tabindex', '-1');
      expect(areaTab).toHaveAttribute('tabindex', '-1');
    });

    it('does NOT resync focus on a pure Arrow-key move (activeJourney unchanged) — selection and focus can differ', async () => {
      const user = userEvent.setup();
      render(<JourneySwitcher onSelectJourney={vi.fn()} activeJourney="area-first" compact />);
      const areaTab = screen.getByTestId('journey-card-area-first');
      const schoolTab = screen.getByTestId('journey-card-school-first');

      areaTab.focus();
      await user.keyboard('{ArrowRight}');
      // Focus moved to school-first, but area-first is still the selected
      // (aria-selected) tab — arrow navigation must not select on its own.
      expect(schoolTab).toHaveFocus();
      expect(areaTab).toHaveAttribute('aria-selected', 'true');
      expect(schoolTab).toHaveAttribute('aria-selected', 'false');
    });
  });

  // ─── Issue #2084 clarification rev 2 — null-count loading affordance ────
  // `totalProperties`/`areasCount` are `number | null | undefined`. `null`/
  // `undefined` must render an explicit, distinguishable loading state —
  // never a bare "0" — and a genuine 0 must still render as literal "0".
  describe('area-first count chips — loading vs. genuine zero (#2084)', () => {
    it('renders an explicit loading affordance (not "0") when counts are unresolved', () => {
      render(
        <JourneySwitcher onSelectJourney={vi.fn()} totalProperties={null} areasCount={null} />,
      );
      // No literal "0 areas" / "0 properties" — that would falsely claim a
      // resolved answer of zero.
      expect(screen.queryByText('0 areas')).not.toBeInTheDocument();
      expect(screen.queryByText('0 properties')).not.toBeInTheDocument();
      // The explicit loading copy renders instead.
      const loadingAreas = screen.getByText('Loading areas…');
      const loadingProperties = screen.getByText('Loading properties…');
      expect(loadingAreas).toBeInTheDocument();
      expect(loadingProperties).toBeInTheDocument();
      // Accessibly distinguishable, not just visually: aria-busy on the chip.
      expect(loadingAreas.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
      expect(loadingProperties.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    });

    it('renders literal "0 areas" / "0 properties" for a genuine zero, distinguishable from the loading state', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} totalProperties={0} areasCount={0} />);
      const zeroAreas = screen.getByText('0 areas');
      const zeroProperties = screen.getByText('0 properties');
      expect(zeroAreas).toBeInTheDocument();
      expect(zeroProperties).toBeInTheDocument();
      // Distinguishable from the loading state both visually (this is "0
      // areas", not "Loading areas…") and accessibly — a settled 0 chip is
      // NOT aria-busy.
      expect(screen.queryByText('Loading areas…')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading properties…')).not.toBeInTheDocument();
      expect(zeroAreas.closest('[aria-busy]')).toBeNull();
      expect(zeroProperties.closest('[aria-busy]')).toBeNull();
    });

    it('undefined counts (prop omitted) render the same loading affordance as null', () => {
      render(<JourneySwitcher onSelectJourney={vi.fn()} />);
      expect(screen.queryByText('0 areas')).not.toBeInTheDocument();
      expect(screen.queryByText('0 properties')).not.toBeInTheDocument();
      expect(screen.getByText('Loading areas…')).toBeInTheDocument();
      expect(screen.getByText('Loading properties…')).toBeInTheDocument();
    });
  });
});
