/**
 * AreaField — agricultural_land property type tests
 *
 * Verifies:
 * - AC1: Acre-based quick-pick chips render for agricultural_land
 * - AC2: Default unit is 'acre'
 * - AC3: UNIT_OPTIONS includes acre, cent, gunta, sqft, sqm
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// shadcn Select doesn't work in jsdom without mocking — use a pass-through mock
// that renders a <select> + options so we can assert on option presence.
const mockSelectValue = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="select-wrapper">
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        data-testid="area-unit-select"
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => {
    mockSelectValue(placeholder);
    return null;
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

// Import AFTER mocks
import { AreaField } from '../AreaField';

// ─── Tests ───────────────────────────────────────────────────────────────────

const noop = () => {};

describe('AreaField — agricultural_land (AC1: acre chips)', () => {
  it('renders acre-based quick-pick chips', () => {
    render(
      <AreaField propertyType="agricultural_land" onChange={noop} />,
    );

    expect(screen.getByRole('radio', { name: '1 acre' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2 acres' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '5 acres' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10 acres' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '25 acres' })).toBeInTheDocument();
  });
});

describe('AreaField — agricultural_land (AC2: default unit is acre)', () => {
  it('defaults to acre unit', () => {
    render(
      <AreaField propertyType="agricultural_land" onChange={noop} />,
    );

    const select = screen.getByTestId('area-unit-select') as HTMLSelectElement;
    expect(select.value).toBe('acre');
  });
});

describe('AreaField — agricultural_land (AC3: unit options)', () => {
  it('includes acre, cent, gunta, sqft, sqm options', () => {
    render(
      <AreaField propertyType="agricultural_land" onChange={noop} />,
    );

    const options = Array.from(
      screen.getByTestId('area-unit-select').querySelectorAll('option'),
    ).map((o) => o.value);

    expect(options).toContain('acre');
    expect(options).toContain('cent');
    expect(options).toContain('gunta');
    expect(options).toContain('sqft');
    expect(options).toContain('sqm');
  });

  it('chip click updates unit to acre and fires onChange with acre', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AreaField propertyType="agricultural_land" onChange={onChange} />,
    );

    const chip = screen.getByRole('radio', { name: '5 acres' });
    await user.click(chip);

    expect(onChange).toHaveBeenCalledWith(5, 'acre');
    expect(chip).toHaveAttribute('aria-checked', 'true');
  });
});
