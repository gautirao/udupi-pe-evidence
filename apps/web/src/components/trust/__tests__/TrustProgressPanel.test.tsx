import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TrustProgressPanel } from '../TrustProgressPanel';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  API_BASE_URL: 'http://localhost:8085',
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

// Toast mock — capture toast calls without rendering Toaster
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
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

function makePhotosAvailableBadges() {
  return [
    {
      dimensionType: 'PHOTOS' as const,
      badgeState: 'AVAILABLE' as const,
      grantedAt: null,
      autoGranted: null,
    },
  ];
}

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

function makeFetchResponse(status: number, body: unknown = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function makeFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['(binary)'], name, { type });
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

  it('AVAILABLE badge (non-PHOTOS) shows "Not Started" chip and "Verification coming soon" text', async () => {
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
    expect(screen.queryByRole('button', { name: /upload live photo/i })).not.toBeInTheDocument();
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

describe('TrustProgressPanel — PHOTOS badge AVAILABLE', () => {
  it('shows "Upload Live Photo" button for PHOTOS AVAILABLE', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: makePhotosAvailableBadges(),
      cta: 'PHOTOS',
    });

    renderPanel({ variant: 'full', listingId: 'listing-42' });

    expect(await screen.findByRole('button', { name: /upload live photo/i })).toBeInTheDocument();
    expect(screen.queryByText('Verification coming soon')).not.toBeInTheDocument();
  });

  it('non-PHOTOS AVAILABLE badge shows "Verification coming soon" text, not a button', async () => {
    // IDENTITY AVAILABLE triggers the IdentityEvidenceForm CTA (not "Verification coming soon").
    // Use LOCATION — a non-PHOTOS, non-IDENTITY dimension — to verify the fallback copy path.
    vi.mocked(api.get).mockResolvedValue({
      badges: [
        {
          dimensionType: 'LOCATION' as const,
          badgeState: 'AVAILABLE' as const,
          grantedAt: null,
          autoGranted: null,
        },
      ],
      cta: 'LOCATION',
    });

    renderPanel({ variant: 'full' });

    expect(await screen.findByText('Verification coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload live photo/i })).not.toBeInTheDocument();
  });

  it('clicking button triggers file input and POSTs FormData to correct path', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: makePhotosAvailableBadges(),
      cta: 'PHOTOS',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    renderPanel({ variant: 'full', listingId: 'listing-42' });

    const uploadBtn = await screen.findByRole('button', { name: /upload live photo/i });

    // Grab the hidden file input and assign files to it before clicking the button
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // Simulate file selection via userEvent.upload
    await userEvent.upload(fileInput, makeFile());

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toContain('/api/listings/listing-42/trust/photos/verify');
    expect(calledInit?.method).toBe('POST');
    expect(calledInit?.body).toBeInstanceOf(FormData);

    fetchSpy.mockRestore();
    void uploadBtn; // suppress unused warning
  });

  it('successful upload calls onPhotoSubmitted (triggers refetch) and shows success toast', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: makePhotosAvailableBadges(),
      cta: 'PHOTOS',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );

    renderPanel({ variant: 'full', listingId: 'listing-42' });

    await screen.findByRole('button', { name: /upload live photo/i });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, makeFile());

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Photo submitted for review.' }),
      );
    });

    // api.get should be called a second time due to refetch triggered by onSuccess
    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledTimes(2);
    });

    fetchSpy.mockRestore();
  });

  it('422 response shows stock-image error toast', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: makePhotosAvailableBadges(),
      cta: 'PHOTOS',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 422 }),
    );

    renderPanel({ variant: 'full', listingId: 'listing-42' });

    await screen.findByRole('button', { name: /upload live photo/i });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, makeFile());

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: 'This photo was flagged as a stock image. Please upload an original photo.',
        }),
      );
    });

    fetchSpy.mockRestore();
  });

  it('409 response shows already-submitted info toast', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: makePhotosAvailableBadges(),
      cta: 'PHOTOS',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 409 }),
    );

    renderPanel({ variant: 'full', listingId: 'listing-42' });

    await screen.findByRole('button', { name: /upload live photo/i });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, makeFile());

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Your photo is already submitted for review.',
        }),
      );
    });

    fetchSpy.mockRestore();
  });

  it('other error response shows generic error toast', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: makePhotosAvailableBadges(),
      cta: 'PHOTOS',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 500 }),
    );

    renderPanel({ variant: 'full', listingId: 'listing-42' });

    await screen.findByRole('button', { name: /upload live photo/i });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, makeFile());

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: 'Upload failed. Please try again.',
        }),
      );
    });

    fetchSpy.mockRestore();
  });

  it('button is disabled and shows "Uploading..." text while upload is in progress', async () => {
    vi.mocked(api.get).mockResolvedValue({
      badges: makePhotosAvailableBadges(),
      cta: 'PHOTOS',
    });

    // Never resolve so we can inspect mid-upload state
    let resolveFetch!: (value: Response) => void;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );

    renderPanel({ variant: 'full', listingId: 'listing-42' });

    await screen.findByRole('button', { name: /upload live photo/i });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, makeFile());

    // During upload the button should be disabled with "Uploading..." text
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /uploading/i });
      expect(btn).toBeDisabled();
    });

    // Resolve inside act so the resulting state update is flushed cleanly
    await act(async () => {
      resolveFetch(new Response('{}', { status: 200 }));
    });
    fetchSpy.mockRestore();
  });
});
