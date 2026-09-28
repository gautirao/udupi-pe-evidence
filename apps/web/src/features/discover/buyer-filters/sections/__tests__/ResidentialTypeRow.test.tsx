import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResidentialTypeRow } from '../ResidentialTypeRow';

const types = [
  { value: 'apartment', label: 'Apartments' },
  { value: 'villa', label: 'Villas' },
  { value: 'residential_plot', label: 'Plots' },
];

describe('#2658 C3 — ResidentialTypeRow', () => {
  it('renders All + every type chip, pressing All when allTypesActive', () => {
    render(
      <ResidentialTypeRow
        types={types}
        activeTypes={new Set()}
        allTypesActive
        onSelectAllTypes={vi.fn()}
        onToggleType={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quick-chip-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-apartment')).toHaveTextContent('Apartments');
    expect(screen.getByTestId('quick-chip-residential_plot')).toHaveTextContent('Plots');
  });

  it('calls onToggleType with the clicked type value, and reflects active state', () => {
    const onToggleType = vi.fn();
    render(
      <ResidentialTypeRow
        types={types}
        activeTypes={new Set(['villa'])}
        allTypesActive={false}
        onSelectAllTypes={vi.fn()}
        onToggleType={onToggleType}
      />,
    );
    expect(screen.getByTestId('quick-chip-villa')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-apartment')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('quick-chip-apartment'));
    expect(onToggleType).toHaveBeenCalledWith('apartment');
  });

  it('calls onSelectAllTypes when the All chip is clicked', () => {
    const onSelectAllTypes = vi.fn();
    render(
      <ResidentialTypeRow
        types={types}
        activeTypes={new Set(['villa'])}
        allTypesActive={false}
        onSelectAllTypes={onSelectAllTypes}
        onToggleType={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('quick-chip-all'));
    expect(onSelectAllTypes).toHaveBeenCalledTimes(1);
  });

  it('renders no possession chip when the prop is omitted (Commercial capability on — FamilyRow owns it)', () => {
    render(
      <ResidentialTypeRow
        types={types}
        activeTypes={new Set()}
        allTypesActive
        onSelectAllTypes={vi.fn()}
        onToggleType={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('quick-chip-ready-to-move')).not.toBeInTheDocument();
  });

  it('renders the possession chip trailing the type chips when supplied (Commercial capability off)', () => {
    const onToggle = vi.fn();
    render(
      <ResidentialTypeRow
        types={types}
        activeTypes={new Set()}
        allTypesActive
        onSelectAllTypes={vi.fn()}
        onToggleType={vi.fn()}
        possession={{ label: 'Ready to move', isSupported: true, isActive: false, onToggle }}
      />,
    );
    fireEvent.click(screen.getByTestId('quick-chip-ready-to-move'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
