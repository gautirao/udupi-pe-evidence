/**
 * #2859 B1 Codex round 1 (F1) — TIR3.1 select-interaction subclaim: ONE test that picks the identity document type
 * through the REAL Radix Select inside the REAL identity Dialog (no ui/select mock) and proves the pick reaches the
 * submit FormData `document_type`. Isolated in its own file because opening a real Radix Select is slow in jsdom
 * (~13 s per open, Preferences.pageHttp.test.tsx header). Drive = synchronous keyboard events on the trigger and the
 * option (precedent Preferences.realSelect2859.test.tsx / BrokerDemandGaps.pageHttp 'DG6a'); per-test timeout 90 s.
 * Seams (as TrustProgressPanel.identity2859.test.tsx): `@/lib/api` (trust-progress GET fake), global `fetch` (submit),
 * supabase.auth.getSession (DUMMY token), `@/hooks/use-toast` (spy). PII: synthetic literals only.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const LISTING = 'listing-2859-rs';
const SUBMIT_URL = `http://127.0.0.1:1/api/listings/${LISTING}/trust/identity/submit-evidence`;

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }
  return { api: mockApi, ApiError: MockApiError, API_BASE_URL: 'http://127.0.0.1:1' };
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'dummy-test-token-2859' } } })) } },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// jsdom lacks the pointer-capture / scrollIntoView APIs Radix Select calls.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { TrustProgressPanel } from '../TrustProgressPanel';

describe('TrustProgressPanel identity dialog real Radix Select (#2859 B1, TIR3.1 select interaction)', () => {
  it('TIR3.1-select: picking "PAN Card" through the REAL document-type Select enables Submit and the submit FormData carries document_type=PAN', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path !== `/api/listings/${LISTING}/trust-progress`) throw new Error(`fake api: unexpected GET ${path}`);
      return { badges: [{ dimensionType: 'IDENTITY', badgeState: 'AVAILABLE', grantedAt: null, autoGranted: null }], cta: null };
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url === SUBMIT_URL && init?.method === 'POST'
        ? new Response(JSON.stringify({ message: 'ok', evidenceId: 'ev-rs' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TrustProgressPanel listingId={LISTING} variant="full" />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Verify your identity' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(dialog.querySelector('#ie-legal-name') as HTMLElement, 'Test Owner Name');
    await user.type(dialog.querySelector('#ie-phone') as HTMLElement, '+91 00000 02859');
    await user.upload(
      dialog.querySelector('#ie-file') as HTMLInputElement,
      new File(['%PDF-1.4 synthetic'], 'synthetic-id-2859.pdf', { type: 'application/pdf' }),
    );

    const submit = within(dialog).getByRole('button', { name: 'Submit for review' });
    expect(submit).toBeDisabled(); // before: no document type picked
    const trigger = within(dialog).getByRole('combobox');
    expect(trigger).toHaveTextContent('Select document type');

    // real Radix Select, synchronous drive (no macrotask await while it is open)
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('option', { name: 'PAN Card' }), { key: 'Enter' });

    expect(within(dialog).getByRole('combobox')).toHaveTextContent('PAN Card'); // the trigger shows the pick
    expect(within(dialog).getByRole('button', { name: 'Submit for review' })).toBeEnabled(); // after
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 60_000 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SUBMIT_URL);
    const fd = init?.body as FormData;
    expect(fd.getAll('document_type')).toEqual(['PAN']);
    vi.unstubAllGlobals();
  }, 90_000);
});
