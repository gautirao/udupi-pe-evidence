import type { ReactNode, RefObject } from 'react';
import { PublicDiscoverLayout } from '@/components/layout/PublicDiscoverLayout';
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';

export interface DiscoverPageShellMobileMapTrigger {
  onOpenMap: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export interface DiscoverPageShellProps {
  isMobileShell: boolean;
  mobileMapOpen: boolean;
  mobileMapTrigger: DiscoverPageShellMobileMapTrigger | undefined;
  mapSurface: ReactNode;
  panelSurface: ReactNode;
  overlaySurface: ReactNode;
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
  mobileMapOpen,
  mobileMapTrigger,
  mapSurface,
  panelSurface,
  overlaySurface,
}: DiscoverPageShellProps) {
  return (
    <PublicDiscoverLayout>
      <div className="flex h-full flex-col">
        {isMobileShell && (
          <div
            className="shrink-0 border-b border-border bg-card px-4 py-2.5"
            data-testid="discover-control-bar-row"
          >
            <DiscoverControlBar mobileMapTrigger={mobileMapTrigger} />
          </div>
        )}
        <div className="min-h-0 flex-1 flex flex-col lg:flex-row relative">
          <div
            className={
              mobileMapOpen ? 'fixed inset-0 z-[60] bg-background [&>div]:!h-full' : 'contents'
            }
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
