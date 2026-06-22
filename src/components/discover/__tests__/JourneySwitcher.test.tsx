import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { JourneySwitcher } from '../JourneySwitcher';

describe('JourneySwitcher', () => {
  it('renders all three journey cards', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-agri-first')).toBeInTheDocument();
  });

  it('renders correct copy for area-first card', () => {
    render(
      <JourneySwitcher
        onSelectJourney={vi.fn()}
        cityLabel="Udupi"
        totalProperties={30}
        areasCount={10}
      />,
    );
    expect(screen.getByText('Explore by area')).toBeInTheDocument();
    expect(
      screen.getByText(/Start with the neighbourhood\. Explore Udupi localities/),
    ).toBeInTheDocument();
    // Recommended badge + count chips driven by props.
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('10 areas')).toBeInTheDocument();
    expect(screen.getByText('30 properties')).toBeInTheDocument();
    expect(screen.getByText('Explore areas')).toBeInTheDocument();
  });

  it('area-first copy is city-dynamic (uses cityLabel, not hardcoded Udupi)', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} cityLabel="Bangalore" />);
    expect(
      screen.getByText(/Explore Bangalore localities/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Explore Udupi localities/)).not.toBeInTheDocument();
  });

  it('renders correct copy for school-first card', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByText('Search near a school')).toBeInTheDocument();
    expect(
      screen.getByText(/Pick a school as your anchor and see only the homes/),
    ).toBeInTheDocument();
    expect(screen.getByText('Find homes near schools')).toBeInTheDocument();
  });

  it('clicking area-first card calls onSelectJourney with "area-first"', async () => {
    const user = userEvent.setup();
    const onSelectJourney = vi.fn();
    render(<JourneySwitcher onSelectJourney={onSelectJourney} />);
    await user.click(screen.getByTestId('journey-card-area-first'));
    expect(onSelectJourney).toHaveBeenCalledTimes(1);
    expect(onSelectJourney).toHaveBeenCalledWith('area-first');
  });

  it('clicking school-first card calls onSelectJourney with "school-first"', async () => {
    const user = userEvent.setup();
    const onSelectJourney = vi.fn();
    render(<JourneySwitcher onSelectJourney={onSelectJourney} />);
    await user.click(screen.getByTestId('journey-card-school-first'));
    expect(onSelectJourney).toHaveBeenCalledTimes(1);
    expect(onSelectJourney).toHaveBeenCalledWith('school-first');
  });

  it('renders correct copy for agri-first card', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByText('Find agricultural land')).toBeInTheDocument();
    expect(
      screen.getByText(/Looking for farmland instead\? Search parcels by corridor/),
    ).toBeInTheDocument();
    expect(screen.getByText('Search farmland')).toBeInTheDocument();
  });

  it('agri-first card uses farmland-specific terminology (regression guard)', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    // ReTrends mock title + farmland CTA — never residential "homes" wording here.
    expect(screen.getByText('Find agricultural land')).toBeInTheDocument();
    expect(screen.getByText('Farmland only')).toBeInTheDocument();
  });

  it('agri-first card subtitle is the corridor-first copy', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(
      screen.getByText(/Search parcels by corridor, direction and distance from town/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Explore farmland and agricultural plots by area'),
    ).not.toBeInTheDocument();
  });

  it('clicking agri-first card calls onSelectJourney with "agri-first"', async () => {
    const user = userEvent.setup();
    const onSelectJourney = vi.fn();
    render(<JourneySwitcher onSelectJourney={onSelectJourney} />);
    await user.click(screen.getByTestId('journey-card-agri-first'));
    expect(onSelectJourney).toHaveBeenCalledTimes(1);
    expect(onSelectJourney).toHaveBeenCalledWith('agri-first');
  });

  it('agri-first card has accessible role and label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('button', { name: /find agricultural land/i });
    expect(card).toBeInTheDocument();
  });

  it('area-first card has accessible role and label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('button', { name: /explore properties by area/i });
    expect(card).toBeInTheDocument();
  });

  it('school-first card has accessible role and label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('button', { name: /search near a school/i });
    expect(card).toBeInTheDocument();
  });
});
