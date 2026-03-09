import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import EditListing from '../EditListing';
import {
  useGetListing,
  useUpdateListing,
  useSubmitListing,
  ListingResponse,
} from '@/hooks/useDealerListings';

// ─── Hoisted mock handles ──────────────────────────────────────────────────────

const mockNavigate = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useDealerListings', () => ({
  useGetListing: vi.fn(),
  useUpdateListing: vi.fn(),
  useSubmitListing: vi.fn(),
}));

vi.mock('@/components/dealer/ImageUploader', () => ({
  ImageUploader: ({
    onCanSubmitChange,
  }: {
    listingId: string;
    onCanSubmitChange?: (canSubmit: boolean) => void;
  }) => {
    React.useEffect(() => {
      onCanSubmitChange?.(false);
    }, [onCanSubmitChange]);
    return React.createElement('div', { 'data-testid': 'image-uploader' });
  },
}));

// PriceField uses Radix UI Slider which requires ResizeObserver. Mock it with a
// simple controlled input so EditListing unit tests stay focused on page behaviour.
vi.mock('@/components/dealer/PriceField', () => ({
  PriceField: ({
    initialRupees,
    onChange,
  }: {
    id?: string;
    label?: string;
    initialRupees?: number | null;
    onChange: (rupees: number | null) => void;
    required?: boolean;
  }) => {
    const [value, setValue] = React.useState(
      initialRupees != null ? String(initialRupees) : '',
    );
    React.useEffect(() => {
      if (initialRupees != null) setValue(String(initialRupees));
    }, [initialRupees]);
    return React.createElement(
      'div',
      null,
      React.createElement('label', { htmlFor: 'price' }, 'Price (INR)'),
      React.createElement('input', {
        id: 'price',
        type: 'text',
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          setValue(e.target.value);
          const num = parseFloat(e.target.value);
          onChange(isNaN(num) ? null : num);
        },
      }),
    );
  },
}));

vi.mock('@/components/poi/PoiManager', () => ({
  PoiManager: ({ listingId }: { listingId: string }) =>
    React.createElement('div', { 'data-testid': 'poi-manager', 'data-listing-id': listingId }),
}));

vi.mock('@/components/dealer/AddressPicker', () => ({
  AddressPicker: ({
    onConfirm,
    onUnconfirm,
    initialConfirmed,
  }: {
    onConfirm: (v: { lat: number; lng: number; address_confirmed: boolean }) => void;
    onUnconfirm?: () => void;
    initialConfirmed?: boolean;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'address-picker' },
      React.createElement(
        'button',
        {
          'data-testid': 'address-picker-confirm',
          onClick: () => onConfirm({ lat: 13.34, lng: 74.74, address_confirmed: true }),
        },
        'Confirm Location',
      ),
      initialConfirmed
        ? React.createElement(
            'button',
            {
              'data-testid': 'address-picker-change',
              onClick: () => onUnconfirm?.(),
            },
            'Change',
          )
        : null,
    ),
}));

vi.mock('@/components/dealer/StepIndicator', () => ({
  StepIndicator: () => React.createElement('div', { 'data-testid': 'step-indicator' }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userRole: 'dealer',
    isLoading: false,
  }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'listing-123' }),
    // Return a stable useSearchParams mock: no ?step= param by default
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeListing(overrides: Partial<ListingResponse>): ListingResponse {
  return {
    id: 'listing-123',
    status: 'DRAFT',
    propertyType: 'apartment',
    title: 'Cozy 2BHK in Manipal',
    locality: 'Manipal',
    price: 3500000,
    description: 'A nice apartment near the university.',
    landArea: null,
    bedrooms: 2,
    builtArea: 900,
    latitude: null,
    longitude: null,
    addressConfirmed: false,
    imageCount: 0,
    firstImageUrl: null,
    rejectionReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderEditListing() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EditListing />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default update mutation stub (non-pending)
  vi.mocked(useUpdateListing).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateListing>);
  // Default submit mutation stub (non-pending)
  vi.mocked(useSubmitListing).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSubmitListing>);
});

