import type { ReactNode } from 'react';
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
  /**
   * Issue #2729 V2b — an optional compact hierarchy-back control, rendered
   * to the LEFT of the crumbs at the desktop-reskin floor (≥1366) only. Only
   * `AreaLeafListingsSurface`'s node-hierarchy journey passes this (a compact
   * `<HierarchyBackButton compact />` — verified to target the same
   * server-declared parent node the rightmost crumb below already links to,
   * but via the guarded real-browser POP/REPLACE mechanism that a breadcrumb
   * click cannot replicate, so it is moved here rather than removed). Every
   * other caller leaves this undefined and nothing renders.
   */
  backButton?: ReactNode;
}

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx (Issue
 * #1606): the sticky area-first breadcrumb hierarchy (Home › City › Group ›
 * Area). `onRegion`/`onGroup` are only wired by the caller when
 * `regionName`/`groupName` are present — that gating is unchanged, done at
 * the call site.
 */
export function Breadcrumb({
  cityLabel,
  regionName,
  groupName,
  areaLabel,
  onHome,
  onCity,
  onRegion,
  onGroup,
  backButton,
}: BreadcrumbProps) {
  return (
    // Issue #2729 (visual-QA follow-up) — `min-[1366px]:h-11 ...` gives this sticky breadcrumb a
    // GUARANTEED (not measured-approximation) 44px height at the SAME desktop-reskin floor
    // AreaSelectedPanel.tsx's sticky filter toolbar reads its `top-11` offset from — that offset
    // is therefore structurally correct by construction at ≥1366, not merely assumed to compute
    // to 44px. Deliberately scoped to ≥1366 only: forcing a fixed height at every width risks
    // clipping a long breadcrumb chain (e.g. "Home › Bangalore › Jayanagar & Sanjeevini Nagar ›
    // Sanjeevini Nagar") on narrow mobile/tablet viewports where this component has always been
    // auto-height — that path is completely unchanged.
    <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 min-[1366px]:flex min-[1366px]:h-11 min-[1366px]:items-center min-[1366px]:py-0">
      {backButton && (
        <div className="hidden min-[1366px]:mr-2 min-[1366px]:flex min-[1366px]:shrink-0 min-[1366px]:items-center">
          {backButton}
        </div>
      )}
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
