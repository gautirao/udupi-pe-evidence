import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplaceResultScopeDialog } from '../ReplaceResultScopeDialog';

/**
 * Issue #2471 (found on #2419 mobile evidence) — the J3.3 replace dialog must
 * mount INSIDE the element it is given, so on mobile it lives within
 * DiscoverPageShell's `fixed inset-0 z-[60]` map wrapper instead of under it.
 * Without a container it keeps Radix's body-level default, which is what the
 * desktop layout relies on today.
 */

afterEach(() => cleanup());

function renderDialog(container?: HTMLElement | null) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReplaceResultScopeDialog
      open
      outgoingScopeLabel="Koramangala"
      onConfirm={onConfirm}
      onCancel={onCancel}
      container={container}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ReplaceResultScopeDialog portal target (#2471)', () => {
  it('mounts inside the given container element', () => {
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'mobile-map-wrapper');
    document.body.appendChild(host);
    try {
      renderDialog(host);
      const dialog = screen.getByRole('alertdialog');
      expect(host.contains(dialog)).toBe(true);
      expect(dialog.className).toContain('z-[1200]');
    } finally {
      host.remove();
    }
  });

  it('falls back to document.body when no container is given', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      renderDialog(undefined);
      const dialog = screen.getByRole('alertdialog');
      expect(host.contains(dialog)).toBe(false);
      expect(document.body.contains(dialog)).toBe(true);
    } finally {
      host.remove();
    }
  });

  it('keeps the J3.3 actions wired when mounted inside a container', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      const { onConfirm, onCancel } = renderDialog(host);
      await userEvent.click(screen.getByRole('button', { name: 'Keep selected areas' }));
      // Cancel fires via both the button's onClick and Radix's onOpenChange(false)
      // (pre-existing #2016 wiring, idempotent upstream) — assert reachability, not count.
      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    } finally {
      host.remove();
    }
  });
});
