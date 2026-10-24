import { useEffect, useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResidentialListingForm } from '@/components/broker/ResidentialListingForm';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { UseResidentialListingDraftParams } from '@/components/broker/residential/useResidentialListingDraft';

let mockSeededDraft: Partial<ListingResponse> | null = null;
const mockPersistDraftCalls = vi.fn();

vi.mock('@/components/broker/residential/useResidentialListingDraft', () => ({
  useResidentialListingDraft: ({
    initialDraftId,
    onAttempt,
    onHydrate,
  }: UseResidentialListingDraftParams) => {
    const [listingId] = useState<string | null>(initialDraftId ?? 'draft-2040-apt');
    const [mode, setMode] = useState<'edit' | 'review'>('edit');
    const [submitted] = useState(false);
    const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
    const urlSeededRef = useRef(initialDraftId != null);
    const didHydrateRef = useRef(false);

    useEffect(() => {
      if (urlSeededRef.current && !didHydrateRef.current && mockSeededDraft) {
        didHydrateRef.current = true;
        onHydrate(mockSeededDraft as ListingResponse);
      }
    }, [onHydrate]);

    const persistDraft = (onDone?: (id: string) => void) => {
      onAttempt();
      mockPersistDraftCalls();
      if (listingId) {
        onDone?.(listingId);
      }
    };

    return {
      listingId,
      mode,
      setMode,
      submitted,
      draftListing: mockSeededDraft as ListingResponse | undefined,
      addressConfirmed: true,
      draftLoadError: null,
      draftSaveError,
      setDraftSaveError,
      isRecoveringDraft: false,
      images: [
        { id: 'img-1', url: 'https://example.com/1.jpg' },
        { id: 'img-2', url: 'https://example.com/2.jpg' },
        { id: 'img-3', url: 'https://example.com/3.jpg' },
      ],
      imageCount: 3,
      coverImageUrl: 'https://example.com/1.jpg',
      createListing: { isPending: false, mutate: vi.fn() },
      updateListing: { isPending: false, mutate: vi.fn() },
      submitListing: { isPending: false, mutate: vi.fn() },
      persistDraft,
      handleBackToEdit: () => setMode('edit'),
      handleSubmitForReview: vi.fn(),
      urlSeededRef,
      didHydrateRef,
    };
  },
}));

vi.mock('@/components/broker/residential/useResidentialListingLocation', () => ({
  useResidentialListingLocation: ({
    onPublicLoc,
  }: {
    onPublicLoc: (loc: string) => void;
  }) => {
    useEffect(() => {
      onPublicLoc('Manipal');
    }, [onPublicLoc]);

    return {
      locationBridge: null,
      residentialLocationValue: {
        state: {
          query: 'Manipal',
          suggestions: [],
          isSearching: false,
          searchError: null,
          resolved: {
            publicLoc: 'Manipal',
            formatted: 'Manipal, Udupi',
            lat: 13.3525,
            lon: 74.7928,
          },
          localityResolved: true,
          pinLat: 13.3525,
          pinLon: 74.7928,
          isConfirmingPin: false,
          pinError: null,
        },
        setQuery: vi.fn(),
        selectSuggestion: vi.fn(),
        clear: vi.fn(),
        openPinDialog: vi.fn(),
        closePinDialog: vi.fn(),
        isPinDialogOpen: false,
        setDraftPin: vi.fn(),
        confirmPin: vi.fn(),
      },
    };
  },
}));

vi.mock('@/components/broker/residential/ResidentialPhotosLocationSection', () => ({
  ResidentialPhotosLocationSection: () => (
    <div data-testid="mock-photos-section">Photos Section</div>
  ),
}));

vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby">Nearby Places</div>,
}));

vi.mock('@/components/broker/residential/MapPin', () => ({
  MapPin: () => <div data-testid="mock-map-pin">Map Pin</div>,
}));

vi.mock('@/components/broker/residential/ResidentialReviewPreview', () => ({
  ResidentialReviewPreview: () => (
    <div data-testid="mock-review-preview">Review Preview Body</div>
  ),
}));

describe('Issue #2859 trim rows — L211 Residential required fields (#2040 AC1, AC2, AC5)', () => {
  beforeEach(() => {
    mockPersistDraftCalls.mockReset();
    mockSeededDraft = null;
  });

  it('AC1 & AC2: apartment form renders #builtArea ("Built-up area") in Section 3 ("Property details") before the collapsed "More details" toggle and allows editing without expanding More details', () => {
    render(
      <ResidentialListingForm
        initialPropertyType="apartment"
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />,
    );

    const builtAreaInput = document.getElementById('builtArea') as HTMLInputElement | null;
    expect(builtAreaInput).not.toBeNull();
    expect(screen.getByText('Required to submit this listing for review.')).toBeInTheDocument();

    const moreDetailsToggle = screen.getByRole('button', { name: /More details/i });
    expect(moreDetailsToggle).toHaveAttribute('aria-expanded', 'false');

    // Verify #builtArea precedes the "More details" toggle in DOM order
    const precedes =
      Boolean(
        builtAreaInput!.compareDocumentPosition(moreDetailsToggle) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    expect(precedes).toBe(true);

    // Fill #builtArea without expanding More details
    fireEvent.change(builtAreaInput!, { target: { value: '1200' } });
    expect(builtAreaInput!.value).toBe('1200');
    expect(moreDetailsToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC5: clicking Review on an apartment draft with every submit gate met EXCEPT #builtArea stays in edit mode, focuses #builtArea, and only enters "Review your listing" once #builtArea is filled', () => {
    mockSeededDraft = {
      id: 'draft-2040-apt',
      propertyType: 'apartment',
      listingPurpose: 'sale',
      title: '2 BHK Apartment in Manipal',
      locality: 'Manipal',
      price: 550000000, // ₹55,00,000 in paise
      bedrooms: 2,
      bathrooms: 2,
      carpetArea: 950,
      builtArea: undefined,
      addressConfirmed: true,
    } as unknown as Partial<ListingResponse>;

    render(
      <ResidentialListingForm
        initialPropertyType="apartment"
        initialDraftId="draft-2040-apt"
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />,
    );

    const builtAreaInput = document.getElementById('builtArea') as HTMLInputElement;
    expect(builtAreaInput).not.toBeNull();
    expect(builtAreaInput.value).toBe('');

    const reviewBtn = screen.getByRole('button', { name: /^Review$/i });
    expect(reviewBtn).not.toBeDisabled();

    // 1. Click Review while #builtArea is empty -> blocked from entering Review mode, focuses #builtArea
    fireEvent.click(reviewBtn);

    expect(mockPersistDraftCalls).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: /Review your listing/i })).toBeNull();
    expect(document.activeElement?.id).toBe('builtArea');

    // 2. Fill #builtArea = 1200 and click Review again -> enters Review mode ("Review your listing")
    fireEvent.change(builtAreaInput, { target: { value: '1200' } });
    expect(builtAreaInput.value).toBe('1200');

    fireEvent.click(reviewBtn);
    expect(screen.getByRole('heading', { name: /Review your listing/i })).toBeInTheDocument();
  });
});
