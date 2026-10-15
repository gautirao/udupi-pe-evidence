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

// ── #2750 PR-4 B1 T3 — retires e2e active-context-chips-and-badge (CHIP-4 popover) ──────────────────
// The three popover tests above open a REAL Radix Popover, which stalls the jsdom worker (15-17 s,
// timeout) — a known environmental failure that stays red and is deliberately left untouched. The
// e2e's property (a deep-state Start over shows `start-over-confirm-popover`, nothing resets until the
// confirm, confirm resets once and closes, cancel never resets) lives in StartOverButton's own state
// machine, not in Radix. These tests therefore swap `@/components/ui/popover` for a minimal
// context-driven stand-in that mirrors the Radix contract the component relies on (trigger click ->
// onOpenChange(!open); content rendered only while open) — via vi.doMock + a dynamic import INSIDE each
// test, so no other test in this file (including the red ones) sees the mock.
// Placement: ABOVE the pre-existing describe on purpose. The real-Radix tests time out and keep running in
// the background after being marked failed; a test that ran after them saw that residue (measured: a
// double onClick / a missing call). Run first, these are independent of the known-red tests.
// So these describes MUST stay above the real-Radix describes; a reorder, shuffle or sharding change can flake them.
// Limits: the stand-in is NOT Radix coverage — no portal, focus return, Escape / outside-click dismissal or
// `asChild` forwarding, and it drops every PopoverContent prop except data-testid (Q-RADIX stays an owner decision).
async function importStartOverButtonWithInlinePopover() {
  vi.resetModules();
  vi.doMock('@/components/ui/popover', () => {
    const Ctx = React.createContext<{ open: boolean; onOpenChange?: (o: boolean) => void }>({ open: false });
    return {
      Popover: ({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; children: React.ReactNode }) =>
        React.createElement(Ctx.Provider, { value: { open: !!open, onOpenChange } }, children),
      PopoverTrigger: ({ children }: { children: React.ReactElement<{ onClick?: (e: unknown) => void }> }) => {
        const ctx = React.useContext(Ctx);
        return React.cloneElement(children, {
          onClick: (e: unknown) => {
            children.props.onClick?.(e);
            ctx.onOpenChange?.(!ctx.open);
          },
        });
      },
      PopoverContent: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => {
        const ctx = React.useContext(Ctx);
        return ctx.open
          ? React.createElement('div', { 'data-testid': rest['data-testid'] as string }, children)
          : null;
      },
    };
  });
  return (await import('../StartOverButton')).StartOverButton;
}

function releaseInlinePopover() {
  vi.doUnmock('@/components/ui/popover');
  vi.resetModules();
}

describe('StartOverButton — confirm popover state machine (inline Popover stand-in; #2750 PR-4 B1 T3)', () => {
  it('#2750 B1 T3 deep state: the popover is absent until the click, the click does NOT reset, the confirm resets exactly once and closes it', async () => {
    try {
      const Mocked = await importStartOverButtonWithInlinePopover();
      const onStartOver = vi.fn();
      render(<Mocked onStartOver={onStartOver} hasSubstantialState cityLabel="Udupi" />);

      expect(screen.queryByTestId('start-over-confirm-popover')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('start-over-button'));
      const popover = screen.getByTestId('start-over-confirm-popover');
      expect(popover).toHaveTextContent('You’ll return to Udupi.');
      expect(onStartOver).not.toHaveBeenCalled();

      await userEvent.click(screen.getByTestId('start-over-confirm'));
      expect(onStartOver).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('start-over-confirm-popover')).not.toBeInTheDocument();
    } finally {
      releaseInlinePopover();
    }
  });

  it('#2750 B1 T3 deep state: Cancel closes the popover and never resets', async () => {
    try {
      const Mocked = await importStartOverButtonWithInlinePopover();
      const onStartOver = vi.fn();
      render(<Mocked onStartOver={onStartOver} hasSubstantialState cityLabel="Udupi" />);

      await userEvent.click(screen.getByTestId('start-over-button'));
      expect(screen.getByTestId('start-over-confirm-popover')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('start-over-cancel'));
      expect(screen.queryByTestId('start-over-confirm-popover')).not.toBeInTheDocument();
      expect(onStartOver).not.toHaveBeenCalled();
    } finally {
      releaseInlinePopover();
    }
  });
});

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
