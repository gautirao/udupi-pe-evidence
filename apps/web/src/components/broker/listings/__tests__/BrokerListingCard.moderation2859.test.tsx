/**
 * #2859 B2 (handoff 285902) W2 — the broker listing card after moderation, rendered from props.
 * Replaces the card-render claims of e2e/journey/admin-moderation.spec.ts AM3.a-c (csv190) and
 * e2e/listing-rejection-resubmit.spec.ts RR1.3 / RR1.4 / RR1.10.1 (csv199).
 *
 * Scope (R_injected): the card is rendered from a ListingResponse prop. The broker's real page fetch,
 * login and the /broker/listings route are NOT exercised (that is AM3.e / RR1.10.2, RETAIN); the
 * persisted REJECTED + reason that feeds this prop is proved by ListingModerationLifecycleIT.
 * The lifecycle mutation hooks are stubbed (no action is clicked here); TrustProgressPanel is stubbed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ListingResponse } from '@/hooks/useBrokerListings';

const idleMutation = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useDeleteListing: idleMutation,
    useDuplicateListing: idleMutation,
    useSubmitListing: idleMutation,
    useArchiveListing: idleMutation,
    useWithdrawListing: idleMutation,
    useReopenListing: idleMutation,
    useReopenAsDraftListing: idleMutation,
    useResubmitArchivedListing: idleMutation,
    useRestoreListing: idleMutation,
  };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/trust/TrustProgressPanel', () => ({ TrustProgressPanel: () => null }));

import { BrokerListingCard } from '../BrokerListingCard';

const REASON = 'INCOMPLETE_INFO: Add the carpet area';

function makeListing(overrides: Partial<ListingResponse>): ListingResponse {
  return {
    id: 'x', status: 'DRAFT', propertyType: 'house', title: 'Untitled', locality: 'Manipal',
    price: 5000000, description: null, landArea: null, landAreaUnit: null, bedrooms: 3, builtArea: 1200,
    builtAreaUnit: 'sqft', latitude: 13.35, longitude: 74.79, addressConfirmed: true, imageCount: 3,
    firstImageUrl: null, rejectionReason: null, videoUrl: null, reraNumber: null, listingNumber: 2859,
    displayId: 'PS-2859', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', areaKey: null,
    listingPurpose: 'sale', carpetArea: null, carpetAreaUnit: null, floorNumber: null, totalFloors: null,
    furnishingStatus: null, washrooms: null, parkingCount: null, roadFrontageFt: null, commercialUsage: null,
    numberOfUnits: null, monthlyRent: null, securityDepositMonths: null, lockInMonths: null, sellerType: null,
    earnedBadgeCount: 0, waterSource: null, soilType: null, roadAccess: null, cultivationStatus: null,
    ownershipType: null, surveyNumber: null,
    ...overrides,
  } as ListingResponse;
}

function renderCards(listings: ListingResponse[]) {
  return render(
    <MemoryRouter>
      {listings.map((l) => (
        <div key={l.id} data-testid={`card-${l.id}`}>
          <BrokerListingCard listing={l} isSelected={false} onToggleSelect={() => {}} />
        </div>
      ))}
    </MemoryRouter>,
  );
}

describe('BrokerListingCard — moderation outcomes (#2859 B2 csv190/csv199)', () => {
  it('AM3.a-c / RR1.3: a REJECTED card shows its title, the "Rejected" badge and the full rejection reason; a LIVE card without a reason shows none', () => {
    renderCards([
      makeListing({ id: 'r1', status: 'REJECTED', title: 'Rejected house 2859', rejectionReason: REASON }),
      makeListing({ id: 'l1', status: 'LIVE', title: 'Live house 2859' }),
    ]);
    const rejected = screen.getByTestId('card-r1');
    expect(within(rejected).getByText('Rejected house 2859')).toBeInTheDocument();
    expect(within(rejected).getByText('Rejected')).toBeInTheDocument();
    expect(within(rejected).getByText(`Rejection reason: ${REASON}`)).toBeInTheDocument();

    const live = screen.getByTestId('card-l1');
    expect(within(live).getByText('Live house 2859')).toBeInTheDocument();
    expect(within(live).getByText('Live')).toBeInTheDocument();
    expect(within(live).queryByText(/Rejection reason/)).not.toBeInTheDocument();
  });

  it('RR1.4: the REJECTED card links "Edit & Resubmit" to /broker/listings/{id}/edit; the LIVE card has no such link', () => {
    renderCards([
      makeListing({ id: 'r1', status: 'REJECTED', title: 'Rejected house 2859', rejectionReason: REASON }),
      makeListing({ id: 'l1', status: 'LIVE', title: 'Live house 2859' }),
    ]);
    expect(within(screen.getByTestId('card-r1')).getByRole('link', { name: 'Edit & Resubmit' }))
      .toHaveAttribute('href', '/broker/listings/r1/edit');
    expect(within(screen.getByTestId('card-l1')).queryByRole('link', { name: 'Edit & Resubmit' })).not.toBeInTheDocument();
  });

  it('RR1.10.1: a PENDING_REVIEW card renders "Under Review" (render from props only), not "Rejected"', () => {
    renderCards([makeListing({ id: 'p1', status: 'PENDING_REVIEW', title: 'Resubmitted house 2859' })]);
    const card = screen.getByTestId('card-p1');
    expect(within(card).getByText('Under Review')).toBeInTheDocument();
    expect(within(card).queryByText('Rejected')).not.toBeInTheDocument();
  });
});
