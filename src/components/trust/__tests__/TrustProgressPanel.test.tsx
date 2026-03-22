import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TrustProgressPanel } from '../TrustProgressPanel';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from '@/lib/api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const allBadges = [
  {
    dimensionType: 'IDENTITY' as const,
    badgeState: 'EARNED' as const,
    grantedAt: '2026-01-01T00:00:00Z',
    autoGranted: null,
  },
  {
    dimensionType: 'LOCATION' as const,
    badgeState: 'AVAILABLE' as const,
    grantedAt: null,
    autoGranted: null,
  },
  {
    dimensionType: 'PHOTOS' as const,
    badgeState: 'PENDING' as const,
    grantedAt: null,
    autoGranted: null,
  },
  {
    dimensionType: 'AUTHORITY' as const,
    badgeState: 'AVAILABLE' as const,
    grantedAt: null,
    autoGranted: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel(props: { listingId?: string; variant?: 'full' | 'compact' } = {}) {
  const { listingId = 'listing-1', variant = 'full' } = props;
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TrustProgressPanel listingId={listingId} variant={variant} />
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TrustProgressPanel — full variant', () => {
  it('renders all badge rows with correct dimension labels', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: allBadges,
      cta: 'LOCATION',
    });

    renderPanel({ variant: 'full' });

    expect(await screen.findByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('Authority')).toBeInTheDocument();
  });

  it('EARNED badge shows "Verified" chip', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: [
        {
          dimensionType: 'IDENTITY',
          badgeState: 'EARNED',
          grantedAt: '2026-01-01T00:00:00Z',
          autoGranted: null,
        },
      ],
      cta: null,
    });

    renderPanel({ variant: 'full' });

    expect(await screen.findByText('Verified')).toBeInTheDocument();
  });

  it('AVAILABLE badge shows "Not Started" chip and "Verification coming soon" text', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: [
        {
          dimensionType: 'LOCATION',
          badgeState: 'AVAILABLE',
          grantedAt: null,
          autoGranted: null,
        },
      ],
      cta: 'LOCATION',
    });

    renderPanel({ variant: 'full' });

    expect(await screen.findByText('Not Started')).toBeInTheDocument();
    expect(screen.getByText('Verification coming soon')).toBeInTheDocument();
  });

  it('AUTHORITY with autoGranted=true shows "Auto-granted" instead of "Verification coming soon"', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: [
        {
          dimensionType: 'AUTHORITY',
          badgeState: 'AVAILABLE',
          grantedAt: null,
          autoGranted: true,
        },
      ],
      cta: 'AUTHORITY',
    });

    renderPanel({ variant: 'full' });

    expect(await screen.findByText('Auto-granted')).toBeInTheDocument();
    expect(screen.queryByText('Verification coming soon')).not.toBeInTheDocument();
  });
});

describe('TrustProgressPanel — compact variant', () => {
  it('shows correct "X/Y badges verified" count', async () => {
    // allBadges: 1 EARNED out of 4 total
    vi.mocked(api.get).mockResolvedValue({
      badges: allBadges,
      cta: 'LOCATION',
    });

    renderPanel({ variant: 'compact' });

    expect(await screen.findByText('1/4 badges verified')).toBeInTheDocument();
  });

  it('is collapsed by default and expands on toggle', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: allBadges,
      cta: 'LOCATION',
    });

    renderPanel({ variant: 'compact' });

    // Wait for data to load
    await screen.findByText('1/4 badges verified');

    // Dimension labels not visible when collapsed
    expect(screen.queryByText('Identity')).not.toBeInTheDocument();

    // Click toggle
    const toggleBtn = screen.getByRole('button', { name: /view details/i });
    await userEvent.click(toggleBtn);

    // Now expanded — dimension labels should appear
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
  });
});

describe('TrustProgressPanel — loading state', () => {
  it('shows aria-busy container with Skeleton elements', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})); // never resolves

    renderPanel({ variant: 'full' });

    const loadingContainer = screen.getByRole('status', { name: /loading trust progress/i });
    expect(loadingContainer).toHaveAttribute('aria-busy', 'true');
  });
});

describe('TrustProgressPanel — error state', () => {
  it('shows error message and Retry button', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

    renderPanel({ variant: 'full' });

    expect(await screen.findByText('Could not load trust progress.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Retry button calls api.get again', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

    renderPanel({ variant: 'full' });

    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    await userEvent.click(retryBtn);

    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(2);
  });
});

describe('TrustProgressPanel — CTA edge cases', () => {
  it('PENDING badge shows Pending Review chip but no CTA text', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: [
        {
          dimensionType: 'PHOTOS',
          badgeState: 'PENDING',
          grantedAt: null,
          autoGranted: null,
        },
      ],
      cta: null,
    });

    renderPanel({ variant: 'full' });

    expect(await screen.findByText('Pending Review')).toBeInTheDocument();
    expect(screen.queryByText('Verification coming soon')).not.toBeInTheDocument();
    expect(screen.queryByText('Auto-granted')).not.toBeInTheDocument();
  });
});
