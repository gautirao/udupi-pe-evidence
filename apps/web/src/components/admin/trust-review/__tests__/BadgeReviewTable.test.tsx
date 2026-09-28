/**
 * Issue #2663 DoD — "Queue/list presentation is independently testable from
 * mutation implementation" and "Component tests cover major queue states".
 *
 * BadgeReviewTable is rendered here with ONLY its `view`/`commands` props —
 * no QueryClientProvider, no `@/lib/api`, no `useTrustReviewMutations`. This
 * proves the presentation layer has no hidden dependency on the mutation
 * hook or the query client.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BadgeReviewTable, type BadgeReviewCommands, type BadgeReviewView } from '../BadgeReviewTable';
import type { PendingTrustReview, ReviewActionState } from '../trustReviewTypes';

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

function makeAction(overrides: Partial<ReviewActionState> = {}): ReviewActionState {
  return { busy: false, approving: false, ...overrides };
}

function makeCommands(overrides: Partial<BadgeReviewCommands> = {}): BadgeReviewCommands {
  return {
    review: {
      approve: vi.fn(),
      openReject: vi.fn(),
    },
    queue: {
      retry: vi.fn(),
    },
    ...overrides,
  };
}

function renderTable(view: Partial<BadgeReviewView>, commands?: BadgeReviewCommands) {
  const fullView: BadgeReviewView = {
    reviews: [],
    isLoading: false,
    isError: false,
    error: null,
    action: makeAction(),
    ...view,
  };
  const fullCommands = commands ?? makeCommands();
  const rendered = render(<BadgeReviewTable view={fullView} commands={fullCommands} />);
  return { view: fullView, commands: fullCommands, container: rendered.container };
}

describe('BadgeReviewTable (standalone, props-only)', () => {
  it('shows a spinner and no table while loading', () => {
    const { container } = render(
      <BadgeReviewTable
        view={{ reviews: [], isLoading: true, isError: false, error: null, action: makeAction() }}
        commands={makeCommands()}
      />,
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('isLoading takes precedence over the empty state even with zero reviews', () => {
    const { container } = renderTable({ reviews: [], isLoading: true });

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('No pending badge submissions')).not.toBeInTheDocument();
  });

  it('shows the Error instance message and a working Retry button', async () => {
    const user = userEvent.setup();
    const { commands } = renderTable({ isError: true, error: new Error('Network boom') });

    expect(screen.getByText('Failed to load submissions')).toBeInTheDocument();
    expect(screen.getByText('Network boom')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(commands.queue.retry).toHaveBeenCalledTimes(1);
  });

  it('falls back to the generic message for a non-Error error value', () => {
    renderTable({ isError: true, error: 'some-non-error-value' });

    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
    expect(screen.queryByText('some-non-error-value')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no reviews', () => {
    renderTable({ reviews: [] });

    expect(screen.getByText('No pending badge submissions')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a review row and wires approve/reject commands with the correct argument', async () => {
    const user = userEvent.setup();
    const review = makeReview({ dimensionId: 'dim-42', dimensionType: 'AUTHORITY' });
    const { commands } = renderTable({ reviews: [review] });

    expect(screen.getByText('Spacious 3BHK')).toBeInTheDocument();
    expect(screen.getByText('Manipal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /approve authority badge/i }));
    expect(commands.review.approve).toHaveBeenCalledWith('dim-42');

    await user.click(screen.getByRole('button', { name: /reject authority badge/i }));
    expect(commands.review.openReject).toHaveBeenCalledWith(review);
  });

  it('shows the approving spinner (not the static check icon) and disables actions while action.approving is true', () => {
    renderTable({ reviews: [makeReview()], action: makeAction({ busy: true, approving: true }) });

    const approveButton = screen.getByRole('button', { name: /approve photos badge/i });
    expect(approveButton).toBeDisabled();
    expect(approveButton.querySelector('svg')).toHaveClass('animate-spin');
    expect(screen.getByRole('button', { name: /reject photos badge/i })).toBeDisabled();
  });

  it('disables actions but shows the static check icon (no spinner) when action.busy is true and approving is false', () => {
    renderTable({ reviews: [makeReview()], action: makeAction({ busy: true, approving: false }) });

    const approveButton = screen.getByRole('button', { name: /approve photos badge/i });
    expect(approveButton).toBeDisabled();
    expect(approveButton.querySelector('svg')).not.toHaveClass('animate-spin');
    expect(screen.getByRole('button', { name: /reject photos badge/i })).toBeDisabled();
  });
});