describe('EditListing page', () => {
  it('renders_prePopulatedForm_forDraftListing', () => {
    vi.mocked(useGetListing).mockReturnValue({
      data: makeListing({ status: 'DRAFT' }),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetListing>);

    renderEditListing();

    // Step 1 is shown by default. Title, price, locality, description should be pre-filled.
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput.value).toBe('Cozy 2BHK in Manipal');

    const priceInput = screen.getByLabelText('Price (INR)') as HTMLInputElement;
    expect(priceInput.value).toBe('3500000');

    const localityInput = screen.getByLabelText('Locality') as HTMLInputElement;
    expect(localityInput.value).toBe('Manipal');

    const descriptionInput = screen.getByLabelText('Description') as HTMLTextAreaElement;
    expect(descriptionInput.value).toBe('A nice apartment near the university.');

    // Step 1 has a "Save & Continue" button (not "Save Changes")
    expect(screen.getByRole('button', { name: /Save & Continue/i })).toBeInTheDocument();
  });

  it('showsLockedMessage_forPendingReviewListing', () => {
    vi.mocked(useGetListing).mockReturnValue({
      data: makeListing({ status: 'PENDING_REVIEW' }),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetListing>);

    renderEditListing();

    // Locked message is shown
    expect(screen.getByText(/This listing is locked and cannot be edited/i)).toBeInTheDocument();

    // No form inputs (title, price inputs should not exist)
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Price (INR)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save & Continue/i })).not.toBeInTheDocument();
  });

  it('showsLockedMessage_forLiveListing', () => {
    vi.mocked(useGetListing).mockReturnValue({
      data: makeListing({ status: 'LIVE' }),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetListing>);

    renderEditListing();

    // Locked message is shown
    expect(screen.getByText(/This listing is locked and cannot be edited/i)).toBeInTheDocument();

    // No form inputs
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Price (INR)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save & Continue/i })).not.toBeInTheDocument();
  });

  it('savesStep1_advancesToStep2', async () => {
    vi.mocked(useGetListing).mockReturnValue({
      data: makeListing({ status: 'DRAFT' }),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetListing>);

    const mutateFn = vi.fn((_data, options: { onSuccess?: () => void }) => {
      // Simulate successful mutation
      options?.onSuccess?.();
    });
    vi.mocked(useUpdateListing).mockReturnValue({
      mutate: mutateFn,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateListing>);

    renderEditListing();

    // Update the title field
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });

    // Click "Save & Continue" on step 1
    const saveButton = screen.getByRole('button', { name: /Save & Continue/i });
    fireEvent.click(saveButton);

    // mutate should have been called with the updated title
    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updated Title' }),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    // After save, the component advances to step 2.
    // jsdom does not evaluate inline style visibility for toBeVisible(), so we
    // assert the display values directly on the step panel wrapper divs.
    await waitFor(() => {
      expect(screen.getByTestId('step-1-panel')).toHaveStyle('display: none');
      expect(screen.getByTestId('step-2-panel')).toHaveStyle('display: block');
    });

    // Must NOT navigate away from the page
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('calls mutate with addressConfirmed false when Change is clicked on a confirmed listing', async () => {
    vi.mocked(useGetListing).mockReturnValue({
      data: makeListing({ status: 'DRAFT', addressConfirmed: true, latitude: 13.34, longitude: 74.74 }),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetListing>);

    const mutateFn = vi.fn();
    vi.mocked(useUpdateListing).mockReturnValue({
      mutate: mutateFn,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateListing>);

    renderEditListing();

    // The mock renders a "Change" button when initialConfirmed=true.
    // AddressPicker is always mounted (CSS display toggle), so it's findable even on step 1.
    const changeButton = await screen.findByTestId('address-picker-change');
    fireEvent.click(changeButton);

    expect(mutateFn).toHaveBeenCalledWith({ addressConfirmed: false });
  });
});
