/**
 * #2859 B1 — replacement coverage for e2e/journey/trust-identity-review.spec.ts, broker side (TIR1, TIR2, TIR3.1, TIR4,
 * TIR7-a CTA-gone). The IDENTITY row of TrustProgressPanel over a STATEFUL fake:
 *   - `api.get('/api/listings/<id>/trust-progress')` serves the fake's current IDENTITY badgeState and counts reads;
 *   - global `fetch` answers POST `${API_BASE_URL}/api/listings/<id>/trust/identity/submit-evidence` 200 and flips the
 *     fake to PENDING (the server-side PENDING truth is TrustIdentityApprovalIT, not this file).
 * What is real: TrustProgressPanel, IdentityEvidenceForm, useIdentityVerification (FormData build, raw fetch,
 * invalidate -> refetch), react-query, the Radix Dialog.
 * Disclosed seams: `@/components/ui/select` is a FILE-SCOPED pass-through (document-type options are always-rendered
 * buttons; the real-Radix Select pick is proven once in Preferences.realSelect2859.test.tsx); `@/hooks/use-toast` is a
 * spy (its success description contains the pending copy as a substring); supabase.auth.getSession returns a DUMMY token.
 * PII: synthetic literals only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const BASE = 'http://127.0.0.1:1';
const LISTING = 'listing-2859';
const SUBMIT_URL = `${BASE}/api/listings/${LISTING}/trust/identity/submit-evidence`;
const PROGRESS_PATH = `/api/listings/${LISTING}/trust-progress`;
const DUMMY_TOKEN = 'dummy-test-token-2859';
const PENDING_COPY = 'Under review -- usually 1-2 business days';

const fake = vi.hoisted(() => ({ identity: 'AVAILABLE' as string, gets: 0 }));
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

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

vi.mock('@/components/ui/select', () => {
  type VC = { onValueChange?: (v: string) => void };
  const pass = (children: React.ReactNode, onValueChange?: (v: string) => void) =>
    React.Children.map(children, (child) =>
      React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<VC>, { onValueChange }) : child,
    );
  return {
    Select: ({ children, onValueChange }: { children: React.ReactNode } & VC) => <div>{pass(children, onValueChange)}</div>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div role="combobox">{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children, onValueChange }: { children: React.ReactNode } & VC) => <div>{pass(children, onValueChange)}</div>,
    SelectItem: ({ children, value, onValueChange }: { children: React.ReactNode; value: string } & VC) => (
      <button type="button" data-testid={`select-item-${value}`} onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    ),
  };
});

import { TrustProgressPanel } from '../TrustProgressPanel';

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url !== SUBMIT_URL || init?.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  fake.identity = 'PENDING';
  return new Response(JSON.stringify({ message: 'ok', evidenceId: 'ev-2859' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrustProgressPanel listingId={LISTING} variant="full" />
    </QueryClientProvider>,
  );
}

const cta = () => screen.queryAllByRole('button', { name: 'Verify your identity' });

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(cta()[0]);
  const dialog = await screen.findByRole('dialog');
  await user.type(dialog.querySelector('#ie-legal-name') as HTMLElement, 'Test Owner Name');
  await user.type(dialog.querySelector('#ie-phone') as HTMLElement, '+91 00000 02859');
  await user.click(within(dialog).getByTestId('select-item-AADHAAR'));
  const file = new File(['%PDF-1.4 synthetic'], 'synthetic-id-2859.pdf', { type: 'application/pdf' });
  await user.upload(dialog.querySelector('#ie-file') as HTMLInputElement, file);
  return { dialog, file };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.identity = 'AVAILABLE';
  fake.gets = 0;
  mockApi.get.mockImplementation(async (path: string) => {
    if (path !== PROGRESS_PATH) throw new Error(`fake api: unexpected GET ${path}`);
    fake.gets += 1;
    return {
      badges: [{ dimensionType: 'IDENTITY', badgeState: fake.identity, grantedAt: null, autoGranted: null }],
      cta: null,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TrustProgressPanel IDENTITY journey (#2859 B1)', () => {
  it('TIR1 + TIR7-a: IDENTITY AVAILABLE shows exactly one "Verify your identity" CTA; an EARNED render in the same test shows "Verified" and 0 CTAs by the same query', async () => {
    const available = renderPanel();
    await screen.findByText('Identity');
    await waitFor(() => expect(cta()).toHaveLength(1));
    available.unmount();

    fake.identity = 'EARNED';
    renderPanel();
    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(cta()).toHaveLength(0);
  });

  it('TIR2: no dialog before the click; after clicking the CTA the dialog has the heading, #ie-legal-name, #ie-phone, #ie-file and the document-type combobox', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(cta()).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(cta()[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Verify your identity' })).toBeInTheDocument();
    expect(dialog.querySelector('input#ie-legal-name')).not.toBeNull();
    expect(dialog.querySelector('input#ie-phone')).not.toBeNull();
    expect(dialog.querySelector('input#ie-file[type="file"]')).not.toBeNull();
    expect(within(dialog).getByRole('combobox')).toHaveTextContent('Select document type');
    expect(within(dialog).getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  });

  it('TIR3.1: Submit sends ONE POST to ${API_BASE_URL}/api/listings/<id>/trust/identity/submit-evidence with a dummy bearer and FormData legal_name, phone_number, document_type=AADHAAR, file', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(cta()).toHaveLength(1));
    const { dialog, file } = await openAndFill(user);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Submit for review' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SUBMIT_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: `Bearer ${DUMMY_TOKEN}` });
    const entries = Array.from((init?.body as FormData).entries());
    expect(entries.map(([k]) => k)).toEqual(['legal_name', 'phone_number', 'document_type', 'file']);
    expect(entries.slice(0, 3)).toEqual([
      ['legal_name', 'Test Owner Name'],
      ['phone_number', '+91 00000 02859'],
      ['document_type', 'AADHAAR'],
    ]);
    const sent = entries[3][1] as File;
    expect(sent.name).toBe(file.name);
    expect(sent.type).toBe('application/pdf');
  });

  it('TIR4: after a 200 submit the dialog closes, the trust-progress GET is re-issued (1 -> 2) and the row shows the exact pending copy with the CTA gone', async () => {
    const user = userEvent.setup();
    renderPanel();

    // before
    await waitFor(() => expect(cta()).toHaveLength(1));
    expect(fake.gets).toBe(1);
    expect(screen.queryByText(PENDING_COPY)).toBeNull();

    const { dialog } = await openAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Submit for review' }));

    // follow-up read + after
    await waitFor(() => expect(fake.gets).toBe(2));
    expect(await screen.findByText(PENDING_COPY)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cta()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
