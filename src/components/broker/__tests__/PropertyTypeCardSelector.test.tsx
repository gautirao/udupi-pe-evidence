import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyTypeCardSelector } from '../PropertyTypeCardSelector';
import { PROPERTY_TYPES } from '@/lib/listing-constants';

describe('PropertyTypeCardSelector', () => {
  it('renders every property type as a selectable card (role=radio), not a dropdown', () => {
    render(<PropertyTypeCardSelector value="" onChange={vi.fn()} />);

    // No native <select> — these are cards
    expect(document.querySelector('select')).toBeNull();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(PROPERTY_TYPES.length);

    // Each option label is rendered
    for (const pt of PROPERTY_TYPES) {
      expect(screen.getByRole('radio', { name: pt.label })).toBeInTheDocument();
    }
  });

  it('calls onChange with the unchanged payload value when a card is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PropertyTypeCardSelector value="" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Agricultural Land' }));
    expect(onChange).toHaveBeenCalledWith('agricultural_land');

    await user.click(screen.getByRole('radio', { name: 'Commercial Building' }));
    expect(onChange).toHaveBeenCalledWith('commercial_building');
  });

  it('marks only the selected card as checked', () => {
    render(<PropertyTypeCardSelector value="apartment" onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Apartment' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'House' })).toHaveAttribute('aria-checked', 'false');
  });

  // M38-13A (#1626) — UT-l: the residentialOnly variant must not change default behavior.
  describe('residentialOnly variant (M38-13A #1626)', () => {
    it('defaults to false — omitting the prop renders all 10 types exactly as before', () => {
      render(<PropertyTypeCardSelector value="" onChange={vi.fn()} />);
      expect(screen.getAllByRole('radio')).toHaveLength(PROPERTY_TYPES.length);
    });

    it('when true, renders ONLY the 4 residential subtypes', () => {
      render(<PropertyTypeCardSelector value="" onChange={vi.fn()} residentialOnly />);

      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(4);
      expect(screen.getByRole('radio', { name: 'Apartment' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'House' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Villa' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Residential Plot' })).toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: 'Commercial Shop/Office' })).not.toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: 'Agricultural Land' })).not.toBeInTheDocument();
    });
  });
});
