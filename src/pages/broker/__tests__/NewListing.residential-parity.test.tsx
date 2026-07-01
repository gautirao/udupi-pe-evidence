/**
 * NewListing — residential single-page create-flow design parity (M38-13A, #1626 follow-up).
 *
 * Phase-7A FIX-A/B: the residential single-page composition is now the DEFAULT landing
 * at /broker/listings/new (Apartment preselected, mock default) — it is no longer reached
 * only after picking a residential type. The old unfiltered 10-type generic entry (incl.
 * commercial/agri) is reached via the residential view's "Switch flow" affordance.
 *
 * UT-a: DEFAULT landing (no interaction) renders the residential single-page with
 *       ONLY the 4 residential subtypes (Apartment preselected); commercial + agricultural
 *       type labels ABSENT until "Switch flow" is used.
 * UT-b: the seven numbered sections render in order.
 * UT-c: the old 4-step stepper is NOT present in the residential create flow (default
 *       landing, no interaction required).
 * UT-d: buyer-preview panel + listing-strength meter both render.
 * UT-e: typing title/locality/price/selecting a type updates the preview AND
 *       increases the strength %.
 * UT-f: "More details" collapsed by default; expands/collapses on click.
 * UT-g: footer renders "Save draft" + "Review & publish"; NOT "Save & Continue".
 * UT-h: purpose=sale shows sale-terms fields; purpose=rent shows rent-terms
 *       fields; each hides the other set.
 * UT-i: Apartment shows apartment fields not plot fields; Plot shows plot
 *       fields not residence fields (via isListingFieldVisible, unchanged).
 * UT-l: PropertyTypeCardSelector default (residentialOnly unset) behaves
 *       exactly as before — all 10 types, no filtering. "Switch flow" reaches this
 *       unfiltered entry so commercial/agri stay creatable (FIX-B non-regression).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockMutate = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userRole: 'dealer',
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useBrokerListings', () => ({
  useCreateListing: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: () => null,
}));

vi.mock('@/components/broker/PriceField', () => ({
  PriceField: ({ onChange }: { onChange: (v: number | null) => void }) => (
    <input
      data-testid="price-field"
      type="number"
      onChange={(e) => onChange(parseFloat(e.target.value) || null)}
    />
  ),
}));

vi.mock('@/components/broker/AreaField', () => ({
  AreaField: ({ label, onChange }: { label?: string; onChange: (a: number | null, u: string) => void }) => (
    <input
      data-testid="area-field"
      aria-label={label ?? 'area'}
      type="number"
      onChange={(e) => onChange(parseFloat(e.target.value) || null, 'sqft')}
    />
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-select-value={value || 'empty'}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <span id={id}>{children}</span>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import NewListing from '../NewListing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/broker/listings/new']}>
      <QueryClientProvider client={makeQC()}>
        <NewListing />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function selectPropertyType(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('radio', { name: label }));
}

beforeEach(() => {
  mockMutate.mockReset();
  mockNavigate.mockReset();
});

describe('NewListing — residential type selector (UT-a, UT-l)', () => {
  it('UT-a (Phase-7A FIX-A): DEFAULT landing (no interaction) renders ONLY the 4 residential types, Apartment preselected — commercial/agri ABSENT', () => {
    renderPage();

    // Apartment is the mock default — preselected without any click.
    expect(screen.getByRole('radio', { name: 'Apartment' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'House' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Villa' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Residential Plot' })).toBeInTheDocument();

    // Commercial/agri are NOT part of the default landing — only reachable via "Switch flow".
    expect(screen.queryByRole('radio', { name: 'Commercial Shop/Office' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Agricultural Land' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Warehouse / Godown' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Commercial Land' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Land' })).not.toBeInTheDocument();

    // Residential header, not the old generic "Create New Listing" header.
    expect(screen.getByText('Create a listing')).toBeInTheDocument();
    expect(screen.queryByText('Create New Listing')).not.toBeInTheDocument();
  });

  it('UT-a/UT-l: after selecting a different residential type, the type selector still shows ONLY the 4 residential types', async () => {
    const user = userEvent.setup();
    renderPage();

    await selectPropertyType(user, 'House');

    expect(screen.getByRole('radio', { name: 'Apartment' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'House' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Villa' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Residential Plot' })).toBeInTheDocument();

    expect(screen.queryByRole('radio', { name: 'Commercial Shop/Office' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Agricultural Land' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Warehouse / Godown' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Commercial Land' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Land' })).not.toBeInTheDocument();
  });

  it('FIX-B: "Switch flow" from the DEFAULT landing (no prior selection) reaches the unfiltered commercial/agri generic entry', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Switch flow' }));

    expect(screen.getByRole('radio', { name: 'Commercial Shop/Office' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Agricultural Land' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Warehouse / Godown' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Commercial Land' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Land' })).toBeInTheDocument();
  });

  it('"Switch flow" returns to the unfiltered generic entry (commercial/agri preserved, reachable)', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'House');

    await user.click(screen.getByRole('button', { name: 'Switch flow' }));

    expect(screen.getByRole('radio', { name: 'Commercial Shop/Office' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Agricultural Land' })).toBeInTheDocument();
  });
});

describe('NewListing — residential composition structure (UT-b, UT-c, UT-d, UT-g)', () => {
  it('UT-b: renders the seven numbered sections in order', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Property type & purpose',
      'Where is it?',
      'Property details',
      'Sale terms',
      'More details / Ownership & document details',
      'Photos, video & location',
      'Description',
    ]);
  });

  it('UT-c: the old 4-step stepper labels are NOT present in the residential flow', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    expect(screen.queryByText('Add Photos')).not.toBeInTheDocument();
    expect(screen.queryByText('Pin Location')).not.toBeInTheDocument();
    expect(screen.queryByText('Review & Submit')).not.toBeInTheDocument();
    expect(screen.getByText('Create a listing')).toBeInTheDocument();
  });

  it('UT-c (Phase-7A FIX-A): the old 4-step stepper is NOT present on the DEFAULT landing (no interaction)', () => {
    renderPage();

    expect(screen.queryByText('Describe')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Photos')).not.toBeInTheDocument();
    expect(screen.queryByText('Pin Location')).not.toBeInTheDocument();
    expect(screen.queryByText('Review & Submit')).not.toBeInTheDocument();
    expect(screen.queryByText('Create New Listing')).not.toBeInTheDocument();

    // Residential header present instead, with no interaction required.
    expect(screen.getByText(/residential listing/i)).toBeInTheDocument();
    expect(screen.getByText('Create a listing')).toBeInTheDocument();
  });

  it('UT-d: buyer-preview panel and listing-strength meter both render', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    expect(screen.getByTestId('buyer-preview-card')).toBeInTheDocument();
    expect(screen.getByTestId('listing-strength-meter')).toBeInTheDocument();
  });

  it('UT-g: footer renders "Save draft" and "Review & publish", not "Save & Continue"', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review & publish/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save & continue/i })).not.toBeInTheDocument();
  });
});

describe('NewListing — residential preview + strength react to form state (UT-e)', () => {
  it('typing a title updates the buyer preview and increases listing strength %', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    const strengthBefore = within(screen.getByTestId('listing-strength-meter')).getByText(/%/).textContent;

    await user.type(screen.getByLabelText('Listing title *'), 'Spacious 2BHK near the beach');
    await user.type(screen.getByLabelText('Locality / area *'), 'Malpe');
    const priceField = screen.getByTestId('price-field');
    await user.type(priceField, '5000000');

    expect(within(screen.getByTestId('buyer-preview-card')).getByText('Spacious 2BHK near the beach')).toBeInTheDocument();
    expect(within(screen.getByTestId('buyer-preview-card')).getByText('Malpe')).toBeInTheDocument();

    const strengthAfter = within(screen.getByTestId('listing-strength-meter')).getByText(/%/).textContent;
    expect(strengthAfter).not.toBe(strengthBefore);
  });
});

describe('NewListing — "More details" collapsible (UT-f)', () => {
  it('is collapsed by default and expands/collapses on click', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    // Ownership type is inside the collapsible content; hidden by default.
    expect(screen.queryByText('Ownership type')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /More details/ }));
    expect(screen.getByText('Ownership type')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /More details/ }));
    expect(screen.queryByText('Ownership type')).not.toBeInTheDocument();
  });
});

describe('NewListing — sale vs rent field gating (UT-h)', () => {
  it('sale purpose shows price/ownership(sale)/property-status; hides rent-only fields', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    expect(screen.getByTestId('price-field')).toBeInTheDocument();
    expect(screen.getByText('Property status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Monthly rent (₹) *')).not.toBeInTheDocument();
    expect(screen.queryByText('Preferred tenants')).not.toBeInTheDocument();
  });

  it('rent purpose shows monthly rent/deposit/lock-in/preferred tenants/pets; hides sale-only fields', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    await user.click(screen.getByRole('button', { name: 'For Rent' }));

    expect(screen.getByLabelText('Monthly rent (₹) *')).toBeInTheDocument();
    expect(screen.getByLabelText('Security deposit (months)')).toBeInTheDocument();
    expect(screen.getByLabelText('Lock-in period (months)')).toBeInTheDocument();
    expect(screen.getByText('Preferred tenants')).toBeInTheDocument();
    expect(screen.getByText('Pets allowed')).toBeInTheDocument();

    expect(screen.queryByTestId('price-field')).not.toBeInTheDocument();
    expect(screen.queryByText('Property status')).not.toBeInTheDocument();
  });
});

describe('NewListing — buyer-preview honest-null on mid-flow type switch (code-review follow-up)', () => {
  it('clears stale BHK/bathroom spec chips when switching Apartment -> Residential Plot without a full reset', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    const bedroomsGroup = screen.getByText('Bedrooms (BHK)').closest('div') as HTMLElement;
    await user.click(within(bedroomsGroup).getByRole('radio', { name: '3' }));
    const bathroomsGroup = screen.getByText('Bathrooms').closest('div') as HTMLElement;
    await user.click(within(bathroomsGroup).getByRole('radio', { name: '2' }));

    const preview = screen.getByTestId('buyer-preview-card');
    expect(within(preview).getByText('3 BHK')).toBeInTheDocument();
    expect(within(preview).getByText('2 Bath')).toBeInTheDocument();

    // Switch property type mid-flow WITHOUT a full form reset — bedrooms/bathrooms
    // state is raw useState and is not cleared, but the preview must never show a
    // fabricated chip for a field the new type (plot) doesn't collect.
    await selectPropertyType(user, 'Residential Plot');

    expect(within(preview).queryByText('3 BHK')).not.toBeInTheDocument();
    expect(within(preview).queryByText('2 Bath')).not.toBeInTheDocument();
  });
});

describe('NewListing — type-adaptive field visibility (UT-i)', () => {
  it('Apartment shows apartment fields (balconies, super built-up area), not plot fields', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Apartment');

    expect(screen.getByText('Balconies')).toBeInTheDocument();
    expect(screen.getByText('Super built-up area (sqft)')).toBeInTheDocument();
    expect(screen.queryByText('Plot dimensions')).not.toBeInTheDocument();
    expect(screen.queryByText('Corner plot')).not.toBeInTheDocument();
  });

  it('Residential Plot shows plot fields, not residence-only fields (BHK/bathrooms/balconies/furnishing/floors/parking)', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'Residential Plot');

    expect(screen.getByText('Plot dimensions')).toBeInTheDocument();
    expect(screen.getByText('Corner plot')).toBeInTheDocument();

    expect(screen.queryByText('Bedrooms (BHK)')).not.toBeInTheDocument();
    expect(screen.queryByText('Bathrooms')).not.toBeInTheDocument();
    expect(screen.queryByText('Balconies')).not.toBeInTheDocument();
    expect(screen.queryByText('Furnishing')).not.toBeInTheDocument();
    expect(screen.queryByText('Number of floors')).not.toBeInTheDocument();
    expect(screen.queryByText('2-wheeler parking')).not.toBeInTheDocument();
  });

  it('House/Villa show the house field set (number of floors, property age, water source)', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPropertyType(user, 'House');

    expect(screen.getByText('Number of floors')).toBeInTheDocument();
    expect(screen.getByText('Property age')).toBeInTheDocument();
    expect(screen.getByText('Water source')).toBeInTheDocument();
    expect(screen.queryByText('Plot dimensions')).not.toBeInTheDocument();
  });
});
