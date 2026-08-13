import { NearSchoolSheet } from '@/components/map/NearSchoolSheet';
import { DiscoverConsentBanner } from '@/components/discover/DiscoverConsentBanner';
import { DiscoverPrivacyToggle } from '@/components/discover/DiscoverPrivacyToggle';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import type {
  DiscoverOverlaySurfaceView,
  DiscoverOverlaySurfaceCommands,
} from './buildOverlaySurfaceModel';

export interface DiscoverOverlaySurfaceProps {
  view: DiscoverOverlaySurfaceView;
  commands: DiscoverOverlaySurfaceCommands;
}

/**
 * Issue #2142 Commit 4 — absorbs DiscoverOverlaySheets' outer chrome
 * (NearSchoolSheet + DiscoverConsentBanner + DiscoverPrivacyToggle), rendered
 * at the SAME top-level-sibling position as today, after the map+panel row.
 * See buildOverlaySurfaceModel.ts's doc comment for why MobileClusterSheet,
 * MobileListingPreviewSheet, and the recenter portal live in DiscoverMapSurface
 * instead (DOM/stacking-context coupling, not this surface).
 */
export function DiscoverOverlaySurface({ view, commands }: DiscoverOverlaySurfaceProps) {
  return (
    <>
      {view.nearSchool.visible && (
        <NearSchoolSheet
          open={view.nearSchool.open}
          onOpenChange={commands.setNearSchoolOpen}
          selectedSchool={view.nearSchool.selectedSchool}
          onSchoolSelect={commands.onSchoolSelect}
          radiusKm={view.nearSchool.filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM}
          onRadiusChange={(km) =>
            commands.onFiltersChange({ ...view.nearSchool.filters, schoolRadiusKm: km })
          }
          boardFilter={view.nearSchool.boardFilter}
          onBoardFilterChange={commands.onBoardFilterChange}
          city={view.nearSchool.city}
        />
      )}
      <DiscoverConsentBanner />
      <div className="fixed bottom-4 right-4 z-40">
        <DiscoverPrivacyToggle />
      </div>
    </>
  );
}
