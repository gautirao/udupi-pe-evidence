import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FamilyRow } from '../FamilyRow';

const possession = { label: 'Ready to move', isSupported: true, isActive: false, onToggle: vi.fn() };

describe('#2658 C3 — FamilyRow', () => {
  it('presses the active family chip and calls onSelectFamily with the other on click', () => {
    const onSelectFamily = vi.fn();
    render(<FamilyRow activeFamily="residential" onSelectFamily={onSelectFamily} possession={possession} />);

    expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
    expect(onSelectFamily).toHaveBeenCalledWith('commercial');
  });

  it('renders the possession chip inline as the trailing element', () => {
    render(<FamilyRow activeFamily="commercial" onSelectFamily={vi.fn()} possession={possession} />);
    expect(screen.getByTestId('quick-family-row')).toContainElement(
      screen.getByTestId('quick-chip-ready-to-move'),
    );
  });

  it('has no second "Broker identity verified" chip (deliberate mock departure, not a gap)', () => {
    render(<FamilyRow activeFamily="residential" onSelectFamily={vi.fn()} possession={possession} />);
    expect(screen.queryByText(/broker identity/i)).not.toBeInTheDocument();
  });
});
