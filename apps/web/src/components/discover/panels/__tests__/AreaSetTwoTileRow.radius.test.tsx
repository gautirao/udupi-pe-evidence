import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({ data: { areas: [] } }),
}));

import { AreaSetTwoTileRow } from '../AreaSetSelectedExtras';

/**
 * Issue #2604 — the inner icon chips inside the Schools and "Add nearby
 * areas" recommendation tiles must use `rounded-md` (8px, per this project's
 * `--radius: 0.625rem` override), not the default `rounded-lg` (10px). The
 * outer tile buttons already got this fix under #2596; only the two inner
 * icon chips regressed to `rounded-lg`.
 */
describe('AreaSetTwoTileRow — icon chip radius parity (#2604)', () => {
  it('renders the Schools tile icon chip with rounded-md, not rounded-lg', () => {
    render(
      <AreaSetTwoTileRow
        primaryAreaName="Sanjeevini Nagar"
        primaryAreaKey="sanjeevini-nagar"
        city="bangalore"
        fallbackSchoolCount={3}
        onAddSchool={vi.fn()}
        onAddNearbyAreas={vi.fn()}
      />,
    );

    const iconChip = screen.getByTestId('area-set-schools-tile').querySelector('span');
    expect(iconChip).toHaveClass('rounded-md');
    expect(iconChip).not.toHaveClass('rounded-lg');
  });

  it('renders the Add nearby areas tile icon chip with rounded-md, not rounded-lg', () => {
    render(
      <AreaSetTwoTileRow
        primaryAreaName="Sanjeevini Nagar"
        primaryAreaKey="sanjeevini-nagar"
        city="bangalore"
        fallbackSchoolCount={3}
        onAddSchool={vi.fn()}
        onAddNearbyAreas={vi.fn()}
      />,
    );

    const iconChip = screen.getByTestId('area-set-add-nearby-tile').querySelector('span');
    expect(iconChip).toHaveClass('rounded-md');
    expect(iconChip).not.toHaveClass('rounded-lg');
  });
});
