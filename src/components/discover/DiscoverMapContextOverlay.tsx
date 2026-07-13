import { MapPin, GraduationCap } from 'lucide-react';
import { DiscoverMapBreadcrumb, type DiscoverMapCrumb } from '@/components/discover/DiscoverMapBreadcrumb';
import { AreaIndicatorOverlay } from '@/components/discover/AreaIndicatorOverlay';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';

/**
 * Issue #1824 Slice S8 — top-left context overlay: routes between the four
 * breadcrumb/indicator variants MapDiscovery previously rendered inline
 * (~L2900-2953). PURE presentation: every gate/segment array is computed by
 * the page and received by prop. See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s8-design.md.
 */
export interface DiscoverMapContextOverlayProps {
  isAreaFirstCityLanding: boolean;
  showSchoolBreadcrumb: boolean;
  areaJourneySegments: DiscoverMapCrumb[];
  schoolJourneySegments: DiscoverMapCrumb[];
  selectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
  city: string;
}

export function DiscoverMapContextOverlay({
  isAreaFirstCityLanding,
  showSchoolBreadcrumb,
  areaJourneySegments,
  schoolJourneySegments,
  selectedArea,
  focusedGroup,
  city,
}: DiscoverMapContextOverlayProps) {
  return (
    <div className="absolute top-4 left-4 z-[1000]">
      {isAreaFirstCityLanding ? (
        // Issue #1607 — the area-first city-level landing shows the
        // "Home › City › Areas" breadcrumb (mock placement). Home and the city
        // crumb route progressively; "Areas" is the terminal (current) page.
        <DiscoverMapBreadcrumb
          testId="area-first-landing-breadcrumb"
          containerClassName="px-3.5 shadow-md"
          leadingIcon={MapPin}
          leadingIconClassName="text-[hsl(var(--copper))]"
          segments={[
            { key: 'home', label: 'Home', href: '/' },
            {
              key: 'city',
              label: CITY_CONFIG[city]?.label ?? city,
              href: `/discover?city=${encodeURIComponent(city)}`,
              maxWidthClass: 'max-w-[140px]',
            },
            { key: 'areas', label: 'Areas', current: true, emphasis: 'strong' },
          ]}
        />
      ) : showSchoolBreadcrumb ? (
        <DiscoverMapBreadcrumb
          ariaLabel="Journey breadcrumb"
          testId="school-journey-breadcrumb"
          density="compact"
          containerClassName="max-w-[min(88vw,520px)] border-border/60 py-1.5 shadow-md"
          separatorClassName="text-muted-foreground/50"
          leadingIcon={GraduationCap}
          leadingIconClassName="text-[hsl(var(--plum))]"
          segments={schoolJourneySegments}
        />
      ) : areaJourneySegments.length > 1 ? (
        // Issue #1595 / Issue #1606 / Issue #1798 PR-B1 — unified City › Region › Group › Area
        // map breadcrumb across all area-first drill-down and return states.
        <DiscoverMapBreadcrumb
          testId="map-group-breadcrumb"
          leadingIcon={MapPin}
          leadingIconClassName="text-[hsl(var(--copper))]"
          segments={areaJourneySegments}
        />
      ) : (
        <AreaIndicatorOverlay
          cityLabel={CITY_CONFIG[city]?.label ?? city}
          focusedGroup={focusedGroup}
          selectedArea={selectedArea}
        />
      )}
    </div>
  );
}
