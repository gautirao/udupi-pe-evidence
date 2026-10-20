/**
 * #2859 B1 — replacement coverage for e2e/journey/admin-listings-inventory-2370.spec.ts (INV1-a, INV1-b.3, INV1-c,
 * INV2-a, INV2-b.1..3, INV2-c, INV3-a, INV4a-a.1/a.2, INV4a-d.1/d.2).
 *
 * The drawer is fed by the REAL `useAdminListingById` (a tiny host), so every transition goes:
 * before state -> action -> write recorded by a stateful fake -> follow-up READ (read counter increments) -> after state.
 * What is real: ListingEditorDrawer + its hooks (useListingEditorState, useListingLifecycleActions), useUpdateListing,
 * useAdminListingById, invalidateListingQueries, react-query, Radix Sheet/AlertDialog/Switch, the real <Toaster/>.
 * Disclosed seams:
 *   - `@/integrations/supabase/client` and `@/lib/api` share ONE in-test state (`fake`): supabase `.update().eq()`
 *     (save, publish/unpublish) and `api.post` (archive/restore) mutate the same row that supabase
 *     `.select().eq().maybeSingle()` serves on the follow-up read. This proves the page's request -> refetch -> render
 *     behaviour, NOT persistence: the Supabase direct-write persisted-state subclaims (INV1-b.2, INV1-d.2, INV2-b.4)
 *     and the archive/restore persistence (INV4a-a.3, INV4a-c.2, INV4a-d.3) stay RETAIN.
 *   - `@/contexts/AuthContext` (isAdmin true), useListingActivity / useAdminListingContact (inert), AddressPicker (stub).
 * Toast store is module-level (TOAST_LIMIT=1): every toast cue asserted here is unique to its it(), and the only
 * 'Listing Updated' assertion runs in the first it() that can produce it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ListingEditorDrawer } from '../ListingEditorDrawer';
import { useAdminListingById, type AdminListingRow } from '@/hooks/useAdminData';

type Row = Record<string, unknown>;
const fake = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  reads: 0,
  updates: [] as Array<{ id: string; updates: Record<string, unknown> }>,
  posts: [] as unknown[][],
  gate: null as Promise<void> | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'property_listings') throw new Error(`fake supabase: unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col: string, id: string) => ({
            maybeSingle: async () => {
              if (col !== 'id') throw new Error(`fake supabase: unexpected eq(${col})`);
              if (fake.gate) await fake.gate;
              fake.reads += 1;
              const row = fake.rows.get(id);
              return { data: row ? { ...row } : null, error: null };
            },
          }),
        }),
        update: (updates: Record<string, unknown>) => ({
          eq: async (col: string, id: string) => {
            if (col !== 'id') throw new Error(`fake supabase: unexpected update eq(${col})`);
            fake.updates.push({ id, updates: { ...updates } });
            const row = fake.rows.get(id);
            if (row) fake.rows.set(id, { ...row, ...updates });
            return { error: null };
          },
        }),
      };
    },
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async () => []),
    post: vi.fn(async (...args: unknown[]) => {
      fake.posts.push(args);
      const m = /^\/api\/admin\/listings\/([^/]+)\/(archive|restore)$/.exec(String(args[0]));
      if (!m) throw new Error(`fake api: unexpected POST ${String(args[0])}`);
      const row = fake.rows.get(m[1]);
      if (!row) throw new Error('fake api: 404');
      fake.rows.set(m[1], { ...row, status: m[2] === 'archive' ? 'ARCHIVED' : 'DRAFT', is_valid: false });
      return { id: m[1], status: m[2] === 'archive' ? 'ARCHIVED' : 'DRAFT' };
    }),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, isBroker: false, isLoading: false, user: { id: 'admin-uid-2859' } }),
}));

vi.mock('@/hooks/useListingActivity', () => ({
  useListingActivity: () => ({ entries: [], isLoading: false, isError: false, windowMayBeIncomplete: false }),
}));

vi.mock('@/hooks/useAdminListingContact', () => ({
  useAdminListingContact: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: () => <div data-testid="address-picker-stub" />,
}));

// jsdom lacks pointer-capture / scrollIntoView used by Radix primitives.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const ID = 'inv-2859';

function makeRow(overrides: Row = {}): Row {
  return {
    id: ID,
    title: 'Synthetic villa 2859',
    property_type: 'villa',
    locality: 'Manipal',
    latitude: 13.34,
    longitude: 74.74,
    price: 5000000,
    price_unit: 'INR',
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    carpet_area: null,
    carpet_area_unit: null,
    super_built_area: null,
    super_built_area_unit: null,
    bedrooms: 3,
    bathrooms: 2,
    description: 'Synthetic description',
    seller_type: 'owner',
    status: 'LIVE',
    is_valid: true,
    is_duplicate: false,
    confidence_score: 90,
    quality_score: 85,
    quality_breakdown: null,
    quality_computed_at: null,
    listing_number: 2859,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    raw_post_id: null,
    raw_posts: null,
    listing_purpose: 'sale',
    language_detected: null,
    price_per_cent_paise: null,
    updated_by: null,
    ...overrides,
  };
}

function Host({ id }: { id: string }) {
  const { data, isLoading } = useAdminListingById(id);
  return (
    <ListingEditorDrawer
      listing={(data ?? undefined) as AdminListingRow | undefined}
      isResolvingListing={isLoading}
      open
      onOpenChange={() => {}}
    />
  );
}

function renderHost(id = ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Host id={id} />
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
}

const PENDING_COPY =
  'This listing is awaiting moderation. Saving here only updates its fields — it never approves, rejects, or changes its status. Decide approval from Pending approvals.';
/** The moderation notice span, matched on its whole normalised text (copy is split across a span and a link). */
const pendingNotices = () =>
  screen.queryAllByText(
    (_c, el) => el?.tagName === 'SPAN' && (el.textContent ?? '').replace(/\s+/g, ' ').trim() === PENDING_COPY,
  );
