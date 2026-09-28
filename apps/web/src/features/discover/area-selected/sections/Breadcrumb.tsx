import { AreaFirstBreadcrumb } from '@/components/discover/AreaFirstBreadcrumb';

export interface BreadcrumbProps {
  cityLabel: string;
  regionName?: string;
  groupName?: string;
  areaLabel: string;
  onHome?: () => void;
  onCity?: () => void;
  onRegion?: () => void;
  onGroup?: () => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx (Issue
 * #1606): the sticky area-first breadcrumb hierarchy (Home › City › Group ›
 * Area). `onRegion`/`onGroup` are only wired by the caller when
 * `regionName`/`groupName` are present — that gating is unchanged, done at
 * the call site.
 */
export function Breadcrumb({ cityLabel, regionName, groupName, areaLabel, onHome, onCity, onRegion, onGroup }: BreadcrumbProps) {
  return (
    <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <AreaFirstBreadcrumb
        cityLabel={cityLabel}
        regionName={regionName}
        groupName={groupName}
        areaLabel={areaLabel}
        onHome={onHome}
        onCity={onCity}
        onRegion={onRegion}
        onGroup={onGroup}
      />
    </div>
  );
}
