/**
 * Issue #2663 DoD — "Queue/list presentation is independently testable from
 * mutation implementation" and "Component tests cover major queue states".
 *
 * IdentityRejectDialog is rendered here with ONLY its own props — no
 * QueryClientProvider, no `@/lib/api`, no `useTrustReviewMutations`.
 *
 * The reason is REQUIRED for this dialog (unlike BadgeRejectDialog) — the
 * confirm button stays disabled while the trimmed reason is empty, even
 * when isPending is false.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentityRejectDialog } from '../IdentityRejectDialog';
import type { PendingIdentityEvidence } from '../trustReviewTypes';

function makeItem(overrides: Partial<PendingIdentityEvidence> = {}): PendingIdentityEvidence {
  return {
    evidenceId: 'ev-1',
    profileId: 'profile-1',
    listingId: 'listing-1',
    legalName: 'Jane Doe',
    phoneNumber: '9999999999',
    documentType: 'AADHAAR',
    documentUrl: 'https://example.com/doc.pdf',
    submittedAt: new Date().toISOString(),
    listingTitle: 'Spacious 3BHK',
    listingLocality: 'Manipal',
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Parameters<typeof IdentityRejectDialog>[0]> = {}) {
  const onReasonChange = vi.fn();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const props: Parameters<typeof IdentityRejectDialog>[0] = {
    target: makeItem(),
    reason: 'Blurry photo',
    onReasonChange,
    onCancel,
    onConfirm,
    isPending: false,
    ...overrides,
  };
  render(<IdentityRejectDialog {...props} />);
  return { onReasonChange, onCancel, onConfirm };
}

describe('IdentityRejectDialog (standalone, props-only)', () => {
  it('is closed when target is null', () => {
    renderDialog({ target: null });
    expect(screen.queryByText('Reject Identity Evidence')).not.toBeInTheDocument();
  });

  it('is open and shows the dialog when target is set', () => {
    renderDialog();
    expect(screen.getByText('Reject Identity Evidence')).toBeInTheDocument();
  });

  it('keeps confirm disabled when reason is empty', () => {
    renderDialog({ reason: '' });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('keeps confirm disabled when reason is whitespace-only', () => {
    renderDialog({ reason: '   ' });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('enables confirm once a non-whitespace reason is provided', () => {
    renderDialog({ reason: 'Blurry photo' });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('wires onReasonChange, onCancel and onConfirm to the caller', async () => {
    const user = userEvent.setup();
    const { onReasonChange, onCancel, onConfirm } = renderDialog();

    await user.type(screen.getByPlaceholderText(/document is blurry or name does not match/i), 'x');
    expect(onReasonChange).toHaveBeenCalledWith('Blurry photox');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables the textarea, cancel and confirm (even with a valid reason), and shows a spinner, while isPending is true', () => {
    renderDialog({ reason: 'Blurry photo', isPending: true });

    expect(screen.getByPlaceholderText(/document is blurry or name does not match/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    const confirmButton = screen.getByRole('button', { name: /Reject/i });
    expect(confirmButton).toBeDisabled();
    expect(confirmButton.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('enables the textarea, cancel and confirm (with a valid reason), and shows no spinner, while isPending is false', () => {
    renderDialog({ reason: 'Blurry photo', isPending: false });

    expect(screen.getByPlaceholderText(/document is blurry or name does not match/i)).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    const confirmButton = screen.getByRole('button', { name: 'Reject' });
    expect(confirmButton).toBeEnabled();
    expect(confirmButton.querySelector('svg')).toBeNull();
  });
});
