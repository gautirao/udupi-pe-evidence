import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AreaSizeRow } from '../AreaSizeRow';

const presets = [
  { testId: 'quick-chip-area-any', label: 'Any size', min: undefined },
  { testId: 'quick-chip-area-1000', label: '1,000+ sq ft', min: 1000 },
];

describe('#2658 C3 — AreaSizeRow', () => {
  it('renders the passed label and presses "Any size" when activeAreaMin is null/undefined', () => {
    render(
      <AreaSizeRow label="AREA (SQ FT)" disclosure={null} presets={presets} activeAreaMin={null} onSelectArea={vi.fn()} />,
    );
    expect(screen.getByText('AREA (SQ FT)')).toBeInTheDocument();
    expect(screen.getByTestId('quick-chip-area-any')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-area-1000')).toHaveAttribute('aria-pressed', 'false');
  });

  it('presses the matching preset when activeAreaMin equals its min', () => {
    render(
      <AreaSizeRow label="AREA (SQ FT)" disclosure={null} presets={presets} activeAreaMin={1000} onSelectArea={vi.fn()} />,
    );
    expect(screen.getByTestId('quick-chip-area-1000')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-area-any')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSelectArea with the preset min, including undefined for "Any size"', () => {
    const onSelectArea = vi.fn();
    render(
      <AreaSizeRow label="AREA (SQ FT)" disclosure={null} presets={presets} activeAreaMin={1000} onSelectArea={onSelectArea} />,
    );
    fireEvent.click(screen.getByTestId('quick-chip-area-any'));
    expect(onSelectArea).toHaveBeenCalledWith(undefined);
  });

  it('renders the disclosure paragraph only when non-null (#2459 D1)', () => {
    const { rerender } = render(
      <AreaSizeRow label="AREA (SQ FT)" disclosure={null} presets={presets} activeAreaMin={null} onSelectArea={vi.fn()} />,
    );
    expect(screen.queryByTestId('quick-area-disclosure')).not.toBeInTheDocument();

    rerender(
      <AreaSizeRow
        label="PLOT SIZE (SQ FT)"
        disclosure="Comparing plot size only"
        presets={presets}
        activeAreaMin={null}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quick-area-disclosure')).toHaveTextContent('Comparing plot size only');
  });
});
