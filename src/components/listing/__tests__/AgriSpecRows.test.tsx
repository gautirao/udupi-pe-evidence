/**
 * Tests for AgriSpecRows (Issue #1458 + #1459 — structured agri fields)
 *
 * Covers:
 * - landCategory: enum→human label; null→row omitted
 * - waterSource: enum→label (NOT_AVAILABLE→"Not available", WELL→"Open well",
 *                RIVER→"River", RAIN_FED→"Rain-fed"); null→omitted; fallback to raw
 * - farmhouseAvailable: true→"Yes", false→"No", null→omitted
 * - fencingDone: true→"Yes", false→"No", null→omitted
 * - soilType: RED_LATERITE→"Red laterite"; unknown→raw fallback; null→omitted
 * - roadAccess: TARRED_ROAD→"Tarred road"; KACHCHA_ROAD→"Kachcha road"; null→omitted
 * - cultivationStatus: ARECA_PLANTATION→"Areca plantation"; null→omitted
 * - ownershipType: FREEHOLD→"Freehold"; INHERITED→"Inherited"; null→omitted
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AgriSpecRows } from '../AgriSpecRows';

// ─── landCategory ─────────────────────────────────────────────────────────────

describe('AgriSpecRows — landCategory (Issue #1458)', () => {
  // Keys match the #1458 canonical land_category values stored in the database.
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

  it('falls back to raw value for a landCategory key not in the shared label map', () => {
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

// ─── agriConversionStatus (Issue #2043) ────────────────────────────────────────

describe('AgriSpecRows — agriConversionStatus (Issue #2043)', () => {
  it('renders "Not converted" for agriConversionStatus=NOT_CONVERTED', () => {
    render(<AgriSpecRows agriConversionStatus="NOT_CONVERTED" />);
    expect(screen.getByTestId('agri-conversion-status')).toHaveTextContent('Not converted');
  });

  it('renders "Conversion applied" for agriConversionStatus=CONVERSION_APPLIED', () => {
    render(<AgriSpecRows agriConversionStatus="CONVERSION_APPLIED" />);
    expect(screen.getByTestId('agri-conversion-status')).toHaveTextContent('Conversion applied');
  });

  it('renders "Approved for conversion" for agriConversionStatus=APPROVED_FOR_CONVERSION', () => {
    render(<AgriSpecRows agriConversionStatus="APPROVED_FOR_CONVERSION" />);
    expect(screen.getByTestId('agri-conversion-status')).toHaveTextContent('Approved for conversion');
  });

  it('renders "Not sure" for agriConversionStatus=NOT_SURE', () => {
    render(<AgriSpecRows agriConversionStatus="NOT_SURE" />);
    expect(screen.getByTestId('agri-conversion-status')).toHaveTextContent('Not sure');
  });

  it('falls back to raw value for an agriConversionStatus key not in the shared label map', () => {
    render(<AgriSpecRows agriConversionStatus="FUTURE_ENUM_VALUE" />);
    expect(screen.getByTestId('agri-conversion-status')).toHaveTextContent('FUTURE_ENUM_VALUE');
  });

  it('omits conversion status row when agriConversionStatus is null', () => {
    render(<AgriSpecRows agriConversionStatus={null} />);
    expect(screen.queryByTestId('agri-conversion-status')).not.toBeInTheDocument();
  });

  it('omits conversion status row when agriConversionStatus is undefined', () => {
    render(<AgriSpecRows />);
    expect(screen.queryByTestId('agri-conversion-status')).not.toBeInTheDocument();
  });
});

// ─── waterSource ──────────────────────────────────────────────────────────────

describe('AgriSpecRows — waterSource (Issue #1458)', () => {
  it('renders "Not available" for waterSource=NOT_AVAILABLE', () => {
    render(<AgriSpecRows waterSource="NOT_AVAILABLE" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Not available');
  });

  it('renders "Open well" for waterSource=WELL (Issue #1459 — label changed from "Well")', () => {
    render(<AgriSpecRows waterSource="WELL" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Open well');
  });

  it('renders "Borewell" for waterSource=BOREWELL', () => {
    render(<AgriSpecRows waterSource="BOREWELL" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Borewell');
  });

  it('renders "River" for waterSource=RIVER (Issue #1459 — now a canonical key)', () => {
    render(<AgriSpecRows waterSource="RIVER" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('River');
  });

  it('renders "Rain-fed" for waterSource=RAIN_FED (Issue #1459 — now a canonical key)', () => {
    render(<AgriSpecRows waterSource="RAIN_FED" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('Rain-fed');
  });

  it('falls back to raw value for a truly unknown waterSource key', () => {
    render(<AgriSpecRows waterSource="GLACIER_MELT" />);
    expect(screen.getByTestId('agri-water-source')).toHaveTextContent('GLACIER_MELT');
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

// ─── soilType (Issue #1459) ───────────────────────────────────────────────────

describe('AgriSpecRows — soilType (Issue #1459)', () => {
  it('renders "Red laterite" for soilType=RED_LATERITE (not "RED_LATERITE")', () => {
    render(<AgriSpecRows soilType="RED_LATERITE" />);
    expect(screen.getByTestId('agri-soil-type')).toHaveTextContent('Red laterite');
  });

  it('renders "Black cotton" for soilType=BLACK_COTTON', () => {
    render(<AgriSpecRows soilType="BLACK_COTTON" />);
    expect(screen.getByTestId('agri-soil-type')).toHaveTextContent('Black cotton');
  });

  it('renders "Alluvial" for soilType=ALLUVIAL', () => {
    render(<AgriSpecRows soilType="ALLUVIAL" />);
    expect(screen.getByTestId('agri-soil-type')).toHaveTextContent('Alluvial');
  });

  it('renders "Sandy loam" for soilType=SANDY_LOAM', () => {
    render(<AgriSpecRows soilType="SANDY_LOAM" />);
    expect(screen.getByTestId('agri-soil-type')).toHaveTextContent('Sandy loam');
  });

  it('renders "Clay" for soilType=CLAY', () => {
    render(<AgriSpecRows soilType="CLAY" />);
    expect(screen.getByTestId('agri-soil-type')).toHaveTextContent('Clay');
  });

  it('falls back to raw value for an unknown legacy soilType', () => {
    render(<AgriSpecRows soilType="Unknown legacy value" />);
    expect(screen.getByTestId('agri-soil-type')).toHaveTextContent('Unknown legacy value');
  });

  it('omits soil type row when soilType is null', () => {
    render(<AgriSpecRows soilType={null} />);
    expect(screen.queryByTestId('agri-soil-type')).not.toBeInTheDocument();
  });

  it('omits soil type row when soilType is undefined', () => {
    render(<AgriSpecRows />);
    expect(screen.queryByTestId('agri-soil-type')).not.toBeInTheDocument();
  });
});

// ─── roadAccess (Issue #1459) ─────────────────────────────────────────────────

describe('AgriSpecRows — roadAccess (Issue #1459)', () => {
  it('renders "Tarred road" for roadAccess=TARRED_ROAD', () => {
    render(<AgriSpecRows roadAccess="TARRED_ROAD" />);
    expect(screen.getByTestId('agri-road-access')).toHaveTextContent('Tarred road');
  });

  it('renders "Kachcha road" for roadAccess=KACHCHA_ROAD', () => {
    render(<AgriSpecRows roadAccess="KACHCHA_ROAD" />);
    expect(screen.getByTestId('agri-road-access')).toHaveTextContent('Kachcha road');
  });

  it('renders "Highway frontage" for roadAccess=HIGHWAY_FRONTAGE', () => {
    render(<AgriSpecRows roadAccess="HIGHWAY_FRONTAGE" />);
    expect(screen.getByTestId('agri-road-access')).toHaveTextContent('Highway frontage');
  });

  it('renders "No road access" for roadAccess=NO_ROAD_ACCESS', () => {
    render(<AgriSpecRows roadAccess="NO_ROAD_ACCESS" />);
    expect(screen.getByTestId('agri-road-access')).toHaveTextContent('No road access');
  });

  it('falls back to raw value for an unknown roadAccess key', () => {
    render(<AgriSpecRows roadAccess="Gravel road" />);
    expect(screen.getByTestId('agri-road-access')).toHaveTextContent('Gravel road');
  });

  it('omits road access row when roadAccess is null', () => {
    render(<AgriSpecRows roadAccess={null} />);
    expect(screen.queryByTestId('agri-road-access')).not.toBeInTheDocument();
  });
});

// ─── cultivationStatus (Issue #1459) ──────────────────────────────────────────

describe('AgriSpecRows — cultivationStatus (Issue #1459)', () => {
  it('renders "Areca plantation" for cultivationStatus=ARECA_PLANTATION', () => {
    render(<AgriSpecRows cultivationStatus="ARECA_PLANTATION" />);
    expect(screen.getByTestId('agri-cultivation-status')).toHaveTextContent('Areca plantation');
  });

  it('renders "Coconut plantation" for cultivationStatus=COCONUT_PLANTATION', () => {
    render(<AgriSpecRows cultivationStatus="COCONUT_PLANTATION" />);
    expect(screen.getByTestId('agri-cultivation-status')).toHaveTextContent('Coconut plantation');
  });

  it('renders "Cultivated" for cultivationStatus=CULTIVATED', () => {
    render(<AgriSpecRows cultivationStatus="CULTIVATED" />);
    expect(screen.getByTestId('agri-cultivation-status')).toHaveTextContent('Cultivated');
  });

  it('renders "Fallow" for cultivationStatus=FALLOW', () => {
    render(<AgriSpecRows cultivationStatus="FALLOW" />);
    expect(screen.getByTestId('agri-cultivation-status')).toHaveTextContent('Fallow');
  });

  it('renders "Partially cultivated" for cultivationStatus=PARTIALLY_CULTIVATED', () => {
    render(<AgriSpecRows cultivationStatus="PARTIALLY_CULTIVATED" />);
    expect(screen.getByTestId('agri-cultivation-status')).toHaveTextContent('Partially cultivated');
  });

  it('falls back to raw value for an unknown cultivationStatus key', () => {
    render(<AgriSpecRows cultivationStatus="Uncultivated" />);
    expect(screen.getByTestId('agri-cultivation-status')).toHaveTextContent('Uncultivated');
  });

  it('omits cultivation status row when cultivationStatus is null', () => {
    render(<AgriSpecRows cultivationStatus={null} />);
    expect(screen.queryByTestId('agri-cultivation-status')).not.toBeInTheDocument();
  });
});

// ─── ownershipType (Issue #1459) ──────────────────────────────────────────────

describe('AgriSpecRows — ownershipType (Issue #1459)', () => {
  it('renders "Freehold" for ownershipType=FREEHOLD', () => {
    render(<AgriSpecRows ownershipType="FREEHOLD" />);
    expect(screen.getByTestId('agri-ownership-type')).toHaveTextContent('Freehold');
  });

  it('renders "Inherited" for ownershipType=INHERITED', () => {
    render(<AgriSpecRows ownershipType="INHERITED" />);
    expect(screen.getByTestId('agri-ownership-type')).toHaveTextContent('Inherited');
  });

  it('renders "Patta" for ownershipType=PATTA', () => {
    render(<AgriSpecRows ownershipType="PATTA" />);
    expect(screen.getByTestId('agri-ownership-type')).toHaveTextContent('Patta');
  });

  it('renders "Survey settlement" for ownershipType=SURVEY_SETTLEMENT', () => {
    render(<AgriSpecRows ownershipType="SURVEY_SETTLEMENT" />);
    expect(screen.getByTestId('agri-ownership-type')).toHaveTextContent('Survey settlement');
  });

  it('falls back to raw value for an unknown ownershipType key', () => {
    render(<AgriSpecRows ownershipType="Co-operative" />);
    expect(screen.getByTestId('agri-ownership-type')).toHaveTextContent('Co-operative');
  });

  it('omits ownership type row when ownershipType is null', () => {
    render(<AgriSpecRows ownershipType={null} />);
    expect(screen.queryByTestId('agri-ownership-type')).not.toBeInTheDocument();
  });

  it('omits ownership type row when ownershipType is undefined', () => {
    render(<AgriSpecRows />);
    expect(screen.queryByTestId('agri-ownership-type')).not.toBeInTheDocument();
  });
});
