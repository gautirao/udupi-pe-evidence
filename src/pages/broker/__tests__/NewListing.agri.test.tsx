/**
 * NewListing — agricultural_land property type tests (Issue #1364)
 *
 * AC1: When propertyType = 'agricultural_land', the agri fields section renders.
 * AC2: Agri section is ABSENT for 'land' and 'apartment'.
 * AC3: When propertyType = 'agricultural_land' and waterSource is set,
 *      createListing.mutate is called with waterSource in the payload.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// Layout/UI stubs — avoid rendering full AppLayout in jsdom
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

// AreaField stub — renders a simple input so AreaField unit tests remain isolated
vi.mock('@/components/broker/AreaField', () => ({
  AreaField: () => <div data-testid="area-field" />,
}));

// shadcn Select stub — renders a native <select> labeled by its htmlFor-matching label.
// We expose a data-testid="select-{id}" so tests can query the property-type select
// specifically, and also render an aria-label for convenience.
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
    // data-select-value lets tests pick the right <select> when there are many
    <select
      data-select-value={value || 'empty'}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    // Render the id here so htmlFor on Label associates to the <select> via SelectContent
    <span id={id}>{children}</span>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
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

/**
 * Property type is now a card grid (PropertyTypeCardSelector) rendering each
 * option as a role="radio" button. Click the card by its accessible label.
 */
async function selectPropertyType(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByRole('radio', { name: label }));
}

/**
 * Phase-7A FIX-A/B (#1626 follow-up): /broker/listings/new now lands by DEFAULT on the
 * residential single-page composition (Apartment preselected), which only offers the 4
 * residential subtypes. Agricultural/commercial/land types are reached via the residential
 * view's "Switch flow" affordance, which returns to the original unfiltered 10-type generic
 * entry these agri tests exercise.
 */
async function switchToGenericFlow(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Switch flow' }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockMutate.mockReset();
  mockNavigate.mockReset();
});

describe('NewListing — agricultural_land (AC1: agri section renders)', () => {
  it('shows the agri fields section when agricultural_land is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    // Phase-7A FIX-A: default landing is the residential view — reach the generic
    // entry (where agricultural_land lives) via "Switch flow" first.
    await switchToGenericFlow(user);
    await selectPropertyType(user, 'Agricultural Land');

    expect(screen.getByTestId('agri-fields-section')).toBeInTheDocument();
    expect(screen.getByText('Agricultural Land Details')).toBeInTheDocument();
    expect(screen.getByText('Survey Number')).toBeInTheDocument();
  });
});

describe('NewListing — agricultural_land (AC2: agri section absent for other types)', () => {
  it('does NOT show agri section for land', async () => {
    const user = userEvent.setup();
    renderPage();

    await switchToGenericFlow(user);
    await selectPropertyType(user, 'Land');

    expect(screen.queryByTestId('agri-fields-section')).not.toBeInTheDocument();
  });

  it('does NOT show agri section for apartment', async () => {
    const user = userEvent.setup();
    renderPage();

    // Apartment is the residential default — already selected without any click,
    // and the agri section never existed in the residential composition regardless.
    await selectPropertyType(user, 'Apartment');

    expect(screen.queryByTestId('agri-fields-section')).not.toBeInTheDocument();
  });
});

describe('NewListing — agricultural_land (AC3: payload includes waterSource)', () => {
  it('calls createListing.mutate with waterSource when set', async () => {
    const user = userEvent.setup();
    renderPage();

    // Select agricultural_land via the generic entry (Phase-7A FIX-A/B).
    await switchToGenericFlow(user);
    await selectPropertyType(user, 'Agricultural Land');

    // Set a valid price so the form can submit
    const priceField = screen.getByTestId('price-field');
    await user.type(priceField, '5000000');

    // Select water source — it appears after the agri section renders.
    // The Water Source select is identifiable by its data-select-value being initially empty
    // and being under the agri-fields-section.
    const agriSection = screen.getByTestId('agri-fields-section');
    const waterSourceSelect = agriSection.querySelectorAll('select')[0] as HTMLSelectElement;
    await user.selectOptions(waterSourceSelect, 'Borewell');

    // Click Save & Continue
    const saveBtn = screen.getByRole('button', { name: /save & continue/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledOnce();
    });

    const [payload] = mockMutate.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(payload.propertyType).toBe('agricultural_land');
    expect(payload.waterSource).toBe('BOREWELL');
  });
});
