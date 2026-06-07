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
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByText('Explore properties by area')).toBeInTheDocument();
    expect(screen.getByText('Browse neighborhoods with detailed information')).toBeInTheDocument();
  });

  it('renders correct copy for school-first card', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    expect(screen.getByText('Search by school area')).toBeInTheDocument();
    expect(screen.getByText('Find homes near your preferred schools')).toBeInTheDocument();
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
    expect(screen.getByText('Search Agricultural Land')).toBeInTheDocument();
    expect(
      screen.getByText('Explore farmland and agricultural plots by area'),
    ).toBeInTheDocument();
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
    const card = screen.getByRole('button', { name: /search agricultural land/i });
    expect(card).toBeInTheDocument();
  });

  it('area-first card has accessible role and label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('button', { name: /explore properties by area/i });
    expect(card).toBeInTheDocument();
  });

  it('school-first card has accessible role and label', () => {
    render(<JourneySwitcher onSelectJourney={vi.fn()} />);
    const card = screen.getByRole('button', { name: /search by school area/i });
    expect(card).toBeInTheDocument();
  });
});
