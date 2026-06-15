/**
 * Tests for AgriSpecRows (Issue #1458 — structured agri fields)
 *
 * Covers:
 * - landCategory: enum→human label; null→row omitted
 * - waterSource: enum→label (NOT_AVAILABLE→"Not available"); null→omitted; fallback to raw
 * - farmhouseAvailable: true→"Yes", false→"No", null→omitted
 * - fencingDone: true→"Yes", false→"No", null→omitted
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AgriSpecRows } from '../AgriSpecRows';

// ─── landCategory ─────────────────────────────────────────────────────────────

describe('AgriSpecRows — landCategory (Issue #1458)', () => {
  it('renders "Farmland" for landCategory=FARMLAND', () => {
    render(<AgriSpecRows landCategory="FARMLAND" />);
    expect(screen.getByTestId('agri-land-category')).toHaveTextContent('Farmland');
  });

  it('renders "Plantation" for landCategory=PLANTATION', () => {
    render(<AgriSpecRows landCategory="PLANTATION" />);
    expect(screen.getByTestId('agri-land-category')).toHaveTextContent('Plantation');
  });

  it('renders "Farm plot" for landCategory=FARM_PLOT', () => {
    render(<AgriSpecRows landCategory="FARM_PLOT" />);
    expect(screen.getByTestId('agri-land-category')).toHaveTextContent('Farm plot');
  });

  it('renders "Agricultural plot" for landCategory=AGRICULTURAL_PLOT', () => {
    render(<AgriSpecRows landCategory="AGRICULTURAL_PLOT" />);
    expect(screen.getByTestId('agri-land-category')).toHaveTextContent('Agricultural plot');
  });

  it('renders "Other" for landCategory=OTHER', () => {
    render(<AgriSpecRows landCategory="OTHER" />);
    expect(screen.getByTestId('agri-land-category')).toHaveTextContent('Other');
  });

  it('falls back to raw value for an unknown landCategory enum', () => {
    render(<AgriSpecRows landCategory="FUTURE_ENUM_VALUE" />);
    expect(screen.getByTestId('agri-land-category')).toHaveTextContent('FUTURE_ENUM_VALUE');
  });

  it('omits land category row when landCategory is null', () => {
    render(<AgriSpecRows landCategory={null} />);
    expect(screen.queryByTestId('agri-land-category')).not.toBeInTheDocument();
  });

  it('omits land category row when landCategory is undefined', () => {
    render(<AgriSpecRows />);
    expect(screen.queryByTestId('agri-land-category')).not.toBeInTheDocument();
  });
});

// ─── waterSource ──────────────────────────────────────────────────────────────

describe('AgriSpecRows — waterSource (Issue #1458)', () => {
  it('renders "Not available" for waterSource=NOT_AVAILABLE', () => {
    render(<AgriSpecRows waterSource="NOT_AVAILABLE" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Not available');
  });

  it('renders "Well" for waterSource=WELL', () => {
    render(<AgriSpecRows waterSource="WELL" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Well');
  });

  it('renders "Borewell" for waterSource=BOREWELL', () => {
    render(<AgriSpecRows waterSource="BOREWELL" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Borewell');
  });

  it('falls back to raw value for an unknown waterSource enum', () => {
    render(<AgriSpecRows waterSource="RIVER" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('RIVER');
  });

  it('omits water source row when waterSource is null', () => {
    render(<AgriSpecRows waterSource={null} />);
    expect(screen.queryByTestId('agri-water-source')).not.toBeInTheDocument();
  });
});

// ─── farmhouseAvailable ───────────────────────────────────────────────────────

describe('AgriSpecRows — farmhouseAvailable (Issue #1458)', () => {
  it('renders "Yes" when farmhouseAvailable=true', () => {
    render(<AgriSpecRows farmhouseAvailable={true} />);
    expect(screen.getByTestId('agri-farmhouse-available')).toHaveTextContent('Yes');
  });

  it('renders "No" when farmhouseAvailable=false', () => {
    render(<AgriSpecRows farmhouseAvailable={false} />);
    expect(screen.getByTestId('agri-farmhouse-available')).toHaveTextContent('No');
  });

  it('omits farmhouse row when farmhouseAvailable is null (not specified)', () => {
    render(<AgriSpecRows farmhouseAvailable={null} />);
    expect(screen.queryByTestId('agri-farmhouse-available')).not.toBeInTheDocument();
  });

  it('omits farmhouse row when farmhouseAvailable is undefined', () => {
    render(<AgriSpecRows />);
    expect(screen.queryByTestId('agri-farmhouse-available')).not.toBeInTheDocument();
  });
});

// ─── fencingDone ──────────────────────────────────────────────────────────────

describe('AgriSpecRows — fencingDone (Issue #1458)', () => {
  it('renders "Yes" when fencingDone=true', () => {
    render(<AgriSpecRows fencingDone={true} />);
    expect(screen.getByTestId('agri-fencing-done')).toHaveTextContent('Yes');
  });

  it('renders "No" when fencingDone=false', () => {
    render(<AgriSpecRows fencingDone={false} />);
    expect(screen.getByTestId('agri-fencing-done')).toHaveTextContent('No');
  });

  it('omits fencing row when fencingDone is null (not specified)', () => {
    render(<AgriSpecRows fencingDone={null} />);
    expect(screen.queryByTestId('agri-fencing-done')).not.toBeInTheDocument();
  });

  it('null and false are distinct — false renders "No", null omits the row', () => {
    // Renders null → no row
    const { rerender } = render(<AgriSpecRows fencingDone={null} />);
    expect(screen.queryByTestId('agri-fencing-done')).not.toBeInTheDocument();

    // Rerender with false → row present with "No"
    rerender(<AgriSpecRows fencingDone={false} />);
    expect(screen.getByTestId('agri-fencing-done')).toHaveTextContent('No');
  });
});
