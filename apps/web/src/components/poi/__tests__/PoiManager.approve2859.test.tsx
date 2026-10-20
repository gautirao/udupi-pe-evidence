/**
 * #2859 B4 (csv204 e2e/poi-display.spec.ts PM1*, csv205 e2e/poi-locality-teaser.spec.ts POI1/POI2)
 * — the broker's POI curation panel: loading skeleton, suggestion rows, settlement exclusion, and
 * the approve TRANSITION (PATCH -> follow-up GET -> Approved tab active with badge 1).
 *
 * jsdom rules (R_jsdom): the Radix Tabs here are controlled by PoiManager's own state and are never
 * clicked; the manual-tab Select is never opened. api is mocked at the network boundary; the real
 * useQuery/useMutation run, so the follow-up read is the component's own invalidation.
 * Toast (R_toast): a hoisted spy on use-toast proves the toast ARGUMENT only; the visible toast is
 * RETAIN in the B4 map (the real Toaster is not mounted here).
 * Whether the approve is authorised / persisted / publicly visible is the backend slice's
 * PoiApproveAuthorization2859IT (AC4), not this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPatch = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet, patch: mockApiPatch, post: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

import { PoiManager } from '../PoiManager';

const LISTING_ID = '28590004-0000-4000-8000-0000000000b1';

function poi(id: string, name: string, category: string, approved: boolean, distanceMeters = 200) {
  return { id, name, category, distanceMeters, latitude: 13.34, longitude: 74.74, pinned: false, approved, brokerAdded: false };
}

const SUGGESTED = [
  poi('poi-2859-10', 'City Hospital', 'HOSPITAL', false, 200),
  poi('poi-2859-11', 'Central School', 'SCHOOL', false, 400),
  // Settlement POI, deliberately NOT approved: only the settlement filter keeps it out of Suggested.
  poi('poi-2859-12', 'Manipal Town', 'TOWN_CENTER', false, 500),
];
const AFTER_APPROVE = [
  poi('poi-2859-10', 'City Hospital', 'HOSPITAL', true, 200),
  poi('poi-2859-11', 'Central School', 'SCHOOL', false, 400),
  poi('poi-2859-12', 'Manipal Town', 'TOWN_CENTER', false, 500),
];

function renderManager() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PoiManager listingId={LISTING_ID} propertyType="land" />
    </QueryClientProvider>,
  );
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPatch.mockReset();
  mockToast.mockReset();
});

describe('PoiManager approve #2859 B4', () => {
  it('POI1b: shows the skeleton while suggestions load, then the rows replace it', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockApiGet.mockReturnValue(new Promise((r) => { resolve = r; }));

    renderManager();

    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('City Hospital')).not.toBeInTheDocument();

    resolve({ pois: SUGGESTED, providerIssue: false });

    expect(await screen.findByText('City Hospital')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel').querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(mockApiGet).toHaveBeenCalledWith(`/api/listings/${LISTING_ID}/pois/suggestions`);
  });

  it('PM1b-e / POI1c-e: suggestion rows render with Approve buttons; the settlement POI has none while an amenity does', async () => {
    mockApiGet.mockResolvedValue({ pois: SUGGESTED, providerIssue: false });

    renderManager();

    const panel = await screen.findByRole('tabpanel');
    expect(await within(panel).findByText('City Hospital')).toBeInTheDocument();
    expect(within(panel).getByText('Central School')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Approve City Hospital' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Approve Central School' })).toBeInTheDocument();
    // Settlement: no curation row, no Approve button (it is shown read-only in Location Context).
    expect(within(panel).queryByText('Manipal Town')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve Manipal Town' })).not.toBeInTheDocument();
  });

  it('PM1f-j / POI2b-f: Approve PATCHes the exact path, refetches, and switches to the Approved tab with badge 1 and the row', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockApiGet
      .mockResolvedValueOnce({ pois: SUGGESTED, providerIssue: false })
      .mockResolvedValue({ pois: AFTER_APPROVE, providerIssue: false });
    mockApiPatch.mockResolvedValue({});

    renderManager();

    // Before: Suggested active, Approved has no count badge, one read so far.
    await screen.findByRole('button', { name: 'Approve City Hospital' });
    expect(tab(/Suggested nearby places/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/^Approved/)).toHaveAttribute('aria-selected', 'false');
    expect(tab(/^Approved/).textContent).toBe('Approved');
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Approve City Hospital' }));

    expect(mockApiPatch).toHaveBeenCalledTimes(1);
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/listings/${LISTING_ID}/pois/poi-2859-10/approve`);
    // Follow-up read count increments (the component's own invalidation).
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));

    // After: Approved tab active, badge 1, the approved row is listed there without an Approve button.
    await waitFor(() => expect(tab(/^Approved/)).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(tab(/^Approved/).textContent).toBe('Approved1'));
    const approvedPanel = screen.getByRole('tabpanel');
    expect(within(approvedPanel).getByText('City Hospital')).toBeInTheDocument();
    expect(within(approvedPanel).queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('PM1.error: a failed approve calls the destructive "Approval failed" toast and the Suggested tab stays active', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockApiGet.mockResolvedValue({ pois: SUGGESTED, providerIssue: false });
    mockApiPatch.mockRejectedValue(new Error('synthetic 403'));

    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Approve City Hospital' }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Approval failed', variant: 'destructive' }),
    );
    // The PATCH really was attempted (positive control for the stay-put assertion below).
    expect(mockApiPatch).toHaveBeenCalledWith(`/api/listings/${LISTING_ID}/pois/poi-2859-10/approve`);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
    expect(tab(/Suggested nearby places/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/^Approved/)).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: 'Approve City Hospital' })).toBeInTheDocument();
  });
});
