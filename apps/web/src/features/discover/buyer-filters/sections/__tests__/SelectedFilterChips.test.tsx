import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectedFilterChips } from '../SelectedFilterChips';

describe('#2658 C3 — SelectedFilterChips', () => {
  it('renders nothing when chips is empty (no empty bordered strip)', () => {
    const { container } = render(<SelectedFilterChips chips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one pill per chip with its label, and calls onRemove when its dismiss button is clicked', () => {
    const onRemove = vi.fn();
    render(
      <SelectedFilterChips
        chips={[{ key: 'a', label: 'Apartments', testId: 'selected-chip-type-apartment', onRemove }]}
      />,
    );
    expect(screen.getByTestId('selected-chip-type-apartment')).toHaveTextContent('Apartments');
    fireEvent.click(screen.getByTestId('selected-chip-type-apartment-dismiss'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('gives each dismiss button an accessible name naming its own chip', () => {
    render(
      <SelectedFilterChips
        chips={[
          { key: 'a', label: 'Apartments', testId: 'selected-chip-type-apartment', onRemove: vi.fn() },
          { key: 'b', label: '3 BHK', testId: 'selected-chip-bedrooms-3', onRemove: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove Apartments filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove 3 BHK filter' })).toBeInTheDocument();
  });
});
