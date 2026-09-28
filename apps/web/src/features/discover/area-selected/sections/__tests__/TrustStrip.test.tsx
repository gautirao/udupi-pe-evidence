import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustStrip } from '../TrustStrip';

describe('#2658 C3 — TrustStrip', () => {
  it('renders the verification reassurance copy', () => {
    render(<TrustStrip />);
    expect(screen.getByTestId('area-trust-strip')).toBeInTheDocument();
    expect(screen.getByText('Every listing is verified.')).toBeInTheDocument();
    expect(screen.getByText(/Documents checked, RERA registered, broker confirmed/)).toBeInTheDocument();
  });
});
