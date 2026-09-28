import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PossessionChip } from '../PossessionChip';

describe('#2658 C3 — PossessionChip', () => {
  it('renders the label and calls onToggle when supported and clicked', () => {
    const onToggle = vi.fn();
    render(<PossessionChip label="Ready to move" isSupported isActive={false} onToggle={onToggle} />);
    const chip = screen.getByTestId('quick-chip-ready-to-move');
    expect(chip).toHaveTextContent('Ready to move');
    expect(chip).not.toBeDisabled();
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects the active state via aria-pressed', () => {
    render(<PossessionChip label="Ready to move" isSupported isActive onToggle={vi.fn()} />);
    expect(screen.getByTestId('quick-chip-ready-to-move')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders disabled with an explanatory title, and never active, when unsupported — even if isActive is true', () => {
    const onToggle = vi.fn();
    render(<PossessionChip label="Ready to move" isSupported={false} isActive onToggle={onToggle} />);
    const chip = screen.getByTestId('quick-chip-ready-to-move');
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveAttribute(
      'title',
      "Ready-to-move filtering isn't available in this view yet — try Browse all listings",
    );
    fireEvent.click(chip);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
