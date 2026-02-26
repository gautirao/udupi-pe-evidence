import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaywallCard } from '../PaywallCard';

// ─── Polyfills ─────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted mock handles ──────────────────────────────────────
const mockToast = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockRefreshAuth = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/api', () => ({
  api: { post: mockPost },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ refreshAuth: mockRefreshAuth }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Helpers ──────────────────────────────────────────────────
function renderCard() {
  return render(<PaywallCard />);
}

// ─── Tests ────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({});
  mockRefreshAuth.mockResolvedValue(undefined);
});

describe('PaywallCard', () => {
  it('renders "Insights Access Required" heading', () => {
    renderCard();
    expect(screen.getByText('Insights Access Required')).toBeInTheDocument();
  });

  it('renders upgrade button with name matching /upgrade/i', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /upgrade/i })).toBeInTheDocument();
  });

  it('upgrade button is not disabled initially', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /upgrade/i })).not.toBeDisabled();
  });

  it('clicking upgrade calls api.post with /api/payments/insights-pass', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/payments/insights-pass');
    });
  });

  it('shows "Processing..." and disables button while request is pending', async () => {
    let resolvePost!: (value: unknown) => void;
    mockPost.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));

    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    });

    // Clean up — resolve so the component doesn't have pending state on unmount
    resolvePost({});
    await waitFor(() =>
      expect(screen.queryByText('Processing...')).not.toBeInTheDocument(),
    );
  });

  it('calls refreshAuth() and navigate("/insights") on success', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/insights');
    });
  });

  it('shows destructive toast variant on api error', async () => {
    mockPost.mockRejectedValue(new Error('Payment failed'));

    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
    expect(mockRefreshAuth).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('button is re-enabled after an error (isPending resets to false)', async () => {
    mockPost.mockRejectedValue(new Error('Payment failed'));

    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrade/i })).not.toBeDisabled();
    });
  });
});
