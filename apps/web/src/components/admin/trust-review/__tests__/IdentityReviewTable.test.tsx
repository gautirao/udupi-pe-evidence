/**
 * Issue #2663 DoD — "Queue/list presentation is independently testable from
 * mutation implementation" and "Component tests cover major queue states".
 *
 * IdentityReviewTable is rendered here with ONLY its `view`/`commands`
 * props — no QueryClientProvider, no `@/lib/api`, no
 * `useTrustReviewMutations`.
 *
 * IdentityReviewView carries no `error` field (unlike BadgeReviewView), so
 * the error card here shows no message body — this asymmetry is existing,
 * intentional behavior (see trustReviewTypes.ts) and is locked in below,
 * not changed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentityReviewTable, type IdentityReviewCommands, type IdentityReviewView } from '../IdentityReviewTable';
import type { PendingIdentityEvidence, ReviewActionState } from '../trustReviewTypes';

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

function makeAction(overrides: Partial<ReviewActionState> = {}): ReviewActionState {
  return { busy: false, approving: false, ...overrides };
}

function makeCommands(overrides: Partial<IdentityReviewCommands> = {}): IdentityReviewCommands {
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

function renderTable(view: Partial<IdentityReviewView>, commands?: IdentityReviewCommands) {
  const fullView: IdentityReviewView = {
    items: [],
    isLoading: false,
    isError: false,
    action: makeAction(),
    ...view,
  };
  const fullCommands = commands ?? makeCommands();
  const rendered = render(<IdentityReviewTable view={fullView} commands={fullCommands} />);
  return { view: fullView, commands: fullCommands, container: rendered.container };
}

describe('IdentityReviewTable (standalone, props-only)', () => {
  it('shows a spinner and no table while loading', () => {
    const { container } = render(
      <IdentityReviewTable
        view={{ items: [], isLoading: true, isError: false, action: makeAction() }}
        commands={makeCommands()}
      />,
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('isLoading takes precedence over the empty state even with zero items', () => {
    const { container } = renderTable({ items: [], isLoading: true });

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('No pending identity evidence')).not.toBeInTheDocument();
  });

  it('shows the error card with no message body (asymmetric with BadgeReviewTable) and a working Retry', async () => {
    const user = userEvent.setup();
    const { commands } = renderTable({ isError: true });

    const heading = screen.getByText('Failed to load identity evidence');
    expect(heading).toBeInTheDocument();
    // IdentityReviewView has no `error` field, so unlike BadgeReviewTable
    // there is exactly one message line (the heading) — no second message
    // paragraph underneath it.
    expect(heading.parentElement?.querySelectorAll('p')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(commands.queue.retry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no items', () => {
    renderTable({ items: [] });

    expect(screen.getByText('No pending identity evidence')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an item row (with its data-testid) and wires approve/reject commands with the correct argument', async () => {
    const user = userEvent.setup();
    const item = makeItem({ evidenceId: 'ev-42', legalName: 'John Roe' });
    const { commands } = renderTable({ items: [item] });

    expect(screen.getByText('John Roe')).toBeInTheDocument();
    expect(screen.getByTestId('identity-evidence-ev-42')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /approve identity evidence/i }));
    expect(commands.review.approve).toHaveBeenCalledWith('ev-42');

    await user.click(screen.getByRole('button', { name: /reject identity evidence/i }));
    expect(commands.review.openReject).toHaveBeenCalledWith(item);
  });

  it('shows the approving spinner (not the static check icon) and disables actions while action.approving is true', () => {
    renderTable({ items: [makeItem()], action: makeAction({ busy: true, approving: true }) });

    const approveButton = screen.getByRole('button', { name: /approve identity evidence/i });
    expect(approveButton).toBeDisabled();
    expect(approveButton.querySelector('svg')).toHaveClass('animate-spin');
    expect(screen.getByRole('button', { name: /reject identity evidence/i })).toBeDisabled();
  });

  it('disables actions but shows the static check icon (no spinner) when action.busy is true and approving is false', () => {
    renderTable({ items: [makeItem()], action: makeAction({ busy: true, approving: false }) });

    const approveButton = screen.getByRole('button', { name: /approve identity evidence/i });
    expect(approveButton).toBeDisabled();
    expect(approveButton.querySelector('svg')).not.toHaveClass('animate-spin');
    expect(screen.getByRole('button', { name: /reject identity evidence/i })).toBeDisabled();
  });
});
