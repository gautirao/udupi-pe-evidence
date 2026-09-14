import React, { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSelectedPanel } from '../AreaSelectedPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Issue #2552 — the relaxation seam, found by exact-head review of PR #2582.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `AreaSelectedPanel.familyResync.test.tsx`.
 * The arm below needs `AreaZeroResultRecovery` stubbed, and `vi.mock` is hoisted to module scope —
 * mocking it inside the familyResync file would replace the REAL recovery component for every arm
 * there, including the "Clear filters" arm that deliberately drives the real
 * `area-zero-recovery-clear-filters` control. That arm would then be testing the stub. Isolating
 * the mock here keeps that coverage genuine.
 *
 * THE DEFECT. `AreaSelectedPanel` forwards the RAW prop — `onApplyFilters={onFiltersChange}` — so a
 * relaxation click emits straight past every `setFamilyOverride` call the family controls make.
 * `applyRelaxationPreview`'s PROPERTY_TYPES branch returns `propertyTypes: undefined` when the offer
 * is empty, which is a DESIGNED offer rendered to the buyer as "Include every property type", not a
 * hypothetical. The filters then fall family-silent and a stale `'commercial'` override resurrects:
 * identical to the three in-panel paths already closed, one seam deeper.
 *
 * WHAT IS STUBBED AND WHY THAT IS NOT CHEATING. The stub stands in only for the child's RENDERING of
 * a relaxation offer (which needs its own query data to appear). The unit under test is the panel's
 * own seam: what it passes as `onApplyFilters`, and whether the override survives a call through it.
 *
 * THE PAYLOAD, STATED PRECISELY — an earlier revision of this paragraph got it wrong twice over and
 * the correction is recorded rather than rewritten. It claimed the stub emits `{}` and that this is
 * "exactly" what `applyRelaxationPreview` produces. Both halves were wrong: the real function builds
 * its result OVER the current filters, so for the empty PROPERTY_TYPES offer it returns
 * `{ ...filters, propertyTypes: undefined }`, not `{}` — and the stub itself no longer emits `{}`
 * either, having been corrected to spread (see its own comment below). The two were equivalent for
 * `familyIsUnset` in this arm, which is why it passed either way, but "exactly" overclaimed in a file
 * whose standard is precision, and the sentence then survived the stub's own correction and began
 * describing code that was no longer there.
 *
 * That the difference is behaviourally inert HERE is itself load-bearing: because the relaxation
 * spreads, `commercialSubtypes` SURVIVES it, which narrows the reachable defect rather than removing
 * it — resurrection needs a stale `'commercial'` override, residential-only `propertyTypes`, and no
 * subtype held. This arm drives exactly that state.
 */

vi.mock('../AreaZeroResultRecovery', () => ({
  AreaZeroResultRecovery: ({
    filters,
    onApplyFilters,
  }: {
    filters?: PropertyFilters;
    onApplyFilters?: (filters: PropertyFilters) => void;
  }) => (
    <div data-testid="stub-zero-recovery">
      {/* Mirrors the real component's gate at AreaZeroResultRecovery.tsx:503 — the relaxation
          block renders only when `onApplyFilters` is defined. If the panel ever forwards
          `undefined`, this control correctly disappears rather than rendering a dead offer. */}
      {onApplyFilters && (
        <button
          type="button"
          data-testid="stub-apply-relaxation"
          /* SPREADS `...filters`, matching `applyRelaxationPreview`, which builds its result over
             the current filters rather than replacing them. An earlier revision emitted a bare `{}`
             and happened to pass, because this arm holds no other axis — but it overstated the
             defect. `commercialSubtypes` SURVIVES a relaxation, which NARROWS the reachable case
             rather than removing it: resurrection needs a stale `'commercial'` override, a
             residential-only `propertyTypes`, and NO subtype held. That is exactly the state this
             arm drives, and it is why the empty PROPERTY_TYPES offer is the only relaxation variant
             that can reach the defect. */
          onClick={() => onApplyFilters({ ...(filters ?? {}), propertyTypes: undefined })}
        >
          Include every property type
        </button>
      )}
    </div>
  ),
}));

const mockArea: AreaPoint = {
  areaKey: 'test-area|city|udupi',
  areaLabel: 'Test Area',
  geo_center_lat: 13.5,
  geo_center_lon: 74.5,
  bbox: null,
};

type PanelFilters = NonNullable<React.ComponentProps<typeof AreaSelectedPanel>['filters']>;

function ControlledHost({
  initialFilters,
  externalFilters,
}: {
  initialFilters: PanelFilters;
  externalFilters: PanelFilters;
}) {
  const [filters, setFilters] = useState<PanelFilters>(initialFilters);

  return (
    <>
      <button
        type="button"
        data-testid="simulate-url-change"
        onClick={() => setFilters(externalFilters)}
      >
        simulate back/forward
      </button>
      <AreaSelectedPanel
        selectedArea={mockArea}
        areaListings={[]}
        filters={filters}
        onFiltersChange={setFilters}
        isCommercialSubtypeSupported
      />
    </>
  );
}

const renderHost = (props: React.ComponentProps<typeof ControlledHost>) =>
  renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <ControlledHost {...props} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );

describe('AreaSelectedPanel — #2552 relaxation seam', () => {
  it('does not resurrect a stale Commercial override when a relaxation clears the type filter', () => {
    renderHost({
      initialFilters: {},
      externalFilters: { propertyTypes: ['apartment'] },
    });

    // Establish the override the only way a buyer can.
    fireEvent.click(screen.getByTestId('quick-chip-family-commercial'));
    expect(screen.getByTestId('quick-subtype-row')).toBeInTheDocument();

    // External navigation supersedes it: the panel correctly reads Residential here.
    fireEvent.click(screen.getByTestId('simulate-url-change'));
    expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The relaxation the buyer is actually offered on a zero-result screen.
    fireEvent.click(screen.getByTestId('stub-apply-relaxation'));

    // Positive control: the family row rendered, so the assertions below are scoped rather than
    // passing on a dead page. Deliberately NOT `quick-chip-apartment` — the type chips are part of
    // what is under test and vanish if the row flips to Commercial.
    expect(screen.getByTestId('quick-family-row')).toBeInTheDocument();
    expect(screen.getByTestId('quick-chip-family-residential')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('quick-chip-family-commercial')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByTestId('quick-subtype-row')).not.toBeInTheDocument();
  });

  /**
   * The wrapper must preserve the prop's OPTIONALITY. `AreaZeroResultRecovery` gates its entire
   * relaxation block on `onApplyFilters` being defined (`:503`), so wrapping unconditionally would
   * hand the child a function where the panel has no filter owner — rendering a relaxation offer
   * that cannot do anything. This is the honest-degradation rule the panel already follows for
   * `onRetryListings` and `onAddSchool`.
   */
  it('forwards no relaxation handler when the panel has no filter owner', () => {
    renderWithProviders(
      <DiscoverProvider>
        <AreaSetDraftProvider>
          <AreaSelectedPanel
            selectedArea={mockArea}
            areaListings={[]}
            filters={{ propertyTypes: ['apartment'] }}
            isCommercialSubtypeSupported
          />
        </AreaSetDraftProvider>
      </DiscoverProvider>,
      { router: 'browser' },
    );

    // Positive control: the recovery really rendered, so the absence below is scoped.
    expect(screen.getByTestId('stub-zero-recovery')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-apply-relaxation')).not.toBeInTheDocument();
  });
});
