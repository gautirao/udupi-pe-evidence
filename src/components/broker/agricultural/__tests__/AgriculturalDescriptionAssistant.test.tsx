/**
 * Tests for AgriculturalDescriptionAssistant.tsx — issue #2044 AC11/AC12.
 *
 * Regenerate REPLACES the description wholesale (never appends), so
 * regeneration itself cannot accumulate stale facts. The gap this component
 * guards against: removing a crop and NOT regenerating leaves the removed
 * crop in the existing text. These tests verify the stale-description hint
 * introduced for that gap.
 */
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgriculturalDescriptionAssistant } from '../AgriculturalDescriptionAssistant';
import type { AgriculturalDescriptionFacts } from '@/lib/agriculturalDescriptionBuilder';

const BASE_FACTS: AgriculturalDescriptionFacts = {
  locality: 'Manipal',
  landArea: 2,
  landAreaUnit: 'acre',
  facing: '',
  waterSource: '',
  soilType: '',
  roadAccess: '',
  cultivationStatus: '',
  landCategory: '',
  farmhouseAvailable: '',
  fencingDone: '',
  crops: ['COCONUT', 'PEPPER'],
  features: [],
  priceRupees: 1_000_000,
};

function Harness({ facts }: { facts: AgriculturalDescriptionFacts }) {
  const [value, setValue] = useState('');
  return <AgriculturalDescriptionAssistant facts={facts} value={value} onChange={setValue} />;
}

describe('AgriculturalDescriptionAssistant — stale-description hint (AC11/AC12)', () => {
  it('shows no stale hint immediately after generating', async () => {
    const user = userEvent.setup();
    render(<Harness facts={BASE_FACTS} />);

    await user.click(screen.getByRole('button', { name: /^draft description$/i }));
    await waitFor(() => expect(screen.getByTestId('agri-description-assistant-ready')).toBeInTheDocument());

    expect(screen.queryByTestId('agri-description-stale-warning')).not.toBeInTheDocument();
  });

  it('shows the stale hint once a crop is removed from facts without regenerating', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness facts={BASE_FACTS} />);

    await user.click(screen.getByRole('button', { name: /^draft description$/i }));
    await waitFor(() => expect(screen.getByTestId('agri-description-assistant-ready')).toBeInTheDocument());
    expect(screen.queryByTestId('agri-description-stale-warning')).not.toBeInTheDocument();

    // Broker removes 'Pepper' from the crop chips — facts change, but the
    // assistant is NOT told to regenerate.
    rerender(<Harness facts={{ ...BASE_FACTS, crops: ['COCONUT'] }} />);

    expect(screen.getByTestId('agri-description-stale-warning')).toBeInTheDocument();
  });

  it('clears the stale hint after Regenerate is clicked', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness facts={BASE_FACTS} />);

    await user.click(screen.getByRole('button', { name: /^draft description$/i }));
    await waitFor(() => expect(screen.getByTestId('agri-description-assistant-ready')).toBeInTheDocument());

    rerender(<Harness facts={{ ...BASE_FACTS, crops: ['COCONUT'] }} />);
    expect(screen.getByTestId('agri-description-stale-warning')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^regenerate$/i }));
    await waitFor(() => expect(screen.queryByTestId('agri-description-stale-warning')).not.toBeInTheDocument());
  });

  it('never shows a stale hint before anything has been generated (idle state)', () => {
    render(<Harness facts={BASE_FACTS} />);
    expect(screen.getByTestId('agri-description-assistant-idle')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-description-stale-warning')).not.toBeInTheDocument();
  });
});
