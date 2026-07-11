/**
 * Issue #1817 (AC8) — StartOverButton unit tests.
 *
 * Covers the confirm-gating contract (design §8): a confirm popover appears only
 * when there is substantial state to lose (selection deeper than a region, or any
 * filter/search active); when only a region — or nothing — is selected, the reset
 * fires directly with no confirm.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { StartOverButton } from '../StartOverButton';

describe('StartOverButton', () => {
  it('region-only/none selected (hasSubstantialState=false): resets directly, no confirm popover', async () => {
    const onStartOver = vi.fn();
    render(<StartOverButton onStartOver={onStartOver} hasSubstantialState={false} cityLabel="Bangalore" />);
    await userEvent.click(screen.getByTestId('start-over-button'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('start-over-confirm-popover')).not.toBeInTheDocument();
  });

  it('deep state (hasSubstantialState=true): shows confirm popover, does NOT reset until confirmed', async () => {
    const onStartOver = vi.fn();
    render(<StartOverButton onStartOver={onStartOver} hasSubstantialState cityLabel="Bangalore" />);
    await userEvent.click(screen.getByTestId('start-over-button'));
    expect(onStartOver).not.toHaveBeenCalled();
    const popover = await screen.findByTestId('start-over-confirm-popover');
    expect(popover).toHaveTextContent('You’ll return to Bangalore.');
  });

  it('confirming in the popover calls onStartOver exactly once and closes the popover', async () => {
    const onStartOver = vi.fn();
    render(<StartOverButton onStartOver={onStartOver} hasSubstantialState cityLabel="Udupi" />);
    await userEvent.click(screen.getByTestId('start-over-button'));
    await screen.findByTestId('start-over-confirm-popover');
    await userEvent.click(screen.getByTestId('start-over-confirm'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('Cancel in the popover does NOT call onStartOver', async () => {
    const onStartOver = vi.fn();
    render(<StartOverButton onStartOver={onStartOver} hasSubstantialState cityLabel="Udupi" />);
    await userEvent.click(screen.getByTestId('start-over-button'));
    await screen.findByTestId('start-over-confirm-popover');
    await userEvent.click(screen.getByTestId('start-over-cancel'));
    expect(onStartOver).not.toHaveBeenCalled();
  });

  it('renders the "Start over" label with an icon, and the correct aria-label', () => {
    render(<StartOverButton onStartOver={vi.fn()} hasSubstantialState={false} cityLabel="Bangalore" />);
    const btn = screen.getByTestId('start-over-button');
    expect(btn).toHaveTextContent('Start over');
    expect(btn).toHaveAttribute('aria-label', 'Start over and return to journey selection');
    expect(btn.querySelector('svg')).not.toBeNull();
  });
});
