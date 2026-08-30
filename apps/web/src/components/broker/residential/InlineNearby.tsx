import { MapPin } from 'lucide-react';
import { PoiManager } from '@/components/poi/PoiManager';

// ---------------------------------------------------------------------------
// Issue #1718 — residential single-page create parity. Thin inline wrapper
// around the EXISTING PoiManager (src/components/poi/PoiManager.tsx), wired
// the same way EditListing.tsx gates it on addressConfirmed
// (src/pages/broker/EditListing.tsx:2176-2188). POI suggestions are derived
// (auto-computed) or broker-added — never platform-verified; PoiManager's own
// copy already reflects this. No backend change.
// ---------------------------------------------------------------------------

interface InlineNearbyProps {
  listingId: string;
  propertyType: string;
  addressConfirmed: boolean;
}

export function InlineNearby({ listingId, propertyType, addressConfirmed }: InlineNearbyProps) {
  if (!addressConfirmed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-8 text-center shadow-sm">
        <MapPin className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Location not yet confirmed</p>
        <p className="text-sm text-muted-foreground">
          Confirm the pin location above to see nearby places.
        </p>
      </div>
    );
  }

  return <PoiManager listingId={listingId} propertyType={propertyType} />;
}
