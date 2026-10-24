/**
 * #2859 B7 (issue 285907) WEB slice B1 — discover-area-first-drilldown-1483, assertion 1483-5 (R_control form).
 *
 * 1483-5 is "Start Over: confirm calls reset once, cancel never resets". The existing StartOverButton.test.tsx
 * proves the confirm path (L63) and the cancel path (L83) in SEPARATE its, so its cancel negative ("never resets")
 * has no same-it positive control (R_control). This file puts Cancel and Confirm in ONE it on the real
 * StartOverButton: Cancel leaves the reset spy at zero, and the confirm that follows in the same it moves the SAME
 * spy to exactly one — so a spy that can never be called cannot satisfy the cancel negative.
 *
 * R_jsdom / R_injected: a real Radix Popover stalls the jsdom worker, so `@/components/ui/popover` is replaced by a
 * file-scoped context-driven stand-in (same contract as the PR-5 inline stand-in in StartOverButton.test.tsx:
 * trigger click -> onOpenChange(!open); content rendered only while open). Radix focus return, Escape / outside-click
 * dismissal, the portal and `asChild` forwarding are RETAIN (injected), not claimed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('@/components/ui/popover', () => {
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
      return ctx.open ? React.createElement('div', { 'data-testid': rest['data-testid'] as string }, children) : null;
    },
  };
});

import { StartOverButton } from '../StartOverButton';

describe('#2859 B7 1483-5 — StartOverButton: Cancel never resets, Confirm resets exactly once (one it, one spy)', () => {
  it('Cancel closes the confirm without calling onStartOver; reopening and confirming then calls the SAME spy exactly once', async () => {
    const onStartOver = vi.fn();
    render(<StartOverButton onStartOver={onStartOver} hasSubstantialState cityLabel="Udupi" />);

    // open -> Cancel: nothing reset, the confirm is gone
    await userEvent.click(screen.getByTestId('start-over-button'));
    expect(screen.getByTestId('start-over-confirm-popover')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('start-over-cancel'));
    expect(screen.queryByTestId('start-over-confirm-popover')).not.toBeInTheDocument();
    expect(onStartOver).not.toHaveBeenCalled();

    // POSITIVE CONTROL (same it, same spy): reopen -> Confirm calls it exactly once and closes the confirm.
    await userEvent.click(screen.getByTestId('start-over-button'));
    expect(screen.getByTestId('start-over-confirm-popover')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('start-over-confirm'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('start-over-confirm-popover')).not.toBeInTheDocument();
  });
});
