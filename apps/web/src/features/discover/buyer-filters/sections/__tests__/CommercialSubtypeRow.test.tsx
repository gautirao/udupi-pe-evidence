import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommercialSubtypeRow } from '../CommercialSubtypeRow';

const choices = [
  { testId: 'quick-chip-subtype-all', label: 'All commercial', value: null },
  { testId: 'quick-chip-subtype-shop', label: 'Shop / Showroom', value: 'commercial' },
  { testId: 'quick-chip-subtype-warehouse', label: 'Warehouse / Godown', value: 'warehouse' },
];

describe('#2658 C3 — CommercialSubtypeRow', () => {
  it('presses "All commercial" when no subtype narrows the family (empty set, not a sixth subtype)', () => {
    render(<CommercialSubtypeRow choices={choices} activeSubtypes={new Set()} onToggleSubtype={vi.fn()} />);
    expect(screen.getByTestId('quick-chip-subtype-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-subtype-shop')).toHaveAttribute('aria-pressed', 'false');
  });

  it('presses the matching subtype chip and NOT "All commercial" when a subtype is active', () => {
    render(
      <CommercialSubtypeRow
        choices={choices}
        activeSubtypes={new Set(['warehouse'])}
        onToggleSubtype={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quick-chip-subtype-warehouse')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-subtype-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onToggleSubtype with the choice value, including null for "All commercial"', () => {
    const onToggleSubtype = vi.fn();
    render(
      <CommercialSubtypeRow
        choices={choices}
        activeSubtypes={new Set(['warehouse'])}
        onToggleSubtype={onToggleSubtype}
      />,
    );
    fireEvent.click(screen.getByTestId('quick-chip-subtype-all'));
    expect(onToggleSubtype).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByTestId('quick-chip-subtype-shop'));
    expect(onToggleSubtype).toHaveBeenCalledWith('commercial');
  });
});
