/**
 * Issue #1793 PR-C (C5) — admin property-requests list: read-only, phone MASKED only, free text
 * rendered as plain text (never HTML), and explicit loading/empty/error/403 states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'admin-token' } } })) } },
}));
// AppLayout pulls auth/nav context that is irrelevant to this page's behaviour.
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

import PropertyRequests from '../PropertyRequests';

const HOSTILE = '<img src=x onerror=alert(1)><script>alert(2)</script>';

const row = (over: Record<string, unknown> = {}) => ({
  id: '11111111-2222-3333-4444-555555555555',
  city: 'udupi',
  areaKey: 'kalsanka|city|udupi',
  areaLabel: 'Kalsanka',
  journey: 'AREA',
  intent: 'BUY',
  requirement: '3BHK near the school',
  budgetMin: 5000000,
  budgetMax: 8000000,
  phoneMasked: '+91 *****43210',
  contactVia: 'WHATSAPP',
  consentVersion: 'property-request-v1',
  consentedAt: '2026-10-06T10:00:00Z',
  status: 'NEW',
  createdAt: '2026-10-06T10:00:00Z',
  ...over,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PropertyRequests />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PropertyRequests admin page', () => {
  it('requests the capped list with the authenticated client and renders the masked phone only', async () => {
    fetchMock.mockResolvedValueOnce(json([row()]));
    renderPage();
    expect(await screen.findByText('+91 *****43210')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toMatch(/\/api\/admin\/property-requests\?limit=200$/);
    expect(init.headers.Authorization).toBe('Bearer admin-token');
    expect(screen.getByText('3BHK near the school')).toBeInTheDocument();
    expect(screen.getByText('Kalsanka')).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp/)).toBeInTheDocument();
    // Read-only: no reveal/copy/export affordance of any kind.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/9876543210/);
  });

  it('renders hostile free text as literal text: no element is created from it', async () => {
    fetchMock.mockResolvedValueOnce(json([row({ requirement: HOSTILE, areaLabel: HOSTILE, city: HOSTILE })]));
    const { container } = renderPage();
    await screen.findByText('+91 *****43210');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    const text = container.textContent ?? '';
    // requirement, areaLabel and city each show the literal markup characters.
    expect(text.split(HOSTILE).length - 1).toBeGreaterThanOrEqual(3);
  });

  it('shows skeleton rows while loading', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('property-requests-loading')).toBeInTheDocument();
    expect(screen.queryByText('No property requests yet.')).not.toBeInTheDocument();
  });

  it('shows an explicit empty state for an empty list', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    renderPage();
    expect(await screen.findByText('No property requests yet.')).toBeInTheDocument();
  });

  it('shows an error state with Retry on 500 (never the empty state), and Retry refetches', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'x' }, 500)).mockResolvedValueOnce(json([row()]));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('We could not load property requests')).toBeInTheDocument();
    expect(screen.queryByText('No property requests yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('+91 *****43210')).toBeInTheDocument());
  });

  it('shows an access message (and no Retry) on 403', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Forbidden' }, 403));
    renderPage();
    expect(await screen.findByText('You do not have access to this page.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText('No property requests yet.')).not.toBeInTheDocument();
  });
});
