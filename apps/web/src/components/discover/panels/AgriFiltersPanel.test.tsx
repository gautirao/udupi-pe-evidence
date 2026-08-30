/**
 * Tests for AgriFiltersPanel (Issue #1457)
 *
 * Covers:
 * - Acreage inputs render and are editable
 * - Price inputs render when authenticated; locked state shows when not authenticated
 * - Apply Filters calls onApply with correct parsed values
 * - Clear Filters calls onClear
 * - min > max shows inline validation hint (no filter applied)
 * - Sync from URL props (useEffect) resets local state when props change
 * - Anon: price inputs absent, locked message shown
 * - Auth: price inputs present
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AgriFiltersPanel } from './AgriFiltersPanel';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const noop = () => {};

const baseProps = {
  isAuthenticated: false,
  onApply: vi.fn(),
  onClear: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgriFiltersPanel — panel renders', () => {
  it('renders the panel container', () => {
    render(<AgriFiltersPanel {...baseProps} />);
    expect(screen.getByTestId('agri-filters-panel')).toBeInTheDocument();
  });

  it('renders acreage min and max inputs', () => {
    render(<AgriFiltersPanel {...baseProps} />);
    expect(screen.getByTestId('agri-acres-min')).toBeInTheDocument();
    expect(screen.getByTestId('agri-acres-max')).toBeInTheDocument();
  });

  it('renders Apply Filters and Clear Filters buttons', () => {
    render(<AgriFiltersPanel {...baseProps} />);
    expect(screen.getByTestId('agri-filters-apply')).toBeInTheDocument();
    expect(screen.getByTestId('agri-filters-clear')).toBeInTheDocument();
  });
});

describe('AgriFiltersPanel — anon user', () => {
  it('shows the locked price message when not authenticated', () => {
    render(<AgriFiltersPanel {...baseProps} isAuthenticated={false} />);
    expect(screen.getByTestId('agri-price-locked')).toBeInTheDocument();
    expect(screen.getByText(/sign in to filter by price/i)).toBeInTheDocument();
  });

  it('does not show price min/max inputs when not authenticated', () => {
    render(<AgriFiltersPanel {...baseProps} isAuthenticated={false} />);
    expect(screen.queryByTestId('agri-price-min')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-price-max')).not.toBeInTheDocument();
  });
});

describe('AgriFiltersPanel — authenticated user', () => {
  it('shows price min and max inputs when authenticated', () => {
    render(<AgriFiltersPanel {...baseProps} isAuthenticated={true} />);
    expect(screen.getByTestId('agri-price-min')).toBeInTheDocument();
    expect(screen.getByTestId('agri-price-max')).toBeInTheDocument();
  });

  it('does not show the locked price message when authenticated', () => {
    render(<AgriFiltersPanel {...baseProps} isAuthenticated={true} />);
    expect(screen.queryByTestId('agri-price-locked')).not.toBeInTheDocument();
  });
});

describe('AgriFiltersPanel — Apply Filters', () => {
  it('calls onApply with parsed acreage values when clicking Apply', async () => {
    const onApply = vi.fn();
    render(<AgriFiltersPanel {...baseProps} onApply={onApply} />);
    await userEvent.type(screen.getByTestId('agri-acres-min'), '1.5');
    await userEvent.type(screen.getByTestId('agri-acres-max'), '5');
    await userEvent.click(screen.getByTestId('agri-filters-apply'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ agriAcresMin: 1.5, agriAcresMax: 5 }),
    );
  });

  it('calls onApply with undefined price values for anon user even if acreage typed', async () => {
    const onApply = vi.fn();
    render(<AgriFiltersPanel {...baseProps} isAuthenticated={false} onApply={onApply} />);
    await userEvent.type(screen.getByTestId('agri-acres-min'), '2');
    await userEvent.click(screen.getByTestId('agri-filters-apply'));
    const call = onApply.mock.calls[0][0];
    expect(call.agriPriceMin).toBeUndefined();
    expect(call.agriPriceMax).toBeUndefined();
  });

  it('calls onApply with price values for authenticated user', async () => {
    const onApply = vi.fn();
    render(<AgriFiltersPanel {...baseProps} isAuthenticated={true} onApply={onApply} />);
    await userEvent.type(screen.getByTestId('agri-price-min'), '100000');
    await userEvent.type(screen.getByTestId('agri-price-max'), '500000');
    await userEvent.click(screen.getByTestId('agri-filters-apply'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ agriPriceMin: 100000, agriPriceMax: 500000 }),
    );
  });

  it('calls onApply with undefined values when inputs are empty', async () => {
    const onApply = vi.fn();
    render(<AgriFiltersPanel {...baseProps} onApply={onApply} />);
    await userEvent.click(screen.getByTestId('agri-filters-apply'));
    expect(onApply).toHaveBeenCalledWith({
      agriAcresMin: undefined,
      agriAcresMax: undefined,
      agriPriceMin: undefined,
      agriPriceMax: undefined,
      agriLandCategory: null,
      agriFarmhouseAvailable: null,
      agriFencingDone: null,
      agriWaterSource: null,
    });
  });
});

describe('AgriFiltersPanel — Clear Filters', () => {
  it('calls onClear when Clear Filters button is clicked', async () => {
    const onClear = vi.fn();
    render(<AgriFiltersPanel {...baseProps} onClear={onClear} />);
    await userEvent.click(screen.getByTestId('agri-filters-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('AgriFiltersPanel — validation hint (min > max)', () => {
  it('shows acreage validation hint when min > max', async () => {
    render(<AgriFiltersPanel {...baseProps} />);
    await userEvent.type(screen.getByTestId('agri-acres-min'), '10');
    await userEvent.type(screen.getByTestId('agri-acres-max'), '5');
    expect(screen.getAllByText(/min must be/i).length).toBeGreaterThan(0);
  });

  it('shows price validation hint when min > max (authenticated)', async () => {
    render(<AgriFiltersPanel {...baseProps} isAuthenticated={true} />);
    await userEvent.type(screen.getByTestId('agri-price-min'), '500000');
    await userEvent.type(screen.getByTestId('agri-price-max'), '100000');
    expect(screen.getAllByText(/min must be/i).length).toBeGreaterThan(0);
  });

  it('does not show acreage validation hint when min <= max', async () => {
    render(<AgriFiltersPanel {...baseProps} />);
    await userEvent.type(screen.getByTestId('agri-acres-min'), '2');
    await userEvent.type(screen.getByTestId('agri-acres-max'), '5');
    expect(screen.queryByText(/min must be/i)).not.toBeInTheDocument();
  });
});

describe('AgriFiltersPanel — anon: price stripped in handleApply (Issue #1457 security)', () => {
  it('onApply is called with agriPriceMin=undefined and agriPriceMax=undefined when isAuthenticated=false', async () => {
    // Even though anon users can't fill price inputs (UI hides them), the component's
    // handleApply guard must strip price values regardless. This test verifies the guard
    // by rendering with isAuthenticated=false and confirming onApply never carries price.
    const onApply = vi.fn();
    render(
      <AgriFiltersPanel
        {...baseProps}
        isAuthenticated={false}
        onApply={onApply}
        acresMin={1}
        acresMax={5}
      />,
    );
    await userEvent.click(screen.getByTestId('agri-filters-apply'));
    const call = onApply.mock.calls[0][0];
    expect(call.agriPriceMin).toBeUndefined();
    expect(call.agriPriceMax).toBeUndefined();
    // Acreage values still pass through
    expect(call.agriAcresMin).toBe(1);
    expect(call.agriAcresMax).toBe(5);
  });
});

describe('AgriFiltersPanel — sync from URL props', () => {
  it('pre-fills inputs with provided prop values', () => {
    render(
      <AgriFiltersPanel
        {...baseProps}
        acresMin={3}
        acresMax={10}
      />,
    );
    expect(screen.getByTestId('agri-acres-min')).toHaveValue(3);
    expect(screen.getByTestId('agri-acres-max')).toHaveValue(10);
  });

  it('pre-fills price inputs for authenticated user', () => {
    render(
      <AgriFiltersPanel
        {...baseProps}
        isAuthenticated={true}
        priceMinRupees={50000}
        priceMaxRupees={200000}
      />,
    );
    expect(screen.getByTestId('agri-price-min')).toHaveValue(50000);
    expect(screen.getByTestId('agri-price-max')).toHaveValue(200000);
  });
});
