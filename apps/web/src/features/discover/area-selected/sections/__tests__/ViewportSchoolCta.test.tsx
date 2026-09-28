import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewportSchoolCta } from '../ViewportSchoolCta';

describe('#2658 C3 — ViewportSchoolCta', () => {
  it('renders the CTA copy and calls onAddSchool when clicked', () => {
    const onAddSchool = vi.fn();
    render(<ViewportSchoolCta onAddSchool={onAddSchool} />);
    expect(screen.getByText('Add a school in this area')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-school-cta'));
    expect(onAddSchool).toHaveBeenCalledTimes(1);
  });
});
