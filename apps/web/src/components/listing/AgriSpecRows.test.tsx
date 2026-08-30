/**
 * AgriSpecRows — Issue #1406
 *
 * 1. Renders all 10 spec fields when fully populated.
 * 2. Omits null field (no row rendered for null waterSource).
 * 3. Omits empty-string field (no row for empty soilType).
 * 4. Shows price-per-acre when price > 0 && computedAreaAcres > 0.
 * 5. Hides price-per-acre when computedAreaAcres === 0 (no division by zero).
 * 6. Shows boundary disclaimer when boundary is a non-empty string.
 * 7. Hides boundary disclaimer when boundary is null.
 * 8. Hides price-per-acre when price is null.
 * 9. Shows approx. area when computedAreaAcres is populated.
 * 10. Omits approx. area when computedAreaAcres is null.
 *
 * Issue #1452 (FE-T1..FE-T5) — pricePaise single-source-of-truth:
 * FE-T1. price in rupees (already paise-converted upstream) renders as ₹1.25 L.
 * FE-T2. price-per-acre derives correctly from rupee price.
 * FE-T3. price=null → no price row rendered.
 * FE-T4. price=0 → no price row rendered (price > 0 guard).
 * FE-T5. Residential-style price (no agri fields) renders correctly.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgriSpecRows } from './AgriSpecRows';

// Full fixture — all nullable fields populated
const fullProps = {
  surveyNumber: 'SY 12/3A',
  landArea: 2.5,
  landAreaUnit: 'acres',
  computedAreaAcres: 2.48,
  price: 5_000_000,
  waterSource: 'Well',
  soilType: 'Red laterite',
  roadAccess: 'Tar road',
  cultivationStatus: 'Currently cultivated',
  ownershipType: 'Freehold',
  boundary: '{"type":"Polygon","coordinates":[[[74.8,13.2],[74.81,13.2],[74.81,13.21],[74.8,13.21],[74.8,13.2]]]}',
};

describe('AgriSpecRows', () => {
  // 1 — All fields present → all rows rendered
  it('renders all spec fields when fully populated', () => {
    render(<AgriSpecRows {...fullProps} />);

    expect(screen.getByTestId('agri-survey-number')).toHaveTextContent('SY 12/3A');
    expect(screen.getByTestId('agri-land-area')).toHaveTextContent('2.5 acres');
    expect(screen.getByTestId('agri-computed-area')).toHaveTextContent('≈ 2.48 acres');
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Well');
    expect(screen.getByTestId('agri-soil-type')).toHaveTextContent('Red laterite');
    expect(screen.getByTestId('agri-road-access')).toHaveTextContent('Tar road');
    expect(screen.getByTestId('agri-cultivation-status')).toHaveTextContent('Currently cultivated');
    expect(screen.getByTestId('agri-ownership-type')).toHaveTextContent('Freehold');
    // Price rows
    expect(screen.getByTestId('agri-price')).toBeInTheDocument();
    expect(screen.getByTestId('agri-price-per-acre')).toBeInTheDocument();
    expect(screen.getByTestId('agri-price-per-acre').textContent).toMatch(/\/acre/);
  });

  // 2 — null waterSource → row absent
  it('omits row when waterSource is null', () => {
    render(<AgriSpecRows {...fullProps} waterSource={null} />);
    expect(screen.queryByTestId('agri-water-source')).not.toBeInTheDocument();
  });

  // 3 — empty-string soilType → row absent
  it('omits row when soilType is an empty string', () => {
    render(<AgriSpecRows {...fullProps} soilType="" />);
    expect(screen.queryByTestId('agri-soil-type')).not.toBeInTheDocument();
  });

  // 4 — price > 0 AND computedAreaAcres > 0 → price-per-acre shown
  it('shows price-per-acre when price and computedAreaAcres are both positive', () => {
    render(<AgriSpecRows {...fullProps} price={5_000_000} computedAreaAcres={2.48} />);
    expect(screen.getByTestId('agri-price-per-acre')).toBeInTheDocument();
    // Should contain "/acre"
    expect(screen.getByTestId('agri-price-per-acre').textContent).toMatch(/\/acre/);
  });

  // 5 — computedAreaAcres === 0 → price-per-acre absent (no division by zero)
  it('hides price-per-acre when computedAreaAcres is 0', () => {
    render(<AgriSpecRows {...fullProps} computedAreaAcres={0} />);
    expect(screen.queryByTestId('agri-price-per-acre')).not.toBeInTheDocument();
  });

  // 6 — boundary non-empty string → disclaimer visible
  it('shows boundary disclaimer when boundary is a non-empty string', () => {
    render(<AgriSpecRows {...fullProps} boundary='{"type":"Polygon","coordinates":[]}' />);
    expect(screen.getByTestId('agri-boundary-disclaimer')).toBeInTheDocument();
    expect(
      screen.getByText(/The boundary drawn on the map is approximate/i),
    ).toBeInTheDocument();
  });

  // 7 — boundary null → disclaimer absent
  it('hides boundary disclaimer when boundary is null', () => {
    render(<AgriSpecRows {...fullProps} boundary={null} />);
    expect(screen.queryByTestId('agri-boundary-disclaimer')).not.toBeInTheDocument();
  });

  // 8 — price null → price-per-acre absent
  it('hides price-per-acre when price is null', () => {
    render(<AgriSpecRows {...fullProps} price={null} />);
    expect(screen.queryByTestId('agri-price-per-acre')).not.toBeInTheDocument();
  });

  // 9 — computedAreaAcres populated → approx area shown
  it('shows approx area when computedAreaAcres is populated', () => {
    render(<AgriSpecRows {...fullProps} computedAreaAcres={1.5} />);
    expect(screen.getByTestId('agri-computed-area')).toHaveTextContent('≈ 1.50 acres');
  });

  // 10 — computedAreaAcres null → approx area absent
  it('omits approx area row when computedAreaAcres is null', () => {
    render(<AgriSpecRows {...fullProps} computedAreaAcres={null} />);
    expect(screen.queryByTestId('agri-computed-area')).not.toBeInTheDocument();
  });

  // ── Issue #1452: pricePaise single-source-of-truth (FE-T1..FE-T5) ────────────

  // FE-T1 — rupee-converted price (125000 = ₹1.25 L) renders correctly
  it('FE-T1: renders ₹1.25 L when price is 125000 (paise→rupees already converted upstream)', () => {
    render(<AgriSpecRows price={125000} />);
    const priceCell = screen.getByTestId('agri-price');
    expect(priceCell).toBeInTheDocument();
    expect(priceCell).toHaveTextContent('₹1.25 L');
  });

  // FE-T2 — price-per-acre derives from rupee price (1250000 / 10 acres = 125000 → ₹1.25 L/acre)
  it('FE-T2: price-per-acre derives correctly from rupee price and computedAreaAcres', () => {
    render(<AgriSpecRows price={1_250_000} computedAreaAcres={10} />);
    const perAcreCell = screen.getByTestId('agri-price-per-acre');
    expect(perAcreCell).toBeInTheDocument();
    // 1250000 / 10 = 125000 → ₹1.25 L/acre
    expect(perAcreCell.textContent).toMatch(/₹1\.25 L\/acre/);
  });

  // FE-T3 — price=null → no price row, no crash
  it('FE-T3: price null renders no price row and no crash', () => {
    render(<AgriSpecRows price={null} />);
    expect(screen.queryByTestId('agri-price')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-price-per-acre')).not.toBeInTheDocument();
  });

  // FE-T4 — price=0 → no price row (price > 0 guard)
  it('FE-T4: price 0 renders no price row', () => {
    render(<AgriSpecRows price={0} />);
    expect(screen.queryByTestId('agri-price')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-price-per-acre')).not.toBeInTheDocument();
  });

  // FE-T5 — residential-style price display unchanged
  it('FE-T5: residential-style price 750000 renders as ₹7.50 L', () => {
    render(<AgriSpecRows price={750_000} />);
    const priceCell = screen.getByTestId('agri-price');
    expect(priceCell).toBeInTheDocument();
    expect(priceCell).toHaveTextContent('₹7.50 L');
  });
});
