import { SectionCard } from '@/components/broker/SectionCard';
import { BoundaryDrawStep } from '@/components/dealer/BoundaryDrawStep';
import type { BoundaryStepProps } from './stepContracts';

/**
 * Issue #1838 slice 6a — extracted step-4 ("Draw Boundary", agricultural_land
 * only) JSX block from EditListingForm.tsx. STATELESS: all values/handlers
 * arrive as props; EditListingForm remains the sole state owner. The parent
 * keeps its `{currentStep === 4 && isAgriListing && (<div data-testid=
 * "step-4-panel">...)}` conditional guard verbatim — this component is the
 * inner content only.
 *
 * Issue #1838 PR F — converted to the {view, commands} contract (see
 * stepContracts.ts).
 */
export function BoundaryStep({
  view: { boundaryCoords, listing },
  commands: { continue: handleStep4Continue, skip: handleStep4Skip },
}: BoundaryStepProps) {
  return (
    <SectionCard
      title="Draw plot boundary"
      description="Optionally draw the boundary of your agricultural plot on the map."
    >
      <BoundaryDrawStep
        initialCoords={boundaryCoords}
        center={[listing.latitude ?? 13.3442, listing.longitude ?? 74.7451]}
        onSave={handleStep4Continue}
        onSkip={handleStep4Skip}
        declaredArea={listing.landArea}
        declaredUnit={listing.landAreaUnit}
        computedAreaAcres={listing.computedAreaAcres}
      />
    </SectionCard>
  );
}
