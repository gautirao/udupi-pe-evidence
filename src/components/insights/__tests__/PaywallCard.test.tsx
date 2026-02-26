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

// ─── Mocks ────────────────────────────────────────────────────
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/api', () => ({
  api: { post: mockPost },
}));

// ─── Helpers ──────────────────────────────────────────────────
let reloadMock: ReturnType<typeof vi.fn>;

function renderCard() {
  return render(<PaywallCard />);
}

// ─── Tests ────────────────────────────────────────────────────
// jsdom defines window.location as non-configurable; redefine it as configurable
// in beforeEach so each test gets a fresh reload mock without vi.spyOn limitations.
beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({});
  reloadMock = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, reload: reloadMock },
  });
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

  it('calls window.location.reload() on success', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
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
    expect(reloadMock).not.toHaveBeenCalled();
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
