import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AddressPicker } from '@/components/broker/AddressPicker';
import { SectionCard } from '@/components/broker/SectionCard';
import type { LocationStepProps } from './stepContracts';

/**
 * Issue #1838 slice 6a — extracted step-3 ("Pin Location") JSX block from
 * EditListingForm.tsx. STATELESS: all values/setters/handlers arrive as
 * props; EditListingForm remains the sole state owner. The parent keeps the
 * `data-testid="step-3-panel"` always-mounted `display:none` wrapper — see
 * CRITICAL comment there. This component must NOT be conditionally mounted
 * on `currentStep`, or AddressPicker's in-flight map state is lost.
 *
 * Issue #1838 slice 8 — Option C (mount-on-first-visit latch). AddressPicker
 * is deferred until the broker first visits step 3, then NEVER unmounted
 * again (not on backward nav, not on forward nav) — this preserves
 * AddressPicker's in-flight state (dragged-unconfirmed pin, in-progress
 * search, locality warning) exactly as the always-mounted wrapper already
 * guarantees. The gate is the `hasVisitedAddressStep` latch ALONE — it must
 * never be combined with a `currentStep === 3` check on the AddressPicker
 * render, or the mount/unmount regression this slice fixes would return.
 *
 * Issue #1838 PR C commit 3 — converted to the {view, commands} contract
 * (see stepContracts.ts). The isPending guard on confirm/unconfirm now lives
 * inside useEditListingCommands.ts's commands.location — preserved exactly.
 */
export function LocationStep({
  view: { isSubmittable, listing, currentStep },
  commands: { confirmAddress, unconfirmAddress, confirmLocality, saveAndContinue },
}: LocationStepProps) {
  // Mount-on-first-visit latch — monotonic, never reset. Setting it to `true`
  // again on a later step-3 visit (or under React 18 Strict Mode's double
  // effect invocation) is idempotent, so this is Strict-Mode-safe.
  const [hasVisitedAddressStep, setHasVisitedAddressStep] = useState(false);
  useEffect(() => {
    if (currentStep === 3) {
      setHasVisitedAddressStep(true);
    }
  }, [currentStep]);

  return (
    <>
      {isSubmittable && (
        <div className="space-y-6">
          <SectionCard
            title="Confirm location"
            description="Search for your listing's address, drag the pin to the exact spot, then confirm."
          >
            {hasVisitedAddressStep ? (
              <AddressPicker
                initialLatitude={listing.latitude}
                initialLongitude={listing.longitude}
                initialLocality={listing.locality}
                initialConfirmed={listing.addressConfirmed}
                onConfirm={confirmAddress}
                onUnconfirm={unconfirmAddress}
                onLocalityConfirmed={confirmLocality}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Visit the Location step to set your address on the map.
              </p>
            )}
          </SectionCard>

          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              onClick={saveAndContinue}
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
