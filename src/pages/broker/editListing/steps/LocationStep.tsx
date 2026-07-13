import { Button } from '@/components/ui/button';
import { AddressPicker } from '@/components/broker/AddressPicker';
import { SectionCard } from '@/components/broker/SectionCard';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import type { useUpdateListing } from '@/hooks/useBrokerListings';

/**
 * Issue #1838 slice 6a — extracted step-3 ("Pin Location") JSX block from
 * EditListingForm.tsx. STATELESS: all values/setters/handlers arrive as
 * props; EditListingForm remains the sole state owner. The parent keeps the
 * `data-testid="step-3-panel"` always-mounted `display:none` wrapper — see
 * CRITICAL comment there. This component must NOT be conditionally mounted
 * on `currentStep`, or AddressPicker's in-flight map state is lost.
 */
interface LocationStepProps {
  isSubmittable: boolean;
  listing: ListingResponse;
  updateListing: ReturnType<typeof useUpdateListing>;
  handleLocalityConfirmed: (locality: string, lat: number, lng: number) => void;
  handleStep3Continue: () => void;
}

export function LocationStep({
  isSubmittable,
  listing,
  updateListing,
  handleLocalityConfirmed,
  handleStep3Continue,
}: LocationStepProps) {
  return (
    <>
      {isSubmittable && (
        <div className="space-y-6">
          <SectionCard
            title="Confirm location"
            description="Search for your listing's address, drag the pin to the exact spot, then confirm."
          >
            <AddressPicker
              initialLatitude={listing.latitude}
              initialLongitude={listing.longitude}
              initialLocality={listing.locality}
              initialConfirmed={listing.addressConfirmed}
              onConfirm={(addr) => {
                if (!updateListing.isPending) {
                  updateListing.mutate({ latitude: addr.lat, longitude: addr.lng, addressConfirmed: true });
                }
              }}
              onUnconfirm={() => {
                if (!updateListing.isPending) {
                  updateListing.mutate({ addressConfirmed: false });
                }
              }}
              onLocalityConfirmed={handleLocalityConfirmed}
            />
          </SectionCard>

          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              onClick={handleStep3Continue}
              disabled={!listing.addressConfirmed}
            >
              Save & Continue
            </Button>
            {!listing.addressConfirmed && (
              <p className="text-sm text-muted-foreground">
                Confirm your pin location on the map to continue.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
