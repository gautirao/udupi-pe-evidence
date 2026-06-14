/**
 * IntentSelector — Issue #1494
 *
 * Covers:
 * - Renders "Buy" and "Rent" buttons with correct aria-pressed states
 * - Clicking Buy calls onIntentChange('buy')
 * - Clicking Rent calls onIntentChange('rent')
 * - Active intent button has 'default' variant (visual guard via aria-pressed)
 * - data-testid attributes are present
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { IntentSelector } from '../IntentSelector';

describe('IntentSelector', () => {
  it('renders "Buy" and "Rent" buttons', () => {
    render(<IntentSelector intent="buy" onIntentChange={vi.fn()} />);
    expect(screen.getByTestId('intent-selector-buy')).toBeInTheDocument();
    expect(screen.getByTestId('intent-selector-rent')).toBeInTheDocument();
  });

  it('Buy button has aria-pressed=true when intent=buy', () => {
    render(<IntentSelector intent="buy" onIntentChange={vi.fn()} />);
    expect(screen.getByTestId('intent-selector-buy')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('intent-selector-rent')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Rent button has aria-pressed=true when intent=rent', () => {
    render(<IntentSelector intent="rent" onIntentChange={vi.fn()} />);
    expect(screen.getByTestId('intent-selector-rent')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('intent-selector-buy')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking Buy calls onIntentChange("buy")', async () => {
    const user = userEvent.setup();
    const onIntentChange = vi.fn();
    render(<IntentSelector intent="rent" onIntentChange={onIntentChange} />);
    await user.click(screen.getByTestId('intent-selector-buy'));
    expect(onIntentChange).toHaveBeenCalledWith('buy');
    expect(onIntentChange).toHaveBeenCalledTimes(1);
  });

  it('clicking Rent calls onIntentChange("rent")', async () => {
    const user = userEvent.setup();
    const onIntentChange = vi.fn();
    render(<IntentSelector intent="buy" onIntentChange={onIntentChange} />);
    await user.click(screen.getByTestId('intent-selector-rent'));
    expect(onIntentChange).toHaveBeenCalledWith('rent');
    expect(onIntentChange).toHaveBeenCalledTimes(1);
  });

  it('renders "Looking to" label text', () => {
    render(<IntentSelector intent="buy" onIntentChange={vi.fn()} />);
    expect(screen.getByText('Looking to')).toBeInTheDocument();
  });

  it('has correct data-testid on container', () => {
    render(<IntentSelector intent="buy" onIntentChange={vi.fn()} />);
    expect(screen.getByTestId('intent-selector')).toBeInTheDocument();
  });
});
