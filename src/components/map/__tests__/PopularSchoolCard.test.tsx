import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PopularSchoolCard } from '../PopularSchoolCard';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

const baseSchool: SchoolResult = {
  id: 'school-42',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
  address: 'Manipal, Udupi',
  distanceKm: 1.4,
};

describe('PopularSchoolCard', () => {
  it('renders name, board, and address', () => {
    render(<PopularSchoolCard school={baseSchool} onSelect={vi.fn()} />);
    expect(screen.getByText('Manipal Public School')).toBeInTheDocument();
    // Board and address are rendered together with "·"
    expect(screen.getByText(/CBSE/)).toBeInTheDocument();
    expect(screen.getByText(/Manipal, Udupi/)).toBeInTheDocument();
  });

  it('falls back to legacy boardType when board is null', () => {
    const legacy: SchoolResult = { ...baseSchool, board: null, boardType: 'ICSE' };
    render(<PopularSchoolCard school={legacy} onSelect={vi.fn()} />);
    expect(screen.getByText(/ICSE/)).toBeInTheDocument();
  });

  it('shows distance when finite', () => {
    render(<PopularSchoolCard school={baseSchool} onSelect={vi.fn()} />);
    expect(screen.getByText(/1\.4 km away/)).toBeInTheDocument();
  });

  it('hides distance when not finite', () => {
    // Cast through unknown to simulate the runtime case where backend returns null for distanceKm.
    const noDistance = {
      ...baseSchool,
      distanceKm: undefined as unknown as number,
    };
    render(<PopularSchoolCard school={noDistance} onSelect={vi.fn()} />);
    expect(screen.queryByText(/km away/)).not.toBeInTheDocument();
  });

  it('does NOT render a nearbyListingCount badge (constraint #968)', () => {
    render(<PopularSchoolCard school={baseSchool} onSelect={vi.fn()} />);
    // Nothing matching "listings" or "properties" should appear on the card.
    expect(screen.queryByText(/listing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/propert/i)).not.toBeInTheDocument();
  });

  it('calls onSelect with the school when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PopularSchoolCard school={baseSchool} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /select manipal public school/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(baseSchool);
  });

  it('reflects selected state via aria-pressed', () => {
    render(
      <PopularSchoolCard school={baseSchool} isSelected onSelect={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: /select manipal public school/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
