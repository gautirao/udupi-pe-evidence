/**
 * Issue #2663 DoD — "Queue/list presentation is independently testable from
 * mutation implementation" and "Component tests cover major queue states".
 *
 * BadgeRejectDialog is rendered here with ONLY its own props — no
 * QueryClientProvider, no `@/lib/api`, no `useTrustReviewMutations`.
 *
 * The reason is OPTIONAL for this dialog (unlike IdentityRejectDialog) — the
 * confirm button is only ever disabled by `isPending`, never by an empty
 * reason. See IdentityRejectDialog.test.tsx for the required-reason variant.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BadgeRejectDialog } from '../BadgeRejectDialog';
import type { PendingTrustReview } from '../trustReviewTypes';

function makeReview(overrides: Partial<PendingTrustReview> = {}): PendingTrustReview {
  return {
    dimensionId: 'dim-1',
    listingId: 'listing-1',
    dimensionType: 'PHOTOS',
    badgeState: 'PENDING',
    submittedAt: new Date().toISOString(),
    verificationAssetUrl: null,
    listingTitle: 'Spacious 3BHK',
    listingLocality: 'Manipal',
    listingSellerType: 'owner',
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Parameters<typeof BadgeRejectDialog>[0]> = {}) {
  const onReasonChange = vi.fn();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const props: Parameters<typeof BadgeRejectDialog>[0] = {
    target: makeReview(),
    reason: '',
    onReasonChange,
    onCancel,
    onConfirm,
    isPending: false,
    ...overrides,
  };
  render(<BadgeRejectDialog {...props} />);
  return { onReasonChange, onCancel, onConfirm };
}

describe('BadgeRejectDialog (standalone, props-only)', () => {
  it('is closed when target is null', () => {
    renderDialog({ target: null });
    expect(screen.queryByText('Reject Submission')).not.toBeInTheDocument();
  });

  it('is open and shows the dialog when target is set', () => {
    renderDialog();
    expect(screen.getByText('Reject Submission')).toBeInTheDocument();
  });

  it('does not require a reason — confirm is enabled with an empty reason', () => {
    renderDialog({ reason: '' });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('wires onReasonChange, onCancel and onConfirm to the caller', async () => {
    const user = userEvent.setup();
    const { onReasonChange, onCancel, onConfirm } = renderDialog();

    await user.type(screen.getByPlaceholderText(/document appears to be expired/i), 'x');
    expect(onReasonChange).toHaveBeenCalledWith('x');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables the textarea, cancel and confirm, and shows a spinner, while isPending is true', () => {
    renderDialog({ isPending: true });

    expect(screen.getByPlaceholderText(/document appears to be expired/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    const confirmButton = screen.getByRole('button', { name: /Reject/i });
    expect(confirmButton).toBeDisabled();
    expect(confirmButton.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('enables the textarea, cancel and confirm, and shows no spinner, while isPending is false', () => {
    renderDialog({ isPending: false });

    expect(screen.getByPlaceholderText(/document appears to be expired/i)).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    const confirmButton = screen.getByRole('button', { name: 'Reject' });
    expect(confirmButton).toBeEnabled();
    expect(confirmButton.querySelector('svg')).toBeNull();
  });
});
