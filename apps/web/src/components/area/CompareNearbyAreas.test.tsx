/**
 * CompareNearbyAreas — canonical slug link tests (#1670)
 *
 * Covers:
 *   RE1 — chip href matches /trends/{citySlug}/areas/{slug} for each area
 *   RE2 — no raw pipe '|' and no percent-encoded '%7C' in generated URLs
 *   EC3 — component-level rendering assertions
 *
 * Pattern follows ListingDetailSidebar.test.tsx (T7–T18): MemoryRouter wrap,
 * render assertion on href, no-pipe / no-%7C assertion.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompareNearbyAreas } from './CompareNearbyAreas';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderComp(props: {
  citySlug: string;
  nearbyAreas: { areaKey: string; areaLabel: string }[];
  currentAreaKey: string;
}) {
  return render(
    <MemoryRouter>
      <CompareNearbyAreas {...props} />
    </MemoryRouter>,
  );
}

// ── RE1 / RE2: canonical slug link generation ─────────────────────────────────

describe('CompareNearbyAreas — canonical slug links (RE1, RE2)', () => {
  it('chip href is /trends/udupi/areas/malpe for areaKey IN|KA|Udupi|Malpe (RE1)', () => {
    // Single-word locality: "Malpe" → "malpe"
    renderComp({
      citySlug: 'udupi',
      nearbyAreas: [{ areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' }],
      currentAreaKey: 'IN|KA|Udupi|Karkala',
    });

    // The Link renders as <a role="listitem">; query by listitem role
    const chip = screen.getByRole('listitem');
    expect(chip.tagName).toBe('A');
    expect(chip).toHaveAttribute('href', '/trends/udupi/areas/malpe');
  });

  it('chip href contains no raw pipe character (RE2)', () => {
    renderComp({
      citySlug: 'udupi',
      nearbyAreas: [{ areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' }],
      currentAreaKey: 'IN|KA|Udupi|Karkala',
    });

    const chip = screen.getByRole('listitem');
    expect(chip.getAttribute('href')).not.toContain('|');
  });

  it('chip href contains no percent-encoded pipe %7C (RE2)', () => {
    renderComp({
      citySlug: 'udupi',
      nearbyAreas: [{ areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' }],
      currentAreaKey: 'IN|KA|Udupi|Karkala',
    });

    const chip = screen.getByRole('listitem');
    expect(chip.getAttribute('href')).not.toMatch(/%7C/i);
  });

  it('multi-word locality "Udupi Town" → slug is hyphenated (udupi-town) (RE1)', () => {
    // "IN|KA|Udupi|Udupi Town" → last segment "Udupi Town" → slugify → "udupi-town"
    renderComp({
      citySlug: 'udupi',
      nearbyAreas: [{ areaKey: 'IN|KA|Udupi|Udupi Town', areaLabel: 'Udupi Town' }],
      currentAreaKey: 'IN|KA|Udupi|Malpe',
    });

    const chip = screen.getByRole('listitem');
    expect(chip).toHaveAttribute('href', '/trends/udupi/areas/udupi-town');
    expect(chip.getAttribute('href')).not.toContain('|');
    expect(chip.getAttribute('href')).not.toMatch(/%7C/i);
  });

  it('renders one chip per non-current area in nearbyAreas (EC3)', () => {
    // Three areas provided; currentAreaKey matches one → two chips rendered
    renderComp({
      citySlug: 'udupi',
      nearbyAreas: [
        { areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' },
        { areaKey: 'IN|KA|Udupi|Karkala', areaLabel: 'Karkala' },
        { areaKey: 'IN|KA|Udupi|Udupi Town', areaLabel: 'Udupi Town' },
      ],
      currentAreaKey: 'IN|KA|Udupi|Karkala',
    });

    const chips = screen.getAllByRole('listitem');
    expect(chips).toHaveLength(2);

    // Verify each chip href is canonical
    const hrefs = chips.map(c => c.getAttribute('href'));
    expect(hrefs).toContain('/trends/udupi/areas/malpe');
    expect(hrefs).toContain('/trends/udupi/areas/udupi-town');
    hrefs.forEach(href => {
      expect(href).not.toContain('|');
      expect(href).not.toMatch(/%7C/i);
    });
  });

  it('renders null (no section) when all nearbyAreas match currentAreaKey (EC3)', () => {
    renderComp({
      citySlug: 'udupi',
      nearbyAreas: [{ areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' }],
      currentAreaKey: 'IN|KA|Udupi|Malpe', // same as only area → filtered out
    });

    expect(screen.queryByText('Compare nearby areas')).not.toBeInTheDocument();
  });

  it('renders the section heading when chips are present (EC3)', () => {
    renderComp({
      citySlug: 'udupi',
      nearbyAreas: [{ areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe' }],
      currentAreaKey: 'IN|KA|Udupi|Karkala',
    });

    expect(screen.getByText('Compare nearby areas')).toBeInTheDocument();
  });
});
