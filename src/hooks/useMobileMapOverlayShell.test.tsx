/**
 * Issue #1953 (build step 4) — unit tests for the mobile Map-overlay a11y +
 * scroll-lock hook: Escape-to-close, background scroll lock (both
 * directions — a lock that never releases must fail this suite), and
 * focus-return to the trigger element on the open -> close transition.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMobileMapOverlayShell } from './useMobileMapOverlayShell';

function Harness() {
  const [isOpen, setIsOpen] = useState(false);
  const { triggerRef } = useMobileMapOverlayShell({
    isOpen,
    onClose: () => setIsOpen(false),
  });

  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen(true)}>
        Map
      </button>
      {isOpen && (
        <div role="dialog" aria-label="Map overlay">
          <button type="button" onClick={() => setIsOpen(false)}>
            List
          </button>
        </div>
      )}
    </div>
  );
}

describe('useMobileMapOverlayShell', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('Escape closes the overlay when open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape closing the overlay returns focus to the trigger that opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Map' });
    await user.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('the in-overlay "List" button closing the overlay also returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Map' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('locks background scroll (body overflow hidden) while open, and releases it on close', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(document.body.style.overflow).not.toBe('hidden');

    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    // A lock that never releases would fail this assertion — the whole
    // point of testing both directions, not just the one-way "it locks".
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('restores whatever the previous body overflow value was (not just empty string)', async () => {
    document.body.style.overflow = 'scroll';
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('does not attach an Escape listener effect while closed (Escape is a no-op before opening)', () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // No trigger blur/focus side effects should occur either.
    expect(document.activeElement).toBe(document.body);
  });
});
