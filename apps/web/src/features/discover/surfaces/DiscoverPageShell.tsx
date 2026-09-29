import type { ReactNode, RefObject } from 'react';
import { PublicDiscoverLayout } from '@/components/layout/PublicDiscoverLayout';
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';
import type { DiscoverHeaderRegionGuide } from '@/components/discover/DiscoverHeaderJourneyTabs';

export interface DiscoverPageShellMobileMapTrigger {
  onOpenMap: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export interface DiscoverPageShellProps {
  isMobileShell: boolean;
  /** Single source of truth, forwarded to `PublicHeader`; see useDiscoverHeaderHostsControls. */
  hostsHeaderControls: boolean;
  /** Single source of truth, forwarded to `PublicHeader`; see useDiscoverPageContext.ts's headerHostsJourneyTabs doc comment. */
  headerHostsJourneyTabs: boolean;
  mobileMapOpen: boolean;
  mobileMapTrigger: DiscoverPageShellMobileMapTrigger | undefined;
  mapSurface: ReactNode;
  panelSurface: ReactNode;
  overlaySurface: ReactNode;
  /** Pass-through of the region-guide ring/aria-live signal to `PublicHeader`'s journey tabs; optional for callers that don't need it. */
  regionGuide?: DiscoverHeaderRegionGuide;
}

/**
 * Issue #2142 Commit 5 — the page-level layout shell, lifted out of
 * MapDiscovery.tsx: the PublicDiscoverLayout wrapper, the mobile-only
 * DiscoverControlBar row (Issue #1953/#2108), and the z-[60] full-screen
 * mobile-Map overlay wrapper (Issue #1953 post-step-4 fix — z-[60] not z-40,
 * see git history for the full RoleAwareHeader stacking-context rationale).
 * Every className/data-testid/z-index here is byte-identical to what was
 * previously inline in MapDiscovery.tsx's JSX — this is a pure JSX
 * relocation, not a redesign. The 3 surfaces are passed in as already-built
 * ReactNode (MapDiscovery.tsx still owns building their view/commands props
 * via buildXSurfaceView()/buildXSurfaceCommands() — that assembly logic
 * stays page-owned, only the surrounding layout markup moved here).
 */
export function DiscoverPageShell({
  isMobileShell,
  hostsHeaderControls,
  headerHostsJourneyTabs,
  mobileMapOpen,
  mobileMapTrigger,
  mapSurface,
  panelSurface,
  overlaySurface,
  regionGuide,
}: DiscoverPageShellProps) {
  return (
    <PublicDiscoverLayout
      regionGuide={regionGuide}
      hostsHeaderControls={hostsHeaderControls}
      headerHostsJourneyTabs={headerHostsJourneyTabs}
    >
      <div className="flex h-full flex-col">
        {isMobileShell && (
          <div
            className="shrink-0 border-b border-border bg-card px-4 py-2.5"
            data-testid="discover-control-bar-row"
          >
            {/* This row only ever mounts while isMobileShell — always below the header's control-bar threshold — so hostsHeaderControls is a fixed `false` here rather than a threaded prop. */}
            <DiscoverControlBar mobileMapTrigger={mobileMapTrigger} hostsHeaderControls={false} />
          </div>
        )}
        <div className="min-h-0 flex-1 flex flex-col lg:flex-row relative">
          <div
            className={
              mobileMapOpen ? 'fixed inset-0 z-[60] bg-background [&>div]:!h-full' : 'contents'
            }
            // Issue #2712 — stable anchor for e2e paint-order assertions (this IS the z-[60]
            // mobile-map overlay boundary MapFilterSheet's overlayClassName must beat). Additive
            // only: no class/z-index change, so #2142's "byte-identical to previously inline"
            // note above still holds for everything else in this file.
            data-testid="mobile-map-surface-wrapper"
          >
            {mapSurface}
          </div>
          {panelSurface}
        </div>
      </div>
      {overlaySurface}
    </PublicDiscoverLayout>
  );
}
