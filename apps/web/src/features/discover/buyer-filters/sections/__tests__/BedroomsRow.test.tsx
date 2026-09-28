import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BedroomsRow } from '../BedroomsRow';

describe('#2658 C3 — BedroomsRow', () => {
  it('renders each bedroom option with correct pressed state and label', () => {
    render(
      <BedroomsRow bedroomOptions={[2, 3]} activeBedrooms={new Set([3])} onToggleBedroom={vi.fn()} />,
    );
    expect(screen.getByTestId('quick-chip-2-bhk')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('quick-chip-3-bhk')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-2-bhk')).toHaveTextContent('2 BHK');
  });

  it('calls onToggleBedroom with the clicked bedroom count', () => {
    const onToggleBedroom = vi.fn();
    render(
      <BedroomsRow bedroomOptions={[2, 3]} activeBedrooms={new Set()} onToggleBedroom={onToggleBedroom} />,
    );
    fireEvent.click(screen.getByTestId('quick-chip-2-bhk'));
    expect(onToggleBedroom).toHaveBeenCalledWith(2);
  });
});
