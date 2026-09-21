import { MapPin, CheckCircle2 } from 'lucide-react';
import { PoiManager } from '@/components/poi/PoiManager';

// ---------------------------------------------------------------------------
// Issue #1718 — residential single-page create parity. Thin inline wrapper
// around the EXISTING PoiManager (src/components/poi/PoiManager.tsx), wired
// the same way EditListing.tsx gates it on addressConfirmed
// (src/pages/broker/EditListing.tsx:2176-2188). POI suggestions are derived
// (auto-computed) or broker-added — never platform-verified; PoiManager's own
// copy already reflects this. No backend change.
//
// Issue #2642 — adds a 3-state confirmed-pin context header above the POI
// panel (design notes §6): pin-not-confirmed / resolved-not-pinned /
// pin-confirmed. `locationResolved` and `onChangeLocation` are OPTIONAL and
// default-safe so CommercialListingForm.tsx / AgriculturalListingForm.tsx
// (which also mount InlineNearby, and don't pass either) keep their existing
// 2-state behaviour unchanged. Both new props are user-approved scope
// extensions — see .claude/state/current-approved-plan.toml
// [scope_lock.user_approved_extensions]. Never render lat/lng or a private
// formatted address here — only the caller's derived `locationResolved`
// boolean, matching the existing locality->resolved->confirmed-pin semantics
// already computed once in ResidentialListingForm.tsx for the strength meter
// (`location.residentialLocationValue?.state.resolved != null ||
// ...state.localityResolved`) — reused verbatim at the call site, not
// reinvented here.
// ---------------------------------------------------------------------------

interface InlineNearbyProps {
  listingId: string;
  propertyType: string;
  addressConfirmed: boolean;
  /** True once a locality has been resolved (search/geolocation/reload-persisted) but the pin isn't confirmed yet. */
  locationResolved?: boolean;
  /** Renders a "Change location" affordance in the pin-confirmed state. Never itself unconfirms — that stays in useResidentialLocation.clear()/editQuery(). */
  onChangeLocation?: () => void;
}

export function InlineNearby({
  listingId,
  propertyType,
  addressConfirmed,
  locationResolved = false,
  onChangeLocation,
}: InlineNearbyProps) {
  if (!addressConfirmed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-8 text-center shadow-sm">
        <MapPin className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        {locationResolved ? (
          <>
            <p className="text-sm font-medium">Location resolved — pin not confirmed</p>
            <p className="text-sm text-muted-foreground">
              A resolved locality is not a confirmed pin. Place the pin on the property above to
              calculate nearby places.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Location not yet confirmed</p>
            <p className="text-sm text-muted-foreground">
              Confirm the pin location above to see nearby places.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-950">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">Pin confirmed</p>
            {onChangeLocation && (
              <button
                type="button"
                onClick={onChangeLocation}
                className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
              >
                Change location
              </button>
            )}
          </div>
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            Nearby places will be shown for this location.
          </p>
        </div>
      </div>
      <PoiManager listingId={listingId} propertyType={propertyType} />
    </div>
  );
}
