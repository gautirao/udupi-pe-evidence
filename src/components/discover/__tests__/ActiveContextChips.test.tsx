import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ActiveContextChips } from '../ActiveContextChips';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';

// Issue #1817 — rewritten for the extended taxonomy: AC2 (scope objects — area/school —
// are NEVER chips; they live only in the breadcrumb), reordered chips (search → booleans
// → value filters), the "+N" overflow popover, "Clear all", and the a11y contract
// (aria-label "Remove {label}" per chip, "Clear all filters and search" for Clear all).
// The pre-#1817 area/school chip tests are intentionally NOT ported — AC2 makes that
// behaviour incorrect, not merely superseded.

const emptyFilters: DiscoverUrlFilters = {};

const noOps = {
  onClearPropertyType: vi.fn(),
  onClearBhk: vi.fn(),
  onClearPrice: vi.fn(),
};

describe('ActiveContextChips', () => {
  it('returns null when no dimensions are active', () => {
    const { container } = render(
      <ActiveContextChips filters={emptyFilters} {...noOps} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when filters is empty object (cold-load from URL with no params)', () => {
    const { container } = render(<ActiveContextChips filters={{}} {...noOps} />);
    expect(container.firstChild).toBeNull();
  });

  // ── AC2: scope objects are never chips ──────────────────────────────────────
  // ActiveContextChips no longer accepts selectedArea/selectedSchool/radiusKm/
  // onClearArea/onClearSchool props at all — the component's public contract
  // structurally enforces AC2 (scope stays in the breadcrumb).

  it('has no area/school props in its public contract (structural AC2 enforcement)', () => {
    // @ts-expect-error — selectedArea is not part of ActiveContextChipsProps (AC2).
    render(<ActiveContextChips filters={emptyFilters} selectedArea={{}} {...noOps} />);
    expect(screen.queryByTestId('chip-area')).not.toBeInTheDocument();
  });

  // ── Property type ────────────────────────────────────────────────────────────

  it('shows single property type label', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, propertyTypes: ['apartment'] }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-type')).toBeInTheDocument();
    expect(screen.getByText('Apartment')).toBeInTheDocument();
  });

  it('shows type label with +N suffix for multiple types', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, propertyTypes: ['apartment', 'villa', 'house'] }}
        {...noOps}
      />,
    );
    expect(screen.getByText('Apartment +2')).toBeInTheDocument();
  });

  it('calls onClearPropertyType when type chip × is clicked', async () => {
    const onClearPropertyType = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, propertyTypes: ['apartment'] }}
        {...noOps}
        onClearPropertyType={onClearPropertyType}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove apartment/i }));
    expect(onClearPropertyType).toHaveBeenCalledOnce();
  });

  // ── BHK ───────────────────────────────────────────────────────────────────────

  it('shows single BHK label', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, bedrooms: [2] }} {...noOps} />);
    expect(screen.getByText('2 BHK')).toBeInTheDocument();
  });

  it('shows two-value BHK label', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, bedrooms: [2, 3] }} {...noOps} />);
    expect(screen.getByText('2, 3 BHK')).toBeInTheDocument();
  });

  it('shows truncated BHK label for 3+ values', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, bedrooms: [1, 2, 3, 4] }} {...noOps} />);
    expect(screen.getByText('1, 2 BHK +2')).toBeInTheDocument();
  });

  it('calls onClearBhk when BHK chip × is clicked', async () => {
    const onClearBhk = vi.fn();
    render(
      <ActiveContextChips filters={{ ...emptyFilters, bedrooms: [2] }} {...noOps} onClearBhk={onClearBhk} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove 2 bhk/i }));
    expect(onClearBhk).toHaveBeenCalledOnce();
  });

  // ── Price / budget ────────────────────────────────────────────────────────────

  it('shows price range when both min and max are set', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, priceMin: 5000000, priceMax: 10000000 }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-price')).toBeInTheDocument();
    expect(screen.getByText(/₹50 L – ₹1 Cr/)).toBeInTheDocument();
  });

  it('shows "₹X+" when only priceMin is set', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, priceMin: 5000000 }} {...noOps} />);
    expect(screen.getByText(/₹50 L\+/)).toBeInTheDocument();
  });

  it('shows "Up to ₹Y" when only priceMax is set', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, priceMax: 10000000 }} {...noOps} />);
    expect(screen.getByText(/Up to ₹1 Cr/)).toBeInTheDocument();
  });

  it('calls onClearPrice when price chip × is clicked', async () => {
    const onClearPrice = vi.fn();
    render(
      <ActiveContextChips filters={{ ...emptyFilters, priceMin: 5000000 }} {...noOps} onClearPrice={onClearPrice} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove ₹/i }));
    expect(onClearPrice).toHaveBeenCalledOnce();
  });

  it('renders multiple filter chips simultaneously', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, propertyTypes: ['apartment'], bedrooms: [2] }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-type')).toBeInTheDocument();
    expect(screen.getByTestId('chip-bhk')).toBeInTheDocument();
    expect(screen.queryByTestId('chip-price')).not.toBeInTheDocument();
  });

  // ── A11y: chip wrapper ──────────────────────────────────────────────────────

  it('type chip wrapper has role="group" with aria-label "Active filter: <label>"', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, propertyTypes: ['apartment'] }} {...noOps} />);
    expect(screen.getByRole('group', { name: 'Active filter: Apartment' })).toBeInTheDocument();
  });

  it('overall bar has role="group" aria-label "Active filters and search"', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, propertyTypes: ['apartment'] }} {...noOps} />);
    expect(screen.getByRole('group', { name: 'Active filters and search' })).toBeInTheDocument();
  });

  // ── Seller chips ───────────────────────────────────────────────────────────

  it('renders seller chip for single seller type', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, sellerTypes: ['owner'] }} {...noOps} />);
    expect(screen.getByTestId('chip-seller')).toBeInTheDocument();
    expect(screen.getByText('Seller: Owner')).toBeInTheDocument();
  });

  it('renders seller chip with +N suffix for multiple seller types', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, sellerTypes: ['owner', 'broker'] }} {...noOps} />);
    expect(screen.getByText('Seller: Owner +1')).toBeInTheDocument();
  });

  it('does not render seller chip when sellerTypes is empty', () => {
    const { container } = render(<ActiveContextChips filters={{ ...emptyFilters, sellerTypes: [] }} {...noOps} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render seller chip when sellerTypes contains only whitespace', () => {
    const { container } = render(
      <ActiveContextChips filters={{ ...emptyFilters, sellerTypes: ['  ', ''] }} {...noOps} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onClearSeller when seller chip × is clicked', async () => {
    const onClearSeller = vi.fn();
    render(
      <ActiveContextChips filters={{ ...emptyFilters, sellerTypes: ['owner'] }} {...noOps} onClearSeller={onClearSeller} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove seller: owner/i }));
    expect(onClearSeller).toHaveBeenCalledOnce();
  });

  // ── Date range chips ───────────────────────────────────────────────────────

  it('renders date chip with both from and to dates', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, dateFrom: '2025-01-15', dateTo: '2025-02-01' }} {...noOps} />);
    expect(screen.getByTestId('chip-date')).toBeInTheDocument();
    expect(screen.getByText(/–/)).toBeInTheDocument();
  });

  it('renders "Listed: from <date>" chip when only dateFrom is set', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, dateFrom: '2025-01-15' }} {...noOps} />);
    const chip = screen.getByTestId('chip-date');
    expect(chip.textContent).toMatch(/Listed: from/i);
  });

  it('renders "Listed: until <date>" chip when only dateTo is set', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, dateTo: '2025-02-01' }} {...noOps} />);
    const chip = screen.getByTestId('chip-date');
    expect(chip.textContent).toMatch(/Listed: until/i);
  });

  it('calls onClearDateRange when date chip × is clicked', async () => {
    const onClearDateRange = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, dateFrom: '2025-01-15', dateTo: '2025-02-01' }}
        {...noOps}
        onClearDateRange={onClearDateRange}
      />,
    );
    await userEvent.click(screen.getByTestId('chip-date-dismiss'));
    expect(onClearDateRange).toHaveBeenCalledOnce();
  });

  // ── Boolean chips ──────────────────────────────────────────────────────────

  it('renders Back on market chip when backOnMarket is true', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, backOnMarket: true }} {...noOps} />);
    expect(screen.getByTestId('chip-bool-bom')).toBeInTheDocument();
    expect(screen.getByText('Back on market')).toBeInTheDocument();
  });

  it('renders New to market chip when newToMarket is true', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, newToMarket: true }} {...noOps} />);
    expect(screen.getByText('New to market')).toBeInTheDocument();
  });

  it('renders RERA registered chip when reraRegistered is true', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, reraRegistered: true }} {...noOps} />);
    expect(screen.getByText('RERA registered')).toBeInTheDocument();
  });

  it('renders Ready to move chip when readyToMove is true', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, readyToMove: true }} {...noOps} />);
    expect(screen.getByText('Ready to move')).toBeInTheDocument();
  });

  it('does not render boolean chip when value is false', () => {
    const { container } = render(<ActiveContextChips filters={{ ...emptyFilters, backOnMarket: false }} {...noOps} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onClearBoolean with the correct key when a boolean chip × is clicked', async () => {
    const onClearBoolean = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, newToMarket: true, reraRegistered: true }}
        {...noOps}
        onClearBoolean={onClearBoolean}
      />,
    );
    await userEvent.click(screen.getByTestId('chip-bool-ntm-dismiss'));
    expect(onClearBoolean).toHaveBeenCalledWith('newToMarket');
    expect(onClearBoolean).toHaveBeenCalledTimes(1);
  });

  it('renders boolean chips in stable order: bom → ntm → rera → rtm', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, readyToMove: true, newToMarket: true, backOnMarket: true, reraRegistered: true }}
        {...noOps}
      />,
    );
    const chips = screen.getAllByRole('group', { name: /Active filter:/ });
    const labels = chips.map((el) => el.getAttribute('aria-label'));
    const boolStart = labels.findIndex((l) => l === 'Active filter: Back on market');
    expect(boolStart).toBeGreaterThanOrEqual(0);
    expect(labels[boolStart + 1]).toBe('Active filter: New to market');
    expect(labels[boolStart + 2]).toBe('Active filter: RERA registered');
    expect(labels[boolStart + 3]).toBe('Active filter: Ready to move');
  });

  // ── Design §5 ordering: search → booleans → value filters ─────────────────

  it('orders chips search → booleans → value filters (seller/date/type/price/bhk)', () => {
    render(
      <ActiveContextChips
        searchQuery="villa"
        filters={{
          ...emptyFilters,
          sellerTypes: ['owner'],
          dateFrom: '2025-01-15',
          newToMarket: true,
          propertyTypes: ['apartment'],
        }}
        {...noOps}
      />,
    );
    const chips = screen.getAllByRole('group', { name: /Active filter:/ });
    const labels = chips.map((el) => el.getAttribute('aria-label'));
    const searchIdx = labels.findIndex((l) => l?.includes('villa'));
    const ntmIdx = labels.findIndex((l) => l === 'Active filter: New to market');
    const sellerIdx = labels.findIndex((l) => l === 'Active filter: Seller: Owner');
    expect(searchIdx).toBe(0); // search always first
    expect(ntmIdx).toBeGreaterThan(searchIdx); // boolean before value filters
    expect(sellerIdx).toBeGreaterThan(ntmIdx);
  });

  // ── Search chip (Issue #1817 — no longer context-gated on area/school) ────

  it('renders search chip at any scope (no area/school context required)', () => {
    render(<ActiveContextChips searchQuery="villa" filters={emptyFilters} {...noOps} />);
    expect(screen.getByTestId('chip-search')).toBeInTheDocument();
    expect(screen.getByText('Search: "villa"')).toBeInTheDocument();
  });

  it('does not render search chip when searchQuery is undefined', () => {
    const { container } = render(<ActiveContextChips filters={emptyFilters} {...noOps} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render search chip for whitespace-only searchQuery', () => {
    const { container } = render(<ActiveContextChips searchQuery="   " filters={emptyFilters} {...noOps} />);
    expect(container.firstChild).toBeNull();
  });

  it('trims and truncates the search label to ~24 chars with an ellipsis', () => {
    render(
      <ActiveContextChips
        searchQuery="  a very long search phrase that exceeds twenty four characters  "
        filters={emptyFilters}
        {...noOps}
      />,
    );
    const chip = screen.getByTestId('chip-search');
    expect(chip.textContent).toContain('…');
    expect(chip.textContent).toMatch(/^Search: "a very long search phras/);
  });

  it('calls onClearSearch exactly once when the search chip × is clicked', async () => {
    const onClearSearch = vi.fn();
    render(<ActiveContextChips searchQuery="villa" filters={emptyFilters} {...noOps} onClearSearch={onClearSearch} />);
    await userEvent.click(screen.getByTestId('chip-search-dismiss'));
    expect(onClearSearch).toHaveBeenCalledOnce();
  });

  it('clearing the search chip does not fire sibling filter clear handlers', async () => {
    const onClearSearch = vi.fn();
    const onClearPropertyType = vi.fn();
    render(
      <ActiveContextChips
        searchQuery="villa"
        filters={{ ...emptyFilters, propertyTypes: ['apartment'] }}
        {...noOps}
        onClearSearch={onClearSearch}
        onClearPropertyType={onClearPropertyType}
      />,
    );
    await userEvent.click(screen.getByTestId('chip-search-dismiss'));
    expect(onClearSearch).toHaveBeenCalledOnce();
    expect(onClearPropertyType).not.toHaveBeenCalled();
  });

  // ── Overflow (AC10): >4 filter chips collapse into "+N" popover ────────────

  it('shows a "+N" overflow trigger when more than 4 filter chips are active, search chip stays visible', () => {
    render(
      <ActiveContextChips
        searchQuery="villa"
        filters={{
          ...emptyFilters,
          backOnMarket: true,
          newToMarket: true,
          reraRegistered: true,
          readyToMove: true,
          sellerTypes: ['owner'],
          dateFrom: '2025-01-15',
        }}
        {...noOps}
      />,
    );
    // search chip always visible, never counted against the overflow budget
    expect(screen.getByTestId('chip-search')).toBeInTheDocument();
    expect(screen.getByTestId('active-chips-overflow-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('active-chips-overflow-trigger').textContent).toContain('+2');
  });

  it('opens the overflow popover and shows the hidden chips, each individually clearable', async () => {
    const onClearSeller = vi.fn();
    render(
      <ActiveContextChips
        filters={{
          ...emptyFilters,
          backOnMarket: true,
          newToMarket: true,
          reraRegistered: true,
          readyToMove: true,
          sellerTypes: ['owner'],
        }}
        {...noOps}
        onClearSeller={onClearSeller}
      />,
    );
    await userEvent.click(screen.getByTestId('active-chips-overflow-trigger'));
    expect(await screen.findByTestId('active-chips-overflow-popover')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove seller: owner/i }));
    expect(onClearSeller).toHaveBeenCalledOnce();
  });

  it('does not show an overflow trigger when 4 or fewer filter chips are active', () => {
    render(
      <ActiveContextChips
        filters={{
          ...emptyFilters,
          backOnMarket: true,
          newToMarket: true,
          reraRegistered: true,
          readyToMove: true,
        }}
        {...noOps}
      />,
    );
    expect(screen.queryByTestId('active-chips-overflow-trigger')).not.toBeInTheDocument();
  });

  // ── Clear all (AC10) ────────────────────────────────────────────────────────

  it('does not render "Clear all" when onClearAll is not provided', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, backOnMarket: true }} {...noOps} />);
    expect(screen.queryByTestId('active-chips-clear-all')).not.toBeInTheDocument();
  });

  it('renders "Clear all" with the correct aria-label and calls onClearAll on click', async () => {
    const onClearAll = vi.fn();
    render(
      <ActiveContextChips filters={{ ...emptyFilters, backOnMarket: true }} {...noOps} onClearAll={onClearAll} />,
    );
    const btn = screen.getByRole('button', { name: 'Clear all filters and search' });
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  // ── A11y: dismiss button aria-labels ────────────────────────────────────────

  it('each dismiss button has aria-label "Remove {chip label}"', () => {
    render(<ActiveContextChips filters={{ ...emptyFilters, readyToMove: true }} {...noOps} />);
    expect(screen.getByRole('button', { name: 'Remove Ready to move' })).toBeInTheDocument();
  });

  // ── Roving focus (design §10) ──────────────────────────────────────────────

  it('roves focus across chips with ArrowRight/ArrowLeft', async () => {
    const user = userEvent.setup();
    render(
      <ActiveContextChips
        searchQuery="villa"
        filters={{ ...emptyFilters, backOnMarket: true }}
        {...noOps}
      />,
    );
    const searchChip = screen.getByRole('group', { name: /Active filter: Search/ });
    searchChip.focus();
    expect(searchChip).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    const boolChip = screen.getByRole('group', { name: 'Active filter: Back on market' });
    expect(boolChip).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(searchChip).toHaveFocus();
  });

  it('Backspace on a focused chip clears it (keyboard parity with the × button)', async () => {
    const onClearBoolean = vi.fn();
    const user = userEvent.setup();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, readyToMove: true }}
        {...noOps}
        onClearBoolean={onClearBoolean}
      />,
    );
    const chip = screen.getByRole('group', { name: 'Active filter: Ready to move' });
    chip.focus();
    await user.keyboard('{Backspace}');
    expect(onClearBoolean).toHaveBeenCalledWith('readyToMove');
  });
});
