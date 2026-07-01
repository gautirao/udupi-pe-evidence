import { AddressPicker, type AddressPickerValue } from '@/components/broker/AddressPicker';
import { useUpdateListing } from '@/hooks/useBrokerListings';

// ---------------------------------------------------------------------------
// Issue #1718 — residential single-page create parity. Thin inline wrapper
// around the EXISTING AddressPicker component, wired the same way
// EditListing.tsx wires it (src/pages/broker/EditListing.tsx:1955-1971) —
// onConfirm/onUnconfirm persist lat/lng/addressConfirmed via the existing
// PUT /api/listings/{id} update endpoint. No new backend behavior.
// ---------------------------------------------------------------------------

interface InlineLocationProps {
  listingId: string;
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialLocality: string;
  initialConfirmed: boolean;
  onLocalityConfirmed: (locality: string, lat: number, lng: number) => void;
}

export function InlineLocation({
  listingId,
  initialLatitude,
  initialLongitude,
  initialLocality,
  initialConfirmed,
  onLocalityConfirmed,
}: InlineLocationProps) {
  const updateListing = useUpdateListing(listingId);

  const handleConfirm = (addr: AddressPickerValue) => {
    if (updateListing.isPending) return;
    // onSuccess invalidates ['listing-broker', listingId] (see useUpdateListing) —
    // the parent's useGetListing(listingId) refetches and addressConfirmed/lat/lng
    // flow back down as props, so no local callback is needed here.
    updateListing.mutate({ latitude: addr.lat, longitude: addr.lng, addressConfirmed: true });
  };

  const handleUnconfirm = () => {
    if (updateListing.isPending) return;
    updateListing.mutate({ addressConfirmed: false });
  };

  return (
    <AddressPicker
      initialLatitude={initialLatitude}
      initialLongitude={initialLongitude}
      initialLocality={initialLocality}
      initialConfirmed={initialConfirmed}
      onConfirm={handleConfirm}
      onUnconfirm={handleUnconfirm}
      onLocalityConfirmed={onLocalityConfirmed}
    />
  );
}
