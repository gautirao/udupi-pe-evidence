/**
 * ResidentialListingForm — AC2 cross-subtype INVARIANT (issue #2040).
 *
 * Durable backstop against this entire bug class recurring: for EVERY
 * residential subtype, every field the submit gate actually names as
 * required must be reachable in the DOM on first render, without expanding
 * any collapsed section ("More details / Ownership & document details").
 *
 * Deliberately NOT four hardcoded per-subtype assertion lists. The set of
 * "required, focusable" fields for each subtype is DERIVED from
 * computeListingStrength()'s own gate list (src/lib/listingStrength.ts) —
 * specifically each gate's `targetFieldId`, which listingStrength.ts already
 * maintains as the single source of truth for "which control does this
 * requirement point at" (see issue #2040 AC5). If a future subtype or a new
 * required field is added to the gate list, this test automatically checks
 * it without any edit here — that is the whole point of the backstop.
 *
 * Gates without a targetFieldId (photos, pin-confirmation — no single
 * focusable control) are intentionally skipped; they're not part of the
 * "reachable core control" invariant this test enforces.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { computeListingStrength, type ListingStrengthInput, type ResidentialPropertyType } from '@/lib/listingStrength';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateListing: () => ({ mutate: vi.fn(), isPending: false }),
    useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
    useGetListing: () => ({ data: undefined }),
  };
});

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: () => ({
    images: [],
    isLoading: false,
    fetchError: null,
    uploads: {},
    isUploading: false,
    imageCount: 0,
    canSubmit: false,
    remainingSlots: 10,
    maxImages: 10,
    uploadImage: vi.fn(),
    retryUpload: vi.fn(),
    retryFinalize: vi.fn(),
    dismissUpload: vi.fn(),
    deleteImage: vi.fn(),
    isDeleting: false,
    reorderImages: vi.fn(),
    isReordering: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby" />,
}));

import { ResidentialListingForm } from '../ResidentialListingForm';

const SUBTYPES: readonly ResidentialPropertyType[] = ['apartment', 'house', 'villa', 'residential_plot'];

/** A representative "nothing filled in yet" input for a given subtype — the
 * shape that maximises which gates are unmet (and therefore which
 * targetFieldIds are exercised), without being subtype-specific itself. */
function blankStrengthInput(propertyType: ResidentialPropertyType): ListingStrengthInput {
  return {
    propertyType,
    listingPurpose: 'sale',
    priceRupees: null,
    monthlyRent: null,
    securityDepositMonths: '',
    locality: '',
    imageCount: 0,
    addressConfirmed: false,
    locationResolved: false,
    bedrooms: '',
    builtArea: null,
    builtAreaUnit: '',
    landArea: null,
    landAreaUnit: '',
  };
}

function renderForm(initialPropertyType: ResidentialPropertyType) {
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType={initialPropertyType}
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('ResidentialListingForm — AC2 cross-subtype required-field DOM invariant', () => {
  for (const propertyType of SUBTYPES) {
    it(`${propertyType}: every gate-required control (targetFieldId) is present on first render, without opening "More details"`, () => {
      const { gates } = computeListingStrength(blankStrengthInput(propertyType));
      const requiredIds = gates
        .filter((g) => g.targetFieldId)
        .map((g) => g.targetFieldId as string);

      // Sanity — every subtype has at least the shared price/locality gates
      // with a mapped control; a subtype yielding zero would make the rest
      // of this test vacuous.
      expect(requiredIds.length).toBeGreaterThan(0);

      renderForm(propertyType);

      for (const id of requiredIds) {
        const el = document.getElementById(id);
        expect(el, `expected #${id} (control for a real submit-gate requirement) to be reachable on first render for propertyType="${propertyType}" — see listingStrength.ts targetFieldId for this gate`).not.toBeNull();
      }
    });
  }
});