const switchEl = () => screen.getByRole('switch', { name: 'Toggle public visibility' });
const statusBadge = (status: string) => screen.queryAllByText(status, { exact: true });

beforeEach(() => {
  fake.rows.clear();
  fake.reads = 0;
  fake.updates = [];
  fake.posts = [];
  fake.gate = null;
});

describe('ListingEditorDrawer inventory journeys over a stateful fake (#2859 B1)', () => {
  it('INV1-b.3 + INV1-c: saving an edited title on a PENDING_REVIEW listing writes no status, re-reads the row (reads 1 -> 2), shows the edited title + PENDING_REVIEW + the moderation notice, and renders the "Listing Updated" toast', async () => {
    const user = userEvent.setup();
    fake.rows.set(ID, makeRow({ status: 'PENDING_REVIEW', is_valid: false, title: 'Old title 2859' }));
    renderHost();

    // before
    expect(await screen.findByText('Old title 2859')).toBeInTheDocument();
    expect(statusBadge('PENDING_REVIEW')).toHaveLength(1);
    expect(pendingNotices()).toHaveLength(1);
    expect(fake.reads).toBe(1);
    expect(screen.queryByText('Listing Updated')).toBeNull();

    // action
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Edited title 2859');
    expect(screen.queryByText('Edited title 2859')).toBeNull(); // header not yet changed (input value is not text)
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // write recorded, without status
    await waitFor(() => expect(fake.updates).toHaveLength(1));
    expect(fake.updates[0].id).toBe(ID);
    expect(fake.updates[0].updates.title).toBe('Edited title 2859');
    expect(Object.keys(fake.updates[0].updates)).not.toContain('status');
    expect(Object.keys(fake.updates[0].updates)).toContain('title'); // control: the key list is real

    // follow-up read + after state
    await waitFor(() => expect(fake.reads).toBe(2));
    expect(await screen.findByText('Edited title 2859')).toBeInTheDocument();
    expect(screen.queryByText('Old title 2859')).toBeNull();
    expect(statusBadge('PENDING_REVIEW')).toHaveLength(1);
    expect(pendingNotices()).toHaveLength(1);
    expect(await screen.findByText('Listing Updated')).toBeInTheDocument();
    expect(screen.getByText('The property listing has been updated successfully.')).toBeInTheDocument();
  });

  it('INV1-a: a PENDING_REVIEW listing shows its status badge and the exact moderation notice; a LIVE listing rendered in the same test has neither (same query)', async () => {
    fake.rows.set(ID, makeRow({ status: 'PENDING_REVIEW', is_valid: false }));
    const pending = renderHost();
    await screen.findByText('Synthetic villa 2859');
    expect(statusBadge('PENDING_REVIEW')).toHaveLength(1);
    expect(pendingNotices()).toHaveLength(1);
    pending.unmount();

    fake.rows.set(ID, makeRow({ status: 'LIVE', is_valid: true }));
    renderHost();
    await screen.findByText('Synthetic villa 2859');
    expect(statusBadge('LIVE')).toHaveLength(1); // the LIVE render is real
    expect(statusBadge('PENDING_REVIEW')).toHaveLength(0);
    expect(pendingNotices()).toHaveLength(0);
  });

  it('INV2-a: a LIVE + is_valid listing has an enabled switch, aria-checked true and the "Public" badge; a hidden LIVE listing in the same test shows "Hidden" and no "Public"', async () => {
    fake.rows.set(ID, makeRow({ status: 'LIVE', is_valid: true }));
    const live = renderHost();
    await screen.findByText('Synthetic villa 2859');
    expect(switchEl()).toBeEnabled();
    expect(switchEl()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Public', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Hidden', { exact: true })).toBeNull();
    live.unmount();

    fake.rows.set(ID, makeRow({ status: 'LIVE', is_valid: false }));
    renderHost();
    await screen.findByText('Synthetic villa 2859');
    expect(switchEl()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Hidden', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Public', { exact: true })).toBeNull();
  });

  it('INV2-c: a non-LIVE listing has a disabled switch and the exact "Only LIVE listings ..." helper copy; the LIVE render in the same test is enabled and lacks it', async () => {
    fake.rows.set(ID, makeRow({ status: 'DRAFT', is_valid: false }));
    const draft = renderHost();
    await screen.findByText('Synthetic villa 2859');
    expect(switchEl()).toBeDisabled();
    expect(screen.getByText('Only LIVE listings can be published/unpublished. This listing is DRAFT.')).toBeInTheDocument();
    draft.unmount();

    fake.rows.set(ID, makeRow({ status: 'LIVE', is_valid: true }));
    renderHost();
    await screen.findByText('Synthetic villa 2859');
    expect(switchEl()).toBeEnabled();
    expect(screen.getByText('Controls whether this LIVE listing is visible to the public.')).toBeInTheDocument();
    expect(screen.queryByText(/^Only LIVE listings can be published\/unpublished\./)).toBeNull();
  });

  it('INV2-b.1/b.2/b.3: unpublish then publish — each write is gated by its confirm dialog, sends exactly { is_valid }, is followed by a re-read, and flips the switch + badge on screen', async () => {
    const user = userEvent.setup();
    fake.rows.set(ID, makeRow({ status: 'LIVE', is_valid: true }));
    renderHost();
    await screen.findByText('Synthetic villa 2859');

    // before
    expect(switchEl()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Public', { exact: true })).toBeInTheDocument();
    expect(fake.reads).toBe(1);

    // unpublish: dialog first, no write until Confirm
    await user.click(switchEl());
    const dlg1 = await screen.findByRole('alertdialog');
    expect(within(dlg1).getByRole('heading', { name: 'Unpublish this listing?' })).toBeInTheDocument();
    expect(fake.updates).toHaveLength(0);
    await user.click(within(dlg1).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(fake.updates).toHaveLength(1));
    expect(fake.updates[0]).toEqual({ id: ID, updates: { is_valid: false } });
    await waitFor(() => expect(fake.reads).toBe(2));
    await waitFor(() => expect(switchEl()).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText('Hidden', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Public', { exact: true })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    // publish back: dialog first, no write until Confirm
    await user.click(switchEl());
    const dlg2 = await screen.findByRole('alertdialog');
    expect(within(dlg2).getByRole('heading', { name: 'Publish this listing?' })).toBeInTheDocument();
    expect(fake.updates).toHaveLength(1);
    await user.click(within(dlg2).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(fake.updates).toHaveLength(2));
    expect(fake.updates[1]).toEqual({ id: ID, updates: { is_valid: true } });
    await waitFor(() => expect(fake.reads).toBe(3));
    await waitFor(() => expect(switchEl()).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByText('Public', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Hidden', { exact: true })).toBeNull();
  });

  it('INV4a-a.1/a.2: archiving with a reason POSTs /api/admin/listings/{id}/archive { reasonNote }, re-reads the row (1 -> 2), and shows ARCHIVED + Hidden + the "Listing archived" toast', async () => {
    const user = userEvent.setup();
    fake.rows.set(ID, makeRow({ status: 'LIVE', is_valid: true }));
    renderHost();
    await screen.findByText('Synthetic villa 2859');

    // before
    expect(statusBadge('LIVE')).toHaveLength(1);
    expect(screen.getByText('Public', { exact: true })).toBeInTheDocument();
    expect(fake.reads).toBe(1);
    expect(screen.queryByText('Listing archived')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('heading', { name: 'Archive this listing?' })).toBeInTheDocument();
    await user.type(within(dlg).getByLabelText('Reason (optional)'), 'Synthetic reason 2859');
    expect(fake.posts).toHaveLength(0);
    await user.click(within(dlg).getByRole('button', { name: 'Archive' }));

    // request
    await waitFor(() => expect(fake.posts).toHaveLength(1));
    expect(fake.posts).toEqual([[`/api/admin/listings/${ID}/archive`, { reasonNote: 'Synthetic reason 2859' }]]);
    // follow-up read + after
    await waitFor(() => expect(fake.reads).toBe(2));
    await waitFor(() => expect(statusBadge('ARCHIVED')).toHaveLength(1));
    expect(statusBadge('LIVE')).toHaveLength(0);
    expect(screen.getByText('Hidden', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Public', { exact: true })).toBeNull();
    expect(await screen.findByText('Listing archived')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore to draft' })).toBeInTheDocument();
  });

  it('INV4a-d.1/d.2: restoring an ARCHIVED listing POSTs /api/admin/listings/{id}/restore (no body), re-reads the row (1 -> 2), and shows DRAFT + Hidden + the "Listing restored to draft" toast', async () => {
    const user = userEvent.setup();
    fake.rows.set(ID, makeRow({ status: 'ARCHIVED', is_valid: false }));
    renderHost();
    await screen.findByText('Synthetic villa 2859');

    expect(statusBadge('ARCHIVED')).toHaveLength(1);
    expect(screen.getByText('Hidden', { exact: true })).toBeInTheDocument();
    expect(fake.reads).toBe(1);
    expect(screen.queryByText('Listing restored to draft')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Restore to draft' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('heading', { name: 'Restore this listing?' })).toBeInTheDocument();
    expect(fake.posts).toHaveLength(0);
    await user.click(within(dlg).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(fake.posts).toHaveLength(1));
    expect(fake.posts).toEqual([[`/api/admin/listings/${ID}/restore`]]);
    await waitFor(() => expect(fake.reads).toBe(2));
    await waitFor(() => expect(statusBadge('DRAFT')).toHaveLength(1));
    expect(statusBadge('ARCHIVED')).toHaveLength(0);
    expect(screen.getByText('Hidden', { exact: true })).toBeInTheDocument();
    expect(await screen.findByText('Listing restored to draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('INV3-a: an unknown ?edit id shows a spinner while resolving, then the "Listing not found" title with no spinner', async () => {
    let release: () => void = () => {};
    fake.gate = new Promise<void>((r) => {
      release = r;
    });
    renderHost('does-not-exist-2859');

    // control: spinner present while resolving, no not-found title
    await waitFor(() => expect(document.querySelectorAll('.animate-spin')).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: 'Listing not found' })).toBeNull();

    release();
    expect(await screen.findByRole('heading', { name: 'Listing not found' })).toBeInTheDocument();
    expect(document.querySelectorAll('.animate-spin')).toHaveLength(0);
    expect(fake.reads).toBe(1);
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
  });
});
