/**
 * #2859 B3 — PoiManager replacement for e2e/residential-create-listing-1722.spec.ts
 * "POI modes" (R12), "add manually" (R13), "blank distance" (R14) and "two manual POIs"
 * (R15, UI subclaim only), csv210.
 *
 * STATEFUL fake over @/lib/api: GET /pois/suggestions returns the in-test store; PATCH
 * approve and POST manual mutate it; the GET call count proves the refetch. The Radix
 * Select is replaced by a FILE-SCOPED native <select> pass-through (the real Select
 * cannot be completed in this jsdom, see PoiManager.test.tsx:293-313), so the category /
 * unit Select gesture itself is RETAIN (R_injected). Payloads are client requests; the DB
 * unique-constraint (V139) is not claimed.
 */
import type { ReactElement, ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Poi = {
  id: string; name: string; category: string; distanceMeters: number | null;
  latitude: number | null; longitude: number | null; pinned: boolean; approved: boolean; brokerAdded?: boolean;
};
const store = vi.hoisted(() => ({ pois: [] as Poi[], gets: 0, posts: [] as Array<Record<string, unknown>>, seq: 0 }));
const mockApi = vi.hoisted(() => ({
  get: vi.fn(async () => {
    store.gets += 1;
    return { pois: store.pois.map((p) => ({ ...p })), providerIssue: false };
  }),
  post: vi.fn(async (_url: string, body: Record<string, unknown>) => {
    store.posts.push(body);
    store.seq += 1;
    store.pois.push({
      id: `manual-${store.seq}`, name: body.name as string, category: body.category as string,
      distanceMeters: body.distanceMeters as number | null, latitude: null, longitude: null,
      pinned: false, approved: true, brokerAdded: true,
    });
    return {};
  }),
  patch: vi.fn(async (url: string) => {
    const id = url.split('/pois/')[1].split('/')[0];
    store.pois = store.pois.map((p) => (p.id === id ? { ...p, approved: true } : p));
    return {};
  }),
  delete: vi.fn(async () => ({})),
}));
vi.mock('@/lib/api', () => ({ api: mockApi }));

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select data-testid="select-pass-through" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">--</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { PoiManager } from '../PoiManager';

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const selects = () => screen.getAllByTestId('select-pass-through') as HTMLSelectElement[];
const addBtn = () => screen.getByRole('button', { name: 'Add place' });
const approvedTab = () => screen.getByRole('tab', { name: /^approved/i });

beforeEach(() => {
  vi.clearAllMocks();
  store.pois = [];
  store.gets = 0;
  store.posts = [];
  store.seq = 0;
  window.localStorage.clear();
});

describe('PoiManager — POI modes + add manually over a stateful fake (#2859 B3 csv210)', () => {
  it('R12b approving a suggestion moves it to Approved (tab active, badge 1) and out of Suggested', async () => {
    store.pois = [{ id: 'poi-1', name: 'KMC Hospital', category: 'HOSPITAL', distanceMeters: 300, latitude: 1, longitude: 1, pinned: false, approved: false }];
    const u = user();
    renderWithClient(<PoiManager listingId="listing-2859" propertyType="apartment" />);
    expect(await screen.findByText('KMC Hospital')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /suggested nearby places/i })).toHaveAttribute('data-state', 'active');
    expect(within(approvedTab()).queryByText('1')).not.toBeInTheDocument();
    const getsBefore = store.gets;

    await u.click(screen.getByRole('button', { name: 'Approve KMC Hospital' }));

    await waitFor(() => expect(approvedTab()).toHaveAttribute('data-state', 'active'));
    await waitFor(() => expect(store.gets).toBe(getsBefore + 1));
    expect(await within(approvedTab()).findByText('1')).toBeInTheDocument();
    expect(screen.getByText('KMC Hospital')).toBeInTheDocument();

    await u.click(screen.getByRole('tab', { name: /suggested nearby places/i }));
    expect(screen.queryByText('KMC Hospital')).not.toBeInTheDocument();
    expect(screen.getByText('All suggestions reviewed')).toBeInTheDocument();
  });

  it('R13 validation gates Add place; a valid add posts 500 m, lands on Approved with BROKER-ADDED and the row line; the form is empty again', async () => {
    const u = user();
    renderWithClient(<PoiManager listingId="listing-2859" propertyType="apartment" />);
    expect(await screen.findByText(/no nearby places were found/i)).toBeInTheDocument();
    await u.click(screen.getByRole('tab', { name: /add manually/i }));
    const name = await screen.findByLabelText('Name');
    const distance = screen.getByLabelText(/distance from property/i);

    fireEvent.change(selects()[0], { target: { value: 'SCHOOL' } });
    expect(addBtn()).toBeDisabled(); // name missing
    fireEvent.change(name, { target: { value: 'Manipal Public School' } });
    expect(addBtn()).toBeEnabled();

    fireEvent.change(distance, { target: { value: 'abc' } });
    expect(distance).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/enter a positive number, like 1\.3 or 850/i)).toBeInTheDocument();
    expect(addBtn()).toBeDisabled();
    fireEvent.change(distance, { target: { value: '-5' } });
    expect(addBtn()).toBeDisabled();
    fireEvent.change(distance, { target: { value: '' } });
    expect(distance).toHaveAttribute('aria-invalid', 'false');
    expect(addBtn()).toBeEnabled();
    fireEvent.change(distance, { target: { value: '0.5' } });
    expect(addBtn()).toBeEnabled();
    const getsBefore = store.gets;

    await u.click(addBtn());

    expect(store.posts).toEqual([{ name: 'Manipal Public School', category: 'SCHOOL', distanceMeters: 500 }]);
    await waitFor(() => expect(approvedTab()).toHaveAttribute('data-state', 'active'));
    await waitFor(() => expect(store.gets).toBe(getsBefore + 1));
    const row = (await screen.findByText('Manipal Public School')).closest('div.flex-1') as HTMLElement;
    expect(within(row).getByText('BROKER-ADDED')).toBeInTheDocument();
    expect(within(row).getByText('School / University · 500 m')).toBeInTheDocument();

    await u.click(screen.getByRole('tab', { name: /add manually/i }));
    expect(await screen.findByLabelText('Name')).toHaveValue('');
  });

  it('R14 a blank distance posts null and the row shows the category only (no distance, no placeholder)', async () => {
    const u = user();
    renderWithClient(<PoiManager listingId="listing-2859" propertyType="apartment" />);
    await u.click(await screen.findByRole('tab', { name: /add manually/i }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Corner Kirana Store' } });
    fireEvent.change(selects()[0], { target: { value: 'GROCERY' } });
    await u.click(addBtn());

    expect(store.posts).toEqual([{ name: 'Corner Kirana Store', category: 'GROCERY', distanceMeters: null }]);
    const row = (await screen.findByText('Corner Kirana Store')).closest('div.flex-1') as HTMLElement;
    expect(within(row).getByText('BROKER-ADDED')).toBeInTheDocument();
    expect(within(row).getByText('Supermarket / Market', { exact: true })).toBeInTheDocument();
    expect(row.textContent).not.toContain('·');
    expect(row.textContent).not.toMatch(/manual/i);
  });

  it('R15 UI: two manual POIs on one listing (km then m) both render and the Approved badge reads 2', async () => {
    const u = user();
    renderWithClient(<PoiManager listingId="listing-2859" propertyType="apartment" />);
    await u.click(await screen.findByRole('tab', { name: /add manually/i }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Riverside Temple' } });
    fireEvent.change(selects()[0], { target: { value: 'WORSHIP' } });
    fireEvent.change(screen.getByLabelText(/distance from property/i), { target: { value: '1.3' } });
    await u.click(addBtn());
    expect(await screen.findByText('Riverside Temple')).toBeInTheDocument();

    await u.click(screen.getByRole('tab', { name: /add manually/i }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Main Road Bus Stop' } });
    fireEvent.change(selects()[0], { target: { value: 'TRANSPORT' } });
    fireEvent.change(screen.getByLabelText(/distance from property/i), { target: { value: '850' } });
    fireEvent.change(selects()[1], { target: { value: 'm' } });
    await u.click(addBtn());

    expect(await screen.findByText('Main Road Bus Stop')).toBeInTheDocument();
    expect(screen.getByText('Riverside Temple')).toBeInTheDocument();
    expect(within(approvedTab()).getByText('2')).toBeInTheDocument();
    expect(store.posts.map((p) => [p.name, p.distanceMeters])).toEqual([
      ['Riverside Temple', 1300],
      ['Main Road Bus Stop', 850],
    ]);
  });
});
