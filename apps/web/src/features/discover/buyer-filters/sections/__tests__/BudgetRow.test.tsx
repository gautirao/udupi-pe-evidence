import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BudgetRow } from '../BudgetRow';

const bands = [
  { max: 5000000, label: 'Under 50L' },
  { max: 10000000, label: 'Under 1Cr' },
];

describe('#2658 C3 — BudgetRow', () => {
  it('renders the passed label and presses "Any price" when activePriceMax is undefined', () => {
    render(<BudgetRow label="Budget" bands={bands} activePriceMax={undefined} onSelectBudget={vi.fn()} />);
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByTestId('quick-chip-budget-any')).toHaveAttribute('aria-pressed', 'true');
  });

  it('presses the matching band and calls onSelectBudget with its max', () => {
    const onSelectBudget = vi.fn();
    render(
      <BudgetRow label="Monthly rent" bands={bands} activePriceMax={5000000} onSelectBudget={onSelectBudget} />,
    );
    expect(screen.getByTestId('quick-chip-budget-5000000')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-budget-any')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('quick-chip-budget-10000000'));
    expect(onSelectBudget).toHaveBeenCalledWith(10000000);
  });

  it('calls onSelectBudget with undefined when "Any price" is clicked', () => {
    const onSelectBudget = vi.fn();
    render(
      <BudgetRow label="Budget" bands={bands} activePriceMax={5000000} onSelectBudget={onSelectBudget} />,
    );
    fireEvent.click(screen.getByTestId('quick-chip-budget-any'));
    expect(onSelectBudget).toHaveBeenCalledWith(undefined);
  });
});
