/**
 * Unit tests for SchoolJourneyHero (visual-parity polish, cycle 2) — the
 * school-first-local navy hero used for zone-selected / area-selected /
 * school-selected states.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { GraduationCap } from 'lucide-react';
import { SchoolJourneyHero } from '../SchoolJourneyHero';

describe('SchoolJourneyHero', () => {
  it('renders breadcrumb, eyebrow, title, description and stats', () => {
    render(
      <SchoolJourneyHero
        dataTestId="test-hero"
        breadcrumb={[
          { key: 'city', label: 'Discover Bangalore' },
          { key: 'zone', label: 'University Belt', current: true },
        ]}
        icon={GraduationCap}
        eyebrowLabel="School zone"
        title="University Belt"
        description="Explore schools and homes in this zone."
        stats={[
          { key: 'schools', value: 12, label: 'schools' },
          { key: 'homes', value: 34, label: 'homes for sale' },
        ]}
      />,
    );
    expect(screen.getByText('Discover Bangalore')).toBeInTheDocument();
    expect(screen.getByText('University Belt', { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText('School zone')).toBeInTheDocument();
    expect(screen.getByTestId('test-hero-title')).toHaveTextContent('University Belt');
    expect(screen.getByText('Explore schools and homes in this zone.')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('schools')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('homes for sale')).toBeInTheDocument();
  });

  it('does not render a change-action button when onChangeAction is absent', () => {
    render(
      <SchoolJourneyHero
        breadcrumb={[]}
        icon={GraduationCap}
        eyebrowLabel="School zone"
        title="Zone"
        stats={[]}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders and fires the change-action button when provided (school-selected state)', async () => {
    const user = userEvent.setup();
    const onChangeAction = vi.fn();
    render(
      <SchoolJourneyHero
        breadcrumb={[{ key: 'school', label: 'Delhi Public School', current: true }]}
        icon={GraduationCap}
        eyebrowLabel="Selected school"
        title="Delhi Public School"
        stats={[{ key: 'homes', value: 8, label: 'homes for sale' }]}
        onChangeAction={onChangeAction}
        changeActionLabel="Change school"
        changeActionTestId="hero-change-school-btn"
      />,
    );
    const btn = screen.getByTestId('hero-change-school-btn');
    expect(btn).toHaveTextContent('Change school');
    await user.click(btn);
    expect(onChangeAction).toHaveBeenCalledTimes(1);
  });
});
