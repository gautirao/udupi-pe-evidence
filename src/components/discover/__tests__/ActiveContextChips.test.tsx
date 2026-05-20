import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ActiveContextChips } from '../ActiveContextChips';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const emptyFilters: DiscoverUrlFilters = {};

const noOps = {
  onClearArea: vi.fn(),
  onClearSchool: vi.fn(),
  onClearPropertyType: vi.fn(),
  onClearBhk: vi.fn(),
  onClearPrice: vi.fn(),
};

const mockArea: AreaPoint = {
  areaKey: 'manipal|udupi|udupi-manipal',
  areaLabel: 'Manipal',
  lat: 13.35,
  lon: 74.79,
  listingCount: 5,
};

const mockSchool: SchoolResult = {
  id: 's1',
  name: 'Manipal Academy',
  board: null,
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
  address: '123 Main St',
  distanceKm: 0.5,
};

describe('ActiveContextChips', () => {
  it('returns null when no dimensions are active', () => {
    const { container } = render(
      <ActiveContextChips filters={emptyFilters} {...noOps} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows area chip with area label', () => {
    render(
      <ActiveContextChips
        selectedArea={mockArea}
        filters={emptyFilters}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-area')).toBeInTheDocument();
    expect(screen.getByText('Manipal')).toBeInTheDocument();
  });

  it('calls onClearArea when area chip × is clicked', async () => {
    const onClearArea = vi.fn();
    render(
      <ActiveContextChips
        selectedArea={mockArea}
        filters={emptyFilters}
        {...noOps}
        onClearArea={onClearArea}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear manipal/i }));
    expect(onClearArea).toHaveBeenCalledOnce();
  });

  it('shows school chip with name and radius', () => {
    render(
      <ActiveContextChips
        selectedSchool={mockSchool}
        radiusKm={3}
        filters={emptyFilters}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-school')).toBeInTheDocument();
    expect(screen.getByText('Manipal Academy (3 km)')).toBeInTheDocument();
  });

  it('calls onClearSchool when school chip × is clicked', async () => {
    const onClearSchool = vi.fn();
    render(
      <ActiveContextChips
        selectedSchool={mockSchool}
        radiusKm={2}
        filters={emptyFilters}
        {...noOps}
        onClearSchool={onClearSchool}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /clear manipal academy/i }),
    );
    expect(onClearSchool).toHaveBeenCalledOnce();
  });

  it('defaults to 2 km radius when radiusKm is null', () => {
    render(
      <ActiveContextChips
        selectedSchool={mockSchool}
        radiusKm={null}
        filters={emptyFilters}
        {...noOps}
      />,
    );
    expect(screen.getByText('Manipal Academy (2 km)')).toBeInTheDocument();
  });

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
    await userEvent.click(
      screen.getByRole('button', { name: /clear apartment/i }),
    );
    expect(onClearPropertyType).toHaveBeenCalledOnce();
  });

  it('shows single BHK label', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, bedrooms: [2] }}
        {...noOps}
      />,
    );
    expect(screen.getByText('2 BHK')).toBeInTheDocument();
  });

  it('shows two-value BHK label', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, bedrooms: [2, 3] }}
        {...noOps}
      />,
    );
    expect(screen.getByText('2, 3 BHK')).toBeInTheDocument();
  });

  it('shows truncated BHK label for 3+ values', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, bedrooms: [1, 2, 3, 4] }}
        {...noOps}
      />,
    );
    expect(screen.getByText('1, 2 BHK +2')).toBeInTheDocument();
  });

  it('calls onClearBhk when BHK chip × is clicked', async () => {
    const onClearBhk = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, bedrooms: [2] }}
        {...noOps}
        onClearBhk={onClearBhk}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear 2 bhk/i }));
    expect(onClearBhk).toHaveBeenCalledOnce();
  });

  it('shows price range when both min and max are set', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, priceMin: 5000000, priceMax: 10000000 }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-price')).toBeInTheDocument();
    // formatPrice(5000000) = ₹50 L, formatPrice(10000000) = ₹1 Cr
    expect(screen.getByText(/₹50 L – ₹1 Cr/)).toBeInTheDocument();
  });

  it('shows "₹X+" when only priceMin is set', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, priceMin: 5000000 }}
        {...noOps}
      />,
    );
    expect(screen.getByText(/₹50 L\+/)).toBeInTheDocument();
  });

  it('shows "Up to ₹Y" when only priceMax is set', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, priceMax: 10000000 }}
        {...noOps}
      />,
    );
    expect(screen.getByText(/Up to ₹1 Cr/)).toBeInTheDocument();
  });

  it('calls onClearPrice when price chip × is clicked', async () => {
    const onClearPrice = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, priceMin: 5000000 }}
        {...noOps}
        onClearPrice={onClearPrice}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear ₹/i }));
    expect(onClearPrice).toHaveBeenCalledOnce();
  });

  it('renders multiple chips simultaneously', () => {
    render(
      <ActiveContextChips
        selectedArea={mockArea}
        filters={{ ...emptyFilters, propertyTypes: ['apartment'], bedrooms: [2] }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-area')).toBeInTheDocument();
    expect(screen.getByTestId('chip-type')).toBeInTheDocument();
    expect(screen.getByTestId('chip-bhk')).toBeInTheDocument();
    expect(screen.queryByTestId('chip-school')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-price')).not.toBeInTheDocument();
  });

  // ── A11y: chip wrapper ──────────────────────────────────────────────────────
  // Each chip div carries role="group" + aria-label="Active filter: <label>"
  // so assistive technology announces the chip group and its dismiss button together.

  it('area chip wrapper has role="group" with aria-label "Active filter: <label>"', () => {
    render(
      <ActiveContextChips
        selectedArea={mockArea}
        filters={emptyFilters}
        {...noOps}
      />,
    );
    expect(screen.getByRole('group', { name: 'Active filter: Manipal' })).toBeInTheDocument();
  });

  it('school chip wrapper has role="group" with aria-label "Active filter: <label>"', () => {
    render(
      <ActiveContextChips
        selectedSchool={mockSchool}
        radiusKm={2}
        filters={emptyFilters}
        {...noOps}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Active filter: Manipal Academy (2 km)' }),
    ).toBeInTheDocument();
  });

  it('type chip wrapper has role="group" with aria-label "Active filter: <label>"', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, propertyTypes: ['apartment'] }}
        {...noOps}
      />,
    );
    expect(screen.getByRole('group', { name: 'Active filter: Apartment' })).toBeInTheDocument();
  });

  // ── School chip: onClearSchool callback contract ────────────────────────────
  // ActiveContextChips invokes onClearSchool exactly once when the school chip ×
  // is clicked. The 5-part atomic clear (setSchoolParams + setBoardFilters +
  // setCategoryFilters + setSelectedSchool + setFilters) is wired by MapDiscovery
  // inside the onClearSchool closure — this test pins the component's half of
  // the contract (one call, correct trigger, no spurious extra calls).

  it('school chip × fires onClearSchool exactly once and not onClearArea', async () => {
    const onClearSchool = vi.fn();
    const onClearArea = vi.fn();
    render(
      <ActiveContextChips
        selectedSchool={mockSchool}
        selectedArea={mockArea}
        radiusKm={2}
        filters={emptyFilters}
        {...noOps}
        onClearSchool={onClearSchool}
        onClearArea={onClearArea}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /clear manipal academy/i }),
    );
    expect(onClearSchool).toHaveBeenCalledOnce();
    expect(onClearArea).not.toHaveBeenCalled();
  });

  // ── School + property filter coexistence ───────────────────────────────────
  // Verifies that school context chips and property-filter chips can both be
  // active at the same time and each maps to a distinct clear handler.

  it('renders school chip and property-type chip together when both are active', () => {
    render(
      <ActiveContextChips
        selectedSchool={mockSchool}
        radiusKm={3}
        filters={{ ...emptyFilters, propertyTypes: ['house'], priceMin: 1_000_000 }}
        {...noOps}
      />,
    );
    // School proximity chip
    expect(screen.getByTestId('chip-school')).toBeInTheDocument();
    expect(screen.getByText('Manipal Academy (3 km)')).toBeInTheDocument();
    // Property-type chip
    expect(screen.getByTestId('chip-type')).toBeInTheDocument();
    expect(screen.getByText('House')).toBeInTheDocument();
    // Price chip
    expect(screen.getByTestId('chip-price')).toBeInTheDocument();
    // No area chip — school journey has no area selected
    expect(screen.queryByTestId('chip-area')).not.toBeInTheDocument();
  });

  it('school chip clear and property-type chip clear are independent callbacks', async () => {
    const onClearSchool = vi.fn();
    const onClearPropertyType = vi.fn();
    render(
      <ActiveContextChips
        selectedSchool={mockSchool}
        radiusKm={3}
        filters={{ ...emptyFilters, propertyTypes: ['house'] }}
        {...noOps}
        onClearSchool={onClearSchool}
        onClearPropertyType={onClearPropertyType}
      />,
    );

    // Clear the property-type chip — school chip must not fire
    await userEvent.click(
      screen.getByRole('button', { name: /clear house/i }),
    );
    expect(onClearPropertyType).toHaveBeenCalledOnce();
    expect(onClearSchool).not.toHaveBeenCalled();

    onClearPropertyType.mockClear();

    // Clear the school chip — property-type chip must not fire
    await userEvent.click(
      screen.getByRole('button', { name: /clear manipal academy/i }),
    );
    expect(onClearSchool).toHaveBeenCalledOnce();
    expect(onClearPropertyType).not.toHaveBeenCalled();
  });

  it('area chip × fires onClearArea exactly once and not onClearSchool', async () => {
    const onClearArea = vi.fn();
    const onClearSchool = vi.fn();
    render(
      <ActiveContextChips
        selectedArea={mockArea}
        selectedSchool={mockSchool}
        radiusKm={2}
        filters={emptyFilters}
        {...noOps}
        onClearArea={onClearArea}
        onClearSchool={onClearSchool}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /clear manipal$/i }),
    );
    expect(onClearArea).toHaveBeenCalledOnce();
    expect(onClearSchool).not.toHaveBeenCalled();
  });

  // ── Seller chips ───────────────────────────────────────────────────────────

  it('renders seller chip for single seller type', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, sellerTypes: ['owner'] }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-seller')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('renders seller chip with +N suffix for multiple seller types', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, sellerTypes: ['owner', 'broker'] }}
        {...noOps}
      />,
    );
    expect(screen.getByText('Owner +1')).toBeInTheDocument();
  });

  it('does not render seller chip when sellerTypes is empty', () => {
    const { container } = render(
      <ActiveContextChips
        filters={{ ...emptyFilters, sellerTypes: [] }}
        {...noOps}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render seller chip when sellerTypes contains only whitespace', () => {
    const { container } = render(
      <ActiveContextChips
        filters={{ ...emptyFilters, sellerTypes: ['  ', ''] }}
        {...noOps}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onClearSeller when seller chip × is clicked', async () => {
    const onClearSeller = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, sellerTypes: ['owner'] }}
        {...noOps}
        onClearSeller={onClearSeller}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear owner/i }));
    expect(onClearSeller).toHaveBeenCalledOnce();
  });

  it('does not call other handlers when seller chip × is clicked', async () => {
    const onClearSeller = vi.fn();
    const onClearDateRange = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, sellerTypes: ['owner'], dateFrom: '2025-01-01' }}
        {...noOps}
        onClearSeller={onClearSeller}
        onClearDateRange={onClearDateRange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear owner/i }));
    expect(onClearSeller).toHaveBeenCalledOnce();
    expect(onClearDateRange).not.toHaveBeenCalled();
  });

  // ── Date range chips ───────────────────────────────────────────────────────

  it('renders date chip with both from and to dates', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, dateFrom: '2025-01-15', dateTo: '2025-02-01' }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-date')).toBeInTheDocument();
    // Label contains a dash between the two formatted dates
    expect(screen.getByText(/–/)).toBeInTheDocument();
  });

  it('renders "From <date>" chip when only dateFrom is set', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, dateFrom: '2025-01-15' }}
        {...noOps}
      />,
    );
    const chip = screen.getByTestId('chip-date');
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toMatch(/From /i);
  });

  it('renders "Until <date>" chip when only dateTo is set', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, dateTo: '2025-02-01' }}
        {...noOps}
      />,
    );
    const chip = screen.getByTestId('chip-date');
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toMatch(/Until /i);
  });

  it('does not render date chip when neither dateFrom nor dateTo is set', () => {
    const { container } = render(
      <ActiveContextChips
        filters={emptyFilters}
        {...noOps}
      />,
    );
    expect(container.firstChild).toBeNull();
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

  it('renders Back on Market chip when backOnMarket is true', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, backOnMarket: true }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-bool-bom')).toBeInTheDocument();
    expect(screen.getByText('Back on Market')).toBeInTheDocument();
  });

  it('renders New to Market chip when newToMarket is true', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, newToMarket: true }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-bool-ntm')).toBeInTheDocument();
    expect(screen.getByText('New to Market')).toBeInTheDocument();
  });

  it('renders RERA Registered chip when reraRegistered is true', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, reraRegistered: true }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-bool-rera')).toBeInTheDocument();
    expect(screen.getByText('RERA Registered')).toBeInTheDocument();
  });

  it('renders Ready to Move chip when readyToMove is true', () => {
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, readyToMove: true }}
        {...noOps}
      />,
    );
    expect(screen.getByTestId('chip-bool-rtm')).toBeInTheDocument();
    expect(screen.getByText('Ready to Move')).toBeInTheDocument();
  });

  it('does not render boolean chip when value is false', () => {
    const { container } = render(
      <ActiveContextChips
        filters={{ ...emptyFilters, backOnMarket: false }}
        {...noOps}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render boolean chip when value is undefined', () => {
    const { container } = render(
      <ActiveContextChips
        filters={{ ...emptyFilters, newToMarket: undefined }}
        {...noOps}
      />,
    );
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

  it('fires only the correct boolean handler when rera chip × is clicked', async () => {
    const onClearBoolean = vi.fn();
    render(
      <ActiveContextChips
        filters={{ ...emptyFilters, newToMarket: true, reraRegistered: true }}
        {...noOps}
        onClearBoolean={onClearBoolean}
      />,
    );
    await userEvent.click(screen.getByTestId('chip-bool-rera-dismiss'));
    expect(onClearBoolean).toHaveBeenCalledWith('reraRegistered');
    expect(onClearBoolean).toHaveBeenCalledTimes(1);
  });

  it('renders boolean chips in stable order: bom → ntm → rera → rtm', () => {
    render(
      <ActiveContextChips
        filters={{
          ...emptyFilters,
          readyToMove: true,
          newToMarket: true,
          backOnMarket: true,
          reraRegistered: true,
        }}
        {...noOps}
      />,
    );
    const chips = screen.getAllByRole('group', { name: /Active filter:/ });
    const labels = chips.map((el) => el.getAttribute('aria-label'));
    const boolStart = labels.findIndex((l) => l === 'Active filter: Back on Market');
    expect(boolStart).toBeGreaterThanOrEqual(0);
    expect(labels[boolStart]).toBe('Active filter: Back on Market');
    expect(labels[boolStart + 1]).toBe('Active filter: New to Market');
    expect(labels[boolStart + 2]).toBe('Active filter: RERA Registered');
    expect(labels[boolStart + 3]).toBe('Active filter: Ready to Move');
  });

  // ── Cold-load / undefined-safe ─────────────────────────────────────────────

  it('returns null when filters is empty object (cold-load from URL with no params)', () => {
    const { container } = render(
      <ActiveContextChips filters={{}} {...noOps} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // ── Multi-dimension render order (seller → date → booleans) ───────────────

  it('renders seller chip before date chip before boolean chips', () => {
    render(
      <ActiveContextChips
        filters={{
          ...emptyFilters,
          sellerTypes: ['owner'],
          dateFrom: '2025-01-15',
          newToMarket: true,
        }}
        {...noOps}
      />,
    );
    const chips = screen.getAllByRole('group', { name: /Active filter:/ });
    const labels = chips.map((el) => el.getAttribute('aria-label'));
    const sellerIdx = labels.findIndex((l) => l === 'Active filter: Owner');
    const dateIdx = labels.findIndex((l) => l?.startsWith('Active filter: From'));
    const ntmIdx = labels.findIndex((l) => l === 'Active filter: New to Market');
    expect(sellerIdx).toBeGreaterThanOrEqual(0);
    expect(dateIdx).toBeGreaterThan(sellerIdx);
    expect(ntmIdx).toBeGreaterThan(dateIdx);
  });
});
